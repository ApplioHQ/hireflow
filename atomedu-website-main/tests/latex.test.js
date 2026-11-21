import test from 'node:test';
import assert from 'node:assert/strict';
import katex from '../vendor/katex/katex.mjs';
import { latexToInput, toLatex, validateLatex, formatResultLatex } from '../engine/latex.js';
import { parseExpression, parseStatement, evaluate, statementRestrictions, Q } from '../engine/core.js';
import { solve, verifyResult } from '../engine/index.js';
import { generateProblem, TOPICS } from '../engine/generator.js';
import { verifyTransition } from '../engine/verifier.js';

const TEX = String.raw;
const RENDER = { trust: false, throwOnError: true, maxExpand: 1000, maxSize: 30, strict: 'error' };
function renders(latex) {
  assert.equal(typeof latex, 'string');
  assert.doesNotThrow(() => katex.renderToString(latex, RENDER), latex);
  const checked = validateLatex(latex, { allowPlain: false });
  assert.equal(checked.valid, true, JSON.stringify(checked));
}
function expression(source) { return parseExpression(latexToInput(source, { allowPlain: false })); }
function sameValue(source, expected, env = {}) { assert.ok(Math.abs(evaluate(expression(source), env) - expected) < 1e-12, source); }
function assertMetadata(input, result) {
  const metadata = result.latex;
  assert.ok(metadata, 'The public facade attaches LaTeX metadata.');
  assert.deepEqual(metadata, formatResultLatex(input, result));
  assert.equal(metadata.valid, true, JSON.stringify({ input, errors: metadata.errors }));
  assert.deepEqual(metadata.errors, []);
  assert.equal(metadata.steps.length, result.steps.length);
  assert.equal(metadata.restrictions.length, result.restrictions.length);
  for (const fragment of [metadata.input, metadata.answer, ...metadata.restrictions, ...metadata.steps.flatMap(step => [step.before, step.after])]) renders(fragment);
  return metadata;
}

test('recursive fractions, radicals, powers, and unbraced TeX arguments retain their meaning', () => {
  sameValue(TEX`\frac{1}{1+\dfrac{x}{\tfrac{2}{3}}}`, 1 / 4, { x: 2 });
  sameValue(TEX`\frac{\sqrt{\frac{9}{4}}}{\frac{3}{2}}`, 1);
  sameValue(TEX`\frac12+\frac1{4}`, 0.75);
  sameValue(TEX`x^{\frac{1}{2}}`, 3, { x: 9 });
  assert.equal(latexToInput(TEX`\sqrt[3]{x+1}`), 'root(x+1,3)');
  assert.equal(latexToInput(TEX`\sqrt[2]{x+1}`), 'sqrt(x+1)');
  for (const source of ['(x+1)/(1+(x-2)/(x+3))', '(x^2)^3', '-(x+1)^2', 'x^(1/2)', 'sqrt(1/(x+2))']) {
    const original = parseExpression(source), latex = toLatex(original);
    renders(latex);
    const roundTrip = expression(latex);
    for (const x of [1, 2, 4]) assert.equal(evaluate(roundTrip, { x }), evaluate(original, { x }), `${source}: ${latex}`);
  }
});

test('nth-root and fractional-power ASTs round trip through the core real-root convention', () => {
  for (const [source, x, expected] of [['root(x,3)', -8, -2], ['cbrt(x)', -27, -3], ['x^(2/3)', -8, 4], ['x^(-2/3)', -8, 0.25], ['root(x+1,5)', 31, 2]]) {
    const original = parseExpression(source), latex = toLatex(original);
    assert.match(latex, /\\sqrt\[(?:3|5)\]/);
    renders(latex);
    assert.equal(evaluate(expression(latex), { x }), expected, source);
  }
  assert.equal(toLatex('cbrt(x)'), TEX`\sqrt[3]{x}`);
  assert.equal(toLatex({ type: 'call', name: 'cbrt', args: [{ type: 'sym', name: 'x' }] }), TEX`\sqrt[3]{x}`);
  sameValue(TEX`\operatorname{cbrt}(-8)`, -2);
  assert.equal(latexToInput(TEX`\operatorname{root}\left(x,3\right)=-2`), 'root(x,3)=-2');
  for (const source of [TEX`\operatorname{root}\left(x,3\right)=-2`, TEX`\operatorname{root}\left(x,3\right)^2=4`]) assertMetadata(source, solve(source));
});

test('functions, logarithm bases, constants, absolute values, and implicit products use the owned grammar', () => {
  sameValue(TEX`\log_{2}\left(8\right)+\ln(e)`, 4);
  sameValue(TEX`\sin^2\left(\frac{\pi}{2}\right)+\cos(0)`, 2);
  sameValue(TEX`2\left(x+1\right)\left(x-1\right)`, 16, { x: 3 });
  sameValue(TEX`\left|x-2\right|+\lvert x+1\rvert`, 7, { x: -3 });
  sameValue(TEX`\operatorname{log}_{2}(8)`, 3);
  sameValue(TEX`e^{\ln(4)}`, 4);
  assert.equal(latexToInput(TEX`x\leq\frac12`), 'x<=((1)/(2))');
  assert.equal(latexToInput(TEX`-2\le x\le3`), '-2<=x<=3');
  renders(toLatex(TEX`-2\le x\le3`));
  assert.throws(() => latexToInput(TEX`\sin^{-1}x`), error => error.code === 'unsupported');
  for (const command of ['le', 'leq', 'ge', 'geq', 'ne', 'neq']) assert.equal(validateLatex(`x\\${command} 1`).valid, true);
});

