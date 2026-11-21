// Exact analysis of ordered, first-match, real piecewise polynomials.
import {
  MathError, Rational, Q, ZERO, ONE, parseExpression, parseStatement, normalizeInput,
  variables, walk, constantValue, rationalFunction, reduceRational,
  polynomialResidual, statementRestrictions, coefficients, pVariables, pDegree, pScale,
  pPrint, rationalSqrt,
} from './core.js';
import { evaluateCoefficients } from './algebra.js';
import { compareEndpoints, mergeIntervals, intersectIntervals } from './compound-inequalities.js';

const fail = (message, code = 'unsupported') => { throw new MathError(message, code); };
const invalid = message => fail(message, 'invalid');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const step = (before, after, rule, explanation) => ({ before, after, rule, explanation, verified: true });
const interval = (low, high, lowClosed = false, highClosed = false) => ({ low: String(low), high: String(high), lowClosed, highClosed });
const realLine = () => [interval('-∞', '∞')];
const finite = value => value !== '-∞' && value !== '∞';
const setText = intervals => intervals.map(i => i.low === i.high ? `{${i.low}}` : `${i.lowClosed ? '[' : '('}${i.low}, ${i.high}${i.highClosed ? ']' : ')'}`).join(' ∪ ') || '∅';

function normalized(input) {
  const clean = [];
  for (const original of input) {
    const i = { ...original };
    i.low = finite(i.low) ? String(Q(i.low)) : i.low;
    i.high = finite(i.high) ? String(Q(i.high)) : i.high;
    if (!finite(i.low)) i.lowClosed = false;
    if (!finite(i.high)) i.highClosed = false;
    const order = compareEndpoints(i.low, i.high);
    if (order < 0 || order === 0 && finite(i.low) && i.lowClosed && i.highClosed) clean.push(i);
  }
  return mergeIntervals(clean);
}
function contains(i, point) {
  const low = compareEndpoints(point, i.low), high = compareEndpoints(point, i.high);
  return (low > 0 || low === 0 && i.lowClosed) && (high < 0 || high === 0 && i.highClosed);
}
function subtractIntervals(domain, covered) {
  let result = domain;
  for (const cut of covered) {
    result = result.flatMap(i => {
      const common = intersectIntervals([i], [cut])[0];
      if (!common) return [i];
      return normalized([
        interval(i.low, common.low, i.lowClosed, !common.lowClosed),
        interval(common.high, i.high, !common.highClosed, i.highClosed),
      ]);
    });
  }
  return normalized(result);
}

