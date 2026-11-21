import { difficultyToInt, estimateDifficulty } from './difficulty.js';
import { Q, rationalSqrt } from './core.js';

export const TOPICS = Object.freeze([
  { id: 'linear', label: 'Linear equations', subject: 'algebra_1' },
  { id: 'distribution', label: 'Equations with distribution', subject: 'algebra_1' },
  { id: 'quadratic', label: 'Quadratic equations', subject: 'algebra_2' },
  { id: 'rational_equation', label: 'Rational equations', subject: 'algebra_2' },
  { id: 'rational_function', label: 'Rational function features', subject: 'algebra_2' },
  { id: 'polynomial_simplification', label: 'Polynomial simplification', subject: 'algebra_1' },
  { id: 'systems', label: 'Systems of linear equations', subject: 'algebra_1' },
  { id: 'exponential', label: 'Exponential equations', subject: 'algebra_2' },
  { id: 'radical', label: 'Radical equations', subject: 'algebra_2' },
  { id: 'logarithmic', label: 'Logarithmic equations (base 10)', subject: 'algebra_2' },
  { id: 'absolute_value', label: 'Absolute value equations', subject: 'algebra_1' },
  { id: 'inequalities', label: 'Linear inequalities', subject: 'algebra_1' },
  { id: 'arithmetic_sequence', label: 'Arithmetic sequences', subject: 'algebra_1' },
  { id: 'geometric_sequence', label: 'Geometric sequences', subject: 'algebra_2' },
  { id: 'distance', label: 'Coordinate distance', subject: 'geometry' },
  { id: 'pythagorean', label: 'Pythagorean theorem', subject: 'geometry' },
  { id: 'trigonometry', label: 'Exact unit circle and angle identities', subject: 'precalculus' },
  { id: 'polar', label: 'Exact polar coordinates', subject: 'precalculus' },
  { id: 'vector', label: 'Exact vectors', subject: 'precalculus' },
  { id: 'regression', label: 'Exact least-squares regression', subject: 'data_reasoning' },
  { id: 'two_way_probability', label: 'Two-way table probability', subject: 'data_reasoning' },
  { id: 'perpendicular_bisector', label: 'Exact perpendicular bisectors', subject: 'geometry' },
  { id: 'circumcircle', label: 'Exact circumcircles', subject: 'geometry' },
  { id: 'circle_arc', label: 'Exact circle arcs', subject: 'geometry' },
  { id: 'circle_sector', label: 'Exact circle sectors', subject: 'geometry' },
  { id: 'special_right_triangle', label: 'Special right triangles', subject: 'geometry' },
].map(topic => Object.freeze(topic)));

const ALIASES = Object.freeze({
  linear_equation: 'linear', linear_equations: 'linear',
  rational: 'rational_equation', polynomial: 'polynomial_simplification',
  system: 'systems', log: 'logarithmic', logarithm: 'logarithmic',
  abs: 'absolute_value', inequality: 'inequalities',
  arithmetic: 'arithmetic_sequence', geometric: 'geometric_sequence',
  pythagoras: 'pythagorean',
  two_way_table: 'two_way_probability', conditional_probability: 'two_way_probability',
});

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

