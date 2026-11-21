import test from 'node:test';
import assert from 'node:assert/strict';
import { latexToInput } from '../engine/latex.js';
import {
  DEFAULT_VIEWPORT, GRAPH_LIMITS, validateViewport, equalizeViewport, niceStep,
  getTicks, getPolarGrid, worldToScreen, screenToWorld, zoomViewport, panViewport,
  compileGraphExpression, sampleExplicit, sampleParametric, contourSegments,
} from '../graph/model.js';

const close = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const box = (xMin = -5, xMax = 5, yMin = -5, yMax = 5) => ({ xMin, xMax, yMin, yMax });
const piecewise = (pieces, variable = 'x') => compileGraphExpression('piecewise LaTeX source', { readExpression: () => ({ kind: 'piecewise', variable, pieces }) });

test('nice ticks span negative, fractional, tiny, and large numerical windows', () => {
  assert.equal(niceStep(20, 10), 2);
  assert.equal(niceStep(23, 10), 2.5);
  assert.deepEqual(getTicks(-3, 3, 6), [-3, -2, -1, 0, 1, 2, 3]);
  assert.deepEqual(getTicks(.1, .3, 4), [.1, .15, .2, .25, .3]);
  for (const [min, max] of [[-1e-9, 1e-9], [-1e11, 1e11], [9e10, 9e10 + 1], [9e10, 9e10 + .001], [-.03, -.01]]) {
    const ticks = getTicks(min, max, 8);
    assert(ticks.length > 1 && ticks.length <= 201);
    ticks.forEach((n, i) => { assert(Number.isFinite(n)); assert(n >= min - (max - min) * 1e-8); assert(n <= max + (max - min) * 1e-8); if (i) assert(n > ticks[i - 1]); });
  }
  assert.deepEqual(getTicks(1, 1), []);
  assert.deepEqual(getTicks(NaN, 3), []);
  assert.equal(niceStep(Infinity), 1);
});

test('viewport transforms round trip and invert the screen y axis', () => {
  for (const v of [DEFAULT_VIEWPORT, box(-.004, .01, -300, 200), box(200, 500, 80, 90)]) {
    for (const dimensions of [[800, 500], [300, 700], [1920, 1080]]) {
      const [width, height] = dimensions;
      for (const fractions of [[0, 0], [.25, .67], [1, 1]]) {
        const p = { x: v.xMin + fractions[0] * (v.xMax - v.xMin), y: v.yMin + fractions[1] * (v.yMax - v.yMin) };
        const screen = worldToScreen(p, v, width, height), world = screenToWorld(screen, v, width, height);
        close(world.x, p.x); close(world.y, p.y);
      }
      assert.deepEqual(worldToScreen({ x: v.xMin, y: v.yMax }, v, width, height), { x: 0, y: 0 });
    }
  }
});

test('wheel-style zoom preserves the world coordinate under an off-center pointer', () => {
  const v = box(-12, 8, -6, 14), pointer = { x: 137, y: 388 }, width = 900, height = 520;
  const anchor = screenToWorld(pointer, v, width, height);
  for (const factor of [.3, .8, 1.2, 6]) {
    const next = zoomViewport(v, factor, anchor), result = worldToScreen(anchor, next, width, height);
    close(result.x, pointer.x); close(result.y, pointer.y);
    close(next.xMax - next.xMin, 20 / factor);
  }
  const next = zoomViewport(v, 2), restored = zoomViewport(next, .5);
  for (const key of Object.keys(v)) close(restored[key], v[key]);
});

test('pan and equal-unit aspect preserve the center and validate numerical bounds', () => {
  assert.deepEqual(panViewport(box(), 2, -3), box(-3, 7, -8, 2));
  const v = equalizeViewport(box(-5, 5, -5, 5), 800, 400);
  assert.deepEqual(v, box(-10, 10, -5, 5));
  close((v.xMax - v.xMin) / 800, (v.yMax - v.yMin) / 400);
  for (const bad of [box(5, -5), box(0, 0), box(NaN), box(-Infinity), box(-1e13)]) assert.throws(() => validateViewport(bad), RangeError);
  for (const factor of [0, -1, Infinity, NaN]) assert.throws(() => zoomViewport(box(), factor), RangeError);
  assert.throws(() => panViewport(box(), NaN, 0), RangeError);
  for (const factor of [1e-300, 1e300]) assert.doesNotThrow(() => validateViewport(zoomViewport(box(), factor)));
  const nearLimit = panViewport(box(), 1e20, -1e20);
  assert(Object.values(nearLimit).every(n => Math.abs(n) <= GRAPH_LIMITS.coordinate));
  close(nearLimit.xMax - nearLimit.xMin, 10); close(nearLimit.yMax - nearLimit.yMin, 10);
});