function variableName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(value) ||
      ['pi', 'e', 'i', '__proto__', 'prototype', 'constructor'].includes(value.toLowerCase())) invalid('Use a supported independent variable name.');
  const ast = parseExpression(value);
  if (ast.type !== 'sym' || ast.name !== value) invalid('The independent variable must parse as a single symbol.');
  return value;
}
function rationalSyntax(ast, variable, polynomialOnly = false) {
  if (variables(ast).some(v => v !== variable)) fail('Piecewise branches and conditions cannot contain undeclared parameters.');
  walk(ast, node => {
    if (node.type === 'call') fail('Piecewise analysis supports rational polynomial branches and rational comparisons, not function calls.');
    if (node.type === 'binary' && node.op === '^') {
      const exponent = constantValue(node.right);
      if (!exponent.integer) fail('Noninteger powers require a separate piecewise strategy.');
      if (polynomialOnly && exponent.cmp(0) < 0 && variables(node.left).length) fail('Piecewise branch expressions must be polynomials.');
    }
    if (polynomialOnly && node.type === 'binary' && node.op === '/' && variables(node.right).length) fail('Variable denominators, including canceled holes, are not polynomial branches.');
  });
  // Bound formal numerator/denominator degrees before core normalization can
  // allocate dense coefficient arrays (nested powers can be enormous even
  // when the input has few tokens).
  const degrees = node => {
    if (node.type === 'num') return [0, 0];
    if (node.type === 'sym') return [node.name === variable ? 1 : 0, 0];
    if (node.type === 'neg') return degrees(node.arg);
    const [a, b] = degrees(node.left), [c, d] = node.op === '^' ? [0, 0] : degrees(node.right);
    let n, den;
    if (node.op === '+' || node.op === '-') { n = Math.max(a + d, c + b); den = b + d; }
    else if (node.op === '*') { n = a + c; den = b + d; }
    else if (node.op === '/') { n = a + d; den = b + c; }
    else {
      const k = constantValue(node.right);
      if (k.cmp(-32) < 0 || k.cmp(32) > 0) fail('Piecewise polynomial powers must be bounded by 32.');
      const magnitude = Math.abs(Number(k));
      n = (k.cmp(0) < 0 ? b : a) * magnitude; den = (k.cmp(0) < 0 ? a : b) * magnitude;
    }
    if (n > 64 || den > 64) fail('Piecewise expression expansion exceeds the polynomial degree budget.');
    return [n, den];
  };
  degrees(ast);
}
function polynomialBranch(source, variable) {
  if (typeof source !== 'string' || !source.trim()) invalid('Each piece needs an expression string.');
  const ast = parseExpression(source);
  rationalSyntax(ast, variable, true);
  const r = rationalFunction(ast);
  if (pVariables(r.den).length) fail('Piecewise branch expressions must be polynomials.');
  const denominator = r.den.get('') ?? ZERO;
  if (denominator.zero) invalid('A piece has a zero denominator.');
  const p = pScale(r.num, ONE.div(denominator));
  if (pDegree(p, variable) > 2) fail('Piecewise range analysis supports constant, affine, and quadratic polynomial branches.');
  const c = coefficients(p, variable);
  return { coefficients: c, normalizedExpression: pPrint(p) };
}

function rationalRoots(c) {
  if (c.length > 3) fail('Condition comparisons currently require numerator and denominator degrees at most two.');
  if (c.length === 1) return [];
  if (c.length === 2) return [{ value: String(c[0].neg().div(c[1])), multiplicity: 1 }];
  const [constant, b, a] = c, discriminant = b.mul(b).sub(a.mul(constant).mul(4));
  if (discriminant.cmp(0) < 0) return [];
  if (discriminant.zero) return [{ value: String(b.neg().div(a.mul(2))), multiplicity: 2 }];
  const radical = rationalSqrt(discriminant);
  if (radical === null) fail('Piecewise conditions with irrational interval endpoints are unsupported.');
  return [-1, 1].map(sign => ({ value: String(b.neg().add(radical.mul(sign)).div(a.mul(2))), multiplicity: 1 })).sort((x, y) => compareEndpoints(x.value, y.value));
}
const allowed = (relation, sign) => relation === '=' ? sign === 0 : relation === '!=' ? sign !== 0 : relation === '<' ? sign < 0 : relation === '<=' ? sign <= 0 : relation === '>' ? sign > 0 : sign >= 0;

