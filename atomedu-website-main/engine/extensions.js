// Supplemental exact mathematics. All proved arithmetic goes through core Q;
// Math/Number approximations are used only in explicitly unverified previews.
import {
  Q, Rational, MathError, parseExpression, constantValue, rationalSqrt, rationalNthRoot,
  integerSqrt, evaluate, variables,
} from './core.js';

const LIMIT = 1000;
const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => { throw new MathError(message, 'invalid'); };
const unsupported = message => { throw new MathError(message, 'unsupported'); };
const read = (object, key) => own(object, key) ? object[key] : undefined;

function rational(value, name = 'Value') {
  if (!(value instanceof Rational) && !['string', 'number', 'bigint'].includes(typeof value))
    invalid(`${name} must be an exact rational number.`);
  if (typeof value === 'number' && (!Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))))
    invalid(`${name} must be finite; supply large integers as strings.`);
  // Reconstruct Rational instances too, rather than trusting a mutable instance.
  return value instanceof Rational ? new Rational(value.n, value.d) : Q(value);
}

function integer(value, name, minimum = 0, maximum = LIMIT) {
  const q = rational(value, name);
  if (!q.integer || q.n < BigInt(minimum)) invalid(`${name} must be an integer >= ${minimum}.`);
  if (q.n > BigInt(maximum)) unsupported(`${name} exceeds the supported limit of ${maximum}.`);
  return Number(q.n);
}

function pow(base, exponent) {
  let answer = Q(1);
  while (exponent) {
    if (exponent % 2) answer = answer.mul(base);
    exponent = Math.floor(exponent / 2);
    if (exponent) base = base.mul(base);
  }
  return answer;
}

const step = (before, after, rule, explanation, verified = true) =>
  ({ before, after, rule, explanation, verified });
const strings = matrix => matrix.map(row => row.map(String));
const matrixText = matrix => JSON.stringify(strings(matrix));

function solved(topic, input, answer, steps, restrictions = [], evidence = {}, verified = true) {
  return {
    status: 'solved', verified, topic, answer, steps, restrictions,
    certificate: {
      version: 1, kind: 'extension', topic,
      assurance: verified ? 'exact-replay' : 'symbolic-substitution',
      input, evidence,
    },
  };
}

function sequence(input) {
  const type = read(input, 'type'), task = own(input, 'task') ? input.task : 'term';
  if (typeof type !== 'string' || typeof task !== 'string') invalid('Sequence type and task must be strings.');
  if (!['arithmetic', 'geometric'].includes(type)) unsupported('Unknown sequence type.');
  if (!['term', 'sum'].includes(task)) unsupported('Unknown sequence task.');
  const n = integer(read(input, 'n'), 'n', task === 'term' ? 1 : 0);
  const first = rational(read(input, 'first'), 'first');
  let increment;
  if (type === 'arithmetic') {
    increment = rational(own(input, 'difference') ? input.difference : read(input, 'step'), 'difference');
    if (own(input, 'difference') && own(input, 'step') &&
        !increment.eq(rational(input.step, 'step'))) invalid('step and difference disagree.');
  } else increment = rational(read(input, 'ratio'), 'ratio');
  let value, last = null, rule;
  if (type === 'arithmetic') {
    last = n ? first.add(increment.mul(n - 1)) : null;
    value = task === 'term' ? last : n ? first.add(last).mul(n).div(2) : Q(0);
    rule = task === 'term' ? 'a_n = a_1 + (n - 1)d' : 'S_n = n(a_1 + a_n)/2';
  } else {
    last = n ? first.mul(pow(increment, n - 1)) : null;
    value = task === 'term' ? last : increment.eq(1) ? first.mul(n) :
      first.mul(Q(1).sub(pow(increment, n))).div(Q(1).sub(increment));
    rule = task === 'term' ? 'a_n = a_1*r^(n - 1)' :
      increment.eq(1) ? 'S_n = n*a_1 when r = 1' : 'S_n = a_1*(1 - r^n)/(1 - r)';
  }
  // Independent finite recurrence checks both the selected term and the sum.
  let term = first, sum = Q(0), replayLast = null;
  for (let i = 0; i < n; i++) {
    sum = sum.add(term); replayLast = term;
    if (i + 1 < n) term = type === 'arithmetic' ? term.add(increment) : term.mul(increment);
  }
  if (!value.eq(task === 'term' ? replayLast : sum)) unsupported('Sequence recurrence check failed.');
  const normalized = { kind: 'sequence', type, first: String(first), n, task,
    [type === 'arithmetic' ? 'difference' : 'ratio']: String(increment) };
  return solved('sequence', normalized, { type, task, n, value: String(value), exact: true },
    [step(JSON.stringify(normalized), String(value), rule,
      'Apply the exact finite-sequence formula and check it against the recurrence.')],
    [`n is an integer from ${task === 'term' ? 1 : 0} through ${LIMIT}; terms are indexed from 1.`],
    { method: 'formula-and-recurrence', lastTerm: last === null ? null : String(last), sum: String(sum) });
}

