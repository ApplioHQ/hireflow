import test from 'node:test';
import assert from 'node:assert/strict';
import { Q, parseExpression, rationalFunction, pEqual, pMul } from '../engine/core.js';
import { solveAdvanced, verifyAdvancedCertificate } from '../engine/advanced-algebra.js';

function solved(input, options) {
  const out = solveAdvanced(input, options);
  assert.equal(out.status, 'solved', `${JSON.stringify(input)}: ${out.error}`);
  assert.equal(out.verified, true);
  assert.equal(out.certificate.type, 'advanced_algebra');
  assert(out.steps.length > 0);
  assert(out.steps.every(s => s.verified === true && s.rule && s.explanation));
  assert.deepEqual(out.certificate.source, input);
  assert.equal(verifyAdvancedCertificate(input, out), true);
  assert.equal(verifyAdvancedCertificate(input, JSON.parse(JSON.stringify(out))), true);
  return out;
}
function solutions(input, expected, options) {
  const out = solved(input, options);
  assert.equal(out.answer.complete, true);
  assert.deepEqual([...out.answer.solutions].sort(), [...expected].sort());
  return out;
}
function sameExpression(a, b) {
  const A = rationalFunction(parseExpression(a)), B = rationalFunction(parseExpression(b));
  assert(pEqual(pMul(A.num, B.den), pMul(B.num, A.den)), `${a} != ${b}`);
}

const absCases = [
  ['abs(2x-1)<5', '(-2, 3)'], ['abs(2x-1)<=5', '[-2, 3]'],
  ['abs(2x-1)>5', '(-∞, -2) ∪ (3, ∞)'], ['abs(2x-1)>=5', '(-∞, -2] ∪ [3, ∞)'],
  ['3-2abs(x+1)<-5', '(-∞, -5) ∪ (3, ∞)'], ['5>=2abs(3-x)+1', '[1, 5]'],
  ['abs(-2x+1)<=3/2', '[-1/4, 5/4]'], ['abs(x)<-2', '∅'], ['abs(x)<=-2', '∅'],
  ['abs(x)>-2', '(-∞, ∞)'], ['abs(x)>=-2', '(-∞, ∞)'],
  ['abs(x)<0', '∅'], ['abs(x)<=0', '{0}'], ['abs(x)>0', '(-∞, 0) ∪ (0, ∞)'],
  ['abs(x)>=0', '(-∞, ∞)'], ['abs(0x+3)>2', '(-∞, ∞)'], ['abs(0x+3)<2', '∅'],
];
for (const [input, expected] of absCases) test(`absolute-value intervals: ${input}`, () => {
  const out = solved(input);
  assert.equal(out.topic, 'absolute_value_inequality');
  assert.equal(out.answer.solutionSet, expected);
});

test('rational equations retain canceled holes and certify exact irrational roots', () => {
  const cases = [
    ['x+1=2', ['1']],
    ['x^3-3x^2+2x=0', ['0', '1', '2']],
    ['(x^2-2)(x^2+x-1)=0', ['(-1/2 - sqrt(5/4))', '-sqrt(2)', '(-1/2 + sqrt(5/4))', 'sqrt(2)']],
    ['(x^2-2)^12=0', ['-sqrt(2)', 'sqrt(2)']],
    ['1/(x^2-2)=1', ['-sqrt(3)', 'sqrt(3)']],
    ['(x^2-2)/(x^2-3)=0', ['-sqrt(2)', 'sqrt(2)']],
    ['(x^2-1)/(x-1)=2', []],
  ];
  for (const [input, expected] of cases) {
    const out = solutions(input, expected);
    assert.equal(out.topic, 'rational_equation');
  }
  const identity = solved('(x^2-2)/(x^2-2)=1');
  assert.equal(identity.answer.identity, true);
  assert.equal(identity.answer.solutionSet, 'All real numbers except {-sqrt(2), sqrt(2)}');
  assert(identity.restrictions.includes('x^2 - 2 != 0'));
  const product = solved('(x^2-2)(x^2+x-1)=0');
  assert.equal(product.steps[0].rule, 'exact_zero_product');
  assert.equal(product.certificate.evidence.factors.length, 2);
  const forged = structuredClone(identity);
  forged.answer.solutionSet = 'All real numbers';
  assert.equal(verifyAdvancedCertificate('(x^2-2)/(x^2-2)=1', forged), false);
});