function randomSource(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fraction(numerator, denominator = 1) {
  if (denominator === 0) throw new RangeError('A denominator cannot be zero.');
  if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
  let a = Math.abs(numerator);
  let b = denominator;
  while (b) [a, b] = [b, a % b];
  numerator /= a;
  denominator /= a;
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

function sum(left, right) {
  return right === 0 ? left : `${left} ${right < 0 ? '-' : '+'} ${Math.abs(right)}`;
}

function polynomial(coefficients) {
  const terms = [];
  for (let power = coefficients.length - 1; power >= 0; power--) {
    const coefficient = coefficients[power];
    if (!coefficient) continue;
    const magnitude = Math.abs(coefficient);
    const monomial = power === 0 ? String(magnitude)
      : `${magnitude === 1 ? '' : `${magnitude}*`}x${power === 1 ? '' : `^${power}`}`;
    terms.push(`${terms.length ? (coefficient < 0 ? ' - ' : ' + ') : (coefficient < 0 ? '-' : '')}${monomial}`);
  }
  return terms.join('') || '0';
}

const linearExpression = (a, b = 0) => polynomial([b, a]);
const equation = (a, b, rhs) => `${linearExpression(a, b)} = ${rhs}`;
const step = (before, after, rule, explanation) => ({ before, after, rule, explanation });
const mistake = (before, after, error_category, explanation) => ({ before, after, error_category, explanation });
const solutions = values => ({ kind: 'solutions', variable: 'x', solutions: [...new Set(values.map(String))] });

function linear(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const denominator = score >= 650 ? int(2, 6) : 1;
  const numerator = signed(1, magnitude);
  const a = signed(2, magnitude) * denominator;
  const b = score < 180 ? 0 : signed(1, magnitude);
  const c = score >= 650 ? signed(1, magnitude) : 0;
  const rhs = a * numerator / denominator + b;
  const input = `${linearExpression(a + c, b)} = ${linearExpression(c, rhs)}`;
  const isolated = equation(a, b, rhs);
  const multiplied = equation(a, 0, rhs - b);
  const answer = fraction(numerator, denominator);
  const referenceSteps = [];
  if (c) referenceSteps.push(step(input, isolated, 'subtract_same_term_from_both_sides', 'Collect the variable terms on the left.'));
  if (b) referenceSteps.push(step(isolated, multiplied, 'subtract_same_value_from_both_sides', `Subtract ${b} from both sides.`));
  referenceSteps.push(step(multiplied, `x = ${answer}`, 'divide_both_sides', `Divide both sides by ${a}.`));
  return { input, task: 'Solve for x.', expected: solutions([answer]), referenceSteps,
    intentional_errors: [mistake(multiplied, `x = ${fraction(numerator + denominator, denominator)}`, 'incorrect_division', 'The quotient is one larger than the result of dividing both sides by the coefficient.')] };
}

function distribution(ctx) {
  const { signed, score, magnitude } = ctx;
  const a = signed(2, magnitude);
  const b = signed(1, magnitude);
  const c = score >= 400 ? signed(1, magnitude) : 0;
  const x = signed(1, magnitude);
  const rhs = a * (x + b) + c;
  const input = `${sum(`${a}*(${sum('x', b)})`, c)} = ${rhs}`;
  const expanded = equation(a, a * b + c, rhs);
  const isolated = equation(a, 0, rhs - a * b - c);
  return { input, task: 'Distribute, then solve for x.', expected: solutions([x]),
    referenceSteps: [
      step(input, expanded, 'distributive_property', 'Multiply every term inside the parentheses by the outside coefficient, then combine constants.'),
      step(expanded, isolated, 'subtract_same_value_from_both_sides', 'Remove the constant term from both sides.'),
      step(isolated, `x = ${x}`, 'divide_both_sides', `Divide both sides by ${a}.`),
    ],
    intentional_errors: [mistake(input, equation(a, b + c, rhs), 'incomplete_distribution', 'The outside coefficient must multiply the constant inside the parentheses as well as x.')] };
}

function quadratic(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const first = signed(1, magnitude);
  let second = signed(1, magnitude);
  if (second === first) second += 1;
  const a = score >= 500 ? int(2, 6) : 1;
  const input = `${polynomial([a * first * second, -a * (first + second), a])} = 0`;
  const monic = `${polynomial([first * second, -first - second, 1])} = 0`;
  const factored = `(${sum('x', -first)})*(${sum('x', -second)}) = 0`;
  const referenceSteps = [];
  if (a !== 1) referenceSteps.push(step(input, monic, 'divide_both_sides', `Divide both sides by ${a}.`));
  referenceSteps.push(step(monic, factored, 'factor_quadratic', 'Factor using two numbers whose sum and product match the coefficients.'));
  referenceSteps.push(step(factored, `x = ${first} or x = ${second}`, 'zero_product_property', 'At least one of the factors must be zero.'));
  return { input, task: 'Find all real solutions for x.', expected: solutions([first, second].sort((a, b) => a - b)), referenceSteps,
    intentional_errors: [mistake(factored, `x = ${first}`, 'lost_solution', 'Setting only one factor equal to zero loses the other distinct root.')] };
}

function rationalEquation(ctx) {
  const { signed, magnitude } = ctx;
  const h = signed(1, magnitude);
  const offset = signed(1, magnitude);
  const b = signed(2, magnitude);
  const a = b * offset;
  const denominator = sum('x', -h);
  const input = `${a}/(${denominator}) = ${b}`;
  const multiplied = `${a} = ${b}*(${denominator})`;
  const divided = `${offset} = ${denominator}`;
  const x = h + offset;
  return { input, task: 'Solve for x and preserve the denominator restriction.', expected: solutions([x]),
    restrictions: [`x != ${h}`],
    referenceSteps: [
      step(input, multiplied, 'multiply_both_sides', `Multiply both sides by ${denominator}, which is nonzero on the domain.`),
      step(multiplied, divided, 'divide_both_sides', `Divide both sides by ${b}.`),
      step(divided, `x = ${x}`, 'isolate_variable', `Add ${h} to both sides and write x first.`),
    ],
    intentional_errors: [mistake(divided, `x = ${offset - h}`, 'sign_error', 'Moving the denominator shift uses the wrong sign.')] };
}

function rationalFunction(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const a = signed(1, magnitude);
  const h = score < 200 ? 0 : signed(1, magnitude);
  const k = signed(1, score < 400 ? 3 : magnitude);
  const denominator = sum('x', -h);
  const input = `f(x) = ${sum(`${a}/(${denominator})`, k)}`;
  const shifted = `${sum('f(x)', -k)} = ${a}/(${denominator})`;
  const relation = `(${denominator})*(${sum('f(x)', -k)}) = ${a}`;
  return { input, task: 'Find the domain, range, asymptotes, intercepts, and transformations from 1/x.',
    expected: {
      kind: 'rational_function', a, h, k, parent: '1/x',
      domain: { variable: 'x', excluded: [String(h)] },
      range: { variable: 'y', excluded: [String(k)] },
      verticalAsymptote: `x = ${h}`, horizontalAsymptote: `y = ${k}`,
      xIntercept: fraction(h * k - a, k),
      yIntercept: h === 0 ? null : fraction(k * h - a, h),
      transformations: { horizontalShift: h, verticalScale: a, verticalShift: k },
    }, restrictions: [`x != ${h}`],
    referenceSteps: [
      step(input, shifted, 'subtract_same_value_from_both_sides', `Subtract the vertical shift ${k} from both sides.`),
      step(shifted, relation, 'multiply_both_sides', `Multiply by ${denominator} on the restricted domain. Since ${a} is nonzero, neither factor can be zero.`),
    ].map(reference => ({ ...reference, relation: 'transformation' })),
    intentional_errors: [mistake(input, `x = ${h + int(1, 3)}`, 'incorrect_vertical_asymptote', 'The vertical asymptote occurs where the original denominator is zero.')] };
}

function polynomialSimplification(ctx) {
  const { signed, score, magnitude } = ctx;
  if (score >= 650) {
    const a = signed(1, magnitude), b = signed(1, magnitude);
    const c = signed(1, magnitude);
    let d = signed(1, magnitude);
    if (a * d + b * c === 0) d += 1;
    const input = `(${linearExpression(a, b)})*(${linearExpression(c, d)})`;
    const coefficients = [b * d, a * d + b * c, a * c];
    const expanded = `${polynomial([0, a * d, a * c])} + (${polynomial([b * d, b * c])})`;
    const expression = polynomial(coefficients);
    return { input, task: 'Expand and combine like terms.', expected: { kind: 'expression', expression, coefficients },
      referenceSteps: [
        step(input, expanded, 'distributive_property', 'Multiply each term in the first factor by each term in the second.'),
        step(expanded, expression, 'combine_like_terms', 'Add coefficients of terms with the same power of x.'),
      ], intentional_errors: [mistake(input, polynomial([b * d, 0, a * c]), 'missing_cross_terms', 'Multiplying only the leading and constant terms omits both cross products.')] };
  }
  const left = [signed(1, magnitude), signed(1, magnitude), signed(1, magnitude)];
  const right = [signed(1, magnitude), signed(1, magnitude), signed(1, magnitude)];
  const coefficients = left.map((value, index) => value + right[index]);
  const input = `(${polynomial(left)}) + (${polynomial(right)})`;
  const expression = polynomial(coefficients);
  return { input, task: 'Simplify by combining like terms.', expected: { kind: 'expression', expression, coefficients },
    referenceSteps: [step(input, expression, 'combine_like_terms', 'Add the coefficients of matching powers of x.')],
    intentional_errors: [mistake(input, sum(expression, 1), 'incorrect_combination', 'The constant coefficient is one larger than the sum of the original constants.')] };
}

function system(ctx) {
  const { signed, magnitude } = ctx;
  const x = signed(1, magnitude), y = signed(1, magnitude);
  const a = signed(1, magnitude), b = signed(1, magnitude), c = signed(1, magnitude);
  let d = signed(1, magnitude);
  if (a * d === b * c) d += 1;
  const rhs1 = a * x + b * y, rhs2 = c * x + d * y;
  const eq = (u, v, rhs) => `${linearExpression(u)} ${v < 0 ? '-' : '+'} ${Math.abs(v)}*y = ${rhs}`;
  const input = { kind: 'system', equations: [eq(a, b, rhs1), eq(c, d, rhs2)], variables: ['x', 'y'] };
  const determinant = a * d - b * c;
  const triangular = { ...input, equations: [input.equations[0], `${determinant}*y = ${a * rhs2 - c * rhs1}`] };
  const normalized = { ...input, equations: [input.equations[0], `y = ${y}`] };
  const substituted = { ...input, equations: [`${a}*x = ${rhs1 - b * y}`, `y = ${y}`] };
  const solved = { ...input, equations: [`x = ${x}`, `y = ${y}`] };
  return { input, task: 'Solve the system for x and y.', expected: { kind: 'system', solutions: { x: String(x), y: String(y) } },
    referenceSteps: [
      step(input, triangular, 'elimination', `Replace the second equation with ${a} times the second minus ${c} times the first; the first equation is retained.`),
      step(triangular, normalized, 'divide_both_sides', `Divide the second equation by the nonzero coefficient ${determinant}; retain the first equation.`),
      step(normalized, substituted, 'substitution', 'Substitute the isolated value of y into the first equation and retain y as a constraint.'),
      step(substituted, solved, 'divide_both_sides', 'Divide the remaining nonzero coefficient to isolate x.'),
    ], intentional_errors: [mistake(substituted, { ...input, equations: [`x = ${x + 1}`, `y = ${y}`] }, 'incorrect_substitution', 'The reported x value does not satisfy the retained first equation.')] };
}

function exponential(ctx) {
  const { int, score } = ctx;
  const base = [2, 3, 5][int(0, 2)];
  const exponent = int(1, score < 400 ? 3 : 6) * (score >= 650 && int(0, 1) ? -1 : 1);
  const rhs = exponent < 0 ? fraction(1, base ** -exponent) : String(base ** exponent);
  const input = `${base}^x = ${rhs}`;
  const rewritten = `${base}^x = ${base}^(${exponent})`;
  return { input, task: 'Solve for x using equal bases.', expected: solutions([exponent]),
    referenceSteps: [
      step(input, rewritten, 'rewrite_as_power', 'Express the right side as a power of the same positive base.'),
      step(rewritten, `x = ${exponent}`, 'equal_exponents', 'Powers of the same positive base other than 1 are equal only when their exponents are equal.'),
    ], intentional_errors: [mistake(rewritten, `x = ${exponent + 1}`, 'incorrect_exponent', 'The exponent is one larger than the exponent on the right.')] };
}

function radical(ctx) {
  const { int, signed, magnitude } = ctx;
  const a = signed(1, magnitude), b = int(2, magnitude);
  const input = `sqrt(${sum('x', a)}) = ${b}`;
  const squared = `${sum('x', a)} = ${b * b}`;
  const x = b * b - a;
  return { input, task: 'Solve for x and check the original square root domain.', expected: solutions([x]),
    restrictions: [`${sum('x', a)} >= 0`],
    referenceSteps: [
      step(input, squared, 'square_both_sides', 'Both sides are nonnegative, so squaring is reversible on the stated domain.'),
      step(squared, `x = ${x}`, 'subtract_same_value_from_both_sides', `Subtract ${a} from both sides. Substitution gives sqrt(${b * b}) = ${b}.`),
    ], intentional_errors: [mistake(input, `${sum('x', a)} = ${b}`, 'unsquared_right_side', 'Removing a square root requires squaring the right side as well.')] };
}

function logarithmic(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const exponent = int(score >= 650 ? -3 : 0, score < 400 ? 2 : 4);
  const shift = score >= 400 ? signed(1, magnitude) : 0;
  const argument = sum('x', shift);
  const denominator = exponent < 0 ? 10 ** -exponent : 1;
  const numerator = exponent < 0 ? 1 : 10 ** exponent;
  const power = fraction(numerator, denominator);
  const answer = fraction(numerator - shift * denominator, denominator);
  const input = `log(${argument}) = ${exponent}`;
  const exponentialForm = `${argument} = 10^(${exponent})`;
  const evaluated = `${argument} = ${power}`;
  const referenceSteps = [
      step(input, exponentialForm, 'logarithm_definition', 'A base-10 logarithm equals the exponent to which 10 must be raised.'),
      step(exponentialForm, evaluated, 'evaluate_power', 'Evaluate the power of 10; the logarithm argument is positive.'),
  ];
  if (shift) referenceSteps.push(step(evaluated, `x = ${answer}`, 'subtract_same_value_from_both_sides', `Subtract ${shift} from both sides.`));
  return { input, task: 'Solve for x; log denotes the base-10 logarithm.', expected: { ...solutions([answer]), base: 10 }, restrictions: [`${argument} > 0`],
    referenceSteps,
    intentional_errors: [mistake(input, `${argument} = ${exponent}`, 'logarithm_as_identity', 'A logarithm is not the identity function; exponentiation by the base is required.')] };
}

function absoluteValue(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const h = signed(1, magnitude), radius = int(1, magnitude);
  const a = score >= 650 ? int(2, 5) : 1;
  const k = score >= 650 ? signed(1, magnitude) : 0;
  const absolute = `abs(${sum('x', -h)})`;
  const input = `${sum(`${a === 1 ? '' : `${a}*`}${absolute}`, k)} = ${a * radius + k}`;
  const isolated = `${absolute} = ${radius}`;
  const referenceSteps = [];
  if (a !== 1) {
    const shifted = `${a}*${absolute} = ${a * radius}`;
    referenceSteps.push(step(input, shifted, 'subtract_same_value_from_both_sides', `Subtract ${k} from both sides.`));
    referenceSteps.push(step(shifted, isolated, 'divide_both_sides', `Divide both sides by the positive coefficient ${a}.`));
  }
  referenceSteps.push(step(isolated, `${sum('x', -h)} = ${radius} or ${sum('x', -h)} = ${-radius}`, 'absolute_value_cases', 'A positive absolute value has a positive and a negative case.'));
  referenceSteps.push(step(referenceSteps.at(-1).after, `x = ${h - radius} or x = ${h + radius}`, 'solve_each_case', 'Isolate x in both cases.'));
  return { input, task: 'Find all real solutions for x.', expected: solutions([h - radius, h + radius]), referenceSteps,
    intentional_errors: [mistake(isolated, `x = ${h + radius}`, 'lost_absolute_value_case', 'Using only the positive case loses the distinct negative case.')] };
}

const reversed = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

function inequalities(ctx) {
  const { int, signed, score, magnitude } = ctx;
  const a = int(2, magnitude) * (score >= 400 ? -1 : 1);
  const b = signed(1, magnitude), boundary = signed(1, magnitude);
  const relation = ['<', '<=', '>', '>='][int(0, 3)];
  const resultRelation = a < 0 ? reversed[relation] : relation;
  const rhs = a * boundary + b;
  const input = `${linearExpression(a, b)} ${relation} ${rhs}`;
  const isolated = `${linearExpression(a)} ${relation} ${rhs - b}`;
  const answer = `x ${resultRelation} ${boundary}`;
  return { input, task: 'Solve the inequality for x.',
    expected: { kind: 'inequality', variable: 'x', relation: resultRelation, boundary: String(boundary), expression: answer },
    referenceSteps: [
      step(input, isolated, 'subtract_same_value_from_both_sides', `Subtract ${b} from both sides.`),
      step(isolated, answer, a < 0 ? 'divide_negative_reverse_inequality' : 'divide_positive_inequality', `Divide both sides by ${a}${a < 0 ? ' and reverse the inequality direction' : ''}.`),
    ], intentional_errors: [mistake(isolated, `x ${relation} ${a < 0 ? boundary : boundary + 1}`, a < 0 ? 'inequality_not_reversed' : 'incorrect_division', a < 0 ? 'Dividing by a negative coefficient must reverse the inequality.' : 'The boundary is not the quotient of the two sides.')] };
}

function sequence(ctx, type) {
  const { int, signed, score, magnitude } = ctx;
  const first = signed(1, magnitude), n = int(2, score < 400 ? 5 : 9);
  const change = type === 'arithmetic' ? signed(1, magnitude)
    : int(2, score >= 650 ? 4 : 3) * (score >= 650 && int(0, 1) ? -1 : 1);
  const input = { kind: 'sequence', type, first, [type === 'arithmetic' ? 'step' : 'ratio']: change, n };
  const value = type === 'arithmetic' ? first + (n - 1) * change : first * change ** (n - 1);
  const formula = type === 'arithmetic' ? `${first} + (${n} - 1)*(${change})` : `${first}*(${change})^(${n} - 1)`;
  const substituted = `a_${n} = ${formula}`;
  const wrong = type === 'arithmetic' ? first + n * change : first * change ** n;
  return { input, task: `Find term ${n} of the ${type} sequence (the first term has index 1).`,
    expected: { kind: 'sequence', type, n, value, exact: String(value) },
    referenceSteps: [
      step(input, substituted, `${type}_sequence_formula`, `There are ${n - 1} ${type === 'arithmetic' ? 'additions of the common difference' : 'multiplications by the common ratio'} after the first term.`),
      step(substituted, `a_${n} = ${value}`, 'evaluate_expression', 'Evaluate the substituted nth-term formula.'),
    ], intentional_errors: [mistake(input, `a_${n} = ${wrong}`, 'sequence_off_by_one', 'Using n changes instead of n - 1 shifts the answer by one term.')] };
}

function geometry(ctx, topic) {
  const { int, score, magnitude } = ctx;
  const triple = [[3, 4, 5], [5, 12, 13], [8, 15, 17]][int(0, score < 400 ? 0 : 2)];
  const scale = int(1, score < 400 ? 2 : 5);
  const [a, b, c] = triple.map(value => value * scale);
  let input, before, variable;
  if (topic === 'distance') {
    const x = int(-magnitude, magnitude), y = int(-magnitude, magnitude);
    const dx = a * (int(0, 1) ? 1 : -1), dy = b * (int(0, 1) ? 1 : -1);
    input = { kind: 'geometry', topic, points: [[x, y], [x + dx, y + dy]] };
    before = `d^2 = (${sum(String(x + dx), -x)})^2 + (${sum(String(y + dy), -y)})^2`;
    variable = 'd';
  } else {
    input = { kind: 'geometry', topic, a, b };
    before = `c^2 = ${a}^2 + ${b}^2`;
    variable = 'c';
  }
  const squared = `${variable}^2 = ${c * c}`;
  return { input, task: topic === 'distance' ? 'Find the distance between the two points.' : 'Find the hypotenuse of the right triangle with legs a and b.',
    expected: { kind: 'geometry', topic, value: c, exact: String(c) }, restrictions: [`${variable} >= 0`],
    referenceSteps: [
      step(input, before, topic === 'distance' ? 'distance_formula' : 'pythagorean_theorem', 'The square of the required length is the sum of the two squared perpendicular components.'),
      step(before, squared, 'evaluate_expression', 'Square the components and add them.'),
      step(squared, `${variable} = ${c}`, 'nonnegative_square_root', 'A length is nonnegative, so take the positive square root.'),
    ], intentional_errors: [mistake(input, `${variable} = ${a + b}`, 'adding_perpendicular_lengths', 'Adding perpendicular lengths does not give the straight-line distance or the hypotenuse.')] };
}

// This small exact oracle builds the generator's proposed answer from its
// parameters. The public engine separately solves the structured request and
// replays its certificate before accepting it.
const PC_ROOTS = [1, 2, 3, 6];
const PC_KEYS = ['rational', 'sqrt2', 'sqrt3', 'sqrt6'];
const pcField = (r = 0, s2 = 0, s3 = 0, s6 = 0) => [r, s2, s3, s6].map(Q);
const pcZero = () => pcField();
const pcOne = () => pcField(1);
const pcAdd = (a, b) => a.map((value, i) => value.add(b[i]));
const pcNeg = a => a.map(value => value.neg());
const pcSub = (a, b) => pcAdd(a, pcNeg(b));
const pcScale = (a, q) => a.map(value => value.mul(q));
const pcZeroValue = a => a.every(value => value.zero);

function pcMul(a, b) {
  const result = pcZero();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    result[i ^ j] = result[i ^ j].add(a[i].mul(b[j]).mul(PC_ROOTS[i & j]));
  }
  return result;
}

function pcDivide(a, b) {
  if (pcZeroValue(b)) throw new RangeError('Cannot generate division by zero.');
  const conjugate = (flip2, flip3) => b.map((value, i) =>
    value.mul((i & 1 ? flip2 : 1) * (i & 2 ? flip3 : 1)));
  const partner = pcMul(pcMul(conjugate(-1, 1), conjugate(1, -1)), conjugate(-1, -1));
  const denominator = pcMul(b, partner);
  if (denominator.slice(1).some(value => !value.zero) || denominator[0].zero) {
    throw new RangeError('Generated scalar is outside the exact field.');
  }
  return pcScale(pcMul(a, partner), Q(1).div(denominator[0]));
}

function pcExact(a) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const q = a[i];
    if (q.zero) continue;
    const magnitude = q.n < 0n ? q.neg() : q;
    let body = i === 0 ? String(magnitude) : `sqrt(${PC_ROOTS[i]})`;
    if (i && magnitude.n !== 1n) body = `${magnitude.n}*${body}`;
    if (i && magnitude.d !== 1n) body += `/${magnitude.d}`;
    parts.push(`${parts.length ? q.n < 0n ? ' - ' : ' + ' : q.n < 0n ? '-' : ''}${body}`);
  }
  return { expression: parts.join('') || '0',
    coefficients: Object.fromEntries(PC_KEYS.map((key, i) => [key, String(a[i])])) };
}

