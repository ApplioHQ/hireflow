// Real rational conics, exact square completion, and deterministic replay.
import {
  Q, MathError, parseExpression, parseStatement, constantValue, rationalFunction,
  rationalSqrt, polynomial, polySymbol, pAdd, pSub, pMul, pScale, pEqual, pPrint, walk,
} from './core.js';

const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => { throw new MathError(message, 'invalid'); };
const unsupported = message => { throw new MathError(message, 'unsupported'); };
const step = (before, after, rule, explanation) => ({ before, after, rule, explanation, verified: true });
const magnitude = q => q.n < 0n ? q.neg() : q;
const point = coordinates => coordinates.map(String);
const root = q => { const exact = rationalSqrt(q); return exact === null ? `sqrt(${q})` : String(exact); };

function coordinateVariables(input) {
  if (!own(input, 'variables')) return ['x', 'y'];
  const names = input.variables;
  if (!Array.isArray(names) || names.length !== 2 || names[0] === names[1])
    invalid('variables must contain two distinct coordinate names.');
  return Array.from(names, name => {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) ||
        ['pi', 'e', 'i', '__proto__', 'prototype', 'constructor'].includes(name.toLowerCase()))
      invalid('Each coordinate must be a supported variable name, not a built-in constant.');
    let ast;
    try { ast = parseExpression(name); } catch { invalid(`Unsupported coordinate name: ${name}.`); }
    if (ast.type !== 'sym' || ast.name !== name) invalid(`Unsupported coordinate name: ${name}.`);
    return name;
  });
}

function hasSymbol(ast) {
  let found = false;
  walk(ast, node => { if (node.type === 'sym') found = true; });
  return found;
}

// Inspect original syntax as well as the expanded polynomial: cancelling a
// variable denominator would otherwise silently erase a hole in the real locus.
function validateSyntax(ast, variables) {
  if (ast.type === 'sym') {
    if (!variables.includes(ast.name)) unsupported(`Only coordinates ${variables.join(', ')} and rational coefficients are supported.`);
    return;
  }
  if (ast.type === 'num') return;
  if (ast.type === 'neg') { validateSyntax(ast.arg, variables); return; }
  if (ast.type === 'call') {
    ast.args.forEach(arg => validateSyntax(arg, variables));
    constantValue(ast); // A function call is permitted only as a rational constant.
    return;
  }
  validateSyntax(ast.left, variables); validateSyntax(ast.right, variables);
  if (ast.op === '/') {
    if (hasSymbol(ast.right)) unsupported('Conics cannot contain variable denominators, including cancelled denominators.');
    if (constantValue(ast.right).zero) invalid('Division by zero is undefined.');
  }
  if (ast.op === '^') {
    const exponent = constantValue(ast.right);
    if (!exponent.integer || exponent.cmp(-32) < 0 || exponent.cmp(32) > 0)
      unsupported('Polynomial powers must be integers from -32 through 32.');
    if (exponent.n < 0n && hasSymbol(ast.left)) unsupported('Negative powers of coordinates are variable denominators.');
    if (!hasSymbol(ast.left) && exponent.n <= 0n && constantValue(ast.left).zero)
      invalid('Zero to a nonpositive exponent is undefined.');
  }
}

function constantDenominatorPolynomial(ast) {
  const value = rationalFunction(ast);
  if ([...value.den.keys()].some(key => key !== '')) unsupported('Variable denominators are unsupported.');
  const denominator = value.den.get('') ?? Q(0);
  if (denominator.zero) invalid('Division by zero is undefined.');
  return pScale(value.num, Q(1).div(denominator));
}

function extractCoefficients(residual, variables) {
  for (const key of residual.keys()) {
    if (!key) continue;
    const exponents = key.split('|').map(entry => {
      const index = entry.lastIndexOf(':');
      return [entry.slice(0, index), Number(entry.slice(index + 1))];
    });
    if (exponents.reduce((sum, [, degree]) => sum + degree, 0) > 2)
      unsupported('Only polynomials of total degree at most two are conics.');
    if (exponents.some(([name]) => !variables.includes(name)))
      unsupported('Only the two requested coordinates are supported.');
  }
  const [x, y] = variables, coefficient = key => residual.get(key) ?? Q(0);
  const mixed = [x, y].sort((left, right) => left.localeCompare(right))
    .map(name => `${name}:1`).join('|');
  return { A: coefficient(`${x}:2`), B: coefficient(mixed), C: coefficient(`${y}:2`),
    D: coefficient(`${x}:1`), E: coefficient(`${y}:1`), F: coefficient('') };
}

