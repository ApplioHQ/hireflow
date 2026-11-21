import { MathError, Q, ZERO, ONE, num, sym, bin, print, parseExpression, parseStatement, variables, walk, substitute, constantValue, evaluate, rationalSqrt, rationalFunction, reduceRational, rationalPrint, polynomial, polySymbol, pAdd, pSub, pMul, pScale, pEqual, pPrint, pVariables, pEvaluate, coefficients, fromCoefficients, divideCoefficients, trimCoefficients, polynomialResidual, statementRestrictions, restrictionSatisfied } from './core.js';

export const step = (before, after, rule, explanation, extra = {}) => ({ before, after, rule, explanation, verified: false, ...extra });
const union = a => [...new Set(a)];
const baseResult = topic => ({ status: 'solved', verified: false, topic, steps: [], restrictions: [] });
const root = (value, approximate, rational = null, extra = {}) => ({ value: String(value), approximate, rational: rational === null ? null : String(rational), ...extra });
function divisors(n) { n = n < 0n ? -n : n; if (n > 100000000n) return []; const out = []; for (let k = 1n; k * k <= n; k++) if (n % k === 0n) { out.push(k); if (k * k !== n) out.push(n / k); if (out.length > 2000) break; } return out; }
function rationalRootCandidates(c) {
  if (c[0].zero) return [ZERO];
  // Clear denominators without rounding before applying the rational-root theorem.
  const denominator = c.reduce((a, x) => a * x.d, 1n), ints = c.map(x => x.n * (denominator / x.d));
  const a = divisors(ints[0]), b = divisors(ints.at(-1)), out = new Map();
  if (a.length * b.length > 10000) return [];
  for (const n of a) for (const d of b) for (const sign of [1n, -1n]) { const q = Q(`${sign * n}/${d}`); out.set(String(q), q); }
  return [...out.values()];
}
export function evaluateCoefficients(c, x) { let r = ZERO; for (let i = c.length - 1; i >= 0; i--) r = r.mul(x).add(c[i]); return r; }
export function polynomialRoots(input, { complex = true } = {}) {
  const c = trimCoefficients(input.map(Q)), degree = c.length - 1;
  if (degree === 0) return { roots: [], complete: true, identity: c[0].zero, factors: [], remaining: c.map(String) };
  if (degree === 1) { const q = c[0].neg().div(c[1]); return { roots: [root(q, Number(q), q)], complete: true, factors: [], remaining: c.map(String) }; }
  if (degree === 2) {
    const [d, b, a] = c, discriminant = b.mul(b).sub(a.mul(d).mul(4)), denom = a.mul(2);
    if (discriminant.n < 0n && !complex) return { roots: [], complete: true, discriminant: String(discriminant), remaining: c.map(String) };
    const radical = rationalSqrt(discriminant.n < 0n ? discriminant.neg() : discriminant), out = [];
    for (const sign of discriminant.zero ? [1] : [1, -1]) {
      if (radical && discriminant.n >= 0n) { const q = b.neg().add(radical.mul(sign)).div(denom); out.push(root(q, Number(q), q)); }
      else if (discriminant.n < 0n) {
        const real = b.neg().div(denom), imag = radical ? radical.div(denom).mul(sign) : null;
        const value = imag ? `${real}${imag.n < 0n ? ' - ' : ' + '}${imag.n < 0n ? imag.neg() : imag}*i` : `(${b.neg()} ${sign > 0 ? '+' : '-'} sqrt(${discriminant.neg()})*i)/(${denom})`;
        out.push(root(value, null, null, { complex: true, real: String(real), imaginary: imag ? String(imag) : null, discriminant: String(discriminant), branch: sign }));
      } else {
        const value = `(${b.neg()} ${sign > 0 ? '+' : '-'} sqrt(${discriminant}))/(${denom})`;
        out.push(root(value, (-Number(b) + sign * Math.sqrt(Number(discriminant))) / Number(denom), null, { discriminant: String(discriminant), branch: sign, definingPolynomial: c.map(v => String(v.div(a))), order: sign * a.cmp(0) > 0 ? 'upper' : 'lower' }));
      }
    }
    out.sort((a, b) => (a.approximate ?? 0) - (b.approximate ?? 0));
    return { roots: out, complete: true, discriminant: String(discriminant), remaining: c.map(String) };
  }
  if (degree > 8) return { roots: [], complete: false, remaining: c.map(String) };
  for (const candidate of rationalRootCandidates(c)) if (evaluateCoefficients(c, candidate).zero) {
    const division = divideCoefficients(c, [candidate.neg(), ONE]);
    const rest = polynomialRoots(division.quotient, { complex });
    const roots = [root(candidate, Number(candidate), candidate), ...rest.roots].filter((a, i, arr) => arr.findIndex(b => b.value === a.value) === i).sort((a, b) => (a.approximate ?? 0) - (b.approximate ?? 0));
    return { ...rest, roots, factors: [String(candidate), ...(rest.factors || [])] };
  }
  return { roots: [], complete: false, remaining: c.map(String) };
}
function validRoot(r, restrictions, variable) {
  if (r.rational !== null) return restrictions.every(x => restrictionSatisfied(x, { [variable]: r.rational }) !== false);
  for (const restriction of restrictions) {
    if (restriction.relation !== '!=' || !r.definingPolynomial) throw new MathError('Unable to certify an irrational root against this domain restriction.');
    const rf = rationalFunction(bin('-', restriction.expression, num(restriction.value))), c = coefficients(rf.num, variable), minimal = r.definingPolynomial.map(Q);
    if (divideCoefficients(c, minimal).remainder.every(x => x.zero)) return false;
  }
  return true;
}
export function solveEquation(source, options = {}) {
  const s = typeof source === 'string' ? parseStatement(source) : source;
  if (s.kind !== 'equation') throw new MathError('An equation is required.', 'invalid');
  const vars = union([...variables(s.left), ...variables(s.right)]), variable = options.variable || vars[0] || 'x';
  if (vars.length > 1) throw new MathError('This equation has multiple unknowns. Submit a system or specify values for the other variables.');
  let residual;
  try { residual = polynomialResidual(s); } catch (e) {
    if (e.code === 'invalid' || e.code === 'budget') throw e;
    return solveSpecialEquation(s, options);
  }
  const c = coefficients(residual.num, variable), domain = statementRestrictions(s), roots = polynomialRoots(c, { complex: options.domain === 'complex' });
  // Canceled denominator roots must not be reintroduced as solutions.
  const candidates = roots.roots, accepted = candidates.filter(r => validRoot(r, domain, variable));
  if (accepted.some(r => r.rational === null) && domain.length) {
    for (const restriction of domain) {
      try { const rr = rationalFunction(restriction.expression), dr = polynomialRoots(coefficients(rr.num, variable), { complex: false });
        for (let i = accepted.length - 1; i >= 0; i--) if (dr.roots.some(d => d.value === accepted[i].value)) accepted.splice(i, 1);
        if (!dr.complete) throw new MathError('Unable to certify every irrational root against the domain restrictions.');
      } catch (e) { if (e instanceof MathError) throw e; }
    }
  }
  const out = baseResult(c.length <= 2 ? 'linear_equation' : c.length === 3 ? 'quadratic_equation' : 'polynomial_equation');
  out.restrictions = domain.map(x => x.text);
  if (out.restrictions.length) out.steps.push(step(s.source, s.source, 'record_domain', 'Keep the original domain restrictions throughout the solution.'));
  const normalized = `${pPrint(residual.num)} = 0`;
  out.steps.push(step(s.source, normalized, 'normalize_equation', 'Collect terms and clear denominators only on the original domain.'));
  if (!roots.complete) {
    out.status = 'unresolved'; out.answer = { variable, solutions: accepted.map(r => r.value), complete: false, remainingPolynomial: pPrint(fromCoefficients(roots.remaining.map(Q), variable)) };
    out.error = 'Exact root search exhausted the supported factorization strategies. Any listed roots are partial, not a complete solution.';
  } else if (c.length === 1) {
    out.answer = { variable, solutions: [], solutionSet: roots.identity ? 'All values in the original domain' : 'No solution', identity: roots.identity, complete: true };
  } else out.answer = { variable, solutions: accepted.map(r => r.value), approximations: accepted.map(r => r.approximate), complete: true, solutionSet: accepted.length ? undefined : 'No solution' };
  const solutionText = roots.identity ? 'All values in the original domain' : accepted.length ? `${variable} ∈ {${accepted.map(r => r.value).join(', ')}}` : 'No solution';
  if (roots.complete) out.steps.push(step(normalized, solutionText, c.length === 2 ? 'linear_root' : c.length === 3 ? 'quadratic_formula' : 'factor_and_zero_product', c.length === 2 ? 'Isolate the variable using exact rational arithmetic.' : c.length === 3 ? `Apply the quadratic formula; the discriminant is ${roots.discriminant}.` : 'Factor using exact division, then apply the zero-product property.'));
  const excluded = candidates.filter(r => !accepted.includes(r));
  if (excluded.length) out.steps.push(step(candidates.map(r => r.value).join(', '), solutionText, 'filter_domain', 'Discard candidates excluded by the original equation.'));
  out.details = { roots: accepted, excluded: excluded.map(r => r.value), domain: options.domain || 'real' };
  out.certificate = { type: 'polynomial_equation', source: s.source, variable, coefficients: c.map(String), roots: accepted, rootComputation: roots, domain: options.domain || 'real' };
  return out;
}

