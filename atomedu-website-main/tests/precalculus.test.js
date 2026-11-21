import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePrecalculus, verifyPrecalculusCertificate } from '../engine/precalculus.js';

const request = (topic, operation, fields = {}) => ({ kind: 'precalculus', topic, operation, ...fields });
const clone = value => JSON.parse(JSON.stringify(value));

function checked(input) {
  const result = solvePrecalculus(input);
  assert.equal(result.status, 'solved', result.error || JSON.stringify(input));
  assert.equal(result.verified, true);
  assert.equal(result.topic, input.topic);
  assert.equal(result.answer.exact, true);
  assert.equal(result.certificate.type, 'precalculus');
  assert.equal(result.certificate.version, 1);
  assert.equal(result.certificate.assurance, 'exact-biquadratic-replay');
  assert.ok(result.steps.length > 0);
  assert.ok(result.steps.every(step => step.verified === true && step.rule && step.explanation &&
    typeof step.before === 'string' && typeof step.after === 'string'));
  assert.equal(verifyPrecalculusCertificate(input, result), true);
  assert.equal(verifyPrecalculusCertificate(input, clone(result)), true);
  return result.answer;
}

function rejected(input, status) {
  const result = solvePrecalculus(input);
  assert.equal(result.status, status, result.error || JSON.stringify(input));
  assert.equal(result.verified, false);
  assert.equal(result.certificate, null);
  assert.equal(verifyPrecalculusCertificate(input, result), false);
}

test('unit-circle values stay exact through quadrants, 15-degree angles, and tangent poles', () => {
  const thirty = checked(request('trigonometry', 'unit_circle', { angle: '1/6' }));
  assert.equal(thirty.cos.expression, 'sqrt(3)/2');
  assert.equal(thirty.sin.expression, '1/2');
  assert.equal(thirty.tan.expression, 'sqrt(3)/3');
  const fifteen = checked(request('trigonometry', 'unit_circle', { angle: '1/12' }));
  assert.equal(fifteen.cos.expression, 'sqrt(2)/4 + sqrt(6)/4');
  assert.equal(fifteen.sin.expression, '-sqrt(2)/4 + sqrt(6)/4');
  assert.equal(fifteen.tan.expression, '2 - sqrt(3)');
  const right = checked(request('trigonometry', 'unit_circle', { angle: '1/2' }));
  assert.equal(right.cos.expression, '0');
  assert.equal(right.sin.expression, '1');
  assert.equal(right.tan, null);
  const negative = checked(request('trigonometry', 'unit_circle', { angle: '-1/6' }));
  assert.equal(negative.piMultiple, '11/6');
  assert.equal(negative.sin.expression, '-1/2');
  assert.equal(negative.cos.expression, 'sqrt(3)/2');
  const manyTurns = checked(request('trigonometry', 'unit_circle', { angle: '1000009/6' }));
  assert.equal(manyTurns.piMultiple, '1/6');
  assert.equal(manyTurns.sin.expression, '1/2');
});

test('angle sum, difference, and double-angle formulas agree with exact circle values', () => {
  const sum = checked(request('trigonometry', 'angle_sum', { angleA: '1/6', angleB: '1/4' }));
  assert.equal(sum.piMultiple, '5/12');
  assert.equal(sum.cos.expression, '-sqrt(2)/4 + sqrt(6)/4');
  assert.equal(sum.sin.expression, 'sqrt(2)/4 + sqrt(6)/4');
  const difference = checked(request('trigonometry', 'angle_difference', { angleA: '1/4', angleB: '1/6' }));
  assert.equal(difference.piMultiple, '1/12');
  assert.equal(difference.tan.expression, '2 - sqrt(3)');
  const doubled = checked(request('trigonometry', 'double_angle', { angle: '1/12' }));
  assert.equal(doubled.piMultiple, '1/6');
  assert.equal(doubled.cos.expression, 'sqrt(3)/2');
  assert.equal(doubled.sin.expression, '1/2');
});

