import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CURRICULUM_FAMILIES, checkCurriculumExpectation, runCurriculumBenchmark } from '../engine/curriculum.js';
import { solve, verifyResult } from '../engine/index.js';

const report = runCurriculumBenchmark();

test('local acceptance map contains 40–60 coherent families with at least two directly authored cases each', () => {
  assert.ok(CURRICULUM_FAMILIES.length >= 40 && CURRICULUM_FAMILIES.length <= 60);
  assert.equal(new Set(CURRICULUM_FAMILIES.map(f => f.id)).size, CURRICULUM_FAMILIES.length);
  for (const family of CURRICULUM_FAMILIES) {
    assert.ok(family.id && family.label && family.subject);
    assert.ok(family.cases.length >= 2, family.id);
    assert.equal(new Set(family.cases.map(c => JSON.stringify(c.input))).size, family.cases.length, family.id);
    for (const entry of family.cases) {
      assert.ok(['supported', 'target', 'known_gap'].includes(entry.supportStatus));
      if (entry.supportStatus === 'known_gap') {
        assert.ok(entry.expected.desired && entry.expected.gapReason);
        assert.deepEqual(entry.expected.rejectedStatuses, ['unsupported', 'unresolved', 'invalid']);
      } else {
        assert.ok(entry.expected.answer || entry.expected.identities, `${family.id} needs a fixed human answer`);
        if (entry.supportStatus === 'target') assert.ok(entry.limitation);
      }
    }
  }
  assert.match(report.title, /Locally authored/);
  assert.match(report.scope, /not a standardized curriculum/);
  assert.match(report.scope, /empirically/);
});

for (const family of report.families) {
  for (const entry of family.cases) {
    if (entry.supportStatus === 'supported') test(`supported acceptance: ${entry.id}`, () => {
      assert.equal(entry.classification, 'accepted', entry.reason);
      assert.equal(entry.success, true, entry.reason);
      assert.deepEqual(entry.failures, []);
      assert.equal(entry.actual.verified, true);
      assert.equal(entry.actual.latexValid, true);
    });
    if (entry.supportStatus === 'known_gap') test(`documented scope gap: ${entry.id}`, () => {
      assert.equal(entry.classification, 'known_gap', entry.reason);
      assert.equal(entry.success, false, 'Rejection is not mathematical acceptance');
      assert.equal(entry.expectationMet, true, entry.reason);
      assert.equal(entry.actual.verified, false);
      assert.ok(entry.actual.error);
      assert.deepEqual(entry.failures, []);
    });
    if (entry.supportStatus === 'target') test(`target stays visible without blocking acceptance: ${entry.id}`, () => {
      assert.ok(['target_met', 'target_unmet'].includes(entry.classification));
      assert.equal(entry.success, entry.classification === 'target_met');
      if (!entry.success) assert.ok(entry.failures.length && entry.reason);
    });
  }
}

test('remaining explicitly unsupported subject families stay in the denominator', () => {
  for (const id of ['word-problem-parsing', 'general-transcendentals', 'sophisticated-nonlinear']) {
    const family = report.families.find(f => f.id === id);
    assert.ok(family);
    assert.ok(family.cases.every(c => c.classification === 'known_gap'));
    assert.equal(family.success, false);
  }
});

test('rotated conic acceptance uses fixed exact expected geometry', () => {
  const family = report.families.find(f => f.id === 'rotated-conics');
  assert.ok(family);
  assert.ok(family.cases.every(c => c.classification === 'accepted'));
  assert.ok(family.cases.every(c => c.actual.verified && c.actual.latexValid));
});

