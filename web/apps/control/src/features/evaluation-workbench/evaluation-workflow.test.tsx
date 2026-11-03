/** @vitest-environment jsdom */
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {EvaluationConfigurator} from './evaluation-configurator';
import {TriggerTargetDialog} from './trigger-target';
const mock=vi.hoisted(()=>({state:{} as any,api:vi.fn(),setState:vi.fn()}));
vi.mock('./provider',()=>({useWorkbench:()=>({state:mock.state,setState:mock.setState})}));
vi.mock('@/hooks/use-project',()=>({useCurrentProjectId:()=> 'individual'}));
vi.mock('./remote',()=>({executionApi:mock.api,fromRemote:(r:any)=>r}));
const version={version:1,name:'Safety data',evaluation_type:'guardrail',objective:'Detect unsafe inputs',rows:[{input:'hello',label:'safe',strategy:'benign'}]};
const config={id:'evaluation-a',revision:'10:1',execution_mode:'guardrail',datasets:[{dataset_id:'selected',dataset_version:1}],dataset_id:'selected',dataset_version:1,environment_id:'env',environment_version:1,data_source:'published',scoring_mode:'installed',scorer_selection:'dataset',guardrail_bindings:[{dataset_id:'selected',dataset_version:1,scorer_id:'git',scorer_version:1,aspect_id:'safety',aspect_name:'Safety',label_mapping:{safe:'safe',unsafe:'unsafe'}}]};
beforeEach(()=>{mock.api.mockReset();mock.setState.mockReset();mock.state={targets:[{id:'evaluation-a',name:'Evaluation A',kind:'GUARDRAIL',guardrail_id:'gr',provider:'f5',version:1,revision:'10:1'}],datasets:[{id:'selected',draft:version,versions:[version]},{id:'outside',draft:{...version,name:'Outside dataset'},versions:[{...version,name:'Outside dataset'}]}],scorers:[{id:'git',enabled:true,draft:{name:'Classifier'},versions:[{version:1,execution:{engine:'git'}}]}],environments:[{id:'env',versions:[{version:1,name:'Isolated',modelId:'none',cpuMillicores:500,memoryMiB:512,timeoutSeconds:60}]}],evaluations:[]};});
afterEach(cleanup);
it('Trigger shows only configured datasets and posts a pinned subset with revision',async()=>{
 mock.api.mockImplementation(async(_p,path)=>path.endsWith('/config')?config:{id:'run',snapshot:{}});
 const started=vi.fn();render(<TriggerTargetDialog targetId="evaluation-a" onClose={()=>{}} onStarted={started}/>);
 await screen.findByText('Safety data');expect(screen.queryByText('Outside dataset')).toBeNull();
 expect(screen.queryByRole('combobox')).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'Run evaluation'}));
 const call=mock.api.mock.calls.find(c=>c[1].endsWith('/runs'))!;
 expect(JSON.parse(call[2].body)).toMatchObject({config_revision:'10:1',datasets:[{dataset_id:'selected',dataset_version:1}]});
 await waitFor(()=>expect(started).toHaveBeenCalledWith('run'));
});
it('Configure saves target, pinned scorer bindings and environment in one request',async()=>{
 mock.api.mockImplementation(async(_p,path,opts)=>path.endsWith('/config')?config:{...JSON.parse(opts.body).target,revision:'11:1'});
 const saved=vi.fn();render(<EvaluationConfigurator initial={mock.state.targets[0]} onClose={()=>{}} onSaved={saved}/>);
 await waitFor(()=>expect(screen.queryByText('Loading configuration…')).toBeNull());
 await userEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByLabelText('Aspect ID *')).toHaveProperty('value','safety');
 await userEvent.click(screen.getByRole('button',{name:'Next'}));
 await userEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 const call=mock.api.mock.calls.find(c=>c[1].endsWith('/configuration'))!;
 const body=JSON.parse(call[2].body);
 expect(body.revision).toBe('10:1');expect(body.target.guardrail_id).toBe('gr');
 expect(body.config.guardrail_bindings[0]).toMatchObject({dataset_id:'selected',scorer_id:'git',scorer_version:1});
 expect(body.config.environment_version).toBe(1);expect(body.config.execution_mode).toBe('guardrail');
 await waitFor(()=>expect(saved).toHaveBeenCalled());
});