test('independent logarithmic axes preserve screen coordinates through zoom and pan', () => {
  const scales = { xScale: 'log', yScale: 'log' }, v = box(.1, 1000, .01, 100);
  const width = 800, height = 500, pointer = { x: 137, y: 388 };
  close(worldToScreen({ x: 1, y: 1 }, v, width, height, scales).x, 200);
  close(worldToScreen({ x: 1, y: 1 }, v, width, height, scales).y, 250);
  for (const p of [{ x: .1, y: .01 }, { x: 2, y: 20 }, { x: 1000, y: 100 }]) {
    const back = screenToWorld(worldToScreen(p, v, width, height, scales), v, width, height, scales);
    close(back.x, p.x); close(back.y, p.y);
  }
  const anchor = screenToWorld(pointer, v, width, height, scales);
  const zoomed = zoomViewport(v, 2, anchor, scales);
  const anchored = worldToScreen(anchor, zoomed, width, height, scales);
  close(anchored.x, pointer.x); close(anchored.y, pointer.y);
  const panned = panViewport(v, 1, -1, scales);
  close(panned.xMin, 1); close(panned.xMax, 10000);
  close(panned.yMin, .001); close(panned.yMax, 10);
  assert.throws(() => validateViewport(box(0, 10, .1, 10), scales), /positive/);
  assert.throws(() => validateViewport(v, { xScale: 'logarithmic' }), /linear or log/);
  assert(Number.isNaN(worldToScreen({ x: -1, y: 1 }, v, width, height, scales).x));
});

test('mixed log and linear axes equalize displayed units and sample by decades', () => {
  const scales = { xScale: 'log', yScale: 'linear' }, v = box(.01, 100, -2, 2);
  const equal = equalizeViewport(v, 800, 400, scales);
  close((Math.log10(equal.xMax) - Math.log10(equal.xMin)) / 800, (equal.yMax - equal.yMin) / 400);
  const curve = compileGraphExpression('y=log(x)');
  const paths = sampleExplicit(curve, box(.001, 1000, -4, 4), { width: 900, height: 500, ...scales });
  assert(paths.length);
  assert(paths.flat().some(p => p.x < .01), 'sampling reaches the low decades');
  assert(paths.flat().some(p => p.x > 100), 'sampling reaches the high decades');
  assert(paths.flat().every(p => p.x > 0 && Number.isFinite(p.y)));
  const contour = contourSegments(compileGraphExpression('x*y=1'), box(.01, 100, -10, 10), { width: 400, height: 300, ...scales });
  assert(contour.length);
  assert(contour.flat().every(p => p.x > 0));
});

test('polar grid radii and angle rays stay bounded across centered and panned windows', () => {
  for (const v of [box(), box(20, 40, -10, 10), box(-1e6, -1e6 + 100, 0, 100)]) {
    const { radii, angles, maxRadius } = getPolarGrid(v, 800, 500);
    assert(radii.length > 0 && radii.length <= 120);
    assert(radii.every((radius, i) => radius > 0 && radius <= maxRadius && (!i || radius > radii[i - 1])));
    assert.equal(angles.length, 24); close(angles[0], 0); close(angles[6], Math.PI / 2);
  }
});

