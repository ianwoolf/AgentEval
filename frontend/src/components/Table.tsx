import type { Entity } from '../api/client'

export function Table({items,columns,onView,label='View'}:{items:Entity[],columns:{key:string,label:string,render?:(item:Entity)=>React.ReactNode}[],onView?:(item:Entity)=>void,label?:string}) {
  const read=(item:Entity,key:string)=>key.split('.').reduce<unknown>((value,part)=>value&&typeof value==='object'?(value as Record<string,unknown>)[part]:undefined,item)
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{onView&&<th/>}</tr></thead><tbody>{items.map(item=><tr key={item.id}>{columns.map(c=><td key={c.key}>{c.render?c.render(item):String(read(item,c.key)??'—')}</td>)}{onView&&<td className="action"><button onClick={()=>onView(item)}>{label}</button></td>}</tr>)}</tbody></table>{!items.length&&<div className="empty">No records yet.</div>}</div>
}
