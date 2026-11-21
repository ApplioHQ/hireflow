import test from 'node:test';
import assert from 'node:assert/strict';
import { solveGeometry, parseGeometry, verifyGeometryProof, verifyGeometryCertificate } from '../engine/geometry.js';

const solve = (topic, fields = {}) => solveGeometry({ kind: 'geometry', topic, ...fields });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const fact = (predicate, ...args) => ({ predicate, args });
const step = (statement, rule, premises = []) => ({ statement, rule, premises });
const clone = value => JSON.parse(JSON.stringify(value));
const segmentEqual = (a, b, c, d) => fact('segment_equal', a, b, c, d);
const angleEqual = (a, b, c, d, e, f) => fact('angle_equal', a, b, c, d, e, f);
const congruent = (a = ['A', 'B', 'C'], b = ['D', 'E', 'F']) => fact('triangle_congruent', a, b);
const triangles = [fact('triangle', 'A', 'B', 'C'), fact('triangle', 'D', 'E', 'F')];

function assertSolved(output) {
  assert.equal(output.status, 'solved', output.error);
  assert.equal(output.verified, true);
  assert.ok(output.steps.every(s => s.verified === true && s.rule && s.explanation));
  assert.ok(Array.isArray(output.restrictions));
  assert.equal(output.certificate.version, 1);
}

test('circle reports an exact expression and honest approximate values', () => {
  const input = { kind: 'geometry', topic: 'circle', radius: 3 };
  const output = solveGeometry(input);
  assertSolved(output);
  close(output.answer.area.value, 9 * Math.PI);
  close(output.answer.perimeter.value, 6 * Math.PI);
  assert.equal(output.answer.area.exact, 'pi * (3)^2');
  assert.equal(output.answer.area.approximate, true);
  assert.equal(output.certificate.assurance, 'numerical-formula-check');
  assert.equal(verifyGeometryCertificate(input, output), true);
});

test('2D area and perimeter formulas cover rectangles, triangles, trapezoids, and polygons', () => {
  const rectangle = solve('rectangle', { length: 7, width: 4 });
  assertSolved(rectangle); close(rectangle.answer.area.value, 28); close(rectangle.answer.perimeter.value, 22);
  const triangle = solve('triangle', { sides: [3, 4, 5] });
  assertSolved(triangle); close(triangle.answer.area.value, 6); close(triangle.answer.perimeter.value, 12);
  close(solve('triangle_area', { base: 9, height: 2 }).answer.area.value, 9);
  const trapezoid = solve('trapezoid', { base1: 10, base2: 4, height: 4, leg1: 5, leg2: 5 });
  assertSolved(trapezoid); close(trapezoid.answer.area.value, 28); close(trapezoid.answer.perimeter.value, 24);
  const polygon = solve('regular_polygon', { n: 6, side: 2 });
  assertSolved(polygon); close(polygon.answer.area.value, 6 * Math.sqrt(3)); close(polygon.answer.perimeter.value, 12);
});

test('flat topics, shape/operation forms, diameter, and customary aliases', () => {
  close(solve('area', { shape: 'circle', diameter: 8 }).answer.area.value, 16 * Math.PI);
  close(solve('circle_circumference', { radius: 4 }).answer.perimeter.value, 8 * Math.PI);
  close(solve('regular-polygon-area', { n: 4, sideLength: 2 }).answer.area.value, 4);
  close(solve('trapezium', { operation: 'area', base1: 3, base2: 5, height: 2 }).answer.area.value, 8);
  assert.equal(solve('circle', { radius: 3, diameter: 8 }).status, 'invalid');
});

test('solid formulas include closed surfaces and explicit assumptions', () => {
  const sphere = solve('sphere', { radius: 3 });
  assertSolved(sphere); close(sphere.answer.volume.value, 36 * Math.PI); close(sphere.answer.surfaceArea.value, 36 * Math.PI);
  const cylinder = solve('cylinder', { radius: 2, height: 5 });
  assertSolved(cylinder); close(cylinder.answer.volume.value, 20 * Math.PI); close(cylinder.answer.surfaceArea.value, 28 * Math.PI);
  assert.match(cylinder.restrictions[0], /right circular/);
  const cone = solve('cone', { radius: 3, height: 4 });
  assertSolved(cone); close(cone.answer.volume.value, 12 * Math.PI); close(cone.answer.surfaceArea.value, 24 * Math.PI);
  const prism = solve('prism', { baseArea: 6, basePerimeter: 12, height: 10 });
  assertSolved(prism); close(prism.answer.volume.value, 60); close(prism.answer.surfaceArea.value, 132);
  const box = solve('prism', { length: 2, width: 3, height: 4 });
  close(box.answer.volume.value, 24); close(box.answer.surfaceArea.value, 52);
  close(solve('prism_volume', { baseArea: 6, height: 10 }).answer.volume.value, 60);
  assert.equal(solve('prism_surface_area', { baseArea: 100, basePerimeter: 1, height: 2 }).status, 'invalid');
});

test('triangle angle sum and missing Pythagorean legs or hypotenuse', () => {
  const angles = solve('triangle_angles', { angles: [50, null, 70] });
  assertSolved(angles); assert.equal(angles.answer.missingIndex, 1); close(angles.answer.angles[1].value, 60);
  assert.equal(angles.answer.angles[1].unit, 'degrees');
  assertSolved(solve('triangle', { operation: 'angles', angles: [60, 60, 60] }));
  assertSolved(solve('triangle_angles', { angles: [0.1, 0.2, 179.7] }));
  const hyp = solve('pythagoras', { a: 3, b: 4 });
  assertSolved(hyp); assert.equal(hyp.answer.missing, 'c'); close(hyp.answer.side.value, 5);
  close(solve('pythagoras', { b: 4, c: 5 }).answer.side.value, 3);
  close(solve('pythagoras', { a: 3, c: 5 }).answer.side.value, 4);
  assert.match(hyp.answer.side.exact, /^sqrt/);
  assert.ok(hyp.restrictions.length);
});

