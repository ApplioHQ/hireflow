import test from 'node:test';
import assert from 'node:assert/strict';
import { imageToGraphStrokes } from '../graph/stroke-import.js';
import { latexToInput } from '../engine/latex.js';
import { compileGraphExpression } from '../graph/model.js';

function image(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

function compileEvery(result) {
  for (const row of result.expressions) {
    const parsed = latexToInput(row.expression);
    assert.equal(parsed.kind, 'piecewise');
    assert.equal(parsed.pieces.length, 1);
    assert.match(parsed.pieces[0].condition, /^-?\d+(?:\.\d+)?<=x<=-?\d+(?:\.\d+)?$/);
    const compiled = compileGraphExpression(row.expression, { readExpression: latexToInput });
    assert.equal(compiled.kind, 'explicit');
    assert.equal(compiled.axis, 'y');
    assert.equal(compiled.piecewise, true);
    const [left, right] = compiled.breakpoints();
    assert(left < right && left >= result.bounds.xMin - 1e-9 && right <= result.bounds.xMax + 1e-9);
    assert(Number.isFinite(compiled.sample((left + right) / 2)));
    assert(Number.isNaN(compiled.sample(left - .001)));
    assert(Number.isNaN(compiled.sample(right + .001)));
    assert.match(row.color, /^#[0-9a-f]{6}$/);
    assert(Number.isFinite(row.strokeWidth) && row.strokeWidth > 0);
    assert(!row.expression.includes('+-'));
    assert(row.expression.startsWith('\\begin{cases}') && row.expression.includes('\\le x\\le ')
      && row.expression.endsWith('\\end{cases}'));
    assert.equal(row.visible, true);
    assert.equal(row.imported, true);
  }
}

test('uniform pixels become bounded, colored sine strokes with fitted image aspect', () => {
  const result = imageToGraphStrokes(image(8, 4, () => [17, 34, 51, 255]));
  assert.deepEqual(result.bounds, { xMin: -8, xMax: 8, yMin: -4, yMax: 4 });
  assert.equal(result.width, 8);
  assert.equal(result.height, 4);
  assert.equal(result.expressions.length, 4);
  assert(result.expressions.every(row => row.color === '#112233' && row.expression.includes('\\sin(')));
  assert(result.expressions.every(row => row.strokeWidth > 0));
  compileEvery(result);
});

test('wave displacement is visibly larger than a nearly flat scanline', () => {
  const source = image(80, 80, () => [32, 96, 160, 255]);
  const waves = imageToGraphStrokes(source);
  const lines = imageToGraphStrokes(source, { style: 'lines' });
  const rowHeight = (waves.bounds.yMax - waves.bounds.yMin) / waves.expressions.length;
  const parsed = latexToInput(waves.expressions[0].expression);
  const amplitude = Number(/\+(\d+(?:\.\d+)?) sin/.exec(parsed.pieces[0].expression)?.[1]);
  assert(amplitude >= rowHeight * .45 && amplitude <= rowHeight * .6);
  assert(waves.expressions[0].strokeWidth < lines.expressions[0].strokeWidth);
  compileEvery(waves);
});

test('lines use genuine bounded linear formulas and preserve colored vertical features', () => {
  const palette = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]];
  const result = imageToGraphStrokes(image(8, 4, x => palette[Math.floor(x / 2)]), { style: 'lines' });
  assert.equal(result.expressions.length, 16);
  assert.deepEqual(result.expressions.slice(0, 4).map(row => row.color), ['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
  assert(result.expressions.every(row => !row.expression.includes('\\sin') && /[+-]\d+(?:\.\d+)?x &/.test(row.expression)));
  const first = result.expressions.slice(0, 4).map(row => compileGraphExpression(row.expression, { readExpression: latexToInput }).breakpoints());
  assert.deepEqual(first, [[-8, -4], [-4, 0], [0, 4], [4, 8]]);
  const firstLine = compileGraphExpression(result.expressions[0].expression, { readExpression: latexToInput });
  assert(Math.abs(firstLine.sample(-8) - firstLine.sample(-4)) > .1);
  compileEvery(result);
});

test('alpha is composited over white before colors are segmented', () => {
  const result = imageToGraphStrokes(image(3, 1, x => [
    [0, 0, 0, 0], [255, 0, 0, 128], [0, 0, 255, 255],
  ][x]));
  assert.deepEqual(result.expressions.map(row => row.color), ['#ffffff', '#ff7f7f', '#0000ff']);
  compileEvery(result);
});

test('complex images obey the expression ceiling and remain deterministic and graphable', () => {
  const source = image(96, 72, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 47) % 256, (x * 23 + y * 29) % 256, 255]);
  const before = source.data.slice();
  for (const maxExpressions of [7, 480, 1000]) {
    const a = imageToGraphStrokes(source, { maxExpressions });
    const b = imageToGraphStrokes(source, { maxExpressions });
    assert.deepEqual(a, b);
    assert(a.expressions.length >= 1 && a.expressions.length <= Math.min(640, maxExpressions));
    compileEvery(a);
  }
  assert.deepEqual(source.data, before);
});

test('bounds preserve wide and tall image aspect within the graph frame', () => {
  for (const source of [image(40, 2, () => [0, 0, 0, 255]), image(2, 40, () => [0, 0, 0, 255])]) {
    const result = imageToGraphStrokes(source);
    const { xMin, xMax, yMin, yMax } = result.bounds;
    assert(xMin >= -8 && xMax <= 8 && yMin >= -4.5 && yMax <= 4.5);
    assert(Math.abs((xMax - xMin) / (yMax - yMin) - source.width / source.height) < 1e-12);
    compileEvery(result);
  }
});

test('malformed images and options are rejected without interpreting source properties', () => {
  const valid = image(1, 1, () => [1, 2, 3, 255]);
  for (const bad of [null, {}, { width: 0, height: 1, data: valid.data },
    { width: 1.5, height: 1, data: valid.data }, { width: 1, height: Infinity, data: valid.data },
    { width: 2, height: 1, data: valid.data }, { width: 1, height: 1, data: [1, 2, 3, 255] },
    { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) }])
    assert.throws(() => imageToGraphStrokes(bad));
  for (const maxExpressions of [0, -2, NaN, Infinity, '2', { valueOf() { throw new Error('Must not run'); } }])
    assert.throws(() => imageToGraphStrokes(valid, { maxExpressions }), /maxExpressions/);
  assert.throws(() => imageToGraphStrokes(valid, { style: 'script' }), /style/);
  valid.data.expression = 'x);alert(1);//';
  compileEvery(imageToGraphStrokes(valid));
});
