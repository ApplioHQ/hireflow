// Numerical graphing only. Samples and contours are never proof certificates.
import { normalizeInput, parseExpression, parseStatement, evaluate, variables } from '../engine/core.js';

export const DEFAULT_VIEWPORT = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
export const DEFAULT_PARAMETERS = Object.freeze({ a: 1, b: 0, c: 0 });
export const GRAPH_LIMITS = Object.freeze({ expressionLength: 2048, expressions: 768, pieces: 32, comparisons: 64, samples: 12000, contourSamples: 24000, coordinate: 1e12, minSpan: 1e-9, curveParameter: 1e6, polarSpan: 200 * Math.PI });

export function validateViewport(viewport, scales = {}) {
  const v = Object.fromEntries(['xMin', 'xMax', 'yMin', 'yMax'].map(key => [key, viewport?.[key]]));
  if (Object.values(v).some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > GRAPH_LIMITS.coordinate)
    || v.xMax - v.xMin < GRAPH_LIMITS.minSpan || v.yMax - v.yMin < GRAPH_LIMITS.minSpan) {
    throw new RangeError('Use finite increasing axis bounds, within ±10¹², with a span of at least 10⁻⁹.');
  }
  if (!['linear', 'log'].includes(scales.xScale ?? 'linear') || !['linear', 'log'].includes(scales.yScale ?? 'linear'))
    throw new RangeError('Axis scales must be linear or log.');
  if (scales.xScale === 'log' && v.xMin <= 0 || scales.yScale === 'log' && v.yMin <= 0)
    throw new RangeError('Logarithmic axes need positive window bounds.');
  return v;
}

const axisValue = (value, scale) => scale === 'log' ? Math.log10(value) : value;
const worldValue = (value, scale) => scale === 'log' ? 10 ** value : value;
function axisViewport(viewport, scales) {
  const v = validateViewport(viewport, scales);
  return { xMin: axisValue(v.xMin, scales.xScale), xMax: axisValue(v.xMax, scales.xScale),
    yMin: axisValue(v.yMin, scales.yScale), yMax: axisValue(v.yMax, scales.yScale) };
}
function worldViewport(viewport, scales) {
  const result = { xMin: worldValue(viewport.xMin, scales.xScale), xMax: worldValue(viewport.xMax, scales.xScale),
    yMin: worldValue(viewport.yMin, scales.yScale), yMax: worldValue(viewport.yMax, scales.yScale) };
  return validateViewport(result, scales);
}

export function niceStep(range, targetTicks = 10) {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = Math.max(Number.MIN_VALUE, range / Math.max(1, Math.min(100, targetTicks || 10)));
  const power = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(raw))), fraction = raw / power;
  return ([1, 2, 2.5, 5, 10].find(n => n >= fraction - 1e-12) || 10) * power;
}

export function getTicks(min, max, targetTicks = 10) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = Math.max(niceStep(max - min, targetTicks), niceStep(Math.max(Math.abs(min), Math.abs(max)) * Number.EPSILON * 4, 1));
  const start = Math.ceil(min / step - 1e-10);
  const count = Math.min(201, Math.max(0, Math.floor(max / step + 1e-10) - start + 1));
  return Array.from({ length: count }, (_, i) => {
    const n = Number(((start + i) * step).toPrecision(16));
    return Math.abs(n) < step * 1e-10 ? 0 : n;
  });
}

export function getPolarGrid(viewport, width, height) {
  const v = validateViewport(viewport);
  const nearX = Math.max(v.xMin, Math.min(0, v.xMax)), nearY = Math.max(v.yMin, Math.min(0, v.yMax));
  const minRadius = Math.hypot(nearX, nearY);
  const maxRadius = Math.max(...[v.xMin, v.xMax].flatMap(x => [v.yMin, v.yMax].map(y => Math.hypot(x, y))));
  const step = niceStep(maxRadius - minRadius || maxRadius, Math.max(2, Math.min(width, height) / 75));
  const first = Math.max(1, Math.ceil(minRadius / step));
  const radii = Array.from({ length: Math.max(0, Math.min(120, Math.floor(maxRadius / step) - first + 1)) }, (_, i) => (first + i) * step);
  const angles = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12);
  return { radii, angles, maxRadius };
}

// Dimensions are CSS pixels, independent of the canvas backing-store pixel ratio.
export function worldToScreen(point, v, width, height, scales = {}) {
  if (scales.xScale === 'log' || scales.yScale === 'log') {
    const xMin = axisValue(v.xMin, scales.xScale), xMax = axisValue(v.xMax, scales.xScale);
    const yMin = axisValue(v.yMin, scales.yScale), yMax = axisValue(v.yMax, scales.yScale);
    return { x: (axisValue(point.x, scales.xScale) - xMin) / (xMax - xMin) * width,
      y: (yMax - axisValue(point.y, scales.yScale)) / (yMax - yMin) * height };
  }
  return { x: (point.x - v.xMin) / (v.xMax - v.xMin) * width, y: (v.yMax - point.y) / (v.yMax - v.yMin) * height };
}
export function screenToWorld(point, v, width, height, scales = {}) {
  if (scales.xScale === 'log' || scales.yScale === 'log') {
    const xMin = axisValue(v.xMin, scales.xScale), xMax = axisValue(v.xMax, scales.xScale);
    const yMin = axisValue(v.yMin, scales.yScale), yMax = axisValue(v.yMax, scales.yScale);
    return { x: worldValue(xMin + point.x / width * (xMax - xMin), scales.xScale),
      y: worldValue(yMax - point.y / height * (yMax - yMin), scales.yScale) };
  }
  return { x: v.xMin + point.x / width * (v.xMax - v.xMin), y: v.yMax - point.y / height * (v.yMax - v.yMin) };
}

