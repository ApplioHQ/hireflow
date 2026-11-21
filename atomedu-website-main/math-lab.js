// Standalone browser UI. All mathematical decisions belong to ./engine/index.js.
// Engine calls may return values or promises. Typesetting never certifies a proof.
import { createMathField, createLatexDisclosure, createKeypad, renderMath, toLatex, setMathFieldValue, setDefaultMathField, getActiveMathField, openKeypad, closeKeypad } from './math-editor.js?v=proof-lab-18';
import { latexToInput } from './engine/latex.js?v=proof-lab-18';
import { buildGraphShareUrl, parseGraphShareUrl } from './classroom/share.js?v=1';
import { prepareGraphExport, buildPublicGraphDownloadUrl, buildDirectExportUrl } from './graph/share-export.js?v=4';
import { requestDriveAccessToken, uploadGraphToDrive } from './graph/google-drive.js?v=1';

const DROPBOX_APP_KEY = 'ajyniy3x7a5h1yl'; // Dropbox Saver app keys are public; no app secret is used.
const GOOGLE_DRIVE_CLIENT_ID = '479371419613-gmcrv9qj8b8o1es36q7gl46ssd0nicv3.apps.googleusercontent.com';
const INTEGRATION_STATUS_URL = 'https://atom-integrations-api.archimedes-api1.workers.dev/api/integrations/status';
let dropboxLoader = null;
let googleIdentityLoader = null;
function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (googleIdentityLoader) return googleIdentityLoader;
  googleIdentityLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('Google authorization did not load.'));
    script.onerror = () => { script.remove(); reject(new Error('Google authorization could not load.')); };
    document.head.append(script);
  }).catch(error => { googleIdentityLoader = null; throw error; });
  return googleIdentityLoader;
}
function loadDropboxSaver() {
  if (window.Dropbox?.save) return Promise.resolve();
  if (dropboxLoader) return dropboxLoader;
  dropboxLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'dropboxjs';
    script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
    script.dataset.appKey = DROPBOX_APP_KEY;
    script.async = true;
    script.onload = () => window.Dropbox?.save ? resolve() : reject(new Error('Dropbox Saver did not load.'));
    script.onerror = () => { script.remove(); reject(new Error('Dropbox Saver could not load.')); };
    document.head.append(script);
  }).catch(error => { dropboxLoader = null; throw error; });
  return dropboxLoader;
}

const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll('.view-tab')];
const toolViews = ['solve', 'check', 'generate'];
const views = [...toolViews, 'graph'];
const forms = Object.fromEntries(toolViews.map((view) => [view, $(`${view}-form`)]));
const results = new Map();
let currentView = 'solve';
let engine = null;
let enginePromise = null;
let connectionAttempts = 0;
let runId = 0;
let running = false;
let topics = [];
let stepId = 0;
let draggedStep = null;
let graphWorkspace = null;
let graphLoading = null;
const resultGraphs = new Map();
let graphHistory = [];
let graphHistoryIndex = -1;
let graphHistoryRestoring = false;
let clearHistory = null;
const sharedGraph = parseGraphShareUrl(location.href);

const solveField = createMathField('f(x)=2/(x-3)+1', {
  id: 'solve-input', ariaLabel: 'Your problem', className: 'math-input',
  placeholder: 'x^{2}+bx+c=0',
});
$('solve-field-mount').append(solveField, createLatexDisclosure(solveField));
const checkField = createMathField('3x+2=2(x+4)', {
  id: 'check-problem', ariaLabel: 'Original problem', className: 'math-input compact', placeholder: '2x+3=7',
});
$('check-field-mount').append(checkField, createLatexDisclosure(checkField));
createKeypad($('math-keypad'), { announce, onEnter() {
  if (currentView === 'graph') {
    $('graph-sidebar-host').querySelector('.graph-row-draft math-field')?.focus();
  } else if (!running) forms[currentView]?.requestSubmit();
} });

const EXAMPLES = [
  { label: 'Rational function', input: 'f(x)=2/(x-3)+1' },
  { label: 'Quadratic', input: 'x^2-5x+6=0' },
  { label: 'Rational expression', input: '(x^2-9)/(x-3)', task: 'simplify' },
  { label: 'Linear system', input: { kind: 'system', equations: ['2x+y=7', 'x-y=2'], variables: ['x', 'y'] } },
  { label: 'Linear equation', input: '3x+2=2(x+4)' },
  {
    label: 'Triangle proof',
    description: 'SSS triangle congruence, then corresponding angles by CPCTC.',
    // Mirrors the SSS correspondence example in tests/geometry.test.js.
    input: {
      kind: 'geometry', topic: 'proof',
      proof: {
        givens: [
          { predicate: 'triangle', args: ['A', 'B', 'C'] },
          { predicate: 'triangle', args: ['D', 'E', 'F'] },
          { predicate: 'segment_equal', args: ['A', 'B', 'D', 'E'] },
          { predicate: 'segment_equal', args: ['B', 'C', 'E', 'F'] },
          { predicate: 'segment_equal', args: ['C', 'A', 'F', 'D'] },
        ],
        steps: [
          { statement: { predicate: 'triangle_congruent', args: [['A', 'B', 'C'], ['D', 'E', 'F']] }, rule: 'SSS', premises: ['g0', 'g1', 'g2', 'g3', 'g4'] },
          { statement: { predicate: 'angle_equal', args: ['A', 'B', 'C', 'D', 'E', 'F'] }, rule: 'CPCTC', premises: ['s0'] },
        ],
        goal: { predicate: 'angle_equal', args: ['A', 'B', 'C', 'D', 'E', 'F'] },
      },
    },
  },
];

const EXAMPLE_GROUPS = [
  { label: 'Geometry measurements', examples: [
    { label: 'Right triangle', input: { kind: 'geometry', topic: 'pythagoras', a: 3, b: 4 } },
    { label: 'Circle area', input: { kind: 'geometry', topic: 'circle', operation: 'area', radius: 3 } },
    { label: 'Triangle angles', input: { kind: 'geometry', topic: 'triangle_angles', angles: [50, 60, null] } },
    { label: 'Coordinate distance', input: { kind: 'geometry', topic: 'distance', points: [[0, 0], [3, 4]] } },
  ] },
  { label: 'More algebra', examples: [
    { label: 'Radical equation', input: 'sqrt(x+5)=x-1' },
    { label: 'Logarithmic equation', input: 'log(x)=2' },
    { label: 'Exponential equation', input: '2^(2x-1)=8' },
    { label: 'Complex arithmetic', input: '(2+3i)*(1-i)' },
  ] },
  { label: 'Common & advanced algebra', examples: [
    { label: 'Absolute-value inequality', input: '|2x-1|<=5' },
    { label: 'Compound inequality', input: '-2<3x+1<=7' },
    { label: 'Biquadratic roots', input: 'x^4-2=0' },
    { label: 'Logarithm product', input: 'log(x)+log(x-3)=1' },
    { label: 'Rearrange a formula', input: 'a*x+b=c', variable: 'x', description: 'Isolate x and inspect every parameter case, including a = 0.' },
    { label: 'Polynomial division', input: { kind: 'polynomial_division', dividend: 'x^3+2x^2+4', divisor: 'x+1' }, description: 'Find the exact quotient and remainder.' },
    { label: 'Compose functions', input: { kind: 'function_operation', operation: 'compose', f: '1/(x-1)', g: '(x+1)/(x-2)' }, description: 'Compose rational functions while retaining inherited domain restrictions.' },
    { label: 'Piecewise function', input: String.raw`\begin{cases}-x & x<0\\x & x\ge0\end{cases}`, description: 'Analyze the domain and range of a piecewise function entered in LaTeX.' },
  ] },
  { label: 'Sequences & matrices', examples: [
    { label: 'Arithmetic sequence', input: { kind: 'sequence', type: 'arithmetic', first: 2, step: 3, n: 5 } },
    { label: 'Geometric sequence', input: { kind: 'sequence', type: 'geometric', first: 2, ratio: 3, n: 5 } },
    { label: 'Matrix inverse', input: { kind: 'matrix', operation: 'inverse', matrix: [[1, 2], [3, 4]] } },
  ] },
  { label: 'Conics', examples: [
    { label: 'Circle equation', input: '(x-2)^2+(y+3)^2=25' },
    { label: 'Ellipse', input: 'x^2/25+y^2/9=1' },
    { label: 'Hyperbola', input: 'x^2/16-y^2/9=1' },
    { label: 'Parabola focus', input: 'y^2=8x' },
  ] },
  { label: 'Precalculus and data', examples: [
    { label: 'Unit circle at 30°', input: { kind: 'precalculus', topic: 'trigonometry', operation: 'unit_circle', angle: '1/6' }, description: 'Exact sine, cosine, and tangent at pi/6.' },
    { label: 'Solve sine on one cycle', input: { kind: 'precalculus', topic: 'trigonometry', operation: 'solve_equation', function: 'sin', target: '1/2', interval: { lower: 0, upper: 2 } }, description: 'Find all exact roots of sin(theta)=1/2 from 0 to 2 pi.' },
    { label: 'Polar to Cartesian', input: { kind: 'precalculus', topic: 'polar', operation: 'to_cartesian', radius: 2, angle: '1/4' } },
    { label: 'Vector dot product', input: { kind: 'precalculus', topic: 'vector', operation: 'dot', a: [1, 2], b: [3, 4] } },
    { label: 'Average rate of change', input: { kind: 'precalc_functions', topic: 'rates', operation: 'average_rate', function: { type: 'polynomial', coefficients: [2, -3, 1] }, from: '1/2', to: '3/2' } },
    { label: 'Parametric position', input: { kind: 'parametric', operation: 'evaluate', x: [1, 2], y: [0, 1, 1], t: '1/2' } },
    { label: 'Sinusoidal model', input: { kind: 'trig_models', operation: 'analyze', function: 'sin', scale: '3/2', rate: '2/3', shift: '1/5', offset: '-1/4' } },
    { label: 'Inverse sine', input: { kind: 'trig_models', operation: 'inverse', function: 'asin', value: '1/2' } },
    { label: 'Fit a line to data', input: { kind: 'data_reasoning', topic: 'regression', operation: 'fit', points: [[0, 1], [1, 3], [2, 5]] } },
  ] },
  { label: 'Supported word problems', examples: [
    { label: 'Taxi fee and miles', word: true, input: 'A taxi charges a $5 flat fee plus $2 per mile. If the total cost is $17, how many miles were traveled?' },
    { label: 'Consecutive integers', word: true, input: 'The sum of three consecutive integers is 72. Find the integers.' },
    { label: 'Discount', word: true, input: 'A jacket costs $80 and is discounted by 25%. What is the sale price?' },
  ] },
];

