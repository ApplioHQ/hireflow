// Exact, deliberately bounded Algebra 1/2 rules. No decimal root tests or
// sampling identities: all branch decisions use Q or ordered quadratic fields.
import {
  MathError, Q, ZERO, ONE, num, sym, bin, print, parseExpression, parseStatement,
  normalizeInput, variables, walk, substitute, constantValue, rationalSqrt, rationalNthRoot,
  rationalFunction, reduceRational, rationalPrint, polynomial, pAdd, pSub, pMul,
  pScale, pEqual, pPrint, pVariables, coefficients, fromCoefficients,
  divideCoefficients, trimCoefficients, coefficientGcd, statementRestrictions,
} from './core.js';
import { solveEquation } from './algebra.js';
import { verifyAlgebraResult } from './verifier.js';

const fail = (message, code = 'unsupported') => { throw new MathError(message, code); };
const invalid = message => fail(message, 'invalid');
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const unique = a => [...new Set(a)];
const st = (before, after, rule, explanation) => ({ before, after, rule, explanation, verified: true });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const negate = ast => ({ type: 'neg', arg: ast });
const power = (ast, n) => bin('^', ast, num(n));
const pText = (c, v) => pPrint(fromCoefficients(c, v));
const degree = p => Math.max(0, ...[...p.keys()].map(k => monomial(k).reduce((s, [, n]) => s + n, 0)));
function monomial(key) { return key ? key.split('|').map(x => { const i = x.lastIndexOf(':'); return [x.slice(0, i), Number(x.slice(i + 1))]; }) : []; }
function variableName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) ||
      ['pi', 'e', 'i', '__proto__', 'prototype', 'constructor'].includes(name.toLowerCase())) invalid('Use a supported independent variable name.');
  const ast = parseExpression(name);
  if (ast.type !== 'sym' || ast.name !== name) invalid('The independent variable must parse as one symbol.');
  return name;
}
function oneVariable(asts, requested) {
  const names = unique(asts.flatMap(variables));
  if (names.length > 1) fail('Assign values to parameters first; this rule requires one unknown.');
  const v = variableName(requested ?? names[0] ?? 'x');
  if (names.some(n => n !== v)) fail('The expression contains an undeclared variable or parameter.');
  return v;
}
function replace(ast, target, value) {
  if (eq(ast, target)) return value;
  if (ast.type === 'binary') return bin(ast.op, replace(ast.left, target, value), replace(ast.right, target, value));
  if (ast.type === 'neg') return negate(replace(ast.arg, target, value));
  if (ast.type === 'call') return { ...ast, args: ast.args.map(a => replace(a, target, value)) };
  return ast;
}
function atoms(s, predicate) {
  const out = [];
  for (const side of [s.left, s.right]) walk(side, a => { if (predicate(a) && !out.some(b => eq(a, b))) out.push(a); });
  return out;
}
function domains(s) { return statementRestrictions(s); }
function domainText(ds) { return unique(ds.map(d => d.text ?? `${print(d.expression)} ${d.relation} ${d.value ?? '0'}`)); }
function condition(expression, relation, value = '0') { return { expression, relation, value, text: `${print(expression)} ${relation} ${value}` }; }
function validateDomains(s) {
  for (const d of domains(s)) {
    try {
      const r = rationalFunction(bin('-', d.expression, num(d.value ?? 0)));
      if (!r.num.size && ['!=', '>'].includes(d.relation)) invalid('An original domain condition is impossible.');
      if (!pVariables(r.num).length && !pVariables(r.den).length && !satisfies(d, {})) invalid('The original expression is undefined on its real domain.');
    } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
  }
}

// Unlike rational cancellation, polynomial input must preserve its syntactic
// domain: (x^2-1)/(x-1) is not accepted as a polynomial with no hole.
function poly(ast) {
  walk(ast, a => {
    if (a.type === 'binary' && a.op === '/' && variables(a.right).length) fail('This polynomial rule does not allow variable denominators.');
    if (a.type === 'binary' && a.op === '^') {
      const k = constantValue(a.right);
      if (!k.integer || k.cmp(0) < 0) fail('This rule requires polynomial integer powers.');
    }
    if (a.type === 'call') constantValue(a);
  });
  const r = rationalFunction(ast);
  if (pVariables(r.den).length) fail('A polynomial is required.');
  const denominator = r.den.get('') ?? ZERO;
  if (denominator.zero) invalid('A denominator is zero.');
  return pScale(r.num, ONE.div(denominator));
}