test('unbraced trig coefficient belongs to its variable, not a following linear factor', () => {
  assert.equal(latexToInput(TEX`\sin3x`), 'sin(3x)');
  assert.equal(latexToInput(TEX`\sin(3)x`), 'sin(3)x');
  assert.equal(latexToInput(TEX`\sin3\cdot x`), 'sin(3)*x');
  sameValue(TEX`\sin3x`, 1, { x: Math.PI / 6 });
  sameValue(TEX`\sin3x^{2}`, Math.sin(12), { x: 2 });
});

test('chained comparisons and logical commands preserve the source chain and exact interval meaning', () => {
  const chain = TEX`-2\le x\le3`;
  assert.equal(latexToInput(chain), '-2<=x<=3');
  assert.equal(toLatex(latexToInput(chain)), TEX`-2 \le x \le 3`);
  for (const [source, expected] of [
    [chain, '[-2, 3]'],
    [TEX`3\ge x>-2`, '(-2, 3]'],
    [TEX`x\ge-2\land x\le3`, '[-2, 3]'],
    [TEX`x\ge-2\wedge x\le3`, '[-2, 3]'],
    [TEX`x<-2\lor x>3`, '(-∞, -2) ∪ (3, ∞)'],
    [TEX`x<-2\vee x>3`, '(-∞, -2) ∪ (3, ∞)'],
  ]) {
    assert.equal(validateLatex(source).valid, true, source);
    const report = solve(source);
    assert.equal(report.status, 'solved', source);
    assert.equal(report.answer.solutionSet, expected, source);
    assertMetadata(source, report);
  }
  assert.equal(latexToInput(TEX`x\ge-2\land x\le3`), 'x>=-2 and x<=3');
  assert.equal(latexToInput(TEX`x<-2\lor x>3`), 'x<-2 or x>3');
  for (const source of [TEX`-2\le x\le`, TEX`-2\le\le3`, 'x=1=2']) assert.equal(validateLatex(source).valid, false, source);
});

test('plain algebra, structured JSON, and geometry commands retain their original input', () => {
  for (const source of [' 2x + 1 = 5 ', 'sqrt(x+1)=2', 'x = -2 or x = 2', 'x ∈ {-2, 2}', 'circle area radius 3', '{"kind":"matrix","operation":"rref","matrix":[[1,2]]}']) assert.equal(latexToInput(source), source);
  assert.equal(latexToInput(TEX`\(x^{2}=4\)`), '(x^(2))=4');
  assert.equal(latexToInput(TEX`$$\frac12$$`), '((1)/(2))');
});

test('solution alternatives and finite sets preserve verifier-compatible complete branches', () => {
  const pm = latexToInput(TEX`x=\frac{-2\pm\sqrt{16}}{2}`);
  assert.equal(verifyTransition('x^2+2*x-3=0', pm).status, 'valid');
  const set = latexToInput(TEX`x\in\left\{-3,\frac{2}{2}\right\}`);
  assert.equal(verifyTransition('x^2+2*x-3=0', set).status, 'valid');
  const interval = latexToInput(TEX`x\in\left(-\infty,\frac12\right]\cup\left[2,\infty\right)`);
  assert.match(interval, /∈.*∞.*∪/);
  renders(toLatex(interval));
  renders(toLatex({ variable: 'x', solutions: [] }));
});

test('cases become equation systems and matrices become rational rref requests', () => {
  const system = latexToInput(TEX`\begin{cases}x+y&=3\\x-y&=1\end{cases}`);
  assert.deepEqual(system, { kind: 'system', equations: ['x+y=3', 'x-y=1'] });
  assert.equal(solve(system).status, 'solved');
  for (const environment of ['matrix', 'bmatrix', 'pmatrix']) {
    const request = latexToInput(`\\begin{${environment}}1&\\frac12\\\\3&4\\end{${environment}}`);
    assert.deepEqual(request, { kind: 'matrix', operation: 'rref', matrix: [['1', '1/2'], ['3', '4']] });
    assertMetadata(request, solve(request));
    assert.deepEqual(latexToInput(toLatex(request)), request);
  }
  assert.throws(() => latexToInput(TEX`\begin{bmatrix}1&2\\3\end{bmatrix}`), /equal lengths/);
  assert.throws(() => latexToInput(TEX`\begin{bmatrix}1&{}\end{bmatrix}`), /empty/);
  assert.equal(latexToInput(TEX`\begin{cases}x&x>0\\-x&x<0\end{cases}`).kind, 'piecewise');
});

test('two-column cases become piecewise functions while equation cases retain their system meaning', () => {
  const source = TEX`\begin{cases}-x & x<0\\x & x\ge0\end{cases}`;
  const expected = { kind: 'piecewise', variable: 'x', pieces: [{ expression: '-x', condition: 'x<0' }, { expression: 'x', condition: 'x>=0' }] };
  assert.deepEqual(latexToInput(source), expected);
  assert.equal(validateLatex(source).valid, true);
  const latex = toLatex(expected);
  assert.equal(latex, TEX`\begin{cases}-x & x < 0 \\ x & x \ge 0\end{cases}`);
  renders(latex);
  assert.deepEqual(latexToInput(latex), expected);
  assert.deepEqual(latexToInput(TEX`\left\{\begin{array}{ll}-x & x<0\\x & x\ge0\end{array}\right.`), expected);
  assert.deepEqual(latexToInput(TEX`\begin{cases}x+y=3\\x-y=1\end{cases}`), { kind: 'system', equations: ['x+y=3', 'x-y=1'] });
  assert.deepEqual(latexToInput(TEX`\begin{cases}x+y&=3\\x-y&=1\end{cases}`), { kind: 'system', equations: ['x+y=3', 'x-y=1'] });
  const parameter = latexToInput(TEX`\begin{cases}-t1&t1<0\\t1&t1\ge0\end{cases}`);
  assert.equal(parameter.variable, 't1');
  assert.deepEqual(latexToInput(toLatex(parameter)), parameter);
  const bounded = latexToInput(TEX`\begin{cases}\frac{x}{2}&-2\le x<0\\\sqrt{x}&x\ge0\end{cases}`);
  assert.equal(bounded.pieces[0].condition, '-2<=x<0');
  assert.equal(bounded.pieces[1].expression, 'sqrt(x)');
  renders(toLatex(bounded));
  for (const invalid of [TEX`\begin{cases}&x<0\\x&x\ge0\end{cases}`, TEX`\begin{cases}-x&\\x&x\ge0\end{cases}`, TEX`\begin{cases}\placeholder{}&x<0\\x&x\ge0\end{cases}`]) {
    assert.equal(validateLatex(invalid).valid, false);
    assert.throws(() => latexToInput(invalid), error => error.incomplete === true);
  }
});

