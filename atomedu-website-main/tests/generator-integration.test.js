import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, generateProblem } from '../engine/generator.js';
import { estimateDifficulty } from '../engine/difficulty.js';
import { verifyTransition } from '../engine/verifier.js';
import { solveGeometry } from '../engine/geometry.js';
import { buildLinearSystem, gaussianElimination } from '../engine/algebra.js';
import { constantValue, num, parseStatement, print, substitute } from '../engine/core.js';

const DIFFICULTIES = ['0.000', '0.249', '0.399', '0.400', '0.583', '0.649', '0.650', '1.000'];
const SEEDS = [0, 1, 2, 17, 42, '0', 'integration'];

function* problems(topics = TOPICS.map(topic => topic.id)) {
  for (const topic of topics) {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) yield generateProblem({ topic, difficulty, seed });
    }
  }
}

function restrictionContext(problem) {
  return problem.restrictions.map(text => {
    const statement = parseStatement(text);
    return { expression: statement.left, relation: statement.relation, value: constantValue(statement.right) };
  });
}

function assertValid(before, after, context, label) {
  const checked = verifyTransition(before, after, { context });
  assert.equal(checked.status, 'valid', `${label}: ${JSON.stringify({ before, after, checked })}`);
}

test('generated text transitions preserve exact solution sets and original restrictions', () => {
  let checked = 0;
  for (const problem of problems()) {
    const context = restrictionContext(problem);
    for (const reference of problem.referenceSteps) {
      if (reference.relation === 'transformation') continue;
      if (typeof reference.before !== 'string' || typeof reference.after !== 'string') continue;
      assertValid(reference.before, reference.after, context, `${problem.id}/${reference.rule}`);
      checked++;
    }
  }
  assert.ok(checked > 1500);
});

test('native OR verification accepts generated branching transitions', () => {
  for (const problem of problems(['quadratic', 'absolute_value'])) {
    for (const reference of problem.referenceSteps) {
      assertValid(reference.before, reference.after, restrictionContext(problem), `${problem.id}/${reference.rule}`);
    }
  }
});

function reducedSystem(input) {
  const built = buildLinearSystem(input);
  return {
    variables: built.variables,
    rows: gaussianElimination(built.matrix).matrix.map(row => row.map(String)),
  };
}

function residual(source) {
  const statement = parseStatement(source);
  return `((${print(statement.left)}) - (${print(statement.right)}))`;
}

test('structured system elimination, normalization, and substitution preserve both constraints', () => {
  for (const problem of problems(['systems'])) {
    const original = reducedSystem(problem.input);
    assert.equal(problem.referenceSteps.length, 4);
    for (const reference of problem.referenceSteps) {
      assert.equal(reference.before.kind, 'system');
      assert.equal(reference.after.kind, 'system');
      assert.deepEqual(reference.before.variables, ['x', 'y']);
      assert.deepEqual(reference.after.variables, ['x', 'y']);
      assert.deepEqual(reducedSystem(reference.before), original, problem.id);
      assert.deepEqual(reducedSystem(reference.after), original, problem.id);
    }
    const [eliminate, normalize, replace, divide] = problem.referenceSteps;
    const { matrix } = buildLinearSystem(eliminate.before);
    const a = String(matrix[0][0]), c = String(matrix[1][0]);
    const combination = `(${a})*${residual(eliminate.before.equations[1])} - (${c})*${residual(eliminate.before.equations[0])} = 0`;
    assert.equal(eliminate.before.equations[0], eliminate.after.equations[0]);
    assertValid(combination, eliminate.after.equations[1], [], `${problem.id}/elimination row identity`);

    assert.equal(normalize.before.equations[0], normalize.after.equations[0]);
    assertValid(normalize.before.equations[1], normalize.after.equations[1], [], `${problem.id}/normalize y`);

    assert.equal(replace.before.equations[1], replace.after.equations[1]);
    const y = constantValue(parseStatement(replace.before.equations[1]).right);
    const first = parseStatement(replace.before.equations[0]);
    const substituted = `${print(substitute(first.left, 'y', num(y)))} = ${print(substitute(first.right, 'y', num(y)))}`;
    assertValid(substituted, replace.after.equations[0], [], `${problem.id}/substitution under retained y`);

    assert.equal(divide.before.equations[1], divide.after.equations[1]);
    assertValid(divide.before.equations[0], divide.after.equations[0], [], `${problem.id}/normalize x`);
  }
});

test('geometry generator aliases match delegate schemas and theorem formulas', () => {
  for (const problem of problems(['distance', 'pythagorean'])) {
    const result = solveGeometry(problem.input);
    assert.equal(result.status, 'solved', problem.id);
    assert.equal(result.topic, problem.topic === 'pythagorean' ? 'pythagoras' : 'distance');
    const canonicalInput = problem.topic === 'pythagorean'
      ? { ...problem.input, topic: 'pythagoras' } : problem.input;
    assert.equal(solveGeometry(canonicalInput).status, 'solved');
    const first = problem.referenceSteps[0];
    assert.deepEqual(first.before, problem.input);
    let formula;
    if (problem.topic === 'distance') {
      const [[x1, y1], [x2, y2]] = problem.input.points;
      formula = `d^2 = (${x2} - (${x1}))^2 + (${y2} - (${y1}))^2`;
    } else formula = `c^2 = ${problem.input.a}^2 + ${problem.input.b}^2`;
    assertValid(formula, first.after, restrictionContext(problem), `${problem.id}/geometry theorem`);
    const squareRootStep = problem.referenceSteps.at(-1);
    // Its positive-root conclusion needs the original nonnegative length domain.
    assert.equal(verifyTransition(squareRootStep.before, squareRootStep.after).status, 'invalid');
    assertValid(squareRootStep.before, squareRootStep.after, restrictionContext(problem), `${problem.id}/length domain`);
    assert.deepEqual(estimateDifficulty(canonicalInput), estimateDifficulty(problem.input));
  }
  for (const seed of SEEDS) {
    assert.deepEqual(generateProblem({ topic: 'pythagoras', seed }), generateProblem({ topic: 'pythagorean', seed }));
  }
});

test('sequence definition normalization agrees with the proposed nth-term formula', () => {
  for (const problem of problems(['arithmetic_sequence', 'geometric_sequence'])) {
    const { input } = problem;
    const formula = input.type === 'arithmetic'
      ? `a_${input.n} = (${input.first}) + (${input.n} - 1)*(${input.step})`
      : `a_${input.n} = (${input.first})*(${input.ratio})^(${input.n} - 1)`;
    assert.deepEqual(problem.referenceSteps[0].before, input);
    assertValid(formula, problem.referenceSteps[0].after, [], `${problem.id}/sequence definition`);
  }
});

test('rational-function paths are labeled transformations and raw generator claims no verification', () => {
  for (const problem of problems()) {
    assert.equal(problem.difficulty.length, 5);
    assert.ok(['number', 'string'].includes(typeof problem.seed));
    assert.ok(!JSON.stringify(problem).includes('"verified"'), problem.id);
    assert.deepEqual(problem.referenceSteps, problem.checkpoints);
    for (const reference of problem.referenceSteps) {
      if (problem.topic === 'rational_function') assert.equal(reference.relation, 'transformation');
      else assert.ok(!Object.hasOwn(reference, 'relation'));
    }
  }
});
