// AP Precalculus Unit 4: exact structured parametric motion, without calculus.
// API: solveParametric(input), verifyParametricCertificate(input, report).
// x and y are ascending rational polynomial coefficients, degree at most 6.
// The optional domain is {type:'all_real'} (the default) or
// {type:'interval',from,to,includeFrom,includeTo}. Elimination requires degree
// at most 2 in each coordinate. All rational output values are reduced strings.
import { Q, MathError, stableStringify } from './core.js';

const fail = (message, code = 'invalid') => { throw new MathError(message, code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const str = value => String(value);
const zero = () => Q(0);
const abs = value => value.n < 0n ? value.neg() : value;
const step = (before, after, rule, explanation) => ({ before, after, rule, explanation, verified: true });

function fields(value, allowed, required) {
  if (!record(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) fail(`Expected fields: ${required.join(', ')}.`);
}
function rational(value, label) {
  if (typeof value !== 'string' && typeof value !== 'number' ||
      typeof value === 'string' && (value.length > 48 || !value.trim()) ||
      typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)))
    fail(`${label} must be a bounded exact rational number or string.`);
  const q = Q(value);
  if (abs(q).n.toString().length > 24 || q.d.toString().length > 24)
    fail(`${label} exceeds the rational size bound.`, 'budget');
  return q;
}
function polynomial(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7)
    fail(`${label} needs 1–7 ascending rational coefficients.`);
  const result = value.map((coefficient, index) => rational(coefficient, `${label}[${index}]`));
  while (result.length > 1 && result.at(-1).zero) result.pop();
  return result;
}
function evalPoly(coefficients, t) {
  let result = zero();
  for (let index = coefficients.length - 1; index >= 0; index--)
    result = result.mul(t).add(coefficients[index]);
  return result;
}
const point = values => values.map(str);
const coefficients = poly => poly.map(str);
const at = (poly, index) => poly[index] ?? zero();

function domainInput(value) {
  if (value === undefined) return { type: 'all_real' };
  if (!record(value)) fail('domain must be a structured object.');
  if (value.type === 'all_real') {
    fields(value, ['type'], ['type']);
    return { type: 'all_real' };
  }
  if (value.type !== 'interval') fail('Unsupported parameter domain.', 'unsupported');
  fields(value, ['type', 'from', 'to', 'includeFrom', 'includeTo'],
    ['type', 'from', 'to', 'includeFrom', 'includeTo']);
  if (typeof value.includeFrom !== 'boolean' || typeof value.includeTo !== 'boolean')
    fail('Interval endpoint inclusion must be boolean.');
  const from = rational(value.from, 'domain.from'), to = rational(value.to, 'domain.to');
  if (from.cmp(to) > 0 || from.eq(to) && !(value.includeFrom && value.includeTo))
    fail('The parameter domain must be a nonempty ordered interval.');
  return { type: 'interval', from, to, includeFrom: value.includeFrom, includeTo: value.includeTo };
}
function domainText(domain) {
  return domain.type === 'all_real' ? { type: 'all_real' } :
    { type: 'interval', from: str(domain.from), to: str(domain.to),
      includeFrom: domain.includeFrom, includeTo: domain.includeTo };
}
function contains(domain, t) {
  return domain.type === 'all_real' ||
    (t.cmp(domain.from) > 0 || t.eq(domain.from) && domain.includeFrom) &&
    (t.cmp(domain.to) < 0 || t.eq(domain.to) && domain.includeTo);
}
function checkPoint(domain, t, label) {
  if (!contains(domain, t)) fail(`${label} lies outside the parameter domain.`);
}