function boundedAxis(min, max) {
  const limit = GRAPH_LIMITS.coordinate;
  if (max - min >= 2 * limit) return [-limit, limit];
  if (min < -limit) { max += -limit - min; min = -limit; }
  if (max > limit) { min -= max - limit; max = limit; }
  return [min, max];
}
export function zoomViewport(viewport, factor, anchor, scales = {}) {
  if (scales.xScale === 'log' || scales.yScale === 'log') {
    const v = axisViewport(viewport, scales);
    const a = anchor && { x: axisValue(anchor.x, scales.xScale), y: axisValue(anchor.y, scales.yScale) };
    if (a && (!Number.isFinite(a.x) || !Number.isFinite(a.y))) throw new RangeError('Zoom anchor must be in the axis domain.');
    const next = zoomViewport(v, factor, a);
    try { return worldViewport(next, scales); } catch (error) { if (error instanceof RangeError) return validateViewport(viewport, scales); throw error; }
  }
  const v = validateViewport(viewport);
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError('Zoom factor must be finite and positive; values above 1 zoom in.');
  const a = anchor || { x: (v.xMin + v.xMax) / 2, y: (v.yMin + v.yMax) / 2 };
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) throw new RangeError('Zoom anchor must be a finite world coordinate.');
  const xSpan = v.xMax - v.xMin, ySpan = v.yMax - v.yMin;
  // Preserve a common scale on both axes, including at the numerical limits.
  const floor = Math.max(GRAPH_LIMITS.minSpan, Math.max(Math.abs(a.x), Math.abs(a.y), 1) * Number.EPSILON * 16);
  const f = Math.max(Math.max(xSpan, ySpan) / (2 * GRAPH_LIMITS.coordinate), Math.min(factor, Math.min(xSpan, ySpan) / floor));
  const [xMin, xMax] = boundedAxis(a.x - (a.x - v.xMin) / f, a.x + (v.xMax - a.x) / f);
  const [yMin, yMax] = boundedAxis(a.y - (a.y - v.yMin) / f, a.y + (v.yMax - a.y) / f);
  return validateViewport({ xMin, xMax, yMin, yMax });
}
// dx/dy are translations in world units, rather than pointer pixel deltas.
export function panViewport(viewport, dx, dy, scales = {}) {
  if (scales.xScale === 'log' || scales.yScale === 'log') {
    const v = axisViewport(viewport, scales);
    const next = panViewport(v, dx, dy);
    try { return worldViewport(next, scales); } catch (error) { if (error instanceof RangeError) return validateViewport(viewport, scales); throw error; }
  }
  const v = validateViewport(viewport);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Pan offsets must be finite.');
  const limit = GRAPH_LIMITS.coordinate;
  dx = Math.max(-limit - v.xMin, Math.min(limit - v.xMax, dx));
  dy = Math.max(-limit - v.yMin, Math.min(limit - v.yMax, dy));
  return validateViewport({ xMin: v.xMin + dx, xMax: v.xMax + dx, yMin: v.yMin + dy, yMax: v.yMax + dy });
}
export function equalizeViewport(viewport, width, height, scales = {}) {
  if (scales.xScale === 'log' || scales.yScale === 'log') {
    const v = axisViewport(viewport, scales);
    try { return worldViewport(equalizeViewport(v, width, height), scales); }
    catch (error) { if (error instanceof RangeError) return validateViewport(viewport, scales); throw error; }
  }
  const v = validateViewport(viewport);
  if (!(width > 0 && height > 0)) return v;
  const span = Math.max((v.xMax - v.xMin) / width, (v.yMax - v.yMin) / height);
  const cx = (v.xMin + v.xMax) / 2, cy = (v.yMin + v.yMax) / 2;
  const xs = Math.min(span * width, 2 * GRAPH_LIMITS.coordinate), ys = Math.min(span * height, 2 * GRAPH_LIMITS.coordinate);
  const [xMin, xMax] = boundedAxis(cx - xs / 2, cx + xs / 2), [yMin, yMax] = boundedAxis(cy - ys / 2, cy + ys / 2);
  return validateViewport({ xMin, xMax, yMin, yMax });
}

function astInfo(ast) {
  let count = 0;
  const visit = (node, depth = 0) => {
    if (++count > 384 || depth > 64) throw new Error('This expression is too complex to graph.');
    if (node.type === 'sym' && !['x', 'y', 'a', 'b', 'c', 'pi', 'e'].includes(node.name)) throw new Error(`Unsupported graph variable “${node.name}”. Use x, y, or parameters a, b, c.`);
    if (node.type === 'binary') { visit(node.left, depth + 1); visit(node.right, depth + 1); }
    else if (node.type === 'neg') visit(node.arg, depth + 1);
    else if (node.type === 'call') node.args.forEach(arg => visit(arg, depth + 1));
  };
  visit(ast);
  return variables(ast);
}

// Compile the engine's bounded AST to ordinary closures. Never execute source text.
// Numeric leaves are converted once, avoiding exact-rational allocation per sample.
function scalar(ast) {
  if (ast.type === 'num' || (ast.type === 'sym' && ['pi', 'e'].includes(ast.name))) { const n = evaluate(ast); return () => n; }
  if (ast.type === 'sym') return env => env[ast.name];
  if (ast.type === 'neg') { const a = scalar(ast.arg); return env => -a(env); }
  if (ast.type === 'binary') {
    const a = scalar(ast.left), b = scalar(ast.right);
    return env => {
      const left = a(env), right = b(env);
      // Preserve original domain gaps through parent operations. JavaScript
      // otherwise turns NaN**0 into 1 and 1/(-Infinity) into a finite zero.
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
      if (ast.op === '+') return left + right;
      if (ast.op === '-') return left - right;
      if (ast.op === '*') return left * right;
      if (ast.op === '/') return right === 0 ? NaN : left / right;
      return left ** right;
    };
  }
  const args = ast.args.map(scalar), a = args[0];
  if (ast.name === 'log') return env => {
    const value = a(env), base = args[1] ? args[1](env) : 10;
    return value > 0 && base > 0 && base !== 1 && Number.isFinite(value) && Number.isFinite(base) ? Math.log(value) / Math.log(base) : NaN;
  };
  if (ast.name === 'root') return env => {
    const value = a(env), degree = args[1](env);
    return !Number.isInteger(degree) || degree < 1 || degree > 31 || (value < 0 && degree % 2 === 0) ? NaN : (value < 0 ? -1 : 1) * Math.abs(value) ** (1 / degree);
  };
  const fn = { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan }[ast.name];
  if (!fn) throw new Error(`The graph does not yet support ${ast.name}.`);
  return env => fn(a(env));
}

