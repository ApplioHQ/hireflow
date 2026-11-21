// Exact AP Precalculus Unit 3 rules. Angles are rational multiples of pi.
// API: solveTrigModels(input), verifyTrigModelsCertificate(input, report).
// analyze: {kind:'trig_models',operation:'analyze',function:'sin'|'cos',
//   scale,rate,shift,offset}; f(x)=scale*function(rate*(x-shift))+offset.
// inverse: {kind:'trig_models',operation:'inverse',function:'asin'|'acos'|'atan',
//   value}; value is a rational or a bounded expression using +,-,*,/,sqrt(2|3|6).
// identity: {kind:'trig_models',operation:'identity',identity:'reciprocal'|
//   'cofunction'|'pythagorean',angle,...}. angle is the coefficient of pi and
//   lies on the pi/12 grid. Reciprocal/cofunction require function (one of the
//   six trigonometric functions); Pythagorean requires family ('sin_cos',
//   'tan_sec', or 'cot_csc'). Identity certificates concern the supplied angle.
import { Q, MathError, parseExpression, rationalSqrt, stableStringify } from './core.js';

const fail = (message, code = 'invalid') => { throw new MathError(message, code); };
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const str = value => String(value);
const zero = () => Q(0);
const abs = value => value.n < 0n ? value.neg() : value;
function fields(value, allowed, required = allowed) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) fail(`Expected fields: ${required.join(', ')}.`);
}
function rational(value, label) {
  if (!['string', 'number'].includes(typeof value) ||
      typeof value === 'string' && (value.length > 64 || !value.trim()) ||
      typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)))
    fail(`${label} must be a bounded exact rational number or string.`);
  const q = Q(value);
  if (abs(q).n.toString().length > 24 || q.d.toString().length > 24)
    fail(`${label} exceeds the rational size bound.`, 'budget');
  return q;
}
function bounded(q) {
  if (q.some(c => abs(c).n.toString().length > 80 || c.d.toString().length > 80))
    fail('Exact algebraic coefficient budget exceeded.', 'budget');
  return q;
}

// Q(sqrt(2),sqrt(3)), with basis [1,sqrt(2),sqrt(3),sqrt(6)].
const scalar = q => [Q(q), zero(), zero(), zero()];
const basis = (index, coefficient = 1) => [0, 1, 2, 3].map(i => i === index ? Q(coefficient) : zero());
const add = (a, b) => bounded(a.map((v, i) => v.add(b[i])));
const neg = a => a.map(v => v.neg());
const sub = (a, b) => add(a, neg(b));
function mul(a, b) {
  const result = [zero(), zero(), zero(), zero()];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const common = i & j, factor = common === 3 ? 6 : common === 1 ? 2 : common === 2 ? 3 : 1;
    result[i ^ j] = result[i ^ j].add(a[i].mul(b[j]).mul(factor));
  }
  return bounded(result);
}
const equal = (a, b) => a.every((v, i) => v.eq(b[i]));
const conjugate = (a, two, three) => a.map((v, i) =>
  Boolean(two && (i & 1)) !== Boolean(three && (i & 2)) ? v.neg() : v);
