import { MathError, Q, ZERO, ONE, num, sym, bin, print, parseExpression, parseStatement, variables, constantValue, substitute, symbolicEqual, rationalFunction, polynomial, pPrint, pEqual, pSub, pScale, pMul, pVariables, coefficients, fromCoefficients, divideCoefficients, coefficientGcd, polynomialResidual, statementRestrictions, restrictionSatisfied, stableStringify } from './core.js';
import { polynomialRoots, evaluateCoefficients, isolateAtom, filterInverseRoots, solveEquation, simplifyExpression, solveSystem, solveInequality, functionAnalysis, buildLinearSystem, gaussianElimination } from './algebra.js';
import { solveAdvanced, verifyAdvancedCertificate } from './advanced-algebra.js';
import { isCompoundInequality, solveCompoundInequality, mergeIntervals } from './compound-inequalities.js';

export const rootKey = r => r.rational !== null ? `Q:${Q(r.rational)}` : r.definingPolynomial ? `A:${r.definingPolynomial.join(',')}:${r.order}` : `S:${r.value}`;
const same = (a, b) => stableStringify(a) === stableStringify(b);
const result = (status, explanation, rule = null, extra = {}) => ({ status, explanation, rule, ...extra });
function checkDefinedDomain(s, context = []) {
  for (const d of [...statementRestrictions(s), ...context]) {
    if (restrictionSatisfied(d, {}) === false) throw new MathError('This statement is undefined on its stated real domain.', 'invalid');
    try {
      const r = rationalFunction(bin('-', d.expression, num(d.value)));
      if (!r.num.size && ['!=', '>'].includes(d.relation)) throw new MathError('A required domain condition is impossible.', 'invalid');
    } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
  }
}
function domainPolynomials(domain, variable) {
  const out = [];
  for (const d of domain) {
    if (d.relation !== '!=') throw new MathError('This domain requires a specialized inequality proof.');
    const r = rationalFunction(bin('-', d.expression, num(d.value))), p = r.num;
    if (pVariables(p).some(v => v !== variable)) throw new MathError('Multivariable domain reasoning is not available for this transition.');
    out.push(coefficients(p, variable));
  }
  return out;
}
function rootExcluded(r, domain, variable) {
  if (!domain.length) return false;
  if (r.rational !== null) {
    for (const d of domain) { const state = restrictionSatisfied(d, { [variable]: r.rational }); if (state === false) return true; if (state === null) throw new MathError('Could not prove this root satisfies the domain.'); }
    return false;
  }
  if (!r.definingPolynomial) throw new MathError('No exact algebraic certificate for this root.');
  const minimal = r.definingPolynomial.map(Q);
  for (const c of domainPolynomials(domain, variable)) if (divideCoefficients(c, minimal).remainder.every(x => x.zero)) return true;
  return false;
}
export function equationSignature(s, context = []) {
  const vars = [...new Set([...variables(s.left), ...variables(s.right)])], variable = vars[0] || 'x', domain = [...statementRestrictions(s), ...context];
  try {
    const r = polynomialResidual(s);
    if (vars.length > 1) {
      if (domain.length) throw new MathError('This multivariable equation needs a supported domain rule.');
      if (!r.num.size) return { key: 'identity', variable, domain };
      const first = [...r.num.values()][0], canonical = pPrint(pScale(r.num, ONE.div(first)));
      return { key: `multivar:${canonical}`, variable, domain };
    }
    const roots = polynomialRoots(coefficients(r.num, variable), { complex: false });
    if (!roots.complete) throw new MathError('Exact equivalence search did not resolve all roots.');
    if (roots.identity) {
      // Square-free denominator products encode the excluded domain exactly.
      let product = polynomial(1);
      for (const c of domainPolynomials(domain, variable)) {
        if (c.length === 1) { if (c[0].zero) return { key: 'empty', variable, domain }; continue; }
        const rr = polynomialRoots(c, { complex: false });
        if (!rr.complete) throw new MathError('The identity domain is unresolved.');
        if (!rr.roots.length) continue;
        const derivative = c.slice(1).map((v, i) => v.mul(i + 1)), gcd = coefficientGcd(c, derivative), squareFree = divideCoefficients(c, gcd).quotient;
        const old = coefficients(product, variable), common = coefficientGcd(old, squareFree);
        product = pMul(product, fromCoefficients(divideCoefficients(squareFree, common).quotient, variable));
      }
      const pc = coefficients(product, variable), normalized = pc.map(v => String(v.div(pc.at(-1))));
      return { key: `identity:${normalized.join(',')}`, variable, domain };
    }
    const accepted = roots.roots.filter(r => !rootExcluded(r, domain, variable));
    return { key: accepted.length ? accepted.map(rootKey).sort().join(';') : 'empty', variable, domain, roots: accepted };
  } catch (error) {
    if (error.code === 'invalid' || error.code === 'budget') throw error;
    // Inverse-rule equations can still be certified by the specialized solvers.
    let solved;
    try { solved = solveEquation(s.source); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
    if (!solved || solved.status !== 'solved') {
      const advanced = solveAdvanced(s.source);
      if (advanced.status !== 'solved' || !verifyAdvancedCertificate(s.source, advanced) || !Array.isArray(advanced.answer.solutions)) throw new MathError('This equation needs a supported equivalence proof.');
      const roots = advanced.answer.solutions.map(value => { let q; try { q = constantValue(parseExpression(value)); } catch { throw new MathError('Step equivalence for this algebraic-number form is not yet supported.'); } return { value: String(q), rational: String(q), approximate: Number(q) }; });
      solved = { ...advanced, details: { roots } };
    }
    const roots = solved.details?.roots || [];
    return { key: roots.length ? roots.filter(r => !rootExcluded(r, context, variable)).map(rootKey).sort().join(';') : 'empty', variable, domain, roots };
  }
}
function newDomainRestriction(before, after, context) {
  const variable = variables(before.expression)[0] || variables(after.expression)[0] || 'x';
  const old = [...statementRestrictions(before), ...context], current = statementRestrictions(after);
  for (const d of current) {
    if (old.some(x => same(x, d))) continue;
    if (d.relation !== '!=') return 'unresolved';
    const rf = rationalFunction(d.expression), roots = polynomialRoots(coefficients(rf.num, variable), { complex: false });
    if (!roots.complete) return 'unresolved';
    for (const r of roots.roots) if (!rootExcluded(r, old, variable)) return r.value;
  }
  return null;
}
function solutionSetInput(text, variable) {
  const m = /^\s*([A-Za-z])\s*(?:∈|in|=)\s*\{([^}]*)\}\s*$/i.exec(text);
  if (!m) return null;
  if (m[1] !== variable) throw new MathError('The solution-set variable does not match.', 'invalid');
  return m[2].trim() ? m[2].split(',').map(s => { const value = constantValue(parseExpression(s.trim())); return `Q:${value}`; }).sort().join(';') : 'empty';
}
function branchSignature(text, context) {
  const pm = /^\s*([A-Za-z])\s*=\s*±\s*(.+)$/.exec(text);
  if (pm) text = `${pm[1]} = (${pm[2]}) or ${pm[1]} = -(${pm[2]})`;
  const set = /^\s*([A-Za-z])\s*(?:∈|in|=)\s*\{/.exec(text);
  if (set) return { key: solutionSetInput(text, set[1]), variable: set[1] };
  if (!/\s+or\s+|∨/i.test(text)) return null;
  const parts = text.split(/\s+or\s+|∨/i); if (parts.length > 16) throw new MathError('Too many solution branches.', 'budget');
  const signatures = parts.map(p => { const s = parseStatement(p); if (s.kind !== 'equation') throw new MathError('Each alternative must be an equation.', 'invalid'); return equationSignature(s, context); });
  if (signatures.some(s => /identity|multivar/.test(s.key))) throw new MathError('Only finite univariate solution alternatives are currently supported.');
  if (signatures.some(s => s.variable !== signatures[0].variable)) throw new MathError('Alternative solution branches must use the same variable.', 'invalid');
  const keys = [...new Set(signatures.flatMap(s => s.key === 'empty' ? [] : s.key.split(';')))];
  return { key: keys.length ? keys.sort().join(';') : 'empty', variable: signatures[0].variable };
}
export function verifyTransition(beforeText, afterText, options = {}) {
  try {
    if (isCompoundInequality(beforeText) || isCompoundInequality(afterText)) return inequalityTransition(beforeText, afterText);
    const context = options.context || [], firstBranch = branchSignature(beforeText, context), secondBranch = branchSignature(afterText, context);
    if (firstBranch || secondBranch) {
      const a = firstBranch || equationSignature(parseStatement(beforeText), context), b = secondBranch || equationSignature(parseStatement(afterText), context);
      return a.key === b.key && a.variable === b.variable ? result('valid', 'All alternative solution branches preserve the exact complete solution set.', 'case_analysis') : result('invalid', 'The alternatives lose a solution or introduce an extraneous solution.', 'changed_solution_set');
    }
    const before = parseStatement(beforeText), set = before.kind === 'equation' ? solutionSetInput(afterText, variables(before.left)[0] || variables(before.right)[0] || 'x') : null;
    checkDefinedDomain(before, context);
    if (set !== null) { const sig = equationSignature(before, context); return sig.key === set ? result('valid', 'The complete solution set is preserved.', 'solution_set') : result('invalid', 'This solution set loses a valid solution or introduces an extraneous one.', 'changed_solution_set'); }
    const after = parseStatement(afterText);
    checkDefinedDomain(after, context);
    if (before.kind !== after.kind) return result('invalid', 'Keep the same kind of statement: an expression, equation, function, or inequality cannot silently replace another.');
    if (before.kind === 'expression' || before.kind === 'function') {
      if (!symbolicEqual(before.expression, after.expression)) {
        try { rationalFunction(before.expression); rationalFunction(after.expression); }
        catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; return result('unresolved', 'This expression identity requires a function rule not yet supported by the checker.', 'unsupported_identity'); }
        return result('invalid', 'The new expression is not identically equal to the previous expression.', 'expression_mismatch');
      }
      const changed = newDomainRestriction(before, after, context);
      if (changed === 'unresolved') return result('unresolved', 'The expressions agree, but the new domain restriction needs another proof.');
      if (changed !== null) return result('invalid', `The new expression is undefined at ${changed}, where the original was defined.`, 'changed_domain');
      return result('valid', 'An exact symbolic identity preserves the expression and its original domain.', 'rational_identity');
    }
    if (before.kind === 'inequality') {
      return inequalityTransition(beforeText, afterText);
    }
    // Matching nonzero scalar residuals prove an equation transition without a full solve.
    try {
      const A = polynomialResidual(before), B = polynomialResidual(after);
      const crossA = pMul(A.num, B.den), crossB = pMul(B.num, A.den);
      if (crossA.size && crossB.size) {
        const ma = [...crossA.keys()][0], ratio = crossB.get(ma)?.div(crossA.get(ma));
        if (ratio && !ratio.zero && pEqual(pScale(crossA, ratio), crossB) && !statementRestrictions(after).length && !context.length) return result('valid', 'The equation residual changed only by a nonzero constant factor.', 'equation_scale');
      }
    } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
    const a = equationSignature(before, context), b = equationSignature(after, context);
    if (a.variable !== b.variable && a.roots?.length && b.roots?.length) return result('invalid', 'The unknown variable changed.');
    return a.key === b.key ? result('valid', 'The exact complete solution set is preserved on the original domain.', 'equivalent_equations') : result('invalid', 'This step changes the solution set: it loses solutions, adds solutions, or changes a domain restriction.', 'changed_solution_set');
  } catch (error) { return result(error.code === 'invalid' ? 'invalid' : 'unresolved', error.message, error.code || 'unsupported'); }
}

