// Learning difficulty is a heuristic, not a measure of solver time or accuracy.
const DIFFICULTY_PATTERN = /^(0\.\d{3}|1\.000)$/;

export function difficultyToInt(value) {
  if (typeof value !== 'string' || value.length !== 5 || !DIFFICULTY_PATTERN.test(value)) {
    throw new TypeError('Difficulty must be a string from 0.000 through 1.000 with exactly three decimal places.');
  }
  return value === '1.000' ? 1000 : Number(value.slice(2));
}

export function formatDifficulty(value) {
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw new RangeError('Difficulty must be an integer number of thousandths from 0 through 1000.');
  }
  return value === 1000 ? '1.000' : `0.${String(value).padStart(3, '0')}`;
}

export function tierForDifficulty(value) {
  const score = difficultyToInt(value);
  return score < 400 ? 1 : score < 650 ? 2 : 3;
}

const TOPIC_ALIASES = {
  linear_equation: 'linear', linear_equations: 'linear',
  rational: 'rational_equation', polynomial: 'polynomial_simplification',
  system: 'systems', log: 'logarithmic', logarithm: 'logarithmic',
  abs: 'absolute_value', inequality: 'inequalities',
  arithmetic: 'arithmetic_sequence', geometric: 'geometric_sequence',
  pythagoras: 'pythagorean',
};

const CAPABILITIES = {
  linear: ['linear_equations'],
  distribution: ['distribution', 'linear_equations'],
  quadratic: ['polynomials', 'quadratic_equations', 'factoring'],
  polynomial_equation: ['polynomials', 'polynomial_equations'],
  rational_equation: ['rational_equations', 'domain_restrictions'],
  rational_function: ['rational_functions', 'function_transformations', 'domain_restrictions'],
  polynomial_simplification: ['polynomials', 'combine_like_terms'],
  systems: ['linear_systems', 'elimination'],
  exponential: ['exponential_equations'],
  radical: ['radical_equations', 'domain_restrictions', 'extraneous_solution_check'],
  logarithmic: ['logarithmic_equations', 'domain_restrictions'],
  absolute_value: ['absolute_value_equations', 'case_analysis'],
  inequalities: ['linear_inequalities', 'inequality_reversal'],
  arithmetic_sequence: ['arithmetic_sequences'],
  geometric_sequence: ['geometric_sequences'],
  distance: ['coordinate_geometry', 'distance_formula'],
  pythagorean: ['right_triangles', 'pythagorean_theorem'],
};

function inputDescription(input) {
  if (typeof input === 'string') {
    if (!input.trim()) throw new TypeError('A nonempty mathematical input is required.');
    return { text: input, structured: null };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be mathematical text or a structured problem object.');
  }
  // Inspect only the mathematical fields; do not count property names as variables.
  const parts = [];
  for (const key of ['input', 'expression', 'equation', 'problem']) {
    if (typeof input[key] === 'string') parts.push(input[key]);
  }
  if (Array.isArray(input.equations)) {
    parts.push(...input.equations.filter(value => typeof value === 'string'));
  }
  if (Array.isArray(input.points)) {
    parts.push(...input.points.flat().filter(value => typeof value === 'number').map(String));
  }
  for (const key of ['first', 'step', 'ratio', 'n', 'a', 'b']) {
    if (typeof input[key] === 'number') parts.push(String(input[key]));
  }
  if (!parts.length && typeof input.kind !== 'string' && typeof input.topic !== 'string') {
    throw new TypeError('The structured input must include a kind, topic, or mathematical expression.');
  }
  return { text: parts.join(' ; '), structured: input };
}