test('structured polar and parametric curves compile as numerical Cartesian points', () => {
  const polarSource = 'polar(r=2+sin(theta);theta=0..2*pi)';
  const polar = compileGraphExpression(polarSource, { readExpression() { throw new Error('Structured text must bypass the LaTeX reader.'); } });
  assert.equal(polar.kind, 'polar'); assert.equal(polar.parameter, 'theta'); assert.equal(polar.source, polarSource);
  close(polar.tMin, 0); close(polar.tMax, 2 * Math.PI);
  close(polar.point(0).x, 2); close(polar.point(Math.PI / 2).y, 3);
  const circle = compileGraphExpression('parametric(x=a*cos(t);y=b*sin(t);t=0..2*pi)');
  assert.equal(circle.kind, 'parametric'); assert.deepEqual(circle.parameters, ['a', 'b']);
  assert.deepEqual(circle.point(0, { a: 3, b: 2 }), { x: 3, y: 0 });
  close(circle.point(Math.PI / 2, { a: 3, b: 2 }).y, 2);
  const paths = sampleParametric(circle, box(-4, 4, -3, 3), { width: 800, height: 500, parameters: { a: 3, b: 2 } });
  assert(paths.length && paths.flat().length > 30);
  assert(paths.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.t >= 0 && p.t <= 2 * Math.PI));
  close(paths[0][0].x, 3); close(paths.at(-1).at(-1).x, 3);
  assert.deepEqual(sampleParametric(compileGraphExpression('y=x'), box()), []);
});

test('structured curves leave gaps at undefined samples and obey sampling budgets', () => {
  const broken = compileGraphExpression('parametric(x=t;y=1/t;t=-1..1)');
  const paths = sampleParametric(broken, box(-2, 2, -10, 10), { width: 801, maxSamples: 1500 });
  assert(paths.length >= 2);
  for (const path of paths) for (let i = 1; i < path.length; i++)
    assert(!(path[i - 1].t < 0 && path[i].t > 0), 'no path may bridge the pole');
  let calls = 0; const original = broken.point;
  broken.point = (...args) => { calls++; return original(...args); };
  sampleParametric(broken, box(), { maxSamples: 90 }); assert(calls <= 90);
  assert.deepEqual(sampleParametric(broken, box(), { maxSamples: 0 }), []);
  const positive = compileGraphExpression('parametric(x=exp(t);y=exp(t);t=-2..2)');
  const logPaths = sampleParametric(positive, box(.1, 10, .1, 10), { xScale: 'log', yScale: 'log' });
  assert(logPaths.length && logPaths.flat().every(p => p.x > 0 && p.y > 0));
});

test('structured curve syntax rejects unsafe variables, intervals, and malformed clauses', () => {
  for (const source of [
    'polar(r=theta;theta=0..)', 'polar(r=theta;theta=2..1)',
    'polar(r=1;theta=0..1000*pi)', 'polar(r=x;theta=0..pi)',
    'parametric(x=cos(t);y=sin(t);t=0..1e7)',
    'parametric(x=x+t;y=t;t=0..1)', 'parametric(x=t;y=window.alert(t);t=0..1)',
    'parametric(x=t;y=t;t=a..2)', 'parametric(x=t;x=t;t=0..1)',
    'parametric(x=t;y=t;t=0..1',
  ]) assert.throws(() => compileGraphExpression(source), undefined, source);
  assert.throws(() => compileGraphExpression('polar(r=1;theta=0..1)'.repeat(200)), /characters/);
});

test('expression compiler handles both explicit orientations and axis-aligned lines', () => {
  for (const text of ['y=x^2', 'x^2=y', 'x^2', 'f(x)=x^2']) {
    const curve = compileGraphExpression(text);
    assert.equal(curve.kind, 'explicit'); assert.equal(curve.axis, 'y'); close(curve.sample(-3), 9);
  }
  const sideways = compileGraphExpression('x=2*y+1');
  assert.equal(sideways.axis, 'x'); close(sideways.sample(3), 7);
  const vertical = compileGraphExpression('x=2'), horizontal = compileGraphExpression('y=-3');
  assert.equal(vertical.axis, 'x'); close(vertical.sample(99), 2);
  assert.equal(horizontal.axis, 'y'); close(horizontal.sample(99), -3);
  const sine = compileGraphExpression('y=sin(x)+log(100)+ln(e)+sqrt(4)+abs(-2)');
  close(sine.sample(0), 7);
  close(compileGraphExpression('y=root(x,3)').sample(-8), -2);
  close(compileGraphExpression('y=cbrt(x)').sample(-27), -3);
  close(compileGraphExpression('y=x^(2/3)').sample(-8), 4);
  assert(Number.isNaN(compileGraphExpression('y=root(x,4)').sample(-1)));
});

