/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { ReportsPage } from './reports-page';
import { createFixtures } from './domain';
import type { Evaluation, Target } from './contracts';
const store = vi.hoisted(() => ({ evaluations: [] as Evaluation[], targets: [] as Target[] }));
vi.mock('./provider', () => ({ useWorkbench: () => ({ state: store }) }));
vi.mock('@/hooks/use-project', () => ({ useCurrentProjectId: () => 'individual' }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
 const run = createFixtures().evaluations[0]!;
 store.evaluations = [{...run, id:'eval-live', status:'COMPLETED', results:[], remote:{id:'eval-live',name:run.name,status:'COMPLETED',created_at:run.createdAt,snapshot:run.snapshot,experiment_id:'exp-live',completed:1,phase:'COMPLETED',model_id:'glm-dev',scorer_ids:['mock-score'],scoring_mode:'mock'}}];
}
it('lists a concurrency group once and finds it by any member run ID', async () => {
 setup();
 const single = store.evaluations[0]!;
 const groupId = 'comparison-group-1';
 const first: Evaluation = {...single,id:'eval-first',remote:{...single.remote!,id:'eval-first',
  concurrency_group:groupId,serial_index:0,concurrency:8,completed:4,sample_count:4}};
 const second: Evaluation = {...first,id:'eval-second',status:'RUNNING',remote:{...first.remote!,id:'eval-second',
  serial_index:1,concurrency:2,status:'RUNNING',phase:'RUNNING',completed:1}};
 store.evaluations = [second,first,single];
 const select = vi.fn(), user = userEvent.setup();
 render(<ReportsPage evaluationId="" onSelect={select}/>);
 expect(screen.getAllByRole('row')).toHaveLength(3);
 const group = within(screen.getByRole('row',{name:/Concurrency group/}));
 expect(group.getByText('2 runs · 8 → 2')).toBeTruthy();
 expect(group.getByText('1/2 runs finished')).toBeTruthy();
 expect(group.getByText('5/8')).toBeTruthy();
 await user.click(group.getByRole('button',{name:'Inspect group'}));
 expect(select).toHaveBeenLastCalledWith('eval-first');
 await user.type(screen.getByLabelText('Evaluation ID'),'eval-second');
 expect(screen.getAllByRole('row')).toHaveLength(2);
 expect(screen.getByText('2 runs · 8 → 2')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Inspect group'}));
 expect(select).toHaveBeenLastCalledWith('eval-second');
});
it('compares reports at the active concurrency and follows it when opening another member', async () => {
 setup();
 const original=store.evaluations[0]!;
 function member(id:string, group:string|null, concurrency:number):Evaluation {
  return {...original,id,remote:{...original.remote!,id,experiment_id:`exp-${id}`,
   execution_mode:'guardrail',concurrency_group:group,concurrency}};
 }
 store.evaluations=[
  member('a8','group-a',8),member('a2','group-a',2),
  member('b2','group-b',2),member('b8','group-b',8),
  member('c8','group-c',8),member('c1','group-c',1),member('single',null,8),
 ];
 const overall={TP:1,FP:0,TN:0,FN:0,processed:1,errors:0,pending:0,precision:1,recall:1,accuracy:1,f1:1};
 vi.stubGlobal('fetch',vi.fn(async (url:string)=>{
  if(url.includes('guardrail-reports?'))return Response.json({items:store.evaluations.map(run=>({
   id:run.remote!.experiment_id,report_id:run.id,status:'COMPLETED',provider:'f5',guardrail_id:'endpoint-b',
  }))});
  if(url.includes('/reports/'))return Response.json({overall,evaluation_config:{id:'cfg',version:8},
   guardrail:{provider:'nemo',id:'endpoint-a',name:'Endpoint A'}});
  return Response.json({items:[],total:0});
 }));
 function Reports(){
  const [id,setId]=useState('a8');
  return <ReportsPage evaluationId={id} onSelect={setId}/>;
 }
 const user=userEvent.setup();
 render(<Reports/>);
 await user.click(await screen.findByRole('button',{name:'Compare',exact:true}));
 const list=screen.getByRole('listbox',{name:'Comparison reports'});
 expect(screen.getByText('A · Concurrency 8 · nemo / endpoint-a')).toBeTruthy();
 const option=await within(list).findByRole('option',{name:/Concurrency 8.*f5 \/ endpoint-b.*b8/});
 expect(within(list).getByRole('option',{name:/c8/})).toBeTruthy();
 expect(within(list).getByRole('option',{name:/single/})).toBeTruthy();
 expect(within(list).queryByRole('option',{name:/b2|c1|a2/})).toBeNull();
 await user.click(option);
 expect(await screen.findByText('b8')).toBeTruthy();
 for(const name of ['A · Current report','B · Compared report']){
  expect(within(screen.getByRole('region',{name})).getByText('8',{exact:true})).toBeTruthy();
 }
 await user.click(screen.getByRole('button',{name:'View report'}));
 expect(await screen.findByText('b2')).toBeTruthy();
 for(const name of ['A · Current report','B · Compared report']){
  expect(within(screen.getByRole('region',{name})).getByText('2',{exact:true})).toBeTruthy();
 }
});
it('loads persisted samples with duration, score and expandable full input/response', async () => {
 setup();
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if(url.includes('/reports/')) return Response.json({datasets:[],bindings:[],aspects:[]});
  if (!url.includes('/experiments/exp-live/samples?')) throw Error('Wrong sample endpoint');
  return Response.json({total:1,items:[{id:'sample-00000000',input:{messages:[{role:'user',content:'Inspect this private input'}]},output:{has_issue:true,explanation:'Actual model response'},reference:{has_issue:true},status:'PASS',latencyMs:1234.56,costUsd:0,error:null,trace:[],scores:[{scorerId:'mock-score',value:1,passed:true,reason:'Fixed test score'}]}]});
 }));
 render(<ReportsPage evaluationId="eval-live" onSelect={() => {}} />);
 await userEvent.click(screen.getByRole('tab',{name:'Samples'}));
 const row = await screen.findByRole('row', {name:/sample-00000000/});
 expect(within(row).getByText('1235 ms')).toBeTruthy();
 expect(within(row).getByText(/mock-score: 1/)).toBeTruthy();
 await userEvent.click(within(row).getByRole('button'));
 const dialog = screen.getByRole('dialog');
 expect(within(dialog).getByText(/Inspect this private input/)).toBeTruthy();
 expect(within(dialog).getByText(/Actual model response/)).toBeTruthy();
 expect(within(dialog).getByText('Fixed test score')).toBeTruthy();
});
it('shows an explicit sample-load error instead of silently hiding results', async () => {
 setup(); vi.stubGlobal('fetch', vi.fn(async () => Response.json({detail:'Storage offline'},{status:503})));
 render(<ReportsPage evaluationId="eval-live" onSelect={() => {}} />);
 expect((await screen.findByRole('alert')).textContent).toContain('Storage offline');
});