// a + b sqrt(d), d > 0. A rational square is immediately collapsed.
function field(a, b = ZERO, d = ZERO) {
  a = Q(a); b = Q(b); d = Q(d);
  if (b.zero || d.zero) return { a, b: ZERO, d: ZERO };
  if (d.cmp(0) < 0) fail('Only real algebraic values are supported.');
  const r = rationalSqrt(d);
  return r ? { a: a.add(b.mul(r)), b: ZERO, d: ZERO } : { a, b, d };
}
function align(x, y) {
  if (x.b.zero) return [field(x.a, 0, y.d), y, y.d];
  if (y.b.zero) return [x, field(y.a, 0, x.d), x.d];
  if (x.d.eq(y.d)) return [x, y, x.d];
  const ratio = rationalSqrt(y.d.div(x.d));
  if (!ratio) fail('These candidates require a higher algebraic number field.');
  return [x, field(y.a, y.b.mul(ratio), x.d), x.d];
}
// One further quadratic extension handles nested radicals from biquadratic
// elimination (for example a circle intersecting y=x^2). Its coefficients stay
// in a single ordered quadratic field; unsupported towers are never rounded.
function tower(a, b, d) {
  if ([a, b, d].some(x => x.extension)) fail('This candidate needs more than two quadratic extensions.', 'unresolved');
  if (!fsign(b) || !fsign(d)) return a;
  if (fsign(d) < 0) fail('A real quadratic extension requires a nonnegative radicand.');
  const known = fsqrt(d);
  if (known !== null) {
    try { return fadd(a, fmul(b, known)); } catch (e) { if (e.code !== 'unsupported') throw e; }
  }
  return { extension: true, a, b, d };
}
function towerAlign(x, y) {
  if (!x.extension) return [{ a: x, b: field(0) }, y, y.d];
  if (!y.extension) return [x, { a: y, b: field(0) }, x.d];
  if (fsign(fsub(x.d, y.d))) fail('Candidates require incompatible quadratic extensions.', 'unresolved');
  return [x, y, x.d];
}
function fadd(x, y) {
  if (x.extension || y.extension) { const [a, b, d] = towerAlign(x, y); return tower(fadd(a.a, b.a), fadd(a.b, b.b), d); }
  const [a, b, d] = align(x, y); return field(a.a.add(b.a), a.b.add(b.b), d);
}
const fneg = x => x.extension ? tower(fneg(x.a), fneg(x.b), x.d) : field(x.a.neg(), x.b.neg(), x.d);
const fsub = (x, y) => fadd(x, fneg(y));
function fmul(x, y) {
  if (x.extension || y.extension) {
    const [a, b, d] = towerAlign(x, y);
    return tower(fadd(fmul(a.a, b.a), fmul(fmul(a.b, b.b), d)), fadd(fmul(a.a, b.b), fmul(a.b, b.a)), d);
  }
  const [a, b, d] = align(x, y); return field(a.a.mul(b.a).add(a.b.mul(b.b).mul(d)), a.a.mul(b.b).add(a.b.mul(b.a)), d);
}
function fdiv(x, y) {
  if (y.extension) {
    const norm = fsub(fmul(y.a, y.a), fmul(fmul(y.b, y.b), y.d));
    if (!fsign(norm)) invalid('A candidate has a zero denominator.');
    return fmul(x, tower(fdiv(y.a, norm), fdiv(fneg(y.b), norm), y.d));
  }
  const norm = y.a.mul(y.a).sub(y.b.mul(y.b).mul(y.d));
  if (norm.zero) invalid('A candidate has a zero denominator.');
  return fmul(x, field(y.a.div(norm), y.b.neg().div(norm), y.d));
}
function fpow(x, n) { let r = field(1); for (let k = 0; k < Math.abs(n); k++) r = fmul(r, x); return n < 0 ? fdiv(field(1), r) : r; }
function fsign(x) {
  if (x.extension) {
    const a = fsign(x.a), b = fsign(x.b);
    if (!b) return a;
    if (!a || a === b) return b;
    const cmp = fsign(fsub(fmul(x.a, x.a), fmul(fmul(x.b, x.b), x.d)));
    return !cmp ? 0 : cmp > 0 ? a : b;
  }
  const a = x.a.cmp(0), b = x.b.cmp(0);
  if (!b) return a;
  if (!a || a === b) return b;
  const cmp = x.a.mul(x.a).cmp(x.b.mul(x.b).mul(x.d));
  return cmp === 0 ? 0 : cmp > 0 ? a : b;
}
function ftext(x) {
  if (x.extension) {
    const negative = fsign(x.b) < 0, mag = negative ? fneg(x.b) : x.b;
    const radical = `${!mag.extension && mag.b.zero && mag.a.eq(1) ? '' : `(${ftext(mag)})*`}sqrt(${ftext(x.d)})`;
    return !fsign(x.a) ? `${negative ? '-' : ''}${radical}` : `(${ftext(x.a)} ${negative ? '-' : '+'} ${radical})`;
  }
  if (x.b.zero) return String(x.a);
  const negative = x.b.cmp(0) < 0;
  const radical = `sqrt(${x.b.mul(x.b).mul(x.d)})`;
  return x.a.zero ? `${negative ? '-' : ''}${radical}` : `(${x.a} ${negative ? '-' : '+'} ${radical})`;
}
function fsqrt(x) {
  if (x.extension) return null;
  if (fsign(x) < 0) return null;
  if (x.b.zero) return field(0, 1, x.a);
  const normRoot = rationalSqrt(x.a.mul(x.a).sub(x.b.mul(x.b).mul(x.d)));
  if (normRoot === null) return null;
  for (const sign of [1, -1]) {
    const a = rationalSqrt(x.a.add(normRoot.mul(sign)).div(2));
    if (a === null || a.zero) continue;
    const r = field(a, x.b.div(a.mul(2)), x.d);
    if (!fsign(fsub(fmul(r, r), x))) return fsign(r) < 0 ? fneg(r) : r;
  }
  return null;
}
function exactSqrt(x) {
  const r = fsqrt(x);
  return r ?? tower(field(0), field(1), x);
}
function peval(p, env) {
  let sum = field(0);
  for (const [key, c] of p) {
    let term = field(c);
    for (const [v, n] of monomial(key)) {
      if (!Object.hasOwn(env, v)) fail('A candidate still contains a parameter.');
      term = fmul(term, fpow(env[v], n));
    }
    sum = fadd(sum, term);
  }
  return sum;
}
function exactAt(ast, env) { const r = rationalFunction(ast); return fdiv(peval(r.num, env), peval(r.den, env)); }
function satisfies(d, env) {
  try {
    const sign = fsign(fsub(exactAt(d.expression, env), field(d.value ?? 0)));
    if (d.relation === '!=') return sign !== 0;
    if (d.relation === '>') return sign > 0;
    if (d.relation === '>=') return sign >= 0;
    fail('Unsupported domain relation.');
  } catch (e) { if (e.code === 'invalid') return false; throw e; }
}
function roots(c, v, evidence = []) {
  c = trimCoefficients(c.map(Q));
  if (c.length === 1) return { roots: [], identity: c[0].zero };
  if (c.length === 2) return { roots: [field(c[0].neg().div(c[1]))], identity: false };
  if (c.length === 3) {
    const [constant, b, a] = c, disc = b.mul(b).sub(a.mul(constant).mul(4));
    if (disc.cmp(0) < 0) return { roots: [], identity: false };
    const center = b.neg().div(a.mul(2)), scale = ONE.div(a.mul(2));
    const rs = disc.zero ? [field(center)] : [field(center, scale.neg(), disc), field(center, scale, disc)];
    rs.sort((x, y) => fsign(fsub(x, y)));
    return { roots: rs, identity: false };
  }
  if (c.length === 5 && c[1].zero && c[3].zero) {
    const ys = roots([c[0], c[2], c[4]], v).roots, negative = [], nonnegative = [];
    for (const y of ys) {
      if (fsign(y) < 0) continue;
      const r = exactSqrt(y);
      if (!fsign(r)) nonnegative.push(r); else { negative.push(fneg(r)); nonnegative.push(r); }
    }
    return { roots: [...negative.reverse(), ...nonnegative], identity: false };
  }
  if (c.length > 9) fail('The derived polynomial exceeds the exact root degree budget.', 'unresolved');
  const derivative = c.slice(1).map((q, i) => q.mul(i + 1)), repeated = coefficientGcd(c, derivative);
  if (repeated.length > 1) {
    // Over characteristic zero, removing gcd(P,P') preserves exactly the
    // distinct roots. This is important for repeated resultant factors.
    return roots(divideCoefficients(c, repeated).quotient, v, evidence);
  }
  // The existing factorization solver supplies a separately checked subproof.
  const child = solveEquation(`${pText(c, v)} = 0`, { variable: v });
  if (child.status !== 'solved' || !verifyAlgebraResult(child)) fail('The elimination polynomial is beyond the available exact root strategies.', 'unresolved');
  evidence.push(child.certificate);
  const rs = child.details.roots.map(r => {
    if (r.rational !== null) return field(r.rational);
    if (!r.definingPolynomial || r.definingPolynomial.length !== 3) fail('An unsupported algebraic root was returned.', 'unresolved');
    const quadratic = roots(r.definingPolynomial.map(Q), v).roots;
    return quadratic[r.order === 'lower' ? 0 : 1];
  });
  if (rs.some(r => fsign(peval(fromCoefficients(c, v), { [v]: r })) !== 0)) fail('An exact root residual failed.', 'unresolved');
  return { roots: rs, identity: false };
}
function answerRoots(v, rs, identity = false) {
  const solutions = unique(rs.map(r => typeof r === 'string' ? r : ftext(r)));
  const answer = { variable: v, solutions, complete: true };
  if (identity) { answer.identity = true; answer.solutionSet = 'All real numbers'; }
  else if (!solutions.length) answer.solutionSet = 'No solution';
  return answer;
}
function report(topic, answer, steps, restrictions = [], evidence = {}) { return { topic, answer, steps, restrictions: unique(restrictions), evidence }; }