test('graph trig shorthand groups adjacent coefficients and powers without changing products', () => {
  for (const text of ['y=sin3x', 'y=sin 3x', 'y=sin(3x)']) {
    const curve = compileGraphExpression(text);
    assert.equal(curve.kind, 'explicit');
    close(curve.sample(Math.PI / 6), 1);
    close(curve.sample(Math.PI / 3), 0);
  }
  close(compileGraphExpression('y=cos2x').sample(Math.PI / 2), -1);
  close(compileGraphExpression('y=sinx').sample(Math.PI / 2), 1);
  close(compileGraphExpression('y=sin x').sample(Math.PI / 2), 1);
  close(compileGraphExpression('y=sin^2 x').sample(Math.PI / 4), .5);
  close(compileGraphExpression('y=sin^2(3x)').sample(Math.PI / 6), 1);
  close(compileGraphExpression('y=sin x^2').sample(2), Math.sin(4));
  close(compileGraphExpression('y=3sinx').sample(Math.PI / 2), 3);
  close(compileGraphExpression('y=sin(3)x').sample(2), 2 * Math.sin(3));
  close(compileGraphExpression('y=sin 3*x').sample(2), 2 * Math.sin(3));
  close(compileGraphExpression('y=2sin(x)').sample(Math.PI / 2), 2);
  close(compileGraphExpression('y=2(x+1)').sample(2), 6);
  close(compileGraphExpression('x=cos2y').sample(Math.PI / 2), -1);
  close(compileGraphExpression('sin3x+y=0').value(Math.PI / 6, -1), 0);
  assert(compileGraphExpression('y<sin3x').contains(Math.PI / 6, .5));
  assert.throws(() => compileGraphExpression('y=sin3xy'));
});

test('graph LaTeX trig shorthand survives the host reader without absorbing explicit products', () => {
  const readExpression = latexToInput;
  // Exact LaTeX emitted by the browser MathLive field for these typed inputs.
  for (const [text, x, expected] of [
    ['y=\\sin\\left(3x\\right)', Math.PI / 6, 1],
    ['y=\\sin3x', Math.PI / 6, 1],
    ['y=\\sin x', Math.PI / 6, .5],
    ['y=\\sin^2x', Math.PI / 4, .5],
  ]) close(compileGraphExpression(text, { readExpression }).sample(x), expected);
  for (const text of ['y=\\sin3x', 'y=\\sin 3x', 'y=\\sin^2 3x']) {
    const curve = compileGraphExpression(text, { readExpression });
    close(curve.sample(Math.PI / 6), 1);
    close(curve.sample(Math.PI / 3), 0);
  }
  close(compileGraphExpression('y=\\cos2x', { readExpression }).sample(Math.PI / 2), -1);
  close(compileGraphExpression('y=\\sin^2 x', { readExpression }).sample(Math.PI / 4), .5);
  close(compileGraphExpression('y=\\sin3x^{2}', { readExpression }).sample(2), Math.sin(12));
  close(compileGraphExpression('y=\\sin(3x)', { readExpression }).sample(Math.PI / 6), 1);
  close(compileGraphExpression('y=\\sin(3)x', { readExpression }).sample(2), 2 * Math.sin(3));
  close(compileGraphExpression('y=\\sin 3\\cdot x', { readExpression }).sample(2), 2 * Math.sin(3));
  close(compileGraphExpression('y=2\\sin x', { readExpression }).sample(Math.PI / 2), 2);
  const seen = [];
  compileGraphExpression('y=\\sin3x', { readExpression(source) { seen.push(source); return latexToInput(source); } });
  assert.deepEqual(seen, ['y=\\sin3x', 'y=\\sin(3x)']);
});

