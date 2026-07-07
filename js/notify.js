// ============ Applio in-page notifications ============
// Replaces native alert(), confirm(), and ad-hoc toasts.
//
// API:
//   toast(message, { type, duration })           → bottom-right slide-in
//   notify({ title, body, copyable })            → center modal w/ OK
//   confirmDialog({ title, body, confirmText, cancelText, danger })  → Promise<bool>

(function () {
  function ensureContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function iconFor(type) {
    const set = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>',
      warn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22h20z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
      info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12" y2="8"/></svg>'
    };
    return set[type] || set.info;
  }

  window.toast = function (message, opts = {}) {
    const type = opts.type || 'success';
    const duration = opts.duration ?? 2400;
    const c = ensureContainer();
    const el = document.createElement('div');
    el.className = `app-toast app-toast-${type}`;
    el.innerHTML = `<span class="app-toast-ico">${iconFor(type)}</span><span class="app-toast-msg"></span>`;
    el.querySelector('.app-toast-msg').textContent = message;
    let removeTimer;
    const dismiss = () => {
      clearTimeout(removeTimer);
      el.classList.remove('app-toast-in');
      el.classList.add('app-toast-out');
      setTimeout(() => el.remove(), 250);
    };
    // Optional action button, e.g. { label: 'Undo', onClick: fn }.
    if (opts.action && opts.action.label) {
      const btn = document.createElement('button');
      btn.className = 'app-toast-action';
      btn.type = 'button';
      btn.textContent = opts.action.label;
      btn.addEventListener('click', () => {
        try { opts.action.onClick && opts.action.onClick(); } finally { dismiss(); }
      });
      el.appendChild(btn);
    }
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('app-toast-in'));
    removeTimer = setTimeout(dismiss, duration);
  };

  function buildBackdrop() {
    const bd = document.createElement('div');
    bd.className = 'app-dialog-bd';
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('app-dialog-bd-in'));
    return bd;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  window.notify = function ({ title, body, copyable } = {}) {
    return new Promise(resolve => {
      const bd = buildBackdrop();
      bd.innerHTML = `
        <div class="app-dialog">
          ${title ? `<h3 class="app-dialog-title"></h3>` : ''}
          ${body ? `<div class="app-dialog-body"></div>` : ''}
          <div class="app-dialog-actions">
            ${copyable ? `<button class="btn btn-secondary" data-act="copy">Copy</button>` : ''}
            <button class="btn btn-primary" data-act="ok">OK</button>
          </div>
        </div>`;
      if (title) bd.querySelector('.app-dialog-title').textContent = title;
      if (body) bd.querySelector('.app-dialog-body').textContent = body;

      const close = () => {
        bd.classList.remove('app-dialog-bd-in');
        setTimeout(() => { bd.remove(); resolve(); }, 180);
      };
      bd.querySelector('[data-act="ok"]').onclick = close;
      bd.addEventListener('click', e => { if (e.target === bd) close(); });
      if (copyable) {
        bd.querySelector('[data-act="copy"]').onclick = async () => {
          try { await navigator.clipboard.writeText(body); window.toast('Copied to clipboard', { type: 'success' }); }
          catch { window.toast('Copy failed', { type: 'error' }); }
        };
      }
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', onKey); }
      });
    });
  };

  window.confirmDialog = function ({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const bd = buildBackdrop();
      bd.innerHTML = `
        <div class="app-dialog">
          ${title ? `<h3 class="app-dialog-title"></h3>` : ''}
          ${body ? `<p class="app-dialog-body"></p>` : ''}
          <div class="app-dialog-actions">
            <button class="btn btn-ghost" data-act="cancel"></button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm"></button>
          </div>
        </div>`;
      if (title) bd.querySelector('.app-dialog-title').textContent = title;
      if (body) bd.querySelector('.app-dialog-body').textContent = body;
      bd.querySelector('[data-act="cancel"]').textContent = cancelText;
      bd.querySelector('[data-act="confirm"]').textContent = confirmText;

      const finish = (val) => {
        bd.classList.remove('app-dialog-bd-in');
        setTimeout(() => { bd.remove(); resolve(val); }, 180);
      };
      bd.querySelector('[data-act="confirm"]').onclick = () => finish(true);
      bd.querySelector('[data-act="cancel"]').onclick = () => finish(false);
      bd.addEventListener('click', e => { if (e.target === bd) finish(false); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { finish(false); document.removeEventListener('keydown', onKey); }
        else if (e.key === 'Enter') { finish(true); document.removeEventListener('keydown', onKey); }
      });
    });
  };
})();

