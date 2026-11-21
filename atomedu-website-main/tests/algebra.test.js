import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, parseExpression, parseStatement, print, constantValue, rationalFunction, rationalPrint, symbolicEqual } from '../engine/core.js';
import { solveEquation, simplifyExpression, solveInequality, functionAnalysis, solveSystem } from '../engine/algebra.js';
import { verifyAlgebraResult, verifyCertificate, verifyTransition } from '../engine/verifier.js';
import { checkWork } from '../engine/work.js';

test('decimal and large-number arithmetic stays exact', () => {
  assert.equal(String(Q('0.1').add('0.2')), '3/10');
  assert.equal(String(Q('123456789123456789').mul(9)), '1111111102111111101');
  assert.equal(String(Q('-2/-6')), '1/3');
  assert.throws(() => Q('1/0'));
});
test('parser precedence, implicit multiplication, scientific notation and printing', () => {
  assert.equal(rationalPrint(rationalFunction(parseExpression('-x^2'))), '-x^2');
  assert.equal(String(constantValue(parseExpression('2^3^2'))), '512');
  assert.equal(String(constantValue(parseExpression('1e-3 + 0.009'))), '1/100');
  assert.equal(rationalPrint(rationalFunction(parseExpression('2(x+3) - 3x'))), '-x + 6');
  const x = parseExpression('(1/2)^2'); assert(symbolicEqual(x, parseExpression(print(x))));
  for (const s of ['x+', '(x+2', 'x==2', '1..2', 'process.exit()', '1/0']) {
    if (s === '1/0') assert.throws(() => rationalFunction(parseExpression(s)));
    else if (s === '1..2') assert.throws(() => parseExpression(s));
    else assert.throws(() => parseStatement(s));
  }
});
const equationCases = [
  ['2(x+3)=14', ['4']], ['3x + 2 = 2(x+4)', ['6']], ['x/4+3=8', ['20']],
  ['2x-5=x+7', ['12']], ['0.1x=0.3', ['3']], ['-x=1/3', ['-1/3']],
  ['x^2-5x+6=0', ['2', '3']], ['x^2=9', ['-3', '3']], ['(x-2)^2=0', ['2']],
  ['x^3-6x^2+11x-6=0', ['1', '2', '3']], ['x^4-5x^2+4=0', ['-2', '-1', '1', '2']],
  ['1/(x-3)=2', ['7/2']], ['(x^2-1)/(x-1)=0', ['-1']],
  ['sqrt(x+5)=x-1', ['4']], ['sqrt(2x+1)=3', ['4']], ['sqrt(x)=-1', []],
  ['abs(2x-1)=5', ['-2', '3']], ['abs(x)=0', ['0']], ['abs(x)=-1', []],
  ['2^x=8', ['3']], ['2^(2x-1)=8', ['2']], ['2^x=1/2', ['-1']], ['2^x=-4', []],
  ['log(x)=2', ['100']], ['log(x+2,2)=3', ['6']], ['ln(x)=0', ['1']], ['exp(x)=1', ['0']],
  ['sqrt(x)/sqrt(x)=0', []], ['log(x)/log(x)=0', []],
];
for (const [input, expected] of equationCases) test(`exact equation: ${input}`, () => {
  const out = solveEquation(input);
  assert.equal(out.status, 'solved'); assert(verifyAlgebraResult(out), `certificate failed for ${input}`);
  assert.deepEqual([...out.answer.solutions].sort(), [...expected].sort());
});
test('irrational, symbolic logarithmic and complex roots have exact certificates', () => {
  for (const s of ['x^2=2', '2^x=3', 'ln(x)=2', 'log(2x+1)=1/2']) assert(verifyAlgebraResult(solveEquation(s)), s);
  const complex = solveEquation('x^2+1=0', { domain: 'complex' });
  assert(verifyAlgebraResult(complex)); assert.equal(complex.answer.solutions.length, 2);
  assert.equal(solveEquation('x^2+1=0').answer.solutionSet, 'No solution');
});
test('identities, contradictions, domain holes and partial results are not conflated', () => {
  assert.equal(solveEquation('x=x').answer.identity, true);
  assert.equal(solveEquation('x=x+1').answer.identity, false);
  assert.deepEqual(solveEquation('(2x^2-4)/(x^2-2)=0').answer.solutions, []);
  assert(verifyAlgebraResult(solveEquation('(2x^2-4)/(x^2-2)=0')));
  const partial = solveEquation('x^5-x-1=0'); assert.equal(partial.status, 'unresolved'); assert.equal(partial.verified, false);
});
test('rational simplification retains canceled denominator restrictions', () => {
  const result = simplifyExpression('(x^2-1)/(x-1)'); assert.equal(result.answer.expression, 'x + 1');
  assert(result.restrictions.includes('x - 1 != 0')); assert(verifyAlgebraResult(result));
  assert(symbolicEqual(parseExpression(simplifyExpression('x^2-5x+6', 'factor').answer.expression), parseExpression('x^2-5x+6')));
});
test('function analysis includes rational asymptotes, holes, intercepts and transformations', () => {
  const r = functionAnalysis('f(x)=2/(x-3)+1'); assert(verifyAlgebraResult(r));
  assert.equal(r.answer.domain, 'x ∈ R; x ≠ 3'); assert.equal(r.answer.horizontalAsymptote, 'y = 1');
  assert.deepEqual(r.answer.verticalAsymptotes, ['x = 3']); assert.deepEqual(r.answer.xIntercepts, ['(1, 0)']);
  assert.equal(r.answer.yIntercept, '(0, 1/3)'); assert.equal(r.answer.range, 'y ∈ R; y ≠ 1');
  const hole = functionAnalysis('f(x)=(x^2-1)/(x-1)'); assert.deepEqual(hole.answer.holes, ['(1, 2)']); assert.deepEqual(hole.answer.verticalAsymptotes, []);
  assert.equal(hole.answer.range, 'y ∈ R; y ≠ 2');
  assert.equal(functionAnalysis('f(x)=x^3/x').answer.range, 'y > 0');
  assert.equal(functionAnalysis('f(x)=(x^4-4)/(x^2-2)').answer.range, 'y ≥ 2; y ≠ 4');
  assert.equal(functionAnalysis('f(x)=(x^3-x^2)/(x-1)').answer.range, 'y ≥ 0');
  const q = functionAnalysis('f(x)=2(x-3)^2+1'); assert.equal(q.answer.vertex, '(3, 1)'); assert.equal(q.answer.range, 'y ≥ 1');
  for (const s of ['f(x)=sqrt(x-2)+3', 'f(x)=abs(x-2)+3', 'f(x)=log(x-2)+1', 'f(x)=2^(x-1)+3']) assert(verifyAlgebraResult(functionAnalysis(s)), s);
});
test('inequality sign charts handle negative multipliers, quadratic intervals and poles', () => {
  assert.equal(solveInequality('-2x<4').answer.solutionSet, '(-2, ∞)');
  assert.equal(solveInequality('x^2-5x+6<=0').answer.solutionSet, '[2, 3]');
  assert.equal(solveInequality('1/(x-1)>0').answer.solutionSet, '(1, ∞)');
  const irrational = solveInequality('x^2<2'); assert.equal(irrational.answer.intervals.length, 1); assert(verifyAlgebraResult(irrational));
});
test('systems distinguish unique, inconsistent, and full parameterized solutions', () => {
  const unique = solveSystem({ equations: ['2x+y=5', 'x-y=1'] }); assert.deepEqual(unique.answer.values, { x: '2', y: '1' }); assert(verifyAlgebraResult(unique));
  const no = solveSystem({ equations: ['x+y=2', 'x+y=3'] }); assert.equal(no.answer.type, 'inconsistent'); assert(verifyAlgebraResult(no));
  const infinite = solveSystem({ equations: ['x+y=2', '2x+2y=4'] }); assert.equal(infinite.answer.type, 'infinite'); assert(verifyAlgebraResult(infinite));
  const forged = structuredClone(infinite); forged.answer.values = { x: '1', y: '1' }; forged.certificate.answer.values = forged.answer.values; assert.equal(verifyAlgebraResult(forged), false);
});
test('proof checker rejects lost roots, changed domains, incorrect signs and misleading sample identities', () => {
  const invalid = [
    ['x^2=9', 'x=3'], ['2(x+3)=14', '2x+3=14'], ['-2x<4', 'x<-2'], ['1', 'x/x'],
    ['x=1', '0=0'], ['x/x=1', 'x=0'], ['x=1', 'y=1'], ['(x-1)/(x-1)', 'x'],
    ['1/0', '1/0'], ['sqrt(-1)', 'sqrt(-1)'], ['1/(x-x)', '1/(x-x)'],
    ['0', '(10x+63)*(10x+31)*(10x+17)*(10x+4)*(10x-9)*(10x-22)*(10x-38)*(10x-55)*(10x-71)'],
  ];
  for (const [a, b] of invalid) assert.notEqual(verifyTransition(a, b).status, 'valid', `${a} -> ${b}`);
  const valid = [['x/x', '1'], ['x^2=9', 'x=3 or x=-3'], ['x^2=9', 'x=±3'], ['2(x+3)=14', 'x=4'], ['x^2=2', '2x^2=4']];
  for (const [a, b] of valid) assert.equal(verifyTransition(a, b).status, 'valid', `${a} -> ${b}`);
});
test('Ghost steps are verified bridges, not invented student reasoning', () => {
  const r = checkWork('2(x+3)=14', ['x=4']); assert.equal(r.status, 'valid'); assert.equal(r.complete, true); assert(r.ghostSteps.length >= 2);
  for (const g of r.ghostSteps) { assert.equal(g.origin, 'reconstructed'); assert.equal(verifyTransition(g.before, g.after).status, 'valid'); }
  assert.equal(checkWork('2(x+3)=14', ['x+3=7']).ghostSteps.length, 0);
  const bad = checkWork('2(x+3)=14', ['2x+3=14', '2x=11', 'x=11/2']); assert.equal(bad.firstError, 0); assert.equal(bad.steps[1].onOriginalPath, false); assert(bad.correctedSteps.length);
  assert.equal(checkWork('x^2=9', ['x=3']).status, 'invalid');
  const quadratic = checkWork('x^2=9', ['x=3 or x=-3']); assert.equal(quadratic.complete, true); assert(quadratic.ghostSteps.some(g => g.rule === 'factor_identity'));
  assert.equal(verifyTransition('sqrt(x^2)', 'abs(x)').status, 'valid');
  const restricted = checkWork('(x^2-1)/(x-1)=0', ['x^2-1=0', 'x=2']); assert.equal(restricted.correctedSteps.at(-1).after, 'x = -1');
});
test('forged proof certificates and answers fail verification', () => {
  const r = solveEquation('2x=8');
  const badRoot = structuredClone(r); badRoot.answer.solutions = ['5']; assert.equal(verifyAlgebraResult(badRoot), false);
  const badCert = structuredClone(r); badCert.certificate.coefficients[0] = '-10'; assert.equal(verifyCertificate(badCert.certificate), false);
  const badVariable = structuredClone(r); badVariable.answer.variable = 'y'; assert.equal(verifyAlgebraResult(badVariable), false);
  const identity = solveEquation('x=x'); identity.answer.solutionSet = 'No solution'; assert.equal(verifyAlgebraResult(identity), false);
  const forgedValue = structuredClone(r); forgedValue.certificate.roots[0].value = '5'; forgedValue.answer.solutions = ['5']; assert.equal(verifyAlgebraResult(forgedValue), false);
  const forgedStep = structuredClone(r); forgedStep.steps[0].after = 'x = 100'; assert.equal(verifyAlgebraResult(forgedStep), false);
  const forgedDomain = { type: 'expression_identity', source: '1', result: 'x/x' }; assert.equal(verifyCertificate(forgedDomain), false);
});
