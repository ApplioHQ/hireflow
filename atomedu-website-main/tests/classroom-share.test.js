import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphShareUrl, parseGraphShareUrl } from '../classroom/share.js';

const BASE = 'https://atom-edu.org/';
const viewport = () => ({ xMin: -8, xMax: 8, yMin: -5, yMax: 5 });

function linkFor(payload) {
  const url = new URL('/proof-lab#graph', BASE);
  url.searchParams.set('graph', JSON.stringify(payload));
  return url.href;
}

test('round trips the public graph fields with an exact proof-lab route', () => {
  const original = {
    expressions: [
      { id: 'row-1', expression: 'y=\\frac{a}{2}x^2+b', color: '#Ab12EF', visible: true, error: null, kind: 'explicit' },
      { id: 'row-2', expression: 'x^2+y^2=9', color: '#123456', visible: false, imported: true },
    ],
    viewport: viewport(), parameters: { a: 2, b: -3, c: 0 }, equalAspect: false,
    xScale: 'linear', yScale: 'linear', gridMode: 'cartesian', trace: { expressionId: 'row-1' },
    accessToken: 'private',
  };
  const url = buildGraphShareUrl(original, 'https://atom-edu.org/old?token=secret#private');
  assert.match(url, /^https:\/\/atom-edu\.org\/proof-lab\?graph=[^#]+#graph$/);
  assert(url.length <= 4000);
  assert(!url.includes('secret') && !url.includes('private') && !url.includes('accessToken'));
  const restored = parseGraphShareUrl(url);
  assert.deepEqual(restored, {
    expressions: [
      { expression: 'y=\\frac{a}{2}x^2+b', color: '#Ab12EF', visible: true },
      { expression: 'x^2+y^2=9', color: '#123456', visible: false },
    ],
    viewport: viewport(), parameters: { a: 2, b: -3, c: 0 }, equalAspect: false,
    xScale: 'linear', yScale: 'linear', gridMode: 'cartesian',
  });
  restored.expressions[0].expression = 'y=4';
  restored.viewport.xMin = -1;
  assert.equal(original.expressions[0].expression, 'y=\\frac{a}{2}x^2+b');
  assert.equal(original.viewport.xMin, -8);
});

test('accepts a small graph and preserves optional values only when supplied', () => {
  const url = buildGraphShareUrl({ expressions: ['y=x^2', { expression: 'x=2', visible: false }] }, new URL(BASE));
  assert.deepEqual(parseGraphShareUrl(url), {
    expressions: [{ expression: 'y=x^2' }, { expression: 'x=2', visible: false }],
  });
  assert.deepEqual(parseGraphShareUrl(buildGraphShareUrl({ expressions: [] }, BASE)), { expressions: [] });
  const logState = { expressions: ['y=x'], viewport: { xMin: 1, xMax: 100, yMin: 1, yMax: 100 },
    xScale: 'log', yScale: 'log', gridMode: 'cartesian', equalAspect: true };
  assert.deepEqual(parseGraphShareUrl(buildGraphShareUrl(logState, BASE)), {
    ...logState, expressions: [{ expression: 'y=x' }],
  });
  const polarState = { expressions: ['x^2+y^2=4'], viewport: viewport(), xScale: 'linear',
    yScale: 'linear', gridMode: 'polar', equalAspect: true };
  assert.deepEqual(parseGraphShareUrl(buildGraphShareUrl(polarState, BASE)), {
    ...polarState, expressions: [{ expression: 'x^2+y^2=4' }],
  });
});

test('rejects invalid expressions, styles, viewport, parameters, and oversized state', () => {
  const state = expressions => ({ expressions, viewport: viewport() });
  for (const expression of ['', '   ', 'y=', 'y=window.alert(1)', '\\href{https://example.com}{x}', 'x'.repeat(257), 'y=x\n+1']) {
    assert.throws(() => buildGraphShareUrl(state([expression]), BASE), `accepted ${expression}`);
  }
  assert.throws(() => buildGraphShareUrl(state(Array(25).fill('y=x')), BASE), RangeError);
  assert.throws(() => buildGraphShareUrl(state(Array(1)), BASE));
  const customIterator = ['y=x'];
  customIterator[Symbol.iterator] = () => { throw new Error('Must not use an untrusted array iterator.'); };
  assert.doesNotThrow(() => buildGraphShareUrl(state(customIterator), BASE));
  for (const row of [{ expression: 'y=x', color: 'red' }, { expression: 'y=x', visible: 'false' }]) {
    assert.throws(() => buildGraphShareUrl(state([row]), BASE));
  }
  for (const bad of [NaN, Infinity, 101, '2']) {
    assert.throws(() => buildGraphShareUrl({ expressions: [], parameters: { a: bad } }, BASE));
  }
  assert.throws(() => buildGraphShareUrl({ expressions: [], viewport: { ...viewport(), xMax: -9 } }, BASE));
  for (const bad of [{ xScale: 'ln' }, { yScale: 'LOG' }, { gridMode: 'major' }]) {
    assert.throws(() => buildGraphShareUrl({ expressions: [], ...bad }, BASE));
  }
  assert.throws(() => buildGraphShareUrl({ expressions: [], xScale: 'log', viewport: viewport() }, BASE));
  assert.throws(() => buildGraphShareUrl({ expressions: [], xScale: 'log' }, BASE));
  assert.throws(() => buildGraphShareUrl({ expressions: [], yScale: 'log', viewport: viewport() }, BASE));
  assert.throws(() => buildGraphShareUrl({ expressions: [], xScale: 'log', gridMode: 'polar' }, BASE));
  assert.throws(() => buildGraphShareUrl({ expressions: [], gridMode: 'polar', equalAspect: false }, BASE));
  const tooLong = Array(24).fill(null).map((_, i) => ({ expression: `y=x+${i}+${'sin(x)+'.repeat(20)}1` }));
  assert.throws(() => buildGraphShareUrl({ expressions: tooLong }, BASE), /4000/);
});

test('requires a public HTTPS host and discards unsafe base URL details', () => {
  for (const base of ['http://atom-edu.org/', 'https://localhost/', 'https://127.0.0.1/',
    'https://atom-edu.org:8443/', 'https://user:pass@atom-edu.org/', 'javascript:alert(1)']) {
    assert.throws(() => buildGraphShareUrl({ expressions: [] }, base));
  }
  const url = buildGraphShareUrl({ expressions: [] }, 'https://atom-edu.org/some/path?session=private#token');
  assert.equal(new URL(url).pathname, '/proof-lab');
  assert.deepEqual([...new URL(url).searchParams.keys()], ['graph']);
  assert.equal(new URL(url).hash, '#graph');
});

test('parser rejects malformed links and payloads without throwing', () => {
  const good = buildGraphShareUrl({ expressions: ['y=x'] }, BASE);
  const withExtra = new URL(good);
  withExtra.searchParams.set('extra', '1');
  const withDuplicate = new URL(good);
  withDuplicate.searchParams.append('graph', 'another');
  const variants = [
    good.replace('https:', 'http:'), good.replace('/proof-lab?', '/other?'),
    good.replace('#graph', '#solve'), good.replace('#graph', ''),
    withExtra.href, good.replace('?graph=', '?other='), withDuplicate.href,
    linkFor({ v: 2, expressions: [] }), linkFor({ v: 1, expressions: [], token: 'secret' }),
    linkFor({ v: 1, expressions: [{ expression: 'y=x', secret: 'no' }] }),
    linkFor({ v: 1, expressions: [], parameters: { a: 1, password: 'no' } }),
    linkFor({ v: 1, expressions: [], viewport: { ...viewport(), xMin: Infinity } }),
    linkFor({ v: 1, expressions: ['y=x'] }),
    linkFor({ v: 1, expressions: [{ expression: '\\href{https://example.com}{x}' }] }),
    linkFor({ v: 1, expressions: [], axisMode: 'linear' }),
    linkFor({ v: 1, expressions: [], xScale: 'secret' }),
    linkFor({ v: 1, expressions: [], xScale: 'log', viewport: viewport() }),
    linkFor({ v: 1, expressions: [], yScale: 'log' }),
    linkFor({ v: 1, expressions: [], xScale: 'log', gridMode: 'polar' }),
    linkFor(JSON.parse('{"v":1,"expressions":[],"__proto__":{"polluted":true}}')),
    'https://atom-edu.org/proof-lab?graph=%7Bbroken#graph',
    `${good}${'x'.repeat(4000)}`,
  ];
  for (const candidate of variants) assert.equal(parseGraphShareUrl(candidate), null, candidate);
  assert.equal({}.polluted, undefined);
});
