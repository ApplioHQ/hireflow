/**
 * Locally authored algebra, geometry, and precalculus acceptance map. This is neither a standardized
 * curriculum nor an empirical coverage estimate (including any claimed 51%).
 * Every pair below was authored directly, without the problem generator.
 * The small constructors only package literal inputs and fixed human answers.
 *
 * supported: acceptance contract; target: desired mathematics with a known
 * implementation limitation; known_gap: intentionally document rejected scope.
 * Targets and gaps never disappear from the family coverage denominator.
 */
import { solve, verifyResult } from './index.js';
import { parseExpression, rationalFunction, pEqual, pMul } from './core.js';

const c = (input, expected, options) => ({ input, ...(options ? { options } : {}), supportStatus: 'supported', expected });
const roots = (input, solutions, options) => c(input, { answer: { solutions, complete: true }, unordered: ['solutions'] }, options);
const expr = (input, expression, extra = {}) => c(input, { identities: { expression }, ...extra });
const fields = (input, answer, extra = {}) => c(input, { answer, ...extra });
const family = (id, label, subject, ...cases) => ({ id, label, subject, cases });
const gap = (input, desired, gapReason, options) => ({ input, ...(options ? { options } : {}), supportStatus: 'known_gap', expected: {
  rejectedStatuses: ['unsupported', 'unresolved', 'invalid'], desired, gapReason,
} });
const op = (operation, f, rest = {}) => ({ kind: 'function_operation', operation, f, ...rest });
const system = (...equations) => ({ kind: 'system', equations });
const sequence = (type, first, step, n, task = 'term') => ({ kind: 'sequence', type, first, [type === 'arithmetic' ? 'step' : 'ratio']: step, n, task });
const geometry = (topic, points) => ({ kind: 'geometry', topic, points });