const equation = (fn, target, lower, upper, endpointFlags = {}) => request('trigonometry', 'solve_equation', {
  function: fn, target, interval: { lower, upper, ...endpointFlags },
});

test('trigonometric equations return all exact roots in finite intervals', () => {
  const sine = checked(equation('sin', '1/2', 0, 2));
  assert.deepEqual(sine.baseSolutions, ['1/6', '5/6']);
  assert.deepEqual(sine.solutions, ['1/6', '5/6']);
  assert.equal(sine.periodPi, '2');
  assert.deepEqual(checked(equation('cos', 0, 0, 2)).solutions, ['1/2', '3/2']);
  assert.deepEqual(checked(equation('sin', 1, -1, 3)).solutions, ['1/2', '5/2']);
  assert.deepEqual(checked(equation('tan', 1, '-3/4', '9/4')).solutions,
    ['-3/4', '1/4', '5/4', '9/4']);
  const tangentTarget = checked(request('trigonometry', 'unit_circle', { angle: '1/6' })).tan.coefficients;
  assert.deepEqual(checked(equation('tan', tangentTarget, 0, 2)).solutions, ['1/6', '7/6']);
  const fifteenTarget = checked(request('trigonometry', 'unit_circle', { angle: '1/12' })).sin.coefficients;
  assert.deepEqual(checked(equation('sin', fifteenTarget, 0, 2)).solutions, ['1/12', '11/12']);
  assert.deepEqual(checked(equation('cos', { sqrt2: '-1/2' }, 0, 2)).solutions, ['3/4', '5/4']);
  const impossible = checked(equation('sin', 2, -10, 10));
  assert.deepEqual(impossible.solutions, []);
  assert.deepEqual(impossible.baseSolutions, []);
  assert.equal(impossible.complete, true);
});

test('trigonometric equation bounds use exact floors, ceilings, and endpoint flags', () => {
  assert.deepEqual(checked(equation('sin', 0, -2, 2)).solutions, ['-2', '-1', '0', '1', '2']);
  assert.deepEqual(checked(equation('sin', 0, -2, 2,
    { includeLower: false, includeUpper: false })).solutions, ['-1', '0', '1']);
  assert.deepEqual(checked(equation('tan', 1, '-3/4', '9/4',
    { includeLower: false, includeUpper: false })).solutions, ['1/4', '5/4']);
  assert.deepEqual(checked(equation('sin', '1/2', '1/7', '5/6',
    { includeUpper: false })).solutions, ['1/6']);
  assert.deepEqual(checked(equation('cos', 1, 0, 0)).solutions, ['0']);
  assert.deepEqual(checked(equation('cos', 1, 0, 0, { includeLower: false })).solutions, []);
  assert.deepEqual(checked(equation('tan', 0, '-1000000000001', '-999999999999')).solutions,
    ['-1000000000001', '-1000000000000', '-999999999999']);
});

test('equation solving rejects targets or intervals without a complete certified result', () => {
  rejected(equation('sin', '1/3', 0, 2), 'unsupported');
  rejected(equation('tan', 2, 0, 2), 'unsupported');
  rejected(equation('sin', { sqrt5: 1 }, 0, 2), 'invalid');
  rejected(equation('sec', 1, 0, 2), 'invalid');
  rejected(equation('cos', 1, 2, 0), 'invalid');
  rejected(equation('sin', 0, 0, 2, { includeLower: null }), 'invalid');
  rejected(equation('sin', 0, 0, 2, { includeUpper: 'false' }), 'invalid');
  rejected(equation('sin', 0, 0, 1000), 'unresolved');
});