function identifyTopic(text, input) {
  const declared = input?.topic;
  if (declared && Object.hasOwn(CAPABILITIES, declared)) return declared;
  if (declared && Object.hasOwn(TOPIC_ALIASES, declared)) return TOPIC_ALIASES[declared];
  if (input?.kind === 'system') return 'systems';
  if (input?.kind === 'sequence') {
    return input.type === 'geometric' ? 'geometric_sequence'
      : input.type === 'arithmetic' ? 'arithmetic_sequence' : 'unknown';
  }
  if (input?.kind === 'geometry') return 'unknown';
  const declaredKind = TOPIC_ALIASES[input?.kind] ?? input?.kind;
  if (Object.hasOwn(CAPABILITIES, declaredKind)) return declaredKind;
  if (/\b(?:log|ln)\s*\(/i.test(text)) return 'logarithmic';
  if (/\bsqrt\s*\(|√/i.test(text)) return 'radical';
  if (/\babs\s*\(|\|[^|]+\|/i.test(text)) return 'absolute_value';
  if (/[<>≤≥]/.test(text)) return 'inequalities';
  if (/\bf\s*\(\s*x\s*\)\s*=/.test(text) && /\//.test(text)) return 'rational_function';
  if (/\^\s*\(?\s*[a-z]/i.test(text)) return 'exponential';
  if (/\/\s*\([^)]*[a-z]|\/\s*[a-z]/i.test(text)) return 'rational_equation';
  if (/=/.test(text) && [...text.matchAll(/[a-zA-Z]\s*\^\s*\(?\s*(\d+)/g)].some(match => Number(match[1]) > 2)) return 'polynomial_equation';
  if (/\^\s*2\b|[²]/.test(text) && /=/.test(text)) return 'quadratic';
  if (!/=/.test(text) && /[a-z]/i.test(text) && /[+*^−-]/.test(text)) return 'polynomial_simplification';
  if (/\d\s*\*?\s*\([^)]*[a-z]/i.test(text)) return 'distribution';
  if (/[a-z]/i.test(text) && /=/.test(text)) return 'linear';
  return 'unknown';
}

function nestingDepth(text) {
  let depth = 0;
  let maximum = 0;
  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') maximum = Math.max(maximum, ++depth);
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
  }
  return maximum;
}

/** Nonlinear initial calibration only; no empirical accuracy or mastery claim. */
export function estimateDifficulty(input) {
  const { text, structured } = inputDescription(input);
  const topic = identifyTopic(text, structured);
  const tokenCount = (text.match(/\d+(?:\.\d+)?|[a-zA-Z_]+|[^\s]/g) ?? []).length;
  const expressionText = text.replace(/\b(?:sqrt|log|ln|abs|sin|cos|tan)\b/gi, '');
  const variables = new Set(expressionText.match(/(?<![a-zA-Z_])[a-zA-Z](?![a-zA-Z_])/g) ?? []);
  if (topic === 'rational_function') variables.delete('f');
  if (Array.isArray(structured?.variables)) {
    for (const variable of structured.variables) {
      if (typeof variable === 'string') variables.add(variable);
    }
  }
  const equationCount = structured?.kind === 'system' && Array.isArray(structured.equations)
    ? structured.equations.length : (text.match(/(?<![<>!])=(?!=)/g) ?? []).length;
  const exponents = [...text.matchAll(/[a-zA-Z]\s*\^\s*\(?\s*(\d+)/g)].map(match => Number(match[1]));
  const degree = Math.min(100, Math.max(topic === 'quadratic' ? 2 : 1, ...exponents));
  const fractions = text.includes('/') || (structured?.kind === 'sequence'
    && [structured.first, structured.step, structured.ratio].some(value => typeof value === 'number' && !Number.isInteger(value)));
  const radicals = topic === 'radical' || /sqrt\s*\(|√/i.test(text);
  const logarithms = topic === 'logarithmic' || /\b(?:log|ln)\s*\(/i.test(text);
  const domainRestrictions = ['rational_equation', 'rational_function', 'radical', 'logarithmic'].includes(topic);
  const baseSteps = {
    linear: 2, distribution: 3, quadratic: 4, polynomial_equation: 4, rational_equation: 4,
    rational_function: 7, polynomial_simplification: 2, systems: 5,
    exponential: 3, radical: 4, logarithmic: 3, absolute_value: 4,
    inequalities: 3, arithmetic_sequence: 2, geometric_sequence: 3,
    distance: 3, pythagorean: 3, unknown: 1,
  }[topic];
  const nesting = nestingDepth(text);
  const branching = ['absolute_value', 'quadratic', 'polynomial_equation'].includes(topic) ? 2
    : topic === 'systems' ? Math.max(1, equationCount) : 1;
  const steps = baseSteps + Math.max(0, nesting - 1) + Math.max(0, equationCount - 2);
  const theoremCombinations = topic === 'distance' || topic === 'pythagorean' ? 1 : 0;
  const negatives = /[-−]/.test(text);

  // The log terms give diminishing increments; this is an explicit, provisional
  // calibration of learning demands rather than a linear grade or solve budget.
  const learningLoad = 0.74 * Math.log1p(steps)
    + 0.32 * Math.log1p(nesting)
    + 0.32 * Math.log1p(Math.max(0, variables.size - 1))
    + 0.36 * Math.log1p(Math.max(0, degree - 1))
    + 0.36 * Math.log1p(branching - 1)
    + (fractions ? 0.30 : 0) + (negatives ? 0.10 : 0)
    + (domainRestrictions ? 0.36 : 0) + (radicals ? 0.24 : 0)
    + (logarithms ? 0.34 : 0) + 0.12 * theoremCombinations;
  const score = Math.min(1000, Math.max(0, Math.round(1000 * (1 - Math.exp(-learningLoad / 3.2)))));
  const difficulty = formatDifficulty(score);
  // Separate work proxy: it is neither milliseconds nor a learning score.
  const computationalCost = Math.ceil(Math.max(1, tokenCount) * (1 + nesting)
    * Math.min(16, degree + 1) * Math.max(1, equationCount)
    * branching * (domainRestrictions ? 2 : 1));
  const features = {
    topic, steps, nesting, variables: variables.size, fractions, negatives,
    degree, radicals, logarithms, exponentials: topic === 'exponential',
    absolute_values: topic === 'absolute_value', domain_restrictions: domainRestrictions,
    branching, equation_count: equationCount, token_count: tokenCount,
    theorem_combinations: theoremCombinations,
    proof_type: structured?.kind === 'geometry' ? 'geometric'
      : structured?.kind === 'sequence' ? 'sequence' : 'algebraic_rewrite',
    estimated_computational_cost: computationalCost,
    computational_cost_unit: 'heuristic_work_units',
  };
  return {
    difficulty, score, engine: tierForDifficulty(difficulty), features,
    capabilities: [...(CAPABILITIES[topic] ?? [])],
    explanation: `Provisional nonlinear/logarithmic learning-difficulty heuristic for ${topic}, using estimated steps, nesting, branches, and concepts. Computational cost (${computationalCost} heuristic work units) is a separate estimate, not elapsed time or student learning difficulty. No empirical accuracy claim is made.`,
  };
}
