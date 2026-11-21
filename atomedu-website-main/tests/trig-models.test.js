import test from 'node:test';
import assert from 'node:assert/strict';
import { Q } from '../engine/core.js';
import { solveTrigModels, verifyTrigModelsCertificate } from '../engine/trig-models.js';

const request = (operation, fields) => ({ kind: 'trig_models', operation, ...fields });
const clone = value => JSON.parse(JSON.stringify(value));
function solved(input) {
  const result = solveTrigModels(input);
  assert.equal(result.status, 'solved', result.error);
  assert.equal(result.verified, true);
  assert.equal(result.kind, 'trig_models');
  assert.equal(result.answer.exact, true);
  assert.equal(result.certificate.type, 'trig_models');
  assert.equal(result.certificate.version, 1);
  assert.ok(result.steps.length > 0);
  assert.ok(result.steps.every(step => step.verified && step.before && step.after && step.rule && step.explanation));
  assert.ok(Array.isArray(result.restrictions));
  assert.equal(verifyTrigModelsCertificate(input, result), true);
  assert.equal(verifyTrigModelsCertificate(input, clone(result)), true);
  return result;
}
function rejected(input, status) {
  const result = solveTrigModels(input);
  assert.equal(result.status, status, `${JSON.stringify(input)}: ${result.error}`);
  assert.equal(result.verified, false);
  assert.equal(result.certificate, null);
  assert.equal(result.answer, null);
  assert.deepEqual(result.steps, []);
  assert.equal(verifyTrigModelsCertificate(input, result), false);
}

test('sinusoidal models give exact parameters, range, and periodic extrema', () => {
  const first = solved(request('analyze', {
    function: 'sin', scale: '3/2', rate: '2/3', shift: '1/5', offset: '-1/4',
  })).answer;
  assert.equal(first.amplitude, '3/2');
  assert.deepEqual(first.period, { piMultiple: '3' });
  assert.deepEqual(first.frequency, { inversePiMultiple: '1/3' });
  assert.equal(first.angularFrequency, '2/3');
  assert.equal(first.phaseShift, '1/5');
  assert.equal(first.midline, '-1/4');
  assert.deepEqual(first.range, { minimum: '-7/4', maximum: '5/4' });
  assert.deepEqual(first.extrema.maximum, {
    value: '5/4', x: { rational: '1/5', piMultiple: '3/4', periodPiMultiple: '3' },
  });
  assert.deepEqual(first.extrema.minimum, {
    value: '-7/4', x: { rational: '1/5', piMultiple: '9/4', periodPiMultiple: '3' },
  });

  const negativeRate = solved(request('analyze', {
    function: 'sin', scale: '-2', rate: '-3', shift: '-1/2', offset: '4',
  })).answer;
  assert.equal(negativeRate.amplitude, '2');
  assert.equal(negativeRate.period.piMultiple, '2/3');
  assert.equal(negativeRate.frequency.inversePiMultiple, '3/2');
  assert.deepEqual(negativeRate.range, { minimum: '2', maximum: '6' });
  assert.equal(negativeRate.extrema.maximum.x.piMultiple, '1/6');
  assert.equal(negativeRate.extrema.minimum.x.piMultiple, '1/2');

  const negativeCos = solved(request('analyze', {
    function: 'cos', scale: '-5/3', rate: '1/2', shift: '0', offset: '2/3',
  })).answer;
  assert.equal(negativeCos.extrema.maximum.x.piMultiple, '2');
  assert.equal(negativeCos.extrema.minimum.x.piMultiple, '0');
  assert.deepEqual(negativeCos.range, { minimum: '-1', maximum: '7/3' });
});

test('principal inverse angles match exact rational and radical grid values', () => {
  const cases = [
    ['asin', '1/2', '1/6'],
    ['asin', '-1', '-1/2'],
    ['asin', '(sqrt(6)-sqrt(2))/4', '1/12'],
    ['acos', '-sqrt(3)/2', '5/6'],
    ['acos', '1', '0'],
    ['atan', '1', '1/4'],
    ['atan', '2-sqrt(3)', '1/12'],
    ['atan', '-(2+sqrt(3))', '-5/12'],
  ];
  for (const [fn, value, expected] of cases) {
    const answer = solved(request('inverse', { function: fn, value })).answer;
    assert.equal(answer.principalAngle.piMultiple, expected, `${fn}(${value})`);
  }
  assert.equal(solved(request('inverse', { function: 'asin', value: 0.5 })).answer.principalAngle.piMultiple, '1/6');
});