// Leading signs and exact root multiplicities determine every interval sign.
// No floating-point ordering or sample evaluations establish a condition set.
function comparison(source, variable) {
  const s = parseStatement(source);
  if (!['equation', 'inequality'].includes(s.kind)) invalid('A piece condition must be a comparison or a compound comparison.');
  rationalSyntax(s.left, variable); rationalSyntax(s.right, variable);
  const raw = polynomialResidual(s);
  if (pDegree(raw.num, variable) > 32 || pDegree(raw.den, variable) > 32) fail('The condition expansion exceeds the supported degree budget.');
  const residual = reduceRational(raw, variable);
  const numerator = coefficients(residual.num, variable), denominator = coefficients(residual.den, variable);
  const nr = rationalRoots(numerator), dr = rationalRoots(denominator), holes = [];
  for (const d of statementRestrictions(s)) {
    if (d.relation !== '!=') fail('Only rational comparison domains are supported.');
    const r = rationalFunction(d.expression);
    if (pDegree(r.num, variable) > 2) fail('Original denominator exclusions currently require polynomials of degree at most two.');
    const c = coefficients(r.num, variable);
    if (c.length === 1 && c[0].zero) invalid('The condition has an impossible denominator restriction.');
    holes.push(...rationalRoots(c).map(root => root.value));
  }
  const points = [...new Set([...nr, ...dr].map(r => r.value).concat(holes))].sort(compareEndpoints);
  const result = [], leadingSign = numerator.at(-1).cmp(0) * denominator.at(-1).cmp(0);
  for (let i = 0; i <= points.length; i++) {
    const crossings = i === points.length ? 0 : [...nr, ...dr].filter(root => compareEndpoints(root.value, points[i]) >= 0).reduce((sum, root) => sum + root.multiplicity, 0);
    const sign = crossings % 2 ? -leadingSign : leadingSign;
    if (allowed(s.relation, sign)) result.push(interval(points[i - 1] ?? '-∞', points[i] ?? '∞'));
  }
  for (const point of points) {
    if (holes.includes(point)) continue;
    const den = evaluateCoefficients(denominator, Q(point));
    if (den.zero) continue;
    const sign = evaluateCoefficients(numerator, Q(point)).cmp(0) * den.cmp(0);
    if (allowed(s.relation, sign)) result.push(interval(point, point, true, true));
  }
  return { intervals: normalized(result), evidence: { source, numerator: numerator.map(String), denominator: denominator.map(String), numeratorRoots: nr, denominatorRoots: dr, holes } };
}
function conditionDomain(source, variable, work) {
  if (typeof source !== 'string' || !source.trim()) invalid('Each piece needs a condition string.');
  const text = normalizeInput(source), keyword = text.toLowerCase();
  if (['otherwise', 'else', 'true', 'all'].includes(keyword)) return { intervals: realLine(), evidence: { source, type: 'all_reals' } };
  if (['false', 'none', '∅'].includes(keyword)) return { intervals: [], evidence: { source, type: 'empty_set' } };
  // Follow the compound-inequality grammar: AND binds before OR and chained
  // comparisons are intersections. Logical parentheses are explicitly outside
  // this grammar; arithmetic parentheses around expressions remain supported.
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) invalid('Unbalanced condition parentheses.');
    if (depth > 0 && /[<>=!∧∨]/.test(char)) fail('Parenthesized logical comparisons are unsupported; use chains or AND/OR clauses.');
  }
  if (depth) invalid('Unbalanced condition parentheses.');
  const groups = text.split(/\s+or\s+|∨/i);
  if (groups.length > 16) fail('The condition exceeds the disjunction budget.', 'budget');
  const union = [], children = [];
  for (const group of groups) {
    let intersection = realLine();
    const clauses = group.split(/\s+and\s+|∧/i);
    if (clauses.length > 16) fail('The condition exceeds the conjunction budget.', 'budget');
    for (const clause of clauses) {
      const parts = clause.split(/(<=|>=|!=|=|<|>)/).map(s => s.trim());
      if (parts.length < 3 || parts.length > 17 || parts.some(s => !s)) invalid('A condition comparison is incomplete or too long.');
      for (let i = 0; i + 2 < parts.length; i += 2) {
        if (++work.comparisons > 256) fail('The piecewise comparison budget was reached.', 'budget');
        const child = comparison(`${parts[i]} ${parts[i + 1]} ${parts[i + 2]}`, variable);
        children.push(child.evidence);
        intersection = intersectIntervals(intersection, child.intervals);
      }
    }
    union.push(...intersection);
  }
  return { intervals: normalized(union), evidence: { source, type: 'compound_comparison', children } };
}

