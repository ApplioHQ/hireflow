/** A small, public graph snapshot for links handed to Google Classroom. */
import { latexToInput } from '../engine/latex.js?v=proof-lab-18';
import { compileGraphExpression, validateViewport } from '../graph/model.js?v=proof-lab-21';

const MAX_URL_LENGTH = 4000;
const MAX_EXPRESSIONS = 24;
const MAX_EXPRESSION_LENGTH = 256;
const VIEWPORT_KEYS = ['xMin', 'xMax', 'yMin', 'yMax'];
const PARAMETER_KEYS = ['a', 'b', 'c'];
const STATE_KEYS = new Set(['expressions', 'viewport', 'parameters', 'equalAspect', 'xScale', 'yScale', 'gridMode']);
const ROW_KEYS = new Set(['expression', 'color', 'visible']);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.has(key));
}

function publicUrl(input) {
  if (typeof input !== 'string' && !(input instanceof URL)) throw new TypeError('Expected an absolute HTTPS URL.');
  if (String(input).length > MAX_URL_LENGTH) throw new RangeError('The URL is too long.');
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  const labels = host.split('.');
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    || /^(?:\d+\.){3}\d+$/.test(host)
    || ['local', 'localhost', 'internal', 'test', 'invalid', 'example', 'onion'].includes(labels.at(-1))) {
    throw new TypeError('The share URL must use a public HTTPS hostname without credentials or a custom port.');
  }
  return url;
}

function sanitizeState(state, strict = false) {
  if (!record(state) || (strict && !onlyKeys(state, STATE_KEYS))) throw new TypeError('Invalid graph state.');
  if (!Array.isArray(state.expressions) || state.expressions.length > MAX_EXPRESSIONS) {
    throw new RangeError(`Use at most ${MAX_EXPRESSIONS} graph expressions.`);
  }
  const expressions = Array.from({ length: state.expressions.length }, (_, index) => {
    const entry = state.expressions[index];
    const row = typeof entry === 'string' && !strict ? { expression: entry } : entry;
    if (!record(row) || (strict && !onlyKeys(row, ROW_KEYS))) throw new TypeError('Invalid graph expression row.');
    const expression = row.expression;
    if (typeof expression !== 'string' || !expression.trim() || expression.length > MAX_EXPRESSION_LENGTH
      || /[\u0000-\u001f\u007f]/.test(expression)) {
      throw new RangeError(`Graph expressions must be nonempty and at most ${MAX_EXPRESSION_LENGTH} printable characters.`);
    }
    // The same bounded, non-evaluating parser used by the graph must accept it.
    compileGraphExpression(expression, { readExpression: latexToInput });
    const result = { expression };
    if (row.color !== undefined) {
      if (typeof row.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(row.color)) throw new TypeError('Invalid graph color.');
      result.color = row.color;
    }
    if (row.visible !== undefined) {
      if (typeof row.visible !== 'boolean') throw new TypeError('Invalid graph visibility.');
      result.visible = row.visible;
    }
    return result;
  });
  const result = { expressions };
  if (state.parameters !== undefined) {
    if (!record(state.parameters) || (strict && !onlyKeys(state.parameters, new Set(PARAMETER_KEYS)))) throw new TypeError('Invalid graph parameters.');
    const parameters = {};
    for (const key of PARAMETER_KEYS) if (state.parameters[key] !== undefined) {
      const value = state.parameters[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100) throw new RangeError('Graph parameters must be finite and within ±100.');
      parameters[key] = value;
    }
    result.parameters = parameters;
  }
  if (state.equalAspect !== undefined) {
    if (typeof state.equalAspect !== 'boolean') throw new TypeError('Invalid axis aspect mode.');
    result.equalAspect = state.equalAspect;
  }
  for (const key of ['xScale', 'yScale']) if (state[key] !== undefined) {
    if (state[key] !== 'linear' && state[key] !== 'log') throw new TypeError(`Invalid ${key}.`);
    result[key] = state[key];
  }
  if (state.gridMode !== undefined) {
    if (state.gridMode !== 'cartesian' && state.gridMode !== 'polar') throw new TypeError('Invalid gridMode.');
    result.gridMode = state.gridMode;
  }
  if (result.gridMode === 'polar'
    && (result.xScale === 'log' || result.yScale === 'log' || result.equalAspect === false)) {
    throw new RangeError('Polar grid requires linear axes with equal aspect.');
  }
  if ((result.xScale === 'log' || result.yScale === 'log') && state.viewport === undefined) {
    throw new RangeError('Logarithmic axes require an explicit positive viewport.');
  }
  if (state.viewport !== undefined) {
    if (!record(state.viewport) || (strict && !onlyKeys(state.viewport, new Set(VIEWPORT_KEYS)))) throw new TypeError('Invalid graph viewport.');
    result.viewport = validateViewport(state.viewport, { xScale: result.xScale, yScale: result.yScale });
  }
  return result;
}

/**
 * Build an absolute /proof-lab?graph=...#graph link on baseUrl's public HTTPS host.
 * State: expressions (0..24 strings or rows), optional viewport, a/b/c parameters,
 * equalAspect, xScale/yScale ('linear'|'log'), gridMode ('cartesian'|'polar').
 * Invalid input or a URL longer than 4000 characters throws.
 */
export function buildGraphShareUrl(graphState, baseUrl) {
  const url = publicUrl(baseUrl);
  const state = sanitizeState(graphState);
  url.pathname = '/proof-lab';
  url.search = '';
  url.hash = 'graph';
  url.searchParams.set('graph', JSON.stringify({ v: 1, ...state }));
  if (url.href.length > MAX_URL_LENGTH) throw new RangeError(`Graph share URLs must be at most ${MAX_URL_LENGTH} characters.`);
  return url.href;
}

/** Return a detached, whitelisted graph state, or null for any invalid link. */
export function parseGraphShareUrl(input) {
  try {
    const url = publicUrl(input);
    if (url.href.length > MAX_URL_LENGTH || url.pathname !== '/proof-lab' || url.hash !== '#graph') return null;
    const entries = [...url.searchParams];
    if (entries.length !== 1 || entries[0][0] !== 'graph') return null;
    const payload = JSON.parse(entries[0][1]);
    if (!record(payload) || payload.v !== 1 || !onlyKeys(payload, new Set(['v', ...STATE_KEYS]))) return null;
    const { v, ...state } = payload;
    return sanitizeState(state, true);
  } catch {
    return null;
  }
}
