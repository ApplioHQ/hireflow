import { MathError, Q, ONE, ZERO, num, bin, print, parseStatement, parseExpression, variables, walk, rationalFunction, reduceRational, rationalPrint, pVariables, polynomial, fromCoefficients, pPrint, coefficients, statementRestrictions, symbolicEqual, constantValue } from './core.js';
import { verifyTransition, equationSignature } from './verifier.js';
import { solveEquation, simplifyExpression } from './algebra.js';

const stateKey = s => `${rationalPrint(rationalFunction(s.left))}=${rationalPrint(rationalFunction(s.right))}`;
function linearState(s, variable) {
  const L = reduceRational(rationalFunction(s.left), variable), R = reduceRational(rationalFunction(s.right), variable), l = coefficients(L.num, variable), r = coefficients(R.num, variable), ld = coefficients(L.den, variable), rd = coefficients(R.den, variable);
  if (l.length > 2 || r.length > 2 || ld.length > 1 || rd.length > 1) return null;
  return { a: (l[1] || ZERO).div(ld[0]), b: (l[0] || ZERO).div(ld[0]), c: (r[1] || ZERO).div(rd[0]), d: (r[0] || ZERO).div(rd[0]) };
}
const linearText = (a, b, c, d, variable) => `${pPrint(fromCoefficients([b, a], variable))} = ${pPrint(fromCoefficients([d, c], variable))}`;
function bridgeLinear(beforeText, afterText, context) {
  const before = parseStatement(beforeText), after = parseStatement(afterText);
  if (before.kind !== 'equation' || after.kind !== 'equation') return [];
  const vs = [...new Set([...variables(before.left), ...variables(before.right)])]; if (vs.length !== 1) return [];
  const variable = vs[0], first = linearState(before, variable), target = linearState(after, variable);
  if (!first || !target) return [];
  const key = s => [s.a, s.b, s.c, s.d].map(String).join(','), goal = key(target);
  if (key(first) === goal) return [];
  const initialNormal = linearText(first.a, first.b, first.c, first.d, variable), initialPath = [];
  const queue = [{ state: first, path: initialPath }], visited = new Set([key(first)]);
  for (let j = 0; j < queue.length && j < 180; j++) {
    const { state: s, path } = queue[j]; if (path.length > 5) continue;
    const candidates = [];
    const add = (a, b, c, d, rule, explanation) => candidates.push({ state: { a, b, c, d }, rule, explanation });
    for (const k of [s.b, s.d]) if (!k.zero) add(s.a, s.b.sub(k), s.c, s.d.sub(k), 'subtract_both_sides', `Subtract ${k} from both sides.`);
    for (const k of [s.a, s.c]) if (!k.zero) add(s.a.sub(k), s.b, s.c.sub(k), s.d, 'subtract_variable_both_sides', `Subtract (${k})*${variable} from both sides.`);
    const divisors = [s.a, s.c];
    for (const name of ['a', 'c', 'b', 'd']) if (!target[name].zero && !s[name].zero) divisors.push(s[name].div(target[name]));
    for (const k of divisors) if (!k.zero && !k.eq(1)) add(s.a.div(k), s.b.div(k), s.c.div(k), s.d.div(k), 'divide_both_sides', `Divide both sides by the nonzero constant ${k}.`);
    for (const candidate of candidates) {
      const k = key(candidate.state); if (visited.has(k)) continue; visited.add(k);
      const before = linearText(s.a, s.b, s.c, s.d, variable), after = linearText(candidate.state.a, candidate.state.b, candidate.state.c, candidate.state.d, variable);
      const next = [...path, { before, after, rule: candidate.rule, explanation: candidate.explanation }];
      if (k === goal) {
        const path = next.length > 1 && /[()]/.test(beforeText) ? [{ before: beforeText, after: initialNormal, rule: 'expand_and_combine', explanation: 'Expand parentheses and combine like terms.' }, ...next] : next;
        return path.slice(0, -1).filter(g => verifyTransition(g.before, g.after, { context }).status === 'valid').map(g => ({ ...g, verified: true, ghost: true, origin: 'reconstructed', label: 'One possible skipped step' }));
      }
      queue.push({ state: candidate.state, path: next });
    }
  }
  return [];
}
function replace(ast, target, value) {
  if (ast === target) return value;
  if (ast.type === 'binary') return bin(ast.op, replace(ast.left, target, value), replace(ast.right, target, value));
  if (ast.type === 'neg') return { type: 'neg', arg: replace(ast.arg, target, value) };
  if (ast.type === 'call') return { ...ast, args: ast.args.map(a => replace(a, target, value)) };
  return ast;
}
function diagnose(beforeText, afterText, fallback) {
  try {
    const before = parseStatement(beforeText), after = parseStatement(afterText);
    const sides = before.expression ? [['expression', before.expression]] : [['left', before.left], ['right', before.right]];
    for (const [side, ast] of sides) {
      let matched = null;
      walk(ast, a => {
        if (matched || a.type !== 'binary' || a.op !== '*') return;
        for (const [factor, sum] of [[a.left, a.right], [a.right, a.left]]) if (sum.type === 'binary' && ['+', '-'].includes(sum.op)) {
          const wrong = bin(sum.op, bin('*', factor, sum.left), sum.right), modified = replace(ast, a, wrong);
          if (after[side] && symbolicEqual(modified, after[side])) matched = 'Distribute the multiplier to every term inside the parentheses, not just the first term.';
        }
      });
      if (matched) return matched;
    }
  } catch {}
  return fallback;
}
function polynomialBridge(beforeText, afterText, context) {
  const before = parseStatement(beforeText); if (before.kind !== 'equation') return [];
  const solved = solveEquation(beforeText), c = solved.certificate;
  if (solved.status !== 'solved' || c.type !== 'polynomial_equation' || c.coefficients.length < 3 || solved.details.roots.some(r => r.rational === null)) return [];
  const normalized = `${pPrint(fromCoefficients(c.coefficients.map(Q), c.variable))} = 0`;
  const factored = `${simplifyExpression(normalized.split('=')[0], 'factor').answer.expression} = 0`, path = [];
  const printed = `${print(before.left)} = ${print(before.right)}`;
  if (printed !== normalized) path.push({ before: beforeText, after: normalized, rule: 'collect_terms', explanation: 'Collect the polynomial terms on one side.' });
  if (factored !== printed) path.push({ before: path.at(-1)?.after || beforeText, after: factored, rule: 'factor_identity', explanation: 'Factor the polynomial while retaining all original domain restrictions.' });
  if (verifyTransition(path.at(-1)?.after || beforeText, afterText, { context }).status !== 'valid') return [];
  return path.filter(g => verifyTransition(g.before, g.after, { context }).status === 'valid').map(g => ({ ...g, verified: true, ghost: true, origin: 'reconstructed', label: 'One possible skipped step' }));
}
function safeBridge(before, after, context) { try { const linear = bridgeLinear(before, after, context); if (linear.length) return linear; } catch {} try { return polynomialBridge(before, after, context); } catch { return []; } }
function correctionPath(text, originalContext = []) {
  try {
    const s = parseStatement(text); if (s.kind !== 'equation') return [];
    const solved = solveEquation(text); if (solved.status !== 'solved' || !solved.answer.solutions?.length) return [];
    const roots = equationSignature(s, originalContext).roots || solved.details.roots;
    if (!roots.length) return [];
    const solutions = roots.map(r => r.value), last = solutions.length === 1 ? `${solved.answer.variable} = ${solutions[0]}` : `${solved.answer.variable} ∈ {${solutions.join(', ')}}`;
    const context = [...statementRestrictions(s), ...originalContext], ghosts = safeBridge(text, last, context);
    const final = verifyTransition(ghosts.at(-1)?.after || text, last, { context });
    if (final.status === 'valid') ghosts.push({ before: ghosts.at(-1)?.after || text, after: last, rule: final.rule, explanation: 'This is a verified corrected continuation, not submitted student work.', verified: true, ghost: true, origin: 'correction' });
    return ghosts;
  } catch { return []; }
}
export function checkWork(problem, submitted, options = {}) {
  try {
    if (typeof problem !== 'string') throw new MathError('Work checking takes a problem statement as text.', 'invalid');
    const original = parseStatement(problem), context = statementRestrictions(original), input = typeof submitted === 'string' ? submitted.split(/\r?\n/) : submitted;
    if (!Array.isArray(input) || input.length > 100 || input.some(x => typeof x !== 'string')) throw new MathError('Provide at most 100 text steps.', 'invalid');
    const lines = input.map(x => x.trim()).filter(Boolean), rows = []; let previous = problem, firstError = null, unresolved = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; if (i === 0 && line.replace(/\s/g, '') === problem.replace(/\s/g, '')) { rows.push({ input: line, status: 'valid', explanation: 'Original problem.', ghostSteps: [], given: true, onOriginalPath: true }); continue; }
      const verified = verifyTransition(previous, line, { context });
      const ghosts = options.showGhosts !== false && verified.status === 'valid' ? safeBridge(previous, line, context) : [];
      const explanation = verified.status === 'invalid' ? diagnose(previous, line, verified.explanation) : verified.explanation;
      if (verified.status === 'invalid' && firstError === null) firstError = i;
      if (verified.status === 'unresolved') unresolved = true;
      rows.push({ input: line, ...verified, explanation, ghostSteps: ghosts, onOriginalPath: firstError === null && !unresolved });
      previous = line;
    }
    let complete = false;
    if (lines.length && firstError === null && !unresolved) {
      try {
        const final = parseStatement(lines.at(-1));
        if (final.kind === 'equation') {
          const isVariable = a => a.type === 'sym', isConstant = a => { try { return !variables(a).length && !!constantValue(a); } catch { return false; } };
          complete = (isVariable(final.left) && isConstant(final.right)) || (isVariable(final.right) && isConstant(final.left));
        } else if (final.kind === 'expression') complete = print(final.expression).replace(/\s/g, '') === rationalPrint(rationalFunction(final.expression)).replace(/\s/g, '');
      } catch { complete = /\{.*\}|\s+or\s+|±/i.test(lines.at(-1)); }
    }
    let checkpoint = problem;
    if (firstError !== null) for (let i = 0; i < firstError; i++) { if (!rows[i].onOriginalPath) break; checkpoint = rows[i].input; }
    const status = firstError !== null ? 'invalid' : unresolved ? 'unresolved' : 'valid', corrected = firstError === null || options.showGhosts === false ? [] : correctionPath(checkpoint, context);
    return { status, complete, firstError, steps: rows, ghostSteps: rows.flatMap(r => r.ghostSteps), correctedSteps: corrected, summary: !lines.length ? 'Add a step to check your work.' : firstError !== null ? `The first invalid transition is at submitted step ${firstError + 1}. Later lines are checked locally, but do not repair the original proof.` : unresolved ? 'No incorrect step was proved, but at least one transition needs a rule the checker does not yet support.' : complete ? 'Every transition is verified and the solution is complete.' : 'Every submitted transition is verified. Continue to finish the solution.' };
  } catch (e) { return { status: e.code === 'invalid' ? 'invalid' : 'unresolved', complete: false, firstError: null, steps: [], ghostSteps: [], correctedSteps: [], summary: e.message }; }
}
