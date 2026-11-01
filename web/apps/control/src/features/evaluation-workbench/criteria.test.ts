import {describe,it,expect} from 'vitest';
import {criteriaPresets, readCriteria, scorerTemplates} from './criteria';
import {publishScorer} from './domain';
describe('evaluation criteria',()=>{
 it('provides five explicit, editable purposes and never infers missing criteria',()=>{
  expect(criteriaPresets.map(p=>p.aspect)).toEqual(['completion','grounding','friendliness','tool-use','safety']);
  expect(readCriteria({})).toBeUndefined();
  for(const p of criteriaPresets) expect([p.subject,p.expectation,p.requirements,p.evidence].every(Boolean)).toBe(true);
 });
 it('publishes judge criteria without requiring a fictitious Git script and keeps prior versions immutable',()=>{
  const scorer=structuredClone(scorerTemplates()[0]!);
  scorer.source='CUSTOM'; scorer.versions=[];
  const first=publishScorer(scorer);
  first.draft.criteria!.expectation='Changed expectation';
  const second=publishScorer(first);
  expect(second.versions[0]!.criteria!.expectation).not.toBe('Changed expectation');
  expect(second.versions[1]!.criteria!.expectation).toBe('Changed expectation');
 });
});
