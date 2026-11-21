/**
 * Dependency-free Euclidean geometry, usable in browsers and Node ESM.
 *
 * Measurements: { kind:'geometry', topic:'circle', operation:'area', radius:3 }.
 * Flat topics such as circle_area and cylinder_surface_area are also accepted.
 * Exact coordinate families (supplied finite numbers are exact decimal inputs):
 * transform {point:[x,y], transformation:'translation', dx,dy}, or vertices
 * instead of point; reflection uses axis x, y, y=x, or y=-x; rotation uses
 * degrees 0, 90, 180, or 270 about center; dilation uses positive factor and
 * optional center. circle_relation {center, radius, point} classifies a point;
 * circle_tangent with the same fields finds the tangent at a point on it.
 * line_relation {line1:[[x,y],[x,y]], line2:[[x,y],[x,y]]} classifies two
 * infinite lines and returns their unique intersection when one exists.
 * triangle_similarity {triangle1:[[x,y],...], triangle2:[[x,y],...]}
 * compares the three corresponding vertices in the listed order.
 * circle_arc / circle_sector {radius, centralAngle} use degrees in [0,360]
 * and return exact rational multiples of pi. special_right_triangle
 * {pattern:'30-60-90'|'45-45-90', knownSide, length} uses the named triangle
 * as a supplied hypothesis; knownSide is short_leg, long_leg, hypotenuse for
 * 30-60-90, or leg, hypotenuse for 45-45-90.
 * perpendicular_bisector {points:[[x,y],[x,y]]} and circumcircle with
 * three noncollinear points return exact coordinate constructions.
 * Numeric values are approximations; `exact` contains an unevaluated exact
 * expression in the supplied decimal inputs. Reported angles are in degrees;
 * trigonometric arguments such as pi/n are in radians.
 *
 * Proof facts (point names are case-sensitive strings):
 * triangle [A,B,C]; segment_equal [A,B,C,D]; angle_equal [A,B,C,D,E,F];
 * triangle_congruent [[A,B,C],[D,E,F]]; midpoint [M,A,B];
 * between [A,M,B]; collinear [A,B,C]; parallel [A,B,C,D];
 * right_angle [A,B,C]; supplementary [[A,B,C],[D,E,F]].
 * perpendicular [A,B,C,D] asserts two nonzero perpendicular lines;
 * circle_tangent_at [O,P,Q] asserts PQ tangent at P to the circle centered O;
 * inscribed_same_arc [[A,B,C],[A,E,C]] asserts both inscribed angles
 * intercept the same arc of one circle (the endpoint pair must match).
 * pythagorean_relation [A,B,C] asserts AB² + BC² = AC².
 * triangle_similar [[A,B,C],[D,E,F]] fixes corresponding vertex order;
 * segment_ratio_equal [A,B,D,E,B,C,E,F] asserts AB/DE = BC/EF.
 * vertical_angles / linear_pair take two angle triples. Parallel position
 * facts alternate_interior_angles / corresponding_angles /
 * same_side_interior_angles take [angle1,angle2,line1,line2]. They explicitly
 * assert the transversal's positions; no positions are inferred from names.
 * Congruence rules require explicit `triangle` premises for both triangles.
 * Premises reference givens as 'g0' and earlier steps as 's0' (zero-based), or
 * use an already established fact object. Integer references index givens
 * followed by earlier steps. Only listed premises are available to a rule.
 */