// Compare values in different quadratic fields without approximating either
// radical. If u and z have the same sign, u-z has the sign of
// sign(u)*(u^2-z^2); the latter lies in u's single quadratic field.
function fcompare(x, y) {
  if (x.extension || y.extension) fail('Ordering these critical points needs a higher algebraic field.', 'unresolved');
  try { return fsign(fsub(x, y)); }
  catch (e) { if (e.code !== 'unsupported') throw e; }
  const u = field(x.a.sub(y.a), x.b, x.d), z = field(0, y.b, y.d);
  const su = fsign(u), sz = fsign(z);
  if (!su || !sz || su !== sz) return su || -sz;
  return su * fsign(fsub(fmul(u, u), field(y.b.mul(y.b).mul(y.d))));
}
function distinctOrdered(values) {
  const sorted = [...values].sort(fcompare);
  return sorted.filter((value, i) => !i || fcompare(value, sorted[i - 1]) !== 0);
}
function domainBoundaryRoots(ds, v, evidence) {
  const boundaries = [];
  for (const d of ds) {
    if (d.relation !== '!=' || d.value !== '0') fail('This rational rule requires denominator exclusions only.');
    const numerator = rationalFunction(d.expression).num;
    const rr = roots(coefficients(numerator, v), v, evidence);
    if (rr.identity) invalid('An original denominator is identically zero.');
    boundaries.push(...rr.roots);
  }
  return distinctOrdered(boundaries);
}
function zeroProductFactors(s) {
  let product;
  try {
    if (constantValue(s.right).zero) product = s.left;
  } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
  if (!product) try {
    if (constantValue(s.left).zero) product = s.right;
  } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
  if (!product) return null;
  let decomposed = false;
  const visit = ast => {
    if (ast.type === 'binary' && ast.op === '*') { decomposed = true; return [...visit(ast.left), ...visit(ast.right)]; }
    if (ast.type === 'binary' && ast.op === '^') {
      const k = constantValue(ast.right);
      if (k.integer && k.cmp(1) > 0) { decomposed = true; return visit(ast.left); }
    }
    if (ast.type === 'neg') return visit(ast.arg);
    return [ast];
  };
  const factors = visit(product);
  if (factors.length > 16) fail('The zero-product rule has too many factors.', 'unresolved');
  return decomposed ? factors : null;
}
function rationalEquation(s, options) {
  const v = oneVariable([s.left, s.right], options.variable);
  const residual = rationalFunction(bin('-', s.left, s.right));
  const c = coefficients(residual.num, v), evidence = [], factors = zeroProductFactors(s);
  const factorProofs = [];
  let rr;
  if (factors) {
    const candidates = [];
    let identity = false;
    for (const factor of factors) {
      const fc = coefficients(rationalFunction(factor).num, v), found = roots(fc, v, evidence);
      factorProofs.push({ expression: print(factor), numerator: fc.map(String), roots: found.roots.map(ftext), identity: found.identity });
      candidates.push(...found.roots); identity ||= found.identity;
    }
    rr = { roots: identity ? [] : distinctOrdered(candidates), identity };
  } else rr = roots(c, v, evidence);
  const ds = domains(s), restrictions = domainText(ds), boundary = rr.identity ? domainBoundaryRoots(ds, v, evidence) : [];
  const kept = rr.roots.filter(x => ds.every(d => satisfies(d, { [v]: x })));
  for (const x of kept) {
    const env = { [v]: x };
    if (fsign(fsub(exactAt(s.left, env), exactAt(s.right, env)))) fail('An original equation residual failed.', 'unresolved');
  }
  const answer = answerRoots(v, kept, rr.identity);
  if (rr.identity) answer.solutionSet = boundary.length ? `All real numbers except {${boundary.map(ftext).join(', ')}}` : 'All real numbers';
  const normalized = `${pPrint(residual.num)} = 0`;
  return report('rational_equation', answer, [
    st(s.source, normalized, factors ? 'exact_zero_product' : 'clear_rational_denominators', factors ? 'A finite product is zero exactly when at least one factor is zero. Solve every factor completely while retaining the original domain.' : 'On the recorded original domain, a rational equality is equivalent to its exact cross-multiplied numerator being zero.'),
    st(normalized, rr.identity ? answer.solutionSet : `${v} ∈ {${kept.map(ftext).join(', ')}}`, 'complete_exact_roots_and_domain', 'Find every real numerator root, check each original denominator, and verify retained roots in the original equation. A zero numerator holds on precisely the original domain.'),
  ], restrictions, { numerator: c.map(String), factors: factorProofs, candidates: rr.roots.map(ftext), excluded: rr.roots.filter(x => !kept.includes(x)).map(ftext), domainBoundary: boundary.map(ftext), children: evidence });
}

function polynomialDivision(input) {
  if (typeof input.dividend !== 'string' || typeof input.divisor !== 'string') invalid('Provide dividend and divisor expressions.');
  const a = parseExpression(input.dividend), b = parseExpression(input.divisor);
  const v = oneVariable([a, b], input.variable), A = poly(a), B = poly(b);
  const ac = coefficients(A, v), bc = coefficients(B, v);
  if (bc.length === 1 && bc[0].zero) invalid('Cannot divide by the zero polynomial.');
  const division = divideCoefficients(ac, bc), q = fromCoefficients(division.quotient, v), r = fromCoefficients(division.remainder, v);
  if (!pEqual(A, pAdd(pMul(B, q), r)) || (r.size && degree(r) >= degree(B))) fail('Polynomial division identity failed.', 'unresolved');
  const identity = `${pPrint(A)} = (${pPrint(B)})*(${pPrint(q)}) + (${pPrint(r)})`;
  return report('polynomial_division', { variable: v, quotient: pPrint(q), remainder: pPrint(r), identity }, [
    st(`(${input.dividend}) / (${input.divisor})`, identity, 'euclidean_polynomial_division', 'Divide leading coefficients exactly; dividend = divisor*quotient + remainder and the remainder has smaller degree.'),
  ], [], { dividend: ac.map(String), divisor: bc.map(String), quotient: division.quotient.map(String), remainder: division.remainder.map(String) });
}

function functionAst(text, v) {
  if (typeof text !== 'string' || !text.trim()) invalid('Provide the function expression as text.');
  const s = parseStatement(text);
  if (s.kind === 'function') {
    if (s.variable !== v) fail('The function declaration uses a different independent variable.');
    return s.expression;
  }
  if (s.kind !== 'expression') invalid('Expected a function expression or f(x) = expression.');
  return s.expression;
}
function functionOperation(input) {
  const v = variableName(input.variable ?? 'x'), f = functionAst(input.f, v);
  oneVariable([f], v);
  validateDomains({ expression: f });
  rationalFunction(f); // These operations currently cover rational functions.
  const fd = domains({ expression: f });
  if (input.operation === 'evaluate') {
    if (typeof input.value !== 'string' && typeof input.value !== 'number') invalid('Supply an exact rational value.');
    if (typeof input.value === 'number' && !Number.isSafeInteger(input.value)) invalid('Use text for noninteger or large exact values.');
    const value = constantValue(parseExpression(String(input.value))), env = { [v]: field(value) };
    if (!fd.every(d => satisfies(d, env))) invalid('The evaluation point is outside the original function domain.');
    const result = exactAt(f, env), expression = substitute(f, v, num(value));
    return report('function_evaluation', { variable: v, value: ftext(result) }, [st(`${print(f)} at ${v} = ${value}`, ftext(result), 'exact_function_substitution', 'Check the original domain before substituting and performing exact rational arithmetic.')], domainText(fd), { substituted: print(expression) });
  }
  if (input.operation === 'compose') {
    const g = functionAst(input.g, v); oneVariable([g], v); rationalFunction(g);
    validateDomains({ expression: g });
    const composed = substitute(f, v, g), expression = rationalPrint(rationalFunction(composed), v);
    const ds = [...domains({ expression: g }), ...fd.map(d => condition(substitute(d.expression, v, g), d.relation, d.value))];
    return report('function_composition', { variable: v, expression }, [st(`f(${v}) = ${print(f)}; g(${v}) = ${print(g)}`, `f(g(${v})) = ${expression}`, 'compose_rational_functions', 'Substitute g into f and retain both the domain of g and the preimage of the original domain of f.')], domainText(ds), { substituted: print(composed) });
  }
  if (input.operation !== 'inverse') invalid('Function operation must be compose, inverse, or evaluate.');
  const r = reduceRational(rationalFunction(f), v), n = coefficients(r.num, v), d = coefficients(r.den, v);
  if (n.length > 2 || d.length > 2) fail('A single-valued inverse is currently supported for nonconstant linear fractional functions.');
  const [b = ZERO, a = ZERO] = n, [e = ZERO, c = ZERO] = d;
  const determinant = a.mul(e).sub(b.mul(c));
  if (determinant.zero) fail('A constant function has no inverse on its real domain.');
  const numerator = bin('-', num(b), bin('*', num(e), sym(v)));
  const denominator = bin('-', bin('*', num(c), sym(v)), num(a));
  const inverse = bin('/', numerator, denominator), expression = rationalPrint(rationalFunction(inverse), v);
  const ds = [...domains({ expression: inverse }), ...fd.map(item => condition(substitute(item.expression, v, inverse), item.relation, item.value))];
  const both = [substitute(f, v, inverse), substitute(inverse, v, f)];
  for (const ast of both) { const z = rationalFunction(bin('-', ast, sym(v))); if (z.num.size) fail('An inverse composition identity failed.', 'unresolved'); }
  return report('function_inverse', { variable: v, expression }, [st(`y = ${print(f)}`, `${v} = ${expression.replaceAll(v, 'y')}`, 'invert_linear_fractional', 'Cross multiply and solve the affine equation for the original input; the nonzero determinant proves injectivity.'), st(`f^(-1)(${v})`, expression, 'inverse_domain_and_identities', 'Both compositions reduce exactly to the identity. Exclude every inverse pole and every image of an original domain hole.')], domainText(ds), { determinant: String(determinant), compositions: both.map(print) });
}