function endpointValue(point, c) {
  if (finite(point)) return String(evaluateCoefficients(c, Q(point)));
  const degree = c.length - 1, sign = c.at(-1).cmp(0) * (degree % 2 && point === '-∞' ? -1 : 1);
  return sign > 0 ? '∞' : '-∞';
}
function mapMonotone(domain, c, increasing) {
  const low = endpointValue(domain.low, c), high = endpointValue(domain.high, c);
  return increasing ? interval(low, high, finite(low) && domain.lowClosed, finite(high) && domain.highClosed) : interval(high, low, finite(high) && domain.highClosed, finite(low) && domain.lowClosed);
}
function branchRange(domain, c) {
  const segments = [], a = c[2] ?? ZERO, b = c[1] ?? ZERO;
  const vertex = a.zero ? null : b.neg().div(a.mul(2));
  for (const piece of domain) {
    if (c.length === 1 || piece.low === piece.high) {
      const value = c.length === 1 ? String(c[0]) : endpointValue(piece.low, c);
      segments.push({ domain: piece, range: interval(value, value, true, true), monotonicity: c.length === 1 ? 'constant' : 'point' });
    } else if (a.zero) {
      segments.push({ domain: piece, range: mapMonotone(piece, c, b.cmp(0) > 0), monotonicity: b.cmp(0) > 0 ? 'increasing' : 'decreasing' });
    } else {
      const left = intersectIntervals([piece], [interval('-∞', vertex, false, true)]);
      const right = intersectIntervals([piece], [interval(vertex, '∞', true, false)]);
      for (const [side, direction] of [[left, -a.cmp(0)], [right, a.cmp(0)]]) for (const part of side) {
        segments.push({ domain: part, range: mapMonotone(part, c, direction > 0), monotonicity: direction > 0 ? 'increasing' : 'decreasing' });
      }
    }
  }
  return { intervals: normalized(segments.map(s => s.range)), segments, vertex: vertex === null ? null : String(vertex) };
}