export const CURRICULUM_FAMILIES = [
  family('rational-arithmetic', 'Exact rational arithmetic', 'Algebra 1',
    expr('3/4-5/6', '-1/12'), expr('(2/3)/(5/7)+1/5', '17/15')),
  family('linear-both-sides', 'Distribution and linear equations on both sides', 'Algebra 1',
    roots('4(x-2)+3=2x+9', ['7']), roots('7-3(2x+1)=5x-18', ['2'])),
  family('fraction-equations', 'Linear equations with fractional coefficients', 'Algebra 1',
    roots(String.raw`\frac{x}{3}+\frac{1}{2}=\frac{5x}{6}-1`, ['3']),
    roots('(3x-2)/5=(x+4)/3', ['13/2'])),
  family('proportions', 'Proportions with original denominator exclusions', 'Algebra 1',
    roots('3/7=x/21', ['9']), roots('5/(x-1)=2/3', ['17/2'])),
  family('coordinate-slope', 'Slope from structured coordinates, including vertical lines', 'Algebra 1 / geometry',
    fields(geometry('slope', [[-2, 1], [4, 10]]), { vertical: false, slope: { value: 1.5, approximate: true } }, { geometryMeasurements: ['slope'] }),
    fields(geometry('slope', [[3, -4], [3, 6]]), { vertical: true, slope: null }, { geometryMeasurements: [] })),
  family('linear-inequalities', 'Linear inequalities and reversed order', 'Algebra 1',
    fields('-3x+1>=10', { solutionSet: '(-∞, -3]' }), fields('2(x-4)<x+5', { solutionSet: '(-∞, 13)' })),
  family('compound-inequalities', 'Compound intersections and unions', 'Algebra 1',
    fields('-2<x+1<=6', { solutionSet: '(-3, 5]' }), fields('2x+1< -5 or 3x-2>=10', { solutionSet: '(-∞, -3) ∪ [4, ∞)' })),
  family('absolute-equations', 'Absolute value equations and impossible ranges', 'Algebra 1',
    roots('abs(3x+2)=8', ['-10/3', '2']), roots('2abs(x-4)+3=1', [])),
  family('absolute-inequalities', 'Absolute value bounded and exterior intervals', 'Algebra 2',
    fields('abs(3x+2)<=7', { solutionSet: '[-3, 5/3]' }), fields('2abs(x-4)>6', { solutionSet: '(-∞, 1) ∪ (7, ∞)' })),
  family('linear-systems', 'Unique linear systems', 'Algebra 1',
    fields(system('3x+2y=12', 'x-y=-1'), { type: 'unique', values: { x: '2', y: '3' } }),
    fields(system('2x-y=7', 'x+3y=0'), { type: 'unique', values: { x: '3', y: '-1' } })),
  family('degenerate-systems', 'Inconsistent and dependent linear systems', 'Algebra 1',
    fields(system('x-2y=3', '2x-4y=7'), { type: 'inconsistent' }),
    fields(system('3x+y=6', '6x+2y=12'), { type: 'infinite', parameters: ['t1'], values: { x: '2 - (1/3)*t1', y: 't1' } })),
  family('exponent-laws', 'Integer exponent laws with domain restrictions', 'Algebra 1',
    expr('(x^3*x^4)/x^2', 'x^5', { restrictions: ['x^2 != 0'] }), expr('(2x^2)^3/(4x)', '2x^5', { restrictions: ['4*x != 0'] })),
  family('polynomial-expansion', 'Polynomial products and like terms', 'Algebra 1',
    expr('expand (2x-3)(x+4)', '2x^2+5x-12'), expr('expand (x-2)^3', 'x^3-6x^2+12x-8')),
  family('gcf-factoring', 'Polynomial greatest common factors', 'Algebra 1',
    expr('factor 8x^3+12x^2', '4x^2*(2x+3)', { factorCountAtLeast: 2 }),
    expr('factor 15x^4-10x^2', '5x^2*(3x^2-2)', { factorCountAtLeast: 2 })),
  family('cubes-factoring', 'Sum and difference of cubes', 'Algebra 2',
    expr('factor x^3+64', '(x+4)*(x^2-4x+16)', { factorCountAtLeast: 2 }),
    expr('factor 8x^3-27', '(2x-3)*(4x^2+6x+9)', { factorCountAtLeast: 2 })),
  family('polynomial-division', 'Polynomial quotient and remainder', 'Algebra 2',
    c({ kind: 'polynomial_division', dividend: 'x^3+2x^2+4', divisor: 'x+1' }, { identities: { quotient: 'x^2+x-1', remainder: '5' } }),
    c({ kind: 'polynomial_division', dividend: '3x^2-2x+7', divisor: 'x-2' }, { identities: { quotient: '3x+4', remainder: '15' } })),
  family('quadratic-rational', 'Quadratics with rational and repeated roots', 'Algebra 1',
    roots('6x^2+x-2=0', ['-2/3', '1/2']), roots('9x^2-12x+4=0', ['2/3'])),
  family('quadratic-irrational', 'Quadratics with exact irrational roots', 'Algebra 2',
    roots('x^2-7=0', ['(0 - sqrt(28))/(2)', '(0 + sqrt(28))/(2)']),
    roots('x^2-4x+1=0', ['(4 - sqrt(12))/(2)', '(4 + sqrt(12))/(2)'])),
  family('quadratic-complex', 'Quadratics over the complex numbers', 'Algebra 2',
    roots('x^2+16=0', ['0 + 4*i', '0 - 4*i'], { domain: 'complex' }),
    roots('x^2-6x+13=0', ['3 + 2*i', '3 - 2*i'], { domain: 'complex' })),
  family('rational-expressions', 'Rational cancellation without losing exclusions', 'Algebra 2',
    expr('(x^2-9)/(x-3)', 'x+3', { restrictions: ['x - 3 != 0'] }),
    expr('(x^2+5x+6)/(x+2)', 'x+3', { restrictions: ['x + 2 != 0'] })),
  family('rational-equations', 'Rational equations and excluded candidates', 'Algebra 2',
    roots('1/(x-2)+1=3/(x-2)', ['4']),
    c('(x^2-4)/(x-2)=4', { answer: { solutions: [], complete: true }, restrictions: ['x - 2 != 0'] })),
  family('rational-function-features', 'Rational function intercepts, poles and ranges', 'Algebra 2',
    fields('f(x)=(2x+3)/(x-4)', { domain: 'x ∈ R; x ≠ 4', verticalAsymptotes: ['x = 4'], horizontalAsymptote: 'y = 2', range: 'y ∈ R; y ≠ 2', xIntercepts: ['(-3/2, 0)'], yIntercept: '(0, -3/4)' }),
    fields('f(x)=(3x-2)/(x+5)', { domain: 'x ∈ R; x ≠ -5', verticalAsymptotes: ['x = -5'], horizontalAsymptote: 'y = 3', range: 'y ∈ R; y ≠ 3', xIntercepts: ['(2/3, 0)'], yIntercept: '(0, -2/5)' })),
  family('holes-and-range', 'Removable holes must also remove unique range values', 'Algebra 2',
    fields('f(x)=(x^2-4)/(x-2)', { holes: ['(2, 4)'], verticalAsymptotes: [], domain: 'x ∈ R; x ≠ 2', range: 'y ∈ R; y ≠ 4' }),
    fields('f(x)=(x^2+2x-3)/(x-1)', { holes: ['(1, 4)'], verticalAsymptotes: [], domain: 'x ∈ R; x ≠ 1', range: 'y ∈ R; y ≠ 4' })),
  family('quadratic-function-features', 'Quadratic vertices, axes and ranges', 'Algebra 1',
    fields('f(x)=3(x+2)^2-5', { vertex: '(-2, -5)', range: 'y ≥ -5', axisOfSymmetry: 'x = -2', opening: 'upward' }),
    fields('f(x)=-2(x-4)^2+7', { vertex: '(4, 7)', range: 'y ≤ 7', axisOfSymmetry: 'x = 4', opening: 'downward' })),
  family('radical-equations', 'Square root equations and extraneous-root filtering', 'Algebra 2',
    roots('sqrt(3x+4)=x', ['4']), roots('sqrt(x+6)=x', ['3'])),
  family('nth-roots', 'Odd and even root equations', 'Algebra 2',
    roots('root(3x-1,3)=-2', ['-7/3']), roots('root(x+5,4)=3', ['76'])),
  family('rational-powers', 'Real rational powers with multiple branches', 'Algebra 2',
    roots('x^(2/3)=9', ['-27', '27']), roots('x^(-1/2)=1/3', ['9'])),
  family('logarithm-laws', 'Logarithm sum/difference laws with positive arguments', 'Algebra 2',
    roots('log(x,2)+log(x-3,2)=2', ['4']), roots('log(x,3)-log(x-2,3)=1', ['3'])),
  family('equal-base-exponentials', 'Equal-base exponential injectivity', 'Algebra 2',
    roots('5^(3x-2)=5^(x+6)', ['4']), roots('3^(x^2)=3^(x+6)', ['-2', '3'])),
  family('arithmetic-sequences', 'Arithmetic sequence terms', 'Algebra 1',
    fields(sequence('arithmetic', -4, 3, 8), { value: '17', exact: true }),
    fields(sequence('arithmetic', '5/6', '-1/3', 6), { value: '-5/6', exact: true })),
  family('geometric-sequences', 'Geometric sequence terms', 'Algebra 2',
    fields(sequence('geometric', 6, '-1/2', 5), { value: '3/8', exact: true }),
    fields(sequence('geometric', '2/3', 3, 4), { value: '18', exact: true })),
  family('finite-sums', 'Finite arithmetic and geometric sums', 'Algebra 2',
    fields(sequence('arithmetic', 5, 4, 7, 'sum'), { value: '119', exact: true }),
    fields(sequence('geometric', 2, 3, 5, 'sum'), { value: '242', exact: true })),
  family('function-composition', 'Function composition and inherited poles', 'Algebra 2',
    expr(op('compose', '3x-2', { g: 'x^2+4' }), '3x^2+10'),
    expr(op('compose', '1/(x+2)', { g: '1/x' }), 'x/(2x+1)', { restrictions: ['x != 0'] })),
  family('function-inverses', 'Linear and fractional function inverses', 'Algebra 2',
    expr(op('inverse', '4x-7'), '(x+7)/4'), expr(op('inverse', '(3x+2)/(x-5)'), '(5x+2)/(x-3)')),
  family('function-evaluation', 'Exact function evaluation', 'Algebra 1',
    fields(op('evaluate', '2x^2-3x+1', { value: '-1/2' }), { value: '3' }),
    fields(op('evaluate', '(x+4)/(2x-1)', { value: '2/3' }), { value: '14' })),
  family('linear-quadratic-systems', 'Line/quadratic intersections and tangency', 'Algebra 2',
    fields(system('x+y=5', 'x^2+y^2=13'), { solutions: [{ x: '2', y: '3' }, { x: '3', y: '2' }], complete: true }, { unordered: ['solutions'] }),
    fields(system('y=2x-1', 'y=x^2'), { solutions: [{ x: '1', y: '1' }], complete: true })),
  family('two-quadratics', 'Selected complete intersections of two quadratics', 'Algebra 2',
    fields(system('x^2+y^2=10', 'xy=3'), { solutions: [{ x: '-3', y: '-1' }, { x: '-1', y: '-3' }, { x: '1', y: '3' }, { x: '3', y: '1' }], complete: true }, { unordered: ['solutions'] }),
    fields(system('x^2+y^2=4', 'x^2+y^2=9'), { solutions: [], type: 'inconsistent', complete: true })),
  family('central-conics', 'Axis-aligned circles and ellipses', 'Algebra 2',
    fields({ kind: 'conic', equation: '(x+2)^2+(y-3)^2=49' }, { classification: 'circle', center: ['-2', '3'], radiusSquared: '49', radius: '7', exact: true }),
    fields({ kind: 'conic', equation: 'x^2/169+y^2/25=1' }, { classification: 'ellipse', center: ['0', '0'], majorAxis: 'x', focalDistanceSquared: '144', foci: [['-12', '0'], ['12', '0']], exact: true })),
  family('parabolas', 'Axis-aligned parabola focus and directrix', 'Algebra 2',
    fields({ kind: 'conic', equation: '(x-3)^2=12*(y+2)' }, { classification: 'parabola', vertex: ['3', '-2'], focus: ['3', '1'], directrix: 'y = -5', opening: 'up', exact: true }),
    fields({ kind: 'conic', equation: '(y+1)^2=-8*(x-4)' }, { classification: 'parabola', vertex: ['4', '-1'], focus: ['2', '-1'], directrix: 'x = 6', opening: 'left', exact: true })),
  family('hyperbolas', 'Axis-aligned hyperbola vertices and foci', 'Algebra 2',
    fields({ kind: 'conic', equation: 'x^2/36-y^2/64=1' }, { classification: 'hyperbola', transverseAxis: 'x', focalDistanceSquared: '100', vertices: [['-6', '0'], ['6', '0']], foci: [['-10', '0'], ['10', '0']], exact: true }),
    fields({ kind: 'conic', equation: '(y-2)^2/9-(x+1)^2/16=1' }, { classification: 'hyperbola', transverseAxis: 'y', center: ['-1', '2'], focalDistanceSquared: '25', vertices: [['-1', '-1'], ['-1', '5']], foci: [['-1', '-3'], ['-1', '7']], exact: true })),
  family('coordinate-distance', 'Structured geometry distance with fixed exact known lengths', 'Algebra 1 / geometry',
    fields(geometry('distance', [[-3, 2], [2, 14]]), { distance: { value: 13, approximate: true } }, { geometryMeasurements: ['distance'] }),
    fields(geometry('distance', [[1, -2], [9, 13]]), { distance: { value: 17, approximate: true } }, { geometryMeasurements: ['distance'] })),
  family('matrices', 'Exact matrix determinant and inverse', 'Algebra 2',
    fields({ kind: 'matrix', operation: 'determinant', matrix: [[3, 5], [2, -1]] }, { value: '-13', exact: true }),
    fields({ kind: 'matrix', operation: 'inverse', matrix: [[2, 1], [5, 3]] }, { matrix: [['3', '-1'], ['-5', '2']], exact: true })),
  family('statistics', 'Exact descriptive statistics, variance, and regression', 'Algebra 1 / statistics',
    fields({ kind: 'statistics', values: [2, 4, 4, 10] }, { count: 4, mean: '5', median: '4', variance: '9', sampleVariance: '12', exact: true }),
    fields({ kind: 'statistics', values: ['1/2', '3/2', '5/2'] }, { count: 3, sum: '9/2', mean: '3/2', median: '3/2', variance: '2/3', sampleVariance: '1', exact: true }),
    fields({ kind: 'data_reasoning', topic: 'regression', operation: 'fit', points: [[0, 1], [1, 3], [2, 5]], at: '5/2' }, { slope: '2', intercept: '1', correlation: '1', prediction: '6', exact: true })),
  family('combinatorics', 'Combinations, permutations, and exact probabilities', 'Algebra 2 / discrete',
    fields({ kind: 'combinatorics', operation: 'combinations', n: 9, r: 4 }, { value: '126', exact: true }),
    fields({ kind: 'combinatorics', operation: 'permutations', n: 7, r: 3 }, { value: '210', exact: true }),
    fields({ kind: 'data_reasoning', topic: 'two_way_table', operation: 'conditional_probability', table: [[12, 8], [3, 7]], event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 1 } }, { probability: '8/15', exact: true }),
    fields({ kind: 'data_reasoning', topic: 'combinatorial_probability', operation: 'binomial', trials: 3, successProbability: '1/4', exactSuccesses: 2 }, { probability: '9/64', exact: true })),
  family('word-problem-templates', 'Exact facts and answers for fully matched English models', 'Algebra 1 / modeling',
    fields('A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled?',
      { quantity: '6', unit: 'miles', exact: true }),
    fields('A taxi charges 4 dollars plus 3 dollars per mile. How far can I travel for 25 dollars?',
      { quantity: '7', unit: 'miles', exact: true }),
    fields('The sum of three consecutive integers is 72. Find the integers.',
      { integers: ['23', '24', '25'], unit: 'integers', exact: true })),
  family('word-problem-parsing', 'Gap: unrestricted word problem parsing', 'Algebra 1 / modeling',
    gap('A train travels 60 miles in 2 hours. What is its speed?', '30 miles per hour', 'No unrestricted natural-language model extraction.'),
    gap('Two consecutive integers have sum 37. Find both integers.', '18 and 19', 'No unrestricted natural-language model extraction.')),
  family('literal-parameters', 'Literal parameter rearrangement with complete conditional branches', 'Algebra 1',
    c('a*x+b=c', {
      answer: { variable: 'x', complete: true, parameters: ['a', 'b', 'c'] },
      identities: { expression: '(c-b)/a' },
      branches: [
        { type: 'unique', conditions: ['a != 0'], expression: '(c-b)/a' },
        { type: 'all_in_domain', conditions: ['a = 0', 'b - c = 0'], solution: 'All values in the original domain' },
        { type: 'inconsistent', conditions: ['a = 0', 'b - c != 0'], solution: 'No solution' },
      ],
    }, { variable: 'x' }),
    c('p=2*l+2*w', {
      answer: { variable: 'l', complete: true, parameters: ['p', 'w'] },
      identities: { expression: 'p/2-w' },
      branches: [{ type: 'unique', conditions: [], expression: 'p/2-w' }],
    }, { variable: 'l' })),
  family('piecewise-analysis', 'Piecewise function domains and ranges with first-match semantics', 'Algebra 2',
    c({ kind: 'piecewise', variable: 'x', pieces: [{ expression: '-x', condition: 'x<0' }, { expression: 'x', condition: 'x>=0' }] }, {
      answer: { variable: 'x', semantics: 'first-match', complete: true, domain: '(-∞, ∞)', range: '[0, ∞)',
        domainIntervals: [{ low: '-∞', high: '∞', lowClosed: false, highClosed: false }],
        rangeIntervals: [{ low: '0', high: '∞', lowClosed: true, highClosed: false }] },
      pieces: [
        { index: 0, expression: '-x', condition: 'x<0',
          domainIntervals: [{ low: '-∞', high: '0', lowClosed: false, highClosed: false }],
          rangeIntervals: [{ low: '0', high: '∞', lowClosed: false, highClosed: false }] },
        { index: 1, expression: 'x', condition: 'x>=0',
          domainIntervals: [{ low: '0', high: '∞', lowClosed: true, highClosed: false }],
          rangeIntervals: [{ low: '0', high: '∞', lowClosed: true, highClosed: false }] },
      ],
    }),
    c({ kind: 'piecewise', variable: 'x', pieces: [{ expression: '1', condition: 'x<2' }, { expression: '3', condition: 'x>=2' }] }, {
      answer: { variable: 'x', semantics: 'first-match', complete: true, domain: '(-∞, ∞)', range: '{1} ∪ {3}',
        domainIntervals: [{ low: '-∞', high: '∞', lowClosed: false, highClosed: false }],
        rangeIntervals: [{ low: '1', high: '1', lowClosed: true, highClosed: true }, { low: '3', high: '3', lowClosed: true, highClosed: true }] },
      pieces: [
        { index: 0, expression: '1', condition: 'x<2',
          domainIntervals: [{ low: '-∞', high: '2', lowClosed: false, highClosed: false }],
          rangeIntervals: [{ low: '1', high: '1', lowClosed: true, highClosed: true }] },
        { index: 1, expression: '3', condition: 'x>=2',
          domainIntervals: [{ low: '2', high: '∞', lowClosed: true, highClosed: false }],
          rangeIntervals: [{ low: '3', high: '3', lowClosed: true, highClosed: true }] },
      ],
    })),
  family('rotated-conics', 'Exact rational-axis rotations for mixed quadratic terms', 'Algebra 2',
    fields({ kind: 'conic', equation: '5x^2+6xy+5y^2=8' }, {
      classification: 'ellipse', orientation: 'rotated', center: ['0', '0'],
      semiaxesSquared: ['1', '4'], focalDistanceSquared: '3',
      diagonalization: { eigenvalues: ['8', '2'], directions: [['1', '1'], ['-1', '1']] },
    }),
    fields({ kind: 'conic', equation: 'xy=6' }, {
      classification: 'hyperbola', orientation: 'rotated', center: ['0', '0'],
      transverseSemiAxisSquared: '12', conjugateSemiAxisSquared: '12',
      diagonalization: { eigenvalues: ['1/2', '-1/2'], directions: [['1', '1'], ['-1', '1']] },
    })),
  family('exact-geometry-relations', 'Exact coordinate transformations and circle relations', 'Geometry',
    fields({ kind: 'geometry', topic: 'transform', point: [1, 2], transformation: 'translation', dx: 3, dy: -1 },
      { image: [{ value: 4, exact: '4', approximate: true }, { value: 1, exact: '1', approximate: true }] }),
    fields({ kind: 'geometry', topic: 'circle_relation', center: [0, 0], radius: 5, point: [3, 4] },
      { position: 'on', distanceSquared: { value: 25, exact: '25', approximate: true }, power: { value: 0, exact: '0', approximate: true } })),
  family('precalc-unit-circle', 'Exact unit-circle trigonometry', 'Precalculus Unit 3',
    fields({ kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/6' },
      { cos: { expression: 'sqrt(3)/2' }, sin: { expression: '1/2' }, tan: { expression: 'sqrt(3)/3' }, exact: true }),
    fields({ kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/4' },
      { cos: { expression: 'sqrt(2)/2' }, sin: { expression: 'sqrt(2)/2' }, tan: { expression: '1' }, exact: true })),
  family('precalc-trig-equations', 'Complete exact trig roots on bounded intervals', 'Precalculus Unit 3',
    fields({ kind: 'precalculus', topic: 'trigonometry', operation: 'solve_equation', function: 'sin', target: '1/2', interval: { lower: 0, upper: 2 } },
      { solutions: ['1/6', '5/6'], complete: true, exact: true }),
    fields({ kind: 'precalculus', topic: 'trigonometry', operation: 'solve_equation', function: 'cos', target: 0, interval: { lower: 0, upper: 2 } },
      { solutions: ['1/2', '3/2'], complete: true, exact: true })),
  family('precalc-trig-models', 'Exact sinusoidal parameters and principal inverse values', 'Precalculus Unit 3',
    fields({ kind: 'trig_models', operation: 'analyze', function: 'sin', scale: '3/2', rate: '2/3', shift: '1/5', offset: '-1/4' },
      { amplitude: '3/2', period: { piMultiple: '3' }, range: { minimum: '-7/4', maximum: '5/4' }, exact: true }),
    fields({ kind: 'trig_models', operation: 'inverse', function: 'asin', value: '1/2' },
      { principalAngle: { piMultiple: '1/6' }, exact: true })),
  family('precalc-vectors', 'Exact vector operations', 'Precalculus Unit 4',
    fields({ kind: 'precalculus', topic: 'vector', operation: 'dot', a: [1, 2], b: [3, 4] },
      { value: { expression: '11' }, orthogonal: false, exact: true }),
    fields({ kind: 'precalculus', topic: 'vector', operation: 'norm', a: [3, 4] },
      { magnitude: { expression: '5' }, exact: true })),
  family('precalc-rates', 'Exact rates and end behavior for bounded functions', 'Precalculus Unit 1',
    fields({ kind: 'precalc_functions', topic: 'rates', operation: 'average_rate', function: { type: 'polynomial', coefficients: [2, -3, 1] }, from: '1/2', to: '3/2' },
      { rate: '-1', valueAtFrom: '3/4', valueAtTo: '-1/4', exact: true }),
    fields({ kind: 'precalc_functions', topic: 'polynomial', operation: 'end_behavior', coefficients: [-1, 0, -2] },
      { degree: 2, leadingCoefficient: '-2', left: 'negative_infinity', right: 'negative_infinity', exact: true })),
  family('precalc-parametric', 'Exact bounded parametric positions and motion', 'Precalculus Unit 4',
    fields({ kind: 'parametric', operation: 'evaluate', x: [1, 2], y: [0, 1, 1], t: '1/2' },
      { t: '1/2', position: ['2', '3/4'], exact: true }),
    fields({ kind: 'parametric', operation: 'motion', x: [0, 1], y: [0, 2], from: 0, to: 2 },
      { displacement: ['2', '4'], averageVelocity: ['1', '2'], exact: true })),
  family('general-transcendentals', 'Gap: general transcendental equations', 'Algebra 2 / beyond',
    gap('cos(x)=x', 'unique real root approximately 0.7390851332', 'No general transcendental root isolation or completeness certificate.'),
    gap('exp(x)+x=3', 'unique real root in (0,1)', 'No general transcendental root isolation or completeness certificate.')),
  family('sophisticated-nonlinear', 'Gap: nonlinear systems beyond selected elimination', 'Algebra 2 / beyond',
    gap(system('x^3+y^3=9', 'xy=2'), 'real solutions (1,2) and (2,1)', 'General cubic systems are outside the selected quadratic eliminator.'),
    gap(system('x^2+y^2=1', '2x^2+2y^2=2'), 'entire unit circle, infinitely many real solutions', 'Positive-dimensional nonlinear solution sets are unsupported.')),
];

// Partial object matching is intentional: each literal lists the mathematical
// characteristics under test, without pinning incidental presentation fields.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function match(actual, expected, path, failures, unordered = []) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) failures.push(`${path}: expected array, received ${canonical(actual)}`);
    else if (unordered.includes(path.replace(/^answer\./, ''))) {
      if (canonical(actual.map(canonical).sort()) !== canonical(expected.map(canonical).sort())) failures.push(`${path}: expected set ${canonical(expected)}, received ${canonical(actual)}`);
    } else if (canonical(actual) !== canonical(expected)) failures.push(`${path}: expected ${canonical(expected)}, received ${canonical(actual)}`);
  } else if (expected !== null && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) match(actual?.[key], value, `${path}.${key}`, failures, unordered);
  } else if (actual !== expected) failures.push(`${path}: expected ${canonical(expected)}, received ${canonical(actual)}`);
}
function sameIdentity(actual, expected) {
  try {
    if (typeof actual !== 'string') return false;
    const a = rationalFunction(parseExpression(actual)), b = rationalFunction(parseExpression(expected));
    return pEqual(pMul(a.num, b.den), pMul(b.num, a.den));
  } catch { return false; }
}
function multiplicationFactors(ast) {
  return ast?.type === 'binary' && ast.op === '*' ? multiplicationFactors(ast.left) + multiplicationFactors(ast.right) : 1;
}