function splitPoint(text) {
  if (text[0] !== '(' || text.at(-1) !== ')') return null;
  let depth = 0, comma = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (depth === 0 && i !== text.length - 1) return null;
    if (text[i] === ',' && depth === 1) { if (comma !== -1) return null; comma = i; }
  }
  return comma === -1 ? null : [text.slice(1, comma), text.slice(comma + 1, -1)];
}

// The shared algebra parser deliberately requires function parentheses. Graph
// input also accepts the usual short trig notation, but only when the argument
// is a single graph variable (optionally scaled by an adjacent number). An
// explicit product, or a parenthesized call followed by a product, keeps its
// original meaning.
function graphTrigInput(source) {
  const functions = /(?<![A-Za-z_])(?:sin|cos|tan)/gi;
  const bareArgument = /^(?:(?:\d+(?:\.\d*)?|\.\d+)\s*)?[xyabc](?:\s*\^\s*(?:\d+|\(\s*\d+\s*\)))?(?![A-Za-z_0-9])/i;
  const numericArgument = /^(?:\d+(?:\.\d*)?|\.\d+)(?=\s*(?:[+\-*/=<>),]|$))/;
  let result = '', offset = 0, match;
  while ((match = functions.exec(source))) {
    const name = match[0].toLowerCase();
    let end = functions.lastIndex, power = null;
    const exponent = /^\s*\^\s*(\d+|\(\s*\d+\s*\))/.exec(source.slice(end));
    if (exponent) { power = exponent[1]; end += exponent[0].length; }
    const spacing = /^\s*/.exec(source.slice(end))[0];
    end += spacing.length;
    let argument;
    if (power !== null && source[end] === '(') {
      let depth = 0, close = end;
      for (; close < source.length; close++) {
        if (source[close] === '(') depth++;
        else if (source[close] === ')' && --depth === 0) break;
      }
      if (close < source.length) { argument = source.slice(end, close + 1); end = close + 1; }
    } else if (source[end] !== '(') {
      const bare = bareArgument.exec(source.slice(end)) || numericArgument.exec(source.slice(end));
      if (bare) { argument = `(${bare[0]})`; end += bare[0].length; }
    }
    if (!argument) continue;
    result += source.slice(offset, match.index) + (power === null ? `${name}${argument}` : `(${name}${argument})^${power}`);
    offset = end;
    functions.lastIndex = end;
  }
  return result + source.slice(offset);
}

// Preserve the intended coefficient-and-variable argument when a visual editor
// emits compact notation such as \sin3x. Group it before bridge conversion so
// older readers behave consistently; explicit products retain their meaning.
function graphLatexTrigInput(source) {
  return source.replace(/\\(sin|cos|tan)(?![A-Za-z])((?:\s*\^\s*(?:\{\s*\d+\s*\}|\d+))?)\s*((?:\d+(?:\.\d*)?|\.\d+)\s*[xyabc](?:\s*\^\s*(?:\{\s*\d+\s*\}|\d+))?)(?![A-Za-z_0-9])/gi,
    (_, name, power, argument) => `\\${name}${power}(${argument})`);
}

