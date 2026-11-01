import {describe,it,expect} from 'vitest';
import {datasetScoring} from './dataset-scoring';
describe('dataset scoring',()=>{
 it('keeps each dataset purpose and scorers',()=>{
  const a=datasetScoring({name:'Safety',objective:'Prevent disclosure',scorerIds:['risk'],metadata:{}});
  const b=datasetScoring({name:'Tools',objective:'Call the right tool',scorerIds:['tools'],metadata:{}});
  expect(a.ids).toEqual(['risk']);expect(b.ids).toEqual(['tools']);
  expect(a.objective).toBe('Prevent disclosure');expect(a.ready).toBe(false);
 });
 it('requires versioned metadata for real scoring',()=>{
  expect(datasetScoring({name:'A',objective:'Test',scorerIds:['risk'],metadata:{evaluation:{scorers:{risk:{version:'v2'}}}}}).ready).toBe(true);
 });
});

it('explains missing catalog bindings instead of enabling unavailable scorers',()=>{
 const result=datasetScoring({name:'Guardrail',objective:'Risk',scorerIds:['missing'],metadata:{evaluation:{scorers:{missing:{version:'1'}}}}},[]);
 expect(result.ready).toBe(false);
 expect(result.issues).toEqual(['missing: missing or archived']);
});