const VERSION = 1;
const EXACT_TOPICS = new Set(['transform', 'circle_relation', 'circle_tangent', 'line_relation', 'triangle_similarity', 'perpendicular_bisector', 'circumcircle']);
const EXACT_SYMBOLIC_TOPICS = new Set(['circle_arc', 'circle_sector', 'special_right_triangle']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const alias = (table, key) => own(table, key) ? table[key] : key;
const isObject = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const token = s => String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const expr = n => String(Object.is(n, -0) ? 0 : n);
const sq = n => `(${expr(n)})^2`;
const sum = ns => ns.map(n => `(${expr(n)})`).join(' + ');

class GeometryError extends Error {}
function requireThat(condition, message) {
  if (!condition) throw new GeometryError(message);
}
function number(value, name, { positive = false } = {}) {
  requireThat(typeof value === 'number' && Number.isFinite(value), `${name} must be a finite number.`);
  requireThat(!positive || value > 0, `${name} must be positive.`);
  return Object.is(value, -0) ? 0 : value;
}
const positive = (v, name) => number(v, name, { positive: true });
function measurement(value, exact, unit) {
  requireThat(Number.isFinite(value), 'The requested calculation exceeds the finite numerical range.');
  return { value: Object.is(value, -0) ? 0 : value, exact, approximate: true, ...(unit ? { unit } : {}) };
}
function result(status, topic, answer, steps = [], error) {
  const exact = EXACT_TOPICS.has(topic);
  const symbolic = EXACT_SYMBOLIC_TOPICS.has(topic);
  return {
    status, verified: status === 'solved', topic, answer, steps, restrictions: [],
    certificate: {
      version: VERSION,
      method: topic === 'proof' ? 'explicit-euclidean-rules' : exact ? 'exact-rational-recomputation' : symbolic ? 'exact-symbolic-recomputation' : 'formula-recomputation',
      assurance: topic === 'proof' ? 'symbolic-rule-check' : exact ? 'exact-rational-check' : symbolic ? 'exact-symbolic-check' : 'numerical-formula-check',
      ...(status === 'solved' && topic !== 'proof' ? {
        numericValues: 'approximate',
        exactExpressions: exact ? 'Reduced rational values of supplied finite decimal inputs; predicates are checked with exact rational arithmetic.' : symbolic ? 'Reduced rational coefficients of exact pi or square-root constants from supplied finite decimal inputs.' : 'Unevaluated expressions in supplied decimal inputs; pi is exact, trig arguments in radians, reported angles in degrees.',
      } : {}),
    },
    ...(error ? { error } : {}),
  };
}
function solved(topic, input, answer, rule, explanation) {
  return result('solved', topic, answer, [{ before: input, after: answer, rule, explanation, verified: true }]);
}
function point(value, name) {
  const a = Array.isArray(value) ? value : isObject(value) ? [value.x, value.y] : [];
  requireThat(a.length === 2, `${name} must be [x,y] or {x,y}.`);
  return [number(a[0], `${name}.x`), number(a[1], `${name}.y`)];
}
function points(input) {
  if (own(input, 'points')) {
    requireThat(Array.isArray(input.points) && input.points.length === 2, 'Exactly two points are required.');
    return input.points.map((p, i) => point(p, `points[${i}]`));
  }
  return [point(input.p1 ?? input.from, 'p1'), point(input.p2 ?? input.to, 'p2')];
}
function triangleSides(input) {
  const values = input.sides ?? [input.a, input.b, input.c];
  requireThat(Array.isArray(values) && values.length === 3, 'Exactly three triangle sides are required.');
  const sides = values.map((v, i) => positive(v, `side ${i + 1}`));
  const [a, b, c] = [...sides].sort((x, y) => x - y);
  requireThat(compareDecimalSum([a, b], c) > 0, 'Triangle sides must satisfy the strict triangle inequality.');
  return sides;
}
function radius(input) {
  const r = input.radius ?? input.r;
  const d = input.diameter;
  if (r !== undefined && d !== undefined) {
    positive(r, 'radius'); positive(d, 'diameter');
    requireThat(r * 2 === d, 'Radius and diameter disagree.');
  }
  return positive(r ?? (d === undefined ? undefined : positive(d, 'diameter') / 2), 'radius');
}
function operation(input, allowed, fallback = 'all') {
  let op = token(input.operation ?? input.measure ?? fallback);
  if (op === 'surface' || op === 'surfacearea') op = 'surface_area';
  if (op === 'circumference') op = 'perimeter';
  requireThat(op === 'all' || allowed.includes(op), `Operation must be ${allowed.join(', ')} or all.`);
  return op;
}
const needs = (op, name) => op === 'all' || op === name;

function shape2d(input, topic) {
  const op = operation(input, ['area', 'perimeter']);
  const answer = {};
  let rule;
  if (topic === 'circle') {
    const r = radius(input);
    if (needs(op, 'area')) answer.area = measurement(Math.PI * r * r, `pi * ${sq(r)}`);
    if (needs(op, 'perimeter')) answer.perimeter = measurement(2 * Math.PI * r, `2 * pi * (${expr(r)})`);
    rule = 'circle_measurement';
  } else if (topic === 'rectangle') {
    const l = positive(input.length ?? input.a, 'length');
    const w = positive(input.width ?? input.b, 'width');
    if (needs(op, 'area')) answer.area = measurement(l * w, `(${expr(l)}) * (${expr(w)})`);
    if (needs(op, 'perimeter')) answer.perimeter = measurement(2 * (l + w), `2 * (${sum([l, w])})`);
    rule = 'rectangle_measurement';
  } else if (topic === 'triangle') {
    const hasSides = input.sides !== undefined || [input.a, input.b, input.c].some(v => v !== undefined);
    const sides = hasSides ? triangleSides(input) : null;
    if (needs(op, 'area')) {
      if (sides) {
        const [scale, middle, smallest] = [...sides].sort((x, y) => y - x);
        const a = 1, b = middle / scale, c = smallest / scale;
        // Kahan's rearrangement of Heron's formula avoids avoidable cancellation.
        const area = Math.sqrt((a + (b + c)) * (c - (a - b)) * (c + (a - b)) * (a + (b - c))) / 4 * scale * scale;
        const s = `((${sum(sides)}) / 2)`;
        answer.area = measurement(area, `sqrt(${s} * (${s} - (${expr(sides[0])})) * (${s} - (${expr(sides[1])})) * (${s} - (${expr(sides[2])})))`);
      } else {
        const b = positive(input.base, 'base');
        const h = positive(input.height, 'height');
        answer.area = measurement(b * h / 2, `(${expr(b)}) * (${expr(h)}) / 2`);
      }
    }
    if (needs(op, 'perimeter')) {
      requireThat(sides, 'Triangle perimeter requires three sides.');
      answer.perimeter = measurement(sides.reduce((a, b) => a + b, 0), sum(sides));
    }
    rule = sides ? 'heron_and_triangle_perimeter' : 'triangle_base_height';
  } else if (topic === 'trapezoid') {
    const b1 = positive(input.base1 ?? input.a, 'base1');
    const b2 = positive(input.base2 ?? input.b, 'base2');
    const h = positive(input.height, 'height');
    if (needs(op, 'area')) answer.area = measurement((b1 + b2) * h / 2, `(${sum([b1, b2])}) * (${expr(h)}) / 2`);
    if (needs(op, 'perimeter') || input.leg1 !== undefined || input.leg2 !== undefined || input.c !== undefined || input.d !== undefined) {
      const l1 = positive(input.leg1 ?? input.c, 'leg1');
      const l2 = positive(input.leg2 ?? input.d, 'leg2');
      requireThat(l1 >= h && l2 >= h, 'Trapezoid legs cannot be shorter than its height.');
      const x1 = Math.sqrt((l1 - h) * (l1 + h));
      const x2 = Math.sqrt((l2 - h) * (l2 + h));
      const diff = Math.abs(b1 - b2);
      const close = (x, y) => Math.abs(x - y) <= 1e-10 * Math.max(b1, b2, l1, l2, h);
      requireThat(close(diff, x1 + x2) || close(diff, Math.abs(x1 - x2)), 'Trapezoid bases, legs, and height are inconsistent.');
      if (needs(op, 'perimeter')) answer.perimeter = measurement(b1 + b2 + l1 + l2, sum([b1, b2, l1, l2]));
    }
    rule = 'trapezoid_measurement';
  } else {
    const n = number(input.n ?? input.sides, 'n');
    requireThat(Number.isSafeInteger(n) && n >= 3 && n <= 1000000, 'A regular polygon needs an integer n between 3 and 1000000.');
    const s = positive(input.side ?? input.sideLength, 'side');
    if (needs(op, 'area')) answer.area = measurement(n * s * s / (4 * Math.tan(Math.PI / n)), `${n} * ${sq(s)} / (4 * tan(pi / ${n}))`);
    if (needs(op, 'perimeter')) answer.perimeter = measurement(n * s, `${n} * (${expr(s)})`);
    rule = 'regular_polygon_measurement';
  }
  requireThat(Object.values(answer).every(m => m.value > 0), 'The measurement is below the supported numerical range.');
  return solved(topic, input, answer, rule, 'Substitute the supplied dimensions into the Euclidean measurement formulas. Numeric values are approximate.');
}

function shape3d(input, topic) {
  const op = operation(input, ['volume', 'surface_area']);
  const answer = {};
  if (topic === 'prism') {
    const h = positive(input.height, 'height');
    let area, perimeter, areaExact, perimeterExact;
    if (input.length !== undefined || input.width !== undefined) {
      const l = positive(input.length, 'length');
      const w = positive(input.width, 'width');
      area = l * w; perimeter = 2 * (l + w);
      areaExact = `(${expr(l)}) * (${expr(w)})`;
      perimeterExact = `2 * (${sum([l, w])})`;
    } else {
      area = positive(input.baseArea, 'baseArea'); areaExact = expr(area);
      if (needs(op, 'surface_area')) {
        perimeter = positive(input.basePerimeter, 'basePerimeter'); perimeterExact = expr(perimeter);
        requireThat(area <= perimeter * perimeter / (4 * Math.PI) * (1 + 1e-12), 'Base area and perimeter violate the isoperimetric bound.');
      }
    }
    if (needs(op, 'volume')) answer.volume = measurement(area * h, `(${areaExact}) * (${expr(h)})`);
    if (needs(op, 'surface_area')) answer.surfaceArea = measurement(2 * area + perimeter * h, `2 * (${areaExact}) + (${perimeterExact}) * (${expr(h)})`);
  } else {
    const r = radius(input);
    if (topic === 'sphere') {
      if (needs(op, 'volume')) answer.volume = measurement(4 / 3 * Math.PI * r * r * r, `4 * pi * (${expr(r)})^3 / 3`);
      if (needs(op, 'surface_area')) answer.surfaceArea = measurement(4 * Math.PI * r * r, `4 * pi * ${sq(r)}`);
    } else {
      const h = positive(input.height, 'height');
      const cone = topic === 'cone';
      if (needs(op, 'volume')) answer.volume = measurement(Math.PI * r * r * h / (cone ? 3 : 1), `pi * ${sq(r)} * (${expr(h)})${cone ? ' / 3' : ''}`);
      if (needs(op, 'surface_area')) answer.surfaceArea = cone
        ? measurement(Math.PI * r * (r + Math.hypot(r, h)), `pi * (${expr(r)}) * ((${expr(r)}) + sqrt(${sq(r)} + ${sq(h)}))`)
        : measurement(2 * Math.PI * r * (r + h), `2 * pi * (${expr(r)}) * (${sum([r, h])})`);
    }
  }
  requireThat(Object.values(answer).every(m => m.value > 0), 'The measurement is below the supported numerical range.');
  const output = solved(topic, input, answer, `${topic}_measurement`, 'Apply the standard solid formulas; surface area includes all bases. Numeric values are approximate.');
  if (topic === 'prism') output.restrictions.push('The prism is right, with congruent parallel bases; base dimensions are supplied assumptions.');
  if (topic === 'cone' || topic === 'cylinder') output.restrictions.push('A right circular solid is assumed.');
  return output;
}

function triangleAngles(input) {
  const angles = input.angles ?? [input.A, input.B, input.C];
  requireThat(Array.isArray(angles) && angles.length === 3, 'angles must contain three entries, with null for one unknown.');
  const missing = [];
  let total = 0;
  angles.forEach((a, i) => {
    if (a === null || a === undefined) missing.push(i);
    else { positive(a, `angle ${i + 1}`); requireThat(a < 180, 'Triangle angles must be less than 180 degrees.'); total += a; }
  });
  requireThat(missing.length <= 1, 'At least two triangle angles are required.');
  if (!missing.length) requireThat(rationalSumEquals(angles, 180), 'Triangle angles must sum to exactly 180 degrees.');
  else requireThat(compareDecimalSum(angles.filter(a => a != null), 180) < 0 && total < 180, 'Known triangle angles must sum to less than 180 degrees within the supported numerical range.');
  const exact = `180 - (${sum(angles.filter(a => a != null))})`;
  const values = angles.map((a, i) => measurement(a ?? 180 - total, i === missing[0] ? exact : expr(a), 'degrees'));
  return solved('triangle_angles', input, { angles: values, missingIndex: missing[0] ?? null }, 'triangle_angle_sum', 'Interior angles of a nondegenerate Euclidean triangle sum to 180 degrees.');
}

function pythagoras(input) {
  const vals = [input.a, input.b, input.c];
  const missing = vals.map((v, i) => v == null ? i : -1).filter(i => i !== -1);
  requireThat(missing.length === 1, 'Supply exactly two of a, b, c; c is the hypotenuse.');
  vals.forEach((v, i) => { if (v != null) positive(v, ['a', 'b', 'c'][i]); });
  const index = missing[0];
  let value, exact;
  if (index === 2) {
    value = Math.hypot(vals[0], vals[1]); exact = `sqrt(${sq(vals[0])} + ${sq(vals[1])})`;
  } else {
    const leg = vals[1 - index]; const c = vals[2];
    requireThat(c > leg, 'The hypotenuse must be longer than either leg.');
    value = Math.sqrt(c - leg) * Math.sqrt(c) * Math.sqrt(1 + leg / c); exact = `sqrt(${sq(c)} - ${sq(leg)})`;
  }
  requireThat(value > 0, 'The missing side must be positive.');
  const output = solved('pythagoras', input, { missing: ['a', 'b', 'c'][index], side: measurement(value, exact), sides: vals.map((v, i) => measurement(v ?? value, i === index ? exact : expr(v))) }, 'pythagorean_theorem', 'For a right triangle, a² + b² = c², with c the hypotenuse.');
  output.restrictions.push('The triangle is assumed to have a right angle between a and b.');
  return output;
}

function coordinate(input, topic) {
  const [[x1, y1], [x2, y2]] = points(input);
  const dx = x2 - x1, dy = y2 - y1;
  const dxE = `((${expr(x2)}) - (${expr(x1)}))`, dyE = `((${expr(y2)}) - (${expr(y1)}))`;
  let answer;
  if (topic === 'distance') answer = { distance: measurement(Math.hypot(dx, dy), `sqrt(${dxE}^2 + ${dyE}^2)`) };
  else if (topic === 'midpoint') answer = { midpoint: [measurement(x1 / 2 + x2 / 2, `(${sum([x1, x2])}) / 2`), measurement(y1 / 2 + y2 / 2, `(${sum([y1, y2])}) / 2`)] };
  else {
    requireThat(dx !== 0 || dy !== 0, 'Distinct points are required to determine a slope or line.');
    if (topic === 'slope') answer = { slope: dx === 0 ? null : measurement(dy / dx, `${dyE} / ${dxE}`), vertical: dx === 0 };
    else {
      answer = {
        // The point-normal form avoids overflowing x1*y2 - x2*y1.
        form: 'point-normal',
        normal: [measurement(dy, dyE), measurement(-dx, `-${dxE}`)],
        point: [x1, y1],
        equation: `${dyE} * (x - (${expr(x1)})) - ${dxE} * (y - (${expr(y1)})) = 0`,
        vertical: dx === 0,
      };
    }
  }
  return solved(topic, input, answer, `coordinate_${topic}`, 'Apply the Cartesian coordinate formula to the two supplied points.');
}

function circleEquation(input) {
  const [h, k] = point(input.center, 'center');
  const r = radius(input);
  requireThat(r * r > 0, 'The squared radius is below the supported numerical range.');
  return solved('circle_equation', input, {
    center: [h, k], radius: measurement(r, expr(r)), radiusSquared: measurement(r * r, sq(r)),
    equation: `(x - (${expr(h)}))^2 + (y - (${expr(k)}))^2 = ${sq(r)}`,
  }, 'circle_standard_equation', 'Points at distance r from (h,k) satisfy (x-h)² + (y-k)² = r².');
}

function similarity(input) {
  let scale = input.scaleFactor ?? input.scale;
  let exact;
  if (scale === undefined) {
    const source = positive(input.knownOriginal, 'knownOriginal');
    const image = positive(input.knownImage, 'knownImage');
    scale = image / source; exact = `(${expr(image)}) / (${expr(source)})`;
  } else { positive(scale, 'scaleFactor'); exact = expr(scale); }
  const side = positive(input.originalLength ?? input.side, 'originalLength');
  requireThat(scale > 0 && side * scale > 0 && scale * scale > 0 && scale ** 3 > 0, 'The similarity calculation is below the supported numerical range.');
  const output = solved('similarity', input, {
    scaleFactor: measurement(scale, exact), length: measurement(side * scale, `(${expr(side)}) * (${exact})`),
    areaFactor: measurement(scale * scale, `(${exact})^2`), volumeFactor: measurement(scale ** 3, `(${exact})^3`),
  }, 'similarity_scale', 'Corresponding lengths scale by k, areas by k², and volumes by k³.');
  output.restrictions.push('The figures are assumed similar and the supplied lengths corresponding.');
  return output;
}

function relatedAngle(input) {
  const a = positive(input.angle, 'angle');
  requireThat(a < 180, 'angle must be less than 180 degrees.');
  const relation = token(input.relationship ?? input.relation);
  const parallel = ['corresponding', 'alternate_interior', 'alternate_exterior', 'same_side_interior', 'consecutive_interior'];
  if (parallel.includes(relation)) requireThat(input.parallel === true, 'This angle relationship requires the explicit parallel: true hypothesis.');
  let value, exact;
  if (relation === 'complementary') { requireThat(a < 90, 'A complementary angle must be smaller than 90 degrees.'); value = 90 - a; exact = `90 - (${expr(a)})`; }
  else if (['supplementary', 'linear_pair', 'same_side_interior', 'consecutive_interior'].includes(relation)) { value = 180 - a; exact = `180 - (${expr(a)})`; }
  else if (['vertical', 'corresponding', 'alternate_interior', 'alternate_exterior'].includes(relation)) { value = a; exact = expr(a); }
  else return result('unsupported', 'angles', {}, [], 'Unsupported angle relationship.');
  const output = solved('angles', input, { angle: measurement(value, exact, 'degrees') }, relation, 'Use the explicitly supplied angle relationship.');
  output.restrictions.push('The named angle relationship is a supplied hypothesis.');
  return output;
}

/** A small exact decimal arithmetic check, used only for supplied angle sums. */
function decimalFraction(n) {
  const [mantissa, exp = '0'] = String(n).toLowerCase().split('e');
  const parts = mantissa.split('.');
  const digits = parts.join('');
  const power = Number(exp) - (parts[1]?.length ?? 0);
  return power >= 0 ? [BigInt(digits) * 10n ** BigInt(power), 1n] : [BigInt(digits), 10n ** BigInt(-power)];
}
function rationalSumEquals(values, target) {
  return compareDecimalSum(values, target) === 0;
}
function compareDecimalSum(values, target) {
  let numerator = 0n, denominator = 1n;
  for (const v of values) { const [n, d] = decimalFraction(v); numerator = numerator * d + n * denominator; denominator *= d; }
  const [n, d] = decimalFraction(target);
  const left = numerator * d, right = n * denominator;
  return left === right ? 0 : left < right ? -1 : 1;
}

// Finite JavaScript numbers are interpreted as their printed decimal values.
// All predicates and exact coordinates below use reduced BigInt fractions.
function rational(n, d = 1n) {
  requireThat(d !== 0n, 'A rational denominator cannot be zero.');
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return { n: n / a, d: d / a };
}
const decimalRational = n => rational(...decimalFraction(n));
const addR = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const subR = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const mulR = (a, b) => rational(a.n * b.n, a.d * b.d);
const divR = (a, b) => rational(a.n * b.d, a.d * b.n);
const equalR = (a, b) => a.n * b.d === b.n * a.d;
const compareR = (a, b) => { const diff = a.n * b.d - b.n * a.d; return diff < 0n ? -1 : diff > 0n ? 1 : 0; };
const exactR = a => a.d === 1n ? String(a.n) : `${a.n}/${a.d}`;
function valueR(a) {
  if (a.n === 0n) return 0;
  const digits = (a.n < 0n ? -a.n : a.n).toString(), divisor = a.d.toString();
  const numerator = Number(digits.slice(0, 17)) / 10 ** (Math.min(17, digits.length) - 1);
  const denominator = Number(divisor.slice(0, 17)) / 10 ** (Math.min(17, divisor.length) - 1);
  return Number(`${a.n < 0n ? '-' : ''}${numerator / denominator}e${digits.length - divisor.length}`);
}
function rationalMeasurement(a) {
  const value = valueR(a);
  requireThat(Number.isFinite(value) && (a.n === 0n || value !== 0), 'The exact result is outside the supported numerical range.');
  return measurement(value, exactR(a));
}
function exactRadius(input) {
  const supplied = [input.radius, input.r].filter(v => v !== undefined);
  const radii = supplied.map(v => decimalRational(positive(v, 'radius')));
  if (radii.length === 2) requireThat(equalR(radii[0], radii[1]), 'Radius aliases disagree.');
  const diameter = input.diameter === undefined ? null : decimalRational(positive(input.diameter, 'diameter'));
  if (radii.length && diameter) requireThat(equalR(mulR(radii[0], rational(2n)), diameter), 'Radius and diameter disagree.');
  requireThat(radii.length || diameter, 'A positive radius or diameter is required.');
  return radii[0] ?? divR(diameter, rational(2n));
}
function piMeasurement(coefficient) {
  const value = valueR(coefficient) * Math.PI;
  requireThat(Number.isFinite(value) && (coefficient.n === 0n || value > 0), 'The pi measurement is outside the supported numerical range.');
  return measurement(value, coefficient.n === 0n ? '0' : coefficient.d === 1n && coefficient.n === 1n ? 'pi' : `(${exactR(coefficient)}) * pi`);
}
function radicalMeasurement(coefficient, root = 1) {
  const value = valueR(coefficient) * Math.sqrt(root);
  requireThat(Number.isFinite(value) && value > 0, 'The radical measurement is outside the supported numerical range.');
  return measurement(value, root === 1 ? exactR(coefficient) : `(${exactR(coefficient)}) * sqrt(${root})`);
}
function rationalPoint(raw, name) { return point(raw, name).map(decimalRational); }
const subPoint = (a, b) => [subR(a[0], b[0]), subR(a[1], b[1])];
const crossR = (a, b) => subR(mulR(a[0], b[1]), mulR(a[1], b[0]));
const dotR = (a, b) => addR(mulR(a[0], b[0]), mulR(a[1], b[1]));
const squaredR = a => dotR(a, a);
const pointMeasurements = a => a.map(rationalMeasurement);
function exactPoints(input, count) {
  requireThat(Array.isArray(input.points) && input.points.length === count, `Exactly ${count} points are required.`);
  return input.points.map((p, i) => rationalPoint(p, `points[${i}]`));
}

function perpendicularBisector(input) {
  const [a, b] = exactPoints(input, 2), normal = subPoint(b, a);
  requireThat(normal.some(c => c.n !== 0n), 'The two points must be distinct.');
  const midpoint = [0, 1].map(i => divR(addR(a[i], b[i]), rational(2n)));
  const equation = `(${exactR(normal[0])}) * (x - (${exactR(midpoint[0])})) + (${exactR(normal[1])}) * (y - (${exactR(midpoint[1])})) = 0`;
  return solved('perpendicular_bisector', input, { midpoint: pointMeasurements(midpoint), normal: pointMeasurements(normal), equation },
    'perpendicular_bisector_exact', 'The perpendicular bisector passes through the exact midpoint with the original segment as its normal.');
}

function circumcircle(input) {
  const [a, b, c] = exactPoints(input, 3), u = subPoint(b, a), v = subPoint(c, a);
  const determinant = crossR(u, v);
  requireThat(determinant.n !== 0n, 'Three noncollinear points are required for a unique circumcircle.');
  const half = rational(2n);
  const midpointAB = [0, 1].map(i => divR(addR(a[i], b[i]), half));
  const midpointAC = [0, 1].map(i => divR(addR(a[i], c[i]), half));
  const rhs1 = dotR(u, midpointAB), rhs2 = dotR(v, midpointAC);
  const center = [
    divR(subR(mulR(rhs1, v[1]), mulR(u[1], rhs2)), determinant),
    divR(subR(mulR(u[0], rhs2), mulR(rhs1, v[0])), determinant),
  ];
  const radiusSquared = squaredR(subPoint(center, a));
  const equation = `(x - (${exactR(center[0])}))^2 + (y - (${exactR(center[1])}))^2 = ${exactR(radiusSquared)}`;
  return solved('circumcircle', input, { center: pointMeasurements(center), radiusSquared: rationalMeasurement(radiusSquared), equation },
    'circumcircle_exact', 'Intersect two exact perpendicular bisectors of the triangle sides; the common squared distance is the radius squared.');
}

function circleArcSector(input, topic) {
  const r = exactRadius(input), degrees = decimalRational(number(input.centralAngle, 'centralAngle'));
  requireThat(compareR(degrees, rational(0n)) >= 0 && compareR(degrees, rational(360n)) <= 0, 'centralAngle must be between 0 and 360 degrees.');
  const arcCoefficient = divR(mulR(r, degrees), rational(180n));
  const answer = { arcLength: piMeasurement(arcCoefficient) };
  if (topic === 'circle_sector') answer.area = piMeasurement(divR(mulR(mulR(r, r), degrees), rational(360n)));
  return solved(topic, input, answer, topic === 'circle_arc' ? 'arc_length_exact' : 'sector_area_exact', 'An arc is theta/360 of the circumference and a sector is theta/360 of the disk; reduce their rational pi coefficients exactly.');
}

function specialRightTriangle(input) {
  requireThat(typeof input.pattern === 'string' && input.pattern.trim(), 'pattern is required.');
  requireThat(typeof input.knownSide === 'string' && input.knownSide.trim(), 'knownSide is required.');
  const pattern = token(input.pattern), known = token(input.knownSide);
  if (!['30_60_90', '45_45_90'].includes(pattern)) return result('unsupported', 'special_right_triangle', {}, [], 'Supported patterns are 30-60-90 and 45-45-90.');
  const roles = pattern === '30_60_90' ? ['short_leg', 'long_leg', 'hypotenuse'] : ['leg', 'hypotenuse'];
  if (!roles.includes(known)) return result('unsupported', 'special_right_triangle', {}, [], 'Unsupported known side for this pattern.');
  const length = decimalRational(positive(input.length, 'length'));
  const two = rational(2n), three = rational(3n);
  let answer;
  if (pattern === '30_60_90') {
    const short = known === 'short_leg' ? [length, 1] : known === 'hypotenuse' ? [divR(length, two), 1] : [divR(length, three), 3];
    const long = known === 'long_leg' ? [length, 1] : [short[0], 3];
    const hyp = known === 'hypotenuse' ? [length, 1] : [mulR(short[0], two), short[1]];
    answer = { shortLeg: radicalMeasurement(...short), longLeg: radicalMeasurement(...long), hypotenuse: radicalMeasurement(...hyp) };
  } else {
    const leg = known === 'leg' ? [length, 1] : [divR(length, two), 2];
    answer = { leg1: radicalMeasurement(...leg), leg2: radicalMeasurement(...leg), hypotenuse: known === 'hypotenuse' ? radicalMeasurement(length) : radicalMeasurement(length, 2) };
  }
  const output = solved('special_right_triangle', input, answer, `${pattern}_side_ratios`, 'Use the exact 1:sqrt(3):2 or 1:1:sqrt(2) side ratio of the supplied right-triangle pattern.');
  output.restrictions.push('The named right-triangle angle pattern and the supplied side role are assumptions.');
  return output;
}

function transform(input) {
  const single = own(input, 'point');
  requireThat(single !== own(input, 'vertices'), 'Supply either point or vertices.');
  const source = single ? [rationalPoint(input.point, 'point')] : (() => {
    requireThat(Array.isArray(input.vertices) && input.vertices.length >= 1 && input.vertices.length <= 1000, 'vertices must contain 1 to 1000 points.');
    return input.vertices.map((p, i) => rationalPoint(p, `vertices[${i}]`));
  })();
  const zero = rational(0n), center = input.center === undefined ? [zero, zero] : rationalPoint(input.center, 'center');
  const kind = token(input.transformation ?? input.operation);
  let apply, restriction;
  if (kind === 'translation') {
    requireThat(input.center === undefined, 'Translation does not use a center.');
    const dx = decimalRational(number(input.dx, 'dx')), dy = decimalRational(number(input.dy, 'dy'));
    apply = p => [addR(p[0], dx), addR(p[1], dy)];
  } else if (kind === 'reflection') {
    const axis = String(input.axis ?? '').toLowerCase().replace(/\s+/g, '');
    const reflect = { x: ([x, y]) => [x, rational(-y.n, y.d)], y: ([x, y]) => [rational(-x.n, x.d), y], 'y=x': ([x, y]) => [y, x], 'y=-x': ([x, y]) => [rational(-y.n, y.d), rational(-x.n, x.d)] };
    if (!own(reflect, axis)) return result('unsupported', 'transform', {}, [], 'Supported reflection axes are x, y, y=x, and y=-x.');
    requireThat(input.center === undefined, 'Reflection axes pass through the origin; center is not applicable.');
    apply = reflect[axis]; restriction = 'The reflection axis passes through the origin.';
  } else if (kind === 'rotation') {
    const degrees = number(input.degrees, 'degrees');
    if (!Number.isSafeInteger(degrees) || degrees % 90 !== 0) return result('unsupported', 'transform', {}, [], 'Only rotations by whole multiples of 90 degrees are supported.');
    const quarter = ((degrees / 90) % 4 + 4) % 4;
    apply = p => {
      const [x, y] = subPoint(p, center), neg = a => rational(-a.n, a.d);
      const rotated = quarter === 0 ? [x, y] : quarter === 1 ? [neg(y), x] : quarter === 2 ? [neg(x), neg(y)] : [y, neg(x)];
      return [addR(center[0], rotated[0]), addR(center[1], rotated[1])];
    };
    restriction = 'Positive rotation is counterclockwise; only whole quarter turns are supported.';
  } else if (kind === 'dilation') {
    const factor = decimalRational(positive(input.factor ?? input.scaleFactor, 'factor'));
    apply = p => [0, 1].map(i => addR(center[i], mulR(factor, subR(p[i], center[i]))));
    restriction = 'A positive scale factor preserves orientation.';
  } else return result('unsupported', 'transform', {}, [], 'Unsupported transformation.');
  const images = source.map(p => pointMeasurements(apply(p)));
  const output = solved('transform', input, single ? { image: images[0] } : { images }, `${kind}_exact`, 'Apply the transformation to each coordinate using exact decimal rational arithmetic.');
  if (restriction) output.restrictions.push(restriction);
  return output;
}

function circleRelation(input) {
  const center = rationalPoint(input.center, 'center'), p = rationalPoint(input.point, 'point');
  const r = decimalRational(radius(input));
  const distanceSquared = squaredR(subPoint(p, center)), radiusSquared = mulR(r, r);
  const comparison = compareR(distanceSquared, radiusSquared);
  return solved('circle_relation', input, {
    position: comparison < 0 ? 'inside' : comparison > 0 ? 'outside' : 'on',
    distanceSquared: rationalMeasurement(distanceSquared), radiusSquared: rationalMeasurement(radiusSquared),
    power: rationalMeasurement(subR(distanceSquared, radiusSquared)),
  }, 'circle_power_exact', 'Compare the exact squared distance to the exact squared radius.');
}

function circleTangent(input) {
  const center = rationalPoint(input.center, 'center'), p = rationalPoint(input.point, 'point');
  const r = decimalRational(radius(input)), normal = subPoint(p, center);
  requireThat(equalR(squaredR(normal), mulR(r, r)), 'The tangent point must lie exactly on the circle.');
  const equation = `(${exactR(normal[0])}) * (x - (${exactR(p[0])})) + (${exactR(normal[1])}) * (y - (${exactR(p[1])})) = 0`;
  return solved('circle_tangent', input, {
    point: pointMeasurements(p), normal: pointMeasurements(normal), equation,
  }, 'circle_tangent_exact', 'At a point on a circle, the tangent is perpendicular to the radius; its exact normal is point minus center.');
}

function lineRelation(input) {
  const line = (raw, name) => {
    requireThat(Array.isArray(raw) && raw.length === 2, `${name} requires two points.`);
    return raw.map((p, i) => rationalPoint(p, `${name}[${i}]`));
  };
  const [p, p2] = line(input.line1, 'line1'), [q, q2] = line(input.line2, 'line2');
  const u = subPoint(p2, p), v = subPoint(q2, q);
  requireThat(u.some(c => c.n !== 0n) && v.some(c => c.n !== 0n), 'Each line requires distinct points.');
  const determinant = crossR(u, v), dot = dotR(u, v);
  let relation, intersection = null;
  if (determinant.n === 0n) relation = crossR(subPoint(q, p), u).n === 0n ? 'coincident' : 'parallel';
  else {
    relation = dot.n === 0n ? 'perpendicular' : 'intersecting';
    const t = divR(crossR(subPoint(q, p), v), determinant);
    intersection = pointMeasurements([addR(p[0], mulR(t, u[0])), addR(p[1], mulR(t, u[1]))]);
  }
  return solved('line_relation', input, { relation, intersection, determinantExact: exactR(determinant), dotProductExact: exactR(dot) }, 'line_relation_exact', 'Use exact cross and dot products; solve the two line equations when their determinant is nonzero.');
}

function triangleSimilarity(input) {
  const triangle = (raw, name) => {
    requireThat(Array.isArray(raw) && raw.length === 3, `${name} requires three vertices.`);
    const p = raw.map((v, i) => rationalPoint(v, `${name}[${i}]`));
    requireThat(crossR(subPoint(p[1], p[0]), subPoint(p[2], p[0])).n !== 0n, `${name} must be nondegenerate.`);
    return p;
  };
  const a = triangle(input.triangle1, 'triangle1'), b = triangle(input.triangle2, 'triangle2');
  const lengths = p => [[0, 1], [1, 2], [2, 0]].map(([i, j]) => squaredR(subPoint(p[i], p[j])));
  const aa = lengths(a), bb = lengths(b), ratio = divR(bb[0], aa[0]);
  const similar = [1, 2].every(i => equalR(bb[i], mulR(ratio, aa[i])));
  const scale = Math.sqrt(valueR(ratio));
  requireThat(!similar || Number.isFinite(scale) && scale > 0, 'The scale factor is outside the supported numerical range.');
  const output = solved('triangle_similarity', input, {
    similar,
    scaleFactor: similar ? measurement(scale, `sqrt(${exactR(ratio)})`) : null,
    areaFactor: similar ? rationalMeasurement(ratio) : null,
  }, 'sss_similarity_exact', 'Compare corresponding squared side ratios exactly; a common positive ratio proves SSS similarity.');
  output.restrictions.push('Vertices correspond in their supplied order; both triangles must be nondegenerate.');
  return output;
}

const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const factAliases = { congruent_segments: 'segment_equal', equal_segments: 'segment_equal', congruent_angles: 'angle_equal', equal_angles: 'angle_equal', congruent_triangles: 'triangle_congruent', triangles_congruent: 'triangle_congruent' };
function pointName(p) { return typeof p === 'string' && p.length > 0 && p.length <= 100 && p.trim() === p; }
function tuple(a, size) { return Array.isArray(a) && a.length === size && a.every(pointName) && new Set(a).size === size; }
const segKey = a => JSON.stringify([...a].sort());
const angleKey = a => JSON.stringify(a[0] < a[2] ? a : [a[2], a[1], a[0]]);
function pairKey(a, b) { return JSON.stringify([a, b].sort()); }
function fact(raw) {
  requireThat(isObject(raw) && typeof raw.predicate === 'string' && Array.isArray(raw.args), 'A fact requires predicate and args.');
  const p = alias(factAliases, token(raw.predicate));
  const a = raw.args;
  let key;
  if (p === 'triangle' || p === 'collinear') {
    requireThat(tuple(a, 3), `${p} requires three distinct point names.`); key = segKey(a);
  } else if (p === 'segment_equal' || p === 'parallel' || p === 'perpendicular') {
    requireThat(a.length === 4 && tuple(a.slice(0, 2), 2) && tuple(a.slice(2), 2), `${p} requires two nonzero segments.`);
    if (p === 'parallel' || p === 'perpendicular') requireThat(segKey(a.slice(0, 2)) !== segKey(a.slice(2)), `${p} lines must be distinct.`);
    key = pairKey(segKey(a.slice(0, 2)), segKey(a.slice(2)));
  } else if (p === 'segment_ratio_equal') {
    requireThat(a.length === 8 && [0, 2, 4, 6].every(i => tuple(a.slice(i, i + 2), 2)), 'segment_ratio_equal requires four nonzero segments.');
    const ratio1 = JSON.stringify([segKey(a.slice(0, 2)), segKey(a.slice(2, 4))]);
    const ratio2 = JSON.stringify([segKey(a.slice(4, 6)), segKey(a.slice(6, 8))]);
    key = pairKey(ratio1, ratio2);
  } else if (p === 'angle_equal') {
    requireThat(a.length === 6 && tuple(a.slice(0, 3), 3) && tuple(a.slice(3), 3), 'angle_equal requires two angle triples.');
    key = pairKey(angleKey(a.slice(0, 3)), angleKey(a.slice(3)));
  } else if (p === 'triangle_congruent' || p === 'triangle_similar') {
    requireThat(a.length === 2 && tuple(a[0], 3) && tuple(a[1], 3), `${p} requires two ordered triangle triples.`);
    key = permutations.map(order => pairKey(JSON.stringify(order.map(i => a[0][i])), JSON.stringify(order.map(i => a[1][i])))).sort()[0];
  } else if (p === 'midpoint') {
    requireThat(tuple(a, 3), 'midpoint requires [M,A,B] with distinct points.'); key = JSON.stringify([a[0], segKey(a.slice(1))]);
  } else if (p === 'between') {
    requireThat(tuple(a, 3), 'between requires [A,M,B] with distinct points.'); key = JSON.stringify([a[1], segKey([a[0], a[2]])]);
  } else if (p === 'right_angle' || p === 'pythagorean_relation' || p === 'circle_tangent_at') {
    requireThat(tuple(a, 3), `${p} requires three distinct point names.`);
    key = p === 'circle_tangent_at' ? JSON.stringify(a) : angleKey(a);
  } else if (['supplementary', 'vertical_angles', 'linear_pair'].includes(p)) {
    requireThat(a.length === 2 && tuple(a[0], 3) && tuple(a[1], 3), `${p} requires two angle triples.`);
    if (p !== 'supplementary') requireThat(angleKey(a[0]) !== angleKey(a[1]), `${p} requires distinct angles.`);
    key = pairKey(angleKey(a[0]), angleKey(a[1]));
  } else if (['alternate_interior_angles', 'alternate_exterior_angles', 'corresponding_angles', 'same_side_interior_angles'].includes(p)) {
    requireThat(a.length === 4 && tuple(a[0], 3) && tuple(a[1], 3) && tuple(a[2], 2) && tuple(a[3], 2), `${p} requires two angles and two lines.`);
    requireThat(segKey(a[2]) !== segKey(a[3]), 'A parallel position fact requires distinct lines.');
    requireThat(angleKey(a[0]) !== angleKey(a[1]), 'A parallel position fact requires distinct angles.');
    key = JSON.stringify([pairKey(angleKey(a[0]), angleKey(a[1])), pairKey(segKey(a[2]), segKey(a[3]))]);
  } else if (p === 'inscribed_same_arc') {
    requireThat(a.length === 2 && tuple(a[0], 3) && tuple(a[1], 3), 'inscribed_same_arc requires two inscribed angle triples.');
    requireThat(segKey([a[0][0], a[0][2]]) === segKey([a[1][0], a[1][2]]) && angleKey(a[0]) !== angleKey(a[1]), 'Inscribed angles must have distinct vertices and the same arc endpoints.');
    key = pairKey(angleKey(a[0]), angleKey(a[1]));
  } else throw new GeometryError(`Unsupported proof predicate: ${p}.`);
  return { predicate: p, args: a.map(v => Array.isArray(v) ? [...v] : v), key: `${p}:${key}` };
}
const statementOf = f => ({ predicate: f.predicate, args: f.args });
const makeFact = (predicate, args) => fact({ predicate, args });
const contains = (fs, predicate, args) => fs.some(f => f.key === makeFact(predicate, args).key);
function equalParts(target, p, first, second) { return target.predicate === p && target.key === makeFact(p, [...first, ...second]).key; }
const angleAt = (t, i) => [t[(i + 1) % 3], t[i], t[(i + 2) % 3]];
const segment = (t, i, j) => [t[i], t[j]];

function congruenceRule(rule, target, premises) {
  if (target.predicate !== 'triangle_congruent') return false;
  const [a, b] = target.args;
  if (!contains(premises, 'triangle', a) || !contains(premises, 'triangle', b)) return false;
  const edge = (i, j) => contains(premises, 'segment_equal', [...segment(a, i, j), ...segment(b, i, j)]);
  const angle = i => contains(premises, 'angle_equal', [...angleAt(a, i), ...angleAt(b, i)]);
  if (rule === 'sss') return edge(0, 1) && edge(1, 2) && edge(2, 0);
  if (rule === 'sas') return [0, 1, 2].some(i => angle(i) && edge(i, (i + 1) % 3) && edge(i, (i + 2) % 3));
  return [[0, 1, 2], [1, 2, 0], [2, 0, 1]].some(([i, j, k]) => angle(i) && angle(j) && (rule === 'asa' ? edge(i, j) : edge(i, k) || edge(j, k)));
}
function similarityRule(rule, target, premises) {
  if (target.predicate !== 'triangle_similar') return false;
  const [a, b] = target.args;
  if (!contains(premises, 'triangle', a) || !contains(premises, 'triangle', b)) return false;
  const angle = i => contains(premises, 'angle_equal', [...angleAt(a, i), ...angleAt(b, i)]);
  const ratio = (first, second) => contains(premises, 'segment_ratio_equal', [
    ...segment(a, ...first), ...segment(b, ...first), ...segment(a, ...second), ...segment(b, ...second),
  ]);
  if (rule === 'aa_similarity') return [0, 1, 2].filter(angle).length >= 2;
  const edges = [[0, 1], [1, 2], [2, 0]];
  if (rule === 'sss_similarity') return ratio(edges[0], edges[1]) && ratio(edges[0], edges[2]);
  return [0, 1, 2].some(i => angle(i) && ratio([i, (i + 1) % 3], [i, (i + 2) % 3]));
}
function similarityConsequence(target, premises) {
  return premises.filter(f => f.predicate === 'triangle_similar').some(f => {
    const [a, b] = f.args;
    if (target.predicate === 'angle_equal') return [0, 1, 2].some(i => equalParts(target, 'angle_equal', angleAt(a, i), angleAt(b, i)));
    if (target.predicate !== 'segment_ratio_equal') return false;
    const edges = [[0, 1], [1, 2], [2, 0]];
    return edges.some((first, i) => edges.slice(i + 1).some(second => target.key === makeFact('segment_ratio_equal', [
      ...segment(a, ...first), ...segment(b, ...first), ...segment(a, ...second), ...segment(b, ...second),
    ]).key));
  });
}
function parallelPerpendicular(target, premises) {
  if (target.predicate !== 'perpendicular') return false;
  return premises.filter(f => f.predicate === 'parallel').some(f => {
    const lines = [f.args.slice(0, 2), f.args.slice(2, 4)];
    return premises.filter(g => g.predicate === 'perpendicular').some(g => {
      const perpendicularLines = [g.args.slice(0, 2), g.args.slice(2, 4)];
      return [0, 1].some(i => [0, 1].some(j => segKey(lines[i]) === segKey(perpendicularLines[j]) &&
        segKey(lines[1 - i]) !== segKey(perpendicularLines[1 - j]) &&
        target.key === makeFact('perpendicular', [...lines[1 - i], ...perpendicularLines[1 - j]]).key));
    });
  });
}
function cpctc(target, premises) {
  return premises.filter(f => f.predicate === 'triangle_congruent').some(f => {
    const [a, b] = f.args;
    if (target.predicate === 'segment_equal') return [[0, 1], [1, 2], [2, 0]].some(([i, j]) => equalParts(target, 'segment_equal', segment(a, i, j), segment(b, i, j)));
    return target.predicate === 'angle_equal' && [0, 1, 2].some(i => equalParts(target, 'angle_equal', angleAt(a, i), angleAt(b, i)));
  });
}
function transitive(target, premises) {
  const p = target.predicate;
  if (!['segment_equal', 'angle_equal'].includes(p)) return false;
  const size = p === 'segment_equal' ? 2 : 3;
  const partKey = p === 'segment_equal' ? segKey : angleKey;
  const graph = new Map();
  for (const f of premises.filter(f => f.predicate === p)) {
    const a = partKey(f.args.slice(0, size)), b = partKey(f.args.slice(size));
    if (!graph.has(a)) graph.set(a, new Set()); if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a).add(b); graph.get(b).add(a);
  }
  const start = partKey(target.args.slice(0, size)), end = partKey(target.args.slice(size));
  const pending = [start], seen = new Set();
  while (pending.length) { const next = pending.pop(); if (next === end) return true; if (!seen.has(next)) { seen.add(next); pending.push(...(graph.get(next) ?? [])); } }
  return false;
}
function applyRule(rule, target, premises) {
  if (['sss', 'sas', 'asa', 'aas'].includes(rule)) return congruenceRule(rule, target, premises);
  if (['aa_similarity', 'sss_similarity', 'sas_similarity'].includes(rule)) return similarityRule(rule, target, premises);
  if (rule === 'cpctc') return cpctc(target, premises);
  if (rule === 'similarity_correspondence') return similarityConsequence(target, premises);
  if (rule === 'congruence_implies_similarity') return target.predicate === 'triangle_similar' &&
    contains(premises, 'triangle', target.args[0]) && contains(premises, 'triangle', target.args[1]) &&
    premises.some(f => f.predicate === 'triangle_congruent' && makeFact('triangle_similar', f.args).key === target.key);
  if (rule === 'parallel_perpendicular') return parallelPerpendicular(target, premises);
  if (rule === 'tangent_radius_perpendicular') return premises.filter(f => f.predicate === 'circle_tangent_at').some(f => {
    const [o, p, q] = f.args;
    return target.key === makeFact('perpendicular', [o, p, p, q]).key || target.key === makeFact('right_angle', [o, p, q]).key;
  });
  if (rule === 'inscribed_same_arc') return premises.filter(f => f.predicate === 'inscribed_same_arc').some(f => equalParts(target, 'angle_equal', f.args[0], f.args[1]));
  if (rule === 'pythagorean_theorem' || rule === 'pythagorean_converse') {
    const desired = rule === 'pythagorean_theorem' ? 'pythagorean_relation' : 'right_angle';
    const source = rule === 'pythagorean_theorem' ? 'right_angle' : 'pythagorean_relation';
    return target.predicate === desired && contains(premises, 'triangle', target.args) && contains(premises, source, target.args);
  }
  if (rule === 'given' || rule === 'reiteration' || rule === 'symmetric') return premises.some(f => f.key === target.key);
  if (rule === 'transitive') return transitive(target, premises);
  if (rule === 'reflexive') {
    if (target.predicate === 'segment_equal') return segKey(target.args.slice(0, 2)) === segKey(target.args.slice(2));
    if (target.predicate === 'angle_equal') return angleKey(target.args.slice(0, 3)) === angleKey(target.args.slice(3));
    return target.predicate === 'triangle_congruent' && target.args[0].every((p, i) => p === target.args[1][i]) && contains(premises, 'triangle', target.args[0]);
  }
  if (rule === 'midpoint_definition') return premises.filter(f => f.predicate === 'midpoint').some(({ args: [m, a, b] }) => (
    equalParts(target, 'segment_equal', [a, m], [m, b]) || target.key === makeFact('collinear', [a, m, b]).key || target.key === makeFact('between', [a, m, b]).key
  ));
  if (rule === 'midpoint_converse') {
    if (target.predicate !== 'midpoint') return false;
    const [m, a, b] = target.args;
    return contains(premises, 'between', [a, m, b]) && contains(premises, 'segment_equal', [a, m, m, b]);
  }
  if (rule === 'right_angles_congruent') {
    return target.predicate === 'angle_equal' && contains(premises, 'right_angle', target.args.slice(0, 3)) && contains(premises, 'right_angle', target.args.slice(3));
  }
  if (rule === 'vertical_angles' || rule === 'linear_pair') return premises.filter(f => f.predicate === rule).some(f => (
    rule === 'vertical_angles' ? equalParts(target, 'angle_equal', f.args[0], f.args[1]) : target.key === makeFact('supplementary', f.args).key
  ));
  const parallelRules = ['alternate_interior_angles', 'alternate_exterior_angles', 'corresponding_angles', 'same_side_interior_angles'];
  const converse = rule.endsWith('_converse');
  const baseRule = converse ? rule.slice(0, -9) : rule;
  if (parallelRules.includes(baseRule)) return premises.filter(f => f.predicate === baseRule).some(f => {
    const [a, b, l1, l2] = f.args;
    const consequence = baseRule === 'same_side_interior_angles' ? makeFact('supplementary', [a, b]) : makeFact('angle_equal', [...a, ...b]);
    const parallel = makeFact('parallel', [...l1, ...l2]);
    return converse ? target.key === parallel.key && premises.some(p => p.key === consequence.key) : target.key === consequence.key && premises.some(p => p.key === parallel.key);
  });
  return false;
}
const ruleAliases = {
  midpoint: 'midpoint_definition', definition_of_midpoint: 'midpoint_definition',
  reflexive_property: 'reflexive', symmetric_property: 'symmetric', transitive_property: 'transitive',
  sss_congruence: 'sss', sas_congruence: 'sas', asa_congruence: 'asa', aas_congruence: 'aas',
  corresponding: 'corresponding_angles', alternate_interior: 'alternate_interior_angles',
};

