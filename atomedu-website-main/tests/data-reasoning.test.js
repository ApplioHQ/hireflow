import test from 'node:test';
import assert from 'node:assert/strict';
import { solveDataReasoning, verifyDataReasoningCertificate } from '../engine/data-reasoning.js';

const request = (topic, operation, fields = {}) => ({ kind: 'data_reasoning', topic, operation, ...fields });
const copy = value => JSON.parse(JSON.stringify(value));

function solved(input) {
  const result = solveDataReasoning(input);
  assert.equal(result.status, 'solved', result.error);
  assert.equal(result.verified, true);
  assert.equal(result.answer.exact, true);
  assert.equal(result.certificate.type, 'data_reasoning');
  assert.equal(result.certificate.version, 1);
  assert.equal(result.certificate.assurance, 'exact-replay');
  assert.ok(result.steps.every(step => step.verified && step.rule && step.explanation));
  assert.equal(verifyDataReasoningCertificate(input, result), true);
  assert.equal(verifyDataReasoningCertificate(input, copy(result)), true);
  return result;
}

function rejected(input, status) {
  const result = solveDataReasoning(input);
  assert.equal(result.status, status, result.error);
  assert.equal(result.verified, false);
  assert.equal(result.certificate, null);
  assert.equal(verifyDataReasoningCertificate(input, result), false);
}

test('least-squares regression uses exact paired sums, line and rational correlation', () => {
  const input = request('regression', 'fit', { points: [[0, 1], [1, 3], [2, 5]], at: '5/2' });
  const result = solved(input);
  assert.deepEqual(result.answer, {
    slope: '2', intercept: '1', correlation: '1', correlationSquared: '1',
    at: '5/2', prediction: '6', exact: true
  });
  assert.deepEqual(result.certificate.evidence.sums, { x: '3', y: '9', xx: '5', yy: '35', xy: '13' });
  assert.deepEqual(result.certificate.evidence.centered, { xx: '6', yy: '24', xy: '12' });
  assert.deepEqual(result.certificate.evidence.normalEquations, { residualSum: '0', xResidualSum: '0' });

  const fractional = solved(request('regression', 'fit', {
    points: [['1/2', '2/3'], ['3/2', '5/3'], ['5/2', '8/3']]
  }));
  assert.equal(fractional.answer.slope, '1');
  assert.equal(fractional.answer.intercept, '1/6');
  assert.equal(fractional.answer.correlation, '1');
});

test('correlation retains a radical when irrational and handles degeneracy explicitly', () => {
  const input = request('regression', 'correlation', { points: [[0, 0], [1, 0], [2, 1]] });
  const result = solved(input);
  assert.equal(result.answer.slope, '1/2');
  assert.equal(result.answer.intercept, '-1/6');
  assert.equal(result.answer.correlation, '3/sqrt(12)');
  assert.equal(result.answer.correlationSquared, '3/4');

  const negative = solved(request('regression', 'correlation', { points: [[0, 2], [1, 1], [2, 0]] }));
  assert.equal(negative.answer.correlation, '-1');
  const flatY = solved(request('regression', 'fit', { points: [[0, 4], [1, 4], [2, 4]] }));
  assert.equal(flatY.answer.slope, '0');
  assert.equal(flatY.answer.correlation, null);
  assert.equal(flatY.answer.correlationSquared, null);
  rejected(request('regression', 'correlation', { points: [[0, 4], [1, 4]] }), 'unsupported');
  rejected(request('regression', 'fit', { points: [[1, 2], [1, 3]] }), 'unsupported');
});

test('two-way conditional probability counts intersections and given events', () => {
  const table = [[12, 8], [3, 7]];
  const input = request('two_way_table', 'conditional_probability', {
    table, event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 1 }
  });
  const result = solved(input);
  assert.deepEqual(result.answer, { probability: '8/15', jointCount: '8', givenCount: '15', exact: true });
  assert.deepEqual(result.certificate.evidence.rowTotals, ['20', '10']);
  assert.deepEqual(result.certificate.evidence.columnTotals, ['15', '15']);

  const disjoint = solved(request('two_way_table', 'conditional_probability', {
    table, event: { axis: 'row', index: 0 }, given: { axis: 'row', index: 1 }
  }));
  assert.equal(disjoint.answer.probability, '0');
  const identical = solved(request('two_way_table', 'conditional_probability', {
    table, event: { axis: 'column', index: 1 }, given: { axis: 'column', index: 1 }
  }));
  assert.equal(identical.answer.probability, '1');
});

