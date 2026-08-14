import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

const {target,dataset,report,analysis}=vi.hoisted(()=>({
  target:{ id:'target-1', name:'Quality agent', description:'Agent detail', current_revision:2, revision:{revision:2, config_snapshot:{model:'gpt-test',prompt:'Use tools'}, tools:[{tool_id:'search',name:'Search tool',description:'Web search',connection_type:'http'}]} },
  dataset:{ id:'dataset-1', name:'Cases', target_name:'Quality agent', target_id:'target-1', current_revision:1, case_count:1, schema:{columns:[{name:'query',kind:'input',data_type:'string',required:true},{name:'expected_action',kind:'output',data_type:'string',required:true}]}, cases:[{case_id:'case-1',input:{query:'hello'},expected_output:{expected_action:'answer'}}] },
  report:{ id:'report-1', target:{id:'target-1',name:'Quality agent'}, status:'NEEDS ATTENTION', artifact_version:1, created_at:'now', summary:{metrics:{total_cases:2,passed_cases:1,pass_rate:50,evaluation_cost_usd:.03},failures:[{case_id:'case-2',status:'FAIL'}],cases:[{case_id:'case-1',status:'PASS'},{case_id:'case-2',status:'FAIL'}],tool_funnel:{requested:2,executed:2,succeeded:1,verified:1},judge_dimensions:{correctness:4}} },
  analysis:{report_id:'report-1',target:{id:'target-1',name:'Quality agent',revision:2},status:'NEEDS ATTENTION',created_at:'now',metrics:{total_cases:2,passed_cases:1,pass_rate:50},suggestions:[{suggestion_id:'prompt-failures',area:'Prompt',evidence:'1 failed case requires clearer guidance.',current:'Use tools',suggested:'Use tools and verify the action.',patch_key:'prompt',patch_value:'Use tools and verify the action.'}]},
}))

vi.mock('./api/client', () => ({ api: {
  tools:vi.fn().mockResolvedValue({items:[{id:'weather-tool',tool_id:'weather-tool',name:'WeatherTool',kind:'tool',description:'Weather lookup',connection_type:'tool'}]}),
  mcps:vi.fn().mockResolvedValue({items:[{id:'docs-mcp',tool_id:'docs-mcp',name:'Docs MCP',kind:'mcp',description:'Documentation server',connection_type:'mcp'}]}),
  knowledgeBases:vi.fn().mockResolvedValue({items:[{id:'policy-kb',tool_id:'policy-kb',name:'Policy KB',kind:'kb',description:'Policy knowledge',connection_type:'kb'}]}),
  targets: vi.fn().mockResolvedValue({items:[target]}), target:vi.fn().mockResolvedValue(target), createTarget:vi.fn(), reviseTarget:vi.fn(),
  datasets:vi.fn().mockResolvedValue({items:[dataset]}), dataset:vi.fn().mockResolvedValue(dataset), createDataset:vi.fn(), replaceCases:vi.fn(), generateCases:vi.fn(), publishDataset:vi.fn(),
  evaluators:vi.fn().mockResolvedValue({items:[{id:'deterministic',name:'Deterministic evaluator',available:true}]}), runs:vi.fn().mockResolvedValue({items:[]}), startRun:vi.fn(),
  reports:vi.fn().mockResolvedValue({items:[report]}), report:vi.fn().mockResolvedValue(report), analyses:vi.fn().mockResolvedValue({items:[analysis]}), analysis:vi.fn().mockResolvedValue(analysis), applyAnalysis:vi.fn().mockResolvedValue({revision:3}),
}}))

describe('dedicated modules', () => {
  it('shows Target tools and revision actions in a dedicated detail', async () => {
    render(<MemoryRouter initialEntries={['/targets']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'View'}))
    expect(await screen.findByText('Search tool')).toBeInTheDocument()
    expect(screen.getByText('Use tools')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Edit revision'})).toBeInTheDocument()
  })

  it('selects read-only catalog components when creating and editing a Target', async () => {
    render(<MemoryRouter initialEntries={['/targets']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'Create'}))
    expect(await screen.findByText('Available components')).toBeInTheDocument()
    expect(screen.getByText('Docs MCP')).toBeInTheDocument()
    expect(screen.getByText('Policy KB')).toBeInTheDocument()
    expect(screen.queryByRole('textbox',{name:/component/i})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox',{name:/WeatherTool/}))
    fireEvent.click(screen.getByRole('checkbox',{name:/Docs MCP/}))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('shows Dataset cases, schema, generate and publish actions', async () => {
    render(<MemoryRouter initialEntries={['/datasets']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'View'}))
    expect(await screen.findByText('case-1')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Generate'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Publish'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Schema'}))
    expect(screen.getByText('expected_action')).toBeInTheDocument()
  })

  it('restores evaluation composer and Report overview', async () => {
    const {unmount}=render(<MemoryRouter initialEntries={['/evaluations']}><App /></MemoryRouter>)
    expect(await screen.findByRole('button',{name:/Run evaluation/})).toBeInTheDocument()
    unmount()
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button',{name:'View'}))
    expect(await screen.findByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText('Case results')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Reflect'})).toBeInTheDocument()
  })

  it('structures Reflect evidence, diffs and revision submission', async () => {
    render(<MemoryRouter initialEntries={['/reflect?report=report-1']}><App /></MemoryRouter>)
    expect(await screen.findByText('Revision plan')).toBeInTheDocument()
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Suggested')).toBeInTheDocument()
    const submit=screen.getByRole('button',{name:'Submit revision'})
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox',{name:/Prompt/}))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(()=>expect(screen.getByText(/Revision R3 created/)).toBeInTheDocument())
  })
})
