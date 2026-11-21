import test from 'node:test';
import assert from 'node:assert/strict';
import { Q } from '../engine/core.js';
import { solvePiecewise, verifyPiecewiseCertificate } from '../engine/piecewise.js';

const problem = (pieces, extra = {}) => ({ kind: 'piecewise', variable: 'x', pieces, ...extra });
const piece = (expression, condition) => ({ expression, condition });
function checked(input) {
  const result = solvePiecewise(input);
  assert.equal(result.status, 'solved', result.error);
  assert.equal(result.verified, true);
  assert.equal(result.answer.complete, true);
  assert.equal(result.certificate.type, 'piecewise');
  assert(result.steps.every(s => s.verified && s.before && s.after && s.rule && s.explanation));
  assert(verifyPiecewiseCertificate(input, result));
  assert(verifyPiecewiseCertificate(input, JSON.parse(JSON.stringify(result))));
  return result;
}

test('absolute value and step functions have exact domains, ranges, and boundary evaluation', () => {
  const absolute = checked(problem([piece('-x', 'x<0'), piece('x', 'x>=0')], { value: '0' }));
  assert.equal(absolute.answer.domain, '(-∞, ∞)');
  assert.equal(absolute.answer.range, '[0, ∞)');
  assert.deepEqual(absolute.answer.evaluation, { at: '0', defined: true, branch: 1, value: '0' });
  const step = checked(problem([piece('-1', 'x<0'), piece('0', 'x=0'), piece('1', 'x>0')], { value: '-2/3' }));
  assert.equal(step.answer.range, '{-1} ∪ {0} ∪ {1}');
  assert.equal(step.answer.evaluation.value, '-1');
  const heaviside = checked(problem([piece('0', 'x<0'), piece('1', 'otherwise')], { value: '0' }));
  assert.equal(heaviside.answer.range, '{0} ∪ {1}');
  assert.equal(heaviside.answer.evaluation.value, '1');
});

test('two-column cases may omit the variable and use otherwise or true as the remaining domain', () => {
  for (const fallback of ['otherwise', 'true']) {
    const input = { kind: 'piecewise', pieces: [piece('-x', 'x<0'), piece('x', fallback)], value: '0' };
    const result = checked(input);
    assert.equal(result.answer.variable, 'x');
    assert.equal(result.answer.domain, '(-∞, ∞)');
    assert.equal(result.answer.range, '[0, ∞)');
    assert.deepEqual(result.answer.pieces[1].conditionIntervals, [{ low: '-∞', high: '∞', lowClosed: false, highClosed: false }]);
    assert.equal(result.answer.pieces[1].domain, '[0, ∞)');
    assert.deepEqual(result.answer.evaluation, { at: '0', defined: true, branch: 1, value: '0' });
  }
});

const rangeCases = [
  ['5', '0<x<1', '(0, 1)', '{5}'], ['0', 'all', '(-∞, ∞)', '{0}'],
  ['2x+1', '-1<x<=2', '(-1, 2]', '(-1, 5]'],
  ['-2x+1', '-1<x<=2', '(-1, 2]', '[-3, 3)'],
  ['x/3-1/2', '0<=x<=3/2', '[0, 3/2]', '[-1/2, 0]'],
  ['-x+2', 'x>1', '(1, ∞)', '(-∞, 1)'],
  ['x^2', 'all', '(-∞, ∞)', '[0, ∞)'],
  ['x^2', '0<x<2', '(0, 2)', '(0, 4)'],
  ['x^2', '-2<=x<0', '[-2, 0)', '(0, 4]'],
  ['x^2', '-2<x<=0', '(-2, 0]', '[0, 4)'],
  ['x^2', '-1<x<1', '(-1, 1)', '[0, 1)'],
  ['x^2', 'x!=0', '(-∞, 0) ∪ (0, ∞)', '(0, ∞)'],
  ['-2x^2+4x+1', 'x<1', '(-∞, 1)', '(-∞, 3)'],
  ['-2x^2+4x+1', '1<=x<3', '[1, 3)', '(-5, 3]'],
  ['-2x^2+4x+1', '1<x<=3', '(1, 3]', '[-5, 3)'],
  ['-2x^2+4x+1', '0<=x<=2', '[0, 2]', '[1, 3]'],
  ['-x^2-2', 'all', '(-∞, ∞)', '(-∞, -2]'],
  ['3x^2-2x+1', '0<x<2/3', '(0, 2/3)', '[2/3, 1)'],
  ['3x^2-2x+1', '0<x<=2/3', '(0, 2/3]', '[2/3, 1]'],
  ['3x^2-2x+1', 'x!=1/3', '(-∞, 1/3) ∪ (1/3, ∞)', '(2/3, ∞)'],
  ['x^2+2x', 'x=-1', '{-1}', '{-1}'],
  ['x^2', 'x<0 or x>1', '(-∞, 0) ∪ (1, ∞)', '(0, ∞)'],
];
for (const [expression, condition, domain, range] of rangeCases) test(`exact branch image: ${expression} on ${condition}`, () => {
  const result = checked(problem([piece(expression, condition)]));
  assert.equal(result.answer.domain, domain);
  assert.equal(result.answer.range, range);
  assert.equal(result.answer.pieces[0].domain, domain);
  assert.equal(result.answer.pieces[0].range, range);
});