function reciprocal(a) {
  if (a.every(v => v.zero)) fail('The trigonometric expression is undefined at this angle.');
  const others = [conjugate(a, 1, 0), conjugate(a, 0, 1), conjugate(a, 1, 1)];
  const numerator = others.reduce(mul, scalar(1));
  const norm = mul(a, numerator);
  if (!norm.slice(1).every(v => v.zero) || norm[0].zero)
    fail('Algebraic reciprocal could not be certified.', 'unsupported');
  return bounded(numerator.map(v => v.div(norm[0])));
}
const div = (a, b) => mul(a, reciprocal(b));
function coefficientText(q, radical) {
  const n = abs(q).n, d = q.d;
  if (!radical) return str(abs(q));
  const body = `sqrt(${radical})`;
  return `${n === 1n ? '' : `${n}*`}${body}${d === 1n ? '' : `/${d}`}`;
}
function algebraText(a) {
  const terms = a.map((q, i) => ({ q, radical: [0, 2, 3, 6][i] })).filter(({ q }) => !q.zero);
  if (!terms.length) return '0';
  return terms.map(({ q, radical }, i) => `${i === 0 ? q.n < 0n ? '-' : '' : q.n < 0n ? ' - ' : ' + '}${coefficientText(q, radical)}`).join('');
}
const vector = a => a.map(str);
function sign2(a, b) {
  const sa = a.cmp(0), sb = b.cmp(0);
  if (!sa) return sb;
  if (!sb || sa === sb) return sa;
  return sa * a.mul(a).sub(b.mul(b).mul(2)).cmp(0);
}
function sign(a) {
  const su = sign2(a[0], a[1]), sv = sign2(a[2], a[3]);
  if (!su) return sv;
  if (!sv || su === sv) return su;
  const u2 = [a[0].mul(a[0]).add(a[1].mul(a[1]).mul(2)), a[0].mul(a[1]).mul(2)];
  const v2 = [a[2].mul(a[2]).add(a[3].mul(a[3]).mul(2)), a[2].mul(a[3]).mul(2)];
  return su * sign2(u2[0].sub(v2[0].mul(3)), u2[1].sub(v2[1].mul(3)));
}
function sqrtRational(q) {
  if (q.n < 0n) fail('Square root of a negative value is outside the real domain.');
  for (const [radical, index] of [[1, 0], [2, 1], [3, 2], [6, 3]]) {
    const factor = rationalSqrt(q.div(radical));
    if (factor !== null) return basis(index, factor);
  }
  fail('Only square roots in Q(sqrt(2),sqrt(3)) are supported.', 'unsupported');
}
function exactValue(value) {
  if (typeof value === 'number') return scalar(rational(value, 'value'));
  if (typeof value !== 'string' || !value.trim() || value.length > 160)
    fail('value must be a bounded exact radical expression.');
  const ast = parseExpression(value);
  const budget = { nodes: 0 };
  function evaluate(node, depth = 0) {
    if (++budget.nodes > 64 || depth > 16) fail('Radical expression budget exceeded.', 'budget');
    if (node.type === 'num') return scalar(rational(node.value, 'value'));
    if (node.type === 'neg') return neg(evaluate(node.arg, depth + 1));
    if (node.type === 'call' && node.name === 'sqrt' && node.args.length === 1) {
      const radicand = evaluate(node.args[0], depth + 1);
      if (!radicand.slice(1).every(v => v.zero))
        fail('Nested algebraic square roots are outside the supported exact scope.', 'unsupported');
      return sqrtRational(radicand[0]);
    }
    if (node.type === 'binary' && ['+', '-', '*', '/', '^'].includes(node.op)) {
      const left = evaluate(node.left, depth + 1), right = evaluate(node.right, depth + 1);
      if (node.op === '+') return add(left, right);
      if (node.op === '-') return sub(left, right);
      if (node.op === '*') return mul(left, right);
      if (node.op === '/') return div(left, right);
      if (!right.slice(1).every(v => v.zero) || !right[0].integer || abs(right[0]).cmp(8) > 0)
        fail('Radical powers require integer exponents from -8 through 8.', 'unsupported');
      const exponent = Number(right[0].n);
      let result = scalar(1), base = exponent < 0 ? reciprocal(left) : left;
      for (let i = 0; i < Math.abs(exponent); i++) result = mul(result, base);
      return result;
    }
    fail('Only rational arithmetic and supported square roots are accepted.', 'unsupported');
  }
  return bounded(evaluate(ast));
}

