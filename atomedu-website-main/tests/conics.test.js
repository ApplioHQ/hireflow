import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Q, parseStatement, rationalFunction, pSub, pScale, pEqual, pEvaluate,
} from '../engine/core.js';
import { solveConic, verifyConicCertificate } from '../engine/conics.js';

const clone = value => JSON.parse(JSON.stringify(value));
const request = (equation, fields = {}) => ({ kind: 'conic', equation, ...fields });

function checked(equation, classification, fields = {}) {
  const input = request(equation, fields), result = solveConic(input);
  assert.equal(result.status, 'solved', `${equation}: ${result.error}`);
  assert.equal(result.verified, true); assert.equal(result.topic, 'conic');
  assert.equal(result.answer.classification, classification, equation);
  assert.equal(result.answer.exact, true);
  assert.equal(result.certificate.type, 'conic'); assert.equal(result.certificate.version, 1);
  assert.ok(result.steps.length >= 3);
  assert.ok(result.steps.every(s => s.verified === true && s.rule && s.explanation &&
    typeof s.before === 'string' && typeof s.after === 'string'));
  assert.ok(Array.isArray(result.restrictions));
  assert.equal(verifyConicCertificate(input, result), true);
  assert.equal(verifyConicCertificate(input, clone(result)), true, 'JSON transport preserves replay');
  assertStandardFormIdentity(input, result);
  return result;
}

function rejected(input, status = 'unsupported') {
  const result = solveConic(input);
  assert.equal(result.status, status, `${JSON.stringify(input)}: ${result.error}`);
  assert.equal(result.verified, false); assert.equal(result.topic, 'conic');
  assert.deepEqual(result.answer, {}); assert.ok(result.error);
  assert.equal(verifyConicCertificate(input, result), false);
}

function polynomial(ast) {
  const r = rationalFunction(ast);
  assert.ok([...r.den.keys()].every(key => key === ''));
  return pScale(r.num, Q(1).div(r.den.get('')));
}
function residual(equation) {
  const statement = parseStatement(equation);
  return pSub(polynomial(statement.left), polynomial(statement.right));
}
function assertStandardFormIdentity(input, result) {
  const original = residual(input.equation), standard = residual(result.answer.standardForm);
  assert.ok(pEqual(original, pScale(standard, result.certificate.evidence.standardFormMultiplier)),
    `Standard form changed the locus: ${input.equation}`);
  assert.equal(result.certificate.evidence.normalizedPolynomial, result.certificate.evidence.completedPolynomial);
}

test('circles return exact centers, radius squares, and rational or symbolic radii', () => {
  const circle = checked('x^2+y^2=25', 'circle').answer;
  assert.deepEqual(circle.center, ['0', '0']);
  assert.equal(circle.radiusSquared, '25'); assert.equal(circle.radius, '5');
  assert.equal(circle.standardForm, 'x^2 + y^2 = 25');
  assert.deepEqual(circle.foci, [['0', '0'], ['0', '0']]);
  const translated = checked('(x-1/3)^2+(y+2/5)^2=7/9', 'circle').answer;
  assert.deepEqual(translated.center, ['1/3', '-2/5']);
  assert.equal(translated.radiusSquared, '7/9'); assert.equal(translated.radius, 'sqrt(7/9)');
  const negative = checked('-3*(x-2)^2-3*(y+1)^2=-12', 'circle').answer;
  assert.deepEqual(negative.center, ['2', '-1']); assert.equal(negative.radius, '2');
  assert.equal(checked('x²+y²=9', 'circle').answer.radius, '3');
  assert.equal(checked('0.1x^2+0.1y^2=0.3', 'circle').answer.radiusSquared, '3');
  assert.equal(checked('x^2+y^2=(1e-200)^2', 'circle').answer.radius, String(Q('1e-200')));
});

