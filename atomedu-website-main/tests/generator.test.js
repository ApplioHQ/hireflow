import test from 'node:test';
import assert from 'node:assert/strict';
import { difficultyToInt, formatDifficulty, tierForDifficulty, estimateDifficulty } from '../engine/difficulty.js';
import { TOPICS, generateProblem } from '../engine/generator.js';
import { generateProblem as generateVerifiedProblem, solve } from '../engine/index.js';
import { solvePrecalculus, verifyPrecalculusCertificate } from '../engine/precalculus.js';
import { solveDataReasoning, verifyDataReasoningCertificate } from '../engine/data-reasoning.js';
import { solveGeometry, verifyGeometryCertificate } from '../engine/geometry.js';

const SCORE_PATTERN = /^(0\.\d{3}|1\.000)$/;
const BOUNDARIES = ['0.000', '0.249', '0.399', '0.400', '0.583', '0.649', '0.650', '1.000'];

function near(actual, expected, context = '') {
  assert.ok(Number.isFinite(actual), `Nonfinite result: ${actual} (${context})`);
  assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(actual), Math.abs(expected)),
    `${actual} != ${expected} (${context})`);
}

// An independent, deliberately small numeric evaluator for checking the template
// outputs. It does not import the parent's solver or execute expression source.
function evaluate(source, bindings = {}) {
  const tokens = source.match(/\d+(?:\.\d+)?|[a-z]+|[^\s]/gi) ?? [];
  let position = 0;
  const take = token => tokens[position] === token && (++position, true);
  const expect = token => assert.ok(take(token), `Expected ${token} in ${source}`);
  function atom() {
    if (take('(')) {
      const value = expression();
      expect(')');
      return value;
    }
    const token = tokens[position++];
    if (/^\d/.test(token ?? '')) return Number(token);
    if (Object.hasOwn(bindings, token) && typeof bindings[token] === 'number') return bindings[token];
    if (['sqrt', 'abs', 'log', 'f'].includes(token)) {
      expect('(');
      const value = expression();
      expect(')');
      return token === 'sqrt' ? Math.sqrt(value) : token === 'abs' ? Math.abs(value)
        : token === 'log' ? Math.log10(value) : bindings.f(value);
    }
    assert.fail(`Unknown token ${token} in ${source}`);
  }
  function power() {
    const value = atom();
    return take('^') ? value ** unary() : value;
  }
  function unary() {
    if (take('-')) return -unary();
    if (take('+')) return unary();
    return power();
  }
  function term() {
    let value = unary();
    while (position < tokens.length) {
      if (take('*')) value *= unary();
      else if (take('/')) value /= unary();
      else break;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (position < tokens.length) {
      if (take('+')) value += term();
      else if (take('-')) value -= term();
      else break;
    }
    return value;
  }
  const value = expression();
  assert.equal(position, tokens.length, `Unconsumed input in ${source}`);
  return value;
}

function equationResidual(equation, bindings) {
  const [left, right] = equation.split(' = ');
  assert.ok(right !== undefined, `Expected an equation: ${equation}`);
  return evaluate(left, bindings) - evaluate(right, bindings);
}

function satisfied(expression, bindings) {
  if (typeof expression === 'object') {
    assert.equal(expression.kind, 'system');
    return expression.equations.every(equation => satisfied(equation, bindings));
  }
  if (expression.includes(' or ')) return expression.split(' or ').some(part => satisfied(part, bindings));
  const match = expression.match(/^(.*?)\s+(<=|>=|<|>|=)\s+(.*?)$/);
  assert.ok(match, `Expected a relation: ${expression}`);
  const left = evaluate(match[1], bindings), right = evaluate(match[3], bindings);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (match[2]) {
    case '=': return Math.abs(left - right) < 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
  }
}

test('all 1001 integer thousandths round-trip and route with exact boundaries', () => {
  for (let score = 0; score <= 1000; score++) {
    const text = formatDifficulty(score);
    assert.match(text, SCORE_PATTERN);
    assert.equal(text.length, 5);
    assert.equal(difficultyToInt(text), score);
    assert.equal(tierForDifficulty(text), score < 400 ? 1 : score < 650 ? 2 : 3);
  }
});

test('difficulty APIs reject malformed scores instead of rounding or coercing', () => {
  const malformed = [undefined, null, 0, 1, 0.583, 583, NaN, Infinity, {}, [],
    '', '0', '.583', '0.58', '0.5830', '1.001', '1.0000', '-0.001', '+0.583',
    '00.583', ' 0.583', '0.583 ', '0.583\n', '1.000\n', '0.583\r', '0,583', '0.5e2',
    '０.５８３', new String('0.583')];
  for (const value of malformed) {
    assert.throws(() => difficultyToInt(value), TypeError);
    assert.throws(() => tierForDifficulty(value), TypeError);
    assert.throws(() => generateProblem({ difficulty: value === undefined ? null : value }), TypeError);
  }
  for (const value of [-1, 1001, 0.5, 583.001, NaN, Infinity, '583', null, undefined, {}, 1n]) {
    assert.throws(() => formatDifficulty(value), RangeError);
  }
});

test('estimates classify text and structured schemas without mutating input', () => {
  const cases = [
    ['2*x + 3 = 7', 'linear'], ['2*(x + 3) = 8', 'distribution'],
    ['x^2 - 5*x + 6 = 0', 'quadratic'], ['3/(x - 2) = 6', 'rational_equation'],
    ['f(x) = 2/(x - 3) + 1', 'rational_function'], ['2*x^2 + 3*x - x^2', 'polynomial_simplification'],
    ['2^x = 16', 'exponential'], ['sqrt(x + 2) = 3', 'radical'], ['log(x) = 2', 'logarithmic'],
    ['abs(x - 2) = 3', 'absolute_value'], ['-2*x + 1 <= 5', 'inequalities'],
    [{ kind: 'system', equations: ['x + y = 2', 'x - y = 0'], variables: ['x', 'y'] }, 'systems'],
    [{ kind: 'sequence', type: 'arithmetic', first: 2, step: 3, n: 5 }, 'arithmetic_sequence'],
    [{ kind: 'sequence', type: 'geometric', first: 2, ratio: 3, n: 5 }, 'geometric_sequence'],
    [{ kind: 'geometry', topic: 'distance', points: [[0, 0], [3, 4]] }, 'distance'],
    [{ kind: 'geometry', topic: 'pythagorean', a: 3, b: 4 }, 'pythagorean'],
    [{ kind: 'geometry', topic: 'pythagoras', a: 3, b: 4 }, 'pythagorean'],
    [{ kind: 'equation', topic: 'quadratic', equation: 'x^2 = 4' }, 'quadratic'],
  ];
  for (const [input, topic] of cases) {
    const original = structuredClone(input);
    const result = estimateDifficulty(input);
    assert.deepEqual(input, original);
    assert.equal(result.features.topic, topic);
    assert.match(result.difficulty, SCORE_PATTERN);
    assert.equal(result.score, difficultyToInt(result.difficulty));
    assert.equal(result.engine, tierForDifficulty(result.difficulty));
    assert.ok(result.capabilities.length > 0);
    assert.ok(Number.isInteger(result.features.estimated_computational_cost));
    assert.equal(result.features.computational_cost_unit, 'heuristic_work_units');
    assert.match(result.explanation, /separate estimate/);
    assert.match(result.explanation, /No empirical accuracy claim/);
  }
  assert.equal(estimateDifficulty('2x + 3 = 7').features.variables, 1);
  assert.equal(estimateDifficulty('2^x = 2^(6)').features.degree, 1);
  assert.deepEqual(estimateDifficulty({ kind: 'unsupported_shape' }).capabilities, []);
  assert.deepEqual(estimateDifficulty({ kind: 'sequence', type: 'unknown' }).capabilities, []);
  for (const invalid of ['', '   ', null, undefined, 7, [], {}]) {
    assert.throws(() => estimateDifficulty(invalid), TypeError);
  }
});

test('learning scores and computational work are distinct and the calibration is nonlinear', () => {
  const short = estimateDifficulty('2*x + 3 = 7');
  const long = estimateDifficulty('2*x + 3 + 0 + 0 + 0 + 0 + 0 + 0 + 0 = 7');
  assert.equal(short.score, long.score);
  assert.ok(short.features.estimated_computational_cost < long.features.estimated_computational_cost);
  const scores = [2, 4, 8, 16].map(degree => estimateDifficulty(`x^${degree} = 1`).score);
  assert.ok(scores.every((score, index) => !index || score > scores[index - 1]));
  assert.ok(scores[3] - scores[2] < scores[1] - scores[0]);
  assert.ok(estimateDifficulty('f(x) = 2/(x - 3) + 1').score > short.score);
});

test('topic catalog and generator contracts are stable, reproducible, and unverified', () => {
  assert.equal(TOPICS.length, 26);
  assert.equal(new Set(TOPICS.map(topic => topic.id)).size, TOPICS.length);
  assert.ok(Object.isFrozen(TOPICS));
  assert.deepEqual(generateProblem(), generateProblem({ topic: 'linear', difficulty: '0.500', seed: 0 }));
  for (const topic of TOPICS) {
    assert.deepEqual(Object.keys(topic).sort(), ['id', 'label', 'subject']);
    assert.ok(Object.isFrozen(topic));
    assert.ok(['algebra_1', 'algebra_2', 'geometry', 'precalculus', 'data_reasoning'].includes(topic.subject));
    for (const difficulty of BOUNDARIES) {
      for (const seed of [0, -1, 2026, 0.25, '', 'class A 🧮']) {
        const options = { topic: topic.id, difficulty, seed };
        const problem = generateProblem(options);
        assert.deepEqual(problem, generateProblem(options));
        assert.deepEqual(problem, JSON.parse(JSON.stringify(problem)));
        assert.equal(problem.difficulty, difficulty);
        assert.equal(problem.seed, seed);
        assert.equal(problem.topic, topic.id);
        assert.equal(problem.subject, topic.subject);
        assert.equal(problem.features.intended_difficulty_score, difficultyToInt(difficulty));
        assert.ok(problem.id.startsWith(`${topic.id}-${difficulty}-`));
        assert.ok(problem.problem.includes(problem.task));
        assert.ok(problem.referenceSteps.length > 0);
        assert.deepEqual(problem.checkpoints, problem.referenceSteps);
        assert.notEqual(problem.checkpoints, problem.referenceSteps);
        assert.notEqual(problem.checkpoints[0], problem.referenceSteps[0]);
        assert.deepEqual(problem.referenceSteps[0].before, problem.input);
        for (let index = 1; index < problem.referenceSteps.length; index++) {
          assert.deepEqual(problem.referenceSteps[index - 1].after, problem.referenceSteps[index].before);
        }
        for (const reference of problem.referenceSteps) {
          assert.deepEqual(Object.keys(reference).sort(), topic.id === 'rational_function'
            ? ['after', 'before', 'explanation', 'relation', 'rule'] : ['after', 'before', 'explanation', 'rule']);
          if (topic.id === 'rational_function') assert.equal(reference.relation, 'transformation');
          assert.ok(reference.rule && reference.explanation);
        }
        assert.ok(problem.intentional_errors.length > 0);
        assert.ok(Array.isArray(problem.restrictions));
        assert.ok(!JSON.stringify(problem).includes('"verified"'));
        for (const error of problem.intentional_errors) {
          assert.deepEqual(Object.keys(error).sort(), ['after', 'before', 'error_category', 'explanation']);
        }
      }
    }
    const inputs = new Set(Array.from({ length: 20 }, (_, seed) => JSON.stringify(generateProblem({ topic: topic.id, seed }).input)));
    assert.ok(inputs.size > 5, `${topic.id} must vary its mathematical parameters`);
  }
  const first = generateProblem({ topic: 'systems', seed: 'clone' });
  const original = structuredClone(first);
  first.input.equations[0] = 'changed';
  first.checkpoints[0].before.equations[0] = 'changed';
  assert.deepEqual(first.referenceSteps, original.referenceSteps);
  assert.deepEqual(generateProblem({ topic: 'systems', seed: 'clone' }), original);
});

test('aliases are canonical and invalid options fail explicitly', () => {
  const aliases = { linear_equation: 'linear', rational: 'rational_equation', polynomial: 'polynomial_simplification',
    system: 'systems', log: 'logarithmic', abs: 'absolute_value', inequality: 'inequalities',
    arithmetic: 'arithmetic_sequence', geometric: 'geometric_sequence', pythagoras: 'pythagorean',
    two_way_table: 'two_way_probability', conditional_probability: 'two_way_probability' };
  for (const [alias, topic] of Object.entries(aliases)) {
    assert.deepEqual(generateProblem({ topic: alias, seed: 'alias' }), generateProblem({ topic, seed: 'alias' }));
  }
  assert.notEqual(generateProblem({ seed: '1' }).id, generateProblem({ seed: 1 }).id);
  for (const options of [null, [], 'linear', 4]) assert.throws(() => generateProblem(options), TypeError);
  for (const seed of [null, {}, [], true, NaN, Infinity, 1n]) assert.throws(() => generateProblem({ seed }), TypeError);
  for (const topic of ['unknown', '__proto__', 'constructor', 'toString', '']) {
    assert.throws(() => generateProblem({ topic }), RangeError);
  }
  assert.throws(() => generateProblem({ topic: null }), TypeError);
});

for (const topic of TOPICS) {
  test(`${topic.id}: expected outputs and reference mathematics across seeds and boundaries`, () => {
    for (const difficulty of BOUNDARIES) {
      for (let seed = 0; seed < 20; seed++) {
        const problem = generateProblem({ topic: topic.id, difficulty, seed });
        const { input, expected } = problem;
        const context = `${topic.id}/${difficulty}/${seed}`;
        if (expected.kind === 'solutions') {
          assert.ok(expected.solutions.length > 0);
          for (const solution of expected.solutions) {
            near(equationResidual(input, { x: evaluate(solution) }), 0, context);
          }
          assert.equal(new Set(expected.solutions).size, expected.solutions.length);
          if (['quadratic', 'absolute_value'].includes(topic.id)) assert.equal(expected.solutions.length, 2);
          else assert.equal(expected.solutions.length, 1);
          if (topic.id === 'rational_equation') {
            const h = Number(problem.restrictions[0].split(' != ')[1]);
            assert.notEqual(evaluate(expected.solutions[0]), h);
            assert.ok(!Number.isFinite(evaluate(input.split(' = ')[0], { x: h })));
          }
          if (topic.id === 'logarithmic') {
            assert.equal(expected.base, 10);
            const argument = input.match(/^log\((.*)\) =/)[1];
            assert.ok(evaluate(argument, { x: evaluate(expected.solutions[0]) }) > 0);
          }
          const samples = new Set([-25, -10, -2, -1, 0, 0.5, 1, 2, 8, 30,
            ...expected.solutions.map(evaluateSolution => evaluate(evaluateSolution))]);
          for (const x of samples) {
            for (const reference of problem.referenceSteps) {
              assert.equal(satisfied(reference.before, { x }), satisfied(reference.after, { x }),
                `${context}: invalid reference ${reference.rule} at x=${x}`);
            }
          }
          for (const error of problem.intentional_errors) {
            const wrongNumbers = [...error.after.matchAll(/-?\d+(?:\/\d+)?/g)].map(match => evaluate(match[0]));
            const witnesses = [...samples, ...wrongNumbers];
            assert.ok(witnesses.some(x => satisfied(error.before, { x }) !== satisfied(error.after, { x })),
              `${context}: intentional error is not invalid`);
          }
        } else if (expected.kind === 'expression') {
          for (const x of [-5, -2, 0, 0.5, 3, 7]) {
            const value = expected.coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
            near(evaluate(input, { x }), value, context);
            near(evaluate(expected.expression, { x }), value, context);
            for (const reference of problem.referenceSteps) near(evaluate(reference.before, { x }), evaluate(reference.after, { x }), context);
          }
          assert.ok([-5, 0, 2].some(x => evaluate(problem.intentional_errors[0].before, { x }) !== evaluate(problem.intentional_errors[0].after, { x })), context);
        } else if (expected.kind === 'system') {
          assert.deepEqual(input.variables, ['x', 'y']);
          const bindings = { x: evaluate(expected.solutions.x), y: evaluate(expected.solutions.y) };
          for (const equation of input.equations) near(equationResidual(equation, bindings), 0, context);
          const lhs = input.equations.map(equation => equation.split(' = ')[0]);
          const [a, c] = lhs.map(expression => evaluate(expression, { x: 1, y: 0 }));
          const [b, d] = lhs.map(expression => evaluate(expression, { x: 0, y: 1 }));
          assert.notEqual(a * d - b * c, 0, context);
          for (const trial of [bindings, { x: bindings.x + 1, y: bindings.y }, { x: 0, y: 0 }, { x: 1, y: -1 }]) {
            for (const reference of problem.referenceSteps) assert.equal(satisfied(reference.before, trial), satisfied(reference.after, trial), context);
          }
          assert.equal(satisfied(problem.intentional_errors[0].before, bindings), true, context);
          assert.equal(satisfied(problem.intentional_errors[0].after, bindings), false, context);
        } else if (expected.kind === 'rational_function') {
          const body = input.split(' = ')[1];
          const f = x => evaluate(body, { x });
          near(f(evaluate(expected.xIntercept)), 0, context);
          if (expected.yIntercept === null) {
            assert.equal(expected.h, 0);
            assert.ok(!Number.isFinite(f(0)));
          } else near(f(0), evaluate(expected.yIntercept), context);
          assert.ok(!Number.isFinite(f(expected.h)), context);
          assert.deepEqual(expected.domain, { variable: 'x', excluded: [String(expected.h)] });
          assert.deepEqual(expected.range, { variable: 'y', excluded: [String(expected.k)] });
          assert.equal(expected.verticalAsymptote, `x = ${expected.h}`);
          assert.equal(expected.horizontalAsymptote, `y = ${expected.k}`);
          for (const x of [-10, -1, 0, 1, 20].filter(x => x !== expected.h)) {
            near(f(x), expected.a / (x - expected.h) + expected.k, context);
            for (const reference of problem.referenceSteps) {
              near(equationResidual(reference.before, { x, f }), 0, context);
              near(equationResidual(reference.after, { x, f }), 0, context);
            }
          }
          assert.notEqual(Number(problem.intentional_errors[0].after.split(' = ')[1]), expected.h);
        } else if (expected.kind === 'inequality') {
          const bound = evaluate(expected.boundary);
          for (const x of [bound - 10, bound - 0.25, bound, bound + 0.25, bound + 10]) {
            assert.equal(satisfied(input, { x }), satisfied(expected.expression, { x }), context);
            for (const reference of problem.referenceSteps) assert.equal(satisfied(reference.before, { x }), satisfied(reference.after, { x }), context);
          }
          assert.ok([bound - 0.5, bound + 0.5].some(x => satisfied(problem.intentional_errors[0].before, { x }) !== satisfied(problem.intentional_errors[0].after, { x })), context);
        } else if (expected.kind === 'sequence') {
          assert.equal(input.kind, 'sequence');
          let value = input.first;
          for (let n = 1; n < input.n; n++) value = input.type === 'arithmetic' ? value + input.step : value * input.ratio;
          assert.equal(expected.value, value, context);
          assert.equal(expected.exact, String(value), context);
          assert.equal(expected.n, input.n);
          assert.equal(expected.type, input.type);
          near(evaluate(problem.referenceSteps[0].after.split(' = ')[1]), value, context);
          assert.notEqual(Number(problem.intentional_errors[0].after.split(' = ')[1]), value, context);
        } else if (expected.kind === 'geometry') {
          assert.equal(input.kind, 'geometry');
          assert.equal(input.topic, topic.id);
          const value = topic.id === 'distance'
            ? Math.hypot(input.points[1][0] - input.points[0][0], input.points[1][1] - input.points[0][1])
            : Math.hypot(input.a, input.b);
          near(expected.value, value, context);
          assert.equal(expected.exact, String(expected.value));
          assert.ok(expected.value > 0);
          for (const reference of problem.referenceSteps.slice(1)) {
            near(equationResidual(reference.before, { d: value, c: value }), 0, context);
            near(equationResidual(reference.after, { d: value, c: value }), 0, context);
          }
          assert.notEqual(Number(problem.intentional_errors[0].after.split(' = ')[1]), expected.value, context);
        } else if (expected.kind === 'precalculus') {
          assert.equal(input.kind, 'precalculus');
          assert.equal(input.topic, topic.id);
          assert.equal(expected.topic, topic.id);
          assert.equal(expected.operation, input.operation);
          assert.equal(expected.answer.exact, true);
          assert.notDeepEqual(problem.intentional_errors[0].after, expected.answer);
        } else if (expected.kind === 'data_reasoning') {
          assert.equal(input.kind, 'data_reasoning');
          assert.equal(expected.topic, input.topic);
          assert.equal(expected.operation, input.operation);
          assert.equal(expected.answer.exact, true);
          assert.notDeepEqual(problem.intentional_errors[0].after, expected.answer);
        } else if (expected.kind === 'geometry_exact') {
          assert.equal(input.kind, 'geometry');
          assert.equal(input.topic, topic.id);
          assert.equal(expected.topic, topic.id);
          assert.notDeepEqual(problem.intentional_errors[0].after, expected.answer);
        } else assert.fail(`Unhandled expected output: ${expected.kind}`);
      }
    }
  });
}

const PRECALCULUS_OPERATIONS = {
  trigonometry: ['unit_circle', 'angle_sum', 'angle_difference', 'double_angle'],
  polar: ['to_cartesian', 'rotate'],
  vector: ['add', 'subtract', 'scale', 'dot', 'cross', 'norm', 'distance', 'projection', 'rotate'],
};

test('precalculus catalog proposes only publicly renderable exact operations', () => {
  for (const [topic, operations] of Object.entries(PRECALCULUS_OPERATIONS)) {
    assert.equal(TOPICS.find(item => item.id === topic)?.subject, 'precalculus');
    const seen = new Set();
    for (const difficulty of [...BOUNDARIES, '0.900']) for (let seed = 0; seed < 32; seed++) {
      const options = { topic, difficulty, seed };
      const raw = generateProblem(options);
      assert.deepEqual(raw, generateProblem(options));
      assert.equal(raw.input.kind, 'precalculus');
      assert.equal(raw.input.topic, topic);
      assert.ok(operations.includes(raw.input.operation), JSON.stringify(raw.input));
      assert.equal(raw.expected.kind, 'precalculus');
      assert.equal(raw.expected.operation, raw.input.operation);
      assert.deepEqual(raw.referenceSteps[0].before, raw.input);
      assert.deepEqual(raw.referenceSteps[0].after, raw.expected.answer);
      assert.notDeepEqual(raw.intentional_errors[0].after, raw.expected.answer);
      assert.ok(!JSON.stringify(raw).includes('"verified"'));
      seen.add(raw.input.operation);
    }
    assert.deepEqual([...seen].sort(), [...operations].sort(), `${topic} operation coverage`);
  }
});

test('the public facade independently solves, replays, and renders every generated answer', () => {
  for (const topic of Object.keys(PRECALCULUS_OPERATIONS)) {
    for (const difficulty of [...BOUNDARIES, '0.900']) for (let seed = 0; seed < 24; seed++) {
      const options = { topic, difficulty, seed };
      const raw = generateProblem(options);
      const generated = generateVerifiedProblem(options);
      const solved = solve(raw.input, { difficulty });
      const context = `${topic}/${difficulty}/${seed}/${raw.input.operation}`;
      assert.equal(solved.status, 'solved', `${context}: ${solved.error}`);
      assert.equal(solved.verified, true, context);
      assert.equal(solved.routing.finalEngine, 3, context);
      assert.equal(solved.certificate.type, 'precalculus', context);
      assert.equal(solved.certificate.assurance, 'exact-biquadratic-replay', context);
      assert.equal(solved.latex.valid, true, context);
      assert.deepEqual(raw.expected.answer, solved.answer, context);
      assert.deepEqual(generated.expected.answer, solved.answer, context);
      assert.equal(generated.verification.method, 'solve-and-replay-certificate', context);
      assert.equal(generated.routing.finalEngine, 3, context);
      assert.ok(generated.solution.every(step => step.verified), context);
      const certificate = solvePrecalculus(raw.input);
      assert.equal(verifyPrecalculusCertificate(raw.input, certificate), true, context);
      const forged = structuredClone(certificate);
      forged.certificate.evidence = { forged: true };
      assert.equal(verifyPrecalculusCertificate(raw.input, forged), false, context);
      assert.notDeepEqual(raw.intentional_errors[0].after, certificate.answer, context);
    }
  }
});

test('seed and exact difficulty remain distinct throughout the precalculus range', () => {
  for (const topic of Object.keys(PRECALCULUS_OPERATIONS)) {
    const sample = generateVerifiedProblem({ topic, difficulty: '0.583', seed: 'class A' });
    assert.equal(sample.difficulty, '0.583');
    assert.equal(sample.routing.difficulty, '0.583');
    assert.equal(sample.features.intended_difficulty_score, 583);
    assert.notEqual(sample.id, generateVerifiedProblem({ topic, difficulty: '0.584', seed: 'class A' }).id);
    assert.notEqual(sample.id, generateVerifiedProblem({ topic, difficulty: '0.583', seed: 'class B' }).id);
    assert.deepEqual(sample, generateVerifiedProblem({ topic, difficulty: '0.583', seed: 'class A' }));
  }
});

const NEW_EXACT_TOPICS = ['regression', 'two_way_probability', 'perpendicular_bisector',
  'circumcircle', 'circle_arc', 'circle_sector', 'special_right_triangle'];

function geometryExactAnswer(answer) {
  return Object.fromEntries(Object.entries(answer).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(part => part.exact)
      : value && typeof value === 'object' ? value.exact : value]));
}

