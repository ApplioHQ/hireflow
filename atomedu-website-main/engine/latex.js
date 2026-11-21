/**
 * Owned LaTeX/input bridge. KaTeX checks notation; the engine's own grammar and
 * exact arithmetic determine meaning. No renderer or editor evaluates math.
 */
import katex from '../vendor/katex/katex.mjs';
import { MathError, Q, Rational, parseExpression, parseStatement, constantValue, substitute, variables } from './core.js';
import { parseGeometry } from './geometry.js';

const LIMIT = 16384;
const RENDER_OPTIONS = Object.freeze({ trust: false, throwOnError: true, maxExpand: 1000, maxSize: 30, strict: 'error' });
const FUNCTIONS = new Set(['sqrt', 'root', 'cbrt', 'factorial', 'abs', 'log', 'ln', 'exp', 'sin', 'cos', 'tan']);
const RELATIONS = { le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', lt: '<', gt: '>', eq: '=' };
const SPACING = new Set([',', '!', ';', ':', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace', 'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle', 'limits', 'nolimits']);
const GREEK = new Set('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'.split(' '));
const SAFE_COMMANDS = new Set([
  ...GREEK, ...FUNCTIONS, ...Object.keys(RELATIONS), ...SPACING,
  'frac', 'dfrac', 'tfrac', 'left', 'right', 'middle', 'lvert', 'rvert', 'vert', 'lVert', 'rVert', 'Vert',
  'lbrace', 'rbrace', 'lbrack', 'rbrack', 'langle', 'rangle', 'cdot', 'times', 'div', 'pm', 'mp',
  'infty', 'in', 'notin', 'cup', 'cap', 'setminus', 'emptyset', 'varnothing', 'mathbb',
  'text', 'textrm', 'textnormal', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'operatorname',
  'begin', 'end', 'placeholder', 'square', 'Box', 'int', 'iint', 'iiint', 'oint', 'sum', 'prod', 'lim', 'partial', 'nabla',
  'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'cot', 'sec', 'csc',
  'min', 'max', 'det', 'gcd', 'Pr', 'binom', 'dbinom', 'tbinom', 'overline', 'underline', 'overrightarrow',
  'angle', 'triangle', 'cong', 'sim', 'parallel', 'perp', 'approx', 'equiv', 'propto', 'circ',
  'Rightarrow', 'rightarrow', 'to', 'implies', 'iff', 'Leftrightarrow', 'mapsto', 'lor', 'vee', 'land', 'wedge',
  'forall', 'exists', 'neg', 'subset', 'subseteq', 'supset', 'supseteq', 'colon', 'ldots', 'cdots', 'dots',
  'textbackslash', 'textasciicircum', 'textasciitilde', '{', '}', '[', ']', '|', '\\', '%', '$', '#', '&', '_', '^', '~',
]);
const UNSAFE_COMMAND = /^(?:def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|newenvironment|renewenvironment|global|catcode|csname|endcsname|expandafter|noexpand|input|include|includegraphics|require|usepackage|documentclass|href|url|html.*|class|style|cssId|unicode|char|verb|write|openout|read|special|rule|kern|raisebox)$/i;
const DISPLAY_ONLY = /\\(?:begin\{(?:aligned|align\*?|gathered|array)|text(?:rm|normal|bf|it)?\b|mathbb\b|overline\b|angle\b|triangle\b|cong\b|parallel\b|perp\b|approx\b|Rightarrow\b|implies\b)/;
const CALCULUS = /\\(?:int|iint|iiint|oint|sum|prod|lim|partial|nabla)(?![A-Za-z])/;

function fail(message, { incomplete = false, unsupported = false, position } = {}) {
  const error = new MathError(message, unsupported ? 'unsupported' : 'invalid');
  if (incomplete) { error.incomplete = true; error.complete = false; }
  if (position !== undefined) error.position = position;
  throw error;
}
const problem = error => ({ message: error.message || String(error), code: error.incomplete ? 'incomplete' : error.code || 'syntax', ...(error.position === undefined ? {} : { position: error.position }) });

function unwrap(source) {
  let s = source.trim();
  if ((s.startsWith('$$') && s.endsWith('$$')) || (s.startsWith('\\(') && s.endsWith('\\)')) || (s.startsWith('\\[') && s.endsWith('\\]'))) s = s.slice(2, -2).trim();
  else if (s.startsWith('$') && s.endsWith('$')) s = s.slice(1, -1).trim();
  return s;
}
function checkSource(source) {
  if (typeof source !== 'string') fail('LaTeX source must be a string.');
  if (source.length > LIMIT) fail('LaTeX exceeds the notation size limit.');
  if (!source.trim()) fail('Enter a complete mathematical expression.', { incomplete: true });
}
function commandSafety(source) {
  const unknown = [];
  for (const match of source.matchAll(/\\([A-Za-z]+|[^\r\n])/g)) {
    if (UNSAFE_COMMAND.test(match[1]) || !SAFE_COMMANDS.has(match[1])) unknown.push(`\\${match[1]}`);
  }
  return [...new Set(unknown)];
}

/** Token positions refer to the original, unexpanded source. */
function lex(source) {
  const tokens = []; let i = 0;
  while (i < source.length) {
    const start = i, ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '\\') {
      i++;
      const command = /^[A-Za-z]+/.exec(source.slice(i));
      if (command) { i += command[0].length; tokens.push({ type: 'command', value: command[0], position: start }); }
      else { if (i === source.length) fail('A command is unfinished.', { incomplete: true, position: start }); tokens.push({ type: 'command', value: source[i++], position: start }); }
    } else {
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      const word = /^[A-Za-z][A-Za-z0-9]*/.exec(source.slice(i));
      if (number) { i += number[0].length; tokens.push({ type: 'number', value: number[0], position: start }); }
      else if (word) { i += word[0].length; tokens.push({ type: 'word', value: word[0], position: start }); }
      else { i++; tokens.push({ type: ch, value: ch, position: start }); }
    }
    if (tokens.length > 4096) fail('LaTeX contains too many tokens.');
  }
  return tokens;
}

class Reader {
  constructor(source) { this.tokens = lex(source); this.i = 0; this.depth = 0; this.unsupported = new Set(); }
  peek(value) { const t = this.tokens[this.i]; return value === undefined ? t : t?.value === value; }
  take() { return this.tokens[this.i++]; }
  skipSpace() { while (this.peek()?.type === 'command' && SPACING.has(this.peek().value)) this.take(); }
  rawGroup() {
    this.skipSpace();
    if (!this.peek('{')) fail('A braced command argument is missing.', { incomplete: true, position: this.peek()?.position });
    this.take(); let depth = 1, value = '';
    while (this.peek()) {
      const t = this.take();
      if (t.type === '{') depth++;
      if (t.type === '}' && --depth === 0) return value;
      value += t.type === 'command' ? `\\${t.value}` : t.value;
    }
    fail('A closing brace is missing.', { incomplete: true });
  }
  group(close, open = '(', allowEmpty = false) {
    if (++this.depth > 64) fail('LaTeX nesting limit reached.');
    const endings = close === ')' || close === ']' ? [')', ']'] : [close];
    const value = this.sequence(endings);
    if (!endings.includes(this.peek()?.value)) fail(`A closing ${close} delimiter is missing.`, { incomplete: true });
    const ending = this.take().value; this.depth--;
    if (!value.trim() && !allowEmpty) fail('A required argument is empty.', { incomplete: true });
    if (ending !== close && !this.membership && splitTop(value).length !== 2) fail('Mismatched grouping delimiters.');
    return `${open}${value}${close === '}' || close === '|' ? ')' : ending}`;
  }
  argument() {
    this.skipSpace();
    const t = this.peek();
    if (!t || ['}', ')', ']', '&', '=', '+', '-', '*', '/', '^', '_'].includes(t.value)) fail('A required argument is missing.', { incomplete: true, position: t?.position });
    if (t.type === '{') { this.take(); return this.group('}').slice(1, -1); }
    // TeX's unbraced arguments consume one character, including in \frac12.
    if (['number', 'word'].includes(t.type) && t.value.length > 1) {
      this.tokens.splice(this.i, 1, { ...t, value: t.value[0] }, { ...t, value: t.value.slice(1), position: t.position + 1 });
    }
    return this.atom();
  }
  functionArgument() {
    this.skipSpace();
    if (this.peek()?.type === 'command' && this.peek('left')) this.take();
    const t = this.peek();
    if (t?.type === '(' || t?.type === '{' || t?.type === '[') { this.take(); return this.group({ '(': ')', '{': '}', '[': ']' }[t.type]).slice(1, -1); }
    // A common unbraced trig argument is a numeric coefficient followed by
    // one variable: \sin3x means sin(3x), while \sin(3)x remains sin(3)*x.
    // An explicit \cdot or \times prevents this grouping.
    let coefficient = '';
    if (t?.type === 'number' && this.tokens[this.i + 1]?.type === 'word'
      && /^[A-Za-z]$/.test(this.tokens[this.i + 1].value)) {
      coefficient = this.take().value;
    }
    let value = this.argument();
    if (this.peek('^')) { this.take(); value = `(${value})^(${this.argument()})`; }
    return coefficient + value;
  }
  atom() {
    const t = this.take(); if (!t) fail('An operand is missing.', { incomplete: true });
    if (t.type === '{') return this.group('}');
    if (t.type === '(') return this.group(')');
    if (t.type === '[') return this.group(']', '[', true);
    if (t.value === '|') return `abs(${this.group('|').slice(1, -1)})`;
    if (t.type !== 'command') {
      if (['}', ')', ']'].includes(t.value)) fail(`Unexpected closing delimiter ${t.value}.`, { position: t.position });
      return ({ '−': '-', '–': '-', '×': '*', '·': '*', '⋅': '*', '÷': '/', 'π': 'pi', '≤': '<=', '≥': '>=', '≠': '!=', '²': '^2', '³': '^3' })[t.value] || t.value;
    }
    const name = t.value;
    if (SPACING.has(name) || name === 'left' || name === 'right') return '';
    if (['frac', 'dfrac', 'tfrac'].includes(name)) return `((${this.argument()})/(${this.argument()}))`;
    if (name === 'sqrt') {
      this.skipSpace(); let degree = '2';
      if (this.peek('[')) { this.take(); degree = this.group(']').slice(1, -1); }
      const base = this.argument(); return degree === '2' ? `sqrt(${base})` : `root(${base},${degree})`;
    }
    if (FUNCTIONS.has(name)) {
      let base = null, power = null;
      for (let count = 0; count < 2; count++) {
        this.skipSpace();
        if (this.peek('_') && name === 'log' && base === null) { this.take(); base = this.argument(); }
        else if (this.peek('^') && power === null) { this.take(); power = this.argument(); }
        else break;
      }
      if (['sin', 'cos', 'tan'].includes(name) && power === '-1') fail('Inverse trigonometric notation needs an inverse-function solver.', { unsupported: true });
      const argument = this.functionArgument();
      const value = `${name}(${argument}${base === null ? '' : `,${base}`})`;
      return power === null ? value : `((${value})^(${power}))`;
    }
    if (name === 'operatorname' || name === 'mathrm') {
      const label = this.rawGroup();
      if (FUNCTIONS.has(label)) {
        this.tokens.splice(this.i, 0, { type: 'command', value: label, position: t.position }); return this.atom();
      }
      if (name === 'operatorname' && !['f', 'g', 'h'].includes(label)) fail(`The named operator ${label} is not supported for solving.`, { unsupported: true });
      // The core treats adjacent ordinary letters as products. Do not quietly
      // turn a styled name such as theta into t*h*e*t*a.
      if (/^[A-Za-z]$/.test(label) || label === 'pi' || /^[A-Za-z][A-Za-z0-9_]*[_0-9][A-Za-z0-9_]*$/.test(label)) return label;
      fail(`The ${name} argument is not a supported mathematical name.`, { unsupported: true });
    }
    if (name === 'mathbb') {
      const label = this.rawGroup();
      if (/^[RCZNQ]$/.test(label)) return label;
      fail('This number-set symbol is not supported.', { unsupported: true });
    }
    if (name === 'text' || name.startsWith('text')) {
      const label = this.rawGroup(); if (/^(or|and)$/i.test(label)) return ` ${label.toLowerCase()} `;
      fail('Text annotations are notation, not a solvable expression.', { unsupported: true });
    }
    if (name === 'placeholder') fail('Complete every placeholder before solving.', { incomplete: true, position: t.position });
    if (name in RELATIONS) return RELATIONS[name];
    const simple = { pi: 'pi', infty: '∞', cdot: '*', times: '*', div: '/', '%': '%', pm: '±', mp: '∓', in: '∈', notin: '∉', cup: '∪', cap: '∩', setminus: '∖', emptyset: '{}', varnothing: '{}', '{': '{', '}': '}', lbrace: '{', rbrace: '}', lbrack: '[', rbrack: ']', lor: ' or ', vee: ' or ', land: ' and ', wedge: ' and ' };
    if (name === 'in') this.membership = true;
    if (Object.hasOwn(simple, name)) return simple[name];
    if (['vert', 'lvert', 'rvert', '|'].includes(name)) {
      // Turn paired command delimiters into the same token consumed by group().
      if (name === 'rvert') return '|';
      for (let j = this.i; j < this.tokens.length; j++) if (this.tokens[j].type === 'command' && ['vert', 'rvert', '|'].includes(this.tokens[j].value)) { this.tokens[j] = { ...this.tokens[j], type: '|', value: '|' }; break; }
      return `abs(${this.group('|').slice(1, -1)})`;
    }
    fail(`The command \\${name} is valid notation but is not supported for solving.`, { unsupported: true, position: t.position });
  }
  sequence(close) {
    let out = '', atomStart = null;
    const endings = close === undefined ? [] : Array.isArray(close) ? close : [close];
    while (this.peek() && !endings.includes(this.peek().value)) {
      if (this.peek()?.type === 'command' && this.peek('right')) { this.take(); if (endings.includes(this.peek()?.value)) break; }
      if (this.peek('^')) {
        this.take();
        if (atomStart === null) fail('A power requires a base.', { incomplete: true });
        const exponent = this.argument(), base = out.slice(atomStart);
        // A TeX superscript is complete when its argument ends. A following
        // postfix belongs to this power, rather than to the exponent's atom.
        out = `${out.slice(0, atomStart)}(${base}^(${exponent}))`;
      }
      else if (this.peek('_')) {
        this.take(); const subscript = this.argument();
        if (!/^[A-Za-z0-9]+$/.test(subscript)) fail('Only simple variable subscripts are supported.', { unsupported: true });
        out = out.trimEnd() + `_${subscript}`;
      } else {
        const token = this.peek(), value = this.atom();
        if (!value) continue;
        const functionStart = token.type === '(' && atomStart !== null && FUNCTIONS.has(out.slice(atomStart).trim()) ? atomStart : null;
        // Whitespace prevents a command constant from merging with its neighbor.
        const spacing = /[A-Za-z0-9_]$/.test(out) && /^[A-Za-z0-9_]/.test(value) ? ' ' : '';
        const start = out.length + spacing.length;
        out += spacing + value;
        if (value === '!' || value === '%') continue;
        if (/^(?:[+\-*/=<>^,;&:±∓∈∉∪∩∖{}]|<=|>=|!=| or | and )$/.test(value)) atomStart = null;
        else if (functionStart !== null) atomStart = functionStart;
        else {
          atomStart = start;
          // In TeX, adjacent ordinary letters are separate atoms. The core
          // likewise expands these words into products, so script only the last.
          if (token.type === 'word' && /^[A-Za-z]{2,}$/.test(value) && !FUNCTIONS.has(value.toLowerCase()) && value.toLowerCase() !== 'pi') atomStart += value.length - 1;
        }
      }
    }
    return out;
  }
  read() { return this.sequence(undefined).trim(); }
}

function splitTop(source, delimiter = ',') {
  const result = []; let start = 0, depth = 0, environment = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\') {
      const env = /^\\(begin|end)\{[^}]+\}/.exec(source.slice(i));
      if (env) { environment += env[1] === 'begin' ? 1 : -1; i += env[0].length - 1; continue; }
      if (!depth && !environment && source.startsWith(delimiter, i)) { result.push(source.slice(start, i).trim()); i += delimiter.length - 1; start = i + 1; continue; }
      i++; continue;
    }
    if ('{(['.includes(source[i])) depth++;
    else if ('})]'.includes(source[i])) depth--;
    if (!depth && !environment && source.startsWith(delimiter, i)) { result.push(source.slice(start, i).trim()); i += delimiter.length - 1; start = i + 1; }
  }
  result.push(source.slice(start).trim()); return result;
}