// Extract numerical affine condition boundaries without simplifying away domains.
// Nonlinear conditions still work by sampling; their tiny features can be omitted.
function affineForm(ast, variable) {
  if (!variables(ast).includes(variable)) { const value = scalar(ast); return env => [0, value(env)]; }
  if (ast.type === 'sym') return () => [1, 0];
  if (ast.type === 'neg') { const arg = affineForm(ast.arg, variable); return arg ? env => arg(env).map(n => -n) : null; }
  if (ast.type !== 'binary') return null;
  const left = affineForm(ast.left, variable), right = affineForm(ast.right, variable);
  if (!left || !right) return null;
  if (['+', '-'].includes(ast.op)) return env => {
    const a = left(env), b = right(env), sign = ast.op === '+' ? 1 : -1;
    return [a[0] + sign * b[0], a[1] + sign * b[1]];
  };
  if (ast.op === '*' && (!variables(ast.left).includes(variable) || !variables(ast.right).includes(variable))) return env => {
    const a = left(env), b = right(env);
    return [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
  };
  if (ast.op === '/' && !variables(ast.right).includes(variable)) return env => {
    const a = left(env), divisor = right(env)[1];
    return divisor === 0 ? [NaN, NaN] : a.map(n => n / divisor);
  };
  return null;
}

function compilePiecewise(input, source) {
  const variable = input.variable ?? 'x', axis = variable === 'x' ? 'y' : 'x';
  if (!['x', 'y'].includes(variable)) throw new Error('A piecewise graph needs variable x or y.');
  if (!Array.isArray(input.pieces) || !input.pieces.length || input.pieces.length > GRAPH_LIMITS.pieces) throw new Error(`Use between 1 and ${GRAPH_LIMITS.pieces} piecewise branches.`);
  let length = 0, comparisons = 0;
  const parameters = new Set(), boundaryFunctions = [];
  const parse = text => {
    const ast = parseExpression(text), names = astInfo(ast);
    if (names.includes(axis)) throw new Error(`Piecewise branches and conditions may use ${variable} and parameters a, b, c only.`);
    names.filter(n => ['a', 'b', 'c'].includes(n)).forEach(n => parameters.add(n));
    return ast;
  };
  const pieces = input.pieces.map(piece => {
    if (!piece || typeof piece.expression !== 'string' || !(typeof piece.condition === 'string' || piece.condition == null || typeof piece.condition === 'boolean')) throw new Error('Each piecewise branch needs an expression string and a comparison condition.');
    length += piece.expression.length + (typeof piece.condition === 'string' ? piece.condition.length : 0);
    if (length > GRAPH_LIMITS.expressionLength) throw new Error('Piecewise branches exceed the graph expression size limit.');
    const expression = scalar(parse(piece.expression));
    let condition = piece.condition;
    if (condition === false) return { expression, matches: () => false };
    if (condition == null || condition === true || (typeof condition === 'string' && /^(?:otherwise|else|true)?$/i.test(condition.trim()))) return { expression, matches: () => true };
    condition = normalizeInput(condition);
    // Allow an outer condition group, while each comparison operand keeps the
    // engine's own parentheses, arithmetic, function, and token limits.
    while (condition[0] === '(' && condition.at(-1) === ')') {
      let depth = 0, enclosing = true;
      for (let i = 0; i < condition.length - 1; i++) { if (condition[i] === '(') depth++; if (condition[i] === ')') depth--; if (depth === 0) { enclosing = false; break; } }
      if (!enclosing) break;
      condition = condition.slice(1, -1).trim();
    }
    const relations = [...condition.matchAll(/<=|>=|!=|=|<|>/g)];
    comparisons += relations.length;
    if (!relations.length || comparisons > GRAPH_LIMITS.comparisons) throw new Error(`Use comparison conditions and at most ${GRAPH_LIMITS.comparisons} comparisons per piecewise graph.`);
    const operands = []; let offset = 0;
    for (const relation of relations) { operands.push(parse(condition.slice(offset, relation.index))); offset = relation.index + relation[0].length; }
    operands.push(parse(condition.slice(offset)));
    const values = operands.map(scalar);
    for (let i = 0; i < relations.length; i++) {
      const a = affineForm(operands[i], variable), b = affineForm(operands[i + 1], variable);
      if (a && b) boundaryFunctions.push(env => { const left = a(env), right = b(env), slope = left[0] - right[0]; return slope === 0 ? NaN : (right[1] - left[1]) / slope; });
    }
    return { expression, matches: env => {
      let left = values[0](env);
      for (let i = 0; i < relations.length; i++) {
        const right = values[i + 1](env), op = relations[i][0];
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
        const matches = op === '<' ? left < right : op === '<=' ? left <= right : op === '>' ? left > right : op === '>=' ? left >= right : op === '!=' ? left !== right : left === right;
        if (!matches) return false;
        left = right;
      }
      return true;
    } };
  });
  const environment = (t, params) => ({ ...DEFAULT_PARAMETERS, ...params, [variable]: t });
  const select = env => {
    for (let branch = 0; branch < pieces.length; branch++) if (pieces[branch].matches(env)) return { value: pieces[branch].expression(env), branch };
    return { value: NaN, branch: -1 };
  };
  const sampleWithBranch = (t, params) => select(environment(t, params));
  const sample = (t, params) => sampleWithBranch(t, params).value;
  const breakpoints = params => {
    const env = environment(0, params);
    return [...new Set(boundaryFunctions.map(fn => fn(env)).filter(n => Number.isFinite(n) && Math.abs(n) <= GRAPH_LIMITS.coordinate))].sort((a, b) => a - b);
  };
  const point = (t, value) => axis === 'y' ? { x: t, y: value } : { x: value, y: t };
  return {
    kind: 'explicit', piecewise: true, source, axis, parameters: [...parameters].sort(), sample, sampleWithBranch, breakpoints,
    value: (x, y, params) => axis === 'y' ? y - sample(x, params) : x - sample(y, params),
    endpoints(params) {
      const bounds = breakpoints(params), markers = [];
      for (let i = 0; i < bounds.length; i++) {
        const t = bounds[i], floor = Number.EPSILON * Math.max(1, Math.abs(t)) * 8;
        const epsilon = Math.max(floor, Math.min(1e-7 * Math.max(1, Math.abs(t)), (t - (bounds[i - 1] ?? -Infinity)) / 4, ((bounds[i + 1] ?? Infinity) - t) / 4));
        const env = environment(t, params), actual = select(env), left = sampleWithBranch(t - epsilon, params), right = sampleWithBranch(t + epsilon, params);
        if (left.branch === right.branch && left.branch === actual.branch) continue;
        const leftValue = left.branch >= 0 ? pieces[left.branch].expression(env) : NaN, rightValue = right.branch >= 0 ? pieces[right.branch].expression(env) : NaN;
        const adjacent = [...new Set([leftValue, rightValue])].filter(Number.isFinite);
        // Continuous joins need no endpoint decoration. An isolated defined
        // value, finite domain endpoint, or jump gets closed/open markers.
        if (Number.isFinite(actual.value) && leftValue === actual.value && rightValue === actual.value) continue;
        for (const value of [...new Set(adjacent)]) markers.push({ ...point(t, value), open: !Number.isFinite(actual.value) || value !== actual.value });
        if (Number.isFinite(actual.value) && !adjacent.includes(actual.value)) markers.push({ ...point(t, actual.value), open: false });
      }
      return markers;
    },
  };
}

function parseRectangleRegion(source) {
  const parts = source.split(/\s+and\s+/i);
  if (parts.length !== 2) return null;
  const axes = new Map();
  for (const part of parts) {
    let statement;
    try { statement = parseStatement(part.trim()); } catch { return null; }
    if (statement.kind !== 'inequality' || statement.relation !== '<=') return null;
    const absolute = statement.left, argument = absolute?.args?.[0];
    if (absolute?.type !== 'call' || absolute.name !== 'abs' || absolute.args.length !== 1
      || argument?.type !== 'binary' || !['+', '-'].includes(argument.op)
      || argument.left?.type !== 'sym' || !['x', 'y'].includes(argument.left.name)
      || variables(argument.right).length || variables(statement.right).length
      || axes.has(argument.left.name)) return null;
    const offset = scalar(argument.right)({}), center = argument.op === '-' ? offset : -offset;
    const radius = scalar(statement.right)({});
    if (!Number.isFinite(center) || !Number.isFinite(radius) || radius <= 0
      || Math.abs(center) + radius > GRAPH_LIMITS.coordinate || radius * 2 < GRAPH_LIMITS.minSpan) {
      throw new Error('Image region bounds must be finite and have positive width.');
    }
    axes.set(argument.left.name, { center, radius });
  }
  if (!axes.has('x') || !axes.has('y')) return null;
  const x = axes.get('x'), y = axes.get('y');
  const bounds = { xMin: x.center - x.radius, xMax: x.center + x.radius,
    yMin: y.center - y.radius, yMax: y.center + y.radius };
  return { kind: 'region', source, parameters: [], relation: '<=', bounds,
    value(px, py) { return Math.max(Math.abs(px - x.center) - x.radius, Math.abs(py - y.center) - y.radius); },
    contains(px, py) { return Number.isFinite(px) && Number.isFinite(py)
      && Math.abs(px - x.center) <= x.radius && Math.abs(py - y.center) <= y.radius; } };
}

function splitCurveClauses(text) {
  const clauses = []; let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth < 0) throw new Error('Curve formulas have unbalanced parentheses.');
    else if (text[i] === ';' && depth === 0) { clauses.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error('Curve formulas have unbalanced parentheses.');
  clauses.push(text.slice(start).trim());
  return clauses;
}

function compileStructuredCurve(source) {
  const prefix = /^\s*(polar|parametric)\s*\(/i.exec(source);
  if (!prefix) return null;
  const full = /^\s*(polar|parametric)\s*\(([\s\S]*)\)\s*$/i.exec(source);
  if (!full) throw new Error('Close the polar or parametric curve formula with a parenthesis.');
  const kind = full[1].toLowerCase(), independent = kind === 'polar' ? 'theta' : 't';
  const expected = kind === 'polar' ? ['r', 'theta'] : ['x', 'y', 't'];
  const parts = new Map();
  for (const clause of splitCurveClauses(full[2])) {
    const match = /^\s*([a-z]+)\s*=\s*(.+)\s*$/i.exec(clause);
    if (!match || !expected.includes(match[1].toLowerCase()) || parts.has(match[1].toLowerCase()))
      throw new Error(`Use ${kind === 'polar' ? 'polar(r=…;theta=lower..upper)' : 'parametric(x=…;y=…;t=lower..upper)'}.`);
    parts.set(match[1].toLowerCase(), match[2].trim());
  }
  if (parts.size !== expected.length || expected.some(key => !parts.has(key)))
    throw new Error(`Use ${kind === 'polar' ? 'polar(r=…;theta=lower..upper)' : 'parametric(x=…;y=…;t=lower..upper)'}.`);
  const interval = parts.get(independent).split('..');
  if (interval.length !== 2 || !interval[0].trim() || !interval[1].trim()) throw new Error('Curve intervals need finite lower..upper bounds.');
  const limits = interval.map(text => {
    const ast = parseExpression(normalizeInput(text.trim()));
    if (astInfo(ast).some(name => ['x', 'y', 'a', 'b', 'c'].includes(name))) throw new Error('Curve interval bounds may use numbers, pi, and e only.');
    return scalar(ast)({});
  });
  const [tMin, tMax] = limits;
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin < -GRAPH_LIMITS.curveParameter || tMax > GRAPH_LIMITS.curveParameter
    || tMax - tMin < GRAPH_LIMITS.minSpan || tMax - tMin > (kind === 'polar' ? GRAPH_LIMITS.polarSpan : GRAPH_LIMITS.curveParameter))
    throw new RangeError('Use increasing finite curve bounds within ±10⁶; polar intervals may span at most 100 turns.');
  const parameters = new Set();
  const formula = text => {
    const foreign = kind === 'polar' ? /(?<![A-Za-z_])[xyt](?![A-Za-z_])/i : /(?<![A-Za-z_])(?:x|y|theta)(?![A-Za-z_])/i;
    if (foreign.test(text)) throw new Error(`Curve formulas may use ${independent} and parameters a, b, c only.`);
    const replaced = text.replace(kind === 'polar' ? /(?<![A-Za-z_])theta(?![A-Za-z_])/gi : /(?<![A-Za-z_])t(?![A-Za-z_])/gi, 'x');
    const ast = parseExpression(graphTrigInput(normalizeInput(replaced)));
    const names = astInfo(ast);
    if (names.includes('y')) throw new Error(`Curve formulas may use ${independent} and parameters a, b, c only.`);
    names.filter(name => ['a', 'b', 'c'].includes(name)).forEach(name => parameters.add(name));
    return scalar(ast);
  };
  const first = formula(parts.get(kind === 'polar' ? 'r' : 'x'));
  const second = kind === 'polar' ? null : formula(parts.get('y'));
  const point = (t, params) => {
    const env = { ...DEFAULT_PARAMETERS, ...params, x: t, y: 0 };
    if (kind === 'parametric') return { x: first(env), y: second(env) };
    const radius = first(env);
    return { x: radius * Math.cos(t), y: radius * Math.sin(t) };
  };
  return { kind, source, parameters: [...parameters].sort(), parameter: independent, tMin, tMax, point };
}

/** Returns a numerical descriptor; throws a user-readable error for invalid input.
 * kind: explicit (axis is the dependent coordinate), implicit, inequality,
 * region (two exact rectangular inequalities), point, polar, or parametric.
 * value(x,y,parameters) is the residual LHS−RHS for relations. Explicit descriptors
 * also expose sample(t,parameters) and point descriptors expose point(parameters).
 */
export function compileGraphExpression(expression, { readExpression = value => value } = {}) {
  if (typeof expression !== 'string' || expression.length > GRAPH_LIMITS.expressionLength) throw new Error(`Use at most ${GRAPH_LIMITS.expressionLength} characters per graph expression.`);
  const structured = compileStructuredCurve(expression);
  if (structured) return structured;
  let internal = readExpression(expression);
  if (internal?.kind === 'piecewise') return compilePiecewise(internal, expression);
  const grouped = graphLatexTrigInput(expression);
  if (grouped !== expression) internal = readExpression(grouped);
  if (typeof internal !== 'string' || internal.length > GRAPH_LIMITS.expressionLength) throw new Error('The graph expression is too long or could not be converted.');
  const convertedStructured = compileStructuredCurve(internal);
  if (convertedStructured) return convertedStructured;
  const source = graphTrigInput(normalizeInput(internal)), pair = splitPoint(source);
  // Image import uses exact rectangular inequalities, not an opaque raster
  // layer. The bounds are recovered from the visible editable formula so
  // undo, export, and subsequent edits always agree with what is drawn.
  const rectangle = parseRectangleRegion(source);
  if (rectangle) return rectangle;
  const environment = (x, y, params) => ({ ...DEFAULT_PARAMETERS, ...params, x, y });
  if (pair) {
    const asts = pair.map(parseExpression), names = [...new Set(asts.flatMap(astInfo))];
    if (names.some(n => n === 'x' || n === 'y')) throw new Error('Point coordinates can use numbers and parameters a, b, c.');
    const fns = asts.map(scalar);
    return { kind: 'point', source, parameters: names, point: params => { const env = environment(0, 0, params); return { x: fns[0](env), y: fns[1](env) }; } };
  }
  const statement = parseStatement(source);
  const left = statement.left || statement.expression, right = statement.right;
  const names = [...new Set([left, right].filter(Boolean).flatMap(astInfo))];
  const parameters = names.filter(n => ['a', 'b', 'c'].includes(n));
  const lfn = scalar(left), rfn = right ? scalar(right) : () => 0;
  const value = (x, y, params) => { const env = environment(x, y, params); return lfn(env) - rfn(env); };
  const base = { source, parameters, value, relation: statement.relation || '=' };
  if (statement.kind === 'inequality') {
    if (statement.relation === '!=') throw new Error('Graph shading supports <, ≤, >, and ≥.');
    return { ...base, kind: 'inequality', contains: (x, y, params) => {
      const z = value(x, y, params);
      return Number.isFinite(z) && ({ '<': z < 0, '<=': z <= 0, '>': z > 0, '>=': z >= 0 })[statement.relation];
    } };
  }
  const explicit = (axis, ast) => {
    const fn = scalar(ast);
    return { ...base, kind: 'explicit', axis, sample: (t, params) => fn(environment(axis === 'y' ? t : 0, axis === 'x' ? t : 0, params)) };
  };
  if (statement.kind === 'function') {
    if (!['x', 'y'].includes(statement.variable) || names.includes(statement.variable === 'x' ? 'y' : 'x')) throw new Error('Use f(x) or f(y) with a single graph variable.');
    return explicit(statement.variable === 'x' ? 'y' : 'x', left);
  }
  if (right) {
    for (const axis of ['y', 'x']) {
      if (left.type === 'sym' && left.name === axis && !variables(right).includes(axis)) return explicit(axis, right);
      if (right.type === 'sym' && right.name === axis && !variables(left).includes(axis)) return explicit(axis, left);
    }
  } else if (!names.includes('y')) return explicit('y', left);
  return { ...base, kind: 'implicit' };
}

const budgetOption = (n, fallback, max) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : fallback)));
const clampFraction = n => Math.max(.000001, Math.min(.999999, n));