test('coordinates support vertical, horizontal, coincident points and exact equations', () => {
  const points = [[-1, -2], [2, 2]];
  close(solve('distance', { points }).answer.distance.value, 5);
  const midpoint = solve('midpoint', { points });
  assert.deepEqual(midpoint.answer.midpoint.map(m => m.value), [0.5, 0]);
  close(solve('slope', { points }).answer.slope.value, 4 / 3);
  const vertical = solve('slope', { p1: { x: 2, y: 1 }, p2: { x: 2, y: 5 } });
  assertSolved(vertical); assert.equal(vertical.answer.vertical, true); assert.equal(vertical.answer.slope, null);
  const line = solve('line', { points: [[2, 1], [2, 5]] });
  assertSolved(line); assert.equal(line.answer.form, 'point-normal'); assert.equal(line.answer.vertical, true);
  assert.deepEqual(line.answer.normal.map(m => m.value), [4, 0]);
  assert.equal(solve('slope', { points: [[1, 1], [1, 1]] }).status, 'invalid');
  assert.equal(solve('line', { points: [[1, 1], [1, 1]] }).status, 'invalid');
  close(solve('distance', { points: [[1, 1], [1, 1]] }).answer.distance.value, 0);
  assertSolved(solve('midpoint', { points: [[1e308, 1e308], [1e308, 1e308]] }));
});

test('circle equations, similarity and conditional angle relationships', () => {
  const circle = solve('circle_equation', { center: [-2, 4], radius: 5 });
  assertSolved(circle); close(circle.answer.radiusSquared.value, 25);
  assert.equal(circle.answer.equation, '(x - (-2))^2 + (y - (4))^2 = (5)^2');
  const sim = solve('similarity', { knownOriginal: 4, knownImage: 10, originalLength: 6 });
  assertSolved(sim); close(sim.answer.length.value, 15); close(sim.answer.areaFactor.value, 6.25); close(sim.answer.volumeFactor.value, 15.625);
  close(solve('similarity', { scaleFactor: 2, side: 3 }).answer.length.value, 6);
  close(solve('angles', { relationship: 'complementary', angle: 30 }).answer.angle.value, 60);
  close(solve('angles', { relationship: 'supplementary', angle: 30 }).answer.angle.value, 150);
  close(solve('angles', { relationship: 'corresponding', angle: 30, parallel: true }).answer.angle.value, 30);
  close(solve('angles', { relationship: 'same_side_interior', angle: 30, parallel: true }).answer.angle.value, 150);
  assert.equal(solve('angles', { relationship: 'corresponding', angle: 30 }).status, 'invalid');
  assert.equal(solve('angles', { relationship: 'complementary', angle: 100 }).status, 'invalid');
});

test('exact transformations map single points and vertex lists with reduced rational coordinates', () => {
  const translation = solve('transform', { point: [0.1, -0.2], transformation: 'translation', dx: 0.2, dy: 0.3 });
  assertSolved(translation);
  assert.equal(translation.certificate.assurance, 'exact-rational-check');
  assert.deepEqual(translation.answer.image.map(p => p.exact), ['3/10', '1/10']);
  close(translation.answer.image[0].value, 0.3);
  const reflected = solve('transform', { vertices: [[2, 3], [-1, 4]], transformation: 'reflection', axis: 'y=-x' });
  assertSolved(reflected);
  assert.deepEqual(reflected.answer.images.map(p => p.map(c => c.value)), [[-3, -2], [-4, 1]]);
  const rotated = solve('transform', { point: [3, 4], transformation: 'rotation', degrees: -90, center: [1, 2] });
  assert.deepEqual(rotated.answer.image.map(p => p.value), [3, 0]);
  const dilated = solve('transform', { point: [3, 4], transformation: 'dilation', factor: 0.5, center: [1, 2] });
  assert.deepEqual(dilated.answer.image.map(p => p.exact), ['2', '3']);
  for (const input of [
    { point: [1, 2], transformation: 'rotation', degrees: 45 },
    { point: [1, 2], transformation: 'reflection', axis: 'y=2x' },
    { point: [1, 2], transformation: 'shear' },
  ]) assert.equal(solve('transform', input).status, 'unsupported');
  for (const input of [
    { point: [1, 2], transformation: 'translation', dx: 1 },
    { point: [1, 2], transformation: 'dilation', factor: -2 },
    { vertices: [], transformation: 'reflection', axis: 'x' },
    { point: [1, 2], vertices: [[1, 2]], transformation: 'rotation', degrees: 90 },
  ]) assert.equal(solve('transform', input).status, 'invalid');
  const source = { kind: 'geometry', topic: 'transform', point: [0.1, -0.2], transformation: 'translation', dx: 0.2, dy: 0.3 };
  assert.equal(verifyGeometryCertificate(source, clone(translation)), true);
  const forged = clone(translation); forged.answer.image[0].exact = '0.30000000000000004';
  assert.equal(verifyGeometryCertificate(source, forged), false);
});

test('circle point relation uses exact squared distance and power', () => {
  const input = { kind: 'geometry', topic: 'circle_relation', center: [1, -2], radius: 5, point: [4, 2] };
  const on = solveGeometry(input);
  assertSolved(on);
  assert.equal(on.answer.position, 'on');
  assert.equal(on.answer.distanceSquared.exact, '25');
  assert.equal(on.answer.power.exact, '0');
  assert.equal(verifyGeometryCertificate(input, clone(on)), true);
  assert.equal(solve('circle_relation', { center: [0, 0], radius: 0.3, point: [0.3, 0] }).answer.position, 'on');
  assert.equal(solve('circle_relation', { center: [0, 0], radius: 5, point: [0, 0] }).answer.position, 'inside');
  assert.equal(solve('circle_relation', { center: [0, 0], radius: 5, point: [6, 0] }).answer.position, 'outside');
  assert.equal(solve('circle_relation', { center: [0, 0], radius: 0, point: [0, 0] }).status, 'invalid');
  const forged = clone(on); forged.answer.position = 'inside';
  assert.equal(verifyGeometryCertificate(input, forged), false);
});