/** Check a finite proof in the explicitly supported, diagram-free rule system. */
export function verifyGeometryProof(proof) {
  try {
    requireThat(isObject(proof), 'A proof must be an object.');
    requireThat(Array.isArray(proof.givens) && Array.isArray(proof.steps), 'Proof givens and steps must be arrays.');
    requireThat(proof.givens.length <= 1000 && proof.steps.length <= 1000, 'A proof may contain at most 1000 givens and 1000 steps.');
    const givens = proof.givens.map(fact), established = [], outputSteps = [];
    const goal = fact(proof.goal);
    // Reject contradictions visible from named triples and named line pairs.
    const compatible = facts => {
      const noncollinear = new Set();
      for (const f of facts) {
        if (['triangle', 'right_angle', 'pythagorean_relation', 'circle_tangent_at'].includes(f.predicate)) noncollinear.add(segKey(f.args));
        if (['triangle_congruent', 'triangle_similar', 'inscribed_same_arc'].includes(f.predicate)) f.args.forEach(triple => noncollinear.add(segKey(triple)));
      }
      const collinear = facts.filter(f => ['collinear', 'between', 'midpoint'].includes(f.predicate));
      requireThat(collinear.every(f => !noncollinear.has(segKey(f.args))), 'The proof asserts both a triangle and collinearity of the same points.');
      const parallels = new Set(facts.filter(f => f.predicate === 'parallel').map(f => f.key.slice('parallel:'.length)));
      requireThat(facts.filter(f => f.predicate === 'perpendicular').every(f => !parallels.has(f.key.slice('perpendicular:'.length))), 'The same named lines cannot be both parallel and perpendicular.');
    };
    compatible(givens);
    for (let i = 0; i < proof.steps.length; i++) {
      const step = proof.steps[i];
      requireThat(isObject(step) && typeof step.rule === 'string' && Array.isArray(step.premises), `Step ${i + 1} needs a rule and explicit premises.`);
      requireThat(step.premises.length <= 2000, `Too many premises in step ${i + 1}.`);
      const target = fact(step.statement);
      const available = [...givens, ...established];
      const premises = step.premises.map(ref => {
        let f;
        if (Number.isSafeInteger(ref) && ref >= 0) f = available[ref];
        else if (typeof ref === 'string') {
          const match = /^(g|s|given:|step:)(\d+)$/.exec(ref);
          if (match) f = (match[1] === 'g' || match[1] === 'given:' ? givens : established)[Number(match[2])];
        } else if (isObject(ref)) { const candidate = fact(ref); f = available.find(a => a.key === candidate.key); }
        requireThat(f, `Step ${i + 1} cites an unavailable premise.`); return f;
      });
      const rule = alias(ruleAliases, token(step.rule));
      requireThat(applyRule(rule, target, premises), `Step ${i + 1} is not justified by ${step.rule} and its explicit premises.`);
      established.push(target); compatible([...givens, ...established]);
      outputSteps.push({ before: premises.map(statementOf), after: statementOf(target), rule, explanation: `The stated ${rule} rule applies to these explicit premises.`, verified: true });
    }
    requireThat([...givens, ...established].some(f => f.key === goal.key), 'The goal has not been established.');
    const output = result('solved', 'proof', { valid: true, goalProved: true, checkedSteps: established.length, goal: statementOf(goal) }, outputSteps);
    output.restrictions.push('Givens are assumed; the checker validates only the listed Euclidean rules and explicit incidences.');
    return output;
  } catch (error) {
    return result('invalid', 'proof', { valid: false, goalProved: false }, [], error instanceof GeometryError ? error.message : 'Malformed geometry proof.');
  }
}

