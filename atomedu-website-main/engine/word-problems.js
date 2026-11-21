// A deliberately bounded English grammar. Every accepted sentence must match
// an entire template; extracted facts retain offsets into the normalized text.
// The public facade routes only sentences that this grammar fully recognizes.
import { Q, stableStringify } from './core.js';

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\d+/\d+)`;
const ITEM = String.raw`[A-Za-z]+(?: [A-Za-z]+){0,2}`;
const UNIT_PLURAL = { mile: 'miles', hour: 'hours', ticket: 'tickets', item: 'items' };
const EXPLANATIONS = {
  linear_fee_rate: [
    'A fixed fee plus a rate times the quantity gives the total cost.',
    'Subtract the fee, then divide by the nonzero rate.',
    'Substitute the quantity into the original cost model.'
  ],
  consecutive_integers: [
    'Write each integer as the first integer plus a fixed step.',
    'Subtract the progression offset and divide by the number of integers.',
    'Check the spacing, parity, and stated sum.'
  ],
  percent_discount: [
    'The discount is the stated percentage of the original price.',
    'Subtract the exact discount from the original price.',
    'Add the discount back to check the original price.'
  ],
  mixture: [
    'The amount of pure ingredient before mixing equals the amount afterward.',
    'Collect the unknown volume and divide by the nonzero concentration difference.',
    'Substitute the volume into the original concentration balance.'
  ]
};

const pattern = source => new RegExp(source, 'di');
const linearPrefix = String.raw`^(?:A|An) ${ITEM} charges (?:a )?\$(?<fee>${NUMBER}) (?:flat|base|fixed) fee plus \$(?<rate>${NUMBER}) per (?<rateUnit>mile|hour|ticket|item)\. `;
const linearPatterns = [
  pattern(linearPrefix + String.raw`If the total cost is \$(?<total>${NUMBER}), how many (?<questionUnit>miles|hours|tickets|items)(?: were (?:traveled|used|purchased|sold))?\?$`),
  pattern(linearPrefix + String.raw`The total cost is \$(?<total>${NUMBER})\. How many (?<questionUnit>miles|hours|tickets|items)(?: were (?:traveled|used|purchased|sold))?\?$`),
  pattern(String.raw`^A taxi charges (?<fee>${NUMBER}) dollars plus (?<rate>${NUMBER}) dollars per (?<rateUnit>mile)\. How far can I travel for (?<total>${NUMBER}) dollars\?$`)
];
const consecutivePattern = pattern(String.raw`^The sum of (?<count>two|three|four|five) consecutive (?:(?<parity>even|odd) )?integers is (?<sum>-?\d+)\. (?:Find the integers|What are the integers)[.?]$`);
const discountPatterns = [
  pattern(String.raw`^(?:A|An) ${ITEM} costs \$(?<price>${NUMBER}) and is discounted by (?<percent>${NUMBER})%\. What is the sale price\?$`),
  pattern(String.raw`^(?:A|An) \$(?<price>${NUMBER}) ${ITEM} is discounted by (?<percent>${NUMBER})%\. What is the sale price\?$`)
];
const mixturePattern = pattern(String.raw`^How many (?<unit>liters|gallons|ounces) of a (?<first>${NUMBER})% solution must be mixed with (?<known>${NUMBER}) (?<knownUnit>liters|gallons|ounces) of a (?<second>${NUMBER})% solution to make a (?<target>${NUMBER})% solution\?$`);

function numeric(raw) {
  if (raw.length > 40) throw new Error('Number is too long.');
  return Q(raw).toString();
}

function fact(match, group, key, unit, convert = numeric) {
  const raw = match.groups[group];
  return { key, value: convert(raw), unit, raw, span: match.indices.groups[group] };
}

/** Parse only the four documented complete sentence templates; otherwise null. */
export function parseWordProblem(text) {
  if (typeof text !== 'string' || text.length > 512) return null;
  const source = text.trim().replace(/\s+/g, ' ');
  if (!source) return null;
  try {
    let match = linearPatterns.map(regex => regex.exec(source)).find(Boolean);
    if (match) {
      const rateUnit = match.groups.rateUnit.toLowerCase();
      const questionUnit = match.groups.questionUnit?.toLowerCase() || UNIT_PLURAL[rateUnit];
      if (UNIT_PLURAL[rateUnit] !== questionUnit) return null;
      return { kind: 'word_problem', type: 'linear_fee_rate', text: source,
        facts: [fact(match, 'fee', 'fee', 'USD'), fact(match, 'rate', 'rate', `USD/${rateUnit}`),
          fact(match, 'total', 'total', 'USD')],
        question: { target: 'quantity', unit: questionUnit } };
    }
    match = consecutivePattern.exec(source);
    if (match) {
      const count = { two: 2, three: 3, four: 4, five: 5 };
      const parity = match.groups.parity?.toLowerCase() || 'any';
      const facts = [fact(match, 'count', 'count', 'integers', raw => String(count[raw.toLowerCase()])),
        fact(match, 'sum', 'sum', 'integer')];
      if (match.groups.parity) facts.push(fact(match, 'parity', 'parity', 'category', raw => raw.toLowerCase()));
      return { kind: 'word_problem', type: 'consecutive_integers', text: source, facts,
        question: { target: 'integers', parity, unit: 'integers' } };
    }
    match = discountPatterns.map(regex => regex.exec(source)).find(Boolean);
    if (match) return { kind: 'word_problem', type: 'percent_discount', text: source,
      facts: [fact(match, 'price', 'price', 'USD'), fact(match, 'percent', 'percent', '%')],
      question: { target: 'sale_price', unit: 'USD' } };
    match = mixturePattern.exec(source);
    if (match) {
      const unit = match.groups.unit.toLowerCase();
      if (unit !== match.groups.knownUnit.toLowerCase()) return null;
      return { kind: 'word_problem', type: 'mixture', text: source,
        facts: [fact(match, 'first', 'first_percent', '%'), fact(match, 'known', 'known_volume', unit),
          fact(match, 'second', 'second_percent', '%'), fact(match, 'target', 'target_percent', '%')],
        question: { target: 'volume', unit } };
    }
    return null;
  } catch { return null; }
}

const value = (request, key) => Q(request.facts.find(item => item.key === key).value);
const invalid = message => { throw new Error(message); };
function percent(q) { if (q.cmp(0) < 0 || q.cmp(100) > 0) invalid('Percentages must lie from 0 through 100.'); }
function step(rule, before, after, explanation) { return { rule, before, after, explanation, verified: true }; }

function render(request, derivation) {
  const [translate, solve, check] = EXPLANATIONS[request.type];
  const steps = [
    step('translate_facts', request.text, derivation.equation, translate),
    step('solve_exactly', derivation.equation, derivation.isolation, solve),
    step('check_original_facts', derivation.isolation, derivation.substitution, check)
  ];
  return { status: 'solved', verified: true, topic: 'word_problem', type: request.type,
    facts: request.facts, answer: { ...derivation.answer, exact: true }, steps, restrictions: [],
    certificate: { type: 'word_problem', version: 1, assurance: 'exact-rational-replay',
      source: { text: request.text, type: request.type, facts: request.facts, question: request.question },
      equation: derivation.equation, isolation: derivation.isolation,
      substitution: derivation.substitution, residual: '0' } };
}

function linearDerivation(request, x) {
  const fee = value(request, 'fee'), rate = value(request, 'rate'), total = value(request, 'total');
  return { answer: { quantity: String(x), unit: request.question.unit },
    equation: `${fee} + ${rate}*x = ${total}`,
    isolation: `x = (${total} - ${fee})/${rate} = ${x}`,
    substitution: `${fee} + ${rate}*(${x}) = ${total}` };
}
function consecutiveDerivation(request, first) {
  const count = Number(value(request, 'count').n), sum = value(request, 'sum');
  const spacing = request.question.parity === 'any' ? 1 : 2;
  const values = Array.from({ length: count }, (_, index) => String(first.add(spacing * index)));
  const offset = spacing * count * (count - 1) / 2;
  return { answer: { integers: values, unit: 'integers' },
    equation: `${count}*n + ${offset} = ${sum}`,
    isolation: `n = (${sum} - ${offset})/${count} = ${first}`,
    substitution: `${values.join(' + ')} = ${sum}` };
}
function discountDerivation(request, sale) {
  const price = value(request, 'price'), rate = value(request, 'percent'), amount = price.mul(rate).div(100);
  return { answer: { salePrice: String(sale), unit: 'USD' },
    equation: `sale + ${price}*${rate}/100 = ${price}`,
    isolation: `sale = ${price} - ${amount} = ${sale}`,
    substitution: `${sale} + ${amount} = ${price}` };
}
function mixtureDerivation(request, x) {
  const first = value(request, 'first_percent'), known = value(request, 'known_volume');
  const second = value(request, 'second_percent'), target = value(request, 'target_percent');
  return { answer: { quantity: String(x), unit: request.question.unit,
      concentration: String(first) },
    equation: `${first}*x + ${second}*${known} = ${target}*(x + ${known})`,
    isolation: `x = ${known}*(${target} - ${second})/(${first} - ${target}) = ${x}`,
    substitution: `${first}*(${x}) + ${second}*${known} = ${target}*(${x} + ${known})` };
}

function deriveForSolve(request) {
  if (request.type === 'linear_fee_rate') {
    const fee = value(request, 'fee'), rate = value(request, 'rate'), total = value(request, 'total');
    if (fee.cmp(0) < 0 || rate.cmp(0) <= 0 || total.cmp(fee) < 0) invalid('A nonnegative quantity requires a positive rate and a total at least the fee.');
    return linearDerivation(request, total.sub(fee).div(rate));
  }
  if (request.type === 'consecutive_integers') {
    const count = Number(value(request, 'count').n), sum = value(request, 'sum');
    const spacing = request.question.parity === 'any' ? 1 : 2;
    const first = sum.sub(spacing * count * (count - 1) / 2).div(count);
    if (!first.integer) invalid('The stated sum has no such consecutive integers.');
    if (request.question.parity !== 'any' && Number((first.n % 2n + 2n) % 2n) !== (request.question.parity === 'odd' ? 1 : 0))
      invalid('The stated sum does not have the requested parity.');
    return consecutiveDerivation(request, first);
  }
  if (request.type === 'percent_discount') {
    const price = value(request, 'price'), rate = value(request, 'percent');
    percent(rate); if (price.cmp(0) < 0) invalid('Price must be nonnegative.');
    return discountDerivation(request, price.mul(Q(100).sub(rate)).div(100));
  }
  if (request.type === 'mixture') {
    const first = value(request, 'first_percent'), known = value(request, 'known_volume');
    const second = value(request, 'second_percent'), target = value(request, 'target_percent');
    [first, second, target].forEach(percent);
    if (known.cmp(0) <= 0 || first.eq(target)) invalid('Mixture requires a positive known volume and a unique unknown volume.');
    const x = known.mul(target.sub(second)).div(first.sub(target));
    if (x.cmp(0) < 0) invalid('The target concentration requires a negative volume.');
    return mixtureDerivation(request, x);
  }
  invalid('Unsupported word-problem template.');
}

function canonicalRequest(input) {
  const request = parseWordProblem(typeof input === 'string' ? input : input?.text);
  if (!request || (typeof input !== 'string' && stableStringify(input) !== stableStringify(request)))
    invalid('Input must be an unambiguous supported sentence or its unchanged parsed request.');
  return request;
}

/** Solve a source sentence or the unchanged request returned by parseWordProblem. */
export function solveWordProblem(input) {
  try { const request = canonicalRequest(input); return render(request, deriveForSolve(request)); }
  catch (error) { return { status: 'invalid', verified: false, topic: 'word_problem', answer: null,
    facts: [], steps: [], restrictions: [], certificate: null, error: error.message || 'Invalid word problem.' }; }
}

// Replay starts from the source sentence and checks a claimed answer in the
// original model. It never invokes the solver or trusts certificate arithmetic.
function deriveForReplay(request, report) {
  if (request.type === 'linear_fee_rate') {
    const fee = value(request, 'fee'), rate = value(request, 'rate'), total = value(request, 'total');
    const x = Q(report.answer.quantity);
    if (fee.cmp(0) < 0 || rate.cmp(0) <= 0 || x.cmp(0) < 0 || !fee.add(rate.mul(x)).eq(total)) invalid('Cost equation failed replay.');
    return linearDerivation(request, x);
  }
  if (request.type === 'consecutive_integers') {
    const count = Number(value(request, 'count').n), sum = value(request, 'sum');
    const entries = report.answer.integers;
    if (!Array.isArray(entries) || entries.length !== count) invalid('Incorrect integer count.');
    const values = entries.map(Q), spacing = request.question.parity === 'any' ? 1 : 2;
    if (values.some(q => !q.integer) || values.some((q, i) => i && !q.sub(values[i - 1]).eq(spacing)) ||
      !values.reduce((acc, q) => acc.add(q), Q(0)).eq(sum)) invalid('Integer progression failed replay.');
    if (request.question.parity !== 'any' && Number((values[0].n % 2n + 2n) % 2n) !== (request.question.parity === 'odd' ? 1 : 0))
      invalid('Integer parity failed replay.');
    return consecutiveDerivation(request, values[0]);
  }
  if (request.type === 'percent_discount') {
    const price = value(request, 'price'), rate = value(request, 'percent'), sale = Q(report.answer.salePrice);
    percent(rate);
    if (price.cmp(0) < 0 || sale.cmp(0) < 0 || !sale.add(price.mul(rate).div(100)).eq(price)) invalid('Discount equation failed replay.');
    return discountDerivation(request, sale);
  }
  if (request.type === 'mixture') {
    const first = value(request, 'first_percent'), known = value(request, 'known_volume');
    const second = value(request, 'second_percent'), target = value(request, 'target_percent');
    const x = Q(report.answer.quantity);
    [first, second, target].forEach(percent);
    if (known.cmp(0) <= 0 || first.eq(target) || x.cmp(0) < 0 ||
      !first.mul(x).add(second.mul(known)).eq(target.mul(x.add(known)))) invalid('Mixture balance failed replay.');
    return mixtureDerivation(request, x);
  }
  invalid('Unsupported word-problem template.');
}

/** Reparse source facts and replay the claimed solution against the original model. */
export function verifyWordProblemCertificate(input, report) {
  try {
    if (!report || report.status !== 'solved' || report.verified !== true) return false;
    const request = canonicalRequest(input);
    const replayed = render(request, deriveForReplay(request, report));
    return stableStringify(replayed) === stableStringify(report);
  } catch { return false; }
}