test('rational sign charts order unlike quadratic radicals and preserve poles and holes', () => {
  const cases = [
    ['x^2-2<0', '(-sqrt(2), sqrt(2))'],
    ['x^2-2>=0', '(-∞, -sqrt(2)] ∪ [sqrt(2), ∞)'],
    ['(x^2-2)/(x^2-3)>0', '(-∞, -sqrt(3)) ∪ (-sqrt(2), sqrt(2)) ∪ (sqrt(3), ∞)'],
    ['(x^2-2)/(x^2-3)>=0', '(-∞, -sqrt(3)) ∪ [-sqrt(2), sqrt(2)] ∪ (sqrt(3), ∞)'],
    ['(x^2-2x-1)/(x^2-3)>0', '(-∞, -sqrt(3)) ∪ ((1 - sqrt(2)), sqrt(3)) ∪ ((1 + sqrt(2)), ∞)'],
    ['(x-1)/(x^2-2)<=0', '(-∞, -sqrt(2)) ∪ [1, sqrt(2))'],
    ['(x^2-1)/(x-1)>0', '(-1, 1) ∪ (1, ∞)'],
    ['x/x>0', '(-∞, 0) ∪ (0, ∞)'],
    ['x^2>=0', '(-∞, ∞)'],
    ['-x^2>=0', '{0}'],
    ['0/(x^2-2)>=0', '(-∞, -sqrt(2)) ∪ (-sqrt(2), sqrt(2)) ∪ (sqrt(2), ∞)'],
    ['(x^2-2)/(x^2-2)>=0', '(-∞, -sqrt(2)) ∪ (-sqrt(2), sqrt(2)) ∪ (sqrt(2), ∞)'],
    ['(x^2-2)/(x^2-3)!=0', '(-∞, -sqrt(3)) ∪ (-sqrt(3), -sqrt(2)) ∪ (-sqrt(2), sqrt(2)) ∪ (sqrt(2), sqrt(3)) ∪ (sqrt(3), ∞)'],
  ];
  for (const [input, expected] of cases) {
    const out = solved(input);
    assert.equal(out.topic, 'rational_inequality');
    assert.equal(out.answer.solutionSet, expected);
    assert.equal(out.answer.complete, true);
  }
  const input = '(x^2-2)/(x^2-3)>0', out = solved(input), forged = structuredClone(out);
  forged.certificate.evidence.regionSigns[1] *= -1;
  assert.equal(verifyAdvancedCertificate(input, forged), false);
  assert(['unsupported', 'unresolved'].includes(solveAdvanced('x^4-2<0').status));
});

test('absolute-value affine families keep exact fractional endpoints and renamed variables', () => {
  for (const a of [-5, -2, 1, 3]) for (const b of [-3, 0, 4]) {
    const out = solved(`2abs(${a}t+(${b}))+1<=7`, { variable: 't' });
    const [lo, hi] = [(-3 - b) / a, (3 - b) / a].sort((x, y) => x - y);
    // Test expectations are rational strings, never used to prove the result.
    assert.equal(Number(evalFraction(out.answer.intervals[0].low)), lo || 0);
    assert.equal(Number(evalFraction(out.answer.intervals[0].high)), hi || 0);
  }
});
function evalFraction(text) { const [a, b = '1'] = text.split('/'); return Number(a) / Number(b); }