function replaceNode(ast, target, replacement) { if (JSON.stringify(ast) === JSON.stringify(target)) return replacement; if (ast.type === 'binary') return bin(ast.op, replaceNode(ast.left, target, replacement), replaceNode(ast.right, target, replacement)); if (ast.type === 'neg') return { type: 'neg', arg: replaceNode(ast.arg, target, replacement) }; if (ast.type === 'call') return { ...ast, args: ast.args.map(a => replaceNode(a, target, replacement)) }; return ast; }
export function isolateAtom(s, atom) {
  const left = replaceNode(s.left, atom, sym('_u')), right = replaceNode(s.right, atom, sym('_u'));
  const r = polynomialResidual({ left, right }), c = coefficients(r.num, '_u');
  if (c.length !== 2 || c[1].zero) throw new MathError('The special function could not be isolated by an affine transformation.');
  return c[0].neg().div(c[1]);
}
function affineExpressionSolution(ast, target, variable) {
  const r = rationalFunction(ast), c = coefficients(r.num, variable), d = coefficients(r.den, variable);
  if (c.length !== 2 || d.length !== 1) throw new MathError('The transformed exponent or function argument must be affine.');
  const a = c[1].div(d[0]), b = c[0].div(d[0]); return `((${target}) - (${b}))/(${a})`;
}
export function specialAtom(s) {
  const atoms = []; for (const side of [s.left, s.right]) walk(side, a => { if ((a.type === 'call' || (a.type === 'binary' && a.op === '^' && variables(a.right).length)) && variables(a).length && !atoms.some(b => JSON.stringify(a) === JSON.stringify(b))) atoms.push(a); });
  return atoms[0];
}
export function filterInverseRoots(roots, s, atom, target, variable) {
  const domain = statementRestrictions(s);
  return roots.filter(r => domain.every(d => {
    // The verified inverse guarantees the intrinsic argument restriction.
    if (atom.type === 'call' && JSON.stringify(d.expression) === JSON.stringify(atom.args[0]) && ((['sqrt', 'root'].includes(atom.name) && d.relation === '>=') || (['log', 'ln'].includes(atom.name) && d.relation === '>'))) return true;
    const transformed = { ...d, expression: replaceNode(d.expression, atom, num(target)) };
    const env = r.rational === null ? {} : { [variable]: r.rational };
    const state = restrictionSatisfied(transformed, env);
    if (state !== null) return state;
    if (r.rational === null && r.definingPolynomial && transformed.relation === '!=') return validRoot(r, [transformed], variable);
    throw new MathError('An inverse-rule candidate could not be certified against every original restriction.');
  }));
}
export function solveSpecialEquation(s, options = {}) {
  const variable = options.variable || union([...variables(s.left), ...variables(s.right)])[0] || 'x', atom = specialAtom(s);
  if (!atom) throw new MathError('This equation is outside the currently supported symbolic rule families.');
  let target;
  try { target = isolateAtom(s, atom); }
  catch (e) {
    // A radical can also be isolated against a variable expression, then candidates checked.
    if (atom.type === 'call' && atom.name === 'sqrt' && (JSON.stringify(s.left) === JSON.stringify(atom) || JSON.stringify(s.right) === JSON.stringify(atom))) {
      const other = JSON.stringify(s.left) === JSON.stringify(atom) ? s.right : s.left;
      const derived = `${print(atom.args[0])} = (${print(other)})^2`, child = solveEquation(derived, options);
      if (child.status !== 'solved' || child.details.roots.some(r => r.rational === null)) throw new MathError('Radical candidate validation currently requires rational roots.');
      const kept = child.details.roots.filter(r => { try { const env = { [variable]: r.rational }, arg = constantValue(substitute(atom.args[0], variable, num(r.rational))), rhs = constantValue(substitute(other, variable, num(r.rational))), square = rationalSqrt(arg); return square !== null && square.eq(rhs) && statementRestrictions(s).every(d => restrictionSatisfied(d, env) !== false); } catch { return false; } });
      const out = baseResult('radical_equation'); out.restrictions = statementRestrictions(s).map(x => x.text);
      out.answer = { variable, solutions: kept.map(r => r.value), complete: true, solutionSet: kept.length ? undefined : 'No solution' };
      out.steps = [step(s.source, derived, 'square_and_check', 'Squaring produces candidates; each must be checked in the original equation.'), ...child.steps, step(child.answer.solutions.join(', '), kept.map(r => r.value).join(', ') || 'No solution', 'reject_extraneous', 'Substitute each candidate into the original radical equation.')];
      out.details = { roots: kept, excluded: child.details.roots.filter(r => !kept.includes(r)).map(r => r.value) };
      out.certificate = { type: 'radical_candidates', source: s.source, derived, child: child.certificate, roots: kept }; return out;
    }
    throw e;
  }
  const out = baseResult(atom.type === 'binary' ? 'exponential_equation' : `${atom.name}_equation`);
  out.restrictions = statementRestrictions(s).map(x => x.text);
  let derived = [], children = [], symbolic = null;
  if (atom.type === 'call' && ['sqrt', 'root', 'abs'].includes(atom.name)) {
    const degree = atom.name === 'root' ? Number(constantValue(atom.args[1])) : 2;
    if (atom.name === 'root' && (!Number.isInteger(degree) || degree < 1 || degree > 31)) throw new MathError('Unsupported root degree.');
    if (target.n >= 0n || atom.name === 'root' && degree % 2 === 1) derived = atom.name === 'abs' ? [`${print(atom.args[0])} = ${target}`, `${print(atom.args[0])} = ${target.neg()}`] : [`${print(atom.args[0])} = ${target.pow(degree)}`];
  } else if (atom.type === 'call' && ['log', 'ln'].includes(atom.name)) {
    const base = atom.name === 'ln' ? null : atom.args[1] ? constantValue(atom.args[1]) : Q(10);
    if (base && (base.n <= 0n || base.eq(1))) throw new MathError('A logarithm base must be positive and different from 1.', 'invalid');
    if (target.zero) derived = [`${print(atom.args[0])} = 1`];
    else if (base && target.integer && Math.abs(Number(target)) <= 64) derived = [`${print(atom.args[0])} = ${base.pow(Number(target))}`];
    else { const t = `${base ? `(${base})` : 'e'}^(${target})`; symbolic = affineExpressionSolution(atom.args[0], t, variable); }
  } else if ((atom.type === 'binary' && atom.op === '^') || (atom.type === 'call' && atom.name === 'exp')) {
    const exponent = atom.type === 'binary' ? atom.right : atom.args[0], naturalBase = atom.type === 'call' || atom.left.type === 'sym' && atom.left.name === 'e', base = naturalBase ? null : constantValue(atom.left);
    if (base && (base.n <= 0n || base.eq(1))) throw new MathError('Exponential equations require a positive base other than 1.');
    if (target.n > 0n) {
      let exact = target.eq(1) ? ZERO : null; if (base) for (let k = -64; k <= 64; k++) if (base.pow(k).eq(target)) { exact = Q(k); break; }
      if (exact) derived = [`${print(exponent)} = ${exact}`];
      else symbolic = affineExpressionSolution(exponent, base ? `log(${target}, ${base})` : `ln(${target})`, variable);
    }
  } else throw new MathError('No verified inverse rule is available for this function.');
  children = derived.map(d => solveEquation(d, options));
  if (children.some(c => c.status !== 'solved')) throw new MathError('The transformed equation requires a more advanced solver.');
  const candidates = symbolic ? [root(symbolic, null)] : children.flatMap(c => c.details?.roots || []).filter((a, i, arr) => arr.findIndex(b => b.value === a.value) === i);
  const roots = filterInverseRoots(candidates, s, atom, target, variable);
  out.answer = { variable, solutions: roots.map(r => r.value), complete: true, solutionSet: roots.length ? undefined : 'No solution' };
  out.steps = [step(s.source, `${print(atom)} = ${target}`, 'isolate_special_function', 'Isolate the function before applying its inverse.'), ...derived.map(d => step(`${print(atom)} = ${target}`, d, 'inverse_function', 'Apply the inverse with its domain and range conditions.')), ...children.flatMap(c => c.steps)];
  if (symbolic) out.steps.push(step(`${print(atom)} = ${target}`, `${variable} = ${symbolic}`, 'inverse_affine', 'Apply the inverse function and undo the affine argument. The result is exact, not a decimal approximation.'));
  if (!roots.length) out.steps.push(step(`${print(atom)} = ${target}`, 'No real solution', candidates.length ? 'filter_domain' : 'function_range', candidates.length ? 'Every inverse-rule candidate is excluded by the original domain.' : 'The target lies outside the range of the isolated function.'));
  out.details = { roots }; out.certificate = { type: 'inverse_equation', source: s.source, atom, target: String(target), derived, children: children.map(c => c.certificate), symbolic, roots }; return out;
}