const flip = r => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[r]);
const interval = (low, high, lowClosed = false, highClosed = false) => ({ low: String(low), high: String(high), lowClosed, highClosed });
function intervalsText(a) { return a.map(i => i.low === i.high ? `{${i.low}}` : `${i.lowClosed ? '[' : '('}${i.low}, ${i.high}${i.highClosed ? ']' : ')'}`).join(' ∪ ') || '∅'; }
function relationAllows(relation, sign) {
  return relation === '<' ? sign < 0 : relation === '<=' ? sign <= 0 :
    relation === '>' ? sign > 0 : relation === '>=' ? sign >= 0 : relation === '!=' ? sign !== 0 : false;
}
function multiplicity(c, x, v) {
  let current = trimCoefficients(c), count = 0;
  while (current.length > 1 && !fsign(peval(fromCoefficients(current, v), { [v]: x }))) {
    count++;
    current = current.slice(1).map((q, i) => q.mul(i + 1));
  }
  return count;
}
function rationalInequality(s, options) {
  const v = oneVariable([s.left, s.right], options.variable);
  const residual = reduceRational(rationalFunction(bin('-', s.left, s.right)), v);
  const numerator = coefficients(residual.num, v), denominator = coefficients(residual.den, v);
  const evidence = [], nr = roots(numerator, v, evidence), dr = roots(denominator, v, evidence);
  const ds = domains(s), holes = domainBoundaryRoots(ds, v, evidence);
  const points = distinctOrdered([...nr.roots, ...dr.roots, ...holes]);
  let sign = numerator.length === 1 && numerator[0].zero ? 0 : numerator.at(-1).cmp(0) * denominator.at(-1).cmp(0) *
    ((numerator.length + denominator.length) % 2 ? -1 : 1);
  // The parity factor above is (-1)^(degree numerator + degree denominator).
  const regionSigns = [sign];
  for (const x of points) {
    if ((multiplicity(numerator, x, v) + multiplicity(denominator, x, v)) % 2) sign = -sign;
    regionSigns.push(sign);
  }
  const regions = regionSigns.map(x => relationAllows(s.relation, x));
  const included = points.map(x => {
    const env = { [v]: x };
    if (!ds.every(d => satisfies(d, env))) return false;
    if (!fsign(peval(residual.den, env))) return false;
    const valueSign = fsign(peval(residual.num, env)) * fsign(peval(residual.den, env));
    return relationAllows(s.relation, valueSign);
  });
  const pieces = [];
  for (let i = 0; i <= points.length; i++) {
    if (regions[i]) pieces.push(interval(i ? ftext(points[i - 1]) : '-∞', i < points.length ? ftext(points[i]) : '∞', i > 0 && included[i - 1], i < points.length && included[i]));
    if (i < points.length && included[i] && !regions[i] && !regions[i + 1]) pieces.push(interval(ftext(points[i]), ftext(points[i]), true, true));
  }
  const intervals = [];
  for (const part of pieces) {
    const previous = intervals.at(-1);
    if (previous && previous.high === part.low && previous.highClosed && part.lowClosed) {
      previous.high = part.high; previous.highClosed = part.highClosed;
    } else intervals.push(part);
  }
  const solutionSet = intervalsText(intervals), normalized = `${rationalPrint(residual, v)} ${s.relation} 0`;
  return report('rational_inequality', { variable: v, intervals, solutionSet, complete: true }, [
    st(s.source, normalized, 'normalize_rational_inequality', 'Move all terms to one side and simplify the rational expression while retaining every original denominator exclusion.'),
    st(normalized, `${v} ∈ ${solutionSet}`, 'exact_rational_sign_chart', 'Order every exact zero, pole, and original domain hole. Start with the leading-term sign at negative infinity, flip only at odd multiplicities, and check all endpoints on the original domain.'),
  ], domainText(ds), { numerator: numerator.map(String), denominator: denominator.map(String), criticalPoints: points.map(ftext), regionSigns, excluded: points.filter((_, i) => !included[i]).map(ftext), children: evidence });
}
function isolate(s, atom, v, allowVariable = false) {
  const placeholder = '_advanced_atom';
  if (variables(s.left).concat(variables(s.right)).includes(placeholder)) fail('Reserved internal variable.');
  const l = replace(s.left, atom, sym(placeholder)), r = replace(s.right, atom, sym(placeholder));
  const p = poly(bin('-', l, r));
  const coefficient = p.get(`${placeholder}:1`) ?? ZERO;
  if (coefficient.zero) fail('A single isolated special-function term is required.');
  const rest = pSub(p, new Map([[`${placeholder}:1`, coefficient]]));
  if (pVariables(rest).includes(placeholder) || (!allowVariable && pVariables(rest).length) || pVariables(rest).some(n => n !== v)) fail('The special function must be isolated by a constant affine scale and shift.');
  return { coefficient, target: pScale(rest, ONE.neg().div(coefficient)) };
}
function absoluteInequality(s, options) {
  const aa = atoms(s, a => a.type === 'call' && a.name === 'abs');
  if (aa.length !== 1 || !['<', '<=', '>', '>='].includes(s.relation)) fail('This rule requires one absolute value in an inequality.');
  const atom = aa[0], v = oneVariable([s.left, s.right], options.variable), inner = coefficients(poly(atom.args[0]), v);
  if (inner.length > 2) fail('Absolute-value inequalities currently require an affine argument.');
  const isolated = isolate(s, atom, v), t = isolated.target.get('') ?? ZERO;
  const relation = isolated.coefficient.cmp(0) < 0 ? flip(s.relation) : s.relation;
  const [b = ZERO, a = ZERO] = inner, closed = relation.endsWith('='), inside = relation.startsWith('<');
  let result;
  if (a.zero) {
    const abs = b.cmp(0) < 0 ? b.neg() : b, sign = abs.cmp(t);
    const yes = relation === '<' ? sign < 0 : relation === '<=' ? sign <= 0 : relation === '>' ? sign > 0 : sign >= 0;
    result = yes ? [interval('-∞', '∞')] : [];
  } else if (t.cmp(0) < 0 || (t.zero && !inside && closed)) result = inside ? [] : [interval('-∞', '∞')];
  else {
    const bounds = [t.neg().sub(b).div(a), t.sub(b).div(a)].sort((x, y) => x.cmp(y));
    if (inside) result = t.zero && !closed ? [] : [interval(bounds[0], bounds[1], closed, closed)];
    else result = [interval('-∞', bounds[0], false, closed), interval(bounds[1], '∞', closed, false)];
  }
  const solutionSet = intervalsText(result), isolatedText = `${print(atom)} ${relation} ${t}`;
  return report('absolute_value_inequality', { variable: v, intervals: result, solutionSet, complete: true }, [
    st(s.source, isolatedText, 'isolate_absolute_value', 'Undo the constant scale and shift; reverse the inequality for a negative scale.'),
    st(isolatedText, `${v} ∈ ${solutionSet}`, 'absolute_value_range_and_intervals', 'Use |u| >= 0 and the exact intersection or union of the two affine bounds, including endpoint strictness.'),
  ], [], { coefficient: String(isolated.coefficient), threshold: String(t), inner: inner.map(String) });
}