/** Exported so tests can challenge the oracle with certified but wrong answers. */
export function checkCurriculumExpectation(entry, result) {
  const failures = [], expected = entry.expected;
  if (entry.supportStatus === 'known_gap') {
    if (!expected.rejectedStatuses.includes(result.status)) failures.push(`Expected a documented rejection; received ${result.status}`);
    if (result.verified === true) failures.push('Documented gap unexpectedly claims verification');
    if (!result.error) failures.push('Rejected scope has no explanatory engine error');
    return failures;
  }
  if (result.status !== 'solved') failures.push(`Engine status ${result.status}: ${result.error || 'no explanation'}`);
  if (result.verified !== true || !verifyResult(entry.input, result, entry.options)) failures.push('Certificate replay did not accept this input/result pair');
  if (result.latex?.valid !== true) failures.push('LaTeX presentation is not valid');
  if (expected.answer) match(result.answer, expected.answer, 'answer', failures, expected.unordered);
  for (const [key, value] of Object.entries(expected.identities || {})) {
    if (!sameIdentity(result.answer?.[key], value)) failures.push(`answer.${key}: expected identity ${value}, received ${canonical(result.answer?.[key])}`);
  }
  if (expected.branches) {
    const actual = result.answer?.branches;
    if (!Array.isArray(actual) || actual.length !== expected.branches.length) failures.push(`answer.branches: expected ${expected.branches.length} branches, received ${Array.isArray(actual) ? actual.length : 'no array'}`);
    expected.branches.forEach(({ expression, ...characteristics }, index) => {
      match(actual?.[index], characteristics, `answer.branches.${index}`, failures);
      if (expression !== undefined && !sameIdentity(actual?.[index]?.expression, expression)) failures.push(`answer.branches.${index}.expression: expected identity ${expression}, received ${canonical(actual?.[index]?.expression)}`);
    });
  }
  if (expected.pieces) {
    const actual = result.answer?.pieces;
    if (!Array.isArray(actual) || actual.length !== expected.pieces.length) failures.push(`answer.pieces: expected ${expected.pieces.length} pieces, received ${Array.isArray(actual) ? actual.length : 'no array'}`);
    expected.pieces.forEach((piece, index) => match(actual?.[index], piece, `answer.pieces.${index}`, failures));
  }
  for (const restriction of expected.restrictions || []) {
    if (!result.restrictions?.includes(restriction)) failures.push(`Missing original-domain restriction: ${restriction}`);
  }
  if (expected.factorCountAtLeast) {
    try {
      if (multiplicationFactors(parseExpression(result.answer?.expression)) < expected.factorCountAtLeast) failures.push('Expected a factored product, not merely an identical expanded expression');
    } catch { failures.push('Factored expression could not be parsed'); }
  }
  if (expected.geometryMeasurements) {
    if (result.certificate?.assurance !== 'numerical-formula-check') failures.push('Geometry must disclose numerical-formula-check assurance');
    for (const key of expected.geometryMeasurements) {
      const measurement = result.answer?.[key];
      if (measurement?.approximate !== true || typeof measurement?.exact !== 'string' || !measurement.exact.length) failures.push(`Geometry ${key} must disclose approximate numeric value and an exact formula`);
    }
  }
  return failures;
}