function normalize(input) {
  let topic = token(input.topic ?? input.shape);
  const aliases = { triangle_angle: 'triangle_angles', pythagorean: 'pythagoras', pythagorean_theorem: 'pythagoras', right_triangle: 'pythagoras', regularpolygon: 'regular_polygon', trapezium: 'trapezoid', line_equation: 'line', coordinate_distance: 'distance', coordinate_midpoint: 'midpoint', coordinate_slope: 'slope', angle: 'angles', geometry_proof: 'proof' };
  topic = alias(aliases, topic);
  if (['area', 'perimeter', 'circumference', 'volume', 'surface_area'].includes(topic)) {
    requireThat(typeof input.shape === 'string' && !['area', 'perimeter', 'circumference', 'volume', 'surface_area'].includes(token(input.shape)), 'A measurement topic requires a shape.');
    return normalize({ ...input, topic: input.shape, operation: topic });
  }
  const match = /^(circle|rectangle|triangle|trapezoid|regular_polygon|sphere|cylinder|cone|prism)_(area|perimeter|circumference|volume|surface_area)$/.exec(topic);
  if (match) return { ...input, topic: match[1], operation: match[2] };
  if (topic === 'triangle' && token(input.operation) === 'angles') topic = 'triangle_angles';
  if (topic === 'circle' && token(input.operation) === 'equation') topic = 'circle_equation';
  return { ...input, topic };
}

