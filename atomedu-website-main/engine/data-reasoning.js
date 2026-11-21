// Owned, bounded rules for exact school-level data and probability reasoning.
// Import directly; this module is intentionally not wired into the facade.
import { MathError, Q, rationalSqrt } from './core.js';

const invalid = message => { throw new MathError(message, 'invalid'); };
const unsupported = message => { throw new MathError(message, 'unsupported'); };
const budget = message => { throw new MathError(message, 'budget'); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function fields(value, required, optional = []) {
  if (!isObject(value)) invalid('Expected a plain object.');
  const allowed = new Set([...required, ...optional]);
  if (Reflect.ownKeys(value).length !== Object.keys(value).length ||
    Object.keys(value).some(key => !allowed.has(key)) || required.some(key => !Object.hasOwn(value, key)))
    invalid(`Expected fields: ${[...required, ...optional].join(', ')}.`);
}

function denseArray(value) {
  if (!Array.isArray(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
  return true;
}

function rational(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || !Number.isSafeInteger(value)))
    invalid('Use a string for noninteger exact rational data.');
  if (typeof value !== 'string' && typeof value !== 'number') invalid('Expected a rational string or safe integer.');
  const source = String(value);
  if (source.length > 100) budget('Rational input exceeds the 100 character limit.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/(?:\d+(?:\.\d*)?|\.\d+))?$/.test(source))
    invalid('Expected an integer, decimal, or fraction of decimals.');
  try { return Q(source); } catch (error) { invalid(error.message); }
}

function boundedInteger(value, name, maximum = 500) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid(`${name} must be a nonnegative safe integer.`);
  if (value > maximum) budget(`${name} exceeds the supported bound of ${maximum}.`);
  return value;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let result = 1n;
  for (let i = 1; i <= k; i++) result = result * BigInt(n - k + i) / BigInt(i);
  return result;
}

function permutation(n, k) {
  let result = 1n;
  for (let i = 0; i < k; i++) result *= BigInt(n - i);
  return result;
}

function exactPower(value, exponent) {
  let result = Q(1), base = value;
  for (let n = exponent; n > 0; n = Math.floor(n / 2)) {
    if (n % 2) result = result.mul(base);
    if (n > 1) base = base.mul(base);
  }
  return result;
}

function step(rule, before, after, explanation) {
  return { rule, before, after, explanation, verified: true };
}

function report(topic, operation, answer, evidence, steps, restrictions = []) {
  return { status: 'solved', verified: true, topic, operation, answer: { ...answer, exact: true }, steps,
    restrictions, certificate: { type: 'data_reasoning', version: 1, assurance: 'exact-replay', evidence } };
}

function correlation(sxy, sxx, syy) {
  if (sxx.zero || syy.zero) return null;
  if (sxy.zero) return '0';
  const radicand = sxx.mul(syy), root = rationalSqrt(radicand);
  return root ? String(sxy.div(root)) : `${sxy}/sqrt(${radicand})`;
}

function regression(input) {
  if (!['fit', 'correlation'].includes(input.operation)) unsupported('Unsupported regression operation.');
  fields(input, ['kind', 'topic', 'operation', 'points'], input.operation === 'fit' ? ['at'] : []);
  if (!Array.isArray(input.points) || input.points.length < 2) invalid('At least two paired observations are required.');
  if (input.points.length > 100) budget('Regression supports at most 100 paired observations.');
  if (!denseArray(input.points)) invalid('Paired observations must form a dense array.');
  const points = input.points.map(pair => {
    if (!denseArray(pair) || pair.length !== 2) invalid('Every observation must be an [x, y] pair.');
    return pair.map(rational);
  });
  const n = Q(points.length);
  let sumX = Q(0), sumY = Q(0), sumXX = Q(0), sumYY = Q(0), sumXY = Q(0);
  for (const [x, y] of points) {
    sumX = sumX.add(x); sumY = sumY.add(y); sumXX = sumXX.add(x.mul(x));
    sumYY = sumYY.add(y.mul(y)); sumXY = sumXY.add(x.mul(y));
  }
  // Centered sums avoid any floating-point covariance or fit calculation.
  const sxx = n.mul(sumXX).sub(sumX.mul(sumX));
  const syy = n.mul(sumYY).sub(sumY.mul(sumY));
  const sxy = n.mul(sumXY).sub(sumX.mul(sumY));
  if (sxx.zero) unsupported('All x values coincide, so the least-squares slope is undefined.');
  if (input.operation === 'correlation' && syy.zero) unsupported('Correlation is undefined for constant y values.');
  const r = correlation(sxy, sxx, syy);
  const rSquared = syy.zero ? null : String(sxy.mul(sxy).div(sxx.mul(syy)));
  const slope = sxy.div(sxx), intercept = sumY.sub(slope.mul(sumX)).div(n);
  let residualSum = Q(0), xResidualSum = Q(0);
  for (const [x, y] of points) {
    const residual = y.sub(slope.mul(x).add(intercept));
    residualSum = residualSum.add(residual);
    xResidualSum = xResidualSum.add(x.mul(residual));
  }
  const evidence = { points: points.map(pair => pair.map(String)), n: String(n),
    sums: { x: String(sumX), y: String(sumY), xx: String(sumXX), yy: String(sumYY), xy: String(sumXY) },
    centered: { xx: String(sxx), yy: String(syy), xy: String(sxy) },
    normalEquations: { residualSum: String(residualSum), xResidualSum: String(xResidualSum) } };
  const answer = { slope: String(slope), intercept: String(intercept), correlation: r,
    correlationSquared: rSquared };
  if (Object.hasOwn(input, 'at')) {
    const at = rational(input.at);
    answer.at = String(at); answer.prediction = String(slope.mul(at).add(intercept));
    evidence.at = String(at);
  }
  const steps = [
    step('paired_sums', JSON.stringify(evidence.points), JSON.stringify(evidence.sums), 'Sum x, y, x², y², and xy exactly.'),
    step('centered_cross_products', JSON.stringify(evidence.sums), JSON.stringify(evidence.centered), 'Compute nΣx²−(Σx)², nΣy²−(Σy)², and nΣxy−ΣxΣy.'),
    step('least_squares_and_correlation', JSON.stringify(evidence.centered), JSON.stringify(answer), 'Slope is Sxy/Sxx; intercept is (Σy−slope·Σx)/n; correlation is Sxy/√(Sxx·Syy) when defined.'),
    step('least_squares_normal_equations', JSON.stringify(answer), JSON.stringify(evidence.normalEquations), 'The sum of residuals and the sum of x times residuals are both zero, certifying the least-squares normal equations.')
  ];
  return report('regression', input.operation, answer, evidence, steps,
    syy.zero ? ['Correlation is undefined because all y values coincide.'] : []);
}

function tableData(table) {
  if (!Array.isArray(table) || table.length < 2 || !Array.isArray(table[0]) || table[0].length < 2)
    invalid('A two-way table needs at least two rows and two columns.');
  if (table.length > 12 || table[0].length > 12) budget('A table supports at most 12 rows and 12 columns.');
  if (!denseArray(table)) invalid('Table rows must form a dense array.');
  const width = table[0].length;
  const cells = table.map(row => {
    if (!denseArray(row) || row.length !== width) invalid('Table rows must have equal length.');
    return row.map(value => BigInt(boundedInteger(value, 'Table frequency', 1000000000)));
  });
  const rowTotals = cells.map(row => row.reduce((a, b) => a + b, 0n));
  const columnTotals = Array.from({ length: width }, (_, j) => cells.reduce((a, row) => a + row[j], 0n));
  const total = rowTotals.reduce((a, b) => a + b, 0n);
  if (total === 0n) invalid('The table must contain at least one observation.');
  return { cells, rowTotals, columnTotals, total };
}

function eventData(event, rows, columns) {
  fields(event, ['axis', 'index']);
  if (!['row', 'column'].includes(event.axis)) invalid('Event axis must be row or column.');
  const limit = event.axis === 'row' ? rows : columns;
  if (typeof event.index !== 'number' || !Number.isInteger(event.index) || event.index < 0 || event.index >= limit)
    invalid('Event index is outside the table.');
  return { axis: event.axis, index: event.index };
}

function eventContains(event, i, j) { return event.axis === 'row' ? event.index === i : event.index === j; }

function twoWayTable(input) {
  if (!['conditional_probability', 'independence'].includes(input.operation)) unsupported('Unsupported two-way table operation.');
  fields(input, ['kind', 'topic', 'operation', 'table'], input.operation === 'conditional_probability' ? ['event', 'given'] : []);
  const data = tableData(input.table);
  const { cells, rowTotals, columnTotals, total } = data;
  const evidence = { table: cells.map(row => row.map(String)), rowTotals: rowTotals.map(String),
    columnTotals: columnTotals.map(String), total: String(total) };
  const steps = [step('table_marginals', JSON.stringify(evidence.table), JSON.stringify(evidence), 'Add all rows and columns exactly.')];
  if (input.operation === 'independence') {
    const crossProducts = cells.map((row, i) => row.map((cell, j) => ({
      observedTimesTotal: String(cell * total), marginalProduct: String(rowTotals[i] * columnTotals[j])
    })));
    const independent = crossProducts.every(row => row.every(cell => cell.observedTimesTotal === cell.marginalProduct));
    evidence.crossProducts = crossProducts;
    const answer = { independent };
    steps.push(step('all_cell_independence', JSON.stringify(crossProducts), JSON.stringify(answer),
      'The row and column variables are independent exactly when every cell count times the grand total equals its row total times its column total.'));
    return report('two_way_table', input.operation, answer, evidence, steps);
  }
  if (!Object.hasOwn(input, 'event') || !Object.hasOwn(input, 'given')) invalid('Conditional probability requires event and given.');
  const event = eventData(input.event, cells.length, cells[0].length);
  const given = eventData(input.given, cells.length, cells[0].length);
  let eventCount = 0n, givenCount = 0n, jointCount = 0n;
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < cells[i].length; j++) {
    const inEvent = eventContains(event, i, j), inGiven = eventContains(given, i, j);
    if (inEvent) eventCount += cells[i][j];
    if (inGiven) givenCount += cells[i][j];
    if (inEvent && inGiven) jointCount += cells[i][j];
  }
  if (givenCount === 0n) unsupported('Conditional probability is undefined when the given event has zero observations.');
  evidence.events = { event, given, eventCount: String(eventCount), givenCount: String(givenCount), jointCount: String(jointCount) };
  const answer = { probability: String(Q(jointCount).div(givenCount)), jointCount: String(jointCount),
    givenCount: String(givenCount) };
  steps.push(step('conditional_count_ratio', JSON.stringify(evidence.events), answer.probability,
    'Count the intersection and divide by the count of the given event.'));
  return report('two_way_table', input.operation, answer, evidence, steps);
}