test('ellipses distinguish horizontal and vertical major axes and exact foci', () => {
  const horizontal = checked('x^2/25+y^2/9=1', 'ellipse').answer;
  assert.deepEqual(horizontal.semiaxesSquared, ['25', '9']);
  assert.equal(horizontal.majorAxis, 'x'); assert.equal(horizontal.focalDistanceSquared, '16');
  assert.deepEqual(horizontal.foci, [['-4', '0'], ['4', '0']]);
  assert.deepEqual(horizontal.vertices, [['-5', '0'], ['5', '0']]);
  assert.deepEqual(horizontal.covertices, [['0', '-3'], ['0', '3']]);
  const vertical = checked('9x^2+4y^2-18x+16y-11=0', 'ellipse').answer;
  assert.deepEqual(vertical.center, ['1', '-2']); assert.equal(vertical.majorAxis, 'y');
  assert.equal(vertical.semiMajorSquared, '9'); assert.equal(vertical.semiMinorSquared, '4');
  assert.deepEqual(vertical.foci, [['1', '-2 - sqrt(5)'], ['1', '-2 + sqrt(5)']]);
  assert.equal(vertical.standardForm, '(x - 1)^2/(4) + (y + 2)^2/(9) = 1');
  const rational = checked('0.5x^2+2y^2=1', 'ellipse').answer;
  assert.deepEqual(rational.semiaxesSquared, ['2', '1/2']);
  assert.equal(rational.semiMajor, 'sqrt(2)'); assert.equal(rational.semiMinor, 'sqrt(1/2)');
  assert.deepEqual(checked('-9x^2-25y^2=-225', 'ellipse').answer.foci, horizontal.foci);
});

test('hyperbolas select the transverse axis using the normalized sign, including negative RHS', () => {
  const horizontal = checked('x^2/16-y^2/9=1', 'hyperbola').answer;
  assert.equal(horizontal.orientation, 'horizontal'); assert.equal(horizontal.transverseAxis, 'x');
  assert.equal(horizontal.transverseSemiAxisSquared, '16'); assert.equal(horizontal.conjugateSemiAxisSquared, '9');
  assert.equal(horizontal.focalDistanceSquared, '25');
  assert.deepEqual(horizontal.foci, [['-5', '0'], ['5', '0']]);
  assert.deepEqual(horizontal.vertices, [['-4', '0'], ['4', '0']]);
  assert.deepEqual(horizontal.asymptotes, ['y = (3/4)*(x)', 'y = (-3/4)*(x)']);
  const vertical = checked('4*(x-1)^2-9*(y+2)^2=-36', 'hyperbola').answer;
  assert.deepEqual(vertical.center, ['1', '-2']); assert.equal(vertical.orientation, 'vertical');
  assert.equal(vertical.transverseAxis, 'y');
  assert.deepEqual(vertical.foci, [['1', '-2 - sqrt(13)'], ['1', '-2 + sqrt(13)']]);
  assert.deepEqual(vertical.asymptotes, ['y + 2 = (2/3)*(x - 1)', 'y + 2 = (-2/3)*(x - 1)']);
  assert.equal(vertical.standardForm, '(y + 2)^2/(4) - (x - 1)^2/(9) = 1');
  const irrationalSlope = checked('x^2-2y^2=1', 'hyperbola').answer;
  assert.deepEqual(irrationalSlope.asymptotes, ['y = (sqrt(1/2))*(x)', 'y = (-sqrt(1/2))*(x)']);
});

test('all four parabola openings produce exact vertices, foci, signed parameters and directrices', () => {
  const cases = [
    ['x^2-4x-8y+12=0', 'up', ['2', '1'], '2', ['2', '3'], 'y = -1'],
    ['(x+3)^2=-12*(y-2)', 'down', ['-3', '2'], '-3', ['-3', '-1'], 'y = 5'],
    ['(y-1)^2=8*(x+2)', 'right', ['-2', '1'], '2', ['0', '1'], 'x = -4'],
    ['y^2+6y+12x-15=0', 'left', ['2', '-3'], '-3', ['-1', '-3'], 'x = 5'],
    ['3*(x-1/2)^2=2*(y+1/3)', 'up', ['1/2', '-1/3'], '1/6', ['1/2', '-1/6'], 'y = -1/2'],
    ['-2*(y-3)^2=5*(x+1)', 'left', ['-1', '3'], '-5/8', ['-13/8', '3'], 'x = -3/8'],
  ];
  for (const [equation, opening, vertex, p, focus, directrix] of cases) {
    const answer = checked(equation, 'parabola').answer;
    assert.equal(answer.opening, opening); assert.deepEqual(answer.vertex, vertex);
    assert.equal(answer.focalParameter, p); assert.deepEqual(answer.focus, focus);
    assert.deepEqual(answer.foci, [focus]); assert.equal(answer.directrix, directrix);
    assert.equal(answer.degenerate, false);
  }
});