/** Adaptive explicit sampling; returns separate world-coordinate polylines.
 * Every accepted edge has a tested midpoint. Unresolved steep/nonfinite edges
 * are dropped at the depth/budget limit, rather than bridging a possible pole.
 */
export function sampleExplicit(compiled, viewport, options = {}) {
  const v = validateViewport(viewport, options);
  if (compiled.kind !== 'explicit') return [];
  const width = Math.max(1, options.width || 800), height = Math.max(1, options.height || 500);
  const axis = compiled.axis, lo = axis === 'y' ? v.xMin : v.yMin, hi = axis === 'y' ? v.xMax : v.yMax;
  const independentScale = axis === 'y' ? options.xScale : options.yScale;
  const dependentScale = axis === 'y' ? options.yScale : options.xScale;
  const pixels = axis === 'y' ? width : height, dependentPixels = axis === 'y' ? height : width;
  const min = axis === 'y' ? v.yMin : v.xMin, max = axis === 'y' ? v.yMax : v.xMax;
  const dependentSpan = axisValue(max, dependentScale) - axisValue(min, dependentScale);
  const budget = budgetOption(options.maxSamples, 6000, GRAPH_LIMITS.samples), params = options.parameters || {};
  const depthLimit = budgetOption(options.maxDepth, 10, 16), tolerance = Math.max(.1, options.tolerance || .7);
  let count = 0, current = [], paths = [];
  const read = t => {
    if (count >= budget) return { value: NaN, branch: -1 };
    count++;
    try {
      const sample = compiled.sampleWithBranch ? compiled.sampleWithBranch(t, params) : { value: compiled.sample(t, params), branch: 0 };
      return { value: Number.isFinite(sample.value) && (dependentScale !== 'log' || sample.value > 0) ? sample.value : NaN, branch: sample.branch };
    } catch { return { value: NaN, branch: -1 }; }
  };
  const point = (t, d) => axis === 'y' ? { x: t, y: d } : { x: d, y: t };
  const flush = () => { if (current.length > 1) paths.push(current); current = []; };
  const append = (a, fa, b, fb) => {
    const p = point(a, fa), q = point(b, fb), last = current.at(-1);
    if (!last || last.x !== p.x || last.y !== p.y) { flush(); current.push(p); }
    current.push(q);
  };
  const refine = (a, sa, b, sb, depth) => {
    const m = independentScale === 'log' ? Math.sqrt(a) * Math.sqrt(b) : (a + b) / 2;
    const sm = read(m), fa = sa.value, fb = sb.value, fm = sm.value;
    if (count > budget || (!Number.isFinite(fa) && !Number.isFinite(fb) && !Number.isFinite(fm))) { flush(); return; }
    const finite = Number.isFinite(fa) && Number.isFinite(fb) && Number.isFinite(fm);
    // Entirely outside on the same side: no canvas-sized segments to draw.
    if (finite && ((fa < min && fb < min && fm < min) || (fa > max && fb > max && fm > max))) { flush(); return; }
    const curvature = finite ? Math.abs(axisValue(fm, dependentScale) - (axisValue(fa, dependentScale) + axisValue(fb, dependentScale)) / 2) / dependentSpan * dependentPixels : Infinity;
    const jump = finite ? Math.abs(axisValue(fb, dependentScale) - axisValue(fa, dependentScale)) / dependentSpan * dependentPixels : Infinity;
    const safe = finite && sa.branch === sm.branch && sm.branch === sb.branch && curvature <= tolerance && jump <= dependentPixels * .45;
    if (safe) { append(a, fa, b, fb); return; }
    if (depth >= depthLimit || count >= budget || m === a || m === b) { flush(); return; }
    refine(a, sa, m, sm, depth + 1); refine(m, sm, b, sb, depth + 1);
  };
  // A cap on base intervals leaves enough budget for adaptive refinement.
  const intervals = Math.max(1, Math.min(512, Math.ceil(pixels / 3), Math.floor(budget / 6)));
  const boundaries = compiled.breakpoints ? compiled.breakpoints(params).filter(t => t > lo && t < hi) : [];
  const lowAxis = axisValue(lo, independentScale), highAxis = axisValue(hi, independentScale);
  const divisions = [...new Set([...Array.from({ length: intervals + 1 }, (_, i) => worldValue(lowAxis + (highAxis - lowAxis) * i / intervals, independentScale)), ...boundaries])].sort((a, b) => a - b);
  let a = lo, fa = read(a);
  for (let i = 1; i < divisions.length && count < budget; i++) {
    const b = divisions[i], fb = read(b);
    refine(a, fa, b, fb, 0); a = b; fa = fb;
  }
  flush();
  return paths;
}

