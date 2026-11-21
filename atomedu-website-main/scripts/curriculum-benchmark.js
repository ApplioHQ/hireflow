#!/usr/bin/env node
import { runCurriculumBenchmark } from '../engine/curriculum.js';

const report = runCurriculumBenchmark();
console.log(JSON.stringify(report, null, 2));
// Targets and documented unsupported subjects remain visible without blocking CI.
process.exitCode = report.totals.regressions > 0 ? 1 : 0;