test('parabola geometry satisfies the exact focus/directrix distance definition', () => {
  for (const axis of [0, 1]) for (const p of ['-3/2', '-1/6', '1/3', '2']) for (const scale of [-2, 3]) {
    const h = Q('2/5'), k = Q('-3/7'), parameter = Q(p), center = [h, k];
    const names = ['x', 'y'], squared = 1 - axis;
    const equation = `(${scale})*((${names[squared]}-(${center[squared]}))^2-(${parameter.mul(4)})*(${names[axis]}-(${center[axis]})))=0`;
    const answer = checked(equation, 'parabola').answer;
    assert.deepEqual(answer.vertex, center.map(String)); assert.equal(answer.focalParameter, p);
    const locusPoint = [...center], t = Q('2/3');
    locusPoint[squared] = locusPoint[squared].add(t);
    locusPoint[axis] = locusPoint[axis].add(t.mul(t).div(parameter.mul(4)));
    assert.ok(pEvaluate(residual(equation), { x: locusPoint[0], y: locusPoint[1] }).zero);
    const focusDistance = locusPoint.reduce((sum, coordinate, index) => {
      const difference = coordinate.sub(answer.focus[index]); return sum.add(difference.mul(difference));
    }, Q(0));
    const directrixCoordinate = Q(answer.directrix.split(' = ')[1]);
    const perpendicular = locusPoint[axis].sub(directrixCoordinate);
    assert.ok(focusDistance.eq(perpendicular.mul(perpendicular)));
  }
});

test('positive-definite zero loci are points, not ellipses with zero axes', () => {
  for (const equation of ['x^2+y^2=0', '4*(x-2)^2+9*(y+3)^2=0', '-4*(x-2)^2-9*(y+3)^2=0']) {
    const answer = checked(equation, 'point').answer;
    assert.equal(answer.degenerate, true); assert.equal(answer.realLocus, 'nonempty');
    assert.deepEqual(answer.point, answer.center);
    assert.ok(pEvaluate(residual(equation), { x: Q(answer.point[0]), y: Q(answer.point[1]) }).zero);
    assert.equal(answer.foci, undefined);
  }
  assert.deepEqual(checked('4*(x-2)^2+9*(y+3)^2=0', 'point').answer.point, ['2', '-3']);
});

test('zero-RHS indefinite forms are intersecting real lines through the translated center', () => {
  const answer = checked('(x-2)^2-4*(y+3)^2=0', 'intersecting_lines').answer;
  assert.equal(answer.degenerate, true); assert.deepEqual(answer.center, ['2', '-3']);
  assert.deepEqual(answer.lines, ['y + 3 = (1/2)*(x - 2)', 'y + 3 = (-1/2)*(x - 2)']);
  const irrational = checked('2x^2-3y^2=0', 'intersecting_lines').answer;
  assert.deepEqual(irrational.lines, ['y = (sqrt(2/3))*(x)', 'y = (-sqrt(2/3))*(x)']);
  for (const slope of ['1/2', '-1/2']) {
    const x = Q(5), y = Q(-3).add(x.sub(2).mul(slope));
    assert.ok(pEvaluate(residual('(x-2)^2-4*(y+3)^2=0'), { x, y }).zero);
  }
});