test('affine images retain all strict/inclusive endpoint combinations for both slope signs', () => {
  for (const leftClosed of [false, true]) for (const rightClosed of [false, true]) for (const slope of [-3, 2]) {
    const condition = `-1 ${leftClosed ? '<=' : '<'} x ${rightClosed ? '<=' : '<'} 2`;
    const result = checked(problem([piece(`${slope}x+1`, condition)]));
    const image = result.answer.rangeIntervals[0];
    assert.deepEqual(image, slope > 0 ? { low: '-1', high: '5', lowClosed: leftClosed, highClosed: rightClosed } : { low: '-5', high: '4', lowClosed: rightClosed, highClosed: leftClosed });
  }
});

test('first-match semantics remove overlaps including owned endpoints and singleton cuts', () => {
  const input = problem([piece('10', '0<x<1'), piece('20', '0<=x<=1'), piece('x', 'otherwise')]);
  const result = checked(input);
  assert.equal(result.answer.pieces[0].domain, '(0, 1)');
  assert.equal(result.answer.pieces[1].domain, '{0} ∪ {1}');
  assert.equal(result.answer.pieces[2].domain, '(-∞, 0) ∪ (1, ∞)');
  assert.equal(result.answer.domain, '(-∞, ∞)');
  assert.equal(result.answer.range, '(-∞, 0) ∪ (1, ∞)');
  assert.deepEqual(checked({ ...input, value: '0' }).answer.evaluation, { at: '0', defined: true, branch: 1, value: '20' });
  assert.equal(checked({ ...input, value: '1/2' }).answer.evaluation.value, '10');
  const shared = checked(problem([piece('7', 'x<=0'), piece('x^2', 'x>=0')], { value: '0' }));
  assert.equal(shared.answer.range, '(0, ∞)');
  assert.equal(shared.answer.pieces[1].domain, '(0, ∞)');
  assert.equal(shared.answer.evaluation.value, '7');
});

test('an earlier point branch can remove a quadratic minimum or fill a range hole', () => {
  const missing = checked(problem([piece('-1', 'x=0'), piece('x^2', 'else')]));
  assert.equal(missing.answer.range, '{-1} ∪ (0, ∞)');
  const filled = checked(problem([piece('0', 'x=0'), piece('x^2', 'else')]));
  assert.equal(filled.answer.range, '[0, ∞)');
  const shadowed = checked(problem([piece('2', 'all'), piece('x^2', 'all')]));
  assert.equal(shadowed.answer.pieces[1].domain, '∅');
  assert.equal(shadowed.answer.pieces[1].range, '∅');
  assert.equal(shadowed.answer.range, '{2}');
});

test('holes, jumps, empty conditions, and no pieces are valid functions', () => {
  const hole = checked(problem([piece('x', 'x<0'), piece('x+1', 'x>0')], { value: '0' }));
  assert.equal(hole.answer.domain, '(-∞, 0) ∪ (0, ∞)');
  assert.equal(hole.answer.range, '(-∞, 0) ∪ (1, ∞)');
  assert.deepEqual(hole.answer.evaluation, { at: '0', defined: false, branch: null, value: null });
  const empty = checked(problem([piece('x^2', 'x>2 and x<1'), piece('3', 'false')]));
  assert.equal(empty.answer.domain, '∅'); assert.equal(empty.answer.range, '∅');
  assert(empty.steps.some(s => s.rule === 'empty_piece_image'));
  const noPieces = checked(problem([], { value: '3' }));
  assert.equal(noPieces.answer.domain, '∅'); assert.equal(noPieces.answer.range, '∅');
  assert.equal(noPieces.answer.evaluation.defined, false);
});