it('compares datasets and filters sample details within the same evaluation',async()=>{
 setup();
 const remote=store.evaluations[0]!.remote!;
 remote.datasets=[{dataset_id:'a',dataset_version:1,name:'Dataset A',sample_count:1},{dataset_id:'b',dataset_version:2,name:'Dataset B',sample_count:1}];
 const rows=remote.datasets.map((d,i)=>({id:`sample-${i}`,dataset_id:d.dataset_id,dataset_version:d.dataset_version,input:{text:d.name},output:{},reference:{},status:i?'FAIL':'PASS',latencyMs:10,costUsd:0,error:null,scores:[],trace:[]}));
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('/reports/')?Response.json({datasets:remote.datasets!.map((d,i)=>({...d,status:'COMPLETED',completed:1,passed:1-i,failed:i,errors:0,pass_rate:1-i,average_latency_ms:10,scores:[{scorer_id:'mock-score',average:1-i,count:1}]}))}):Response.json({items:rows,total:2})));
 render(<ReportsPage evaluationId="eval-live" onSelect={()=>{}}/>);
 expect(screen.queryByRole('tab',{name:'Configuration'})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'Configuration'}));
 const configuration=screen.getByRole('dialog',{name:'Configuration'});
 const comparison=await within(configuration).findByRole('region',{name:'Datasets'});
 const scorers=within(configuration).getByRole('region',{name:'Scorers'});
 expect(within(comparison).getByText('100.0%')).toBeTruthy();
 expect(within(comparison).getByText('0.0%')).toBeTruthy();
 expect(within(scorers).getByText('Average 0.000 (n=1)')).toBeTruthy();
 expect(within(scorers).getAllByText('mock-score',{exact:true})).toHaveLength(1);
 await userEvent.click(within(comparison).getByRole('button',{name:/Dataset B/}));
 expect(screen.queryByRole('dialog',{name:'Configuration'})).toBeNull();
 expect(screen.getByLabelText('Filter samples by dataset')).toHaveProperty('value','b');
 expect(screen.queryByRole('button',{name:/sample-0/})).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:/sample-1/}));
 expect(within(screen.getByRole('dialog')).getByText(/Dataset B/)).toBeTruthy();
});