function copyInput(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 10000 || depth > 24) fail('The piecewise input exceeds the object budget.', 'budget');
  if (value instanceof Rational || typeof value === 'bigint') return String(value);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 4096) fail('A piecewise string exceeds the text budget.', 'budget'); return value; }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, x => copyInput(x, budget, depth + 1));
  if (!record(value)) invalid('Piecewise inputs must contain JSON data or exact rational values.');
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyInput(child, budget, depth + 1)]));
}
function reportBudget(report) {
  const pending = [[report, 0]]; let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (++nodes > 150000 || depth > 48) fail('The piecewise report exceeds the replay budget.', 'budget');
    if (value !== null && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
  }
}
function compute(input) {
  const source = copyInput(input);
  if (!record(source) || source.kind !== 'piecewise') invalid('Provide a structured piecewise input.');
  const variable = variableName(source.variable === undefined ? 'x' : source.variable);
  if (!Array.isArray(source.pieces)) invalid('pieces must be an ordered array.');
  if (source.pieces.length > 64) fail('At most 64 pieces are supported.', 'budget');
  const rows = [], evidence = [], steps = [], work = { comparisons: 0 }; let domain = [];
  for (let index = 0; index < source.pieces.length; index++) {
    const piece = source.pieces[index];
    if (!record(piece)) invalid('Each piece must contain expression and condition strings.');
    const polynomial = polynomialBranch(piece.expression, variable), claimed = conditionDomain(piece.condition, variable, work);
    const effective = subtractIntervals(claimed.intervals, domain), image = branchRange(effective, polynomial.coefficients);
    rows.push({ index, expression: piece.expression, condition: piece.condition,
      conditionIntervals: claimed.intervals, domainIntervals: effective, rangeIntervals: image.intervals,
      domain: setText(effective), range: setText(image.intervals) });
    evidence.push({ index, normalizedExpression: polynomial.normalizedExpression, coefficients: polynomial.coefficients.map(String), condition: claimed.evidence, vertex: image.vertex, segments: image.segments });
    const label = index + 1;
    steps.push(step(piece.condition, `D_${label} = ${setText(claimed.intervals)}`, 'solve_piece_condition', 'Use exact comparison signs, rational endpoints, and intersection/union for compound conditions.'));
    steps.push(step(`D_${label} minus earlier branch domains ${setText(domain)}`, `D_${label} = ${setText(effective)}`, 'first_match_domain_subtraction', 'Subtract every earlier branch domain. At a shared endpoint, the earliest matching branch owns the value.'));
    steps.push(step(`${piece.expression} on ${setText(effective)}`, `R_${label} = ${setText(image.intervals)}`, effective.length ? polynomial.coefficients.length === 3 ? 'quadratic_monotone_interval_images' : 'affine_or_constant_interval_images' : 'empty_piece_image',
      effective.length ? polynomial.coefficients.length === 3 ? `Split at the exact rational vertex ${image.vertex}; map each monotone interval using its endpoint values and inclusion flags. Infinite limits are fixed by the leading coefficient.` : 'Map each effective interval exactly, reversing endpoints for a negative slope; a constant maps every nonempty interval to one included value.' : 'An empty effective domain contributes no values to the range.'));
    domain = normalized([...domain, ...effective]);
  }
  const range = normalized(rows.flatMap(row => row.rangeIntervals));
  const answer = { variable, semantics: 'first-match', pieces: rows, domainIntervals: domain, rangeIntervals: range, domain: setText(domain), range: setText(range), complete: true };
  steps.push(step('Effective branch domains and images', `Domain = ${answer.domain}; Range = ${answer.range}`, 'union_piecewise_domain_and_range', 'Take the exact union of effective branch domains and their images, merging endpoints only when the shared value is included.'));
  if (Object.hasOwn(source, 'value')) {
    const value = source.value;
    if (!['string', 'number'].includes(typeof value) || typeof value === 'number' && !Number.isSafeInteger(value)) invalid('Supply the evaluation point as an exact rational string or safe integer.');
    const point = Q(value), row = rows.find(r => r.domainIntervals.some(i => contains(i, String(point))));
    answer.evaluation = { at: String(point), defined: Boolean(row), branch: row?.index ?? null, value: row ? String(evaluateCoefficients(evidence[row.index].coefficients.map(Q), point)) : null };
    steps.push(step(`f(${point})`, row ? answer.evaluation.value : 'Undefined (outside the piecewise domain)', 'evaluate_first_matching_piece', row ? `The first matching piece is branch ${row.index + 1}; substitute the point using exact rational arithmetic.` : 'No branch includes the requested point, so the function has no value there.'));
  }
  const report = { status: 'solved', verified: true, topic: 'piecewise', answer, steps, restrictions: [], certificate: { type: 'piecewise', version: 1, source, semantics: 'first-match', assurance: 'exact-rational-interval-replay', branches: evidence } };
  reportBudget(report);
  return report;
}

export function solvePiecewise(input) {
  try { return compute(input); }
  catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : error.code === 'budget' ? 'unresolved' : error instanceof MathError ? 'unsupported' : 'invalid', verified: false, topic: 'piecewise', answer: null, steps: [], restrictions: [], certificate: { type: 'piecewise', version: 1, assurance: 'none' }, error: error.message || String(error) };
  }
}

function equalReport(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 150000 || depth > 48) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  const a = Object.keys(expected).sort(), b = Object.keys(actual).sort();
  if (a.length !== b.length || Array.isArray(expected) && expected.length !== actual.length) return false;
  return a.every((key, i) => key === b[i] && equalReport(expected[key], actual[key], budget, depth + 1));
}

/** Replay from the original ordered request and compare every visible and
 * certificate field; submitted flags, branch order, and interval data are never
 * treated as proof. Facade-owned routing metadata must be removed by callers. */
export function verifyPiecewiseCertificate(input, result) {
  try { return result?.status === 'solved' && result.certificate?.type === 'piecewise' && equalReport(compute(input), result); }
  catch { return false; }
}