test('equation certificates bind every root, endpoint decision, and period count', () => {
  const input = equation('sin', '1/2', '-2', '2', { includeLower: false });
  const original = solvePrecalculus(input);
  assert.equal(verifyPrecalculusCertificate(input, original), true);
  const edits = [
    report => { report.answer.solutions.pop(); },
    report => { report.answer.solutions[0] = '-5/6'; },
    report => { report.answer.baseSolutions.reverse(); },
    report => { report.answer.interval.includeLower = true; },
    report => { report.certificate.evidence.cycleRanges[0].firstCycle = '0'; },
    report => { report.certificate.evidence.rootCount = '99'; },
    report => { report.steps[1].rule = 'sampled_roots'; },
  ];
  for (const edit of edits) {
    const forged = clone(original); edit(forged);
    assert.equal(verifyPrecalculusCertificate(input, forged), false);
  }
  assert.equal(verifyPrecalculusCertificate(equation('sin', '1/2', '-2', '2'), original), false);
});

test('polar conversion, exact inverse matching, rotation, and products', () => {
  const cart = checked(request('polar', 'to_cartesian', { radius: 2, angle: '1/6' }));
  assert.deepEqual(cart.components.map(c => c.expression), ['sqrt(3)', '1']);
  assert.equal(cart.radius, '2');
  const back = checked(request('polar', 'to_polar', { point: cart.components.map(c => c.coefficients) }));
  assert.equal(back.radius.expression, '2');
  assert.equal(back.piMultiple, '1/6');
  const diagonal = checked(request('polar', 'to_polar', { point: [1, 1] }));
  assert.equal(diagonal.radius.expression, 'sqrt(2)');
  assert.equal(diagonal.piMultiple, '1/4');
  const left = checked(request('polar', 'to_polar', { point: [-1, 0] }));
  assert.equal(left.piMultiple, '1');
  const origin = checked(request('polar', 'to_polar', { point: [0, 0] }));
  assert.equal(origin.radius.expression, '0');
  assert.equal(origin.angleConvention, 'origin');
  assert.deepEqual(checked(request('polar', 'rotate', { point: [1, 0], angle: '1/2' })).components.map(c => c.expression), ['0', '1']);
  const product = checked(request('polar', 'polar_product', {
    first: { radius: 2, angle: '1/6' }, second: { radius: 3, angle: '1/3' },
  }));
  assert.equal(product.radius, '6');
  assert.equal(product.piMultiple, '1/2');
  assert.deepEqual(product.components.map(c => c.expression), ['0', '6']);
});

test('every supported angle round-trips through Cartesian coordinates without sampling', () => {
  for (let k = 0; k < 24; k++) {
    const angle = `${k}/12`;
    const forward = checked(request('polar', 'to_cartesian', { radius: '3/2', angle }));
    const inverse = checked(request('polar', 'to_polar', {
      point: forward.components.map(c => c.coefficients),
    }));
    assert.equal(inverse.radius.expression, '3/2', angle);
    assert.equal(inverse.piMultiple, forward.piMultiple, angle);
  }
});