function parseMatrix(value, name) {
  if (!Array.isArray(value) || !value.length) invalid(`${name} must be a nonempty rectangular array.`);
  if (value.length > 8) unsupported('Matrices support at most 8 rows and 8 columns.');
  const columns = value[0]?.length;
  if (!Number.isInteger(columns) || !columns) invalid(`${name} must have nonempty rows.`);
  if (columns > 8) unsupported('Matrices support at most 8 rows and 8 columns.');
  return Array.from(value, (row, i) => {
    if (!Array.isArray(row) || row.length !== columns) invalid(`${name} must be rectangular.`);
    return Array.from(row, (entry, j) => rational(entry, `${name}[${i}][${j}]`));
  });
}

function multiply(a, b) {
  if (a[0].length !== b.length) invalid('The inner matrix dimensions must agree.');
  return a.map(row => b[0].map((_, column) => row.reduce(
    (sum, entry, index) => sum.add(entry.mul(b[index][column])), Q(0))));
}

const identity = n => Array.from({ length: n }, (_, i) =>
  Array.from({ length: n }, (_, j) => Q(i === j ? 1 : 0)));
const sameMatrix = (a, b) => a.length === b.length && a.every((row, i) =>
  row.length === b[i].length && row.every((entry, j) => entry.eq(b[i][j])));

// Pivot columns are limited to the original matrix when reducing [A | I].
function eliminate(source, columns = source[0].length) {
  const a = source.map(row => [...row]), operations = [], steps = [], pivots = [];
  let row = 0, determinant = Q(1);
  const apply = (operation, rule, explanation, change) => {
    const before = matrixText(a); change();
    operations.push(operation); steps.push(step(before, matrixText(a), rule, explanation));
  };
  for (let column = 0; column < columns && row < a.length; column++) {
    const pivotRow = a.findIndex((r, index) => index >= row && !r[column].zero);
    if (pivotRow < 0) continue;
    if (pivotRow !== row) {
      apply({ kind: 'swap', rows: [row, pivotRow] }, 'row-swap',
        `Swap rows ${row + 1} and ${pivotRow + 1}.`, () => {
          [a[row], a[pivotRow]] = [a[pivotRow], a[row]];
        });
      determinant = determinant.neg();
    }
    const pivot = a[row][column]; determinant = determinant.mul(pivot);
    if (!pivot.eq(1)) {
      const factor = Q(1).div(pivot);
      apply({ kind: 'scale', row, factor: String(factor) }, 'row-scale',
        `Multiply row ${row + 1} by ${factor}.`, () => { a[row] = a[row].map(x => x.mul(factor)); });
    }
    for (let target = 0; target < a.length; target++) {
      if (target === row || a[target][column].zero) continue;
      const factor = a[target][column].neg();
      apply({ kind: 'add', row: target, source: row, factor: String(factor) }, 'row-addition',
        `Add ${factor} times row ${row + 1} to row ${target + 1}.`, () => {
          a[target] = a[target].map((x, j) => x.add(factor.mul(a[row][j])));
        });
    }
    pivots.push(column); row++;
  }
  return { matrix: a, rank: row, pivots, determinant: row === columns ? determinant : Q(0), operations, steps };
}