test('circle tangent requires exact incidence and uses the radius as its normal', () => {
  const input = { kind: 'geometry', topic: 'circle_tangent', center: [1, -2], radius: 5, point: [4, 2] };
  const tangent = solveGeometry(input);
  assertSolved(tangent);
  assert.equal(tangent.certificate.assurance, 'exact-rational-check');
  assert.deepEqual(tangent.answer.normal.map(p => p.exact), ['3', '4']);
  assert.equal(tangent.answer.equation, '(3) * (x - (4)) + (4) * (y - (2)) = 0');
  assert.equal(verifyGeometryCertificate(input, clone(tangent)), true);
  assert.equal(solve('circle_tangent', { center: [0, 0], radius: 0.3, point: [0.3, 0] }).status, 'solved');
  assert.equal(solve('circle_tangent', { center: [0, 0], radius: 5, point: [3, 3] }).status, 'invalid');
  const forged = clone(tangent); forged.answer.normal[0].exact = '-3';
  assert.equal(verifyGeometryCertificate(input, forged), false);
});

test('arc length and sector area have reduced exact pi coefficients and bounded angles', () => {
  const input = { kind: 'geometry', topic: 'circle_sector', radius: 3, centralAngle: 60 };
  const sector = solveGeometry(input);
  assertSolved(sector);
  assert.equal(sector.certificate.assurance, 'exact-symbolic-check');
  assert.equal(sector.answer.arcLength.exact, 'pi');
  assert.equal(sector.answer.area.exact, '(3/2) * pi');
  close(sector.answer.arcLength.value, Math.PI);
  close(sector.answer.area.value, 1.5 * Math.PI);
  assert.equal(verifyGeometryCertificate(input, clone(sector)), true);
  const arc = solve('circle_arc', { diameter: 0.6, centralAngle: 30 });
  assertSolved(arc);
  assert.equal(arc.answer.arcLength.exact, '(1/20) * pi');
  assert.equal(solve('circle_sector', { radius: 2, centralAngle: 0 }).answer.area.exact, '0');
  assert.equal(solve('circle_sector', { radius: 2, centralAngle: 360 }).answer.area.exact, '(4) * pi');
  for (const fields of [
    { radius: 3, centralAngle: -1 }, { radius: 3, centralAngle: 361 },
    { radius: 0, centralAngle: 30 }, { radius: 3, centralAngle: '30' },
    { radius: 0.3, diameter: 0.6000000000000001, centralAngle: 30 },
    { radius: 1e308, centralAngle: 360 },
    { centralAngle: 30 },
  ]) assert.equal(solve('circle_arc', fields).status, 'invalid');
  const forged = clone(sector); forged.answer.area.exact = '(3/2) * pi + 1';
  assert.equal(verifyGeometryCertificate(input, forged), false);
  const changed = { ...input, centralAngle: 90 };
  assert.equal(verifyGeometryCertificate(changed, sector), false);
});

test('exact line relations distinguish intersection, perpendicular, parallel and coincidence', () => {
  const input = { kind: 'geometry', topic: 'line_relation', line1: [[0, 0], [1, 1]], line2: [[0, 1], [1, 0]] };
  const crossing = solveGeometry(input);
  assertSolved(crossing);
  assert.equal(crossing.answer.relation, 'perpendicular');
  assert.deepEqual(crossing.answer.intersection.map(p => p.exact), ['1/2', '1/2']);
  assert.equal(crossing.answer.determinantExact, '-2');
  assert.equal(verifyGeometryCertificate(input, clone(crossing)), true);
  assert.equal(solve('line_relation', { line1: [[0, 0], [1, 1]], line2: [[0, 1], [1, 2]] }).answer.relation, 'parallel');
  assert.equal(solve('line_relation', { line1: [[0, 0], [1, 1]], line2: [[2, 2], [3, 3]] }).answer.relation, 'coincident');
  assert.equal(solve('line_relation', { line1: [[0, 0], [1, 0.1]], line2: [[0, 1], [1, 1.100000000000001]] }).answer.relation, 'intersecting');
  assert.equal(solve('line_relation', { line1: [[0, 0], [0, 0]], line2: [[0, 1], [1, 2]] }).status, 'invalid');
  const forged = clone(crossing); forged.answer.intersection[0].exact = '2/4';
  assert.equal(verifyGeometryCertificate(input, forged), false);
});

test('triangle similarity checks corresponding squared side ratios exactly', () => {
  const input = { kind: 'geometry', topic: 'triangle_similarity', triangle1: [[0, 0], [1, 0], [0, 1]], triangle2: [[0, 0], [1, 1], [-1, 1]] };
  const similar = solveGeometry(input);
  assertSolved(similar);
  assert.equal(similar.answer.similar, true);
  assert.equal(similar.answer.areaFactor.exact, '2');
  assert.equal(similar.answer.scaleFactor.exact, 'sqrt(2)');
  close(similar.answer.scaleFactor.value, Math.sqrt(2));
  assert.equal(verifyGeometryCertificate(input, clone(similar)), true);
  const different = solve('triangle_similarity', { triangle1: input.triangle1, triangle2: [[0, 0], [2, 0], [0, 3]] });
  assertSolved(different);
  assert.equal(different.answer.similar, false);
  assert.equal(different.answer.scaleFactor, null);
  assert.equal(solve('triangle_similarity', { triangle1: [[0, 0], [1, 1], [2, 2]], triangle2: input.triangle2 }).status, 'invalid');
  const forged = clone(similar); forged.answer.similar = false;
  assert.equal(verifyGeometryCertificate(input, forged), false);
});

