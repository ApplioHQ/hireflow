// AP Precalculus Units 1–2: bounded, exact structured function rules.
// API: solvePrecalcFunctions(input), verifyPrecalcFunctionsCertificate(input, report).
// All inputs: {kind:'precalc_functions', topic, operation, ...}. Rational values
// are finite numbers or decimal/fraction strings; large integers must be strings.
// Polynomial coefficient arrays are in ASCENDING power order, e.g. [2,-3,1]
// means x^2-3x+2. Degree is at most 8 and coefficients are bounded to support
// exhaustive rational-root enumeration. No decimal sampling or guessed roots.
// rates: difference_quotient {function:{type:'polynomial',coefficients} |
//   {type:'rational',numerator,denominator}}; average_rate {function,from,to}.
//   The difference quotient is symbolic in x,h, with h != 0 and rational
//   denominator exclusions; average_rate uses exact rational endpoints.
// polynomial: end_behavior or zeros {coefficients}. zeros requires complete
//   rational splitting, including multiplicity; nonsplit cases are unsupported.
// rational: analyze or end_behavior {numerator,denominator}. analyze requires
//   complete rational splitting of reduced numerator and denominator.
// exponential_log: analyze/evaluate/solve_level {family:'exponential'|'logarithmic',
//   base,scale,rate,shift,offset, [x|y]}. Formulae are
//   scale*base^(rate*(x-shift))+offset or
//   scale*log_base(rate*(x-shift))+offset. Exact evaluations/inversions are
//   restricted to integer exponents in [-24,24].
// exponential_log: fit_exponential {points:[[x0,y0],[x1,y1]],shift,offset};
//   fits scale*base^(x-shift)+offset when base and scale are rational.
import { Q, MathError, rationalNthRoot, stableStringify } from './core.js';

