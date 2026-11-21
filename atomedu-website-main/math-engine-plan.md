# Verified Math Engine Product Plan

## Implementation entry points

The working implementation is available in [Math Lab](./math-lab.html), with a shared [engine API](./engine/index.js), [supported input documentation](./engine/README.md), command-line access, and automated regression tests. The sections below describe the product direction; actual implemented capabilities and explicit boundaries are listed by `getCapabilities()` and in the API documentation. A coverage target is not a measured curriculum-coverage result.

## Product vision

Build a math-specific reasoning system for Algebra 1, Algebra 2, and geometry. The system should not be a generic GPT wrapper that produces plausible-looking answers. Its core should be an owned, deterministic proof-checking engine that verifies every mathematical transformation.

The user may submit a complete solution, a partial solution, or a skipped-step solution. The system should identify what is valid, locate the first invalid step, explain the error, and reconstruct omitted reasoning with Ghost steps.

The initial product should prioritize broad, reliable coverage of common problem types rather than claiming to solve every possible problem in the curriculum.

## Core architecture

```text
Problem input
    ↓
Parser and mathematical representation
    ↓
Difficulty and capability classifier
    ↓
Engine 1 / Engine 2 / Engine 3
    ↓
Deterministic proof verifier
    ↓
Student feedback, proof steps, and Ghost steps
```

The three engines should share the same mathematical representation and verifier. They should differ mainly in their search strategies, supported transformations, and complexity budgets.

GPT or another language model may help with natural-language interpretation, explanations, hints, and messy input normalization. It must not be the authority that decides whether a proof is correct. The verifier is the authority.

## Mathematical representation

Expressions should be parsed into an abstract syntax tree rather than compared as raw strings.

For example:

```text
2(x + 3) = 14
```

should be represented approximately as:

```text
Equation(
  Multiply(2, Add(x, 3)),
  14
)
```

This allows the engine to recognize mathematically equivalent forms such as:

```text
2(x + 3)
2x + 6
6 + 2x
```

The representation must preserve variables, constants, operators, equality or inequality relations, assumptions, domains, and restrictions such as denominators that cannot equal zero.

## Proof-step model

Every accepted transition should be stored as a structured proof step.

```ts
{
  before: "2x + 6 = 14",
  operation: "subtract",
  value: "6",
  target: "both_sides",
  after: "2x = 8",
  rule: "subtract_same_value_from_both_sides",
  explanation: "Subtracting the same value from both sides preserves equality.",
  verified: true
}
```

The verifier checks the relationship between `before` and `after` independently. A step is never accepted merely because it is a likely next step or because a language model generated it.

## Supported initial problem families

### Algebra 1

- Combining like terms
- One-step and multi-step linear equations
- Linear inequalities, including inequality reversal when multiplying or dividing by a negative number
- Equations with parentheses
- Variables on both sides
- Ratios, proportions, and basic word-problem equations
- Systems of linear equations
- Slope and linear functions
- Basic graph interpretation
- Integer and rational exponents
- Basic polynomial operations
- Factoring common factors
- Introductory quadratic equations

### Algebra 2

- Polynomial addition, multiplication, and identities
- Factoring quadratic and higher-degree expressions where supported
- Quadratic equations and the quadratic formula
- Complex-number arithmetic
- Rational expressions and restrictions
- Radicals and radical equations, including extraneous-solution checks
- Exponential equations
- Logarithmic equations and domain checks
- Function notation and evaluation
- Function transformations
- Inverse functions where applicable
- Sequences and series through defined rule families
- Rational functions and their features
- Selected conic-section forms

### Geometry

- Points, lines, rays, segments, and angle relationships
- Parallel lines and transversals
- Triangle angle and side relationships
- Congruence criteria such as SSS, SAS, ASA, and AAS
- Similarity criteria
- Pythagorean theorem
- Special right triangles
- Quadrilateral properties
- Circle terminology and selected circle theorems
- Coordinate geometry
- Distance, midpoint, and slope
- Transformations
- Area, perimeter, surface area, and volume
- Structured two-column or paragraph proofs

Geometry should begin with coordinate geometry and structured theorem templates before expanding into unrestricted diagram interpretation.

