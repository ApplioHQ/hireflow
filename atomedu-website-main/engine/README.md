# Verified Math Engine

This engine runs entirely in Node or a browser. Its own parser, exact arithmetic, symbolic transformations, generator, and verification rules work without a model or remote service. LaTeX input uses locally bundled MathLive, and notation validation/typesetting uses locally bundled KaTeX. The UI is [Proof Lab](../proof-lab.html); the public module is [index.js](./index.js).

## Visual LaTeX and notation validation

The primary input is a visual math field, not a plain text calculator. The shared pad inserts fractions, powers, roots, logarithm bases, systems, matrices, piecewise cases, finite sums, and integral notation with editable placeholders. Select existing math to wrap it in a template. Tab or Next box moves between slots. LaTeX source is optionally editable, and structured requests remain available under Advanced.

Every public solver result carries `latex: { input, answer, restrictions, steps, valid, errors }`. The separate notation stage checks every fragment using the real bounded LaTeX parser and the owned grammar bridge. It rejects unsafe commands and incomplete templates. `latex.valid` does not mean a mathematical argument is correct; `verified` and the mathematical certificate provide that separate assurance. An integral can be valid notation and still be unsupported by the solver.

```js
import { solve, validateLatex, latexToInput, toLatex } from './engine/index.js';

const result = solve(String.raw`f(x)=\frac{2}{x-3}+1`);
const notationIsValid = result.latex.valid;
const mathematicsIsVerified = result.status === 'solved' && result.verified;
```

The bridge supports nested fractions, powers, nth roots, logarithm bases, implicit multiplication, comparisons, exact rational matrices, cases, and supported finite sums/products. Plain algebra remains backward-compatible. Unknown mathematical commands are unsupported rather than reinterpreted as products of letters. Macros, HTML, links, and resource-loading commands are not accepted.

## Public API

```js
import {
  solve, verifyResult, checkWork, verifyTransition,
  generateProblem, TOPICS, estimateDifficulty, getCapabilities,
} from './engine/index.js';

const result = solve('f(x)=2/(x-3)+1');
console.log(result.answer);
console.log(verifyResult('f(x)=2/(x-3)+1', result));

const work = checkWork('2(x+3)=14', ['x=4'], { showGhosts: true });
const practice = generateProblem({ topic: 'quadratic', difficulty: '0.583', seed: 42 });
```

`solve` returns `status`, `verified`, `topic`, `answer`, `steps`, `restrictions`, `certificate`, and `routing`. Status is `solved`, `invalid`, `unsupported`, or `unresolved`. A result is accepted only when `status === 'solved' && verified === true`.

`verifyResult(input, result)` binds verification to the supplied problem and rejects altered answers or proof data. `verifyTransition(before, after)` returns `valid`, `invalid`, or `unresolved`; a missing rule is not evidence of an incorrect step.

`checkWork` takes an original algebra statement and an array of submitted lines or a multiline string. It returns the first invalid transition, local feedback for each later line, whether the solution is complete, verified reconstructed `ghostSteps`, and a separately labeled `correctedSteps` continuation. Ghosts represent one valid reconstruction, not the student's hidden mental process. The bounded bridge search targets linear equations and rational-factor polynomial paths; equivalence checks cover more families than Ghost reconstruction.

`generateProblem` returns a seeded, parameterized problem, exact three-decimal difficulty string, features, expected result, checkpoints, intentional errors, and a separately verified `solution`. Its raw `referenceSteps` are pedagogical scaffolding; function transformations are labeled as transformations, not identities. Every generated problem must pass the solver and certificate replay before it is returned.

## Difficulty and engine tiers

Scores are strings matching `0.000` through `1.000`, inclusive. They are stored and compared as integer thousandths; floats are not accepted as difficulty labels.

| Range | Starting engine |
| --- | --- |
| `0.000 ≤ score < 0.400` | Engine 1 |
| `0.400 ≤ score < 0.650` | Engine 2 |
| `0.650 ≤ score ≤ 1.000` | Engine 3 |