export function simplifyExpression(source, task = 'simplify') {
  const s = parseStatement(source); if (s.kind !== 'expression') throw new MathError('Enter an expression without an equals sign for simplification.', 'invalid');
  const variable = variables(s.expression)[0] || 'x', raw = rationalFunction(s.expression), reduced = reduceRational(raw, variable), out = baseResult(task === 'factor' ? 'factoring' : 'simplification');
  out.restrictions = statementRestrictions(s).map(x => x.text);
  let answer = rationalPrint(reduced, variable);
  if (task === 'factor') {
    if (!pEqual(reduced.den, polynomial(1))) throw new MathError('Polynomial factoring requires a polynomial expression.');
    answer = factorPolynomial(reduced.num, variable);
  }
  out.answer = { expression: answer };
  out.steps = [step(source, answer, task === 'factor' ? 'factor_identity' : 'rational_identity', task === 'factor' ? 'Factor exactly; multiplication recovers the original polynomial.' : 'Expand, combine like terms, and cancel common factors while retaining the original restrictions.')];
  out.certificate = { type: 'expression_identity', source, result: answer, task }; return out;
}

export function factorPolynomial(p, variable = 'x') {
  if (!p.size) return '0';
  const gcdInt = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  const exponents = key => new Map(key ? key.split('|').map(t => { const i = t.lastIndexOf(':'); return [t.slice(0, i), Number(t.slice(i + 1))]; }) : []);
  const terms = [...p], common = exponents(terms[0][0]); let numerator = 0n, denominator = 1n;
  for (const [key, c] of terms) {
    numerator = gcdInt(numerator, c.n); denominator = denominator / gcdInt(denominator, c.d) * c.d;
    const exps = exponents(key); for (const [v, n] of common) { const k = Math.min(n, exps.get(v) || 0); if (!k) common.delete(v); else common.set(v, k); }
  }
  const content = Q(`${numerator}/${denominator}`), remainder = new Map();
  for (const [key, c] of terms) { const exps = exponents(key); for (const [v, n] of common) exps.set(v, exps.get(v) - n); const k = [...exps].filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b)).map(([v, n]) => `${v}:${n}`).join('|'); remainder.set(k, c.div(content)); }
  const factors = [];
  if (!content.eq(1)) factors.push(String(content));
  for (const [v, n] of [...common].sort(([a], [b]) => a.localeCompare(b))) factors.push(n === 1 ? v : `${v}^${n}`);
  if (pVariables(remainder).every(v => v === variable)) {
    let c = coefficients(remainder, variable); const roots = polynomialRoots(c, { complex: false });
    for (const r of roots.roots.filter(r => r.rational !== null)) for (;;) {
      if (c.length < 2) break;
      const d = divideCoefficients(c, [Q(r.rational).neg(), ONE]); if (d.remainder.some(v => !v.zero)) break;
      factors.push(`(${variable} - (${r.rational}))`); c = d.quotient;
    }
    const rest = pPrint(fromCoefficients(c, variable));
    if (c.length === 1) { if (!c[0].eq(1) || !factors.length) factors.unshift(rest); }
    else factors.push(`(${rest})`);
  } else factors.push(`(${pPrint(remainder)})`);
  return factors.join('*') || '1';
}

