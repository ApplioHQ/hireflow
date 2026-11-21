import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWordProblem, solveWordProblem, verifyWordProblemCertificate } from '../engine/word-problems.js';

const clone = value => JSON.parse(JSON.stringify(value));

function solved(text, expectedType) {
  const request = parseWordProblem(text);
  assert.equal(request?.type, expectedType, text);
  assert.equal(request.kind, 'word_problem');
  for (const fact of request.facts) {
    assert.equal(request.text.slice(...fact.span), fact.raw, fact.key);
    assert.ok(fact.unit);
  }
  const result = solveWordProblem(request);
  assert.equal(result.status, 'solved', result.error);
  assert.equal(result.verified, true);
  assert.equal(result.answer.exact, true);
  assert.deepEqual(result.restrictions, []);
  assert.equal(result.certificate.type, 'word_problem');
  assert.equal(result.certificate.version, 1);
  assert.equal(result.certificate.assurance, 'exact-rational-replay');
  assert.deepEqual(result.facts, request.facts);
  assert.equal(result.steps.length, 3);
  assert.ok(result.steps.every(step => step.verified && step.rule && step.explanation));
  assert.equal(verifyWordProblemCertificate(request, result), true);
  assert.equal(verifyWordProblemCertificate(text, clone(result)), true);
  return result;
}

test('fixed fee and per-unit rate produce exact quantities and retained units', () => {
  const taxi = 'A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled?';
  const result = solved(taxi, 'linear_fee_rate');
  assert.deepEqual(result.answer, { quantity: '6', unit: 'miles', exact: true });
  assert.deepEqual(result.facts.map(f => [f.key, f.value, f.unit]), [
    ['fee', '5', 'USD'], ['rate', '2', 'USD/mile'], ['total', '17', 'USD']
  ]);
  assert.equal(result.certificate.equation, '5 + 2*x = 17');

  const hourly = 'A repair service charges $7.50 base fee plus $1.25 per hour. The total cost is $10. How many hours were used?';
  assert.deepEqual(solved(hourly, 'linear_fee_rate').answer,
    { quantity: '2', unit: 'hours', exact: true });
  const fractional = 'A company charges $1/3 fixed fee plus $2/3 per ticket. The total cost is $5/3. How many tickets were sold?';
  assert.equal(solved(fractional, 'linear_fee_rate').answer.quantity, '2');

  const curriculumTaxi = 'A taxi charges 4 dollars plus 3 dollars per mile. How far can I travel for 25 dollars?';
  const curriculum = solved(curriculumTaxi, 'linear_fee_rate');
  assert.deepEqual(curriculum.answer, { quantity: '7', unit: 'miles', exact: true });
  assert.deepEqual(curriculum.facts.map(f => [f.key, f.value, f.unit]), [
    ['fee', '4', 'USD'], ['rate', '3', 'USD/mile'], ['total', '25', 'USD']
  ]);
  assert.equal(curriculum.certificate.substitution, '4 + 3*(7) = 25');
});

test('consecutive integer sums retain parity and prove the stated sum', () => {
  assert.deepEqual(solved('The sum of three consecutive integers is 72. Find the integers.',
    'consecutive_integers').answer.integers, ['23', '24', '25']);
  assert.deepEqual(solved('The sum of two consecutive even integers is 34. What are the integers?',
    'consecutive_integers').answer.integers, ['16', '18']);
  assert.deepEqual(solved('The sum of three consecutive odd integers is -3. Find the integers.',
    'consecutive_integers').answer.integers, ['-3', '-1', '1']);
  const impossible = solveWordProblem('The sum of two consecutive integers is 4. Find the integers.');
  assert.equal(impossible.status, 'invalid');
  assert.deepEqual(impossible.restrictions, []);
  assert.equal(impossible.certificate, null);
  assert.equal(verifyWordProblemCertificate('The sum of two consecutive integers is 4. Find the integers.', impossible), false);
});

