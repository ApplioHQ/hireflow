import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult, getCapabilities } from '../engine/index.js';

test('public solver certifies exact regression and two-way probability without promoting previews', () => {
  const examples = [
    [{ kind: 'data_reasoning', topic: 'regression', operation: 'fit', points: [[0, 1], [1, 3], [2, 5]], at: '5/2' }, 3, '6'],
    [{ kind: 'data_reasoning', topic: 'two_way_table', operation: 'conditional_probability', table: [[12, 8], [3, 7]], event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 1 } }, 2, '8/15'],
  ];
  for (const [input, tier, value] of examples) {
    const result = solve(input);
    assert.equal(result.status, 'solved', result.error);
    assert.equal(result.verified, true);
    assert.equal(result.routing.finalEngine, tier);
    assert.equal(result.latex.valid, true);
    assert.equal(verifyResult(input, result), true);
    assert.equal(result.answer.prediction ?? result.answer.probability, value);
    const changed = structuredClone(result);
    changed.answer.exact = false;
    assert.equal(verifyResult(input, changed), false);
  }
  assert.match(getCapabilities().additional.join(' '), /least-squares/);
});