test('seeded data reasoning and exact geometry match independent public solves and certificates', () => {
  const seen = new Map(NEW_EXACT_TOPICS.map(topic => [topic, new Set()]));
  for (const topic of NEW_EXACT_TOPICS) {
    for (const difficulty of [...BOUNDARIES, '0.900']) for (let seed = 0; seed < 24; seed++) {
      const options = { topic, difficulty, seed };
      const raw = generateProblem(options), generated = generateVerifiedProblem(options);
      const solved = solve(raw.input, { difficulty });
      const context = `${topic}/${difficulty}/${seed}`;
      assert.deepEqual(raw, generateProblem(options), context);
      assert.equal(solved.status, 'solved', `${context}: ${solved.error}`);
      assert.equal(solved.verified, true, context);
      assert.equal(solved.latex.valid, true, context);
      assert.equal(solved.routing.finalEngine, topic === 'regression' || difficulty >= '0.650' ? 3 : 2, context);
      assert.equal(generated.routing.finalEngine, solved.routing.finalEngine, context);
      assert.equal(generated.verification.method, 'solve-and-replay-certificate', context);
      assert.ok(generated.solution.every(step => step.verified), context);
      assert.deepEqual(raw.referenceSteps[0].before, raw.input, context);
      assert.notDeepEqual(raw.intentional_errors[0].after, raw.expected.answer, context);
      if (raw.input.kind === 'data_reasoning') {
        assert.deepEqual(raw.expected.answer, solved.answer, context);
        const direct = solveDataReasoning(raw.input);
        assert.equal(verifyDataReasoningCertificate(raw.input, direct), true, context);
        const forged = structuredClone(direct); forged.answer.exact = false;
        assert.equal(verifyDataReasoningCertificate(raw.input, forged), false, context);
        seen.get(topic).add(raw.input.operation);
      } else {
        assert.deepEqual(raw.expected.answer, geometryExactAnswer(solved.answer), context);
        const direct = solveGeometry(raw.input);
        assert.equal(verifyGeometryCertificate(raw.input, direct), true, context);
        const forged = structuredClone(direct); forged.answer.extra = true;
        assert.equal(verifyGeometryCertificate(raw.input, forged), false, context);
        if (topic === 'special_right_triangle') seen.get(topic).add(`${raw.input.pattern}/${raw.input.knownSide}`);
      }
    }
  }
  assert.deepEqual([...seen.get('regression')].sort(), ['correlation', 'fit']);
  assert.deepEqual([...seen.get('two_way_probability')].sort(), ['conditional_probability', 'independence']);
  assert.deepEqual([...seen.get('special_right_triangle')].sort(), [
    '30-60-90/hypotenuse', '30-60-90/long_leg', '30-60-90/short_leg',
    '45-45-90/hypotenuse', '45-45-90/leg',
  ]);
});

test('new topics retain all three difficulty decimals and independent seeds', () => {
  for (const topic of NEW_EXACT_TOPICS) {
    const first = generateVerifiedProblem({ topic, difficulty: '0.650', seed: 'same' });
    assert.equal(first.difficulty, '0.650');
    assert.equal(first.features.intended_difficulty_score, 650);
    assert.equal(first.routing.finalEngine, 3);
    assert.notEqual(first.id, generateVerifiedProblem({ topic, difficulty: '0.651', seed: 'same' }).id);
    assert.notEqual(first.id, generateVerifiedProblem({ topic, difficulty: '0.650', seed: 'other' }).id);
  }
});
