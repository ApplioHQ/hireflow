import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, Rational, parseExpression, constantValue } from '../engine/core.js';
import { solveExtension, verifyExtensionCertificate } from '../engine/extensions.js';

const clone = value => JSON.parse(JSON.stringify(value));
function checked(input, verified = true) {
  const result = solveExtension(input);
  assert.equal(result.status, 'solved', result.error);
  assert.equal(result.verified, verified);
  assert.equal(result.answer.exact, true);
  assert.equal(result.certificate.version, 1);
  assert.ok(result.steps.length);
  assert.ok(result.steps.every(s => typeof s.before === 'string' && typeof s.after === 'string' &&
    s.rule && s.explanation && typeof s.verified === 'boolean'));
  if (verified) assert.ok(result.steps.every(s => s.verified));
  assert.ok(Array.isArray(result.restrictions));
  assert.equal(verifyExtensionCertificate(input, result), true);
  assert.equal(verifyExtensionCertificate(input, clone(result)), true, 'JSON transport preserves certificates');
  return result;
}
const sequence = fields => ({ kind: 'sequence', type: 'arithmetic', first: 2, step: 3, n: 4, ...fields });
const matrix = (operation, value, fields = {}) => ({ kind: 'matrix', operation, matrix: value, ...fields });
const expression = (value, fields = {}) => ({ kind: 'evaluate', expression: value, ...fields });
const complex = value => ({ kind: 'complex', expression: value });
const combinatorics = (operation, n, r) => ({ kind: 'combinatorics', operation, n, ...(r === undefined ? {} : { r }) });
const stats = values => ({ kind: 'statistics', values });

function rejected(input, status = 'invalid') {
  const result = solveExtension(input);
  assert.equal(result.status, status, `${JSON.stringify(input)}: ${result.error}`);
  assert.equal(result.verified, false);
  assert.equal(verifyExtensionCertificate(input, result), false);
  assert.deepEqual(result.answer, {});
  assert.ok(result.error);
  return result;
}

test('arithmetic terms, sums, aliases, exact decimals, and one-based indexing', () => {
  assert.equal(checked(sequence({})).answer.value, '11');
  assert.equal(checked(sequence({ task: 'sum' })).answer.value, '26');
  assert.equal(checked(sequence({ first: '1/3', step: '-1/6', n: '7' })).answer.value, '-2/3');
  assert.equal(checked(sequence({ first: '0.1', difference: '0.2', step: '1/5', n: 3 })).answer.value, '1/2');
  assert.equal(checked(sequence({ first: '-8/3', step: 0, n: 1 })).answer.value, '-8/3');
  assert.equal(checked(sequence({ first: 9, n: 0, task: 'sum' })).answer.value, '0');
  assert.equal(checked(sequence({ n: 1000, task: 'sum' })).answer.value, '1500500');
  assert.equal(checked(sequence({ n: Q('4'), first: 2n, step: new Rational(3n) })).answer.value, '11');
});

test('geometric recurrence handles ratios zero, one, negative, and powers above core pow bound', () => {
  const geo = fields => sequence({ type: 'geometric', ratio: 2, ...fields });
  assert.equal(checked(geo({ first: 3, n: 5 })).answer.value, '48');
  assert.equal(checked(geo({ first: 3, n: 5, task: 'sum' })).answer.value, '93');
  assert.equal(checked(geo({ first: '1/3', ratio: '-1/2', n: 4, task: 'sum' })).answer.value, '5/24');
  assert.equal(checked(geo({ first: -3, ratio: 1, n: 1000, task: 'sum' })).answer.value, '-3000');
  assert.equal(checked(geo({ first: '2/7', ratio: 0, n: 1 })).answer.value, '2/7');
  assert.equal(checked(geo({ first: '2/7', ratio: 0, n: 2 })).answer.value, '0');
  assert.equal(checked(geo({ first: '2/7', ratio: 0, n: 7, task: 'sum' })).answer.value, '2/7');
  assert.equal(checked(geo({ ratio: 0, n: 0, task: 'sum' })).answer.value, '0');
  assert.equal(checked(geo({ first: 1, n: 1000 })).answer.value, String(2n ** 999n));
  assert.equal(checked(geo({ first: 1, n: 1000, task: 'sum' })).answer.value, String(2n ** 1000n - 1n));
});

