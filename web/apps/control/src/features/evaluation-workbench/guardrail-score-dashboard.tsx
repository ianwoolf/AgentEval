import {createPortal} from 'react-dom';
import {useEffect,useId,useState} from 'react';
import {useCurrentProjectId} from '@/hooks/use-project';
import {executionApi} from './remote';
import type {Evaluation} from './contracts';
import {Button,ErrorText,Select,Table} from './ui';
export type Metric='precision'|'recall'|'accuracy'|'f1';
export const metrics:Metric[]=['precision','recall','accuracy','f1'];
const labels={precision:'Precision',recall:'Recall',accuracy:'Accuracy',f1:'F1 score'};
const colors=['#6366f1','#059669','#d97706','#db2777'];
export interface Scores{TP:number;FP:number;TN:number;FN:number;precision:number|null;recall:number|null;accuracy:number|null;f1:number|null;processed:number;errors:number;pending:number;valid_count:number;latency:{average_ms:number|null;p50_ms:number|null;p95_ms:number|null;count:number}}
export interface DatasetScores extends Scores{dataset_id:string;dataset_version:number;name:string;input_source?:'published'|'upload'}
export interface GuardrailSummary{evaluation_config?:{id:string;version:number};overall?:Scores;dataset_results?:DatasetScores[];status?:string;guardrail?:{type:string;provider:string;id:string;name:string;registry_revision?:string}}
export const scoreText=(v:number|null|undefined)=>v==null?'N/A':`${(v*100).toFixed(1)}%`;
const ms=(v:number|null)=>v==null?'N/A':`${v.toFixed(1)} ms`;
type ReportRole = 'Current' | 'Selected';
type ChartDataset = DatasetScores & {reportRole?: ReportRole};
const comparisonColors={Current:'#1d4ed8',Selected:'#b45309'};
const roleLabels={Current:'A · Current report',Selected:'B · Compared report'};

function ComparisonKey({role}:{role:ReportRole}){
 const color=comparisonColors[role];
 const background=role==='Current'?color:`repeating-linear-gradient(135deg, ${color} 0 3px, white 3px 4px)`;
 return <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
  <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{background,border:`1px solid ${color}`}}/>
  {roleLabels[role]}
 </span>;
}

