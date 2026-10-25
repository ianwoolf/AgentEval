import {useCallback,useEffect,useRef,useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionApi,fromRemote,type RemoteRun,type TargetRunConfig} from './remote';
import {useWorkbench} from './provider';
import {RunUploadInput,type RunUpload} from './run-upload';
import type {DatasetVersion} from './contracts';
import {Button,ErrorText,Field,Input,Modal} from './ui';

export function TriggerTargetDialog({targetId,onClose,onStarted}:{targetId:string;onClose():void;onStarted?(id:string):void}) {
 const projectId=useCurrentProjectId();const {state,setState}=useWorkbench();
 const [config,setConfig]=useState<TargetRunConfig|null>(null),[schema,setSchema]=useState<DatasetVersion|null>(null);
 const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[upload,setUpload]=useState<RunUpload|null>(null);
 const submitted=useRef(false),key=useRef(crypto.randomUUID());
 const ready=useCallback((v:RunUpload|null)=>{setUpload(v);key.current=crypto.randomUUID();},[]);
 useEffect(()=>{
  let active=true;
  executionApi<TargetRunConfig>(projectId,`targets/${encodeURIComponent(targetId)}/config`).then(async c=>{
   const v=c.data_source==='upload'?await executionApi<DatasetVersion>(projectId,`datasets/${encodeURIComponent(c.dataset_id)}/versions/${c.dataset_version}`):null;
   if(active){setConfig(c);setSchema(v);}
  }).catch(e=>{if(active)setError(e.status===404?'Save this target’s Config before triggering an evaluation.':e.message);});
  return()=>{active=false;};
 },[projectId,targetId]);
 const target=state.targets.find(t=>t.id===targetId);
 return <Modal title="Trigger evaluation" description={`Run ${target?.name??targetId} using its saved Config.`} onClose={onClose} footer={<>
  <ErrorText message={error}/><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button>
  <Button disabled={busy||!config||(config.data_source==='upload'&&!upload)} onClick={async()=>{
   if(submitted.current||!config)return;submitted.current=true;setBusy(true);setError('');
   try{
    const run=await executionApi<RemoteRun>(projectId,`targets/${encodeURIComponent(targetId)}/runs`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify({name,config_revision:config.revision,...(upload?{upload_id:upload.id}:{})})});
    setState(s=>({...s,evaluations:[fromRemote(run),...s.evaluations.filter(e=>e.id!==run.id)]}));onClose();onStarted?.(run.id);
   }catch(e){setError((e as Error).message);submitted.current=false;}finally{setBusy(false);}
  }}>{busy?'Starting…':'Run evaluation'}</Button></div></>}>
  <Field label="Evaluation name" hint="Optional. Leave blank to use the target name and current time (Asia/Shanghai)."><Input value={name} disabled={busy} placeholder={`${target?.name??targetId} + current time`} onChange={e=>{setName(e.target.value);key.current=crypto.randomUUID();}} /></Field>
  {config?.data_source==='upload'&&schema&&<RunUploadInput projectId={projectId} datasetId={config.dataset_id} version={config.dataset_version} fields={schema.fields.map(f=>f.name)} onReady={ready}/>}
 </Modal>;
}
