import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLiteralEquation, verifyLiteralCertificate } from '../engine/literal-equations.js';
import { parseExpression, symbolicEqual } from '../engine/core.js';

test('literal equations isolate the chosen variable using exact parameter coefficients', () => {
  for (const [equation, variable, expected] of [['a*x+b=c', 'x', '(c-b)/a'], ['p=2*l+2*w', 'l', 'p/2-w'], ['A=l*w', 'w', 'A/l'], ['y=m*x+b', 'b', 'y-m*x']]) {
    const input = { kind: 'literal_equation', equation, variable }, out = solveLiteralEquation(input);
    assert.equal(out.status, 'solved', out.error); assert(verifyLiteralCertificate(input, out)); assert(symbolicEqual(parseExpression(out.answer.expression), parseExpression(expected)), equation);
  }
});
test('zero parameter coefficients receive separate complete cases', () => {
  const out = solveLiteralEquation({ kind: 'literal_equation', equation: 'a*x+b=c', variable: 'x' });
  assert.deepEqual(out.answer.branches.map(b => b.type), ['unique', 'all_in_domain', 'inconsistent']);
  assert(out.answer.branches[0].conditions.includes('a != 0')); assert(out.answer.branches[1].conditions.includes('a = 0'));
  const tautology = solveLiteralEquation({ kind: 'literal_equation', equation: 'x=x', variable: 'x' }); assert.equal(tautology.answer.branches[0].type, 'all_in_domain');
  const inconsistent = solveLiteralEquation({ kind: 'literal_equation', equation: 'x=x+1', variable: 'x' }); assert.equal(inconsistent.answer.branches[0].type, 'inconsistent');
});
test('literal rearrangement preserves denominator exclusions and rejects forged branches', () => {
  const input = { kind: 'literal_equation', equation: '(x-a)/(x-b)=c', variable: 'x' }, out = solveLiteralEquation(input); assert.equal(out.status, 'solved'); assert(verifyLiteralCertificate(input, out)); assert(out.restrictions.includes('x - b != 0'));
  const forged = structuredClone(out); forged.answer.branches = []; assert(!verifyLiteralCertificate(input, forged));
  assert.equal(solveLiteralEquation({ kind: 'literal_equation', equation: 'a*x^2=b', variable: 'x' }).status, 'unsupported');
  assert.equal(solveLiteralEquation({ kind: 'literal_equation', equation: 'a*x=b', variable: 'z' }).status, 'invalid');
});