Engine 1 uses direct arithmetic and linear transformations. Engine 2 adds structured quadratic, rational, system, function, and geometry capabilities. Engine 3 adds deeper factor search, inverse-function strategies, larger systems, matrices, and explicit-premise geometry proofs. The tiers share one mathematical representation and kernel; they are not three independent language models.

Preflight detects required capabilities before attempting a solve. A low-ranked problem escalates when it requires a higher tier. Each attempt and its reason are recorded. Engine 3 is the ceiling, not permission to guess. Educational difficulty uses a nonlinear heuristic and is distinct from computational cost; the scale is not yet empirically calibrated to student performance.

## Algebra text inputs

Use `+`, `-`, `*`, `/`, `^`, parentheses, and implicit multiplication such as `2x` or `3(x+1)`. Exponentiation is right associative, and `-x^2` means `-(x^2)`. `log(x)` is base 10; `log(x,2)` is base 2; `ln(x)` is natural logarithm. `abs(x)` and `|x|` are accepted. Decimals and scientific notation are converted to exact rationals.

```text
3x + 2 = 2(x + 4)
x/4 + 3 = 8
x^2 - 5x + 6 = 0
x^3 - 6x^2 + 11x - 6 = 0
(x^2 - 1)/(x - 1) = 0
sqrt(x + 5) = x - 1
2^(2x - 1) = 8
log(x + 2, 2) = 3
abs(2x - 1) = 5
-2x < 4
(x + 1)/(x - 2) >= 0
factor x^2 - 5x + 6
(x^2 - 9)/(x - 3)
f(x) = 2/(x - 3) + 1
f(x) = 2(x - 3)^2 + 1
f(x) = sqrt(x - 2) + 3
f(x) = log(x - 2) + 1
sqrt(8) + sqrt(2)
(2 + 3i)*(1 - i)
```

Equations default to real solutions. Pass `{ domain: 'complex' }` for complex quadratic roots. Proof checking accepts explicit alternatives such as `x = 3 or x = -3`, `x = ±3`, and rational solution sets such as `x ∈ {-3,3}`.

Supported algebra includes rational simplification, polynomial expansion, rational-factor polynomial equations, quadratics, linear systems, polynomial/rational sign charts, isolated absolute-value/radical/log/exponential equations, selected radical equations requiring candidate checks, and transformed rational, quadratic, absolute-value, radical, logarithmic, and exponential functions. Higher-degree root search can return partial results as unresolved rather than claiming completeness.

Additional exact strategies handle compound inequalities, scaled absolute-value inequalities, biquadratic substitution, rational powers with odd/even-root branch conditions, logarithm product/quotient laws, equal-base exponentials, polynomial division, function operations, and selected two-equation nonlinear systems. Factoring preserves irreducible remainders and extracts multivariable common factors. Function ranges account for removable holes, including missing quadratic vertices and repeated preimages.

A separate bounded word-problem grammar accepts fully matched English fee/rate, consecutive-integer, discount, and mixture templates. It records extracted facts and units, solves with exact rational arithmetic, then replays the claimed answer against the original model. Other prose is not guessed or labeled verified. The Solve panel offers an optional word-problem input under advanced options.

```js
solve('a*x+b=c', { variable: 'x' }); // Parameter conditions and zero-coefficient branches.
solve({ kind: 'polynomial_division', dividend: 'x^3+2x+1', divisor: 'x-1' });
solve({ kind: 'function_operation', operation: 'compose', f: '1/(x-1)', g: 'x^2' });
solve({ kind: 'function_operation', operation: 'inverse', f: '(2x+1)/(x-3)' });
solve({ kind: 'system', equations: ['x^2+y^2=25', 'y=x+1'] });
solve({ kind: 'piecewise', variable: 'x', pieces: [
  { expression: '-x', condition: 'x<0' },
  { expression: 'x', condition: 'otherwise' },
], value: '-3/2' });
solve({ kind: 'finite_aggregate', operation: 'sum', index: 'k', lower: 1, upper: 10, expression: 'k^2' });
```

Literal rearrangement returns separate nonzero-coefficient, identity, and inconsistent parameter branches. Piecewise polynomial analysis uses first-match semantics, exact rational interval operations, and extrema of affine/quadratic branches. General branch functions and irrational condition endpoints remain unsupported. Finite aggregates evaluate at most 1000 rational terms; they are not symbolic infinite-series or calculus solvers.