test('compiler uses the host LaTeX reader and exposes stable parameter names', () => {
  const latex = 'y=\\frac{a}{x}+b';
  const compiled = compileGraphExpression(latex, { readExpression(value) { assert.equal(value, latex); return 'y=a/x+b'; } });
  assert.deepEqual(compiled.parameters, ['a', 'b']); close(compiled.sample(2, { a: 6, b: 4 }), 7);
  const parabola = compileGraphExpression('y=a*x^2+b*x+c');
  close(parabola.sample(2), 4); close(parabola.sample(2, { a: 2, b: 3, c: -1 }), 13);
  const point = compileGraphExpression('(log(8,2), a+1)');
  assert.equal(point.kind, 'point'); assert.deepEqual(point.point({ a: 4 }), { x: 3, y: 5 });
  assert.throws(() => compileGraphExpression('(x,2)'), /Point coordinates/);
});

test('structured piecewise input compiles an absolute-value function with first-match semantics', () => {
  const curve = piecewise([{ expression: '-x', condition: 'x<0' }, { expression: 'x', condition: 'x>=0' }]);
  assert.equal(curve.kind, 'explicit'); assert.equal(curve.piecewise, true); assert.equal(curve.axis, 'y');
  for (const x of [-3, -1 / 3, 0, 1 / 3, 4]) close(curve.sample(x), Math.abs(x));
  close(curve.value(-3, 3), 0);
  assert.deepEqual(curve.endpoints(), [], 'continuous joins need no jump decoration');
  const paths = sampleExplicit(curve, box());
  assert(paths.length >= 2); paths.flat().forEach(p => close(p.y, Math.abs(p.x)));
  const overlap = piecewise([{ expression: '1/x', condition: 'x>=0' }, { expression: '7', condition: 'otherwise' }]);
  close(overlap.sample(-1), 7); close(overlap.sample(2), .5);
  assert(Number.isNaN(overlap.sample(0)), 'an undefined first match cannot fall through to a later branch');
});

test('piecewise comparisons, chains and uncovered domains use owned mathematical operands', () => {
  const curve = piecewise([{ expression: 'x^2', condition: '-1/3<x<=1/3' }]);
  close(curve.sample(0), 0); close(curve.sample(1 / 3), 1 / 9);
  for (const x of [-2, -1 / 3, .334, 5]) assert(Number.isNaN(curve.sample(x)));
  const reverse = piecewise([{ expression: '2', condition: '(1>=x>-1/3)' }]);
  close(reverse.sample(1), 2); assert(Number.isNaN(reverse.sample(-1 / 3)));
  const equality = piecewise([{ expression: '3', condition: 'x=1/3' }]);
  close(equality.sample(1 / 3), 3); assert(Number.isNaN(equality.sample(0)));
  assert.deepEqual(equality.endpoints(), [{ x: 1 / 3, y: 3, open: false }]);
  assert.deepEqual(sampleExplicit(equality, box()), [], 'an isolated point is not connected to another branch');
  const nonlinear = piecewise([{ expression: '1', condition: 'x^2<1' }]);
  close(nonlinear.sample(.5), 1); assert(Number.isNaN(nonlinear.sample(2)));
});

test('piecewise sampling separates even tiny jumps at fractional condition boundaries', () => {
  const boundary = 1 / 3;
  for (const jump of [2, 1e-12]) {
    const curve = piecewise([{ expression: '1', condition: 'x<1/3' }, { expression: `1+${jump}`, condition: 'x>=1/3' }]);
    const paths = sampleExplicit(curve, box(-1, 1, 0, 4), { width: 803, height: 501 });
    assert(paths.length >= 2);
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      assert(!(path[i - 1].x < boundary && path[i].x >= boundary), 'no edge may bridge a branch transition');
      assert.equal(path[i - 1].y, path[i].y, 'each constant branch remains horizontal');
    }
    assert.deepEqual(curve.endpoints(), [{ x: boundary, y: 1, open: true }, { x: boundary, y: 1 + jump, open: false }]);
  }
});

