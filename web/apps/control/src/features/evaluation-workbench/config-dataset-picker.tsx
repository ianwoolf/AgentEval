import {useState} from 'react';
import {Database, Search, Check} from 'lucide-react';
import type {Dataset} from './contracts';
import {Button, Input, Select} from './ui';

export type ConfigDatasetRef = {dataset_id:string;dataset_version:number};
export function ConfigDatasetPicker({datasets,selected,onChange,disabled}:{datasets:Dataset[];selected:ConfigDatasetRef[];onChange(value:ConfigDatasetRef[]):void;disabled:boolean}) {
 const [query,setQuery]=useState('');
 const [onlySelected,setOnlySelected]=useState(false);
 const published=datasets.filter(d=>d.versions.length);
 const visible=published.filter(d=>(!onlySelected||selected.some(s=>s.dataset_id===d.id))&&`${d.draft.name} ${d.id}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <fieldset disabled={disabled} className="min-w-0 overflow-hidden rounded-xl border bg-background">
  <legend className="sr-only">Datasets</legend>
  <div className="flex items-start justify-between gap-3 px-5 pt-5">
   <div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Database className="size-4"/></div><div><h3 className="font-medium">Evaluation datasets</h3><p className="mt-1 text-xs text-muted-foreground">Choose what this target can be evaluated against.</p></div></div>
   <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{selected.length} / 20</span>
  </div>
  <div className="flex flex-wrap items-center gap-2 px-5 py-4">
   <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input aria-label="Search datasets" placeholder="Search datasets…" className="pl-9" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <Button variant={onlySelected?'secondary':'ghost'} aria-pressed={onlySelected} onClick={()=>setOnlySelected(v=>!v)}>Selected ({selected.length})</Button>
  </div>
  <div className="flex justify-between border-y bg-muted/30 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><span>Dataset</span><span>Version / samples</span></div>
  <div className="max-h-80 overflow-y-auto divide-y">
   {visible.map(d=>{
    const ref=selected.find(s=>s.dataset_id===d.id);
    const version=d.versions.find(v=>v.version===ref?.dataset_version)??d.versions.at(-1)!;
    return <div key={d.id} className={`flex items-center gap-3 border-l-2 px-4 py-3 transition-colors ${ref?'border-l-primary bg-primary/[0.035]':'border-l-transparent hover:bg-muted/30'}`}>
     <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
      <input type="checkbox" aria-label={d.draft.name} className="size-4 shrink-0 accent-primary" checked={!!ref} disabled={!ref&&selected.length>=20} onChange={e=>onChange(e.target.checked?[...selected,{dataset_id:d.id,dataset_version:version.version}]:selected.filter(s=>s.dataset_id!==d.id))}/>
      <span className="min-w-0"><span className="block truncate text-sm font-medium" title={d.draft.name}>{d.draft.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground" title={d.draft.description||d.id}>{d.draft.description||d.id}</span></span>
     </label>
     <div className="w-28 shrink-0 text-right">
      {ref?<Select aria-label={`${d.draft.name} version`} className="h-8 w-full py-1 text-xs" value={ref.dataset_version} onChange={e=>onChange(selected.map(s=>s.dataset_id===d.id?{...s,dataset_version:Number(e.target.value)}:s))}>{d.versions.toReversed().map(v=><option key={v.version} value={v.version}>v{v.version}</option>)}</Select>:<span className="text-xs text-muted-foreground">Latest · v{version.version}</span>}
      <p className="mt-1 text-[11px] text-muted-foreground">{version.rows.length.toLocaleString()} samples</p>
     </div>
    </div>;
   })}
   {!visible.length&&<div className="px-5 py-10 text-center text-sm text-muted-foreground">{!published.length?'No published datasets yet.':onlySelected&&!selected.length?'Select datasets to build your evaluation scope.':'No datasets match this view.'}{(query||onlySelected)&&<Button variant="link" onClick={()=>{setQuery('');setOnlySelected(false);}}>Reset filters</Button>}</div>}
  </div>
  <p className="flex items-start gap-2 border-t bg-muted/20 px-5 py-3 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 size-3.5 shrink-0"/>Trigger can select any subset of these datasets. Versions stay fixed until you update this configuration.</p>
 </fieldset>;
}