function difference(variable, offset) {
  if (offset.zero) return variable;
  return `${variable} ${offset.n < 0n ? '+' : '-'} ${magnitude(offset)}`;
}
const square = (variable, offset) => offset.zero ? `${variable}^2` : `(${difference(variable, offset)})^2`;

function weightedSum(terms) {
  let result = '';
  for (const [coefficient, body] of terms) {
    if (coefficient.zero) continue;
    const abs = magnitude(coefficient);
    const term = abs.eq(1) ? body : `(${abs})*${body}`;
    result += `${result ? coefficient.n < 0n ? ' - ' : ' + ' : coefficient.n < 0n ? '-' : ''}${term}`;
  }
  return result || '0';
}

function shiftedRoot(offset, radicand, sign) {
  const exact = rationalSqrt(radicand);
  if (exact !== null) return String(offset.add(exact.mul(sign)));
  const radical = root(radicand);
  if (offset.zero) return sign < 0 ? `-${radical}` : radical;
  return `${offset} ${sign < 0 ? '-' : '+'} ${radical}`;
}

function endpoints(center, axis, squaredDistance) {
  return [-1, 1].map(sign => center.map((q, index) => index === axis ?
    shiftedRoot(q, squaredDistance, sign) : String(q)));
}

function diagonalLines(variables, center, A, C) {
  const slope = root(A.neg().div(C));
  return [1, -1].map(sign => `${difference(variables[1], center[1])} = (${sign < 0 ? '-' : ''}${slope})*(${difference(variables[0], center[0])})`);
}

function complete(coefficients, variables, residual) {
  const { A, C, D, E, F } = coefficients;
  const h = A.zero ? Q(0) : D.neg().div(A.mul(2));
  const k = C.zero ? Q(0) : E.neg().div(C.mul(2));
  const K = F.neg().add(A.mul(h.mul(h))).add(C.mul(k.mul(k)));
  const [x, y] = variables;
  const xShift = pSub(polySymbol(x), polynomial(h)), yShift = pSub(polySymbol(y), polynomial(k));
  let completed = pAdd(pScale(pMul(xShift, xShift), A), pScale(pMul(yShift, yShift), C));
  if (A.zero) completed = pAdd(completed, pScale(polySymbol(x), D));
  if (C.zero) completed = pAdd(completed, pScale(polySymbol(y), E));
  completed = pAdd(completed, polynomial(K.neg()));
  if (!pEqual(residual, completed)) unsupported('Exact square-completion identity check failed.');
  const equation = `${weightedSum([[A, square(x, h)], [C, square(y, k)],
    [A.zero ? D : Q(0), x], [C.zero ? E : Q(0), y]])} = ${K}`;
  return { h, k, K, equation, polynomial: completed };
}

