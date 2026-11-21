import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult, getCapabilities } from '../engine/index.js';

test('public facade routes exact Precalculus requests through Engine 3 and replays certificates', () => {
  for (const input of [
    { kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/6' },
    { kind: 'precalculus', topic: 'polar', operation: 'to_cartesian', radius: 2, angle: '1/4' },
    { kind: 'precalculus', topic: 'vector', operation: 'dot', a: [1, 2], b: [3, 4] },
    { kind: 'precalculus', topic: 'trigonometry', operation: 'solve_equation', function: 'sin', target: '1/2', interval: { lower: 0, upper: 2 } },
    { kind: 'precalc_functions', topic: 'rates', operation: 'average_rate', function: { type: 'polynomial', coefficients: [2, -3, 1] }, from: '1/2', to: '3/2' },
    { kind: 'precalc_functions', topic: 'polynomial', operation: 'zeros', coefficients: [2, -3, 0, 1] },
    { kind: 'parametric', operation: 'evaluate', x: [1, 2], y: [0, 1, 1], t: '1/2' },
    { kind: 'trig_models', operation: 'analyze', function: 'sin', scale: '3/2', rate: '2/3', shift: '1/5', offset: '-1/4' },
    { kind: 'trig_models', operation: 'inverse', function: 'asin', value: '1/2' },
  ]) {
    const result = solve(input);
    assert.equal(result.status, 'solved', result.error);
    assert.equal(result.verified, true);
    assert.equal(result.routing.finalEngine, 3);
    assert.ok(['precalculus', 'precalc_functions', 'parametric', 'trig_models'].includes(result.certificate.type));
    assert.equal(result.latex.valid, true);
    assert.equal(verifyResult(input, result), true);
    const forged = structuredClone(result);
    forged.answer.exact = false;
    assert.equal(verifyResult(input, forged), false);
  }
});

test('unsupported Precalculus cases remain unverified and capabilities name the bounded scope', () => {
  const input = { kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/7' };
  const result = solve(input);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.verified, false);
  assert.equal(verifyResult(input, result), false);
  assert.match(getCapabilities().precalculus.join(' '), /pi\/12 grid/);
});