test('sequence validation rejects fractional, negative, conflicting, and over-budget inputs', () => {
  for (const fields of [{ n: 0 }, { n: -1 }, { n: '3/2' }, { n: null }, { n: NaN },
    { step: null }, { first: 'sqrt(2)' }, { task: null }, { step: 2, difference: 3 }]) rejected(sequence(fields));
  rejected(sequence({ n: 1001 }), 'unsupported');
  rejected(sequence({ type: 'harmonic' }), 'unsupported');
  rejected(sequence({ task: 'product' }), 'unsupported');
  rejected(sequence({ type: 'geometric', ratio: '1/0' }));
  rejected(sequence({ type: 'geometric', ratio: '1e1000', n: 1000 }), 'unsupported');
});

// Independent cofactor expansion checks elimination without copying its pivot algorithm.
function determinant(a) {
  if (a.length === 1) return Q(a[0][0]);
  return a[0].reduce((sum, entry, column) => {
    const minor = a.slice(1).map(row => row.filter((_, j) => j !== column));
    return sum.add(Q(entry).mul(determinant(minor)).mul(column % 2 ? -1 : 1));
  }, Q(0));
}
function product(a, b) {
  return a.map(row => b[0].map((_, j) => row.reduce((sum, entry, k) => sum.add(Q(entry).mul(b[k][j])), Q(0)).toString()));
}
function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? '1' : '0'));
}

test('determinants preserve pivot sign and rational exactness, including singular matrices', () => {
  for (const value of [[[5]], [[0]], [[0, 2], [3, 4]], [['1/2', '1/3'], ['2/5', '7/11']],
    [[0, 1, 3], [2, 0, 4], [5, 6, 0]], [[1, 2], [2, 4]]]) {
    const result = checked(matrix('determinant', value));
    assert.equal(result.answer.value, String(determinant(value)));
    assert.equal(result.answer.determinant, result.answer.value);
  }
  for (let seed = 0; seed < 12; seed++) {
    const value = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) =>
      `${((seed + 7) * (i + 3) + j * j + i * j * 7) % 19 - 9}/${(i + j) % 3 + 1}`));
    assert.equal(checked(matrix('determinant', value)).answer.value, String(determinant(value)));
  }
  const diagonal = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => i === j ? i + 1 : 0));
  assert.equal(checked(matrix('determinant', diagonal)).answer.value, '40320');
});

test('inverses are checked on both sides and row-operation witnesses replay exactly', () => {
  const value = [[0, '2/3', 1], [3, 4, 0], [2, -1, 5]];
  const result = checked(matrix('inverse', value));
  assert.deepEqual(product(value, result.answer.matrix), identity(3));
  assert.deepEqual(product(result.answer.matrix, value), identity(3));
  let augmented = value.map((row, i) => [...row.map(Q), ...identity(3)[i].map(Q)]);
  for (const operation of result.certificate.evidence.operations) {
    if (operation.kind === 'swap') {
      const [a, b] = operation.rows; [augmented[a], augmented[b]] = [augmented[b], augmented[a]];
    } else if (operation.kind === 'scale') {
      augmented[operation.row] = augmented[operation.row].map(x => x.mul(operation.factor));
    } else {
      augmented[operation.row] = augmented[operation.row].map((x, j) => x.add(
        augmented[operation.source][j].mul(operation.factor)));
    }
  }
  assert.deepEqual(augmented.map(row => row.map(String)), result.certificate.evidence.reduced);
  assert.equal(checked(matrix('inverse', [['2/3']])).answer.matrix[0][0], '3/2');
  const upper = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => j < i ? 0 : j === i ? 1 : 2));
  assert.deepEqual(product(upper, checked(matrix('inverse', upper)).answer.matrix), identity(8));
});

