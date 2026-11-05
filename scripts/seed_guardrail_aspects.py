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
from urllib.parse import urlsplit, urlunsplit

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

def api_base(value):
    parsed=urlsplit(value.strip())
    if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError('Use an HTTP(S) API URL without embedded credentials, query or fragment')
    path=parsed.path.rstrip('/')
    if not path:path='/api/v1/evaluations'
    return urlunsplit((parsed.scheme,parsed.netloc,path,'',''))


def http_failure(action, method, url, error):
    try:
        payload=json.loads(error.read(4096))
        detail=payload.get('detail','') if isinstance(payload,dict) else ''
    except (ValueError,UnicodeError):detail=''
    message=f'{action}: HTTP {error.code} ({method} {url})'
    if detail:message+=f' — {str(detail)[:300]}'
    if error.code==404:
        message+='\nCheck --api-base: use the UI/backend host plus /api/v1/evaluations (not /datasets or a dataset ID).'
    return message


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-base',type=api_base,default=os.getenv('EVAL_API_URL','http://127.0.0.1:18082/api/v1/evaluations'))
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
    # Probe the collection first: its 404 means a wrong API route, whereas an
    # individual missing dataset's 404 is expected and should lead to creation.
    probe=args.api_base+'/datasets?limit=1'
    try:
        with urllib.request.urlopen(urllib.request.Request(probe,headers=headers),timeout=30) as response:
            listing=json.load(response)
        if not isinstance(listing,dict) or not isinstance(listing.get('items'),list):
            raise SystemExit('The URL did not return the dataset API. Check --api-base /api/v1/evaluations.')
    except urllib.error.HTTPError as e:raise SystemExit(http_failure('Dataset API check failed','GET',probe,e)) from None
    except (ValueError,UnicodeError):raise SystemExit('The URL did not return JSON. Check --api-base /api/v1/evaluations.') from None
    except urllib.error.URLError as e:raise SystemExit(f'Dataset API connection failed: {type(e.reason).__name__}') from None
    print(f'API ready: {args.api_base} | project: {args.project}')
    for doc in docs:
        url=args.api_base.rstrip('/')+'/datasets/'+doc['id']
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30):pass
            print(f"SKIP existing: {doc['draft']['name']} ({doc['id']})")
            continue
        except urllib.error.HTTPError as e:
            if e.code!=404:raise SystemExit(http_failure("Dataset read failed","GET",url,e)) from None
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=json.dumps(doc).encode()),timeout=30) as response:
                saved=json.load(response)
            print(f"PUBLISHED v{saved['versions'][-1]['version']}: {doc['draft']['name']} | {doc['id']} | 24 samples")
        except urllib.error.HTTPError as e:
            raise SystemExit(http_failure("Dataset creation failed","POST",url,e)) from None
    print('Ready: select these published datasets in Evaluation Configure, then bind a Git classification scorer and aspect. No existing reports were modified.')

if __name__=='__main__':main()