function biquadratic(s, options) {
  const v = oneVariable([s.left, s.right], options.variable), p = pSub(poly(s.left), poly(s.right)), c = coefficients(p, v);
  if (c.length !== 5 || !c[1].zero || !c[3].zero) fail('This substitution requires a quartic polynomial in the square of one variable.');
  const ys = roots([c[0], c[2], c[4]], v).roots, accepted = ys.filter(r => fsign(r) >= 0), xs = [];
  for (const y of accepted) {
    if (!fsign(y)) { xs.push('0'); continue; }
    const exact = y.b.zero ? rationalSqrt(y.a) : null, value = exact ? String(exact) : `sqrt(${ftext(y)})`;
    xs.push(`-${value}`, value);
  }
  const derived = `${pText([c[0], c[2], c[4]], '_u')} = 0`;
  return report('biquadratic_equation', answerRoots(v, xs), [
    st(s.source, `${derived}; _u = ${v}^2 >= 0`, 'square_substitution', 'Replace each even power using u = x^2. The original polynomial is exactly the substituted quadratic.'),
    st(derived, `_u ∈ {${ys.map(ftext).join(', ')}}`, 'exact_quadratic_formula', 'Compute every real quadratic root with exact rational discriminant arithmetic.'),
    st(`_u ∈ {${ys.map(ftext).join(', ')}}`, `${v} ∈ {${xs.join(', ')}}`, 'nonnegative_substitution_backsolve', 'Discard negative u by exact algebraic sign, then take both square roots of each positive u and one root of zero.'),
  ], [], { coefficients: c.map(String), substitutedRoots: ys.map(ftext), excluded: ys.filter(y => fsign(y) < 0).map(ftext) });
}

function exponential(s, options) {
  const unpack = a => {
    if (a.type === 'call' && a.name === 'exp') return { base: 'e', exponent: a.args[0] };
    if (a.type === 'binary' && a.op === '^') {
      if (a.left.type === 'sym' && a.left.name === 'e') return { base: 'e', exponent: a.right };
      const b = constantValue(a.left);
      if (b.cmp(0) <= 0 || b.eq(1)) fail('Exponential injectivity requires a positive base different from one.');
      return { base: String(b), exponent: a.right };
    }
    return null;
  };
  const a = unpack(s.left), b = unpack(s.right);
  if (!a || !b || a.base !== b.base) fail('This exponential rule requires the same valid base on both sides.');
  const v = oneVariable([s.left, s.right], options.variable), p = pSub(poly(a.exponent), poly(b.exponent)), evidence = [];
  const rr = roots(coefficients(p, v), v, evidence), derived = `${print(a.exponent)} = ${print(b.exponent)}`;
  return report('equal_base_exponential_equation', answerRoots(v, rr.roots, rr.identity), [
    st(s.source, derived, 'equal_base_exponential_injectivity', 'For a positive base different from one, exponentiation is injective on all real exponents.'),
    st(derived, rr.identity ? 'All real numbers' : `${v} ∈ {${rr.roots.map(ftext).join(', ')}}`, 'exact_polynomial_roots', 'Solve the exponent equality by exact polynomial arithmetic.'),
  ], [], { base: a.base, coefficients: coefficients(p, v).map(String), children: evidence });
}

function logarithms(s, options) {
  const logs = atoms(s, a => a.type === 'call' && ['log', 'ln'].includes(a.name));
  if (!logs.length) fail('No logarithm rule applies.');
  const baseOf = a => {
    if (a.name === 'ln') return 'e';
    const b = a.args[1] ? constantValue(a.args[1]) : Q(10);
    if (b.cmp(0) <= 0 || b.eq(1)) invalid('A logarithm base must be positive and different from one.');
    return String(b);
  };
  const bases = logs.map(baseOf);
  if (bases.some(b => b !== bases[0])) fail('Logarithm laws currently require one common base.');
  const v = oneVariable([s.left, s.right], options.variable), placeholders = logs.map((_, i) => `_advanced_log${i}`);
  if ([s.left, s.right].flatMap(variables).some(n => placeholders.includes(n))) fail('Reserved internal variable.');
  let l = s.left, r = s.right;
  logs.forEach((a, i) => { l = replace(l, a, sym(placeholders[i])); r = replace(r, a, sym(placeholders[i])); });
  const linear = poly(bin('-', l, r));
  if (degree(linear) > 1 || pVariables(linear).some(n => !placeholders.includes(n))) fail('This rule requires a rational linear combination of logarithms equal to a constant.');
  const raw = placeholders.map(n => linear.get(`${n}:1`) ?? ZERO), first = raw.find(q => !q.zero);
  if (!first) fail('The logarithms cancel; the remaining domain requires separate analysis.');
  const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  const commonDen = raw.reduce((n, q) => n * q.d / gcd(n, q.d), 1n);
  const commonNum = raw.reduce((n, q) => gcd(n, q.n * (commonDen / q.d)), 0n);
  const scale = Q(`${first.cmp(0) < 0 ? -commonNum : commonNum}/${commonDen}`);
  const weights = raw.map(q => q.div(scale));
  if (weights.some(q => !q.integer || q.cmp(-8) < 0 || q.cmp(8) > 0)) fail('Logarithm powers must be bounded integer multiples of the first coefficient.');
  const target = (linear.get('') ?? ZERO).neg().div(scale), base = bases[0];
  let rhs;
  if (target.zero) rhs = ONE;
  else if (base !== 'e' && target.integer && target.cmp(-64) >= 0 && target.cmp(64) <= 0) rhs = Q(base).pow(Number(target));
  else fail('This logarithm-law rule requires an exact rational value after exponentiation.');
  let numerator = num(1), denominator = num(1);
  logs.forEach((a, i) => {
    poly(a.args[0]);
    const k = Number(weights[i]);
    if (k > 0) numerator = bin('*', numerator, power(a.args[0], k));
    if (k < 0) denominator = bin('*', denominator, power(a.args[0], -k));
  });
  const derived = bin('-', numerator, bin('*', num(rhs), denominator)), p = poly(derived), evidence = [], rr = roots(coefficients(p, v), v, evidence);
  if (rr.identity) fail('A logarithmic identity needs a separate exact description of its positivity domain.');
  const ds = domains(s), kept = rr.roots.filter(x => ds.every(d => satisfies(d, { [v]: x })));
  const equation = `${print(numerator)} = ${rhs}*(${print(denominator)})`;
  return report('logarithmic_equation', answerRoots(v, kept), [
    st(s.source, domainText(ds).join('; '), 'record_logarithm_positivity', 'Every original logarithm argument must be strictly positive; retain original denominator conditions as well.'),
    st(s.source, equation, logs.length === 2 && target.zero ? 'logarithm_injectivity' : 'logarithm_product_quotient_power_laws', 'On the recorded positive domains, combine logarithms with a common base and apply the inverse exponential. The product identity alone can introduce candidates outside those domains.'),
    st(equation, `${v} ∈ {${rr.roots.map(ftext).join(', ')}}`, 'exact_polynomial_candidates', 'Find the complete real root set of the derived polynomial.'),
    st(`Candidates: ${rr.roots.map(ftext).join(', ')}`, `${v} ∈ {${kept.map(ftext).join(', ')}}`, 'filter_original_logarithm_domain', 'Evaluate each original positivity and denominator condition in an exact ordered quadratic field.'),
  ], domainText(ds), { base, weights: weights.map(String), target: String(target), derived: pPrint(p), excluded: rr.roots.filter(x => !kept.includes(x)).map(ftext), children: evidence });
}

