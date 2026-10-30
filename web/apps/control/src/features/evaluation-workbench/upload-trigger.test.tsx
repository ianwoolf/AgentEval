/** @vitest-environment jsdom */
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,it,expect,vi } from 'vitest';
import { createFixtures } from './domain';
import { TriggerTargetDialog } from './trigger-target';
vi.mock('@/hooks/use-project',()=>({useCurrentProjectId:()=> 'individual'}));
vi.mock('./provider',()=>({useWorkbench:()=>{const state=createFixtures(); Object.assign(state.environments[0]!.versions[0]!, {cpuMillicores:750,memoryMiB:768}); return {state,setState:()=>{}};}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function network(valid=true){
 const bodies: Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async (url:string,init?:RequestInit)=>{
  if(url.endsWith('/config')) return Response.json({id:'guardrail-privacy',revision:'1:1',data_source:'upload',dataset_id:'ds-guardrail',dataset_version:1,environment_id:'env-isolated',environment_version:1,model_id:'glm-dev'});
  if(url.includes('/versions/1')) return Response.json(createFixtures().datasets[0]!.versions[0]);
  if(url.includes('/uploads?')) return valid ? Response.json({id:'upload-abc',row_count:2,dataset_id:'ds-guardrail',dataset_version:1}) : Response.json({detail:'Row 2, column messages: expected json'},{status:422});
  if(url.endsWith('/runs')){bodies.push(JSON.parse(init!.body as string));return Response.json({id:'eval-new',name:'Uploaded',status:'RUNNING',created_at:'2026-10-24T00:00:00Z',snapshot:JSON.parse(init!.body as string).snapshot});}
  throw Error('Unexpected request');
 }));return bodies;
}
it('requires validated upload and submits only its reference without sample rows or policy',async()=>{
 const bodies=network(),user=userEvent.setup();render(<TriggerTargetDialog targetId="guardrail-privacy" onClose={()=>{}} />);
 await user.type(screen.getByLabelText('Evaluation name'),'Uploaded');
 await screen.findByLabelText('Upload CSV or Excel');
 const start=screen.getByRole('button',{name:'Run evaluation'});
 expect((start as HTMLButtonElement).disabled).toBe(true);
 await user.upload(screen.getByLabelText('Upload CSV or Excel'),new File(['messages,has_issue'],'cases.csv',{type:'text/csv'}));
 await screen.findByText('Validated 2 samples');
 await user.click(start);
 await waitFor(()=>expect(bodies).toHaveLength(1));
 expect(bodies[0]!.datasets).toEqual([{dataset_id:'ds-guardrail',dataset_version:1,upload_id:'upload-abc'}]);
 expect(bodies[0]).not.toHaveProperty('snapshot');
 expect(bodies[0]).not.toHaveProperty('content_policy');
 expect(bodies[0]).not.toHaveProperty("resources");
 expect(bodies[0]!.config_revision).toBe('1:1');
});
it('validation errors block execution and remain visible',async()=>{
 const bodies=network(false),user=userEvent.setup();render(<TriggerTargetDialog targetId="guardrail-privacy" onClose={()=>{}} />);
 await screen.findByLabelText('Upload CSV or Excel');
 await user.upload(screen.getByLabelText('Upload CSV or Excel'),new File(['bad'],'cases.csv',{type:'text/csv'}));
 expect((await screen.findByRole('alert')).textContent).toContain('Row 2');
 expect((screen.getByRole('button',{name:'Run evaluation'}) as HTMLButtonElement).disabled).toBe(true);
 expect(bodies).toHaveLength(0);
});