test('matrix products and rectangular RREF handle zero columns and dependent rows', () => {
  const a = [['1/2', 2, -1], [0, '1/3', 3]], b = [[2], ['-3/2'], [4]];
  assert.deepEqual(checked(matrix('multiply', a, { other: b })).answer.matrix, [['-6'], ['23/2']]);
  const rref = checked(matrix('rref', [[0, 2, 4, 6], [0, 1, 2, 4], [0, 0, 0, 0]]));
  assert.deepEqual(rref.answer.matrix, [['0', '1', '2', '0'], ['0', '0', '0', '1'], ['0', '0', '0', '0']]);
  assert.equal(rref.answer.rank, 2);
  assert.deepEqual(rref.answer.pivotColumns, [1, 3]);
  const zero = checked(matrix('rref', [[0, 0], [0, 0]]));
  assert.equal(zero.answer.rank, 0);
  assert.deepEqual(zero.answer.pivotColumns, []);
  assert.deepEqual(checked(matrix('rref', [[1], [2], [3]])).answer.matrix, [['1'], ['0'], ['0']]);
});

test('matrix validation rejects singular inverses, bad shapes, sparse entries, and bounds', () => {
  for (const value of [[], [[]], [[1, 2], [3]], ['12'], [[null]], [[Infinity]], [[1, '1/0']], [, [1]]])
    rejected(matrix('rref', value));
  rejected(matrix('inverse', [[1, 2], [2, 4]]));
  rejected(matrix('inverse', [[0]]));
  rejected(matrix('determinant', [[1, 2]]));
  rejected(matrix('multiply', [[1, 2]], { other: [[1, 2]] }));
  rejected(matrix('multiply', [[1]], {}));
  rejected(matrix('rref', [Array(9).fill(1)]), 'unsupported');
  rejected(matrix('rref', Array.from({ length: 9 }, () => [1])), 'unsupported');
  rejected(matrix('eigenvalues', [[1]]), 'unsupported');
});

test('statistics provide exact population and sample moments, even medians, and radical deviations', () => {
  const answer = checked(stats(['1/3', '2/3', 1])).answer;
  assert.equal(answer.sum, '2'); assert.equal(answer.mean, '2/3'); assert.equal(answer.median, '2/3');
  assert.equal(answer.variance, '2/27'); assert.equal(answer.standardDeviation, 'sqrt(2/27)');
  assert.equal(answer.sampleVariance, '1/9'); assert.equal(answer.sampleStandardDeviation, '1/3');
  assert.equal(answer.min, '1/3'); assert.equal(answer.max, '1');
  const even = checked(stats([10, '2/3', '-2/3', 0])).answer;
  assert.equal(even.median, '1/3'); assert.equal(even.mean, '5/2');
  assert.equal(checked(stats(['.1', '.2', '.3'])).answer.mean, '1/5');
  const singleton = checked(stats(['-7/3'])).answer;
  assert.equal(singleton.variance, '0'); assert.equal(singleton.standardDeviation, '0');
  assert.equal(singleton.sampleVariance, null); assert.equal(singleton.sampleStandardDeviation, null);
  assert.equal(checked(stats(Array(1000).fill('1/7'))).answer.variance, '0');
});

test('statistics order large and tiny rationals without numerical comparison or cancellation', () => {
  const large = checked(stats(['9007199254740993', '9007199254740995', '9007199254740994'])).answer;
  assert.equal(large.mean, '9007199254740994'); assert.equal(large.median, '9007199254740994');
  assert.equal(large.variance, '2/3');
  const small = checked(stats(['1e-400', '2e-400', '-1e-400', '0']));
  assert.equal(small.answer.median, String(Q('1e-400').div(2)));
  assert.equal(small.answer.mean, String(Q('1e-400').div(2)));
  assert.ok(Q(small.answer.variance).cmp(0) > 0);
  assert.equal(small.certificate.evidence.ordered[0], String(Q('-1e-400')));
  for (const values of [[], null, [NaN], [undefined], [true], [Infinity], [Number.MAX_SAFE_INTEGER + 1], Array(2)])
    rejected(stats(values));
  rejected(stats(Array(1001).fill(1)), 'unsupported');
});

