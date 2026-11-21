import { MathError, parseStatement, parseExpression, rationalFunction, polynomialResidual, pVariables, pDegree, variables, print, normalizeInput, stableStringify } from './core.js';
import { solveEquation, simplifyExpression, solveInequality, solveSystem, functionAnalysis, buildLinearSystem } from './algebra.js';
import { verifyAlgebraResult, verifyCertificate, verifyTransition as verifyTransitionInternal } from './verifier.js';
import { checkWork as checkWorkInternal } from './work.js';
import { solveGeometry, parseGeometry, verifyGeometryProof, verifyGeometryCertificate } from './geometry.js?v=proof-lab-18';
import { generateProblem as generateRawProblem, TOPICS } from './generator.js?v=proof-lab-18';
import { estimateDifficulty, difficultyToInt, formatDifficulty, tierForDifficulty } from './difficulty.js';
import { solveExtension, verifyExtensionCertificate } from './extensions.js';
import { solveConic, verifyConicCertificate } from './conics.js?v=proof-lab-18';
import { solveAdvanced, verifyAdvancedCertificate } from './advanced-algebra.js?v=proof-lab-18';
import { isCompoundInequality, solveCompoundInequality, verifyCompoundCertificate } from './compound-inequalities.js';
import { latexToInput, toLatex, validateLatex, formatResultLatex } from './latex.js?v=proof-lab-18';
import { solveLiteralEquation, verifyLiteralCertificate } from './literal-equations.js';
import { solveFiniteAggregate, verifyFiniteAggregate } from './finite-aggregates.js';
import { solvePiecewise, verifyPiecewiseCertificate } from './piecewise.js';
import { solvePrecalculus, verifyPrecalculusCertificate } from './precalculus.js';
import { solvePrecalcFunctions, verifyPrecalcFunctionsCertificate } from './precalc-functions.js';
import { solveDataReasoning, verifyDataReasoningCertificate } from './data-reasoning.js';
import { solveParametric, verifyParametricCertificate } from './parametric.js';
import { parseWordProblem, solveWordProblem, verifyWordProblemCertificate } from './word-problems.js';
import { solveTrigModels, verifyTrigModelsCertificate } from './trig-models.js';

export { verifyCertificate, solveGeometry, verifyGeometryProof, solveConic, solvePrecalculus, solvePrecalcFunctions, solveDataReasoning, solveParametric, solveTrigModels, parseWordProblem, solveWordProblem, TOPICS, estimateDifficulty, difficultyToInt, formatDifficulty, tierForDifficulty, latexToInput, toLatex, validateLatex };
export { parseExpression, parseStatement, evaluate, print, Rational, Q } from './core.js';