function centralConic(coefficients, completion, variables) {
  const { A, C } = coefficients, { h, k, K, equation } = completion;
  const center = [h, k], sameSign = A.n > 0n === C.n > 0n;
  const answer = { classification: '', degenerate: K.zero, realLocus: 'nonempty', center: point(center), standardForm: equation };
  if (K.zero) {
    if (sameSign) {
      answer.classification = 'point'; answer.point = point(center);
    } else {
      answer.classification = 'intersecting_lines'; answer.lines = diagonalLines(variables, center, A, C);
    }
    return answer;
  }
  const denominators = [K.div(A), K.div(C)];
  if (sameSign && denominators[0].n < 0n) {
    answer.classification = 'empty'; answer.realLocus = 'empty';
    answer.family = A.eq(C) ? 'circle' : 'ellipse';
    answer.reason = 'The two squared terms have the same sign, opposite to the nonzero right-hand side.';
    return answer;
  }
  const squares = variables.map((variable, index) => square(variable, center[index]));
  if (sameSign && A.eq(C)) {
    const radiusSquared = denominators[0];
    answer.classification = 'circle'; answer.radiusSquared = String(radiusSquared); answer.radius = root(radiusSquared);
    answer.foci = [point(center), point(center)];
    answer.standardForm = `${squares[0]} + ${squares[1]} = ${radiusSquared}`;
    return answer;
  }
  if (sameSign) {
    const axis = denominators[0].cmp(denominators[1]) > 0 ? 0 : 1;
    const aSquared = denominators[axis], bSquared = denominators[1 - axis], cSquared = aSquared.sub(bSquared);
    Object.assign(answer, { classification: 'ellipse', semiaxesSquared: denominators.map(String),
      semiMajorSquared: String(aSquared), semiMinorSquared: String(bSquared),
      semiMajor: root(aSquared), semiMinor: root(bSquared), majorAxis: variables[axis],
      focalDistanceSquared: String(cSquared), foci: endpoints(center, axis, cSquared),
      vertices: endpoints(center, axis, aSquared), covertices: endpoints(center, 1 - axis, bSquared),
      standardForm: `${squares[0]}/(${denominators[0]}) + ${squares[1]}/(${denominators[1]}) = 1` });
    return answer;
  }
  const axis = denominators[0].n > 0n ? 0 : 1;
  const aSquared = denominators[axis], bSquared = denominators[1 - axis].neg(), cSquared = aSquared.add(bSquared);
  Object.assign(answer, { classification: 'hyperbola', orientation: axis === 0 ? 'horizontal' : 'vertical',
    transverseAxis: variables[axis], semiaxesSquared: denominators.map(q => String(magnitude(q))),
    transverseSemiAxisSquared: String(aSquared), conjugateSemiAxisSquared: String(bSquared),
    focalDistanceSquared: String(cSquared), foci: endpoints(center, axis, cSquared),
    vertices: endpoints(center, axis, aSquared), asymptotes: diagonalLines(variables, center, A, C),
    standardForm: `${squares[axis]}/(${aSquared}) - ${squares[1 - axis]}/(${bSquared}) = 1` });
  return answer;
}

function rankOneConic(coefficients, completion, variables) {
  const { A, C, D, E } = coefficients, { h, k, K, equation } = completion;
  const squaredAxis = A.zero ? 1 : 0, axis = 1 - squaredAxis;
  const quadratic = A.zero ? C : A, linear = A.zero ? D : E;
  if (!linear.zero) {
    const vertex = [h, k]; vertex[axis] = K.div(linear);
    const p = linear.neg().div(quadratic.mul(4)), focus = [...vertex];
    focus[axis] = focus[axis].add(p);
    return { classification: 'parabola', degenerate: false, realLocus: 'nonempty',
      orientation: axis === 0 ? 'horizontal' : 'vertical', axis: variables[axis],
      opening: axis === 0 ? p.n > 0n ? 'right' : 'left' : p.n > 0n ? 'up' : 'down',
      vertex: point(vertex), focalParameter: String(p), focus: point(focus), foci: [point(focus)],
      directrix: `${variables[axis]} = ${vertex[axis].sub(p)}`,
      standardForm: `${square(variables[squaredAxis], vertex[squaredAxis])} = (${p.mul(4)})*(${difference(variables[axis], vertex[axis])})` };
  }
  const squaredOffset = K.div(quadratic), offset = squaredAxis === 0 ? h : k;
  const answer = { classification: '', degenerate: true, realLocus: 'nonempty', standardForm: equation };
  if (squaredOffset.n < 0n) {
    answer.classification = 'empty'; answer.realLocus = 'empty';
    answer.reason = 'The remaining real square would have to be negative.';
  } else if (squaredOffset.zero) {
    answer.classification = 'double_line'; answer.lines = [`${variables[squaredAxis]} = ${offset}`];
    answer.lineMultiplicity = 2;
  } else {
    answer.classification = 'parallel_lines';
    answer.lines = [-1, 1].map(sign => `${variables[squaredAxis]} = ${shiftedRoot(offset, squaredOffset, sign)}`);
    answer.separation = { exact: `2*(${root(squaredOffset)})`, squared: String(squaredOffset.mul(4)) };
  }
  return answer;
}

