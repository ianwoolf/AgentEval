/** @vitest-environment jsdom */
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {TraceViewer} from './trace-viewer';
vi.mock('@/hooks/use-project',()=>({useCurrentProjectId:()=> 'individual'}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows a real span tree and reveals Guardrail request/response and cost',async()=>{
 const base={traceId:'trace1',startTimeUnixNano:'1000000000',endTimeUnixNano:'1100000000'};
 const items=[{id:'root',sample_id:'sample-1',data:{span:{...base,spanId:'root',name:'evaluation.request'}}},{id:'child',data:{span:{...base,spanId:'child',parentSpanId:'root',name:'guardrail.scan',attributes:[{key:'evaluation.input',value:{stringValue:'{"input":"Example request"}'}},{key:'evaluation.output',value:{stringValue:'{"outcome":"blocked"}'}},{key:'evaluation.cost.amount',value:{doubleValue:.001}},{key:'evaluation.cost.source',value:{stringValue:'mock'}}]}}}];
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items,total:2})));
 render(<TraceViewer evaluationId="exp-1" running={false}/>);
 await userEvent.click(await screen.findByRole('button',{name:'guardrail.scan',exact:true}));
 expect(screen.getByText(/Example request/)).toBeTruthy();
 expect(screen.getByText(/blocked/)).toBeTruthy();
 expect(screen.getByText('0.001 USD (mock)')).toBeTruthy();
 await userEvent.click(screen.getByRole('button',{name:'Collapse evaluation.request'}));
 expect(screen.queryByRole('button',{name:'guardrail.scan',exact:true})).toBeNull();
});
it('does not invent spans from legacy sample summaries',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[{id:'legacy',data:{trace:[],latencyMs:12}}],total:1})));
 render(<TraceViewer evaluationId="exp-old" running={false}/>);
 expect(await screen.findByText(/No OpenTelemetry spans were recorded/)).toBeTruthy();
});
