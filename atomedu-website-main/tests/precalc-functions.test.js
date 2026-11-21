import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePrecalcFunctions, verifyPrecalcFunctionsCertificate } from '../engine/precalc-functions.js';

const req=(topic,operation,fields={})=>({kind:'precalc_functions',topic,operation,...fields});
const clone=v=>JSON.parse(JSON.stringify(v));
function checked(input) {
  const result=solvePrecalcFunctions(input);
  assert.equal(result.status,'solved',result.error||JSON.stringify(input));
  assert.equal(result.verified,true);
  assert.equal(result.topic,input.topic);
  assert.equal(result.answer.exact,true);
  assert.equal(result.certificate.type,'precalc_functions');
  assert.equal(result.certificate.version,1);
  assert.equal(result.certificate.assurance,'exact-rational-replay');
  assert.ok(result.steps.length);
  assert.ok(result.steps.every(s=>s.verified&&s.rule&&s.explanation&&typeof s.before==='string'&&typeof s.after==='string'));
  assert.equal(verifyPrecalcFunctionsCertificate(input,result),true);
  assert.equal(verifyPrecalcFunctionsCertificate(input,clone(result)),true);
  return result;
}
function rejected(input,status) {
  const result=solvePrecalcFunctions(input);
  assert.equal(result.status,status,result.error);
  assert.equal(result.verified,false);
  assert.equal(result.certificate,null);
  assert.equal(verifyPrecalcFunctionsCertificate(input,result),false);
}

test('symbolic polynomial difference quotient expands in x and h and cancels h',()=>{
  const r=checked(req('rates','difference_quotient',{function:{type:'polynomial',coefficients:[2,-3,1]}}));
  assert.deepEqual(r.answer.numeratorTerms,[
    {xPower:1,hPower:0,coefficient:'2'},
    {xPower:0,hPower:1,coefficient:'1'},
    {xPower:0,hPower:0,coefficient:'-3'},
  ]);
  assert.equal(r.answer.denominatorFactors,null);
  assert.ok(r.certificate.evidence.uncancelledTerms.every(t=>t.hPower>=1));
  const constant=checked(req('rates','difference_quotient',{function:{type:'polynomial',coefficients:['7/3']}}));
  assert.deepEqual(constant.answer.numeratorTerms,[]);
});

test('rational difference quotient retains exact domain exclusions',()=>{
  const r=checked(req('rates','difference_quotient',{function:{type:'rational',numerator:[-1,0,1],denominator:[-1,1]}}));
  assert.deepEqual(r.answer.denominatorFactors,{atX:['-1','1'],atXPlusH:['-1','1']});
  assert.deepEqual(r.answer.numeratorTerms,[
    {xPower:2,hPower:0,coefficient:'1'},
    {xPower:1,hPower:1,coefficient:'1'},
    {xPower:1,hPower:0,coefficient:'-2'},
    {xPower:0,hPower:1,coefficient:'-1'},
    {xPower:0,hPower:0,coefficient:'1'},
  ]);
  assert.ok(r.restrictions.some(s=>s.includes('x+h')));
});

test('average rate uses exact rational endpoint values for polynomials and rational functions',()=>{
  const p=checked(req('rates','average_rate',{function:{type:'polynomial',coefficients:[2,-3,1]},from:'1/2',to:'3/2'}));
  assert.equal(p.answer.valueAtFrom,'3/4');
  assert.equal(p.answer.valueAtTo,'-1/4');
  assert.equal(p.answer.rate,'-1');
  const q=checked(req('rates','average_rate',{function:{type:'rational',numerator:[1],denominator:[1,1]},from:0,to:2}));
  assert.equal(q.answer.rate,'-1/3');
  rejected(req('rates','average_rate',{function:{type:'rational',numerator:[1],denominator:[-1,1]},from:1,to:2}),'invalid');
  rejected(req('rates','average_rate',{function:{type:'polynomial',coefficients:[1,1]},from:1,to:1}),'invalid');
});