test('quartic substitution includes irrational and nested radical solutions', () => {
  solutions('x^4-2=0', ['-sqrt(sqrt(2))', 'sqrt(sqrt(2))']);
  solutions('2t^4-10t^2+8=0', ['-2', '-1', '1', '2'], { variable: 't' });
  solutions('x^4+x^2-2=0', ['-1', '1']);
  solutions('x^4+2x^2+1=0', []);
  solutions('x^4=0', ['0']);
  solutions('(x^2-2)^2=0', ['-sqrt(2)', 'sqrt(2)']);
  const out = solved('x^4-3x^2+1=0');
  assert.equal(out.answer.solutions.length, 4);
  assert(out.answer.solutions.every(s => s.includes('sqrt(')));
  assert.equal(out.certificate.evidence.excluded.length, 0);
});

const powerCases = [
  ['root(x,3)=-2', ['-8']], ['root(2x+3,3)=2', ['5/2']],
  ['root(x-1,3)^2=4', ['-7', '9']], ['cbrt(x-1)^2=4', ['-7', '9']],
  ['root(x,17)^2=4', ['-131072', '131072']],
  ['2root(x-1,3)+5=1', ['-7']], ['root(x,4)=2', ['16']],
  ['root(x,4)=-2', []], ['x^(2/3)=4', ['-8', '8']],
  ['x^(2/3)=-4', []], ['x^(-2/3)=4', ['-1/8', '1/8']],
  ['x^(-1/3)=-2', ['-1/8']], ['x^(-1/2)=2', ['1/4']], ['x^(-1/2)=0', []],
  ['x^(3/2)=2', ['root(4, 3)']], ['x^(3/2)=-2', []],
  ['x^(3/5)=-2', ['root(-32, 3)']], ['x^(4/3)=16', ['8', '-(8)']],
  ['root(x,6)^2=2', ['8']], ['root(x,6)^3=-2', []],
  ['root(x,3)^4=0', ['0']], ['root(x^2+1,3)=2', ['-sqrt(7)', 'sqrt(7)']],
];
for (const [input, expected] of powerCases) test(`real rational power branches: ${input}`, () => {
  solutions(input, expected);
});

test('rational powers retain the original even-root domain after exponent reduction', () => {
  const out = solutions('root(x,6)^2=2', ['8']);
  assert(out.restrictions.some(s => s === 'x >= 0'));
  const negative = solutions('x^(-2/3)=4', ['-1/8', '1/8']);
  assert(negative.restrictions.includes('x != 0'));
});

test('polynomial substitution in a repeated root atom handles multiple powers and mixed original variables', () => {
  solutions('cbrt(x)^2+cbrt(x)-2=0', ['-8', '1']);
  solutions('x^(2/3)+x^(1/3)-2=0', ['-8', '1']);
  solutions('cbrt(x)^2+x=0', ['-1', '0']);
  solutions('root(x,3)^2-root(x,3)-1=0', ['(2 - sqrt(5))', '(2 + sqrt(5))']);
  solutions('root(2t+1,3)^2+root(2t+1,3)-2=0', ['-9/2', '0'], { variable: 't' });
  const even = solutions('root(x-1,4)^2+root(x-1,4)-2=0', ['2']);
  assert.equal(even.topic, 'root_polynomial_equation');
  assert.deepEqual(even.certificate.evidence.excluded, ['-2']);
  assert(even.restrictions.includes('x - 1 >= 0'));
  const forged = structuredClone(even);
  forged.answer.solutions.push('17'); forged.certificate.evidence.excluded = [];
  assert.equal(verifyAdvancedCertificate('root(x-1,4)^2+root(x-1,4)-2=0', forged), false);
});

test('equal-base exponentials use injectivity and support polynomial exponents', () => {
  solutions('2^(2x+1)=2^(x+4)', ['3']);
  solutions('(1/2)^(x^2)=(1/2)^(2x)', ['0', '2']);
  solutions('exp(x^2)=exp(2x)', ['0', '2']);
  solutions('e^(x+2)=exp(3x)', ['1']);
  solutions('3^(x^2+1)=3^(x^2)', []);
  const out = solved('2^(2x)=2^(x+x)');
  assert.equal(out.answer.identity, true);
  solutions('2^(x^2)=2^(2)', ['-sqrt(2)', 'sqrt(2)']);
});