function radical(s, options) {
  const radicals = atoms(s, a => a.type === 'call' && a.name === 'sqrt');
  if (radicals.length !== 1) fail('This rule requires one isolated square root.');
  const atom = radicals[0], v = oneVariable([s.left, s.right], options.variable), isolated = isolate(s, atom, v, true);
  const argument = poly(atom.args[0]), target = isolated.target;
  if (degree(target) > 2 || degree(argument) > 2) fail('Isolated radicals currently require polynomial arguments and targets of degree at most two.');
  const h = parseExpression(pPrint(target)), p = pSub(argument, pMul(target, target)), evidence = [], rr = roots(coefficients(p, v), v, evidence);
  if (rr.identity) fail('A radical identity needs an exact inequality-domain solver.');
  const original = domains(s).map(d => ({ ...d, expression: replace(d.expression, atom, h) }));
  const ds = [...original, condition(h, '>=')];
  const kept = rr.roots.filter(x => ds.every(d => satisfies(d, { [v]: x })));
  const derived = `${pPrint(argument)} = (${pPrint(target)})^2`;
  return report('radical_equation', answerRoots(v, kept), [
    st(s.source, `sqrt(${pPrint(argument)}) = ${pPrint(target)}`, 'isolate_radical', 'Undo a constant affine scale and shift to isolate the principal square root.'),
    st(`sqrt(${pPrint(argument)}) = ${pPrint(target)}`, derived, 'square_to_generate_candidates', 'Squaring is necessary. It is sufficient only when the original radicand is nonnegative and the isolated right side is nonnegative.'),
    st(derived, `${v} ∈ {${rr.roots.map(ftext).join(', ')}}`, 'exact_polynomial_candidates', 'Compute all real roots of the squared equation exactly.'),
    st(`Candidates: ${rr.roots.map(ftext).join(', ')}`, `${v} ∈ {${kept.map(ftext).join(', ')}}`, 'filter_radical_candidates', 'Check every original restriction and the sign of the isolated right side exactly; on these conditions the principal square-root identity follows from the squared equality.'),
  ], domainText(ds), { derived: pPrint(p), excluded: rr.roots.filter(x => !kept.includes(x)).map(ftext), children: evidence });
}

function nthRootText(q, k) {
  const exact = rationalNthRoot(q, k);
  return exact !== null ? String(exact) : `root(${q}, ${k})`;
}
function powerSpecs(s) {
  const out = [];
  const visit = a => {
    let atom = a, base, exponent, rootIndex;
    if (a.type === 'call' && a.name === 'root') {
      rootIndex = constantValue(a.args[1]);
      base = a.args[0]; exponent = ONE.div(rootIndex);
    } else if (a.type === 'binary' && a.op === '^' && a.left.type === 'call' && a.left.name === 'root') {
      rootIndex = constantValue(a.left.args[1]);
      base = a.left.args[0]; exponent = constantValue(a.right).div(rootIndex);
    } else if (a.type === 'binary' && a.op === '^') {
      try { const k = constantValue(a.right); if (!k.integer) { base = a.left; exponent = k; rootIndex = Q(k.d); } } catch {}
    }
    if (base) {
      if (!rootIndex.integer || rootIndex.cmp(2) < 0 || rootIndex.cmp(31) > 0) fail('Root indices from 2 through 31 are supported.');
      if (!out.some(x => eq(x.atom, atom))) out.push({ atom, base, exponent, rootIndex });
      return;
    }
    if (a.type === 'binary') { visit(a.left); visit(a.right); }
    else if (a.type === 'neg') visit(a.arg);
    else if (a.type === 'call') a.args.forEach(visit);
  };
  visit(s.left); visit(s.right); return out;
}
function rationalPower(s, options) {
  const aa = powerSpecs(s);
  if (aa.length !== 1) fail('This rule requires one isolated rational power.');
  const { atom, base: baseAst, exponent: k, rootIndex } = aa[0], v = oneVariable([s.left, s.right], options.variable);
  if (k.zero) fail('A zero power needs separate analysis of its original root domain.');
  if (k.n < -16n || k.n > 16n || k.d > 31n) fail('Rational exponent numerator is bounded by 16 and denominator by 31.');
  const isolated = isolate(s, atom, v), target = isolated.target.get('') ?? ZERO;
  const n = Number(k.n < 0n ? -k.n : k.n), denominator = Number(k.d), evenDomain = Number(rootIndex) % 2 === 0;
  const base = poly(baseAst), ds = domains(s).map(d => {
    // root(u,q) != 0 iff u != 0, including a negative outer power.
    if (d.relation === '!=' && d.expression.type === 'call' && d.expression.name === 'root' && eq(d.expression.args[0], baseAst)) return condition(baseAst, '!=');
    return { ...d, expression: replace(d.expression, atom, num(target)) };
  });
  if (evenDomain) ds.push(condition(baseAst, '>='));
  if (k.n < 0n) ds.push(condition(baseAst, '!='));
  const rangeImpossible = ((evenDomain || n % 2 === 0) && target.cmp(0) < 0) || (k.n < 0n && target.zero);
  let candidates = [], kept = [], derived = 'No real solution by the range of the rational power', evidence = [];
  if (!rangeImpossible) {
    const powered = (k.n < 0n ? ONE.div(target) : target).pow(denominator);
    derived = `(${pPrint(base)})^${n} = ${powered}`;
    if (n <= 2) {
      const p = pSub(n === 1 ? base : pMul(base, base), polynomial(powered)), rr = roots(coefficients(p, v), v, evidence);
      if (rr.identity) fail('A rational-power identity needs separate domain analysis.');
      candidates = rr.roots; kept = candidates.filter(x => ds.every(d => satisfies(d, { [v]: x })));
    } else {
      const c = coefficients(base, v);
      if (c.length !== 2 || c[1].zero) fail('Higher inverse powers currently require an affine base.');
      const positive = nthRootText(powered, n), values = n % 2 || powered.zero ? [positive] : evenDomain ? [positive] : [positive, `-(${positive})`];
      // For an affine base these branch signs are the entire original domain;
      // no other variable restrictions are allowed to go unchecked.
      if (ds.some(d => !eq(d.expression, baseAst))) fail('Additional domain restrictions need an algebraic-number extension.');
      kept = unique(values.map(value => c[0].zero && c[1].eq(1) ? value : `((${value}) - (${c[0]}))/(${c[1]})`));
      candidates = kept;
    }
  }
  const values = candidates.map(x => typeof x === 'string' ? x : ftext(x));
  return report('rational_power_equation', answerRoots(v, kept), [
    st(s.source, `${print(atom)} = ${target}`, 'isolate_rational_power', 'Isolate the rational power without changing its original real domain.'),
    st(`${print(atom)} = ${target}`, derived, 'real_rational_power_inverse', 'For the reduced exponent p/q, use the real qth root, its parity and sign, and invert a negative power only at a nonzero target.'),
    st(derived, `${v} ∈ {${kept.map(x => typeof x === 'string' ? x : ftext(x)).join(', ')}}`, 'filter_power_branches', 'Odd integer powers are injective. Even powers have both signs except when the original even-root domain requires a nonnegative base. Check all original restrictions.'),
  ], domainText(ds), { exponent: String(k), target: String(target), candidates: values, children: evidence });
}

