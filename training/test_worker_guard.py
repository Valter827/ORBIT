"""Windows regression: actual Torch import with the worker's guard, then parent EOF."""
import ast,pathlib,sys,subprocess,json,os,time,threading
worker=pathlib.Path(__file__).with_name('worker.py')
if '--child' in sys.argv:
 tree=ast.parse(worker.read_text(encoding='utf-8-sig'));run=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='run');guard=next(x for x in run.body if isinstance(x,ast.FunctionDef) and x.name=='parent_guard')
 exec(compile(ast.fix_missing_locations(ast.Module(body=[guard],type_ignores=[])),str(worker),'exec'))
 threading.Thread(target=parent_guard,daemon=True).start()
 import torch
 print('TORCH_IMPORT_PASS',flush=True)
 time.sleep(60)
else:
 if os.name!='nt':raise SystemExit('Windows-only regression')
 child=subprocess.Popen([sys.executable,'-I',__file__,'--child'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 timer=threading.Timer(30,child.kill);timer.start()
 try:
  line=child.stdout.readline().strip()
  if line!='TORCH_IMPORT_PASS':raise RuntimeError('Torch/guard initialization did not complete')
  child.stdin.close();code=child.wait(timeout=5)
  if code!=2:raise RuntimeError('Parent EOF did not terminate worker')
  print(json.dumps({'torchImportWithGuard':'PASS','parentEofExit':'PASS','exitCode':code}))
 finally:
  timer.cancel()
  if child.poll() is None:child.kill()