test('piecewise open holes and narrow intervals split sampling at affine boundaries', () => {
  const hole = piecewise([{ expression: 'x', condition: 'x!=1/3' }]), boundary = 1 / 3;
  assert(Number.isNaN(hole.sample(boundary)));
  const paths = sampleExplicit(hole, box(-1, 1, -1, 1), { width: 800 });
  assert(paths.length >= 2);
  for (const path of paths) for (let i = 1; i < path.length; i++) assert(!(path[i - 1].x < boundary && path[i].x >= boundary));
  assert.deepEqual(hole.endpoints(), [{ x: boundary, y: boundary, open: true }]);
  const interval = piecewise([{ expression: '2', condition: '1/3<x<=1/3+.000001' }]);
  const narrow = sampleExplicit(interval, box(-1, 1, 0, 4));
  assert(narrow.length, 'known condition bounds expose intervals smaller than the base sample grid');
  assert(narrow.flat().every(p => p.x > boundary && p.x <= boundary + .000001));
  assert.deepEqual(interval.endpoints(), [{ x: boundary, y: 2, open: true }, { x: boundary + .000001, y: 2, open: false }]);
});

test('piecewise parameters affect expressions and affine bounds in either orientation', () => {
  const curve = piecewise([{ expression: 'a*x+c', condition: '2*x+b<a' }]);
  assert.deepEqual(curve.parameters, ['a', 'b', 'c']);
  assert.deepEqual(curve.breakpoints({ a: 3, b: 1 }), [1]);
  close(curve.sample(.5, { a: 3, b: 1, c: 4 }), 5.5);
  assert(Number.isNaN(curve.sample(1, { a: 3, b: 1 })));
  const sideways = piecewise([{ expression: '-y', condition: 'y<0' }, { expression: 'y', condition: 'y>=0' }], 'y');
  assert.equal(sideways.axis, 'x'); close(sideways.sample(-2), 2); close(sideways.value(2, -2), 0);
  assert(sampleExplicit(sideways, box()).flat().every(p => p.x === Math.abs(p.y)));
});

test('piecewise input validation and adaptive evaluation retain resource bounds', () => {
  for (const pieces of [[], [{ expression: 'y', condition: 'x<0' }], [{ expression: 'x', condition: 'y<0' }], [{ expression: 'x', condition: 'x<' }], [{ expression: 'x', condition: 'x<0;alert(1)' }]]) assert.throws(() => piecewise(pieces));
  assert.throws(() => piecewise([{ expression: 'x', condition: 'x<0' }], 't'));
  assert.throws(() => piecewise(Array.from({ length: GRAPH_LIMITS.pieces + 1 }, () => ({ expression: 'x', condition: 'x<0' }))));
  assert.throws(() => piecewise([{ expression: 'x', condition: 'x'.repeat(GRAPH_LIMITS.expressionLength) }]));
  const curve = piecewise([{ expression: '-x', condition: 'x<1/3' }, { expression: 'x', condition: 'otherwise' }]);
  let calls = 0; const original = curve.sampleWithBranch;
  curve.sampleWithBranch = (...args) => { calls++; return original(...args); };
  sampleExplicit(curve, box(), { maxSamples: 80 }); assert(calls <= 80);
});

test('implicit residuals and approximate inequalities keep their distinct meaning', () => {
  const circle = compileGraphExpression('x^2+y^2=9');
  assert.equal(circle.kind, 'implicit'); close(circle.value(0, 3), 0); close(circle.value(0, 0), -9);
  for (const [text, inside, outside] of [
    ['y<x^2', [2, 3], [2, 5]], ['x^2+y^2<=9', [0, 0], [4, 0]],
    ['x>=2', [3, 9], [0, 9]], ['y>1', [0, 2], [0, 0]],
  ]) {
    const region = compileGraphExpression(text);
    assert.equal(region.kind, 'inequality'); assert(region.contains(...inside)); assert(!region.contains(...outside));
  }
  assert(!compileGraphExpression('y<1/x').contains(0, 0));
  assert(!compileGraphExpression('y<x').contains(1, 1));
  assert(compileGraphExpression('y<=x').contains(1, 1));
});

test('editable rectangular math regions round-trip through LaTeX and support image-scale expression counts', () => {
  const source = 'abs(x+3.5)<=0.25 and abs(y-1.2)<=0.5';
  const region = compileGraphExpression(source);
  assert.equal(region.kind, 'region');
  assert.deepEqual(region.bounds, { xMin: -3.75, xMax: -3.25, yMin: .7, yMax: 1.7 });
  assert(region.contains(-3.5, 1.2));
  assert(!region.contains(-3, 1.2));
  const latexRegion = compileGraphExpression('\\left|x+\\frac{7}{2}\\right|\\le\\frac{1}{4}\\land\\left|y-\\frac{6}{5}\\right|\\le\\frac{1}{2}', { readExpression: latexToInput });
  assert.deepEqual(latexRegion.bounds, region.bounds);
  assert(GRAPH_LIMITS.expressions > 24);
  assert.throws(() => compileGraphExpression('abs(x-0)<=0 and abs(y-0)<=1'), /positive width/);
});

