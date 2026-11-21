import { MathError, Q, ONE, num, sym, bin, print, parseExpression, parseStatement, variables, substitute, rationalFunction, rationalPrint, polynomialResidual, polynomial, polySymbol, pScale, pAdd, pMul, pEqual, pPrint, statementRestrictions, stableStringify } from './core.js';

function compute(input) {
  if (!input || input.kind !== 'literal_equation' || typeof input.equation !== 'string') throw new MathError('Supply a literal equation and the variable to isolate.', 'invalid');
  const variable = input.variable;
  if (typeof variable !== 'string' || !/^[A-Za-z]$/.test(variable) || ['e', 'i'].includes(variable)) throw new MathError('Choose a single algebraic variable to isolate.', 'invalid');
  const s = parseStatement(input.equation); if (s.kind !== 'equation') throw new MathError('Literal rearrangement requires an equation.', 'invalid');
  if (![...variables(s.left), ...variables(s.right)].includes(variable)) throw new MathError('The chosen variable is absent from this equation.', 'invalid');
  const r = polynomialResidual(s), A = new Map(), B = new Map();
  for (const [key, value] of r.num) {
    const powers = key ? key.split('|').map(part => { const i = part.lastIndexOf(':'); return [part.slice(0, i), Number(part.slice(i + 1))]; }) : [];
    const exponent = powers.find(([v]) => v === variable)?.[1] || 0;
    if (exponent > 1) throw new MathError('This rearrangement rule requires the chosen variable to occur linearly after clearing denominators.');
    const rest = powers.filter(([v]) => v !== variable).map(([v, n]) => `${v}:${n}`).join('|');
    (exponent ? A : B).set(rest, value);
  }
  if (!pEqual(r.num, pAdd(pMul(A, polySymbol(variable)), B))) throw new MathError('The exact parameter coefficient extraction did not replay.');
  const a = pPrint(A), b = pPrint(B), originalDomain = statementRestrictions(s), branches = [], steps = [], restrictions = originalDomain.map(d => d.text);
  const isConstantA = [...A.keys()].every(k => k === ''), scalar = isConstantA ? A.get('') || Q(0) : null;
  let expression = null;
  if (!scalar?.zero) {
    expression = scalar ? pPrint(pScale(B, Q(-1).div(scalar))) : rationalPrint({ num: pScale(B, -1), den: A }, variables(s.left).find(v => v !== variable) || 'x');
    const candidate = parseExpression(expression), genericConditions = scalar ? [] : [`${a} != 0`];
    for (const d of originalDomain) {
      const replaced = substitute(d.expression, variable, candidate), condition = `${print(replaced)} ${d.relation} ${d.value}`;
      if (!genericConditions.includes(condition)) genericConditions.push(condition);
    }
    const check = rationalFunction(bin('+', bin('*', parseExpression(a), candidate), parseExpression(b)));
    if (check.num.size) throw new MathError('The rearranged generic branch did not preserve the exact polynomial identity.');
    branches.push({ conditions: genericConditions, solution: `${variable} = ${expression}`, type: 'unique', expression });
  }
  if (!isConstantA || scalar.zero) {
    const zeroA = isConstantA ? [] : [`${a} = 0`], isConstantB = [...B.keys()].every(k => k === ''), constantB = B.get('') || Q(0);
    if (!isConstantB || constantB.zero) branches.push({ conditions: [...zeroA, ...(isConstantB ? [] : [`${b} = 0`]), ...restrictions], solution: 'All values in the original domain', type: 'all_in_domain' });
    if (!isConstantB || !constantB.zero) branches.push({ conditions: [...zeroA, ...(isConstantB ? [] : [`${b} != 0`])], solution: 'No solution', type: 'inconsistent' });
  }
  steps.push({ before: input.equation, after: `(${a})*${variable} + (${b}) = 0`, rule: 'collect_parameter_coefficients', explanation: 'Collect the selected variable while retaining every original denominator restriction.', verified: true });
  if (expression !== null) steps.push({ before: `(${a})*${variable} + (${b}) = 0`, after: `${variable} = ${expression}`, rule: 'divide_nonzero_parameter_coefficient', explanation: isConstantA ? 'Divide by the nonzero constant coefficient.' : 'Divide only on the branch where the parameter coefficient is nonzero.', verified: true });
  if (!isConstantA || scalar.zero) steps.push({ before: `(${a})*${variable} + (${b}) = 0`, after: branches.filter(b => b.type !== 'unique').map(b => `${b.conditions.join(' and ') || 'Always'}: ${b.solution}`).join('; '), rule: 'zero_coefficient_cases', explanation: 'When the coefficient is zero, a zero residual permits every originally defined value; a nonzero residual permits none.', verified: true });
  const answer = { variable, expression, branches, complete: true, parameters: [...new Set([...variables(s.left), ...variables(s.right)])].filter(v => v !== variable) };
  return { status: 'solved', verified: true, topic: 'literal_equation', answer, steps, restrictions, certificate: { type: 'literal_equation', version: 1, input: { kind: 'literal_equation', equation: input.equation, variable }, coefficient: a, residualConstant: b, assurance: 'exact-parameter-case-analysis' } };
}
export function solveLiteralEquation(input) { try { return compute(input); } catch (e) { return { status: e.code === 'invalid' ? 'invalid' : 'unsupported', verified: false, topic: 'literal_equation', answer: null, steps: [], restrictions: [], certificate: null, error: e.message }; } }
export function verifyLiteralCertificate(input, report) { try { return report.status === 'solved' && stableStringify(compute(input)) === stableStringify(report); } catch { return false; } }