// The range of a continuous degree <= 2 polynomial on an interval is exactly
// the interval between these endpoint limits and any included vertex.
function coordinateRange(poly, domain) {
  if (poly.length === 1) return { lower: str(poly[0]), upper: str(poly[0]),
    lowerClosed: true, upperClosed: true };
  if (domain.type === 'all_real') {
    if (poly.length === 2) return { lower: '-∞', upper: '∞', lowerClosed: false, upperClosed: false };
    const vertex = poly[1].neg().div(poly[2].mul(2));
    const extreme = str(evalPoly(poly, vertex));
    return poly[2].n > 0n ?
      { lower: extreme, upper: '∞', lowerClosed: true, upperClosed: false } :
      { lower: '-∞', upper: extreme, lowerClosed: false, upperClosed: true };
  }
  const candidates = [
    { t: domain.from, value: evalPoly(poly, domain.from), included: domain.includeFrom },
    { t: domain.to, value: evalPoly(poly, domain.to), included: domain.includeTo },
  ];
  if (poly.length === 3) {
    const vertex = poly[1].neg().div(poly[2].mul(2));
    if (vertex.cmp(domain.from) >= 0 && vertex.cmp(domain.to) <= 0)
      candidates.push({ t: vertex, value: evalPoly(poly, vertex), included: contains(domain, vertex) });
  }
  let minimum = candidates[0].value, maximum = candidates[0].value;
  for (const candidate of candidates) {
    if (candidate.value.cmp(minimum) < 0) minimum = candidate.value;
    if (candidate.value.cmp(maximum) > 0) maximum = candidate.value;
  }
  return { lower: str(minimum), upper: str(maximum),
    lowerClosed: candidates.some(candidate => candidate.included && candidate.value.eq(minimum)),
    upperClosed: candidates.some(candidate => candidate.included && candidate.value.eq(maximum)) };
}

function elimination(x, y, domain) {
  if (x.length > 3 || y.length > 3)
    fail('Cartesian elimination requires coordinate degrees at most two.', 'unsupported');
  if (x.length === 1 && y.length === 1)
    return { relation: { type: 'point', x: str(x[0]), y: str(y[0]) },
      evidence: { case: 'constant_point', coefficients: { x: coefficients(x), y: coefficients(y) } } };

  const [a0, a1, a2] = [at(x, 0), at(x, 1), at(x, 2)];
  const [b0, b1, b2] = [at(y, 0), at(y, 1), at(y, 2)];
  const determinant = a1.mul(b2).sub(a2.mul(b1));
  if (determinant.zero) {
    const independent = x.length > 1 ? 'x' : 'y';
    const free = independent === 'x' ? x : y;
    const dependent = independent === 'x' ? y : x;
    const index = free[1]?.zero === false ? 1 : 2;
    const slope = at(dependent, index).div(at(free, index));
    if (![1, 2].every(i => at(dependent, i).eq(slope.mul(at(free, i)))))
      fail('The coordinate polynomials do not define a certifiable line.', 'unsupported');
    const intercept = at(dependent, 0).sub(slope.mul(at(free, 0)));
    const range = coordinateRange(free, domain);
    return { relation: { type: 'line', independent, dependent: independent === 'x' ? 'y' : 'x',
      slope: str(slope), intercept: str(intercept), independentRange: range },
    evidence: { case: 'dependent_coordinates', determinant: '0', free: coefficients(free),
      dependent: coefficients(dependent), slope: str(slope), intercept: str(intercept) } };
  }

  // U = D*t and V = D*t^2, so U^2 = D*V. The recovered t and its
  // original domain make this relation sufficient as well as necessary.
  const U = { x: b2, y: a2.neg(), constant: a2.mul(b0).sub(b2.mul(a0)) };
  const V = { x: b1.neg(), y: a1, constant: b1.mul(a0).sub(a1.mul(b0)) };
  const implicit = {
    x2: str(U.x.mul(U.x)), xy: str(U.x.mul(U.y).mul(2)), y2: str(U.y.mul(U.y)),
    x: str(U.x.mul(U.constant).mul(2).sub(determinant.mul(V.x))),
    y: str(U.y.mul(U.constant).mul(2).sub(determinant.mul(V.y))),
    constant: str(U.constant.mul(U.constant).sub(determinant.mul(V.constant))),
  };
  const recovery = { x: str(U.x), y: str(U.y), constant: str(U.constant),
    denominator: str(determinant) };
  return { relation: { type: 'implicit_quadratic', coefficients: implicit,
    parameterRecovery: recovery, parameterDomain: domainText(domain) },
  evidence: { case: 'independent_coordinates', determinant: str(determinant),
    linearT: recovery, linearTSquared: { x: str(V.x), y: str(V.y), constant: str(V.constant),
      denominator: str(determinant) } } };
}

