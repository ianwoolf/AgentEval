import { useEffect, useRef, useState } from 'react';
import { executionApi } from './remote';
import { Button, Field, Input } from './ui';
import type { DatasetVersion } from './contracts';

export interface RunUpload { id: string; row_count: number; dataset_id: string; dataset_version: number }
export function RunUploadInput({projectId,datasetId,version,fields,config,labelMapping,onReady}:{
  projectId:string;datasetId:string;version:number;fields:DatasetVersion['fields'];
  config?:{targetId:string;revision:string};labelMapping?:Record<string,string>;
  onReady(value:RunUpload|null):void;
}) {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [upload,setUpload]=useState<RunUpload|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{onReady(null);setUpload(null);setError('');setBusy(false);return ()=>active.current?.abort();},[projectId,datasetId,version,onReady]);
  return <div className="space-y-2 bg-muted/25 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
    <ul aria-label="Expected columns" className="flex flex-wrap gap-1.5 text-xs">
      {fields.map(field=><li key={field.name} className="rounded border bg-background px-2 py-1">
        <span className="font-mono font-medium">{field.name}</span> · {field.type} · {field.required?'required':'optional'}
      </li>)}
    </ul>
    <Button variant="outline" size="sm" onClick={()=>{
      const csv=fields.map(f=>'"'+f.name.replaceAll('"','""')+'"').join(',')+'\r\n';
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='dataset-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Download CSV template</Button>
    </div>
    {labelMapping&&<p className="text-xs text-muted-foreground">Accepted labels: {Object.entries(labelMapping).map(([label,value])=>`${JSON.stringify(label)} → ${value}`).join(' · ')}</p>}
    <p className="text-xs text-muted-foreground">Use UTF-8 CSV or single-sheet XLSX with a header row. Max 8 MB and 10,000 samples. JSON cells require JSON text. Formulas are unsupported.</p>
    <Field label="Upload CSV or Excel"><Input key={`${datasetId}:${version}`} type="file" accept=".csv,.xlsx" disabled={!datasetId||!version} onChange={async e=>{
      active.current?.abort();onReady(null);setUpload(null);setError('');setBusy(false);
      const file=e.target.files?.[0];if(!file)return;
      if(!/\.(csv|xlsx)$/i.test(file.name)||!file.size||file.size>8_000_000){setError('Choose a nonempty CSV or XLSX file up to 8 MB.');return;}
      const controller=new AbortController();active.current=controller;setBusy(true);
      try {
        const query=new URLSearchParams({dataset_id:datasetId,dataset_version:String(version)});
        if(config){query.set('target_id',config.targetId);query.set('config_revision',config.revision);}
        const value=await executionApi<RunUpload>(projectId,`uploads?${query}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Filename':encodeURIComponent(file.name)},body:file,signal:controller.signal});
        if(!controller.signal.aborted){setUpload(value);onReady(value);}
      } catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
      finally{if(!controller.signal.aborted)setBusy(false);}
    }}/></Field>
    {busy&&<p role="status">Uploading and validating…</p>}
    {upload&&<p role="status">Validated {upload.row_count} samples</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
