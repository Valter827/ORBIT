"""Explicitly approved official model fetch. Auth uses HF's existing local login; never prints a token."""
import argparse,hashlib,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--destination',required=True);p.add_argument('--approve-8gb-download',action='store_true');p.add_argument('--gemma-terms-accepted',action='store_true');a=p.parse_args()
if not a.approve_8gb_download or not a.gemma_terms_accepted:raise SystemExit('Explicit download approval and accepted Gemma access are required.')
root=pathlib.Path(a.destination).resolve()
if root.exists() and any(root.iterdir()):raise SystemExit('Use a new directory; existing weights are not overwritten.')
from huggingface_hub import snapshot_download,HfApi
model='google/gemma-3-4b-it';revision='093f9f388b31de276ce2de164bdc2081324b9767'
info=HfApi().model_info(model,revision=revision,files_metadata=True)
expected={f.rfilename:f.lfs.sha256 for f in info.siblings if f.lfs is not None}
snapshot_download(repo_id=model,revision=revision,local_dir=str(root),allow_patterns=['*.json','*.model','*.safetensors','*.jinja','README.md','LICENSE','LICENSE.*'],ignore_patterns=['*.bin','*.pt','*.py'])
files=[]
for f in sorted(root.iterdir()):
 if not f.is_file():continue
 h=hashlib.sha256()
 with f.open('rb') as stream:
  for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
 digest=h.hexdigest()
 if f.name in expected and expected[f.name]!=digest:raise SystemExit('Official LFS hash mismatch: '+f.name)
 files.append({'path':f.name,'sha256':digest})
(root/'.orbit-base.json').write_text(json.dumps({'model':model,'revision':revision,'source':'https://huggingface.co/google/gemma-3-4b-it','license':'Gemma Terms','licenseAccepted':True,'files':files},indent=2),encoding='utf-8')
print(json.dumps({'model':model,'revision':revision,'files':len(files),'verified':True}))