test('piecewise and literal branch presentation uses cases without changing the mathematical report', () => {
  const definition = { kind: 'piecewise', variable: 'x', pieces: [{ expression: '-x', condition: 'x<0' }, { expression: 'x', condition: 'otherwise' }] };
  assert.deepEqual(latexToInput(toLatex(definition)), definition);
  assert.deepEqual(latexToInput(TEX`\begin{cases}-x&\text{if }x<0\\x&\text{otherwise}\end{cases}`), definition);
  renders(toLatex({ ...definition, value: '-3/2' }));
  const metadata = formatResultLatex(definition, { answer: { domain: 'All real numbers', range: '[0, ∞)' }, restrictions: [], steps: [{ before: definition, after: { expression: 'abs(x)' } }] });
  assert.equal(metadata.valid, true, JSON.stringify(metadata.errors));
  assert.match(metadata.input, /\\begin\{cases\}/);
  const literal = { kind: 'literal_equation', equation: 'a*x+b=c', variable: 'x' }, solved = solve(literal), snapshot = structuredClone(solved);
  assert.equal(solved.status, 'solved');
  const formatted = formatResultLatex(literal, solved);
  assert.deepEqual(solved, snapshot);
  assert.equal(formatted.input, TEX`a \cdot x + b = c`);
  assert.match(formatted.answer, /^x = \\begin\{cases\}\\frac/);
  assert.doesNotMatch(formatted.answer, /x = \\frac/);
  assert.match(formatted.answer, /\\text\{All values in the original domain\}/);
  assert.match(formatted.answer, /\\text\{No solution\}/);
  assert.equal(formatted.valid, true, JSON.stringify(formatted.errors));
  renders(formatted.answer);
  const missingExpression = { variable: 'x', branches: [{ conditions: ['a != 0'], solution: 'x = (c-b)/a', type: 'unique' }] };
  assert.equal(toLatex(missingExpression), TEX`x = \begin{cases}\frac{c - b}{a} & a \ne 0\end{cases}`);
  renders(toLatex(missingExpression));
  for (const equation of ['x=x', 'x=x+1']) {
    const source = { kind: 'literal_equation', equation, variable: 'x' }, output = solve(source);
    assert.equal(output.status, 'solved');
    assertMetadata(source, output);
    assert.match(output.latex.answer, /^x = \\begin\{cases\}/);
  }
});

test('TeX arrays and delimiter wrappers normalize to the same matrix and system requests', () => {
  const matrix = { kind: 'matrix', operation: 'rref', matrix: [['1', '1/2'], ['3', '4']] };
  for (const source of [
    TEX`\left[\begin{array}{cc}1&\frac12\\3&4\end{array}\right]`,
    TEX`\left(\begin{matrix}1&\frac12\\3&4\end{matrix}\right)`,
    TEX`\[\left[\begin{array}{r|r}1&\frac12\\3&4\end{array}\right]\]`,
    TEX`$\lbrack\begin{matrix}1&\frac12\\3&4\end{matrix}\rbrack$`,
  ]) {
    assert.deepEqual(latexToInput(source), matrix);
    assertMetadata(source, solve(source));
  }
  const system = { kind: 'system', equations: ['x+y=3', 'x-y=1'] };
  for (const source of [
    TEX`\left\{\begin{array}{rcl}x+y&=&3\\x-y&=&1\end{array}\right.`,
    TEX`\begin{array}{l}x+y=3\\x-y=1\end{array}`,
    TEX`\left\{\begin{cases}x+y=3\\x-y=1\end{cases}\right.`,
  ]) {
    assert.deepEqual(latexToInput(source), system);
    assertMetadata(source, solve(source));
  }
  const incomplete = validateLatex(TEX`\left[\begin{array}{cc}1&\\3&4\end{array}\right]`);
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.complete, false);
});

test('matrix entries use exact rational values and symbolic entries remain explicitly unsupported', () => {
  const source = TEX`\begin{bmatrix}\sqrt[3]{8}&\frac{1+1}{4}\\-3&\sqrt{9}\end{bmatrix}`;
  assert.deepEqual(latexToInput(source), { kind: 'matrix', operation: 'rref', matrix: [['2', '1/2'], ['-3', '3']] });
  assertMetadata(source, solve(source));
  for (const entry of ['x', TEX`\sqrt{2}`, TEX`\alpha`]) {
    const matrix = `\\begin{bmatrix}1&${entry}\\\\0&1\\end{bmatrix}`;
    assert.equal(validateLatex(matrix).valid, true, matrix);
    assert.throws(() => latexToInput(matrix), error => error.code === 'unsupported', matrix);
    assert.equal(solve(matrix).status, 'unsupported', matrix);
  }
});