function combinatorial(input) {
  const operation = input.operation;
  if (!['combination', 'permutation', 'hypergeometric', 'binomial'].includes(operation)) unsupported('Unsupported combinatorial probability operation.');
  if (operation === 'combination' || operation === 'permutation') {
    fields(input, ['kind', 'topic', 'operation', 'n', 'k']);
    const n = boundedInteger(input.n, 'n'), k = boundedInteger(input.k, 'k');
    if (k > n) invalid('k cannot exceed n.');
    const count = operation === 'combination' ? choose(n, k) : permutation(n, k);
    const evidence = { n, k, count: String(count) };
    return report('combinatorial_probability', operation, { count: String(count) }, evidence,
      [step(operation === 'combination' ? 'count_unordered' : 'count_ordered', `${n},${k}`, String(count),
        operation === 'combination' ? 'Compute n!/[k!(n−k)!] with exact integer cancellation.' : 'Multiply n(n−1)…(n−k+1) exactly.')]);
  }
  if (operation === 'hypergeometric') {
    fields(input, ['kind', 'topic', 'operation', 'population', 'successes', 'draws', 'exactSuccesses']);
    const population = boundedInteger(input.population, 'population');
    const successes = boundedInteger(input.successes, 'successes');
    const draws = boundedInteger(input.draws, 'draws');
    const exactSuccesses = boundedInteger(input.exactSuccesses, 'exactSuccesses');
    if (!population || successes > population || draws > population || exactSuccesses > draws)
      invalid('Hypergeometric counts must describe a nonempty population and feasible draws.');
    const favorable = choose(successes, exactSuccesses) * choose(population - successes, draws - exactSuccesses);
    const total = choose(population, draws), probability = Q(favorable).div(total);
    const evidence = { population, successes, draws, exactSuccesses, favorable: String(favorable), total: String(total) };
    return report('combinatorial_probability', operation, { probability: String(probability), favorable: String(favorable), total: String(total) }, evidence,
      [step('hypergeometric_count_ratio', JSON.stringify(evidence), String(probability),
        'Choose the marked and unmarked items separately, then divide by all equally likely unordered draws.')]);
  }
  fields(input, ['kind', 'topic', 'operation', 'trials', 'successProbability', 'exactSuccesses']);
  const trials = boundedInteger(input.trials, 'trials', 200);
  const exactSuccesses = boundedInteger(input.exactSuccesses, 'exactSuccesses', 200);
  if (exactSuccesses > trials) invalid('exactSuccesses cannot exceed trials.');
  const p = rational(input.successProbability);
  if (p.cmp(0) < 0 || p.cmp(1) > 0) invalid('successProbability must be between zero and one.');
  const patterns = choose(trials, exactSuccesses);
  const onePattern = exactPower(p, exactSuccesses).mul(exactPower(Q(1).sub(p), trials - exactSuccesses));
  const probability = Q(patterns).mul(onePattern);
  const evidence = { trials, exactSuccesses, successProbability: String(p), patterns: String(patterns), onePattern: String(onePattern) };
  return report('combinatorial_probability', operation, { probability: String(probability), patterns: String(patterns) }, evidence,
    [step('binomial_pattern_probability', JSON.stringify(evidence), String(probability),
      'Count success patterns with n choose k and multiply by p^k(1−p)^(n−k) exactly.')]);
}