const SIN_15 = div(sub(basis(3), basis(1)), scalar(4));
const COS_15 = div(add(basis(3), basis(1)), scalar(4));
const TABLE = [{ sin: scalar(0), cos: scalar(1) }];
for (let i = 1; i < 24; i++) {
  const prior = TABLE[i - 1];
  TABLE.push({ sin: add(mul(prior.sin, COS_15), mul(prior.cos, SIN_15)),
    cos: sub(mul(prior.cos, COS_15), mul(prior.sin, SIN_15)) });
}
function angleIndex(value) {
  const angle = rational(value, 'angle'), index = angle.mul(12);
  if (!index.integer) fail('Angle is outside the pi/12 grid.', 'unsupported');
  if (abs(angle).cmp(120) > 0) fail('Angle exceeds the grid input budget.', 'budget');
  return { angle, index: Number((index.n % 24n + 24n) % 24n) };
}
function trig(name, index) {
  const { sin, cos } = TABLE[index];
  if (name === 'sin') return sin;
  if (name === 'cos') return cos;
  if (name === 'tan') return div(sin, cos);
  if (name === 'cot') return div(cos, sin);
  if (name === 'sec') return reciprocal(cos);
  if (name === 'csc') return reciprocal(sin);
  fail('Unsupported trigonometric function.', 'unsupported');
}
const FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'];
const RECIPROCAL = { sin: 'csc', cos: 'sec', tan: 'cot', cot: 'tan', sec: 'cos', csc: 'sin' };
const COFUNCTION = { sin: 'cos', cos: 'sin', tan: 'cot', cot: 'tan', sec: 'csc', csc: 'sec' };
function step(before, after, rule, explanation) { return { before, after, rule, explanation, verified: true }; }
function report(operation, answer, evidence, before, rule, explanation, restrictions) {
  return { status: 'solved', verified: true, kind: 'trig_models', topic: 'trigonometry', operation, answer,
    steps: [step(before, stableStringify(answer), rule, explanation)], restrictions,
    certificate: { type: 'trig_models', version: 1, assurance: 'exact-algebraic-replay', evidence } };
}
function analyze(input) {
  fields(input, ['kind', 'operation', 'function', 'scale', 'rate', 'shift', 'offset']);
  if (!['sin', 'cos'].includes(input.function)) fail('Only sine and cosine models are supported.', 'unsupported');
  const a = rational(input.scale, 'scale'), b = rational(input.rate, 'rate');
  const h = rational(input.shift, 'shift'), k = rational(input.offset, 'offset');
  if (a.zero || b.zero) fail('Scale and rate must be nonzero for a sinusoidal model.');
  const amplitude = abs(a), period = Q(2).div(abs(b));
  const max = k.add(amplitude), min = k.sub(amplitude);
  const positive = a.n > 0n;
  const maxArg = input.function === 'sin' ? positive ? Q('1/2') : Q('3/2') : positive ? Q(0) : Q(1);
  const minArg = input.function === 'sin' ? positive ? Q('3/2') : Q('1/2') : positive ? Q(1) : Q(0);
  const location = arg => {
    const raw = arg.div(b);
    // Rational modulo a positive period, retaining a representative in [0,period).
    const quotient = raw.div(period), floor = quotient.n >= 0n ? quotient.n / quotient.d :
      -((-quotient.n + quotient.d - 1n) / quotient.d);
    const reduced = raw.sub(period.mul(floor));
    return { rational: str(h), piMultiple: str(reduced), periodPiMultiple: str(period) };
  };
  const parameters = { function: input.function, scale: str(a), rate: str(b), shift: str(h), offset: str(k) };
  const answer = { exact: true, model: parameters, amplitude: str(amplitude), angularFrequency: str(abs(b)),
    period: { piMultiple: str(period) }, frequency: { inversePiMultiple: str(abs(b).div(2)) },
    phaseShift: str(h), midline: str(k), range: { minimum: str(min), maximum: str(max) },
    extrema: { maximum: { value: str(max), x: location(maxArg) },
      minimum: { value: str(min), x: location(minArg) } } };
  return report('analyze', answer, { parameters, extremaArguments: { maximum: str(maxArg), minimum: str(minArg) } },
    stableStringify(parameters), 'sinusoidal_parameter_analysis',
    'Use |scale| for amplitude, 2*pi/|rate| for period, its reciprocal for frequency, and solve the exact peak and trough phase equations.',
    ['Scale and rate are nonzero rational numbers.', 'Extrema locations repeat by the stated positive period.']);
}
function inverse(input) {
  fields(input, ['kind', 'operation', 'function', 'value']);
  if (!['asin', 'acos', 'atan'].includes(input.function)) fail('Unsupported inverse trigonometric function.', 'unsupported');
  const value = exactValue(input.value);
  if (input.function !== 'atan' && (sign(sub(value, scalar(1))) > 0 || sign(add(value, scalar(1))) < 0))
    fail(`${input.function} requires a value in [-1,1].`);
  const candidates = input.function === 'asin' ? [-6, 6] : input.function === 'acos' ? [0, 12] : [-6, 6];
  const functionName = input.function.slice(1);
  for (let n = candidates[0]; n <= candidates[1]; n++) {
    if (input.function === 'atan' && (n === -6 || n === 6)) continue;
    const index = (n % 24 + 24) % 24;
    if (equal(value, trig(functionName, index))) {
      const answer = { exact: true, function: input.function, input: algebraText(value),
        principalAngle: { piMultiple: str(Q(n).div(12)) } };
      return report('inverse', answer, { inputVector: vector(value), gridIndex: n,
        forwardVector: vector(trig(functionName, index)) }, algebraText(value),
      'principal_inverse_grid_lookup',
      'Match the exact algebraic value on the pi/12 grid within the inverse function principal range.',
      ['asin returns [-pi/2,pi/2], acos returns [0,pi], and atan returns (-pi/2,pi/2).']);
    }
  }
  fail('No principal inverse angle on the pi/12 grid matches this exact value.', 'unsupported');
}
function identity(input) {
  const type = input.identity;
  if (type === 'reciprocal' || type === 'cofunction')
    fields(input, ['kind', 'operation', 'identity', 'angle', 'function']);
  else if (type === 'pythagorean')
    fields(input, ['kind', 'operation', 'identity', 'angle', 'family']);
  else fail('Unsupported identity family.', 'unsupported');
  const { angle, index } = angleIndex(input.angle);
  let left, right, relation, values;
  if (type === 'reciprocal' || type === 'cofunction') {
    if (!FUNCS.includes(input.function)) fail('Unsupported trigonometric function.', 'unsupported');
    const target = type === 'reciprocal' ? RECIPROCAL[input.function] : COFUNCTION[input.function];
    left = trig(input.function, index);
    if (type === 'reciprocal') {
      right = reciprocal(trig(target, index));
      relation = `${input.function}(theta) = 1/${target}(theta)`;
    } else {
      const complement = (6 - index + 24) % 24;
      right = trig(target, complement);
      relation = `${input.function}(theta) = ${target}(pi/2-theta)`;
    }
    if (!equal(left, right)) fail('Identity did not certify at this angle.', 'unsupported');
    values = { left: vector(left), right: vector(right) };
  } else {
    const rules = { sin_cos: ['sin', 'cos', null], tan_sec: ['tan', null, 'sec'],
      cot_csc: ['cot', null, 'csc'] };
    if (!Object.hasOwn(rules, input.family)) fail('Unsupported Pythagorean identity.', 'unsupported');
    const [first, second, third] = rules[input.family];
    const square = a => mul(a, a);
    left = second ? add(square(trig(first, index)), square(trig(second, index))) :
      add(scalar(1), square(trig(first, index)));
    right = third ? square(trig(third, index)) : scalar(1);
    relation = second ? 'sin(theta)^2 + cos(theta)^2 = 1' :
      `1 + ${first}(theta)^2 = ${third}(theta)^2`;
    if (!equal(left, right)) fail('Pythagorean identity did not certify at this angle.', 'unsupported');
    values = { left: vector(left), right: vector(right) };
  }
  const answer = { exact: true, identity: type, angle: { piMultiple: str(angle) },
    relation, leftValue: algebraText(left), rightValue: algebraText(right), holds: true };
  const before = type === 'pythagorean' ? { identity: type, angle: str(angle), family: input.family } :
    { identity: type, angle: str(angle), function: input.function };
  return report('identity', answer, { gridIndex: index, relation, ...values },
    stableStringify(before),
    'exact_trigonometric_identity',
    'Evaluate both sides in Q(sqrt(2),sqrt(3)) at the supplied pi/12 grid angle and compare coefficient vectors.',
    ['The supplied angle lies on the pi/12 grid.', 'Every denominator must be nonzero at that angle.']);
}
function compute(input) {
  if (!plain(input)) fail('Input must be a plain object.');
  if (input.kind !== 'trig_models') fail('kind must be trig_models.');
  if (input.operation === 'analyze') return analyze(input);
  if (input.operation === 'inverse') return inverse(input);
  if (input.operation === 'identity') return identity(input);
  fail('Unsupported trigonometric operation.', 'unsupported');
}
function same(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 20000 || depth > 32) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !plain(actual)) return false;
  const a = Reflect.ownKeys(expected).sort(), b = Reflect.ownKeys(actual).sort();
  return a.length === b.length && a.every((key, i) => key === b[i] &&
    same(expected[key], actual[key], budget, depth + 1));
}
/** Rejected inputs carry no certificate and never claim verification. */
export function solveTrigModels(input) {
  try { return compute(input); } catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : error.code === 'budget' ? 'unresolved' : 'unsupported',
      verified: false, kind: 'trig_models', topic: 'trigonometry', operation: plain(input) && typeof input.operation === 'string' ? input.operation : null,
      answer: null, steps: [], restrictions: [], certificate: null,
      error: error.message || 'Unable to certify trigonometric request.' };
  }
}
/** Recompute and compare every answer, step, restriction, and proof field. */
export function verifyTrigModelsCertificate(input, reportValue) {
  try { return reportValue?.status === 'solved' && same(compute(input), reportValue); }
  catch { return false; }
}