function factorial(n) { let value = 1n; for (let i = 2n; i <= BigInt(n); i++) value *= i; return value; }
test('factorials, permutations, and combinations cover empty products and the full 1000 bound', () => {
  assert.equal(checked(combinatorics('factorial', 0)).answer.value, '1');
  assert.equal(checked(combinatorics('factorial', 1000)).answer.value, String(factorial(1000)));
  assert.equal(checked(combinatorics('permutations', 10, 3)).answer.value, '720');
  assert.equal(checked(combinatorics('permutations', 0, 0)).answer.value, '1');
  assert.equal(checked(combinatorics('permutations', 1000, 1000)).answer.value, String(factorial(1000)));
  assert.equal(checked(combinatorics('combinations', 1000, 500)).answer.value,
    String(factorial(1000) / (factorial(500) ** 2n)));
  assert.equal(checked(combinatorics('combinations', '12/2', '4/2')).answer.value, '15');
  for (const r of [0, 1, 6, 12, 25]) {
    const left = checked(combinatorics('combinations', 25, r));
    assert.equal(left.answer.value, checked(combinatorics('combinations', 25, 25 - r)).answer.value);
  }
  let sum = 0n;
  for (let r = 0; r <= 20; r++) sum += BigInt(checked(combinatorics('combinations', 20, r)).answer.value);
  assert.equal(sum, 2n ** 20n);
});

test('combinatorics enforce integer domains, required r, and resource bounds', () => {
  for (const input of [combinatorics('factorial', -1), combinatorics('factorial', '1/2'),
    combinatorics('factorial', '1/0'), combinatorics('combinations', 4, 5),
    combinatorics('permutations', 4), combinatorics('combinations', 4, -1)]) rejected(input);
  rejected(combinatorics('factorial', 1001), 'unsupported');
  rejected(combinatorics('combinations', 1000, 1001), 'unsupported');
  rejected(combinatorics('gamma', 3), 'unsupported');
});

test('rational evaluation uses parsed simultaneous substitution and parent constantValue', () => {
  const result = checked(expression('(x + y)^2/(x-y)', { values: { x: '1/2', y: '-1/3' } }));
  assert.equal(result.answer.value, '1/30');
  assert.equal(result.answer.form, 'rational');
  assert.equal(result.certificate.evidence.method, 'constant-value');
  assert.equal(checked(expression('x^2', { values: { x: '-1/2' } })).answer.value, '1/4');
  assert.equal(checked(expression('sqrt(81/16)+abs(-1/3)')).answer.value, '31/12');
  assert.equal(checked(expression('x/y + z', { values: { x: '0.1', y: '0.2', z: '1e-2' } })).answer.value, '51/100');
  assert.equal(checked(expression('i^2')).answer.value, '-1');
  assert.equal(checked(expression('sin(0)+cos(0)+exp(0)+ln(1)')).answer.value, '2');
});

test('radical arithmetic simplifies products, rational roots, conjugates, and absolute values', () => {
  const cases = [
    ['sqrt(2)+sqrt(8)', '3*sqrt(2)'], ['sqrt(12/25)', '2/5*sqrt(3)'],
    ['sqrt(1/2)', '1/2*sqrt(2)'], ['sqrt(2)*sqrt(3)', 'sqrt(6)'],
    ['(sqrt(2)+sqrt(3))*(sqrt(2)-sqrt(3))', '-1'],
    ['1/(sqrt(2)+sqrt(3))', '-sqrt(2) + sqrt(3)'],
    ['1/(1+sqrt(2))', '-1 + sqrt(2)'],
    ['(sqrt(2)+sqrt(3))^(-2)', '5 - 2*sqrt(6)'],
    ['abs(sqrt(2)-sqrt(3))', '-sqrt(2) + sqrt(3)'],
    ['2^(1/2)', 'sqrt(2)'], ['sqrt(999950884)', '31622'],
  ];
  for (const [source, expected] of cases) assert.equal(checked(expression(source)).answer.value, expected, source);
  const denominator = '(1+sqrt(2)+sqrt(3)+sqrt(5))';
  assert.equal(checked(expression(`(1/${denominator})*${denominator}`)).answer.value, '1');
  assert.equal(checked(expression('sqrt(10000000000000000000000000000000000000000)')).answer.value,
    '100000000000000000000');
});

