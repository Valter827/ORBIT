"""Read-only import diagnosis. No package modification or security workaround."""
import json, pathlib, sys, traceback
sys.stdout.reconfigure(encoding='utf-8')
def trace(frame,event,arg):
    if event=='exception' and frame.f_code.co_filename.endswith('_dynamo\\utils.py') and isinstance(arg[1],ImportError):
        print(json.dumps({'file':'torch/_dynamo/utils.py','line':frame.f_lineno,'error':str(arg[1])},ensure_ascii=False),flush=True)
    return trace
sys.settrace(trace)
try:
    import torch._dynamo
    from transformers import AutoTokenizer,AutoModelForImageTextToText,Trainer
    print('IMPORTS_PASS')
except Exception:
    traceback.print_exc();sys.exit(1)
finally:sys.settrace(None)
