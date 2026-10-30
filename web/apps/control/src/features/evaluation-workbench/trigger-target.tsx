import {useCallback,useEffect,useRef,useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionApi,fromRemote,type RemoteRun,type TargetRunConfig} from './remote';
import {useWorkbench} from './provider';
import {RunUploadInput,type RunUpload} from './run-upload';
import type {DatasetVersion} from './contracts';
import {Button,ErrorText,Field,Input,Modal} from './ui';

type Selection = {dataset_id:string;dataset_version:number;upload_id?:string};
function DatasetUpload({projectId,selection,schema,onReady}:{projectId:string;selection:Selection;schema:DatasetVersion;onReady(id:string,value:RunUpload|null):void}) {
 const ready=useCallback((value:RunUpload|null)=>onReady(selection.dataset_id,value),[onReady,selection.dataset_id]);
 return <RunUploadInput projectId={projectId} datasetId={selection.dataset_id} version={selection.dataset_version} fields={schema.fields.map(f=>f.name)} onReady={ready}/>;
}
export function TriggerTargetDialog({targetId,onClose,onStarted}:{targetId:string;onClose():void;onStarted?(id:string):void}) {
 const projectId=useCurrentProjectId();const {state,setState}=useWorkbench();
 const [config,setConfig]=useState<TargetRunConfig|null>(null);
 const [selected,setSelected]=useState<Selection[]>([]);
 const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submitted=useRef(false),key=useRef(crypto.randomUUID());
 const ready=useCallback((id:string,value:RunUpload|null)=>{setSelected(rows=>rows.map(s=>s.dataset_id===id?{...s,upload_id:value?.id}:s));key.current=crypto.randomUUID();},[]);
 useEffect(()=>{
  let active=true;
  executionApi<TargetRunConfig>(projectId,`targets/${encodeURIComponent(targetId)}/config`).then(c=>{
   if(active){setConfig(c);setSelected(c.datasets ?? [{dataset_id:c.dataset_id,dataset_version:c.dataset_version}]);}
  }).catch(e=>{if(active)setError(e.status===404?'Save this target’s Config before triggering an evaluation.':e.message);});
  return()=>{active=false;};
 },[projectId,targetId]);
 const target=state.targets.find(t=>t.id===targetId);
 const allowed=config?.datasets ?? (config?[{dataset_id:config.dataset_id,dataset_version:config.dataset_version}]:[]);
 const valid=selected.length>0&&selected.every(s=>state.datasets.some(d=>d.id===s.dataset_id&&d.versions.some(v=>v.version===s.dataset_version))&&(config?.data_source!=='upload'||s.upload_id));
 return <Modal title="Trigger evaluation" description={`Run ${target?.name??targetId} on one or more datasets using its saved environment and scorers.`} onClose={onClose} footer={<>
  <ErrorText message={error}/><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button disabled={busy||!config||!valid} onClick={async()=>{
   if(submitted.current||!config||!valid)return;submitted.current=true;setBusy(true);setError('');
   try{
    const run=await executionApi<RemoteRun>(projectId,`targets/${encodeURIComponent(targetId)}/runs`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify({name,config_revision:config.revision,datasets:selected})});
    setState(s=>({...s,evaluations:[fromRemote(run),...s.evaluations.filter(e=>e.id!==run.id)]}));onClose();onStarted?.(run.id);
   }catch(e){setError((e as Error).message);submitted.current=false;}finally{setBusy(false);}
  }}>{busy?'Starting…':'Run evaluation'}</Button></div></>}>
  <Field label="Evaluation name" hint="Optional. Leave blank to use the target name and current time (Asia/Shanghai)."><Input value={name} disabled={busy} placeholder={`${target?.name??targetId} + current time`} onChange={e=>{setName(e.target.value);key.current=crypto.randomUUID();}} /></Field>
  <fieldset disabled={busy||!config} className="space-y-3">
   <legend className="mb-3 text-sm font-medium">Datasets · {selected.length} selected</legend>
   <p className="text-sm text-muted-foreground">Choose from the datasets saved in Target configuration. Versions, environment and scorers are fixed by that configuration.</p>
   {allowed.map(ref=>{
    const d=state.datasets.find(d=>d.id===ref.dataset_id);
    if(!d)return <p key={ref.dataset_id} role="alert">Configured dataset {ref.dataset_id} is unavailable. Update Target configuration.</p>;
    const selection=selected.find(s=>s.dataset_id===d.id);
    const version=d.versions.find(v=>v.version===selection?.dataset_version);
    return <div key={d.id} className="space-y-3 rounded-lg border p-4">
     <div className="flex items-center justify-between gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selection} disabled={!selection&&selected.length>=20} onChange={e=>{
      setSelected(rows=>e.target.checked?[...rows,{dataset_id:d.id,dataset_version:ref.dataset_version}]:rows.filter(s=>s.dataset_id!==d.id));key.current=crypto.randomUUID();
     }}/>{d.draft.name}</label>
     <span className="text-sm text-muted-foreground">v{ref.dataset_version}</span></div>
     {selection&&version&&config?.data_source==='upload'&&<DatasetUpload projectId={projectId} selection={selection} schema={version} onReady={ready}/>}
    </div>;
   })}
   {!allowed.length&&<p>No datasets configured. Save Target configuration first.</p>}
  </fieldset>
 </Modal>;
}