function internalSyntax(source) {
  let s = source.trim();
  if (!s) fail('A required expression is empty.', { incomplete: true });
  if (s === '[]') return;
  if (/^[+-]?∞$/.test(s)) return;
  if (/[+\-*/^=<>]\s*$/.test(s)) fail('The expression is unfinished.', { incomplete: true });
  if (/\s+(?:or|and)\s+/.test(s)) { for (const branch of s.split(/\s+(?:or|and)\s+/)) internalSyntax(branch); return; }
  if (s.includes('±') || s.includes('∓')) {
    internalSyntax(s.replace(/±/g, '+').replace(/∓/g, '-'));
    internalSyntax(s.replace(/±/g, '-').replace(/∓/g, '+')); return;
  }
  const member = /^(.*?)\s*(?:∈|\bin\b)\s*(.+)$/.exec(s);
  if (member) { parseExpression(member[1]); internalSet(member[2]); return; }
  if (/^\{.*\}$/.test(s)) { for (const entry of splitTop(s.slice(1, -1)).filter(Boolean)) parseExpression(entry); return; }
  if (s.includes(';') || s.includes('\n')) { for (const statement of s.split(/[;\n]+/).filter(x => x.trim())) internalSyntax(statement); return; }
  if (/^[([]/.test(s) && /[)\]]$/.test(s) && splitTop(s.slice(1, -1)).length > 1) {
    for (const entry of splitTop(s.slice(1, -1))) internalSyntax(entry);
    return;
  }
  const relations = [...s.matchAll(/<=|>=|!=|=|<|>/g)];
  if (relations.length > 1 && relations.every(match => match[0] !== '=')) {
    const parts = s.split(/(<=|>=|!=|<|>)/);
    for (let i = 0; i + 2 < parts.length; i += 2) parseStatement(`${parts[i]} ${parts[i + 1]} ${parts[i + 2]}`);
    return;
  }
  s = s.replace(/\[/g, '(').replace(/\]/g, ')');
  parseStatement(s);
}
function internalSet(source) {
  const s = source.trim();
  if (/^\{.*\}$/.test(s)) { for (const entry of splitTop(s.slice(1, -1)).filter(Boolean)) parseExpression(entry); return; }
  if (/^(?:R|C|Z|N|Q|ℝ|ℂ|ℤ|ℕ|ℚ|\{\})$/.test(s)) return;
  for (const interval of s.split(/∪|\\cup/)) {
    const part = interval.trim();
    if (!/^[([]/.test(part) || !/[)\]]$/.test(part)) fail('A finite set or interval is required after membership.');
    const endpoints = splitTop(part.slice(1, -1));
    if (endpoints.length !== 2 || endpoints.some(x => !x)) fail('An interval requires two endpoints.');
    for (const endpoint of endpoints) if (!/^[+-]?(?:∞|infinity|inf)$/.test(endpoint)) parseExpression(endpoint);
  }
}