it('shows Guardrail evidence and aspect filtering in Samples only', async () => {
  setup();
  store.evaluations[0]!.remote!.execution_mode = 'guardrail';
  const rows = [
    {id:'sample-a', strategy:'injection', outcome:'TP', binding:'a'},
    {id:'sample-b', strategy:'normal', outcome:'TN', binding:'b'},
  ].map(row => ({
    id:row.id,input:{text:row.id},output:{},reference:{},status:'PASS',error:null,latencyMs:20,costUsd:0,scores:[],trace:[],
    guardrail_result:{request_id:row.id,binding_ids:[row.binding],strategy:row.strategy,status:'COMPLETED',http_status:200,
      guardrail_latency_ms:12.5,scorer_latency_ms:7.5,cost:{amount:.001},
      classifications:[{binding_id:row.binding,outcome:row.outcome,reason:'test'}]},
  }));
  const fetchMock = vi.fn(async (url:string) => url.includes('/reports/') ? Response.json({
    datasets:[],binding_results:[{binding_id:'a',aspect_name:'Injection',dataset_id:'dataset-a',dataset_version:1,
      scorer_id:'classifier',scorer_version:1,processed:1,pending:0,TP:1,FP:0,TN:0,FN:0,errors:0,f1:1,latency:{p95_ms:12.5},cost:{amount:.001}}],
  }) : Response.json({items:rows,total:2}));
  vi.stubGlobal('fetch', fetchMock);
  render(<ReportsPage evaluationId="eval-live" onSelect={()=>{}}/>);
  await userEvent.click(screen.getByRole('tab',{name:'Samples'}));
  await screen.findByRole('option',{name:'Injection · dataset-a'});
  await userEvent.selectOptions(screen.getByLabelText('Guardrail aspect'),'a');
  const row = await screen.findByRole('row',{name:/sample-a/});
  expect(within(row).getByText('TP')).toBeTruthy();
  expect(within(row).getByText('200')).toBeTruthy();
  expect(within(row).getByText('12.5 ms')).toBeTruthy();
  expect(screen.queryByRole('row',{name:/sample-b/})).toBeNull();
  await userEvent.click(within(row).getByRole('button'));
  expect(within(screen.getByRole('dialog')).getByText('Guardrail request details')).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url])=>url.includes('/samples?'))).toHaveLength(1);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Close'}));
  await userEvent.click(screen.getByRole('tab',{name:'Overview'}));
  expect(screen.queryByText(/Aspect breakdown/)).toBeNull();
  expect(screen.queryByRole('row',{name:/sample-a/})).toBeNull();
});