const CHECK_EXAMPLES = {
  valid: { problem: '4x-1=2x+7', steps: ['2x-1=7', '2x=8', 'x=4'] },
  mistake: { problem: '3x+2=2(x+4)', steps: ['3x+2=2x+4', 'x+2=4', 'x=2'] },
  skipped: { problem: '2(x+3)=14', steps: ['x=4'] },
};

// Create all dynamic content as nodes. User input and engine output are text,
// including error messages, labels, proof rules, JSON, and graph captions.
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function array(value) { return Array.isArray(value) ? value : []; }
function asText(value, pretty = false) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try { return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item, pretty ? 2 : undefined); }
  catch { return 'This value could not be displayed.'; }
}
function humanize(value) {
  const text = asText(value);
  if (/^(sss|sas|asa|aas|cpctc)$/i.test(text)) return text.toUpperCase();
  return text.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}
function listValues(value) { return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]; }
function announce(message) { $('live-status').textContent = message; }
function topicLabel(value) { return topics.find((topic) => topic.id === value)?.label || humanize(value) || 'Math'; }
function inputText(value) { return typeof value === 'string' ? value : asText(value, true); }

function latexSource(value, formatted) { return typeof formatted === 'string' ? formatted : toLatex(value ?? ''); }

function copyMathSteps(steps, formatted = []) {
  return array(steps).map((step, index) => `${index + 1}. ${latexSource(step.after ?? step.input ?? step, formatted[index]?.after)} [${step.verified === true ? 'verified' : step.status || 'not verified'}]${step.explanation ? ` ${step.explanation}` : ''}`).join('\n');
}

function mathNode(tag, className, value, latex = false) {
  return renderMath(latex ? value : toLatex(value ?? ''), { tag, className });
}

function appendNotationStatus(container, result) {
  const status = node('div', 'notation-status');
  status.append(badge(result.latex?.valid === true ? 'LaTeX verified' : 'LaTeX not verified', result.latex?.valid === true ? 'notation' : 'unverified'));
  status.append(node('span', '', 'LaTeX syntax check. Independent of mathematical verification.'));
  if (result.latex?.valid !== true && array(result.latex?.errors).length) {
    const errors = node('details', 'notation-errors');
    errors.append(node('summary', '', 'Notation details'));
    const list = node('ul');
    result.latex.errors.forEach((error) => list.append(node('li', '', typeof error === 'string' ? error : error.message || asText(error))));
    errors.append(list); status.append(errors);
  }
  container.append(status);
}

function loadSolveProblem(problem) {
  $('solve-variable').value = '';
  const structured = isObject(problem) || Array.isArray(problem);
  $('use-structured').checked = structured;
  $('use-word-problem').checked = false;
  $('structured-mode').open = structured;
  syncSolveInputMode();
  if (structured) $('structured-input').value = inputText(problem);
  else setMathFieldValue(solveField, problem);
}

function syncSolveInputMode(focus = false) {
  const structured = $('use-structured').checked, word = $('use-word-problem').checked;
  solveField.readOnly = structured || word;
  $('solve-field-mount').classList.toggle('inactive-math-field', structured || word);
  if (focus) {
    if (word) $('word-problem-input').focus();
    else if (structured) $('structured-input').focus();
    else { setDefaultMathField(solveField); solveField.focus(); }
  }
}

function badge(label, kind) { return node('span', `badge badge-${kind}`, label); }
function verificationBadge(verified, numerical = false) {
  return verified === true ? badge(numerical ? 'Formula checked' : '✓ Verified', 'verified') : badge('Not verified', 'unverified');
}

function setEngineStatus(state, message) {
  const status = $('engine-status');
  const text = $('engine-status-text');
  if (status) status.className = `engine-status ${state}`;
  if (text) text.textContent = message;
}

async function connectEngine() {
  if (engine) return engine;
  if (enginePromise) return enginePromise;
  setEngineStatus('connecting', 'Connecting engine');
  $('retry-engine').disabled = true;
  enginePromise = (async () => {
    // A new URL on explicit retries also recovers from a cached missing module
    // while the core is being added to a shared development directory.
    const module = connectionAttempts++ === 0
      ? await import('./engine/index.js?v=proof-lab-18')
      : await import(`./engine/index.js?v=proof-lab-18&math-lab-retry=${connectionAttempts}`);
    for (const name of ['solve', 'checkWork', 'generateProblem', 'getCapabilities']) {
      if (typeof module[name] !== 'function') throw new Error(`The engine export “${name}” is missing.`);
    }
    engine = module;
    topics = array(module.TOPICS).filter((topic) => isObject(topic) && typeof topic.id === 'string' && typeof topic.label === 'string');
    populateTopics();
    setEngineStatus('ready', 'Ready');
    $('engine-notice').hidden = true;
    renderCoverage();
    try {
      const capabilities = await module.getCapabilities();
      $('capabilities-content').textContent = asText(capabilities, true) || 'No additional capability metadata was returned.';
      renderCoverage(capabilities);
    } catch (error) {
      $('capabilities-content').textContent = `Capability metadata is unavailable. ${errorMessage(error)}`;
    }
    return module;
  })().catch((error) => {
    engine = null;
    setEngineStatus('unavailable', 'Engine unavailable');
    $('engine-notice').hidden = false;
    const fileProtocol = location.protocol === 'file:';
    $('engine-notice-title').textContent = fileProtocol ? 'Open this workspace through a local server.' : 'The math engine could not be loaded.';
    $('engine-notice-message').textContent = fileProtocol
      ? 'Browser modules need HTTP. Run python3 -m http.server 8000 in the project folder, then open localhost:8000/proof-lab.'
      : 'The workbench is ready. Check that engine/index.js and its imports are available, then reconnect.';
    $('capabilities-content').textContent = errorMessage(error);
    throw new Error(fileProtocol ? 'Serve this page over HTTP to load the math engine.' : `The local engine is unavailable. ${errorMessage(error)}`);
  }).finally(() => {
    enginePromise = null;
    $('retry-engine').disabled = false;
  });
  return enginePromise;
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return asText(error) || 'An unexpected error occurred.';
}

function populateTopics() {
  const select = $('generate-topic');
  select.replaceChildren();
  if (!topics.length) {
    select.append(node('option', '', 'No generator topics were declared'));
    select.disabled = true;
    return;
  }
  const groups = new Map();
  for (const topic of topics) {
    const subject = topic.subject || 'Math';
    if (!groups.has(subject)) {
      const group = document.createElement('optgroup');
      group.label = humanize(subject);
      groups.set(subject, group);
      select.append(group);
    }
    const option = node('option', '', topic.label);
    option.value = topic.id;
    groups.get(subject).append(option);
  }
  select.disabled = false;
}

function renderCoverage(capabilities) {
  const container = $('coverage-list');
  container.replaceChildren();
  const declared = isObject(capabilities) ? ['algebra_1', 'algebra_2', 'geometry', 'additional'].filter((key) => Array.isArray(capabilities[key]) && capabilities[key].length) : [];
  if (declared.length) {
    declared.forEach((subject) => {
      const group = node('div', 'coverage-group');
      group.append(node('h3', '', humanize(subject)));
      const list = node('ul');
      capabilities[subject].forEach((label) => list.append(node('li', '', asText(label))));
      group.append(list); container.append(group);
    });
    return;
  }
  if (!topics.length) {
    container.append(node('p', 'subtle', 'This engine has not declared a topic list. Inspect its capabilities below.'));
    return;
  }
  const groups = new Map();
  for (const topic of topics) {
    const subject = topic.subject || 'Math';
    if (!groups.has(subject)) {
      const group = node('div', 'coverage-group');
      group.append(node('h3', '', humanize(subject)));
      const list = node('ul');
      group.append(list);
      groups.set(subject, list);
      container.append(group);
    }
    groups.get(subject).append(node('li', '', topic.label));
  }
}

function emptyState(view) {
  const copy = {
    solve: ['x = ?', 'A little clarity, step by step.', 'Run a problem to see the answer, domain restrictions, and the reasoning behind each step.'],
    check: ['a = b', 'Every line tells a story.', 'Submit your work to check each transition and find the first step that needs another look.'],
    generate: ['x^2 + bx', 'Your next problem starts here.', 'Choose a topic and a difficulty. Then take a fresh problem into your own workspace.'],
  }[view];
  const root = node('div', 'empty-state');
  const art = node('div', 'empty-illustration');
  art.setAttribute('aria-hidden', 'true');
  const sheet = node('div', 'empty-sheet');
  sheet.append(mathNode('span', 'empty-formula', copy[0]), node('span', 'empty-stroke'), node('span', 'empty-stroke'));
  art.append(sheet, node('span', 'empty-seal', '✓'));
  root.append(art, node('h3', '', copy[1]), node('p', '', copy[2]));
  const legend = node('div', 'empty-legend');
  for (const label of ['Clear results', 'Visible reasoning', 'Honest limits']) {
    const item = node('span');
    item.append(node('b', '', '✓'), document.createTextNode(label));
    legend.append(item);
  }
  root.append(legend);
  return root;
}

function showView(view, focus = false) {
  if (!views.includes(view)) return;
  if (running && currentView !== view) cancelRun(false);
  if (currentView !== view) closeKeypad();
  currentView = view;
  tabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`view-${tab.dataset.view}`).hidden = !active;
  });
  $('graph-editor').hidden = view !== 'graph';
  $('result-panel').hidden = view === 'graph';
  $('workbench').classList.toggle('graph-mode', view === 'graph');
  document.querySelector('.keyboard-hint').hidden = view === 'graph';
  if (view === 'graph') {
    ensureGraphWorkspace().then((graph) => {
      if (!graph || currentView !== 'graph') return;
      setDefaultMathField($('graph-sidebar-host').querySelector('math-field'));
      queueMicrotask(() => graph.resize());
    });
  } else {
    $('result-heading').textContent = { solve: 'The reasoning', check: 'Your work, checked', generate: 'Your practice problem' }[view];
    setDefaultMathField(view === 'solve' ? solveField : view === 'check' ? checkField : null);
    showResult();
  }
  if (focus) $(`tab-${view}`).focus();
}