function conditionSource(source) {
  return source.trim().replace(/^\\text\{\s*(?:if|for)\s*\}\s*/, '');
}
function isOtherwise(source) { return /^(?:(?:otherwise|else)|\\text\{\s*(?:otherwise|else)\s*\})$/i.test(source.trim()); }
function looksLikeCondition(source) {
  const s = conditionSource(source);
  return isOtherwise(s) || /[=<>≤≥≠∈]|\\(?:leq?|geq?|neq?|lt|gt|in)(?![A-Za-z])/.test(s);
}
function piecewiseCondition(source) {
  const s = conditionSource(source);
  if (isOtherwise(s)) return 'otherwise';
  const condition = convertMath(s);
  if (!looksLikeCondition(condition)) fail('Each piecewise row requires a comparison or an otherwise condition.', { unsupported: true });
  return condition;
}
function piecewiseVariable(pieces) {
  const names = new Set();
  for (const { condition } of pieces) {
    if (condition === 'otherwise') continue;
    for (const clause of condition.split(/\s+(?:and|or)\s+/)) {
      const membership = /^(.*?)∈/.exec(clause);
      const operands = membership ? [membership[1]] : clause.split(/<=|>=|!=|=|<|>/);
      for (const operand of operands) for (const name of variables(parseExpression(operand))) names.add(name);
    }
  }
  if (!names.size) for (const piece of pieces) for (const name of variables(parseExpression(piece.expression))) names.add(name);
  if (names.size > 1) fail('Piecewise conditions must identify one independent variable.', { unsupported: true });
  return [...names][0] || 'x';
}

function convertEnvironment(source) {
  let s = source.trim(), left = '';
  const opening = /^\\left\s*(\\[A-Za-z]+|\\[{}|]|[()[\]{}.|])\s*/.exec(s);
  const closing = /\s*\\right\s*(\\[A-Za-z]+|\\[{}|]|[()[\]{}.|])$/.exec(s);
  if (opening && closing) { left = opening[1]; s = s.slice(opening[0].length, closing.index).trim(); }
  else {
    for (const [start, end] of [['\\lbrack', '\\rbrack'], ['\\lbrace', '\\rbrace'], ['\\langle', '\\rangle'], ['\\{', '\\}'], ['[', ']'], ['(', ')']]) {
      if (s.startsWith(start) && s.endsWith(end)) { left = start; s = s.slice(start.length, -end.length).trim(); break; }
    }
  }
  const match = /^\\begin\{(cases|matrix|bmatrix|pmatrix|array)\}([\s\S]*)\\end\{\1\}$/.exec(s);
  if (!match) return null;
  let body = match[2];
  if (match[1] === 'array') {
    const alignment = /^\s*\{([lcr|\s]+)\}/.exec(body);
    if (!alignment) fail('Only arrays with simple left, center, or right column alignment can be converted.', { unsupported: true });
    body = body.slice(alignment[0].length);
  }
  const rows = splitTop(body, '\\\\').filter(Boolean);
  if (!rows.length) fail('The environment is empty.', { incomplete: true });
  const columns = rows.map(row => splitTop(row, '&'));
  const equationArray = match[1] === 'array' && (['\\{', '\\lbrace'].includes(left) || rows.every(row => row.includes('=')));
  const conditionalArray = match[1] === 'array' && columns.every(row => row.length === 2 && looksLikeCondition(row[1]));
  if (match[1] === 'cases' || equationArray || conditionalArray) {
    if (columns.every(row => row.length === 2)) {
      if (columns.some(row => row.some(column => !column.trim()))) fail('A cases expression or condition is empty.', { incomplete: true });
      // An aligned equation such as x+y & =3 is still a system row.
      const aligned = columns.every(row => /^(?:[=<>≤≥≠]|\\(?:leq?|geq?|neq?|lt|gt)(?![A-Za-z]))/.test(row[1].trim()));
      if (!aligned && columns.every(row => looksLikeCondition(row[1]))) {
        const pieces = columns.map(([expression, condition]) => {
          const converted = convertMath(expression);
          if (parseStatement(converted).kind !== 'expression') fail('Conditional equation branches are display notation, not a piecewise function definition.', { unsupported: true });
          return { expression: converted, condition: piecewiseCondition(condition) };
        });
        return { kind: 'piecewise', variable: piecewiseVariable(pieces), pieces };
      }
    }
    const equations = rows.map(row => {
      const equation = convertMath(splitTop(row, '&').join(''));
      if (parseStatement(equation).kind !== 'equation') fail('Cases must contain equations or two-column expression and condition rows.', { unsupported: true });
      return equation;
    });
    return { kind: 'system', equations };
  }
  const matrix = rows.map(row => splitTop(row, '&').map(entry => {
    if (!entry) fail('A matrix entry is empty.', { incomplete: true });
    return String(constantValue(parseExpression(convertMath(entry))));
  }));
  if (matrix.some(row => row.length !== matrix[0].length)) fail('Matrix rows must have equal lengths.');
  return { kind: 'matrix', operation: 'rref', matrix };
}