function linearLocus(coefficients, completion, residual) {
  const { D, E, F } = coefficients;
  if (D.zero && E.zero) return F.zero ?
    { classification: 'plane', degenerate: true, realLocus: 'all', standardForm: '0 = 0' } :
    { classification: 'empty', degenerate: true, realLocus: 'empty', standardForm: completion.equation,
      reason: 'A nonzero constant cannot equal zero.' };
  const line = `${pPrint(residual)} = 0`;
  return { classification: 'line', degenerate: true, realLocus: 'nonempty', standardForm: line, lines: [line] };
}

function primitiveDirection(first, second) {
  const gcd = (left, right) => {
    left = left < 0n ? -left : left; right = right < 0n ? -right : right;
    while (right) [left, right] = [right, left % right];
    return left;
  };
  const denominator = first.d / gcd(first.d, second.d) * second.d;
  const p = first.n * (denominator / first.d), q = second.n * (denominator / second.d);
  const common = gcd(p, q);
  return [Q(p / common), Q(q / common)];
}

// Orthogonal directions can be rational even when their unit vectors are not.
// Keeping their common norm in the coefficients makes every displayed equation
// a rational polynomial in the original coordinates.
function rotatedFrame({ A, B, C, D, E, F }, variables, residual) {
  if ([A, B, C, D, E, F].some(value =>
    value.n.toString().length > 256 || value.d.toString().length > 256))
    unsupported('Mixed-term diagonalization exceeds the exact coefficient bound.');
  const discriminant = A.sub(C).pow(2).add(B.pow(2));
  const delta = rationalSqrt(discriminant);
  if (delta === null) unsupported('The quadratic matrix has irrational eigenvalues; exact rational diagonalization is unavailable.');
  const eigenvalues = [A.add(C).add(delta).div(2), A.add(C).sub(delta).div(2)];
  const [p, q] = primitiveDirection(B, eigenvalues[0].sub(A).mul(2));
  const N = p.pow(2).add(q.pow(2));
  const halfB = B.div(2);
  if (N.zero || !A.mul(p).add(halfB.mul(q)).eq(eigenvalues[0].mul(p)) ||
      !halfB.mul(p).add(C.mul(q)).eq(eigenvalues[0].mul(q)))
    unsupported('The rational eigenvector identity failed.');
  const [x, y] = variables, X = polySymbol(x), Y = polySymbol(y);
  const forms = [pAdd(pScale(X, p), pScale(Y, q)), pAdd(pScale(X, q.neg()), pScale(Y, p))];
  const names = forms.map(pPrint), quadratic = eigenvalues.map(value => value.div(N));
  const linear = [D.mul(p).add(E.mul(q)).div(N), E.mul(p).sub(D.mul(q)).div(N)];
  const [a, c] = quadratic, [d, e] = linear;
  const reconstructed = pAdd(pAdd(pScale(pMul(forms[0], forms[0]), a),
    pScale(pMul(forms[1], forms[1]), c)),
    pAdd(pAdd(pScale(forms[0], d), pScale(forms[1], e)), polynomial(F)));
  if (!pEqual(residual, reconstructed)) unsupported('The rational matrix diagonalization identity failed.');
  const offsets = [a.zero ? Q(0) : d.neg().div(a.mul(2)),
    c.zero ? Q(0) : e.neg().div(c.mul(2))];
  const K = F.neg().add(a.mul(offsets[0].pow(2))).add(c.mul(offsets[1].pow(2)));
  const shifted = forms.map((form, index) => pSub(form, polynomial(offsets[index])));
  let completed = pAdd(pScale(pMul(shifted[0], shifted[0]), a),
    pScale(pMul(shifted[1], shifted[1]), c));
  if (a.zero) completed = pAdd(completed, pScale(forms[0], d));
  if (c.zero) completed = pAdd(completed, pScale(forms[1], e));
  completed = pAdd(completed, polynomial(K.neg()));
  if (!pEqual(residual, completed)) unsupported('The rotated square-completion identity failed.');
  const squares = names.map((name, index) => `(${difference(name, offsets[index])})^2`);
  const equation = `${weightedSum([[a, squares[0]], [c, squares[1]],
    [a.zero ? d : Q(0), `(${names[0]})`], [c.zero ? e : Q(0), `(${names[1]})`]])} = ${K}`;
  return { p, q, N, eigenvalues, quadratic, linear, names, offsets, K, squares,
    equation, polynomial: completed,
    details: { matrix: [[String(A), String(halfB)], [String(halfB), String(C)]],
      eigenvalues: eigenvalues.map(String), directions: [[String(p), String(q)],
        [String(q.neg()), String(p)]], normSquared: String(N), coordinates: names,
      quadraticCoefficients: quadratic.map(String) } };
}