Function analysis reports the properties its rules establish. Rational functions preserve canceled holes separately from genuine vertical asymptotes. Quadratics include vertex, symmetry axis, and range. Not every general function's range or inverse is available.

Axis-aligned conics are analyzed by exact square completion. Try `x^2+y^2=25`, `x^2/9+y^2/4=1`, `x^2-y^2=1`, or `y^2=8x`. Use `conic y=x^2` to request the conic view rather than automatic function analysis. Structured requests use `{ kind: 'conic', equation: '(x-2)^2+(y+3)^2=25' }`. The result distinguishes circles, ellipses, hyperbolas, parabolas, empty loci, points, and degenerate lines, with exact foci, directrices, or asymptotes where applicable. Mixed `xy` terms requiring rotation are not supported.

## Structured algebra and numeric inputs

Systems can be entered as separate equations joined by semicolons or as an object:

```js
solve({ kind: 'system', equations: ['2x+y=5', 'x-y=1'], variables: ['x', 'y'] });
solve({ kind: 'sequence', type: 'arithmetic', first: 2, step: 3, n: 10 });
solve({ kind: 'sequence', type: 'geometric', first: 3, ratio: '1/2', n: 8, task: 'sum' });
solve({ kind: 'matrix', operation: 'determinant', matrix: [[1,2],[3,4]] });
solve({ kind: 'matrix', operation: 'inverse', matrix: [[1,2],[3,4]] });
solve({ kind: 'matrix', operation: 'multiply', matrix: [[1,2]], other: [[3],[4]] });
solve({ kind: 'matrix', operation: 'rref', matrix: [[1,2,3],[2,4,6]] });
solve({ kind: 'statistics', values: [1,2,3,4,5] });
solve({ kind: 'combinatorics', operation: 'combinations', n: 10, r: 3 });
solve({ kind: 'evaluate', expression: '2x^2+1', values: { x: '3/2' } });
solve({ kind: 'complex', expression: '(2+3i)/(1-i)' });
```

Scalar extensions return canonical exact strings in `answer.value`. Matrix results also expose `answer.matrix`; statistics report population and sample moments distinctly. Unsupported transcendental evaluations retain the substituted expression and an explicitly unverified numerical preview. The facade never promotes that preview into an accepted proof.

Structured `data_reasoning` requests add bounded exact regression, correlation, two-way table probabilities, independence checks, and combinatorial probabilities. They use rational arithmetic (or an exact radical expression for a correlation), with full certificate replay. These are specific data-rule families, not a natural-language statistics or modeling solver.

```js
solve({ kind: 'data_reasoning', topic: 'regression', operation: 'fit', points: [[0, 1], [1, 3], [2, 5]], at: '5/2' });
solve({ kind: 'data_reasoning', topic: 'two_way_table', operation: 'conditional_probability', table: [[12, 8], [3, 7]], event: { axis: 'row', index: 0 }, given: { axis: 'column', index: 1 } });
```

## Exact Precalculus subset

Structured `precalculus`, `precalc_functions`, `trig_models`, and `parametric` requests enter Engine 3 and replay separate exact certificates. Angles are rational multiples of pi on a pi/12 grid; scalar arithmetic uses exact rational combinations of 1, sqrt(2), sqrt(3), and sqrt(6). Supported operations include unit-circle values, selected trigonometric equations on finite intervals, angle identities, sinusoidal models, principal inverse trig values, polar conversions/rotations, vectors, polynomial/rational rates of change and analysis, and bounded exponential/logarithmic models. These are bounded rule families, not the entirety of any Precalculus course.