test('finite arithmetic and geometric sums become replayable sequence requests; calculus is never guessed', () => {
  for (const [source, expected] of [[TEX`\sum_{k=1}^{5}k`, '15'], [TEX`\sum_{j=2}^{6}(2j+1)`, '45'], [TEX`\sum_{k=0}^{4}2^{k}`, '31']]) {
    const request = latexToInput(source);
    assert.equal(request.kind, 'sequence');
    assert.equal(request.task, 'sum');
    const result = solve(request);
    assert.equal(result.status, 'solved');
    assert.equal(result.answer.value, expected);
    assertMetadata(request, result);
  }
  for (const source of [TEX`\int_0^1 x\,dx`, TEX`\sum_{k=1}^{\infty}k`, TEX`\sum_k x`, TEX`\prod_{k=1}^{n}k`]) {
    assert.equal(validateLatex(source).valid, true, source);
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported', source);
  }
});

test('factorial notation and escaped percentages retain exact arithmetic and postfix precedence', () => {
  for (const [source, expected] of [
    ['5!', '120'],
    [TEX`\left(3+2\right)!`, '120'],
    [TEX`\operatorname{factorial}(4)+1`, '25'],
    ['5!^2', '14400'],
    [TEX`50\%+\frac14`, '3/4'],
    ['25%', '1/4'],
  ]) {
    const report = solve(source);
    assert.equal(report.status, 'solved', `${source}: ${report.error}`);
    assert.equal(report.answer.expression || report.answer.value, expected, source);
    assertMetadata(source, report);
    assert.equal(verifyResult(source, report), true);
  }
  assert.equal(toLatex('factorial(3+2)'), TEX`\left(3 + 2\right)!`);
  assert.equal(toLatex('factorial(factorial(3))'), TEX`\left(3!\right)!`);
  sameValue(toLatex('factorial(factorial(3))'), 720);
  assert.equal(latexToInput(TEX`50\%`), '50%');
  assert.equal(validateLatex('5!').valid, true);
  const undefinedFactorial = solve(TEX`\left(-1\right)!`);
  assert.equal(undefinedFactorial.status, 'invalid');
  assert.equal(undefinedFactorial.latex.valid, true);
});

test('escaped percentages stay postfix before exponents and within fraction denominators', () => {
  assert.equal(latexToInput(TEX`50\%^{2}`), '(50%^(2))');
  assert.equal(latexToInput(TEX`\frac{1}{2\%}`), '((1)/(2%))');
  for (const [source, expected] of [[TEX`50\%^{2}`, '1/4'], [TEX`\frac{1}{2\%}`, '50'], [TEX`\frac{1}{2}\%`, '1/200']]) {
    const report = solve(source);
    assert.equal(report.status, 'solved', source);
    assert.equal(report.answer.expression, expected, source);
    assert.equal(verifyResult(source, report), true);
    assertMetadata(source, report);
    for (const formatted of [toLatex(source), toLatex(parseExpression(latexToInput(source)))]) {
      renders(formatted);
      const roundTrip = solve(formatted);
      assert.equal(roundTrip.status, 'solved', formatted);
      assert.equal(roundTrip.answer.expression, expected, formatted);
      assert.equal(verifyResult(formatted, roundTrip), true);
    }
  }
});

test('completed TeX powers retain their scope before factorial and percentage postfixes', () => {
  for (const [source, expected] of [
    [TEX`2^{3}!`, '40320'],
    [TEX`2^{3!}`, '64'],
    [TEX`2^{3}\%`, '2/25'],
    [TEX`50\%^{2}`, '1/4'],
    [TEX`1+2^{3}!`, '40321'],
    [TEX`1+2^{3!}`, '65'],
    [TEX`-2^{3}!`, '-40320'],
    [TEX`2\cdot3^{2}!`, '725760'],
    [TEX`\log_{2}^{2}(4)!`, '24'],
  ]) {
    const report = solve(source);
    assert.equal(report.status, 'solved', `${source}: ${report.error}`);
    assert.equal(report.answer.expression, expected, source);
    assertMetadata(source, report);
    assert.equal(verifyResult(source, report), true);
    const formatted = toLatex(source); renders(formatted);
    const replay = solve(formatted);
    assert.equal(replay.status, 'solved', formatted);
    assert.equal(replay.answer.expression, expected, formatted);
  }
  sameValue(TEX`xy^{2}!`, 725760, { x: 2, y: 3 });
  sameValue(TEX`1+xy^{2}!`, 725761, { x: 2, y: 3 });
  const poweredFunction = expression(TEX`\sin^{2}(x)!`);
  assert.equal(poweredFunction.type, 'call');
  assert.equal(poweredFunction.name, 'factorial');
  assert.equal(poweredFunction.args[0].type, 'binary');
  assert.equal(poweredFunction.args[0].op, '^');
  assert.equal(poweredFunction.args[0].left.name, 'sin');
});

test('literal binomial coefficients become certified combination requests and symbolic coefficients stay explicit', () => {
  for (const [source, n, r, value] of [[TEX`\binom{5}{2}`, 5, 2, '10'], [TEX`\dbinom{8}{3}`, 8, 3, '56'], [TEX`\tbinom{7}{0}`, 7, 0, '1'], [TEX`\binom52`, 5, 2, '10']]) {
    const request = { kind: 'combinatorics', operation: 'combinations', n, r };
    assert.deepEqual(latexToInput(source), request);
    assert.deepEqual(latexToInput(toLatex(request)), request);
    const report = solve(source);
    assert.equal(report.status, 'solved', source);
    assert.equal(report.answer.value, value);
    assertMetadata(source, report);
    assert.equal(verifyResult(source, report), true);
  }
  for (const source of [TEX`\binom{n}{r}`, TEX`\binom{5}{2}+1`]) {
    assert.equal(validateLatex(source).valid, true);
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported');
  }
  for (const source of [TEX`\binom{}{2}`, TEX`\binom{5}{}`]) {
    assert.equal(validateLatex(source).complete, false);
    assert.throws(() => latexToInput(source), error => error.incomplete === true);
  }
});