test('special right-triangle ratios retain exact radicals and explicit hypotheses', () => {
  const input = { kind: 'geometry', topic: 'special_right_triangle', pattern: '30-60-90', knownSide: 'short_leg', length: 2 };
  const sides = solveGeometry(input);
  assertSolved(sides);
  assert.equal(sides.certificate.assurance, 'exact-symbolic-check');
  assert.equal(sides.answer.shortLeg.exact, '2');
  assert.equal(sides.answer.longLeg.exact, '(2) * sqrt(3)');
  assert.equal(sides.answer.hypotenuse.exact, '4');
  close(sides.answer.longLeg.value, 2 * Math.sqrt(3));
  assert.match(sides.restrictions[0], /assumptions/);
  assert.equal(verifyGeometryCertificate(input, clone(sides)), true);
  const longKnown = solve('special_right_triangle', { pattern: '30-60-90', knownSide: 'long_leg', length: 6 });
  assert.equal(longKnown.answer.shortLeg.exact, '(2) * sqrt(3)');
  assert.equal(longKnown.answer.hypotenuse.exact, '(4) * sqrt(3)');
  const hypKnown = solve('special_right_triangle', { pattern: '30-60-90', knownSide: 'hypotenuse', length: 10 });
  assert.equal(hypKnown.answer.shortLeg.exact, '5');
  assert.equal(hypKnown.answer.longLeg.exact, '(5) * sqrt(3)');
  const equalLegs = solve('special_right_triangle', { pattern: '45-45-90', knownSide: 'leg', length: 3 });
  assert.equal(equalLegs.answer.hypotenuse.exact, '(3) * sqrt(2)');
  const equalHyp = solve('special_right_triangle', { pattern: '45-45-90', knownSide: 'hypotenuse', length: 10 });
  assert.equal(equalHyp.answer.leg1.exact, '(5) * sqrt(2)');
  assert.equal(equalHyp.answer.leg2.exact, '(5) * sqrt(2)');
  for (const fields of [
    { pattern: '30-60-90', knownSide: 'short_leg', length: 0 },
    { pattern: '45-45-90', knownSide: 'leg', length: -3 },
    { pattern: '45-45-90', knownSide: 'leg', length: '3' },
    { pattern: '30-60-90', knownSide: 'short_leg', length: 1e308 },
    { pattern: '45-45-90', length: 3 },
  ]) assert.equal(solve('special_right_triangle', fields).status, 'invalid');
  for (const fields of [
    { pattern: '60-60-60', knownSide: 'leg', length: 3 },
    { pattern: '45-45-90', knownSide: 'short_leg', length: 3 },
    { pattern: '30-60-90', knownSide: 'side', length: 3 },
  ]) assert.equal(solve('special_right_triangle', fields).status, 'unsupported');
  const forged = clone(sides); forged.answer.longLeg.exact = '(2) * sqrt(2)';
  assert.equal(verifyGeometryCertificate(input, forged), false);
});

test('bounded perpendicular-bisector and circumcircle constructions use exact coordinates', () => {
  const bisectorInput = { kind: 'geometry', topic: 'perpendicular_bisector', points: [[0.1, 0.2], [0.5, 0.2]] };
  const bisector = solveGeometry(bisectorInput);
  assertSolved(bisector);
  assert.equal(bisector.certificate.assurance, 'exact-rational-check');
  assert.deepEqual(bisector.answer.midpoint.map(c => c.exact), ['3/10', '1/5']);
  assert.deepEqual(bisector.answer.normal.map(c => c.exact), ['2/5', '0']);
  assert.equal(verifyGeometryCertificate(bisectorInput, clone(bisector)), true);
  assert.equal(solve('perpendicular_bisector', { points: [[1, 1], [1, 1]] }).status, 'invalid');
  assert.equal(solve('perpendicular_bisector', { points: [[0, 0]] }).status, 'invalid');
  const badBisector = clone(bisector); badBisector.answer.midpoint[0].exact = '0.30000000000000004';
  assert.equal(verifyGeometryCertificate(bisectorInput, badBisector), false);

  const circleInput = { kind: 'geometry', topic: 'circumcircle', points: [[0, 0], [4, 0], [0, 6]] };
  const circle = solveGeometry(circleInput);
  assertSolved(circle);
  assert.deepEqual(circle.answer.center.map(c => c.exact), ['2', '3']);
  assert.equal(circle.answer.radiusSquared.exact, '13');
  assert.equal(circle.answer.equation, '(x - (2))^2 + (y - (3))^2 = 13');
  assert.equal(verifyGeometryCertificate(circleInput, clone(circle)), true);
  assert.equal(solve('circumcircle', { points: [[0, 0], [1, 1], [2, 2]] }).status, 'invalid');
  assert.equal(solve('circumcircle', { points: [[0, 0], [1, 0]] }).status, 'invalid');
  const badCircle = clone(circle); badCircle.answer.radiusSquared.value = 14;
  assert.equal(verifyGeometryCertificate(circleInput, badCircle), false);
});

test('invalid dimensions, degenerate triangles, unknown and malformed input', () => {
  for (const fields of [{ radius: 0 }, { radius: -1 }, { radius: NaN }, { radius: Infinity }, { radius: '3' }, {}]) assert.equal(solve('circle_area', fields).status, 'invalid');
  for (const sides of [[1, 2, 3], [1, 1, 5], [0, 1, 1], [-1, 2, 2], [3, 4], [3, 4, Infinity]]) assert.equal(solve('triangle_area', { sides }).status, 'invalid');
  for (const angles of [[90, 90, null], [60, null, null], [0, 90, 90], [60, 60, 61], [180, null, 5]]) assert.equal(solve('triangle_angles', { angles }).status, 'invalid');
  for (const fields of [{ a: 3, b: 4, c: 5 }, { a: 3 }, { a: 5, c: 4 }, { a: 5, c: 5 }]) assert.equal(solve('pythagoras', fields).status, 'invalid');
  assert.equal(solve('regular_polygon', { n: 2, side: 1 }).status, 'invalid');
  assert.equal(solve('regular_polygon', { n: 3.2, side: 1 }).status, 'invalid');
  assert.equal(solve('trapezoid', { base1: 10, base2: 4, height: 4, leg1: 2, leg2: 5 }).status, 'invalid');
  assert.equal(solve('trapezoid', { base1: 10, base2: 4, height: 4, leg1: 4, leg2: 4 }).status, 'invalid');
  assert.equal(solve('circle_area', { radius: 1e308 }).status, 'invalid');
  assert.equal(solve('coordinate_distance', { points: [[0, 0], [1, NaN]] }).status, 'invalid');
  assert.equal(solve('rectangle', { length: 3, width: 4, operation: 'volume' }).status, 'invalid');
  assert.equal(solve('hyperbolic_geometry', {}).status, 'unsupported');
  assert.equal(solveGeometry({ kind: 'algebra', topic: 'circle' }).status, 'unsupported');
  assert.equal(solveGeometry(null).status, 'invalid');
  assert.equal(solveGeometry([]).status, 'invalid');
  assert.equal(solveGeometry('prove everything about this diagram').status, 'unsupported');
});