function pcScalar(value) {
  return value && typeof value === 'object'
    ? PC_KEYS.map(key => Q(value[key] ?? 0)) : pcField(value);
}

const pcVector = values => ({ exact: true, dimension: values.length, components: values.map(pcExact) });
const pcDot = (a, b) => a.reduce((value, entry, i) => pcAdd(value, pcMul(entry, b[i])), pcZero());
const pcAngle = index => String(Q(index).div(12));

// Independent, known unit-circle values for 0, 15, 30, 45, 60 and 75 degrees.
const PC_FIRST_QUADRANT = [
  [pcField(1), pcField(0)],
  [pcField(0, '1/4', 0, '1/4'), pcField(0, '-1/4', 0, '1/4')],
  [pcField(0, 0, '1/2'), pcField('1/2')],
  [pcField(0, '1/2'), pcField(0, '1/2')],
  [pcField('1/2'), pcField(0, 0, '1/2')],
  [pcField(0, '-1/4', 0, '1/4'), pcField(0, '1/4', 0, '1/4')],
];

function pcUnit(index) {
  const [c, s] = PC_FIRST_QUADRANT[index % 6];
  switch (Math.floor(index / 6)) {
    case 0: return { cos: c, sin: s };
    case 1: return { cos: pcNeg(s), sin: c };
    case 2: return { cos: pcNeg(c), sin: pcNeg(s) };
    default: return { cos: s, sin: pcNeg(c) };
  }
}