test('polynomial end behavior and exhaustive rational roots include multiplicity',()=>{
  const end=checked(req('polynomial','end_behavior',{coefficients:[-1,0,-2]}));
  assert.deepEqual([end.answer.degree,end.answer.leadingCoefficient,end.answer.left,end.answer.right],
    [2,'-2','negative_infinity','negative_infinity']);
  const odd=checked(req('polynomial','end_behavior',{coefficients:[0,0,'3/4']}));
  assert.equal(odd.answer.yIntercept,'0');
  const constant=checked(req('polynomial','end_behavior',{coefficients:['-5/2']}));
  assert.equal(constant.answer.left,'-5/2');
  assert.equal(constant.answer.right,'-5/2');
  const zeros=checked(req('polynomial','zeros',{coefficients:[2,-3,0,1]}));
  assert.deepEqual(zeros.answer.roots,[{value:'-2',multiplicity:1},{value:'1',multiplicity:2}]);
  assert.equal(zeros.answer.leadingCoefficient,'1');
  const zeroRoot=checked(req('polynomial','zeros',{coefficients:[0,0,-2,1]}));
  assert.deepEqual(zeroRoot.answer.roots,[{value:'0',multiplicity:2},{value:'2',multiplicity:1}]);
  rejected(req('polynomial','zeros',{coefficients:[1,0,1]}),'unsupported');
  rejected(req('polynomial','zeros',{coefficients:[0]}),'unsupported');
});

test('rational analysis distinguishes holes, zeros, poles and polynomial asymptotes',()=>{
  const r=checked(req('rational','analyze',{numerator:[-1,0,1],denominator:[2,-3,1]}));
  assert.deepEqual(r.answer.canceledFactor,['-1','1']);
  assert.deepEqual(r.answer.reducedNumerator,['1','1']);
  assert.deepEqual(r.answer.reducedDenominator,['-2','1']);
  assert.deepEqual(r.answer.zeros,[{value:'-1',multiplicity:1}]);
  assert.deepEqual(r.answer.verticalAsymptotes,[{value:'2',multiplicity:1}]);
  assert.deepEqual(r.answer.holes,[{x:'1',y:'-2',multiplicity:1}]);
  assert.equal(r.answer.yIntercept,'-1/2');
  assert.deepEqual(r.answer.asymptotePolynomial,['1']);
  const missingZero=checked(req('rational','analyze',{numerator:[1,-2,1],denominator:[-1,1]}));
  assert.deepEqual(missingZero.answer.zeros,[]);
  assert.deepEqual(missingZero.answer.holes,[{x:'1',y:'0',multiplicity:1}]);
  const holeAtOrigin=checked(req('rational','analyze',{numerator:[0,1],denominator:[0,1]}));
  assert.equal(holeAtOrigin.answer.yIntercept,null);
});

test('rational end behavior uses exact long division and leading signs',()=>{
  const slant=checked(req('rational','end_behavior',{numerator:[1,0,1],denominator:[-1,1]}));
  assert.deepEqual(slant.answer.asymptotePolynomial,['1','1']);
  assert.deepEqual(slant.answer.remainder,['2']);
  assert.equal(slant.answer.left,'negative_infinity');
  assert.equal(slant.answer.right,'positive_infinity');
  const proper=checked(req('rational','end_behavior',{numerator:[-2],denominator:[1,0,1]}));
  assert.equal(proper.answer.left,'zero');
  assert.equal(proper.answer.right,'zero');
  assert.deepEqual(proper.answer.asymptotePolynomial,['0']);
  rejected(req('rational','analyze',{numerator:[1,0,1],denominator:[1,0,1]}),'unsupported');
});

const exp={family:'exponential',base:2,scale:3,rate:-1,shift:1,offset:4};
const log={family:'logarithmic',base:2,scale:-3,rate:2,shift:1,offset:4};
test('exponential transformations expose exact range, monotonicity, anchors and point operations',()=>{
  const a=checked(req('exponential_log','analyze',exp)).answer;
  assert.equal(a.domain,'all_real');
  assert.equal(a.range,'y > 4');
  assert.equal(a.monotonicity,'decreasing');
  assert.deepEqual(a.asymptote,{orientation:'horizontal',value:'4'});
  assert.deepEqual(a.anchorPoints,[{x:'1',y:'7'},{x:'0',y:'10'}]);
  assert.deepEqual(checked(req('exponential_log','evaluate',{...exp,x:0})).answer.evaluation,{x:'0',exponent:1,value:'10'});
  assert.deepEqual(checked(req('exponential_log','solve_level',{...exp,y:10})).answer.solution,{y:'10',exponent:1,x:'0'});
  rejected(req('exponential_log','evaluate',{...exp,x:'1/2'}),'unsupported');
  rejected(req('exponential_log','solve_level',{...exp,y:5}),'unsupported');
});