function VerticalScoreBars({datasets,selected,reportRole}:{datasets:ChartDataset[];selected:Metric[];reportRole?:ReportRole}){
 const patternId=useId();
 const paired=datasets.some(d=>d.reportRole==='Selected');
 const width=1100,height=280,left=44,right=12,top=32,bottom=94;
 const plotHeight=height-top-bottom,band=(width-left-right)/selected.length;
 const datasetCount=paired?datasets.length/2:datasets.length;
 const slot=(band-18)/Math.max(1,datasetCount);
 const barWidth=Math.min(16,slot*(paired ? .39 : .65));
 const shortName=(value:string)=>value.length>17?value.slice(0,16)+'…':value;
 return <div className="w-full min-w-0">
  {paired&&<div aria-label="Chart legend" className="flex flex-wrap gap-x-5 gap-y-1 pb-1">
   <ComparisonKey role="Current"/><ComparisonKey role="Selected"/>
  </div>}
  <svg role="img" aria-label="Dataset score comparison" viewBox={`0 0 ${width} ${height}`} className="w-full" style={{maxHeight:280}}>
   <title>{paired?'Scores grouped by metric, with two bars per dataset':'Scores grouped by metric'}</title>
   {(paired||reportRole==='Selected')&&<defs>
    <pattern id={patternId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
     <rect width="5" height="5" fill={comparisonColors.Selected}/>
     <path d="M0 0V5" stroke="white" strokeWidth="2"/>
    </pattern>
   </defs>}
   {[0,25,50,75,100].map(t=>{
    const y=top+plotHeight*(1-t/100);
    return <g key={t}><line x1={left} x2={width-right} y1={y} y2={y} stroke="currentColor" opacity=".12"/>
     <text x={left-8} y={y+4} textAnchor="end" fill="currentColor" fontSize="11">{t}%</text></g>;
   })}
   {selected.map((m,mi)=><g key={m} data-score-group={m}>
    <text x={left+band*(mi+.5)} y={16} textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="600">{labels[m]}</text>
    {datasets.map((d,di)=>{
     const role=d.reportRole??reportRole;
     const stripe=role==='Selected';
     const center=left+band*(mi+.5)+(Math.floor(di/(paired?2:1))+.5-datasetCount/2)*slot;
     const barCenter=paired?center+(stripe?1:-1)*(barWidth/2+slot*.04):center;
     const value=d[m],h=value==null?0:plotHeight*Math.max(0,Math.min(1,value)),y=top+plotHeight-h;
     const fill=stripe?`url(#${patternId})`:role?comparisonColors[role]:colors[di]??`hsl(${(di*137.508)%360} 65% 45%)`;
     const datasetName=`${d.name} · v${d.dataset_version}`;
     return <g key={`${d.dataset_id}:${role??'Current'}`}>
      <rect data-report={role??'Current'} data-dataset={d.dataset_id} data-metric={m} x={barCenter-barWidth/2} y={y}
       width={barWidth} height={h} rx="2" fill={fill} stroke={stripe?comparisonColors.Selected:undefined}>
       <title>{role?`${roleLabels[role]} · `:''}{datasetName} · {labels[m]}: {scoreText(value)}</title>
      </rect>
      {(!paired||!stripe)&&<text data-dataset-label={d.dataset_id}
       transform={`translate(${center},${top+plotHeight+14}) rotate(-50)`} textAnchor="end" fill="currentColor" fontSize="11">
       <title>{datasetName} · {d.dataset_id}</title>{shortName(d.name)}
      </text>}
      {datasets.length<=4&&<text x={barCenter} y={value==null?top+plotHeight-7:y-7}
       textAnchor="middle" fill="currentColor" fontSize="11">{scoreText(value)}</text>}
     </g>;
    })}
   </g>)}
  </svg>
 </div>;
}
export function ScoreDiff({current,reference}:{current:number|null;reference:number|null}){
 if(current==null||reference==null)return <span className="text-xs text-muted-foreground">N/A</span>;
 const delta=Math.round((current-reference)*1000)/10;
 return <span data-score-diff={delta} className={`text-xs font-medium tabular-nums ${delta>0?'text-emerald-600':delta<0?'text-red-600':'text-muted-foreground'}`} title="Current minus selected report (percentage points)">{delta>0?'+':''}{delta.toFixed(1)} pp</span>;
}
export function datasetsMatch(current:DatasetScores[],selected:DatasetScores[]){
 if([...current,...selected].some(d=>d.input_source==='upload'))return false;
 const keys=(rows:DatasetScores[])=>rows.map(d=>`${d.dataset_id}:${d.dataset_version}`).sort();
 return current.length===selected.length&&JSON.stringify(keys(current))===JSON.stringify(keys(selected));
}
function EndpointCard({role,endpoint,detail,concurrency}:{
 role:ReportRole;
 endpoint:{provider?:string|undefined;name?:string;id?:string|undefined;registry_revision?:string}|undefined;
 detail?:string|undefined;
 concurrency:number|undefined;
}){
 return <section aria-label={roleLabels[role]} className="min-w-0 space-y-1 rounded-md border px-3 py-2"
  style={{borderTopColor:comparisonColors[role],borderTopWidth:2}}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <ComparisonKey role={role}/>
   <span className="rounded border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
    Concurrency <strong className="tabular-nums text-foreground">{concurrency??'—'}</strong>
   </span>
  </div>
  <p className="break-words text-sm font-semibold">{endpoint?.provider||'Unknown provider'} <span className="text-muted-foreground">/</span> {endpoint?.name||endpoint?.id||'Unknown endpoint'}</p>
  <p className="break-all text-xs text-muted-foreground">Endpoint ID <span className="font-mono text-foreground">{endpoint?.id||'—'}</span>
   {endpoint?.registry_revision&&<> · Registry <span className="font-mono">{endpoint.registry_revision}</span></>}
  </p>
  {detail&&<p className="break-all text-xs text-muted-foreground">{detail}</p>}
 </section>;
}
function LatencyValue({current,reference}:{current:number|null;reference:number|null|undefined}){
 const delta=current==null||reference==null?null:Number((current-reference).toFixed(1));
 return <>
  <span>{ms(current)}</span>
  {reference!==undefined&&<div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
   <span className="text-muted-foreground">B · {ms(reference)}</span>
   {delta!==null&&<span title="A minus B (ms)" className={`font-medium ${delta<0?'text-emerald-600':delta>0?'text-red-600':'text-muted-foreground'}`}>
    {delta>0?'+':''}{ms(delta)}
   </span>}
  </div>}
 </>;
}

function DatasetScoreTable({rows,baselineRows=[],running=false}:{
 rows:DatasetScores[];baselineRows?:DatasetScores[];running?:boolean;
}){
 return <div className="[&_table]:text-xs [&_table_td]:px-2.5 [&_table_td]:py-1.5 [&_table_th]:px-2.5 [&_table_th]:py-1.5">
  <Table>
   <thead><tr>
    <th scope="col" title="Guardrail HTTP requests, including failed calls">Requests</th>
    <th scope="col">Dataset</th>
    {metrics.map(m=><th key={m} scope="col">{labels[m]}</th>)}
    <th scope="col" title="Guardrail HTTP latency includes failed calls and excludes scoring">P50</th>
    <th scope="col" title="Guardrail HTTP latency includes failed calls and excludes scoring">P95</th>
    {running&&<th scope="col">Errors / pending</th>}
   </tr></thead>
   <tbody>{rows.map(d=>{
    const baseline=baselineRows.find(b=>b.dataset_id===d.dataset_id&&b.dataset_version===d.dataset_version);
    return <tr key={d.dataset_id} className="tabular-nums">
     <td>{d.latency.count}</td>
     <td title={d.dataset_id}>{d.name} · v{d.dataset_version}
      {rows.some(other=>other.dataset_id!==d.dataset_id&&other.name===d.name)&&
       <span className="ml-2 font-mono text-[10px] text-muted-foreground">{d.dataset_id}</span>}
      {d.input_source==='upload'&&<span className="ml-1 text-muted-foreground">· Uploaded</span>}
     </td>
     {metrics.map(m=><td key={m}><span>{scoreText(d[m])}</span>{baseline&&
      <div className="mt-0.5 flex items-center gap-1.5">
       <span className="text-[10px] text-muted-foreground">B · {scoreText(baseline[m])}</span>
       <ScoreDiff current={d[m]} reference={baseline[m]}/>
      </div>}
     </td>)}
     {(['p50_ms','p95_ms'] as const).map(key=><td key={key} className="whitespace-nowrap">
      <LatencyValue current={d.latency[key]} reference={baseline?.latency[key]}/>
     </td>)}
     {running&&<td>{d.errors} / {d.pending}</td>}
    </tr>;
   })}</tbody>
  </Table>
 </div>;
}
type ComparisonReport = {id:string;name:string;status:string;guardrail_id?:string;provider?:string;report_id?:string;created_at?:string};
export interface GroupComparison {
 grouped:boolean;
 reportId:string;
 catalog:Evaluation[];
 concurrency:number|undefined;
 selected:string;
 onSelect(id:string):void;
}

function comparisonOptions(choices:ComparisonReport[], group:GroupComparison|undefined){
 if(!group?.grouped)return choices;
 if(group.concurrency===undefined)return [];
 const eligible=new Set(group.catalog.filter(run=>run.remote?.concurrency===group.concurrency)
  .map(run=>run.remote?.experiment_id));
 return choices.filter(choice=>eligible.has(choice.id));
}

export function GuardrailScoreDashboard({report,evaluationId,running=report.status==='RUNNING',groupComparison}:{
 report:GuardrailSummary;evaluationId:string;running?:boolean;groupComparison?:GroupComparison|undefined;
}){
 const project=useCurrentProjectId();const [mode,setMode]=useState('grouped'),[metric,setMetric]=useState<Metric>('f1');
 const [choices,setChoices]=useState<ComparisonReport[]>([]),[singleOther,setSingleOther]=useState('');
 const [compareOpen,setCompareOpen]=useState(false);
 const [comparison,setComparison]=useState<GuardrailSummary|null>(null),[error,setError]=useState(''),[listError,setListError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let active=true;setChoices([]);setSingleOther('');setComparison(null);if(!report.evaluation_config?.id||report.evaluation_config.version==null)return;executionApi<{items:ComparisonReport[]}>(project,`guardrail-reports?config_id=${encodeURIComponent(report.evaluation_config.id)}&config_version=${report.evaluation_config.version}`).then(r=>{if(active)setChoices(r.items.filter(i=>i.id!==evaluationId));}).catch(e=>{if(active)setListError(e.message);});return()=>{active=false;};},[project,evaluationId,report.evaluation_config?.id,report.evaluation_config?.version]);
 const options=comparisonOptions(choices,groupComparison);
 const selectedKey=groupComparison?.grouped?groupComparison.selected:singleOther;
 const referenceGroup=groupComparison?.catalog.find(run=>run.remote?.experiment_id===selectedKey)?.remote?.concurrency_group;
 const peer=referenceGroup&&groupComparison?.catalog.find(run=>
  run.remote?.concurrency_group===referenceGroup&&run.remote?.concurrency===groupComparison?.concurrency);
 const choice=options.find(option=>option.id===selectedKey) ??
  options.find(option=>option.id===(peer&&peer.remote?.experiment_id));
 const other=choice?.id??'';
 const runsByExperiment=new Map(groupComparison?.catalog.map(run=>[run.remote?.experiment_id,run]));
 const reportConcurrency=(id:string)=>{
  const run=runsByExperiment.get(id);
  return run?.remote?.concurrency??run?.snapshot.environment.runner?.concurrency;
 };
 const selectComparison=(id:string)=>{
  if(groupComparison?.grouped)groupComparison.onSelect(id);
  else setSingleOther(id);
  setCompareOpen(false);
 };
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;setComparison(null);setError('');setLoading(!!other);async function refresh(){try{const r=await executionApi<GuardrailSummary>(project,`reports/${encodeURIComponent(other)}?summary_only=true`);if(active){setComparison(r);setLoading(false);if(r.status==='RUNNING')timer=setTimeout(refresh,3000);}}catch(e){if(active){setError((e as Error).message);setLoading(false);}}}if(other)void refresh();return()=>{active=false;clearTimeout(timer);};},[project,other,evaluationId]);
 if(!report.overall)return null;
 const total=report.overall,rows=report.dataset_results??[],identity=report.guardrail;
 const baselineRows=comparison?.dataset_results??[];
 const matched=!!comparison&&datasetsMatch(rows,baselineRows);
 const chartRows:ChartDataset[]=matched?rows.flatMap(d=>[{...d,reportRole:'Current' as const},{...baselineRows.find(b=>b.dataset_id===d.dataset_id&&b.dataset_version===d.dataset_version)!,reportRole:'Selected' as const}]):rows;
 const selectedMetrics=mode==='metric'?[metric]:metrics;
 const controls=<div className="relative">
  <Button variant="outline" aria-expanded={compareOpen} onClick={()=>setCompareOpen(!compareOpen)}>Compare{other?' · 1':''}</Button>
  {compareOpen&&<div className="absolute right-0 z-40 mt-2 w-[min(48rem,85vw)] rounded-lg border bg-background p-2 shadow-lg">
   <p className="mb-2 px-2 text-xs text-muted-foreground">Evaluation {report.evaluation_config?.id} · v{report.evaluation_config?.version}</p>
   {groupComparison?.grouped&&<div className="mb-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
    <p>A · Concurrency {groupComparison.concurrency??'—'} · {identity?.provider||'Unknown provider'} / {identity?.id||'Unknown endpoint'}</p>
    <p className="mt-0.5 break-all font-mono text-muted-foreground">{groupComparison.reportId}</p>
   </div>}
   <div role="listbox" aria-label="Comparison reports" className="max-h-72 overflow-y-auto">
    <button role="option" aria-selected={!other} className="w-full rounded px-2 py-2 text-left text-xs hover:bg-muted"
     onClick={()=>selectComparison('')}>No comparison</button>
    {options.map(c=>{
     const label=`Concurrency ${reportConcurrency(c.id)??'—'} · ${c.provider||'Unknown provider'} / ${c.guardrail_id||'Unknown endpoint'}`;
     const metadata=`${c.report_id??c.id} · ${c.status} · ${c.created_at?new Date(c.created_at).toLocaleString():'Time unavailable'}`;
     return <button key={c.id} role="option" aria-selected={other===c.id} title={`${label} · ${metadata}`}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted" onClick={()=>selectComparison(c.id)}>
      <span className="max-w-[60%] shrink-0 truncate text-xs font-medium">{label}</span>
      <span className="min-w-0 truncate text-[10px] text-muted-foreground">{metadata}</span>
     </button>;
    })}
    {!options.length&&<p className="px-2 py-2 text-xs text-muted-foreground">{groupComparison?.grouped?'No other reports at this concurrency for this Evaluation version.':'No other reports for this Evaluation version.'}</p>}
   </div>
   <ErrorText message={listError}/>
  </div>}
 </div>;
 const header=document.getElementById('guardrail-report-controls');
 return <div className="space-y-3">
 {header?createPortal(controls,header):<div className="flex justify-end">{controls}</div>}
 {other?<section aria-label="Guardrail endpoints" className="space-y-2">
  <h3 className="text-sm font-semibold">Guardrail endpoints</h3>
  <div className="grid gap-2 sm:grid-cols-2">
   <EndpointCard role="Current" endpoint={identity} concurrency={groupComparison?.concurrency} detail={groupComparison?.reportId}/>
   <EndpointCard role="Selected" endpoint={comparison?.guardrail??{provider:choice?.provider,id:choice?.guardrail_id}}
    concurrency={reportConcurrency(other)}
    detail={loading?'Loading comparison…':`${choice?.report_id??other}${comparison?.status==='RUNNING'?' · provisional':''}`}/>
  </div>
  <ErrorText message={error}/>
 </section>:<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs"><p><strong>Guardrail</strong> · {identity?.type??'GUARDRAIL'} · {identity?.provider??'Unknown provider'} · <strong>{identity?.name||identity?.id||'Unknown'}</strong>{identity?.name!==identity?.id&&identity?.id?` (${identity.id})`:''}</p>{identity?.registry_revision&&<span className="font-mono text-muted-foreground">Config {identity.registry_revision}</span>}</div>}
 <section aria-label="Overall scores" className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Overall scores</h2><span className="text-xs text-muted-foreground">{total.processed} processed · {total.errors} errors · {total.pending} pending</span></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{metrics.map(m=><div key={m} className="rounded-lg border px-3 py-2"><p className="text-xs text-muted-foreground">{labels[m]}</p><div className="mt-1 flex items-baseline justify-between gap-2"><p className="text-lg font-semibold tabular-nums">{scoreText(total[m])}</p>{comparison?.overall&&<ScoreDiff current={total[m]} reference={comparison.overall[m]}/>}</div>{comparison?.overall&&<p className="mt-1 text-[10px] text-muted-foreground">B · {scoreText(comparison.overall[m])}</p>}</div>)}</div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>TP {total.TP} · FP {total.FP} · TN {total.TN} · FN {total.FN}</span><details><summary className="cursor-pointer">Metric definitions</summary><p className="mt-1">Precision = TP/(TP+FP) · Recall = TP/(TP+FN) · Accuracy = (TP+TN)/classified · F1 = 2TP/(2TP+FP+FN). Micro-average; errors excluded and reported separately. Zero denominator = N/A.</p></details></div></section>
 <section aria-label="Dataset scores" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Scores by dataset</h2><div className="flex gap-2"><Select aria-label="Dataset score display" value={mode} onChange={e=>setMode(e.target.value)}><option value="grouped">Grouped columns · all scores</option><option value="metric">Compare one score</option><option value="table">Table</option></Select>{mode==='metric'&&<Select aria-label="Score metric" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{metrics.map(m=><option key={m} value={m}>{labels[m]}</option>)}</Select>}</div></div>
 {mode!=='table'&&(comparison&&!matched?<div className="space-y-3" aria-label="Separate dataset charts">
  <p className="text-xs text-muted-foreground">Reports use different dataset versions or uploaded rows, so dataset scores are shown separately.</p>
  <div><ComparisonKey role="Current"/><VerticalScoreBars datasets={rows} selected={selectedMetrics} reportRole="Current"/></div>
  <div><ComparisonKey role="Selected"/>{baselineRows.length?<VerticalScoreBars datasets={baselineRows} selected={selectedMetrics} reportRole="Selected"/>:
   <p className="text-xs text-muted-foreground">Dataset scores unavailable.</p>}</div>
 </div>:<VerticalScoreBars datasets={chartRows} selected={selectedMetrics}/>)}
 <DatasetScoreTable rows={rows} baselineRows={matched?baselineRows:[]} running={running}/></section>
 {comparison&&!matched&&<section className="space-y-2" aria-label="Selected dataset scores">
  <h3 className="text-xs font-medium">B · Compared report dataset scores</h3>
  <DatasetScoreTable rows={baselineRows} running={comparison.status==='RUNNING'}/>
 </section>}

 </div>;
}