function rootPolynomial(s, options) {
  const aa = atoms(s, a => a.type === 'call' && a.name === 'root');
  if (aa.length !== 1) fail('Root substitution requires one repeated root atom.');
  const atom = aa[0], v = oneVariable([s.left, s.right], options.variable), index = constantValue(atom.args[1]);
  if (!index.integer || index.cmp(2) < 0 || index.cmp(31) > 0) fail('Root substitution supports indices from 2 through 31.');
  const c = coefficients(poly(atom.args[0]), v);
  if (c.length !== 2 || c[1].zero) fail('Polynomial root-atom substitution currently requires an affine radicand.');
  const u = '_advanced_root';
  if ([s.left, s.right].flatMap(variables).includes(u)) fail('Reserved internal variable.');
  const inverse = bin('/', bin('-', power(sym(u), index), num(c[0])), num(c[1]));
  const transform = a => substitute(replace(a, atom, sym(u)), v, inverse);
  const p = poly(bin('-', transform(s.left), transform(s.right))), evidence = [];
  const rr = roots(coefficients(p, u), u, evidence);
  if (rr.identity) fail('A root-substitution identity needs separate domain analysis.');
  const ds = domains(s), transformedDomains = ds.map(d => ({ ...d, expression: transform(d.expression) }));
  const accepted = [], excluded = [], values = [];
  for (const candidate of rr.roots) {
    const env = { [u]: candidate };
    if ((Number(index) % 2 === 0 && fsign(candidate) < 0) || !transformedDomains.every(d => satisfies(d, env))) { excluded.push(ftext(candidate)); continue; }
    const value = fdiv(fsub(fpow(candidate, Number(index)), field(c[0])), field(c[1]));
    if (fsign(peval(p, env)) || fsign(fsub(exactAt(atom.args[0], { [v]: value }), fpow(candidate, Number(index))))) fail('Root substitution residual check failed.', 'unresolved');
    accepted.push(ftext(candidate)); values.push(value);
  }
  const derived = `${pPrint(p)} = 0`, substitution = `${u} = ${print(atom)}; ${v} = ${print(inverse)}`;
  return report('root_polynomial_equation', answerRoots(v, values), [
    st(s.source, `${derived}; ${substitution}`, 'polynomial_in_root_substitution', 'Replace every occurrence of the same real root by u and undo its affine radicand. This is a bijection onto all real u for odd indices and nonnegative u for even indices.'),
    st(derived, `${u} ∈ {${rr.roots.map(ftext).join(', ')}}`, 'exact_substitution_roots', 'Solve the substituted polynomial completely using exact rational and algebraic arithmetic.'),
    st(`${u} ∈ {${rr.roots.map(ftext).join(', ')}}`, `${v} ∈ {${values.map(ftext).join(', ')}}`, 'filter_root_range_and_back_substitute', 'Keep only the original root range and transformed domain conditions, raise u to the integer root index, and undo the affine radicand exactly. The parity conditions make this inverse sufficient.'),
  ], domainText(ds), { atom: print(atom), index: String(index), substitution, coefficients: coefficients(p, u).map(String), accepted, excluded, children: evidence });
}

// Sylvester resultant with polynomial entries; determinant expansion is bounded
// to a 4 by 4 matrix because both equations have total degree at most two.
function coefficientIn(p, variable) {
  const out = Array.from({ length: 3 }, () => polynomial(0));
  for (const [key, c] of p) {
    const terms = monomial(key), n = terms.find(([v]) => v === variable)?.[1] ?? 0;
    out[n] = pAdd(out[n], new Map([[terms.filter(([v]) => v !== variable).map(([v, k]) => `${v}:${k}`).join('|'), c]]));
  }
  while (out.length > 1 && !out.at(-1).size) out.pop();
  return out;
}
function determinant(matrix) {
  if (!matrix.length) return polynomial(1);
  if (matrix.length === 1) return matrix[0][0];
  return matrix[0].reduce((r, p, i) => pAdd(r, pScale(pMul(p, determinant(matrix.slice(1).map(row => row.filter((_, j) => j !== i)))), i % 2 ? -1 : 1)), polynomial(0));
}
function resultant(a, b) {
  const m = a.length - 1, n = b.length - 1;
  if (!m && !n) return null;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(Array.from({ length: m + n }, (_, j) => j >= i && j <= i + m ? a[m - (j - i)] : polynomial(0)));
  for (let i = 0; i < m; i++) rows.push(Array.from({ length: m + n }, (_, j) => j >= i && j <= i + n ? b[n - (j - i)] : polynomial(0)));
  return determinant(rows);
}
function fiberRoots(a, b, variable) {
  while (a.length > 1 && !fsign(a.at(-1))) a.pop();
  while (b.length > 1 && !fsign(b.at(-1))) b.pop();
  if ((a.length === 1 && fsign(a[0])) || (b.length === 1 && fsign(b[0]))) return [];
  const linear = [a, b].find(c => c.length === 2);
  if (linear) return [fdiv(fneg(linear[0]), linear[1])];
  if (a.length === 3 && b.length === 3) {
    const c1 = fsub(fmul(b[2], a[1]), fmul(a[2], b[1]));
    const c0 = fsub(fmul(b[2], a[0]), fmul(a[2], b[0]));
    if (fsign(c1)) return [fdiv(fneg(c0), c1)];
    if (fsign(c0)) return [];
  }
  const quadratic = [a, b].find(c => c.length === 3);
  if (!quadratic) fail('The system has a positive-dimensional component; a finite solution list would be incomplete.');
  if (quadratic.every(q => !q.extension && q.b.zero)) return roots(quadratic.map(q => q.a), variable).roots;
  const [c, coefficient, leading] = quadratic;
  const discriminant = fsub(fmul(coefficient, coefficient), fmul(field(4), fmul(leading, c)));
  if (fsign(discriminant) < 0) return [];
  const denom = fmul(field(2), leading), center = fdiv(fneg(coefficient), denom);
  if (!fsign(discriminant)) return [center];
  const offset = fdiv(exactSqrt(discriminant), denom);
  return [fsub(center, offset), fadd(center, offset)];
}
function nonlinearSystem(input) {
  if (!Array.isArray(input.equations) || input.equations.length !== 2 || input.equations.some(e => typeof e !== 'string')) invalid('Provide exactly two equation strings for a nonlinear system.');
  const ss = input.equations.map(parseStatement);
  if (ss.some(s => s.kind !== 'equation')) invalid('Every system entry must be an equation.');
  const names = unique(ss.flatMap(s => [...variables(s.left), ...variables(s.right)])).sort();
  const vs = input.variables ?? names;
  if (!Array.isArray(vs) || vs.length !== 2 || vs[0] === vs[1]) fail('Nonlinear systems currently require two distinct variables.');
  vs.forEach(variableName);
  if (names.some(n => !vs.includes(n))) fail('The equations contain an undeclared parameter.');
  const ps = ss.map(s => pSub(poly(s.left), poly(s.right)));
  if (ps.some(p => degree(p) > 2) || ps.every(p => degree(p) < 2)) fail('This system rule requires a linear and quadratic equation or two quadratic equations.');
  // Try both projections: a bad projection can produce an identically zero
  // resultant even though the other one supplies a finite, exact elimination.
  let chosen = null;
  for (const [x, y] of [vs, [...vs].reverse()]) {
    const a = coefficientIn(ps[0], y), b = coefficientIn(ps[1], y), res = resultant(a, b);
    if (res?.size) { chosen = { x, y, a, b, res }; break; }
  }
  if (!chosen) fail('The quadratics share a component or need a different elimination strategy.');
  const { x, y, a, b, res } = chosen, evidence = [], rr = roots(coefficients(res, x), x, evidence), pairs = [], rejected = [];
  for (const candidate of rr.roots) {
    const aa = a.map(p => peval(p, { [x]: candidate })), bb = b.map(p => peval(p, { [x]: candidate }));
    const fiber = fiberRoots(aa, bb, y);
    for (const other of fiber) {
      const env = { [x]: candidate, [y]: other };
      if (ps.every(p => !fsign(peval(p, env)))) {
        const pair = Object.fromEntries(vs.map(v => [v, ftext(env[v])]));
        if (!pairs.some(p => eq(p, pair))) pairs.push(pair);
      } else rejected.push({ [x]: ftext(candidate), [y]: ftext(other) });
    }
  }
  const answer = { variables: [...vs], solutions: pairs, type: pairs.length ? 'finite' : 'inconsistent', complete: true };
  if (!pairs.length) answer.solutionSet = 'No solution';
  return report('nonlinear_system', answer, [
    st(input.equations.join('; '), `${pPrint(res)} = 0`, 'quadratic_resultant_elimination', `Eliminate ${y} using the exact Sylvester determinant. Every original solution projects to a root of this nonzero resultant.`),
    st(`${pPrint(res)} = 0`, `${x} ∈ {${rr.roots.map(ftext).join(', ')}}`, 'exact_elimination_roots', 'Find every real root of the elimination polynomial.'),
    st(`Projected candidates for ${x}`, JSON.stringify(pairs), 'back_substitute_and_check_system', 'At every projected root solve the full specialized fiber, including vanishing leading coefficients, and verify both original polynomial residuals exactly. This also removes extraneous resultant candidates.'),
  ], [], { eliminated: y, resultant: pPrint(res), projectedRoots: rr.roots.map(ftext), rejected, children: evidence });
}