test('bounded wave and line formulas draw as actual functions, not image overlays', () => {
  const options = { readExpression: latexToInput };
  const wave = compileGraphExpression('\\begin{cases}2+0.1\\sin(3x)&-2\\le x\\le1\\end{cases}', options);
  assert.equal(wave.kind, 'explicit');
  close(wave.sample(0), 2);
  assert(Number.isNaN(wave.sample(3)));
  const line = compileGraphExpression('\\begin{cases}1+0.25x&-2\\le x\\le1\\end{cases}', options);
  assert.equal(line.kind, 'explicit');
  close(line.sample(1), 1.25);
  assert(Number.isNaN(line.sample(-3)));
});

test('undefined root, logarithm and reciprocal domains survive surrounding arithmetic', () => {
  for (const expression of ['y=sqrt(x)^0', 'y=ln(x)^0', 'y=1/ln(x)']) {
    const curve = compileGraphExpression(expression);
    assert(Number.isNaN(curve.sample(-1)), expression);
    if (expression !== 'y=sqrt(x)^0') assert(Number.isNaN(curve.sample(0)), expression);
    const paths = sampleExplicit(curve, box(-4, 4, -4, 4));
    assert(paths.length, expression);
    assert(paths.flat().every(p => p.x >= 0 && Number.isFinite(p.y)), expression);
  }
  assert(Number.isNaN(compileGraphExpression('y=(1/x)^0').sample(0)));
  close(compileGraphExpression('y=sqrt(x)^0').sample(0), 1);
  for (const base of [0, 1, -2]) {
    assert(Number.isNaN(compileGraphExpression(`y=log(1,${base})`).sample(0)));
    assert(!compileGraphExpression(`log(1,${base})>=0`).contains(0, 0));
  }
});

test('inequality shading excludes negative real domains and the undefined pole itself', () => {
  for (const text of ['sqrt(x)^0>=1', 'y<=sqrt(x)^0', 'ln(x)^0>=1']) {
    const region = compileGraphExpression(text);
    assert(!region.contains(-1, 0), text);
    assert(region.contains(1, 0), text);
  }
  const region = compileGraphExpression('1/(x-.137)>0');
  assert(!region.contains(.137, 0)); assert(!region.contains(.13, 0)); assert(region.contains(.14, 0));
  assert.equal(contourSegments(region, box()).length, 0, 'a region sign change at a pole is not an equality boundary');
});

test('malformed, oversized, unsupported and executable source text is rejected', () => {
  for (const text of ['', 'y=', 'y=x=2', 'y=window.alert(1)', 'y=constructor(x)', 'y=z*x', 'y=i*x', 'x!=1', 'f(t)=t^2', 'y=x;alert(1)', 'y=(()=>7)()']) {
    assert.throws(() => compileGraphExpression(text), undefined, text);
  }
  assert.throws(() => compileGraphExpression('x'.repeat(GRAPH_LIMITS.expressionLength + 1)), /characters/);
  assert.throws(() => compileGraphExpression('x', { readExpression: () => null }));
});

test('explicit curves sample in world coordinates with bounded evaluations', () => {
  const paths = sampleExplicit(compileGraphExpression('y=x^2'), box(), { width: 800, height: 500 });
  assert(paths.length); assert(paths.flat().length > 20);
  for (const p of paths.flat()) close(p.y, p.x ** 2);
  const vertical = sampleExplicit(compileGraphExpression('x=2'), box());
  assert(vertical.length); assert(vertical.flat().every(p => p.x === 2));
  let evaluations = 0;
  const curve = { kind: 'explicit', axis: 'y', sample: x => { evaluations++; return Math.sin(x); } };
  sampleExplicit(curve, box(), { maxSamples: 90, width: 10000 }); assert(evaluations <= 90);
  assert.deepEqual(sampleExplicit(curve, box(), { maxSamples: 0 }), []);
});

