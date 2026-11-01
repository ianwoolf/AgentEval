import type {DatasetVersion} from './contracts';
export function datasetScoring(version: Pick<DatasetVersion,'name'|'objective'|'scorerIds'|'metadata'>, catalog?: import('./contracts').Scorer[]) {
  const configs=(version.metadata?.evaluation as {scorers?:Record<string,{version?:string}>}|undefined)?.scorers??{};
  const ids=version.scorerIds??[];
  const issues=ids.flatMap(id=>{
    if(!configs[id]?.version)return [`${id}: choose a published scorer version`];
    if(!catalog)return [];
    const scorer=catalog.find(s=>s.id===id);
    if(!scorer)return [`${id}: missing or archived`];
    if(!scorer.enabled)return [`${scorer.draft.name}: disabled`];
    const spec=scorer.versions.find(v=>String(v.version)===String(configs[id]?.version));
    if(!spec)return [`${scorer.draft.name}: pinned version is unavailable`];
    return [];
  });
  return {ids,issues, objective:version.objective||'No evaluation purpose defined.', ready:ids.length>0&&issues.length===0};
}

export function datasetCoverage(content: import('./contracts').DatasetContent, scorers: import('./contracts').Scorer[]) {
 const bindings=(content.metadata.evaluation as {scorers?:Record<string,{version?:string}>}|undefined)?.scorers??{};
 return [...new Set((content.scorerIds??[]).map(id=>{
  const scorer=scorers.find(s=>s.id===id);const pinned=bindings[id]?.version;
  const version=pinned?scorer?.versions.find(v=>String(v.version)===String(pinned)):scorer?.versions.at(-1);
  return version?.criteria?.aspect??'unclassified';
 }))];
}
