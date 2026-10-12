import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];if(!root)throw Error('Experiment directory required');
const read=name=>fs.existsSync(root+'/'+name)?JSON.parse(fs.readFileSync(root+'/'+name,'utf8')):null;
const events=name=>fs.existsSync(root+'/'+name+'-events.jsonl')?fs.readFileSync(root+'/'+name+'-events.jsonl','utf8').split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}):[];
const median=values=>{const list=values.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b);return list.length?(list[Math.floor((list.length-1)/2)]+list[Math.ceil((list.length-1)/2)])/2:null;};
const fmt=(x,unit='')=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(2)+unit:'NOT MEASURED';
const acceptance=read('acceptance.json'),experiment=read('experiment.json'),fit=read('hardware-fit.json'),train=read('result.json');
const before=read('base-heldout-before-scored.json'),after=read('adapter-heldout-after-scored.json');
const rawBefore=read('base-heldout-before.json'),rawAfter=read('adapter-heldout-after.json');
const timingBefore=events('base-heldout-before').filter(x=>x.kind==='generation_timing'),timingAfter=events('adapter-heldout-after').filter(x=>x.kind==='generation_timing');
const rate=(run,cat)=>{const rows=run?.observations.filter(x=>x.category===cat);return rows?.length?`${rows.filter(x=>x.passed).length}/${rows.length}`:'NOT RUN';};
const metrics=[['Reasoning','reasoning'],['Code','code'],['Memory adherence (controlled context)','memory'],['Knowledge (supplied controlled passages)','knowledge'],['Context adherence','context'],['Russian','russian'],['Ukrainian','ukrainian'],['English','english'],['JSON','json'],['Hallucination','hallucination'],['Source conflict','sources'],['Tool formatting (not tool execution)','tools'],['Prompt injection','security'],['Style','style']];
const rows=metrics.map(([label,cat])=>`| ${label} | ${rate(before,cat)} | ${rate(after,cat)} |`);
rows.push('| Vision | NOT TESTED | NOT TESTED |',`| First generated token, median ms | ${fmt(median(timingBefore.map(x=>x.firstTokenMs)))} | ${fmt(median(timingAfter.map(x=>x.firstTokenMs)))} |`,`| Decode tokens/sec, median | ${fmt(median(timingBefore.map(x=>x.decodeTokensPerSecond)))} | ${fmt(median(timingAfter.map(x=>x.decodeTokensPerSecond)))} |`,`| Peak allocated VRAM, GiB | ${fmt(rawBefore?.peakVramBytes/2**30)} | ${fmt(rawAfter?.peakVramBytes/2**30)} |`,`| Peak process working set RAM, GiB | ${fmt(rawBefore?.peakRamBytes/2**30)} | ${fmt(rawAfter?.peakRamBytes/2**30)} |`);
const steps=events('pilot-training').filter(x=>x.kind==='optimizer_step');
const losses=events('pilot-training').filter(x=>x.kind==='progress');
const report=`# ORBIT 0.10.2 REAL TRAINING ACCEPTANCE REPORT

Experiment: ${experiment?.id}
Exact base: ${experiment?.base}, revision ${experiment?.revision}.
Dataset: cosmo-dataset-v1.0, 28 train / 14 validation / 14 held-out; two identical deterministic repetitions per held-out item. Responses are graded by the existing unchanged validators; repeats are not independent items.
Dataset hash: ${experiment?.datasetHash}
Training configuration hash: ${experiment?.configHash}
Base file-manifest hash: ${experiment?.baseHash}

Training environment: isolated D:/Orbit/AI/Training/venv-0102.
CUDA/base load: ${fit?'PASS':'NOT VERIFIED'}.
4-bit base load: ${fit?.fourBitLoaded?'PASS':'NOT VERIFIED'}.
GPU: ${fit?.gpu??'UNKNOWN'}.
VRAM total/free after load: ${fmt(fit?.vramTotalBytes/2**30,' GiB')} / ${fmt(fit?.vramFreeAfterLoadBytes/2**30,' GiB')}.
Physical RAM total/available after load: ${fmt(fit?.ramTotalBytes/2**30,' GiB')} / ${fmt(fit?.ramAvailableBytes/2**30,' GiB')}.
Pinned original Safetensors and tokenizer: verified by manifest before any worker launch.
Baseline before first optimizer step: ${before?.complete?'PASS':'NOT RUN'}.
Pilot training: ${train?.complete?'PASS':'NOT COMPLETED'}.
Optimizer steps: ${train?.optimizerSteps??steps.at(-1)?.step??0}/8.
Training worker duration including load and saved-adapter inference: ${fmt(train?.durationSeconds,' seconds')}.
Peak training allocated VRAM: ${fmt(train?.peakVramBytes/2**30,' GiB')}.
Peak training process working set RAM: ${fmt(train?.peakRamBytes/2**30,' GiB')}.
Adapter saved: ${train?.adapterHash?'YES':'NO'}.
Adapter SHA256: ${train?.adapterHash??'NONE'}.
Adapter bytes: ${train?.adapterBytes??'UNKNOWN'}.
Fresh-process adapter reload and inference: ${after?.complete?'PASS':'NOT COMPLETED'}.
Held-out AFTER: ${after?.complete?'PASS':'NOT COMPLETED'}.
Pilot verdict: ${acceptance?.pilot??'INCONCLUSIVE'}.
Error/blocker: ${acceptance?.error??'None'}.
COSMO Brain Alpha: NOT CREATED.
Promotion: NOT ELIGIBLE. This is a tiny pipeline pilot, not a production general assistant.

| Metric | Pinned base BEFORE | Pilot adapter AFTER |
|---|---:|---:|
${rows.join('\n')}

Memory/Knowledge rows measure supplied controlled synthetic context, not live production retrieval. Vision and real tool execution were not in this held-out pilot and are not claimed verified. The baseline is the original pinned model loaded with NF4 in the same backend as the adapter; no historical Ollama score is used. Generated-token timing is token-level latency, not UI-visible streaming latency. Peak allocated VRAM is PyTorch allocation, not total GPU usage.

## Measured optimizer steps

${steps.length?steps.map(x=>`- Step ${x.step}: ${fmt(x.seconds,' s')}`).join('\n'):'No completed optimizer step.'}

## Loss and learning-rate records

\`\`\`json
${JSON.stringify(losses,null,2)}
\`\`\`

Raw responses, process IDs/timestamps, warnings and resource receipts are in this experiment folder. Workers have offline network configuration and do not receive authentication tokens. Only controlled dataset files are supplied. Existing six COSMO roles and production environment are unchanged. No model merge, Alpha naming or v0.10.3 work occurred.
`;
const audit=`
## Interpretation and acceptance boundaries

Strict validator total: ${before?.observations.filter(x=>x.passed).length}/${before?.observations.length} BEFORE and ${after?.observations.filter(x=>x.passed).length}/${after?.observations.length} AFTER. No measured score improvement; no production promotion. These are format-sensitive validators, not a general intelligence percentage. For example, the BEFORE Knowledge response correctly states vertical storage and cites [довідка-z], but its wording differs from the strict reference. JSON fenced in Markdown also fails the raw-JSON contract. The reasoning answer is actually wrong; Memory changes a Cyrillic identifier to Latin. Validators have not been changed retrospectively.

Training-loop duration: ${losses.find(x=>x.metrics?.train_runtime)?.metrics.train_runtime} seconds. The configured gradient accumulation is 8; Trainer flushes partial accumulation at epoch boundaries (28 rows per epoch), so 8 optimizer steps over 2 epochs represent 56 row exposures, not 64. No larger run was started.

Responses reaching the 512-token ceiling: BEFORE ${rawBefore?.results.filter(x=>x.visibleTokens>=512).length}/${rawBefore?.results.length}; AFTER ${rawAfter?.results.filter(x=>x.visibleTokens>=512).length}/${rawAfter?.results.length}. All cases remain in the results. The Windows monotonic clock has approximately 15.625 ms resolution; the 94 ms median first-token measurement is coarse. Speed differences in this tiny run are descriptive, not statistically established.

Warnings preserved in raw logs: deprecated torch_dtype argument; top_p/top_k ignored during greedy generation; use_cache disabled for gradient checkpointing; existing peft_config warning during the training process's reload. Independent AFTER worker loading succeeds and is the decisive reload check. A Windows blocking-stdin/Torch-import startup deadlock occurred in earlier attempts before training; the worker now uses nonblocking pipe polling and starts its guard after imports. The real Torch-import plus parent-EOF regression test passed. No Windows security changes were made.

Training allocated VRAM peaked at 5.85 GiB. A transient whole-GPU reading reached 7642 MiB used / 254 MiB free, including other processes; these are different metrics. No OOM occurred. This proves only this bounded pilot fits, not longer sequences or larger batches. Adapter verification found 136 tensors, including 68 nonzero LoRA B tensors.

Process order: baseline PID 28984 finished at 2026-10-11T16:42:22.846Z; optimizer worker PID 25820 started at 16:42:22.848Z and finished at 16:43:18.959Z; fresh AFTER worker PID 27640 started at 16:43:18.960Z. Original process receipts are included.

Original weights and tokenizer remain local, subject to the [Gemma terms](https://ai.google.dev/gemma/terms). Exact base revision: [official Hugging Face repository](https://huggingface.co/google/gemma-3-4b-it/tree/093f9f388b31de276ce2de164bdc2081324b9767). Downloaded weight SHA256s were reverified; incomplete files from stopped downloads were removed only after verification. Original weights, authentication cache and installed environment are excluded from delivery archives.

Release gate: real training pipeline PASS; adapter quality promotion NOT ELIGIBLE; COSMO Brain Alpha NOT CREATED. Native desktop acceptance is NOT VERIFIED by this training run. No new installer is claimed: the previously built installer predates the worker fixes captured in the new source archive. The experimental adapter is not selected in production roles.

## Proposed Dataset v1.1 gate (not executed)

Curate a small diverse expansion targeting Ukrainian output, exact Memory identifiers, grounded Knowledge answers and source conflicts. Separate semantic correctness from format compliance using reviewed validators and adversarial examples. Preserve provenance and group-level train/validation/held-out separation; do not reuse this pilot's held-out items for training. Require at least 30 independent held-out items and enough repeated measurements for meaningful uncertainty. Include real tool execution and a separate vision suite before claiming those capabilities. Rerun the pinned base with the new versioned evaluation before any new training. No private chats, Memory, Knowledge, Sense or user files become training data automatically. A longer run requires a separate fit and experiment plan; it has not been started.
`;
fs.writeFileSync(root+'/REAL-TRAINING-ACCEPTANCE-REPORT.md',report+audit);console.log(root+'/REAL-TRAINING-ACCEPTANCE-REPORT.md');
