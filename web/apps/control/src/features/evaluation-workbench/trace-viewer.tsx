import {useEffect,useMemo,useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionPages} from './remote';
import {Button,ErrorText,Input,JsonPreview,Select} from './ui';

type Attr={key:string;value:{stringValue?:string;intValue?:string;doubleValue?:number;boolValue?:boolean}};
type Span={traceId:string;spanId:string;parentSpanId?:string;name?:string;startTimeUnixNano:string;endTimeUnixNano:string;attributes?:Attr[];status?:{code?:string|number;message?:string};events?:unknown[]};
type Record={id:string;sample_id?:string;data:{span?:Span;resource?:{attributes?:Attr[]}}};
const attrs=(values:Attr[]=[])=>Object.fromEntries(values.map(a=>[a.key,a.value.stringValue??a.value.intValue??a.value.doubleValue??a.value.boolValue]));
const time=(s:Span)=>Number(s.startTimeUnixNano)/1e6;
const duration=(s:Span)=>Math.max(0,(Number(s.endTimeUnixNano)-Number(s.startTimeUnixNano))/1e6);
const failed=(s:Span)=>s.status?.code===2||s.status?.code==='STATUS_CODE_ERROR';
const pretty=(value:unknown)=>{if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{return value;}};

export function TraceViewer({evaluationId,running}:{evaluationId:string;running:boolean}) {
 const project=useCurrentProjectId();
 const [records,setRecords]=useState<Record[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [traceId,setTraceId]=useState(''),[spanId,setSpanId]=useState(''),[search,setSearch]=useState(''),[errorsOnly,setErrorsOnly]=useState(false),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;
  async function refresh(){try{const rows=await executionPages<Record>(project,`traces?evaluation_id=${encodeURIComponent(evaluationId)}`);if(active){setRecords(rows.filter(r=>r.data?.span));setError('');}}catch(e){if(active)setError((e as Error).message);}finally{if(active){setLoading(false);if(running)timer=setTimeout(refresh,3000);}}}
  setLoading(true);setRecords([]);setTraceId('');setSpanId('');void refresh();return()=>{active=false;clearTimeout(timer);};
 },[project,evaluationId,running]);
 const groups=useMemo(()=>{const map=new Map<string,Record[]>();for(const r of records){const id=r.data.span!.traceId;map.set(id,[...(map.get(id)??[]),r]);}return [...map.entries()].sort((a,b)=>time(a[1][0].data.span!)-time(b[1][0].data.span!));},[records]);
 const current=groups.find(([id])=>id===traceId)??groups[0];
 const spans=(current?.[1]??[]).map(r=>r.data.span!);
 const start=Math.min(...spans.map(time)),total=Math.max(0.01,...spans.map(s=>time(s)+duration(s)-start));
 const selected=spans.find(s=>s.spanId===spanId)??spans.find(s=>!s.parentSpanId)??spans[0];
 const properties=selected?attrs(selected.attributes):{};
 const flattened:{span:Span;depth:number}[]=[];const visited=new Set<string>();
 function visit(s:Span,depth:number){if(visited.has(s.spanId)||depth>30)return;visited.add(s.spanId);flattened.push({span:s,depth});if(!collapsed.has(s.spanId))for(const child of spans.filter(c=>c.parentSpanId===s.spanId).sort((a,b)=>time(a)-time(b)))visit(child,depth+1);}
 for(const s of spans.filter(s=>!spans.some(p=>p.spanId===s.parentSpanId)).sort((a,b)=>time(a)-time(b)))visit(s,0);
 const visible=flattened.filter(({span:s})=>(!errorsOnly||failed(s))&&`${s.name} ${s.spanId}`.toLowerCase().includes(search.toLowerCase()));
 if(loading)return <p className="text-sm text-muted-foreground">Loading traces…</p>;
 return <section aria-label="Trace explorer" className="space-y-3">
  <ErrorText message={error}/>
  {!groups.length?<div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{running?'Waiting for spans from the collector…':'No OpenTelemetry spans were recorded for this evaluation. Enable a trace collector and run a new evaluation. Historical sample details remain available in Overview.'}</div>:<>
   <div className="flex flex-wrap items-center gap-3"><Select aria-label="Select request trace" value={current![0]} onChange={e=>{setTraceId(e.target.value);setSpanId('');setCollapsed(new Set());}}>{groups.map(([id,rows])=>{const root=rows.find(r=>!r.data.span!.parentSpanId)??rows[0];return <option key={id} value={id}>{root.sample_id??String(attrs(root.data.span!.attributes)['evaluation.sample_id']??id.slice(0,16))} · {rows.length} spans</option>;})}</Select><span className="text-xs text-muted-foreground">{groups.length} traces · {spans.length} spans · {total.toFixed(2)} ms · {spans.filter(failed).length} errors</span></div>
   <p className="break-all font-mono text-xs text-muted-foreground">Trace ID: {current![0]}</p>
   <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
    <div className="overflow-hidden rounded-lg border"><div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 p-2"><Input aria-label="Search spans" placeholder="Find operation or span ID…" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs"/><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={errorsOnly} onChange={e=>setErrorsOnly(e.target.checked)}/>Errors only</label></div>
     <div className="grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)] border-b px-3 py-2 text-xs text-muted-foreground"><span>Operation</span><div className="flex justify-between"><span>0 ms</span><span>{(total/2).toFixed(1)}</span><span>{total.toFixed(1)} ms</span></div></div>
     <div className="max-h-[520px] overflow-auto">{visible.map(({span:s,depth})=><div key={s.spanId} className={`grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)] items-center border-b px-3 py-2 text-xs ${selected?.spanId===s.spanId?'bg-primary/10':'hover:bg-muted/30'}`}>
       <div className="flex min-w-0 items-center gap-1" style={{paddingLeft:Math.min(depth,8)*12}}>{spans.some(c=>c.parentSpanId===s.spanId)?<button aria-label={`${collapsed.has(s.spanId)?'Expand':'Collapse'} ${s.name}`} onClick={()=>setCollapsed(prev=>{const next=new Set(prev);next.has(s.spanId)?next.delete(s.spanId):next.add(s.spanId);return next;})}>{collapsed.has(s.spanId)?'▸':'▾'}</button>:<span className="w-2"/>}<button className={`truncate text-left font-medium ${failed(s)?'text-red-600':''}`} title={s.name} onClick={()=>setSpanId(s.spanId)}>{s.name??'Span'}</button></div>
       <button aria-label={`Inspect ${s.name} ${duration(s).toFixed(2)} ms`} className="relative h-7 border-l border-dashed text-right" onClick={()=>setSpanId(s.spanId)}><span className={`absolute inset-y-1 rounded-sm ${failed(s)?'bg-red-500/70':s.name?.startsWith('guardrail')?'bg-teal-500/70':s.name?.startsWith('git')?'bg-amber-500/70':'bg-primary/60'}`} style={{left:`${Math.max(0,(time(s)-start)/total*100)}%`,width:`${Math.min(100,Math.max(.5,duration(s)/total*100))}%`}}/><span className="relative rounded bg-background/85 px-1 text-[10px]">{duration(s).toFixed(2)} ms</span></button>
      </div>)}{!visible.length&&<p className="p-4 text-xs text-muted-foreground">No spans match these filters.</p>}</div>
    </div>
    {selected&&<div className="max-h-[620px] space-y-3 overflow-auto rounded-lg border p-3"><div className="flex justify-between gap-2"><h3 className="font-semibold">{selected.name??'Span details'}</h3><span className={`text-xs ${failed(selected)?'text-red-600':'text-muted-foreground'}`}>{failed(selected)?'Error':'No error'}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><div>Duration<br/><strong>{duration(selected).toFixed(2)} ms</strong></div><div>Start offset<br/><strong>{(time(selected)-start).toFixed(2)} ms</strong></div><div>Cost<br/><strong>{properties['evaluation.cost.amount']===undefined?'—':`${properties['evaluation.cost.amount']} ${properties['evaluation.cost.currency']??'USD'} (${properties['evaluation.cost.source']??'unknown'})`}</strong></div><div>HTTP status<br/><strong>{String(properties['http.response.status_code']??'—')}</strong></div></div><p className="break-all font-mono text-[10px]">Span: {selected.spanId}<br/>Parent: {selected.parentSpanId||'Root'}</p>
      {(['input','output','reference'] as const).map(kind=>properties[`evaluation.${kind}`]!==undefined&&<details key={kind} open><summary className="cursor-pointer text-sm font-medium">{kind==='input'?'Request input':kind==='output'?'Response output':'Reference'}{properties[`evaluation.${kind}.truncated`]?' (truncated)':''}</summary><JsonPreview value={pretty(properties[`evaluation.${kind}`])}/></details>)}
      {selected.status?.message&&<p className="text-xs text-red-600">{selected.status.message}</p>}
      <details><summary className="cursor-pointer text-sm">Attributes</summary><JsonPreview value={properties}/></details><details><summary className="cursor-pointer text-sm">Events</summary><JsonPreview value={selected.events??[]}/></details>
     </div>}
   </div>
  </>}
 </section>;
}
