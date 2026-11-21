import test from 'node:test';
import assert from 'node:assert/strict';
import { solveCompoundInequality, verifyCompoundCertificate, intersectIntervals, mergeIntervals, compareEndpoints } from '../engine/compound-inequalities.js';

test('compound chains, AND and OR preserve exact boundaries', () => {
  for (const [source, answer] of [
    ['-2 < 3x+1 <= 7', '(-1, 2]'], ['x>2 and x<1', '∅'], ['x<-2 or x>=3', '(-∞, -2) ∪ [3, ∞)'],
    ['0<x and x!=2', '(0, 2) ∪ (2, ∞)'], ['x<=0 or x>=0', '(-∞, ∞)'], ['1/3<=x<=2/3', '[1/3, 2/3]'],
    ['x>=2 and x<=2', '{2}'], ['x<0 or x>0', '(-∞, 0) ∪ (0, ∞)'],
  ]) { const out = solveCompoundInequality(source); assert.equal(out.status, 'solved', source); assert.equal(out.answer.solutionSet, answer, source); assert(verifyCompoundCertificate(source, out)); }
});
test('overlap and interval endpoint operations are rational not floating-point approximations', () => {
  assert.equal(compareEndpoints('1000000000000000000000001/3', '1000000000000000000000000/3'), 1);
  assert.equal(compareEndpoints('-∞', '0'), -1); assert.equal(compareEndpoints('∞', '0'), 1);
  assert.throws(() => compareEndpoints('sqrt(2)', '3'));
});
test('compound proofs reject forgery, extra variables, malformed chains and unsupported endpoints', () => {
  const source = '0<x<3', out = solveCompoundInequality(source), forged = structuredClone(out); forged.answer.solutionSet = '[0,3]'; assert(!verifyCompoundCertificate(source, forged));
  for (const source of ['x>1 and y<2', 'x<', 'x^2<2 and x>0']) { const out = solveCompoundInequality(source); assert.notEqual(out.status, 'solved'); assert.equal(out.verified, false); }
});