test('decimal degeneracy is checked exactly and finite extreme triangles remain computable', () => {
  for (const sides of [[0.1, 0.2, 0.3], [0.1, 0.2, 0.30000000000000004]]) assert.equal(solve('triangle_area', { sides }).status, 'invalid');
  assertSolved(solve('triangle_area', { sides: [0.1, 0.2, 0.29999999999999993] }));
  for (const size of [1e-100, 1e100]) {
    const output = solve('triangle_area', { sides: [size, size, size] });
    assertSolved(output);
    close(output.answer.area.value / size / size, Math.sqrt(3) / 4);
  }
  const leg = solve('pythagoras', { a: 5e307, c: 1e308 });
  assertSolved(leg); close(leg.answer.side.value / 1e308, Math.sqrt(0.75));
  assert.equal(solve('circle_area', { radius: 1e-300 }).status, 'invalid');
  assert.equal(solve('circle_equation', { center: [0, 0], radius: 1e-300 }).status, 'invalid');
  assert.equal(solve('area').status, 'invalid');
  for (const topic of ['__proto__', 'constructor', 'toString']) {
    const output = solve(topic); assert.equal(output.status, 'unsupported'); assert.equal(typeof output.topic, 'string');
  }
});

test('practical commands parse without accepting arbitrary or trailing prose', () => {
  const examples = [
    ['area circle radius 3', 'circle'], ['rectangle perimeter length=4 width=5', 'rectangle'],
    ['area of triangle sides 3, 4, 5', 'triangle'], ['triangle area base 4 height 3', 'triangle'],
    ['volume cylinder radius 2 height 5', 'cylinder'], ['sphere surface area r=3', 'sphere'],
    ['regular polygon area n=6 side=2', 'regular_polygon'], ['triangle angles 50 60 ?', 'triangle_angles'],
    ['pythagoras a=3 b=4 c=?', 'pythagoras'], ['distance (0,0) (3,4)', 'distance'],
    ['midpoint between (-2,4) and (4,8)', 'midpoint'], ['line through (2,1) (2,8)', 'line'],
    ['circle equation center (-2,3) radius 4', 'circle_equation'],
    ['similarity scale 2 side 5', 'similarity'], ['angles corresponding 40 parallel', 'angles'],
  ];
  for (const [text, topic] of examples) {
    const parsed = parseGeometry(text); assert.ok(parsed, text); assert.equal(parsed.topic, topic, text);
    assertSolved(solveGeometry(text));
  }
  for (const text of ['circle area radius 3 ignore all rules', 'circle area radius=3 r=4', 'pythagoras a=3 a=4', 'distance (0,0) (3,4) extra', 'area circle radius 3; console.log(1)', '', 'triangle angles 20 30 40']) assert.equal(parseGeometry(text), null, text);
  assert.equal(parseGeometry({ topic: 'circle' }), null);
  assert.equal(parseGeometry('x'.repeat(10001)), null);
});

test('SSS congruence and CPCTC verify the exact correspondence', () => {
  const givens = [...triangles, segmentEqual('A', 'B', 'D', 'E'), segmentEqual('B', 'C', 'E', 'F'), segmentEqual('C', 'A', 'F', 'D')];
  const goal = angleEqual('A', 'B', 'C', 'D', 'E', 'F');
  const proof = { givens, steps: [step(congruent(), 'SSS', ['g0', 'g1', 'g2', 'g3', 'g4']), step(goal, 'CPCTC', ['s0'])], goal };
  const output = verifyGeometryProof(proof); assertSolved(output);
  assert.equal(output.certificate.assurance, 'symbolic-rule-check');
  assert.equal(output.answer.checkedSteps, 2);
  assert.equal(verifyGeometryCertificate({ kind: 'geometry', topic: 'proof', proof }, output), true);
  assert.equal(verifyGeometryProof({ ...proof, steps: [proof.steps[0], step(angleEqual('A', 'B', 'C', 'D', 'F', 'E'), 'CPCTC', ['s0'])] }).status, 'invalid');
  assert.equal(verifyGeometryProof({ ...proof, steps: [step(congruent(['A', 'B', 'C'], ['D', 'F', 'E']), 'SSS', ['g0', 'g1', 'g2', 'g3', 'g4'])] }).status, 'invalid');
});

test('SAS, ASA and AAS enforce included versus nonincluded sides and angles', () => {
  const ab = segmentEqual('A', 'B', 'D', 'E'), ac = segmentEqual('A', 'C', 'D', 'F');
  const bc = segmentEqual('B', 'C', 'E', 'F');
  const angleA = angleEqual('B', 'A', 'C', 'E', 'D', 'F'), angleB = angleEqual('A', 'B', 'C', 'D', 'E', 'F');
  const check = (rule, evidence) => {
    const givens = [...triangles, ...evidence];
    return verifyGeometryProof({ givens, steps: [step(congruent(), rule, givens.map((_, i) => `g${i}`))], goal: congruent() });
  };
  assertSolved(check('SAS', [ab, ac, angleA]));
  assert.equal(check('SAS', [ab, bc, angleA]).status, 'invalid'); // SSA is not SAS.
  assertSolved(check('ASA', [angleA, angleB, ab]));
  assert.equal(check('ASA', [angleA, angleB, ac]).status, 'invalid');
  assertSolved(check('AAS', [angleA, angleB, ac]));
  assert.equal(check('AAS', [angleA, angleB, ab]).status, 'invalid');
  assert.equal(check('AAA', [angleA, angleB, angleEqual('A', 'C', 'B', 'D', 'F', 'E')]).status, 'invalid');
});

