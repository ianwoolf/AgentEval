import {useRef,useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {useWorkbench} from './provider';
import {executionApi,fromRemote,type RemoteRun} from './remote';
import {Button,ErrorText,Field,Input,Modal,Select,Table} from './ui';

export function GuardrailTrigger({targetId,onClose,onStarted}:{targetId:string;onClose():void;onStarted?(id:string):void}){
 const project=useCurrentProjectId(),{state,setState}=useWorkbench();
 const datasets=state.datasets.filter(d=>d.versions.some(v=>v.evaluation_type==='guardrail'));
 const envs=state.environments.flatMap(e=>e.versions.filter(v=>v.modelId==='none').map(v=>({id:e.id,version:v.version,name:v.name})));
 const [target,setTarget]=useState(targetId),[environment,setEnvironment]=useState(envs.length?`${envs[0].id}:${envs[0].version}`:'');
 const [selected,setSelected]=useState<Record<string,number>>(()=>Object.fromEntries(datasets.slice(0,20).map(d=>[d.id,d.versions.filter(v=>v.evaluation_type==='guardrail').at(-1)!.version])));
 const [search,setSearch]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const key=useRef(crypto.randomUUID());
 const change=()=>{key.current=crypto.randomUUID();};
 const refs=Object.entries(selected).map(([dataset_id,dataset_version])=>({dataset_id,dataset_version}));
 const valid=refs.length>0&&refs.length<=20&&!!environment&&refs.every(r=>datasets.find(d=>d.id===r.dataset_id)?.versions.find(v=>v.version===r.dataset_version)?.guardrail);
 async function run(){if(busy||!valid)return;setBusy(true);setError('');try{
  const env=envs.find(e=>`${e.id}:${e.version}`===environment)!;
  const result=await executionApi<RemoteRun>(project,'guardrail-runs',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify({name,target_id:target,datasets:refs,environment_id:env.id,environment_version:env.version})});
  setState(s=>({...s,evaluations:[fromRemote(result),...s.evaluations.filter(e=>e.id!==result.id)]}));onClose();onStarted?.(result.id);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Modal title="Run Guardrail evaluation" description="Select datasets with their published scorer and aspect. Inputs go directly to the Guardrail." onClose={onClose} footer={<><ErrorText message={error}/><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{refs.length} datasets · Model: None</span><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!valid||busy} onClick={run}>{busy?'Starting…':'Run evaluation'}</Button></div></div></>}>
 <div className="grid gap-3 sm:grid-cols-2"><Field label="Guardrail target"><Select disabled={busy} value={target} onChange={e=>{setTarget(e.target.value);change();}}>{state.targets.filter(t=>t.kind==='GUARDRAIL').map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</Select></Field><Field label="Execution environment"><Select disabled={busy} value={environment} onChange={e=>{setEnvironment(e.target.value);change();}}><option value="">Select environment</option>{envs.map(e=><option key={`${e.id}:${e.version}`} value={`${e.id}:${e.version}`}>{e.name} · v{e.version}</option>)}</Select></Field></div>
 <Field label="Evaluation name (optional)"><Input disabled={busy} value={name} onChange={e=>{setName(e.target.value);change();}}/></Field>
 <Input aria-label="Search Guardrail datasets" placeholder="Search datasets…" value={search} onChange={e=>setSearch(e.target.value)}/>
 <Table><thead><tr><th>Dataset</th><th>Version</th><th>Default scorer</th><th>Aspect</th><th>Samples</th></tr></thead><tbody>{datasets.filter(d=>d.draft.name.toLowerCase().includes(search.toLowerCase())).map(d=>{const versions=d.versions.filter(v=>v.evaluation_type==='guardrail');const v=versions.find(v=>v.version===selected[d.id])??versions.at(-1)!;return <tr key={d.id}><td><label className="flex items-center gap-2"><input type="checkbox" checked={d.id in selected} disabled={busy||(!(d.id in selected)&&refs.length>=20)} onChange={e=>{setSelected(s=>{const next={...s};if(e.target.checked)next[d.id]=v.version;else delete next[d.id];return next;});change();}}/>{v.name}</label></td><td><Select aria-label={`${v.name} version`} value={v.version} disabled={busy||!(d.id in selected)} onChange={e=>{setSelected(s=>({...s,[d.id]:Number(e.target.value)}));change();}}>{versions.map(v=><option key={v.version} value={v.version}>v{v.version}</option>)}</Select></td><td>{v.guardrail?.scorer_id} · v{v.guardrail?.scorer_version}</td><td>{v.guardrail?.aspect_name}</td><td>{v.rows.length}</td></tr>;})}</tbody></Table>
 {!datasets.length&&<p className="text-sm">No published Guardrail datasets available.</p>}
 </Modal>;
}