```js
solve({ kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/6' });
solve({ kind: 'precalculus', topic: 'trigonometry', operation: 'solve_equation', function: 'sin', target: '1/2', interval: { lower: 0, upper: 2 } });
solve({ kind: 'precalculus', topic: 'polar', operation: 'to_cartesian', radius: 2, angle: '1/4' });
solve({ kind: 'precalculus', topic: 'vector', operation: 'dot', a: [1, 2], b: [3, 4] });
solve({ kind: 'precalc_functions', topic: 'rates', operation: 'average_rate', function: { type: 'polynomial', coefficients: [2, -3, 1] }, from: '1/2', to: '3/2' });
solve({ kind: 'parametric', operation: 'evaluate', x: [1, 2], y: [0, 1, 1], t: '1/2' });
solve({ kind: 'trig_models', operation: 'analyze', function: 'sin', scale: '3/2', rate: '2/3', shift: '1/5', offset: '-1/4' });
```

The exact angle representation uses `angle: '1/6'` for pi/6 radians. An unsupported angle or inverse-polar point returns an unverified report rather than a sampled answer. Details of each structured operation and its restrictions are in [precalculus.js](./precalculus.js).
Function coefficient arrays are in ascending power order; for example `[2, -3, 1]` represents `x^2 - 3x + 2`. Function rules and their bounds are documented in [precalc-functions.js](./precalc-functions.js).
The [parametric module](./parametric.js) checks bounded polynomial coordinate domains, positions, average motion, and selected exact Cartesian eliminations without calculus.
The [trigonometric models module](./trig-models.js) checks exact sinusoidal parameters, selected principal inverse values, and angle-specific identities on the pi/12 grid. An identity checked at one angle is not a proof of the identity for every real angle.

## Geometry measurements

```js
solve({ kind: 'geometry', topic: 'pythagoras', a: 3, b: 4 });
solve({ kind: 'geometry', topic: 'triangle_angles', angles: [50, 60, null] });
solve({ kind: 'geometry', topic: 'distance', points: [[0,0],[3,4]] });
solve({ kind: 'geometry', topic: 'midpoint', points: [[1,2],[5,6]] });
solve({ kind: 'geometry', topic: 'slope', points: [[0,1],[2,5]] });
solve({ kind: 'geometry', topic: 'line', points: [[0,1],[2,5]] });
solve({ kind: 'geometry', topic: 'circle_equation', center: [2,3], radius: 5 });
solve({ kind: 'geometry', topic: 'circle', operation: 'area', radius: 3 });
solve({ kind: 'geometry', topic: 'triangle', sides: [3,4,5] });
solve({ kind: 'geometry', topic: 'rectangle', length: 5, width: 3 });
solve({ kind: 'geometry', topic: 'sphere', radius: 3 });
solve({ kind: 'geometry', topic: 'cylinder', radius: 3, height: 5 });
solve({ kind: 'geometry', topic: 'similarity', scaleFactor: 2, side: 5 });
solve({ kind: 'geometry', topic: 'circle_sector', radius: 3, centralAngle: 120 });
solve({ kind: 'geometry', topic: 'perpendicular_bisector', points: [[0,0],[4,0]] });
solve({ kind: 'geometry', topic: 'circumcircle', points: [[0,0],[4,0],[0,4]] });
```

Measurements are objects with an exact formula string and an approximate numerical `value`. Their assurance is `numerical-formula-check`, not a claim of arbitrary formal geometry proof. Positivity, triangle degeneracy, missing assumptions, and undefined slopes are checked. Additional shape schemas and aliases are documented in [geometry.js](./geometry.js).

Convenience commands include:

```text
area circle radius 3
triangle angles 50 60 ?
pythagoras a=3 b=4
distance (0,0) (3,4)
```

## Geometry proofs

The proof checker consumes explicit facts and theorem applications. It never infers a fact merely because a diagram looks like it should be true.

```js
solve({
  kind: 'geometry', topic: 'proof',
  proof: {
    givens: [
      { predicate: 'triangle', args: ['A','B','C'] },
      { predicate: 'triangle', args: ['D','E','F'] },
      { predicate: 'segment_equal', args: ['A','B','D','E'] },
      { predicate: 'segment_equal', args: ['B','C','E','F'] },
      { predicate: 'segment_equal', args: ['A','C','D','F'] },
    ],
    steps: [{
      statement: { predicate: 'triangle_congruent', args: [['A','B','C'],['D','E','F']] },
      rule: 'SSS', premises: ['g0','g1','g2','g3','g4'],
    }],
    goal: { predicate: 'triangle_congruent', args: [['A','B','C'],['D','E','F']] },
  },
});
```