const EXTENSIONS = new Set(['sequence', 'matrix', 'statistics', 'combinatorics', 'evaluate', 'complex']);
const algebraExtensionInput = prepared => ({ kind: /\bi\b|\di\b/.test(prepared.text) ? 'complex' : 'evaluate', expression: prepared.text });
function bareOutput(output) { const candidate = { ...output }; delete candidate.routing; delete candidate.input; delete candidate.latex; delete candidate.notation; return candidate; }
function normalizeMathInput(input) {
  if (typeof input === 'string') return parseWordProblem(input) || latexToInput(input, { allowPlain: true });
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const out = { ...input };
    for (const key of ['expression', 'equation', 'dividend', 'divisor', 'f', 'g']) if (typeof out[key] === 'string') out[key] = latexToInput(out[key], { allowPlain: true });
    if (Array.isArray(out.equations)) out.equations = out.equations.map(e => typeof e === 'string' ? latexToInput(e, { allowPlain: true }) : e);
    if (out.kind === 'piecewise' && Array.isArray(out.pieces)) out.pieces = out.pieces.map(p => p && typeof p === 'object' ? { ...p, expression: typeof p.expression === 'string' ? latexToInput(p.expression) : p.expression, condition: typeof p.condition === 'string' && !/^(otherwise|else|true)$/i.test(p.condition) ? latexToInput(p.condition) : p.condition } : p);
    return out;
  }
  return input;
}
function prepareInput(input, options) {
  input = normalizeMathInput(input);
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const data = { ...input };
    if (!data.kind && data.topic) data.kind = 'geometry';
    return data;
  }
  if (typeof input !== 'string') throw new MathError('Enter mathematical text or a structured problem object.', 'invalid');
  const text = input.trim();
  if (text.startsWith('{')) { let parsed; try { parsed = JSON.parse(text); } catch { throw new MathError('The structured problem is not valid JSON.', 'invalid'); } return prepareInput(parsed, options); }
  const geometry = parseGeometry(text); if (geometry) return geometry;
  if (text.includes(';') || /\r?\n/.test(text)) {
    const equations = text.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
    if (equations.length > 1) return { kind: 'system', equations };
  }
  const command = /^(solve|simplify|expand|factor|analyze|conic)\s*:?\s+(.+)$/is.exec(text), math = command ? command[2] : text, task = options.task || command?.[1] || 'auto';
  if (task === 'conic') return { kind: 'conic', equation: math };
  if (isCompoundInequality(math)) return { kind: 'compound_inequality', expression: math };
  const statement = parseStatement(math);
  if (statement.kind === 'equation' && options.variable && typeof options.variable === 'string' && new Set([...variables(statement.left), ...variables(statement.right)]).size > 1) return { kind: 'literal_equation', equation: math, variable: options.variable };
  if (statement.kind === 'equation') {
    const names = [...new Set([...variables(statement.left), ...variables(statement.right)])].sort();
    if (names.length === 2) {
      if (statement.left.type === 'sym' && statement.left.name === 'y' && variables(statement.right).length === 1 && variables(statement.right)[0] === 'x') return { kind: 'algebra', text: `f(x) = ${print(statement.right)}`, task: 'analyze', domain: 'real' };
      try { const r = polynomialResidual(statement); if (pDegree(r.num) <= 2 && !pVariables(r.den).length) return { kind: 'conic', equation: math, variables: names }; }
      catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
    }
  }
  return { kind: 'algebra', text: math, task, domain: options.domain || 'real' };
}
function requiredTier(input) {
  if (input.kind === 'system') { try { const built = buildLinearSystem(input); return built.variables.length > 2 ? 3 : 2; } catch (e) { if (e.code === 'invalid') throw e; return 3; } }
  if (input.kind === 'conic') return 3;
  if (['compound_inequality', 'polynomial_division', 'function_operation', 'literal_equation', 'piecewise'].includes(input.kind)) return 3;
  if (input.kind === 'finite_aggregate') return 2;
  if (['precalculus', 'precalc_functions', 'parametric', 'trig_models'].includes(input.kind)) return 3;
  if (input.kind === 'data_reasoning') return input.topic === 'regression' ? 3 : 2;
  if (input.kind === 'word_problem') return input.type === 'mixture' ? 3 : 2;
  if (input.kind === 'geometry') return input.topic === 'proof' ? 3 : ['circle', 'rectangle', 'triangle_angles', 'pythagoras', 'pythagorean'].includes(input.topic) ? 1 : 2;
  if (EXTENSIONS.has(input.kind)) return ['matrix', 'complex'].includes(input.kind) ? 3 : 1;
  if (input.kind !== 'algebra') throw new MathError(`Unsupported request kind: ${String(input.kind)}.`);
  const s = parseStatement(input.text);
  if (s.kind === 'function') return 2;
  if (s.kind === 'inequality') return 2;
  try {
    const r = s.kind === 'equation' ? polynomialResidual(s) : rationalFunction(s.expression), vs = pVariables(r.num), degree = pDegree(r.num), denominatorVars = pVariables(r.den);
    if (degree > 2 || vs.length > 1) return 3;
    if (degree > 1 || denominatorVars.length || input.task === 'factor') return 2;
    return 1;
  } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; return 3; }
}
function dispatch(input, options) {
  if (input.kind === 'geometry') return solveGeometry(input);
  if (input.kind === 'system') { try { return solveSystem(input); } catch (e) { if (e.code === 'invalid') throw e; return solveAdvanced(input, options); } }
  if (input.kind === 'conic') return solveConic(input);
  if (input.kind === 'compound_inequality') return solveCompoundInequality(input);
  if (input.kind === 'literal_equation') return solveLiteralEquation(input);
  if (input.kind === 'finite_aggregate') return solveFiniteAggregate(input);
  if (input.kind === 'piecewise') return solvePiecewise(input);
  if (input.kind === 'precalculus') return solvePrecalculus(input);
  if (input.kind === 'precalc_functions') return solvePrecalcFunctions(input);
  if (input.kind === 'data_reasoning') return solveDataReasoning(input);
  if (input.kind === 'parametric') return solveParametric(input);
  if (input.kind === 'word_problem') return solveWordProblem(input);
  if (input.kind === 'trig_models') return solveTrigModels(input);
  if (['polynomial_division', 'function_operation'].includes(input.kind)) return solveAdvanced(input, options);
  if (EXTENSIONS.has(input.kind)) return solveExtension(input);
  if (input.kind !== 'algebra') throw new MathError(`Unsupported request kind: ${String(input.kind)}.`);
  const s = parseStatement(input.text);
  if (s.kind === 'function') return functionAnalysis(input.text);
  if (s.kind === 'equation') {
    try { const out = solveEquation(input.text, { ...options, domain: input.domain }); if (out.status === 'solved') return out; const advanced = solveAdvanced(input.text, { ...options, domain: input.domain }); return advanced.status === 'solved' ? advanced : out; }
    catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; const advanced = solveAdvanced(input.text, { ...options, domain: input.domain }); if (advanced.status === 'solved') return advanced; throw e; }
  }
  if (s.kind === 'inequality') { try { return solveInequality(input.text); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; const advanced = solveAdvanced(input.text, options); if (advanced.status === 'solved') return advanced; throw e; } }
  if (variables(s.expression).includes('i') || /\bi\b|\di\b/.test(input.text)) return solveExtension({ kind: 'complex', expression: input.text });
  try { return simplifyExpression(input.text, input.task === 'auto' ? 'simplify' : input.task); }
  catch (error) {
    if (error.code === 'invalid' || error.code === 'budget' || variables(s.expression).length) throw error;
    return solveExtension(algebraExtensionInput(input));
  }
}
export function verifyResult(input, output, options = {}) {
  try {
    const variable = options.variable ?? (output.certificate?.type === 'literal_equation' ? output.certificate.input.variable : undefined);
    const prepared = prepareInput(input, { ...options, variable });
    if (output.status !== 'solved' || output.verified !== true) return false;
    if (output.latex && (!output.latex.valid || stableStringify(output.latex) !== stableStringify(formatResultLatex(input, output)))) return false;
    return verifyPreparedReport(prepared, output);
  } catch { return false; }
}
const REPLAY_KERNELS = Object.freeze(Object.assign(Object.create(null), {
  geometry: verifyGeometryCertificate, conic: verifyConicCertificate,
  literal_equation: verifyLiteralCertificate, compound_inequality: verifyCompoundCertificate,
  finite_aggregate: verifyFiniteAggregate, piecewise: verifyPiecewiseCertificate,
  precalculus: verifyPrecalculusCertificate,
  precalc_functions: verifyPrecalcFunctionsCertificate,
  data_reasoning: verifyDataReasoningCertificate,
  parametric: verifyParametricCertificate,
  word_problem: verifyWordProblemCertificate,
  trig_models: verifyTrigModelsCertificate,
}));
function verifyPreparedReport(prepared, output) {
  const report = bareOutput(output);
  if (report.certificate?.type === 'advanced_algebra') return verifyAdvancedCertificate(prepared.kind === 'algebra' ? prepared.text : prepared, report);
  if (REPLAY_KERNELS[prepared.kind]) return REPLAY_KERNELS[prepared.kind](prepared, report);
  if (EXTENSIONS.has(prepared.kind)) return verifyExtensionCertificate(prepared, report);
  if (prepared.kind === 'algebra' && report.certificate?.kind === 'extension') return verifyExtensionCertificate(algebraExtensionInput(prepared), report);
  if (prepared.kind === 'system') { if (stableStringify(report.certificate?.input) !== stableStringify(prepared)) return false; }
  else if (prepared.kind === 'algebra') { if (normalizeInput(report.certificate?.source || '') !== normalizeInput(prepared.text)) return false; }
  else return false;
  return verifyAlgebraResult(report);
}
function solveInternal(input, options = {}) {
  const attempts = []; let prepared, estimation, difficulty, initialEngine = 1, minimum = 1;
  try {
    if (!options || typeof options !== 'object') throw new MathError('Solver options must be an object.', 'invalid');
    if (options.domain !== undefined && !['real', 'complex'].includes(options.domain)) throw new MathError('Equation domain must be real or complex.', 'invalid');
    prepared = prepareInput(input, options);
    estimation = estimateDifficulty(prepared.kind === 'algebra' ? prepared.text : prepared);
    difficulty = options.difficulty ?? estimation.difficulty;
    difficultyToInt(difficulty); initialEngine = tierForDifficulty(difficulty); minimum = requiredTier(prepared);
    for (let engine = initialEngine; engine <= 3; engine++) {
      if (engine < minimum) { attempts.push({ engine, status: 'unsupported', reason: `Preflight requires Engine ${minimum} capabilities; no speculative answer was produced.` }); continue; }
      let output;
      try { output = dispatch(prepared, options); }
      catch (e) {
        if (e.code === 'invalid') throw e;
        attempts.push({ engine, status: e.code === 'budget' ? 'timeout' : 'unsupported', reason: e.message });
        if (engine === 3) return { status: e.code === 'budget' ? 'unresolved' : 'unsupported', verified: false, topic: 'unsupported', answer: null, steps: [], restrictions: [], routing: { initialEngine, finalEngine: engine, difficulty, estimatedDifficulty: estimation.difficulty, attempts }, error: e.message };
        continue;
      }
      if (output.status !== 'solved') {
        attempts.push({ engine, status: output.status, reason: output.error || 'This tier did not produce a complete solution.' });
        if (engine < 3 && !['invalid'].includes(output.status)) continue;
      } else {
        const isExtension = EXTENSIONS.has(prepared.kind) || output.certificate?.kind === 'extension', isAdvanced = output.certificate?.type === 'advanced_algebra';
        const verified = verifyPreparedReport(prepared, output);
        if (!verified) {
          attempts.push({ engine, status: 'verification_failed', reason: 'The candidate did not pass its deterministic certificate check.' });
          if (engine < 3) continue;
          return { ...output, status: 'unresolved', verified: false, steps: output.steps.map(s => ({ ...s, verified: false })), routing: { initialEngine, finalEngine: engine, difficulty, estimatedDifficulty: estimation.difficulty, attempts }, error: 'The proposed result could not be certified. It is not an accepted solution.' };
        }
        if (isExtension && output.verified !== true) {
          attempts.push({ engine, status: 'unresolved', reason: 'Symbolic substitution is retained, but numerical previews are not an exact proof.' });
          return { ...output, status: 'unresolved', routing: { initialEngine, finalEngine: engine, difficulty, estimatedDifficulty: estimation.difficulty, attempts }, error: 'An exact symbolic expression is available, but this expression has not been fully evaluated by an exact supported rule.' };
        }
        output.verified = true;
        if (!REPLAY_KERNELS[prepared.kind] && !isExtension && !isAdvanced) output.steps = output.steps.map(s => ({ ...s, verified: true, assurance: 'exact-rule-check' }));
        attempts.push({ engine, status: 'solved', reason: prepared.kind === 'geometry' ? output.certificate.assurance : 'The exact mathematical certificate was accepted.' });
      }
      return { ...output, routing: { initialEngine, finalEngine: engine, difficulty, estimatedDifficulty: estimation.difficulty, attempts }, input: typeof input === 'string' ? input : prepared };
    }
  } catch (error) {
    return { status: error.code === 'budget' ? 'unresolved' : error instanceof MathError && error.code !== 'invalid' ? 'unsupported' : 'invalid', verified: false, topic: 'input', answer: null, steps: [], restrictions: [], routing: { initialEngine, finalEngine: attempts.at(-1)?.engine || initialEngine, difficulty: difficulty || null, attempts }, error: error.message || String(error) };
  }
}

