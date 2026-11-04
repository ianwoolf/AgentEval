import {GuardrailScoreDashboard,type GuardrailSummary} from "./guardrail-score-dashboard";
import {useEffect, useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionApi, executionPages} from './remote';
import {Button, ErrorText, JsonPreview, Select, Table} from './ui';

interface BindingResult {
  binding_id:string; aspect_name:string; dataset_id:string; dataset_version:number;
  scorer_id:string; scorer_version:number; TP:number; FP:number; TN:number; FN:number;
  errors:number; processed:number; pending:number; f1:number|null; precision:number|null;
  recall:number|null; coverage:number|null; latency:{average_ms:number|null;p95_ms:number|null};
  cost:{amount:number;currency:string;source:'mock'};
}
interface RequestEvidence {
  id:string; input:unknown; output:unknown; reference:unknown; error?:string;
  guardrail_result?:{request_id:string; binding_ids:string[]; strategy:string; label:string;
    status:string; http_status?:number; guardrail_latency_ms:number; scorer_latency_ms:number;
    total_latency_ms:number; error_stage?:string; error_code?:string;
    cost:{amount:number;source:string}; classifications:{binding_id:string;outcome:string;reason:string}[]};
}
const percent=(value:number|null)=>value==null?'—':`${(value*100).toFixed(1)}%`;