function showResult() {
  if (currentView === 'graph') return;
  const saved = results.get(currentView);
  $('result-content').replaceChildren(saved?.element || emptyState(currentView));
  $('copy-result').hidden = !saved?.copy;
  if (saved?.dirty && !saved.element.querySelector('.result-stale')) {
    saved.element.prepend(node('p', 'result-context result-stale', 'Inputs have changed. Run again to update this result.'));
  }
  requestAnimationFrame(() => resultGraphs.forEach((host, graph) => { if (host.isConnected) graph.resize(); }));
}

function markDirty(view) {
  clearError(view);
  const saved = results.get(view);
  if (saved) { saved.dirty = true; if (view === currentView) showResult(); }
  if (running && view === currentView) cancelRun(false);
}

function clearError(view) {
  const error = $(`${view}-error`);
  error.hidden = true;
  error.textContent = '';
  forms[view].querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
}

function showError(view, message, input) {
  // Moving focus can fire the previous field's change listener. Finish that
  // first, so it cannot clear the new validation message or invalid state.
  if (input) input.focus();
  const error = $(`${view}-error`);
  error.textContent = message;
  error.hidden = false;
  if (input) input.setAttribute('aria-invalid', 'true');
}

function parseInput(text, label, structured = false) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Enter ${label}.`);
  if (structured) {
    let parsed;
    try { parsed = JSON.parse(trimmed); }
    catch { throw new Error('The structured problem is not valid JSON. Use double quotes around field names and check commas and brackets.'); }
    if (!isObject(parsed) && !Array.isArray(parsed)) throw new Error('A structured problem must be a JSON object or array.');
    return parsed;
  }
  if (/\\placeholder\s*(?:\[[^\]]*\])?\s*\{/.test(trimmed)) throw new Error('Fill in the gray template boxes before running the problem.');
  return trimmed;
}

function setBusy(busy, view) {
  running = busy;
  $('result-panel').setAttribute('aria-busy', String(busy));
  $('result-loading').hidden = !busy;
  $('copy-result').disabled = busy;
  toolViews.forEach((name) => {
    const button = $(`${name}-submit`);
    button.disabled = busy;
    button.classList.toggle('is-loading', busy && name === view);
  });
  if (busy) {
    $('loading-title').textContent = { solve: 'Working through the problem…', check: 'Checking each transition…', generate: 'Creating your practice problem…' }[view];
  }
}

function cancelRun(notify = true) {
  runId++;
  setBusy(false);
  if (notify) announce('Request canceled. Your inputs are still here.');
}

async function run(view, callback) {
  if (running) return;
  clearError(view);
  const id = ++runId;
  const startedAt = performance.now();
  setBusy(true, view);
  announce({ solve: 'Solving your problem.', check: 'Checking your work.', generate: 'Generating a problem.' }[view]);
  let timer;
  try {
    // Yield to the browser so the loading state paints even in a background tab.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const localEngine = await connectEngine();
    if (id !== runId) return;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The engine is taking longer than expected. Try a smaller problem or run it again.')), 20000); });
    const result = await Promise.race([callback(localEngine), timeout]);
    const remaining = 150 - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    if (id !== runId) return;
    if (!result || !result.element) throw new Error('The engine did not return a displayable result.');
    const previous = results.get(view);
    resultGraphs.forEach((host, graph) => {
      if (previous?.element.contains(host)) { graph.destroy(); resultGraphs.delete(graph); }
    });
    results.set(view, { ...result, dirty: false });
    if (currentView === view) showResult();
    announce(result.announcement || 'Result ready.');
    if (matchMedia('(max-width: 760px)').matches) $('result-panel').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
  } catch (error) {
    if (id !== runId) return;
    const remaining = 150 - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    const message = errorMessage(error);
    showError(view, message);
    announce(message);
  } finally {
    clearTimeout(timer);
    if (id === runId) setBusy(false);
  }
}

function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

function appendInspector(container, value, label = 'Structured result inspector') {
  const disclosure = node('details', 'result-disclosure');
  disclosure.append(node('summary', '', label), node('pre', '', asText(value, true)));
  container.append(disclosure);
}

function appendRestrictions(container, restrictions, latexRestrictions) {
  const box = node('section', 'restriction-box');
  box.append(node('h3', '', 'Domain & restrictions'));
  const values = listValues(restrictions);
  if (values.length) {
    const list = node('ul');
    values.forEach((item, index) => {
      const li = node('li');
      const formatted = Array.isArray(latexRestrictions) ? latexRestrictions[index] : null;
      li.append(mathNode('span', '', formatted ?? item, formatted != null));
      list.append(li);
    });
    box.append(list);
  } else box.append(node('p', '', 'No restrictions were reported by the engine.'));
  container.append(box);
}

function renderAnswerValue(value) {
  if (isObject(value)) {
    const nested = node('dl', 'answer-data answer-data-nested');
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue;
      const row = node('div', 'answer-entry answer-entry-nested');
      row.append(node('dt', '', humanize(key)), renderAnswerValue(child));
      nested.append(row);
    }
    return nested;
  }
  if (Array.isArray(value) && value.length === 0) return node('span', 'answer-empty', 'None');
  return mathNode('dd', 'answer-value', value);
}

function renderAnswer(answer, latexAnswer) {
  if (isObject(answer)) {
    const root = node('dl', 'answer-data');
    for (const [key, value] of Object.entries(answer)) {
      if (['kind', 'complete', 'coefficients', 'approximations', 'verified'].includes(key) || value === undefined) continue;
      const row = node('div', 'answer-entry');
      row.append(node('dt', '', humanize(key)), renderAnswerValue(value));
      root.append(row);
    }
    return root;
  }
  if (typeof latexAnswer === 'string' && latexAnswer) return mathNode('div', 'answer-math', latexAnswer, true);
  return answer == null ? node('p', 'answer-note', 'No answer was returned.') : mathNode('div', 'answer-math', answer);
}

function proofTimeline(steps, numerical = false, latexSteps = []) {
  const list = node('ol', 'proof-timeline');
  array(steps).forEach((step, index) => {
    const data = isObject(step) ? step : { after: asText(step) };
    const item = node('li', `proof-step${data.verified === true ? ' valid' : ''}`);
    const heading = node('div', 'step-heading');
    const formatted = latexSteps[index];
    const property = data.rule === 'function_property' && typeof data.after === 'string' ? /^([^:]+):\s*(.*)$/s.exec(data.after) : null;
    let after = data.after ?? data.input ?? 'No expression was provided.';
    if (property) {
      after = property[2];
      if (/^[{\[]/.test(after)) { try { after = JSON.parse(after); } catch { /* Retain the engine's literal text. */ } }
    }
    heading.append(node('h4', '', property ? humanize(property[1]) : humanize(data.rule || data.operation) || 'Transformation'), verificationBadge(data.verified, numerical));
    item.append(node('span', 'step-marker', String(index + 1)), heading);
    if (data.before !== undefined) item.append(mathNode('div', 'math-line math-before', formatted?.before ?? data.before, formatted?.before != null));
    item.append(mathNode('div', 'math-line', formatted?.after ?? after, formatted?.after != null));
    if (data.explanation) item.append(node('p', 'step-explanation', data.explanation));
    list.append(item);
  });
  return list;
}

function appendProof(container, steps, numerical = false, latexSteps = []) {
  const values = array(steps);
  const section = node('section', 'proof-section');
  const heading = node('div', 'timeline-heading');
  const progress = node('span', '', values.length ? `1 of ${values.length}` : '0 steps');
  heading.append(node('h3', '', numerical ? 'Formula check timeline' : 'Proof timeline'), progress);
  section.append(heading);
  if (!values.length) {
    section.append(node('p', 'subtle', 'The engine did not return proof steps for this result.'));
    container.append(section);
    return;
  }
  const timeline = proofTimeline(values, numerical, latexSteps);
  const items = [...timeline.children];
  items.slice(1).forEach((item) => { item.hidden = true; });
  section.append(timeline);
  if (items.length > 1) {
    let visible = 1;
    const controls = node('div', 'timeline-controls');
    const next = node('button', 'button button-secondary timeline-next', 'Show next step');
    next.type = 'button';
    next.addEventListener('click', () => {
      items[visible].hidden = false;
      visible += 1;
      progress.textContent = `${visible} of ${items.length}`;
      if (visible === items.length) {
        next.textContent = 'All steps shown';
        next.disabled = true;
      }
      items[visible - 1].scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
    });
    controls.append(next);
    section.append(controls);
  }
  container.append(section);
}

function appendRouting(container, routing) {
  if (!isObject(routing)) return;
  const disclosure = node('details', 'result-disclosure');
  disclosure.append(node('summary', '', 'Engine routing & attempts'));
  const facts = node('dl', 'route-facts');
  for (const [label, value] of [['Initial engine', routing.initialEngine], ['Final engine', routing.finalEngine], ['Difficulty', routing.difficulty]]) {
    const fact = node('div');
    fact.append(node('dt', '', label), node('dd', '', asText(value) || 'Not reported'));
    facts.append(fact);
  }
  disclosure.append(facts);
  if (array(routing.attempts).length) {
    const attempts = node('ol', 'routing-attempts');
    routing.attempts.forEach((attempt) => {
      const item = node('li');
      item.append(node('strong', '', `${asText(attempt.engine) || 'Engine'}: ${humanize(attempt.status) || 'Status unavailable'}`));
      if (attempt.reason) item.append(node('p', '', attempt.reason));
      attempts.append(item);
    });
    disclosure.append(attempts);
  }
  container.append(disclosure);
}

// Both graph surfaces use the same local plotter and visual-expression factory.
function graphOptions(expressions, extra = {}) {
  return {
    expressions,
    readExpression: latexToInput,
    createExpressionField(value, onChange) {
      return createMathField(value, { ariaLabel: 'Graph expression', placeholder: 'y=x^2', onInput: onChange,
        latex: typeof value === 'string' && /^\\begin\{cases\}/.test(value.trim()) });
    },
    renderExpression(value) {
      return renderMath(typeof value === 'string' && /^\\begin\{cases\}/.test(value.trim()) ? value : toLatex(value));
    },
    ...extra,
  };
}

function mountClassroomShare(graph) {
  const sidebar = $('graph-sidebar-host').querySelector('.graph-sidebar');
  if (!sidebar || sidebar.querySelector('.graph-classroom-share')) return;
  const panel = node('section', 'graph-classroom-share');
  panel.setAttribute('aria-label', 'Share and export graph');
  panel.append(node('h3', '', 'Share this graph'));
  panel.append(node('p', '', 'Copy an editable graph link or send it to Google Classroom. The link contains your expressions and window settings.'));
  const copy = node('button', 'graph-share-copy', 'Copy graph link');
  copy.type = 'button';
  const urlRow = node('div', 'graph-share-url-row');
  urlRow.hidden = true;
  const urlInput = node('input', 'graph-share-url-input');
  urlInput.type = 'url';
  urlInput.readOnly = true;
  urlInput.setAttribute('aria-label', 'Graph link');
  urlInput.addEventListener('focus', () => urlInput.select());
  urlRow.append(urlInput);
  const link = node('a', 'graph-classroom-link');
  link.href = 'https://classroom.google.com/share';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const icon = document.createElement('img');
  icon.src = '/images/google-classroom-icon.png';
  icon.alt = '';
  icon.width = 36;
  icon.height = 36;
  link.append(icon, node('span', '', 'Share to Google Classroom'));
  const status = node('p', 'graph-classroom-status');
  status.setAttribute('role', 'status');
  const exportMenu = node('details', 'graph-share-export');
  exportMenu.append(node('summary', '', 'Share / export'));
  const exportList = node('div', 'graph-share-export-list');
  const exportFallback = node('textarea', 'graph-share-export-fallback');
  exportFallback.readOnly = true;
  exportFallback.hidden = true;
  exportFallback.setAttribute('aria-label', 'Prepared graph export');
  function selectPreparedContent(content) {
    exportFallback.value = content;
    exportFallback.hidden = false;
    exportFallback.focus();
    exportFallback.select();
  }
  const exportStatus = node('p', 'graph-share-export-status');
  exportStatus.setAttribute('role', 'status');
  const driveDirect = node('button', 'graph-share-export-button graph-direct-export');
  driveDirect.type = 'button';
  driveDirect.title = 'Save to Google Drive';
  driveDirect.disabled = true;
  const driveMark = node('img', 'graph-export-logo');
  driveMark.src = 'https://www.gstatic.com/images/branding/productlogos/drive_2026/v2/web-64dp/logo_drive_2026_color_2x_web_64dp.png';
  driveMark.alt = '';
  const driveCopy = node('span', 'graph-export-copy');
  driveCopy.append(node('strong', '', 'Save to Google Drive'), node('span', '', 'Choose your account, then save the graph JSON to My Drive'));
  driveDirect.append(driveMark, driveCopy);
  driveDirect.addEventListener('click', async () => {
    try {
      const graphState = graph.getState();
      if (!JSON.parse(prepareGraphExport('google-drive', graphState).content).graph.expressions.length)
        throw new RangeError('Add a graph expression before exporting.');
      const token = await requestDriveAccessToken(window.google, GOOGLE_DRIVE_CLIENT_ID);
      exportStatus.textContent = 'Saving the graph directly to your Google Drive…';
      const saved = await uploadGraphToDrive(graphState, token);
      const link = node('a', '', 'Open saved file');
      link.href = saved.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      exportStatus.replaceChildren(document.createTextNode('Saved to Google Drive. '), link);
    } catch (error) { exportStatus.textContent = errorMessage(error); }
  });
  const githubDirect = node('button', 'graph-share-export-button graph-direct-export');
  githubDirect.type = 'button';
  githubDirect.hidden = true;
  const githubMark = node('img', 'graph-export-logo');
  githubMark.src = './images/github-mark.svg';
  githubMark.alt = '';
  const githubCopy = node('span', 'graph-export-copy');
  githubCopy.append(node('strong', '', 'Save to GitHub'), node('span', '', 'Create an unlisted Gist with gist permission'));
  githubDirect.append(githubMark, githubCopy);
  githubDirect.addEventListener('click', () => {
    try {
      const url = buildDirectExportUrl('github', graph.getState());
      window.open(url, '_blank', 'noopener,noreferrer');
      exportStatus.textContent = 'GitHub opens in a new tab and asks for gist access. A Gist is unlisted, not private: anyone with its link can view it. No repository access is requested.';
    } catch (error) { exportStatus.textContent = errorMessage(error); }
  });
  const notionDirect = node('div', 'graph-notion-direct');
  notionDirect.hidden = true;
  const notionLabel = node('label', '', 'Destination Notion page URL');
  const notionInput = node('input', 'graph-notion-url');
  notionInput.type = 'url';
  notionInput.placeholder = 'https://www.notion.so/...';
  notionInput.autocomplete = 'off';
  notionLabel.append(notionInput);
  const notionButton = node('button', 'graph-share-export-button graph-direct-export');
  notionButton.type = 'button';
  const notionMark = node('img', 'graph-export-logo');
  notionMark.src = 'https://www.notion.so/front-static/logo-ios.png';
  notionMark.alt = '';
  const notionCopy = node('span', 'graph-export-copy');
  notionCopy.append(node('strong', '', 'Save to Notion'), node('span', '', 'Create a child page under this destination'));
  notionButton.append(notionMark, notionCopy);
  notionButton.addEventListener('click', () => {
    try {
      const url = buildDirectExportUrl('notion', graph.getState(), notionInput.value.trim());
      window.open(url, '_blank', 'noopener,noreferrer');
      exportStatus.textContent = 'Notion opens in a new tab. Select the same destination page when Notion asks what to share. The new graph page will be created beneath it.';
    } catch (error) { exportStatus.textContent = errorMessage(error); }
  });
  notionDirect.append(notionLabel, notionButton);
  exportMenu.addEventListener('toggle', () => {
    if (!exportMenu.open) return;
    loadDropboxSaver().catch(() => { exportStatus.textContent = 'Dropbox Saver could not load. You can still download the graph file below.'; });
    loadGoogleIdentity().then(() => { driveDirect.disabled = false; })
      .catch(error => { exportStatus.textContent = errorMessage(error); });
    fetch(INTEGRATION_STATUS_URL, { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
      .then(status => {
        githubDirect.hidden = status?.providers?.github?.available !== true;
        notionDirect.hidden = status?.providers?.notion?.available !== true;
      })
      .catch(() => { githubDirect.hidden = true; notionDirect.hidden = true; });
  });
  const destinations = [
    ['github', 'GitHub', 'Copy text for a Gist'],
    ['notion', 'Notion', 'Copy notes to paste'],
    ['dropbox', 'Dropbox', 'Save graph file to Dropbox'],
    ['google-drive', 'Google Drive', 'Download file for upload'],
    ['zapier', 'Zapier', 'Copy JSON for a configured Zap'],
  ];
  exportList.append(driveDirect);
  for (const [provider, name, action] of destinations) {
    const button = node('button', 'graph-share-export-button');
    button.type = 'button';
    button.append(node('strong', '', name), node('span', '', action));
    button.addEventListener('click', async () => {
      exportFallback.hidden = true;
      exportStatus.textContent = '';
      try {
        if (provider === 'dropbox') {
          if (!window.Dropbox?.save) {
            loadDropboxSaver().catch(() => {});
            exportStatus.textContent = 'Dropbox Saver is loading. Please try Save to Dropbox again in a moment.';
            return;
          }
          const url = buildPublicGraphDownloadUrl(graph.getState());
          window.Dropbox.save(url, 'atom-graph.json', {
            success: () => { exportStatus.textContent = 'Graph saved to your Dropbox.'; },
            cancel: () => { exportStatus.textContent = 'Dropbox save cancelled.'; },
            error: () => { exportStatus.textContent = 'Dropbox could not save this graph. Download the JSON file instead.'; },
          });
          exportStatus.textContent = 'Choose a Dropbox destination in the popup. The file URL contains your graph and is viewable by anyone who has it.';
          return;
        }
        const prepared = prepareGraphExport(provider, graph.getState());
        if (prepared.delivery === 'download') {
          const blobUrl = URL.createObjectURL(new Blob([prepared.content], { type: prepared.mimeType }));
          const download = document.createElement('a');
          download.href = blobUrl;
          download.download = prepared.fileName;
          document.body.append(download);
          download.click();
          download.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
        } else {
          try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(prepared.content);
          } catch {
            selectPreparedContent(prepared.content);
          }
        }
        exportStatus.textContent = prepared.instructions;
      } catch (error) {
        exportStatus.textContent = errorMessage(error);
      }
    });
    if (provider === 'notion') exportList.append(notionDirect);
    if (provider === 'github') exportList.append(githubDirect);
    exportList.append(button);
  }
  const downloadJson = node('button', 'graph-share-export-button');
  downloadJson.type = 'button';
  downloadJson.append(node('strong', '', 'Download graph JSON'), node('span', '', 'For larger graphs or manual upload'));
  downloadJson.addEventListener('click', () => {
    try {
      const prepared = prepareGraphExport('dropbox', graph.getState());
      const blobUrl = URL.createObjectURL(new Blob([prepared.content], { type: prepared.mimeType }));
      const download = document.createElement('a');
      download.href = blobUrl;
      download.download = prepared.fileName;
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      exportStatus.textContent = 'Graph JSON downloaded. Upload it to any service you choose.';
    } catch (error) { exportStatus.textContent = errorMessage(error); }
  });
  exportList.append(downloadJson);
  exportMenu.append(node('p', '', 'Direct saves ask for your approval. Copy and download options let you transfer the graph yourself.'), exportList, exportFallback, exportStatus);
  function showGraphLink() {
    try {
      const state = graph.getState();
      // The graph always keeps a blank draft row; it is not a curve to share.
      const expressions = state.expressions.filter(row =>
        typeof row === 'string' ? row.trim() : typeof row?.expression === 'string' && row.expression.trim());
      const graphUrl = buildGraphShareUrl({ ...state, expressions }, 'https://atom-edu.org/');
      urlInput.value = graphUrl;
      urlRow.hidden = false;
      return graphUrl;
    } catch (error) {
      urlInput.value = '';
      urlRow.hidden = true;
      status.textContent = errorMessage(error) + ' Try a smaller graph or save a PNG instead.';
      return null;
    }
  }
  copy.addEventListener('click', async () => {
    const graphUrl = showGraphLink();
    if (!graphUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(graphUrl);
      status.textContent = 'Graph link copied. You can also select it below.';
    } catch {
      urlInput.focus();
      urlInput.select();
      status.textContent = 'Graph link selected. Copy it with your keyboard.';
    }
  });
  link.addEventListener('click', (event) => {
    const graphUrl = showGraphLink();
    if (!graphUrl) { event.preventDefault(); return; }
    const classroomUrl = new URL('https://classroom.google.com/share');
    classroomUrl.searchParams.set('url', graphUrl);
    link.href = classroomUrl.href;
    status.textContent = 'Graph link is shown above. Choose a class in Google Classroom to share it.';
  });
  exportMenu.append(link);
  panel.append(copy, urlRow, exportMenu, status, node('small', '', 'Each service controls its own sign-in and permissions. atomEDU is not affiliated with these services.'));
  sidebar.append(panel);
}

function rememberGraphState(state) {
  if (graphHistoryRestoring) return;
  const snapshot = graphStateSnapshot(state);
  if (graphHistory[graphHistoryIndex] === snapshot) return;
  graphHistory = graphHistory.slice(0, graphHistoryIndex + 1);
  graphHistory.push(snapshot);
  if (graphHistory.length > 80) graphHistory.shift();
  graphHistoryIndex = graphHistory.length - 1;
}

function graphStateSnapshot(state) {
  return JSON.stringify({
    expressions: state.expressions.map(({ expression, color, visible, imported, strokeWidth }) => ({ expression, color, visible, imported, strokeWidth })),
  });
}

function restoreGraphState(direction) {
  const next = graphHistoryIndex + direction;
  if (!graphWorkspace || next < 0 || next >= graphHistory.length) return;
  graphHistoryIndex = next;
  graphHistoryRestoring = true;
  const snapshot = JSON.parse(graphHistory[next]);
  graphWorkspace.setExpressions(snapshot.expressions);
  queueMicrotask(() => { graphHistoryRestoring = false; });
  setDefaultMathField($('graph-sidebar-host').querySelector('math-field'));
}

async function ensureGraphWorkspace() {
  if (graphWorkspace) return graphWorkspace;
  if (graphLoading) return graphLoading;
  const host = $('graph-workspace-canvas');
  const loading = node('div', 'graph-loading');
  loading.append(node('span', 'spinner'), node('p', '', 'Preparing the graphing workspace…'));
  host.replaceChildren(loading);
  graphLoading = import('./graph/plotter.js?v=proof-lab-28').then(({ createGraph }) => {
    host.replaceChildren();
    graphWorkspace = createGraph(host, graphOptions(sharedGraph?.expressions || [''], {
      sidebarHost: $('graph-sidebar-host'),
      viewport: sharedGraph?.viewport || { xMin: -8.89772485081, xMax: 8.89772485081, yMin: -5, yMax: 5 },
      equalAspect: sharedGraph?.equalAspect ?? true,
      parameters: sharedGraph?.parameters,
      xScale: sharedGraph?.xScale,
      yScale: sharedGraph?.yScale,
      gridMode: sharedGraph?.gridMode,
      onChange: rememberGraphState,
      onShowSidebar: () => setRailCollapsed(false),
    }));
    mountClassroomShare(graphWorkspace);
    // Capture edits before the next canvas frame, including in background tabs.
    // The plotter's onChange still records window changes and gesture updates.
    graphHistory = [graphStateSnapshot(graphWorkspace.getState())];
    graphHistoryIndex = 0;
    for (const eventName of ['input', 'change', 'click']) {
      $('graph-sidebar-host').addEventListener(eventName, () => queueMicrotask(() => {
        if (graphWorkspace && !graphHistoryRestoring) rememberGraphState(graphWorkspace.getState());
      }));
    }
    if (currentView === 'graph') {
      setDefaultMathField($('graph-sidebar-host').querySelector('math-field'));
      queueMicrotask(() => graphWorkspace.resize());
    }
    return graphWorkspace;
  }).catch((error) => {
    host.replaceChildren(node('p', 'graph-loading', `The graph could not be loaded. ${errorMessage(error)}`));
    const retry = node('button', 'button button-secondary', 'Reload graph');
    retry.type = 'button'; retry.addEventListener('click', ensureGraphWorkspace); host.append(retry);
    return null;
  }).finally(() => { graphLoading = null; });
  return graphLoading;
}

function appendFunctionDetails(container, details) {
  if (!isObject(details) || !details.function) return;
  const data = details.function;
  const expression = typeof data === 'string' ? data : data.expression;
  const block = node('details', 'graph-block graph-disclosure');
  const summary = node('summary', 'graph-summary');
  summary.append(node('span', '', 'Explore the graph'), node('span', 'graph-summary-note', 'Optional view'));
  block.append(summary);
  const content = node('div', 'graph-disclosure-body');
  const heading = node('div', 'graph-preview-heading');
  heading.append(node('h3', '', 'Function graph'));
  const expand = node('button', 'text-button', 'Open full graph ↗');
  expand.type = 'button';
  expand.addEventListener('click', async () => {
    showView('graph');
    const graph = await ensureGraphWorkspace();
    if (graph && expression) graph.setExpressions([`y=${toLatex(expression)}`]);
  });
  heading.append(expand); content.append(heading);
  const host = node('div', 'function-graph');
  content.append(host, node('p', 'graph-caption', 'Pan and zoom to explore this function.'));
  let graphStarted = false;
  const startGraph = () => {
    if (graphStarted) return;
    graphStarted = true;
    if (!expression) { host.append(node('p', 'subtle', 'No graphable function expression was returned.')); return; }
    const loading = node('div', 'graph-loading');
    loading.append(node('span', 'spinner'), node('p', '', 'Loading graph…'));
    host.replaceChildren(loading);
    import('./graph/plotter.js?v=proof-lab-28').then(({ createGraph }) => {
      host.replaceChildren();
      const graph = createGraph(host, graphOptions([`y=${toLatex(expression)}`], { compact: true, showExport: false }));
      resultGraphs.set(graph, host);
      requestAnimationFrame(() => graph.resize());
    }).catch(() => host.replaceChildren(node('p', 'subtle', 'The interactive graph is unavailable. Exact function properties are shown in the reasoning.')));
  };
  block.addEventListener('toggle', () => { if (block.open) startGraph(); });
  const disclosure = node('details', 'result-disclosure');
  disclosure.append(node('summary', '', 'Function metadata'), node('pre', '', asText(data, true)));
  content.append(disclosure); block.append(content); container.append(block);
}

function renderSolve(result, problem) {
  if (!isObject(result) || !['solved', 'unsupported', 'invalid', 'unresolved'].includes(result.status)) {
    throw new Error('The engine returned an unfamiliar solve response. Expected a status, answer, and proof steps.');
  }
  const root = node('div', 'result-body');
  const numerical = result.certificate?.assurance === 'numerical-formula-check';
  const meta = node('div', 'result-meta');
  const resultBadge = result.status === 'solved' ? numerical && result.verified === true ? badge('Formula checked. Numerical values approximate.', 'verified') : verificationBadge(result.verified) : badge(humanize(result.status), result.status === 'invalid' ? 'invalid' : 'unresolved');
  if (numerical) resultBadge.classList.add('badge-formula');
  meta.append(node('span', 'topic-label', topicLabel(result.topic)), resultBadge);
  root.append(meta);
  appendNotationStatus(root, result);
  if (result.status === 'solved') {
    const answer = node('section', 'answer-card');
    answer.append(node('h3', 'answer-label', result.verified === true ? 'Result' : 'Candidate result. Not verified.'), renderAnswer(result.answer, result.latex?.answer));
    root.append(answer);
    if (result.verified !== true) root.append(node('p', 'answer-note', 'The engine returned an answer without verification. Treat it as a candidate, not an established result.'));
  } else {
    const messages = {
      invalid: ['Check the problem input.', 'The engine could not read or validate this problem. Check the notation or structured fields.'],
      unsupported: ['Outside the current rule set.', 'The connected engine does not support this problem family or task yet. Try a listed example or inspect coverage below.'],
      unresolved: ['A result could not be established.', 'The engine could not finish a verified solution within its current capabilities. Try a simpler form or a different task.'],
    }[result.status];
    const status = node('div', `status-card${result.status === 'invalid' ? ' error' : ''}`);
    status.append(node('h3', '', messages[0]), node('p', '', result.error || messages[1]));
    root.append(status);
  }
  appendRestrictions(root, result.restrictions, result.latex?.restrictions);
  appendFunctionDetails(root, result.details);
  appendProof(root, result.steps, numerical, result.latex?.steps);
  const context = node('p', 'result-context');
  context.append(node('strong', '', 'Problem: '), mathNode('span', '', result.latex?.input ?? problem, result.latex?.input != null));
  root.append(context);
  appendRouting(root, result.routing);
  appendInspector(root, result);
  return {
    element: root,
    copy: `Problem: ${latexSource(problem, result.latex?.input)}\nStatus: ${result.status}\nLaTeX: ${result.latex?.valid === true ? 'verified' : 'not verified'}\nMathematical assurance: ${numerical ? 'Formula checked. Numerical values approximate.' : result.verified === true ? 'Verified by the engine' : 'Not verified'}\nAnswer: ${latexSource(result.answer, result.latex?.answer)}\nRestrictions: ${listValues(result.restrictions).map((value, index) => latexSource(value, result.latex?.restrictions?.[index])).join('; ') || 'None reported'}\n${copyMathSteps(result.steps, result.latex?.steps)}${result.error ? `\n${asText(result.error)}` : ''}`,
    announcement: result.status === 'solved' ? `Result ready. ${result.verified === true ? numerical ? 'Formula checked. Numerical values are approximate.' : 'Verified by the engine.' : 'The result is not verified.'}` : `Problem ${result.status}. ${result.error || ''}`,
  };
}

function ghostNode(ghost, corrected = false) {
  const data = isObject(ghost) ? ghost : { after: asText(ghost) };
  const root = node('div', 'step-ghost');
  const label = node('div', 'ghost-label');
  label.append(document.createTextNode('Ghost step: '), node('span', '', corrected ? 'corrected continuation' : 'reconstructed reasoning'));
  root.append(label);
  if (data.before !== undefined) root.append(mathNode('div', 'math-line math-before', data.before));
  root.append(mathNode('div', 'math-line', data.after ?? data.input ?? data.expression ?? ghost), verificationBadge(data.verified));
  if (data.explanation) root.append(node('p', 'step-explanation', data.explanation));
  return root;
}

function renderCheck(result, problem, submittedSteps) {
  if (!isObject(result) || !['valid', 'invalid', 'unresolved'].includes(result.status)) throw new Error('The engine returned an unfamiliar work-check response.');
  const root = node('div', 'result-body');
  const summary = node('section', `status-card${result.status === 'valid' ? ' success' : result.status === 'invalid' ? ' error' : ''}`);
  summary.append(badge(result.status === 'valid' ? '✓ Valid transitions' : humanize(result.status), result.status));
  const firstError = Number.isInteger(result.firstError) && result.firstError >= 0 ? result.firstError : null;
  const title = result.status === 'valid'
    ? result.complete === true ? 'Your solution checks out.' : 'The work so far checks out.'
    : result.status === 'invalid' ? firstError === null ? 'A transition needs another look.' : `Take another look at step ${firstError + 1}.` : 'Some reasoning is still unresolved.';
  summary.append(node('h3', '', title), node('p', '', result.summary || 'Inspect each transition below for the engine’s feedback.'));
  if (result.status === 'valid' && result.complete !== true) summary.append(node('p', 'answer-note', 'These transitions are valid, but the engine has not marked the solution complete.'));
  root.append(summary);
  appendNotationStatus(root, result);
  const start = node('p', 'result-context');
  start.append(node('strong', '', 'Starting from: '), mathNode('span', '', result.latex?.input ?? problem, result.latex?.input != null));
  root.append(start);
  const heading = node('div', 'timeline-heading');
  heading.append(node('h3', '', 'Your submitted steps'), node('span', '', `${submittedSteps.length} ${submittedSteps.length === 1 ? 'line' : 'lines'}`));
  root.append(heading);
  const timeline = node('ol', 'proof-timeline');
  const shownGhosts = new Set();
  const checkedSteps = array(result.steps);
  for (let index = 0; index < Math.max(checkedSteps.length, submittedSteps.length); index++) {
    const step = checkedSteps[index] || { input: submittedSteps[index], status: 'unresolved', explanation: 'The engine did not return feedback for this line.' };
    const status = ['valid', 'invalid', 'unresolved'].includes(step.status) ? step.status : 'unresolved';
    const localOnly = status === 'valid' && step.onOriginalPath === false;
    const item = node('li', `proof-step ${localOnly ? 'local-only' : status}`);
    item.append(node('span', 'step-marker', String(index + 1)));
    const stepHeading = node('div', 'step-heading');
    stepHeading.append(node('h4', '', firstError === index ? `Step ${index + 1}: first error` : `Step ${index + 1}`), badge(localOnly ? 'Locally valid. Follows earlier error.' : status === 'valid' ? '✓ Valid' : humanize(status), localOnly ? 'unresolved' : status));
    item.append(stepHeading);
    // Reconstructed checkpoints precede the submitted line they help explain.
    for (const ghost of array(step.ghostSteps)) {
      const key = asText(ghost);
      if (!shownGhosts.has(key)) { item.append(ghostNode(ghost)); shownGhosts.add(key); }
    }
    item.append(mathNode('div', 'math-line', result.latex?.steps?.[index]?.after ?? step.input ?? submittedSteps[index] ?? '', result.latex?.steps?.[index]?.after != null));
    if (step.explanation) item.append(node('p', 'step-explanation', step.explanation));
    if (localOnly) item.append(node('p', 'step-explanation', 'This line follows an earlier error or unresolved step. It does not repair the original proof.'));
    timeline.append(item);
  }
  root.append(timeline);
  const extraGhosts = array(result.ghostSteps).filter((ghost) => !shownGhosts.has(asText(ghost)));
  if (extraGhosts.length) {
    root.append(node('h3', 'ghost-heading', 'Additional reconstructed reasoning'));
    extraGhosts.forEach((ghost) => root.append(ghostNode(ghost)));
  }
  if (array(result.correctedSteps).length) {
    const correction = node('section', 'corrected-ghost-section');
    const verified = result.correctedSteps.every((step) => step.verified === true);
    correction.append(node('h3', 'ghost-heading', verified ? 'Verified corrected continuation' : 'Corrected continuation. Not fully verified.'));
    correction.append(node('p', 'subtle', 'These Ghost steps continue from the last valid point. They are a separate correction, not the work you submitted.'));
    result.correctedSteps.forEach((step) => correction.append(ghostNode(step, true)));
    root.append(correction);
  }
  appendInspector(root, result);
  return {
    element: root,
    copy: `Problem: ${latexSource(problem, result.latex?.input)}\nStatus: ${result.status}\nComplete: ${result.complete === true}\n${result.summary || title}\n${copyMathSteps(checkedSteps, result.latex?.steps)}\nGhost steps (reconstructed):\n${copyMathSteps(result.ghostSteps)}\nCorrected continuation (separate from submitted work):\n${copyMathSteps(result.correctedSteps)}`,
    announcement: `${title} ${result.summary || ''}`,
  };
}

function extractGeneratedProblem(result) {
  if (typeof result === 'string') return result;
  if (!isObject(result)) return null;
  // `problem` can be a human-readable instruction with math appended; only
  // `input` is guaranteed to be directly consumable by the solver/checker.
  return result.input ?? result.problem ?? result.prompt ?? null;
}

function transferProblem(problem, view) {
  if (view === 'solve') {
    loadSolveProblem(problem);
    $('solve-task').value = '';
    $('solve-difficulty').value = '';
    markDirty('solve');
  } else {
    setMathFieldValue(checkField, problem);
    replaceWorkSteps(['']);
    markDirty('check');
  }
  showView(view);
  (view === 'solve' ? $('use-word-problem').checked ? $('word-problem-input') : $('use-structured').checked ? $('structured-input') : solveField : document.querySelector('.step-input')).focus();
  announce(`Problem opened in ${view === 'solve' ? 'Solve' : 'Check work'}.`);
}

function renderGenerated(result, options) {
  if (isObject(result) && (result.error || ['unsupported', 'invalid', 'unresolved'].includes(result.status))) {
    throw new Error(result.error || `The generator returned ${result.status} for this topic.`);
  }
  const problem = extractGeneratedProblem(result);
  if (problem === null || problem === undefined || problem === '') throw new Error('The generator did not return a problem. Expected problem, input, or prompt.');
  const root = node('div', 'result-body');
  const meta = node('div', 'result-meta');
  meta.append(node('span', 'topic-label', topicLabel(result.topic || options.topic)), badge('Practice problem', 'neutral'));
  if (result.task) root.append(meta, node('p', 'generation-task', result.task));
  else root.append(meta);
  appendNotationStatus(root, result);
  root.append(mathNode('div', 'generated-problem', result.latex?.input ?? problem, result.latex?.input != null));
  const facts = node('div', 'generated-meta');
  facts.append(node('span', '', `Difficulty ${result.difficulty ?? options.difficulty}`), node('span', '', `Seed ${result.seed ?? options.seed}`));
  root.append(facts, node('p', 'generation-note', 'Work it through yourself, or open the problem to explore the engine’s solution.'));
  const actions = node('div', 'result-actions');
  const canCheck = typeof problem === 'string';
  if (canCheck) {
    const check = node('button', 'button button-clay', 'Try in Check work ↗');
    check.type = 'button'; check.addEventListener('click', () => transferProblem(problem, 'check'));
    actions.append(check);
  }
  const solve = node('button', `button ${canCheck ? 'button-secondary' : 'button-clay'}`, 'Open in Solve ↗');
  solve.type = 'button'; solve.addEventListener('click', () => transferProblem(problem, 'solve'));
  actions.append(solve); root.append(actions);
  if (!canCheck) root.append(node('p', 'field-help', 'Step checking accepts algebra statements in LaTeX. Open this structured problem in Solve to inspect its reasoning.'));
  appendRestrictions(root, result.restrictions, result.latex?.restrictions);
  const solution = result.solution ?? result.steps ?? result.referenceSteps;
  if (Array.isArray(solution) && solution.length) {
    const referenceOnly = !Array.isArray(result.solution) && !Array.isArray(result.steps);
    const numerical = result.verification?.assurance === 'numerical-formula-check';
    const verified = !referenceOnly && solution.every((step) => step.verified === true);
    const reveal = node('details', 'generation-solution');
    reveal.append(node('summary', '', referenceOnly ? 'Reveal the reference scaffold' : verified ? 'Reveal the verified solution' : 'Reveal the generated solution'));
    if (referenceOnly) reveal.append(node('p', 'generation-assurance subtle', 'Reference steps are generation scaffolding. They have not been independently verified.'));
    else if (verified) reveal.append(numerical ? badge('Formula checked. Numerical values approximate.', 'verified') : node('p', 'generation-assurance subtle', 'These solution steps passed the engine’s independent verification.'));
    if (numerical) reveal.querySelector('.badge')?.classList.add('badge-formula', 'generation-assurance');
    appendProof(reveal, referenceOnly ? solution.map((step) => isObject(step) ? { ...step, verified: false } : step) : solution, numerical, result.latex?.steps);
    root.append(reveal);
  }
  appendInspector(root, result, 'Generated problem inspector');
  return { element: root, copy: `Topic: ${topicLabel(result.topic || options.topic)}\nProblem: ${latexSource(problem, result.latex?.input)}\nDifficulty: ${result.difficulty ?? options.difficulty}\nSeed: ${result.seed ?? options.seed}`, announcement: 'A new practice problem is ready.' };
}

function addWorkStep(value = '', focus = false) {
  const container = $('work-steps');
  if (container.childElementCount >= 50) { announce('You can check up to 50 steps at a time.'); return; }
  const row = node('div', 'work-step');
  row.draggable = true;
  const dragHandle = node('button', 'step-drag-handle');
  dragHandle.type = 'button';
  dragHandle.title = 'Drag to reorder this step';
  dragHandle.setAttribute('aria-label', 'Reorder solution step');
  dragHandle.append(node('span'), node('span'), node('span'), node('span'));
  const label = node('label', 'work-step-number');
  const input = createMathField(value, { id: `work-step-${++stepId}`, ariaLabel: 'Solution step', className: 'step-input' });
  label.htmlFor = input.id;
  const remove = node('button', 'remove-step', '×');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    const inputs = [...container.querySelectorAll('math-field')];
    const position = inputs.indexOf(input);
    if (inputs.length === 1) { setMathFieldValue(input, ''); input.focus(); }
    else { row.remove(); (inputs[position + 1] || inputs[position - 1]).focus(); }
    renumberSteps(); markDirty('check');
  });
  input.addEventListener('input', () => markDirty('check'));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const inputs = [...container.querySelectorAll('math-field')];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus(); else { addWorkStep('', true); markDirty('check'); }
    }
  });
  const fieldGroup = node('div', 'step-field-group');
  fieldGroup.append(input, createLatexDisclosure(input));
  row.append(dragHandle, label, fieldGroup, remove);
  row.addEventListener('dragstart', (event) => {
    draggedStep = row;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', input.id);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('is-dragging');
    draggedStep = null;
    renumberSteps();
    markDirty('check');
  });
  dragHandle.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const sibling = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (event.key === 'ArrowUp') container.insertBefore(row, sibling);
    else container.insertBefore(sibling, row);
    renumberSteps();
    markDirty('check');
    dragHandle.focus();
  });
  container.append(row);
  renumberSteps();
  if (focus) input.focus();
}

function renumberSteps() {
  [...$('work-steps').children].forEach((row, index) => {
    const label = row.querySelector('label');
    label.replaceChildren(document.createTextNode(String(index + 1)), node('span', 'sr-only', '. Solution step'));
    const field = row.querySelector('math-field');
    field.setAttribute('aria-label', `Solution step ${index + 1}`);
    field.placeholder = index === 0 ? 'x+3=7' : 'x=4';
    row.querySelector('.remove-step').setAttribute('aria-label', `Remove step ${index + 1}`);
    row.querySelector('.step-drag-handle').setAttribute('aria-label', `Reorder solution step ${index + 1}. Use arrow keys or drag.`);
  });
  $('add-step').disabled = $('work-steps').childElementCount >= 50;
}

function replaceWorkSteps(values) {
  $('work-steps').replaceChildren();
  values.forEach((value) => addWorkStep(value));
}

$('work-steps').addEventListener('dragover', (event) => {
  if (!draggedStep) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const siblings = [...$('work-steps').querySelectorAll('.work-step:not(.is-dragging)')];
  const next = siblings.find((sibling) => event.clientY < sibling.getBoundingClientRect().top + sibling.getBoundingClientRect().height / 2);
  $('work-steps').insertBefore(draggedStep, next || null);
});

$('work-steps').addEventListener('drop', (event) => {
  if (!draggedStep) return;
  event.preventDefault();
  renumberSteps();
  markDirty('check');
});

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0x100000000);
}

function handleSolve(event) {
  event.preventDefault();
  let problem;
  const field = $('use-word-problem').checked ? $('word-problem-input') : $('use-structured').checked ? $('structured-input') : solveField;
  try { problem = parseInput(field.value, 'a problem to solve', $('use-structured').checked); }
  catch (error) { showError('solve', errorMessage(error), field); return; }
  const options = {};
  options.domain = $('solve-domain').value;
  if ($('solve-task').value) options.task = $('solve-task').value;
  if ($('solve-difficulty').value) options.difficulty = $('solve-difficulty').value;
  if ($('solve-variable').value) options.variable = $('solve-variable').value;
  run('solve', async (core) => renderSolve(await core.solve(problem, options), problem));
}

function handleCheck(event) {
  event.preventDefault();
  let problem;
  try { problem = parseInput($('check-problem').value, 'the original problem'); }
  catch (error) { showError('check', errorMessage(error), $('check-problem')); return; }
  if (typeof problem !== 'string') {
    showError('check', 'Step checking accepts algebra statements in LaTeX. Open structured systems and geometry in Solve.', $('check-problem'));
    return;
  }
  const inputs = [...$('work-steps').querySelectorAll('math-field')];
  // Ignore trailing empty rows, but never collapse gaps inside submitted work.
  let last = inputs.length - 1;
  while (last >= 0 && !inputs[last].value.trim()) last--;
  if (last < 0) { showError('check', 'Add at least one solution step to check.', inputs[0]); return; }
  const submitted = inputs.slice(0, last + 1);
  const gap = submitted.find((input) => !input.value.trim());
  if (gap) { showError('check', 'Fill in this step or remove the empty line before checking.', gap); return; }
  const steps = submitted.map((input) => input.value.trim());
  const unfinished = submitted.find((input) => /\\placeholder\s*(?:\[[^\]]*\])?\s*\{/.test(input.value));
  if (unfinished) { showError('check', 'Fill in the gray template boxes in this step.', unfinished); return; }
  run('check', async (core) => renderCheck(await core.checkWork(problem, steps, { showGhosts: true }), problem, steps));
}

function handleGenerate(event) {
  event.preventDefault();
  run('generate', async (core) => {
    const topic = $('generate-topic').value;
    if (!topic) throw new Error('The connected engine has not declared any generator topics.');
    let seed = $('generate-seed').value.trim();
    if (!seed) seed = String(randomSeed());
    // Preserve text seeds; numeric seeds are passed as numbers for seeded PRNGs.
    const numericSeed = Number(seed);
    const options = { topic, difficulty: Number($('generate-difficulty').value).toFixed(3), seed: /^-?\d+$/.test(seed) && Number.isSafeInteger(numericSeed) ? numericSeed : seed };
    return renderGenerated(await core.generateProblem(options), options);
  });
}

function setRailCollapsed(collapsed) {
  $('workbench').classList.toggle('rail-collapsed', collapsed);
  $('rail-expand').hidden = !collapsed;
  if (collapsed) closeKeypad();
  queueMicrotask(() => graphWorkspace?.resize());
}

$('keyboard-toggle').addEventListener('click', async () => {
  if ($('math-keypad').classList.contains('is-open')) { closeKeypad(); return; }
  if (currentView === 'graph' && !graphWorkspace) await ensureGraphWorkspace();
  const field = getActiveMathField() || (currentView === 'graph' ? $('graph-sidebar-host').querySelector('math-field') : null) || solveField;
  field.focus();
  openKeypad(field);
});
new MutationObserver(() => {
  $('keyboard-toggle').setAttribute('aria-expanded', String($('math-keypad').classList.contains('is-open')));
  queueMicrotask(() => graphWorkspace?.resize());
}).observe($('math-keypad'), { attributes: true, attributeFilter: ['class'] });

$('rail-collapse').addEventListener('click', () => setRailCollapsed(true));
$('rail-expand').addEventListener('click', () => setRailCollapsed(false));
$('rail-clear').addEventListener('click', () => {
  if (currentView === 'graph') graphWorkspace?.setExpressions(['']);
  else if (currentView === 'check') {
    clearHistory = { view: 'check', before: { problem: checkField.value, steps: [...$('work-steps').querySelectorAll('math-field')].map(field => field.value) }, undone: false };
    setMathFieldValue(checkField, ''); replaceWorkSteps(['']); markDirty('check');
  }
  else if (currentView === 'generate') {
    clearHistory = { view: 'generate', before: { seed: $('generate-seed').value, difficulty: $('generate-difficulty').value }, undone: false };
    $('generate-seed').value = ''; $('generate-difficulty').value = '0.400'; syncDifficultyControl(); markDirty('generate');
  }
  else {
    clearHistory = { view: 'solve', before: solveField.value, undone: false };
    setMathFieldValue(solveField, ''); markDirty('solve'); solveField.focus();
  }
});
$('rail-undo').addEventListener('click', () => {
  if (currentView === 'graph') restoreGraphState(-1);
  else if (clearHistory?.view === currentView && !clearHistory.undone) {
    if (currentView === 'solve') setMathFieldValue(solveField, clearHistory.before, { latex: true });
    if (currentView === 'check') { setMathFieldValue(checkField, clearHistory.before.problem, { latex: true }); replaceWorkSteps(clearHistory.before.steps); }
    if (currentView === 'generate') { $('generate-seed').value = clearHistory.before.seed; $('generate-difficulty').value = clearHistory.before.difficulty; syncDifficultyControl(); }
    clearHistory.undone = true;
    markDirty(currentView);
  }
  else (currentView === 'check' ? document.activeElement?.closest?.('math-field') || checkField : solveField)?.executeCommand?.('undo');
});
$('rail-redo').addEventListener('click', () => {
  if (currentView === 'graph') restoreGraphState(1);
  else if (clearHistory?.view === currentView && clearHistory.undone) {
    if (currentView === 'solve') setMathFieldValue(solveField, '');
    if (currentView === 'check') { setMathFieldValue(checkField, ''); replaceWorkSteps(['']); }
    if (currentView === 'generate') { $('generate-seed').value = ''; $('generate-difficulty').value = '0.400'; syncDifficultyControl(); }
    clearHistory.undone = false;
    markDirty(currentView);
  }
  else (currentView === 'check' ? document.activeElement?.closest?.('math-field') || checkField : solveField)?.executeCommand?.('redo');
});

const popovers = [
  { button: $('tour-menu-button'), panel: $('tour-menu') },
  { button: $('language-menu-button'), panel: $('language-menu') },
];
function closePopovers() {
  for (const { button, panel } of popovers) { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
}
for (const { button, panel } of popovers) button.addEventListener('click', () => {
  const shouldOpen = panel.hidden;
  closePopovers();
  panel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', String(shouldOpen));
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.lab-menu-wrap')) closePopovers();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopovers(); });

const languageMenu = $('language-menu');
const languageList = languageMenu.querySelector('.language-list');

function syncLanguageOptions() {
  const active = window.atomI18n?.getLanguage?.() || 'en';
  languageList.querySelectorAll('.language-option').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === active)));
}
languageList.addEventListener('click', (event) => {
  const button = event.target.closest('.language-option');
  if (!button) return;
  window.atomI18n?.setLanguage?.(button.dataset.language);
  syncLanguageOptions();
  closePopovers();
});
window.atomI18n?.subscribe?.(syncLanguageOptions);
syncLanguageOptions();

const tourSteps = [
  { view: 'solve', icon: 'M4 17h4l3-10 3 10h6M3 20h18', title: 'Start with a problem', description: 'Type in the math field or use the math pad to build an expression visually.' },
  { view: 'solve', icon: 'M4 18h5v-4h5v-4h6V6m-3 0h3v3', title: 'See each step', description: 'Solve a problem, then reveal the proof one step at a time. Results and domain restrictions stay easy to scan.' },
  { view: 'check', icon: 'm4 12 5 5L20 6', title: 'Check your work', description: 'Enter your own lines, drag to reorder them, and see where a transition changes the reasoning.' },
  { view: 'generate', icon: 'm12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2ZM5 16l.7 2.3L8 19l-2.3.7L5 22l-.7-2.3L2 19l2.3-.7L5 16Z', title: 'Generate practice', description: 'Choose a topic and difficulty, then generate a problem checked by the engine.' },
  { view: 'graph', icon: 'M3 3v18h18M5 17c3-1 3-8 6-8s3 5 5 5 3-4 5-6', title: 'Explore the graph', description: 'Enter expressions on the left. Pan and zoom across the graph on the right.' },
];
let tourStep = 0;
const tourText = (value) => window.atomI18n?.translate?.(value) || value;
async function loadGraphExample(expression) {
  const graph = await ensureGraphWorkspace();
  graph?.setExpressions([expression]);
  if (graph) rememberGraphState(graph.getState());
}
document.querySelectorAll('[data-tour-view]').forEach((button) => button.addEventListener('click', () => {
  showView(button.dataset.tourView);
  closePopovers();
  closeKeypad();
}));

const tourExamples = [
  { section: 'Solve', view: 'solve', label: 'Quadratic equation', action: () => { loadSolveProblem(EXAMPLES[1].input); $('solve-task').value = ''; } },
  { section: 'Solve', view: 'solve', label: 'Rational function', action: () => loadSolveProblem(EXAMPLES[0].input) },
  { section: 'Check work', view: 'check', label: 'Correct solution', action: () => { const sample = CHECK_EXAMPLES.valid; setMathFieldValue(checkField, sample.problem); replaceWorkSteps(sample.steps); markDirty('check'); } },
  { section: 'Check work', view: 'check', label: 'Find a mistake', action: () => { const sample = CHECK_EXAMPLES.mistake; setMathFieldValue(checkField, sample.problem); replaceWorkSteps(sample.steps); markDirty('check'); } },
  { section: 'Generate', view: 'generate', label: 'Foundation practice', action: () => { if ($('generate-topic').querySelector('option[value="linear"]')) $('generate-topic').value = 'linear'; $('generate-difficulty').value = '0.250'; syncDifficultyControl(); } },
  { section: 'Generate', view: 'generate', label: 'Challenging practice', action: () => { if ($('generate-topic').querySelector('option[value="quadratic"]')) $('generate-topic').value = 'quadratic'; $('generate-difficulty').value = '0.750'; syncDifficultyControl(); } },
  { section: 'Graph', view: 'graph', label: 'Parabola', action: () => loadGraphExample('y=x^2') },
  { section: 'Graph', view: 'graph', label: 'Line', action: () => loadGraphExample('y=2x+1') },
  { section: 'Graph', view: 'graph', label: 'Circle', action: () => loadGraphExample('x^2+y^2=9') },
];
let lastTourExampleSection = '';
for (const sample of tourExamples) {
  if (sample.section !== lastTourExampleSection) {
    $('tour-examples').append(node('h3', '', sample.section));
    lastTourExampleSection = sample.section;
  }
  const button = node('button', 'lab-tour-example', sample.label);
  button.type = 'button';
  button.addEventListener('click', async () => {
    closePopovers();
    showView(sample.view);
    await sample.action();
  });
  $('tour-examples').append(button);
}
function renderTour() {
  const step = tourSteps[tourStep];
  $('tour-count').textContent = `${tourStep + 1} of ${tourSteps.length}`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', step.icon);
  icon.append(path);
  $('tour-illustration').replaceChildren(icon);
  $('tour-title').textContent = tourText(step.title);
  $('tour-description').textContent = tourText(step.description);
  $('tour-previous').hidden = tourStep === 0;
  $('tour-next').textContent = tourText(tourStep === tourSteps.length - 1 ? 'Finish tour' : 'Next');
  $('tour-progress').replaceChildren(...tourSteps.map((_, index) => node('span', index === tourStep ? 'active' : '')));
  showView(step.view);
}
$('tour-start').addEventListener('click', () => {
  closePopovers();
  closeKeypad();
  tourStep = 0;
  renderTour();
  $('tour-dialog').showModal();
});
$('tour-previous').addEventListener('click', () => { if (tourStep > 0) { tourStep--; renderTour(); } });
$('tour-next').addEventListener('click', () => {
  if (tourStep === tourSteps.length - 1) $('tour-dialog').close();
  else { tourStep++; renderTour(); }
});
$('tour-close').addEventListener('click', () => $('tour-dialog').close());
$('tour-dialog').addEventListener('click', (event) => { if (event.target === $('tour-dialog')) $('tour-dialog').close(); });
$('tour-coverage').addEventListener('click', () => { closePopovers(); openCoverage(); });
$('tour-keyboard').addEventListener('click', () => { closePopovers(); showView('solve'); solveField.focus(); openKeypad(solveField); });

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); showView(tabs[next].dataset.view, true); }
  });
});

function exampleButton(example) {
  const button = node('button', 'example-button');
  button.type = 'button';
  if (example.description) button.title = example.description;
  button.append(document.createTextNode(example.label), node('span', '', '↗'));
  button.addEventListener('click', () => {
    if (example.word) {
      $('use-structured').checked = false;
      $('use-word-problem').checked = true;
      $('structured-mode').open = false;
      $('solve-options').open = true;
      $('word-mode').open = true;
      $('word-problem-input').value = example.input;
      syncSolveInputMode();
    } else loadSolveProblem(example.input);
    $('solve-task').value = example.task || '';
    $('solve-variable').value = example.variable || '';
    markDirty('solve'); ($('use-word-problem').checked ? $('word-problem-input') : $('use-structured').checked ? $('structured-input') : solveField).focus();
    announce(`${example.label} example loaded. ${example.description || ''} Run Solve problem to see the result.`);
  });
  return button;
}

EXAMPLES.forEach((example) => $('solve-examples').append(exampleButton(example)));
EXAMPLE_GROUPS.forEach((group) => {
  const disclosure = node('details', 'example-group');
  const summary = node('summary');
  summary.append(document.createTextNode(`${group.label} `), node('span', 'example-count', `${group.examples.length} examples`));
  const grid = node('div', 'example-grid');
  group.examples.forEach((example) => grid.append(exampleButton(example)));
  disclosure.append(summary, grid);
  $('more-solve-examples').append(disclosure);
});

document.querySelectorAll('[data-check-example]').forEach((button) => {
  button.addEventListener('click', () => {
    const example = CHECK_EXAMPLES[button.dataset.checkExample];
    setMathFieldValue(checkField, example.problem);
    replaceWorkSteps(example.steps); markDirty('check');
    announce('Example work loaded. Run Check my work for feedback.');
  });
});

$('clear-work').addEventListener('click', () => {
  setMathFieldValue(checkField, ''); replaceWorkSteps(['']); markDirty('check'); $('check-problem').focus();
});
$('add-step').addEventListener('click', () => { addWorkStep('', true); markDirty('check'); });
$('solve-form').addEventListener('submit', handleSolve);
$('check-form').addEventListener('submit', handleCheck);
$('generate-form').addEventListener('submit', handleGenerate);
$('use-structured').addEventListener('change', () => {
  const structured = $('use-structured').checked;
  if (structured) { $('use-word-problem').checked = false; $('word-mode').open = false; }
  syncSolveInputMode();
  markDirty('solve');
  syncSolveInputMode(true);
});
$('use-word-problem').addEventListener('change', () => {
  if ($('use-word-problem').checked) { $('use-structured').checked = false; $('structured-mode').open = false; }
  syncSolveInputMode();
  markDirty('solve');
  syncSolveInputMode(true);
});
toolViews.forEach((view) => {
  forms[view].addEventListener('input', () => { if (clearHistory?.view === view) clearHistory = null; markDirty(view); });
});
function syncDifficultyControl() {
  const control = $('generate-difficulty');
  const value = Number(control.value).toFixed(3);
  $('difficulty-value').value = value;
  control.setAttribute('aria-valuetext', `${value} out of 1.000`);
  control.style.setProperty('--difficulty-progress', `${Number(value) * 100}%`);
}
$('generate-difficulty').addEventListener('input', syncDifficultyControl);
syncDifficultyControl();
$('random-seed').addEventListener('click', () => { $('generate-seed').value = String(randomSeed()); markDirty('generate'); });
$('retry-engine').addEventListener('click', () => connectEngine().then(() => announce('Local engine connected.')).catch((error) => announce(errorMessage(error))));
$('cancel-run').addEventListener('click', () => cancelRun());
function openCoverage() {
  const dialog = $('coverage');
  closeKeypad();
  if (!dialog.open) dialog.showModal();
  $('coverage-close').focus();
}

function closeCoverage() {
  if ($('coverage').open) $('coverage').close();
}

$('coverage-link').addEventListener('click', openCoverage);
$('coverage-fab').addEventListener('click', openCoverage);
$('coverage-close').addEventListener('click', closeCoverage);
$('coverage').addEventListener('click', (event) => { if (event.target === $('coverage')) closeCoverage(); });
$('copy-result').addEventListener('click', async () => {
  const result = results.get(currentView);
  if (!result?.copy) return;
  try {
    await navigator.clipboard.writeText(result.copy);
    $('copy-result').textContent = 'Copied ✓';
    announce('Result copied to clipboard.');
    setTimeout(() => { $('copy-result').textContent = 'Copy result ⧉'; }, 1800);
  } catch { announce('Clipboard access is unavailable. Select the result text to copy it.'); }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!running && forms[currentView]) forms[currentView].requestSubmit();
  }
  if (event.key === 'Escape' && running) cancelRun();
});

if (!/Mac|iPhone|iPad/.test(navigator.platform || '')) $('shortcut-modifier').textContent = 'Ctrl';
replaceWorkSteps(CHECK_EXAMPLES.mistake.steps);
const initialView = location.hash.slice(1);
showView(views.includes(initialView) ? initialView : 'graph');
if (initialView === 'coverage') openCoverage();
connectEngine().catch(() => { /* The persistent connection notice explains recovery. */ });