## Rational-function example

For:

```text
f(x) = 2/(x - 3) + 1
```

the system should be able to identify:

- Domain: `x ≠ 3`
- Vertical asymptote: `x = 3`
- Horizontal asymptote: `y = 1`
- Parent function: `1/x`
- Horizontal shift: right 3
- Vertical stretch: factor 2
- Vertical shift: up 1
- x-intercept: `x = 1`
- y-intercept: `y = 1/3`
- Range: `y ≠ 1`
- Graph characteristics and transformation steps

One possible transformation path is:

```text
f(x) = 1/x
[ghost] 1/(x - 3)
[ghost] 2/(x - 3)
f(x) = 2/(x - 3) + 1
```

Each Ghost step must be independently verified and labeled as reconstructed reasoning rather than student-submitted work.

## Generator

The generator creates problems, solution paths, checkpoints, mistakes, and metadata from verified rule families.

It should generate more than final answers. Each generated item should include:

```ts
{
  problem: string,
  subject: "algebra_1" | "algebra_2" | "geometry",
  topic: string,
  difficulty: string,
  solution: ProofStep[],
  checkpoints: ProofStep[],
  valid_alternatives: ProofStep[][],
  intentional_errors: IntentionalError[],
  restrictions: string[],
  supported_operations: string[]
}
```

The generator can produce a very large dataset from a relatively small collection of formal rules by varying coefficients, signs, fractions, nesting, variables, diagrams, theorem combinations, and solution paths.

It should generate both valid and invalid examples:

```text
Problem: 3(x + 4) = 21

Valid step:
3x + 12 = 21

Invalid step:
3x + 4 = 21

Error category:
The coefficient 3 was not distributed to every term inside the parentheses.
```

Generated proof data is more useful to the verifier than scraped solution text because every transition has a known rule and a known validity result.

## Difficulty score

Every generated problem receives a difficulty string between `0.000` and `1.000`, inclusive, with exactly three decimal places.

Examples:

```text
0.125
0.400
0.583
0.650
0.927
```

The score should be treated as a calibrated difficulty estimate, not a simple linear grade. Difficulty may depend on:

- Number of proof steps
- Expression nesting depth
- Number of variables
- Fractions and negative values
- Radicals or logarithms
- Domain restrictions
- Number of possible solution paths
- Required theorem combinations
- Search branching factor
- Expected engine complexity

The generator should retain the underlying features in addition to the score:

```ts
{
  difficulty: "0.583",
  features: {
    steps: 6,
    nesting: 3,
    variables: 2,
    fractions: true,
    radicals: false,
    domain_restrictions: true,
    proof_type: "algebraic_rewrite"
  }
}
```

The score can initially be produced from a logarithmic or nonlinear formula and later recalibrated using observed solve time, search depth, failure rate, and engine success rate.

## Engine routing

Use non-overlapping ranges:

```text
score < 0.400          Engine 1
0.400 ≤ score < 0.650  Engine 2
score ≥ 0.650          Engine 3
```

The fast classifier should inspect the problem before attempting a full solution. It estimates actual complexity and checks whether the assigned engine supports the required rule families.

Routing should consider both the generated score and the classifier estimate. The generated score describes the intended difficulty; the classifier protects against a mismatch between the score and the actual problem.

### Engine 1

Engine 1 handles direct, low-branching transformations:

- Combining like terms
- Basic distribution
- One-step isolation
- Simple linear equations
- Basic function evaluation
- Basic substitution

### Engine 2

Engine 2 handles more involved but structured reasoning:

- Variables on both sides
- Fractions
- Systems
- Factoring
- Quadratics
- Rational expressions
- Function transformations
- Domain and restriction tracking

### Engine 3

Engine 3 is the maximum supported search tier:

- Multiple competing strategies
- Deeper proof paths
- More complex algebraic transformations
- Advanced function analysis
- Multi-theorem geometry proofs
- Larger search budgets

Engine 3 is not allowed to return an unverified proof simply because no higher engine exists. If it cannot prove the result, it should return an explicit unsupported, unresolved, or timeout state.

## Escalation behavior

Each engine should return structured status rather than only text:

```ts
{
  status: "solved" | "not_solved" | "unsupported" | "timeout",
  proof: ProofStep[],
  estimated_complexity: number,
  unsupported_rules: string[],
  verifier_status: "verified" | "rejected" | "not_checked"
}
```

The pipeline should:

1. Parse the problem.
2. Estimate complexity and supported capabilities.
3. Select the lowest suitable engine.
4. Attempt a solution within that engine's budget.
5. Verify every proposed proof step.
6. Escalate if the problem is unsupported, too complex, or times out.
7. Stop at Engine 3 and report the limitation clearly if it cannot solve the problem.

Example:

```text
Generated score: 0.350
Classifier estimate: 0.520
Selected engine: Engine 2
Result: solved
Verifier: accepted
```

Another example:

```text
Generated score: 0.350
Classifier estimate: 0.210
Selected engine: Engine 1
Result: timeout
Escalate to Engine 2
```

Confidence may help route a problem, but confidence must never override proof verification.

## Ghost steps

Ghost steps are verified intermediate transformations that the student skipped. They should be visually distinct, such as translucent or muted steps, and clearly labeled as reconstructed checkpoints.

Example:

```text
Student: 2(x + 3) = 14
Student: x + 3 = 7

[ghost] 2x + 6 = 14

Student: x = 4
```

Ghost steps should be used when:

- The student's step is valid but skips several transformations.
- The student reaches an equivalent expression through a shortcut.
- The engine needs to show the bridge between two checkpoints.
- The student makes an error and the system wants to show the nearest valid path.

For an incorrect step:

```text
Student: 2(x + 3) = 14
Student: 2x + 3 = 14  ← invalid

[ghost] 2x + 6 = 14
[ghost] 2x = 8
[ghost] x = 4
```

The feedback should identify the first invalid transition, explain the violated rule, and present the corrected path. Ghost steps should never silently rewrite the student's work or make an invalid solution appear valid.

## Coverage definition

Coverage should be measured against a representative benchmark of problem types, not claimed as a percentage of all possible mathematics.

A coverage matrix can track supported and verified categories:

```text
Topic                    Coverage target
Linear equations         High
Functions                High
Quadratics               Medium to high
Rational functions       Medium to high
Exponents and logs       Medium
Systems                  Medium
Coordinate geometry      Medium
Triangle geometry        Selected templates
Formal geometry proofs   Selected templates
```

The system should report coverage using weighted benchmark performance, supported rule families, and verified success rates. A claim such as “51% coverage” should mean that the engine correctly handles at least 51% of a defined, representative benchmark—not that it can solve 51% of arbitrary user questions.

## Correctness principles

- Every accepted step must be machine-verified.
- Domain restrictions must be preserved.
- Extraneous solutions must be detected after reversible-looking transformations such as squaring.
- Inequality direction must change when multiplying or dividing by a negative quantity.
- Equivalent expressions should be normalized before comparison.
- Multiple valid solution paths must be supported where feasible.
- Unsupported problems should be identified rather than guessed.
- Ghost steps must come from verified proof paths.
- A language model may explain a proof but may not certify it.

## Dataset strategy

Public datasets can support language understanding, benchmarking, and research, but they should not be treated as automatically correct proof data. Useful resources include:

- [OpenWebMath](https://arxiv.org/abs/2310.06786) for large-scale mathematical text
- [MATH](https://arxiv.org/abs/2103.03874) for challenging problem-solving evaluation
- [miniF2F](https://github.com/facebookresearch/miniF2F) for formally stated and machine-checkable theorem-proving problems

The primary training and testing data should be generated from the owned rule system. This gives the team control over correctness, difficulty, coverage, error categories, Ghost steps, and licensing.

## Product positioning

The strongest product promise is not “GPT solves math.” It is:

> A verified math reasoning system that solves problems, checks every transformation, identifies exactly where reasoning fails, and reconstructs skipped work without penalizing concise students.

The initial demonstration should show breadth across Algebra 1, Algebra 2, and geometry while keeping the supported rule families explicit. The engine should be impressive because it is reliable, explainable, and extensible—not because it pretends to support problems it cannot verify.