test('discounts and concentration mixtures use exact percentages', () => {
  const discount = solved('A jacket costs $80 and is discounted by 25%. What is the sale price?', 'percent_discount');
  assert.deepEqual(discount.answer, { salePrice: '60', unit: 'USD', exact: true });
  const decimal = solved('A $19.99 jacket is discounted by 12.5%. What is the sale price?', 'percent_discount');
  assert.equal(decimal.answer.salePrice, '13993/800');
  const mixture = solved('How many liters of a 20% solution must be mixed with 10 liters of a 50% solution to make a 30% solution?', 'mixture');
  assert.deepEqual(mixture.answer, { quantity: '20', unit: 'liters', concentration: '20', exact: true });
  const fractional = solved('How many gallons of a 10% solution must be mixed with 1/3 gallons of a 40% solution to make a 20% solution?', 'mixture');
  assert.equal(fractional.answer.quantity, '2/3');
});

test('the complete grammar rejects mismatches and unstated or ambiguous meaning', () => {
  for (const text of [
    'A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many hours were used?',
    'A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled? Add a tip.',
    'A taxi charges about $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled?',
    'How many liters of a 20% solution must be mixed with 10 gallons of a 50% solution to make a 30% solution?',
    'A train travels 60 miles in 2 hours. What is its speed?',
    'The sum of several consecutive integers is 30. Find the integers.',
    'A jacket costs $80 and is discounted by 25% or 30%. What is the sale price?',
    'A taxi charges 4 dollars plus 3 dollars per hour. How far can I travel for 25 dollars?',
    'A taxi charges 4 dollars plus 3 dollars per mile. How far can I travel for 25 dollars? Add a tip.'
  ]) {
    assert.equal(parseWordProblem(text), null, text);
    const result = solveWordProblem(text);
    assert.equal(result.status, 'invalid', text);
    assert.deepEqual(result.restrictions, []);
  }
  for (const text of [
    'A jacket costs $80 and is discounted by 125%. What is the sale price?',
    'How many liters of a 20% solution must be mixed with 10 liters of a 50% solution to make a 20% solution?',
    'How many liters of a 20% solution must be mixed with 10 liters of a 50% solution to make a 60% solution?'
  ]) {
    const result = solveWordProblem(text);
    assert.equal(result.status, 'invalid', text);
    assert.equal(result.verified, false);
    assert.deepEqual(result.restrictions, []);
    assert.equal(result.certificate, null);
  }
});

test('certificate replay rejects changed facts, math, steps, metadata, and input', () => {
  const text = 'How many liters of a 20% solution must be mixed with 10 liters of a 50% solution to make a 30% solution?';
  const request = parseWordProblem(text), result = solveWordProblem(request);
  const mutations = [
    r => { r.answer.quantity = '21'; },
    r => { r.answer.unit = 'gallons'; },
    r => { r.answer.concentration = '30'; },
    r => { r.facts[0].value = '25'; },
    r => { r.certificate.source.facts[0].value = '25'; },
    r => { r.certificate.source.text += ' '; },
    r => { r.certificate.equation = '20*x = 30'; },
    r => { r.certificate.residual = '1'; },
    r => { r.certificate.assurance = 'approximate'; },
    r => { r.steps[1].verified = false; },
    r => { r.steps[2].after = 'unchecked'; },
    r => { r.restrictions = ['x != 0']; },
    r => { r.verified = false; }
  ];
  for (const mutate of mutations) {
    const forged = clone(result); mutate(forged);
    assert.equal(verifyWordProblemCertificate(request, forged), false, String(mutate));
  }
  const changed = parseWordProblem(text.replace('10 liters', '11 liters'));
  assert.equal(verifyWordProblemCertificate(changed, result), false);
  const alteredRequest = clone(request); alteredRequest.facts[0].value = '25';
  assert.equal(solveWordProblem(alteredRequest).status, 'invalid');
  assert.equal(verifyWordProblemCertificate(alteredRequest, result), false);
  assert.equal(verifyWordProblemCertificate(request, null), false);
});