test('coverage and outcome totals use every local family and case, with no gap credit', () => {
  const cases = report.families.flatMap(f => f.cases);
  const { numerator, denominator, value, definition } = report.coverageFraction;
  assert.equal(denominator, CURRICULUM_FAMILIES.length);
  assert.equal(numerator, report.families.filter(f => f.cases.every(c => c.success)).length);
  assert.equal(value, numerator / denominator);
  assert.match(definition, /including targets and documented gaps/);
  assert.equal(report.totals.cases, cases.length);
  assert.equal(report.totals.supportedCases + report.totals.targetCases + report.totals.knownGapCases, cases.length);
  assert.equal(report.totals.successfulCases, cases.filter(c => c.success).length);
  assert.equal(report.totals.regressions, 0);
  assert.equal(report.totals.changedGaps, 0);
  assert.deepEqual(runCurriculumBenchmark(), report, 'Local evaluation is deterministic');
});

test('fixed mathematical oracle rejects wrong roots despite a valid certificate and LaTeX', () => {
  const entry = CURRICULUM_FAMILIES.find(f => f.id === 'quadratic-rational').cases[0];
  const result = solve(entry.input);
  assert.equal(verifyResult(entry.input, result), true);
  assert.equal(result.latex.valid, true);
  const wrong = structuredClone(entry);
  wrong.expected.answer.solutions = ['0', '1'];
  assert.ok(checkCurriculumExpectation(wrong, result).some(s => s.includes('answer.solutions')));
});

test('fixed identities, counts and characteristics are independent acceptance gates', () => {
  for (const [id, alter, reason] of [
    ['polynomial-expansion', c => { c.expected.identities.expression = '2x^2+5x+12'; }, 'expected identity'],
    ['statistics', c => { c.expected.answer.count = 5; }, 'answer.count'],
    ['central-conics', c => { c.expected.answer.radius = '8'; }, 'answer.radius'],
    ['combinatorics', c => { c.expected.answer.value = '127'; }, 'answer.value'],
    ['coordinate-distance', c => { c.expected.answer.distance.value = 12; }, 'distance.value'],
    ['rational-expressions', c => { c.expected.restrictions = ['x - 99 != 0']; }, 'restriction'],
  ]) {
    const original = CURRICULUM_FAMILIES.find(f => f.id === id).cases[0];
    const result = solve(original.input, original.options);
    assert.equal(verifyResult(original.input, result), true);
    const wrong = structuredClone(original); alter(wrong);
    assert.ok(checkCurriculumExpectation(wrong, result).some(s => s.includes(reason)), id);
  }
});

test('an expanded identity alone does not meet the factoring expectation', () => {
  const original = CURRICULUM_FAMILIES.find(f => f.id === 'gcf-factoring').cases[0];
  const expanded = { ...original, input: 'expand 8x^3+12x^2' };
  const result = solve(expanded.input);
  assert.equal(verifyResult(expanded.input, result), true);
  assert.ok(checkCurriculumExpectation(expanded, result).some(s => s.includes('factored product')));
});

test('literal expectations independently require complete branch counts, conditions and symbolic identities', () => {
  const family = CURRICULUM_FAMILIES.find(f => f.id === 'literal-parameters');
  assert.deepEqual(family.cases.map(c => c.supportStatus), ['supported', 'supported']);
  assert.deepEqual(family.cases.map(c => c.expected.branches.length), [3, 1]);
  for (const entry of family.cases) {
    const result = solve(entry.input, entry.options);
    assert.equal(verifyResult(entry.input, result, entry.options), true);
    assert.deepEqual(checkCurriculumExpectation(entry, result), []);
    for (const [alter, reason] of [
      [c => { c.expected.branches.push({ type: 'inconsistent', conditions: [] }); }, 'expected'],
      [c => { c.expected.branches[0].conditions = ['a = 0']; }, '.conditions'],
      [c => { c.expected.branches[0].expression = '999'; }, '.expression'],
      [c => { c.expected.branches[0].type = 'inconsistent'; }, '.type'],
    ]) {
      const wrong = structuredClone(entry); alter(wrong);
      assert.ok(checkCurriculumExpectation(wrong, result).some(s => s.includes(reason)));
    }
  }
  const conditional = family.cases[0], result = solve(conditional.input, conditional.options);
  for (const index of [1, 2]) {
    const wrong = structuredClone(conditional);
    wrong.expected.branches[index].conditions[1] = 'b + c = 0';
    assert.ok(checkCurriculumExpectation(wrong, result).some(s => s.includes(`branches.${index}.conditions`)));
  }
});