function matrix(input) {
  const operation = read(input, 'operation');
  if (!['determinant', 'inverse', 'multiply', 'rref'].includes(operation)) unsupported('Unknown matrix operation.');
  const a = parseMatrix(read(input, 'matrix'), 'matrix');
  const normalized = { kind: 'matrix', operation, matrix: strings(a) };
  if (operation === 'multiply') {
    const b = parseMatrix(read(input, 'other'), 'other'), product = multiply(a, b);
    normalized.other = strings(b);
    return solved('matrix', normalized, { operation, value: strings(product), matrix: strings(product), exact: true },
      [step(`${matrixText(a)} * ${matrixText(b)}`, matrixText(product), 'row-column-products',
        'Each entry is the exact dot product of a row and a column.')], [],
      { method: 'exact-dot-products', dimensions: [a.length, a[0].length, b[0].length] });
  }
  if (operation !== 'rref' && a.length !== a[0].length) invalid('This operation requires a square matrix.');
  const unit = identity(a.length), source = operation === 'inverse' ?
    a.map((row, i) => [...row, ...unit[i]]) : a;
  const reduced = eliminate(source, a[0].length), steps = reduced.steps;
  const evidence = { method: 'gauss-jordan', operations: reduced.operations,
    rank: reduced.rank, pivotColumns: reduced.pivots, reduced: strings(reduced.matrix) };
  if (operation === 'determinant') {
    const value = String(reduced.determinant);
    evidence.determinant = value;
    steps.push(step(matrixText(a), value, 'determinant-from-pivots',
      'Multiply the pre-scaling pivots and row-swap signs; rank deficiency gives zero.'));
    return solved('matrix', normalized, { operation, value, determinant: value, exact: true }, steps, [], evidence);
  }
  if (operation === 'inverse') {
    if (reduced.rank !== a.length) invalid('A singular matrix has no inverse.');
    const inverse = reduced.matrix.map(row => row.slice(a.length));
    if (!sameMatrix(multiply(a, inverse), unit) || !sameMatrix(multiply(inverse, a), unit))
      unsupported('Exact inverse identity check failed.');
    steps.push(step(`${matrixText(a)} * ${matrixText(inverse)}`, matrixText(unit), 'inverse-identity',
      'Check both A times its inverse and its inverse times A against the identity.'));
    evidence.leftProduct = strings(unit); evidence.rightProduct = strings(unit);
    return solved('matrix', normalized, { operation, value: strings(inverse), matrix: strings(inverse), exact: true },
      steps, ['The matrix must be square and nonsingular.'], evidence);
  }
  if (!steps.length) steps.push(step(matrixText(a), matrixText(a), 'rref-identity',
    'The matrix already satisfies the reduced row echelon conditions.'));
  return solved('matrix', normalized, { operation, value: strings(reduced.matrix),
    matrix: strings(reduced.matrix), rank: reduced.rank, pivotColumns: reduced.pivots, exact: true }, steps, [], evidence);
}

function exactRoot(value) {
  const root = rationalSqrt(value);
  return root === null ? `sqrt(${value})` : String(root);
}