/** Solve a structured geometry request, or one of parseGeometry's text commands. */
export function solveGeometry(raw) {
  let topic = 'geometry';
  try {
    const parsed = typeof raw === 'string' ? parseGeometry(raw) : raw;
    if (typeof raw === 'string' && parsed === null) return result('unsupported', topic, {}, [], 'Unrecognized geometry command.');
    requireThat(isObject(parsed), 'Geometry input must be an object or a supported text command.');
    if (parsed.kind !== undefined && parsed.kind !== 'geometry') return result('unsupported', topic, {}, [], 'Expected kind: geometry.');
    const input = normalize(parsed); topic = input.topic || 'geometry';
    if (['circle', 'rectangle', 'triangle', 'trapezoid', 'regular_polygon'].includes(topic)) return shape2d(input, topic);
    if (['sphere', 'cylinder', 'cone', 'prism'].includes(topic)) return shape3d(input, topic);
    if (topic === 'triangle_angles') return triangleAngles(input);
    if (topic === 'pythagoras') return pythagoras(input);
    if (['distance', 'midpoint', 'slope', 'line'].includes(topic)) return coordinate(input, topic);
    if (topic === 'circle_equation') return circleEquation(input);
    if (topic === 'similarity') return similarity(input);
    if (topic === 'transform') return transform(input);
    if (topic === 'circle_relation') return circleRelation(input);
    if (topic === 'circle_tangent') return circleTangent(input);
    if (topic === 'circle_arc' || topic === 'circle_sector') return circleArcSector(input, topic);
    if (topic === 'line_relation') return lineRelation(input);
    if (topic === 'triangle_similarity') return triangleSimilarity(input);
    if (topic === 'perpendicular_bisector') return perpendicularBisector(input);
    if (topic === 'circumcircle') return circumcircle(input);
    if (topic === 'special_right_triangle') return specialRightTriangle(input);
    if (topic === 'angles') return relatedAngle(input);
    if (topic === 'proof') return verifyGeometryProof(input.proof ?? input);
    return result('unsupported', topic, {}, [], `Unsupported geometry topic: ${topic}.`);
  } catch (error) {
    return result('invalid', topic, {}, [], error instanceof GeometryError ? error.message : 'Malformed geometry input.');
  }
}

