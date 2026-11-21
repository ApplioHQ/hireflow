// Owned AP Precalculus rules over Q(sqrt(2), sqrt(3)). No decimal sampling.
// API: solvePrecalculus(input), verifyPrecalculusCertificate(input, report).
// Every input is { kind: 'precalculus', topic, operation, ... }.
// A scalar is a rational number/string, or a coefficient record with any of
// { rational, sqrt2, sqrt3, sqrt6 }. Evaluation angles are rational multiples
// of pi (for example angle: '1/6') on the pi/12 grid. Equation interval bounds
// may be any rational multiples of pi.
// trigonometry: unit_circle {angle}; angle_sum/angle_difference {angleA,angleB};
//   double_angle {angle}; solve_equation {function:'sin'|'cos'|'tan',target,
//   interval:{lower,upper,includeLower?,includeUpper?}}. Bounds are pi
//   multiples. Endpoints default closed. Target is an exact scalar. Complete
//   root sets are returned only when the target has a certified grid inverse;
//   sin/cos rational targets outside [-1,1] also certify an empty set.
// polar: to_cartesian {radius,angle}; to_polar {point:[x,y]};
//   rotate {point:[x,y],angle}; polar_product {first:{radius,angle},
//   second:{radius,angle}}. Polar radii supplied by callers are nonnegative
//   rationals. to_polar accepts only points with a grid angle and a radius in
//   the exact field; other inverse angles are deliberately unsupported.
// vector: add/subtract/dot/cross {a,b}; scale {a,factor}; norm {a};
//   distance/projection {a,b}; rotate {a,angle} (two dimensions only).
// Vector coordinates are two or three exact scalars. Projection is a onto b.
import { Q, MathError, rationalSqrt, stableStringify } from './core.js';

const KEYS = ['rational', 'sqrt2', 'sqrt3', 'sqrt6'];
const ROOTS = [1, 2, 3, 6];
const ZERO = () => [Q(0), Q(0), Q(0), Q(0)];
const ONE = () => [Q(1), Q(0), Q(0), Q(0)];
const record = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => { throw new MathError(message, 'invalid'); };
const unsupported = message => { throw new MathError(message, 'unsupported'); };
const requireThat = (condition, message) => { if (!condition) invalid(message); };

function same(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 20000 || depth > 32) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  if (Array.isArray(expected) && expected.length !== actual.length) return false;
  const left = Object.keys(expected).sort(), right = Object.keys(actual).sort();
  return left.length === right.length && left.every((key, i) => key === right[i] &&
    same(expected[key], actual[key], budget, depth + 1));
}

function fields(value, allowed, label) {
  requireThat(record(value), `${label} must be a plain object.`);
  requireThat(Object.keys(value).every(key => allowed.includes(key)), `${label} has an unknown field.`);
}

function rational(value, label) {
  requireThat(typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint',
    `${label} must be an exact rational input.`);
  requireThat(typeof value !== 'number' || Number.isFinite(value), `${label} must be finite.`);
  requireThat(typeof value !== 'number' || !Number.isInteger(value) || Number.isSafeInteger(value),
    `${label} must use a string for integers outside the safe numeric range.`);
  return Q(value);
}

function scalar(value, label = 'scalar') {
  if (!record(value)) return [rational(value, label), Q(0), Q(0), Q(0)];
  fields(value, KEYS, label);
  requireThat(Object.keys(value).length > 0, `${label} needs a coefficient.`);
  return KEYS.map(key => Object.hasOwn(value, key) ? rational(value[key], `${label}.${key}`) : Q(0));
}

const add = (a, b) => a.map((x, i) => x.add(b[i]));
const neg = a => a.map(x => x.neg());
const sub = (a, b) => add(a, neg(b));
const scale = (a, q) => a.map(x => x.mul(q));
const isZero = a => a.every(x => x.zero);
const eq = (a, b) => a.every((x, i) => x.eq(b[i]));
const rationalPart = a => a.slice(1).every(x => x.zero) ? a[0] : null;

function mul(a, b) {
  const out = ZERO();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const overlap = i & j;
    out[i ^ j] = out[i ^ j].add(a[i].mul(b[j]).mul(ROOTS[overlap]));
  }
  return out;
}