/** No network, generator, randomness, persisted baselines, or inferred answers. */
export function runCurriculumBenchmark() {
  const families = CURRICULUM_FAMILIES.map(f => {
    const cases = f.cases.map((entry, index) => {
      let result;
      try { result = solve(entry.input, entry.options); }
      catch (error) { result = { status: 'threw', verified: false, error: error.message }; }
      const failures = checkCurriculumExpectation(entry, result);
      const success = entry.supportStatus !== 'known_gap' && failures.length === 0;
      const classification = entry.supportStatus === 'known_gap' ? failures.length ? 'gap_changed' : 'known_gap'
        : success ? entry.supportStatus === 'target' ? 'target_met' : 'accepted'
          : entry.supportStatus === 'target' ? 'target_unmet' : 'regression';
      return { id: `${f.id}/${index + 1}`, ...entry, actual: { status: result.status, verified: result.verified, latexValid: result.latex?.valid ?? false, answer: result.answer ?? null, error: result.error ?? null },
        success, classification, expectationMet: failures.length === 0, failures,
        reason: failures.length ? failures.join('; ') : entry.supportStatus === 'known_gap' ? result.error : 'Fixed authored answer checks, certificate replay, and LaTeX validation passed.' };
    });
    return { id: f.id, label: f.label, subject: f.subject, success: cases.every(c => c.success), cases };
  });
  const cases = families.flatMap(f => f.cases), count = classification => cases.filter(c => c.classification === classification).length;
  const acceptedFamilies = families.filter(f => f.success).length;
  return {
    title: 'Locally authored algebra, geometry, and precalculus acceptance map',
    scope: 'A finite local family map, not a standardized curriculum, textbook standard, or empirically established percentage (including 51%). Two authored examples do not establish mastery of a whole topic.',
    coverageFraction: { numerator: acceptedFamilies, denominator: families.length, value: acceptedFamilies / families.length,
      definition: 'Families whose every authored case passes fixed expected mathematics, certificate replay and valid LaTeX / all local families, including targets and documented gaps.' },
    totals: { families: families.length, cases: cases.length, acceptedFamilies, successfulCases: cases.filter(c => c.success).length,
      supportedCases: cases.filter(c => c.supportStatus === 'supported').length, regressions: count('regression'),
      targetCases: cases.filter(c => c.supportStatus === 'target').length, targetsMet: count('target_met'), targetsUnmet: count('target_unmet'),
      knownGapCases: cases.filter(c => c.supportStatus === 'known_gap').length, confirmedGaps: count('known_gap'), changedGaps: count('gap_changed') },
    families,
  };
}