test('logarithmic transformations enforce domain and invert bounded integer powers',()=>{
  const a=checked(req('exponential_log','analyze',log)).answer;
  assert.equal(a.domain,'x > 1');
  assert.equal(a.range,'all_real');
  assert.equal(a.monotonicity,'decreasing');
  assert.deepEqual(a.asymptote,{orientation:'vertical',value:'1'});
  assert.deepEqual(a.anchorPoints,[{x:'3/2',y:'4'},{x:'2',y:'1'}]);
  assert.deepEqual(checked(req('exponential_log','evaluate',{...log,x:2})).answer.evaluation,{x:'2',exponent:1,value:'1'});
  assert.deepEqual(checked(req('exponential_log','solve_level',{...log,y:1})).answer.solution,{y:'1',exponent:1,x:'2'});
  rejected(req('exponential_log','evaluate',{...log,x:1}),'invalid');
  rejected(req('exponential_log','evaluate',{...log,x:'7/4'}),'unsupported');
  rejected(req('exponential_log','solve_level',{...log,y:0}),'unsupported');
});

test('two-point exponential fitting accepts only a verified rational base',()=>{
  const fit=checked(req('exponential_log','fit_exponential',{points:[[0,5],[2,17]],shift:0,offset:1}));
  assert.deepEqual([fit.answer.base,fit.answer.scale,fit.answer.rate],['2','4','1']);
  const reversed=checked(req('exponential_log','fit_exponential',{points:[[2,17],[0,5]],shift:0,offset:1}));
  assert.deepEqual([reversed.answer.base,reversed.answer.scale],['2','4']);
  rejected(req('exponential_log','fit_exponential',{points:[[0,2],[2,3]],shift:0,offset:0}),'unsupported');
  rejected(req('exponential_log','fit_exponential',{points:[[0,5],[0,17]],shift:0,offset:1}),'invalid');
});

test('complete report replay rejects forged answer, step, restriction, evidence and metadata',()=>{
  const input=req('rational','analyze',{numerator:[-1,0,1],denominator:[2,-3,1]});
  const original=checked(input);
  const mutations=[
    r=>{r.answer.holes[0].y='999';},
    r=>{r.answer.zeros.push({value:'3',multiplicity:1});},
    r=>{r.steps[0].explanation='Trust me';},
    r=>{r.restrictions.pop();},
    r=>{r.certificate.evidence.common=['1'];},
    r=>{r.certificate.assurance='sampled';},
    r=>{r.certificate.version=2;},
    r=>{r.verified=false;},
    r=>{r.extra='hidden';},
  ];
  for(const mutate of mutations) {const forged=clone(original);mutate(forged);assert.equal(verifyPrecalcFunctionsCertificate(input,forged),false);}
  assert.equal(verifyPrecalcFunctionsCertificate({...input,numerator:[1,0,1]},original),false);
  assert.equal(verifyPrecalcFunctionsCertificate(input,null),false);
  const malformed=clone(original);malformed.answer=Object.create({exact:true});
  assert.equal(verifyPrecalcFunctionsCertificate(input,malformed),false);
  const sparse=clone(original);sparse.steps.length++;
  assert.equal(verifyPrecalcFunctionsCertificate(input,sparse),false);
});

test('strict input shapes and finite values reject unverifiable requests',()=>{
  rejected(req('rates','difference_quotient',{function:{type:'polynomial',coefficients:[1,2],mystery:true}}),'invalid');
  rejected(req('polynomial','end_behavior',{coefficients:[1,NaN]}),'invalid');
  rejected(req('rational','analyze',{numerator:[1],denominator:[0]}),'invalid');
  rejected(req('exponential_log','analyze',{...exp,base:1}),'invalid');
  rejected(req('exponential_log','analyze',{...exp,mystery:1}),'invalid');
  rejected({kind:'precalc_functions',topic:'trigonometry',operation:'unit_circle'},'unsupported');
  rejected(null,'invalid');
});
