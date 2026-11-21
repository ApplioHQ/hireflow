import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(resolve(root, path), 'utf8');

test('the product video deck has 20 working slides, three portraits, and real product assets', () => {
  const html = read('product-video.html');
  const script = read('product-video.js');
  assert.equal((html.match(/<section class="slide /g) || []).length, 20);
  assert.match(html, /<title>atomEDU Product Demo \| 18 Minutes<\/title>/);
  assert.match(html, /id="slide-20"/);
  assert.match(script, /ArrowRight/);
  assert.match(script, /ArrowLeft/);
  const images = [...html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
  assert(images.length >= 9);
  for (const image of images) assert(existsSync(resolve(root, image)), `Missing ${image}`);
  assert.doesNotMatch(html, /Aryan Patel|images\/patel\.jpeg/);
  assert.equal((html.match(/<figure><img src="images\/(?:awasthi|avuthu|sanikommu)\.jpeg"/g) || []).length, 3);
  assert.match(html, /images\/logo\.svg/);
  assert.match(html, /atomEDU is not affiliated with Google/);
  assert.doesNotMatch(html, /image.import|image.import.screen/i);
  assert.doesNotMatch(html, /Official Google partner|All of Algebra|All of Geometry/i);
});

test('the 18-minute script follows all 20 slides and balances the three founders', () => {
  const script = read('docs/product-video-script.md');
  assert.match(script, /Target length: approximately 18 minutes/);
  assert.equal((script.match(/^## \d+:\d\d to \d+:\d\d \| Slide \d+/gm) || []).length, 20);
  assert.match(script, /^## 0:00 to 0:55 \| Slide 1 \| Rahul opens/m);
  assert.match(script, /^## 16:50 to 18:00 \| Slide 20 \| All three close/m);
  assert.match(script, /\*\*Rahul:\*\*/);
  assert.match(script, /\*\*Pritam:\*\*/);
  assert.match(script, /\*\*Akshaj:\*\*/);
  assert.doesNotMatch(script, /Aryan|Patel/);
  const speakerWords = name => [...script.matchAll(new RegExp(`^\\*\\*${name}:\\*\\* (.+)$`, 'gm'))].reduce((count, match) => count + match[1].split(/\s+/).length, 0);
  const counts = ['Rahul', 'Pritam', 'Akshaj'].map(speakerWords);
  assert(Math.max(...counts) - Math.min(...counts) <= 120, `Unbalanced narration: ${counts.join(', ')}`);
  assert.doesNotMatch(script, /image import|image.upload/i);
  for (const topic of ['Solve', 'Check work', 'Ghost steps', 'Generate', 'Graph', 'Share']) {
    assert.match(script, new RegExp(topic, 'i'));
  }
});

test('the opportunity memo measures potential replies, not applications or logo claims', () => {
  const memo = read('docs/education-opportunities-30-days.md');
  assert.match(memo, /Monday, November 16, 2026/);
  assert.match(memo, /a substantive human reply or written decision received by that date/);
  assert.match(memo, /An automatic receipt does not count/);
  for (const date of ['Nov 16', 'Nov 19', 'Nov 23', 'Nov 30', 'Dec 7', 'Dec 16']) assert.match(memo, new RegExp(date));
  assert.match(memo, /None with a verifiable same-day partner decision and logo license/);
  assert.match(memo, /follow-up threshold.*not a promise of a reply/);
  assert.match(memo, /written approval/);
  assert.match(memo, /three qualifying integrations/i);
  assert.match(memo, /not permission to put a Microsoft partner logo/i);
  assert.match(memo, /reviews full courses, not standalone math tools/);
});