test('piecewise oracle checks fixed interval boundaries, piece counts and first-match semantics', () => {
  const family = CURRICULUM_FAMILIES.find(f => f.id === 'piecewise-analysis');
  assert.ok(family.cases.every(c => c.supportStatus === 'supported'));
  for (const entry of family.cases) {
    const result = solve(entry.input);
    assert.equal(verifyResult(entry.input, result), true);
    assert.deepEqual(checkCurriculumExpectation(entry, result), []);
    for (const [alter, reason] of [
      [c => { c.expected.answer.domainIntervals[0].lowClosed = true; }, 'answer.domainIntervals'],
      [c => { c.expected.answer.rangeIntervals[0].low = '-1'; }, 'answer.rangeIntervals'],
      [c => { c.expected.answer.semantics = 'last-match'; }, 'answer.semantics'],
      [c => { c.expected.pieces.pop(); }, 'expected 1 pieces'],
      [c => { c.expected.pieces[1].domainIntervals[0].lowClosed = false; }, 'answer.pieces.1.domainIntervals'],
    ]) {
      const wrong = structuredClone(entry); alter(wrong);
      assert.ok(checkCurriculumExpectation(wrong, result).some(s => s.includes(reason)));
    }
  }
  // Expanding the second condition must not steal [1,2) from the first piece.
  const overlap = structuredClone(family.cases[1]);
  overlap.input.pieces[1].condition = 'x>=1';
  overlap.expected.pieces[1].condition = 'x>=1';
  assert.deepEqual(checkCurriculumExpectation(overlap, solve(overlap.input)), []);
});

test('geometry numeric values keep formula and approximation assurance honest', () => {
  const entry = CURRICULUM_FAMILIES.find(f => f.id === 'coordinate-distance').cases[0];
  for (const mutate of [
    r => { r.answer.distance.approximate = false; },
    r => { delete r.answer.distance.exact; },
    r => { r.certificate.assurance = 'exact-proof'; },
  ]) {
    const result = solve(entry.input); mutate(result);
    assert.ok(checkCurriculumExpectation(entry, result).some(s => s.includes('Geometry') || s.includes('approximate')));
  }
});

test('gap successes and engine exceptions are classified without being hidden', () => {
  const family = CURRICULUM_FAMILIES.find(f => f.id === 'word-problem-parsing');
  const entry = family.cases[0], input = entry.input;
  try {
    entry.input = 'x=7';
    const changed = runCurriculumBenchmark();
    const outcome = changed.families.find(f => f.id === family.id).cases[0];
    assert.equal(outcome.classification, 'gap_changed');
    assert.equal(outcome.success, false);
    assert.equal(changed.totals.regressions, 0);
  } finally { entry.input = input; }
  assert.ok(checkCurriculumExpectation(entry, { status: 'threw', error: 'crash' }).length);
});

const cwd = fileURLToPath(new URL('../', import.meta.url));
test('CLI emits JSON and exits zero with documented gaps', () => {
  const child = spawnSync(process.execPath, ['scripts/curriculum-benchmark.js'], { cwd, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), JSON.parse(JSON.stringify(report)));
  assert.ok(report.totals.confirmedGaps > 0);
});

test('CLI exits nonzero for an expected supported case regression', () => {
  const source = `import { CURRICULUM_FAMILIES } from './engine/curriculum.js';
    CURRICULUM_FAMILIES[0].cases[0].expected.identities.expression = '999';
    await import('./scripts/curriculum-benchmark.js');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { cwd, encoding: 'utf8' });
  assert.equal(child.status, 1, child.stderr);
  const failed = JSON.parse(child.stdout);
  assert.equal(failed.totals.regressions, 1);
  assert.equal(failed.families[0].cases[0].classification, 'regression');
  assert.match(failed.families[0].cases[0].reason, /expected identity 999/);
});