test('exact complex arithmetic supports i powers, division, negative roots, and radical coefficients', () => {
  const result = checked(complex('(2+3i)*(1-i)'));
  assert.equal(result.answer.value, '5 + i'); assert.equal(result.answer.real, '5'); assert.equal(result.answer.imaginary, '1');
  const cases = [
    ['1/(1+i)', '1/2 - 1/2*i', '1/2', '-1/2'],
    ['i^64', '1', '1', '0'], ['i^-3', 'i', '0', '1'],
    ['sqrt(-8)*sqrt(-2)', '-4', '-4', '0'],
    ['sqrt(-4)+sqrt(-9)', '5*i', '0', '5'],
    ['abs(3+4i)', '5', '5', '0'],
    ['1/(sqrt(2)+i)', '1/3*sqrt(2) - 1/3*i', '1/3*sqrt(2)', '-1/3'],
    ['(sqrt(2)+sqrt(3)*i)^2', '-1 + 2*sqrt(6)*i', '-1', '2*sqrt(6)'],
  ];
  for (const [source, value, real, imaginary] of cases) {
    const answer = checked(complex(source)).answer;
    assert.equal(answer.value, value, source); assert.equal(answer.real, real); assert.equal(answer.imaginary, imaginary);
  }
  assert.equal(checked(expression('sqrt(-1)')).answer.form, 'complex');
  rejected(complex('1/(i-i)'));
  rejected(complex('sin(1)'), 'unsupported');
});

test('symbolic fallbacks preserve substituted precedence and label approximations as unverified', () => {
  const result = checked(expression('sin(x)^2+cos(x)^2', { values: { x: '-1/2' } }), false);
  assert.equal(result.answer.form, 'symbolic');
  assert.equal(result.answer.approximation.verified, false);
  assert.equal(result.certificate.assurance, 'symbolic-substitution');
  assert.ok(Math.abs(result.answer.approximation.value - 1) < 1e-14);
  assert.match(result.answer.value, /\(-1\/2\)/);
  const symbolic = checked(expression('pi*x^2', { values: { x: '-1/2' } }), false);
  assert.equal(symbolic.answer.value, '(pi * ((-1/2) ^ 2))');
  assert.equal(symbolic.answer.approximation.value, Math.PI / 4);
  assert.equal(checked(expression('exp(1000)'), false).answer.approximation.value, null);
  const large = checked(expression('sqrt(1000000000003)'), false);
  assert.equal(large.answer.form, 'symbolic');
  // Retaining a formula never certifies a domain condition we could not prove.
  assert.equal(checked(expression('log(1,sin(1))'), false).verified, false);
  assert.equal(checked(expression('tan(pi/2)-tan(pi/2)'), false).verified, false);
});

test('evaluation rejects missing variables, invalid domains, malformed syntax, and attempted code', () => {
  for (const input of [expression('x+1'), expression('x', { values: { x: 'x+1' } }),
    expression('x', { values: { x: null } }), expression('x', { values: null }),
    expression('x', { values: [] }), expression('x', { values: { x: 1, pi: 2 } }),
    expression('1/0'), expression('sin(1)/(2-2)'), expression('1/(sqrt(8)-2*sqrt(2))'),
    expression('1/(pi-pi)'), expression('0^-1'), expression('0^0'),
    expression('ln(0)'), expression('ln(-1)'), expression('ln(sqrt(2)-sqrt(3))'),
    expression('log(3,1)'), expression('log(3,-2)'), expression('ln(i)'),
    expression('sqrt(1,2)'), expression('2 +'), expression(''), expression(123),
    expression('globalThis.__extensionExecuted = 1'), expression('1; process.exit(1)'),
    expression('constructor.constructor("return process")()'), expression('import("node:fs")'),
    expression('alert(1)'), expression('x', { values: JSON.parse('{"__proto__":1,"x":2}') })]) rejected(input);
  assert.equal(globalThis.__extensionExecuted, undefined);
  rejected(expression('2^65'), 'unsupported');
  rejected(expression('1'.repeat(4097)), 'unsupported');
});

