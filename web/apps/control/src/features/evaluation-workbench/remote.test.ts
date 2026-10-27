// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { executionApi } from './remote';
import { getAuthToken } from '@/lib/auth-token';
vi.mock('@/lib/auth-token',()=>({getAuthToken:vi.fn(()=> 'old-browser-token')}));
afterEach(()=>{delete window.__EVALUATION_CONFIG__;vi.unstubAllGlobals();vi.clearAllMocks();});
it('standalone requests use the evaluation API without stored login credentials',async()=>{
  window.__EVALUATION_CONFIG__={standalone:true,projectId:'individual',apiBase:'/api/v1/evaluations'};
  const fetcher=vi.fn().mockResolvedValue(Response.json({id:'run'}));vi.stubGlobal('fetch',fetcher);
  await executionApi('ignored','targets/guardrail/runs',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'repeat-safe','Authorization':'Bearer stale'},body:'{}'});
  const [url,init]=fetcher.mock.calls[0];
  expect(url).toBe('/api/v1/evaluations/targets/guardrail/runs');
  expect(init.headers.get('Authorization')).toBeNull();
  expect(init.headers.get('X-Project-ID')).toBe('individual');
  expect(init.headers.get('Idempotency-Key')).toBe('repeat-safe');
  expect(getAuthToken).not.toHaveBeenCalled();
});
it('legacy mode still uses the Control proxy',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({items:[]}));vi.stubGlobal('fetch',fetcher);
  await executionApi('p','datasets');
  const [url,init]=fetcher.mock.calls[0];
  expect(url).toBe('/api/v1/projects/p/evaluation-execution/datasets');
  expect(init.headers.get('Authorization')).toBe('Bearer old-browser-token');
});