function statistics(input) {
  const supplied = read(input, 'values');
  if (!Array.isArray(supplied) || !supplied.length) invalid('Statistics require at least one value.');
  if (supplied.length > LIMIT) unsupported(`Statistics support at most ${LIMIT} values.`);
  const values = Array.from(supplied, value => rational(value)), n = values.length;
  const ordered = [...values].sort((a, b) => a.cmp(b));
  const sum = values.reduce((s, q) => s.add(q), Q(0)), mean = sum.div(n);
  const median = n % 2 ? ordered[(n - 1) / 2] : ordered[n / 2 - 1].add(ordered[n / 2]).div(2);
  const centered = values.reduce((s, q) => s.add(q.sub(mean).mul(q.sub(mean))), Q(0));
  const variance = centered.div(n), sample = n > 1 ? centered.div(n - 1) : null;
  const answer = { count: n, sum: String(sum), mean: String(mean), median: String(median),
    min: String(ordered[0]), max: String(ordered.at(-1)), variance: String(variance),
    standardDeviation: exactRoot(variance), sampleVariance: sample === null ? null : String(sample),
    sampleStandardDeviation: sample === null ? null : exactRoot(sample), exact: true };
  return solved('statistics', { kind: 'statistics', values: values.map(String) }, answer, [
    step(JSON.stringify(values.map(String)), JSON.stringify(ordered.map(String)), 'rational-order',
      'Sort by exact rational comparison.'),
    step(`${sum}/${n}`, String(mean), 'arithmetic-mean', 'Divide the exact sum by the count.'),
    step(JSON.stringify(ordered.map(String)), String(median), 'median',
      'Use the middle value, or the exact mean of the two middle values.'),
    step(`${centered}/${n}`, String(variance), 'population-variance',
      'Sum squared deviations from the exact mean and divide by the population count.'),
    step(`sqrt(${variance})`, answer.standardDeviation, 'nonnegative-square-root',
      'Keep a nonrational standard deviation as an exact square-root expression.'),
  ], ['variance and standardDeviation use the population denominator n.',
    'Sample statistics use n - 1 and are null for a singleton.'],
  { method: 'exact-centered-moments', ordered: ordered.map(String), sum: String(sum),
    squaredDeviations: String(centered), populationDenominator: n, sampleDenominator: n > 1 ? n - 1 : null });
}

function combinatorics(input) {
  const operation = read(input, 'operation');
  if (!['factorial', 'permutations', 'combinations'].includes(operation)) unsupported('Unknown combinatorics operation.');
  const n = integer(read(input, 'n'), 'n'), r = operation === 'factorial' ? null : integer(read(input, 'r'), 'r');
  if (r !== null && r > n) invalid('r must not exceed n.');
  let value = Q(1), factors = 0;
  if (operation === 'combinations') {
    const k = Math.min(r, n - r); factors = k;
    for (let i = 1; i <= k; i++) value = value.mul(n - k + i).div(i);
  } else {
    factors = operation === 'factorial' ? n : r;
    for (let i = 0; i < factors; i++) value = value.mul(n - i);
  }
  const normalized = { kind: 'combinatorics', operation, n };
  if (r !== null) normalized.r = r;
  const formula = operation === 'factorial' ? `${n}!` : operation === 'permutations' ?
    `${n}!/(${n}-${r})!` : `${n}!/(${r}!*(${n}-${r})!)`;
  return solved('combinatorics', normalized, { operation, n, ...(r === null ? {} : { r }), value: String(value), exact: true },
    [step(formula, String(value), operation, 'Compute the bounded product using exact rational arithmetic; an empty product is 1.')],
    [`n and r are nonnegative integers no greater than ${LIMIT}; r <= n.`],
    { method: operation === 'combinations' ? 'multiplicative-binomial-recurrence' : 'falling-product', factors });
}

// Finite sums c*sqrt(d), with squarefree d > 0; negative keys denote
// i*sqrt(-d). This gives exact multiquadratic and complex arithmetic.
const scalar = q => q.zero ? new Map() : new Map([['1', q]]);
const asRational = field => field.size === 0 ? Q(0) :
  field.size === 1 && field.has('1') ? field.get('1') : null;
const bigAbs = value => value < 0n ? -value : value;
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function addTerm(field, key, coefficient) {
  const value = (field.get(key) ?? Q(0)).add(coefficient);
  if (value.zero) field.delete(key); else field.set(key, value);
  if (field.size > 64) unsupported('Radical arithmetic exceeds the 64-term budget.');
}
function fieldAdd(a, b, sign = Q(1)) {
  const result = new Map(a);
  for (const [key, coefficient] of b) addTerm(result, key, coefficient.mul(sign));
  return result;
}
const fieldScale = (field, factor) => new Map([...field].map(([key, q]) => [key, q.mul(factor)])
  .filter(([, q]) => !q.zero));