function originalPoint(frame, coordinates) {
  const { p, q, N } = frame, [s, t] = coordinates;
  return [p.mul(s).sub(q.mul(t)).div(N), q.mul(s).add(p.mul(t)).div(N)];
}

function rotatedEndpoints(frame, center, axis, distanceSquared) {
  const direction = axis === 0 ? [frame.p, frame.q] : [frame.q.neg(), frame.p];
  return [-1, 1].map(sign => center.map((coordinate, index) => {
    const component = direction[index];
    return component.zero ? String(coordinate) : shiftedRoot(coordinate,
      component.pow(2).mul(distanceSquared).div(frame.N), sign * (component.n < 0n ? -1 : 1));
  }));
}

function rotatedLines(frame) {
  const [s, t] = frame.names, [h, k] = frame.offsets;
  const slope = root(frame.quadratic[0].neg().div(frame.quadratic[1]));
  return [1, -1].map(sign => `(${difference(t, k)}) = (${sign < 0 ? '-' : ''}${slope})*(${difference(s, h)})`);
}

function rotatedCentral(frame) {
  const [a, c] = frame.quadratic, { K, equation, squares, N } = frame;
  const center = originalPoint(frame, frame.offsets);
  const sameSign = (a.n > 0n) === (c.n > 0n);
  const answer = { classification: '', degenerate: K.zero, realLocus: 'nonempty',
    center: point(center), standardForm: equation, orientation: 'rotated' };
  if (K.zero) {
    if (sameSign) { answer.classification = 'point'; answer.point = point(center); }
    else { answer.classification = 'intersecting_lines'; answer.lines = rotatedLines(frame); }
    return answer;
  }
  const coordinateSquares = [K.div(a), K.div(c)];
  if (sameSign && coordinateSquares[0].n < 0n) {
    Object.assign(answer, { classification: 'empty', realLocus: 'empty', family: 'ellipse',
      reason: 'The two squared terms have the same sign, opposite to the nonzero right-hand side.' });
    return answer;
  }
  const physicalSquares = coordinateSquares.map(value => value.div(N));
  if (sameSign) {
    const axis = physicalSquares[0].cmp(physicalSquares[1]) > 0 ? 0 : 1;
    const major = physicalSquares[axis], minor = physicalSquares[1 - axis], focal = major.sub(minor);
    Object.assign(answer, { classification: 'ellipse', semiaxesSquared: physicalSquares.map(String),
      semiMajorSquared: String(major), semiMinorSquared: String(minor),
      semiMajor: root(major), semiMinor: root(minor), majorAxis: frame.names[axis],
      focalDistanceSquared: String(focal), foci: rotatedEndpoints(frame, center, axis, focal),
      vertices: rotatedEndpoints(frame, center, axis, major),
      covertices: rotatedEndpoints(frame, center, 1 - axis, minor),
      standardForm: `${squares[0]}/(${coordinateSquares[0]}) + ${squares[1]}/(${coordinateSquares[1]}) = 1` });
    return answer;
  }
  const axis = coordinateSquares[0].n > 0n ? 0 : 1;
  const major = physicalSquares[axis], minor = physicalSquares[1 - axis].neg(), focal = major.add(minor);
  Object.assign(answer, { classification: 'hyperbola', transverseAxis: frame.names[axis],
    semiaxesSquared: physicalSquares.map(value => String(magnitude(value))),
    transverseSemiAxisSquared: String(major), conjugateSemiAxisSquared: String(minor),
    focalDistanceSquared: String(focal), foci: rotatedEndpoints(frame, center, axis, focal),
    vertices: rotatedEndpoints(frame, center, axis, major), asymptotes: rotatedLines(frame),
    standardForm: `${squares[axis]}/(${coordinateSquares[axis]}) - ${squares[1 - axis]}/(${coordinateSquares[1 - axis].neg()}) = 1` });
  return answer;
}

