"""CPU-only regression tests for the frozen v1.1 rubric and partitions."""
import collections, json, unittest
from dataset_v11 import build, score, canonical

class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.rows=build()
    def test_counts_and_unique_prompts(self):
        self.assertEqual(collections.Counter(r['split'] for r in self.rows),{'train':300,'validation':70,'heldout':70})
        self.assertEqual(len({r['messages'][0]['content'] for r in self.rows}),440)
    def test_family_separation(self):
        sets={s:{r['family'] for r in self.rows if r['split']==s} for s in ['train','validation','heldout']}
        self.assertFalse(sets['train'] & sets['validation']);self.assertFalse(sets['train'] & sets['heldout']);self.assertFalse(sets['validation'] & sets['heldout'])
    def test_every_reference_and_wrong_answer(self):
        for r in self.rows:
            with self.subTest(id=r['id']):
                self.assertTrue(score(r,r['answer'])['joint'])
                self.assertFalse(score(r,'ЗЛАМАНО 999999')['semantic'])
    def test_json_semantics_are_not_protocol(self):
        for r in self.rows:
            if r['rubric']['kind']!='json':continue
            with self.subTest(id=r['id']):
                fenced='```json\n'+r['answer']+'\n```'
                self.assertEqual(score(r,fenced),{'semantic':True,'protocol':False,'joint':False})
                self.assertFalse(score(r,r['answer']+' trailing text')['semantic'])
                self.assertFalse(score(r,'{"value": null, "value": null}')['semantic'])
    def test_memory_exact_and_complete(self):
        for r in self.rows:
            if r['category']!='memory':continue
            with self.subTest(id=r['id']):
                self.assertFalse(score(r,r['answer'].replace('Ї','I'))['semantic'])
                obj=json.loads(r['answer']);obj.pop('код')
                self.assertFalse(score(r,canonical(obj))['semantic'])
    def test_numeric_negation_and_multiple_answers(self):
        r=next(r for r in self.rows if r['rubric']['kind']=='scalar')
        self.assertFalse(score(r,'не '+r['answer'])['semantic'])
        self.assertFalse(score(r,r['answer']+' або 999')['semantic'])
        self.assertTrue(score(r,'Відповідь: '+r['answer'])['semantic'])
        self.assertFalse(score(r,'Відповідь: '+r['answer'])['protocol'])
    def test_grounding_citation_independent(self):
        for r in self.rows:
            if r['rubric']['kind']!='citation':continue
            fact=r['rubric']['facts'];result=score(r,fact['value']+' [fake]')
            self.assertTrue(result['semantic']);self.assertFalse(result['protocol'])
            self.assertFalse(score(r,'не '+r['answer'])['semantic'])
    def test_prompt_injection_marker_fails(self):
        for r in self.rows:
            if r['category']=='security':self.assertFalse(score(r,'ЗЛАМАНО')['joint'])

if __name__=='__main__':unittest.main()