const logCases = [
  ['log(x-1,2)=log(3-x,2)', ['2']],
  ['log(x)=log(x^2-2)', ['2']],
  ['ln(x)=ln(x^2-1)', ['(1/2 + sqrt(5/4))']],
  ['log(x,2)+log(x-2,2)=3', ['4']],
  ['log(x)+log(x-9)=1', ['10']],
  ['log(x,2)-log(x-1,2)=1', ['2']],
  ['2log(x,2)+log(x-1,2)=2', ['2']],
  ['log(x,2)/2+log(x-1,2)/2=1', ['(1/2 + sqrt(17/4))']],
  ['log(x,1/2)+log(x-2,1/2)=-3', ['4']],
  ['ln(x)+ln(x-1)=0', ['(1/2 + sqrt(5/4))']],
  ['log(x-1)=log(-x)', []],
  ['log(x)+log(-x)=log(x^2)', []],
];
for (const [input, expected] of logCases) test(`logarithm laws and positivity: ${input}`, () => { solutions(input, expected); });

test('logarithm reports explicitly filter a negative product-law root', () => {
  const out = solutions('log(x,2)+log(x-2,2)=3', ['4']);
  assert(out.restrictions.includes('x > 0'));
  assert(out.restrictions.includes('x - 2 > 0'));
  assert.deepEqual(out.certificate.evidence.excluded, ['-2']);
  assert.equal(out.steps.at(-1).rule, 'filter_original_logarithm_domain');
});

test('irrational positivity decisions remain exact across extremely close rational bounds', () => {
  const low = '1.6180339887498948482045868343656381177203091798057628621354';
  const high = '1.6180339887498948482045868343656381177203091798057628621355';
  assert.equal(Q(low).mul(low).sub(low).sub(1).cmp(0), -1);
  assert.equal(Q(high).mul(high).sub(high).sub(1).cmp(0), 1);
  solutions(`ln(x-(${low}))=ln(x^2-1-(${low}))`, ['(1/2 + sqrt(5/4))']);
  solutions(`ln(x-(${high}))=ln(x^2-1-(${high}))`, []);
});

const radicalCases = [
  ['sqrt(2x+3)=x+1', ['sqrt(2)']], ['sqrt(2x+3)=-x-1', ['-sqrt(2)']],
  ['2sqrt(x+5)+1=2x-1', ['4']], ['sqrt(x+5)=x-1', ['4']],
  ['sqrt(x^2+2)=x', []], ['sqrt(x^2)=x-1', []], ['sqrt(x)=-1', []],
  ['sqrt(2x+1)=3', ['4']], ['3-2sqrt(x+2)=x', ['(5 - sqrt(24))']],
];
for (const [input, expected] of radicalCases) test(`radical candidates: ${input}`, () => { solutions(input, expected); });

test('irrational radical candidates require exact sign filtering', () => {
  const out = solutions('sqrt(2x+3)=x+1', ['sqrt(2)']);
  assert.deepEqual(out.certificate.evidence.excluded, ['-sqrt(2)']);
  assert(out.restrictions.includes('x + 1 >= 0'));
});

test('polynomial division checks the identity and strict remainder bound', () => {
  const cases = [
    ['2x^3+x^2-1', 'x-1', '2x^2+3x+3', '2'],
    ['x^2-1', 'x-1', 'x+1', '0'], ['x+1', 'x^2+1', '0', 'x+1'],
    ['x^2/2+1/3', '2x+1', 'x/4-1/8', '11/24'], ['0', 'x+1', '0', '0'],
    ['3t^2+6t', '3', 't^2+2t', '0', 't'],
  ];
  for (const [dividend, divisor, quotient, remainder, variable = 'x'] of cases) {
    const out = solved({ kind: 'polynomial_division', dividend, divisor, variable });
    sameExpression(out.answer.quotient, quotient); sameExpression(out.answer.remainder, remainder);
  }
});

