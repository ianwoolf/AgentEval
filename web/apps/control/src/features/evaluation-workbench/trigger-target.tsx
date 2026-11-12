import {Fragment,useCallback,useEffect,useRef,useState} from 'react';
import {Plus,X} from 'lucide-react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionApi,fromRemote,type RemoteRun,type TargetRunConfig} from './remote';
import {useWorkbench} from './provider';
import {RunUploadInput,type RunUpload} from './run-upload';
import type {DatasetVersion} from './contracts';
import {Button,ErrorText,Field,Input,Modal,Select} from './ui';

type Selection = {dataset_id:string;dataset_version:number;upload_id?:string|undefined};
type RunSettings = {concurrency:string;provider:string;guardrail:string};
type ComparisonRow = RunSettings & {id:string};
function DatasetUpload({projectId,selection,schema,config,labelMapping,onReady}:{
 projectId:string;selection:Selection;schema:DatasetVersion;config:{targetId:string;revision:string};
 labelMapping?:Record<string,string>;onReady(id:string,value:RunUpload|null):void;
}) {
 const ready=useCallback((value:RunUpload|null)=>onReady(selection.dataset_id,value),[onReady,selection.dataset_id]);
 return <RunUploadInput projectId={projectId} datasetId={selection.dataset_id} version={selection.dataset_version}
  fields={schema.fields} config={config} labelMapping={labelMapping} onReady={ready}/>;
}
export function TriggerTargetDialog(props:{targetId:string;onClose():void;onStarted?(id:string):void}) {
 return <LegacyTriggerTargetDialog {...props}/>;
}
function LegacyTriggerTargetDialog({targetId,onClose,onStarted}:{targetId:string;onClose():void;onStarted?(id:string):void}) {
 const projectId=useCurrentProjectId();const {state,setState}=useWorkbench();
 const [registry,setRegistry]=useState<{providers:Array<{id:string;name:string;instances:Array<{id:string;name:string;enabled:boolean;address:string}>}>}>({providers:[]});
 useEffect(()=>{let active=true;executionApi<typeof registry>(projectId,'guardrail-instances').then(r=>{if(active)setRegistry(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectId]);
 const [config,setConfig]=useState<TargetRunConfig|null>(null);
 const [selected,setSelected]=useState<Selection[]>([]);
 const [uploadRows,setUploadRows]=useState<Record<string,RunUpload|null>>({});
 const [groupMode,setGroupMode]=useState(false);
 const [single,setSingle]=useState<RunSettings>({concurrency:'',provider:'',guardrail:''});
 const [comparison,setComparison]=useState<ComparisonRow[]>([]);
 const [reviewing,setReviewing]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submitted=useRef(false),key=useRef(crypto.randomUUID());
 const ready=useCallback((id:string,value:RunUpload|null)=>{
  setUploadRows(rows=>({...rows,[id]:value}));
  key.current=crypto.randomUUID();
 },[]);
 useEffect(()=>{
  let active=true;
  executionApi<TargetRunConfig>(projectId,`targets/${encodeURIComponent(targetId)}/config`).then(c=>{
   if(active){setConfig(c);setSingle(s=>({...s,concurrency:String(c.concurrency??1)}));setSelected(c.datasets ?? [{dataset_id:c.dataset_id,dataset_version:c.dataset_version}]);}
  }).catch(e=>{if(active)setError(e.status===404?'Configure this evaluation before triggering a run.':e.message);});
  return()=>{active=false;};
 },[projectId,targetId]);
 const target=state.targets.find(t=>t.id===targetId);
 const uploadRequired=config?.data_source==='upload';
 const datasets=selected.map(selection=>{
  const dataset=state.datasets.find(d=>d.id===selection.dataset_id);
  const version=dataset?.versions.find(v=>v.version===selection.dataset_version);
  const upload=uploadRows[selection.dataset_id];
  return {selection,dataset,version,upload,usingUpload:uploadRequired||upload!==undefined};
 });
 const sampleCount=datasets.reduce((count,row)=>count+(row.usingUpload?row.upload?.row_count??0:row.version?.rows.length??0),0);
 const isGuardrail=config?.execution_mode==='guardrail';
 const settings=groupMode?comparison:[single];
 const concurrencies=settings.map(s=>Number(s.concurrency));
 const endpointFor=(row:RunSettings)=>registry.providers.find(p=>p.id===row.provider)?.instances.find(i=>i.id===row.guardrail&&i.enabled);
 const canReview=!!config&&settings.every(s=>(!isGuardrail||endpointFor(s))&&/^\d+$/.test(s.concurrency)&&Number.isSafeInteger(Number(s.concurrency))&&Number(s.concurrency)>=1)&&
  (!groupMode||(comparison.length>=2&&new Set(concurrencies).size===comparison.length));
 const canRun=canReview&&sampleCount<=10000&&datasets.length>0&&datasets.every(row=>
  row.usingUpload ? row.version&&row.upload : row.version?.rows.length);
 async function run() {
   if(submitted.current||!reviewing||!config||!canRun)return;submitted.current=true;setBusy(true);setError('');
   const runKey=key.current;
   try{
    const targetPath=`targets/${encodeURIComponent(targetId)}`;
    const shared={config_revision:config.revision,datasets:datasets.map(({selection,upload})=>
     upload?{...selection,upload_id:upload.id}:selection)};
    const connection=(row:RunSettings)=>({provider:row.provider,guardrail_id:row.guardrail});
    const headers={'Content-Type':'application/json','Idempotency-Key':runKey};
    const started=groupMode
     ?(await executionApi<{items:RemoteRun[]}>(projectId,`${targetPath}/run-comparison`,{
       method:'POST',headers,body:JSON.stringify({...shared,group_id:runKey,levels:concurrencies,...(isGuardrail?{endpoints:comparison.map(connection)}:{})}),
      })).items
     :[await executionApi<RemoteRun>(projectId,`${targetPath}/runs`,{
       method:'POST',headers,body:JSON.stringify({...shared,concurrency:concurrencies[0],...(isGuardrail?connection(single):{})}),
      })];
    setState(s=>({...s,evaluations:[...started.map(fromRemote),...s.evaluations.filter(e=>!started.some(run=>run.id===e.id))]}));
    onClose();onStarted?.(groupMode?runKey:started[0].id);
   }catch(e){setError((e as Error).message);submitted.current=false;}finally{setBusy(false);}
 }
 function setComparisonMode(enabled:boolean) {
  if(enabled&&!comparison.length){
   setComparison([
    {...single,id:crypto.randomUUID()},
    {...single,id:crypto.randomUUID(),concurrency:Number(single.concurrency)===1?'4':'1'},
   ]);
  }
  setGroupMode(enabled);
  key.current=crypto.randomUUID();
 }
 function updateSettings(patch:Partial<RunSettings>){
  setSingle(s=>({...s,...patch}));
  key.current=crypto.randomUUID();
 }
 function updateComparison(id:string, patch:Partial<RunSettings>) {
  setComparison(rows=>rows.map(row=>row.id===id?{...row,...patch}:row));
  key.current=crypto.randomUUID();
 }
 function endpointFields(row:RunSettings, update:(patch:Partial<RunSettings>)=>void) {
  if (!isGuardrail) return null;
  const provider=registry.providers.find(p=>p.id===row.provider);
  return <>
    <Field label="Provider *"><Select className="!h-8" value={row.provider} onChange={e=>update({provider:e.target.value,guardrail:''})}>
     <option value="">Select provider</option>
     {registry.providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </Select></Field>
    <Field label="Guardrail endpoint *"><Select className="!h-8" disabled={!provider} value={row.guardrail}
     title={endpointFor(row)?.address} onChange={e=>update({guardrail:e.target.value})}>
     <option value="">Select endpoint</option>
     {provider?.instances.map(i=><option key={i.id} value={i.id} disabled={!i.enabled}>{i.name||i.id} · {i.id}{!i.enabled?' (disabled)':''}</option>)}
    </Select></Field>
 </>;
 }
 return <Modal title="Trigger evaluation" description={`Set run options for ${target?.name??targetId}, then confirm its configured datasets.`} onClose={onClose} footer={<>
  <ErrorText message={error}/>
  <div className="flex justify-end gap-2">
   <Button variant="outline" onClick={onClose}>Cancel</Button>
   {reviewing ? <>
    <Button variant="outline" disabled={busy} onClick={()=>setReviewing(false)}>Back</Button>
    <Button key="run" disabled={busy||!canRun} onClick={run}>{busy?'Starting…':groupMode?'Run comparison group':'Run evaluation'}</Button>
   </> : <Button key="review" disabled={!canReview} onClick={()=>setReviewing(true)}>Review datasets</Button>}
  </div></>}>
  <ol aria-label="Trigger steps" className="grid grid-cols-2 gap-2 text-sm">
   {['Run settings','Confirm datasets'].map((label,index)=>{
    const active=index===Number(reviewing);
    return <li key={label} aria-current={active?'step':undefined} className={`border-b-2 pb-2 ${active?'border-primary font-medium text-primary':'border-muted text-muted-foreground'}`}>{index+1} · {label}</li>;
   })}
  </ol>
  {config&&<div className="rounded border bg-muted/20 p-3 text-xs">Evaluation: {target?.name??targetId} · v{config.version??target?.version} · Environment: {state.environments.find(e=>e.id===config.environment_id)?.versions.find(v=>v.version===config.environment_version)?.name??config.environment_id} · v{config.environment_version}</div>}
  {!reviewing&&config&&<fieldset disabled={busy} className="space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <label className="flex items-center gap-2 text-sm font-medium">
     <input type="checkbox" checked={groupMode} onChange={e=>setComparisonMode(e.target.checked)}/> Compare concurrency levels
    </label>
    <span className="text-xs text-muted-foreground">{groupMode?'2–8 runs · distinct positive levels':`Default ${config.concurrency??1} · minimum 1`}</span>
   </div>
   {groupMode?<div className="space-y-2">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
     <span className="text-sm font-medium">Case concurrency</span>
     <span className="text-xs text-muted-foreground">Runs execute concurrently.</span>
    </div>
    <ol className="space-y-2">
     {comparison.map((row,index)=><li key={row.id}>
      <div role="group" aria-label={`Run ${index+1}`} className="grid items-end gap-2 rounded-md border bg-muted/20 px-3 py-2 sm:grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)_minmax(0,2fr)_auto]">
       <Field label={`Run ${index+1} concurrency`}>
        <Input aria-label="Case concurrency" className="h-8" value={row.concurrency} inputMode="numeric"
         onChange={e=>updateComparison(row.id,{concurrency:e.target.value})}/>
       </Field>
       {endpointFields(row,patch=>updateComparison(row.id,patch))}
       {comparison.length>2&&<Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive"
        aria-label={`Remove run ${index+1}`} title={`Remove run ${index+1}`}
        onClick={()=>{
         setComparison(rows=>rows.filter(r=>r.id!==row.id));
         key.current=crypto.randomUUID();
        }}><X aria-hidden="true"/></Button>}
      </div>
     </li>)}
    </ol>
    {isGuardrail && new Set(comparison.filter(row=>endpointFor(row)).map(row=>endpointFor(row)?.address)).size <
      comparison.filter(row=>endpointFor(row)).length &&
      <p className="text-xs text-muted-foreground">Runs sharing an endpoint send requests at the same time. Latency reflects the combined load.</p>}
    <Button variant="outline" size="xs" disabled={comparison.length>=8} onClick={()=>{
     setComparison(rows=>[...rows,{...single,id:crypto.randomUUID(),concurrency:''}]);
     key.current=crypto.randomUUID();
    }}><Plus aria-hidden="true"/> Add run</Button>
   </div>:<>
    <div className={`grid items-end gap-3 ${isGuardrail?'sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]':'sm:grid-cols-[7rem]'}`}>
     <Field label="Case concurrency"><Input className="h-8" value={single.concurrency} inputMode="numeric"
      onChange={e=>updateSettings({concurrency:e.target.value})}/></Field>
     {endpointFields(single,updateSettings)}
    </div>
    {endpointFor(single)&&<p className="break-all text-xs text-muted-foreground">{endpointFor(single)?.address}</p>}
   </>}
  </fieldset>}
  <div hidden={!reviewing}>
  <fieldset disabled={busy||!config} className="space-y-2">
   <legend className="mb-1 text-sm font-medium">Datasets · {datasets.length}</legend>
   <p className="text-xs text-muted-foreground">{uploadRequired?'Upload a file for each pinned dataset.':'Use published rows or upload CSV/XLSX.'} {groupMode&&'All runs in this group use the same cases.'} · {sampleCount.toLocaleString()} samples</p>
   {sampleCount>10000&&<ErrorText message="A run supports up to 10,000 samples across all datasets."/>}
   <div className="overflow-x-auto rounded-md border">
    <table className="w-full border-collapse text-left text-xs [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_td]:px-3 [&_td]:py-1.5">
     <thead className="bg-muted/40 text-muted-foreground"><tr><th>Dataset</th><th>Scorer</th><th>Rows</th><th>Source</th></tr></thead>
     <tbody>{datasets.map(({selection,dataset,version,upload,usingUpload})=>{
      const id=selection.dataset_id;
      const name=version?.name??dataset?.draft.name??id;
      const duplicateName=datasets.some(row=>row.selection.dataset_id!==id&&(row.version?.name??row.dataset?.draft.name)===name);
      const binding=config?.guardrail_bindings?.find(b=>b.dataset_id===id&&b.dataset_version===selection.dataset_version);
      const scorerName=(scorerId:string)=>state.scorers.find(s=>s.id===scorerId)?.draft.name??scorerId;
      const scorers=binding?`${scorerName(binding.scorer_id)} · v${binding.scorer_version}`:
       (config?.scorer_selection==='dataset'?version?.scorerIds:config?.scorer_ids)?.map(scorerName).join(', ');
      return <Fragment key={id}>
       <tr className="border-t">
        <th scope="row" title={version?.objective}>{name} <span className="whitespace-nowrap text-muted-foreground">· v{selection.dataset_version}</span>
         {duplicateName&&<span className="block font-mono text-[10px] text-muted-foreground">{id}</span>}</th>
        {version?<><td title={binding?.aspect_name}>{scorers||'—'}</td>
         <td className="tabular-nums">{usingUpload?upload?.row_count??'—':version.rows.length}</td>
         <td className="whitespace-nowrap">{usingUpload?
          <><span>{upload?'Uploaded':'Upload required'}</span>{!uploadRequired&&<Button size="sm" variant="ghost" onClick={()=>{
           setUploadRows(rows=>{const next={...rows};delete next[id];return next;});
           key.current=crypto.randomUUID();
          }}>Use published</Button>}</>:
          <><span className="text-muted-foreground">Published</span><Button size="sm" variant="ghost" aria-label={`Upload CSV or Excel for ${name}${duplicateName?` (${id})`:''}`} onClick={()=>ready(id,null)}>Upload</Button></>}
         </td></>:<td colSpan={3}><p role="alert">Pinned version unavailable. Update the Evaluation configuration.</p></td>}
       </tr>
       {config&&version&&(uploadRequired||uploadRows[id]!==undefined)&&<tr>
        <td colSpan={4} className="border-t !p-0"><DatasetUpload projectId={projectId} selection={selection} schema={version}
         config={{targetId,revision:config.revision}} labelMapping={binding?.label_mapping??version.guardrail?.label_mapping} onReady={ready}/></td>
       </tr>}
      </Fragment>;
     })}</tbody>
    </table>
   </div>
   {!datasets.length&&<p>No datasets configured. Save Target configuration first.</p>}
  </fieldset>
  </div>
 </Modal>;
}