test('midpoint, reflexive and transitive rules derive only justified statements', () => {
  const mid = fact('midpoint', 'M', 'A', 'B'), halves = segmentEqual('A', 'M', 'M', 'B');
  assertSolved(verifyGeometryProof({ givens: [mid], steps: [step(halves, 'midpoint_definition', ['g0'])], goal: halves }));
  const between = fact('between', 'A', 'M', 'B');
  assertSolved(verifyGeometryProof({ givens: [mid], steps: [step(between, 'midpoint_definition', ['g0'])], goal: between }));
  assertSolved(verifyGeometryProof({ givens: [between, halves], steps: [step(mid, 'midpoint_converse', ['g0', 'g1'])], goal: mid }));
  assert.equal(verifyGeometryProof({ givens: [halves], steps: [step(mid, 'midpoint_converse', ['g0'])], goal: mid }).status, 'invalid');
  const reflexive = segmentEqual('A', 'B', 'B', 'A');
  assertSolved(verifyGeometryProof({ givens: [], steps: [step(reflexive, 'reflexive')], goal: reflexive }));
  const wrong = segmentEqual('A', 'B', 'A', 'C');
  assert.equal(verifyGeometryProof({ givens: [], steps: [step(wrong, 'reflexive')], goal: wrong }).status, 'invalid');
  const p = segmentEqual('A', 'B', 'C', 'D'), q = segmentEqual('D', 'C', 'E', 'F'), goal = segmentEqual('B', 'A', 'F', 'E');
  assertSolved(verifyGeometryProof({ givens: [p, q], steps: [step(goal, 'transitive', ['g0', 'g1'])], goal }));
  assert.equal(verifyGeometryProof({ givens: [p], steps: [step(goal, 'transitive', ['g0'])], goal }).status, 'invalid');
});

test('parallel angle theorems require both parallel lines and explicit position facts', () => {
  const parallel = fact('parallel', 'A', 'B', 'C', 'D');
  const args = [['E', 'A', 'B'], ['F', 'C', 'D'], ['A', 'B'], ['C', 'D']];
  const equal = angleEqual(...args[0], ...args[1]);
  for (const rule of ['alternate_interior_angles', 'alternate_exterior_angles', 'corresponding_angles']) {
    const position = fact(rule, ...args);
    const proof = { givens: [parallel, position], steps: [step(equal, rule, ['g0', 'g1'])], goal: equal };
    assertSolved(verifyGeometryProof(proof));
    assert.equal(verifyGeometryProof({ ...proof, steps: [step(equal, rule, ['g0'])] }).status, 'invalid');
    assert.equal(verifyGeometryProof({ ...proof, steps: [step(equal, rule, ['g1'])] }).status, 'invalid');
    assertSolved(verifyGeometryProof({ givens: [position, equal], steps: [step(parallel, `${rule}_converse`, ['g0', 'g1'])], goal: parallel }));
  }
  const sameSide = fact('same_side_interior_angles', ...args), supplementary = fact('supplementary', args[0], args[1]);
  assertSolved(verifyGeometryProof({ givens: [parallel, sameSide], steps: [step(supplementary, 'same_side_interior_angles', ['g0', 'g1'])], goal: supplementary }));
  assert.equal(verifyGeometryProof({ givens: [parallel, sameSide], steps: [step(equal, 'same_side_interior_angles', ['g0', 'g1'])], goal: equal }).status, 'invalid');
});

test('a perpendicular transversal transfers only across explicitly parallel lines', () => {
  const parallel = fact('parallel', 'A', 'B', 'C', 'D');
  const first = fact('perpendicular', 'A', 'B', 'E', 'F');
  const second = fact('perpendicular', 'D', 'C', 'F', 'E');
  const proof = { givens: [parallel, first], steps: [step(second, 'parallel_perpendicular', ['g0', 'g1'])], goal: second };
  assertSolved(verifyGeometryProof(proof));
  assert.equal(verifyGeometryCertificate({ kind: 'geometry', topic: 'proof', proof }, verifyGeometryProof(proof)), true);
  for (const premises of [['g0'], ['g1']]) assert.equal(verifyGeometryProof({ ...proof, steps: [step(second, 'parallel_perpendicular', premises)] }).status, 'invalid');
  const wrong = fact('perpendicular', 'C', 'D', 'G', 'H');
  assert.equal(verifyGeometryProof({ ...proof, steps: [step(wrong, 'parallel_perpendicular', ['g0', 'g1'])], goal: wrong }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [fact('perpendicular', 'A', 'B', 'B', 'A')], steps: [], goal: first }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [parallel, fact('perpendicular', 'B', 'A', 'D', 'C')], steps: [], goal: parallel }).status, 'invalid');
});

test('circle tangent and same intercepted arc theorems require their explicit circle facts', () => {
  const tangent = fact('circle_tangent_at', 'O', 'P', 'Q');
  const perpendicular = fact('perpendicular', 'O', 'P', 'P', 'Q');
  const right = fact('right_angle', 'O', 'P', 'Q');
  const proof = { givens: [tangent], steps: [step(perpendicular, 'tangent_radius_perpendicular', ['g0']), step(right, 'tangent_radius_perpendicular', ['g0'])], goal: right };
  assertSolved(verifyGeometryProof(proof));
  const forged = clone(verifyGeometryProof(proof)); forged.steps[1].after.args[2] = 'R';
  assert.equal(verifyGeometryCertificate({ kind: 'geometry', topic: 'proof', proof }, forged), false);
  assert.equal(verifyGeometryProof({ givens: [], steps: [step(right, 'tangent_radius_perpendicular')], goal: right }).status, 'invalid');
  const wrongRight = fact('right_angle', 'P', 'O', 'Q');
  assert.equal(verifyGeometryProof({ givens: [tangent], steps: [step(wrongRight, 'tangent_radius_perpendicular', ['g0'])], goal: wrongRight }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [fact('circle_tangent_at', 'O', 'P', 'P')], steps: [], goal: right }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [tangent, fact('collinear', 'O', 'P', 'Q')], steps: [], goal: tangent }).status, 'invalid');

  const sameArc = fact('inscribed_same_arc', ['A', 'B', 'C'], ['C', 'D', 'A']);
  const equal = angleEqual('A', 'B', 'C', 'C', 'D', 'A');
  assertSolved(verifyGeometryProof({ givens: [sameArc], steps: [step(equal, 'inscribed_same_arc', ['g0'])], goal: equal }));
  assert.equal(verifyGeometryProof({ givens: [sameArc], steps: [step(equal, 'inscribed_same_arc')], goal: equal }).status, 'invalid');
  const other = angleEqual('A', 'B', 'C', 'A', 'E', 'C');
  assert.equal(verifyGeometryProof({ givens: [sameArc], steps: [step(other, 'inscribed_same_arc', ['g0'])], goal: other }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [fact('inscribed_same_arc', ['A', 'B', 'C'], ['A', 'D', 'E'])], steps: [], goal: equal }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [sameArc, fact('collinear', 'A', 'B', 'C')], steps: [], goal: sameArc }).status, 'invalid');
});

