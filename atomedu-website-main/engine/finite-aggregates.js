import { MathError, Q, num, parseExpression, constantValue, variables, substitute, print, stableStringify } from './core.js';

function compute(input) {
  if (!input || input.kind !== 'finite_aggregate' || !['sum', 'product'].includes(input.operation)) throw new MathError('Specify a finite sum or finite product.', 'invalid');
  if (typeof input.index !== 'string' || !/^[A-Za-z]$/.test(input.index) || ['e', 'i'].includes(input.index)) throw new MathError('The finite aggregate index must be a single variable.', 'invalid');
  const lower = Q(input.lower), upper = Q(input.upper);
  if (!lower.integer || !upper.integer) throw new MathError('Finite bounds must be integers.', 'invalid');
  if (lower.cmp(-1000000) < 0 || lower.cmp(1000000) > 0 || upper.cmp(-1000000) < 0 || upper.cmp(1000000) > 0 || upper.sub(lower).cmp(999) > 0) throw new MathError('A finite aggregate supports at most 1000 terms and bounded integer indices.', 'budget');
  const expression = parseExpression(input.expression), names = variables(expression);
  if (names.some(v => v !== input.index)) throw new MathError('Specify numeric constants for every non-index parameter before aggregating.');
  const count = upper.cmp(lower) < 0 ? 0 : Number(upper.sub(lower).add(1));
  let value = Q(input.operation === 'sum' ? 0 : 1); const terms = [];
  for (let i = 0; i < count; i++) {
    const at = lower.add(i), term = constantValue(substitute(expression, input.index, num(at)));
    terms.push({ index: String(at), value: String(term) }); value = input.operation === 'sum' ? value.add(term) : value.mul(term);
  }
  const normalized = { kind: 'finite_aggregate', operation: input.operation, index: input.index, lower: String(lower), upper: String(upper), expression: input.expression };
  const preview = terms.length <= 8 ? terms.map(t => t.value).join(input.operation === 'sum' ? ' + ' : '*') : `${terms.slice(0, 3).map(t => t.value).join(', ')}, ..., ${terms.slice(-2).map(t => t.value).join(', ')}`;
  return { status: 'solved', verified: true, topic: 'finite_aggregate', answer: { operation: input.operation, value: String(value), terms: count, exact: true },
    steps: [{ before: normalized, after: preview || (input.operation === 'sum' ? '0' : '1'), rule: 'finite_index_substitution', explanation: `Substitute each integer index from ${lower} through ${upper}. Every term is evaluated as an exact rational number.`, verified: true },
      { before: preview || (input.operation === 'sum' ? '0' : '1'), after: String(value), rule: input.operation === 'sum' ? 'exact_finite_sum' : 'exact_finite_product', explanation: `Replay all ${count} ${input.operation === 'sum' ? 'additions' : 'multiplications'} without floating-point approximation.`, verified: true }],
    restrictions: ['The index bounds are integers and all listed terms must be defined exact rational values.'],
    certificate: { type: 'finite_aggregate', version: 1, input: normalized, termValues: terms, assurance: 'exact-finite-replay' } };
}
export function solveFiniteAggregate(input) { try { return compute(input); } catch (e) { return { status: e.code === 'invalid' ? 'invalid' : e.code === 'budget' ? 'unresolved' : 'unsupported', verified: false, topic: 'finite_aggregate', answer: null, steps: [], restrictions: [], certificate: null, error: e.message }; } }
export function verifyFiniteAggregate(input, result) { try { return result.status === 'solved' && stableStringify(compute(input)) === stableStringify(result); } catch { return false; } }
