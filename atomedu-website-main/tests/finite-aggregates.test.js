import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpression, constantValue } from '../engine/core.js';
import { solveFiniteAggregate, verifyFiniteAggregate } from '../engine/finite-aggregates.js';
test('factorials and percentages use exact rational arithmetic and normal precedence', () => {
  for (const [source, expected] of [['5!', '120'], ['0!', '1'], ['3!^2', '36'], ['2^3!', '64'], ['(3+2)!/4!', '5'], ['25%*80', '20'], ['1/2%', '50'], ['50%^2', '1/4']]) assert.equal(String(constantValue(parseExpression(source))), expected, source);
  for (const source of ['(-1)!', '(1/2)!', '1001!']) assert.throws(() => constantValue(parseExpression(source)));
});
test('finite polynomial sums, geometric sums, products, and telescoping sums replay exactly', () => {
  for (const [operation, expression, lower, upper, expected] of [['sum','k^2',1,10,'385'], ['sum','2^k',0,5,'63'], ['product','k',1,5,'120'], ['sum','1/k-1/(k+1)',1,100,'100/101'], ['sum','k',3,2,'0'], ['product','k',3,2,'1']]) {
    const input = { kind:'finite_aggregate',operation,index:'k',lower,upper,expression }, out=solveFiniteAggregate(input); assert.equal(out.status,'solved',out.error); assert.equal(out.answer.value,expected); assert(verifyFiniteAggregate(input,out));
  }
});
test('finite aggregate certificates reject changed terms, undefined expressions and excessive work', () => {
  const input={kind:'finite_aggregate',operation:'sum',index:'k',lower:1,upper:5,expression:'k^2'}, out=solveFiniteAggregate(input); const bad=structuredClone(out); bad.certificate.termValues[0].value='100'; assert(!verifyFiniteAggregate(input,bad));
  assert.equal(solveFiniteAggregate({...input,expression:'1/(k-3)'}).verified,false);
  assert.equal(solveFiniteAggregate({...input,upper:1001}).verified,false);
  assert.equal(solveFiniteAggregate({...input,expression:'sqrt(k)'}).verified,false);
});