function conjugate(a, flip2, flip3) {
  return a.map((x, i) => x.mul((i & 1 ? flip2 : 1) * (i & 2 ? flip3 : 1)));
}

function divide(a, b) {
  if (isZero(b)) invalid('Division by the zero exact scalar is undefined.');
  const partner = mul(mul(conjugate(b, -1, 1), conjugate(b, 1, -1)), conjugate(b, -1, -1));
  const norm = mul(b, partner);
  const denominator = rationalPart(norm);
  if (denominator === null || denominator.zero) unsupported('The exact scalar is outside the supported field.');
  const result = scale(mul(a, partner), Q(1).div(denominator));
  if (!eq(mul(result, b), a)) unsupported('Exact scalar division check failed.');
  return result;
}

function expression(a) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const q = a[i];
    if (q.zero) continue;
    const magnitude = q.n < 0n ? q.neg() : q;
    let body;
    if (i === 0) body = String(magnitude);
    else {
      body = `sqrt(${ROOTS[i]})`;
      if (magnitude.n !== 1n) body = `${magnitude.n}*${body}`;
      if (magnitude.d !== 1n) body += `/${magnitude.d}`;
    }
    parts.push(`${parts.length ? q.n < 0n ? ' - ' : ' + ' : q.n < 0n ? '-' : ''}${body}`);
  }
  return parts.join('') || '0';
}

function exact(a) {
  return { expression: expression(a), coefficients: Object.fromEntries(KEYS.map((key, i) => [key, String(a[i])])) };
}

function vector(value, label) {
  requireThat(Array.isArray(value) && [2, 3].includes(value.length), `${label} must have two or three coordinates.`);
  return value.map((entry, i) => scalar(entry, `${label}[${i}]`));
}

function pair(value, label) {
  const v = vector(value, label);
  requireThat(v.length === 2, `${label} must have two coordinates.`);
  return v;
}

function sameDimension(a, b) {
  requireThat(a.length === b.length, 'Vectors must have the same dimension.');
}

function vectorAnswer(v) {
  return { exact: true, dimension: v.length, components: v.map(exact) };
}

function dot(a, b) {
  return a.reduce((sum, x, i) => add(sum, mul(x, b[i])), ZERO());
}

function angle(value, label = 'angle') {
  const q = rational(value, label), twelfths = q.mul(12);
  if (!twelfths.integer) unsupported(`${label} must be a multiple of pi/12.`);
  return Number((twelfths.n % 24n + 24n) % 24n);
}

function piMultiple(index) { return String(Q(index).div(12)); }

function floorQ(q) { return q.n >= 0n ? q.n / q.d : -((-q.n + q.d - 1n) / q.d); }
function ceilQ(q) { return -floorQ(q.neg()); }

function unit(index) {
  // e^(i*pi/12): (sqrt(6)+sqrt(2))/4 + i*(sqrt(6)-sqrt(2))/4.
  const c = [Q(0), Q('1/4'), Q(0), Q('1/4')];
  const s = [Q(0), Q('-1/4'), Q(0), Q('1/4')];
  let cos = ONE(), sin = ZERO();
  for (let i = 0; i < index; i++) [cos, sin] = [sub(mul(cos, c), mul(sin, s)), add(mul(sin, c), mul(cos, s))];
  if (!eq(add(mul(cos, cos), mul(sin, sin)), ONE())) unsupported('Unit-circle field invariant failed.');
  return { cos, sin };
}

function trigAnswer(index, values) {
  return { exact: true, piMultiple: piMultiple(index), cos: exact(values.cos), sin: exact(values.sin),
    tan: isZero(values.cos) ? null : exact(divide(values.sin, values.cos)) };
}

function step(before, after, rule, explanation) {
  return { before, after, rule, explanation, verified: true };
}

function report(topic, operation, answer, steps, restrictions, evidence) {
  return { status: 'solved', verified: true, topic, answer, steps, restrictions,
    certificate: { type: 'precalculus', version: 1, operation,
      assurance: 'exact-biquadratic-replay', evidence } };
}

