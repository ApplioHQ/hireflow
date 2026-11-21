import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphShareUrl, parseGraphShareUrl } from '../classroom/share.js';

test('Classroom graph links retain bounded polar and parametric curves without a backend', () => {
  const expressions = [
    { expression: 'polar(r=2+sin(theta);theta=0..2*pi)', color: '#bf5a2e', visible: true },
    { expression: 'parametric(x=cos(t);y=sin(t);t=0..2*pi)', color: '#3265a5', visible: true },
  ];
  const state = { expressions, gridMode: 'polar', xScale: 'linear', yScale: 'linear', equalAspect: true,
    viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 } };
  const url = buildGraphShareUrl(state, 'https://atom-edu.org/');
  assert.match(url, /^https:\/\/atom-edu\.org\/proof-lab\?graph=/);
  assert.deepEqual(parseGraphShareUrl(url), state);
  const classroom = new URL('https://classroom.google.com/share');
  classroom.searchParams.set('url', url);
  assert.equal(new URL(classroom.searchParams.get('url')).hostname, 'atom-edu.org');
});
