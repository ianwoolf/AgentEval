/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, it, expect, vi } from 'vitest';
import { ReportsPage } from './reports-page';
import { createFixtures } from './domain';
import type { Evaluation } from './contracts';
const store = vi.hoisted(() => ({ evaluations: [] as Evaluation[] }));
vi.mock('./provider', () => ({ useWorkbench: () => ({ state: store }) }));
vi.mock('@/hooks/use-project', () => ({ useCurrentProjectId: () => 'individual' }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
 const run = createFixtures().evaluations[0]!;
 store.evaluations = [{...run, id:'eval-live', status:'COMPLETED', results:[], remote:{id:'eval-live',name:run.name,status:'COMPLETED',created_at:run.createdAt,snapshot:run.snapshot,experiment_id:'exp-live',completed:1,phase:'COMPLETED',model_id:'glm-dev',scorer_ids:['mock-score'],scoring_mode:'mock'}}];
}
it('loads persisted samples with duration, score and expandable full input/response', async () => {
 setup();
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (!url.includes('/experiments/exp-live/samples?')) throw Error('Wrong sample endpoint');
  return Response.json({total:1,items:[{id:'sample-00000000',input:{messages:[{role:'user',content:'Inspect this private input'}]},output:{has_issue:true,explanation:'Actual model response'},reference:{has_issue:true},status:'PASS',latencyMs:1234.56,costUsd:0,error:null,trace:[],scores:[{scorerId:'mock-score',value:1,passed:true,reason:'Fixed test score'}]}]});
 }));
 render(<ReportsPage evaluationId="eval-live" onSelect={() => {}} />);
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