test('vector arithmetic, inner and cross products, exact norms, projection, and rotation', () => {
  assert.deepEqual(checked(request('vector', 'add', { a: [1, 2], b: [3, 4] })).components.map(c => c.expression), ['4', '6']);
  assert.deepEqual(checked(request('vector', 'subtract', { a: [1, 2], b: [3, 4] })).components.map(c => c.expression), ['-2', '-2']);
  assert.deepEqual(checked(request('vector', 'scale', { a: [1, 2], factor: '3/2' })).components.map(c => c.expression), ['3/2', '3']);
  const inner = checked(request('vector', 'dot', { a: [1, 2], b: [3, 4] }));
  assert.equal(inner.value.expression, '11');
  assert.equal(inner.orthogonal, false);
  assert.equal(checked(request('vector', 'dot', { a: [1, 0], b: [0, 1] })).orthogonal, true);
  assert.equal(checked(request('vector', 'cross', { a: [1, 2], b: [3, 4] })).determinant.expression, '-2');
  assert.deepEqual(checked(request('vector', 'cross', { a: [1, 0, 0], b: [0, 1, 0] })).components.map(c => c.expression), ['0', '0', '1']);
  assert.equal(checked(request('vector', 'norm', { a: [3, 4] })).magnitude.expression, '5');
  assert.equal(checked(request('vector', 'norm', { a: [1, 1] })).magnitude.expression, 'sqrt(2)');
  assert.deepEqual(checked(request('vector', 'norm', { a: [1, 2] })).magnitude, { expression: 'sqrt(5)', radicand: '5' });
  const algebraicNorm = checked(request('vector', 'norm', { a: [{ rational: 1, sqrt2: 1 }, 0] }));
  assert.equal(algebraicNorm.magnitude.expression, 'sqrt(3 + 2*sqrt(2))');
  assert.equal(algebraicNorm.magnitude.radicand.expression, '3 + 2*sqrt(2)');
  assert.equal(checked(request('vector', 'distance', { a: [1, 2], b: [4, 6] })).magnitude.expression, '5');
  const projection = checked(request('vector', 'projection', { a: [2, 2], b: [1, 0] }));
  assert.equal(projection.factor.expression, '2');
  assert.deepEqual(projection.components.map(c => c.expression), ['2', '0']);
  const radicalProjection = checked(request('vector', 'projection', {
    a: [1, 0], b: [{ sqrt2: 1 }, 0],
  }));
  assert.equal(radicalProjection.factor.expression, 'sqrt(2)/2');
  assert.deepEqual(radicalProjection.components.map(c => c.expression), ['1', '0']);
  assert.deepEqual(checked(request('vector', 'rotate', { a: [1, 0], angle: '1/2' })).components.map(c => c.expression), ['0', '1']);
  const radicalDot = checked(request('vector', 'dot', { a: [{ sqrt2: 1 }, 0], b: [{ sqrt3: 1 }, 0] }));
  assert.equal(radicalDot.value.expression, 'sqrt(6)');
});

test('unsupported inverse angles, untrusted approximate inputs, and malformed structures do not verify', () => {
  rejected(request('polar', 'to_polar', { point: [3, 4] }), 'unsupported');
  rejected(request('trigonometry', 'unit_circle', { angle: '1/7' }), 'unsupported');
  rejected(request('vector', 'rotate', { a: [1, 2, 3], angle: '1/6' }), 'invalid');
  rejected(request('vector', 'projection', { a: [1, 2], b: [0, 0] }), 'invalid');
  rejected(request('vector', 'dot', { a: [1, 2], b: [1, 2, 3] }), 'invalid');
  rejected(request('polar', 'to_cartesian', { radius: -1, angle: 0 }), 'invalid');
  rejected(request('polar', 'to_cartesian', { radius: 1, angle: 0, guess: 42 }), 'invalid');
  rejected(request('vector', 'scale', { a: [1, 2], factor: { sqrt5: 1 } }), 'invalid');
  rejected(request('vector', 'norm', { a: [Number.NaN, 1] }), 'invalid');
  rejected(request('vector', 'norm', { a: [Number.MAX_SAFE_INTEGER + 1, 1] }), 'invalid');
});

test('certificate replay rejects changes to input, steps, answer, evidence, or report shape', () => {
  const input = request('polar', 'to_cartesian', { radius: '7/3', angle: '1/12' });
  const original = solvePrecalculus(input);
  assert.equal(verifyPrecalculusCertificate(input, original), true);
  const edits = [
    report => { report.answer.components[0].coefficients.sqrt6 = '0'; },
    report => { report.answer.components[0].expression = '7'; },
    report => { report.steps[0].verified = false; },
    report => { report.steps[0].rule = 'numerical_guess'; },
    report => { report.certificate.evidence.normSquared = '0'; },
    report => { report.certificate.assurance = 'sampled'; },
    report => { report.restrictions.push('extra'); },
    report => { report.answer.extra = true; },
  ];
  for (const edit of edits) {
    const forged = clone(original); edit(forged);
    assert.equal(verifyPrecalculusCertificate(input, forged), false);
  }
  assert.equal(verifyPrecalculusCertificate({ ...input, angle: '1/6' }, original), false);
  assert.equal(verifyPrecalculusCertificate(input, { ...original, status: 'unsupported' }), false);
});
