// Exact arithmetic and symbolic syntax. No eval, remote services, or sampling proofs.
export class MathError extends Error {
  constructor(message, code = 'unsupported') { super(message); this.name = 'MathError'; this.code = code; }
}
const abs = n => n < 0n ? -n : n;
const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
export class Rational {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (!d) throw new MathError('Division by zero is undefined.', 'invalid');
    if (n.toString().length + d.toString().length > 12000) throw new MathError('Exact arithmetic size limit reached.', 'budget');
    const g = gcd(n, d); this.n = n / g * (d < 0n ? -1n : 1n); this.d = abs(d / g);
  }
  static from(value) {
    if (value instanceof Rational) return value;
    if (typeof value === 'bigint') return new Rational(value);
    const s = String(value).trim();
    if (s.includes('/')) { const [a, b, extra] = s.split('/'); if (extra !== undefined) throw new MathError('Invalid fraction.', 'invalid'); return Rational.from(a).div(Rational.from(b)); }
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || !(m[2] || m[3])) throw new MathError(`Invalid number: ${s}`, 'invalid');
    const exponent = Number(m[4] || 0) - (m[3] || '').length;
    if (Math.abs(exponent) > 1000 || s.length > 2000) throw new MathError('Number exceeds exact arithmetic limits.', 'budget');
    const n = BigInt((m[2] || '0') + (m[3] || '')) * (m[1] === '-' ? -1n : 1n);
    return exponent >= 0 ? new Rational(n * 10n ** BigInt(exponent)) : new Rational(n, 10n ** BigInt(-exponent));
  }
  add(v) { v = Rational.from(v); return new Rational(this.n * v.d + v.n * this.d, this.d * v.d); }
  sub(v) { return this.add(Rational.from(v).neg()); }
  mul(v) { v = Rational.from(v); return new Rational(this.n * v.n, this.d * v.d); }
  div(v) { v = Rational.from(v); return new Rational(this.n * v.d, this.d * v.n); }
  neg() { return new Rational(-this.n, this.d); }
  pow(k) { k = Number(k); if (!Number.isInteger(k) || Math.abs(k) > 64) throw new MathError('Power exceeds supported exact bound.', 'budget'); return k < 0 ? new Rational(this.d ** BigInt(-k), this.n ** BigInt(-k)) : new Rational(this.n ** BigInt(k), this.d ** BigInt(k)); }
  eq(v) { v = Rational.from(v); return this.n === v.n && this.d === v.d; }
  cmp(v) { const x = this.sub(v).n; return x < 0n ? -1 : x > 0n ? 1 : 0; }
  get zero() { return this.n === 0n; }
  get integer() { return this.d === 1n; }
  toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
  toJSON() { return this.toString(); }
  valueOf() { return Number(this.n) / Number(this.d); }
}
export const Q = v => Rational.from(v);
export const ZERO = Q(0), ONE = Q(1);
export function integerSqrt(n) {
  n = BigInt(n); if (n < 0n) return null; if (n < 2n) return n;
  let a = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) { const b = (a + n / a) / 2n; if (b >= a) return a; a = b; }
}
export function rationalSqrt(v) { v = Q(v); if (v.n < 0n) return null; const a = integerSqrt(v.n), b = integerSqrt(v.d); return a * a === v.n && b * b === v.d ? new Rational(a, b) : null; }
export function integerNthRoot(n, degree) {
  n = BigInt(n); degree = Number(degree);
  if (n < 0n || !Number.isInteger(degree) || degree < 1 || degree > 31) throw new MathError('Root degree must be an integer from 1 through 31.', 'unsupported');
  if (degree === 1 || n < 2n) return n;
  if (degree === 2) return integerSqrt(n);
  if (n.toString().length > 2000) throw new MathError('Exact root size budget reached.', 'budget');
  const k = BigInt(degree); let x = 1n << BigInt(Math.ceil(n.toString(2).length / degree));
  for (let i = 0; i < 10000; i++) { const y = ((k - 1n) * x + n / (x ** (k - 1n))) / k; if (y >= x) return x; x = y; }
  throw new MathError('Exact root iteration budget reached.', 'budget');
}
export function rationalNthRoot(value, degree) {
  const q = Q(value), k = Number(degree);
  if (!Number.isInteger(k) || k < 1 || k > 31) throw new MathError('Root degree must be an integer from 1 through 31.');
  if (q.n < 0n && k % 2 === 0) return null;
  const n = integerNthRoot(abs(q.n), k), d = integerNthRoot(q.d, k);
  return n ** BigInt(k) === abs(q.n) && d ** BigInt(k) === q.d ? new Rational(q.n < 0n ? -n : n, d) : null;
}