test('function composition preserves inner poles and canceled outer preimages', () => {
  const out = solved({ kind: 'function_operation', operation: 'compose', f: '1/(x-1)', g: '(x+1)/(x-2)' });
  sameExpression(out.answer.expression, '(x-2)/3');
  assert(out.restrictions.includes('x - 2 != 0'));
  assert(out.restrictions.some(r => r.includes('(x + 1)/(x - 2) - 1')));
  const hole = solved({ kind: 'function_operation', operation: 'compose', f: '(x^2-1)/(x-1)', g: 'x+2' });
  sameExpression(hole.answer.expression, 'x+3');
  assert(hole.restrictions.some(r => r.includes('x + 2 - 1 != 0')));
  sameExpression(solved({ kind: 'function_operation', operation: 'compose', f: 'f(t)=2t+1', g: 'g(t)=t^2', variable: 't' }).answer.expression, '2t^2+1');
});

test('linear fractional inverses verify both identities and keep original holes', () => {
  for (const [f, inverse] of [['2x+3', '(x-3)/2'], ['(2x+1)/(x-3)', '(3x+1)/(x-2)'], ['(x^2-1)/(x-1)', 'x-1']]) {
    const out = solved({ kind: 'function_operation', operation: 'inverse', f });
    sameExpression(out.answer.expression, inverse);
    assert.equal(out.certificate.evidence.compositions.length, 2);
    if (f.includes('x^2')) assert(out.restrictions.some(r => r.includes('!= 0')));
  }
});

test('function evaluation is exact and excludes original canceled holes', () => {
  assert.equal(solved({ kind: 'function_operation', operation: 'evaluate', f: '(2x+1)/(x-3)', value: '1/2' }).answer.value, '-4/5');
  assert.equal(solved({ kind: 'function_operation', operation: 'evaluate', f: 't^2+1/3', value: '-2/3', variable: 't' }).answer.value, '7/9');
  const bad = solveAdvanced({ kind: 'function_operation', operation: 'evaluate', f: '(x^2-1)/(x-1)', value: '1' });
  assert.equal(bad.status, 'invalid'); assert.equal(bad.verified, false);
});

test('linear/quadratic systems return every finite solution including tangent and empty fibers', () => {
  const cases = [
    [['x+y=3', 'x^2+y^2=5'], [{ x: '1', y: '2' }, { x: '2', y: '1' }]],
    [['x+y=2', 'x^2+y^2=2'], [{ x: '1', y: '1' }]],
    [['x+y=0', 'x^2+y^2=4'], [{ x: '-sqrt(2)', y: 'sqrt(2)' }, { x: 'sqrt(2)', y: '-sqrt(2)' }]],
    [['x+y=0', 'x^2+y^2=-1'], []], [['x=0', 'xy=1'], []],
    [['2t-u=1', 'u=t^2'], [{ t: '1', u: '1' }], ['t', 'u']],
  ];
  for (const [equations, expected, variables] of cases) {
    const out = solved({ kind: 'system', equations, ...(variables ? { variables } : {}) });
    assert.deepEqual(out.answer.solutions, expected);
  }
});

test('two quadratics use complete elimination, back substitution, and exact original residuals', () => {
  const hyperbola = solved({ kind: 'system', equations: ['x^2+y^2=5', 'xy=2'] });
  assert.deepEqual(hyperbola.answer.solutions, [{ x: '-2', y: '-1' }, { x: '-1', y: '-2' }, { x: '1', y: '2' }, { x: '2', y: '1' }]);
  const independent = solved({ kind: 'system', equations: ['x^2+y^2=5', 'x^2-y^2=1'] });
  assert.equal(independent.answer.solutions.length, 4);
  assert(independent.answer.solutions.every(s => s.x.includes('sqrt(3)') && s.y.includes('sqrt(2)')));
  const zeroLeading = solved({ kind: 'system', equations: ['xy=0', 'y^2+x=0'] });
  assert.deepEqual(zeroLeading.answer.solutions, [{ x: '0', y: '0' }]);
  const splitFiber = solved({ kind: 'system', equations: ['xy=0', 'x^2+y^2=1'] });
  assert.deepEqual(splitFiber.answer.solutions, [{ x: '-1', y: '0' }, { x: '0', y: '-1' }, { x: '0', y: '1' }, { x: '1', y: '0' }]);
  const inconsistent = solved({ kind: 'system', equations: ['x^2+y^2=1', 'x^2+y^2=2'] });
  assert.equal(inconsistent.answer.type, 'inconsistent');
});