function equationInterval(value) {
  fields(value, ['lower', 'upper', 'includeLower', 'includeUpper'], 'interval');
  requireThat(Object.hasOwn(value, 'lower') && Object.hasOwn(value, 'upper'),
    'interval needs lower and upper bounds.');
  const lower = rational(value.lower, 'interval.lower'), upper = rational(value.upper, 'interval.upper');
  requireThat(lower.cmp(upper) <= 0, 'interval.lower must not exceed interval.upper.');
  const includeLower = Object.hasOwn(value, 'includeLower') ? value.includeLower : true;
  const includeUpper = Object.hasOwn(value, 'includeUpper') ? value.includeUpper : true;
  requireThat(typeof includeLower === 'boolean' && typeof includeUpper === 'boolean',
    'Interval endpoint flags must be booleans.');
  return { lower, upper, includeLower, includeUpper };
}

function equationBases(fn, target) {
  const periodSteps = fn === 'tan' ? 12 : 24;
  let match = -1;
  for (let k = 0; k < periodSteps; k++) {
    const values = unit(k);
    const value = fn === 'sin' ? values.sin : fn === 'cos' ? values.cos :
      isZero(values.cos) ? null : divide(values.sin, values.cos);
    if (value !== null && eq(value, target)) { match = k; break; }
  }
  if (match < 0) return null;
  // sin(x)=sin(a) iff x=a or x=pi-a (mod 2pi);
  // cos(x)=cos(a) iff x=a or x=-a (mod 2pi);
  // tan(x)=tan(a) iff x=a (mod pi). These identities give all real roots.
  const indices = fn === 'tan' ? [match] : fn === 'sin' ?
    [match, (12 - match + 24) % 24] : [match, (24 - match) % 24];
  const bases = [...new Set(indices)].sort((a, b) => a - b);
  for (const k of bases) {
    const values = unit(k);
    const value = fn === 'sin' ? values.sin : fn === 'cos' ? values.cos : divide(values.sin, values.cos);
    if (!eq(value, target)) unsupported('Trigonometric root symmetry check failed.');
  }
  return bases;
}

function solveTrigEquation(input) {
  fields(input, ['kind', 'topic', 'operation', 'function', 'target', 'interval'], 'input');
  const fn = input.function;
  requireThat(['sin', 'cos', 'tan'].includes(fn), 'function must be sin, cos, or tan.');
  const target = scalar(input.target, 'target'), interval = equationInterval(input.interval);
  const period = fn === 'tan' ? 1 : 2;
  const normalizedInterval = { lower: String(interval.lower), upper: String(interval.upper),
    includeLower: interval.includeLower, includeUpper: interval.includeUpper };
  const rationalTarget = rationalPart(target);
  const outOfRange = fn !== 'tan' && rationalTarget !== null &&
    (rationalTarget.cmp(-1) < 0 || rationalTarget.cmp(1) > 0);
  const bases = outOfRange ? [] : equationBases(fn, target);
  if (bases === null) unsupported('This exact target has no certified inverse on the pi/12 grid.');
  const solutions = [], cycleRanges = [];
  let rootCount = 0n;
  for (const index of bases) {
    const base = Q(index).div(12);
    const from = interval.lower.sub(base).div(period), to = interval.upper.sub(base).div(period);
    const first = interval.includeLower ? ceilQ(from) : floorQ(from) + 1n;
    const last = interval.includeUpper ? floorQ(to) : ceilQ(to) - 1n;
    const count = last >= first ? last - first + 1n : 0n;
    rootCount += count;
    if (rootCount > 1000n) throw new MathError('The interval contains more than 1000 exact roots.', 'budget');
    cycleRanges.push({ basePiMultiple: String(base), firstCycle: String(first),
      lastCycle: String(last), count: String(count) });
    for (let cycle = first; cycle <= last; cycle++) {
      const root = base.add(Q(cycle).mul(period));
      solutions.push(root);
    }
  }
  solutions.sort((a, b) => a.cmp(b));
  const rootStrings = solutions.map(String);
  const baseStrings = bases.map(piMultiple);
  const answer = { exact: true, complete: true, function: fn, target: exact(target),
    interval: normalizedInterval, unit: 'pi', periodPi: String(period),
    baseSolutions: baseStrings, solutions: rootStrings };
  const theorem = outOfRange ? 'trig_range_exclusion' :
    fn === 'sin' ? 'sine_inverse_symmetry' : fn === 'cos' ? 'cosine_inverse_symmetry' : 'tangent_inverse_periodicity';
  const steps = [step(`${fn}(theta) = ${expression(target)}`,
    stableStringify(baseStrings), theorem, outOfRange ?
      'The exact rational target lies outside [-1, 1], the real range of sine and cosine.' :
      'Match the exact target on the unit circle, then use the complete sine, cosine, or tangent symmetry identity.'),
    step(stableStringify({ bases: baseStrings, periodPi: String(period), interval: normalizedInterval }),
      stableStringify(rootStrings), 'exact_periodic_interval_enumeration',
      'Use exact rational floor and ceiling bounds for every period; apply each open or closed endpoint exactly.')];
  return report('trigonometry', 'solve_equation', answer, steps,
    ['Angles and interval bounds are multiples of pi.',
      'Grid inverse targets are complete over the stated interval; other targets are unsupported.',
      'At most 1000 exact roots are returned.'],
    { target: exact(target), interval: normalizedInterval, periodPi: String(period),
      theorem, basePiMultiples: baseStrings, cycleRanges, rootCount: String(rootCount) });
}

