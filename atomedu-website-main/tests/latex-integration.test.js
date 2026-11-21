import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult, checkWork, verifyTransition, generateProblem, validateLatex } from '../engine/index.js';

test('public input pipeline preserves nested LaTeX semantics and verifies all mathematical output fragments', () => {
  const cases = [
    [String.raw`\frac{2x+1}{3}=5`, ['7']],
    [String.raw`\sqrt[3]{x-1}=-2`, ['-7']],
    [String.raw`\log_{2}\left(x+1\right)=3`, ['7']],
    [String.raw`x^{\frac{2}{3}}=4`, ['-8', '8']],
    [String.raw`\left|2x-1\right|=5`, ['-2', '3']],
    [String.raw`\sqrt{2x+3}=x+1`, ['sqrt(2)']],
    [String.raw`\log(x)+\log(x-3)=1`, ['5']],
    [String.raw`2^{x+1}=2^{3-x}`, ['1']],
  ];
  for (const [input, expected] of cases) {
    const out = solve(input); assert.equal(out.status, 'solved', `${input}: ${out.error}`); assert(out.verified); assert(out.latex.valid, JSON.stringify(out.latex.errors));
    assert.deepEqual([...out.answer.solutions].sort(), [...expected].sort(), input); assert(verifyResult(input, out), input);
    for (const math of [out.latex.input, out.latex.answer, ...out.latex.restrictions, ...out.latex.steps.flatMap(s => [s.before, s.after])]) assert(validateLatex(math, { allowPlain: false }).valid, math);
  }
});
test('rational function analysis, cases, matrices, and finite sums pass through visual input syntax', () => {
  const fn = String.raw`f(x)=\frac{2}{x-3}+1`, result = solve(fn); assert.equal(result.answer.yIntercept, '(0, 1/3)'); assert(verifyResult(fn, result)); assert.match(result.latex.answer, /\\frac/);
  const systems = solve(String.raw`\begin{cases}x+y=3\\x-y=1\end{cases}`); assert.deepEqual(systems.answer.values, { x: '2', y: '1' }); assert(systems.latex.valid);
  const matrix = solve(String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`); assert.equal(matrix.status, 'solved'); assert(matrix.latex.valid); assert.deepEqual(matrix.answer.matrix, [['1', '0'], ['0', '1']]);
  const sum = solve(String.raw`\sum_{k=1}^{5} (2k+1)`); assert.equal(sum.status, 'solved'); assert.equal(sum.answer.value, '35'); assert(sum.latex.valid);
});
test('notation validity, completeness, unsupported operations and mathematical truth stay distinct', () => {
  const integral = String.raw`\int_{0}^{1}x^2\,dx`;
  assert(validateLatex(integral).valid); const unsupported = solve(integral); assert.equal(unsupported.status, 'unsupported'); assert.equal(unsupported.verified, false); assert(unsupported.latex.valid);
  const undefinedFraction = solve(String.raw`\frac{1}{0}`); assert.equal(undefinedFraction.status, 'invalid'); assert.equal(undefinedFraction.verified, false); assert(undefinedFraction.latex.valid);
  for (const input of [String.raw`\frac{x}{}`, String.raw`\sqrt{\placeholder{}}`, String.raw`\href{https://example.com}{x}`]) { const out = solve(input); assert.notEqual(out.status, 'solved'); assert.equal(out.verified, false); assert.equal(out.latex.valid, false); }
});
test('work checker and Ghost steps accept TeX without changing domain preservation', () => {
  const work = checkWork(String.raw`2\left(x+3\right)=14`, ['x=4']); assert.equal(work.status, 'valid'); assert(work.complete); assert(work.latex.valid); assert(work.ghostSteps.length >= 2);
  const incorrect = checkWork(String.raw`2\left(x+3\right)=14`, ['2x+3=14']); assert.equal(incorrect.status, 'invalid'); assert.equal(incorrect.firstError, 0); assert(incorrect.latex.valid);
  assert.equal(verifyTransition(String.raw`\frac{x}{x}`, '1').status, 'valid'); assert.equal(verifyTransition('1', String.raw`\frac{x}{x}`).status, 'invalid');
  assert.equal(checkWork(String.raw`\left|2x-1\right|\le5`, [String.raw`-2\le x\le3`]).status, 'valid');
  assert.equal(checkWork(String.raw`\log(x)+\log(x-3)=1`, ['x=5']).status, 'valid');
});
test('notation metadata is replayable and cannot be forged independently of the result', () => {
  const input = String.raw`\frac{x+1}{2}=3`, out = solve(input); assert(verifyResult(input, out));
  const forged = structuredClone(out); forged.latex.answer = String.raw`x=100`; assert.equal(verifyResult(input, forged), false);
  const badMath = structuredClone(out); badMath.answer.solutions = ['100']; assert.equal(verifyResult(input, badMath), false);
  const p = generateProblem({ topic: 'rational_function', difficulty: '0.583', seed: 'latex' }); assert(p.latex.valid); assert(p.solution.every(s => s.verified));
});