export function solveInequality(source) {
  const s = parseStatement(source); if (s.kind !== 'inequality') throw new MathError('An inequality is required.', 'invalid');
  const vars = union([...variables(s.left), ...variables(s.right)]); if (vars.length > 1) throw new MathError('Inequality solving currently requires one variable.');
  const variable = vars[0] || 'x', residual = polynomialResidual(s), r = reduceRational(residual, variable), c = coefficients(r.num, variable), den = coefficients(r.den, variable);
  // A complete sign chart needs every critical point and denominator exclusion.
  const numeratorRoots = polynomialRoots(c, { complex: false }), denominatorRoots = polynomialRoots(den, { complex: false });
  if (!numeratorRoots.complete || !denominatorRoots.complete) throw new MathError('A complete exact sign chart is unavailable for this inequality.');
  const allRational = [...numeratorRoots.roots, ...denominatorRoots.roots].every(r => r.rational !== null);
  if (!allRational && den.length > 1) throw new MathError('Rational inequalities with irrational poles require an additional exact ordering strategy.');
  const relation = s.relation, allowed = sign => relation === '!=' ? sign !== 0 : relation === '>' ? sign > 0 : relation === '>=' ? sign >= 0 : relation === '<' ? sign < 0 : sign <= 0;
  const domain = statementRestrictions(s), points = [...numeratorRoots.roots, ...denominatorRoots.roots];
  for (const d of domain) { const rf = rationalFunction(d.expression), roots = polynomialRoots(coefficients(rf.num, variable), { complex: false }); if (!roots.complete || roots.roots.some(r => r.rational === null)) throw new MathError('Unable to order every excluded domain point exactly.'); points.push(...roots.roots); }
  const critical = points.filter((r, i, a) => a.findIndex(x => x.value === r.value) === i).sort((a, b) => a.approximate - b.approximate);
  const intervals = [];
  for (let i = 0; i <= critical.length; i++) {
    const low = critical[i - 1], high = critical[i]; let sign;
    if (allRational) { const sample = low && high ? Q(low.rational).add(high.rational).div(2) : low ? Q(low.rational).add(1) : high ? Q(high.rational).sub(1) : ZERO; const a = evaluateCoefficients(c, sample), b = evaluateCoefficients(den, sample); sign = a.cmp(0) * b.cmp(0); }
    else { // For a polynomial of degree at most two, leading coefficient and root multiplicity determine interval signs.
      if (c.length > 3) throw new MathError('Irrational-root inequalities currently support quadratic polynomials.');
      const distinct = numeratorRoots.roots.length; sign = c.at(-1).cmp(0); if (c.length === 2 && i === 0) sign *= -1; if (c.length === 3 && distinct === 2 && i === 1) sign *= -1;
    }
    if (allowed(sign)) intervals.push({ low: low?.value || '-∞', high: high?.value || '∞', lowClosed: false, highClosed: false });
  }
  if (allowed(0)) for (const p of numeratorRoots.roots) {
    if (p.rational !== null && domain.some(d => restrictionSatisfied(d, { [variable]: p.rational }) === false)) continue;
    if (denominatorRoots.roots.some(d => d.value === p.value)) continue;
    const left = intervals.find(i => i.high === p.value), right = intervals.find(i => i.low === p.value);
    if (left) left.highClosed = true; if (right) right.lowClosed = true;
    if (!left && !right) intervals.push({ low: p.value, high: p.value, lowClosed: true, highClosed: true });
  }
  const text = intervals.map(i => i.low === i.high ? `{${i.low}}` : `${i.lowClosed ? '[' : '('}${i.low}, ${i.high}${i.highClosed ? ']' : ')'}`).join(' ∪ ') || '∅';
  const out = baseResult('inequality'); out.restrictions = domain.map(x => x.text); out.answer = { variable, intervals, solutionSet: text };
  out.steps = [step(source, `${rationalPrint(r, variable)} ${relation} 0`, 'inequality_normalization', 'Move terms to one side, retaining all domain exclusions.'), step(`${rationalPrint(r, variable)} ${relation} 0`, `${variable} ∈ ${text}`, 'sign_chart', 'Partition the real line at exact roots and poles, then determine the sign on each interval.')];
  out.certificate = { type: 'inequality', source, variable, intervals }; return out;
}