test('empty real loci distinguish imaginary central conics from degenerate empty forms', () => {
  for (const equation of ['x^2+y^2=-1', '-x^2-y^2=1', '2*(x-1)^2+3*(y+2)^2=-4']) {
    const answer = checked(equation, 'empty').answer;
    assert.equal(answer.realLocus, 'empty'); assert.equal(answer.degenerate, false);
    assert.ok(['circle', 'ellipse'].includes(answer.family));
    assert.equal(answer.radius, undefined); assert.equal(answer.foci, undefined);
  }
  for (const equation of ['x^2+1=0', '-y^2=3', '(x-1)^2=-2', '5=0']) {
    const answer = checked(equation, 'empty').answer;
    assert.equal(answer.realLocus, 'empty'); assert.equal(answer.degenerate, true);
  }
});

test('rank-one quadratics include parallel lines and repeated lines on either coordinate', () => {
  const lines = checked('x^2-4x+3=0', 'parallel_lines').answer;
  assert.deepEqual(lines.lines, ['x = 1', 'x = 3']); assert.equal(lines.separation.squared, '4');
  const irrational = checked('(y+1/3)^2=2/5', 'parallel_lines').answer;
  assert.deepEqual(irrational.lines, ['y = -1/3 - sqrt(2/5)', 'y = -1/3 + sqrt(2/5)']);
  assert.equal(irrational.separation.squared, '8/5');
  assert.deepEqual(checked('-2*(y-3)^2=-8', 'parallel_lines').answer.lines, ['y = 1', 'y = 5']);
  const double = checked('x^2-4x+4=0', 'double_line').answer;
  assert.deepEqual(double.lines, ['x = 2']); assert.equal(double.lineMultiplicity, 2);
  assert.equal(double.degenerate, true);
  assert.deepEqual(checked('(y+2/7)^2=0', 'double_line').answer.lines, ['y = -2/7']);
});

test('linear, constant, and identically zero polynomial limits are reported exactly', () => {
  const line = checked('x+y=2', 'line').answer;
  assert.deepEqual(line.lines, ['x + y - 2 = 0']); assert.equal(line.degenerate, true);
  assert.equal(checked('x^2+y^2=x^2+y^2', 'plane').answer.realLocus, 'all');
  assert.equal(checked('0=0', 'plane').answer.standardForm, '0 = 0');
  assert.equal(checked('x^2+y^2=x^2+y^2+1', 'empty').answer.realLocus, 'empty');
});

test('coefficient sign families classify correctly under positive and negative equation scaling', () => {
  for (const A of [-3, -1, 1, 2]) for (const C of [-2, -1, 1, 3]) for (const K of [-2, 0, 3]) {
    const equation = `(${A})*(x-1/3)^2+(${C})*(y+2/5)^2=(${K})`;
    const classification = A * C > 0 ? K === 0 ? 'point' : A * K < 0 ? 'empty' : A === C ? 'circle' : 'ellipse' :
      K === 0 ? 'intersecting_lines' : 'hyperbola';
    const answer = checked(equation, classification).answer;
    assert.deepEqual(answer.center, ['1/3', '-2/5']);
  }
});

test('custom variables, coordinate order, and rational constant coefficients are supported', () => {
  const circle = checked('(u-2)^2+(v+3)^2=4', 'circle', { variables: ['u', 'v'] }).answer;
  assert.deepEqual(circle.variables, ['u', 'v']); assert.deepEqual(circle.center, ['2', '-3']);
  assert.equal(circle.standardForm, '(u - 2)^2 + (v + 3)^2 = 4');
  const reverse = checked('x^2=8y', 'parabola', { variables: ['y', 'x'] }).answer;
  assert.deepEqual(reverse.vertex, ['0', '0']); assert.equal(reverse.axis, 'y');
  assert.deepEqual(reverse.focus, ['2', '0']); assert.equal(reverse.directrix, 'y = -2');
  const indexed = checked('x_1^2+y_2^2=9/4', 'circle', { variables: ['x_1', 'y_2'] }).answer;
  assert.equal(indexed.radius, '3/2');
  assert.equal(checked('sqrt(4)*x^2+2y^2=8', 'circle').answer.radius, '2');
  assert.equal(checked('(x^2+y^2)/(2/3)=6', 'circle').answer.radiusSquared, '4');
});