function pcRotate(point, index) {
  const { cos, sin } = pcUnit(index);
  return [pcSub(pcMul(point[0], cos), pcMul(point[1], sin)),
    pcAdd(pcMul(point[0], sin), pcMul(point[1], cos))];
}

function pcNorm(squared) {
  const q = squared[0];
  if (squared.slice(1).some(value => !value.zero)) {
    throw new RangeError('This generator only proposes rational squared norms.');
  }
  for (let i = 0; i < 4; i++) {
    const root = rationalSqrt(q.div(PC_ROOTS[i]));
    if (root !== null) {
      const value = pcZero(); value[i] = root;
      return { squared: pcExact(squared), magnitude: pcExact(value) };
    }
  }
  return { squared: pcExact(squared), magnitude: { expression: `sqrt(${q})`, radicand: String(q) } };
}

function precalculusAnswer(input, index) {
  const { topic, operation } = input;
  if (topic === 'trigonometry') {
    const resultIndex = operation === 'unit_circle' ? index
      : operation === 'double_angle' ? (2 * index) % 24
      : (input.firstIndex + (operation === 'angle_sum' ? input.secondIndex : -input.secondIndex) + 24) % 24;
    const { cos, sin } = pcUnit(resultIndex);
    return { exact: true, piMultiple: pcAngle(resultIndex), cos: pcExact(cos), sin: pcExact(sin),
      tan: pcZeroValue(cos) ? null : pcExact(pcDivide(sin, cos)) };
  }
  if (topic === 'polar') {
    if (operation === 'to_cartesian') {
      const r = Q(input.radius), unit = pcUnit(index);
      return { ...pcVector([pcScale(unit.cos, r), pcScale(unit.sin, r)]),
        radius: String(r), piMultiple: pcAngle(index) };
    }
    return pcVector(pcRotate(input.point.map(pcScalar), index));
  }
  const a = input.a.map(pcScalar), b = input.b?.map(pcScalar);
  if (operation === 'add' || operation === 'subtract') {
    return pcVector(a.map((value, i) => operation === 'add' ? pcAdd(value, b[i]) : pcSub(value, b[i])));
  }
  if (operation === 'scale') return pcVector(a.map(value => pcMul(value, pcScalar(input.factor))));
  if (operation === 'dot') {
    const value = pcDot(a, b);
    return { exact: true, value: pcExact(value), orthogonal: pcZeroValue(value) };
  }
  if (operation === 'cross') {
    if (a.length === 2) return { exact: true,
      determinant: pcExact(pcSub(pcMul(a[0], b[1]), pcMul(a[1], b[0]))) };
    return pcVector([pcSub(pcMul(a[1], b[2]), pcMul(a[2], b[1])),
      pcSub(pcMul(a[2], b[0]), pcMul(a[0], b[2])),
      pcSub(pcMul(a[0], b[1]), pcMul(a[1], b[0]))]);
  }
  if (operation === 'norm') return { exact: true, ...pcNorm(pcDot(a, a)) };
  if (operation === 'distance') {
    const delta = a.map((value, i) => pcSub(value, b[i]));
    return { exact: true, delta: pcVector(delta), ...pcNorm(pcDot(delta, delta)) };
  }
  if (operation === 'projection') {
    const factor = pcDivide(pcDot(a, b), pcDot(b, b));
    return { ...pcVector(b.map(value => pcMul(value, factor))), factor: pcExact(factor) };
  }
  return pcVector(pcRotate(a, index));
}