export const num = v => ({ type: 'num', value: Q(v).toString() });
export const sym = name => ({ type: 'sym', name });
export const bin = (op, left, right) => ({ type: 'binary', op, left, right });
export const call = (name, ...args) => ({ type: 'call', name, args });
const FUNCTIONS = new Set(['sqrt', 'root', 'cbrt', 'factorial', 'abs', 'log', 'ln', 'exp', 'sin', 'cos', 'tan']);
export function normalizeInput(input) {
  if (typeof input !== 'string' || !input.trim()) throw new MathError('Enter a mathematical expression or equation.', 'invalid');
  if (input.length > 4096) throw new MathError('Input exceeds the 4096 character limit.', 'budget');
  return input.trim().replace(/[−–—]/g, '-').replace(/[×·⋅]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√\s*\(/g, 'sqrt(').replace(/\|([^|]+)\|/g, 'abs($1)').replace(/\*\*/g, '^').replace(/\\(?:left|right)/g, '').replace(/\\cdot/g, '*').replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
}
export function tokenize(input) {
  const s = normalizeInput(input), out = []; let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (number) { if (out.at(-1)?.type === 'num') throw new MathError('Separate adjacent numbers with an explicit operator.', 'invalid'); out.push({ type: 'num', value: number[0] }); i += number[0].length; }
    else {
      const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
      if (id) {
        const name = id[0];
        // Ordinary adjacent letters mean multiplication; known functions/constants stay intact.
        if (name.length > 1 && !FUNCTIONS.has(name.toLowerCase()) && !['pi'].includes(name.toLowerCase()) && /^[a-zA-Z]+$/.test(name)) {
          for (const ch of name) out.push({ type: 'sym', value: ch });
        } else out.push({ type: 'sym', value: name });
        i += name.length;
      } else {
        const op = /^(<=|>=|!=|[+\-*/^!%(),=<>])/.exec(s.slice(i));
        if (!op) throw new MathError(`Unexpected character “${s[i]}” at position ${i + 1}.`, 'invalid');
        out.push({ type: op[0], value: op[0] }); i += op[0].length;
      }
    }
    if (out.length > 512) throw new MathError('Expression contains too many tokens.', 'budget');
  }
  return out;
}
export function parseExpression(input) {
  const tokens = tokenize(input); let p = 0, depth = 0;
  const peek = () => tokens[p], take = () => tokens[p++];
  function primary() {
    if (++depth > 64) throw new MathError('Expression nesting limit reached.', 'budget');
    const t = take(); let a;
    if (!t) throw new MathError('An operand is missing.', 'invalid');
    if (t.type === 'num') a = num(t.value);
    else if (t.type === 'sym') {
      const name = t.value.toLowerCase();
      if (FUNCTIONS.has(name)) {
        if (take()?.type !== '(') throw new MathError(`${name} needs parentheses, for example ${name}(x).`, 'invalid');
        const args = [expression()]; while (peek()?.type === ',') { take(); args.push(expression()); }
        if (take()?.type !== ')') throw new MathError('Missing closing parenthesis.', 'invalid');
        if (name === 'root' ? args.length !== 2 : name === 'log' ? args.length < 1 || args.length > 2 : args.length !== 1) throw new MathError('Incorrect number of function arguments.', 'invalid');
        a = name === 'cbrt' ? call('root', args[0], num(3)) : call(name, ...args);
      } else a = sym(t.value);
    } else if (t.type === '(') { a = expression(); if (take()?.type !== ')') throw new MathError('Missing closing parenthesis.', 'invalid'); }
    else throw new MathError(`Unexpected token “${t.value}”.`, 'invalid');
    depth--; return a;
  }
  function power() {
    let a = primary();
    while (['!', '%'].includes(peek()?.type)) { const op = take().type; a = op === '!' ? call('factorial', a) : bin('/', a, num(100)); }
    if (peek()?.type === '^') {
      take(); const exponent = unary(); let fractional = null;
      try { fractional = constantValue(exponent); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
      if (fractional && !fractional.integer && fractional.d <= 31n && abs(fractional.n) <= 32n) {
        const root = call('root', a, num(fractional.d)); a = fractional.n === 1n ? root : bin('^', root, num(fractional.n));
      } else a = bin('^', a, exponent);
    }
    return a;
  }
  function unary() { if (peek()?.type === '+' || peek()?.type === '-') { const t = take(); const a = unary(); return t.type === '-' ? { type: 'neg', arg: a } : a; } return power(); }
  function product() {
    let a = unary();
    while (peek()) {
      const t = peek();
      if (t.type === '*' || t.type === '/') { take(); a = bin(t.type, a, unary()); }
      else if (['num', 'sym', '('].includes(t.type)) a = bin('*', a, unary());
      else break;
    }
    return a;
  }
  function expression() { let a = product(); while (peek()?.type === '+' || peek()?.type === '-') { const t = take(); a = bin(t.type, a, product()); } return a; }
  const ast = expression(); if (p !== tokens.length) throw new MathError(`Unexpected token “${peek().value}”.`, 'invalid'); return ast;
}
export function parseStatement(input) {
  const text = normalizeInput(input);
  const fn = /^(f|g|h)\(\s*([A-Za-z])\s*\)\s*=\s*(.+)$/i.exec(text);
  if (fn) return { kind: 'function', name: fn[1], variable: fn[2], expression: parseExpression(fn[3]), source: text };
  const matches = [...text.matchAll(/<=|>=|!=|=|<|>/g)];
  if (!matches.length) return { kind: 'expression', expression: parseExpression(text), source: text };
  if (matches.length !== 1) throw new MathError('Use one relation per line; submit systems as separate equations.', 'invalid');
  const m = matches[0], left = text.slice(0, m.index), right = text.slice(m.index + m[0].length);
  return { kind: m[0] === '=' ? 'equation' : 'inequality', relation: m[0], left: parseExpression(left), right: parseExpression(right), source: text };
}
export function print(ast, parent = 0) {
  if (ast.type === 'num') return ast.value.includes('/') && parent > 2 ? `(${ast.value})` : ast.value;
  if (ast.type === 'sym') return ast.name;
  if (ast.type === 'call') return `${ast.name}(${ast.args.map(a => print(a)).join(', ')})`;
  if (ast.type === 'neg') { const s = `-${print(ast.arg, 3)}`; return parent > 3 ? `(${s})` : s; }
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[ast.op];
  const left = print(ast.left, precedence + (ast.op === '^' ? 1 : 0));
  const right = print(ast.right, precedence + (['-', '/', '^'].includes(ast.op) ? 1 : 0));
  const s = `${left}${ast.op === '*' || ast.op === '/' || ast.op === '^' ? ast.op : ` ${ast.op} `}${right}`;
  return precedence < parent ? `(${s})` : s;
}
export function variables(ast) {
  const out = new Set(); walk(ast, a => { if (a.type === 'sym' && !['pi', 'e', 'i'].includes(a.name)) out.add(a.name); }); return [...out].sort();
}
export function walk(ast, fn) { fn(ast); if (ast.type === 'binary') { walk(ast.left, fn); walk(ast.right, fn); } else if (ast.type === 'neg') walk(ast.arg, fn); else if (ast.type === 'call') ast.args.forEach(a => walk(a, fn)); }
export function substitute(ast, name, value) { if (ast.type === 'sym') return ast.name === name ? value : ast; if (ast.type === 'binary') return bin(ast.op, substitute(ast.left, name, value), substitute(ast.right, name, value)); if (ast.type === 'neg') return { type: 'neg', arg: substitute(ast.arg, name, value) }; if (ast.type === 'call') return call(ast.name, ...ast.args.map(a => substitute(a, name, value))); return ast; }
export function evaluate(ast, env = {}) {
  if (ast.type === 'num') return Number(Q(ast.value));
  if (ast.type === 'sym') { if (ast.name === 'pi') return Math.PI; if (ast.name === 'e') return Math.E; if (!(ast.name in env)) throw new MathError(`Missing value for ${ast.name}.`, 'invalid'); return Number(env[ast.name]); }
  if (ast.type === 'neg') return -evaluate(ast.arg, env);
  if (ast.type === 'binary') { const a = evaluate(ast.left, env), b = evaluate(ast.right, env); if (ast.op === '+') return a + b; if (ast.op === '-') return a - b; if (ast.op === '*') return a * b; if (ast.op === '/') return b === 0 ? NaN : a / b; return a === 0 && b === 0 ? NaN : a ** b; }
  const a = ast.args.map(x => evaluate(x, env));
  if (ast.name === 'factorial') { if (!Number.isInteger(a[0]) || a[0] < 0) return NaN; if (a[0] > 170) return Infinity; let result = 1; for (let i = 2; i <= a[0]; i++) result *= i; return result; }
  return { sqrt: () => Math.sqrt(a[0]), root: () => !Number.isInteger(a[1]) || a[1] < 1 || a[1] > 31 || a[0] < 0 && a[1] % 2 === 0 ? NaN : (a[0] < 0 ? -1 : 1) * Math.abs(a[0]) ** (1 / a[1]), abs: () => Math.abs(a[0]), ln: () => Math.log(a[0]), log: () => Math.log(a[0]) / Math.log(a[1] ?? 10), exp: () => Math.exp(a[0]), sin: () => Math.sin(a[0]), cos: () => Math.cos(a[0]), tan: () => Math.tan(a[0]) }[ast.name]();
}
export function constantValue(ast) {
  if (ast.type === 'num') return Q(ast.value);
  if (ast.type === 'neg') return constantValue(ast.arg).neg();
  if (ast.type === 'binary') { const a = constantValue(ast.left), b = constantValue(ast.right); if (ast.op === '+') return a.add(b); if (ast.op === '-') return a.sub(b); if (ast.op === '*') return a.mul(b); if (ast.op === '/') return a.div(b); if (!b.integer) throw new MathError('Noninteger powers are not rational constants.'); if (a.zero && b.zero) throw new MathError('Zero to the zero power is undefined in this algebra domain.', 'invalid'); return a.pow(Number(b)); }
  if (ast.type === 'call') {
    const a = constantValue(ast.args[0]);
    if (ast.name === 'abs') return a.n < 0n ? a.neg() : a;
    if (ast.name === 'sqrt') { const root = rationalSqrt(a); if (root) return root; }
    if (ast.name === 'root') { const degree = constantValue(ast.args[1]); if (!degree.integer) throw new MathError('Root degree must be an integer.', 'invalid'); const root = rationalNthRoot(a, Number(degree)); if (root) return root; }
    if (ast.name === 'factorial') {
      if (!a.integer || a.n < 0n) throw new MathError('Factorial requires a nonnegative integer.', 'invalid');
      if (a.n > 1000n) throw new MathError('Factorial supports integers through 1000.', 'budget');
      let value = 1n; for (let k = 2n; k <= a.n; k++) value *= k; return Q(value);
    }
    if (ast.name === 'exp' && a.zero) return ONE;
    if (['log', 'ln'].includes(ast.name)) {
      if (a.n <= 0n) throw new MathError('A real logarithm requires a positive argument.', 'invalid');
      const base = ast.name === 'ln' ? null : ast.args[1] ? constantValue(ast.args[1]) : Q(10);
      if (base && (base.n <= 0n || base.eq(1))) throw new MathError('A logarithm base must be positive and different from 1.', 'invalid');
      if (a.eq(1)) return ZERO;
      if (base) for (let k = -64; k <= 64; k++) if (base.pow(k).eq(a)) return Q(k);
    }
  }
  throw new MathError('Expression is not an exact rational constant.');
}

// Sparse multivariate polynomials. Monomials are canonical sorted name/exponent pairs.
const mono = entries => entries.filter(([, k]) => k).sort(([a], [b]) => a.localeCompare(b)).map(([a, k]) => `${a}:${k}`).join('|');
const powers = key => key ? key.split('|').map(s => { const p = s.lastIndexOf(':'); return [s.slice(0, p), Number(s.slice(p + 1))]; }) : [];
export const polynomial = value => { const q = Q(value); return q.zero ? new Map() : new Map([['', q]]); };
export const polySymbol = name => new Map([[`${name}:1`, ONE]]);
export function pAdd(a, b) { const r = new Map(a); for (const [m, c] of b) { const n = (r.get(m) || ZERO).add(c); if (n.zero) r.delete(m); else r.set(m, n); } if (r.size > 2048) throw new MathError('Polynomial term budget reached.', 'budget'); return r; }
export const pScale = (a, k) => new Map([...a].map(([m, c]) => [m, c.mul(k)]).filter(([, c]) => !c.zero));
export const pSub = (a, b) => pAdd(a, pScale(b, -1));
export function pMul(a, b) {
  if (a.size * b.size > 100000) throw new MathError('Polynomial multiplication budget reached.', 'budget');
  let r = new Map();
  for (const [ma, ca] of a) for (const [mb, cb] of b) { const obj = new Map(powers(ma)); for (const [v, n] of powers(mb)) obj.set(v, (obj.get(v) || 0) + n); const m = mono([...obj]), c = (r.get(m) || ZERO).add(ca.mul(cb)); if (c.zero) r.delete(m); else r.set(m, c); }
  if (r.size > 2048) throw new MathError('Polynomial term budget reached.', 'budget'); return r;
}
export function pPow(a, n) { if (!Number.isInteger(n) || n < 0 || n > 32) throw new MathError('Polynomial powers must be integers from 0 through 32.', 'budget'); let r = polynomial(1), b = a; while (n) { if (n % 2) r = pMul(r, b); n = Math.floor(n / 2); if (n) b = pMul(b, b); } return r; }
export const pEqual = (a, b) => pSub(a, b).size === 0;
export function pVariables(p) { return [...new Set([...p.keys()].flatMap(m => powers(m).map(([v]) => v)))].sort(); }
export function pEvaluate(p, env) { let r = ZERO; for (const [m, c] of p) { let t = c; for (const [v, k] of powers(m)) { if (!(v in env)) throw new MathError(`Missing value for ${v}.`, 'invalid'); t = t.mul(Q(env[v]).pow(k)); } r = r.add(t); } return r; }
export function pDegree(p, variable) { let degree = 0; for (const m of p.keys()) for (const [v, k] of powers(m)) if (!variable || v === variable) degree = Math.max(degree, k); return degree; }
export function coefficients(p, variable = 'x') {
  const vars = pVariables(p); if (vars.some(v => v !== variable)) throw new MathError('A univariate polynomial is required.');
  const out = Array(pDegree(p, variable) + 1).fill(ZERO);
  for (const [m, c] of p) out[m ? powers(m)[0][1] : 0] = c;
  return trimCoefficients(out);
}
export function trimCoefficients(c) { c = [...c]; while (c.length > 1 && c.at(-1).zero) c.pop(); return c.length ? c : [ZERO]; }
export function fromCoefficients(c, variable = 'x') { return new Map(c.map((v, i) => [i ? `${variable}:${i}` : '', Q(v)]).filter(([, v]) => !v.zero)); }
export function divideCoefficients(a, b) {
  a = trimCoefficients(a); b = trimCoefficients(b); if (b.length === 1 && b[0].zero) throw new MathError('Division by zero polynomial.', 'invalid');
  const q = Array(Math.max(1, a.length - b.length + 1)).fill(ZERO), r = [...a];
  for (let k = r.length - b.length; k >= 0; k--) { const v = r[k + b.length - 1].div(b.at(-1)); q[k] = v; for (let j = 0; j < b.length; j++) r[k + j] = r[k + j].sub(v.mul(b[j])); }
  return { quotient: trimCoefficients(q), remainder: trimCoefficients(r) };
}
export function coefficientGcd(a, b) { a = trimCoefficients(a); b = trimCoefficients(b); while (!(b.length === 1 && b[0].zero)) { [a, b] = [b, divideCoefficients(a, b).remainder]; } return a.map(c => c.div(a.at(-1))); }
export function pPrint(p) {
  if (!p.size) return '0';
  const terms = [...p].sort(([ma], [mb]) => { const da = powers(ma).reduce((a, [, k]) => a + k, 0), db = powers(mb).reduce((a, [, k]) => a + k, 0); return db - da || ma.localeCompare(mb); });
  return terms.map(([m, c], i) => { const negative = c.n < 0n, mag = negative ? c.neg() : c, term = powers(m).map(([v, k]) => k === 1 ? v : `${v}^${k}`).join('*'); const body = term ? (mag.eq(1) ? term : `${mag}*${term}`) : String(mag); return (i ? (negative ? ' - ' : ' + ') : negative ? '-' : '') + body; }).join('');
}

export function rationalFunction(ast) {
  if (ast.type === 'num') return { num: polynomial(ast.value), den: polynomial(1) };
  if (ast.type === 'sym') { if (['pi', 'e', 'i'].includes(ast.name)) throw new MathError('This constant needs a specialized solver.'); return { num: polySymbol(ast.name), den: polynomial(1) }; }
  if (ast.type === 'neg') { const a = rationalFunction(ast.arg); return { num: pScale(a.num, -1), den: a.den }; }
  if (ast.type === 'call') return { num: polynomial(constantValue(ast)), den: polynomial(1) };
  if (ast.type === 'binary' && ast.op === '^') { try { if (constantValue(ast.left).eq(1)) return { num: polynomial(1), den: polynomial(1) }; } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; } }
  const a = rationalFunction(ast.left), b = rationalFunction(ast.right);
  if (ast.op === '+' || ast.op === '-') return { num: (ast.op === '+' ? pAdd : pSub)(pMul(a.num, b.den), pMul(b.num, a.den)), den: pMul(a.den, b.den) };
  if (ast.op === '*') return { num: pMul(a.num, b.num), den: pMul(a.den, b.den) };
  if (ast.op === '/') { if (!b.num.size) throw new MathError('Division by zero is undefined.', 'invalid'); return { num: pMul(a.num, b.den), den: pMul(a.den, b.num) }; }
  const n = constantValue(ast.right); if (!n.integer || Math.abs(Number(n)) > 32) throw new MathError('Only bounded integer powers are supported by rational normalization.');
  if (n.n <= 0n && !a.num.size) throw new MathError('Zero cannot have a zero or negative exponent.', 'invalid');
  return n.n < 0n ? { num: pPow(a.den, -Number(n)), den: pPow(a.num, -Number(n)) } : { num: pPow(a.num, Number(n)), den: pPow(a.den, Number(n)) };
}
export function reduceRational(r, variable = 'x') {
  if (!r.den.size) throw new MathError('Zero denominator.', 'invalid');
  if (pVariables(r.num).concat(pVariables(r.den)).some(v => v !== variable)) return r;
  let a = coefficients(r.num, variable), b = coefficients(r.den, variable);
  if (a.length === 1 && a[0].zero) return { num: polynomial(0), den: polynomial(1) };
  const g = coefficientGcd(a, b); a = divideCoefficients(a, g).quotient; b = divideCoefficients(b, g).quotient;
  const k = b.at(-1); return { num: fromCoefficients(a.map(c => c.div(k)), variable), den: fromCoefficients(b.map(c => c.div(k)), variable) };
}
export function rationalPrint(r, variable = 'x') { r = reduceRational(r, variable); if (pEqual(r.den, polynomial(1))) return pPrint(r.num); return `(${pPrint(r.num)})/(${pPrint(r.den)})`; }
export function symbolicEqual(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  const sqrtSquare = (x, y) => x.type === 'call' && x.name === 'sqrt' && x.args[0].type === 'binary' && x.args[0].op === '^' && y.type === 'call' && y.name === 'abs' && (() => { try { return constantValue(x.args[0].right).eq(2) && symbolicEqual(x.args[0].left, y.args[0]); } catch { return false; } })();
  if (sqrtSquare(a, b) || sqrtSquare(b, a)) return true;
  try { const A = rationalFunction(a), B = rationalFunction(b); return pEqual(pMul(A.num, B.den), pMul(B.num, A.den)); } catch (e) { if (e.code === 'invalid' || e.code === 'budget') throw e; }
  // Congruence proves identical function applications, not inverse identities with hidden domains.
  if (a.type === 'call' && b.type === 'call' && a.name === b.name && a.args.length === b.args.length) return a.args.every((v, i) => symbolicEqual(v, b.args[i]));
  if (a.type === 'binary' && b.type === 'binary' && a.op === b.op) return symbolicEqual(a.left, b.left) && symbolicEqual(a.right, b.right);
  return false;
}
export function restrictions(ast) {
  const out = []; const add = (expression, relation, value = '0') => { const text = `${print(expression)} ${relation} ${value}`; if (!out.some(x => x.text === text)) out.push({ expression, relation, value, text }); };
  walk(ast, a => {
    if (a.type === 'binary' && a.op === '/') add(a.right, '!=');
    if (a.type === 'binary' && a.op === '^') { try { if (constantValue(a.right).n <= 0n) add(a.left, '!='); } catch {} }
    if (a.type === 'call' && a.name === 'sqrt') add(a.args[0], '>=');
    if (a.type === 'call' && a.name === 'root') { const degree = constantValue(a.args[1]); if (!degree.integer || degree.cmp(1) < 0 || degree.cmp(31) > 0) throw new MathError('Root degree must be an integer from 1 through 31.'); if (Number(degree) % 2 === 0) add(a.args[0], '>='); }
    if (a.type === 'call' && ['log', 'ln'].includes(a.name)) { add(a.args[0], '>'); if (a.args[1]) { add(a.args[1], '>'); add(a.args[1], '!=', '1'); } }
  });
  return out;
}
export function statementRestrictions(s) { return (s.expression ? restrictions(s.expression) : [...restrictions(s.left), ...restrictions(s.right)]).filter((x, i, a) => a.findIndex(y => y.text === x.text) === i); }
export function restrictionSatisfied(r, env) { try { const v = constantValue(Object.entries(env).reduce((a, [key, value]) => substitute(a, key, num(value)), r.expression)).cmp(r.value); return r.relation === '!=' ? v !== 0 : r.relation === '>=' ? v >= 0 : r.relation === '>' ? v > 0 : false; } catch { return null; } }
export function polynomialResidual(s) { const L = rationalFunction(s.left), R = rationalFunction(s.right); return { num: pSub(pMul(L.num, R.den), pMul(R.num, L.den)), den: pMul(L.den, R.den) }; }
export function stableStringify(value) { if (typeof value === 'bigint' || value instanceof Rational) return JSON.stringify(String(value)); if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`; }
