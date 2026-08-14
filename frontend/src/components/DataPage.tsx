import { useEffect, useState } from 'react'
import type { Entity } from '../api/client'

type Props = {
  title: string
  description: string
  load: () => Promise<{ items: Entity[] }>
  columns: { key: string; label: string; render?: (item: Entity) => React.ReactNode }[]
  actionLabel?: string
  detailTitle?: string
}

const valueAt = (item: Entity, key: string) => key.split('.').reduce<unknown>((value, part) => {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
}, item)

const shown = (value: unknown) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DataPage({ title, description, load, columns, actionLabel = 'View', detailTitle }: Props) {
  const [items, setItems] = useState<Entity[]>([])
  const [selected, setSelected] = useState<Entity | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { load().then(value => setItems(value.items)).catch(value => setError(value.message)) }, [load])

  if (selected) return <section>
    <button className="back" onClick={() => setSelected(null)}>← {title}</button>
    <header className="page-header"><div><h1>{detailTitle ?? `${title} detail`}</h1><p>Immutable persisted record</p></div></header>
    <div className="detail-grid">{Object.entries(selected).map(([key, value]) =>
      <div className="detail-row" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{shown(value)}</strong></div>)}</div>
  </section>

  return <section>
    <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div></header>
    {error && <div className="error">{error}</div>}
    <div className="table-wrap"><table><thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}<th></th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id}>{columns.map(column =>
        <td key={column.key}>{column.render ? column.render(item) : shown(valueAt(item, column.key))}</td>)}
        <td className="action"><button onClick={() => setSelected(item)}>{actionLabel}</button></td></tr>)}</tbody></table>
      {!items.length && !error && <div className="empty">No records yet.</div>}
    </div>
  </section>
}