// ============ Siri-style WebGL wave (vanilla port of the React component) ============
// Self-contained: a fullscreen triangle drives a fragment shader, no WebGL lib.
// Shaders are verbatim from the original siri-wave component.
const _SIRI_VERT = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;
const _SIRI_WAVE = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
const float PI = 3.14159265359;
const float AMPLITUDE   = 0.32;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.6;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.;
const float FALLOFF     = 1.7;
const float EDGE_MASK   = 0.4;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_AMP     = 6.0;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_BAND    = 20.0;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.5;
const float HIGH_ABAMP  = 0.06;
const float RESOLVED    = 1.0;
const float UNRES_SCALE = 0.14;
vec3 spectral4(int s){
    // Brand palette ramp: indigo (#4f46e5) -> violet (#8b5cf6) -> lavender.
    float x = float(s) / 3.0;
    vec3 a = vec3(0.310, 0.275, 0.898);
    vec3 b = vec3(0.545, 0.361, 0.965);
    vec3 c = vec3(0.706, 0.620, 1.000);
    return x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, (x - 0.5) * 2.0);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.5) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);
    float t   = iTime;
    float low  = clamp(0.45 + 0.45*sin(t*0.8)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.40*sin(t*1.7+2.0)*sin(t*0.53), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);
    float res   = clamp(RESOLVED, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED;
    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
    env *= env;
    float A1    = AMPLITUDE + 0.01*low*LOW_AMP;
    float A2    = A1 + mid*MID_ABAMP + high*HIGH_ABAMP;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res);
    float inten = mix(0.1, 0.01*(INTENSITY + low*LOW_INT), res);
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);
    float dUnres = max(length(p) - mix(0.14, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);
    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = mix(vec3(1.0), spectral4(s), res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float d   = mix(dUnres, abs(p.y - yL), res);
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;
    float dM    = mix(dUnres, abs(p.y - yMain), res);
    float lorM  = mix(1.0/(1.0 + (0.02*dM)*(0.02*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    // Tint the bright central core toward brand indigo (was pure white).
    vec3 core = vec3(0.55, 0.46, 1.0);
    col += core * 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);
    col = pow(max(col, 0.0), vec3(1.5));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF, 2.0));
    col *= mix(1.0, em*gauss, res);
    col *= res;
    // Alpha follows brightness so the dark background is transparent.
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
    fragColor = vec4(col, a);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

// Mount the wave onto a <canvas>. Returns a cleanup fn, or null if WebGL is
// unavailable / the shader fails to compile (caller falls back to a spinner).
function mountSiriWave(canvas, opts) {
  opts = opts || {};
  const size = opts.size || 200;
  const renderScale = opts.renderScale || 0.7;
  const glOpts = { alpha: true, premultipliedAlpha: false, antialias: true };
  const gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts);
  if (!gl) return null;
  try {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh);
        throw new Error(log || 'shader compile error');
      }
      return sh;
    };
    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, _SIRI_VERT);
    const fs = compile(gl.FRAGMENT_SHADER, _SIRI_WAVE);
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program); gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, 'iResolution');
    const uTime = gl.getUniformLocation(program, 'iTime');
    const dim = Math.round(size * renderScale);
    canvas.width = dim; canvas.height = dim; gl.viewport(0, 0, dim, dim);
    gl.clearColor(0, 0, 0, 0);
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, dim, dim);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteBuffer(buffer);
    };
  } catch (e) { return null; }
}

// ============ AI Loading overlay ============
// aiLoading(message), shows a full-screen spinner with a message
// aiLoadingDone(), removes it
// Both are safe to call multiple times; only one overlay exists at a time.

