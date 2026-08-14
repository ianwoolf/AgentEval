export type ApiList<T> = { items: T[] }
export type Entity = Record<string, unknown> & { id: string }

export class ApiError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, headers: { Accept: 'application/json', ...(init.body ? {'Content-Type':'application/json'} : {}), ...init.headers } })
  const body = await response.json()
  if (!response.ok) {
    const error = body.error ?? { code: 'request_failed', message: 'Request failed', details: {} }
    throw new ApiError(error.code, error.message, error.details)
  }
  return body as T
}

export const api = {
  tools: () => request<ApiList<Entity>>('/tools'),
  mcps: () => request<ApiList<Entity>>('/mcps'),
  knowledgeBases: () => request<ApiList<Entity>>('/knowledge-bases'),
  targets: () => request<ApiList<Entity>>('/targets'),
  target: (id: string) => request<Entity>(`/targets/${id}`),
  datasets: () => request<ApiList<Entity>>('/datasets'),
  dataset: (id: string) => request<Entity>(`/datasets/${id}`),
  evaluators: () => request<ApiList<Entity>>('/evaluators'),
  runs: () => request<ApiList<Entity>>('/evaluation-runs'),
  run: (id: string) => request<Entity>(`/evaluation-runs/${id}`),
  reports: () => request<ApiList<Entity>>('/reports'),
  report: (id: string) => request<Entity>(`/reports/${id}`),
  analyses: () => request<ApiList<Entity>>('/analyses'),
  analysis: (id: string) => request<Entity>(`/analyses/${id}`),
  applyAnalysis: (id:string,accepted_ids:string[]) => request<Entity>(`/analyses/${id}/apply`,{method:'POST',body:JSON.stringify({accepted_ids})}),
  createTarget: (body: unknown) => request<Entity>('/targets',{method:'POST',body:JSON.stringify(body)}),
  reviseTarget: (id:string,body:unknown) => request<Entity>(`/targets/${id}/revisions`,{method:'POST',body:JSON.stringify(body)}),
  createDataset: (body:unknown) => request<Entity>('/datasets',{method:'POST',body:JSON.stringify(body)}),
  replaceCases: (id:string,cases:unknown[]) => request<Entity>(`/datasets/${id}/cases`,{method:'PUT',body:JSON.stringify({cases})}),
  generateCases: (id:string,count=3) => request<{candidates:Entity[]}>(`/datasets/${id}/generate`,{method:'POST',body:JSON.stringify({count})}),
  publishDataset: (id:string) => request<Entity>(`/datasets/${id}/publish`,{method:'POST'}),
  startRun: (body:unknown) => request<Entity>('/evaluation-runs',{method:'POST',body:JSON.stringify(body)}),
}