const fail = (message, code = 'invalid') => { throw new MathError(message, code); };
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));
function same(expected,actual,budget={nodes:0},depth=0) {
  if(++budget.nodes>20000||depth>32) return false;
  if(expected===null||typeof expected!=='object') return Object.is(expected,actual);
  if(actual===null||typeof actual!=='object'||Array.isArray(expected)!==Array.isArray(actual)) return false;
  if(!Array.isArray(actual)&&!plain(actual)) return false;
  if(Array.isArray(expected)&&expected.length!==actual.length) return false;
  const a=Object.keys(expected).sort(),b=Object.keys(actual).sort();
  return a.length===b.length&&a.every((key,i)=>key===b[i]&&same(expected[key],actual[key],budget,depth+1));
}
function fields(v, allowed, required = allowed) {
  if (!plain(v) || Object.keys(v).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(v, k)))
    fail(`Expected fields: ${required.join(', ')}.`);
}
function rat(v, label = 'value') {
  if (!['number', 'string', 'bigint'].includes(typeof v) ||
      (typeof v === 'number' && (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))))
    fail(`${label} must be a finite exact rational; use a string for large integers.`);
  return Q(v);
}
const S = q => String(q);
const eq = (a, b) => a.eq(b);
const z = () => Q(0);
function poly(v, label) {
  if (!Array.isArray(v) || !v.length || v.length > 9) fail(`${label} needs 1–9 ascending coefficients.`);
  const out = v.map((x, i) => rat(x, `${label}[${i}]`));
  if (out.some(q => q.n.toString().length + q.d.toString().length > 40))
    fail(`${label} exceeds the coefficient size bound.`, 'budget');
  return trim(out);
}
function trim(p) { while (p.length > 1 && p.at(-1).zero) p.pop(); return p; }
const isZero = p => p.length === 1 && p[0].zero;
function add(a, b) { return trim(Array.from({length:Math.max(a.length,b.length)}, (_,i) => (a[i] || z()).add(b[i] || z()))); }
const neg = a => a.map(q => q.neg());
const sub = (a,b) => add(a,neg(b));
function mul(a,b) { const c=Array.from({length:a.length+b.length-1},z); for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) c[i+j]=c[i+j].add(a[i].mul(b[j])); return trim(c); }
function divmod(a,b) {
  if (isZero(b)) fail('Zero denominator polynomial.');
  let r=a.slice(), q=Array.from({length:Math.max(1,a.length-b.length+1)},z);
  while (!isZero(r) && r.length>=b.length) {
    const d=r.length-b.length, c=r.at(-1).div(b.at(-1)); q[d]=q[d].add(c);
    const t=Array.from({length:d},z).concat(b.map(x=>x.mul(c)));
    r=sub(r,t);
  }
  return [trim(q),r];
}
function gcd(a,b) {
  while (!isZero(b)) [a,b]=[b,divmod(a,b)[1]];
  return a.map(x=>x.div(a.at(-1)));
}
function evalPoly(p,x) { let v=z(); for(let i=p.length-1;i>=0;i--) v=v.mul(x).add(p[i]); return v; }
const coeffs = p => p.map(S);
function functionInput(v) {
  if (!plain(v)) fail('function must be a structured polynomial or rational object.');
  if (v.type==='polynomial') { fields(v,['type','coefficients']); return {type:'polynomial',num:poly(v.coefficients,'coefficients'),den:[Q(1)]}; }
  if (v.type==='rational') {
    fields(v,['type','numerator','denominator']);
    const num=poly(v.numerator,'numerator'), den=poly(v.denominator,'denominator');
    if (isZero(den)) fail('Zero denominator polynomial.');
    return {type:'rational',num,den};
  }
  fail('Unknown function type.', 'unsupported');
}
function termMap() { return new Map(); }
function put(m,i,j,c) { const key=`${i},${j}`; m.set(key,(m.get(key)||z()).add(c)); }
function biPoly(p, shifted=false) {
  const m=termMap();
  for(let n=0;n<p.length;n++) {
    let choose=1;
    for(let j=0;j<=(shifted?n:0);j++) {
      put(m,n-j,shifted?j:0,p[n].mul(choose));
      choose=choose*(n-j)/(j+1);
    }
  }
  return m;
}
function biMul(a,b) { const m=termMap(); for(const [ka,va] of a) for(const [kb,vb] of b) { const [i,j]=ka.split(',').map(Number),[u,v]=kb.split(',').map(Number); put(m,i+u,j+v,va.mul(vb)); } return m; }
function biSub(a,b) { const m=new Map(a); for(const [k,v] of b) m.set(k,(m.get(k)||z()).sub(v)); return m; }
function terms(m, divideH=false) {
  const out=[];
  for(const [key,c] of m) if(!c.zero) {
    const [xPower,hPower]=key.split(',').map(Number);
    if(divideH && hPower===0) fail('Difference quotient numerator did not cancel h.', 'unsupported');
    out.push({xPower,hPower:hPower-(divideH?1:0),coefficient:S(c)});
  }
  return out.sort((a,b)=>b.xPower-a.xPower || b.hPower-a.hPower);
}
function step(before,after,rule,explanation) { return {before,after,rule,explanation,verified:true}; }
function report(topic,operation,answer,steps,restrictions,evidence) {
  return {status:'solved',verified:true,topic,answer,steps,restrictions,
    certificate:{type:'precalc_functions',version:1,operation,assurance:'exact-rational-replay',evidence}};
}
function rates(input) {
  const op=input.operation;
  if(op==='difference_quotient') {
    fields(input,['kind','topic','operation','function']);
    const f=functionInput(input.function), p=biPoly(f.num,true), px=biPoly(f.num),
      d=biPoly(f.den,true), dx=biPoly(f.den);
    const numerator=terms(biSub(biMul(p,dx),biMul(px,d)),true);
    const answer={exact:true,type:f.type,numeratorTerms:numerator,
      denominatorFactors:f.type==='rational' ? {atX:coeffs(f.den),atXPlusH:coeffs(f.den)} : null};
    const evidence={numerator:coeffs(f.num),denominator:coeffs(f.den),
      uncancelledTerms:terms(biSub(biMul(p,dx),biMul(px,d)))};
    return report('rates',op,answer,[step(stableStringify(input.function),stableStringify(answer),
      'expand_and_cancel_h','Expand f(x+h)-f(x) exactly, combine rational denominators, and divide every numerator term by h.')],
      ['h != 0',...(f.type==='rational'?['The denominator is nonzero at x and x+h.']:[])],evidence);
  }
  if(op==='average_rate') {
    fields(input,['kind','topic','operation','function','from','to']);
    const f=functionInput(input.function), a=rat(input.from,'from'),b=rat(input.to,'to');
    if(eq(a,b)) fail('Average rate needs distinct endpoints.');
    const na=evalPoly(f.num,a),nb=evalPoly(f.num,b),da=evalPoly(f.den,a),db=evalPoly(f.den,b);
    if(da.zero || db.zero) fail('An endpoint is outside the function domain.');
    const fa=na.div(da),fb=nb.div(db),rate=fb.sub(fa).div(b.sub(a));
    const answer={exact:true,from:S(a),to:S(b),valueAtFrom:S(fa),valueAtTo:S(fb),rate:S(rate)};
    return report('rates',op,answer,[step(`(${S(fb)} - ${S(fa)})/(${S(b)} - ${S(a)})`,S(rate),
      'exact_secant_slope','Evaluate both endpoints as rational numbers and divide the change in output by the change in input.')],
      ['Endpoints are distinct and lie in the function domain.'],
      {numerator:coeffs(f.num),denominator:coeffs(f.den),endpointNumerators:[S(na),S(nb)],endpointDenominators:[S(da),S(db)]});
  }
  fail('Unsupported rates operation.', 'unsupported');
}
function behavior(p) {
  if(isZero(p)) return {degree:null,leadingCoefficient:'0',left:'zero',right:'zero'};
  const n=p.length-1,positive=p[n].cmp(0)>0;
  if(n===0) return {degree:0,leadingCoefficient:S(p[0]),left:S(p[0]),right:S(p[0])};
  return {degree:n,leadingCoefficient:S(p[n]),left:(positive===(n%2===0))?'positive_infinity':'negative_infinity',
    right:positive?'positive_infinity':'negative_infinity'};
}
function divisors(n) {
  n=n<0n?-n:n;
  if(n>1000000n) fail('Rational-root divisor search exceeds the bound.', 'budget');
  const out=[]; for(let i=1n;i*i<=n;i++) if(n%i===0n) {out.push(i);if(i*i!==n)out.push(n/i);}
  if(out.length>500) fail('Too many rational-root candidates.', 'budget');
  return out;
}
function lcm(a,b) { const g=(x,y)=>y===0n?x:g(y,x%y);return a/g(a,b)*b; }
function candidateRoots(p) {
  let d=1n;for(const q of p)d=lcm(d,q.d);
  const ints=p.map(q=>q.n*(d/q.d)), lead=ints.at(-1),constant=ints[0];
  const out=new Map();
  if(constant===0n) return [Q(0)];
  for(const a of divisors(constant)) for(const b of divisors(lead)) for(const sign of [-1n,1n]) {
    const q=Q(`${sign*a}/${b}`);out.set(S(q),q);
    if(out.size>1000) fail('Too many rational-root candidates.', 'budget');
  }
  return [...out.values()].sort((a,b)=>a.cmp(b));
}
function split(p) {
  if(isZero(p)) fail('The zero polynomial has every real number as a zero.', 'unsupported');
  let rest=p.slice();const roots=[];
  while(rest.length>1) {
    let found=false;
    for(const r of candidateRoots(rest)) if(evalPoly(rest,r).zero) {
      let multiplicity=0;
      do {const [q,rem]=divmod(rest,[r.neg(),Q(1)]);if(!isZero(rem))fail('Root division failed.','unsupported');rest=q;multiplicity++;}
      while(rest.length>1 && evalPoly(rest,r).zero);
      roots.push({value:S(r),multiplicity}); found=true;break;
    }
    if(!found) fail('Polynomial does not split completely over the rationals.', 'unsupported');
  }
  roots.sort((a,b)=>Q(a.value).cmp(Q(b.value)));
  return {roots,leadingCoefficient:S(rest[0])};
}
function polynomial(input) {
  fields(input,['kind','topic','operation','coefficients']);
  const p=poly(input.coefficients,'coefficients');
  if(input.operation==='end_behavior') {
    const answer={exact:true,...behavior(p),yIntercept:S(p[0])};
    return report('polynomial',input.operation,answer,[step(coeffs(p).join(','),stableStringify(answer),
      'leading_term_parity','The leading coefficient and degree determine both infinite-end directions.')],
      ['Coefficient order is ascending powers of x.'],{coefficients:coeffs(p),degree:p.length-1});
  }
  if(input.operation==='zeros') {
    const factorization=split(p),answer={exact:true,...factorization,degree:p.length-1};
    return report('polynomial',input.operation,answer,[step(coeffs(p).join(','),stableStringify(answer),
      'complete_rational_factorization','Enumerate every rational-root candidate, divide exact linear factors, and check the residual constant.')],
      ['All zeros must be rational for this rule.'],{coefficients:coeffs(p),factorization});
  }
  fail('Unsupported polynomial operation.', 'unsupported');
}
function rational(input) {
  fields(input,['kind','topic','operation','numerator','denominator']);
  const num=poly(input.numerator,'numerator'),den=poly(input.denominator,'denominator');
  if(isZero(den)) fail('Zero denominator polynomial.');
  const common=isZero(num)?[Q(1)]:gcd(num,den),n=divmod(num,common)[0],d=divmod(den,common)[0];
  const [asymptote,remainder]=divmod(n,d);
  const base={exact:true,numeratorDegree:isZero(num)?null:num.length-1,denominatorDegree:den.length-1,
    leadingRatio:S(num.at(-1).div(den.at(-1))),asymptotePolynomial:coeffs(asymptote),
    remainder:coeffs(remainder),reducedNumerator:coeffs(n),reducedDenominator:coeffs(d),
    canceledFactor:coeffs(common)};
  if(input.operation==='end_behavior') {
    const delta=(isZero(num)?-Infinity:num.length-1)-(den.length-1),sign=base.leadingRatio.startsWith('-')?-1:1;
    const infinity=side=>delta<0?'zero':delta===0?base.leadingRatio:
      ((sign*(side==='left'&&delta%2!==0?-1:1))>0?'positive_infinity':'negative_infinity');
    const answer={...base,left:infinity('left'),right:infinity('right')};
    return report('rational',input.operation,answer,[step(stableStringify({numerator:coeffs(num),denominator:coeffs(den)}),
      stableStringify(answer),'rational_long_division','Long division gives a polynomial asymptote; leading degrees and coefficients determine both ends.')],
      ['The denominator must be nonzero; end behavior describes x tending to infinity.'],
      {originalNumerator:coeffs(num),originalDenominator:coeffs(den),quotient:coeffs(asymptote),remainder:coeffs(remainder)});
  }
  if(input.operation==='analyze') {
    const numeratorRoots=isZero(n)?[]:split(n).roots,denominatorRoots=split(d).roots,
      canceledRoots=split(common).roots;
    const holes=canceledRoots.filter(root=>!denominatorRoots.some(pole=>pole.value===root.value)).map(root=>({
      x:root.value,y:S(evalPoly(n,Q(root.value)).div(evalPoly(d,Q(root.value)))),multiplicity:root.multiplicity}));
    const answer={...base,zeros:numeratorRoots.filter(root=>!canceledRoots.some(hole=>hole.value===root.value)),
      verticalAsymptotes:denominatorRoots,holes,
      yIntercept:den[0].zero||common[0].zero?null:S(n[0].div(d[0]))};
    return report('rational',input.operation,answer,[step(stableStringify({numerator:coeffs(num),denominator:coeffs(den)}),
      stableStringify(answer),'cancel_and_classify','Cancel the exact polynomial GCD, then classify reduced zeros, poles, removable holes, and the polynomial asymptote.')],
      ['Original denominator zeros are excluded, including removable holes.','All classified roots must be rational.'],
      {originalNumerator:coeffs(num),originalDenominator:coeffs(den),common:coeffs(common),
        reducedNumeratorRoots:numeratorRoots,reducedDenominatorRoots:denominatorRoots,canceledRoots});
  }
  fail('Unsupported rational operation.', 'unsupported');
}
function exactPower(base,n) { if(!Number.isInteger(n)||Math.abs(n)>24) fail('Exact exponent exceeds the supported integer range.','unsupported');return base.pow(n); }
function discreteLog(base,value) {
  if(value.cmp(0)<=0) fail('Logarithm argument must be positive.');
  for(let n=-24;n<=24;n++) if(eq(exactPower(base,n),value)) return n;
  fail('Value is not a bounded integer power of the rational base.','unsupported');
}
function model(input) {
  const allowed=['kind','topic','operation','family','base','scale','rate','shift','offset','x','y'];
  const required=['kind','topic','operation','family','base','scale','rate','shift','offset'];
  fields(input,allowed,input.operation==='evaluate'?[...required,'x']:input.operation==='solve_level'?[...required,'y']:required);
  if(!['exponential','logarithmic'].includes(input.family)) fail('Unknown model family.','unsupported');
  if(input.operation==='analyze' && ('x' in input || 'y' in input) ||
     input.operation==='evaluate' && 'y' in input || input.operation==='solve_level' && 'x' in input)
    fail('Unexpected model field.');
  const base=rat(input.base,'base'),a=rat(input.scale,'scale'),b=rat(input.rate,'rate'),h=rat(input.shift,'shift'),k=rat(input.offset,'offset');
  if(base.cmp(0)<=0||base.eq(1)||a.zero||b.zero) fail('Base must be positive and not 1; scale and rate must be nonzero.');
  const increasing=(base.cmp(1)>0?1:-1)*(a.cmp(0)>0?1:-1)*(b.cmp(0)>0?1:-1)>0;
  const isExp=input.family==='exponential';
  const answer={exact:true,family:input.family,formula:isExp?'scale*base^(rate*(x-shift))+offset':'scale*log_base(rate*(x-shift))+offset',
    parameters:{base:S(base),scale:S(a),rate:S(b),shift:S(h),offset:S(k)},
    domain:isExp?'all_real':(b.cmp(0)>0?`x > ${S(h)}`:`x < ${S(h)}`),
    range:isExp?(a.cmp(0)>0?`y > ${S(k)}`:`y < ${S(k)}`):'all_real',
    asymptote:{orientation:isExp?'horizontal':'vertical',value:S(isExp?k:h)},
    monotonicity:increasing?'increasing':'decreasing',
    anchorPoints:isExp?[
      {x:S(h),y:S(k.add(a))},{x:S(h.add(Q(1).div(b))),y:S(k.add(a.mul(base)))}]:[
      {x:S(h.add(Q(1).div(b))),y:S(k)},
      {x:S(h.add(base.div(b))),y:S(k.add(a))}]};
  let rule='exact_parameter_transformation',explanation='Apply exact shifts, stretches, base direction, domain, range, and anchor points.';
  if(input.operation==='evaluate') {
    const x=rat(input.x,'x'), exponent=b.mul(x.sub(h));
    const n=isExp?(exponent.integer?Number(exponent.n):NaN):discreteLog(base,exponent);
    if(!Number.isInteger(n)||Math.abs(n)>24) fail('Only bounded integer exponents can be evaluated exactly.','unsupported');
    answer.evaluation={x:S(x),exponent:n,value:S(k.add(a.mul(isExp?exactPower(base,n):Q(n))))};
    rule='exact_model_evaluation';explanation='Reduce the argument to an integer base power and evaluate with rational arithmetic.';
  } else if(input.operation==='solve_level') {
    const y=rat(input.y,'y'),target=y.sub(k).div(a);
    const n=isExp?discreteLog(base,target):(target.integer?Number(target.n):NaN);
    if(!Number.isInteger(n)||Math.abs(n)>24) fail('Only bounded integer logarithmic values can be inverted exactly.','unsupported');
    answer.solution={y:S(y),exponent:n,x:S(h.add((isExp?Q(n):exactPower(base,n)).div(b)))};
    rule='exact_model_inversion';explanation='Isolate the base power or logarithm and invert a bounded integer exponent exactly.';
  } else if(input.operation!=='analyze') fail('Unsupported model operation.','unsupported');
  return report('exponential_log',input.operation,answer,[step(stableStringify(answer.parameters),stableStringify(answer),rule,explanation)],
    ['Base > 0, base != 1, scale != 0, rate != 0.','Exact point operations use integer exponents from -24 through 24.'],
    {parameters:answer.parameters,anchors:answer.anchorPoints,monotonicity:answer.monotonicity,
      ...(answer.evaluation?{evaluation:answer.evaluation}:{}),...(answer.solution?{solution:answer.solution}:{})});
}
function fit(input) {
  fields(input,['kind','topic','operation','points','shift','offset']);
  if(!Array.isArray(input.points)||input.points.length!==2||input.points.some(p=>!Array.isArray(p)||p.length!==2)) fail('Two points [x,y] are required.');
  const [[x0,y0],[x1,y1]]=input.points.map(p=>p.map(rat)),h=rat(input.shift),k=rat(input.offset),
    dx=x1.sub(x0),v0=y0.sub(k),v1=y1.sub(k);
  if(!dx.integer||dx.zero||dx.n>12n||dx.n< -12n||v0.zero||v1.zero) fail('Distinct integer-spaced x values and nonzero shifted y values are required.');
  const ratio=v1.div(v0),root=rationalNthRoot(dx.n<0n?ratio.pow(-1):ratio,Number(dx.n<0n?-dx.n:dx.n));
  if(root===null||root.cmp(0)<=0||root.eq(1)) fail('No nonconstant rational-base model fits these points.','unsupported');
  const exponent=x0.sub(h);
  if(!exponent.integer||exponent.n>24n||exponent.n< -24n) fail('Shifted first x must be a bounded integer.','unsupported');
  const secondExponent=x1.sub(h);
  if(secondExponent.n>24n||secondExponent.n< -24n) fail('Shifted second x must be a bounded integer.','unsupported');
  const scale=v0.div(exactPower(root,Number(exponent.n)));
  if(!scale.mul(exactPower(root,Number(secondExponent.n))).add(k).eq(y1)) fail('Fitted parameters do not reproduce both points.','unsupported');
  const answer={exact:true,family:'exponential',base:S(root),scale:S(scale),rate:'1',shift:S(h),offset:S(k),points:[[S(x0),S(y0)],[S(x1),S(y1)]]};
  return report('exponential_log','fit_exponential',answer,[step(stableStringify(answer.points),stableStringify(answer),
    'exact_two_point_exponential_fit','Take the exact rational root of the shifted output ratio, solve for scale, then substitute both points.')],
    ['The x spacing is a nonzero integer of magnitude at most 12.','The fitted base and scale are rational and the base is positive and not 1.'],
    {shiftedOutputs:[S(v0),S(v1)],ratio:S(ratio),basePower:dx.toString(),replayedPoints:answer.points});
}
function compute(input) {
  if(!plain(input)) fail('Input must be a plain object.');
  if(input.kind!=='precalc_functions') fail('kind must be precalc_functions.');
  if(typeof input.topic!=='string'||typeof input.operation!=='string') fail('topic and operation are required.');
  if(input.topic==='rates') return rates(input);
  if(input.topic==='polynomial') return polynomial(input);
  if(input.topic==='rational') return rational(input);
  if(input.topic==='exponential_log') return input.operation==='fit_exponential'?fit(input):model(input);
  fail('Unsupported AP Precalculus functions topic.','unsupported');
}
/** Rejected requests have no certificate and never claim verification. */
export function solvePrecalcFunctions(input) {
  try {return compute(input);} catch(e) {return {status:e.code==='invalid'?'invalid':e.code==='budget'?'unresolved':'unsupported',
    verified:false,topic:'precalc_functions',answer:null,steps:[],restrictions:[],certificate:null,error:e.message||'Unable to certify request.'};}
}
/** Recompute from caller input and compare every report field, including the proof evidence. */
export function verifyPrecalcFunctionsCertificate(input,result) {
  try {return result?.status==='solved' && same(compute(input),result);} catch {return false;}
}