test('exact identities certify all three families and reject undefined sides', () => {
  const reciprocal = solved(request('identity', {
    identity: 'reciprocal', function: 'sec', angle: '1/3',
  })).answer;
  assert.equal(reciprocal.leftValue, '2');
  assert.equal(reciprocal.rightValue, '2');
  const cofunction = solved(request('identity', {
    identity: 'cofunction', function: 'tan', angle: '-1/12',
  })).answer;
  assert.equal(cofunction.leftValue, '-2 + sqrt(3)');
  assert.equal(cofunction.rightValue, cofunction.leftValue);
  for (const [family, angle] of [['sin_cos', '1/12'], ['tan_sec', '1/4'], ['cot_csc', '1/3']]) {
    const result = solved(request('identity', { identity: 'pythagorean', family, angle }));
    assert.equal(result.answer.holds, true);
    assert.deepEqual(result.certificate.evidence.left, result.certificate.evidence.right);
  }
  rejected(request('identity', { identity: 'reciprocal', function: 'csc', angle: 0 }), 'invalid');
  rejected(request('identity', { identity: 'cofunction', function: 'tan', angle: '1/2' }), 'invalid');
  rejected(request('identity', { identity: 'pythagorean', family: 'tan_sec', angle: '1/2' }), 'invalid');
});

test('the full pi/12 cycle closes exactly for cofunctions and Pythagorean identities', () => {
  for (let n = -12; n < 12; n++) {
    const angle = String(Q(n).div(12));
    const basic = solved(request('identity', { identity: 'pythagorean', family: 'sin_cos', angle }));
    assert.equal(basic.answer.leftValue, '1');
    for (const fn of ['sin', 'cos', 'tan', 'cot', 'sec', 'csc']) {
      const cofunction = solveTrigModels(request('identity', {
        identity: 'cofunction', function: fn, angle,
      }));
      if (cofunction.status === 'solved') {
        assert.equal(cofunction.answer.leftValue, cofunction.answer.rightValue);
        assert.equal(verifyTrigModelsCertificate(request('identity', {
          identity: 'cofunction', function: fn, angle,
        }), cofunction), true);
      } else {
        assert.equal(cofunction.status, 'invalid'); // A tangent, cotangent, secant, or cosecant pole.
      }
    }
  }
});

test('exact scope, domain, and budgets reject without a certificate', () => {
  rejected(request('analyze', { function: 'sin', scale: 0, rate: 1, shift: 0, offset: 0 }), 'invalid');
  rejected(request('analyze', { function: 'tan', scale: 1, rate: 1, shift: 0, offset: 0 }), 'unsupported');
  rejected(request('inverse', { function: 'asin', value: 'sqrt(2)' }), 'invalid');
  rejected(request('inverse', { function: 'acos', value: '-2' }), 'invalid');
  rejected(request('inverse', { function: 'atan', value: '1/5' }), 'unsupported');
  rejected(request('inverse', { function: 'asin', value: 'sqrt(5)/5' }), 'unsupported');
  rejected(request('identity', { identity: 'pythagorean', family: 'sin_cos', angle: '1/13' }), 'unsupported');
  rejected(request('identity', { identity: 'pythagorean', family: 'sin_cos', angle: '121' }), 'unresolved');
  rejected(request('analyze', { function: 'cos', scale: '1e100', rate: 1, shift: 0, offset: 0 }), 'unresolved');
  rejected(request('inverse', { function: 'asin', value: 'sqrt(2)', extra: 1 }), 'invalid');
  rejected(request('identity', { identity: 'reciprocal', angle: 0, function: 'sin', family: 'sin_cos' }), 'invalid');
});

test('certificate replay rejects changes to answers, evidence, steps, and input', () => {
  const input = request('inverse', { function: 'atan', value: '2-sqrt(3)' });
  const result = solved(input);
  for (const mutate of [
    report => { report.answer.principalAngle.piMultiple = '1/6'; },
    report => { report.certificate.evidence.forwardVector[0] = '9'; },
    report => { report.steps[0].verified = false; },
    report => { report.restrictions.pop(); },
    report => { report.extra = true; },
  ]) {
    const tampered = clone(result); mutate(tampered);
    assert.equal(verifyTrigModelsCertificate(input, tampered), false);
  }
  assert.equal(verifyTrigModelsCertificate(request('inverse', { function: 'atan', value: '1' }), result), false);
  assert.equal(verifyTrigModelsCertificate(input, { ...result, certificate: null }), false);
});

test('extrema phase representatives remain in one exact period', () => {
  for (const fn of ['sin', 'cos']) for (const scale of [-3, 4]) for (const rate of ['-5/2', '-1/3', '2/5', '7']) {
    const answer = solved(request('analyze', { function: fn, scale, rate, shift: '2/7', offset: 1 })).answer;
    const p = Q(answer.period.piMultiple);
    for (const kind of ['maximum', 'minimum']) {
      const x = answer.extrema[kind].x;
      assert.ok(Q(x.piMultiple).cmp(0) >= 0);
      assert.ok(Q(x.piMultiple).cmp(p) < 0);
      assert.equal(x.periodPiMultiple, String(p));
    }
  }
});
