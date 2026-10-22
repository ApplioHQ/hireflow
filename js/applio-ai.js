/* Applio AI — the moving "thinking" orb + the Applio logo mark.
   A self-contained Canvas 2D sphere of dots that charge from grey to Applio violet
   while the AI thinks, then sweep + condense when the answer lands. Vanilla, no deps.

     var orb = ApplioAI.thinkingOrb(canvasEl, { size: 132 });
     orb.think(function (phaseIndex) { ... });   // assemble + spin + cycle phases
     orb.resolve(function () { ... });            // sweep + condense + fade, then cb
     orb.stop();  orb.destroy();

   ApplioAI.markHTML(px) returns the real Applio logo as a rounded tile. */
(function () {
  'use strict';

  /* ───────── the real Applio logo mark ───────── */
  var LOGO = 'logo.jpeg';
  function setLogo(src) { if (src) LOGO = src; }
  function markHTML(px) { px = px || 34; return '<img class="applio-mark" src="' + LOGO + '" alt="Applio" style="width:' + px + 'px;height:' + px + 'px;">'; }
  (function injectMarkStyle() {
    if (document.getElementById('applio-mark-style')) return;
    var s = document.createElement('style'); s.id = 'applio-mark-style';
    s.textContent = '.applio-mark{display:block;border-radius:28%;object-fit:cover;flex:0 0 auto;box-shadow:0 4px 14px rgba(0,0,0,.35);}';
    (document.head || document.documentElement).appendChild(s);
  })();

  /* ───────── math + easing ───────── */
  var TAU = Math.PI * 2;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function cubicBezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var sx = function (t) { return ((ax * t + bx) * t + cx) * t; };
    var sy = function (t) { return ((ay * t + by) * t + cy) * t; };
    var dx = function (t) { return (3 * ax * t + 2 * bx) * t + cx; };
    return function (x) { if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x, i, e, d; for (i = 0; i < 8; i++) { e = sx(t) - x; if (Math.abs(e) < 1e-6) break; d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      return sy(t); };
  }
  var EOUT = cubicBezier(0.22, 1, 0.36, 1), EIO = cubicBezier(0.65, 0, 0.35, 1);

  /* ───────── dot cloud (computed once) ───────── */
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
  // light-grey (unlit) -> Applio violet #6d4dfc (109,77,252) as a dot charges.
  var COLORS = (function () { var out = [], gi, ai; for (gi = 0; gi <= G_STEPS; gi++) { var g = gi / G_STEPS;
    var r = Math.round(lerp(230, 109, g)), gg = Math.round(lerp(230, 77, g)), b = Math.round(lerp(236, 252, g));
    for (ai = 0; ai <= A_STEPS; ai++) out.push('rgba(' + r + ',' + gg + ',' + b + ',' + (ai / A_STEPS).toFixed(3) + ')'); } return out; })();

  function createOrb(canvas, size, getSpeed, isReduced) {
    var ORB_R = size * 0.42, C0 = size / 2;
    var ctx = canvas.getContext('2d');
    var P = { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 };
    var lit = new Float32Array(N);
    var SX = new Float32Array(N), SY = new Float32Array(N), SR = new Float32Array(N), SD = new Float32Array(N), SC = new Int16Array(N);
    var pw = [1, 0, 0, 0], time = 0, raf = 0, last = 0, dead = false;
    var reset = function () { P.k = 0; P.alpha = 0; P.spin = 0; P.rot = 0; P.sweep = 0; P.pop = 1; P.vortex = 0; P.gain = 1; P.floor = 0; P.rad = 0; P.prog = 0;
      lit.fill(0); pw[0] = 1; pw[1] = 0; pw[2] = 0; pw[3] = 0; time = isReduced() ? 1.2 : 0; };
    reset();
    if (!ctx) return { P: P, ensure: function () {}, reset: reset, destroy: function () {} };
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var CP = Math.cos(0.35), SP = Math.sin(0.35), S = 0.6;
    var draw = function (dt) {
      ctx.clearRect(0, 0, size, size); time += dt; P.rot += P.spin * dt;
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
        var eo = EOUT(ki), kk = eo * P.pop;
        var x1 = dx * cyw + dz * syw, z1 = -dx * syw + dz * cyw, y2 = dy * CP - z1 * SP, z2 = dy * SP + z1 * CP;
        var f = 2.8 / (2.8 - z2), depth = (z2 + 1) / 2, ox = x1 * ORB_R * kk * f, oy = -y2 * ORB_R * kk * f;
        if (swirlK > 0.001) { var sw = (1 - ki) * swirlK, cc = Math.cos(sw), ss = Math.sin(sw), tx = ox * cc - oy * ss; oy = ox * ss + oy * cc; ox = tx; }
        var g = clamp01((P.sweep * 1.4 - u) / 0.4);
        var a = 0.1 + 0.035 * Math.sin(DS[n] + time * 1.6) * (1 - g) + 0.32 * depth * depth + 0.75 * l * (1 - g) + g * (0.55 + 0.4 * depth) + 2 * g * (1 - g);
        a = Math.max(a, P.floor * (0.7 + 0.3 * depth)); if (a > 1) a = 1; a *= eo * P.alpha;
        SX[n] = C0 + ox; SY[n] = C0 + oy; SD[n] = depth;
        SR[n] = (0.95 * (0.45 + 0.75 * depth) * f + 0.8 * l + g * 0.2) * (1 + P.rad) * (0.4 + 0.6 * eo);
        var ai = Math.round(a * A_STEPS), gi = Math.round(g * G_STEPS);
        SC[n] = ai <= 0 ? -1 : gi * (A_STEPS + 1) + ai;
      }
      var pass, nn;
      for (pass = 0; pass < 2; pass++) { for (nn = 0; nn < N; nn++) { var c = SC[nn]; if (c < 0) continue; if ((SD[nn] >= 0.5) !== (pass === 1)) continue;
        ctx.fillStyle = COLORS[c]; ctx.beginPath(); ctx.arc(SX[nn], SY[nn], SR[nn], 0, TAU); ctx.fill(); } }
    };
    var tweens = [];
    var runTweens = function (now) { for (var i = tweens.length - 1; i >= 0; i--) { var tw = tweens[i];
      var p = Math.min(1, (now - tw.t0) / tw.dur), e = (tw.ease || EIO)(p); P[tw.key] = tw.from + (tw.to - tw.from) * e;
      if (p >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); } } };
    var frame = function (now) { raf = 0; if (dead) return;
      var dt = isReduced() ? 0.016 : Math.max(0, Math.min(0.05, (now - last) / 1000)) * getSpeed(); last = now;
      runTweens(now); draw(dt);
      if (P.alpha > 0.002 || tweens.length) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, size, size); };
    var ensure = function () { if (raf || dead) return; last = performance.now(); raf = requestAnimationFrame(frame); };
    var tween = function (key, from, to, dur, ease, done) { tweens.push({ key: key, from: from, to: to, t0: performance.now(), dur: Math.max(1, dur), ease: ease, done: done }); ensure(); };
    var destroy = function () { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; tweens.length = 0; };
    return { P: P, reset: reset, ensure: ensure, tween: tween, destroy: destroy, clear: function () { if (ctx) ctx.clearRect(0, 0, size, size); } };
  }

  /* ───────── the thinking-orb runtime ───────── */
  function thinkingOrb(canvas, opts) {
    opts = opts || {};
    var size = opts.size || 132;
    var getSpeed = function () { return 1; };
    var isReduced = function () { return !!opts.reduced; };
    var orb = createOrb(canvas, size, getSpeed, isReduced);
    var P = orb.P, progTimer = 0;
    var EVORTEX = cubicBezier(0.6, 0, 0.2, 1);
    return {
      // Calm ambient sphere for the idle hero: assembled, violet, slow rotation,
      // gentle pulses. It just breathes, no "thinking" labels.
      idle: function () {
        P.sweep = 0; P.vortex = 0; P.gain = 1.1; P.floor = 0.15; P.pop = 1;
        orb.tween('alpha', P.alpha, 1, 600, EOUT);
        orb.tween('k', P.k, 1, isReduced() ? 1 : 950, EOUT);
        orb.tween('sweep', P.sweep, 0.78, isReduced() ? 1 : 950, EOUT);
        orb.tween('spin', P.spin, 0.2, 800, EOUT);
        orb.ensure();
        clearInterval(progTimer);
        if (isReduced()) return;
        var i = 0;
        progTimer = setInterval(function () { i = (i + 1) % 4; P.prog = i; }, 2400);
      },
      think: function (onPhase) {
        P.sweep = 0; P.vortex = 0; P.gain = 1.35; P.floor = 0.12; P.pop = 1;
        orb.tween('alpha', P.alpha, 1, 420, EOUT);
        orb.tween('k', P.k, 1, isReduced() ? 1 : 720, EOUT);
        orb.tween('sweep', P.sweep, 0.82, isReduced() ? 1 : 820, EOUT);   // charge grey -> vivid violet
        orb.tween('spin', P.spin, 0.55, 600, EOUT);
        orb.ensure();
        clearInterval(progTimer);
        if (isReduced()) return;
        var i = 0;
        progTimer = setInterval(function () { i = (i + 1) % 4; P.prog = i; if (onPhase) onPhase(i); }, 1150);
      },
      resolve: function (cb) {
        clearInterval(progTimer); progTimer = 0;
        if (isReduced()) { orb.tween('sweep', P.sweep, 1, 200, EIO); orb.tween('alpha', 1, 0, 280, EOUT, cb); orb.ensure(); return; }
        orb.tween('sweep', P.sweep, 1, 520, EIO);
        orb.tween('spin', P.spin, 0.2, 520, EOUT);
        orb.tween('floor', P.floor, 0.9, 300, EOUT);
        setTimeout(function () {
          orb.tween('k', P.k, 0, 460, EVORTEX);
          orb.tween('vortex', 0, 1.6, 460, EVORTEX);
          orb.tween('alpha', 1, 0, 520, EOUT, cb);
        }, 360);
      },
      stop: function () { clearInterval(progTimer); progTimer = 0; orb.reset(); orb.clear(); },
      destroy: function () { clearInterval(progTimer); orb.destroy(); }
    };
  }

  window.ApplioAI = { markHTML: markHTML, setLogo: setLogo, thinkingOrb: thinkingOrb };
})();