function trig(input) {
  const operation = input.operation;
  if (operation === 'solve_equation') return solveTrigEquation(input);
  if (operation === 'unit_circle' || operation === 'double_angle') {
    fields(input, ['kind', 'topic', 'operation', 'angle'], 'input');
    const k = angle(input.angle), one = unit(k);
    const index = operation === 'double_angle' ? (2 * k) % 24 : k;
    const values = operation === 'double_angle' ?
      { cos: sub(mul(one.cos, one.cos), mul(one.sin, one.sin)), sin: scale(mul(one.sin, one.cos), Q(2)) } : one;
    if (!eq(values.cos, unit(index).cos) || !eq(values.sin, unit(index).sin)) unsupported('Trigonometric identity check failed.');
    const answer = trigAnswer(index, values);
    return report('trigonometry', operation, answer,
      [step(`angle = ${input.angle}*pi`, `angle = ${piMultiple(k)}*pi (mod 2*pi)`, 'exact_angle_reduction',
        'Reduce the rational angle modulo one full turn on the pi/12 grid.'),
      step(`cos = ${expression(one.cos)}, sin = ${expression(one.sin)}`,
        stableStringify(answer), operation === 'double_angle' ? 'double_angle_identity' : 'unit_circle_exact',
        operation === 'double_angle' ? 'Apply cos(2a) = cos(a)^2 - sin(a)^2 and sin(2a) = 2sin(a)cos(a) in the exact field.' :
          'Multiply the exact pi/12 unit-circle values and verify cos^2 + sin^2 = 1.')],
      ['Angles are exact multiples of pi/12; tangent is undefined when cosine is zero.'],
      { inputAngle: String(rational(input.angle, 'angle')), reducedIndex: k, resultIndex: index,
        unitIdentity: expression(add(mul(values.cos, values.cos), mul(values.sin, values.sin))) });
  }
  if (operation === 'angle_sum' || operation === 'angle_difference') {
    fields(input, ['kind', 'topic', 'operation', 'angleA', 'angleB'], 'input');
    const a = angle(input.angleA, 'angleA'), b = angle(input.angleB, 'angleB');
    const A = unit(a), B = unit(b), sign = operation === 'angle_sum' ? 1 : -1;
    const index = (a + sign * b + 24) % 24;
    const values = { cos: sub(mul(A.cos, B.cos), scale(mul(A.sin, B.sin), Q(sign))),
      sin: add(mul(A.sin, B.cos), scale(mul(A.cos, B.sin), Q(sign))) };
    if (!eq(values.cos, unit(index).cos) || !eq(values.sin, unit(index).sin)) unsupported('Angle formula check failed.');
    const answer = trigAnswer(index, values);
    return report('trigonometry', operation, answer,
      [step(stableStringify({ angleA: piMultiple(a), angleB: piMultiple(b) }),
        stableStringify(answer), operation === 'angle_sum' ? 'angle_addition_identity' : 'angle_subtraction_identity',
        'Apply the sine and cosine angle formulas with exact field arithmetic, then check against the unit circle.')],
      ['Both angles are exact multiples of pi/12; tangent is undefined when cosine is zero.'],
      { firstIndex: a, secondIndex: b, resultIndex: index, cosine: expression(values.cos), sine: expression(values.sin) });
  }
  unsupported(`Unsupported trigonometry operation: ${operation}.`);
}