test('higher total degree, extra variables and nonrational coefficients are unsupported', () => {
  for (const equation of ['x^3+y^2=0', 'x^2*y^2=1',
    'x^2+y^2+z=1', 'x^2+y^2+z-z=1', 'sqrt(2)*x^2+y^2=1',
    'sin(x)+y^2=1', 'pi*x^2+y^2=1', 'x^2+e*y^2=1', 'x^2+i*y^2=1', 'x^(1/2)+y^2=1',
    'x^33+y^2=1', 'x^y+y^2=1']) rejected(request(equation));
});

test('rational symmetric diagonalization classifies rotated ellipses and verifies geometry', () => {
  const result = checked('x^2+x*y+y^2=1', 'ellipse'), answer = result.answer;
  assert.equal(answer.orientation, 'rotated');
  assert.deepEqual(answer.diagonalization.matrix, [['1', '1/2'], ['1/2', '1']]);
  assert.deepEqual(answer.diagonalization.eigenvalues, ['3/2', '1/2']);
  assert.deepEqual(answer.diagonalization.directions, [['1', '1'], ['-1', '1']]);
  assert.equal(answer.diagonalization.normSquared, '2');
  assert.deepEqual(answer.semiaxesSquared, ['2/3', '2']);
  assert.equal(answer.focalDistanceSquared, '4/3');
  assert.deepEqual(answer.vertices, [['1', '-1'], ['-1', '1']]);
  for (const [x, y] of answer.vertices)
    assert.ok(pEvaluate(residual('x^2+x*y+y^2=1'), { x: Q(x), y: Q(y) }).zero);
  assert.deepEqual(answer.covertices, [
    ['-sqrt(1/3)', '-sqrt(1/3)'], ['sqrt(1/3)', 'sqrt(1/3)']]);
  const translated = checked('(x-2)^2+(x-2)*(y+1)+(y+1)^2=1', 'ellipse').answer;
  assert.deepEqual(translated.center, ['2', '-1']);
  assert.deepEqual(translated.vertices, [['3', '-2'], ['1', '0']]);
  const oblique = checked('61x^2+96xy+89y^2=25', 'ellipse').answer;
  assert.deepEqual(oblique.diagonalization.directions, [['3', '4'], ['-4', '3']]);
  assert.deepEqual(oblique.diagonalization.eigenvalues, ['125', '25']);
  assert.deepEqual(oblique.semiaxesSquared, ['1/5', '1']);
  assert.deepEqual(checked('5x^2+6xy+5y^2=8', 'ellipse').answer.semiaxesSquared, ['1', '4']);
  assert.equal(checked('x^2+x*y+y^2=-1', 'empty').answer.family, 'ellipse');
  assert.deepEqual(checked('x^2+x*y+y^2=0', 'point').answer.point, ['0', '0']);
});

test('rotated hyperbolas and line degeneracies retain exact original-variable equations', () => {
  const answer = checked('x*y=1', 'hyperbola').answer;
  assert.equal(answer.transverseSemiAxisSquared, '2');
  assert.equal(answer.conjugateSemiAxisSquared, '2');
  assert.deepEqual(answer.vertices, [['-1', '-1'], ['1', '1']]);
  assert.deepEqual(answer.asymptotes, [
    '(-x + y) = (1)*(x + y)', '(-x + y) = (-1)*(x + y)']);
  const lines = checked('x*y=0', 'intersecting_lines').answer;
  assert.equal(lines.lines.length, 2);
  const parallels = checked('(x+y)^2=1', 'parallel_lines').answer;
  assert.equal(parallels.separation.squared, '2');
  assert.deepEqual(parallels.lines, ['(x + y) = -1', '(x + y) = 1']);
  assert.equal(checked('(x+y)^2=0', 'double_line').answer.lineMultiplicity, 2);
  assert.equal(checked('(x+y)^2=-1', 'empty').answer.realLocus, 'empty');
  assert.equal(checked('xy=6', 'hyperbola').answer.focalDistanceSquared, '24');
  const renamed = checked('z*a=1', 'hyperbola', { variables: ['z', 'a'] }).answer;
  assert.deepEqual(renamed.variables, ['z', 'a']);
});