test('reciprocal poles, translated poles and tangent never acquire asymptote bridges', () => {
  for (const [expression, poles] of [['y=1/x', [0]], ['y=1/(x-.137)', [.137]], ['y=tan(x)', [-Math.PI / 2, Math.PI / 2]], ['x=1/y', [0]]]) {
    const curve = compileGraphExpression(expression), paths = sampleExplicit(curve, box(-4, 4, -10, 10), { width: 801, height: 501 });
    assert(paths.length >= 2, expression);
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const axis = curve.axis === 'y' ? 'x' : 'y';
      for (const pole of poles) assert(!((path[i - 1][axis] < pole && path[i][axis] > pole) || (path[i][axis] < pole && path[i - 1][axis] > pole)), `${expression} bridged ${pole}`);
    }
  }
});

test('undefined domains and steep continuous curves remain finite and do not exhaust budgets', () => {
  const root = sampleExplicit(compileGraphExpression('y=sqrt(x)'), box(-4, 4, -2, 4));
  assert(root.length); assert(root.flat().every(p => p.x >= 0 && p.y >= 0 && Number.isFinite(p.y)));
  const logarithm = sampleExplicit(compileGraphExpression('y=ln(x)'), box());
  assert(logarithm.length); assert(logarithm.flat().every(p => p.x > 0));
  const steep = sampleExplicit(compileGraphExpression('y=1000*x'), box());
  assert(steep.length); assert(steep.flat().some(p => p.y < 0)); assert(steep.flat().some(p => p.y > 0));
});

test('marching squares approximates an implicit circle with finite, accurate contour bounds', () => {
  const segments = contourSegments(compileGraphExpression('x^2+y^2=9'), box(), { width: 800, height: 600 });
  assert(segments.length > 60);
  const points = segments.flat();
  for (const p of points) { assert(Number.isFinite(p.x) && Number.isFinite(p.y)); assert(Math.abs(p.x ** 2 + p.y ** 2 - 9) < .03); assert(Math.abs(p.x) <= 3.01 && Math.abs(p.y) <= 3.01); }
  for (const axis of ['x', 'y']) { assert(Math.max(...points.map(p => p[axis])) > 2.98); assert(Math.min(...points.map(p => p[axis])) < -2.98); }
});

test('marching squares handles saddle topology, exact grid zeros and nonfinite/pole cells', () => {
  const hyperbola = contourSegments(compileGraphExpression('x*y=1'), box());
  assert(hyperbola.length); assert(hyperbola.flat().every(p => p.x * p.y > 0));
  const saddle = contourSegments((x, y) => x * y, box(), { cellSize: 13 });
  assert(saddle.length); assert(saddle.flat().every(p => Math.abs(p.x * p.y) < .03));
  const line = contourSegments((x, y) => x + y, box());
  assert(line.length); line.flat().forEach(p => close(p.x + p.y, 0));
  const poles = contourSegments((x) => 1 / (x - .137), box());
  assert.equal(poles.length, 0, 'a pole is not a zero contour');
  assert.deepEqual(contourSegments(() => NaN, box()), []);
  let evaluations = 0;
  contourSegments((x, y) => { evaluations++; return x * x + y * y - 2; }, box(), { maxSamples: 500, width: 10000, height: 10000 });
  assert(evaluations <= 500);
});

test('contour convergence rejects shifted, rotated and scaled poles while retaining real zeros', () => {
  for (const coefficient of [1, -1, 1e-200, 1e200]) for (const denominator of [
    (x) => x - .137, (x, y) => y + .291, (x, y) => x + .37 * y - .137,
  ]) {
    const segments = contourSegments((x, y) => coefficient / denominator(x, y), box(), { width: 801, height: 503 });
    assert.equal(segments.length, 0, `coefficient ${coefficient}`);
  }
  assert.deepEqual(contourSegments(x => x < .137 ? -1 : 1, box()), [], 'a finite jump has no zero');
  const segments = contourSegments((x) => (x - .7) / (x - .137), box());
  assert(segments.length > 10);
  for (const point of segments.flat()) close(point.x, .7, 1e-4);
});