test('no input arrays or substitution objects are mutated', () => {
  const requests = [sequence({}), matrix('inverse', [[1, 2], [3, 4]]), matrix('rref', [[2, 3], [4, 6]]),
    matrix('multiply', [[1, 2]], { other: [[2], [3]] }), stats([3, 1, 2]),
    expression('x+y', { values: { x: '1/2', y: '1/3' } })];
  function freeze(value) {
    if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  for (const input of requests) {
    const snapshot = clone(input); checked(freeze(input)); assert.deepEqual(input, snapshot);
  }
});

test('certificate replay rejects answer, proof, restriction, input, and assurance tampering', () => {
  const input = matrix('inverse', [[0, 2], [3, 4]]), result = checked(input);
  const mutations = [
    r => { r.answer.matrix[0][0] = '0'; }, r => { r.answer.value[1][1] = '7'; },
    r => { r.steps[0].after = r.steps[0].before; }, r => { r.steps[0].verified = false; },
    r => { r.steps[0].explanation = 'Trust me.'; }, r => { r.steps.pop(); },
    r => { r.restrictions = []; }, r => { r.verified = false; }, r => { r.topic = 'statistics'; },
    r => { r.certificate.version = 2; }, r => { r.certificate.assurance = 'numerical'; },
    r => { r.certificate.input.matrix[0][0] = '3'; },
    r => { r.certificate.evidence.operations[0].rows.reverse(); },
    r => { r.certificate.evidence.leftProduct[0][0] = '0'; },
    r => { delete r.certificate.evidence; }, r => { r.answer.extraClaim = 'proved'; },
  ];
  for (const mutate of mutations) { const changed = clone(result); mutate(changed); assert.equal(verifyExtensionCertificate(input, changed), false); }
  assert.equal(verifyExtensionCertificate(matrix('inverse', [[1, 2], [3, 4]]), result), false);
  const reordered = Object.fromEntries(Object.entries(result).reverse());
  assert.equal(verifyExtensionCertificate(input, reordered), true, 'object key order is immaterial');
  const cyclic = clone(result); cyclic.certificate.input = cyclic;
  assert.equal(verifyExtensionCertificate(input, cyclic), false);
  assert.equal(verifyExtensionCertificate(input, { ...result, toJSON: () => result }), false);
  assert.equal(verifyExtensionCertificate(input, null), false);
  const sparse = clone(result); delete sparse.answer.matrix[0][0];
  assert.equal(verifyExtensionCertificate(input, sparse), false);
});

test('each operation family binds its own exact answers and evidence during replay', () => {
  const requests = [sequence({}), stats([1, 2]), combinatorics('combinations', 12, 3),
    expression('x^2', { values: { x: '1/3' } }), complex('i+2'), expression('sin(1)')];
  for (const input of requests) {
    const result = solveExtension(input); assert.equal(verifyExtensionCertificate(input, result), true);
    const forged = clone(result); forged.answer.exact = false;
    assert.equal(verifyExtensionCertificate(input, forged), false);
    const missing = clone(result); delete missing.certificate;
    assert.equal(verifyExtensionCertificate(input, missing), false);
  }
  const input = expression('sin(1)'), result = checked(input, false);
  const promoted = clone(result); promoted.verified = true;
  assert.equal(verifyExtensionCertificate(input, promoted), false);
  const numerical = clone(result); numerical.answer.approximation.value = 1;
  assert.equal(verifyExtensionCertificate(input, numerical), false);
});

test('structured requests and rational values reject coercion and prototype-based inputs', () => {
  for (const input of [null, undefined, [], '2+2', 42, true]) rejected(input);
  rejected({ kind: 'unknown' }, 'unsupported');
  rejected({ kind: 'evaluate' });
  let coerced = false;
  rejected(stats([{ toString() { coerced = true; return '1'; } }]));
  assert.equal(coerced, false);
  assert.equal(solveExtension(Object.create({ kind: 'statistics', values: [1] })).status, 'invalid');
  const input = Object.assign(Object.create(null), { kind: 'statistics', values: ['1/2', '3/2'] });
  assert.equal(checked(input).answer.mean, '1');
  rejected(stats([new Rational(1n, 2n), false]));
});

test('canonical rational result strings round-trip through the core exact evaluator', () => {
  const requests = [sequence({ first: '-5/7', step: '1/3', n: 99 }),
    matrix('determinant', [['1/7', '3/5'], ['-2/3', '1/8']]),
    combinatorics('combinations', 50, 12), expression('x^-3', { values: { x: '-2/3' } })];
  for (const input of requests) {
    const value = checked(input).answer.value;
    assert.equal(String(Q(value)), value);
    assert.equal(String(constantValue(parseExpression(value))), value);
  }
});