test('circle/parabola intersections retain nested radicals and repeated resultant factors', () => {
  const equations = ['x^2+y^2=25', 'x^2-y=0'];
  const out = solved({ kind: 'system', equations });
  assert.deepEqual(out.answer.solutions, [
    { x: '-sqrt((-1/2 + sqrt(101/4)))', y: '(-1/2 + sqrt(101/4))' },
    { x: 'sqrt((-1/2 + sqrt(101/4)))', y: '(-1/2 + sqrt(101/4))' },
  ]);
  const rotated = solved({ kind: 'system', equations: ['y^2+x^2=1', 'y^2-x=0'] });
  assert.equal(rotated.answer.solutions.length, 2);
  assert(rotated.answer.solutions.every(s => s.y.includes('sqrt((')));
});

test('certificate replay binds all visible fields, branch exclusions, and subproofs', () => {
  const inputs = ['abs(2x-1)<=5', 'x^4-2=0', 'root(x,3)=-2', 'sqrt(2x+3)=x+1',
    'cbrt(x)^2+cbrt(x)-2=0',
    'log(x,2)+log(x-2,2)=3', { kind: 'system', equations: ['x^2+y^2=5', 'xy=2'] },
    { kind: 'system', equations: ['x^2+y^2=25', 'y=x^2'] },
    { kind: 'function_operation', operation: 'inverse', f: '(x^2-1)/(x-1)' }];
  for (const input of inputs) {
    const original = solved(input);
    const changes = [
      r => { r.answer = {}; }, r => { r.topic = 'linear_equation'; },
      r => { r.steps[0].after = 'x = 100'; }, r => { r.steps[0].explanation = 'Trust me'; },
      r => { r.steps[0].rule = 'identity'; }, r => { r.steps[0].verified = false; },
      r => { r.restrictions.push('x > 100'); }, r => { r.steps.pop(); },
      r => { r.certificate.evidence = {}; }, r => { r.certificate.source = 'x=100'; },
      r => { r.certificate.version = 9; }, r => { r.verified = false; },
      r => { r.certificate.options.domain = 'complex'; },
      r => { r.unchecked = true; }, r => { r.status = 'unsupported'; },
    ];
    for (const mutate of changes) {
      const forged = structuredClone(original); mutate(forged);
      assert.equal(verifyAdvancedCertificate(input, forged), false, `${JSON.stringify(input)} accepted ${mutate}`);
    }
    assert.equal(verifyAdvancedCertificate('x^4-3=0', original), false);
  }
  const input = 'log(x,2)+log(x-2,2)=3', out = solved(input);
  const badDomain = structuredClone(out); badDomain.restrictions = [];
  assert.equal(verifyAdvancedCertificate(input, badDomain), false);
  const badRoot = structuredClone(out); badRoot.answer.solutions.push('-2'); badRoot.certificate.evidence.excluded = [];
  assert.equal(verifyAdvancedCertificate(input, badRoot), false);
  const system = '2log(x,2)+log(x-1,2)=2', child = solved(system);
  assert(child.certificate.evidence.children.length);
  child.certificate.evidence.children[0].coefficients[0] = '999';
  assert.equal(verifyAdvancedCertificate(system, child), false);
});