// Task-specific "thinking" steps, inferred from the message so callers need no
// changes. Rotating these makes the wait feel intentional and shorter.
const AI_STEPS = {
  analyze: ['Reading your experience…', 'Checking clarity and impact…', 'Scoring each section…', 'Writing actionable feedback…'],
  ats:     ['Parsing the job description…', 'Matching keywords to your resume…', 'Checking ATS formatting…', 'Calculating your match score…'],
  tailor:  ['Studying the role…', 'Aligning the keywords that matter…', 'Rewriting your bullets…', 'Reframing your summary…'],
  improve: ['Reading your draft…', 'Finding stronger verbs…', 'Adding measurable impact…', 'Polishing the wording…'],
  skills:  ['Scanning your experience…', 'Identifying relevant skills…', 'Grouping them by category…'],
  parse:   ['Reading your file…', 'Extracting each section…', 'Structuring your resume…'],
  interview: ['Studying the role…', 'Drafting tailored questions…', 'Adding answer tips…'],
  _default: ['Working on it…', 'Crunching the details…', 'Almost there…'],
};
function _aiStepScript(message) {
  const m = (message || '').toLowerCase();
  if (/analy/.test(m)) return AI_STEPS.analyze;
  if (/scor|ats/.test(m)) return AI_STEPS.ats;
  if (/tailor/.test(m)) return AI_STEPS.tailor;
  if (/improv/.test(m)) return AI_STEPS.improve;
  if (/skill/.test(m)) return AI_STEPS.skills;
  if (/pars|import/.test(m)) return AI_STEPS.parse;
  if (/interview/.test(m)) return AI_STEPS.interview;
  return AI_STEPS._default;
}
function _clearAiTimers(el) {
  if (!el) return;
  if (el._aiTimers) { el._aiTimers.forEach(t => { clearInterval(t); clearTimeout(t); }); el._aiTimers = null; }
  if (el._raf) { cancelAnimationFrame(el._raf); el._raf = null; }
}

// Frame script for the AI dot-loader (7x7 grid; each frame lists the lit dot
// indices). A looping "snake" that travels the grid — ported from the DotLoader.
const _AI_DOT_FRAMES = [
  [14, 7, 0, 8, 6, 13, 20], [14, 7, 13, 20, 16, 27, 21], [14, 20, 27, 21, 34, 24, 28],
  [27, 21, 34, 28, 41, 32, 35], [34, 28, 41, 35, 48, 40, 42], [34, 28, 41, 35, 48, 42, 46],
  [34, 28, 41, 35, 48, 42, 38], [34, 28, 41, 35, 48, 30, 21], [34, 28, 41, 48, 21, 22, 14],
  [34, 28, 41, 21, 14, 16, 27], [34, 28, 21, 14, 10, 20, 27], [28, 21, 14, 4, 13, 20, 27],
  [28, 21, 14, 12, 6, 13, 20], [28, 21, 14, 6, 13, 20, 11], [28, 21, 14, 6, 13, 20, 10],
  [14, 6, 13, 20, 9, 7, 21],
];

// Build the 49-dot grid element. Returns { el, start(), stop() }.
// Active dots glow indigo; inactive dots are faint on the dark overlay.
function _aiDotLoader(duration) {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,10px);gap:5px;width:fit-content;';
  const dots = [];
  for (let i = 0; i < 49; i++) {
    const d = document.createElement('div');
    d.style.cssText = 'width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.12);transition:background .12s ease, box-shadow .12s ease;';
    grid.appendChild(d);
    dots.push(d);
  }
  let idx = 0, timer = null;
  const apply = (frameIndex) => {
    const frame = _AI_DOT_FRAMES[frameIndex]; if (!frame) return;
    dots.forEach((d, i) => {
      const on = frame.includes(i);
      d.style.background = on ? '#a5b4fc' : 'rgba(255,255,255,.12)';
      d.style.boxShadow = on ? '0 0 8px rgba(129,140,248,.7)' : 'none';
    });
  };
  return {
    el: grid,
    start() {
      apply(0); idx = 1;
      timer = setInterval(() => { apply(idx); idx = (idx + 1) % _AI_DOT_FRAMES.length; }, duration || 110);
      return timer;
    },
    staticFrame() { apply(0); },
    stop() { if (timer) clearInterval(timer); },
  };
}

