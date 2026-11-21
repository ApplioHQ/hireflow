import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult } from '../engine/index.js';

test('public facade accepts only fully parsed word templates and replays their facts', () => {
  const examples = [
    ['A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled?', '6', 'quantity'],
    ['The sum of three consecutive integers is 72. Find the integers.', '23', 'integers'],
    ['A jacket costs $80 and is discounted by 25%. What is the sale price?', '60', 'salePrice'],
  ];
  for (const [problem, first, field] of examples) {
    const result = solve(problem);
    assert.equal(result.status, 'solved', result.error);
    assert.equal(result.verified, true);
    assert.equal(result.latex.valid, true);
    assert.equal(result.certificate.type, 'word_problem');
    assert.equal(verifyResult(problem, result), true);
    assert.equal(Array.isArray(result.answer[field]) ? result.answer[field][0] : result.answer[field], first);
    const changed = structuredClone(result);
    changed.answer.exact = false;
    assert.equal(verifyResult(problem, changed), false);
  }
  const unsupported = solve('A train travels 60 miles in 2 hours. What is its speed?');
  assert.notEqual(unsupported.status, 'solved');
  assert.equal(unsupported.verified, false);
});
