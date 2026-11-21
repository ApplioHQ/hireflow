import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphShareUrl } from '../classroom/share.js';
import { prepareGraphExport, serializeGraph, buildPublicGraphDownloadUrl, buildDirectExportUrl } from '../graph/share-export.js';

const source = {
  expressions: [
    { expression: 'y=\\frac{a}{2}x^2+b', color: '#AABBCC', visible: true, id: 'private-id' },
    { expression: 'x=2', visible: false },
    { expression: '' },
  ],
  viewport: { xMin: -8, xMax: 8, yMin: -5, yMax: 5 },
  parameters: { a: 2, b: -1, c: 0 }, equalAspect: true,
  xScale: 'linear', yScale: 'linear', gridMode: 'cartesian',
  trace: { expressionId: 'private-id' }, accessToken: 'secret',
};

test('serializes detached, public graph fields from live state', () => {
  const before = structuredClone(source);
  const json = JSON.parse(serializeGraph(source, 'json'));
  assert.deepEqual(source, before);
  assert.equal(json.version, 1);
  assert.equal(json.graph.expressions.length, 2);
  assert.deepEqual(json.graph.expressions[1], { expression: 'x=2', visible: false });
  assert.equal(json.graph.viewport.xMin, -8);
  assert(!JSON.stringify(json).includes('secret'));
  assert(!JSON.stringify(json).includes('private-id'));
  assert.equal(json.shareUrl, undefined);
  const text = serializeGraph(source);
  assert.match(text, /1\. y=\\frac\{a\}\{2\}x\^2\+b \(visible, #AABBCC\)/);
  assert.match(text, /2\. x=2 \(hidden\)/);
  assert.match(text, /Window: x -8 to 8; y -5 to 5/);
});

test('keeps the original editable link when exporting a valid share URL', () => {
  const graphUrl = buildGraphShareUrl({ ...source, expressions: source.expressions.slice(0, 2) }, 'https://atom-edu.org/');
  const json = JSON.parse(serializeGraph(graphUrl, 'json'));
  assert.equal(json.shareUrl, graphUrl);
  assert.match(serializeGraph(graphUrl, 'text'), /Editable graph: https:\/\/atom-edu\.org\/proof-lab\?/);
  assert.throws(() => serializeGraph('https://atom-edu.org/proof-lab?graph=%7B%7D#graph'), TypeError);
  assert.throws(() => serializeGraph('https://evil.invalid/proof-lab?graph=x#graph'), TypeError);
});

test('LaTeX emits graph input as escaped literal text', () => {
  const latex = serializeGraph(source, 'latex');
  assert.match(latex, /^\\documentclass\{article\}/);
  assert.match(latex, /\\texttt\{y=\\textbackslash\{\}frac/);
  assert.match(latex, /\\textasciicircum\{\}/);
  assert.match(latex, /\\end\{document\}\n$/);
  assert(!latex.includes('\\frac{a}{2}'));
});

test('provider handoffs are local, explicit, and bounded', () => {
  for (const provider of ['google-drive', 'notion', 'zapier', 'dropbox', 'github']) {
    const result = prepareGraphExport(provider, source);
    assert.equal(result.provider, provider);
    assert(result.content.length > 0);
    assert(!result.content.includes('secret'));
    assert(!result.content.includes('private-id'));
    assert(['download', 'copy'].includes(result.delivery));
    assert(result.instructions.length > 10);
    if (provider !== 'github') assert.equal(result.openUrl, null);
  }
  assert.equal(prepareGraphExport('github', source).openUrl, 'https://gist.github.com/');
  assert.equal(prepareGraphExport('google-drive', source).mimeType, 'application/json');
  assert.throws(() => prepareGraphExport('unknown', source), TypeError);
});

test('full state supports all 768 expressions without a share URL roundtrip', () => {
  const expressions = Array.from({ length: 768 }, (_, i) => ({
    expression: `y=x+${i}`, color: '#123456', visible: i % 2 === 0,
    imported: true, strokeWidth: 2.2, id: `private-${i}`,
  }));
  const state = { ...source, expressions: [...expressions, { expression: '' }] };
  const result = prepareGraphExport('google-drive', state);
  const json = JSON.parse(result.content);
  assert.equal(json.graph.expressions.length, 768);
  assert.deepEqual(json.graph.expressions[767], {
    expression: 'y=x+767', color: '#123456', visible: false, imported: true, strokeWidth: 2.2,
  });
  assert.equal(json.shareUrl, undefined);
  assert.match(serializeGraph(state, 'text'), /768\. y=x\+767 \(hidden, #123456, imported, stroke 2\.2\)/);
});

test('share URLs retain Classroom limits even though full states can exceed them', () => {
  const twentyFive = Array(25).fill({ expression: 'y=x' });
  assert.equal(JSON.parse(serializeGraph({ expressions: twentyFive }, 'json')).graph.expressions.length, 25);
  const url = new URL('https://atom-edu.org/proof-lab#graph');
  url.searchParams.set('graph', JSON.stringify({ v: 1, expressions: twentyFive }));
  assert.throws(() => serializeGraph(url.href), TypeError);
  const longUrl = buildGraphShareUrl({ expressions: ['y=x'] }, 'https://atom-edu.org/');
  assert.throws(() => serializeGraph(longUrl + 'a'.repeat(4000)), TypeError);
});

test('rejects malformed or oversized input instead of serializing it', () => {
  assert.throws(() => serializeGraph(null), TypeError);
  assert.throws(() => serializeGraph(source, 'html'), TypeError);
  assert.throws(() => serializeGraph({ ...source, expressions: Array(770).fill('y=x') }), RangeError);
  assert.throws(() => serializeGraph({ ...source, expressions: ['y=x\n+1'] }));
  assert.throws(() => serializeGraph({ ...source, expressions: [42] }));
  assert.throws(() => serializeGraph({ ...source, parameters: { a: Infinity } }));
  assert.throws(() => serializeGraph({ ...source, viewport: { xMin: 5, xMax: 1, yMin: -1, yMax: 1 } }));
  assert.throws(() => serializeGraph({ ...source, expressions: ['y=' + 'x'.repeat(2047)] }), RangeError);
  assert.throws(() => serializeGraph({ ...source, expressions: Array(768).fill('y=' + 'x'.repeat(1400)) }),
    /exceeds 1048576 bytes/);
  assert.throws(() => serializeGraph({ ...source, expressions: ['y=window.alert(1)'] }));
});

test('builds a bounded public graph file URL for provider Saver widgets', () => {
  const url = new URL(buildPublicGraphDownloadUrl(source));
  assert.equal(url.origin, 'https://atom-integrations-api.archimedes-api1.workers.dev');
  assert.equal(url.pathname, '/api/integrations/download');
  const graph = JSON.parse(url.searchParams.get('graph'));
  assert.equal(graph.v, 1);
  assert.equal(graph.expressions.length, 2);
  assert(!JSON.stringify(graph).includes('private-id'));
  assert(!JSON.stringify(graph).includes('secret'));
  assert.throws(() => buildPublicGraphDownloadUrl({ expressions: Array(25).fill('y=x') }), /up to 24/);
  assert.throws(() => buildPublicGraphDownloadUrl({ expressions: ['y=x' + ' '.repeat(257)] }), /256 characters/);
});

test('builds a nonempty, bounded GitHub OAuth export link', () => {
  const url = new URL(buildDirectExportUrl('github', source));
  assert.equal(url.pathname, '/api/integrations/oauth/github/start');
  assert.equal(JSON.parse(url.searchParams.get('graph')).expressions.length, 2);
  const notion = new URL(buildDirectExportUrl('notion', source, 'https://app.notion.com/p/Welcome-41acb18b29318005a7c3e7921315848e'));
  assert.equal(notion.pathname, '/api/integrations/oauth/notion/start');
  assert.equal(notion.searchParams.get('parent'), '41acb18b29318005a7c3e7921315848e');
  assert.throws(() => buildDirectExportUrl('notion', source), /Paste the full URL/);
  assert.throws(() => buildDirectExportUrl('notion', source, 'https://evil.example/page-41acb18b29318005a7c3e7921315848e'), /Paste the full URL/);
  assert.throws(() => buildDirectExportUrl('github', { expressions: [] }), /Add a graph/);
  assert.throws(() => buildDirectExportUrl('github', { expressions: Array(24).fill('y=x' + ' '.repeat(60)) }), /too large/);
});