window.aiLoading = function (message) {
  // Remove any existing overlay first (safety)
  const existing = document.getElementById('ai-loading-overlay');
  if (existing) { if (existing._siriCleanup) existing._siriCleanup(); _clearAiTimers(existing); existing.remove(); }

  const el = document.createElement('div');
  el.id = 'ai-loading-overlay';
  el._aiTimers = [];
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:14px',
    'background:rgba(7,9,26,.72)',
    'backdrop-filter:blur(6px)',
    '-webkit-backdrop-filter:blur(6px)',
    'animation:aiOverlayIn .18s ease both',
  ].join(';');
  el.innerHTML = `<style>
      @keyframes aiOverlayIn { from { opacity:0 } to { opacity:1 } }
      @keyframes aiSpinRing  { to { transform: rotate(360deg) } }
      @keyframes aiPulseText { 0%,100% { opacity:.6 } 50% { opacity:1 } }
      @keyframes aiStepIn    { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }
    </style>`;

  // Primary visual: the animated dot-loader (7x7 grid "snake"). Reduced motion
  // shows a single static frame instead of animating.
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots = _aiDotLoader(110);
  el.appendChild(dots.el);
  if (reduce) {
    dots.staticFrame();
  } else {
    const dotTimer = dots.start();
    el._aiTimers.push(dotTimer);
  }

  const msg = document.createElement('div');
  msg.id = 'ai-loading-msg';
  msg.style.cssText = 'font-size:14px;font-weight:600;color:#e6e9f5;letter-spacing:.01em;max-width:280px;text-align:center;line-height:1.5;';
  msg.textContent = message || 'AI is thinking…';
  el.appendChild(msg);

  if (reduce) {
    // Reduced motion: static message only, no rotation/progress animation.
    document.body.appendChild(el);
    return;
  }

  // Rotating step detail under the headline.
  const steps = _aiStepScript(message);
  const step = document.createElement('div');
  step.style.cssText = 'font-size:12.5px;color:#9aa3c7;min-height:18px;text-align:center;max-width:300px;';
  step.textContent = steps[0];
  el.appendChild(step);
  let si = 0;
  const rotId = setInterval(() => {
    si = (si + 1) % steps.length;
    step.style.animation = 'none';
    void step.offsetWidth;            // restart the fade
    step.textContent = steps[si];
    step.style.animation = 'aiStepIn .35s ease both';
  }, 1700);
  el._aiTimers.push(rotId);

  // Eased indeterminate progress bar (creeps toward ~92%, never "completes"
  // until the result arrives and the overlay is removed).
  const track = document.createElement('div');
  track.style.cssText = 'width:200px;height:4px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden;margin-top:2px;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#6366f1,#8b5cf6);transition:width .25s linear;';
  track.appendChild(fill);
  el.appendChild(track);
  const t0 = performance.now();
  (function grow() {
    const dt = performance.now() - t0;
    const pct = 92 * (1 - Math.exp(-dt / 2600));   // fast at first, asymptotic to 92%
    fill.style.width = pct.toFixed(1) + '%';
    el._raf = requestAnimationFrame(grow);          // track only the latest frame id
  })();

  // Slow-state reassurance: if it's still running after a while, stop rotating
  // and hold a reassuring line.
  el._aiTimers.push(setTimeout(() => {
    clearInterval(rotId);
    step.textContent = 'Taking a little longer than usual, hang tight…';
    step.style.animation = 'aiStepIn .35s ease both';
  }, 12000));

  document.body.appendChild(el);
};

window.aiLoadingDone = function () {
  const el = document.getElementById('ai-loading-overlay');
  if (!el) return;
  if (el._siriCleanup) { try { el._siriCleanup(); } catch (e) {} el._siriCleanup = null; }
  _clearAiTimers(el);
  el.style.animation = 'aiOverlayIn .15s ease reverse both';
  setTimeout(() => el.remove(), 150);
};