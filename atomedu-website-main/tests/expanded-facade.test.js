import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verifyResult, validateLatex } from '../engine/index.js';

test('literal formula requests bind the target variable and preserve every parameter branch', () => {
  const source='a*x+b=c', out=solve(source,{variable:'x'});
  assert.equal(out.status,'solved'); assert(out.verified); assert(out.latex.valid); assert.equal(out.answer.branches.length,3);
  assert(verifyResult(source,out,{variable:'x'})); assert.equal(verifyResult(source,out,{variable:'b'}),false);
  assert(verifyResult(source,out)); assert.match(out.latex.answer,/\\begin\{cases\}/);
  const forged=structuredClone(out); forged.answer.branches.pop(); assert.equal(verifyResult(source,forged),false);
});
test('piecewise LaTeX flows through first-match polynomial domain, range, and graph-compatible data', () => {
  const source=String.raw`\begin{cases}-x&x<0\\x&x\ge0\end{cases}`, out=solve(source);
  assert.equal(out.status,'solved'); assert(out.verified); assert(out.latex.valid); assert(verifyResult(source,out));
  assert.equal(out.answer.domain,'(-∞, ∞)'); assert.equal(out.answer.range,'[0, ∞)'); assert.equal(out.answer.semantics,'first-match');
  assert.match(out.latex.input,/\\begin\{cases\}/);
  const withValue=solve({kind:'piecewise',variable:'x',pieces:[{expression:'1',condition:'x<=2'},{expression:'3',condition:'otherwise'}],value:'2'});
  assert.equal(withValue.answer.evaluation.value,'1'); assert.equal(withValue.answer.evaluation.branch,0);
});
test('finite notation supports exact polynomial sums, products, factorials, binomials, and percentages', () => {
  for(const [source,expected] of [[String.raw`\sum_{k=1}^{10}k^2`,'385'],[String.raw`\prod_{k=1}^{5}k`,'120'],[String.raw`\binom{9}{4}`,'126'],['5!','120']]) {
    const out=solve(source); assert.equal(out.status,'solved',out.error); assert.equal(out.answer.value||out.answer.expression,expected); assert(out.latex.valid); assert(verifyResult(source,out));
  }
});
test('input-independent prototype names cannot impersonate a replay kernel', () => {
  for(const kind of ['toString','constructor','__proto__']) assert.equal(verifyResult({kind},{status:'solved',verified:true,answer:{},steps:[]}),false);
});
test('natural exponentials and zero powers retain their correct real domains', () => {
  for (const source of ['e^x=2','e^(2x-1)=1','f(x)=e^(x-1)+3','1^x=1']) { const out=solve(source); assert.equal(out.status,'solved',out.error); assert(out.verified); assert(verifyResult(source,out)); }
  assert.equal(solve('e^(2x-1)=1').answer.solutions[0],'1/2');
  const zero=solve('0^0'); assert.equal(zero.status,'invalid'); assert.equal(zero.verified,false);
  const variable=solve('x^0'); assert.equal(variable.answer.expression,'1'); assert(variable.restrictions.includes('x != 0'));
});
