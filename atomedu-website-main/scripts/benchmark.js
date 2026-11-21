import { solve, verifyResult, verifyTransition, generateProblem, TOPICS } from '../engine/index.js';

// A reproducible engineering benchmark, not a standardized curriculum assessment.
const requested = process.argv.find(arg => arg.startsWith('--seeds='));
const seeds = requested ? Number(requested.split('=')[1]) : 64;
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error('Use --seeds=1 through --seeds=1000.');
const difficulties = ['0.100', '0.399', '0.400', '0.649', '0.650', '0.900'];
const report = { description: 'Generated-family regression benchmark. This is not an independent curriculum coverage estimate.', generated: { total: 0, verified: 0, failures: [] }, adversarial: { total: 0, rejected: 0, failures: [] }, topics: {} };
const started = performance.now();
for (const topic of TOPICS) {
  const row = { total: 0, verified: 0 };
  for (let seed = 0; seed < seeds; seed++) for (const difficulty of difficulties) {
    report.generated.total++; row.total++;
    try {
      const p = generateProblem({ topic: topic.id, difficulty, seed }), out = solve(p.input, { difficulty });
      if (out.status === 'solved' && out.verified && verifyResult(p.input, out)) { report.generated.verified++; row.verified++; }
      else report.generated.failures.push({ topic: topic.id, seed, difficulty, error: out.error || out.status });
    } catch (e) { report.generated.failures.push({ topic: topic.id, seed, difficulty, error: e.message }); }
  }
  report.topics[topic.id] = row;
}
for (const [before, after] of [
  ['x^2=9', 'x=3'], ['2(x+3)=14', '2x+3=14'], ['-2x<4', 'x<-2'], ['1', 'x/x'],
  ['x=2', 'x=3'], ['x/x=1', 'x=0'], ['(x-1)/(x-1)', 'x'], ['sqrt(x+5)=x-1', 'x=-1'],
]) {
  report.adversarial.total++;
  if (verifyTransition(before, after).status !== 'valid') report.adversarial.rejected++;
  else report.adversarial.failures.push({ before, after });
}
report.elapsedMilliseconds = Math.round(performance.now() - started);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.generated.failures.length || report.adversarial.failures.length) process.exitCode = 1;