function textProblem(source, options) {
  const s = parseStatement(normalizeInput(source));
  s.source = source; // Certificates and the first visible step retain the original input.
  for (const side of [s.left, s.right].filter(Boolean)) walk(side, a => {
    if (a.type === 'call' && a.name === 'root') {
      const n = constantValue(a.args[1]);
      if (!n.integer || n.cmp(1) < 0) invalid('The root index must be a positive integer.');
    }
  });
  validateDomains(s);
  if (s.kind === 'inequality') return atoms(s, a => a.type === 'call' && a.name === 'abs').length ? absoluteInequality(s, options) : rationalInequality(s, options);
  if (s.kind !== 'equation') fail('No advanced rule handles this statement kind.');
  if (atoms(s, a => a.type === 'call' && ['ln', 'log'].includes(a.name)).length) return logarithms(s, options);
  if (atoms(s, a => a.type === 'call' && a.name === 'sqrt').length) return radical(s, options);
  const fractional = powerSpecs(s);
  if (fractional.length) {
    try { return rationalPower(s, options); }
    catch (e) { if (e.code !== 'unsupported') throw e; return rootPolynomial(s, options); }
  }
  if (atoms(s, a => (a.type === 'binary' && a.op === '^' && variables(a.right).length) || (a.type === 'call' && a.name === 'exp')).length) return exponential(s, options);
  try { return biquadratic(s, options); }
  catch (e) { if (e.code !== 'unsupported') throw e; return rationalEquation(s, options); }
}

function jsonInput(value, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 3000 || depth > 24) invalid('Input object exceeds the supported size.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 4096) fail('Input exceeds the text budget.', 'budget'); return value; }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, x => jsonInput(x, budget, depth + 1));
  if (!record(value)) invalid('Structured inputs must contain only JSON data.');
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonInput(v, budget, depth + 1)]));
}
function compute(input, options = {}) {
  if (!record(options)) invalid('Options must be an object.');
  if (options.domain !== undefined && !['real', 'complex'].includes(options.domain)) invalid('Domain must be real or complex.');
  if (options.domain === 'complex') fail('These advanced rules currently certify real domains only.');
  const proofOptions = {};
  if (options.variable !== undefined) proofOptions.variable = variableName(options.variable);
  if (options.domain !== undefined) proofOptions.domain = options.domain;
  const source = jsonInput(input);
  if (record(source) && source.variable !== undefined) variableName(source.variable);
  if (record(source) && source.variable !== undefined && proofOptions.variable !== undefined && source.variable !== proofOptions.variable) fail('Input and options declare different independent variables.');
  const effective = record(source) && proofOptions.variable !== undefined && source.variable === undefined ? { ...source, variable: proofOptions.variable } : source;
  let computed;
  if (typeof source === 'string') computed = textProblem(source, proofOptions);
  else if (!record(source)) invalid('Provide mathematical text or a structured problem.');
  else if (source.kind === 'polynomial_division') computed = polynomialDivision(effective);
  else if (source.kind === 'function_operation') computed = functionOperation(effective);
  else if (source.kind === 'system') computed = nonlinearSystem(source);
  else fail('No advanced rule handles this structured kind.');
  const { evidence, ...body } = computed;
  return { status: 'solved', verified: true, ...body, certificate: {
    type: 'advanced_algebra', version: 1, source, options: proofOptions,
    strategy: body.topic, assurance: 'exact-algebra-replay', evidence,
  } };
}

/** Bounded exact real-algebra families. Unsupported is an intentional fallback
 * signal to the parent router, never an assertion of curriculum completeness. */
export function solveAdvanced(input, options = {}) {
  try { return compute(input, options); }
  catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : ['budget', 'unresolved'].includes(error.code) ? 'unresolved' : error instanceof MathError ? 'unsupported' : 'invalid',
      verified: false, topic: 'advanced_algebra', answer: null, steps: [], restrictions: [],
      certificate: { type: 'advanced_algebra', version: 1, assurance: 'none' }, error: error.message || String(error) };
  }
}

function equalReport(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 100000 || depth > 48) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  const a = Object.keys(expected).sort(), b = Object.keys(actual).sort();
  if (a.length !== b.length || (Array.isArray(expected) && expected.length !== actual.length)) return false;
  return a.every((key, i) => key === b[i] && equalReport(expected[key], actual[key], budget, depth + 1));
}

/** Independent replay entry point: bind the original input, reconstruct every
 * algebraic/domain decision and compare the entire report. No submitted answer,
 * coefficient, step, or verified flag is accepted as proof. Callers must remove
 * their own routing/input metadata before verification. */
export function verifyAdvancedCertificate(input, result) {
  try {
    if (result?.status !== 'solved' || result.certificate?.type !== 'advanced_algebra') return false;
    return equalReport(compute(input, result.certificate.options), result);
  } catch { return false; }
}