test('compound, rational, equality, and quadratic conditions keep exact domains and canceled holes', () => {
  const cases = [
    ['x<0 or x>2 and x<3', '(-∞, 0) ∪ (2, 3)'],
    ['-2≤x≤2 and x!=0', '[-2, 0) ∪ (0, 2]'],
    ['x^2<=4', '[-2, 2]'], ['x^2>4', '(-∞, -2) ∪ (2, ∞)'],
    ['(x-1)^2<=0', '{1}'], ['x^2+1>0', '(-∞, ∞)'],
    ['1/(x-1)>0', '(1, ∞)'], ['(x^2-1)/(x-1)>=0', '[-1, 1) ∪ (1, ∞)'],
    ['x/x>0', '(-∞, 0) ∪ (0, ∞)'], ['x/x!=1', '∅'],
    ['1/(x-1)^2>0', '(-∞, 1) ∪ (1, ∞)'],
    ['(x-1)^2>=0', '(-∞, ∞)'], ['(x-1)^2<0', '∅'],
    ['x=x', '(-∞, ∞)'], ['x!=x', '∅'], ['0<=x=1', '{1}'],
    ['(x+1)<2', '(-∞, 1)'], ['1<2', '(-∞, ∞)'], ['1>2', '∅'],
  ];
  for (const [condition, expected] of cases) assert.equal(checked(problem([piece('x', condition)])).answer.domain, expected, condition);
  const renamed = checked(problem([piece('2t+1/3', '1<2 and -1/3<=t<=1/2')], { variable: 't', value: Q('1/6') }));
  assert.equal(renamed.answer.evaluation.value, '2/3');
  assert.equal(renamed.answer.range, '[-1/3, 4/3]');
});

test('large nearby rational endpoints and condition roots are ordered without floating-point comparisons', () => {
  const a = Q('1000000000000000000000000000000'), b = a.add(1);
  const quadratic = checked(problem([piece('x^2', `${a}<x<${b}`)]));
  assert.equal(quadratic.answer.range, `(${a.pow(2)}, ${b.pow(2)})`);
  const condition = `((x-(${a}))*(x-(${b})))>0`;
  assert.equal(checked(problem([piece('x', condition)])).answer.domain, `(-∞, ${a}) ∪ (${b}, ∞)`);
  const small = checked(problem([piece('x', '1/100000000000000000000<x<2/100000000000000000000')]));
  assert.equal(small.answer.domain, '(1/100000000000000000000, 1/50000000000000000000)');
});

test('evaluation uses exact rationals, accepts Q points, and distinguishes absence from undefined', () => {
  const pieces = [piece('3x^2-2x+1/7', 'x>=0'), piece('-x', 'x<0')];
  assert.equal(checked(problem(pieces, { value: '1/3' })).answer.evaluation.value, '-4/21');
  assert.equal(checked(problem(pieces, { value: Q('-2/3') })).answer.evaluation.value, '2/3');
  assert.equal(checked(problem(pieces, { value: 2n })).answer.evaluation.value, '57/7');
  assert.equal(Object.hasOwn(checked(problem(pieces)).answer, 'evaluation'), false);
});