Premises reference givens as `g0` and earlier steps as `s0`. Rules include midpoint definitions, reflexivity, transitivity, SSS/SAS/ASA/AAS congruence, AA/SSS/SAS similarity, corresponding parts, circle-tangent perpendicularity, inscribed angles intercepting the same arc, and Pythagorean theorem/converse with explicit hypotheses. Unsupported rules, missing premises, circular references, incorrect correspondence, and SSA/AAA congruence are rejected. This is a bounded Euclidean rule checker, not a general-purpose theorem prover.

## Correctness and resource boundaries

- No numerical sampling is used to certify algebraic identities.
- Domain exclusions survive cancellation, and radical candidates are checked against the original equation.
- Finite-solution equivalence preserves every supported root, not just one convenient answer.
- Matrix and sequence extensions replay exact computations and reject forged reports.
- Measurements and graph previews label their numerical approximations.
- Expression size, polynomial degree and term counts, matrix dimensions, and combinatorial inputs have explicit bounds.
- Unrestricted natural-language word problems, handwriting, arbitrary geometry diagrams, arbitrary rotations of conics, unrestricted nonlinear systems, and general transcendental solving are not supported.
- No independent curriculum-coverage percentage has been established.

## Modules

| Module | Responsibility |
| --- | --- |
| [core.js](./core.js) | Exact rationals, parser, AST, sparse polynomials, rational normalization, domains |
| [algebra.js](./algebra.js) | Equation strategies, simplification, sign charts, systems, function analysis |
| [verifier.js](./verifier.js) | Transition checks, certificates, and binding of visible proof data |
| [work.js](./work.js) | Student work, first-error feedback, bounded Ghost reconstruction |
| [geometry.js](./geometry.js) | Measurements, coordinate geometry, and explicit-premise proofs |
| [extensions.js](./extensions.js) | Matrices, sequences, statistics, combinatorics, radicals, complex arithmetic |
| [conics.js](./conics.js) | Exact axis-aligned conic classification, square completion, foci, and asymptotes |
| [advanced-algebra.js](./advanced-algebra.js) | Additional exact strategies, function operations, and nonlinear elimination |
| [compound-inequalities.js](./compound-inequalities.js) | Rational interval intersections, unions, and chained comparisons |
| [literal-equations.js](./literal-equations.js) | Symbolic linear rearrangement with parameter case analysis |
| [piecewise.js](./piecewise.js) | First-match branch domains, polynomial ranges, and exact evaluation |
| [precalculus.js](./precalculus.js) | Bounded exact unit-circle, polar, and vector operations with replay |
| [precalc-functions.js](./precalc-functions.js) | Exact bounded rates, polynomial/rational behavior, and exponential/log models |
| [data-reasoning.js](./data-reasoning.js) | Exact bounded regression, two-way tables, and combinatorial probabilities |
| [parametric.js](./parametric.js) | Exact bounded polynomial parametric position, motion, and elimination |
| [trig-models.js](./trig-models.js) | Exact bounded sinusoidal models, inverse trig, and angle-specific identities |
| [word-problems.js](./word-problems.js) | Strict English sentence templates, exact facts/units, and answer replay |
| [finite-aggregates.js](./finite-aggregates.js) | Exact finite sums and products |
| [latex.js](./latex.js) | Owned notation bridge, output formatting, and independent LaTeX validation |
| [curriculum.js](./curriculum.js) | Locally authored fixed-answer acceptance cases and explicit remaining gaps |
| [difficulty.js](./difficulty.js) | Exact difficulty format, nonlinear feature estimates, tier boundaries |
| [generator.js](./generator.js) | Seeded templates and pedagogical scaffolding |
| [index.js](./index.js) | Public facade, preflight, escalation, and verification gates |

Run `npm test` for exact, adversarial, and integration checks. Run `npm run benchmark` for the generated-family regression benchmark and `npm run benchmark:curriculum` for the locally authored acceptance map. Neither passing generated examples nor passing software tests alone establishes unrestricted mathematical completeness.
