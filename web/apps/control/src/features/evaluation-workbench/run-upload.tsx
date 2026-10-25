import { useEffect, useRef, useState } from 'react';
import { executionApi } from './remote';
import { Button, Field, Input } from './ui';

export interface RunUpload { id: string; row_count: number; dataset_id: string; dataset_version: number }
export function RunUploadInput({projectId,datasetId,version,fields,onReady}:{projectId:string;datasetId:string;version:number;fields:string[];onReady(value:RunUpload|null):void}) {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [upload,setUpload]=useState<RunUpload|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{onReady(null);setUpload(null);setError('');setBusy(false);return ()=>active.current?.abort();},[projectId,datasetId,version,onReady]);
  return <div className="space-y-3 rounded-lg border p-4">
    <p className="text-sm text-muted-foreground">Upload UTF-8 CSV or a single-sheet XLSX file matching the selected dataset version. Maximum 8 MB and 10,000 samples. Use JSON text for messages and true/false for booleans. Formulas are not supported.</p>
    <Button variant="outline" onClick={()=>{
      const csv=fields.map(f=>'"'+f.replaceAll('"','""')+'"').join(',')+'\r\n';
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='dataset-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Download CSV template</Button>
    <Field label="Upload CSV or Excel"><Input key={`${datasetId}:${version}`} type="file" accept=".csv,.xlsx" disabled={!datasetId||!version} onChange={async e=>{
      active.current?.abort();onReady(null);setUpload(null);setError('');setBusy(false);
      const file=e.target.files?.[0];if(!file)return;
      if(!/\.(csv|xlsx)$/i.test(file.name)||!file.size||file.size>8_000_000){setError('Choose a nonempty CSV or XLSX file up to 8 MB.');return;}
      const controller=new AbortController();active.current=controller;setBusy(true);
      try {
        const value=await executionApi<RunUpload>(projectId,`uploads?dataset_id=${encodeURIComponent(datasetId)}&dataset_version=${version}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Filename':encodeURIComponent(file.name)},body:file,signal:controller.signal});
        if(!controller.signal.aborted){setUpload(value);onReady(value);}
      } catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
      finally{if(!controller.signal.aborted)setBusy(false);}
    }}/></Field>
    {busy&&<p role="status">Uploading and validating…</p>}
    {upload&&<p role="status">Validated {upload.row_count} samples</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