function report(operation, answer, evidence, before, rule, explanation, restrictions) {
  return { status: 'solved', verified: true, kind: 'parametric', topic: 'parametric', operation, answer,
    steps: [step(before, stableStringify(answer), rule, explanation)], restrictions,
    certificate: { type: 'parametric', version: 1, assurance: 'exact-rational-replay', evidence } };
}
function compute(input) {
  fields(input, ['kind', 'operation', 'x', 'y', 'domain', 't', 'from', 'to'],
    ['kind', 'operation', 'x', 'y']);
  if (input.kind !== 'parametric') fail('kind must be parametric.');
  const operation = input.operation;
  if (!['domain', 'evaluate', 'motion', 'eliminate'].includes(operation))
    fail('Unsupported parametric operation.', 'unsupported');
  const allowed = ['kind', 'operation', 'x', 'y', 'domain',
    ...(operation === 'evaluate' ? ['t'] : operation === 'motion' ? ['from', 'to'] : [])];
  const required = [...allowed.filter(key => key !== 'domain')];
  fields(input, allowed, required);
  const x = polynomial(input.x, 'x'), y = polynomial(input.y, 'y');
  const domain = domainInput(input.domain), normalized = domainText(domain);
  const base = { x: coefficients(x), y: coefficients(y), domain: normalized };
  const before = stableStringify(base);
  if (operation === 'domain') {
    const answer = { exact: true, parameterDomain: normalized, coordinateDegrees: { x: x.length - 1, y: y.length - 1 } };
    return report(operation, answer, base, before, 'polynomial_domain',
      'Polynomial coordinates are defined for every real parameter; retain the supplied parameter restriction.',
      ['The parameter domain is nonempty.']);
  }
  if (operation === 'evaluate') {
    const t = rational(input.t, 't');
    checkPoint(domain, t, 't');
    const position = point([evalPoly(x, t), evalPoly(y, t)]);
    const answer = { exact: true, t: str(t), position, parameterDomain: normalized };
    return report(operation, answer, { ...base, t: str(t), position }, before,
      'exact_polynomial_substitution', 'Use Horner evaluation with reduced rational arithmetic at a parameter in the domain.',
      ['The evaluation parameter belongs to the supplied domain.']);
  }
  if (operation === 'motion') {
    const from = rational(input.from, 'from'), to = rational(input.to, 'to');
    if (from.eq(to)) fail('Average velocity needs distinct parameter endpoints.');
    checkPoint(domain, from, 'from'); checkPoint(domain, to, 'to');
    const start = [evalPoly(x, from), evalPoly(y, from)];
    const end = [evalPoly(x, to), evalPoly(y, to)];
    const displacement = end.map((value, index) => value.sub(start[index]));
    const velocity = displacement.map(value => value.div(to.sub(from)));
    const answer = { exact: true, from: str(from), to: str(to),
      start: point(start), end: point(end), displacement: point(displacement),
      averageVelocity: point(velocity), parameterDomain: normalized };
    return report(operation, answer, { ...base, from: str(from), to: str(to),
      start: point(start), end: point(end), deltaT: str(to.sub(from)),
      displacement: point(displacement) }, before, 'secant_vector',
    'Subtract endpoint positions for displacement, then divide each component by the signed parameter change.',
    ['The endpoints are distinct and both belong to the parameter domain.']);
  }
  const result = elimination(x, y, domain);
  const answer = { exact: true, relation: result.relation, parameterDomain: normalized };
  return report(operation, answer, { ...base, ...result.evidence }, before,
    'exact_cartesian_elimination',
    'Eliminate the parameter algebraically and retain the range or recovered-parameter restriction needed for the full path.',
    ['Both coordinate degrees are at most two.', 'The relation and its recorded restriction jointly describe the image.']);
}

function same(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 20000 || depth > 32) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  if (Array.isArray(expected) && expected.length !== actual.length) return false;
  const a = Reflect.ownKeys(expected).sort(), b = Reflect.ownKeys(actual).sort();
  return a.length === b.length && a.every((key, index) => key === b[index] &&
    same(expected[key], actual[key], budget, depth + 1));
}

/** Rejected requests carry no certificate and never claim verification. */
export function solveParametric(input) {
  try { return compute(input); }
  catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : error.code === 'budget' ? 'unresolved' : 'unsupported',
      verified: false, kind: 'parametric', topic: 'parametric', operation: record(input) && typeof input.operation === 'string' ? input.operation : null,
      answer: null, steps: [], restrictions: [], certificate: null,
      error: error.message || 'Unable to certify parametric request.' };
  }
}

/** Recompute every answer, step, restriction, and evidence field from the input. */
export function verifyParametricCertificate(input, reportValue) {
  try { return reportValue?.status === 'solved' && same(compute(input), reportValue); }
  catch { return false; }
}