function convertBinomial(source) {
  if (!/^\\(?:binom|dbinom|tbinom)(?![A-Za-z])/.test(source)) return null;
  const reader = new Reader(source); reader.take();
  const n = reader.argument(), r = reader.argument(); reader.skipSpace();
  if (reader.peek() || !/^[+-]?\d+$/.test(n) || !/^[+-]?\d+$/.test(r)) fail('Only an entire binomial coefficient with integer literal arguments can be converted.', { unsupported: true });
  if (!Number.isSafeInteger(Number(n)) || !Number.isSafeInteger(Number(r))) fail('Binomial arguments exceed the exact integer input bound.', { unsupported: true });
  return { kind: 'combinatorics', operation: 'combinations', n: Number(n), r: Number(r) };
}

function convertAggregate(source) {
  const command = /^\\(sum|prod)(?![A-Za-z])/.exec(source);
  if (!command) return null;
  const reader = new Reader(source); reader.take(); let lower, upper;
  for (let count = 0; count < 2; count++) {
    reader.skipSpace();
    if (reader.peek('_')) { reader.take(); lower = reader.argument(); }
    else if (reader.peek('^')) { reader.take(); upper = reader.argument(); }
  }
  const index = /^\s*([A-Za-z])\s*=\s*([+-]?\d+)\s*$/.exec(lower || '');
  if (!index || !/^[+-]?\d+$/.test(upper || '')) fail('Only finite sums and products with integer literal bounds can be converted.', { unsupported: true });
  if (['e', 'i'].includes(index[1])) fail('This aggregate index is reserved as a core constant; use another single variable.', { unsupported: true });
  const start = Number(index[2]), end = Number(upper), n = Math.max(0, end - start + 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Math.abs(start) > 1000000 || Math.abs(end) > 1000000 || n > 1000) fail('Finite aggregates support at most 1000 terms and bounded integer indices.', { unsupported: true });
  const body = reader.read(); internalSyntax(body);
  const ast = parseExpression(body);
  if (variables(ast).some(name => name !== index[1])) fail('A finite aggregate requires numeric constants for every non-index parameter.', { unsupported: true });
  const aggregate = { kind: 'finite_aggregate', operation: command[1] === 'sum' ? 'sum' : 'product', index: index[1], lower: start, upper: end, expression: body };
  if (aggregate.operation === 'product') return aggregate;
  try {
    const term = k => constantValue(substitute(ast, index[1], { type: 'num', value: String(k) }));
    const first = n ? term(start) : Q(0), second = n > 1 ? term(start + 1) : first, difference = second.sub(first);
    let arithmetic = true, geometric = !first.zero, ratio = geometric ? second.div(first) : Q(0), expectedArithmetic = first, expectedGeometric = first;
    for (let i = 0; i < n; i++) {
      const value = term(start + i);
      arithmetic &&= value.eq(expectedArithmetic); geometric &&= value.eq(expectedGeometric);
      if (!arithmetic && !geometric) return aggregate;
      if (arithmetic) expectedArithmetic = expectedArithmetic.add(difference);
      if (geometric) expectedGeometric = expectedGeometric.mul(ratio);
    }
    if (arithmetic) return { kind: 'sequence', type: 'arithmetic', first: String(first), difference: String(difference), n, task: 'sum' };
    if (geometric) return { kind: 'sequence', type: 'geometric', first: String(first), ratio: String(ratio), n, task: 'sum' };
  } catch { /* The aggregate kernel handles undefined, nonrational, or budget-limited terms. */ }
  return aggregate;
}

function convertMath(source) {
  const converted = new Reader(source).read();
  internalSyntax(converted);
  const displaySequence = converted === '[]' || /^[([]/.test(converted) && /[)\]]$/.test(converted) && splitTop(converted.slice(1, -1)).length > 1;
  if (displaySequence || /^\{.*\}$/.test(converted)) fail('Lists, tuples, and standalone sets are display notation, not scalar solver inputs.', { unsupported: true });
  if (converted.includes('±') || converted.includes('∓')) return `${converted.replace(/±/g, '+').replace(/∓/g, '-')} or ${converted.replace(/±/g, '-').replace(/∓/g, '+')}`;
  return converted.includes('∈') ? converted : converted.replace(/\[/g, '(').replace(/\]/g, ')');
}
function incompleteNotation(source) {
  if (/\\placeholder\b/.test(source)) return 'Complete every placeholder before solving.';
  const tokens = lex(source);
  const endArgument = index => {
    while (tokens[index]?.type === 'command' && SPACING.has(tokens[index].value)) index++;
    if (!tokens[index]) return { end: index, empty: true };
    if (['}', ')', ']'].includes(tokens[index].value) || tokens[index].type === 'command' && ['right', '}', 'end'].includes(tokens[index].value)) return { end: index, empty: true };
    if (tokens[index].value !== '{' && tokens[index].value !== '[') return { end: index + 1, empty: false };
    const close = tokens[index].value === '{' ? '}' : ']'; let depth = 1, j = index + 1;
    for (; j < tokens.length; j++) { if (tokens[j].value === tokens[index].value) depth++; if (tokens[j].value === close && --depth === 0) break; }
    return { end: j + 1, empty: j === index + 1 || j === tokens.length };
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'command' || !['frac', 'dfrac', 'tfrac', 'sqrt', 'binom', 'dbinom', 'tbinom'].includes(t.value)) continue;
    let next = i + 1;
    if (t.value !== 'sqrt' && ['number', 'word'].includes(tokens[next]?.type) && tokens[next].value.length >= 2) continue;
    if (t.value === 'sqrt' && tokens[next]?.value === '[') { const degree = endArgument(next); if (degree.empty) return 'The root degree is empty or unfinished.'; next = degree.end; }
    for (let count = 0; count < (t.value === 'sqrt' ? 1 : 2); count++) { const argument = endArgument(next); if (argument.empty) return 'A required argument is empty or unfinished.'; next = argument.end; }
  }
  return null;
}

// Check mathematical arguments even inside an otherwise display-only formula.
// KaTeX intentionally accepts an unfinished numerator such as x+ as notation.
function argumentSyntax(source) {
  const tokens = lex(source);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'command' || !['frac', 'dfrac', 'tfrac', 'sqrt', 'binom', 'dbinom', 'tbinom'].includes(t.value)) continue;
    const reader = new Reader(''); reader.tokens = tokens.map(token => ({ ...token })); reader.i = i + 1;
    try {
      if (t.value === 'sqrt' && reader.peek('[')) { reader.take(); internalSyntax(reader.group(']').slice(1, -1)); }
      for (let count = 0; count < (t.value === 'sqrt' ? 1 : 2); count++) internalSyntax(reader.argument());
    } catch (error) { if (error.code !== 'unsupported') throw error; }
  }
}