export function solve(input, options = {}) {
  const report = solveInternal(input, options), latex = formatResultLatex(input, report);
  if (report.status === 'solved' && !latex.valid) return { ...report, status: 'unresolved', verified: false, mathematicalCertificateVerified: report.verified, latex, error: 'The mathematical report passed, but its LaTeX presentation did not pass the notation validator.' };
  return { ...report, latex };
}
export function verifyTransition(before, after, options = {}) {
  try {
    const a = latexToInput(before), b = latexToInput(after);
    if (typeof a !== 'string' || typeof b !== 'string') throw new MathError('Use algebra statements when checking a transition.');
    return { ...verifyTransitionInternal(a, b, options), latex: { before: toLatex(before), after: toLatex(after), valid: validateLatex(toLatex(before), { allowPlain: false }).valid && validateLatex(toLatex(after), { allowPlain: false }).valid } };
  } catch (e) { return { status: e.code === 'invalid' ? 'invalid' : 'unresolved', explanation: e.message, rule: 'notation_input' }; }
}
export function checkWork(problem, submitted, options = {}) {
  try {
    const original = latexToInput(problem), raw = typeof submitted === 'string' ? submitted.split(/\r?\n/) : submitted;
    if (typeof original !== 'string' || !Array.isArray(raw)) throw new MathError('Check work takes an algebra statement and a list of LaTeX lines.', 'invalid');
    if (raw.length > 100 || raw.some(s => typeof s !== 'string')) throw new MathError('Provide at most 100 text steps.', 'invalid');
    const lines = raw.map(s => s.trim() ? latexToInput(s) : '');
    if (lines.some(s => typeof s !== 'string')) throw new MathError('Each submitted step must be one algebra statement.', 'invalid');
    const report = checkWorkInternal(original, lines, options), latex = formatResultLatex(problem, { ...report, answer: report.summary, steps: report.steps.map(s => ({ before: s.input, after: s.input })) });
    const ghosts = [...report.ghostSteps, ...report.correctedSteps];
    for (const g of ghosts) for (const key of ['before', 'after']) { const checked = validateLatex(toLatex(g[key]), { allowPlain: false }); if (!checked.valid) { latex.valid = false; latex.errors.push(...checked.errors); } }
    return { ...report, latex };
  } catch (e) { const report = { status: e.code === 'invalid' ? 'invalid' : 'unresolved', complete: false, firstError: null, steps: [], ghostSteps: [], correctedSteps: [], summary: e.message }; return { ...report, latex: formatResultLatex(problem, { ...report, answer: report.summary }) }; }
}