/** Bounded adaptive sampling for r(theta) and (x(t), y(t)). The returned
 * world-coordinate paths are numerical approximations, never certificates.
 */
export function sampleParametric(compiled, viewport, options = {}) {
  const v = validateViewport(viewport, options);
  if (!['polar', 'parametric'].includes(compiled.kind) || typeof compiled.point !== 'function') return [];
  const budget = budgetOption(options.maxSamples, 6000, GRAPH_LIMITS.samples);
  if (budget < 3) return [];
  const width = Math.max(1, options.width || 800), height = Math.max(1, options.height || 500);
  const depthLimit = budgetOption(options.maxDepth, 12, 16), tolerance = Math.max(.1, options.tolerance || .7);
  const paths = []; let current = [], count = 0, intervalReads = 0;
  const flush = () => { if (current.length > 1) paths.push(current); current = []; };
  const read = t => {
    if (count >= budget) return null;
    count++;
    try {
      const point = compiled.point(t, options.parameters || {});
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
        || Math.abs(point.x) > GRAPH_LIMITS.coordinate || Math.abs(point.y) > GRAPH_LIMITS.coordinate) return null;
      const screen = worldToScreen(point, v, width, height, options);
      return Number.isFinite(screen.x) && Number.isFinite(screen.y) ? { ...point, t, screen } : null;
    } catch { return null; }
  };
  const append = (a, b) => {
    if (!current.length || current.at(-1).t !== a.t) { flush(); current.push({ x: a.x, y: a.y, t: a.t }); }
    current.push({ x: b.x, y: b.y, t: b.t });
  };
  const refine = (a, pa, b, pb, depth) => {
    if (intervalReads >= intervalBudget) { flush(); return; }
    intervalReads++;
    const mid = (a + b) / 2, pm = read(mid);
    if (pa && pm && pb) {
      const curvature = Math.hypot(pm.screen.x - (pa.screen.x + pb.screen.x) / 2,
        pm.screen.y - (pa.screen.y + pb.screen.y) / 2);
      const jump = Math.hypot(pb.screen.x - pa.screen.x, pb.screen.y - pa.screen.y);
      if (curvature <= tolerance && jump <= Math.max(width, height) * .45) { append(pa, pb); return; }
    }
    if (depth >= depthLimit || count >= budget || mid === a || mid === b) { flush(); return; }
    refine(a, pa, mid, pm, depth + 1); refine(mid, pm, b, pb, depth + 1);
  };
  const intervals = Math.max(1, Math.min(512, Math.ceil(Math.max(width, height) / 3), Math.floor(budget / 6)));
  // Reserve work for every base interval so a pole cannot consume the entire
  // frame budget before the sampler reaches the other side of the curve.
  const intervalBudget = Math.max(1, Math.floor((budget - intervals - 1) / intervals));
  let a = compiled.tMin, pa = read(a);
  for (let i = 1; i <= intervals && count < budget; i++) {
    intervalReads = 0;
    const b = compiled.tMin + (compiled.tMax - compiled.tMin) * i / intervals, pb = read(b);
    refine(a, pa, b, pb, 0); a = b; pa = pb;
  }
  flush();
  return paths;
}