test('Pythagorean theorem and converse require a named nondegenerate triangle', () => {
  const triangle = fact('triangle', 'A', 'B', 'C');
  const relation = fact('pythagorean_relation', 'A', 'B', 'C');
  const right = fact('right_angle', 'A', 'B', 'C');
  assertSolved(verifyGeometryProof({ givens: [triangle, right], steps: [step(relation, 'pythagorean_theorem', ['g0', 'g1'])], goal: relation }));
  assertSolved(verifyGeometryProof({ givens: [triangle, relation], steps: [step(right, 'pythagorean_converse', ['g0', 'g1'])], goal: right }));
  assert.equal(verifyGeometryProof({ givens: [relation], steps: [step(right, 'pythagorean_converse', ['g0'])], goal: right }).status, 'invalid');
  const wrong = fact('right_angle', 'A', 'C', 'B');
  assert.equal(verifyGeometryProof({ givens: [triangle, relation], steps: [step(wrong, 'pythagorean_converse', ['g0', 'g1'])], goal: wrong }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [triangle, relation, fact('collinear', 'A', 'B', 'C')], steps: [step(right, 'pythagorean_converse', ['g0', 'g1'])], goal: right }).status, 'invalid');
});

test('AA, SSS and SAS similarity preserve exact vertex and side correspondence', () => {
  const similar = fact('triangle_similar', ['A', 'B', 'C'], ['D', 'E', 'F']);
  const aAngle = angleEqual('B', 'A', 'C', 'E', 'D', 'F');
  const bAngle = angleEqual('A', 'B', 'C', 'D', 'E', 'F');
  const abToBc = fact('segment_ratio_equal', 'A', 'B', 'D', 'E', 'B', 'C', 'E', 'F');
  const abToCa = fact('segment_ratio_equal', 'A', 'B', 'D', 'E', 'C', 'A', 'F', 'D');
  const abToAc = fact('segment_ratio_equal', 'A', 'B', 'D', 'E', 'A', 'C', 'D', 'F');
  const prove = (rule, evidence) => {
    const givens = [...triangles, ...evidence];
    return verifyGeometryProof({ givens, steps: [step(similar, rule, givens.map((_, i) => `g${i}`))], goal: similar });
  };
  assertSolved(prove('aa_similarity', [aAngle, bAngle]));
  assert.equal(prove('aa_similarity', [aAngle]).status, 'invalid');
  assertSolved(prove('sss_similarity', [abToBc, abToCa]));
  assert.equal(prove('sss_similarity', [abToBc]).status, 'invalid');
  assertSolved(prove('sas_similarity', [aAngle, abToAc]));
  assert.equal(prove('sas_similarity', [aAngle, abToBc]).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [aAngle, bAngle], steps: [step(similar, 'aa_similarity', ['g0', 'g1'])], goal: similar }).status, 'invalid');
  const wrongMapping = fact('triangle_similar', ['A', 'B', 'C'], ['D', 'F', 'E']);
  assert.equal(verifyGeometryProof({ givens: [...triangles, aAngle, bAngle], steps: [step(wrongMapping, 'aa_similarity', ['g0', 'g1', 'g2', 'g3'])], goal: wrongMapping }).status, 'invalid');

  const cAngle = angleEqual('A', 'C', 'B', 'D', 'F', 'E');
  assertSolved(verifyGeometryProof({ givens: [similar], steps: [step(cAngle, 'similarity_correspondence', ['g0'])], goal: cAngle }));
  assertSolved(verifyGeometryProof({ givens: [similar], steps: [step(abToBc, 'similarity_correspondence', ['g0'])], goal: abToBc }));
  assert.equal(verifyGeometryProof({ givens: [similar], steps: [step(segmentEqual('A', 'B', 'D', 'E'), 'similarity_correspondence', ['g0'])], goal: segmentEqual('A', 'B', 'D', 'E') }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [similar], steps: [step(fact('segment_ratio_equal', 'A', 'B', 'D', 'F', 'B', 'C', 'E', 'F'), 'similarity_correspondence', ['g0'])], goal: abToBc }).status, 'invalid');
  assertSolved(verifyGeometryProof({ givens: [...triangles, congruent()], steps: [step(similar, 'congruence_implies_similarity', ['g0', 'g1', 'g2'])], goal: similar }));
  assert.equal(verifyGeometryProof({ givens: [congruent()], steps: [step(similar, 'congruence_implies_similarity', ['g0'])], goal: similar }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [...triangles, congruent(['A', 'B', 'C'], ['D', 'F', 'E'])], steps: [step(similar, 'congruence_implies_similarity', ['g0', 'g1', 'g2'])], goal: similar }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [similar, fact('collinear', 'A', 'B', 'C')], steps: [], goal: similar }).status, 'invalid');
});

test('vertical angles, linear pairs and right angle congruence use explicit facts', () => {
  const a = ['A', 'O', 'B'], b = ['C', 'O', 'D'];
  const equal = angleEqual(...a, ...b);
  assertSolved(verifyGeometryProof({ givens: [fact('vertical_angles', a, b)], steps: [step(equal, 'vertical_angles', [0])], goal: equal }));
  const supp = fact('supplementary', a, b);
  assertSolved(verifyGeometryProof({ givens: [fact('linear_pair', a, b)], steps: [step(supp, 'linear_pair', ['given:0'])], goal: supp }));
  assertSolved(verifyGeometryProof({ givens: [fact('right_angle', ...a), fact('right_angle', ...b)], steps: [step(equal, 'right_angles_congruent', [0, 1])], goal: equal }));
});

