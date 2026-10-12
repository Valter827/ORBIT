"""Deterministic data, leakage, rubric and token-length gates before training."""
import collections, difflib, json, pathlib, re, sys
from dataset_v11 import build, score, digest, canonical

ROOT=pathlib.Path(r'D:\Orbit\AI\Datasets\cosmo-dataset-v1.1')
OLD=pathlib.Path(r'D:\Orbit\AI\Training\cosmo-pilot-20261011163734062-14a0fa61')
rows=build();errors=[];mutations=0
def check(condition,message):
    if not condition:errors.append(message)
families=collections.defaultdict(set)
for row in rows:
    families[row['family']].add(row['split'])
    check(score(row,row['answer'])['joint'],f'reference fails: {row["id"]}')
    check(not score(row,'Невірна відповідь ЗЛАМАНО 999999')['semantic'],f'wrong-answer accepted: {row["id"]}')
    if row['rubric']['kind']=='json':
        fenced='```json\n'+row['answer']+'\n```';r=score(row,fenced)
        check(r['semantic'] and not r['protocol'],f'JSON separation failed {row["id"]}')
        obj=json.loads(row['answer']);obj['unauthorized']='extra'
        check(not score(row,canonical(obj))['semantic'],f'extra field accepted {row["id"]}')
        mutations+=2
    if row['category']=='memory':
        check(not score(row,row['answer'].replace('Ї','I'))['semantic'],f'identifier corruption accepted {row["id"]}')
        obj=json.loads(row['answer']);obj.pop(next(iter(obj)))
        check(not score(row,canonical(obj))['semantic'],f'missing fact accepted {row["id"]}')
        mutations+=2
    if row['rubric']['kind']=='citation':
        r=score(row,row['rubric']['facts']['value']+' [invented]')
        check(r['semantic'] and not r['protocol'],f'false citation accepted {row["id"]}')
        mutations+=1
check(all(len(s)==1 for s in families.values()),'family crosses partition')
check(len({r['id'] for r in rows})==len(rows),'duplicate ID')
prompts=[r['messages'][0]['content'] for r in rows]
check(len(set(prompts))==len(prompts),'exact duplicate prompt')
old=list({x['messages'][0]['content'] for x in json.loads((OLD/'eval-prompts.json').read_text(encoding='utf-8'))})
def words(s):return set(re.findall(r'\w+',s.casefold()))
def jac(a,b):return len(a&b)/max(1,len(a|b))
cross=[]
for i,a in enumerate(rows):
  for b in rows[i+1:]:
    if a['split']==b['split']:continue
    similarity=jac(words(a['messages'][0]['content']),words(b['messages'][0]['content']))
    if similarity>=.8:cross.append({'a':a['id'],'b':b['id'],'jaccard':similarity})
# Shared protocol boilerplate can overlap; values and families must not. Publish
# all high lexical overlaps, do not silently call a lexical screen semantic proof.
old_pairs=sorted([{'id':r['id'],'oldIndex':i,'jaccard':jac(words(r['messages'][0]['content']),words(p))} for r in rows for i,p in enumerate(old)],key=lambda x:x['jaccard'],reverse=True)
check(not any(p in prompts for p in old),'old held-out exact match')
check(old_pairs[0]['jaccard']<.7,'possible old held-out near duplicate')
from transformers import AutoTokenizer
tokenizer=AutoTokenizer.from_pretrained(r'D:\Orbit\AI\Models\gemma-3-4b-it-093f9f3',local_files_only=True,trust_remote_code=False)
lengths=[]
for r in rows:
    prefix=tokenizer.apply_chat_template(r['messages'],tokenize=False,add_generation_prompt=True)
    count=len(tokenizer(prefix,add_special_tokens=False)['input_ids'])+len(tokenizer(r['answer']+tokenizer.eos_token,add_special_tokens=False)['input_ids'])
    lengths.append({'id':r['id'],'tokens':count})
check(max(x['tokens'] for x in lengths)<=512,'sequence overflow')
result=dict(version='cosmo-dataset-v1.1',valid=not errors,errors=errors,hash=digest(rows),counts=dict(collections.Counter(r['split'] for r in rows)),languages=dict(collections.Counter(r['language'] for r in rows)),families=len(families),crossSplitFamilyOverlap=0,oldHeldoutTasks=len(old),oldHeldoutTopSimilarities=old_pairs[:10],crossSplitLexicalCandidates=cross,referenceChecks=len(rows),negativeChecks=len(rows)+mutations,maxTokens=max(x['tokens'] for x in lengths),tokenLengths=lengths,
    limitation='Authored family assignment and lexical audit, not a proof against all semantic leakage. Shared task contracts are intentional. No independent human review claimed.')
(ROOT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['tokenLengths','crossSplitLexicalCandidates','oldHeldoutTopSimilarities']},ensure_ascii=False))
print('crossSplitLexicalCandidates='+str(len(cross)))
sys.exit(0 if result['valid'] else 1)
