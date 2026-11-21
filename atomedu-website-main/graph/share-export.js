/** Pure, credential-free handoff of a bounded Proof Lab graph snapshot. */
import { parseGraphShareUrl } from '../classroom/share.js';
import { latexToInput } from '../engine/latex.js';
import { compileGraphExpression, GRAPH_LIMITS, validateViewport } from './model.js';

const MAX_EXPORT_BYTES = 1024 * 1024;
const PUBLIC_GRAPH_URL = 'https://atom-integrations-api.archimedes-api1.workers.dev/api/integrations/download';
const DIRECT_EXPORT_BYTES = 1800;
const VALID_FORMATS = new Set(['text', 'json', 'latex']);
const PROVIDERS = Object.freeze({
  'google-drive': { format: 'json', delivery: 'download', instructions: 'Download the JSON file, then upload it in Google Drive.' },
  notion: { format: 'text', delivery: 'copy', instructions: 'Copy the text and paste it into a Notion page.' },
  zapier: { format: 'json', delivery: 'copy', instructions: 'Copy the JSON and map its fields in a Zap you configure. This adapter does not trigger a Zap.' },
  dropbox: { format: 'json', delivery: 'download', instructions: 'Download the JSON file, then upload it in Dropbox.' },
  github: { format: 'text', delivery: 'copy', openUrl: 'https://gist.github.com/', instructions: 'Copy the text into a new GitHub gist, name the file graph.txt, and create the gist there.' },
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function fullState(input) {
  if (!record(input) || !Array.isArray(input.expressions)) throw new TypeError('Expected a graph state or share URL.');
  if (input.expressions.length > GRAPH_LIMITS.expressions + 1) {
    throw new RangeError(`Export at most ${GRAPH_LIMITS.expressions} expressions and one empty draft.`);
  }
  // getState() includes one empty editor draft. Never silently omit other invalid rows.
  const rows = Array.from({ length: input.expressions.length }, (_, i) => input.expressions[i]);
  const expressions = rows.filter(row => !(typeof row === 'string' && !row.trim())
    && !(record(row) && typeof row.expression === 'string' && !row.expression.trim()));
  if (expressions.length > GRAPH_LIMITS.expressions) throw new RangeError(`Export at most ${GRAPH_LIMITS.expressions} expressions.`);

  // Check raw size before parsing potentially large expressions.
  let bytes = 0;
  for (const row of expressions) {
    const expression = typeof row === 'string' ? row : row?.expression;
    if (typeof expression !== 'string' || !expression.trim()) throw new TypeError('Invalid graph expression row.');
    if (expression.length > GRAPH_LIMITS.expressionLength || /[\u0000-\u001f\u007f]/.test(expression)) {
      throw new RangeError(`Graph expressions must have at most ${GRAPH_LIMITS.expressionLength} printable characters.`);
    }
    bytes += byteLength(expression);
    if (bytes > MAX_EXPORT_BYTES) throw new RangeError(`Graph export exceeds ${MAX_EXPORT_BYTES} bytes.`);
  }

  const result = { expressions: expressions.map(entry => {
    const row = typeof entry === 'string' ? { expression: entry } : entry;
    if (!record(row)) throw new TypeError('Invalid graph expression row.');
    compileGraphExpression(row.expression, { readExpression: latexToInput });
    const clean = { expression: row.expression };
    if (row.color !== undefined) {
      if (typeof row.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(row.color)) throw new TypeError('Invalid graph color.');
      clean.color = row.color;
    }
    if (row.visible !== undefined) {
      if (typeof row.visible !== 'boolean') throw new TypeError('Invalid graph visibility.');
      clean.visible = row.visible;
    }
    if (row.imported !== undefined) {
      if (typeof row.imported !== 'boolean') throw new TypeError('Invalid imported flag.');
      clean.imported = row.imported;
    }
    if (row.strokeWidth !== undefined) {
      if (typeof row.strokeWidth !== 'number' || !Number.isFinite(row.strokeWidth) || row.strokeWidth < 1 || row.strokeWidth > 16) {
        throw new RangeError('Graph stroke width must be between 1 and 16.');
      }
      clean.strokeWidth = row.strokeWidth;
    }
    return clean;
  }) };
  if (input.parameters !== undefined) {
    if (!record(input.parameters)) throw new TypeError('Invalid graph parameters.');
    const parameters = {};
    for (const key of ['a', 'b', 'c']) if (input.parameters[key] !== undefined) {
      const value = input.parameters[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100) {
        throw new RangeError('Graph parameters must be finite and within ±100.');
      }
      parameters[key] = value;
    }
    result.parameters = parameters;
  }
  if (input.equalAspect !== undefined) {
    if (typeof input.equalAspect !== 'boolean') throw new TypeError('Invalid axis aspect mode.');
    result.equalAspect = input.equalAspect;
  }
  for (const key of ['xScale', 'yScale']) if (input[key] !== undefined) {
    if (input[key] !== 'linear' && input[key] !== 'log') throw new TypeError(`Invalid ${key}.`);
    result[key] = input[key];
  }
  if (input.gridMode !== undefined) {
    if (input.gridMode !== 'cartesian' && input.gridMode !== 'polar') throw new TypeError('Invalid gridMode.');
    result.gridMode = input.gridMode;
  }
  if (result.gridMode === 'polar' && (result.xScale === 'log' || result.yScale === 'log' || result.equalAspect === false)) {
    throw new RangeError('Polar grid requires linear axes with equal aspect.');
  }
  if ((result.xScale === 'log' || result.yScale === 'log') && input.viewport === undefined) {
    throw new RangeError('Logarithmic axes require an explicit positive viewport.');
  }
  if (input.viewport !== undefined) {
    if (!record(input.viewport)) throw new TypeError('Invalid graph viewport.');
    result.viewport = validateViewport(input.viewport, { xScale: result.xScale, yScale: result.yScale });
  }
  if (byteLength(JSON.stringify(result)) > MAX_EXPORT_BYTES) throw new RangeError(`Graph export exceeds ${MAX_EXPORT_BYTES} bytes.`);
  return result;
}

function snapshot(input) {
  if (typeof input === 'string' || input instanceof URL) {
    const state = parseGraphShareUrl(input);
    if (!state) throw new TypeError('Expected a valid, bounded graph share URL.');
    return { state, shareUrl: String(input) };
  }
  return { state: fullState(input), shareUrl: null };
}

function escapedLatex(value) {
  const escapes = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$', '%': '\\%', '&': '\\&', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
  return String(value).replace(/[\\{}#$%&_^~]/g, char => escapes[char]);
}

function textContent(state, shareUrl) {
  const lines = ['Graph expressions'];
  if (!state.expressions.length) lines.push('(none)');
  state.expressions.forEach((row, i) => {
    const details = [row.visible === false ? 'hidden' : 'visible'];
    if (row.color) details.push(row.color);
    if (row.imported) details.push('imported');
    if (row.strokeWidth !== undefined) details.push(`stroke ${row.strokeWidth}`);
    lines.push(`${i + 1}. ${row.expression} (${details.join(', ')})`);
  });
  lines.push('', 'Graph settings');
  if (state.viewport) lines.push(`Window: x ${state.viewport.xMin} to ${state.viewport.xMax}; y ${state.viewport.yMin} to ${state.viewport.yMax}`);
  if (state.parameters) lines.push(`Parameters: ${Object.entries(state.parameters).map(([key, value]) => `${key}=${value}`).join(', ') || '(none)'}`);
  if (state.xScale || state.yScale) lines.push(`Axis scales: x=${state.xScale ?? 'linear'}, y=${state.yScale ?? 'linear'}`);
  if (state.gridMode) lines.push(`Grid: ${state.gridMode}`);
  if (state.equalAspect !== undefined) lines.push(`Equal aspect: ${state.equalAspect ? 'yes' : 'no'}`);
  if (shareUrl) lines.push('', `Editable graph: ${shareUrl}`);
  return lines.join('\n') + '\n';
}

function latexContent(state, shareUrl) {
  // Render every expression as literal text: arbitrary graph input is not trusted TeX.
  const lines = ['\\documentclass{article}', '\\begin{document}', '\\section*{Graph expressions}'];
  if (!state.expressions.length) lines.push('None\\par');
  state.expressions.forEach((row, i) => {
    const details = [row.visible === false ? 'hidden' : 'visible', row.color, row.imported ? 'imported' : null,
      row.strokeWidth !== undefined ? `stroke ${row.strokeWidth}` : null].filter(Boolean).join(', ');
    lines.push(`${i + 1}. \\texttt{${escapedLatex(row.expression)}} (${escapedLatex(details)})\\par`);
  });
  lines.push('\\section*{Graph settings}');
  const settings = textContent({ ...state, expressions: [] }, shareUrl).split('\n').slice(4).filter(Boolean);
  for (const setting of settings) lines.push(`${escapedLatex(setting)}\\par`);
  lines.push('\\end{document}');
  return lines.join('\n') + '\n';
}

function serializeSnapshot({ state, shareUrl }, format) {
  const content = format === 'json'
    ? JSON.stringify({ version: 1, graph: state, ...(shareUrl ? { shareUrl } : {}) }, null, 2) + '\n'
    : format === 'latex' ? latexContent(state, shareUrl) : textContent(state, shareUrl);
  if (byteLength(content) > MAX_EXPORT_BYTES) throw new RangeError(`Graph export exceeds ${MAX_EXPORT_BYTES} bytes.`);
  return content;
}

/** Serialize a graph state or valid share URL. Throws on invalid input or an unsupported format. */
export function serializeGraph(input, format = 'text') {
  if (!VALID_FORMATS.has(format)) throw new TypeError('Format must be text, json, or latex.');
  return serializeSnapshot(snapshot(input), format);
}

/** Public provider-fetchable URL. The graph is visible to anyone with the URL. */
export function buildPublicGraphDownloadUrl(input) {
  const { state } = snapshot(input);
  if (state.expressions.length > 24) throw new RangeError('Direct cloud saving supports up to 24 expressions. Download the JSON file for larger graphs.');
  if (state.expressions.some(row => row.expression.length > 256))
    throw new RangeError('Direct cloud saving supports expressions up to 256 characters. Download the JSON file instead.');
  const graph = { v: 1, ...state };
  const url = new URL(PUBLIC_GRAPH_URL);
  url.searchParams.set('graph', JSON.stringify(graph));
  if (url.href.length > 8192 || new TextEncoder().encode(JSON.stringify(graph)).length > 4096)
    throw new RangeError('This graph is too large for direct cloud saving. Download the JSON file instead.');
  return url.href;
}

/** One-time OAuth handoff. The graph is sealed in a short-lived Worker cookie. */
export function buildDirectExportUrl(provider, input, destinationPageUrl) {
  if (provider !== 'github' && provider !== 'notion') throw new TypeError('Unsupported direct export provider.');
  const url = new URL(buildPublicGraphDownloadUrl(input));
  const graph = JSON.parse(url.searchParams.get('graph'));
  if (!graph.expressions.length) throw new RangeError('Add a graph expression before exporting.');
  if (byteLength(JSON.stringify(graph)) > DIRECT_EXPORT_BYTES)
    throw new RangeError('This graph is too large for direct saving. Use the manual export option instead.');
  if (provider === 'notion') {
    let destination;
    try { destination = new URL(destinationPageUrl); } catch { throw new TypeError('Paste the full URL of a Notion page you can edit.'); }
    if (destination.protocol !== 'https:' || !['notion.so', 'www.notion.so', 'app.notion.com'].includes(destination.hostname)
      || destination.username || destination.password || destination.port)
      throw new TypeError('Paste the full URL of a Notion page you can edit.');
    const match = destination.pathname.match(/([0-9a-f]{32})\/?$/i);
    if (!match) throw new TypeError('The Notion page URL needs a valid page ID.');
    url.searchParams.set('parent', match[1].toLowerCase());
  }
  url.pathname = `/api/integrations/oauth/${provider}/start`;
  if (url.href.length > 8192) throw new RangeError('This graph is too large for direct saving.');
  return url.href;
}

/** Prepare a manual provider handoff. No network calls, authentication, or uploads occur. */
export function prepareGraphExport(provider, input) {
  const config = PROVIDERS[provider];
  if (!config) throw new TypeError('Unsupported graph export provider.');
  const graph = snapshot(input);
  const { format, delivery, instructions } = config;
  const content = serializeSnapshot(graph, format);
  return {
    provider, format, delivery, fileName: format === 'json' ? 'graph.json' : 'graph.txt',
    mimeType: format === 'json' ? 'application/json' : 'text/plain', content,
    openUrl: config.openUrl ?? null, instructions,
  };
}