/** Marching squares with cached vertices and a bounded uniform grid.
 * A bounded residual-convergence search suppresses sign changes caused by poles. Ambiguous
 * saddle cells are resolved using their center value; undefined cells are gaps.
 * Returns [[{x,y},{x,y}], ...]. This is an approximation, not a zero-set proof.
 */
export function contourSegments(compiledOrFunction, viewport, options = {}) {
  const v = validateViewport(viewport, options), fn = typeof compiledOrFunction === 'function' ? compiledOrFunction : compiledOrFunction.value;
  if (typeof fn !== 'function') return [];
  const budget = budgetOption(options.maxSamples, 20000, GRAPH_LIMITS.contourSamples);
  if (budget < 16) return [];
  const width = Math.max(1, options.width || 800), height = Math.max(1, options.height || 500), params = options.parameters || {};
  const cellSize = Math.max(3, options.cellSize || 7);
  // Reserve 5/6 of the budget for edge checks and ambiguous centers.
  let nx = Math.max(2, Math.min(240, Math.ceil(width / cellSize))), ny = Math.max(2, Math.min(240, Math.ceil(height / cellSize)));
  const scale = Math.min(1, Math.sqrt(budget / (6 * (nx + 1) * (ny + 1))));
  nx = Math.max(2, Math.floor(nx * scale)); ny = Math.max(2, Math.floor(ny * scale));
  const xMin = axisValue(v.xMin, options.xScale), xMax = axisValue(v.xMax, options.xScale);
  const yMin = axisValue(v.yMin, options.yScale), yMax = axisValue(v.yMax, options.yScale);
  const xs = Array.from({ length: nx + 1 }, (_, i) => worldValue(xMin + (xMax - xMin) * i / nx, options.xScale));
  const ys = Array.from({ length: ny + 1 }, (_, j) => worldValue(yMin + (yMax - yMin) * j / ny, options.yScale));
  let count = 0;
  const read = (x, y) => { if (count >= budget) return NaN; count++; try { const n = fn(x, y, params); return Number.isFinite(n) ? n : NaN; } catch { return NaN; } };
  const grid = Array.from({ length: ny + 1 }, (_, j) => Array.from({ length: nx + 1 }, (_, i) => read(xs[i], ys[j])));
  const segments = [], edgeCache = new Map();
  function crossing(p, q, fp, fq, key) {
    if (edgeCache.has(key)) return edgeCache.get(key);
    if (fp === 0 || fq === 0) { const hit = fp === 0 ? p : q; edgeCache.set(key, hit); return hit; }
    const target = Math.min(Math.abs(fp), Math.abs(fq)) * .001;
    let a = 0, b = 1, fa = fp, fb = fq, hit = null;
    // Improving against the SMALLER endpoint residual matters: interpolation
    // across an unbalanced pole can improve against the larger one. A bounded
    // bracket search gives nonlinear continuous edges several chances to converge.
    for (let attempt = 0; attempt < 9 && count < budget; attempt++) {
      const mag = Math.max(Math.abs(fa), Math.abs(fb));
      const fraction = (fa / mag) / (fa / mag - fb / mag);
      const t = attempt % 2 ? (a + b) / 2 : a + (b - a) * clampFraction(fraction);
      const candidate = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
      const residual = read(candidate.x, candidate.y);
      if (!Number.isFinite(residual)) break;
      if (Math.abs(residual) <= target) { hit = candidate; break; }
      if ((residual >= 0) === (fa >= 0)) { a = t; fa = residual; } else { b = t; fb = residual; }
    }
    edgeCache.set(key, hit);
    return hit;
  }
  for (let j = 0; j < ny && count < budget; j++) for (let i = 0; i < nx && count < budget; i++) {
    const values = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
    if (values.some(n => !Number.isFinite(n))) continue;
    const mask = values.reduce((n, z, k) => n | ((z >= 0 ? 1 : 0) << k), 0);
    if (mask === 0 || mask === 15) continue;
    const x = xs[i], y = ys[j], right = xs[i + 1], top = ys[j + 1];
    const points = [{ x, y }, { x: right, y }, { x: right, y: top }, { x, y: top }];
    const keys = [`h${i},${j}`, `v${i + 1},${j}`, `h${i},${j + 1}`, `v${i},${j}`], hits = [];
    for (let e = 0; e < 4; e++) {
      const next = (e + 1) % 4;
      if ((values[e] >= 0) !== (values[next] >= 0)) hits.push({ edge: e, point: crossing(points[e], points[next], values[e], values[next], keys[e]) });
    }
    const push = (a, b) => { if (a?.point && b?.point && (a.point.x !== b.point.x || a.point.y !== b.point.y)) segments.push([a.point, b.point]); };
    if (hits.length === 2) push(hits[0], hits[1]);
    else if (hits.length === 4) {
      const center = read(worldValue((axisValue(x, options.xScale) + axisValue(right, options.xScale)) / 2, options.xScale),
        worldValue((axisValue(y, options.yScale) + axisValue(top, options.yScale)) / 2, options.yScale));
      if (!Number.isFinite(center)) continue;
      if ((center >= 0) === (values[0] >= 0)) { push(hits[0], hits[1]); push(hits[2], hits[3]); }
      else { push(hits[0], hits[3]); push(hits[1], hits[2]); }
    }
  }
  return segments;
}
