/** @vitest-environment jsdom */
import {render,screen,cleanup,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {GuardrailScoreDashboard,scoreText,ScoreDiff,datasetsMatch} from './guardrail-score-dashboard';
const api=vi.hoisted(()=>vi.fn());
vi.mock('@/hooks/use-project',()=>({useCurrentProjectId:()=> 'individual'}));
vi.mock('./remote',()=>({executionApi:api}));
afterEach(()=>{cleanup();api.mockReset();});
const scores={TP:3,FP:2,TN:3,FN:2,precision:.6,recall:.6,accuracy:.6,f1:.6,processed:10,errors:0,pending:0,valid_count:10,latency:{average_ms:20,p50_ms:10,p95_ms:40,count:10}};
const report={evaluation_config:{id:"cfg",version:1},overall:scores,guardrail:{type:'GUARDRAIL',provider:'f5',id:'guard-1',name:'Snapshot Guardrail'},dataset_results:[{...scores,dataset_id:'a',dataset_version:2,name:'Dataset A'},{...scores,dataset_id:'b',dataset_version:1,name:'Dataset B'}]};
it('switches dataset score views and latency and compares saved report totals',async()=>{
 api.mockImplementation(async(_p,path)=>path.startsWith('guardrail-reports')?{items:[{id:'current',name:'Current'},{id:'other',name:'Previous report',report_id:'eval-other',created_at:'2026-11-04T00:00:00Z',status:'COMPLETED',guardrail_id:'guard-2'}]}:{overall:{...scores,precision:.4,recall:.4,accuracy:.4,f1:.4},guardrail:{type:'GUARDRAIL',provider:'f5',id:'guard-2',name:'Previous Guardrail'}});
 render(<GuardrailScoreDashboard report={report} evaluationId="current"/>);const user=userEvent.setup();
 expect(screen.getByText(/Snapshot Guardrail/)).toBeTruthy();
 expect(within(screen.getByRole('region',{name:'Overall scores'})).getAllByText('60.0%')).toHaveLength(4);
 const chart=screen.getByRole('img',{name:'Dataset score comparison'});
 expect(chart.querySelectorAll('[data-score-group]')).toHaveLength(4);
 expect(chart.querySelector('[data-score-group=precision] > text')?.getAttribute('y')).toBe('16');
 expect(chart.querySelectorAll('[data-dataset-label=a]')).toHaveLength(4);
 expect(chart.querySelector('[data-dataset-label=a]')?.textContent).toContain('Dataset A');
 expect(chart.querySelectorAll('[data-score-group=precision] rect[data-dataset]')).toHaveLength(2);
 expect(chart.querySelectorAll('rect[data-dataset=a]')).toHaveLength(4);
 await user.selectOptions(screen.getByLabelText('Dataset score display'),'metric');
 await user.selectOptions(screen.getByLabelText('Score metric'),'recall');
 expect(screen.getByRole('img',{name:'Dataset score comparison'})).toBeTruthy();
 await user.selectOptions(screen.getByLabelText('Dataset score display'),'table');
 expect(screen.queryByRole('img',{name:'Dataset score comparison'})).toBeNull();
 expect(screen.queryByRole('region',{name:'Dataset latency'})).toBeNull();
 const table=within(within(screen.getByRole('region',{name:'Dataset scores'})).getByRole('table'));
 expect(table.getAllByRole('columnheader').map(header=>header.textContent)).toEqual([
  'Requests','Dataset','Precision','Recall','Accuracy','F1 score','P50','P95',
 ]);
 const cells=within(table.getByRole('row',{name:/Dataset A/})).getAllByRole('cell');
 expect(cells[0].textContent).toBe('10');
 expect(cells.slice(-2).map(cell=>cell.textContent)).toEqual(['10.0 ms','40.0 ms']);
 await user.click(screen.getByRole('button',{name:'Compare',exact:true}));
 await screen.findByRole('option',{name:/eval-other/});
 expect(api.mock.calls.some(c=>c[1]==='guardrail-reports?config_id=cfg&config_version=1')).toBeTruthy();
 expect(screen.queryByRole('option',{name:'Current'})).toBeNull();
 await user.click(screen.getByRole('option',{name:/eval-other/}));
 await waitFor(()=>expect(screen.getAllByText('+20.0 pp')).toHaveLength(4));
});
it('shows N/A for undefined metrics and preserves a true zero',()=>{
 expect(scoreText(null)).toBe('N/A');expect(scoreText(0)).toBe('0.0%');
});


it('identifies both endpoints and pairs matching dataset versions with distinct bar styles',async()=>{
 const selected={...report,guardrail:{...report.guardrail,provider:'nemo guardrail'},
  overall:{...scores,precision:.4},dataset_results:[...report.dataset_results].reverse().map(d=>({...d,precision:.4,
   latency:{...d.latency,p50_ms:15,p95_ms:30}}))};
 api.mockImplementation(async(_p,path)=>path.startsWith('guardrail-reports')?{items:[{id:'other',report_id:'eval-other',status:'COMPLETED'}]}:selected);
 render(<GuardrailScoreDashboard report={report} evaluationId="current"/>);
 await userEvent.click(screen.getByRole('button',{name:'Compare',exact:true}));await userEvent.click(await screen.findByRole('option',{name:/eval-other/}));
 await waitFor(()=>expect(screen.getByRole('img',{name:'Dataset score comparison'}).querySelectorAll('rect[data-report=Selected]')).toHaveLength(8));
 expect(screen.getAllByRole('img',{name:'Dataset score comparison'})).toHaveLength(1);
 const endpoints=within(screen.getByRole('region',{name:'Guardrail endpoints'}));
 expect(endpoints.getByRole('region',{name:'A · Current report'}).textContent).toContain('f5 / Snapshot Guardrail');
 expect(endpoints.getByRole('region',{name:'B · Compared report'}).textContent).toContain('nemo guardrail / Snapshot Guardrail');
 expect(endpoints.getAllByText('guard-1')).toHaveLength(2);
 const chart=screen.getByRole('img',{name:'Dataset score comparison'});
 expect(chart.querySelector('rect[data-report=Current]')?.getAttribute('fill')).toBe('#1d4ed8');
 const pattern=chart.querySelector('pattern');
 expect(pattern).toBeTruthy();
 expect(chart.querySelector('rect[data-report=Selected]')?.getAttribute('fill')).toBe(`url(#${pattern?.id})`);
 expect(chart.querySelectorAll('[data-dataset-label]')).toHaveLength(8);
 expect(screen.queryByText('Overall score comparison')).toBeNull();
 const totals=within(screen.getByRole('region',{name:'Overall scores'}));expect(totals.getByText('+20.0 pp').className).toContain('text-emerald-600');
 const cells=within(screen.getByRole('row',{name:/Dataset A/})).getAllByRole('cell');
 const p50=within(cells.at(-2)!);
 expect(p50.getByText('10.0 ms')).toBeTruthy();
 expect(p50.getByText('B · 15.0 ms')).toBeTruthy();
 expect(p50.getByText('-5.0 ms').className).toContain('text-emerald-600');
 const p95=within(cells.at(-1)!);
 expect(p95.getByText('40.0 ms')).toBeTruthy();
 expect(p95.getByText('B · 30.0 ms')).toBeTruthy();
 expect(p95.getByText('+10.0 ms').className).toContain('text-red-600');
});
it('uses two charts when a dataset version does not match',async()=>{
 const selected={...report,dataset_results:[{...report.dataset_results[0],dataset_version:99},report.dataset_results[1]]};
 api.mockImplementation(async(_p,path)=>path.startsWith('guardrail-reports')?{items:[{id:'other',report_id:'eval-other',status:'COMPLETED'}]}:selected);
 render(<GuardrailScoreDashboard report={report} evaluationId="current"/>);
 await userEvent.click(screen.getByRole('button',{name:'Compare',exact:true}));await userEvent.click(await screen.findByRole('option',{name:/eval-other/}));
 await waitFor(()=>expect(screen.getAllByRole('img',{name:'Dataset score comparison'})).toHaveLength(2));
 expect(screen.getByLabelText('Separate dataset charts')).toBeTruthy();
 const baseline=within(screen.getByRole('region',{name:'Selected dataset scores'}));
 expect(baseline.getByRole('columnheader',{name:'P95'})).toBeTruthy();
 expect(baseline.getAllByText('40.0 ms')).toHaveLength(2);
 expect(datasetsMatch(report.dataset_results,[{...report.dataset_results[0],dataset_id:'different'},report.dataset_results[1]])).toBe(false);
});
it('renders negative differences red and zero differences neutral',()=>{
 const view=render(<ScoreDiff current={.4} reference={.6}/>);
 expect(screen.getByText('-20.0 pp').className).toContain('text-red-600');
 view.rerender(<ScoreDiff current={.4} reference={.4}/>);expect(screen.getByText('0.0 pp').className).toContain('text-muted-foreground');
 view.rerender(<ScoreDiff current={null} reference={.4}/>);expect(screen.getByText('N/A')).toBeTruthy();
});

it('fits eight datasets without horizontal scrolling and rotates abbreviated labels',()=>{
 api.mockResolvedValue({items:[]});
 render(<GuardrailScoreDashboard report={{...report,dataset_results:Array.from({length:8},(_,i)=>({...scores,dataset_id:`aspect-${i}`,dataset_version:1,name:`Guardrail aspect with long name ${i}`}))}} evaluationId="current"/>);
 const chart=screen.getByRole('img',{name:'Dataset score comparison'});
 expect(chart.style.minWidth).toBe('');
 expect(chart.parentElement?.className).not.toContain('overflow-x-auto');
 const label=chart.querySelector('[data-dataset-label]')!;
 expect(label.getAttribute('transform')).toContain('rotate(-50)');
 expect(label.textContent).toContain('…');
 expect(chart.querySelectorAll('rect[data-dataset]')).toHaveLength(32);
 expect(Number(chart.querySelector('rect[data-dataset]')?.getAttribute('width'))).toBeLessThanOrEqual(16);
});
