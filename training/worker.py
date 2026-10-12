"""ORBIT-owned offline worker. No downloads, remote code, private application data or cloud logging."""
import argparse, hashlib, importlib.util, importlib.metadata, json, os, pathlib, sys, time, threading

def emit(kind, **values):
    print(json.dumps({'kind': kind, **values}, ensure_ascii=False), flush=True)

def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)

def ram_stats():
    if os.name != 'nt': return {'peakRamBytes':None,'ramTotalBytes':None,'ramAvailableBytes':None}
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(name,ctypes.c_size_t) for name in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
    class Memory(ctypes.Structure):
        _fields_=[('length',wintypes.DWORD),('load',wintypes.DWORD)]+[(name,ctypes.c_ulonglong) for name in ['total','available','pageTotal','pageAvailable','virtualTotal','virtualAvailable','extended']]
    counters=Counters();counters.cb=ctypes.sizeof(counters);memory=Memory();memory.length=ctypes.sizeof(memory)
    kernel=ctypes.WinDLL('kernel32');kernel.GetCurrentProcess.restype=wintypes.HANDLE
    psapi=ctypes.WinDLL('psapi');psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
    measured=psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(counters),counters.cb)
    available=kernel.GlobalMemoryStatusEx(ctypes.byref(memory))
    return {'peakRamBytes':int(counters.PeakWorkingSetSize) if measured else None,'ramTotalBytes':int(memory.total) if available else None,'ramAvailableBytes':int(memory.available) if available else None}

def preflight():
    packages = {name: importlib.util.find_spec(name) is not None for name in ['torch','transformers','peft','accelerate','bitsandbytes','safetensors']}
    result = {'packages':packages,'isolated':sys.prefix != sys.base_prefix,'cuda':False,'gpu':None,'vramBytes':None,'versions':{}}
    if all(packages.values()):
        import torch
        result.update(cuda=torch.cuda.is_available(),versions={name:importlib.metadata.version(name) for name in packages})
        if result['cuda']:
            result.update(gpu=torch.cuda.get_device_name(0),vramBytes=torch.cuda.get_device_properties(0).total_memory,computeCapability=list(torch.cuda.get_device_capability(0)),bf16=torch.cuda.is_bf16_supported())
            result.update(vramFreeBytes=torch.cuda.mem_get_info()[0],cudaBuild=torch.version.cuda,**ram_stats())
    result['ready'] = all(packages.values()) and result['isolated'] and result['cuda'] and result.get('bf16',False)
    return result

