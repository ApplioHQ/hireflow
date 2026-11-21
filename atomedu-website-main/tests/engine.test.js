import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult, checkWork, generateProblem, TOPICS, getCapabilities } from '../engine/index.js';
import { Q, parseExpression, symbolicEqual } from '../engine/core.js';

test('routing boundaries, capability preflight, and escalation are explicit', () => {
  for (const [difficulty, tier] of [['0.000', 1], ['0.399', 1], ['0.400', 2], ['0.649', 2], ['0.650', 3], ['1.000', 3]]) {
    const r = solve('2x=8', { difficulty }); assert.equal(r.status, 'solved'); assert.equal(r.routing.initialEngine, tier); assert.equal(r.routing.finalEngine, tier);
  }
  const escalated = solve('x^2-5x+6=0', { difficulty: '0.100' });
  assert.equal(escalated.routing.attempts[0].status, 'unsupported'); assert.equal(escalated.routing.finalEngine, 2); assert.equal(escalated.verified, true);
  assert.equal(solve('2^x=8', { difficulty: '0.100' }).routing.finalEngine, 3);
  assert.equal(solve('2x=8', { difficulty: 0.4 }).status, 'invalid');
});
test('all generated topic families solve and reverify across independent seeds and tiers', () => {
  for (const topic of TOPICS) for (const difficulty of ['0.100', '0.500', '0.900']) for (let seed = 0; seed < 16; seed++) {
    const p = generateProblem({ topic: topic.id, difficulty, seed }), r = solve(p.input, { difficulty });
    assert.equal(r.status, 'solved', `${topic.id}/${difficulty}/${seed}: ${r.error}`); assert.equal(r.verified, true); assert(verifyResult(p.input, r), topic.id);
    if (p.expected.kind === 'solutions') assert.deepEqual([...r.answer.solutions].sort(), [...p.expected.solutions].sort(), p.id);
    if (p.expected.kind === 'expression') assert(symbolicEqual(parseExpression(r.answer.expression), parseExpression(p.expected.expression)), p.id);
    if (p.expected.kind === 'system') for (const [v, value] of Object.entries(p.expected.solutions)) assert.equal(r.answer.values[v], value, p.id);
    if (p.expected.kind === 'sequence') assert.equal(r.answer.value, String(p.expected.exact), p.id);
    if (p.expected.kind === 'geometry') assert.equal(p.topic === 'distance' ? r.answer.distance.value : r.answer.side.value, p.expected.value, p.id);
  }
});
test('frontend text commands, structured JSON, and systems share the engine', () => {
  for (const p of ['solve 2x+1=9', 'factor x^2-5x+6', 'distance (0,0) (3,4)', 'area circle radius 3', 'pythagoras a=3 b=4', 'x+y=3; x-y=1', 'f(x)=2/(x-3)+1']) {
    const r = solve(p); assert.equal(r.status, 'solved', `${p}: ${r.error}`); assert(verifyResult(p, r), p);
  }
  assert.equal(solve('{"kind":"sequence","type":"arithmetic","first":2,"step":3,"n":5}').answer.value, '14');
});
test('numeric or symbolic extension previews never get upgraded to a proof', () => {
  const exact = solve('sqrt(8)+sqrt(2)'); assert.equal(exact.status, 'solved'); assert.equal(exact.verified, true); assert(verifyResult('sqrt(8)+sqrt(2)', exact));
  const complex = solve('(2+3i)*(1-i)'); assert.equal(complex.status, 'solved'); assert.equal(complex.answer.value, '5 + i'); assert(verifyResult('(2+3i)*(1-i)', complex));
  const symbolic = solve({ kind: 'evaluate', expression: 'ln(2)' }); assert.equal(symbolic.verified, false); assert.notEqual(symbolic.status, 'solved');
});
test('result verification binds certificates to the actual requested problem', () => {
  assert.equal(verifyResult('x=3', solve('x=4')), false);
  const r = solve('2x=8'); r.answer.solutions = ['5']; assert.equal(verifyResult('2x=8', r), false);
  const geometry = solve('area circle radius 3'); geometry.answer.area.value = 1; assert.equal(verifyResult('area circle radius 3', geometry), false);
});
test('axis-aligned conics and y equals expression are recognized from ordinary notation', () => {
  for (const p of ['x^2+y^2=25', 'x^2/9+y^2/4=1', 'x^2-y^2=1', 'y^2=8x', 'y=2/(x-3)+1', 'conic y=x^2']) {
    const out = solve(p); assert.equal(out.status, 'solved', `${p}: ${out.error}`); assert.equal(out.verified, true); assert(verifyResult(p, out), p);
  }
  const circle = solve('x^2+y^2=25'); assert.equal(circle.answer.classification, 'circle');
});
test('unsupported and malformed inputs never leave Engine 3 with a verified guess', () => {
  for (const input of ['', 'x +', '1/0', 'x^5-x-1=0', 'sin(x)=x', { kind: 'unknown' }, '{broken json}']) {
    const r = solve(input); assert.notEqual(r.status, 'solved', String(input)); assert.equal(r.verified, false); assert(r.error);
  }
  const bounded = solve('x^10000=1'); assert.equal(bounded.verified, false);
  assert.equal(checkWork('sqrt(x^2)', ['x']).status, 'unresolved');
});
test('capabilities describe measured support without a false curriculum percentage', () => {
  assert(getCapabilities().limits.length); assert(getCapabilities().algebra_1.length); assert(getCapabilities().algebra_2.length); assert(getCapabilities().geometry.length);
});