test('other literal-bound sums and finite products become aggregate requests with exact certificates', () => {
  for (const [source, operation, expected] of [
    [TEX`\sum_{k=1}^{5}k^2`, 'sum', '55'],
    [TEX`\prod_{k=1}^{5}k`, 'product', '120'],
    [TEX`\sum_{n=1}^{4}\frac{1}{n(n+1)}`, 'sum', '4/5'],
    [TEX`\sum_{k=0}^{3}k!`, 'sum', '10'],
    [TEX`\prod_{k=0}^{3}(k+1)`, 'product', '24'],
    [TEX`\prod_{k=2}^{1}k`, 'product', '1'],
    [TEX`\sum\limits_{k=1}^{1000}k^2`, 'sum', '333833500'],
  ]) {
    const request = latexToInput(source);
    assert.equal(request.kind, 'finite_aggregate', source);
    assert.equal(request.operation, operation);
    assert.ok(['k', 'n'].includes(request.index));
    assert.equal(typeof request.lower, 'number');
    assert.equal(typeof request.upper, 'number');
    const report = solve(source);
    assert.equal(report.status, 'solved', `${source}: ${report.error}`);
    assert.equal(report.answer.value, expected);
    assertMetadata(source, report);
    assert.equal(verifyResult(source, report), true);
    const requestLatex = toLatex(request);
    assert.match(requestLatex, operation === 'sum' ? /^\\sum_\{/ : /^\\prod_\{/);
    renders(requestLatex);
    assertMetadata(request, solve(request));
    assert.deepEqual(validateLatex(source).unsupportedCommands, []);
  }
  for (const source of [TEX`\sum_{k=1}^{n}k^2`, TEX`\prod_{k=1}^{\infty}k`, TEX`\sum_{k=1}^{1001}k^2`, TEX`\int_0^1 x\,dx`]) {
    assert.equal(validateLatex(source).valid, true);
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported', source);
  }
  const undefinedTerm = TEX`\sum_{k=1}^{3}\frac{1}{k-1}`, report = solve(undefinedTerm);
  assert.equal(latexToInput(undefinedTerm).kind, 'finite_aggregate');
  assert.equal(report.status, 'invalid');
  assert.equal(report.latex.valid, true, 'Undefined values are a mathematical domain failure, not a notation failure.');
});

test('real renderer validation and grammar checks reject bad syntax and unsafe or unknown commands', () => {
  for (const source of [TEX`\frac{x}{2`, TEX`\left(x+1`, TEX`x^{2}}`, TEX`\frac{x+}{2}`, TEX`\text{label}+\frac{x+}{2}`, 'x+', 'x**', TEX`\sqrt{x+}`, TEX`\begin{bmatrix}1&2\end{pmatrix}`, TEX`\doesnotexist{x}`]) {
    const result = validateLatex(source);
    assert.equal(result.valid, false, source);
    assert.ok(result.errors.length, source);
    assert.equal(typeof result.errors[0].message, 'string');
  }
  for (const source of [TEX`\href{javascript:alert(1)}{x}`, TEX`\htmlStyle{color:red}{x}`, TEX`\includegraphics{https://example.com/a}`, TEX`\def\x{1}\x`, TEX`\newcommand{\x}{1}`, TEX`\input{secret}`, TEX`\url{https://example.com}`, TEX`\require{html}`]) {
    assert.equal(validateLatex(source).valid, false, source);
    assert.ok(validateLatex(source).unsupportedCommands.length, source);
    assert.throws(() => latexToInput(source), /unsafe|Unsupported/, source);
    renders(toLatex(source));
  }
  assert.equal(validateLatex(TEX`\text{English with 50\% \& punctuation}`).valid, true);
});

test('unknown commands and unsupported operations retain the public unsupported status', () => {
  for (const source of [TEX`\unknown{x}`, TEX`\begin{unknown}x\end{unknown}`, TEX`\int_0^1 x\,dx`]) {
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported', source);
    assert.equal(solve(source).status, 'unsupported', source);
  }
  for (const source of [TEX`\href{https://example.com}{x}`, TEX`\def\x{1}`, TEX`\frac{x+}{2}`]) assert.equal(solve(source).status, 'invalid', source);
});

test('Greek and unsupported named symbols are never silently expanded into letter products', () => {
  for (const source of [TEX`\theta+1=2`, TEX`\alpha x=1`, TEX`\mathrm{theta}+1=2`, TEX`\operatorname{mystery}(x)=1`]) {
    assert.equal(validateLatex(source).valid, true, source);
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported', source);
    assert.equal(solve(source).status, 'unsupported', source);
  }
  sameValue(TEX`\pi+\mathrm{e}`, Math.PI + Math.E);
  assert.equal(latexToInput(TEX`\mathrm{x}_{1}+1=2`), 'x_1+1=2');
  assert.equal(latexToInput(TEX`\operatorname{f}(x)=\sqrt[3]{x}`), 'f(x)=root(x,3)');
});

test('placeholders and empty required arguments are incomplete and cannot reach solving', () => {
  for (const source of ['', TEX`\placeholder{}`, TEX`x+\placeholder{}`, TEX`\frac{}{2}`, TEX`\frac{2}{}`, TEX`\sqrt{}`, TEX`\sqrt[]{2}`, TEX`x^{}`, TEX`\log_{2}{}`]) {
    const checked = validateLatex(source);
    assert.equal(checked.valid, false, source);
    assert.equal(checked.complete, false, source);
    assert.throws(() => latexToInput(source), error => error.incomplete === true, source);
  }
});

test('round trips retain original denominator, radical, and logarithm restrictions', () => {
  for (const source of ['(x-1)/(x-1)', 'sqrt(x-2)', 'log(x+3,2)', '(x+1)/(x*(x-3))']) {
    const original = parseStatement(source), converted = parseStatement(latexToInput(toLatex(source)));
    const domain = statement => statementRestrictions(statement).map(item => item.text).sort();
    assert.deepEqual(domain(converted), domain(original), source);
  }
  const source = TEX`\frac{x-1}{x-1}=1`, converted = latexToInput(source), result = solve(converted);
  assert.ok(result.restrictions.length);
  assertMetadata(source, result);
});

test('strings, ASTs, arrays, intervals, dictionaries, and JSON format meaningful safe mathematics', () => {
  assert.match(toLatex('1/(x+1)'), /\\frac/);
  assert.match(toLatex('x^(1/2)'), /\^\{\\frac|\\sqrt/);
  assert.match(toLatex('sqrt(x+1)'), /\\sqrt/);
  assert.equal(toLatex(parseStatement('x <= 1/2')), TEX`x \le \frac{1}{2}`);
  assert.match(toLatex([[1, '1/2'], [3, 4]]), /\\begin\{bmatrix\}/);
  assert.match(toLatex({ area: 'pi*3^2', perimeter: '2*pi*3' }), /\\begin\{aligned\}/);
  assert.match(toLatex('{"kind":"geometry","topic":"circle","radius":3}'), /radius.*3/);
  assert.match(toLatex('All real numbers'), /\\mathbb\{R\}/);
  assert.equal(toLatex(TEX`x\in\mathbb{R}`), TEX`x \in \mathbb{R}`);
  assert.equal(toLatex(TEX`x\in\left\{\right\}`), TEX`x \in \varnothing`);
  assert.match(toLatex('The angle is unknown.'), /\\text\{/);
  for (const value of [Q('-2/3'), parseExpression('(x^2)^3'), { type: 'binary', op: '^', left: { type: 'num', value: '-2' }, right: { type: 'num', value: '2' } }, [1, '1/2', 'sqrt(2)'], [], { kind: 'interval', low: '-∞', high: 2, highClosed: true }, { kind: 'set', values: ['1/2', 'sqrt(2)'] }, { 'unsafe_#%{key}': TEX`\href{evil}{value}` }, 'é and English', null, Infinity, 1e-12]) renders(toLatex(value));
  const circular = {}; circular.self = circular; renders(toLatex(circular));
});

test('display lists validate through KaTeX without claiming scalar computability', () => {
  const values = [1, '1/2', 'sqrt(2)'], latex = toLatex(values);
  assert.equal(latex, TEX`\left[1, \frac{1}{2}, \sqrt{2}\right]`);
  for (const source of [latex, toLatex([1, [2, 3]]), TEX`\left(1,\frac12\right)`, TEX`\left[\right]`]) {
    const checked = validateLatex(source, { allowPlain: false });
    assert.equal(checked.valid, true, JSON.stringify(checked));
    assert.equal(checked.complete, true);
    assert.deepEqual(checked.errors, []);
    assert.throws(() => latexToInput(source), error => error.code === 'unsupported', source);
    const report = solve(source);
    assert.equal(report.status, 'unsupported');
    assert.equal(report.verified, false);
    assert.equal(report.latex.valid, true);
  }
  const invalid = validateLatex(TEX`\left[1,\frac{x+}{2}\right]`, { allowPlain: false });
  assert.equal(invalid.valid, false, 'Display containers still check the syntax of each mathematical entry.');
});

test('parameter identifiers, function definitions, infinite intervals, and polynomial root strings retain their meaning', () => {
  for (const source of ['t1+1', 't_1+1']) {
    const latex = toLatex(source); renders(latex);
    assert.equal(evaluate(expression(latex), { t1: 2, t_1: 5 }), evaluate(parseExpression(source), { t1: 2, t_1: 5 }), source);
  }
  const functionSource = 'f(x)=(0 + sqrt(12))/(2)';
  const roundTrip = parseStatement(latexToInput(toLatex(functionSource)));
  assert.equal(roundTrip.kind, 'function');
  assert.equal(roundTrip.name, 'f');
  assert.equal(evaluate(roundTrip.expression), Math.sqrt(3));
  const domain = { variable: 't1', intervals: [{ low: '-∞', high: '(0 + sqrt(12))/(2)', lowClosed: false, highClosed: true }, { low: '2', high: '∞', lowClosed: true, highClosed: false }] };
  renders(toLatex(domain));
  assert.match(toLatex(domain), /\\infty/);
  assert.match(toLatex(domain), /\\frac/);
});

test('geometry measurements and explicit proof facts show lengths and angles as mathematics', () => {
  for (const input of ['circle area radius 3', { kind: 'geometry', topic: 'triangle_angles', angles: [40, 60, null] }, { kind: 'geometry', topic: 'distance', points: [[0, 0], [3, 4]] }]) assertMetadata(input, solve(input));
  const goal = { predicate: 'segment_equal', args: ['A', 'B', 'B', 'A'] };
  const input = { kind: 'geometry', topic: 'proof', givens: [], steps: [{ statement: goal, rule: 'reflexive', premises: [] }], goal };
  const result = solve(input), metadata = assertMetadata(input, result);
  assert.match(metadata.answer, /\\overline\{AB\}/);
  assert.match(toLatex({ predicate: 'angle_equal', args: ['A', 'B', 'C', 'D', 'E', 'F'] }), /\\angle ABC = \\angle DEF/);
});

test('precalculus requests and exact answers display the main trig, polar, and vector values', () => {
  const request = (topic, operation, fields) => ({ kind: 'precalculus', topic, operation, ...fields });
  const cases = [
    [request('trigonometry', 'unit_circle', { angle: '1/6' }), /\\theta = \\frac\{\\pi\}\{6\}/, /\\cos\\theta.*\\sin\\theta.*\\tan\\theta/s],
    [request('trigonometry', 'unit_circle', { angle: '1/2' }), /\\theta = \\frac\{\\pi\}\{2\}/, /\\tan\\theta &= \\text\{undefined\}/],
    [request('trigonometry', 'angle_sum', { angleA: '1/6', angleB: '1/4' }), /\\frac\{\\pi\}\{6\} \+ \\frac\{\\pi\}\{4\}/, /\\theta &= \\frac\{5\\pi\}\{12\}/],
    [request('trigonometry', 'angle_difference', { angleA: '1/4', angleB: '1/6' }), /\\frac\{\\pi\}\{4\} - \\frac\{\\pi\}\{6\}/, /\\tan\\theta/],
    [request('trigonometry', 'double_angle', { angle: '1/12' }), /2\\theta/, /\\cos\\theta/],
    [request('trigonometry', 'solve_equation', { function: 'sin', target: '1/2', interval: { lower: 0, upper: 2 } }), /\\sin\\left\(\\theta\\right\).*\\theta \\in/s, /\\theta \\in \\left\\\{\\frac\{\\pi\}\{6\}, \\frac\{5\\pi\}\{6\}\\right\\\}/],
    [request('trigonometry', 'solve_equation', { function: 'sin', target: 2, interval: { lower: 0, upper: 2 } }), /\\sin/, /\\theta \\in \\varnothing/],
    [request('polar', 'to_cartesian', { radius: 2, angle: '1/6' }), /\\left\(r,\\theta\\right\)/, /\\left\(x,y\\right\) &= \\left\(\\sqrt\{3\}, 1\\right\)/],
    [request('polar', 'to_polar', { point: [1, 1] }), /\\left\(x,y\\right\)/, /\\left\(\\sqrt\{2\}, \\frac\{\\pi\}\{4\}\\right\)/],
    [request('polar', 'to_polar', { point: [0, 0] }), /\\left\(0, 0\\right\)/, /angle chosen by convention/],
    [request('polar', 'rotate', { point: [1, 0], angle: '1/2' }), /\\operatorname\{rotate\}/, /\\left\\langle 0, 1 \\right\\rangle/],
    [request('polar', 'polar_product', { first: { radius: 2, angle: '1/6' }, second: { radius: 3, angle: '1/3' } }), /\\cdot/, /\\left\(x,y\\right\) &= \\left\(0, 6\\right\)/],
    [request('vector', 'add', { a: [1, 2], b: [3, 4] }), /\\langle 1, 2/, /\\langle 4, 6/],
    [request('vector', 'subtract', { a: [1, 2], b: [3, 4] }), / - /, /\\langle -2, -2/],
    [request('vector', 'dot', { a: [1, 2], b: [3, 4] }), /\\cdot/, /^11$/],
    [request('vector', 'cross', { a: [1, 2], b: [3, 4] }), /\\times/, /^-2$/],
    [request('vector', 'cross', { a: [1, 0, 0], b: [0, 1, 0] }), /\\times/, /\\langle 0, 0, 1/],
    [request('vector', 'scale', { a: [1, 2], factor: '3/2' }), /\\frac\{3\}\{2\}/, /\\langle \\frac\{3\}\{2\}, 3/],
    [request('vector', 'norm', { a: [1, 1] }), /\\lVert/, /^\\sqrt\{2\}$/],
    [request('vector', 'distance', { a: [1, 2], b: [4, 6] }), /^d\\left/, /^5$/],
    [request('vector', 'projection', { a: [2, 2], b: [1, 0] }), /\\operatorname\{proj\}/, /\\langle 2, 0/],
    [request('vector', 'rotate', { a: [1, 0], angle: '1/2' }), /\\operatorname\{rotate\}/, /\\langle 0, 1/],
  ];
  for (const [input, inputPattern, answerPattern] of cases) {
    const report = solve(input);
    assert.equal(report.status, 'solved', JSON.stringify(input));
    const original = structuredClone(report);
    const metadata = assertMetadata(input, report);
    assert.match(metadata.input, inputPattern);
    assert.match(metadata.answer, answerPattern);
    assert.doesNotMatch(metadata.answer, /coefficients|rational|sqrt2|sqrt3|sqrt6|dimension|exact/);
    assert.equal(verifyResult(input, report), true);
    assert.deepEqual(report, original, 'Formatting must preserve the certificate and answer.');
  }
});

test('precalculus coefficient inputs render as safe exact scalars', () => {
  const input = { kind: 'precalculus', topic: 'vector', operation: 'dot',
    a: [{ rational: '1/2', sqrt2: 1 }, 0], b: [2, 0] };
  const result = solve(input), metadata = assertMetadata(input, result);
  assert.equal(result.status, 'solved');
  assert.match(metadata.input, /\\frac\{1\}\{2\} \+ \\sqrt\{2\}/);
  assert.match(metadata.answer, /\\sqrt\{2\}/);
  assert.doesNotMatch(metadata.input, /rational|sqrt2/);
  assert.equal(verifyResult(input, result), true);
  for (const source of [
    { kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: TEX`\\href{https://bad.example}{x}` },
    { kind: 'precalculus', topic: 'vector', operation: 'scale', a: [1, 2], factor: { sqrt2: TEX`\\def\\x{1}` } },
    { exact: true, expression: TEX`\\htmlStyle{color:red}{x}`, coefficients: { rational: '1' } },
  ]) {
    const latex = toLatex(source);
    assert.doesNotMatch(latex, /\\(?:href|def|htmlStyle)\b/);
    renders(latex);
  }
});

test('raw geometry theorem strings and premise lists preserve triangle, angle, and segment notation', () => {
  for (const [source, expected] of [
    ['△ABC ≅ △DEF', TEX`\triangle ABC \cong \triangle DEF`],
    ['∠ABC≅∠DEF', TEX`\angle ABC \cong \angle DEF`],
    ['AB≅DE', TEX`\overline{AB} \cong \overline{DE}`],
    ['AB ∥ DE', TEX`\overline{AB} \parallel \overline{DE}`],
    ['△ABC', TEX`\triangle ABC`],
  ]) {
    assert.equal(toLatex(source), expected);
    renders(expected);
  }
  const before = '△ABC, △DEF, AB ≅ DE, BC ≅ EF, ∠ABC ≅ ∠DEF';
  const expected = TEX`\triangle ABC,\quad \triangle DEF,\quad \overline{AB} \cong \overline{DE},\quad \overline{BC} \cong \overline{EF},\quad \angle ABC \cong \angle DEF`;
  assert.equal(toLatex(before), expected);
  const report = { answer: '△ABC ≅ △DEF', steps: [{ before, after: '△ABC ≅ △DEF' }], restrictions: [] };
  const snapshot = structuredClone(report), metadata = formatResultLatex({ kind: 'geometry', topic: 'proof' }, report);
  assert.deepEqual(report, snapshot);
  assert.equal(metadata.valid, true, JSON.stringify(metadata.errors));
  assert.equal(metadata.steps[0].before, expected);
  assert.equal(metadata.steps[0].after, TEX`\triangle ABC \cong \triangle DEF`);
  assert.equal(toLatex('△ABC, AB = CD'), TEX`\triangle ABC,\quad \overline{AB} = \overline{CD}`);
  assert.equal(toLatex('AB = CD'), TEX`A \cdot B = C \cdot D`, 'An algebra equation alone does not assert segment geometry.');
  renders(toLatex('△ABC, △DEF, (0, 1), AB ≅ DE'));
  const escaped = toLatex(TEX`△ABC, \href{https://example.com}{x}`);
  assert.doesNotMatch(escaped, /\\href/);
  renders(escaped);
});

test('English uses escaped prose while ASCII membership requires a variable and an actual set', () => {
  for (const source of ['All values in the original domain', 'All values in R', 'The point lies in the triangle', 'x in the original domain']) {
    assert.equal(toLatex(source), `\\text{${source}}`);
    assert.doesNotMatch(toLatex(source), /\\in\b/);
    renders(toLatex(source));
  }
  for (const [source, expected] of [
    ['x in R', TEX`x \in \mathbb{R}`],
    ['t1 in {1,2}', TEX`\mathrm{t1} \in \left\{1, 2\right\}`],
    ['x in (-∞, 2]', TEX`x \in \left(-\infty, 2\right]`],
    ['n in ℤ', TEX`n \in \mathbb{Z}`],
  ]) {
    assert.equal(toLatex(source), expected);
    renders(expected);
  }
});

test('formatting does not mutate proof certificates or conflate syntax validity with proof validity', () => {
  const input = 'x^2-2=0', result = solve(input), snapshot = JSON.stringify(result);
  assertMetadata(input, result);
  assert.equal(JSON.stringify(result), snapshot);
  assert.equal(verifyResult(input, result), true);
  const invalid = formatResultLatex(TEX`x+\placeholder{}`, { answer: null, steps: [], restrictions: [] });
  assert.equal(invalid.valid, false);
  const unproved = formatResultLatex('x=1', { status: 'unsupported', verified: false, answer: 'x=2', steps: [], restrictions: [] });
  assert.equal(unproved.valid, true, 'Renderable notation does not claim an accepted mathematical proof.');
});

test('proof formatting handles structured rows, missing fields, null entries, and sparse arrays without mutation', () => {
  const fact = { predicate: 'segment_equal', args: ['A', 'B', 'B', 'A'] };
  const rows = [undefined, null, {}, { before: undefined, after: { kind: 'system', equations: ['x+y=3', 'x-y=1'] } }, { before: [fact], after: fact }, { before: '(0 + sqrt(12))/(2)' }];
  rows.length++;
  const report = { answer: { goal: fact }, restrictions: [undefined, 't1 != 0'], steps: rows, certificate: { original: true } };
  const snapshot = structuredClone(report), metadata = formatResultLatex(undefined, report);
  assert.deepEqual(report, snapshot);
  assert.equal(metadata.steps.length, rows.length);
  assert.equal(metadata.valid, true, JSON.stringify(metadata.errors));
  for (const row of metadata.steps) { renders(row.before); renders(row.after); }
  assert.match(metadata.steps[3].after, /\\begin\{cases\}/);
  assert.match(metadata.steps[4].after, /\\overline\{AB\}/);
  assert.equal(formatResultLatex(undefined, null).valid, true);
  const calculus = TEX`\int_{0}^{1}x^2\,dx`, unsupported = solve(calculus);
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.latex.valid, true);
  renders(unsupported.latex.input);
});

test('every generated family produces renderer-checked facade results at several difficulties', () => {
  for (const { id: topic } of TOPICS) for (const difficulty of ['0.000', '0.500', '1.000']) for (const seed of [0, 'latex']) {
    const generated = generateProblem({ topic, difficulty, seed }), result = solve(generated.input, { difficulty });
    assert.equal(result.status, 'solved', `${topic}/${difficulty}/${seed}: ${result.error}`);
    assert.equal(result.verified, true);
    assertMetadata(generated.input, result);
  }
});
