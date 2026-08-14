import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('./api/client', () => ({
  api: {
    targets: vi.fn().mockResolvedValue({ items: [] }), datasets: vi.fn().mockResolvedValue({ items: [] }),
    tools: vi.fn().mockResolvedValue({ items: [] }), mcps: vi.fn().mockResolvedValue({ items: [] }),
    knowledgeBases: vi.fn().mockResolvedValue({ items: [] }),
    runs: vi.fn().mockResolvedValue({ items: [] }), reports: vi.fn().mockResolvedValue({ items: [] }),
    analyses: vi.fn().mockResolvedValue({ items: [] }), evaluators: vi.fn().mockResolvedValue({ items: [] }),
  },
}))

describe('application shell', () => {
  it('provides all product modules without Streamlit navigation', async () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    for (const label of ['Target', 'Dataset', 'Evaluation', 'Report', 'Reflect', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(await screen.findByRole('heading', { name: 'Target' })).toBeInTheDocument()
  })
})
