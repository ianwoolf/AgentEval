/** @vitest-environment jsdom */
import {render,screen,cleanup,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {EvaluationConfigurator} from './evaluation-configurator';
import {TriggerTargetDialog} from './trigger-target';
const mock=vi.hoisted(()=>({state:{} as any,api:vi.fn(),setState:vi.fn()}));
vi.mock('./provider',()=>({useWorkbench:()=>({state:mock.state,setState:mock.setState})}));
vi.mock('@/hooks/use-project',()=>({useCurrentProjectId:()=> 'individual'}));
vi.mock('./remote',()=>({executionApi:mock.api,fromRemote:(r:any)=>r}));
const version={version:1,name:'Safety data',evaluation_type:'guardrail',objective:'Detect unsafe inputs',fields:[{name:'input',type:'string',required:true}],rows:[{input:'hello',label:'safe',strategy:'benign'}]};
const config={concurrency:3,id:'evaluation-a',revision:'10:1',execution_mode:'guardrail',datasets:[{dataset_id:'selected',dataset_version:1}],dataset_id:'selected',dataset_version:1,environment_id:'env',environment_version:1,data_source:'published',scoring_mode:'installed',scorer_selection:'dataset',guardrail_bindings:[{dataset_id:'selected',dataset_version:1,scorer_id:'git',scorer_version:1,aspect_id:'safety',aspect_name:'Safety',label_mapping:{safe:'safe',unsafe:'unsafe'}}]};
beforeEach(()=>{mock.api.mockReset();mock.setState.mockReset();mock.state={targets:[{id:'evaluation-a',name:'Evaluation A',kind:'GUARDRAIL',guardrail_id:'gr',provider:'f5',version:1,revision:'10:1'}],datasets:[{id:'selected',draft:version,versions:[version]},{id:'outside',draft:{...version,name:'Outside dataset'},versions:[{...version,name:'Outside dataset'}]}],scorers:[{id:'git',enabled:true,draft:{name:'Classifier'},versions:[{version:1,execution:{engine:'git'}}]}],environments:[{id:'env',versions:[{version:1,name:'Isolated',modelId:'none',cpuMillicores:500,memoryMiB:512,timeoutSeconds:60}]}],evaluations:[]};});
afterEach(cleanup);
it('Trigger fixes datasets and selects the per-run Provider and instance',async()=>{
 mock.api.mockImplementation(async(_p,path)=>path==='guardrail-instances'?{providers:[{id:'f5',name:'F5',instances:[{id:'gr',name:'Guardrail',enabled:true,address:'https://guard.test/scans'}]}]}:path.endsWith('/config')?config:{id:'run',snapshot:{}});
 const started=vi.fn();render(<TriggerTargetDialog targetId="evaluation-a" onClose={()=>{}} onStarted={started}/>);
 await screen.findByLabelText('Case concurrency');
 expect(screen.queryByLabelText('Evaluation name')).toBeNull();
 expect(screen.queryByRole('group',{name:'Datasets · 1'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Run evaluation'})).toBeNull();
 expect(screen.getByLabelText('Case concurrency')).toHaveProperty('value','3');
 await userEvent.selectOptions(screen.getByLabelText('Provider *'),'f5');
 await userEvent.selectOptions(screen.getByLabelText('Guardrail endpoint *'),'gr');
 await userEvent.click(screen.getByRole('button',{name:'Review datasets'}));
 expect(screen.getByRole('group',{name:'Datasets · 1'}).textContent).toContain('Safety data');
 expect(screen.queryByText('Outside dataset')).toBeNull();
 expect(mock.api.mock.calls.some(c=>c[1].endsWith('/runs'))).toBe(false);
 await userEvent.click(screen.getByRole('button',{name:'Back'}));
 expect(screen.getByLabelText('Guardrail endpoint *')).toHaveProperty('value','gr');
 await userEvent.click(screen.getByRole('button',{name:'Review datasets'}));
 await userEvent.click(screen.getByRole('button',{name:'Run evaluation'}));
 const call=mock.api.mock.calls.find(c=>c[1].endsWith('/runs'))!;
 expect(JSON.parse(call[2].body)).toMatchObject({concurrency:3,provider:'f5',guardrail_id:'gr',config_revision:'10:1',datasets:[{dataset_id:'selected',dataset_version:1}]});
 expect(JSON.parse(call[2].body)).not.toHaveProperty('name');
 await waitFor(()=>expect(started).toHaveBeenCalledWith('run'));
});
it('Configure saves target, pinned scorer bindings and environment in one request',async()=>{
 mock.api.mockImplementation(async(_p,path,opts)=>path==='guardrail-instances'?{revision:'1',providers:[{id:'f5',name:'F5',instances:[{id:'gr',name:'Guardrail',address:'https://guard.test/scans',enabled:true}]}]}:path.endsWith('/config')?config:{...JSON.parse(opts.body).target,revision:'11:1'});
 const saved=vi.fn();render(<EvaluationConfigurator initial={mock.state.targets[0]} onClose={()=>{}} onSaved={saved}/>);
 await waitFor(()=>expect(screen.queryByText('Loading configuration…')).toBeNull());
 await userEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByLabelText('Aspect ID *')).toHaveProperty('value','safety');
 await userEvent.click(screen.getByRole('button',{name:'Next'}));
 await userEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 const call=mock.api.mock.calls.find(c=>c[1].endsWith('/configuration'))!;
 const body=JSON.parse(call[2].body);
 expect(body.revision).toBe('10:1');expect(body.target.guardrail_id).toBeNull();expect(body.target.provider).toBeNull();
 expect(body.config.guardrail_bindings[0]).toMatchObject({dataset_id:'selected',scorer_id:'git',scorer_version:1});
 expect(body.config.environment_version).toBe(1);expect(body.config.execution_mode).toBe('guardrail');
 await waitFor(()=>expect(saved).toHaveBeenCalled());
});
it('clears the instance when provider changes and requires a configured selection',async()=>{
 const registry={revision:'1',providers:[{id:'f5',name:'F5',instances:[{id:'first',name:'First',address:'https://f5.test/scans',enabled:true}]},{id:'nemo guardrail',name:'NeMo',instances:[{id:'second',name:'Second',address:'https://nemo.test/scans',enabled:true}]}]};
 mock.api.mockImplementation(async(_p,path)=>path==='guardrail-instances'?registry:config);
 render(<TriggerTargetDialog targetId="evaluation-a" onClose={()=>{}}/>);
 const user=userEvent.setup();await screen.findByRole('option',{name:'F5'});
 expect(screen.getByLabelText('Guardrail endpoint *')).toHaveProperty('disabled',true);
 await user.selectOptions(screen.getByLabelText('Provider *'),'f5');
 await user.selectOptions(screen.getByLabelText('Guardrail endpoint *'),'first');
 expect(screen.getByRole('button',{name:'Review datasets'})).toHaveProperty('disabled',false);
 await user.selectOptions(screen.getByLabelText('Provider *'),'nemo guardrail');
 expect(screen.getByLabelText('Guardrail endpoint *')).toHaveProperty('value','');
 expect(screen.queryByRole('option',{name:'First · first'})).toBeNull();
 expect(screen.getByRole('button',{name:'Review datasets'})).toHaveProperty('disabled',true);
});

it('submits one ordered comparison with per-run endpoints and validated upload',async()=>{
 mock.api.mockImplementation(async(_p,path,options)=>path==='guardrail-instances'
  ?{providers:[
   {id:'f5',name:'F5',instances:[{id:'gr',name:'Guardrail',enabled:true,address:'https://guard.test/scans'}]},
   {id:'nemo',name:'NeMo',instances:[{id:'other',name:'Other Guardrail',enabled:true,address:'https://other.test/scans'}]},
  ]}
  :path.endsWith('/config')?config:path.startsWith('uploads?')
   ?{id:'upload-shared',row_count:1,dataset_id:'selected',dataset_version:1}
   :{items:JSON.parse(options.body).levels.map((level:number)=>({id:String(level),snapshot:{}}))});
 const started=vi.fn();
 render(<TriggerTargetDialog targetId="evaluation-a" onClose={()=>{}} onStarted={started}/>);
 const user=userEvent.setup();
 await user.selectOptions(await screen.findByLabelText('Provider *'),'f5');
 await user.selectOptions(screen.getByLabelText('Guardrail endpoint *'),'gr');
 await user.click(await screen.findByLabelText('Compare concurrency levels'));
 const second=within(screen.getByRole('group',{name:'Run 2'}));
 const review=screen.getByRole('button',{name:'Review datasets'});
 expect(screen.getAllByLabelText('Guardrail endpoint *')).toHaveLength(2);
 expect(second.getByLabelText('Guardrail endpoint *')).toHaveProperty('value','gr');
 await user.selectOptions(second.getByLabelText('Provider *'),'nemo');
 expect(review).toHaveProperty('disabled',true);
 await user.selectOptions(second.getByLabelText('Guardrail endpoint *'),'other');
 expect(review).toHaveProperty('disabled',false);
 await user.clear(second.getByLabelText('Case concurrency'));
 await user.type(second.getByLabelText('Case concurrency'),'3');
 expect(review).toHaveProperty('disabled',true);
 await user.clear(second.getByLabelText('Case concurrency'));
 await user.type(second.getByLabelText('Case concurrency'),'6');
 await user.click(screen.getByRole('button',{name:'Add run'}));
 expect(review).toHaveProperty('disabled',true);
 await user.click(screen.getByRole('button',{name:'Remove run 3'}));
 await user.click(screen.getByRole('button',{name:'Review datasets'}));
 await user.click(screen.getByRole('button',{name:'Upload CSV or Excel for Safety data'}));
 expect(screen.getByRole('list',{name:'Expected columns'}).textContent).toContain('input · string · required');
 expect(screen.getByRole('button',{name:'Run comparison group'})).toHaveProperty('disabled',true);
 await user.upload(screen.getByLabelText('Upload CSV or Excel'),new File(['input\nhello'],'cases.csv'));
 await screen.findByText('Validated 1 samples');
 await user.click(screen.getByRole('button',{name:'Run comparison group'}));
 await waitFor(()=>expect(started).toHaveBeenCalledWith(JSON.parse(mock.api.mock.calls.find(c=>c[1].endsWith('/run-comparison'))![2].body).group_id));
 const requests=mock.api.mock.calls.filter(c=>c[1].endsWith('/run-comparison')).map(c=>c[2]);
 expect(requests).toHaveLength(1);
 expect(JSON.parse(requests[0].body)).toMatchObject({
  levels:[3,6],endpoints:[{provider:'f5',guardrail_id:'gr'},{provider:'nemo',guardrail_id:'other'}],
  datasets:[{dataset_id:'selected',dataset_version:1,upload_id:'upload-shared'}],
 });
 expect(mock.api.mock.calls.filter(c=>c[1].startsWith('uploads?'))).toHaveLength(1);
});