export function functionAnalysis(source) {
  const s = parseStatement(source); if (s.kind !== 'function') throw new MathError('Use function notation, such as f(x) = 2/(x-3)+1.', 'invalid');
  const variable = s.variable; if (variables(s.expression).some(v => v !== variable)) throw new MathError('Function analysis requires a single independent variable.');
  let raw;
  try { raw = rationalFunction(s.expression); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; return elementaryFunctionAnalysis(s); }
  const r = reduceRational(raw, variable), n = coefficients(r.num, variable), d = coefficients(r.den, variable), out = baseResult('function_analysis');
  const originalDomain = statementRestrictions(s), excluded = [];
  for (const item of originalDomain) { const rf = rationalFunction(item.expression), rr = polynomialRoots(coefficients(rf.num, variable), { complex: false }); if (!rr.complete) throw new MathError('The function domain requires unsupported polynomial roots.'); excluded.push(...rr.roots); }
  const uniqueExcluded = excluded.filter((a, i, arr) => arr.findIndex(b => b.value === a.value) === i), poles = polynomialRoots(d, { complex: false });
  const zeroRoots = polynomialRoots(n, { complex: false }), zeros = zeroRoots.roots.filter(r => validRoot(r, originalDomain, variable));
  const answer = { expression: print(s.expression), domain: uniqueExcluded.length ? `${variable} ∈ R; ${uniqueExcluded.map(r => `${variable} ≠ ${r.value}`).join('; ')}` : 'All real numbers', xIntercepts: zeros.map(r => `(${r.value}, 0)`), verticalAsymptotes: poles.roots.map(r => `${variable} = ${r.value}`), holes: [] };
  if (!zeroRoots.complete) answer.xIntercepts = 'Not fully resolved';
  if (originalDomain.every(restriction => restrictionSatisfied(restriction, { [variable]: '0' }) !== false) && !evaluateCoefficients(d, ZERO).zero) answer.yIntercept = `(0, ${evaluateCoefficients(n, ZERO).div(evaluateCoefficients(d, ZERO))})`;
  else answer.yIntercept = 'Undefined';
  if (n.length < d.length) answer.horizontalAsymptote = 'y = 0';
  else if (d.length > 1 && n.length === d.length) answer.horizontalAsymptote = `y = ${n.at(-1).div(d.at(-1))}`;
  else if (d.length > 1 && n.length > d.length) { const q = divideCoefficients(n, d).quotient; answer.polynomialAsymptote = `y = ${pPrint(fromCoefficients(q, variable))}`; }
  const atRoot = (c, x) => {
    if (x.rational !== null) return String(evaluateCoefficients(c, Q(x.rational)));
    if (!x.definingPolynomial) throw new MathError('The removable-hole coordinate has no exact algebraic certificate.');
    const remainder = divideCoefficients(c, x.definingPolynomial.map(Q)).remainder;
    if (remainder.length === 1) return String(remainder[0]);
    return print(substitute(parseExpression(pPrint(fromCoefficients(remainder, variable))), variable, parseExpression(x.value)));
  };
  const holes = [];
  for (const x of uniqueExcluded) {
    const denominator = atRoot(d, x); if (denominator === '0') continue;
    const numerator = atRoot(n, x); let y;
    try { y = String(constantValue(parseExpression(`(${numerator})/(${denominator})`))); }
    catch { y = denominator === '1' ? numerator : `(${numerator})/(${denominator})`; }
    holes.push({ x, y }); answer.holes.push(`(${x.value}, ${y})`);
  }
  const rangeExclusions = [];
  if (d.length === 2 && n.length <= 2) {
    const a = (n[1] || ZERO).div(d[1]), h = d[0].neg().div(d[1]), stretch = (n[0] || ZERO).add((n[1] || ZERO).mul(h)).div(d[1]);
    answer.parentFunction = '1/x'; answer.transformedForm = `${stretch}/(${variable} - (${h})) + (${a})`;
    answer.transformations = { horizontalShift: String(h), verticalStretch: String(stretch), verticalShift: String(a) };
    rangeExclusions.push(String(a), ...holes.map(hole => hole.y));
    answer.range = `y ∈ R; ${[...new Set(rangeExclusions)].map(y => `y ≠ ${y}`).join('; ')}`; answer.inverse = `${s.name}^(-1)(x) = (${h}*x + (${stretch.sub(h.mul(a))}))/(x - (${a}))`;
  } else if (d.length === 1 && n.length === 3) {
    const [cc, bb, aa] = n.map(x => x.div(d[0])), h = bb.neg().div(aa.mul(2)), k = aa.mul(h.pow(2)).add(bb.mul(h)).add(cc);
    const vertexMissing = uniqueExcluded.some(x => x.rational !== null && Q(x.rational).eq(h));
    for (const hole of holes) {
      let mirrorExcluded = false;
      if (hole.x.rational !== null) { const mirror = h.mul(2).sub(hole.x.rational); mirrorExcluded = uniqueExcluded.some(x => x.rational !== null && Q(x.rational).eq(mirror)); }
      else if (hole.x.definingPolynomial) {
        const [m0, m1] = hole.x.definingPolynomial.map(Q), mirrorPolynomial = [h.pow(2).mul(4).add(h.mul(m1).mul(2)).add(m0), h.mul(-4).sub(m1), ONE].map(String);
        mirrorExcluded = uniqueExcluded.some(x => x.definingPolynomial && JSON.stringify(x.definingPolynomial) === JSON.stringify(mirrorPolynomial) && x.order !== hole.x.order);
      }
      if (mirrorExcluded && hole.y !== String(k)) rangeExclusions.push(hole.y);
    }
    answer.vertex = `(${h}, ${k})`; answer.axisOfSymmetry = `${variable} = ${h}`; answer.range = `y ${aa.n > 0n ? vertexMissing ? '>' : '≥' : vertexMissing ? '<' : '≤'} ${k}${rangeExclusions.length ? `; ${[...new Set(rangeExclusions)].map(y => `y ≠ ${y}`).join('; ')}` : ''}`; answer.opening = aa.n > 0n ? 'upward' : 'downward';
  } else if (d.length === 1 && n.length <= 2) {
    answer.range = n.length === 1 ? `{${n[0].div(d[0])}}` : holes.length ? `y ∈ R; ${[...new Set(holes.map(hole => hole.y))].map(y => `y ≠ ${y}`).join('; ')}` : 'All real numbers';
  }
  out.answer = answer; out.restrictions = uniqueExcluded.map(r => `${variable} != ${r.value}`);
  out.steps = [step(source, `${s.name}(${variable}) = ${rationalPrint(r, variable)}`, 'rational_identity', 'Normalize the rational function without forgetting removable holes.'), ...Object.entries(answer).filter(([k]) => k !== 'expression').map(([key, value]) => step(source, `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`, 'function_property', 'Derive this property from the exact numerator, denominator, and original domain.'))];
  out.details = { function: { expression: print(s.expression), variable }, numerator: n.map(String), denominator: d.map(String) };
  out.certificate = { type: 'function_analysis', source, numerator: n.map(String), denominator: d.map(String), answer }; return out;
}