/** Convert editor notation, retaining plain command/JSON input for the facade. */
export function latexToInput(source, options = { allowPlain: true }) {
  checkSource(source);
  const s = unwrap(source), allowPlain = options?.allowPlain !== false;
  if (allowPlain && !s.includes('\\') && (!/[{}]/.test(s) || /(?:∈|\bin\b)\s*\{/.test(s))) return source;
  if (allowPlain && /^\s*\{\s*"/.test(s)) return source;
  const unknown = commandSafety(s);
  if (unknown.length) fail(`Unsupported or unsafe LaTeX command: ${unknown.join(', ')}.`, { unsupported: !unknown.some(command => UNSAFE_COMMAND.test(command.slice(1))) });
  const incomplete = incompleteNotation(s); if (incomplete) fail(incomplete, { incomplete: true });
  try { katex.renderToString(s, RENDER_OPTIONS); }
  catch (error) {
    if (/Undefined control sequence|No such environment|Unknown environment/.test(error.message || '')) fail(error.message, { unsupported: true, position: error.position });
    throw error;
  }
  argumentSyntax(s);
  const environment = convertEnvironment(s); if (environment) return environment;
  const binomial = convertBinomial(s); if (binomial) return binomial;
  const aggregate = convertAggregate(s); if (aggregate) return aggregate;
  if (CALCULUS.test(s)) fail('Calculus notation is supported for display; this operation has no supported solver.', { unsupported: true });
  return convertMath(s);
}

/** Syntax validity is separate from mathematical verification and solvability. */
export function validateLatex(source, options = {}) {
  let latex = typeof source === 'string' ? unwrap(source) : '', complete = true;
  const errors = []; let unsupportedCommands = [];
  try {
    checkSource(source);
    if (/^\s*\{\s*"/.test(latex) && options.allowPlain !== false) latex = toLatex(JSON.parse(latex));
    unsupportedCommands = commandSafety(latex);
    if (unsupportedCommands.length) fail(`Unsupported or unsafe LaTeX command: ${unsupportedCommands.join(', ')}.`);
    const incomplete = incompleteNotation(latex); if (incomplete) { complete = false; errors.push({ message: incomplete, code: 'incomplete' }); }
    const plain = !latex.includes('\\') && !/[{}]/.test(latex);
    const structured = /^\s*\{\s*"/.test(latex);
    if ((plain || structured) && options.allowPlain !== false) {
      if (!structured && !parseGeometry(latex)) internalSyntax(latex);
      if (structured) JSON.parse(latex);
      latex = toLatex(latex);
    }
    else if (plain) internalSyntax(latex);
    katex.renderToString(latex.replace(/\\placeholder(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, '\\square'), RENDER_OPTIONS);
    if (complete) argumentSyntax(latex);
    if (!plain && !structured && complete) {
      try { if (!convertEnvironment(latex) && !DISPLAY_ONLY.test(latex) && !CALCULUS.test(latex)) convertMath(latex); }
      catch (error) { if (error.code !== 'unsupported') throw error; }
    }
    if (CALCULUS.test(latex)) {
      unsupportedCommands = [...new Set([...latex.matchAll(/\\(?:int|iint|iiint|oint|sum|prod|lim|partial|nabla)(?![A-Za-z])/g)].map(m => m[0]))];
      if (/^\\(?:sum|prod)(?![A-Za-z])/.test(latex)) {
        try { if (convertAggregate(latex)) unsupportedCommands = unsupportedCommands.filter(command => command !== '\\sum' && command !== '\\prod'); }
        catch (error) { if (error.code !== 'unsupported') throw error; }
      }
    }
  } catch (error) {
    if (error.incomplete || /Unexpected end of input|Expected .*end of input|Missing.*(?:brace|argument)|Expected '\\\\right'/.test(error.message || '')) complete = false;
    errors.push(problem(error));
  }
  return { valid: errors.length === 0 && complete, complete, errors, latex, unsupportedCommands };
}

// Everything in a text box is escaped, including fallback source and object keys.
function escapeText(value) {
  return String(value).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e\u00a0-\u024f\u0370-\u03ff]/gu, ch => `U+${ch.codePointAt(0).toString(16).toUpperCase()}`).replace(/[\\{}%$&#_^~]/g, ch => ({ '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' })[ch] || `\\${ch}`);
}
const text = value => `\\text{${escapeText(value)}}`;
function symbol(value) {
  const s = String(value);
  if (s === 'pi' || s === 'π') return '\\pi';
  if (s === '∞' || s === 'infty' || s === 'Infinity') return '\\infty';
  if (GREEK.has(s)) return `\\${s}`;
  if (/^[A-Za-z]$/.test(s)) return s;
  const sub = /^([A-Za-z])_([A-Za-z0-9]+)$/.exec(s);
  if (sub) return `${sub[1]}_{${escapeText(sub[2])}}`;
  // t1 and t_1 are distinct core identifiers; styled names preserve that
  // distinction when a displayed value is sent back through an editor.
  return `\\mathrm{${escapeText(s)}}`;
}
function astLatex(ast, parent = 0) {
  if (!ast || typeof ast !== 'object') return text('Invalid expression');
  if (ast.type === 'num') {
    const q = Q(ast.value), negative = q.n < 0n, numerator = String(negative ? -q.n : q.n);
    const value = `${negative ? '-' : ''}${q.d === 1n ? numerator : `\\frac{${numerator}}{${q.d}}`}`;
    return negative && parent > 3 ? `\\left(${value}\\right)` : value;
  }
  if (ast.type === 'sym') return symbol(ast.name);
  if (ast.type === 'neg') { const value = `-${astLatex(ast.arg, 3)}`; return parent > 3 ? `\\left(${value}\\right)` : value; }
  if (ast.type === 'call') {
    const args = (ast.args || []).map(a => astLatex(a));
    if (ast.name === 'sqrt') return `\\sqrt{${args[0] || ''}}`;
    if (ast.name === 'cbrt') return `\\sqrt[3]{${args[0] || ''}}`;
    if (ast.name === 'root') return `\\sqrt[${args[1] || '2'}]{${args[0] || ''}}`;
    if (ast.name === 'factorial') {
      const arg = ast.args?.[0], needsGroup = arg?.type === 'call' && arg.name === 'factorial' || arg?.type === 'binary' && arg.op === '/' || arg?.type === 'num' && String(arg.value).includes('/');
      return `${needsGroup ? `\\left(${args[0]}\\right)` : astLatex(arg, 5)}!`;
    }
    if (ast.name === 'abs') return `\\left|${args[0] || ''}\\right|`;
    if (ast.name === 'exp') return `e^{${args[0] || ''}}`;
    const name = ['sin', 'cos', 'tan', 'ln', 'log'].includes(ast.name) ? `\\${ast.name}` : `\\operatorname{${escapeText(ast.name)}}`;
    return `${name}${ast.name === 'log' && args.length > 1 ? `_{${args[1]}}` : ''}\\left(${ast.name === 'log' ? args[0] : args.join(', ')}\\right)`;
  }
  if (ast.type === 'binary' && ['+', '-', '*', '/', '^'].includes(ast.op)) {
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[ast.op];
    if (ast.op === '/') return `\\frac{${astLatex(ast.left)}}{${astLatex(ast.right)}}`;
    if (ast.op === '^') { const value = `${astLatex(ast.left, 5)}^{${astLatex(ast.right)}}`; return parent > 4 ? `\\left(${value}\\right)` : value; }
    const value = `${astLatex(ast.left, precedence)}${ast.op === '*' ? ' \\cdot ' : ` ${ast.op} `}${astLatex(ast.right, precedence + (ast.op === '-' ? 1 : 0))}`;
    return precedence < parent ? `\\left(${value}\\right)` : value;
  }
  return text('Unsupported expression');
}

function intervalLatex(interval, render) {
  const low = interval.low ?? interval.start ?? interval.left, high = interval.high ?? interval.end ?? interval.right;
  if (String(low) === String(high) && interval.lowClosed && interval.highClosed) return `\\left\\{${render(low)}\\right\\}`;
  return `\\left${interval.lowClosed || interval.leftClosed ? '[' : '('}${render(low)}, ${render(high)}\\right${interval.highClosed || interval.rightClosed ? ']' : ')'}`;
}
function factLatex(fact, render) {
  const args = fact.args || [], points = p => (Array.isArray(p) ? p : [p]).map(symbol).join(''), segment = p => `\\overline{${points(p)}}`, angle = p => `\\angle ${points(p)}`;
  if (fact.predicate === 'segment_equal') return `${segment(args.slice(0, 2))} = ${segment(args.slice(2))}`;
  if (fact.predicate === 'angle_equal') return `${angle(args.slice(0, 3))} = ${angle(args.slice(3))}`;
  if (fact.predicate === 'triangle_congruent') return `\\triangle ${points(args[0])} \\cong \\triangle ${points(args[1])}`;
  if (fact.predicate === 'triangle') return `\\triangle ${points(args)}`;
  if (fact.predicate === 'right_angle') return `${angle(args)} = 90^{\\circ}`;
  if (fact.predicate === 'parallel' || fact.predicate === 'perpendicular') return `${segment(args.slice(0, 2))} ${fact.predicate === 'parallel' ? '\\parallel' : '\\perp'} ${segment(args.slice(2))}`;
  if (fact.predicate === 'midpoint') return `${symbol(args[0])}\\;${text('is the midpoint of')}\\;${segment(args.slice(1))}`;
  return `${text(String(fact.predicate).replace(/_/g, ' '))}\\left(${args.map(render).join(', ')}\\right)`;
}

function geometryAtomLatex(source, allowSegment = false) {
  const s = source.replace(/\s+/g, '');
  if (/^[△Δ][A-Z]{3}$/.test(s)) return `\\triangle ${s.slice(1)}`;
  if (/^∠[A-Z]{3}$/.test(s)) return `\\angle ${s.slice(1)}`;
  if (allowSegment && /^[A-Z]{2}$/.test(s)) return `\\overline{${s}}`;
  return null;
}
function geometryStatementLatex(source, geometryContext = false) {
  const atom = geometryAtomLatex(source); if (atom) return atom;
  const relation = /^(.+?)\s*(≅|∼|∥|⊥|=)\s*(.+)$/.exec(source);
  if (!relation) return null;
  if (relation[2] === '=' && !geometryContext && !/[△Δ∠]/.test(source)) return null;
  const left = geometryAtomLatex(relation[1], true), right = geometryAtomLatex(relation[3], true);
  if (!left || !right) return null;
  return `${left} ${{ '≅': '\\cong', '∼': '\\sim', '∥': '\\parallel', '⊥': '\\perp', '=': '=' }[relation[2]]} ${right}`;
}
function geometryStringLatex(source, render) {
  const parts = splitTop(source);
  if (parts.length < 2) return geometryStatementLatex(source);
  const statements = parts.map(part => geometryStatementLatex(part));
  if (!statements.some(Boolean)) return null;
  return parts.map((part, index) => statements[index] || geometryStatementLatex(part, true) || geometryAtomLatex(part, true) || render(part)).join(',\\quad ');
}

function asciiSetMembership(source) {
  const match = /^([A-Za-z][A-Za-z0-9_]*)\s+in\s+(.+)$/.exec(source);
  if (!match || match[1].length > 1 && !/[_0-9]/.test(match[1])) return null;
  try { internalSet(match[2]); } catch { return null; }
  return match;
}

// Precalculus inputs use rational multiples of pi and exact field scalars.
// Build notation only from fixed commands and parsed rationals; all other
// supplied values still pass through the ordinary escaped renderer.
function precalculusScalarLatex(value, render) {
  if (value && typeof value === 'object' && typeof value.expression === 'string') {
    try { return astLatex(parseExpression(value.expression)); }
    catch { return text(value.expression); }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const roots = { rational: '', sqrt2: '\\sqrt{2}', sqrt3: '\\sqrt{3}', sqrt6: '\\sqrt{6}' };
    const keys = Object.keys(value);
    if (keys.length && keys.every(key => Object.hasOwn(roots, key))) {
      try {
        const terms = [];
        for (const key of Object.keys(roots)) {
          if (!Object.hasOwn(value, key)) continue;
          const coefficient = Q(value[key]);
          if (coefficient.zero) continue;
          const magnitude = coefficient.n < 0n ? coefficient.neg() : coefficient;
          const body = key === 'rational' ? render(String(magnitude)) :
            `${magnitude.eq(Q(1)) ? '' : render(String(magnitude))} ${roots[key]}`.trim();
          terms.push({ negative: coefficient.n < 0n, body });
        }
        return terms.map((term, i) => `${term.negative ? i ? ' - ' : '-' : i ? ' + ' : ''}${term.body}`).join('') || '0';
      } catch { return text('Invalid scalar'); }
    }
  }
  try { return render(String(Q(value))); }
  catch { return text(value); }
}

function piMultipleLatex(value, render) {
  try {
    const q = Q(value), negative = q.n < 0n;
    const n = negative ? -q.n : q.n;
    if (n === 0n) return '0';
    const numerator = n === 1n ? '\\pi' : `${n}\\pi`;
    return `${negative ? '-' : ''}${q.d === 1n ? numerator : `\\frac{${numerator}}{${q.d}}`}`;
  } catch { return text(value); }
}

function precalculusInputLatex(input, render) {
  const scalar = value => precalculusScalarLatex(value, render);
  const angle = value => piMultipleLatex(value, render);
  const pair = values => Array.isArray(values) ? `\\left(${values.map(scalar).join(', ')}\\right)` : text('Invalid point');
  const vector = values => Array.isArray(values) ? `\\left\\langle ${values.map(scalar).join(', ')} \\right\\rangle` : text('Invalid vector');
  const polar = value => value && typeof value === 'object' ?
    `\\left(${scalar(value.radius)}, ${angle(value.angle)}\\right)` : text('Invalid polar pair');
  const operation = input.operation;
  if (input.topic === 'trigonometry') {
    if (operation === 'unit_circle') return `\\theta = ${angle(input.angle)}`;
    if (operation === 'double_angle') return `2\\theta,\\quad \\theta = ${angle(input.angle)}`;
    if (operation === 'angle_sum' || operation === 'angle_difference') return `\\theta = ${angle(input.angleA)} ${operation === 'angle_sum' ? '+' : '-'} ${angle(input.angleB)}`;
    if (operation === 'solve_equation') {
      const fn = ['sin', 'cos', 'tan'].includes(input.function) ? `\\${input.function}` : text(input.function);
      const bounds = input.interval;
      const interval = bounds && typeof bounds === 'object' ?
        `\\left${bounds.includeLower === false ? '(' : '['}${angle(bounds.lower)}, ${angle(bounds.upper)}\\right${bounds.includeUpper === false ? ')' : ']'}` : text('Invalid interval');
      return `${fn}\\left(\\theta\\right) = ${scalar(input.target)},\\quad \\theta \\in ${interval}`;
    }
  }
  if (input.topic === 'polar') {
    if (operation === 'to_cartesian') return `\\left(r,\\theta\\right) = \\left(${scalar(input.radius)}, ${angle(input.angle)}\\right)`;
    if (operation === 'to_polar') return `\\begin{aligned}\\left(x,y\\right) &= ${pair(input.point)}\\end{aligned}`;
    if (operation === 'rotate') return `\\operatorname{rotate}\\left(${pair(input.point)}, ${angle(input.angle)}\\right)`;
    if (operation === 'polar_product') return `\\begin{aligned}${polar(input.first)} \\cdot ${polar(input.second)}\\end{aligned}`;
  }
  if (input.topic === 'vector') {
    const a = vector(input.a), b = vector(input.b);
    if (operation === 'add') return `${a} + ${b}`;
    if (operation === 'subtract') return `${a} - ${b}`;
    if (operation === 'dot') return `${a} \\cdot ${b}`;
    if (operation === 'cross') return `${a} \\times ${b}`;
    if (operation === 'scale') return `${scalar(input.factor)} ${a}`;
    if (operation === 'norm') return `\\left\\lVert ${a} \\right\\rVert`;
    if (operation === 'distance') return `d\\left(${a}, ${b}\\right)`;
    if (operation === 'projection') return `\\operatorname{proj}_{${b}}\\left(${a}\\right)`;
    if (operation === 'rotate') return `\\operatorname{rotate}\\left(${a}, ${angle(input.angle)}\\right)`;
  }
  return null;
}

function precalculusAnswerLatex(answer, render) {
  if (answer.exact !== true) return null;
  const scalar = value => precalculusScalarLatex(value, render);
  const angle = value => piMultipleLatex(value, render);
  const vector = values => `\\left\\langle ${values.map(scalar).join(', ')} \\right\\rangle`;
  if (typeof answer.expression === 'string' && answer.coefficients && typeof answer.coefficients === 'object') return scalar(answer);
  if (Array.isArray(answer.solutions) && answer.unit === 'pi' && ['sin', 'cos', 'tan'].includes(answer.function))
    return `\\theta \\in ${answer.solutions.length ? `\\left\\{${answer.solutions.map(angle).join(', ')}\\right\\}` : '\\varnothing'}`;
  if (answer.cos && answer.sin && Object.hasOwn(answer, 'tan'))
    return `\\begin{aligned}\\theta &= ${angle(answer.piMultiple)} \\\\ \\cos\\theta &= ${scalar(answer.cos)} \\\\ \\sin\\theta &= ${scalar(answer.sin)} \\\\ \\tan\\theta &= ${answer.tan === null ? text('undefined') : scalar(answer.tan)}\\end{aligned}`;
  if (Object.hasOwn(answer, 'radius') && Object.hasOwn(answer, 'piMultiple')) {
    const polar = `\\left(r,\\theta\\right) = \\left(${scalar(answer.radius)}, ${angle(answer.piMultiple)}\\right)`;
    if (Array.isArray(answer.components)) return `\\begin{aligned}\\left(r,\\theta\\right) &= \\left(${scalar(answer.radius)}, ${angle(answer.piMultiple)}\\right) \\\\ \\left(x,y\\right) &= \\left(${answer.components.map(scalar).join(', ')}\\right)\\end{aligned}`;
    return answer.angleConvention === 'origin' ? `${polar},\\quad ${text('angle chosen by convention')}` : polar;
  }
  if (Array.isArray(answer.components) && [2, 3].includes(answer.dimension)) return vector(answer.components);
  if (answer.value?.coefficients) return scalar(answer.value);
  if (answer.determinant?.coefficients) return scalar(answer.determinant);
  if (answer.magnitude?.expression && answer.squared?.coefficients) return scalar(answer.magnitude);
  return null;
}

/** Format mathematical values without interpolating untrusted TeX commands. */
export function toLatex(value) {
  const active = new WeakSet();
  function render(v, depth = 0) {
    if (depth > 64) return text('Nesting limit');
    const next = x => render(x, depth + 1);
    if (v === null || v === undefined) return text(v === null ? 'None' : 'Unspecified');
    if (typeof v === 'boolean') return text(v ? 'True' : 'False');
    if (typeof v === 'bigint') return String(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return v === Infinity ? '\\infty' : v === -Infinity ? '-\\infty' : text(String(v));
      const scientific = /^(.+)[eE]([+-]?\d+)$/.exec(String(v));
      return scientific ? `${scientific[1]} \\times 10^{${Number(scientific[2])}}` : String(v);
    }
    if (typeof v === 'string') return stringLatex(v, next);
    if (typeof v !== 'object') return text(String(v));
    if (active.has(v)) return text('Circular value');
    active.add(v);
    let result;
    const precalculusAnswer = v.exact === true ? precalculusAnswerLatex(v, next) : null;
    if (v instanceof Rational) result = astLatex({ type: 'num', value: String(v) });
    else if (['num', 'sym', 'neg', 'binary', 'call'].includes(v.type)) { try { result = astLatex(v); } catch { result = text('Invalid expression'); } }
    else if (v.kind === 'precalculus') result = precalculusInputLatex(v, next) ?? text('Unsupported precalculus input');
    else if (precalculusAnswer !== null) result = precalculusAnswer;
    else if (v.kind === 'expression' && v.expression) result = next(v.expression);
    else if (['equation', 'inequality'].includes(v.kind) && v.left && v.right) result = `${next(v.left)} ${{ '<=': '\\le', '>=': '\\ge', '!=': '\\ne' }[v.relation] || (['<', '>'].includes(v.relation) ? v.relation : '=')} ${next(v.right)}`;
    else if (v.kind === 'function' && v.expression) result = `${symbol(v.name || 'f')}\\left(${symbol(v.variable || 'x')}\\right) = ${next(v.expression)}`;
    else if (v.kind === 'algebra' && typeof v.text === 'string') result = next(v.text);
    else if (['conic', 'literal_equation'].includes(v.kind) && typeof v.equation === 'string') result = next(v.equation);
    else if (Array.isArray(v)) {
      result = v.length && v.every(row => Array.isArray(row) && row.length === v[0].length) ? `\\begin{bmatrix}${v.map(row => row.map(next).join(' & ')).join(' \\\\ ')}\\end{bmatrix}` : `\\left[${v.map(next).join(', ')}\\right]`;
    } else if (v.predicate && Array.isArray(v.args)) result = factLatex(v, next);
    else if (v.kind === 'system' && Array.isArray(v.equations)) result = `\\begin{cases}${v.equations.map(next).join(' \\\\ ')}\\end{cases}`;
    else if (v.kind === 'finite_aggregate') result = `\\${v.operation === 'product' ? 'prod' : 'sum'}_{${symbol(v.index || 'k')}=${next(v.lower)}}^{${next(v.upper)}}\\left(${next(v.expression)}\\right)`;
    else if (v.kind === 'combinatorics' && v.operation === 'combinations') result = `\\binom{${next(v.n)}}{${next(v.r)}}`;
    else if (v.kind === 'combinatorics' && v.operation === 'factorial') result = `${next(v.n)}!`;
    else if (v.kind === 'piecewise' && Array.isArray(v.pieces)) {
      const cases = `\\begin{cases}${v.pieces.map(piece => `${next(piece?.expression)} & ${piece?.condition === 'otherwise' || piece?.condition === 'else' ? text('otherwise') : next(piece?.condition)}`).join(' \\\\ ')}\\end{cases}`;
      result = v.value === undefined ? cases : `\\left.${cases}\\right|_{${symbol(v.variable || 'x')}=${next(v.value)}}`;
    }
    else if (Array.isArray(v.branches) && v.branches.length && v.branches.every(branch => branch && typeof branch.solution === 'string' && Array.isArray(branch.conditions))) {
      const literal = typeof v.variable === 'string' && v.branches.every(branch => ['unique', 'all_in_domain', 'inconsistent'].includes(branch.type));
      const rows = v.branches.map(branch => {
        let solution = next(branch.solution);
        if (literal && branch.type === 'unique') {
          if (branch.expression !== undefined && branch.expression !== null) solution = next(branch.expression);
          else {
            try {
              const statement = parseStatement(branch.solution);
              if (statement.kind === 'equation' && statement.left.type === 'sym' && statement.left.name === v.variable) solution = next(statement.right);
            } catch { /* Keep the safe complete statement if its right side cannot be isolated. */ }
          }
        } else if (literal && branch.type === 'inconsistent') solution = text('No solution');
        const conditions = branch.conditions.length ? branch.conditions.map(next).join(`\\quad ${text('and')}\\quad `) : text('always');
        return `${solution} & ${conditions}`;
      });
      result = `${literal ? `${symbol(v.variable)} = ` : ''}\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`;
    }
    else if (v.kind === 'matrix' && Array.isArray(v.matrix)) result = `${v.operation && v.operation !== 'rref' ? `\\operatorname{${escapeText(v.operation)}}\\left(` : ''}${next(v.matrix)}${v.operation && v.operation !== 'rref' ? '\\right)' : ''}`;
    else if (Array.isArray(v.solutions)) {
      const values = v.solutions.map(next);
      result = v.identity ? `${symbol(v.variable || 'x')} \\in \\mathbb{R}\\quad ${text(v.solutionSet || 'in the original domain')}` : `${symbol(v.variable || 'x')} \\in ${values.length ? `\\left\\{${values.join(', ')}\\right\\}` : '\\varnothing'}`;
    } else if (Array.isArray(v.intervals)) result = `${v.variable ? `${symbol(v.variable)} \\in ` : ''}${v.intervals.map(i => intervalLatex(i, next)).join(' \\cup ') || '\\varnothing'}`;
    else if ((v.kind === 'interval' || v.type === 'interval') && ('low' in v || 'start' in v)) result = intervalLatex(v, next);
    else if ((v.kind === 'set' || v.type === 'set') && Array.isArray(v.values || v.elements)) result = `\\left\\{${(v.values || v.elements).map(next).join(', ')}\\right\\}`;
    else if (v.kind === 'sequence' && v.first !== undefined) {
      const first = next(v.first), increment = next(v.difference ?? v.step ?? v.ratio), index = v.task === 'sum' ? 'k' : String(v.n);
      const term = v.type === 'geometric' ? `\\left(${first}\\right)\\cdot\\left(${increment}\\right)^{${index}-1}` : `${first}+(${index}-1)\\cdot\\left(${increment}\\right)`;
      result = v.task === 'sum' ? `\\sum_{k=1}^{${next(v.n)}}\\left(${term}\\right)` : `a_{${next(v.n)}}=${term}`;
    } else if (v.exact !== undefined && v.value !== undefined && v.approximate === true) result = `${next(v.exact)} \\approx ${next(v.value)}${v.unit ? `\\;${text(v.unit)}` : ''}`;
    else if (v.values && !Array.isArray(v.values) && typeof v.values === 'object' && ['unique', 'infinite'].includes(v.type)) result = `\\begin{aligned}${Object.entries(v.values).map(([key, item]) => `${symbol(key)} &= ${next(item)}`).join(' \\\\ ')}\\end{aligned}`;
    else {
      const entries = Object.entries(v).filter(([key]) => !['kind', 'certificate', 'routing', 'verified', 'latex'].includes(key));
      const rows = entries.map(([key, item]) => `${key.length === 1 ? symbol(key) : text(key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '))} &= ${next(item)}`);
      result = rows.length ? `\\begin{aligned}${rows.join(' \\\\ ')}\\end{aligned}` : text(v.kind || 'Empty object');
    }
    active.delete(v); return result;
  }
  return render(value);
}

function stringLatex(source, render) {
  const s = source.trim(); if (!s) return text('');
  if (s === '{}') return '\\varnothing';
  if (/^[{[]/.test(s)) { try { return render(JSON.parse(s)); } catch { /* May be a mathematical set or interval. */ } }
  const geometry = parseGeometry(s); if (geometry) return render(geometry);
  const geometryStatement = geometryStringLatex(s, render); if (geometryStatement) return geometryStatement;
  if (s.includes('\\') || /\^\s*\{/.test(s)) {
    // Canonicalize supported notation; unknown commands become escaped text.
    try {
      if (!commandSafety(s).length && !incompleteNotation(s)) {
        katex.renderToString(s, RENDER_OPTIONS); argumentSyntax(s);
        try { const converted = convertEnvironment(s) || convertBinomial(s) || convertAggregate(s) || convertMath(s); return render(converted); }
        catch (error) { if (error.code === 'unsupported') return s; }
      }
    } catch { /* Escaped fallback below. */ }
    return text(s);
  }
  if (s === '∞' || s === '+∞' || /^(?:Infinity|infinity|inf)$/.test(s)) return '\\infty';
  if (s === '-∞' || /^-(?:Infinity|infinity|inf)$/.test(s)) return '-\\infty';
  if (/^(?:∅|No solution|empty set)$/i.test(s)) return '\\varnothing';
  if (/^All real numbers$/i.test(s)) return '\\mathbb{R}';
  if (/^[RCZNQℝℂℤℕℚ]$/.test(s)) return `\\mathbb{${{ 'ℝ': 'R', 'ℂ': 'C', 'ℤ': 'Z', 'ℕ': 'N', 'ℚ': 'Q' }[s] || s}}`;
  const label = /^([A-Za-z][A-Za-z _]*):\s*([\s\S]+)$/.exec(s);
  if (label) return `${text(label[1].replace(/_/g, ' '))}: ${render(label[2])}`;
  const task = /^(solve|simplify|factor|expand|analyze|conic)\s+([\s\S]+)$/i.exec(s);
  if (task) return `${text(task[1])}\\;${render(task[2])}`;
  if (/\s+or\s+|∨/.test(s)) return s.split(/\s+or\s+|∨/).map(render).join(`\\quad ${text('or')}\\quad `);
  if (/\s+and\s+|∧/.test(s)) return s.split(/\s+and\s+|∧/).map(render).join(`\\quad ${text('and')}\\quad `);
  if (s.includes(';') || s.includes('\n')) return s.split(/[;\n]+/).filter(x => x.trim()).map(render).join(';\\quad ');
  const member = /^(.*?)\s*(∈|∉)\s*(.+)$/.exec(s);
  if (member) return `${render(member[1])} ${member[2] === '∉' ? '\\notin' : '\\in'} ${render(member[3])}`;
  const asciiMember = asciiSetMembership(s);
  if (asciiMember) return `${render(asciiMember[1])} \\in ${render(asciiMember[2])}`;
  if (/\bin\b/.test(s)) return text(s);
  if (s.includes('∪')) return s.split('∪').map(render).join(' \\cup ');
  if (/^[([]/.test(s) && /[)\]]$/.test(s)) {
    const pair = splitTop(s.slice(1, -1));
    if (pair.length > 1) return `\\left${s[0]}${pair.map(render).join(', ')}\\right${s.at(-1)}`;
  }
  if (s.startsWith('{') && s.endsWith('}')) return `\\left\\{${splitTop(s.slice(1, -1)).filter(Boolean).map(render).join(', ')}\\right\\}`;
  const pm = /^(.*?)\s*([±∓])\s*(.+)$/.exec(s);
  if (pm) return `${render(pm[1])} ${pm[2] === '±' ? '\\pm' : '\\mp'} ${render(pm[3])}`;
  const inverse = /^([fgh])\^\(?-1\)?\(\s*([A-Za-z])\s*\)\s*=\s*(.+)$/.exec(s);
  if (inverse) return `${symbol(inverse[1])}^{-1}\\left(${symbol(inverse[2])}\\right) = ${render(inverse[3])}`;
  if (/^(?:all|sum|term|up|down|none)$/i.test(s) || [...s.matchAll(/[A-Za-z]+/g)].some(([word]) => word.length > 3 && !FUNCTIONS.has(word.toLowerCase()) && word.toLowerCase() !== 'infinity')) return text(s);
  const relations = [...s.matchAll(/<=|>=|!=|=|<|>/g)];
  if (relations.length > 1 && relations.every(match => match[0] !== '=')) {
    const parts = s.split(/<=|>=|!=|<|>/);
    return parts.map((part, i) => `${i ? `${{ '<=': '\\le', '>=': '\\ge', '!=': '\\ne' }[relations[i - 1][0]] || relations[i - 1][0]} ` : ''}${render(part)}`).join(' ');
  }
  try {
    const statement = parseStatement(s);
    if (statement.kind === 'expression') return astLatex(statement.expression);
    if (statement.kind === 'function') return `${symbol(statement.name)}\\left(${symbol(statement.variable)}\\right) = ${astLatex(statement.expression)}`;
    return `${astLatex(statement.left)} ${{ '<=': '\\le', '>=': '\\ge', '!=': '\\ne' }[statement.relation] || statement.relation || '='} ${astLatex(statement.right)}`;
  } catch { return text(s); }
}

/** Metadata only: the caller retains the original answer and certificates. */
export function formatResultLatex(input, result = {}) {
  const report = result && typeof result === 'object' ? result : {};
  const output = {
    input: toLatex(input), answer: toLatex(report.answer),
    restrictions: Array.from(Array.isArray(report.restrictions) ? report.restrictions : [], toLatex),
    steps: Array.from(Array.isArray(report.steps) ? report.steps : [], step => ({ before: toLatex(step?.before), after: toLatex(step?.after) })),
    valid: true, errors: [],
  };
  const fragments = [['input', output.input], ['answer', output.answer], ...output.restrictions.map((v, i) => [`restrictions.${i}`, v]), ...output.steps.flatMap((step, i) => [[`steps.${i}.before`, step.before], [`steps.${i}.after`, step.after]])];
  for (const [path, fragment] of fragments) {
    const checked = validateLatex(fragment, { allowPlain: false });
    output.errors.push(...checked.errors.map(error => ({ ...error, path })));
  }
  if (typeof input === 'string' && (input.includes('\\') || /\^\s*\{/.test(input))) {
    const original = validateLatex(input);
    output.errors.push(...original.errors.map(error => ({ ...error, path: 'source' })));
  }
  output.valid = output.errors.length === 0;
  return output;
}