test('rotated parabolas report exact vertex, focus and directrix in original coordinates', () => {
  const answer = checked('(x+y)^2=4*(x-y)', 'parabola').answer;
  assert.deepEqual(answer.vertex, ['0', '0']);
  assert.deepEqual(answer.focus, ['1/2', '-1/2']);
  assert.equal(answer.focalParameter, '-sqrt(1/2)');
  assert.equal(answer.directrix, '(-x + y) = 1');
  const translated = checked('(x+y-3)^2=4*(x-y-1)', 'parabola').answer;
  assert.deepEqual(translated.vertex, ['2', '1']);
  assert.deepEqual(translated.focus, ['5/2', '1/2']);
  const reverse = checked('-(x+y)^2=4*(x-y)', 'parabola').answer;
  assert.deepEqual(reverse.focus, ['-1/2', '1/2']);
});

test('mixed-term limits reject irrational spectra and oversized coefficients', () => {
  for (const equation of ['x^2+x*y-y^2=1', '2*x^2+x*y+3*y^2=1',
    '1e-260*x*y=1']) rejected(request(equation));
  const input = request('x^2+x*y+y^2=1'), result = checked(input.equation, 'ellipse');
  for (const mutate of [
    r => { r.answer.diagonalization.eigenvalues[0] = '2'; },
    r => { r.answer.foci[0][0] = '0'; },
    r => { r.certificate.diagonalization.normSquared = '3'; },
    r => { r.certificate.coefficients.B = '0'; },
    r => { r.steps[1].rule = 'estimated-rotation'; },
  ]) { const forged = clone(result); mutate(forged); assert.equal(verifyConicCertificate(input, forged), false); }
});

test('variable denominators are rejected before cancellations can erase excluded points', () => {
  for (const equation of ['x^2/y+y^2=1', '((x^2+y^2-1)/(x-1))*(x-1)=0',
    'x^2+y^2+(1/x-1/x)=1', 'x^2+x^-1+y^2=1', '0/(x-y)+x^2+y^2=1',
    '(x^2+y^2)/(x/x)=1', 'x^2/(x-x+1)+y^2=1']) rejected(request(equation));
  for (const equation of ['x^2/0+y^2=1', 'x^2/(2-2)+y^2=1', '0^-1+x^2+y^2=1', '0^0+x^2+y^2=1'])
    rejected(request(equation), 'invalid');
});

test('structured request, equation syntax, coordinate names and parser budgets are validated', () => {
  for (const input of [null, undefined, [], 'x^2+y^2=1', request(null), request(4), request(''),
    request('x^2+y^2'), request('x^2+y^2<1'), request('x=y=1'), request('f(x)=x^2+y^2'),
    request('x^2+y^2=1;globalThis.conicExecuted=1'), request('x^2+y^2='),
    ...[null, [], ['x'], ['x', 'x'], ['x', 'y', 'z'], [1, 'y'], ['pi', 'y'], ['i', 'y'],
      ['sin', 'y'], ['alpha', 'beta'], ['__proto__', 'y'], ['x-y', 'y'], Array(2)]
      .map(variables => request('x^2+y^2=1', { variables }))]) rejected(input, 'invalid');
  rejected({ kind: 'matrix', equation: 'x^2+y^2=1' });
  rejected(request('x^2+y^2=' + '1'.repeat(4096)));
  rejected(request('('.repeat(65) + 'x' + ')'.repeat(65) + '^2+y^2=1'));
  assert.equal(globalThis.conicExecuted, undefined);
});

