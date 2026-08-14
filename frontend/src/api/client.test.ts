import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes backend errors without exposing transport details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'not_found', message: "Resource 'x' was not found", details: { resource_id: 'x' } },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })))

    await expect(api.report('x')).rejects.toEqual(
      new ApiError('not_found', "Resource 'x' was not found", { resource_id: 'x' }),
    )
  })

  it('uses the versioned backend contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    await api.datasets()

    expect(fetcher).toHaveBeenCalledWith('/api/v1/datasets', expect.objectContaining({ headers: { Accept: 'application/json' } }))
  })
})
