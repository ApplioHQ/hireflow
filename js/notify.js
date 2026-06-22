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
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('app-toast-in'));
    setTimeout(() => {
      el.classList.remove('app-toast-in');
      el.classList.add('app-toast-out');
      setTimeout(() => el.remove(), 250);
    }, duration);
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

window.aiLoading = function (message) {
  // Remove any existing overlay first (safety)
  const existing = document.getElementById('ai-loading-overlay');
  if (existing) { if (existing._siriCleanup) existing._siriCleanup(); existing.remove(); }

  const el = document.createElement('div');
  el.id = 'ai-loading-overlay';
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
    </style>`;

  // Primary visual: Siri-style WebGL wave. Falls back to an SVG spinner when
  // WebGL is unavailable or the user prefers reduced motion.
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cleanup = null;
  if (!reduce) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:200px;height:200px;background:transparent;';
    cleanup = mountSiriWave(canvas, { variant: 'wave', size: 200, renderScale: 0.7 });
    if (cleanup) { el.appendChild(canvas); el._siriCleanup = cleanup; }
  }
  if (!cleanup) {
    const sp = document.createElement('div');
    sp.style.cssText = 'width:56px;height:56px;position:relative;display:flex;align-items:center;justify-content:center;';
    sp.innerHTML = `
      <svg viewBox="0 0 56 56" style="position:absolute;inset:0;width:100%;height:100%;animation:aiSpinRing 1.1s linear infinite;">
        <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(99,102,241,.25)" stroke-width="4"/>
        <circle cx="28" cy="28" r="24" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-dasharray="36 113"/>
      </svg>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a5b4fc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      </svg>`;
    el.appendChild(sp);
  }

  const msg = document.createElement('div');
  msg.id = 'ai-loading-msg';
  msg.style.cssText = 'font-size:14px;font-weight:500;color:#e6e9f5;letter-spacing:.01em;animation:aiPulseText 1.8s ease-in-out infinite;max-width:260px;text-align:center;line-height:1.5;';
  msg.textContent = message || 'AI is thinking…';
  el.appendChild(msg);

  document.body.appendChild(el);
};

window.aiLoadingDone = function () {
  const el = document.getElementById('ai-loading-overlay');
  if (!el) return;
  if (el._siriCleanup) { try { el._siriCleanup(); } catch (e) {} el._siriCleanup = null; }
  el.style.animation = 'aiOverlayIn .15s ease reverse both';
  setTimeout(() => el.remove(), 150);
};