function inequalityTransition(before, after) {
  const get = source => {
    if (isCompoundInequality(source)) { const out = solveCompoundInequality(source); if (out.status !== 'solved') throw new MathError(out.error); return out; }
    try { return solveInequality(source); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; const out = solveAdvanced(source); if (out.status !== 'solved' || !verifyAdvancedCertificate(source, out) || !out.answer.intervals) throw e; return out; }
  };
  const a = get(before), b = get(after);
  if (a.answer.variable !== b.answer.variable) return result('invalid', 'The independent variable changed.');
  let A, B;
  try { A = mergeIntervals(a.answer.intervals); B = mergeIntervals(b.answer.intervals); }
  catch { if (same(a.answer.intervals, b.answer.intervals)) return result('valid', 'The exact interval solution sets agree.', 'inequality_equivalence'); throw new MathError('Exact endpoint ordering is not supported for these algebraic intervals.'); }
  return same(A, B) ? result('valid', 'The exact interval solution sets agree.', 'inequality_equivalence') : result('invalid', 'The inequality solution set changed. Check endpoint inclusion and reversal when multiplying by a negative value.', 'inequality_mismatch');
}

function validatePolynomialCertificate(c) {
  const s = parseStatement(c.source), residual = polynomialResidual(s), actual = coefficients(residual.num, c.variable);
  if (!same(actual.map(String), c.coefficients)) return false;
  const roots = polynomialRoots(actual, { complex: c.domain === 'complex' });
  if (!roots.complete) return false;
  if (!same(roots, c.rootComputation)) return false;
  const domain = statementRestrictions(s), accepted = roots.roots.filter(r => !rootExcluded(r, domain, c.variable));
  return same(accepted, c.roots);
}
function validateInverseCertificate(c) {
  const s = parseStatement(c.source), atom = c.atom, target = isolateAtom(s, atom);
  if (!target.eq(c.target)) return false;
  const variable = [...new Set([...variables(s.left), ...variables(s.right)])][0] || 'x';
  if (!c.children.every(verifyCertificate)) return false;
  let derived = [];
  if (atom.type === 'call' && atom.name === 'sqrt') { if (target.n >= 0n) derived = [`${print(atom.args[0])} = ${target.pow(2)}`]; }
  else if (atom.type === 'call' && atom.name === 'root') { const degree = Number(constantValue(atom.args[1])); if (!Number.isInteger(degree) || degree < 1 || degree > 31) return false; if (target.n >= 0n || degree % 2 === 1) derived = [`${print(atom.args[0])} = ${target.pow(degree)}`]; }
  else if (atom.type === 'call' && atom.name === 'abs') { if (target.n >= 0n) derived = [`${print(atom.args[0])} = ${target}`, `${print(atom.args[0])} = ${target.neg()}`]; }
  else if (atom.type === 'call' && ['log', 'ln'].includes(atom.name)) {
    const base = atom.name === 'ln' ? null : atom.args[1] ? constantValue(atom.args[1]) : Q(10);
    if (base && (base.n <= 0n || base.eq(1))) return false;
    if (target.zero) derived = [`${print(atom.args[0])} = 1`];
    else if (base && target.integer && Math.abs(Number(target)) <= 64) derived = [`${print(atom.args[0])} = ${base.pow(Number(target))}`];
    else if (!c.symbolic) return false;
  } else if (atom.type === 'binary' || atom.name === 'exp') {
    const naturalBase = atom.type === 'call' || atom.left.type === 'sym' && atom.left.name === 'e', base = naturalBase ? null : constantValue(atom.left);
    if (base && (base.n <= 0n || base.eq(1))) return false;
    if (target.n > 0n) {
      if (base) { let k = null; for (let j = -64; j <= 64; j++) if (base.pow(j).eq(target)) { k = j; break; } if (k !== null) derived = [`${print(atom.right)} = ${k}`]; else if (!c.symbolic) return false; }
      else if (target.eq(1)) derived = [`${print(atom.type === 'binary' ? atom.right : atom.args[0])} = 0`];
      else if (!c.symbolic) return false;
    } else if (c.symbolic) return false;
  } else return false;
  if (!same(derived, c.derived) || c.children.length !== derived.length || c.children.some((child, i) => child.source !== derived[i])) return false;
  if (c.symbolic) {
    // Verify the isolated affine inverse as an exact symbolic expression, not a guessed number.
    const arg = atom.type === 'binary' ? atom.right : atom.args[0]; let expectedTarget;
    if (atom.type === 'call' && ['log', 'ln'].includes(atom.name)) { const b = atom.name === 'ln' ? 'e' : atom.args[1] ? print(atom.args[1]) : '10'; expectedTarget = atom.name === 'ln' ? `e^(${target})` : `(${b})^(${target})`; }
    else expectedTarget = atom.type === 'binary' && !(atom.left.type === 'sym' && atom.left.name === 'e') ? `log(${target}, ${print(atom.left)})` : `ln(${target})`;
    // Replace the inverse target with a formal symbol so the affine cancellation is checked polynomially.
    const r = rationalFunction(arg), a = coefficients(r.num, variable), d = coefficients(r.den, variable);
    if (a.length !== 2 || d.length !== 1) return false;
    const expected = `((${expectedTarget}) - (${a[0].div(d[0])}))/(${a[1].div(d[0])})`;
    if (c.symbolic.replace(/\s/g, '') !== expected.replace(/\s/g, '')) return false;
    const candidate = { value: c.symbolic, approximate: null, rational: null };
    return same(filterInverseRoots([candidate], s, atom, target, variable), c.roots);
  }
  const roots = c.children.flatMap(child => child.roots).filter((r, i, a) => a.findIndex(x => rootKey(x) === rootKey(r)) === i);
  return same(filterInverseRoots(roots, s, atom, target, variable), c.roots);
}
function validateRadicalCertificate(c) {
  const s = parseStatement(c.source), left = s.left.type === 'call' && s.left.name === 'sqrt', atom = left ? s.left : s.right, other = left ? s.right : s.left;
  if (atom.type !== 'call' || atom.name !== 'sqrt') return false;
  const expected = `${print(atom.args[0])} = (${print(other)})^2`;
  if (c.derived !== expected || c.child.source !== expected || !verifyCertificate(c.child)) return false;
  const variable = c.child.variable, kept = c.child.roots.filter(r => {
    if (r.rational === null) return false;
    try { const a = constantValue(substitute(atom.args[0], variable, num(r.rational))), b = constantValue(substitute(other, variable, num(r.rational))); return b.n >= 0n && a.eq(b.pow(2)) && statementRestrictions(s).every(d => restrictionSatisfied(d, { [variable]: r.rational }) !== false); } catch { return false; }
  });
  return c.child.roots.every(r => r.rational !== null) && same(kept, c.roots);
}
function validateSystemCertificate(c) {
  const built = buildLinearSystem(c.input), m = built.matrix.map(row => row.map(Q));
  if (!same(m.map(row => row.map(String)), c.initialMatrix)) return false;
  for (const op of c.operations) {
    if (op.type === 'swap') { if (!m[op.a] || !m[op.b]) return false; [m[op.a], m[op.b]] = [m[op.b], m[op.a]]; }
    else if (op.type === 'scale') { const k = Q(op.factor); if (k.zero || !m[op.row]) return false; m[op.row] = m[op.row].map(x => x.mul(k)); }
    else if (op.type === 'add') { if (!m[op.target] || !m[op.source] || op.source === op.target) return false; m[op.target] = m[op.target].map((v, i) => v.add(m[op.source][i].mul(op.factor))); }
    else return false;
  }
  if (!same(m.map(row => row.map(String)), c.finalMatrix)) return false;
  const n = built.variables.length, inconsistent = m.some(row => row.slice(0, n).every(v => v.zero) && !row[n].zero);
  if (inconsistent) return c.answer.type === 'inconsistent';
  if (!['unique', 'infinite'].includes(c.answer.type)) return false;
  // Substitute the claimed parameterization into every original equation and prove an identity.
  for (const s of built.statements) {
    let l = s.left, r = s.right;
    for (const v of built.variables) { if (!c.answer.values[v]) return false; const a = parseExpression(c.answer.values[v]); l = substitute(l, v, a); r = substitute(r, v, a); }
    if (!symbolicEqual(l, r)) return false;
  }
  const rank = gaussianElimination(built.matrix).pivots.length;
  const canonical = gaussianElimination(built.matrix), free = built.variables.map((_, i) => i).filter(i => !canonical.pivots.includes(i)), values = {};
  free.forEach((f, i) => { values[built.variables[f]] = `t${i + 1}`; });
  canonical.pivots.forEach((col, row) => { let text = String(canonical.matrix[row].at(-1)); for (const f of free) if (!canonical.matrix[row][f].zero) text += ` - (${canonical.matrix[row][f]})*${values[built.variables[f]]}`; values[built.variables[col]] = text; });
  return c.answer.type === (rank === n ? 'unique' : 'infinite') && same(c.answer.values, values) && same(c.answer.parameters, free.map((_, i) => `t${i + 1}`));
}
export function verifyCertificate(c) {
  try {
    if (!c || typeof c !== 'object') return false;
    if (c.type === 'expression_identity') return verifyTransition(c.source, c.result).status === 'valid';
    if (c.type === 'polynomial_equation') return validatePolynomialCertificate(c);
    if (c.type === 'inverse_equation') return validateInverseCertificate(c);
    if (c.type === 'radical_candidates') return validateRadicalCertificate(c);
    if (c.type === 'linear_system') return validateSystemCertificate(c);
    if (c.type === 'inequality') return same(solveInequality(c.source).answer.intervals, c.intervals);
    if (c.type === 'function_analysis') { const actual = functionAnalysis(c.source); return same(actual.details.numerator, c.numerator) && same(actual.details.denominator, c.denominator) && same(actual.answer, c.answer); }
    if (c.type === 'elementary_function') return same(functionAnalysis(c.source).answer, c.answer);
    return false;
  } catch { return false; }
}
export function verifyAlgebraResult(out) {
  if (out.status !== 'solved' || !verifyCertificate(out.certificate)) return false;
  const c = out.certificate;
  // Bind the human-visible answer and steps to the certified mathematical report.
  let expected;
  try {
    if (c.type === 'expression_identity') expected = simplifyExpression(c.source, c.task);
    else if (['polynomial_equation', 'inverse_equation', 'radical_candidates'].includes(c.type)) expected = solveEquation(c.source, { domain: c.domain });
    else if (['function_analysis', 'elementary_function'].includes(c.type)) expected = functionAnalysis(c.source);
    else if (c.type === 'linear_system') expected = solveSystem(c.input);
    else if (c.type === 'inequality') expected = solveInequality(c.source);
    else return false;
    const visibleSteps = steps => steps.map(({ verified, assurance, ...s }) => s);
    if (!same(expected.answer, out.answer) || !same(expected.restrictions, out.restrictions) || !same(visibleSteps(expected.steps), visibleSteps(out.steps)) || !same(expected.details, out.details)) return false;
  } catch { return false; }
  if (['polynomial_equation', 'inverse_equation', 'radical_candidates'].includes(c.type)) {
    if (!same((out.answer.solutions || []).map(String).sort(), c.roots.map(r => r.value).sort()) || out.answer.complete !== true) return false;
    const original = parseStatement(c.source), variable = c.variable || [...new Set([...variables(original.left), ...variables(original.right)])][0] || 'x';
    if (out.answer.variable !== variable) return false;
    if (c.type === 'polynomial_equation' && c.coefficients.length === 1) return out.answer.identity === Q(c.coefficients[0]).zero && out.answer.solutionSet === (Q(c.coefficients[0]).zero ? 'All values in the original domain' : 'No solution');
    return c.roots.length ? out.answer.solutionSet === undefined : out.answer.solutionSet === 'No solution';
  }
  if (c.type === 'expression_identity') return out.answer.expression === c.result;
  if (c.type === 'linear_system' || c.type === 'function_analysis' || c.type === 'elementary_function') return same(out.answer, c.answer);
  if (c.type === 'inequality') return same(out.answer.intervals, c.intervals);
  return false;
}