function fieldMul(a, b, context) {
  const result = new Map();
  for (const [left, x] of a) for (const [right, y] of b) {
    if (++context.products > 50000) unsupported('Radical arithmetic operation budget reached.');
    const l = BigInt(left), r = BigInt(right), common = gcd(bigAbs(l), bigAbs(r));
    const key = (bigAbs(l) / common) * (bigAbs(r) / common) * ((l < 0n) !== (r < 0n) ? -1n : 1n);
    addTerm(result, String(key), x.mul(y).mul(common).mul(l < 0n && r < 0n ? -1 : 1));
  }
  return result;
}

function fieldInverse(field, context) {
  if (!field.size) invalid('Division by zero is undefined.');
  const radical = [...field.keys()].find(key => bigAbs(BigInt(key)) > 1n);
  if (radical === undefined) {
    const a = field.get('1') ?? Q(0), b = field.get('-1') ?? Q(0);
    const denominator = a.mul(a).add(b.mul(b));
    const result = new Map();
    addTerm(result, '1', a.div(denominator)); addTerm(result, '-1', b.neg().div(denominator));
    return result;
  }
  const prime = context.primes.find(p => BigInt(radical) % p === 0n);
  if (prime === undefined) unsupported('Radical basis cannot be certified.');
  const conjugate = new Map([...field].map(([key, q]) => [key, BigInt(key) % prime === 0n ? q.neg() : q]));
  const norm = fieldMul(field, conjugate, context);
  if ([...norm.keys()].some(key => BigInt(key) % prime === 0n)) unsupported('Radical conjugation failed.');
  return fieldMul(conjugate, fieldInverse(norm, context), context);
}

function fieldPow(field, exponent, context) {
  if (exponent < 0) return fieldPow(fieldInverse(field, context), -exponent, context);
  let answer = scalar(Q(1));
  while (exponent) {
    if (exponent % 2) answer = fieldMul(answer, field, context);
    exponent = Math.floor(exponent / 2);
    if (exponent) field = fieldMul(field, field, context);
  }
  return answer;
}

function fieldRoot(q, context) {
  const negative = q.n < 0n, magnitude = negative ? q.neg() : q;
  if (negative) context.restrictions.add('Square roots of negative rational numbers use the principal complex root.');
  const perfect = rationalSqrt(magnitude);
  if (perfect !== null) return perfect.zero ? new Map() : new Map([[negative ? '-1' : '1', perfect]]);
  let rest = magnitude.n * magnitude.d;
  // Larger nonsquares remain symbolic; we never assume an unfactored integer
  // is squarefree or rely on a probabilistic primality test.
  if (rest > 1000000000000n) return null;
  let square = 1n, radicand = 1n;
  const primes = [];
  for (let p = 2n; p * p <= rest; p = p === 2n ? 3n : p + 2n) {
    if (++context.divisions > 100000) return null;
    let count = 0;
    while (rest % p === 0n) { rest /= p; count++; }
    square *= p ** BigInt(Math.floor(count / 2));
    if (count % 2) { radicand *= p; primes.push(p); }
  }
  if (rest > 1n) { radicand *= rest; primes.push(rest); }
  for (const prime of primes) if (!context.primes.includes(prime)) context.primes.push(prime);
  return new Map([[String(negative ? -radicand : radicand), Q(square).div(magnitude.d)]]);
}

function fieldText(field) {
  const terms = [...field].sort(([a], [b]) => {
    const x = BigInt(a), y = BigInt(b);
    if ((x < 0n) !== (y < 0n)) return x < 0n ? 1 : -1;
    return bigAbs(x) < bigAbs(y) ? -1 : bigAbs(x) > bigAbs(y) ? 1 : 0;
  });
  return terms.map(([key, q], index) => {
    const d = BigInt(key), negative = q.n < 0n, magnitude = negative ? q.neg() : q;
    const basis = bigAbs(d) === 1n ? '' : `sqrt(${bigAbs(d)})`;
    const unit = d < 0n ? `${basis}${basis ? '*' : ''}i` : basis;
    const body = !unit ? String(magnitude) : magnitude.eq(1) ? unit : `${magnitude}*${unit}`;
    return `${index ? negative ? ' - ' : ' + ' : negative ? '-' : ''}${body}`;
  }).join('') || '0';
}