function precalculus(ctx, topic) {
  const { int, signed, score, magnitude } = ctx;
  const angleIndex = () => int(0, 23);
  const number = () => signed(1, Math.min(magnitude, 8));
  let input, index = angleIndex();
  if (topic === 'trigonometry') {
    const operation = score < 400 ? 'unit_circle'
      : score < 650 ? ['angle_sum', 'angle_difference'][int(0, 1)]
      : ['unit_circle', 'angle_sum', 'angle_difference', 'double_angle'][int(0, 3)];
    if (operation === 'angle_sum' || operation === 'angle_difference') {
      const secondIndex = angleIndex();
      input = { kind: 'precalculus', topic, operation, angleA: pcAngle(index), angleB: pcAngle(secondIndex) };
      // Indexes are local construction data, never sent to the strict public schema.
      index = { firstIndex: index, secondIndex };
    } else input = { kind: 'precalculus', topic, operation, angle: pcAngle(index) };
  } else if (topic === 'polar') {
    const operation = score < 400 ? 'to_cartesian'
      : ['to_cartesian', 'rotate'][int(0, 1)];
    if (operation === 'to_cartesian') input = { kind: 'precalculus', topic, operation,
      radius: fraction(int(1, magnitude), int(1, 4)), angle: pcAngle(index) };
    else input = { kind: 'precalculus', topic, operation,
      point: [number(), number()], angle: pcAngle(index) };
  } else {
    const operation = score < 400 ? ['add', 'subtract', 'scale', 'dot'][int(0, 3)]
      : score < 650 ? ['add', 'subtract', 'dot', 'cross', 'norm', 'distance'][int(0, 5)]
      : ['cross', 'norm', 'distance', 'projection', 'rotate'][int(0, 4)];
    const dimension = operation === 'rotate' ? 2 : score >= 650 && int(0, 1) ? 3 : 2;
    const a = Array.from({ length: dimension }, number);
    const b = Array.from({ length: dimension }, number);
    input = { kind: 'precalculus', topic, operation, a };
    if (['add', 'subtract', 'dot', 'cross', 'distance', 'projection'].includes(operation)) input.b = b;
    if (operation === 'scale') input.factor = fraction(int(1, magnitude), int(1, 4));
    if (operation === 'rotate') input.angle = pcAngle(index);
  }
  const construction = typeof index === 'number' ? { angleIndex: index } : index;
  const answer = precalculusAnswer({ ...input, ...construction }, construction.angleIndex ?? 0);
  const wrong = JSON.parse(JSON.stringify(answer));
  const alter = value => {
    if (!value || typeof value !== 'object') return false;
    if (value.coefficients) {
      const changed = pcExact(pcAdd(pcScalar(value.coefficients), pcOne()));
      Object.assign(value, changed);
      return true;
    }
    return Object.values(value).some(alter);
  };
  alter(wrong);
  const task = `Find the exact ${topic} result for ${input.operation}.`;
  return { input, task, expected: { kind: 'precalculus', topic, operation: input.operation, answer },
    referenceSteps: [step(input, answer, 'exact_precalculus_calculation',
      'Use the exact unit-circle and vector identities; express every scalar in Q(sqrt(2), sqrt(3)).')],
    intentional_errors: [mistake(input, wrong, 'incorrect_exact_scalar',
      'Adding 1 to an exact scalar changes the result.')], restrictions: [] };
}