/**
 * Deliberately bounded practical command parser. Returns null on unknown text;
 * it never invents missing hypotheses or extracts numbers from arbitrary prose.
 */
export function parseGeometry(text) {
  if (typeof text !== 'string' || text.length > 10000) return null;
  const source = text.trim().toLowerCase().replace(/°/g, '').replace(/\s+/g, ' ');
  const N = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
  const P = `\\(\\s*(${N})\\s*,\\s*(${N})\\s*\\)`;
  let m;
  const input = (topic, fields) => ({ kind: 'geometry', topic, ...fields });
  if ((m = new RegExp(`^(distance|midpoint|slope|line)(?: between| through| of)? ${P}(?:\\s+(?:and|to))?\\s*${P}$`).exec(source))) return input(m[1], { points: [[+m[2], +m[3]], [+m[4], +m[5]]] });
  if ((m = new RegExp(`^circle equation center ${P} radius[ =]+(${N})$`).exec(source))) return input('circle_equation', { center: [+m[1], +m[2]], radius: +m[3] });
  if ((m = new RegExp(`^triangle angles[ :]+(${N})[ ,]+(${N})(?:[ ,]+\\?)?$`).exec(source))) return input('triangle_angles', { angles: [+m[1], +m[2], null] });
  if ((m = /^(?:pythagoras|pythagorean|right triangle) (.+)$/.exec(source))) {
    const fields = {}, parts = m[1].split(/[ ,]+/);
    for (const part of parts) { const kv = new RegExp(`^([abc])=(${N}|\\?)$`).exec(part); if (!kv || own(fields, kv[1])) return null; fields[kv[1]] = kv[2] === '?' ? null : +kv[2]; }
    return input('pythagoras', fields);
  }
  if ((m = new RegExp(`^similarity scale[ =]+(${N}) side[ =]+(${N})$`).exec(source))) return input('similarity', { scaleFactor: +m[1], side: +m[2] });
  if ((m = new RegExp(`^angles (complementary|supplementary|vertical|corresponding|alternate interior|same side interior)[ :]+(${N})( parallel)?$`).exec(source))) return input('angles', { relationship: token(m[1]), angle: +m[2], ...(m[3] ? { parallel: true } : {}) });
  const shapes = 'circle|rectangle|triangle|trapezoid|trapezium|regular polygon|sphere|cylinder|cone|prism';
  const operations = 'surface area|area|perimeter|circumference|volume';
  m = new RegExp(`^(?:(${operations}) (?:of )?(${shapes})|(${shapes}) (${operations})) (.+)$`).exec(source);
  if (!m) return null;
  const op = token(m[1] ?? m[4]), topic = token(m[2] ?? m[3]), tail = m[5];
  if (topic === 'triangle') {
    const sides = new RegExp(`^sides[ =]+(${N})[ ,]+(${N})[ ,]+(${N})$`).exec(tail);
    if (sides) return input(topic, { operation: op, sides: sides.slice(1).map(Number) });
  }
  const labels = { radius: 'radius', r: 'radius', diameter: 'diameter', length: 'length', width: 'width', height: 'height', base: 'base', base1: 'base1', base2: 'base2', leg1: 'leg1', leg2: 'leg2', n: 'n', side: 'side', basearea: 'baseArea', baseperimeter: 'basePerimeter', a: 'a', b: 'b', c: 'c', d: 'd' };
  const fields = {};
  let rest = tail;
  while (rest) {
    const pair = new RegExp(`^([a-z]+[12]?)[ =]+(${N})(?:[, ]+|$)`).exec(rest);
    if (!pair || !own(labels, pair[1]) || own(fields, labels[pair[1]])) return null;
    fields[labels[pair[1]]] = +pair[2]; rest = rest.slice(pair[0].length);
  }
  return input(topic, { operation: op, ...fields });
}

function sameResult(actual, expected, depth = 0, numericTolerance = false, allowTolerance = true) {
  if (depth > 100) return false;
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
    // Only approximate measurement values admit rounding; all other fields,
    // input data, exact expressions and proof correspondences must match.
    return numericTolerance ? actual === expected || Math.abs(actual - expected) <= 1e-12 * Math.max(Math.abs(actual), Math.abs(expected), Number.MIN_VALUE) : actual === expected;
  }
  if (actual === expected) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && expected.every((v, i) => sameResult(actual[i], v, depth + 1, false, allowTolerance));
  if (!isObject(actual) || !isObject(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every(k => own(actual, k) && sameResult(actual[k], expected[k], depth + 1,
    allowTolerance && k === 'value' && expected.approximate === true && typeof expected.exact === 'string',
    allowTolerance && k !== 'before'));
}

/** Recompute every answer and proof step; never trust a result's own claims. */
export function verifyGeometryCertificate(input, candidate) {
  try {
    if (!isObject(candidate) || candidate.status !== 'solved' || candidate.verified !== true) return false;
    const expected = solveGeometry(input);
    return expected.status === 'solved' && sameResult(candidate, expected);
  } catch { return false; }
}
