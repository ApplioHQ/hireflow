# Standards coverage checklist

This is a scoped map of the **current engine**, not a complete standards certification. It makes **no empirical 100% coverage claim**. “Verified subset” means a bounded operation returns a replayable verified result; it does not mean every task in the cited standard or topic is supported. “Partial” means some relevant operations exist but the full expectation is not met. “Unsupported” means no verified engine path was found for the stated task. Update a row only after checking representative inputs, boundaries, and certificate replay. The local [acceptance map](../engine/curriculum.js) is not a standards benchmark.

Official references: [DESE mathematics standards and expanded expectations](https://dese.mo.gov/college-career-readiness/curriculum/mathematics), [DESE 6–12 standards](https://dese.mo.gov/media/pdf/curr-mls-standards-math-6-12-sboe-2016), [AP Precalculus Course and Exam Description](https://apcentral.collegeboard.org/media/pdf/ap-precalculus-course-and-exam-description.pdf), and [AP course at a glance](https://apcentral.collegeboard.org/media/pdf/ap-precalculus-course-at-a-glance.pdf). AP Units 1–3 are assessed on the exam; Unit 4 is not.

## Missouri DESE Algebra I

Source: [Algebra I expanded expectations](https://dese.mo.gov/media/pdf/curr-math-mls%20expanded-expectaions-algebra-1).

- [x] **Verified subset** — Linear/quadratic equations, systems, literal formulas, inequalities, arithmetic sequences, bounded exact regression/correlation, and fully matched fee/rate, consecutive-integer, discount, and mixture word-problem templates (parts of A1.REI, A1.CED, A1.LQE.B, A1.DS.A.5–7); see [curriculum.js](../engine/curriculum.js), [data-reasoning.js](../engine/data-reasoning.js), and [word-problems.js](../engine/word-problems.js).
- [ ] **Partial** — Function/graph work, bivariate-data analysis, and contextual modeling (A1.IF, A1.LQE, A1.DS, A1.CED): [algebra.js](../engine/algebra.js) and [data-reasoning.js](../engine/data-reasoning.js) compute selected results; [word-problems.js](../engine/word-problems.js) requires a complete template match; [graph/model.js](../graph/model.js) plots numerically.
- [ ] **Unsupported** — Open-ended word-problem wording, general unit conversions, and correlation-versus-causation reasoning (remaining A1.NQ.B, A1.CED.A.1–3, A1.DS.A.8). Add explicit unit conversion and interpretation/model-choice contracts; [word-problems.test.js](../tests/word-problems.test.js) records rejected wording.

## Missouri DESE Algebra II

Source: [Algebra II expanded expectations](https://dese.mo.gov/media/pdf/curr-math-mls%20expanded-expectaions-algebra-2).

- [x] **Verified subset** — Selected radical/rational equations, complex arithmetic, polynomial division, logarithm laws, and function operations (A2.NQ, A2.SSE, A2.REI.A, A2.APR, A2.BF); see [curriculum.js](../engine/curriculum.js), [advanced-algebra.js](../engine/advanced-algebra.js), and [extensions.js](../engine/extensions.js).
- [ ] **Partial** — Function analysis and nonlinear systems (A2.IF, A2.REI.B.3) cover selected algebraic forms, not arbitrary systems or all graphical/tabular interpretations; see [algebra.js](../engine/algebra.js) and [advanced-algebra.js](../engine/advanced-algebra.js).
- [ ] **Partial** — Bounded exact probability/counting in [data-reasoning.js](../engine/data-reasoning.js) addresses selected decision tasks (A2.DS.A.6), but not the full data and inference expectations. Add model selection and interpretation tasks for A2.FM and A2.DS.
- [ ] **Unsupported** — Sampling, margin of error, report evaluation, and normal-distribution reasoning (A2.DS.A.1–5, A2.DS.A.7, A2.DS.B); no verified path for these tasks appears in [index.js](../engine/index.js).

## Missouri DESE Geometry

Source: [Geometry expanded expectations](https://dese.mo.gov/media/pdf/curr-math-mls%20expanded-expectaions-geometry).

- [x] **Verified subset** — Structured coordinate transformations, exact perpendicular-bisector/circumcircle constructions, circle tangent and arc/sector formulas, special-right-triangle side ratios, bounded two-way probability, and explicit-premise proof rules for congruence/similarity, parallel-perpendicular, circle tangent/same arc, and Pythagorean relations (parts of G.CO, G.SRT, G.C, G.GPE, G.CP); see [geometry.js](../engine/geometry.js), [geometry.test.js](../tests/geometry.test.js), and [data-reasoning.js](../engine/data-reasoning.js). Other measurements return approximate numbers with exact formula strings.
- [ ] **Partial** — The new constructions require supplied coordinates, and proofs require named facts and premises; the checker in [geometry.js](../engine/geometry.js) cannot infer diagram facts. Congruence, similarity, circle theorems, and coordinate proofs remain broader; rotations are limited to multiples of 90°.
- [ ] **Unsupported** — General free-form geometric constructions, arbitrary-angle transformations/right-triangle trigonometry, three-dimensional cross-sections, and broader probability interpretation (remaining G.CO.D, G.SRT.C, G.GMD.B, G.CP). Add dedicated task schemas and verifiers.

## AP Precalculus Unit 1 — Polynomial and Rational Functions

- [x] **Verified subset** — Polynomial/rational operations, selected zeros, poles and holes, exact difference quotients and average rates for bounded rational-coefficient functions, and end behavior (parts of 1.1–1.12); see [precalc-functions.js](../engine/precalc-functions.js) and [curriculum.js](../engine/curriculum.js).
- [ ] **Partial** — These rules require structured inputs and bounded degrees/rational roots. Multiple representations, transformations, and contextual rates/models (1.1–1.14) are broader; [graph/model.js](../graph/model.js) supplies numerical plots.
- [ ] **Unsupported** — Selecting and constructing a function model from contextual data with justified assumptions (1.13–1.14); add assessable model-selection inputs and outputs.

## AP Precalculus Unit 2 — Exponential and Logarithmic Functions

- [x] **Verified subset** — Finite sequences, selected equations/laws, composition/inverses, exact parameterized exponential/logarithmic analysis, and two-point rational-base exponential fitting (parts of 2.1–2.5, 2.7–2.14); see [precalc-functions.js](../engine/precalc-functions.js), [curriculum.js](../engine/curriculum.js), and [advanced-algebra.js](../engine/advanced-algebra.js).
- [ ] **Partial** — Function transformations, equations, inequalities, and data models (2.2–2.5, 2.11–2.14) exceed the bounded rational-base/integer-exponent rules in [precalc-functions.js](../engine/precalc-functions.js).
- [ ] **Unsupported** — General competing-model validation and semi-log interpretation (2.6, 2.15); numerical log-scale plotting in [graph/model.js](../graph/model.js) is not an interpretation verifier.

## AP Precalculus Unit 3 — Trigonometric and Polar Functions

- [x] **Verified subset** — Exact unit-circle values, finite-interval grid-target sine/cosine/tangent equations, selected polar conversions, bounded sine/cosine amplitude/period/range/extrema analysis, principal inverse trig on the π/12 grid, and angle-specific reciprocal/cofunction/Pythagorean identities (parts of 3.2–3.6, 3.9–3.13); see [precalculus.js](../engine/precalculus.js), [trig-models.js](../engine/trig-models.js), and [precalculus-integration.test.js](../tests/precalculus-integration.test.js).
- [ ] **Partial** — Sinusoidal analysis requires structured rational parameters, inverse values must match the exact grid, and identity checks certify supplied angles rather than symbolic identities for all angles. [graph/model.js](../graph/model.js) draws bounded numerical trig and polar curves, not proofs of periodic models or polar-function properties (3.1, 3.4–3.7, 3.12–3.15).
- [ ] **Unsupported** — Trig inequalities, nongrid equation/inverse targets, general symbolic identity proofs, and full secant/cosecant/cotangent function analysis (remaining 3.8–3.12); [trig-models.js](../engine/trig-models.js) and [precalculus.js](../engine/precalculus.js) reject values outside their certified rules.

## AP Precalculus Unit 4 — Functions Involving Parameters, Vectors, and Matrices

- [x] **Verified subset** — Axis-aligned and rational-eigenvalue rotated conics, exact matrix/vector operations, and public `kind: 'parametric'` domain/evaluation, displacement/average velocity, and degree-≤2 elimination for bounded rational polynomials (parts of 4.1–4.3, 4.5–4.8, 4.10–4.11). [index.js](../engine/index.js) routes and replays [parametric.js](../engine/parametric.js); [curriculum.js](../engine/curriculum.js) has accepted position and motion cases.
- [ ] **Partial** — Parametric rules require structured polynomials. [graph/model.js](../graph/model.js) draws bounded numerical polar and parametric curves, but those curves do not certify models. Rotated conics with irrational eigenvalues, matrix transformations/functions, and vector-valued modeling (4.6, 4.9, 4.12–4.14) remain open; see [conics.js](../engine/conics.js) and [precalculus.js](../engine/precalculus.js).
- [ ] **Unsupported** — General nonpolynomial parametric motion, instantaneous rates, and unrestricted parametrization of implicit curves (remaining 4.1–4.5, 4.7). Extend the exact [parametric.js](../engine/parametric.js) rules before broadening the claim.