function precalculusPrompt(input, task) {
  const angle = value => `${value}π`;
  const vector = values => `(${values.map(value => pcExact(pcScalar(value)).expression).join(', ')})`;
  if (input.topic === 'trigonometry') {
    return `${task} ${input.angle === undefined
      ? `${angle(input.angleA)} and ${angle(input.angleB)}` : angle(input.angle)}.`;
  }
  if (input.topic === 'polar') {
    if (input.operation === 'to_cartesian') return `${task} (r, θ) = (${input.radius}, ${angle(input.angle)}).`;
    return `${task} Rotate ${vector(input.point)} by ${angle(input.angle)}.`;
  }
  return `${task} a = ${vector(input.a)}${input.b ? `, b = ${vector(input.b)}` : ''}` +
    `${input.factor === undefined ? '' : `, factor = ${input.factor}`}` +
    `${input.angle === undefined ? '' : `, angle = ${angle(input.angle)}`}.`;
}

function dataReasoning(ctx, topic) {
  const { int, signed, score, magnitude } = ctx;
  let input, answer;
  if (topic === 'regression') {
    const operation = score < 400 ? 'fit' : ['fit', 'correlation'][int(0, 1)];
    const n = int(3, score >= 650 ? 6 : 4), start = signed(0, 4);
    const slope = signed(1, Math.min(magnitude, 6)), intercept = signed(0, magnitude);
    const noiseIndex = int(0, n - 1), noise = score < 400 ? 0 : signed(0, 3);
    const points = Array.from({ length: n }, (_, i) => {
      const x = start + i;
      return [x, slope * x + intercept + (i === noiseIndex ? noise : 0)];
    });
    input = { kind: 'data_reasoning', topic, operation, points };
    if (operation === 'fit' && score >= 400) input.at = fraction(int(1, 9), int(1, 3));
    const count = Q(n), xs = points.reduce((a, p) => a.add(p[0]), Q(0));
    const ys = points.reduce((a, p) => a.add(p[1]), Q(0));
    const xx = points.reduce((a, p) => a.add(Q(p[0]).mul(p[0])), Q(0));
    const yy = points.reduce((a, p) => a.add(Q(p[1]).mul(p[1])), Q(0));
    const xy = points.reduce((a, p) => a.add(Q(p[0]).mul(p[1])), Q(0));
    const sxx = count.mul(xx).sub(xs.mul(xs));
    const syy = count.mul(yy).sub(ys.mul(ys));
    const sxy = count.mul(xy).sub(xs.mul(ys));
    const fittedSlope = sxy.div(sxx), fittedIntercept = ys.sub(fittedSlope.mul(xs)).div(count);
    const radical = sxx.mul(syy), root = syy.zero ? null : rationalSqrt(radical);
    answer = { slope: String(fittedSlope), intercept: String(fittedIntercept),
      correlation: syy.zero ? null : sxy.zero ? '0' : root ? String(sxy.div(root)) : `${sxy}/sqrt(${radical})`,
      correlationSquared: syy.zero ? null : String(sxy.mul(sxy).div(radical)), exact: true };
    if (input.at !== undefined) {
      answer.at = String(Q(input.at));
      answer.prediction = String(fittedSlope.mul(input.at).add(fittedIntercept));
    }
  } else {
    const operation = score < 400 ? 'conditional_probability'
      : ['conditional_probability', 'independence'][int(0, 1)];
    const rows = score >= 650 ? int(2, 3) : 2, columns = score >= 650 ? int(2, 3) : 2;
    const rowWeights = Array.from({ length: rows }, () => int(1, magnitude));
    const columnWeights = Array.from({ length: columns }, () => int(1, magnitude));
    const table = rowWeights.map(row => columnWeights.map(column => row * column));
    if (operation === 'conditional_probability' || int(0, 1)) table[int(0, rows - 1)][int(0, columns - 1)] += int(1, 4);
    input = { kind: 'data_reasoning', topic: 'two_way_table', operation, table };
    const rowTotals = table.map(row => row.reduce((a, b) => a + b, 0));
    const columnTotals = columnWeights.map((_, j) => table.reduce((a, row) => a + row[j], 0));
    const total = rowTotals.reduce((a, b) => a + b, 0);
    if (operation === 'independence') {
      answer = { independent: table.every((row, i) => row.every((cell, j) =>
        cell * total === rowTotals[i] * columnTotals[j])), exact: true };
    } else {
      const event = { axis: int(0, 1) ? 'row' : 'column', index: 0 };
      const given = { axis: int(0, 1) ? 'row' : 'column', index: 0 };
      event.index = int(0, event.axis === 'row' ? rows - 1 : columns - 1);
      given.index = int(0, given.axis === 'row' ? rows - 1 : columns - 1);
      input.event = event; input.given = given;
      const givenCount = given.axis === 'row' ? rowTotals[given.index] : columnTotals[given.index];
      let jointCount = 0;
      for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
        const inEvent = (event.axis === 'row' ? i : j) === event.index;
        const inGiven = (given.axis === 'row' ? i : j) === given.index;
        if (inEvent && inGiven) jointCount += table[i][j];
      }
      answer = { probability: fraction(jointCount, givenCount), jointCount: String(jointCount),
        givenCount: String(givenCount), exact: true };
    }
  }
  const wrong = JSON.parse(JSON.stringify(answer));
  if (topic === 'regression') wrong.slope = String(Q(answer.slope).add(1));
  else if (input.operation === 'independence') wrong.independent = !answer.independent;
  else wrong.probability = String(Q(answer.probability).add(1));
  const task = topic === 'regression' ? 'Find the exact least-squares line and correlation.'
    : input.operation === 'independence' ? 'Determine whether the two-way table is independent.'
      : 'Find the exact conditional probability from the two-way table.';
  return { input, task, expected: { kind: 'data_reasoning', topic: input.topic, operation: input.operation, answer },
    referenceSteps: [step(input, answer, 'exact_data_reasoning',
      'Use exact paired sums or table counts and reduce the resulting rational values.')],
    intentional_errors: [mistake(input, wrong, 'incorrect_count_or_fit',
      'The proposed result changes an exact count, slope, or independence decision.')], restrictions: [] };
}