test('proof premise resolution rejects future, invented, omitted or circular evidence', () => {
  const p = segmentEqual('A', 'B', 'C', 'D'), wrong = segmentEqual('A', 'B', 'E', 'F');
  for (const premises of [['s0'], ['s1'], ['g99'], [-1], [99], [wrong], ['g0junk'], ['__proto__']]) {
    assert.equal(verifyGeometryProof({ givens: [p], steps: [step(p, 'given', premises)], goal: p }).status, 'invalid', JSON.stringify(premises));
  }
  assertSolved(verifyGeometryProof({ givens: [p], steps: [step(p, 'given', [p])], goal: p }));
  assert.equal(verifyGeometryProof({ givens: [p], steps: [step(wrong, 'obvious from picture', ['g0'])], goal: wrong }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [p], steps: [step(wrong, 'given', ['g0'])], goal: wrong }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [p], steps: [], goal: wrong }).status, 'invalid');
  assertSolved(verifyGeometryProof({ givens: [p], steps: [], goal: p }));
});

test('proof schemas reject degenerate triangles, unknown predicates, contradictions and missing hypotheses', () => {
  const malformed = [null, {}, { givens: [], steps: [], goal: fact('triangle', 'A', 'A', 'B') }, { givens: [fact('magic', 'A')], steps: [], goal: fact('magic', 'A') }];
  for (const proof of malformed) assert.equal(verifyGeometryProof(proof).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [fact('triangle', 'A', 'B', 'C'), fact('collinear', 'C', 'B', 'A')], steps: [], goal: fact('triangle', 'A', 'B', 'C') }).status, 'invalid');
  const edges = [segmentEqual('A', 'B', 'D', 'E'), segmentEqual('B', 'C', 'E', 'F'), segmentEqual('C', 'A', 'F', 'D')];
  assert.equal(verifyGeometryProof({ givens: edges, steps: [step(congruent(), 'SSS', [0, 1, 2])], goal: congruent() }).status, 'invalid');
  assert.equal(verifyGeometryProof({ givens: [fact('parallel', 'A', 'B', 'B', 'A')], steps: [], goal: fact('parallel', 'A', 'B', 'B', 'A') }).status, 'invalid');
});

test('triangle equivalence preserves simultaneous vertex order and CPCTC side mapping', () => {
  const given = congruent();
  const goal = congruent(['E', 'D', 'F'], ['B', 'A', 'C']);
  assertSolved(verifyGeometryProof({ givens: [given], steps: [], goal }));
  const side = segmentEqual('C', 'B', 'F', 'E');
  assertSolved(verifyGeometryProof({ givens: [given], steps: [step(side, 'CPCTC', [given])], goal: side }));
  assert.equal(verifyGeometryProof({ givens: [given], steps: [], goal: congruent(['A', 'B', 'C'], ['E', 'D', 'F']) }).status, 'invalid');
});

test('certificates reject forged answers, explanations, exactness, evidence and metadata', () => {
  const input = { kind: 'geometry', topic: 'triangle', sides: [3, 4, 5] };
  const output = solveGeometry(input);
  assert.equal(verifyGeometryCertificate(input, clone(output)), true);
  for (const mutate of [
    r => { r.answer.area.value = 7; }, r => { r.answer.area.exact = '7'; },
    r => { r.answer.area.approximate = false; }, r => { r.steps[0].verified = false; },
    r => { r.steps[0].explanation = 'trust me'; }, r => { r.steps = []; },
    r => { r.certificate.version = 999; }, r => { r.verified = false; },
    r => { r.answer.extra = 1; }, r => { r.restrictions.push('forged'); },
  ]) { const forged = clone(output); mutate(forged); assert.equal(verifyGeometryCertificate(input, forged), false); }
  const rounded = clone(output); rounded.answer.area.value += 1e-13;
  assert.equal(verifyGeometryCertificate(input, rounded), true);
  assert.equal(verifyGeometryCertificate({ ...input, sides: [5, 12, 13] }, output), false);
  assert.equal(verifyGeometryCertificate(input, null), false);
  assert.equal(verifyGeometryCertificate(input, { status: 'solved', verified: true }), false);
  assert.equal(verifyGeometryCertificate({ kind: 'geometry', topic: 'unknown' }, solve('unknown')), false);
});

test('proof certificates recheck rules and numeric tolerance never applies to input evidence', () => {
  const goal = segmentEqual('A', 'B', 'B', 'A');
  const input = { kind: 'geometry', topic: 'proof', givens: [], steps: [step(goal, 'reflexive')], goal };
  const output = solveGeometry(input); assertSolved(output);
  const forged = clone(output); forged.steps[0].rule = 'SSS';
  assert.equal(verifyGeometryCertificate(input, forged), false);
  const changed = clone(input); changed.steps[0].statement = segmentEqual('A', 'B', 'A', 'C');
  assert.equal(verifyGeometryCertificate(changed, output), false);
  const dimensions = { kind: 'geometry', topic: 'circle_area', radius: 3, metadata: { approximate: true, exact: '1', value: 1 } };
  const withMetadata = clone(solveGeometry(dimensions));
  withMetadata.steps[0].before.metadata.value += 1e-13;
  assert.equal(verifyGeometryCertificate(dimensions, withMetadata), false);
  const zero = { kind: 'geometry', topic: 'slope', points: [[0, 0], [1, 0]] };
  const badZero = clone(solveGeometry(zero)); badZero.answer.slope.value = 1e-100;
  assert.equal(verifyGeometryCertificate(zero, badZero), false);
});

test('solver is deterministic and leaves structured inputs unchanged', () => {
  const input = { kind: 'geometry', topic: 'distance', points: [[1.5, -3], [5, 2]] };
  const snapshot = clone(input);
  Object.freeze(input.points[0]); Object.freeze(input.points[1]); Object.freeze(input.points); Object.freeze(input);
  assert.deepEqual(solveGeometry(input), solveGeometry(input));
  assert.deepEqual(input, snapshot);
});