function elementaryFunctionAnalysis(s) {
  const variable = s.variable, atoms = [];
  walk(s.expression, a => { if ((a.type === 'call' && ['sqrt', 'root', 'abs', 'log', 'ln', 'exp'].includes(a.name) || a.type === 'binary' && a.op === '^' && variables(a.right).length) && !atoms.length) atoms.push(a); });
  const atom = atoms[0]; if (!atom) throw new MathError('Function analysis does not yet support this expression family.');
  const outer = rationalFunction(replaceNode(s.expression, atom, sym('_u'))), oc = coefficients(outer.num, '_u'), od = coefficients(outer.den, '_u');
  if (oc.length > 2 || od.length !== 1) throw new MathError('Function analysis requires an affine outer transformation.');
  const scale = (oc[1] || ZERO).div(od[0]), shift = (oc[0] || ZERO).div(od[0]), kind = atom.type === 'binary' ? 'exponential' : atom.name;
  const arg = atom.type === 'binary' ? atom.right : atom.args[0], ar = rationalFunction(arg), ac = coefficients(ar.num, variable), ad = coefficients(ar.den, variable);
  if (ac.length !== 2 || ad.length !== 1) throw new MathError('Function analysis requires a nonconstant affine argument.');
  const a = ac[1].div(ad[0]), b = ac[0].div(ad[0]), h = b.neg().div(a), out = baseResult('function_analysis');
  const answer = { expression: print(s.expression), domain: 'All real numbers', range: 'All real numbers', transformations: { argumentScale: String(a), horizontalShift: String(h), verticalScale: String(scale), verticalShift: String(shift) } };
  let base = null;
  if (kind === 'exponential') base = atom.left.type === 'sym' && atom.left.name === 'e' ? null : constantValue(atom.left);
  if (kind === 'log') base = atom.args[1] ? constantValue(atom.args[1]) : Q(10);
  if (base && (base.n <= 0n || base.eq(1))) throw new MathError('The function base must be positive and different from 1.', 'invalid');
  if (kind === 'sqrt' || kind === 'root') {
    const degree = kind === 'root' ? Number(constantValue(atom.args[1])) : 2;
    if (!Number.isInteger(degree) || degree < 1 || degree > 31) throw new MathError('Unsupported root degree.');
    answer.parentFunction = degree === 2 ? 'sqrt(x)' : `root(x, ${degree})`;
    if (degree % 2 === 0) { answer.domain = `${variable} ${a.n > 0n ? '≥' : '≤'} ${h}`; answer.range = scale.zero ? `{${shift}}` : `y ${scale.n > 0n ? '≥' : '≤'} ${shift}`; answer.endpoint = `(${h}, ${shift})`; }
    else if (scale.zero) answer.range = `{${shift}}`;
  }
  else if (kind === 'abs') { answer.parentFunction = 'abs(x)'; answer.vertex = `(${h}, ${shift})`; answer.range = scale.zero ? `{${shift}}` : `y ${scale.n > 0n ? '≥' : '≤'} ${shift}`; }
  else if (['log', 'ln'].includes(kind)) { answer.parentFunction = kind === 'ln' ? 'ln(x)' : `log(x, ${base})`; answer.domain = `${variable} ${a.n > 0n ? '>' : '<'} ${h}`; answer.verticalAsymptotes = scale.zero ? [] : [`${variable} = ${h}`]; if (scale.zero) answer.range = `{${shift}}`; }
  else if (['exponential', 'exp'].includes(kind)) { answer.parentFunction = base ? `${base}^x` : 'e^x'; answer.range = scale.zero ? `{${shift}}` : `y ${scale.n > 0n ? '>' : '<'} ${shift}`; answer.horizontalAsymptote = `y = ${shift}`; }
  else throw new MathError('Unsupported elementary function family.');
  const evenRoot = kind === 'sqrt' || kind === 'root' && Number(constantValue(atom.args[1])) % 2 === 0;
  const atZeroValid = !(evenRoot && b.n < 0n || ['log', 'ln'].includes(kind) && b.n <= 0n);
  if (atZeroValid) {
    const atZero = substitute(s.expression, variable, num(0));
    try { answer.yIntercept = `(0, ${constantValue(atZero)})`; } catch { answer.yIntercept = `(0, ${print(atZero)})`; }
  } else answer.yIntercept = 'Undefined';
  try { const zeros = solveEquation(`${print(s.expression)} = 0`); answer.xIntercepts = zeros.answer.solutions.map(x => `(${x}, 0)`); } catch { answer.xIntercepts = 'Not resolved by the current inverse rules'; }
  if (!scale.zero && ['log', 'ln'].includes(kind)) answer.inverse = `(${base ? `(${base})` : 'e'}^((x - (${shift}))/(${scale})) - (${b}))/(${a})`;
  if (!scale.zero && ['exponential', 'exp'].includes(kind)) answer.inverse = `((${base ? `log((x - (${shift}))/(${scale}), ${base})` : `ln((x - (${shift}))/(${scale}))`}) - (${b}))/(${a})`;
  out.answer = answer; out.restrictions = statementRestrictions(s).map(r => r.text);
  out.steps = Object.entries(answer).map(([key, value]) => step(s.source, `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`, 'elementary_function_property', 'Apply the domain, range, and transformation rules of the parent function.'));
  out.details = { function: { expression: print(s.expression), variable } };
  out.certificate = { type: 'elementary_function', source: s.source, answer }; return out;
}