const piText = coefficient => coefficient.zero ? '0' : coefficient.eq(1) ? 'pi' : `(${coefficient}) * pi`;
const radicalText = (coefficient, root = 1) => root === 1 ? String(coefficient) : `(${coefficient}) * sqrt(${root})`;

function exactGeometry(ctx, topic) {
  const { int, signed, magnitude } = ctx;
  const x = signed(0, magnitude), y = signed(0, magnitude);
  let input, answer;
  if (topic === 'perpendicular_bisector') {
    const dx = signed(1, magnitude), dy = signed(1, magnitude);
    input = { kind: 'geometry', topic, points: [[x, y], [x + dx, y + dy]] };
    const mx = Q(2 * x + dx).div(2), my = Q(2 * y + dy).div(2);
    answer = { midpoint: [String(mx), String(my)], normal: [String(dx), String(dy)],
      equation: `(${dx}) * (x - (${mx})) + (${dy}) * (y - (${my})) = 0` };
  } else if (topic === 'circumcircle') {
    const dx = signed(1, magnitude), dy = signed(1, magnitude);
    input = { kind: 'geometry', topic, points: [[x, y], [x + dx, y], [x, y + dy]] };
    const cx = Q(2 * x + dx).div(2), cy = Q(2 * y + dy).div(2);
    const r2 = Q(dx * dx + dy * dy).div(4);
    answer = { center: [String(cx), String(cy)], radiusSquared: String(r2),
      equation: `(x - (${cx}))^2 + (y - (${cy}))^2 = ${r2}` };
  } else if (topic === 'circle_arc' || topic === 'circle_sector') {
    const radius = int(1, magnitude), centralAngle = int(1, 12) * 30;
    input = { kind: 'geometry', topic, radius, centralAngle };
    answer = { arcLength: piText(Q(radius * centralAngle).div(180)) };
    if (topic === 'circle_sector') answer.area = piText(Q(radius * radius * centralAngle).div(360));
  } else {
    const pattern = int(0, 1) ? '30-60-90' : '45-45-90';
    const knownSide = pattern === '30-60-90'
      ? ['short_leg', 'long_leg', 'hypotenuse'][int(0, 2)] : ['leg', 'hypotenuse'][int(0, 1)];
    const length = int(1, magnitude), q = Q(length);
    input = { kind: 'geometry', topic, pattern, knownSide, length };
    if (pattern === '30-60-90') {
      const short = knownSide === 'short_leg' ? q : knownSide === 'hypotenuse' ? q.div(2) : q.div(3);
      const root = knownSide === 'long_leg' ? 3 : 1;
      answer = { shortLeg: radicalText(short, root),
        longLeg: knownSide === 'long_leg' ? String(q) : radicalText(short, 3),
        hypotenuse: knownSide === 'hypotenuse' ? String(q) : radicalText(short.mul(2), root) };
    } else {
      const leg = knownSide === 'leg' ? String(q) : radicalText(q.div(2), 2);
      answer = { leg1: leg, leg2: leg,
        hypotenuse: knownSide === 'hypotenuse' ? String(q) : radicalText(q, 2) };
    }
  }
  const wrong = JSON.parse(JSON.stringify(answer));
  const key = Object.keys(wrong)[0];
  if (Array.isArray(wrong[key])) wrong[key][0] = String(Q(wrong[key][0]).add(1));
  else if (topic === 'circle_arc' || topic === 'circle_sector') wrong[key] = `${wrong[key]} + 1`;
  else wrong[key] = `${wrong[key]} + 1`;
  const task = `Find the exact ${topic.replaceAll('_', ' ')} result.`;
  return { input, task, expected: { kind: 'geometry_exact', topic, answer },
    referenceSteps: [step(input, answer, 'exact_geometry_construction',
      'Use exact rational coordinates, pi coefficients, or special-triangle side ratios.')],
    intentional_errors: [mistake(input, wrong, 'incorrect_exact_measurement',
      'The proposed exact coordinate or measurement differs from the computed result.')], restrictions: [] };
}