export function GuardrailReport({evaluationId,running}:{evaluationId:string;running:boolean}) {
  const project=useCurrentProjectId();
  const [reportSummary,setReportSummary]=useState<GuardrailSummary>({});
  const [bindings,setBindings]=useState<BindingResult[]>([]),[requests,setRequests]=useState<RequestEvidence[]>([]);
  const [binding,setBinding]=useState('ALL'),[outcome,setOutcome]=useState('ALL'),[strategy,setStrategy]=useState('ALL');
  const [detail,setDetail]=useState<RequestEvidence|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;let timer:ReturnType<typeof setTimeout>;
    async function refresh(){
      try {
        const report=await executionApi<GuardrailSummary & {binding_results?:BindingResult[]}>(project,`reports/${encodeURIComponent(evaluationId)}?limit=1`);
        if(!active)return;
        setReportSummary(report);
        setBindings(report.binding_results??[]);
        if(report.binding_results?.length){
          const rows=await executionPages<RequestEvidence>(project,`experiments/${encodeURIComponent(evaluationId)}/samples`);
          if(active)setRequests(rows.filter(r=>r.guardrail_result));
        }
        if(active)setError('');
      }catch(e){if(active&&(e as {status?:number}).status!==404)setError((e as Error).message);}
      finally{if(active&&running)timer=setTimeout(refresh,3000);}
    }
    void refresh();return()=>{active=false;clearTimeout(timer);};
  },[project,evaluationId,running]);
  if(!bindings.length)return error?<ErrorText message={error}/>:null;
  const visible=requests.filter(r=>{
    const g=r.guardrail_result!;
    return (binding==='ALL'||g.binding_ids.includes(binding))&&(strategy==='ALL'||g.strategy===strategy)&&
      (outcome==='ALL'||(outcome==='ERROR'?g.status==='ERROR':g.classifications.some(c=>(binding==='ALL'||c.binding_id===binding)&&c.outcome===outcome)));
  });
  return <section className="space-y-3" aria-label="Guardrail results">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Guardrail aspects</h2><span className="text-xs text-muted-foreground">{running?'Provisional results · ':''}Cost is mock · Positive means unsafe</span></div>
    <ErrorText message={error}/>
    <GuardrailScoreDashboard report={reportSummary} evaluationId={evaluationId}/>
    <details className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-xs font-medium">Aspect breakdown · {bindings.length} bindings</summary><div className="mt-2"><Table><thead><tr><th>Aspect / dataset</th><th>Scorer</th><th>Progress</th><th>TP</th><th>FP</th><th>TN</th><th>FN</th><th>Errors</th><th>F1</th><th>P95</th><th>Cost (mock)</th></tr></thead>
      <tbody>{bindings.map(b=><tr key={b.binding_id}><td><Button variant="link" onClick={()=>setBinding(b.binding_id)}>{b.aspect_name}</Button><p className="text-xs text-muted-foreground">{b.dataset_id} · v{b.dataset_version}</p></td><td>{b.scorer_id} · v{b.scorer_version}</td><td>{b.processed}/{b.processed+b.pending}</td><td>{b.TP}</td><td>{b.FP}</td><td>{b.TN}</td><td>{b.FN}</td><td>{b.errors}</td><td>{percent(b.f1)}</td><td>{b.latency.p95_ms==null?'—':`${b.latency.p95_ms.toFixed(1)} ms`}</td><td>${b.cost.amount.toFixed(4)}</td></tr>)}</tbody>
    </Table></div></details>
    <div className="flex flex-wrap gap-2">
      <Select aria-label="Guardrail aspect" value={binding} onChange={e=>setBinding(e.target.value)}><option value="ALL">All aspects</option>{bindings.map(b=><option key={b.binding_id} value={b.binding_id}>{b.aspect_name} · {b.dataset_id}</option>)}</Select>
      <Select aria-label="Classification" value={outcome} onChange={e=>setOutcome(e.target.value)}>{['ALL','TP','FP','TN','FN','ERROR'].map(v=><option key={v} value={v}>{v==='ALL'?'All outcomes':v}</option>)}</Select>
      <Select aria-label="Strategy" value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="ALL">All strategies</option>{[...new Set(requests.map(r=>r.guardrail_result!.strategy))].map(s=><option key={s} value={s}>{s||'Unspecified'}</option>)}</Select>
      <span className="self-center text-xs text-muted-foreground">{visible.length} requests</span>
    </div>
    <Table><thead><tr><th>Request</th><th>Strategy</th><th>Outcome</th><th>HTTP</th><th>Latency</th><th/></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td className="font-mono text-xs">{r.id}</td><td>{r.guardrail_result!.strategy||'Unspecified'}</td><td>{r.guardrail_result!.status==='ERROR'?'ERROR':r.guardrail_result!.classifications.map(c=>c.outcome).join(', ')}</td><td>{r.guardrail_result!.http_status??'—'}</td><td>{r.guardrail_result!.guardrail_latency_ms.toFixed(1)} ms</td><td><Button variant="link" onClick={()=>setDetail(r)}>Details</Button></td></tr>)}</tbody></Table>
    {detail&&<aside role="dialog" aria-modal="true" aria-label="Guardrail request details" className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-auto border-l bg-background p-5 shadow-xl">
      <div className="flex justify-between"><h3 className="font-semibold">Request details</h3><Button variant="ghost" onClick={()=>setDetail(null)}>Close</Button></div>
      <p className="my-2 text-xs">{detail.id} · {detail.guardrail_result!.status}</p>
      <dl className="grid grid-cols-3 gap-2 text-xs"><div>Guardrail<br/>{detail.guardrail_result!.guardrail_latency_ms.toFixed(1)} ms</div><div>Scorer<br/>{detail.guardrail_result!.scorer_latency_ms.toFixed(1)} ms</div><div>Cost (mock)<br/>${detail.guardrail_result!.cost.amount.toFixed(4)}</div></dl>
      {detail.error&&<ErrorText message={detail.error}/>}
      <h4 className="mt-4 text-sm font-medium">Input</h4><JsonPreview value={detail.input}/>
      <h4 className="mt-4 text-sm font-medium">Reference</h4><JsonPreview value={detail.reference}/>
      <h4 className="mt-4 text-sm font-medium">Guardrail response</h4><JsonPreview value={detail.output}/>
      <h4 className="mt-4 text-sm font-medium">Classification</h4><JsonPreview value={detail.guardrail_result}/>
    </aside>}
  </section>;
}