export function generateProblem(options = {}) {
  const generated = generateRawProblem(options), checked = solve(generated.input, { difficulty: generated.difficulty });
  if (checked.status !== 'solved' || !checked.verified) throw new MathError(`The generated problem did not pass the independent engine check: ${checked.error || checked.status}.`);
  return { ...generated, solution: checked.steps, latex: checked.latex, verification: { status: 'verified', method: 'solve-and-replay-certificate', assurance: checked.certificate?.assurance || 'exact-rule-check' }, routing: checked.routing };
}

export function getCapabilities() {
  return {
    architecture: 'Owned deterministic symbolic engine; no language model, API key, CDN, or network required.',
    algebra_1: ['Exact rational arithmetic and percentages', 'Distribution, polynomial expansion, and multivariable common factors', 'Linear equations and compound inequalities', 'Literal formula rearrangement with zero-coefficient parameter cases', 'Linear systems including parameterized solutions', 'Quadratics', 'Absolute value equations and inequalities', 'Arithmetic sequences', 'Strictly matched fee/rate, consecutive-integer, discount, and mixture word-problem templates'],
    algebra_2: ['Polynomial division and rational factoring including cubic identities', 'Rational equations with domain restrictions', 'Quadratic radicals, complex roots, and biquadratic equations', 'Polynomial roots via rational factors and quadratic remainders', 'Radicals, nth roots, and rational powers with parity conditions', 'Logarithm product/quotient laws and equal-base exponentials', 'Rational, quadratic, and elementary function analysis', 'Function composition, evaluation, and supported inverses', 'Selected nonlinear systems using exact elimination', 'Piecewise polynomial domains, ranges, and first-match evaluation', 'Axis-aligned conics with exact square completion', 'Finite sums/products and geometric sequences', 'Matrices', 'Complex arithmetic'],
    geometry: ['Angles and triangles', 'Pythagorean theorem', 'Similarity and special right-triangle ratios', 'Coordinate distance, midpoint, slope, and line equations', 'Exact-rational coordinate transformations and line relations', 'Circle equations, tangent lines, arcs and sectors', 'Exact perpendicular-bisector and circumcircle constructions from coordinates', '2D areas and perimeters', '3D volumes and surface areas', 'Explicit-premise Euclidean congruence, similarity, circle, and perpendicular proof rules'],
    precalculus: ['Exact unit-circle values on the pi/12 grid', 'Finite-interval sine, cosine, and tangent equations for exact grid targets', 'Angle sum, difference, and double-angle identities', 'Exact bounded sinusoidal amplitude, period, range, and phase analysis', 'Selected principal inverse trig and angle-specific reciprocal/cofunction/Pythagorean checks', 'Selected exact polar conversions and rotations', 'Exact two- and three-dimensional vector arithmetic, dot/cross products, norms, and projection', 'Exact difference quotients and average rates for bounded polynomial/rational functions', 'Selected rational-root polynomial and rational-function analysis', 'Bounded exact exponential/logarithmic model rules', 'Exact bounded polynomial parametric evaluation, motion, and Cartesian elimination'],
    additional: ['Exact summary statistics', 'Exact least-squares line and correlation for bounded rational paired data', 'Two-way table conditional probability and independence', 'Bounded combinatorial probability', 'Combinations, permutations, and factorials', 'Expression evaluation'],
    notation: { input: 'Visual LaTeX math fields with templates and placeholders', renderer: 'Locally bundled MathLive and KaTeX; neither is the mathematical authority', validation: 'Owned grammar bridge plus bounded real LaTeX parser checks; completeness, display support, and proof validity are separate', output: 'Every public solver report carries replayable renderer-validated LaTeX fragments' },
    graphing: { features: ['Multiple editable expressions', 'Explicit and implicit curves', 'Bounded numerical polar and parametric curves', 'Inequality shading', 'Linear/logarithmic x and y scales and a circular polar grid', 'Parameter sliders', 'Drag pan, wheel/pinch zoom, and keyboard navigation', 'Coordinate tracing, editable windows, and PNG export'], assurance: 'Numerical exploration, never a mathematical proof', hosting: 'Local assets with no paid API, account, or remote runtime dependency' },
    proofChecking: { accepted: 'Exact identities, supported solution-set equivalence, and explicit geometry rules', ghosts: 'Bounded search for a verified linear path or rational-factor polynomial bridge; corrections are labeled separately', measurements: 'Geometry measurement numbers are approximations with exact formula expressions, not arbitrary formal proofs' },
    difficulty: { format: 'String with exactly three decimal places', bounds: ['0.000', '1.000'], engines: ['[0.000, 0.400)', '[0.400, 0.650)', '[0.650, 1.000]'], calibration: 'Nonlinear heuristic; educational difficulty is separate from computation cost' },
    limits: ['No unrestricted natural-language or handwritten parsing', 'No inference of unmarked facts from a geometry picture', 'No complete general solver for arbitrary transcendental or high-degree equations', 'Precalculus trigonometry and polar rules currently cover only exact pi/12-grid angles, not the full course', 'No empirically established percentage of curriculum coverage; use a separately curated benchmark', 'Unsupported and budget-limited inputs are never accepted as verified solutions'],
  };
}
