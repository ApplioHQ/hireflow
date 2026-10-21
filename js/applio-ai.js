/* Applio AI — the full "ask → morphing sphere → answer card" experience.
   Vanilla port of MorphOrb (the moving dotted orb + timeline morph) combined with
   the PromptInputBox composer, recoloured to Applio's charcoal + violet and branded
   with the Applio spark mark. No build step, no deps.

   Mount it and hand it an onSubmit that returns the answer text:

     var ai = ApplioAI.mount(rootEl, {
       onSubmit: async function (text, history) { return replyString; },
       placeholder: "Ask your career coach anything…",
       chips: [ "Review my resume", ... ]
     });

   `history` is the running [{role, content}] transcript (for multi-turn context).
   ApplioAI.markHTML(px) returns the spark-tile logo for reuse elsewhere. */
(function () {
  'use strict';

  /* ───────── the Applio spark mark (violet tile + white 4-point spark) ───────── */
  var SPARK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6c.5 3.9 1.3 6.2 2.8 7.7 1.5 1.5 3.8 2.3 7.7 2.8 -3.9.5-6.2 1.3-7.7 2.8 -1.5 1.5-2.3 3.8-2.8 7.7 -.5-3.9-1.3-6.2-2.8-7.7 -1.5-1.5-3.8-2.3-7.7-2.8 3.9-.5 6.2-1.3 7.7-2.8 1.5-1.5 2.3-3.8 2.8-7.7z" fill="#fff"/></svg>';
  function markHTML(px) { px = px || 34; return '<span class="applio-mark" style="width:' + px + 'px;height:' + px + 'px;">' + SPARK + '</span>'; }

  var COPY = { labels: ['Thinking', 'Searching', 'Analyzing', 'Composing'], done: 'Done' };

  /* ───────── styles (self-contained, injected once) ───────── */
  var STYLE = [
    '.applio-mark{display:inline-grid;place-items:center;border-radius:28%;flex:0 0 auto;',
      'background:linear-gradient(150deg,#8a73f8,#6d4dfc 55%,#5a3df0);box-shadow:0 8px 22px rgba(109,77,252,.5),inset 0 1px 0 rgba(255,255,255,.3);}',
    '.applio-mark svg{width:62%;height:62%;}',

    '.mo-root{position:relative;width:100%;display:grid;place-items:center;--oCenter:0;--speed:1;}',
    '.mo-bg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(58% 54% at 50% 46%,rgba(109,77,252,calc(.16*var(--oCenter))),transparent 70%);}',
    '.mo-halo{position:absolute;left:50%;top:46%;width:420px;height:420px;transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(circle,rgba(109,77,252,calc(.10*var(--oCenter))),transparent 62%);filter:blur(6px);}',

    '.mo-mover{position:relative;width:100%;display:grid;place-items:center;}',
    '.mo-actor{position:relative;width:var(--w,520px);height:var(--h,138px);border-radius:var(--r,22px);display:grid;place-items:center;will-change:width,height,border-radius;}',

    '.mo-underglow{position:absolute;inset:-30px;border-radius:40px;pointer-events:none;opacity:var(--oGlow,1);background:radial-gradient(60% 120% at 50% 120%,rgba(109,77,252,.18),transparent 70%);filter:blur(10px);}',
    '.mo-halo-green{position:absolute;left:50%;top:50%;width:200px;height:200px;transform:translate(-50%,-50%);pointer-events:none;opacity:var(--oHalo,0);background:radial-gradient(circle,rgba(109,77,252,.55),transparent 62%);filter:blur(8px);}',
    '.mo-surface{position:absolute;inset:0;border-radius:inherit;overflow:hidden;opacity:var(--oPill,1);background:var(--bg-1,#1c1c20);border:1px solid var(--border,#33333a);box-shadow:0 10px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.03);}',
    '.mo-aurora{position:absolute;inset:0;opacity:calc(.5*var(--oAur,1));mix-blend-mode:screen;}',
    '.mo-aurora i{position:absolute;width:55%;height:160%;border-radius:50%;filter:blur(34px);opacity:.5;animation:mo-drift 7s ease-in-out infinite alternate;}',
    '.mo-aurora i:nth-child(1){left:-6%;top:-40%;background:rgba(109,77,252,.5);animation-delay:-1s;}',
    '.mo-aurora i:nth-child(2){left:40%;top:-50%;background:rgba(138,115,248,.45);animation-delay:-3s;}',
    '.mo-aurora i:nth-child(3){left:70%;top:-30%;background:rgba(109,77,252,.4);animation-delay:-5s;}',
    '.mo-aurora i:nth-child(4){left:20%;top:-20%;background:rgba(160,140,255,.35);animation-delay:-2s;}',
    '.mo-ball{position:absolute;left:50%;top:50%;width:60px;height:60px;transform:translate(-50%,-50%);border-radius:50%;opacity:var(--oBall,0);pointer-events:none;background:radial-gradient(circle at 38% 34%,#fff,#6d4dfc 60%,#4a32c0 100%);box-shadow:0 0 30px rgba(109,77,252,.6);}',
    '.mo-green{position:absolute;left:50%;top:50%;width:118px;height:118px;transform:translate(-50%,-50%) scale(var(--gs,.55));border-radius:50%;opacity:var(--oGreen,0);pointer-events:none;background:radial-gradient(circle at 42% 38%,#d8ccff,#6d4dfc 55%,#4a32c0 100%);box-shadow:0 0 44px rgba(109,77,252,.75);}',
    '.mo-card{position:absolute;inset:0;border-radius:inherit;opacity:var(--oCard,0);transform:scale(var(--cs,1));background:var(--bg-1,#1c1c20);border:1px solid rgba(109,77,252,.32);box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 0 1px rgba(109,77,252,.06);}',
    '.mo-ring{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:var(--oRing,0);border:1px solid rgba(109,77,252,.5);box-shadow:0 0 0 1px rgba(109,77,252,.12);}',

    '.mo-input{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;padding:10px 10px 10px 14px;opacity:var(--oInput,1);transform:scale(var(--inScale,1));transform-origin:center;gap:2px;}',
    '.mo-input[inert]{pointer-events:none;}',
    '.aip-top{display:flex;align-items:flex-start;gap:9px;flex:1;min-height:0;}',
    '.mo-input .applio-mark{width:28px;height:28px;margin-top:7px;}',
    '.mo-field{flex:1;min-width:0;background:transparent;border:0;outline:none;resize:none;color:var(--text,#e6e9f5);font:inherit;font-size:15px;line-height:1.5;padding:9px 4px;max-height:120px;}',
    '.mo-field::placeholder{color:var(--muted,#9a9aa2);}',
    '.aip-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:4px;}',
    '.aip-tools-left{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}',
    '.aip-pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:999px;border:1px solid transparent;background:transparent;color:var(--muted,#9a9aa2);cursor:pointer;font-size:12.5px;font-weight:600;transition:all .15s ease;}',
    '.aip-pill svg{width:15px;height:15px;}',
    '.aip-pill:hover{color:var(--text,#e6e9f5);}',
    '.aip-pill.on{color:var(--accent,#6d4dfc);background:rgba(109,77,252,.13);border-color:rgba(109,77,252,.5);}',
    '.aip-divider{width:1px;height:18px;background:var(--border,#33333a);margin:0 3px;}',
    '.mo-send{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;background:var(--bg-2,#26262b);color:var(--muted,#9a9aa2);transition:all .18s ease;flex:0 0 auto;}',
    '.mo-send svg{width:17px;height:17px;}',
    '.mo-send[data-ready]{background:var(--accent,#6d4dfc);color:#fff;box-shadow:0 4px 14px rgba(109,77,252,.45);}',
    '.mo-send.recording{background:#ef4444;color:#fff;}',
    '.mo-send:disabled{opacity:.5;cursor:default;box-shadow:none;}',
    '.aip-wave{display:none;align-items:center;gap:3px;height:26px;padding:0 6px;}',
    '.mo-input.rec .aip-wave{display:flex;}',
    '.mo-input.rec .aip-top{display:none;}',
    '.aip-wave span{width:3px;border-radius:2px;background:rgba(109,77,252,.8);height:6px;animation:mo-wave 1s ease-in-out infinite;}',

    '.mo-orb{position:absolute;left:50%;top:50%;width:220px;height:220px;transform:translate(-50%,-50%);pointer-events:none;z-index:2;}',
    '.mo-pulse{position:absolute;left:50%;top:50%;width:132px;height:132px;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;opacity:0;z-index:2;box-shadow:0 0 0 2px rgba(109,77,252,.6),0 0 44px rgba(109,77,252,.5);}',

    '.mo-answer{position:absolute;inset:0;z-index:4;padding:16px 18px;overflow:auto;text-align:left;pointer-events:none;}',
    '.mo-actor[data-answered] .mo-answer{pointer-events:auto;}',
    '.mo-answer::-webkit-scrollbar{width:6px;}',
    '.mo-answer::-webkit-scrollbar-thumb{background:var(--border-strong,#44444d);border-radius:3px;}',
    '.mo-answer::-webkit-scrollbar-track{background:transparent;}',
    '.mo-a-head{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:var(--text,#e6e9f5);opacity:var(--hOp,0);margin-bottom:11px;}',
    '.mo-a-head .applio-mark{width:26px;height:26px;transform:scale(var(--dotS,0));}',
    '.mo-a-body{margin:0;font-size:14.5px;line-height:1.65;color:var(--text,#e6e9f5);}',
    '.mo-a-body p{margin:0 0 9px;} .mo-a-body p:last-child{margin-bottom:0;}',
    '.mo-a-body ul{margin:6px 0;padding-left:18px;} .mo-a-body li{margin:3px 0;}',
    '.mo-a-body strong{font-weight:700;}',
    '.mo-w{display:inline-block;opacity:0;will-change:opacity,transform,filter;}',

    '.mo-status{position:absolute;left:50%;bottom:-6px;transform:translate(-50%,var(--sTy,6px));white-space:nowrap;opacity:var(--sOp,0);}',
    '.mo-lab{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--muted,#9a9aa2);}',
    '.mo-lab.mo-out{position:absolute;left:50%;transform:translateX(-50%);animation:mo-out .28s ease forwards;}',
    '.mo-lab.mo-in{animation:mo-in .28s ease;}',
    '.mo-lab-t{background:linear-gradient(90deg,var(--muted,#9a9aa2),var(--text,#e6e9f5),var(--muted,#9a9aa2));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:mo-shimmer 2.2s linear infinite;}',
    '.mo-lab-done{color:var(--accent,#6d4dfc);font-weight:700;}',
    '.mo-dots{display:inline-flex;gap:3px;}',
    '.mo-dots i{width:4px;height:4px;border-radius:50%;background:var(--accent,#6d4dfc);animation:mo-dot 1.3s ease-in-out infinite;}',
    '.mo-dots i:nth-child(2){animation-delay:.18s;} .mo-dots i:nth-child(3){animation-delay:.36s;}',

    '.mo-ask{position:absolute;left:50%;top:-30px;transform:translateX(-50%);max-width:90%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;color:var(--muted,#9a9aa2);opacity:0;transition:opacity .3s ease;}',
    '.mo-root[data-phase="answered"] .mo-ask{opacity:1;}',
    '.mo-ask b{color:var(--text,#e6e9f5);font-weight:600;}',

    '.mo-reset{position:absolute;left:50%;bottom:-54px;transform:translateX(-50%);background:var(--bg-2,#26262b);border:1px solid var(--border,#33333a);color:var(--text,#e6e9f5);font-size:12.5px;font-weight:600;border-radius:999px;padding:8px 16px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s ease,background .14s;}',
    '.mo-reset:hover{background:var(--bg-3,#303037);}',
    '.mo-root[data-phase="answered"] .mo-reset{opacity:1;pointer-events:auto;}',
    '.mo-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}',

    '.mo-history{width:100%;max-width:560px;margin:0 auto 22px;display:flex;flex-direction:column;gap:10px;}',
    '.mo-hist-q{align-self:flex-end;max-width:85%;background:linear-gradient(135deg,var(--accent,#6d4dfc),#8a73f8);color:#fff;font-size:13px;line-height:1.5;padding:9px 13px;border-radius:14px;border-top-right-radius:5px;}',
    '.mo-hist-a{align-self:flex-start;max-width:90%;display:flex;gap:9px;}',
    '.mo-hist-a .applio-mark{width:26px;height:26px;margin-top:2px;}',
    '.mo-hist-a .mo-hist-bub{background:var(--bg-2,#26262b);border:1px solid var(--border,#33333a);color:var(--text,#e6e9f5);font-size:13px;line-height:1.55;padding:9px 13px;border-radius:14px;border-top-left-radius:5px;}',
    '.mo-hist-a .mo-hist-bub p{margin:0 0 7px;} .mo-hist-a .mo-hist-bub p:last-child{margin-bottom:0;}',
    '.mo-hist-a .mo-hist-bub ul{margin:5px 0;padding-left:17px;}',

    '.mo-actor[data-shake]{animation:mo-shake .26s ease;}',
    '.mo-actor[data-flash] .mo-surface{border-color:rgba(239,68,68,.6);}',

    '@keyframes mo-drift{from{transform:translateX(-14%);}to{transform:translateX(14%);}}',
    '@keyframes mo-shimmer{from{background-position:150% 0;}to{background-position:-100% 0;}}',
    '@keyframes mo-dot{0%,80%,100%{opacity:.25;}40%{opacity:1;}}',
    '@keyframes mo-wave{0%,100%{height:6px;}50%{height:22px;}}',
    '@keyframes mo-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}',
    '@keyframes mo-out{from{opacity:1;transform:translateX(-50%) translateY(0);}to{opacity:0;transform:translateX(-50%) translateY(-6px);}}',
    '@keyframes mo-shake{0%,100%{transform:translate(0,0);}25%{transform:translate(-4px,0);}75%{transform:translate(4px,0);}}',
    '@media (prefers-reduced-motion: reduce){.mo-aurora i,.mo-lab-t{animation:none;}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('applio-ai-style')) return;
    var s = document.createElement('style'); s.id = 'applio-ai-style'; s.textContent = STYLE; document.head.appendChild(s);
  }

  /* ───────── geometry / math / easing ───────── */
  var PILL_H = 138, ORB_D = 132, ORB_R = 66, CANVAS = 220, CARD_H = 184;
  var inputW = function () { return Math.max(300, Math.min(540, window.innerWidth - 48)); };
  var cardW = function () { return Math.max(290, Math.min(420, window.innerWidth - 48)); };

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var fmt = function (v) { return String(Math.round(v * 1e4) / 1e4); };
  var TAU = Math.PI * 2;

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function cubicBezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var sx = function (t) { return ((ax * t + bx) * t + cx) * t; };
    var sy = function (t) { return ((ay * t + by) * t + cy) * t; };
    var dx = function (t) { return (3 * ax * t + 2 * bx) * t + cx; };
    var solve = function (x) { var t = x, i, e, d; for (i = 0; i < 8; i++) { e = sx(t) - x; if (Math.abs(e) < 1e-6) return t; d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      var lo = 0, hi = 1; t = x; for (i = 0; i < 40; i++) { e = sx(t); if (Math.abs(e - x) < 1e-6) break; if (x > e) lo = t; else hi = t; t = (hi - lo) / 2 + lo; } return t; };
    return function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)); };
  }
  var E = { out: cubicBezier(0.22, 1, 0.36, 1), io: cubicBezier(0.65, 0, 0.35, 1), in: cubicBezier(0.4, 0, 1, 1),
    grow: cubicBezier(0.3, 0, 0.2, 1), vortex: cubicBezier(0.6, 0, 0.2, 1), spring: cubicBezier(0.34, 1.4, 0.64, 1),
    card: cubicBezier(0.65, 0, 0.2, 1), lin: function (t) { return t; } };

  /* ───────── dotted orb ───────── */
  var RINGS = 16;
  var DOT = (function () { var rand = mulberry32(7), out = [], k, j;
    for (k = 0; k < RINGS; k++) { var y = 1 - ((k + 0.5) / RINGS) * 2, r = Math.sqrt(1 - y * y), m = Math.max(4, Math.round(30 * r));
      for (j = 0; j < m; j++) { var a = (j / m) * TAU + k * 0.35; out.push({ x: Math.cos(a) * r, y: y, z: Math.sin(a) * r, u: (1 - y) / 2, seed: rand() * 6.283 }); } }
    return out; })();
  var N = DOT.length;
  var DX = Float32Array.from(DOT, function (d) { return d.x; }), DY = Float32Array.from(DOT, function (d) { return d.y; }),
      DZ = Float32Array.from(DOT, function (d) { return d.z; }), DU = Float32Array.from(DOT, function (d) { return d.u; }),
      DS = Float32Array.from(DOT, function (d) { return d.seed; });
  var G_STEPS = 24, A_STEPS = 48;
  var COLORS = (function () { var out = [], gi, ai; for (gi = 0; gi <= G_STEPS; gi++) { var g = gi / G_STEPS;
    var r = Math.round(lerp(230, 109, g)), gg = Math.round(lerp(230, 77, g)), b = Math.round(lerp(236, 252, g));
    for (ai = 0; ai <= A_STEPS; ai++) out.push('rgba(' + r + ',' + gg + ',' + b + ',' + (ai / A_STEPS).toFixed(3) + ')'); } return out; })();
  var ORB_KEYS = ['k', 'alpha', 'spin', 'sweep', 'pop', 'vortex', 'gain', 'floor', 'rad'];

  function createOrb(canvas, getSpeed, isReduced) {
    var P = { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 };
    var ctx = canvas.getContext('2d');
    var lit = new Float32Array(N);
    var SX = new Float32Array(N), SY = new Float32Array(N), SR = new Float32Array(N), SD = new Float32Array(N), SC = new Int16Array(N);
    var pw = [1, 0, 0, 0], time = 0, raf = 0, last = 0, dead = false;
    var reset = function () { P.k = 0; P.alpha = 0; P.spin = 0; P.rot = 0; P.sweep = 0; P.pop = 1; P.vortex = 0; P.gain = 1; P.floor = 0; P.rad = 0; P.prog = 0;
      lit.fill(0); pw[0] = 1; pw[1] = 0; pw[2] = 0; pw[3] = 0; time = isReduced() ? 1.2 : 0; };
    reset();
    if (!ctx) return { P: P, ensure: function () {}, reset: reset, destroy: function () {} };
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(CANVAS * dpr); canvas.height = Math.round(CANVAS * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var CP = Math.cos(0.35), SP = Math.sin(0.35), C0 = CANVAS / 2, S = 0.6;
    var draw = function (dt) {
      ctx.clearRect(0, 0, CANVAS, CANVAS); time += dt; P.rot += P.spin * dt;
      var yaw = P.rot + P.vortex, cyw = Math.cos(yaw), syw = Math.sin(yaw), stepW = dt / 0.35, q;
      for (q = 0; q < 4; q++) { var d = (q === P.prog ? 1 : 0) - pw[q]; pw[q] += Math.abs(d) <= stepW ? d : (d > 0 ? stepW : -stepW); }
      var decay = Math.exp(-dt / 0.5), h0 = (time * 300) % N, h3 = (time * 480) % N;
      var a1 = time * 0.8, b1 = Math.sin(time * 0.5) * 0.9;
      var f1x = Math.cos(b1) * Math.cos(a1), f1y = Math.sin(b1), f1z = Math.cos(b1) * Math.sin(a1);
      var a2 = time * 0.55 + 2.1, b2 = Math.cos(time * 0.42) * 0.9;
      var f2x = Math.cos(b2) * Math.cos(a2), f2y = Math.sin(b2), f2z = Math.cos(b2) * Math.sin(a2);
      var lat = Math.sin(time * 2.2), swirlK = P.vortex * 1.5, n;
      for (n = 0; n < N; n++) {
        var dx = DX[n], dy = DY[n], dz = DZ[n], u = DU[n], pulse = 0;
        if (pw[0] > 0.001) { var dd = Math.abs(n - h0); if (dd > N - dd) dd = N - dd; var v = Math.max(0, 1 - dd / 16); pulse = Math.max(pulse, v * v * pw[0]); }
        if (pw[1] > 0.001) { var v1 = Math.max(0, (dx * f1x + dy * f1y + dz * f1z - 0.72) / 0.28), v2 = Math.max(0, (dx * f2x + dy * f2y + dz * f2z - 0.72) / 0.28); var vv = Math.max(v1, v2); pulse = Math.max(pulse, vv * vv * pw[1]); }
        if (pw[2] > 0.001) { var e2 = dy - lat, v3 = Math.max(0, 1 - (e2 * e2) / 0.02); pulse = Math.max(pulse, v3 * v3 * pw[2]); }
        if (pw[3] > 0.001) { var dd3 = Math.abs(n - h3); if (dd3 > N - dd3) dd3 = N - dd3; var v4 = Math.max(0, 1 - dd3 / 22); pulse = Math.max(pulse, v4 * v4 * pw[3]); }
        var l = Math.max(lit[n] * decay, pulse * P.gain); lit[n] = l;
        var ki = clamp01(P.k * (1 + S) - S * u); if (ki <= 0.001) { SC[n] = -1; continue; }
        var eo = E.out(ki), kk = eo * P.pop;
        var x1 = dx * cyw + dz * syw, z1 = -dx * syw + dz * cyw, y2 = dy * CP - z1 * SP, z2 = dy * SP + z1 * CP;
        var f = 2.8 / (2.8 - z2), depth = (z2 + 1) / 2, ox = x1 * ORB_R * kk * f, oy = -y2 * ORB_R * kk * f;
        if (swirlK > 0.001) { var sw = (1 - ki) * swirlK, cc = Math.cos(sw), ss = Math.sin(sw), tx = ox * cc - oy * ss; oy = ox * ss + oy * cc; ox = tx; }
        var g = clamp01((P.sweep * 1.4 - u) / 0.4);
        var a = 0.1 + 0.035 * Math.sin(DS[n] + time * 1.6) * (1 - g) + 0.32 * depth * depth + 0.75 * l * (1 - g) + g * (0.55 + 0.4 * depth) + 2 * g * (1 - g);
        a = Math.max(a, P.floor * (0.7 + 0.3 * depth)); if (a > 1) a = 1; a *= eo * P.alpha;
        SX[n] = C0 + ox; SY[n] = C0 + oy; SD[n] = depth;
        SR[n] = (1.15 * (0.45 + 0.75 * depth) * f + 0.9 * l + g * 0.25) * (1 + P.rad) * (0.4 + 0.6 * eo);
        var ai = Math.round(a * A_STEPS), gi = Math.round(g * G_STEPS);
        SC[n] = ai <= 0 ? -1 : gi * (A_STEPS + 1) + ai;
      }
      var pass, nn;
      for (pass = 0; pass < 2; pass++) { for (nn = 0; nn < N; nn++) { var c = SC[nn]; if (c < 0) continue; if ((SD[nn] >= 0.5) !== (pass === 1)) continue;
        ctx.fillStyle = COLORS[c]; ctx.beginPath(); ctx.arc(SX[nn], SY[nn], SR[nn], 0, TAU); ctx.fill(); } }
    };
    var frame = function (now) { raf = 0; if (dead) return;
      var dt = isReduced() ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000)) * getSpeed(); last = now; draw(dt);
      if (P.alpha > 0.002) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, CANVAS, CANVAS); };
    var ensure = function () { if (raf || dead || P.alpha <= 0.002) return; last = performance.now(); raf = requestAnimationFrame(frame); };
    var destroy = function () { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; };
    return { P: P, ensure: ensure, reset: reset, destroy: destroy };
  }

  /* ───────── timeline tracks ───────── */
  function Tk(ch, from, to, t0, t1, ease) { return { ch: ch, from: from, to: to, t0: t0, t1: t1, ease: ease || E.io }; }
  function assembleTracks(g) { return [
    Tk('oInput', 1, 0, 0, 180, E.in), Tk('inScale', 1, 0.8, 0, 180, E.in),
    Tk('oAur', 1, 0, 0, 220, E.out), Tk('oPill', 1, 0, 120, 360, E.out), Tk('oRing', 1, 0, 80, 360, E.out),
    Tk('w', g.inW, ORB_D, 0, 460, E.io), Tk('h', PILL_H, ORB_D, 0, 460, E.io), Tk('r', 22, ORB_D / 2, 0, 460, E.io),
    Tk('oBall', 0, 1, 120, 300, E.out), Tk('oBall', 1, 0, 300, 520, E.out),
    Tk('orb.k', 0, 1, 160, 900, E.out), Tk('orb.alpha', 0, 1, 160, 900, E.out),
    Tk('orb.spin', 0, 0.9, 160, 900, E.out), Tk('orb.pop', 1, 1.05, 160, 520, E.out), Tk('orb.pop', 1.05, 1, 520, 900, E.io),
    Tk('sOp', 0, 1, 360, 680, E.out), Tk('sTy', 6, 0, 360, 680, E.out) ]; }
  var RESOLVE = [
    Tk('orb.sweep', 0, 1, 0, 700, E.io), Tk('orb.spin', 0.9, 0.3, 0, 700, E.out), Tk('orb.gain', 1, 0, 0, 700, E.out),
    Tk('orb.floor', 0, 0.95, 400, 900, E.out), Tk('orb.rad', 0, 0.15, 400, 900, E.out),
    Tk('orb.pop', 1, 1.04, 600, 800, E.out), Tk('orb.pop', 1.04, 1, 800, 900, E.out) ];
  var CONDENSE = [
    Tk('orb.pop', 1, 1.06, 0, 120, E.out), Tk('sOp', 1, 0, 0, 160, E.in), Tk('sTy', 0, -6, 0, 160, E.in),
    Tk('orb.k', 1, 0, 120, 640, E.vortex), Tk('orb.vortex', 0, 1.6, 120, 640, E.vortex),
    Tk('oGreen', 0, 1, 260, 700, E.spring), Tk('gs', 0.55, 1, 260, 700, E.spring),
    Tk('pulse', 0, 1, 320, 760, E.out), Tk('oHalo', 0, 0.35, 380, 700, E.out), Tk('orb.alpha', 1, 0, 500, 800, E.out) ];
  function unfoldTracks(g, tw) { return [
    Tk('w', ORB_D, 124, 0, 90, E.in), Tk('h', ORB_D, 124, 0, 90, E.in),
    Tk('w', 124, g.cw, 90, 700, E.card), Tk('h', 124, CARD_H, 90, 700, E.out), Tk('r', ORB_D / 2, 18, 90, 700, E.io),
    Tk('oGreen', 1, 0, 200, 560, E.out), Tk('oCard', 0, 1, 200, 560, E.out), Tk('oHalo', 0.35, 0, 300, 700, E.out),
    Tk('hOp', 0, 1, 520, 840, E.out), Tk('dotS', 0, 1, 520, 840, E.spring), Tk('wp', 0, 1, 600, 600 + tw, E.lin) ]; }
  var FADE = ['oGlow', 'oAur', 'oPill', 'oBall', 'oGreen', 'oCard', 'oRing', 'oInput', 'oHalo', 'sOp', 'orb.alpha'];
  var INIT = { h: PILL_H, r: 22, oGlow: 1, oHalo: 0, oPill: 1, oBall: 0, oGreen: 0, oCard: 0, oRing: 1, oInput: 1, inScale: 1, oAur: 1,
    gs: 0.55, cs: 1, hOp: 0, dotS: 0, sOp: 0, sTy: 6, pulse: -1,
    'orb.k': 0, 'orb.alpha': 0, 'orb.spin': 0, 'orb.pop': 1, 'orb.sweep': 0, 'orb.vortex': 0, 'orb.gain': 1, 'orb.floor': 0, 'orb.rad': 0 };

  var ABORT = {};
  function sleep(ms, sig) { return new Promise(function (res) { if (sig.aborted) return res();
    var id = setTimeout(function () { sig.removeEventListener('abort', onA); res(); }, Math.max(0, ms));
    function onA() { clearTimeout(id); res(); } sig.addEventListener('abort', onA, { once: true }); }); }
  function abortable(p, sig) { return new Promise(function (res) { if (sig.aborted) return res(undefined);
    function onA() { res(undefined); } sig.addEventListener('abort', onA, { once: true });
    p.then(function (v) { sig.removeEventListener('abort', onA); res(v); }, function () { sig.removeEventListener('abort', onA); res(undefined); }); }); }

  /* ───────── light markdown (bold, bullets, paragraphs) ───────── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mdWords(text) {
    // Word spans for the staggered reveal (bold preserved per-word).
    var toks = esc(text).replace(/\*\*(.+?)\*\*/g, '\u0001$1\u0002').split(/(\s+)/);
    return toks.map(function (t) { if (/^\s+$/.test(t) || t === '') return t;
      var b = t.indexOf('\u0001') > -1; t = t.replace(/[\u0001\u0002]/g, '');
      return '<span class="mo-w">' + (b ? '<strong>' + t + '</strong>' : t) + '</span>'; }).join('');
  }
  function mdFull(text) {
    var lines = esc(text).split('\n'), html = '', inUl = false;
    var closeUl = function () { if (inUl) { html += '</ul>'; inUl = false; } };
    lines.forEach(function (raw) { var line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      var m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (m) { if (!inUl) { html += '<ul>'; inUl = true; } html += '<li>' + m[1] + '</li>'; }
      else if (line.trim() === '') { closeUl(); } else { closeUl(); html += '<p>' + line + '</p>'; } });
    closeUl(); return html || '<p></p>';
  }

  /* ───────── mount ───────── */
  function mount(root, opts) {
    opts = opts || {};
    injectStyle();
    var onSubmit = opts.onSubmit || function () { return 'The answer goes here.'; };
    var minThink = opts.minThinkMs || 2600;
    var placeholder = opts.placeholder || 'Ask anything…';

    root.innerHTML =
      '<div class="mo-root" data-phase="idle">' +
        '<div class="mo-bg"></div><div class="mo-halo"></div>' +
        '<div class="mo-history" hidden></div>' +
        '<div class="mo-mover">' +
          '<div class="mo-actor">' +
            '<div class="mo-underglow"></div><div class="mo-halo-green"></div>' +
            '<div class="mo-surface"><div class="mo-aurora"><i></i><i></i><i></i><i></i></div></div>' +
            '<div class="mo-ball"></div><div class="mo-green"></div><div class="mo-card"></div><div class="mo-ring"></div>' +
            '<form class="mo-input" autocomplete="off">' +
              '<div class="aip-top">' + markHTML(28) +
                '<textarea class="mo-field" rows="1" maxlength="600" placeholder="' + esc(placeholder) + '" spellcheck="false" aria-label="Ask Applio AI"></textarea>' +
              '</div>' +
              '<div class="aip-wave"></div>' +
              '<div class="aip-toolbar">' +
                '<div class="aip-tools-left">' +
                  '<button type="button" class="aip-pill" data-steer="tailor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l2 2 4-4"/></svg><span>Tailor</span></button>' +
                  '<div class="aip-divider"></div>' +
                  '<button type="button" class="aip-pill" data-steer="interview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/></svg><span>Interview</span></button>' +
                  '<div class="aip-divider"></div>' +
                  '<button type="button" class="aip-pill" data-steer="rewrite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>Rewrite</span></button>' +
                '</div>' +
                '<button type="submit" class="mo-send" aria-label="Send"></button>' +
              '</div>' +
            '</form>' +
            '<canvas class="mo-orb"></canvas><div class="mo-pulse"></div>' +
            '<div class="mo-answer" tabindex="-1" role="group" aria-label="Answer">' +
              '<div class="mo-a-head">' + markHTML(26) + '<span>Applio AI</span></div>' +
              '<p class="mo-a-body"></p>' +
            '</div>' +
          '</div>' +
          '<div class="mo-ask"></div>' +
          '<div class="mo-status"></div>' +
          '<button type="button" class="mo-reset">New question</button>' +
          '<div class="mo-live" role="status" aria-live="polite"></div>' +
        '</div>' +
      '</div>';

    var q = function (sel) { return root.querySelector(sel); };
    var moRoot = q('.mo-root'), actor = q('.mo-actor'), form = q('.mo-input'), field = q('.mo-field'),
        canvas = q('.mo-orb'), pulse = q('.mo-pulse'), status = q('.mo-status'), answer = q('.mo-answer'),
        body = q('.mo-a-body'), live = q('.mo-live'), reset = q('.mo-reset'), sendBtn = q('.mo-send'),
        wave = q('.aip-wave'), ask = q('.mo-ask'), histEl = q('.mo-history');

    (function () { var h = ''; for (var i = 0; i < 28; i++) h += '<span style="animation-delay:' + (i * 0.045).toFixed(2) + 's"></span>'; wave.innerHTML = h; })();

    var reduced = (function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
    var speed = 1, phase = 'idle', recording = false, lastQ = '';
    var history = [];                     // [{role, content}]
    var labelState = { cur: COPY.labels[0], prev: null };

    function renderStatus() {
      function inner(name) { return name === COPY.done ? '<span class="mo-lab-done">' + esc(name) + '</span>'
        : '<span class="mo-lab-t">' + esc(name) + '</span><span class="mo-dots"><i></i><i></i><i></i></span>'; }
      var h = ''; if (labelState.prev !== null) h += '<span class="mo-lab mo-out">' + inner(labelState.prev) + '</span>';
      h += '<span class="mo-lab mo-in">' + inner(labelState.cur) + '</span>'; status.innerHTML = h;
    }
    renderStatus();

    function setAnswer(s) { body.innerHTML = mdWords(s); }

    var IC = {
      mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
      send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></svg>',
      stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'
    };
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, recog = null;
    function refreshSend() {
      var ready = field.value.trim().length > 0;
      if (recording) { sendBtn.className = 'mo-send recording'; sendBtn.innerHTML = IC.stop; sendBtn.removeAttribute('data-ready'); }
      else if (ready) { sendBtn.className = 'mo-send'; sendBtn.setAttribute('data-ready', ''); sendBtn.innerHTML = IC.send; }
      else { sendBtn.className = 'mo-send'; sendBtn.removeAttribute('data-ready'); sendBtn.innerHTML = SR ? IC.mic : IC.send; }
    }

    /* steering pills */
    var STEER = { tailor: 'Tailor my resume for this: ', interview: 'Help me prep for an interview: ', rewrite: 'Rewrite this stronger: ' };
    var steer = null;
    function applySteer(t) { return steer && STEER[steer] ? STEER[steer] + t : t; }
    function clearSteer() { steer = null; root.querySelectorAll('.aip-pill.on').forEach(function (p) { p.classList.remove('on'); }); field.placeholder = placeholder; }
    root.querySelectorAll('.aip-pill').forEach(function (p) { p.addEventListener('click', function () {
      var was = p.classList.contains('on'); root.querySelectorAll('.aip-pill').forEach(function (o) { o.classList.remove('on'); });
      if (was) { steer = null; field.placeholder = placeholder; }
      else { p.classList.add('on'); steer = p.getAttribute('data-steer');
        var ph = { tailor: 'Paste a role, or ask me to tailor your resume…', interview: 'Ask for questions, or practice an answer…', rewrite: 'Paste a bullet or summary to rewrite…' };
        field.placeholder = ph[steer] || placeholder; field.focus(); } }); });

    /* voice dictation */
    function startRec() { if (!SR || recording) return; recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = navigator.language || 'en-US';
      var base = field.value ? field.value.replace(/\s+$/, '') + ' ' : '', finalT = '';
      recog.onresult = function (ev) { var interim = ''; for (var i = ev.resultIndex; i < ev.results.length; i++) { var t = ev.results[i][0].transcript; if (ev.results[i].isFinal) finalT += t + ' '; else interim += t; } field.value = base + finalT + interim; autosize(); };
      recog.onerror = function () { stopRec(); }; recog.onend = function () { if (recording) { try { recog.start(); } catch (e) { stopRec(); } } };
      try { recog.start(); } catch (e) { return; } recording = true; form.classList.add('rec'); refreshSend(); }
    function stopRec() { recording = false; try { recog && recog.stop(); } catch (e) {} recog = null; form.classList.remove('rec'); refreshSend(); field.focus(); }

    /* history panel (past Q&A above the stage) */
    function pushHistory(uq, ans) {
      var el = document.createElement('div');
      el.innerHTML = '<div class="mo-hist-q">' + esc(uq) + '</div>' +
        '<div class="mo-hist-a">' + markHTML(26) + '<div class="mo-hist-bub">' + mdFull(ans) + '</div></div>';
      while (el.firstChild) histEl.appendChild(el.firstChild);
      histEl.hidden = false;
    }

    /* ───── runtime (timeline-driven morph) ───── */
    var life = new AbortController();
    var geo = { inW: inputW(), cw: cardW() };
    var orb = createOrb(canvas, function () { return speed; }, function () { return reduced; });
    var vals = {}, dirty = {}, CH = {}, current = null, busy = false, idling = false, epoch = 0, wDur = 320, wStagger = 0;

    function childSig() { var ac = new AbortController(); if (life.signal.aborted) ac.abort(); else life.signal.addEventListener('abort', function () { ac.abort(); }, { once: true }); return ac; }

    var applyWords = function (v) { var nodes = body.querySelectorAll('.mo-w'); var total = (nodes.length - 1) * wStagger + wDur, time = v * total;
      nodes.forEach(function (el, i) { var p = E.out(clamp01((time - i * wStagger) / wDur)); el.style.opacity = fmt(p);
        el.style.transform = (p >= 0.999 || reduced) ? 'none' : 'translateY(' + fmt((1 - p) * 4) + 'px)';
        el.style.filter = (p >= 0.999 || reduced) ? 'none' : 'blur(' + fmt((1 - p) * 4) + 'px)'; }); };

    ['oGlow', 'oHalo', 'oPill', 'oBall', 'oGreen', 'oCard', 'oRing', 'oInput', 'oAur', 'gs', 'cs', 'hOp', 'dotS'].forEach(function (n) { CH[n] = function (v) { actor.style.setProperty('--' + n, fmt(v)); }; });
    ['w', 'h', 'r'].forEach(function (n) { CH[n] = function (v) { actor.style.setProperty('--' + n, fmt(v) + 'px'); }; });
    CH.inScale = function (v) { actor.style.setProperty('--inScale', fmt(v)); form.style.filter = v >= 0.999 ? 'none' : 'blur(' + fmt((1 - v) * 12) + 'px)'; };
    CH.sOp = function (v) { status.style.setProperty('--sOp', fmt(v)); };
    CH.sTy = function (v) { status.style.setProperty('--sTy', fmt(v) + 'px'); };
    CH.cHalo = function (v) { moRoot.style.setProperty('--oCenter', fmt(v)); };
    CH.pulse = function (v) { if (v < 0) { pulse.style.opacity = '0'; return; } pulse.style.opacity = fmt(0.5 * (1 - v)); pulse.style.transform = 'translate(-50%,-50%) scale(' + fmt(1 + v) + ')'; };
    CH.wp = applyWords;
    ORB_KEYS.forEach(function (name) { CH['orb.' + name] = function (v) { orb.P[name] = v; if (name === 'alpha') orb.ensure(); }; });

    var set = function (ch, v) { vals[ch] = v; dirty[ch] = 1; };
    var flush = function () { for (var ch in dirty) { if (CH[ch]) CH[ch](vals[ch]); } dirty = {}; };
    var setNow = function (ch, v) { vals[ch] = v; if (CH[ch]) CH[ch](v); };
    var resetChannels = function () { setNow('w', geo.inW); for (var ch in INIT) setNow(ch, INIT[ch]); setNow('cHalo', 0); };

    var play = function (tracks, sig) { return new Promise(function (res) { if (sig.aborted) return res();
      var end = tracks.reduce(function (m, k) { return Math.max(m, k.t1); }, 0), done = [], raf = 0, t = 0, last = performance.now();
      function onAbort() { cancelAnimationFrame(raf); res(); }
      function finish() { sig.removeEventListener('abort', onAbort); res(); }
      function stepf(now) { var dt = Math.max(0, Math.min(100, now - last)); last = now; t += dt * speed;
        for (var i = 0; i < tracks.length; i++) { var k = tracks[i]; if (done[i] || t < k.t0) continue;
          var p = Math.min(1, (t - k.t0) / Math.max(1, k.t1 - k.t0)); set(k.ch, k.from + (k.to - k.from) * (k.ease || E.io)(p)); if (p === 1) done[i] = 1; }
        flush(); if (t >= end) finish(); else raf = requestAnimationFrame(stepf); }
      sig.addEventListener('abort', onAbort, { once: true }); raf = requestAnimationFrame(stepf); }); };

    var progTimer = 0;
    function labelLoop(sig) { var i = 0; (function loop() { sleep(1150 / speed, sig).then(function () {
      if (sig.aborted) return; i = (i + 1) % COPY.labels.length; orb.P.prog = i % 4;
      if (labelState.cur !== COPY.labels[i]) { labelState = { cur: COPY.labels[i], prev: labelState.cur }; renderStatus(); } loop(); }); })(); }

    function setPhase(p) { phase = p; moRoot.setAttribute('data-phase', p);
      if (p === 'answered') { actor.setAttribute('data-answered', '');
        answer.scrollTop = 0; var maxH = Math.round((window.innerHeight || 700) * 0.52);
        actor.style.setProperty('--h', Math.max(132, Math.min(answer.scrollHeight, maxH)) + 'px'); }
      else actor.removeAttribute('data-answered'); }

    function run(text, sig) {
      var go = function (tracks) { return play(tracks, sig).then(function () { if (sig.aborted) throw ABORT; }); };
      Promise.resolve().then(function () { setPhase('launch'); setNow('cHalo', 1); return go(assembleTracks(geo)); })
        .then(function () {
          setNow('r', ORB_D / 2); setPhase('think'); labelState = { cur: COPY.labels[0], prev: null }; renderStatus();
          live.textContent = 'Thinking'; labelLoop(sig);
          var t0 = performance.now();
          var pending = Promise.resolve().then(function () { return onSubmit(text, history.slice()); })
            .then(function (b) { return (typeof b === 'string' && b.trim()) ? b : 'Sorry, I could not generate a response. Please try again.'; },
                  function () { return 'The AI is busy right now, give it a few seconds and try again.'; });
          return abortable(pending, sig).then(function (got) { if (sig.aborted) throw ABORT;
            var ansText = got || 'Sorry, I could not generate a response. Please try again.';
            return sleep(minThink / speed - (performance.now() - t0), sig).then(function () { if (sig.aborted) throw ABORT; return ansText; }); });
        })
        .then(function (ansText) {
          clearInterval(progTimer);
          var words = ansText.split(/\s+/).filter(Boolean), n = Math.max(1, words.length);
          setPhase('resolve'); labelState = { cur: COPY.done, prev: labelState.cur }; renderStatus();
          return go(RESOLVE).then(function () { setPhase('condense'); return go(CONDENSE); })
            .then(function () { setPhase('unfold'); wDur = 320; wStagger = n > 1 ? Math.min(45, 280 / (n - 1)) : 0;
              ask.innerHTML = '<b>You asked:</b> ' + esc(lastQ); setAnswer(ansText);
              return go(unfoldTracks(geo, (n - 1) * wStagger + wDur)); })
            .then(function () { setPhase('answered'); live.textContent = 'Answer ready.';
              try { answer.focus({ preventScroll: true }); } catch (e) {}
              history.push({ role: 'user', content: lastQ }); history.push({ role: 'assistant', content: ansText });
              current = null; busy = false; form.removeAttribute('inert'); pendingAnswer = ansText; });
        })
        .catch(function (e) { if (e === ABORT) return; busy = false; form.removeAttribute('inert'); hardReset(); });
    }

    var pendingAnswer = '';
    function toIdle(kind) {
      if (idling) return; idling = true; var my = ++epoch; var ac = childSig(), sig = ac.signal;
      var outMs = 240, inMs = 420; setPhase('reset');
      // move the just-answered exchange into history before clearing
      if (kind === 'reset' && pendingAnswer) { pushHistory(lastQ, pendingAnswer); pendingAnswer = ''; }
      var out = [Tk('cHalo', vals.cHalo || 0, 0, 0, outMs, E.out)];
      FADE.forEach(function (ch) { var v = vals[ch] || 0; if (v > 0.001) out.push(Tk(ch, v, 0, 0, outMs, E.out)); });
      play(out, sig).then(function () { if (sig.aborted || my !== epoch) return;
        setNow('pulse', -1); setAnswer(''); ask.innerHTML = ''; labelState = { cur: COPY.labels[0], prev: null }; renderStatus();
        field.value = ''; autosize(); refreshSend(); orb.reset(); geo.inW = inputW(); geo.cw = cardW(); resetChannels();
        var pillCh = ['oPill', 'oInput', 'oGlow', 'oAur', 'oRing']; pillCh.forEach(function (ch) { setNow(ch, 0); });
        var inn = pillCh.map(function (ch) { return Tk(ch, 0, 1, 0, inMs, E.out); });
        return play(inn, sig).then(function () { if (sig.aborted || my !== epoch) return;
          resetChannels(); current = null; busy = false; idling = false; setPhase('idle'); try { field.focus({ preventScroll: true }); } catch (e) {} }); });
    }
    function hardReset() { epoch++; if (current) current.abort(); current = null; orb.reset();
      setAnswer(''); ask.innerHTML = ''; labelState = { cur: COPY.labels[0], prev: null }; renderStatus();
      geo.inW = inputW(); geo.cw = cardW(); resetChannels(); setNow('pulse', -1);
      busy = false; idling = false; setPhase('idle'); try { field.focus({ preventScroll: true }); } catch (e) {} }

    resetChannels();

    function autosize() { field.style.height = 'auto'; field.style.height = Math.min(field.scrollHeight, 120) + 'px'; }
    function submit() {
      if (busy || phase !== 'idle') return; var text = field.value.trim();
      if (!text) { actor.removeAttribute('data-shake'); void actor.offsetWidth; actor.setAttribute('data-shake', ''); actor.setAttribute('data-flash', '');
        setTimeout(function () { actor.removeAttribute('data-shake'); actor.removeAttribute('data-flash'); }, 260); return; }
      lastQ = text; var payload = applySteer(text);
      field.value = ''; autosize(); clearSteer(); refreshSend();
      if (recording) stopRec();
      busy = true; form.setAttribute('inert', ''); geo.inW = inputW(); geo.cw = cardW();
      var ac = childSig(); current = ac; run(payload, ac.signal);
    }

    field.addEventListener('input', function () { autosize(); refreshSend(); });
    field.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    form.addEventListener('submit', function (e) { e.preventDefault();
      if (recording) { stopRec(); return; }
      if (field.value.trim()) submit(); else if (SR) startRec(); });
    reset.addEventListener('click', function () { if (phase === 'answered') toIdle('reset'); });
    root._moKey = function (e) { if (e.key === 'Escape' && phase !== 'idle' && phase !== 'reset' && busy) { e.preventDefault(); if (current) current.abort(); toIdle('esc'); } };
    window.addEventListener('keydown', root._moKey);
    root._moResize = function () { if (phase === 'idle' && !busy) { geo.inW = inputW(); setNow('w', geo.inW); } };
    window.addEventListener('resize', root._moResize);

    autosize(); refreshSend(); try { field.focus({ preventScroll: true }); } catch (e) {}

    return {
      focus: function () { try { field.focus(); } catch (e) {} },
      clearHistory: function () { history = []; histEl.innerHTML = ''; histEl.hidden = true; },
      destroy: function () { life.abort(); orb.destroy(); clearInterval(progTimer);
        window.removeEventListener('keydown', root._moKey); window.removeEventListener('resize', root._moResize); }
    };
  }

  window.ApplioAI = { mount: mount, markHTML: markHTML };
})();