function rotatedRankOne(frame) {
  const [a] = frame.quadratic, { K, equation, N } = frame;
  const squared = a.zero ? 1 : 0, free = 1 - squared;
  const quadratic = frame.quadratic[squared], linear = frame.linear[free];
  const offset = frame.offsets[squared];
  if (!linear.zero) {
    const vertexCoordinates = [...frame.offsets]; vertexCoordinates[free] = K.div(linear);
    const vertex = originalPoint(frame, vertexCoordinates);
    const parameter = linear.neg().div(quadratic.mul(4));
    const focusCoordinates = [...vertexCoordinates]; focusCoordinates[free] = focusCoordinates[free].add(parameter);
    const focus = point(originalPoint(frame, focusCoordinates));
    const physicalParameter = root(parameter.pow(2).div(N));
    return { classification: 'parabola', degenerate: false, realLocus: 'nonempty',
      orientation: 'rotated', axis: frame.names[free],
      opening: parameter.n > 0n ? 'positive' : 'negative',
      vertex: point(vertex), focalParameter: parameter.n < 0n ? `-${physicalParameter}` : physicalParameter,
      focus, foci: [focus], directrix: `(${frame.names[free]}) = ${vertexCoordinates[free].sub(parameter)}`,
      standardForm: `${frame.squares[squared]} = (${parameter.mul(4)})*(${difference(frame.names[free], vertexCoordinates[free])})` };
  }
  const squaredOffset = K.div(quadratic), answer = {
    classification: '', degenerate: true, realLocus: 'nonempty',
    orientation: 'rotated', standardForm: equation };
  if (squaredOffset.n < 0n) {
    answer.classification = 'empty'; answer.realLocus = 'empty';
    answer.reason = 'The remaining real square would have to be negative.';
  } else if (squaredOffset.zero) {
    answer.classification = 'double_line'; answer.lines = [`(${frame.names[squared]}) = ${offset}`];
    answer.lineMultiplicity = 2;
  } else {
    answer.classification = 'parallel_lines';
    answer.lines = [-1, 1].map(sign => `(${frame.names[squared]}) = ${shiftedRoot(offset, squaredOffset, sign)}`);
    answer.separation = { exact: `2*(${root(squaredOffset.div(N))})`,
      squared: String(squaredOffset.mul(4).div(N)) };
  }
  return answer;
}

function standardFormMultiplier(residual, standardForm) {
  const statement = parseStatement(standardForm);
  const standard = pSub(constantDenominatorPolynomial(statement.left), constantDenominatorPolynomial(statement.right));
  if (!residual.size && !standard.size) return Q(1);
  const term = [...standard].find(([, coefficient]) => !coefficient.zero);
  if (!term || !residual.has(term[0])) unsupported('The standard form lost the original equation.');
  const multiplier = residual.get(term[0]).div(term[1]);
  if (multiplier.zero || !pEqual(residual, pScale(standard, multiplier)))
    unsupported('The exact standard-form polynomial check failed.');
  return multiplier;
}

