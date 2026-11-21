import test from 'node:test';
import assert from 'node:assert/strict';
import { Q } from '../engine/core.js';
import { solveParametric, verifyParametricCertificate } from '../engine/parametric.js';

const request = (operation, x, y, extras = {}) => ({ kind: 'parametric', operation, x, y, ...extras });
const copy = value => JSON.parse(JSON.stringify(value));
function solved(input) {
  const output = solveParametric(input);
  assert.equal(output.status, 'solved', output.error);
  assert.equal(output.verified, true);
  assert.equal(output.kind, 'parametric');
  assert.equal(output.answer.exact, true);
  assert.equal(output.certificate.type, 'parametric');
  assert.equal(output.certificate.assurance, 'exact-rational-replay');
  assert.equal(verifyParametricCertificate(input, output), true);
  assert.equal(verifyParametricCertificate(input, copy(output)), true);
  return output;
}
function rejected(input, status) {
  const output = solveParametric(input);
  assert.equal(output.status, status, output.error);
  assert.equal(output.verified, false);
  assert.equal(output.certificate, null);
  assert.equal(verifyParametricCertificate(input, output), false);
}

test('domains and exact rational evaluation honor open and closed bounds', () => {
  const domain = { type: 'interval', from: '-1/2', to: '3/2', includeFrom: false, includeTo: true };
  const input = request('domain', ['1/3', 2, 0], [0, '-3/2', 1], { domain });
  assert.deepEqual(solved(input).answer, { exact: true,
    parameterDomain: { ...domain }, coordinateDegrees: { x: 1, y: 2 } });
  const evaluated = solved(request('evaluate', ['1/3', 2], [0, '-3/2', 1], { domain, t: '1/2' }));
  assert.deepEqual(evaluated.answer.position, ['4/3', '-1/2']);
  assert.equal(evaluated.answer.t, '1/2');
  rejected(request('evaluate', [1, 1], [2], { domain, t: '-1/2' }), 'invalid');
  rejected(request('evaluate', [1, 1], [2], { domain: { ...domain, includeTo: false }, t: '3/2' }), 'invalid');
});

test('motion returns displacement and average velocity as signed exact vectors', () => {
  const input = request('motion', [0, '1/2', 1], [3, -2], { from: '-1/2', to: '3/2' });
  const answer = solved(input).answer;
  assert.deepEqual(answer.start, ['0', '4']);
  assert.deepEqual(answer.end, ['3', '0']);
  assert.deepEqual(answer.displacement, ['3', '-4']);
  assert.deepEqual(answer.averageVelocity, ['3/2', '-2']);
  const reverse = solved({ ...input, from: input.to, to: input.from }).answer;
  assert.deepEqual(reverse.displacement, ['-3', '4']);
  assert.deepEqual(reverse.averageVelocity, ['3/2', '-2']);
  rejected({ ...input, to: input.from }, 'invalid');
  rejected({ ...input, domain: { type: 'interval', from: 0, to: 2,
    includeFrom: true, includeTo: true } }, 'invalid');
});

test('affine elimination records a complete line and the image interval', () => {
  const domain = { type: 'interval', from: 0, to: 2, includeFrom: false, includeTo: true };
  const line = solved(request('eliminate', [1, 2], [3, -4], { domain })).answer.relation;
  assert.deepEqual(line, { type: 'line', independent: 'x', dependent: 'y',
    slope: '-2', intercept: '5', independentRange: {
      lower: '1', upper: '5', lowerClosed: false, upperClosed: true } });
  const vertical = solved(request('eliminate', [4], [1, 2])).answer.relation;
  assert.deepEqual(vertical, { type: 'line', independent: 'y', dependent: 'x',
    slope: '0', intercept: '4', independentRange: {
      lower: '-∞', upper: '∞', lowerClosed: false, upperClosed: false } });
  assert.deepEqual(solved(request('eliminate', [4], ['3/2'])).answer.relation,
    { type: 'point', x: '4', y: '3/2' });
});