test('conic requests remain immutable and deterministic, including null-prototype input', () => {
  const input = Object.freeze({ kind: 'conic', equation: '(u-2)^2+(v+3)^2=4', variables: Object.freeze(['u', 'v']) });
  const before = clone(input), result = solveConic(input);
  assert.deepEqual(input, before); assert.equal(verifyConicCertificate(input, result), true);
  assert.deepEqual(solveConic(input), result);
  const dictionary = Object.assign(Object.create(null), request('x^2+y^2=1'));
  assert.equal(solveConic(dictionary).status, 'solved');
  rejected(Object.create(request('x^2+y^2=1')), 'invalid');
});

test('certificate replay rejects forged classifications, geometric answers, proof and metadata', () => {
  const input = request('4*(x-1)^2-9*(y+2)^2=-36'), result = solveConic(input);
  const mutations = [
    r => { r.answer.classification = 'ellipse'; }, r => { r.answer.center[0] = '0'; },
    r => { r.answer.foci[0][1] = '2'; }, r => { r.answer.asymptotes[0] = 'y=0'; },
    r => { r.answer.transverseSemiAxisSquared = '5'; }, r => { r.answer.standardForm = 'x^2+y^2=1'; },
    r => { r.answer.degenerate = true; }, r => { r.answer.exact = false; },
    r => { r.verified = false; }, r => { r.topic = 'ellipse'; },
    r => { r.steps[1].after = r.steps[1].before; }, r => { r.steps[0].verified = false; },
    r => { r.steps[1].explanation = 'Assume a numerical graph proves it.'; }, r => { r.steps.pop(); },
    r => { r.restrictions = []; }, r => { r.certificate.type = 'algebra'; },
    r => { r.certificate.version = 2; }, r => { r.certificate.coefficients.A = '9'; },
    r => { r.certificate.completion.rightHandSide = '0'; },
    r => { r.certificate.evidence.standardFormMultiplier = '1'; },
    r => { r.certificate.input.equation = 'x^2-y^2=1'; },
    r => { delete r.certificate.evidence; }, r => { r.answer.extraClaim = 'proven'; },
  ];
  for (const mutate of mutations) { const forged = clone(result); mutate(forged); assert.equal(verifyConicCertificate(input, forged), false); }
  assert.equal(verifyConicCertificate(request('4x^2-9y^2=36'), result), false);
  assert.equal(verifyConicCertificate({ ...input, variables: ['y', 'x'] }, result), false);
  assert.equal(verifyConicCertificate(input, null), false);
  assert.equal(verifyConicCertificate(input, { status: 'solved', verified: true }), false);
  const cyclic = clone(result); cyclic.certificate.input = cyclic;
  assert.equal(verifyConicCertificate(input, cyclic), false);
  const sparse = clone(result); delete sparse.answer.center[0];
  assert.equal(verifyConicCertificate(input, sparse), false);
  assert.equal(verifyConicCertificate(input, { ...result, toJSON: () => result }), false);
  assert.equal(verifyConicCertificate(input, { ...result, routing: { engine: 3 } }), false);
  assert.equal(verifyConicCertificate(input, Object.fromEntries(Object.entries(result).reverse())), true);
});

test('parabola and degenerate certificates bind their specific answers, not just the classification', () => {
  for (const [equation, classification, mutate] of [
    ['x^2=4y', 'parabola', r => { r.answer.directrix = 'y = 1'; }],
    ['x^2+y^2=0', 'point', r => { r.answer.point[0] = '1'; }],
    ['x^2-y^2=0', 'intersecting_lines', r => { r.answer.lines[0] = 'y = 2x'; }],
    ['x^2+y^2=-1', 'empty', r => { r.answer.realLocus = 'nonempty'; }],
    ['0=0', 'plane', r => { r.answer.realLocus = 'empty'; }],
    ['x^2=1', 'parallel_lines', r => { r.answer.separation.squared = '2'; }],
  ]) {
    const result = checked(equation, classification); mutate(result);
    assert.equal(verifyConicCertificate(request(equation), result), false);
  }
});