export function buildLinearSystem(input) {
  const equations = input.equations;
  if (!Array.isArray(equations) || !equations.length || equations.length > 12) throw new MathError('Provide 1 to 12 equations.', 'invalid');
  const statements = equations.map(parseStatement); if (statements.some(s => s.kind !== 'equation')) throw new MathError('Each system entry must be an equation.', 'invalid');
  const vs = input.variables || union(statements.flatMap(s => [...variables(s.left), ...variables(s.right)])).sort();
  if (!vs.length || vs.length > 8 || new Set(vs).size !== vs.length || vs.some(v => !/^[A-Za-z][A-Za-z0-9_]*$/.test(v))) throw new MathError('A system needs 1 to 8 distinct valid variable names.', 'invalid');
  const matrix = statements.map(s => {
    const r = polynomialResidual(s); if (pVariables(r.den).length) throw new MathError('Variable denominators are not supported in linear systems.');
    const row = vs.map(v => r.num.get(`${v}:1`) || ZERO), rest = pSub(r.num, row.reduce((a, c, i) => pAdd(a, pScale(polySymbol(vs[i]), c)), polynomial(0)));
    if (pVariables(rest).length) throw new MathError('The system is not linear in the declared variables.');
    return [...row, (rest.get('') || ZERO).neg()];
  });
  return { matrix, variables: vs, statements };
}
export function gaussianElimination(matrix, columnCount = matrix[0].length - 1) {
  const m = matrix.map(row => row.map(Q)), operations = [], pivots = []; let row = 0;
  for (let col = 0; col < columnCount && row < m.length; col++) {
    const found = m.findIndex((r, i) => i >= row && !r[col].zero); if (found < 0) continue;
    if (found !== row) { [m[row], m[found]] = [m[found], m[row]]; operations.push({ type: 'swap', a: row, b: found }); }
    const factor = m[row][col]; if (!factor.eq(1)) { const k = ONE.div(factor); m[row] = m[row].map(x => x.mul(k)); operations.push({ type: 'scale', row, factor: String(k) }); }
    for (let j = 0; j < m.length; j++) if (j !== row && !m[j][col].zero) { const factor = m[j][col].neg(); m[j] = m[j].map((v, k) => v.add(m[row][k].mul(factor))); operations.push({ type: 'add', target: j, source: row, factor: String(factor) }); }
    pivots.push(col); row++;
  }
  return { matrix: m, operations, pivots };
}
export function solveSystem(input) {
  const built = buildLinearSystem(input), { matrix, operations, pivots } = gaussianElimination(built.matrix), vs = built.variables;
  const inconsistent = matrix.some(row => row.slice(0, vs.length).every(x => x.zero) && !row.at(-1).zero), solution = {}, free = vs.map((_, i) => i).filter(i => !pivots.includes(i));
  if (!inconsistent) {
    free.forEach((c, i) => { solution[vs[c]] = `t${i + 1}`; });
    pivots.forEach((c, r) => { let text = String(matrix[r].at(-1)); for (const f of free) if (!matrix[r][f].zero) text += ` - (${matrix[r][f]})*${solution[vs[f]]}`; solution[vs[c]] = text; });
  }
  const out = baseResult('linear_system'); out.answer = inconsistent ? { solutionSet: 'No solution', type: 'inconsistent' } : { values: solution, type: free.length ? 'infinite' : 'unique', parameters: free.map((_, i) => `t${i + 1}`) };
  out.steps = operations.map((op, i) => step(i ? `Matrix after operation ${i}` : input.equations.join('; '), op.type === 'swap' ? `Swap rows ${op.a + 1} and ${op.b + 1}` : op.type === 'scale' ? `Multiply row ${op.row + 1} by ${op.factor}` : `Add ${op.factor} times row ${op.source + 1} to row ${op.target + 1}`, 'row_operation', 'An invertible elementary row operation preserves the solution set.', { operation: op }));
  out.details = { reducedMatrix: matrix.map(row => row.map(String)), variables: vs };
  out.certificate = { type: 'linear_system', input, initialMatrix: built.matrix.map(row => row.map(String)), operations, finalMatrix: matrix.map(row => row.map(String)), pivots, answer: out.answer }; return out;
}