test('dependent quadratics include exact image ranges and endpoint topology', () => {
  const all = solved(request('eliminate', [1, 0, 1], [-1, 0, 2])).answer.relation;
  assert.equal(all.slope, '2');
  assert.equal(all.intercept, '-3');
  assert.deepEqual(all.independentRange,
    { lower: '1', upper: '∞', lowerClosed: true, upperClosed: false });
  const open = { type: 'interval', from: -1, to: 1, includeFrom: false, includeTo: false };
  const segment = solved(request('eliminate', [0, 0, 1], [0, 0, -1], { domain: open })).answer.relation;
  assert.deepEqual(segment.independentRange,
    { lower: '0', upper: '1', lowerClosed: true, upperClosed: false });
  const monotone = solved(request('eliminate', [0, 0, 1], [0, 0, 2],
    { domain: { type: 'interval', from: 1, to: 2, includeFrom: false, includeTo: true } })).answer.relation;
  assert.deepEqual(monotone.independentRange,
    { lower: '1', upper: '4', lowerClosed: false, upperClosed: true });
});

test('independent quadratics provide a sufficient Cartesian relation and recovered parameter', () => {
  const domain = { type: 'interval', from: -1, to: 2, includeFrom: true, includeTo: false };
  const input = request('eliminate', [1, 2, 1], [0, 1, -1], { domain });
  const output = solved(input), relation = output.answer.relation;
  assert.equal(relation.type, 'implicit_quadratic');
  assert.deepEqual(relation.parameterDomain,
    { ...domain, from: '-1', to: '2' });
  const evaluate = t => [Q(1).add(Q(2).mul(t)).add(t.mul(t)), t.sub(t.mul(t))];
  for (const t of [Q(-1), Q(0), Q('1/2'), Q(2)]) {
    const [x, y] = evaluate(t), c = relation.coefficients;
    const lhs = Q(c.x2).mul(x.mul(x)).add(Q(c.xy).mul(x.mul(y))).add(Q(c.y2).mul(y.mul(y)))
      .add(Q(c.x).mul(x)).add(Q(c.y).mul(y)).add(Q(c.constant));
    assert.equal(String(lhs), '0');
    const p = relation.parameterRecovery;
    assert.equal(String(Q(p.x).mul(x).add(Q(p.y).mul(y)).add(Q(p.constant)).div(Q(p.denominator))), String(t));
  }
  assert.equal(relation.coefficients.x2, '1');
  assert.equal(relation.parameterRecovery.denominator, '-3');
});

test('schema, degree, malformed domain, and arithmetic bounds reject without claims', () => {
  rejected(request('eliminate', [0, 0, 0, 1], [1, 2]), 'unsupported');
  rejected(request('evaluate', [0, 0, 0, 0, 0, 0, 0, 1], [1], { t: 1 }), 'invalid');
  rejected(request('evaluate', [1], [2], { t: 0, extra: true }), 'invalid');
  rejected(request('domain', [1], [2], { t: 0 }), 'invalid');
  rejected(request('evaluate', [1], [2], { t: Number.MAX_SAFE_INTEGER + 1 }), 'invalid');
  rejected(request('evaluate', [1], [2], { t: '1e100' }), 'unresolved');
  rejected(request('domain', [1], [2], { domain: { type: 'interval', from: 2, to: 1,
    includeFrom: true, includeTo: true } }), 'invalid');
  rejected(request('domain', [1], [2], { domain: { type: 'interval', from: 1, to: 1,
    includeFrom: false, includeTo: true } }), 'invalid');
  rejected(request('derivative', [1], [2]), 'unsupported');
});

test('certificate replay rejects changed answers, evidence, steps, restrictions, and inputs', () => {
  const input = request('eliminate', [1, 2, 1], [0, 1, -1]);
  const original = solved(input);
  for (const mutate of [
    value => { value.answer.relation.coefficients.x2 = '2'; },
    value => { value.answer.relation.parameterRecovery.denominator = '3'; },
    value => { value.certificate.evidence.determinant = '9'; },
    value => { value.steps[0].verified = false; },
    value => { value.restrictions.pop(); },
    value => { value.injected = true; },
  ]) {
    const forged = copy(original); mutate(forged);
    assert.equal(verifyParametricCertificate(input, forged), false);
  }
  assert.equal(verifyParametricCertificate({ ...input, x: [1, 3, 1] }, original), false);
  assert.equal(verifyParametricCertificate(input, { status: 'solved', verified: true }), false);
  assert.equal(verifyParametricCertificate(input, null), false);
});