test('replay checks the complete report, first-match order, source, and domain/range evidence', () => {
  const input = problem([piece('-1', 'x=0'), piece('3x^2-2x+1', 'otherwise')], { value: '1/3' });
  const original = checked(input);
  const mutations = [
    r => { r.answer.domain = 'all'; }, r => { r.answer.range = 'all'; },
    r => { r.answer.domainIntervals[0].highClosed = !r.answer.domainIntervals[0].highClosed; },
    r => { r.answer.rangeIntervals[0].low = '100'; },
    r => { r.answer.pieces[1].domainIntervals = r.answer.pieces[1].conditionIntervals; },
    r => { r.answer.pieces[1].condition = 'false'; }, r => { r.answer.evaluation.value = '9'; },
    r => { r.answer.evaluation.branch = 0; }, r => { r.answer.semantics = 'last-match'; },
    r => { r.certificate.branches[1].coefficients[0] = '100'; },
    r => { r.certificate.branches[1].vertex = '0'; },
    r => { r.certificate.branches[1].segments[0].range.lowClosed = !r.certificate.branches[1].segments[0].range.lowClosed; },
    r => { r.certificate.source.pieces.reverse(); }, r => { r.certificate.assurance = 'trust'; },
    r => { r.certificate.version = 2; }, r => { r.certificate.type = 'algebra'; },
    r => { r.steps[0].rule = 'identity'; }, r => { r.steps[0].explanation = 'Trust me'; },
    r => { r.steps[0].after = 'x=100'; }, r => { r.steps[0].verified = false; },
    r => { r.steps.pop(); }, r => { r.restrictions.push('x>0'); },
    r => { r.verified = false; }, r => { r.answer.complete = false; }, r => { r.unchecked = true; },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original); mutate(forged);
    assert.equal(verifyPiecewiseCertificate(input, forged), false, String(mutate));
  }
  assert.equal(verifyPiecewiseCertificate({ ...input, pieces: [...input.pieces].reverse() }, original), false);
  assert.equal(verifyPiecewiseCertificate(input, null), false);
  const copied = structuredClone(input); copied.pieces[0].expression = '-2';
  assert.equal(verifyPiecewiseCertificate(copied, original), false);
  assert.equal(original.certificate.source.pieces[0].expression, '-1');
});

test('unsupported functions, degrees, irrational endpoints, and parameters never become solved guesses', () => {
  for (const input of [
    problem([piece('abs(x)', 'all')]), problem([piece('sqrt(x)', 'x>=0')]),
    problem([piece('sin(x)', 'all')]), problem([piece('x^3', 'all')]),
    problem([piece('1/x', 'x!=0')]), problem([piece('(x^2-1)/(x-1)', 'x!=1')]),
    problem([piece('x', 'x^2<2')]), problem([piece('x', 'x<sqrt(2)')]),
    problem([piece('a*x', 'all')]), problem([piece('x', 'x<a')]),
    problem([piece('x', '(x<0 or x>1) and x<2')]),
    problem([piece('x', 'x^3<1')]), problem([piece('2', 'all'), piece('sin(x)', 'false')]),
    problem([piece('((x^32)^32)^32', 'all')]),
  ]) {
    const result = solvePiecewise(input);
    assert.equal(result.status, 'unsupported', `${JSON.stringify(input)}: ${result.error}`);
    assert.equal(result.verified, false); assert.equal(result.answer, null);
    assert.equal(verifyPiecewiseCertificate(input, result), false);
  }
});

test('invalid inputs and bounded work produce explicit unsolved reports', () => {
  for (const input of [null, '', {}, { kind: 'piecewise', pieces: null },
    problem([{}]), problem([piece('', 'all')]), problem([piece('x', '')]),
    problem([piece('x', 'x<')]), problem([piece('x', 'x==1')]),
    problem([piece('x', '1/0<x')]), problem([piece('1/0', 'all')]),
    problem([piece('x', 'all')], { value: 'sqrt(2)' }),
    problem([piece('x', 'all')], { value: 0.1 }),
    problem([piece('x', 'all')], { variable: '__proto__' }),
    problem([piece('x', 'all')], { variable: null }),
  ]) {
    const result = solvePiecewise(input);
    assert.equal(result.status, 'invalid', `${JSON.stringify(input)}: ${result.error}`);
    assert.equal(result.verified, false);
  }
  const tooMany = solvePiecewise(problem(Array.from({ length: 65 }, () => piece('1', 'all'))));
  assert.equal(tooMany.status, 'unresolved'); assert.equal(tooMany.verified, false);
  const clauses = Array.from({ length: 8 }, (_, i) => `x>${i}`).join(' and ');
  const comparisonBudget = solvePiecewise(problem(Array.from({ length: 33 }, () => piece('1', clauses))));
  assert.equal(comparisonBudget.status, 'unresolved'); assert.equal(comparisonBudget.verified, false);
});
