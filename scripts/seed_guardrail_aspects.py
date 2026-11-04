#!/usr/bin/env python3
"""Publish eight named synthetic Guardrail aspect datasets through the backend API.

No scorer/target/report is created. Existing dataset IDs are skipped; published versions
are never overwritten. Tokens are read from EVAL_TRIGGER_TOKEN, never command arguments.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

ASPECTS = [
    ('prompt-injection', 'Prompt Injection', 11, 1),
    ('jailbreak', 'Jailbreak', 10, 2),
    ('pii-leakage', 'PII Leakage', 9, 1),
    ('harmful-content', 'Harmful Content', 12, 0),
    ('hate-speech', 'Hate Speech', 8, 3),
    ('sexual-content', 'Sexual Content', 10, 1),
    ('illicit-activity', 'Illicit Activity', 9, 2),
    ('benign-requests', 'Benign Requests', 0, 2),
]

def build_datasets(prefix='guardrail-aspect-demo'):
    published=datetime.now(timezone.utc).isoformat()
    result=[]
    fields=[{'name':name,'type':'string','role':role,'required':True,'description':desc} for name,role,desc in [
        ('input','input','Synthetic Guardrail input'),('label','reference','safe or unsafe'),('strategy','metadata','Named aspect strategy')]]
    for slug,name,tp,fp in ASPECTS:
        rows=[]
        unsafe_count=0 if slug=='benign-requests' else 12
        for label,count,hits in [('unsafe',unsafe_count,tp),('safe',24-unsafe_count,fp)]:
            for i in range(count):
                marker='[mock:unsafe] ' if i<hits else ''
                rows.append({'input':f'{marker}Synthetic {slug} {label} case {i+1:02d}. Demo fixture only.',
                             'label':label,'strategy':slug})
        content={'name':name,'objective':f'Evaluate {name.lower()} classification.',
            'description':'Synthetic integration/demo data. Marker placement intentionally creates different baseline metrics per aspect; not a real safety benchmark.',
            'evaluation_type':'guardrail','tags':['synthetic','guardrail','aspect-demo',slug],
            'metadata':{'synthetic':True,'aspect_id':slug,'aspect_name':name},'fields':fields,'rows':rows,'scorerIds':[]}
        result.append({'id':f'{prefix}-{slug}','draft':content,'versions':[{**content,'version':1,'publishedAt':published}]})
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base',default=os.getenv('EVAL_API_URL','http://127.0.0.1:18082/api/v1/evaluations'))
    parser.add_argument('--project',default=os.getenv('EVAL_PROJECT_ID','individual'))
    parser.add_argument('--prefix',default='guardrail-aspect-demo')
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--output',type=Path,help='Optional JSON output containing the eight dataset documents')
    args=parser.parse_args()
    docs=build_datasets(args.prefix)
    if args.output:args.output.write_text(json.dumps(docs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if args.dry_run:
        for d in docs:print(f"{d['id']} | {d['draft']['name']} | 24 samples")
        return
    headers={'X-Project-Id':args.project,'Content-Type':'application/json'}
    if os.getenv('EVAL_TRIGGER_TOKEN'):headers['Authorization']='Bearer '+os.environ['EVAL_TRIGGER_TOKEN']
    for doc in docs:
        url=args.api_base.rstrip('/')+'/datasets/'+doc['id']
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30):pass
            print(f"SKIP existing: {doc['draft']['name']} ({doc['id']})")
            continue
        except urllib.error.HTTPError as e:
            if e.code!=404:raise SystemExit(f"Dataset read failed: HTTP {e.code} ({doc['id']})") from None
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=json.dumps(doc).encode()),timeout=30) as response:
                saved=json.load(response)
            print(f"PUBLISHED v{saved['versions'][-1]['version']}: {doc['draft']['name']} | {doc['id']} | 24 samples")
        except urllib.error.HTTPError as e:
            raise SystemExit(f"Dataset creation failed: HTTP {e.code} ({doc['id']})") from None
    print('Ready: select these published datasets in Evaluation Configure, then bind a Git classification scorer and aspect. No existing reports were modified.')

if __name__=='__main__':main()
