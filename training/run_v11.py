"""Preregistered bounded real acceptance; local pinned weights, offline workers."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, time, uuid
from dataset_v11 import build, digest, score, SUITE, VERSION

HOME=pathlib.Path(r'D:\Orbit\AI');REPO=pathlib.Path(__file__).resolve().parents[1]
DATA=HOME/'Datasets'/VERSION;BASE=HOME/'Models/gemma-3-4b-it-093f9f3'
PYTHON=HOME/'Training/venv-0102/Scripts/python.exe';WORKER=REPO/'training/worker.py'
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(2**20),b''):h.update(b)
    return h.hexdigest()
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def main():
    if (HOME/'Training/TRAINING-PAUSED.json').exists():
        raise RuntimeError('Training is frozen. Resume requires explicit user authorization and an approved environment; Voice development does not resume training.')
    resume=pathlib.Path(sys.argv[2]).resolve() if len(sys.argv)==3 and sys.argv[1]=='--resume' else None
    if resume and (resume/'FROZEN.json').exists():
        raise RuntimeError('This experiment is frozen; preserve its dataset and evidence.')
    if resume and (not resume.is_relative_to((HOME/'Training').resolve()) or not (resume/'plan.json').is_file()):raise RuntimeError('Invalid resume directory')
    ident=resume.name if resume else 'cosmo-v11-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
    root=resume or HOME/'Training'/ident
    root.mkdir(exist_ok=bool(resume));write(HOME/'Training/active-v11.json',{'id':ident,'root':str(root),'started':stamp()})
    rows=build();audit=read(DATA/'audit.json')
    if not audit['valid'] or audit['hash']!=digest(rows):raise RuntimeError('Dataset gate failed')
    for split in ['train','validation','heldout']:
        if read(DATA/(split+'.json'))!=[r for r in rows if r['split']==split]:raise RuntimeError('Dataset snapshot mismatch')
    old=HOME/'Training/cosmo-pilot-20261011163734062-14a0fa61'
    oldfiles=[p for p in old.iterdir() if p.is_file()]
    oldfiles.append(REPO/'packages/core/src/training/dataset-v1.ts')
    if not resume:write(root/'old-evidence-hashes-before.json',{str(p):sha(p) for p in oldfiles})
    manifest=read(BASE/'.orbit-base.json')
    if manifest['revision']!='093f9f388b31de276ce2de164bdc2081324b9767' or manifest['model']!='google/gemma-3-4b-it':raise RuntimeError('Wrong pinned base')
    for f in manifest['files']:
        p=(BASE/f['path']).resolve()
        if not p.is_relative_to(BASE.resolve()) or sha(p)!=f['sha256']:raise RuntimeError('Base digest mismatch')
    config=dict(base=manifest['model'],revision=manifest['revision'],method='QLoRA',pilot=False,epochs=1,learningRate=.0001,rank=8,alpha=16,dropout=.05,batch=1,gradientAccumulation=8,sequenceLength=512,seed=42,maxSteps=32,precision='bfloat16',optimizer='adamw_torch',scheduler='linear',targetModules='attention',excludedIds=[])
    plan=dict(id=ident,release='0.10.2.1',dataset=VERSION,suite=SUITE,datasetHash=digest(rows),baseManifestHash=digest(manifest),config=config,stages=[32,96,192],heldoutRepeats=2,
        nextStageGate='Validation semantic gains >=3 items, joint gains >=3 items versus base; no Memory/Knowledge/security regression; previous-stage validation joint improvement >=2 for candidate stage; no held-out used for stage selection.',
        promotionGate='Paired 95% bootstrap lower bound >0 and >=5 percentage-point semantic and joint gain; no important category semantic or joint regression; >=95% critical category joint; latency <=1.5x. Native retrieval/tool/vision/runtime acceptance still required before production Alpha.',
        maxNewAdapters=3,privateData=False,created=stamp())
    if resume:
        saved=read(root/'plan.json')
        for k in ['datasetHash','baseManifestHash','config','stages','heldoutRepeats','nextStageGate','promotionGate']:
            if saved[k]!=plan[k]:raise RuntimeError('Resume plan changed: '+k)
        for name in ['worker.py','dataset_v11.py','audit_v11.py']:
            if sha(REPO/'training'/name)!=sha(root/name):raise RuntimeError('Execution source changed: '+name)
        plan=saved
        shutil.copy2(REPO/'training/run_v11.py',root/'resume-runner-source.py')
        write(root/'resume.json',dict(time=stamp(),reason='Previous parent/worker no longer running; baseline had no completed items; retain completed probes',runnerHash=sha(REPO/'training/run_v11.py')))
    else:
        write(root/'plan.json',plan)
        for name in ['worker.py','dataset_v11.py','audit_v11.py','run_v11.py']:shutil.copy2(REPO/'training'/name,root/name)
        shutil.copytree(DATA,root/'dataset')
    env={k:os.environ[k] for k in ['SystemRoot','WINDIR'] if k in os.environ}
    env.update(PATH=str(PYTHON.parent),TEMP=str(HOME/'TrainingCache'),TMP=str(HOME/'TrainingCache'),HF_HOME=str(HOME/'TrainingCache/offline-worker'),HF_TOKEN_PATH=str(HOME/'TrainingCache/offline-worker/no-token'),HF_HUB_DISABLE_IMPLICIT_TOKEN='1',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',WANDB_DISABLED='true',TOKENIZERS_PARALLELISM='false',PYTHONUTF8='1',CUDA_CACHE_PATH=str(HOME/'TrainingCache/cuda'),TORCH_HOME=str(HOME/'TrainingCache/torch'),TRITON_CACHE_DIR=str(HOME/'TrainingCache/triton'))
    def phase(folder,name,mode,adapter,use=False,evalrows=None,cfg=None):
        folder.mkdir(exist_ok=True)
        receipt_path=folder/(name+'-process.json')
        if receipt_path.exists() and read(receipt_path)['exitCode']==0:
            if mode=='eval' and (folder/(name+'.json')).exists():
                result=read(folder/(name+'.json'))
                if result['complete']:return result
            if mode=='train' and (folder/'result.json').exists():
                r=read(folder/'result.json')
                if r['complete'] and sha(adapter/'adapter_model.safetensors')==r['adapterHash']:return
        # Preserve interrupted logs instead of replacing evidence with the retry.
        for suffix in ['events.jsonl','warnings.log','process.json']:
            p=folder/(name+'-'+suffix)
            if p.exists():p.rename(p.with_name(p.name+'.interrupted-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')))
        write(folder/'config.json',dict(config=cfg or config,baseDirectory=str(BASE),adapterDirectory=str(adapter),baseHash=plan['baseManifestHash'],datasetHash=plan['datasetHash'],useAdapter=use))
        if evalrows is not None:write(folder/'eval-prompts.json',[{'id':r['id'],'repeat':rep,'messages':r['messages']} for r in evalrows for rep in (range(2) if r['split']=='heldout' else range(1))])
        for split in ['train','validation']:write(folder/(split+'.json'),[{'messages':r['messages'],'answer':r['answer']} for r in rows if r['split']==split])
        print(json.dumps(dict(phase=name,state='STARTED',time=stamp(),root=str(root))),flush=True)
        with (folder/(name+'-events.jsonl')).open('w',encoding='utf-8') as out,(folder/(name+'-warnings.log')).open('w',encoding='utf-8') as err:
            started=stamp();proc=subprocess.Popen([str(PYTHON),'-I',str(WORKER),'--config',str(folder/'config.json'),'--mode',mode],stdin=subprocess.PIPE,stdout=out,stderr=err,env=env,creationflags=subprocess.CREATE_NO_WINDOW)
            try:code=proc.wait(timeout=7200)
            except BaseException:
                proc.kill();proc.wait();raise
            finally:proc.stdin.close()
        write(folder/(name+'-process.json'),dict(pid=proc.pid,started=started,ended=stamp(),exitCode=code))
        if code:raise RuntimeError(f'{name} failed exit {code}; inspect phase logs')
        if mode=='eval':
            result=read(folder/'evaluation-output.json')
            expected=len(evalrows)*(2 if evalrows[0]['split']=='heldout' else 1)
            if not result['complete'] or len(result['results'])!=expected:raise RuntimeError('Incomplete eval')
            lookup={r['id']:r for r in evalrows}
            result['scores']=[dict(x,category=lookup[x['id']]['category'],family=lookup[x['id']]['family'],**score(lookup[x['id']],x['response'])) for x in result['results']]
            write(folder/(name+'.json'),result);return result
        print(json.dumps(dict(phase=name,state='PASS',time=stamp())),flush=True)
    try:
        probes=read(root/'fit-probes.json') if resume and (root/'fit-probes.json').exists() else []
        for length in ([] if probes else [512,768,1024]):
            folder=root/f'fit-{length}'
            try:
                phase(folder,f'fit-{length}','fit-train',HOME/'Adapters'/('probe-'+ident),cfg=dict(config,sequenceLength=length))
                fit=read(folder/'training-fit.json');probes.append(dict(length=length,status='PASS',measurement=fit))
                if fit['freeVramAfterBackward']<256*2**20:
                    for higher in [x for x in [512,768,1024] if x>length]:probes.append(dict(length=higher,status='NOT RUN',reason='Completed lower probe leaves less than 256 MiB free; no escalation'))
                    break
            except RuntimeError as e:
                log=(folder/f'fit-{length}-events.jsonl').read_text(encoding='utf-8')
                probes.append(dict(length=length,status='OOM' if 'out of memory' in log.lower() else 'FAIL',reason=str(e)))
                # A higher sequence cannot be justified after a failed lower probe.
                for higher in [x for x in [512,768,1024] if x>length]:probes.append(dict(length=higher,status='NOT RUN',reason='Lower sequence probe failed; no unsafe escalation'))
                break
        write(root/'fit-probes.json',probes)
        if probes[0]['status']!='PASS':raise RuntimeError('512-token backward fit failed; no optimizer step started')
        # Keep the most conservative proven fit regardless of larger probes.
        heldout=[r for r in rows if r['split']=='heldout'];validation=[r for r in rows if r['split']=='validation']
        baseline=root/'baseline'
        before=phase(baseline,'heldout-before','eval',HOME/'Adapters'/('unused-'+ident),evalrows=heldout)
        before_val=phase(baseline,'validation-before','eval',HOME/'Adapters'/('unused-'+ident),evalrows=validation)
        def totals(run,key,cat=None):return sum(r[key] for r in run['scores'] if cat is None or r['category']==cat)
        stages=[];previous_val=None
        for steps in [32,96,192]:
            stageid=f'{ident}-steps{steps}';folder=root/f'steps-{steps}';adapter=HOME/'Adapters'/stageid
            phase(folder,'training','train',adapter,cfg=dict(config,maxSteps=steps))
            receipt=read(folder/'result.json')
            if not receipt['complete'] or receipt['optimizerSteps']!=steps or sha(adapter/'adapter_model.safetensors')!=receipt['adapterHash']:raise RuntimeError('Adapter receipt failed')
            # Fresh processes for all evaluations, exact pinned base every stage.
            val=phase(folder,'validation-after','eval',adapter,True,validation,cfg=dict(config,maxSteps=steps))
            after=phase(folder,'heldout-after','eval',adapter,True,heldout,cfg=dict(config,maxSteps=steps))
            gate=all(totals(val,k)-totals(before_val,k)>=3 for k in ['semantic','joint']) and all(totals(val,k,c)>=totals(before_val,k,c) for c in ['memory','knowledge','security'] for k in ['semantic','joint'])
            if previous_val is not None:gate=gate and totals(val,'joint')-totals(previous_val,'joint')>=2
            stage=dict(id=stageid,steps=steps,adapter=str(adapter),adapterHash=receipt['adapterHash'],training='PASS',freshReload='PASS',heldoutCompleted=len(after['scores']),validationSemantic=totals(val,'semantic'),validationJoint=totals(val,'joint'),nextStageGate=gate)
            stages.append(stage);write(root/'stages.json',stages)
            write(adapter/'orbit-experiment.json',dict(plan=plan,stage=stage,status='EXPERIMENTAL_NOT_PROMOTED',baseAdapter=None))
            print(json.dumps(stage),flush=True)
            if not gate:break
            previous_val=val
        hashes=read(root/'old-evidence-hashes-before.json')
        unchanged=all(sha(pathlib.Path(p))==h for p,h in hashes.items())
        write(root/'old-evidence-integrity.json',dict(unchanged=unchanged,fileCount=len(hashes)))
        if not unchanged:raise RuntimeError('Old evidence integrity changed')
        write(root/'execution.json',dict(status='COMPLETE',stages=stages,alpha='NOT CREATED',reportPending=True,ended=stamp()))
        print('V11_EXECUTION_COMPLETE '+str(root),flush=True)
    except BaseException as e:
        write(root/'execution.json',dict(status='BLOCKED',error=str(e),alpha='NOT CREATED',ended=stamp()))
        print('V11_BLOCKED '+str(e),flush=True);raise

if __name__=='__main__':main()