// Fully parenthesized rendering preserves substituted fractions, signs, and
// power precedence even when a numeric AST node itself contains a fraction.
function expressionText(ast) {
  if (ast.type === 'num') return ast.value.startsWith('-') || ast.value.includes('/') ? `(${ast.value})` : ast.value;
  if (ast.type === 'sym') return ast.name;
  if (ast.type === 'neg') return `(-${expressionText(ast.arg)})`;
  if (ast.type === 'call') return `${ast.name}(${ast.args.map(expressionText).join(', ')})`;
  return `(${expressionText(ast.left)} ${ast.op} ${expressionText(ast.right)})`;
}

function substituteAll(ast, values) {
  if (ast.type === 'sym') return own(values, ast.name) ? { type: 'num', value: values[ast.name] } : ast;
  if (ast.type === 'neg') return { ...ast, arg: substituteAll(ast.arg, values) };
  if (ast.type === 'call') return { ...ast, args: ast.args.map(arg => substituteAll(arg, values)) };
  if (ast.type === 'binary') return { ...ast, left: substituteAll(ast.left, values), right: substituteAll(ast.right, values) };
  return ast;
}

function exactSign(field) {
  if (field === null || [...field.keys()].some(key => BigInt(key) < 0n)) return null;
  if (!field.size) return 0;
  const signs = new Set([...field.values()].map(q => q.n < 0n ? -1 : 1));
  if (signs.size === 1) return [...signs][0];
  // Certified rational intervals determine signs without floating-point tests.
  for (const digits of [8, 16, 32, 64]) {
    const scale = 10n ** BigInt(digits);
    let lower = Q(0), upper = Q(0);
    for (const [key, coefficient] of field) {
      const radicand = BigInt(key), root = integerSqrt(radicand * scale * scale);
      const low = Q(root).div(scale), high = root * root === radicand * scale * scale ? low : Q(root + 1n).div(scale);
      lower = lower.add(coefficient.mul(coefficient.n < 0n ? high : low));
      upper = upper.add(coefficient.mul(coefficient.n < 0n ? low : high));
    }
    if (lower.cmp(0) > 0) return 1;
    if (upper.cmp(0) < 0) return -1;
  }
  return null;
}