def run(config_path, mode):
    def parent_guard():
        if os.name == 'nt':
            # A blocking CRT stdin read on a background thread can deadlock DLL loading.
            # PeekNamedPipe observes parent EOF without taking that blocking read lock.
            import ctypes, msvcrt
            from ctypes import wintypes
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.PeekNamedPipe.argtypes=[wintypes.HANDLE,ctypes.c_void_p,wintypes.DWORD,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p]
            kernel.PeekNamedPipe.restype=wintypes.BOOL
            handle=msvcrt.get_osfhandle(sys.stdin.fileno())
            while kernel.PeekNamedPipe(handle,None,0,None,None,None):time.sleep(0.25)
        else:
            for _ in sys.stdin: pass
        os._exit(2)  # Parent pipe closed: do not leave orphan GPU training running.
    started=time.monotonic(); cfg=json.loads(config_path.read_text(encoding='utf-8-sig')); root=config_path.parent
    cancel=root/'cancel.request'; result_path=root/('result.json' if mode=='train' else 'evaluation-output.json')
    check=preflight(); emit('environment',**check)
    if not check['ready']: raise RuntimeError('Isolated CUDA/bfloat16 training environment unavailable; no packages will be installed automatically')
    import torch
    from transformers import AutoTokenizer, AutoModelForImageTextToText, BitsAndBytesConfig, Trainer, TrainingArguments, TrainerCallback, StoppingCriteria, StoppingCriteriaList, set_seed
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel
    from safetensors import safe_open
    threading.Thread(target=parent_guard, daemon=True).start()
    c=cfg['config']; base=pathlib.Path(cfg['baseDirectory']).resolve(); output=pathlib.Path(cfg['adapterDirectory']).resolve()
    if mode=='train' and output.exists() and any(output.iterdir()): raise RuntimeError('Refuse overwriting an adapter')
    if json.loads((base/'config.json').read_text())['model_type']!='gemma3': raise RuntimeError('This backend currently implements Gemma 3 only')
    if cancel.exists(): raise InterruptedError('Cancelled before model load')
    set_seed(c['seed']);torch.cuda.reset_peak_memory_stats()
    tokenizer=AutoTokenizer.from_pretrained(str(base),local_files_only=True,trust_remote_code=False)
    kwargs={'local_files_only':True,'trust_remote_code':False,'use_safetensors':True,'device_map':{'':'cuda:0'},'torch_dtype':torch.bfloat16,'attn_implementation':'eager'}
    if c['method']=='QLoRA':kwargs['quantization_config']=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.bfloat16)
    model=AutoModelForImageTextToText.from_pretrained(str(base),**kwargs)
    free_vram,total_vram=torch.cuda.mem_get_info()
    fit={'baseLoaded':True,'fourBitLoaded':bool(getattr(model,'is_loaded_in_4bit',False)),'gpu':torch.cuda.get_device_name(0),'vramTotalBytes':total_vram,'vramFreeAfterLoadBytes':free_vram,'peakVramBytes':torch.cuda.max_memory_allocated(),**ram_stats()}
    if c['method']=='QLoRA' and not fit['fourBitLoaded']:raise RuntimeError('Requested four-bit model was not loaded in four bits')
    if mode=='fit':save(root/'hardware-fit.json',fit);emit('fit',**fit);return
    if mode=='eval':
        if cfg.get('useAdapter'):model=PeftModel.from_pretrained(model,str(output),local_files_only=True,is_trainable=False)
        model.eval(); results=[]
        for item in json.loads((root/'eval-prompts.json').read_text(encoding='utf-8')):
            if cancel.exists():raise InterruptedError('Evaluation cancelled')
            rendered=tokenizer.apply_chat_template(item['messages'],tokenize=False,add_generation_prompt=True)
            inputs=tokenizer(rendered,return_tensors='pt',add_special_tokens=False).to('cuda:0'); begin=time.perf_counter()
            class Timing(StoppingCriteria):
                first=None
                def __call__(self,input_ids,scores,**kwargs):
                    if self.first is None:
                        torch.cuda.synchronize();self.first=time.perf_counter()
                    if cancel.exists():raise InterruptedError('Evaluation cancelled')
                    return False
            timing=Timing()
            with torch.inference_mode(): generated=model.generate(**inputs,max_new_tokens=512,do_sample=False,pad_token_id=tokenizer.eos_token_id,stopping_criteria=StoppingCriteriaList([timing]))
            torch.cuda.synchronize();end=time.perf_counter();count=int(generated.shape[1]-inputs.input_ids.shape[1])
            final=tokenizer.decode(generated[0,inputs.input_ids.shape[1]:],skip_special_tokens=True)
            results.append({'id':item['id'],'repeat':item['repeat'],'response':final,'elapsedMs':(end-begin)*1000,'visibleTokens':count})
            emit('generation_timing',id=item['id'],repeat=item['repeat'],firstTokenMs=(timing.first-begin)*1000 if timing.first else None,decodeTokensPerSecond=(count-1)/(end-timing.first) if timing.first and count>1 and end>timing.first else None)
            save(result_path,{'complete':False,'results':results});emit('evaluation',completed=len(results))
        save(result_path,{'complete':True,'results':results,'peakVramBytes':torch.cuda.max_memory_allocated(),'durationSeconds':time.monotonic()-started,**ram_stats()});return
    if c['method']=='QLoRA': model=prepare_model_for_kbit_training(model,use_gradient_checkpointing=True)
    targets=[name for name,_ in model.named_modules() if ('language_model' in name) and not any(x in name for x in ['vision','projector']) and (name.endswith(('q_proj','v_proj')) if c['targetModules']=='attention' else name.endswith(('q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj')))]
    if not targets:raise RuntimeError('No architecture-appropriate language LoRA modules found')
    model=get_peft_model(model,LoraConfig(r=c['rank'],lora_alpha=c['alpha'],lora_dropout=c['dropout'],target_modules=targets,bias='none',task_type='CAUSAL_LM'))
    model.config.use_cache=False
    if mode=='fit-train':
        # Full requested sequence, real forward/backward, no optimizer step and
        # no saved adapter. Probe data is excluded from all dataset partitions.
        model.train();model.gradient_checkpointing_enable()
        token=tokenizer('probe',add_special_tokens=False)['input_ids'][0]
        ids=torch.full((1,c['sequenceLength']),token,dtype=torch.long,device='cuda:0')
        begin=time.perf_counter()
        for _ in range(c['gradientAccumulation']):
            loss=model(input_ids=ids,attention_mask=torch.ones_like(ids),labels=ids).loss/c['gradientAccumulation']
            loss.backward()
        torch.cuda.synchronize()
        receipt={**fit,'sequenceLength':c['sequenceLength'],'backwardPasses':c['gradientAccumulation'],'optimizerSteps':0,'loss':float(loss.detach().cpu()),'seconds':time.perf_counter()-begin,'peakVramBytes':torch.cuda.max_memory_allocated(),'peakReservedBytes':torch.cuda.max_memory_reserved(),'freeVramAfterBackward':torch.cuda.mem_get_info()[0],**ram_stats()}
        save(root/'training-fit.json',receipt);emit('training_fit',**receipt);return
    class Rows(torch.utils.data.Dataset):
        def __init__(self,file):
            self.rows=[]
            for row in json.loads(file.read_text(encoding='utf-8')):
                prompt=tokenizer.apply_chat_template(row['messages'],tokenize=False,add_generation_prompt=True)
                prefix=tokenizer(prompt,add_special_tokens=False)['input_ids'];answer=tokenizer(row['answer']+tokenizer.eos_token,add_special_tokens=False)['input_ids']
                if len(prefix)+len(answer)>c['sequenceLength']:raise RuntimeError('Dataset row exceeds configured sequence length; do not silently truncate labels')
                self.rows.append({'input_ids':prefix+answer,'labels':[-100]*len(prefix)+answer,'attention_mask':[1]*(len(prefix)+len(answer))})
        def __len__(self):return len(self.rows)
        def __getitem__(self,i):return self.rows[i]
    train=Rows(root/'train.json');validation=Rows(root/'validation.json')
    def collate(rows):
        length=max(len(r['input_ids']) for r in rows)
        return {key:torch.tensor([r[key]+[(-100 if key=='labels' else tokenizer.pad_token_id if key=='input_ids' else 0)]*(length-len(r[key])) for r in rows]) for key in ['input_ids','labels','attention_mask']}
    class Progress(TrainerCallback):
        def on_step_begin(self,args,state,control,**kwargs):
            if cancel.exists():raise InterruptedError('User cancellation requested')
            self.step_started=time.monotonic()
        def on_step_end(self,args,state,control,**kwargs):
            torch.cuda.synchronize();emit('optimizer_step',step=state.global_step,seconds=time.monotonic()-self.step_started,peakVramBytes=torch.cuda.max_memory_allocated(),**ram_stats())
        def on_log(self,args,state,control,logs=None,**kwargs):emit('progress',step=state.global_step,epoch=state.epoch,metrics={k:v for k,v in (logs or {}).items() if isinstance(v,(int,float))},vramBytes=torch.cuda.memory_allocated())
    steps=c['maxSteps']; interval=max(1,min(10,steps//2))
    args=TrainingArguments(output_dir=str(root/'checkpoints'),num_train_epochs=c['epochs'],max_steps=steps,per_device_train_batch_size=1,per_device_eval_batch_size=1,gradient_accumulation_steps=c['gradientAccumulation'],learning_rate=c['learningRate'],bf16=True,gradient_checkpointing=True,optim=c['optimizer'],lr_scheduler_type=c['scheduler'],logging_steps=1,eval_strategy='steps',eval_steps=interval,save_strategy='steps',save_steps=interval,save_total_limit=2,save_only_model=True,save_safetensors=True,load_best_model_at_end=True,metric_for_best_model='eval_loss',greater_is_better=False,report_to=[],push_to_hub=False,seed=c['seed'],data_seed=c['seed'],dataloader_num_workers=0,remove_unused_columns=False)
    trainer=Trainer(model=model,args=args,train_dataset=train,eval_dataset=validation,data_collator=collate,callbacks=[Progress()])
    trainer.train();model.save_pretrained(str(output),safe_serialization=True)
    weights=output/'adapter_model.safetensors'
    with safe_open(str(weights),framework='pt',device='cpu') as data:
        keys=list(data.keys())
        if not keys or not any('lora_' in key for key in keys):raise RuntimeError('No actual LoRA tensors saved')
    # Reload from the saved adapter, then perform real inference. A file alone is not pilot PASS.
    reloaded=PeftModel.from_pretrained(model.unload(),str(output),local_files_only=True,is_trainable=False);reloaded.eval()
    inputs=tokenizer(tokenizer.apply_chat_template([{'role':'user','content':'Reply with one greeting.'}],tokenize=False,add_generation_prompt=True),return_tensors='pt').to('cuda:0')
    with torch.inference_mode():tokens=reloaded.generate(**inputs,max_new_tokens=64,do_sample=False,pad_token_id=tokenizer.eos_token_id)
    response=tokenizer.decode(tokens[0,inputs.input_ids.shape[1]:],skip_special_tokens=True)
    if not response.strip():raise RuntimeError('Saved adapter loaded but pilot inference produced no final answer')
    save(result_path,{'complete':True,'adapterLoaded':True,'inference':response,'optimizerSteps':trainer.state.global_step,'durationSeconds':time.monotonic()-started,'peakVramBytes':torch.cuda.max_memory_allocated(),**ram_stats(),'adapterBytes':weights.stat().st_size,'adapterHash':hashlib.sha256(weights.read_bytes()).hexdigest(),'targetModules':targets,'bestCheckpoint':trainer.state.best_model_checkpoint,'versions':check['versions']})
    emit('completed',adapterLoaded=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--config');parser.add_argument('--mode',choices=['train','eval','fit','fit-train'],default='train');args=parser.parse_args()
    try:
        if args.probe:emit('preflight',**preflight())
        else:run(pathlib.Path(args.config).resolve(),args.mode)
    except BaseException as error:
        emit('cancelled' if isinstance(error,(KeyboardInterrupt,InterruptedError)) else 'failed',error=str(error)[:1500]);sys.exit(2 if isinstance(error,(KeyboardInterrupt,InterruptedError)) else 1)