function structuredPrompt(input, task) {
  if (input.kind === 'data_reasoning') {
    if (input.topic === 'regression') return `${task} Paired observations: ` +
      `${input.points.map(point => `(${point.join(', ')})`).join(', ')}` +
      `${input.at === undefined ? '' : `; predict at x = ${input.at}`}.`;
    return `${task} Table: ${input.table.map(row => `[${row.join(', ')}]`).join(' ')}.` +
      `${input.event ? ` Event: ${input.event.axis} ${input.event.index + 1}; given: ${input.given.axis} ${input.given.index + 1}.` : ''}`;
  }
  if (input.points) return `${task} Points: ${input.points.map(point => `(${point.join(', ')})`).join(', ')}.`;
  if (input.radius) return `${task} Radius ${input.radius}; central angle ${input.centralAngle}°.`;
  return `${task} ${input.pattern}, given ${input.knownSide.replaceAll('_', ' ')} ${input.length}.`;
}

const FAMILIES = {
  linear, distribution, quadratic, rational_equation: rationalEquation,
  rational_function: rationalFunction, polynomial_simplification: polynomialSimplification,
  systems: system, exponential, radical, logarithmic, absolute_value: absoluteValue, inequalities,
  arithmetic_sequence: ctx => sequence(ctx, 'arithmetic'),
  geometric_sequence: ctx => sequence(ctx, 'geometric'),
  distance: ctx => geometry(ctx, 'distance'), pythagorean: ctx => geometry(ctx, 'pythagorean'),
  trigonometry: ctx => precalculus(ctx, 'trigonometry'),
  polar: ctx => precalculus(ctx, 'polar'), vector: ctx => precalculus(ctx, 'vector'),
  regression: ctx => dataReasoning(ctx, 'regression'),
  two_way_probability: ctx => dataReasoning(ctx, 'two_way_probability'),
  perpendicular_bisector: ctx => exactGeometry(ctx, 'perpendicular_bisector'),
  circumcircle: ctx => exactGeometry(ctx, 'circumcircle'),
  circle_arc: ctx => exactGeometry(ctx, 'circle_arc'),
  circle_sector: ctx => exactGeometry(ctx, 'circle_sector'),
  special_right_triangle: ctx => exactGeometry(ctx, 'special_right_triangle'),
};

/** Deterministic templates propose reference paths; only a verifier can accept them. */
export function generateProblem(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Generator options must be an object.');
  }
  const { topic: requestedTopic = 'linear', difficulty = '0.500', seed = 0 } = options;
  const score = difficultyToInt(difficulty);
  if (typeof requestedTopic !== 'string') throw new TypeError('Topic must be a string.');
  const topic = Object.hasOwn(ALIASES, requestedTopic) ? ALIASES[requestedTopic] : requestedTopic;
  const record = TOPICS.find(candidate => candidate.id === topic);
  if (!record) throw new RangeError(`Unknown generator topic: ${requestedTopic}`);
  if (!(typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed)))) {
    throw new TypeError('Seed must be a string or a finite number.');
  }
  const identity = JSON.stringify([topic, difficulty, typeof seed, seed]);
  const fingerprint = hash(identity);
  const random = randomSource(fingerprint);
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const magnitude = 4 + Math.floor(score * 16 / 1000);
  const signed = (low, high) => int(low, high) * (score >= 250 && int(0, 1) ? -1 : 1);
  const generated = FAMILIES[topic]({ int, signed, score, magnitude });
  const estimate = estimateDifficulty(generated.input);
  const problem = typeof generated.input === 'string' ? `${generated.task} ${generated.input}`
    : generated.input.kind === 'precalculus' ? precalculusPrompt(generated.input, generated.task)
    : generated.input.kind === 'data_reasoning' || generated.expected.kind === 'geometry_exact'
      ? structuredPrompt(generated.input, generated.task)
    : generated.input.kind === 'system' ? `${generated.task} ${generated.input.equations.join('; ')}`
    : generated.input.kind === 'sequence' ? `${generated.task} First term: ${generated.input.first}; ${generated.input.type === 'arithmetic' ? `common difference: ${generated.input.step}` : `common ratio: ${generated.input.ratio}`}.`
    : topic === 'distance' ? `${generated.task} ${generated.input.points.map(point => `(${point.join(', ')})`).join(' and ')}.`
    : `${generated.task} a = ${generated.input.a}, b = ${generated.input.b}.`;
  // JSON cloning prevents a consumer changing one path from changing another.
  const clone = value => JSON.parse(JSON.stringify(value));
  return {
    id: `${topic}-${difficulty}-${fingerprint.toString(16).padStart(8, '0')}`,
    subject: record.subject, topic, problem, input: clone(generated.input), task: generated.task,
    difficulty,
    features: { ...estimate.features, intended_difficulty_score: score,
      estimated_learning_difficulty: estimate.difficulty, estimated_engine: estimate.engine },
    expected: generated.expected, referenceSteps: clone(generated.referenceSteps),
    restrictions: generated.restrictions ?? [],
    checkpoints: clone(generated.referenceSteps),
    intentional_errors: clone(generated.intentional_errors), seed,
  };
}