function radius(value, label) {
  const q = rational(value, label);
  requireThat(q.cmp(0) >= 0, `${label} must be nonnegative.`);
  return q;
}

function polarPair(value, label) {
  fields(value, ['radius', 'angle'], label);
  requireThat(Object.hasOwn(value, 'radius') && Object.hasOwn(value, 'angle'), `${label} needs radius and angle.`);
  return { radius: radius(value.radius, `${label}.radius`), index: angle(value.angle, `${label}.angle`) };
}

function rotate(point, index) {
  const { cos, sin } = unit(index);
  return [sub(mul(point[0], cos), mul(point[1], sin)), add(mul(point[0], sin), mul(point[1], cos))];
}

function sqrtInField(q) {
  for (let i = 0; i < 4; i++) {
    const root = rationalSqrt(q.div(ROOTS[i]));
    if (root !== null) { const result = ZERO(); result[i] = root; return result; }
  }
  return null;
}

function polar(input) {
  const operation = input.operation;
  if (operation === 'to_cartesian') {
    fields(input, ['kind', 'topic', 'operation', 'radius', 'angle'], 'input');
    const r = radius(input.radius, 'radius'), k = angle(input.angle);
    const u = unit(k), point = [scale(u.cos, r), scale(u.sin, r)];
    const answer = { ...vectorAnswer(point), radius: String(r), piMultiple: piMultiple(k) };
    return report('polar', operation, answer,
      [step(`r = ${r}, theta = ${piMultiple(k)}*pi`, stableStringify(answer.components), 'polar_to_cartesian',
        'Use x = r cos(theta), y = r sin(theta) in the exact field.')],
      ['The supplied radius is a nonnegative rational and the angle is on the pi/12 grid.'],
      { radius: String(r), angleIndex: k, normSquared: expression(dot(point, point)) });
  }
  if (operation === 'to_polar') {
    fields(input, ['kind', 'topic', 'operation', 'point'], 'input');
    const point = pair(input.point, 'point');
    const squared = dot(point, point), q = rationalPart(squared);
    if (q === null) unsupported('This point has no rational squared radius in the supported exact field.');
    if (q.zero) {
      const answer = { exact: true, radius: exact(ZERO()), piMultiple: '0', angleConvention: 'origin' };
      return report('polar', operation, answer,
        [step(stableStringify(point.map(exact)), stableStringify(answer), 'polar_origin',
          'The zero vector has radius zero; use angle zero as a reporting convention.')],
        ['At the origin the geometric polar angle is indeterminate; zero is only a reporting convention.'],
        { normSquared: '0', matchedIndex: 0 });
    }
    const r = sqrtInField(q);
    if (r === null) unsupported('The positive radius is outside the supported exact field.');
    let index = -1;
    for (let k = 0; k < 24; k++) {
      const u = unit(k);
      if (eq(point[0], mul(r, u.cos)) && eq(point[1], mul(r, u.sin))) { index = k; break; }
    }
    if (index < 0) unsupported('The point does not have an angle on the pi/12 grid.');
    const answer = { exact: true, radius: exact(r), piMultiple: piMultiple(index) };
    return report('polar', operation, answer,
      [step(stableStringify(point.map(exact)), `r^2 = ${q}`, 'polar_radius_squared',
        'Compute x^2 + y^2 exactly and take its positive square root.'),
      step(`r = ${expression(r)}`, stableStringify(answer), 'polar_angle_match',
        'Find the unique grid angle whose exact sine and cosine reproduce both coordinates.')],
      ['Only exact points with a positive radius in Q(sqrt(2),sqrt(3)) and a pi/12 grid angle are supported.'],
      { normSquared: String(q), matchedIndex: index, reconstructed: point.map(x => expression(x)) });
  }
  if (operation === 'rotate') {
    fields(input, ['kind', 'topic', 'operation', 'point', 'angle'], 'input');
    const point = pair(input.point, 'point'), k = angle(input.angle), result = rotate(point, k);
    if (!eq(dot(point, point), dot(result, result))) unsupported('Rotation norm invariant failed.');
    const answer = vectorAnswer(result);
    return report('polar', operation, answer,
      [step(stableStringify(point.map(exact)), stableStringify(answer.components), 'polar_rotation',
        'Apply the exact rotation matrix and preserve squared radius.')],
      ['The rotation angle is on the pi/12 grid.'],
      { angleIndex: k, normSquared: expression(dot(point, point)) });
  }
  if (operation === 'polar_product') {
    fields(input, ['kind', 'topic', 'operation', 'first', 'second'], 'input');
    const a = polarPair(input.first, 'first'), b = polarPair(input.second, 'second');
    const r = a.radius.mul(b.radius), k = (a.index + b.index) % 24;
    const answer = { exact: true, radius: String(r), piMultiple: piMultiple(k),
      components: [exact(scale(unit(k).cos, r)), exact(scale(unit(k).sin, r))] };
    return report('polar', operation, answer,
      [step(stableStringify({ first: a, second: b }), stableStringify(answer), 'polar_complex_product',
        'Multiply the nonnegative radii and add the angles modulo a full turn.')],
      ['Both radii are nonnegative rationals and both angles are on the pi/12 grid.'],
      { firstIndex: a.index, secondIndex: b.index, resultIndex: k, radius: String(r) });
  }
  unsupported(`Unsupported polar operation: ${operation}.`);
}