function compute(input) {
  if (!isObject(input) || input.kind !== 'data_reasoning') invalid('Expected a data_reasoning request.');
  if (typeof input.topic !== 'string' || typeof input.operation !== 'string') invalid('Specify topic and operation.');
  if (input.topic === 'regression') return regression(input);
  if (input.topic === 'two_way_table') return twoWayTable(input);
  if (input.topic === 'combinatorial_probability') return combinatorial(input);
  unsupported('Unsupported data reasoning topic.');
}

function identical(expected, actual, depth = 0) {
  if (depth > 20) return false;
  if (expected === null || typeof expected !== 'object') return expected === actual;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length &&
    Reflect.ownKeys(actual).length === expected.length + 1 &&
    expected.every((value, i) => Object.hasOwn(actual, i) && identical(value, actual[i], depth + 1));
  if (!isObject(actual)) return false;
  const keys = Object.keys(expected);
  return Reflect.ownKeys(actual).length === keys.length && keys.every(key => Object.hasOwn(actual, key) && identical(expected[key], actual[key], depth + 1));
}

export function solveDataReasoning(input) {
  try { return compute(input); }
  catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : error.code === 'budget' ? 'unresolved' : 'unsupported',
      verified: false, topic: 'data_reasoning', answer: null, steps: [], restrictions: [], certificate: null,
      error: error.message || 'Unable to certify the request.' };
  }
}

// Replay every exact quantity from the original request and compare the entire report schema.
export function verifyDataReasoningCertificate(input, result) {
  try { return result?.status === 'solved' && identical(compute(input), result); }
  catch { return false; }
}
