import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, integerNthRoot, rationalNthRoot, parseExpression, constantValue, evaluate, symbolicEqual } from '../engine/core.js';
import { solveEquation, simplifyExpression, functionAnalysis } from '../engine/algebra.js';
import { verifyAlgebraResult } from '../engine/verifier.js';

test('exact nth roots and rational powers respect parity and negative radicands', () => {
  for (const degree of [2, 3, 4, 5, 7, 11, 31]) for (const value of [0n, 1n, 2n, 17n, 100n]) assert.equal(integerNthRoot(value ** BigInt(degree), degree), value);
  assert.equal(String(rationalNthRoot('-8/27', 3)), '-2/3');
  assert.equal(rationalNthRoot(-4, 2), null); assert.equal(rationalNthRoot(2, 3), null);
  assert.equal(String(constantValue(parseExpression('(-8)^(1/3)'))), '-2');
  assert.equal(String(constantValue(parseExpression('(16/81)^(1/4)'))), '2/3');
  assert.equal(evaluate(parseExpression('x^(2/3)'), { x: -8 }), 4);
  assert(Number.isNaN(evaluate(parseExpression('x^(1/2)'), { x: -8 })));
  assert.throws(() => rationalNthRoot(4, 0));
});
test('root equations use invertible odd/even rules and exact certificates', () => {
  for (const [source, solutions] of [
    ['root(x,3)=-2', ['-8']], ['root(2x-1,5)=2', ['33/2']], ['x^(1/2)=3', ['9']],
    ['root(x,4)=-2', []], ['root(x^2-2,4)=1', ['(0 - sqrt(12))/(2)', '(0 + sqrt(12))/(2)']],
  ]) { const out = solveEquation(source); assert.equal(out.status, 'solved', source); assert.deepEqual(out.answer.solutions, solutions); assert(verifyAlgebraResult(out), source); }
  for (const source of ['f(x)=root(x-2,3)+1', 'f(x)=root(x-2,4)+1']) assert(verifyAlgebraResult(functionAnalysis(source)));
});
test('factoring preserves irreducible remainders and extracts multivariable common factors', () => {
  for (const source of ['x^3+8', 'x^3-27', 'x^4-16', '6x^2*y+9x*y^2', '2x^2+4x+6', 'x^5-x-1', '0', '6', '-3x^3+12x']) {
    const out = simplifyExpression(source, 'factor'); assert(symbolicEqual(parseExpression(source), parseExpression(out.answer.expression)), source); assert(verifyAlgebraResult(out), source);
  }
  assert.match(simplifyExpression('6x^2*y+9x*y^2', 'factor').answer.expression, /^3\*x\*y/);
  assert.match(simplifyExpression('x^3+8', 'factor').answer.expression, /x\^2/);
});
