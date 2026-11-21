#!/usr/bin/env node
import { solve, checkWork, generateProblem, TOPICS, getCapabilities, verifyResult } from './index.js';

const [command = 'help', ...args] = process.argv.slice(2);
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`);
function option(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }
try {
  if (command === 'solve') {
    const positional = args.filter((_, i) => !args[i].startsWith('--') && !(i && args[i - 1].startsWith('--'))).join(' ');
    const result = solve(positional, { difficulty: option('difficulty'), domain: option('domain', 'real'), task: option('task'), variable: option('variable') });
    write(result); if (result.status !== 'solved') process.exitCode = 2;
  } else if (command === 'check') {
    const problem = option('problem'), steps = option('steps');
    if (!problem || !steps) throw new Error('Use check --problem "2(x+3)=14" --steps "x=4"; separate steps with semicolons.');
    const result = checkWork(problem, steps.split(';')); write(result); if (result.status !== 'valid') process.exitCode = 2;
  } else if (command === 'generate') {
    const count = Number(option('count', 1)), seed = option('seed', 'practice'), topic = option('topic'), difficulty = option('difficulty', '0.500');
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000000) throw new Error('count must be an integer from 1 to 1000000.');
    for (let i = 0; i < count; i++) {
      const item = generateProblem({ topic: topic || TOPICS[i % TOPICS.length].id, difficulty, seed: `${seed}:${i}` });
      if (!process.stdout.write(`${JSON.stringify(item)}\n`)) await new Promise(resolve => process.stdout.once('drain', resolve));
    }
  } else if (command === 'capabilities') write(getCapabilities());
  else if (command === 'topics') write(TOPICS);
  else {
    process.stdout.write('atomEDU verified math engine\n\nnode engine/cli.js solve "f(x)=2/(x-3)+1"\nnode engine/cli.js solve "x^2+1=0" --domain complex\nnode engine/cli.js check --problem "2(x+3)=14" --steps "2x+6=14;x=4"\nnode engine/cli.js generate --topic quadratic --difficulty 0.750 --seed practice --count 10\nnode engine/cli.js capabilities\nnode engine/cli.js topics\n');
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