function compute(input) {
  if (!record(input)) invalid('Supply a structured conic request.');
  if (!own(input, 'kind') || input.kind !== 'conic') unsupported('Expected kind conic.');
  if (!own(input, 'equation') || typeof input.equation !== 'string') invalid('equation must be a mathematical equation string.');
  const variables = coordinateVariables(input), source = input.equation, statement = parseStatement(source);
  if (statement.kind !== 'equation') invalid('Conic input must be a single equation using =.');
  validateSyntax(statement.left, variables); validateSyntax(statement.right, variables);
  const residual = pSub(constantDenominatorPolynomial(statement.left), constantDenominatorPolynomial(statement.right));
  const coefficients = extractCoefficients(residual, variables);
  const { A, B, C } = coefficients, rotated = !B.zero;
  const frame = rotated ? rotatedFrame(coefficients, variables, residual) : null;
  const completion = frame ? { h: frame.offsets[0], k: frame.offsets[1], K: frame.K,
    equation: frame.equation, polynomial: frame.polynomial } : complete(coefficients, variables, residual);
  const answer = frame ? frame.quadratic.every(value => !value.zero) ? rotatedCentral(frame) : rotatedRankOne(frame) :
    !A.zero && !C.zero ? centralConic(coefficients, completion, variables) :
      !A.zero || !C.zero ? rankOneConic(coefficients, completion, variables) : linearLocus(coefficients, completion, residual);
  if (frame) answer.diagonalization = frame.details;
  answer.variables = [...variables]; answer.exact = true;
  const multiplier = standardFormMultiplier(residual, answer.standardForm);
  const normalized = `${pPrint(residual)} = 0`;
  const steps = [
    step(source, normalized, 'rational-polynomial-normalization',
      'Move all terms to the left and expand with exact rational polynomial arithmetic.'),
    ...(frame ? [step(normalized, frame.equation, 'rational-symmetric-diagonalization',
      'Diagonalize the rational symmetric quadratic matrix using orthogonal rational directions, complete its squares, and verify the expanded polynomial identity.')] :
      [step(normalized, completion.equation, 'completing-the-square',
        'Use h = -D/(2A) and k = -E/(2C) for each nonzero quadratic coefficient; verify the expanded polynomial identity.')]),
    step(completion.equation, answer.standardForm, 'conic-classification',
      `Exact coefficient and right-hand-side signs establish the real-locus classification: ${answer.classification}. The standard form differs only by a nonzero rational multiplier.`),
  ];
  if (answer.foci || answer.lines || answer.asymptotes) steps.push(step(answer.standardForm,
    JSON.stringify({ ...(answer.foci ? { foci: answer.foci } : {}),
      ...(answer.directrix ? { directrix: answer.directrix } : {}),
      ...(answer.asymptotes ? { asymptotes: answer.asymptotes } : {}),
      ...(answer.lines ? { lines: answer.lines } : {}) }), 'exact-conic-geometry',
    'Use the exact squared-axis relations, signed parabola parameter, or factored homogeneous equation. Square roots remain exact expressions.'));
  return { status: 'solved', verified: true, topic: 'conic', answer, steps,
    restrictions: [`${variables.join(', ')} are real coordinates.`],
    certificate: { type: 'conic', version: 1, assurance: 'exact-rational-polynomial-replay',
      input: { kind: 'conic', equation: source, variables: [...variables] },
      coefficients: Object.fromEntries(Object.entries(coefficients).map(([key, q]) => [key, String(q)])),
      completion: { h: String(completion.h), k: String(completion.k), rightHandSide: String(completion.K) },
      ...(frame ? { diagonalization: frame.details } : {}),
      evidence: { normalizedPolynomial: pPrint(residual), completedPolynomial: pPrint(completion.polynomial),
        standardFormMultiplier: String(multiplier) } } };
}

/** Solve a rational real conic. Coordinate arrays follow input.variables
 * (default x,y). Mixed terms require rational eigenvalues; semiaxesSquared
 * follows the reported orthogonal directions for rotated forms. */
export function solveConic(input) {
  try { return compute(input); } catch (error) {
    return { status: error.code === 'invalid' ? 'invalid' : 'unsupported', verified: false,
      topic: 'conic', answer: {}, steps: [], restrictions: [],
      certificate: { type: 'conic', version: 1, assurance: 'none' },
      error: error.message || 'Unable to classify this conic.' };
  }
}

function equalReport(expected, actual, budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 20000 || depth > 32) return false;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (actual === null || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (!Array.isArray(actual) && !record(actual)) return false;
  const a = Object.keys(expected).sort(), b = Object.keys(actual).sort();
  if (a.length !== b.length || (Array.isArray(expected) && expected.length !== actual.length)) return false;
  return a.every((key, i) => key === b[i] && equalReport(expected[key], actual[key], budget, depth + 1));
}

/** Recompute against the original request and compare every report field.
 * Facade-owned routing/input metadata must be removed by the caller. */
export function verifyConicCertificate(input, result) {
  try { return result?.status === 'solved' && equalReport(compute(input), result); }
  catch { return false; }
}