function normAnswer(squared) {
  const q = rationalPart(squared);
  if (q === null) return { squared: exact(squared),
    magnitude: { expression: `sqrt(${expression(squared)})`, radicand: exact(squared) } };
  const inField = sqrtInField(q);
  return { squared: exact(squared), magnitude: inField ? exact(inField) : { expression: `sqrt(${q})`, radicand: String(q) } };
}

function vectors(input) {
  const operation = input.operation;
  const binary = ['add', 'subtract', 'dot', 'cross', 'distance', 'projection'];
  if (binary.includes(operation)) {
    fields(input, ['kind', 'topic', 'operation', 'a', 'b'], 'input');
    const a = vector(input.a, 'a'), b = vector(input.b, 'b');
    sameDimension(a, b);
    let answer, rule, explanation, evidence;
    if (operation === 'add' || operation === 'subtract') {
      const v = a.map((x, i) => operation === 'add' ? add(x, b[i]) : sub(x, b[i]));
      answer = vectorAnswer(v); rule = 'componentwise_vector_arithmetic';
      explanation = 'Add or subtract corresponding exact coordinates.';
      evidence = { dimension: a.length, components: v.map(expression) };
    } else if (operation === 'dot') {
      const value = dot(a, b);
      answer = { exact: true, value: exact(value), orthogonal: isZero(value) };
      rule = 'exact_dot_product'; explanation = 'Sum exact products of corresponding coordinates.';
      evidence = { dimension: a.length, products: a.map((x, i) => expression(mul(x, b[i]))) };
    } else if (operation === 'cross') {
      if (a.length === 2) {
        const value = sub(mul(a[0], b[1]), mul(a[1], b[0]));
        answer = { exact: true, determinant: exact(value) };
      } else {
        const v = [sub(mul(a[1], b[2]), mul(a[2], b[1])),
          sub(mul(a[2], b[0]), mul(a[0], b[2])), sub(mul(a[0], b[1]), mul(a[1], b[0]))];
        answer = vectorAnswer(v);
        if (!isZero(dot(v, a)) || !isZero(dot(v, b))) unsupported('Cross-product orthogonality check failed.');
      }
      rule = 'exact_cross_product'; explanation = 'Expand the two-dimensional determinant or three-dimensional cross product exactly.';
      evidence = { dimension: a.length, result: answer };
    } else if (operation === 'distance') {
      const delta = a.map((x, i) => sub(x, b[i]));
      answer = { exact: true, delta: vectorAnswer(delta), ...normAnswer(dot(delta, delta)) };
      rule = 'distance_from_vector_difference';
      explanation = 'Subtract coordinates, then sum their squares exactly.';
      evidence = { squared: expression(dot(delta, delta)) };
    } else {
      const denominator = dot(b, b);
      if (isZero(denominator)) invalid('Cannot project onto a zero vector.');
      const numerator = dot(a, b), factor = divide(numerator, denominator);
      const v = b.map(x => mul(factor, x));
      if (!isZero(dot(a.map((x, i) => sub(x, v[i])), b))) unsupported('Projection orthogonality check failed.');
      answer = { ...vectorAnswer(v), factor: exact(factor) };
      rule = 'exact_vector_projection';
      explanation = 'Compute (a dot b)/(b dot b) times b and check that the residual is orthogonal to b.';
      evidence = { numerator: expression(numerator), denominator: expression(denominator), residualDot: '0' };
    }
    return report('vector', operation, answer,
      [step(stableStringify({ a: a.map(exact), b: b.map(exact) }), stableStringify(answer), rule, explanation)],
      ['Vector coordinates belong to Q(sqrt(2),sqrt(3)).',
        ...(operation === 'projection' ? ['Projection requires a nonzero target vector.'] : [])], evidence);
  }
  if (operation === 'scale' || operation === 'norm' || operation === 'rotate') {
    fields(input, ['kind', 'topic', 'operation', 'a', ...(operation === 'scale' ? ['factor'] : operation === 'rotate' ? ['angle'] : [])], 'input');
    const a = vector(input.a, 'a');
    let answer, rule, explanation, evidence;
    if (operation === 'scale') {
      const factor = scalar(input.factor, 'factor'), v = a.map(x => mul(x, factor));
      answer = vectorAnswer(v); rule = 'exact_vector_scaling';
      explanation = 'Multiply every coordinate by the exact scalar.';
      evidence = { factor: expression(factor), components: v.map(expression) };
    } else if (operation === 'norm') {
      const squared = dot(a, a);
      answer = { exact: true, ...normAnswer(squared) }; rule = 'exact_vector_norm';
      explanation = 'Sum coordinate squares exactly; extract a field square root when one exists.';
      evidence = { dimension: a.length, squared: expression(squared) };
    } else {
      requireThat(a.length === 2, 'Vector rotation requires two dimensions.');
      const k = angle(input.angle), v = rotate(a, k);
      if (!eq(dot(a, a), dot(v, v))) unsupported('Vector rotation norm invariant failed.');
      answer = vectorAnswer(v); rule = 'exact_vector_rotation';
      explanation = 'Apply the exact two-dimensional rotation matrix and check squared norm.';
      evidence = { angleIndex: k, normSquared: expression(dot(a, a)) };
    }
    return report('vector', operation, answer,
      [step(stableStringify(a.map(exact)), stableStringify(answer), rule, explanation)],
      ['Vector coordinates belong to Q(sqrt(2),sqrt(3)).',
        ...(operation === 'rotate' ? ['Rotation angles lie on the pi/12 grid.'] : [])], evidence);
  }
  unsupported(`Unsupported vector operation: ${operation}.`);
}

function compute(input) {
  fields(input, ['kind', 'topic', 'operation', 'angle', 'angleA', 'angleB', 'radius', 'point',
    'first', 'second', 'a', 'b', 'factor', 'function', 'target', 'interval'], 'input');
  requireThat(input.kind === 'precalculus', 'kind must be precalculus.');
  requireThat(typeof input.operation === 'string', 'operation must be a string.');
  if (input.topic === 'trigonometry') return trig(input);
  if (input.topic === 'polar') return polar(input);
  if (input.topic === 'vector') return vectors(input);
  unsupported(`Unsupported AP Precalculus topic: ${input.topic}.`);
}

/** Compute a bounded exact structured rule report. Rejected reports carry no certificate. */
export function solvePrecalculus(input) {
  try { return compute(input); }
  catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : error.code === 'budget' ? 'unresolved' : 'unsupported',
      verified: false, topic: 'precalculus', answer: null, steps: [], restrictions: [], certificate: null,
      error: error.message || 'Unable to verify this AP Precalculus request.' };
  }
}

/** Replay from the original input; every answer, step and certificate field must match. */
export function verifyPrecalculusCertificate(input, candidate) {
  try { return candidate?.status === 'solved' && same(compute(input), candidate); }
  catch { return false; }
}
