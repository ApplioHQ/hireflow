import { MathError, Q, stableStringify } from './core.js';
import { solveInequality } from './algebra.js';

const same = (a, b) => stableStringify(a) === stableStringify(b);
const fail = message => { throw new MathError(message); };
export function isCompoundInequality(text) {
  return typeof text === 'string' && (/\s+(?:and|or)\s+|∧|∨/.test(text) && /[<>≤≥]|!=|≠/.test(text) || (text.match(/<=|>=|!=|<|>|≤|≥|≠/g) || []).length > 1);
}
export function compareEndpoints(a, b) {
  if (a === b) return 0;
  if (a === '-∞' || b === '∞') return -1;
  if (a === '∞' || b === '-∞') return 1;
  try { return Q(a).cmp(Q(b)); } catch { fail('Compound inequalities currently require rational finite endpoints.'); }
}
export function intersectIntervals(a, b) {
  const result = [];
  for (const x of a) for (const y of b) {
    const lower = compareEndpoints(x.low, y.low), upper = compareEndpoints(x.high, y.high);
    const low = lower >= 0 ? x.low : y.low, high = upper <= 0 ? x.high : y.high;
    const lowClosed = lower > 0 ? x.lowClosed : lower < 0 ? y.lowClosed : x.lowClosed && y.lowClosed;
    const highClosed = upper < 0 ? x.highClosed : upper > 0 ? y.highClosed : x.highClosed && y.highClosed;
    const order = compareEndpoints(low, high);
    if (order < 0 || order === 0 && lowClosed && highClosed) result.push({ low, high, lowClosed, highClosed });
  }
  return mergeIntervals(result);
}
export function mergeIntervals(input) {
  const sorted = input.map(i => ({ ...i })).sort((a, b) => compareEndpoints(a.low, b.low) || Number(b.lowClosed) - Number(a.lowClosed)), out = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (!last) { out.push(item); continue; }
    const gap = compareEndpoints(item.low, last.high);
    if (gap > 0 || gap === 0 && !item.lowClosed && !last.highClosed) { out.push(item); continue; }
    const high = compareEndpoints(item.high, last.high);
    if (high > 0) { last.high = item.high; last.highClosed = item.highClosed; }
    else if (high === 0) last.highClosed ||= item.highClosed;
  }
  return out;
}
function compute(input) {
  const source = typeof input === 'string' ? input : input?.expression;
  if (typeof source !== 'string' || !source.trim()) throw new MathError('Enter a compound inequality.', 'invalid');
  if (source.length > 4096) throw new MathError('Compound inequality size limit reached.', 'budget');
  const groups = source.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').split(/\s+or\s+|∨/i);
  if (groups.length > 8) fail('Too many disjunction branches.');
  let variable = null; const conjunctions = [], steps = [], restrictions = [], children = [];
  for (const group of groups) {
    const clauses = group.split(/\s+and\s+|∧/i), atomic = [];
    for (const clause of clauses) {
      const parts = clause.split(/(<=|>=|!=|<|>)/).map(s => s.trim());
      if (parts.length < 3 || parts.length > 17 || parts.some(p => !p)) throw new MathError('A compound comparison is incomplete or too long.', 'invalid');
      for (let i = 0; i + 2 < parts.length; i += 2) atomic.push(`${parts[i]} ${parts[i + 1]} ${parts[i + 2]}`);
    }
    let intersection = [{ low: '-∞', high: '∞', lowClosed: false, highClosed: false }];
    for (const atom of atomic) {
      const solved = solveInequality(atom);
      if (variable && solved.answer.variable !== variable) fail('Every clause must use the same variable.');
      variable = solved.answer.variable; children.push(solved.certificate);
      for (const interval of solved.answer.intervals) { compareEndpoints(interval.low, interval.high); }
      intersection = intersectIntervals(intersection, solved.answer.intervals);
      restrictions.push(...solved.restrictions);
      steps.push({ before: atom, after: `${variable} ∈ ${solved.answer.solutionSet}`, rule: 'solve_comparison', explanation: 'Solve this comparison exactly before combining its interval set.', verified: true });
    }
    conjunctions.push(intersection);
  }
  const intervals = mergeIntervals(conjunctions.flat()), solutionSet = intervals.map(i => i.low === i.high ? `{${i.low}}` : `${i.lowClosed ? '[' : '('}${i.low}, ${i.high}${i.highClosed ? ']' : ')'}`).join(' ∪ ') || '∅';
  steps.push({ before: source, after: `${variable} ∈ ${solutionSet}`, rule: 'combine_exact_intervals', explanation: 'Intersect clauses joined by AND and take the union of branches joined by OR. Endpoints retain strict or inclusive membership.', verified: true });
  return { status: 'solved', verified: true, topic: 'compound_inequality', answer: { variable, intervals, solutionSet }, steps, restrictions: [...new Set(restrictions)], certificate: { type: 'compound_inequality', source, children, assurance: 'exact-interval-set-operations' } };
}
export function solveCompoundInequality(input) { try { return compute(input); } catch (e) { return { status: e.code === 'invalid' ? 'invalid' : 'unsupported', verified: false, topic: 'compound_inequality', answer: null, steps: [], restrictions: [], certificate: null, error: e.message }; } }
export function verifyCompoundCertificate(input, report) { try { return report.status === 'solved' && same(compute(input), report); } catch { return false; } }
