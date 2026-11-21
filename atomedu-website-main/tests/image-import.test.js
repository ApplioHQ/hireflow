import test from 'node:test';
import assert from 'node:assert/strict';
import { imageToGraphRegions } from '../graph/image-import.js';
import { compileGraphExpression, GRAPH_LIMITS } from '../graph/model.js';
import { latexToInput, toLatex } from '../engine/latex.js';

function image(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

const close = (actual, expected, tolerance = 1e-10) =>
  assert(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

function parseRectangle(expression) {
  const number = '(\\d+(?:\\.\\d+)?)';
  const match = new RegExp(`^abs\\(x([+-])${number}\\)<=${number} and abs\\(y([+-])${number}\\)<=${number}$`).exec(expression);
  assert(match, `Invalid rectangle: ${expression}`);
  const [, xSign, xCenter, xRadius, ySign, yCenter, yRadius] = match;
  const rectangle = {
    cx: (xSign === '+' ? -1 : 1) * Number(xCenter), rx: Number(xRadius),
    cy: (ySign === '+' ? -1 : 1) * Number(yCenter), ry: Number(yRadius),
  };
  assert(Object.values(rectangle).every(Number.isFinite));
  assert(rectangle.rx > 0 && rectangle.ry > 0);
  return rectangle;
}

test('uniform image becomes one correctly colored rectangle with fitted bounds', () => {
  const result = imageToGraphRegions(image(4, 2, () => [17, 34, 51, 255]));
  assert.deepEqual(result, {
    expressions: [{ expression: 'abs(x-0)<=8 and abs(y-0)<=4', color: '#112233', visible: true }],
    bounds: { xMin: -8, xMax: 8, yMin: -4, yMax: 4 }, width: 4, height: 2,
  });
});

test('two-color boundary uses two regions when the budget is two', () => {
  const source = image(8, 4, x => x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  const result = imageToGraphRegions(source, { maxRegions: 2 });
  assert.equal(result.expressions.length, 2);
  assert.deepEqual(result.expressions.map(row => row.color), ['#ff0000', '#0000ff']);
  const [left, right] = result.expressions.map(row => parseRectangle(row.expression));
  close(left.cx, -4); close(right.cx, 4);
  close(left.rx, 4); close(right.rx, 4);
  close(left.cy, 0); close(right.cy, 0);
  assert.match(result.expressions[0].expression, /abs\(x\+4\)/);
  assert(!result.expressions.some(row => row.expression.includes('--')));
});

test('transparent and translucent pixels are composited over white', () => {
  const source = image(2, 1, x => x === 0 ? [0, 0, 0, 0] : [255, 0, 0, 128]);
  const result = imageToGraphRegions(source, { maxRegions: 2 });
  assert.deepEqual(result.expressions.map(row => row.color), ['#ffffff', '#ff7f7f']);
  assert.equal(imageToGraphRegions(image(1, 1, () => [0, 0, 0, 0])).expressions[0].color, '#ffffff');
});

test('region cap clamps to 1..768 and can spend a small budget on detail', () => {
  const source = image(32, 32, (x, y) => (x + y) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  assert.equal(imageToGraphRegions(source, { maxRegions: -12 }).expressions.length, 1);
  assert.equal(imageToGraphRegions(source, { maxRegions: 1.9 }).expressions.length, 1);
  const seven = imageToGraphRegions(source, { maxRegions: 7 });
  assert(seven.expressions.length > 1 && seven.expressions.length <= 7);
  assert(imageToGraphRegions(source, { maxRegions: Infinity }).expressions.length <= 768);
});

test('image aspect fits inside the 16 by 9 graph frame', () => {
  const wide = imageToGraphRegions(image(40, 2, () => [0, 0, 0, 255]));
  close(wide.bounds.xMin, -8); close(wide.bounds.xMax, 8);
  close(wide.bounds.yMin, -.4); close(wide.bounds.yMax, .4);
  const tall = imageToGraphRegions(image(2, 40, () => [0, 0, 0, 255]));
  close(tall.bounds.xMin, -.225); close(tall.bounds.xMax, .225);
  close(tall.bounds.yMin, -4.5); close(tall.bounds.yMax, 4.5);
  for (const result of [wide, tall]) {
    const { xMin, xMax, yMin, yMax } = result.bounds;
    close((xMax - xMin) / (yMax - yMin), result.width / result.height);
  }
});

test('rectangles have finite decimal coordinates and cover every source pixel center', () => {
  const source = image(7, 5, (x, y) => [x * 40, y * 50, (x + y) * 20, 255]);
  const result = imageToGraphRegions(source, { maxRegions: 32 });
  const rectangles = result.expressions.map(row => parseRectangle(row.expression));
  assert(result.expressions.every(row => /^#[0-9a-f]{6}$/.test(row.color) && row.visible === true));
  const { xMin, xMax, yMin, yMax } = result.bounds;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const px = xMin + (x + .5) / source.width * (xMax - xMin);
    const py = yMax - (y + .5) / source.height * (yMax - yMin);
    assert(rectangles.some(r => Math.abs(px - r.cx) <= r.rx + 1e-12 && Math.abs(py - r.cy) <= r.ry + 1e-12), `Uncovered pixel ${x}, ${y}`);
  }
  const area = rectangles.reduce((sum, r) => sum + 4 * r.rx * r.ry, 0);
  close(area, (xMax - xMin) * (yMax - yMin));
});

test('bad and adversarial inputs are rejected without evaluating input text', () => {
  const valid = image(1, 1, () => [1, 2, 3, 255]);
  for (const bad of [null, {}, { width: '1', height: 1, data: valid.data },
    { width: 0, height: 1, data: valid.data }, { width: 1.5, height: 1, data: valid.data },
    { width: Infinity, height: 1, data: valid.data },
    { width: Number.MAX_SAFE_INTEGER + 1, height: 1, data: valid.data },
    { width: 2, height: 1, data: valid.data },
    { width: 1, height: 1, data: [1, 2, 3, 255] },
    { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) }])
    assert.throws(() => imageToGraphRegions(bad));
  for (const maxRegions of [NaN, '2', { valueOf() { throw new Error('Must not run'); } }])
    assert.throws(() => imageToGraphRegions(valid, { maxRegions }), /maxRegions/);
  assert.throws(() => imageToGraphRegions(valid, { onProgress: 'alert(1)' }), /onProgress/);
  valid.data.expression = 'x);alert(1);//';
  assert.match(imageToGraphRegions(valid).expressions[0].expression, /^abs\(x/);
});

test('output and progress are deterministic, and source bytes are preserved', () => {
  const source = image(24, 18, (x, y) => [x * 9, y * 13, (x * 17 + y * 19) % 256, (x * 37 + y * 29) % 256]);
  const before = source.data.slice(), progressA = [], progressB = [];
  const a = imageToGraphRegions(source, { maxRegions: 40, onProgress: n => progressA.push(n) });
  const b = imageToGraphRegions(source, { maxRegions: 40, onProgress: n => progressB.push(n) });
  assert.deepEqual(a, b);
  assert.deepEqual(progressA, progressB);
  assert.equal(progressA[0], 0); assert.equal(progressA.at(-1), 100);
  assert(progressA.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 100 && (!i || n >= progressA[i - 1])));
  assert.deepEqual(source.data, before);
});

test('generated regions remain editable, graphable math beyond the former 24-row ceiling', () => {
  const source = image(24, 18, (x, y) => [(x * 37 + y * 9) % 256, (y * 41) % 256, (x * 13) % 256, 255]);
  const result = imageToGraphRegions(source, { maxRegions: 96 });
  assert(result.expressions.length > 24 && result.expressions.length <= GRAPH_LIMITS.expressions);
  for (const entry of result.expressions) {
    const compiled = compileGraphExpression(entry.expression);
    assert.equal(compiled.kind, 'region');
    assert(compiled.bounds.xMax > compiled.bounds.xMin && compiled.bounds.yMax > compiled.bounds.yMin);
  }
  for (const entry of result.expressions.slice(0, 5)) {
    const roundTrip = compileGraphExpression(toLatex(entry.expression), { readExpression: latexToInput });
    const original = compileGraphExpression(entry.expression);
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) close(roundTrip.bounds[key], original.bounds[key], 1e-9);
  }
});