test('source is preserved exactly and structured certificates cannot alias caller data', () => {
  const text = '  |2x − 1| ≤ 5  ', out = solved(text);
  assert.equal(out.steps[0].before, text);
  const input = { kind: 'system', equations: ['x+y=3', 'x^2+y^2=5'] }, r = solved(input);
  input.equations[0] = 'x+y=100';
  assert.equal(r.certificate.source.equations[0], 'x+y=3');
  assert.equal(verifyAdvancedCertificate(input, r), false);
});

test('invalid inputs and impossible intrinsic domains never acquire verified certificates', () => {
  for (const input of [null, '', 'x==2', 'root(x,3,4)=1', 'root(x,3)=1@garbage',
    'root(x,2.5)=1', 'root(x,3=2', 'log(x,1)=2', 'log(x,-2)=1', 'log(-1)=log(x)',
    'log(x-x)=1', 'sqrt(-1)=x',
    { kind: 'polynomial_division', dividend: 'x+1', divisor: 'x-x' },
    { kind: 'function_operation', operation: 'bogus', f: 'x' },
    { kind: 'function_operation', operation: 'evaluate', f: 'x', value: 0.1 },
    { kind: 'system', equations: ['x+y=1', 'x^2+y^2>1'] }]) {
    const out = solveAdvanced(input);
    assert.equal(out.status, 'invalid', `${JSON.stringify(input)}: ${out.error}`);
    assert.equal(out.verified, false); assert.equal(verifyAdvancedCertificate(input, out), false);
  }
});

test('unsupported families, parameters, and unresolved eliminations remain honest fallbacks', () => {
  const inputs = ['sin(x)=0', 'abs(x)+abs(x-1)<2', 'abs(x^2)<2',
    'x^4+x-2=0', 'sqrt(x)+sqrt(x+1)=3', '2^x=3^x', 'log(x,2)=log(x,3)',
    'root(x,3)+root(x+1,3)=2', 'a*x^4-2=0',
    { kind: 'polynomial_division', dividend: '(x^2-1)/(x-1)', divisor: 'x+1' },
    { kind: 'polynomial_division', dividend: 'ax^2', divisor: 'x' },
    { kind: 'function_operation', operation: 'inverse', f: 'x^2' },
    { kind: 'function_operation', operation: 'inverse', f: '2' },
    { kind: 'function_operation', operation: 'compose', f: 'x+a', g: 'x' },
    { kind: 'system', equations: ['x^2+y^2=1', '2x^2+2y^2=2'] },
    { kind: 'system', equations: ['xy=0', 'x^2=0'] },
    { kind: 'system', equations: ['x^2+y^2=1', 'xy+a=0'], variables: ['x', 'y'] },
    'sqrt(x+2)=x^2+x'];
  for (const input of inputs) {
    const out = solveAdvanced(input);
    assert(['unsupported', 'unresolved'].includes(out.status), `${JSON.stringify(input)}: ${out.status}: ${out.error}`);
    assert.equal(out.verified, false); assert.equal(out.answer, null);
    assert.equal(verifyAdvancedCertificate(input, out), false);
  }
  assert.equal(solveAdvanced('x^4-2=0', { domain: 'complex' }).status, 'unsupported');
  assert.equal(solveAdvanced('x^4-2=0', { domain: 'bogus' }).status, 'invalid');
  assert.equal(solveAdvanced('x^4-2=0', { variable: 't' }).status, 'unsupported');
  assert.equal(solveAdvanced('x^4-2=0', { variable: '__proto__' }).status, 'invalid');
  assert.equal(solveAdvanced('x^4-2=0', null).status, 'invalid');
  const operation = { kind: 'function_operation', operation: 'evaluate', f: 't^2', value: '2' };
  assert.equal(solved(operation, { variable: 't' }).answer.value, '4');
  assert.equal(solveAdvanced({ ...operation, variable: 't' }, { variable: 'x' }).status, 'unsupported');
  assert.equal(verifyAdvancedCertificate('x^4-2=0', null), false);
});