test('independence tests every cell by exact cross products', () => {
  const yes = solved(request('two_way_table', 'independence', { table: [[2, 4, 6], [3, 6, 9]] }));
  assert.equal(yes.answer.independent, true);
  assert.deepEqual(yes.certificate.evidence.crossProducts[0][0], {
    observedTimesTotal: '60', marginalProduct: '60'
  });
  const no = solved(request('two_way_table', 'independence', { table: [[1, 1], [1, 2]] }));
  assert.equal(no.answer.independent, false);
  const zeroRow = solved(request('two_way_table', 'independence', { table: [[0, 0], [2, 3]] }));
  assert.equal(zeroRow.answer.independent, true);
  rejected(request('two_way_table', 'conditional_probability', {
    table: [[0, 1], [0, 3]], event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 0 }
  }), 'unsupported');
});

test('bounded combinatorial counts and probabilities use exact integer ratios', () => {
  assert.equal(solved(request('combinatorial_probability', 'combination', { n: 10, k: 3 })).answer.count, '120');
  assert.equal(solved(request('combinatorial_probability', 'permutation', { n: 10, k: 3 })).answer.count, '720');
  const urn = solved(request('combinatorial_probability', 'hypergeometric', {
    population: 10, successes: 4, draws: 3, exactSuccesses: 2
  }));
  assert.equal(urn.answer.probability, '3/10');
  assert.equal(urn.answer.favorable, '36');
  assert.equal(urn.answer.total, '120');
  assert.equal(solved(request('combinatorial_probability', 'hypergeometric', {
    population: 5, successes: 1, draws: 4, exactSuccesses: 0
  })).answer.probability, '1/5');
  assert.equal(solved(request('combinatorial_probability', 'binomial', {
    trials: 3, successProbability: '1/4', exactSuccesses: 2
  })).answer.probability, '9/64');
  assert.equal(solved(request('combinatorial_probability', 'binomial', {
    trials: 0, successProbability: 0, exactSuccesses: 0
  })).answer.probability, '1');
});

test('certificate replay rejects edits to answers, evidence, schema and source data', () => {
  const inputs = [
    request('regression', 'fit', { points: [[0, 0], [1, 2], [2, 1]] }),
    request('two_way_table', 'conditional_probability', { table: [[1, 2], [3, 4]], event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 1 } }),
    request('two_way_table', 'independence', { table: [[1, 2], [3, 4]] }),
    request('combinatorial_probability', 'hypergeometric', { population: 8, successes: 3, draws: 2, exactSuccesses: 1 }),
    request('combinatorial_probability', 'binomial', { trials: 4, successProbability: '1/3', exactSuccesses: 2 })
  ];
  for (const input of inputs) {
    const original = solved(input);
    for (const change of [
      result => { result.answer.exact = false; },
      result => { result.certificate.version = 2; },
      result => { result.certificate.evidence.fake = 'proof'; },
      result => { result.steps[0].verified = false; },
      result => { result.extra = 'unapproved'; }
    ]) {
      const forged = copy(original); change(forged);
      assert.equal(verifyDataReasoningCertificate(input, forged), false);
    }
    assert.equal(verifyDataReasoningCertificate({ ...input, changed: true }, original), false);
  }
  assert.equal(verifyDataReasoningCertificate(inputs[0], null), false);
  assert.equal(verifyDataReasoningCertificate(inputs[0], { status: 'solved', verified: true }), false);
});

test('invalid, unsupported, and budget-exceeding requests never claim proof', () => {
  rejected(request('regression', 'fit', { points: [[0, 0], [1, '1/0']] }), 'invalid');
  rejected(request('regression', 'fit', { points: [[0, 0], [1, 0.1]] }), 'invalid');
  rejected(request('regression', 'fit', { points: [[0, 0], [1, 1]], unknown: 1 }), 'invalid');
  rejected(request('regression', 'fit', { points: [[0, 0], , [1, 1]] }), 'invalid');
  rejected(request('regression', 'fit', { points: Array.from({ length: 101 }, (_, i) => [i, i]) }), 'unresolved');
  rejected(request('two_way_table', 'independence', { table: [[1, 2], [3]] }), 'invalid');
  rejected(request('two_way_table', 'independence', { table: [[-1, 2], [3, 4]] }), 'invalid');
  rejected(request('two_way_table', 'independence', { table: [[0, 0], [0, 0]] }), 'invalid');
  rejected(request('two_way_table', 'conditional_probability', { table: [[1, 2], [3, 4]], event: { axis: 'row', index: 2 }, given: { axis: 'column', index: 0 } }), 'invalid');
  rejected(request('combinatorial_probability', 'combination', { n: 3, k: 4 }), 'invalid');
  rejected(request('combinatorial_probability', 'binomial', { trials: 3, successProbability: '5/4', exactSuccesses: 1 }), 'invalid');
  rejected(request('combinatorial_probability', 'combination', { n: 501, k: 2 }), 'unresolved');
  rejected(request('combinatorial_probability', 'unknown', { n: 3, k: 2 }), 'unsupported');
  rejected(request('unknown', 'fit', {}), 'unsupported');
  rejected({ kind: 'other', topic: 'regression', operation: 'fit', points: [[0, 0], [1, 1]] }, 'invalid');
});