// null means that a subexpression is retained symbolically. Both operands and
// all function arguments are visited so unknown functions cannot hide 1/0.
function exactExpression(ast, context) {
  if (ast.type === 'num') return scalar(Q(ast.value));
  if (ast.type === 'sym') return ast.name === 'i' ? new Map([['-1', Q(1)]]) : null;
  if (ast.type === 'neg') {
    const arg = exactExpression(ast.arg, context);
    return arg === null ? null : fieldScale(arg, Q(-1));
  }
  if (ast.type === 'binary') {
    const a = exactExpression(ast.left, context), b = exactExpression(ast.right, context);
    if (ast.op === '/') {
      context.restrictions.add(`${expressionText(ast.right)} != 0`);
      if (b !== null && !b.size) invalid('Division by zero is undefined.');
      if (b === null) context.unprovenDomain = true;
    }
    if (ast.op === '^' && a !== null && b !== null) {
      const exponent = asRational(b);
      if (exponent !== null) {
        if (!a.size && exponent.n <= 0n) invalid('Zero to a nonpositive exponent is undefined.');
        if (exponent.n < 0n) context.restrictions.add(`${expressionText(ast.left)} != 0`);
        if (!exponent.integer) {
          const base = asRational(a);
          return exponent.eq('1/2') && base !== null ? fieldRoot(base, context) : null;
        }
        if (bigAbs(exponent.n) > 64n) unsupported('Expression powers are limited to integers from -64 through 64.');
        return fieldPow(a, Number(exponent.n), context);
      }
    }
    if (a === null || b === null) {
      if (ast.op === '-' && ast.left.type === 'sym' && ['pi', 'e'].includes(ast.left.name) &&
          expressionText(ast.left) === expressionText(ast.right)) return scalar(Q(0));
      return null;
    }
    if (ast.op === '+') return fieldAdd(a, b);
    if (ast.op === '-') return fieldAdd(a, b, Q(-1));
    if (ast.op === '*') return fieldMul(a, b, context);
    if (ast.op === '/') return fieldMul(a, fieldInverse(b, context), context);
    return null;
  }
  const args = ast.args.map(arg => exactExpression(arg, context)), a = args[0];
  const q = a === null ? null : asRational(a);
  if (['ln', 'log'].includes(ast.name)) {
    for (let i = 0; i < args.length; i++) {
      context.restrictions.add(`${expressionText(ast.args[i])} > 0`);
      const sign = exactSign(args[i]);
      if (sign !== null && sign <= 0) invalid('Logarithms require positive real arguments and bases.');
      if (sign === null) context.unprovenDomain = true;
      if (args[i] !== null && [...args[i].keys()].some(key => BigInt(key) < 0n))
        invalid('Only real logarithms are supported.');
    }
    if (args[1] !== undefined) {
      context.restrictions.add(`${expressionText(ast.args[1])} != 1`);
      if (args[1] !== null && asRational(args[1])?.eq(1)) invalid('A logarithm base must not equal 1.');
      if (args[1] === null) context.unprovenDomain = true;
    }
    return q?.eq(1) ? scalar(Q(0)) : null;
  }
  if (ast.name === 'sqrt') return q === null ? null : fieldRoot(q, context);
  if (ast.name === 'root') {
    const degree = args[1] === null ? null : asRational(args[1]);
    if (!degree || !degree.integer || degree.cmp(1) < 0 || degree.cmp(31) > 0) invalid('Root degree must be an integer from 1 through 31.');
    if (q === null) return null;
    if (degree.eq(2)) return fieldRoot(q, context);
    const exact = rationalNthRoot(q, Number(degree)); return exact ? scalar(exact) : null;
  }
  if (ast.name === 'abs' && a !== null) {
    if (q !== null) return scalar(q.n < 0n ? q.neg() : q);
    if ([...a.keys()].every(key => ['1', '-1'].includes(key))) {
      const real = a.get('1') ?? Q(0), imag = a.get('-1') ?? Q(0);
      return fieldRoot(real.mul(real).add(imag.mul(imag)), context);
    }
    const sign = exactSign(a);
    return sign === null ? null : sign < 0 ? fieldScale(a, Q(-1)) : a;
  }
  if (q?.zero) {
    if (['sin', 'tan'].includes(ast.name)) return scalar(Q(0));
    if (['cos', 'exp'].includes(ast.name)) return scalar(Q(1));
  }
  return null;
}

function expression(input) {
  const kind = input.kind, source = read(input, 'expression');
  if (typeof source !== 'string') invalid('expression must be a mathematical string.');
  const ast = parseExpression(source), supplied = own(input, 'values') ? input.values : {};
  if (!record(supplied)) invalid('values must be an object of rational substitutions.');
  if (Object.keys(supplied).length > 512) unsupported('Too many substitutions.');
  const substitutions = Object.create(null);
  for (const key of Object.keys(supplied).sort()) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key) || ['pi', 'e', 'i', '__proto__', 'constructor', 'prototype'].includes(key))
      invalid(`Invalid substitution variable: ${key}.`);
    substitutions[key] = String(rational(supplied[key], `values.${key}`));
  }
  for (const variable of variables(ast)) if (!own(substitutions, variable)) invalid(`Missing value for ${variable}.`);
  const replaced = substituteAll(ast, substitutions), text = expressionText(replaced);
  const context = { products: 0, divisions: 0, primes: [], restrictions: new Set(), unprovenDomain: false };
  let field = exactExpression(replaced, context), rationalValue = null;
  // Use the parent's exact constant evaluator whenever it covers the input.
  try { rationalValue = constantValue(replaced); } catch (error) {
    if (error.code === 'invalid' || error.code === 'budget') throw error;
  }
  if (rationalValue !== null) field = scalar(rationalValue);
  if (context.unprovenDomain) field = null;
  const normalized = { kind, expression: source, values: { ...substitutions } };
  const steps = [step(source, text, 'simultaneous-substitution',
    'Replace each supplied variable by its exact rational value in the parsed syntax tree.')];
  if (field === null) {
    if (kind === 'complex') unsupported('This complex expression exceeds the supported exact radical arithmetic.');
    let preview = null;
    try {
      const value = evaluate(replaced);
      if (Number.isFinite(value)) preview = value === 0 ? 0 : value;
    } catch { /* No numerical preview. */ }
    steps.push(step(text, text, 'symbolic-retention',
      'Retain the exact substituted expression. The optional numerical preview is not a proof.', false));
    return solved(kind, normalized, { value: text, form: 'symbolic', exact: true,
      approximation: { value: preview, verified: false } }, steps, [...context.restrictions],
    { method: 'syntax-tree-substitution', substituted: text }, false);
  }
  const value = fieldText(field), real = new Map(), imaginary = new Map();
  for (const [key, coefficient] of field) (BigInt(key) < 0n ? imaginary : real).set(String(bigAbs(BigInt(key))), coefficient);
  const form = kind === 'complex' || imaginary.size ? 'complex' : asRational(field) === null ? 'radical' : 'rational';
  const answer = { value, form, exact: true };
  if (form === 'complex') { answer.real = fieldText(real); answer.imaginary = fieldText(imaginary); }
  steps.push(step(text, value, rationalValue !== null ? 'exact-rational-arithmetic' : 'exact-radical-arithmetic',
    rationalValue !== null ? 'Evaluate the substituted expression with core constantValue and Q.' :
      'Normalize square roots and combine exact radical coefficients; rationalize divisors by conjugation.'));
  return solved(kind, normalized, answer, steps, [...context.restrictions],
    { method: rationalValue !== null ? 'constant-value' : 'exact-radical-field', substituted: text,
      terms: [...field].sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : 1)
        .map(([radicand, coefficient]) => ({ radicand, coefficient: String(coefficient) })) });
}

function compute(input) {
  if (!record(input)) invalid('Supply a structured extension request.');
  switch (read(input, 'kind')) {
    case 'sequence': return sequence(input);
    case 'matrix': return matrix(input);
    case 'statistics': return statistics(input);
    case 'combinatorics': return combinatorics(input);
    case 'evaluate': case 'complex': return expression(input);
    default: unsupported('Unknown extension kind.');
  }
}

/** Solve a bounded structured supplemental request. Scalar results and matrix
 * entries are canonical rational strings; symbolic previews live exclusively
 * in answer.approximation and are never marked verified. */
export function solveExtension(input) {
  try { return compute(input); } catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : 'unsupported', verified: false,
      topic: record(input) && typeof input.kind === 'string' ? input.kind : 'extension',
      answer: {}, steps: [], restrictions: [],
      certificate: { version: 1, kind: 'extension', assurance: 'none' },
      error: error.message || 'Unable to compute this extension request.' };
  }
}

// Structural comparison rejects missing fields, extra claims, sparse arrays,
// cycles, and nonfinite numbers without invoking a candidate's toJSON method.
function equalReport(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 150000 || depth > 64) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  const a = Object.keys(expected).sort(), b = Object.keys(actual).sort();
  if (a.length !== b.length || (Array.isArray(expected) && expected.length !== actual.length)) return false;
  return a.every((key, i) => key === b[i] && equalReport(expected[key], actual[key], budget, depth + 1));
}

/** Replay every deterministic operation against the original input and compare
 * the entire report, including steps, restrictions, and certificate evidence.
 * true validates the report: a symbolic report still has verified:false and
 * never certifies its numerical preview as an exact mathematical value. */
export function verifyExtensionCertificate(input, result) {
  try { return result?.status === 'solved' && equalReport(compute(input), result); }
  catch { return false; }
}
