/* Glass Folder Cards -- vanilla JS port
   Self-contained: no dependencies, no build step.
   Usage: GlassFolder.create(container, options) */

;(function () {
  'use strict';

  // ---- art presets ----
  var ART_PRESETS = {
    aurora: {
      style: 'streak',
      colors: ['#f4efe9','#e9c2b8','#c2433f','#2a1e2a','#22395e','#6f97c2','#e5edf4'],
      scale: 0.7, warp: 1.4, angle: -0.62, gloss: 0.18, veins: 0
    },
    ember: {
      style: 'marble',
      colors: ['#07090c','#16252c','#3d5f68','#1a1416','#a3201a','#ef4a2b','#ff8a5c'],
      scale: 0.62, warp: 3.2, angle: -0.5, gloss: 0.55, veins: 0.6
    },
    dusk: {
      style: 'marble',
      colors: ['#120c18','#3e2850','#8f6c9c','#2b1a24','#b3502f','#eab08a','#fbe7d2'],
      scale: 0.75, warp: 3.6, angle: 0.8, gloss: 0.5, veins: 0.5
    },
    glacier: {
      style: 'streak',
      colors: ['#f7f8fa','#d9e2ea','#9fb4c7','#e8edf2','#bccbd8','#ffffff'],
      scale: 0.7, warp: 1.6, angle: 0.35, gloss: 0.25, veins: 0
    },
    verdant: {
      style: 'marble',
      colors: ['#070b08','#173024','#4f7a5a','#141812','#a7843a','#e9cf87','#fbf3d6'],
      scale: 0.7, warp: 3.4, angle: 2.1, gloss: 0.5, veins: 0.5
    }
  };

  function hexToRgb(hex) {
    var h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0x808080;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function makeFbm(seed) {
    var r = rng(seed);
    var perm = new Uint8Array(512);
    var grad = new Float32Array(512);
    var p = [];
    for (var i = 0; i < 256; i++) p.push(i);
    for (var i = 255; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (var i = 0; i < 256; i++) {
      var a = r() * Math.PI * 2;
      grad[i * 2] = Math.cos(a);
      grad[i * 2 + 1] = Math.sin(a);
    }
    var noise = function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var X = xi & 255, Y = yi & 255;
      var h00 = perm[X + perm[Y]] * 2;
      var h10 = perm[X + 1 + perm[Y]] * 2;
      var h01 = perm[X + perm[Y + 1]] * 2;
      var h11 = perm[X + 1 + perm[Y + 1]] * 2;
      var d00 = grad[h00] * xf + grad[h00 + 1] * yf;
      var d10 = grad[h10] * (xf - 1) + grad[h10 + 1] * yf;
      var d01 = grad[h01] * xf + grad[h01 + 1] * (yf - 1);
      var d11 = grad[h11] * (xf - 1) + grad[h11 + 1] * (yf - 1);
      var u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
      var v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      return d00 + u * (d10 - d00) + v * (d01 - d00 + u * (d11 - d01 - d10 + d00));
    };
    return function (x, y, octaves) {
      var sum = 0, amp = 0.5;
      for (var i = 0; i < octaves; i++) {
        sum += amp * noise(x, y);
        var nx = 1.6 * x + 1.2 * y + 7.1;
        y = -1.2 * x + 1.6 * y + 3.3;
        x = nx;
        amp *= 0.5;
      }
      return sum;
    };
  }

  function createArtJob(width, height, recipe, seed) {
    var w = Math.max(1, Math.round(width));
    var h = Math.max(1, Math.round(height));
    var colors = recipe.colors.length >= 2 ? recipe.colors : ['#111111', '#eeeeee'];
    var stops = colors.map(function (c, i) { return { t: i / (colors.length - 1), c: hexToRgb(c) }; });
    var scale = recipe.scale || 0.7;
    var warp = recipe.warp || 3;
    var gloss = recipe.gloss || 0.4;
    var veins = recipe.veins || 0;
    var streak = recipe.style === 'streak';
    var fbm = makeFbm(seed * 977 + 13);
    var r = rng(seed + 1);
    var ox = r() * 50, oy = r() * 50;
    var angle = (recipe.angle || 0) + (r() - 0.5) * 0.5;
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var m = Math.min(w, h);
    var gw = Math.ceil(w / 2) + 3;
    var gh = Math.ceil(h / 2) + 3;
    var G = new Float32Array(gw * gh);
    var GQ = new Float32Array(gw * gh);
    var F = new Float32Array(w * h);
    var Q = new Float32Array(w * h);
    var pixels = new Uint8ClampedArray(w * h * 4);
    var row = 0;

    var field = function (gy) {
      for (var gx = 0; gx < gw; gx++) {
        var u = ((gx - 1) * 2 - w / 2) / m;
        var v = ((gy - 1) * 2 - h / 2) / m;
        var px = (u * ca - v * sa) * scale;
        var py = (u * sa + v * ca) * scale;
        if (streak) { px *= 0.14; py *= 2.2; }
        px += ox; py += oy;
        var qx = fbm(px, py, 3);
        var qy = fbm(px + 5.2, py + 1.3, 3);
        var rx = fbm(px + warp * qx + 1.7, py + warp * qy + 9.2, 3);
        var ry = fbm(px + warp * qx + 8.3, py + warp * qy + 2.8, 3);
        G[gy * gw + gx] = fbm(px + warp * rx, py + warp * ry, 4);
        GQ[gy * gw + gx] = Math.sqrt(qx * qx + qy * qy);
      }
    };

    var upsample = function () {
      var cr = function (a, b, c, d) { return (-a + 9 * b + 9 * c - d) / 16; };
      var T = new Float32Array(w * gh);
      for (var gy = 0; gy < gh; gy++) {
        var rr = gy * gw;
        for (var x = 0; x < w; x++) {
          var c = (x >> 1) + 1;
          T[gy * w + x] = x & 1 ? cr(G[rr + c - 1], G[rr + c], G[rr + c + 1], G[rr + c + 2]) : G[rr + c];
        }
      }
      for (var y = 0; y < h; y++) {
        var c = (y >> 1) + 1;
        for (var x = 0; x < w; x++) {
          F[y * w + x] = y & 1
            ? cr(T[(c - 1) * w + x], T[c * w + x], T[(c + 1) * w + x], T[(c + 2) * w + x])
            : T[c * w + x];
          var gx = (x >> 1) + 1;
          var q0 = GQ[c * gw + gx];
          var qx2 = x & 1 ? (q0 + GQ[c * gw + gx + 1]) / 2 : q0;
          var q1 = y & 1
            ? (x & 1 ? (GQ[(c + 1) * gw + gx] + GQ[(c + 1) * gw + gx + 1]) / 2 : GQ[(c + 1) * gw + gx])
            : qx2;
          Q[y * w + x] = (qx2 + q1) / 2;
        }
      }
    };

    var colorize = function () {
      var sample = [];
      var stride = Math.max(1, Math.floor(F.length / 4096));
      for (var i = 0; i < F.length; i += stride) sample.push(F[i]);
      sample.sort(function (a, b) { return a - b; });
      var lo = sample[Math.floor(sample.length * 0.02)];
      var hi = sample[Math.floor(sample.length * 0.98)];
      var k = 1 / (hi - lo || 1);
      var lx = -0.55, ly = -0.65, lz = 0.52;
      var slope = k * m * 0.012;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = y * w + x;
          var t = (F[i] - lo) * k;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var j = 1;
          while (j < stops.length - 1 && stops[j].t < t) j++;
          var a = stops[j - 1], b = stops[j];
          var f = (t - a.t) / (b.t - a.t || 1);
          f = f < 0 ? 0 : f > 1 ? 1 : f;
          f = f * f * (3 - 2 * f);
          var gx2 = (F[x < w - 1 ? i + 1 : i] - F[x > 0 ? i - 1 : i]) * slope;
          var gy2 = (F[y < h - 1 ? i + w : i] - F[y > 0 ? i - w : i]) * slope;
          var nd = (-gx2 * lx - gy2 * ly + lz) / Math.sqrt(gx2 * gx2 + gy2 * gy2 + 1);
          var spec = Math.pow(nd > 0 ? nd : 0, 24) * gloss * 255;
          var silk = 1 + 0.035 * Math.sin(t * 150 + Q[i] * 24);
          var vein = veins * Math.max(0, 1 - Math.abs(Q[i] - 0.42) * 14) * 0.6;
          var lit = (0.82 + 0.28 * nd) * silk * (1 - vein);
          pixels[i * 4] = (a.c[0] + (b.c[0] - a.c[0]) * f) * lit + spec;
          pixels[i * 4 + 1] = (a.c[1] + (b.c[1] - a.c[1]) * f) * lit + spec;
          pixels[i * 4 + 2] = (a.c[2] + (b.c[2] - a.c[2]) * f) * lit + spec;
          pixels[i * 4 + 3] = 255;
        }
      }
    };

    var step = function (rows) {
      if (row >= gh) return true;
      var end = Math.min(gh, row + Math.max(1, rows));
      while (row < end) field(row++);
      if (row < gh) return false;
      upsample();
      colorize();
      return true;
    };

    return { width: w, height: h, pixels: pixels, step: step };
  }

  // ---- shared paint queue ----
  var artCache = {};
  var queue = [];
  var pumping = false;

  function pump() {
    if (pumping) return;
    pumping = true;
    var tick = function () {
      var until = performance.now() + 7;
      while (queue.length && performance.now() < until) {
        var head = queue[0];
        if (head.job.step(4)) {
          queue.shift();
          var c = document.createElement('canvas');
          c.width = head.job.width;
          c.height = head.job.height;
          c.getContext('2d').putImageData(new ImageData(head.job.pixels, c.width, c.height), 0, 0);
          head.done(c);
        }
      }
      if (queue.length) requestAnimationFrame(tick);
      else pumping = false;
    };
    requestAnimationFrame(tick);
  }

  function paintArt(recipe, seed, w, h, priority, cb) {
    var key = JSON.stringify([recipe, seed, w, h]);
    if (artCache[key]) { artCache[key].then(cb); return; }
    var resolve;
    artCache[key] = new Promise(function (r) { resolve = r; });
    var at = queue.length;
    while (at > 1 && queue[at - 1].priority > priority) at--;
    queue.splice(at, 0, {
      job: createArtJob(w, h, recipe, seed),
      priority: priority,
      done: function (c) { resolve(c); cb(c); }
    });
    pump();
  }

  function recipeOf(art) {
    return typeof art === 'string' ? ART_PRESETS[art] : art;
  }

  function fanSlot(index, count) {
    return count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
  }

  // ---- geometry ----
  var W = 340, H = 272, HEADROOM = 54;
  var FRONT_TOP = 74, FRONT_H = H - FRONT_TOP;
  var SHEET_W = 272, SHEET_H = 184;
  var BACK_PATH = 'M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z';
  var FRONT_PATH = 'M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 ' + (FRONT_H - 22) + 'A22 22 0 0 1 318 ' + FRONT_H + 'L22 ' + FRONT_H + 'A22 22 0 0 1 0 ' + (FRONT_H - 22) + 'Z';
  var MAX_VISIBLE = 4;

  var cssInjected = false;

  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var style = document.createElement('style');
    style.textContent = GF_CSS;
    document.head.appendChild(style);
  }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.assign(e.style, attrs[k]);
      } else if (k.indexOf('data-') === 0 || k === 'role' || k === 'aria-label' || k === 'aria-expanded' || k === 'aria-haspopup' || k === 'aria-controls' || k === 'aria-hidden' || k === 'type' || k === 'tabindex' || k === 'id' || k === 'draggable') {
        e.setAttribute(k, attrs[k]);
      }
    });
    return e;
  }

  function paintCanvas(canvasEl, art, seed, w, h, density, priority) {
    var recipe = recipeOf(art);
    var pw = Math.round(w * density);
    var ph = Math.round(h * density);
    paintArt(recipe, seed, pw, ph, priority, function (src) {
      canvasEl.width = src.width;
      canvasEl.height = src.height;
      canvasEl.getContext('2d').drawImage(src, 0, 0);
      canvasEl.setAttribute('data-ready', '');
    });
  }

  var uid = 0;

  // ---- main create function ----
  window.GlassFolder = {
    PRESETS: ART_PRESETS,
    create: function (container, opts) {
      opts = opts || {};
      injectCSS();
      var id = 'gf' + (++uid);
      var label = opts.label || 'My Files';
      var tone = opts.tone || 'light';
      var art = opts.art !== undefined ? opts.art : 'aurora';
      var seed = opts.seed || 3;
      var image = opts.image;
      var initialFiles = opts.files || [
        { name: 'Cover - final', meta: 'PNG - 4.8 MB', art: 'ember' },
        { name: 'Moodboard', meta: '24 images', art: 'dusk' },
        { name: 'Brief.pdf', meta: 'PDF - 1.2 MB' }
      ];
      var action = opts.action !== undefined ? opts.action : 'add';
      var onAdd = opts.onAdd;
      var onFilesChange = opts.onFilesChange;
      var onFileSelect = opts.onFileSelect;
      var onFileContextMenu = opts.onFileContextMenu;
      var menu = opts.menu || [];
      var labelPlacement = opts.labelPlacement || 'bottom-left';
      var width = opts.width || 340;
      var appear = opts.appear !== undefined ? opts.appear : true;
      var appearDelay = opts.appearDelay || 0;

      var files = initialFiles.slice();
      var isOpen = opts.defaultOpen || false;
      var menuOpen = false;
      var k = width / W;
      var density = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)) * k;

      // root
      var root = el('div', 'gf-root' + (opts.className ? ' ' + opts.className : ''));
      root.setAttribute('data-tone', tone);
      root.setAttribute('data-place', labelPlacement);
      root.style.width = width + 'px';
      root.style.height = ((H + HEADROOM) * k) + 'px';
      if (opts.style) Object.assign(root.style, opts.style);
      if (!appear) root.setAttribute('data-entered', '');

      // stage
      var stage = el('div', 'gf-stage');
      stage.style.transform = 'translateY(' + (HEADROOM * k) + 'px) scale(' + k + ')';
      root.appendChild(stage);

      var tilt = el('div', 'gf-tilt');
      stage.appendChild(tilt);

      // shadow
      var shadow = el('div', 'gf-shadow', { 'aria-hidden': 'true' });
      tilt.appendChild(shadow);

      // back panel
      var back = el('div', 'gf-back', { 'aria-hidden': 'true' });
      back.style.clipPath = "path('" + BACK_PATH + "')";
      tilt.appendChild(back);

      if (image) {
        var img = document.createElement('img');
        img.className = 'gf-art';
        img.src = image;
        img.alt = '';
        img.width = W + 24;
        img.height = H + 24;
        img.draggable = false;
        back.appendChild(img);
      } else if (art !== 'none') {
        var artCanvas = document.createElement('canvas');
        artCanvas.className = 'gf-art';
        artCanvas.setAttribute('aria-hidden', 'true');
        artCanvas.style.width = (W + 24) + 'px';
        artCanvas.style.height = (H + 24) + 'px';
        artCanvas.style.maxWidth = 'none';
        back.appendChild(artCanvas);
        paintCanvas(artCanvas, art, seed, W + 24, H + 24, density, 0);
      }

      var backSheen = el('div', 'gf-back-sheen');
      back.appendChild(backSheen);

      // back rim
      var backRimSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      backRimSvg.setAttribute('class', 'gf-rim gf-back-rim');
      backRimSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      backRimSvg.setAttribute('aria-hidden', 'true');
      var backRimPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      backRimPath.setAttribute('d', BACK_PATH);
      backRimSvg.appendChild(backRimPath);
      tilt.appendChild(backRimSvg);

      // front panel
      var front = el('div', 'gf-front');
      front.style.clipPath = "path('" + FRONT_PATH + "')";
      tilt.appendChild(front);

      var tint = el('div', 'gf-tint', { 'aria-hidden': 'true' });
      front.appendChild(tint);

      var spec = el('div', 'gf-spec', { 'aria-hidden': 'true' });
      front.appendChild(spec);

      // front rim
      var frontRimSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      frontRimSvg.setAttribute('class', 'gf-rim gf-front-rim');
      frontRimSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + FRONT_H);
      frontRimSvg.setAttribute('aria-hidden', 'true');
      var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      var grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', 'gf-rim-' + id);
      grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
      grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
      var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset', '0'); s1.setAttribute('stop-color', '#fff'); s1.setAttribute('stop-opacity', '0.95');
      var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s2.setAttribute('offset', '0.35'); s2.setAttribute('stop-color', '#fff'); s2.setAttribute('stop-opacity', '0.35');
      var s3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s3.setAttribute('offset', '1'); s3.setAttribute('stop-color', '#fff'); s3.setAttribute('stop-opacity', '0.12');
      grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3);
      defs.appendChild(grad);
      frontRimSvg.appendChild(defs);
      var frontRimPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      frontRimPath.setAttribute('d', FRONT_PATH);
      frontRimPath.setAttribute('stroke', 'url(#gf-rim-' + id + ')');
      frontRimSvg.appendChild(frontRimPath);
      front.appendChild(frontRimSvg);

      // hit button
      var hitBtn = document.createElement('button');
      hitBtn.type = 'button';
      hitBtn.className = 'gf-hit';
      hitBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      hitBtn.setAttribute('aria-label', (isOpen ? 'Close ' : 'Open ') + label + ', ' + files.length + (files.length === 1 ? ' item' : ' items'));
      front.appendChild(hitBtn);

      // label
      var labelDiv = el('div', 'gf-label');
      var titleSpan = el('span', 'gf-title');
      titleSpan.textContent = label;
      var metaSpan = el('span', 'gf-meta');
      function metaText() {
        return opts.meta || (files.length + (files.length === 1 ? ' item' : ' items'));
      }
      metaSpan.textContent = metaText();
      labelDiv.appendChild(titleSpan);
      labelDiv.appendChild(metaSpan);
      front.appendChild(labelDiv);

      // files container
      var filesDiv = el('div', 'gf-files', { role: 'list', 'aria-label': label + ' contents' });
      tilt.appendChild(filesDiv);
      if (!isOpen) filesDiv.setAttribute('inert', '');

      function renderFiles() {
        filesDiv.innerHTML = '';
        var start = Math.max(0, files.length - MAX_VISIBLE);
        var visible = files.slice(start);
        visible.forEach(function (file, v) {
          var slot = fanSlot(v, visible.length);
          var jitter = rng(hashString(file.name) + v);
          var picture = !!(file.art || file.image);

          var sheetEl = document.createElement('button');
          sheetEl.type = 'button';
          sheetEl.className = 'gf-sheet' + (picture ? ' gf-sheet--art' : '');
          sheetEl.style.setProperty('--gf-slot', slot);
          sheetEl.style.setProperty('--gf-depth', visible.length - 1 - v);
          sheetEl.style.setProperty('--gf-jx', ((jitter() - 0.5) * 10).toFixed(2) + 'px');
          sheetEl.style.setProperty('--gf-jr', ((jitter() - 0.5) * 3.2).toFixed(2) + 'deg');
          sheetEl.style.zIndex = v + 1;

          if (picture) {
            if (file.image) {
              var fimg = document.createElement('img');
              fimg.className = 'gf-sheet-art';
              fimg.src = file.image;
              fimg.alt = '';
              fimg.width = SHEET_W;
              fimg.height = SHEET_H;
              fimg.draggable = false;
              sheetEl.appendChild(fimg);
            } else {
              var fc = document.createElement('canvas');
              fc.className = 'gf-sheet-art';
              fc.setAttribute('aria-hidden', 'true');
              fc.style.width = SHEET_W + 'px';
              fc.style.height = SHEET_H + 'px';
              fc.style.maxWidth = 'none';
              sheetEl.appendChild(fc);
              paintCanvas(fc, file.art, hashString(file.name) % 997, SHEET_W, SHEET_H, Math.min(density, 1.25), 1);
            }
          } else {
            var lines = el('span', 'gf-lines', { 'aria-hidden': 'true' });
            var widths = ['86%', '92%', '64%', '88%', '42%'];
            widths.forEach(function (w, li) {
              var line = document.createElement('i');
              line.style.width = w;
              lines.appendChild(line);
            });
            sheetEl.appendChild(lines);
          }

          var head = el('span', 'gf-sheet-head');
          var nameSpan = el('span', 'gf-sheet-name');
          nameSpan.textContent = file.name;
          head.appendChild(nameSpan);
          if (file.meta) {
            var fmeta = el('span', 'gf-sheet-meta');
            fmeta.textContent = file.meta;
            head.appendChild(fmeta);
          }
          sheetEl.appendChild(head);

          sheetEl.addEventListener('click', function () {
            if (onFileSelect) onFileSelect(file, start + v);
          });
          sheetEl.addEventListener('contextmenu', function (e) {
            if (onFileContextMenu) {
              e.preventDefault();
              e.stopPropagation();
              onFileContextMenu(file, start + v, e);
            }
          });

          var slotDiv = el('div', 'gf-sheet-slot');
          slotDiv.style.display = 'contents';
          slotDiv.setAttribute('role', 'listitem');
          slotDiv.appendChild(sheetEl);
          filesDiv.appendChild(slotDiv);
        });
      }

      renderFiles();

      // action key
      var keyBtn = null;
      if (action !== 'none') {
        keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = 'gf-key gf-key--' + action;
        keyBtn.setAttribute('aria-label', action === 'add' ? 'Add a file to ' + label : 'More options for ' + label);

        if (action === 'add') {
          keyBtn.innerHTML = '<svg class="gf-glyph gf-glyph--plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg>';
        } else {
          keyBtn.innerHTML = '<svg class="gf-glyph gf-glyph--more" viewBox="0 0 30 12" aria-hidden="true"><rect x="1" y="1.5" width="8" height="9" rx="3.4"/><rect x="11" y="1.5" width="8" height="9" rx="3.4"/><rect x="21" y="1.5" width="8" height="9" rx="3.4"/></svg>';
          keyBtn.setAttribute('aria-haspopup', 'menu');
          keyBtn.setAttribute('aria-expanded', 'false');
        }

        // build dropdown menu for 'more' action
        var menuDiv = null;
        if (action === 'more' && menu.length) {
          menuDiv = el('div', 'gf-menu');
          menuDiv.setAttribute('role', 'menu');
          menu.forEach(function (item) {
            var mb = document.createElement('button');
            mb.type = 'button';
            mb.className = 'gf-menu-item' + (item.danger ? ' gf-menu-item--danger' : '');
            mb.setAttribute('role', 'menuitem');
            mb.textContent = item.label;
            mb.addEventListener('click', function (e) {
              e.stopPropagation();
              menuDiv.removeAttribute('data-open');
              keyBtn.setAttribute('aria-expanded', 'false');
              menuOpen = false;
              if (item.onSelect) item.onSelect();
            });
            menuDiv.appendChild(mb);
          });
          tilt.appendChild(menuDiv);
        }

        keyBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (action === 'add') {
            var made = onAdd ? onAdd(files) : null;
            var file = made || { name: 'Untitled ' + (files.length + 1), meta: 'Just now' };
            files.push(file);
            renderFiles();
            metaSpan.textContent = metaText();
            front.classList.remove('gf-front--bump');
            void front.offsetWidth;
            front.classList.add('gf-front--bump');
            if (onFilesChange) onFilesChange(files);
          } else if (action === 'more' && menuDiv) {
            menuOpen = !menuOpen;
            if (menuOpen) {
              menuDiv.setAttribute('data-open', '');
              keyBtn.setAttribute('aria-expanded', 'true');
              var dismiss = function (ev) {
                if (!menuDiv.contains(ev.target) && ev.target !== keyBtn) {
                  menuDiv.removeAttribute('data-open');
                  keyBtn.setAttribute('aria-expanded', 'false');
                  menuOpen = false;
                  document.removeEventListener('click', dismiss, true);
                }
              };
              setTimeout(function () { document.addEventListener('click', dismiss, true); }, 0);
            } else {
              menuDiv.removeAttribute('data-open');
              keyBtn.setAttribute('aria-expanded', 'false');
            }
          }
        });
        tilt.appendChild(keyBtn);
      }

      // toggle open
      function setOpen(val) {
        isOpen = val;
        if (isOpen) {
          root.setAttribute('data-open', '');
          filesDiv.removeAttribute('inert');
        } else {
          root.removeAttribute('data-open');
          filesDiv.setAttribute('inert', '');
        }
        hitBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        hitBtn.setAttribute('aria-label', (isOpen ? 'Close ' : 'Open ') + label + ', ' + files.length + (files.length === 1 ? ' item' : ' items'));
      }

      hitBtn.addEventListener('click', function () { setOpen(!isOpen); });

      // pointer tracking
      var raf = 0;
      var px = 0, py = 0;
      function writePointer() {
        raf = 0;
        root.style.setProperty('--gf-px', px.toFixed(3));
        root.style.setProperty('--gf-py', py.toFixed(3));
      }
      root.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = root.getBoundingClientRect();
        px = ((e.clientX - r.left) / r.width) * 2 - 1;
        py = ((e.clientY - r.top) / r.height) * 2 - 1;
        if (!raf) raf = requestAnimationFrame(writePointer);
      });
      root.addEventListener('pointerleave', function () {
        px = 0; py = 0;
        if (!raf) raf = requestAnimationFrame(writePointer);
      });

      // entrance
      if (appear) {
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries) {
            if (!entries.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect();
            setTimeout(function () { root.setAttribute('data-entered', ''); }, appearDelay);
          }, { threshold: 0.25 });
          io.observe(root);
        } else {
          root.setAttribute('data-entered', '');
        }
      }

      // escape to close
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen) {
          setOpen(false);
          hitBtn.focus();
        }
      });
      document.addEventListener('pointerdown', function (e) {
        if (isOpen && !root.contains(e.target)) setOpen(false);
      });

      container.appendChild(root);
      return { root: root, setOpen: setOpen, getFiles: function () { return files; } };
    }
  };

  var GF_CSS = '\
.gf-root {\
  --gf-px: 0;\
  --gf-py: 0;\
  --gf-ease: cubic-bezier(.2, .8, .2, 1);\
  --gf-spring: cubic-bezier(.34, 1.36, .5, 1);\
  --gf-hinge: 0deg;\
  --gf-lift: 42px;\
  --gf-spread: 0px;\
  --gf-fan: 0deg;\
  --gf-stack: 15px;\
  --gf-ink: #141416;\
  --gf-ink-soft: rgba(20, 20, 22, .55);\
  position: relative;\
  display: inline-block;\
  flex: none;\
  vertical-align: top;\
  font-family: ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;\
  -webkit-font-smoothing: antialiased;\
  -webkit-tap-highlight-color: transparent;\
  isolation: isolate;\
}\
.gf-root[data-tone="dark"] { --gf-ink: #f5f5f7; --gf-ink-soft: rgba(245, 245, 247, .58); }\
.gf-root:hover, .gf-root:focus-within { --gf-hinge: -11deg; --gf-lift: -34px; --gf-spread: 8px; --gf-fan: 1.4deg; --gf-stack: 10px; }\
.gf-root[data-open] { --gf-hinge: -24deg; --gf-lift: -96px; --gf-spread: 40px; --gf-fan: 5deg; --gf-stack: 30px; }\
.gf-root[data-open] .gf-files { z-index: 15; pointer-events: auto; }\
\
.gf-stage {\
  position: absolute;\
  left: 0;\
  top: 0;\
  width: 340px;\
  height: 272px;\
  transform-origin: 0 0;\
}\
.gf-tilt {\
  position: absolute;\
  inset: 0;\
  transform: perspective(1400px) rotateX(calc(var(--gf-py) * -3deg)) rotateY(calc(var(--gf-px) * 4deg));\
  transition: transform .9s var(--gf-ease);\
}\
\
.gf-shadow {\
  position: absolute;\
  left: 18px;\
  right: 18px;\
  bottom: -6px;\
  height: 60px;\
  border-radius: 40px;\
  background: rgba(16, 18, 24, .34);\
  filter: blur(22px);\
  transform: translateX(calc(var(--gf-px) * -8px));\
  transition: transform .9s var(--gf-ease), opacity .9s var(--gf-ease);\
}\
.gf-root[data-tone="dark"] .gf-shadow { background: rgba(0, 0, 0, .62); }\
\
.gf-back {\
  position: absolute;\
  inset: 0;\
  overflow: hidden;\
  background: linear-gradient(180deg, #f3f3f4 0%, #e3e3e6 100%);\
}\
.gf-root[data-tone="dark"] .gf-back { background: linear-gradient(180deg, #2a2a2e 0%, #121214 100%); }\
.gf-art {\
  position: absolute;\
  left: -12px;\
  top: -12px;\
  max-width: none;\
  object-fit: cover;\
  transform: translate(calc(var(--gf-px) * -7px), calc(var(--gf-py) * -6px)) scale(1.02);\
  transition: transform 1.1s var(--gf-ease), opacity 1.2s var(--gf-ease), filter 1.2s var(--gf-ease);\
}\
canvas.gf-art { opacity: 0; filter: blur(14px) saturate(.6); }\
canvas.gf-art[data-ready] { opacity: 1; filter: none; }\
.gf-back-sheen {\
  position: absolute;\
  inset: 0;\
  background:\
    linear-gradient(180deg, rgba(255, 255, 255, .22) 0%, rgba(255, 255, 255, 0) 22%),\
    radial-gradient(120% 80% at 80% 0%, rgba(255, 255, 255, .16), rgba(255, 255, 255, 0) 60%);\
  pointer-events: none;\
}\
\
.gf-rim {\
  position: absolute;\
  left: 0;\
  top: 0;\
  max-width: none;\
  overflow: visible;\
  pointer-events: none;\
  fill: none;\
}\
.gf-back-rim { width: 340px; height: 272px; }\
.gf-back-rim path { stroke: rgba(255, 255, 255, .45); stroke-width: 1; }\
.gf-root[data-tone="dark"] .gf-back-rim path { stroke: rgba(255, 255, 255, .16); }\
\
.gf-files {\
  position: absolute;\
  inset: 0;\
  z-index: 5;\
  pointer-events: none;\
  clip-path: inset(-400px -400px 10px -400px);\
}\
.gf-sheet-slot { display: contents; }\
.gf-sheet {\
  all: unset;\
  box-sizing: border-box;\
  position: absolute;\
  left: 34px;\
  top: 96px;\
  width: 272px;\
  height: 184px;\
  border-radius: 16px;\
  overflow: hidden;\
  cursor: pointer;\
  pointer-events: auto;\
  background: linear-gradient(180deg, #ffffff 0%, #f2f2f0 100%);\
  box-shadow:\
    inset 0 1px 0 rgba(255, 255, 255, .9),\
    0 0 0 .5px rgba(0, 0, 0, .1),\
    0 10px 26px -8px rgba(10, 12, 20, .28);\
  transform-origin: 50% 100%;\
  transform:\
    translate(calc(var(--gf-jx) + var(--gf-slot) * var(--gf-spread)), calc(var(--gf-lift) + var(--gf-depth) * var(--gf-stack) * -1))\
    rotate(calc(var(--gf-jr) + var(--gf-slot) * var(--gf-fan)));\
  transition:\
    transform .75s var(--gf-spring) calc(var(--gf-depth) * 40ms),\
    box-shadow .4s var(--gf-ease),\
    translate .9s var(--gf-ease),\
    opacity .9s var(--gf-ease);\
}\
.gf-root[data-tone="dark"] .gf-sheet { background: linear-gradient(180deg, #2c2c30 0%, #1c1c1f 100%); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14), 0 0 0 .5px rgba(255, 255, 255, .08), 0 12px 28px -8px rgba(0, 0, 0, .7); }\
.gf-sheet--art { background: #1a1a1d; }\
.gf-root[data-open] .gf-sheet:hover,\
.gf-root[data-open] .gf-sheet:focus-visible {\
  transform:\
    translate(calc(var(--gf-jx) + var(--gf-slot) * var(--gf-spread)), calc(var(--gf-lift) + var(--gf-depth) * var(--gf-stack) * -1 - 18px))\
    rotate(calc(var(--gf-slot) * var(--gf-fan) * .6));\
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9), 0 0 0 .5px rgba(0, 0, 0, .1), 0 22px 40px -12px rgba(10, 12, 20, .42);\
  transition-delay: 0s;\
}\
.gf-sheet:focus-visible { outline: 2px solid #4c8dff; outline-offset: 2px; }\
.gf-sheet-art {\
  position: absolute;\
  left: 0;\
  top: 0;\
  width: 272px;\
  height: 184px;\
  max-width: none;\
  object-fit: cover;\
  transition: opacity .9s var(--gf-ease), filter .9s var(--gf-ease);\
}\
canvas.gf-sheet-art { opacity: 0; filter: blur(10px); }\
canvas.gf-sheet-art[data-ready] { opacity: 1; filter: none; }\
.gf-sheet--art::after {\
  content: "";\
  position: absolute;\
  inset: 0;\
  border-radius: inherit;\
  background: linear-gradient(180deg, rgba(0, 0, 0, .42) 0%, rgba(0, 0, 0, 0) 34%);\
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2);\
  pointer-events: none;\
}\
.gf-sheet-head {\
  position: absolute;\
  left: 14px;\
  right: 14px;\
  top: 11px;\
  z-index: 1;\
  display: flex;\
  align-items: baseline;\
  justify-content: space-between;\
  gap: 10px;\
  white-space: nowrap;\
}\
.gf-sheet-name {\
  overflow: hidden;\
  text-overflow: ellipsis;\
  font-size: 12.5px;\
  font-weight: 560;\
  letter-spacing: -.005em;\
  color: #18181b;\
}\
.gf-sheet-meta {\
  flex: none;\
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;\
  font-size: 10px;\
  letter-spacing: .02em;\
  color: rgba(24, 24, 27, .5);\
}\
.gf-root[data-tone="dark"] .gf-sheet-name, .gf-sheet--art .gf-sheet-name { color: #fafafa; }\
.gf-root[data-tone="dark"] .gf-sheet-meta, .gf-sheet--art .gf-sheet-meta { color: rgba(250, 250, 250, .66); }\
.gf-lines {\
  position: absolute;\
  left: 14px;\
  right: 14px;\
  top: 40px;\
  display: flex;\
  flex-direction: column;\
  gap: 9px;\
}\
.gf-lines i {\
  display: block;\
  height: 5px;\
  border-radius: 3px;\
  background: rgba(24, 24, 27, .08);\
}\
.gf-lines i:first-child { height: 9px; margin-bottom: 4px; background: rgba(24, 24, 27, .14); }\
.gf-root[data-tone="dark"] .gf-lines i { background: rgba(255, 255, 255, .08); }\
.gf-root[data-tone="dark"] .gf-lines i:first-child { background: rgba(255, 255, 255, .16); }\
\
.gf-sheet--drop { animation: gf-drop .85s var(--gf-ease) both; }\
@keyframes gf-drop {\
  0% { translate: 0 -190px; rotate: -9deg; opacity: 0; }\
  35% { opacity: 1; }\
  72% { translate: 0 10px; rotate: 1deg; }\
  100% { translate: 0 0; rotate: 0deg; opacity: 1; }\
}\
\
.gf-front {\
  position: absolute;\
  left: 0;\
  top: 74px;\
  width: 340px;\
  height: 198px;\
  z-index: 10;\
  -webkit-backdrop-filter: blur(22px) saturate(1.5);\
  backdrop-filter: blur(22px) saturate(1.5);\
  transform-origin: 50% 100%;\
  transform: perspective(760px) rotateX(var(--gf-hinge));\
  transition: transform .8s var(--gf-spring), translate 1s var(--gf-ease), opacity 1s var(--gf-ease);\
}\
.gf-front--bump { animation: gf-bump .7s var(--gf-ease) .38s both; }\
@keyframes gf-bump {\
  0% { scale: 1; }\
  35% { scale: 1.018 .975; }\
  70% { scale: .996 1.006; }\
  100% { scale: 1; }\
}\
.gf-tint {\
  position: absolute;\
  inset: 0;\
  background:\
    linear-gradient(180deg, rgba(255, 255, 255, .16) 0%, rgba(255, 255, 255, .5) 42%, rgba(252, 252, 252, .93) 100%);\
}\
.gf-root[data-tone="dark"] .gf-tint {\
  background: linear-gradient(180deg, rgba(18, 18, 20, .18) 0%, rgba(14, 14, 16, .62) 46%, rgba(8, 8, 10, .94) 100%);\
}\
.gf-spec {\
  position: absolute;\
  inset: 0;\
  background: radial-gradient(260px 200px at calc(50% + var(--gf-px) * 46%) calc(30% + var(--gf-py) * 40%), rgba(255, 255, 255, .5), rgba(255, 255, 255, 0) 70%);\
  mix-blend-mode: soft-light;\
  opacity: .9;\
  transition: background-position .6s var(--gf-ease);\
  pointer-events: none;\
}\
.gf-root[data-tone="dark"] .gf-spec { mix-blend-mode: screen; opacity: .16; }\
.gf-front-rim { width: 340px; height: 198px; }\
.gf-front-rim path { stroke-width: 2.4; transition: stroke-width .3s var(--gf-ease); }\
.gf-root[data-tone="dark"] .gf-front-rim { opacity: .55; }\
\
.gf-hit {\
  all: unset;\
  position: absolute;\
  inset: 0;\
  z-index: 1;\
  cursor: pointer;\
}\
.gf-hit:focus-visible ~ .gf-label .gf-title { text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 4px; }\
.gf-front:has(.gf-hit:focus-visible) .gf-front-rim path { stroke-width: 5; }\
\
.gf-label {\
  position: absolute;\
  z-index: 2;\
  display: flex;\
  flex-direction: column;\
  gap: 4px;\
  max-width: 200px;\
  pointer-events: none;\
  color: var(--gf-ink);\
}\
.gf-root[data-place="bottom-left"] .gf-label { left: 28px; bottom: 32px; }\
.gf-root[data-place="top-left"] .gf-label { left: 28px; top: 34px; }\
.gf-root[data-place="top-right"] .gf-label { right: 32px; top: 52px; align-items: flex-start; }\
.gf-title {\
  font-size: 18px;\
  font-weight: 500;\
  line-height: 1.15;\
  letter-spacing: -.012em;\
  overflow: hidden;\
  text-overflow: ellipsis;\
  white-space: nowrap;\
}\
.gf-meta {\
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;\
  font-size: 12px;\
  letter-spacing: .03em;\
  color: var(--gf-ink-soft);\
  white-space: nowrap;\
  animation: gf-roll .5s var(--gf-ease) both;\
}\
@keyframes gf-roll {\
  from { opacity: 0; translate: 0 7px; filter: blur(3px); }\
  to { opacity: 1; translate: 0 0; filter: blur(0); }\
}\
\
.gf-key {\
  all: unset;\
  box-sizing: border-box;\
  position: absolute;\
  right: 22px;\
  bottom: 22px;\
  z-index: 12;\
  width: 58px;\
  height: 58px;\
  border-radius: 18px;\
  display: grid;\
  place-items: center;\
  cursor: pointer;\
  transition: transform .35s var(--gf-spring), box-shadow .35s var(--gf-ease), background .35s var(--gf-ease);\
}\
.gf-key:hover { transform: translateY(-2px); }\
.gf-key:active { transform: translateY(0) scale(.93); transition-duration: .12s; }\
.gf-key:focus-visible { outline: 2px solid #4c8dff; outline-offset: 3px; }\
.gf-key--add {\
  color: #fff;\
  background: radial-gradient(120% 90% at 50% 0%, #3a3a3f 0%, #121214 55%, #050506 100%);\
  box-shadow:\
    inset 0 1px 0 rgba(255, 255, 255, .22),\
    inset 0 -3px 8px rgba(0, 0, 0, .7),\
    0 0 0 1px rgba(0, 0, 0, .75),\
    0 14px 22px -8px rgba(0, 0, 0, .55),\
    0 3px 6px -2px rgba(0, 0, 0, .35);\
}\
.gf-root[data-tone="dark"] .gf-key--add {\
  color: #111113;\
  background: radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #ececee 55%, #d2d2d6 100%);\
  box-shadow: inset 0 1px 0 #fff, inset 0 -3px 8px rgba(0, 0, 0, .14), 0 0 0 1px rgba(0, 0, 0, .4), 0 14px 22px -8px rgba(0, 0, 0, .7);\
}\
.gf-key--more {\
  color: #111113;\
  background: linear-gradient(180deg, rgba(255, 255, 255, .92) 0%, rgba(226, 226, 230, .82) 100%);\
  -webkit-backdrop-filter: blur(10px);\
  backdrop-filter: blur(10px);\
  box-shadow:\
    inset 0 1px 0 #fff,\
    inset 0 -2px 4px rgba(0, 0, 0, .06),\
    0 0 0 1px rgba(0, 0, 0, .16),\
    0 10px 18px -8px rgba(0, 0, 0, .3);\
}\
.gf-root[data-tone="dark"] .gf-key--more {\
  color: #f5f5f7;\
  background: linear-gradient(180deg, rgba(255, 255, 255, .16) 0%, rgba(255, 255, 255, .06) 100%);\
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .22), 0 0 0 1px rgba(255, 255, 255, .1), 0 10px 18px -8px rgba(0, 0, 0, .6);\
}\
.gf-key--more[aria-expanded="true"] { transform: scale(.96); }\
.gf-glyph { display: block; max-width: none; fill: none; stroke: currentColor; stroke-linecap: round; }\
.gf-glyph--plus { width: 26px; height: 26px; stroke-width: 1.6; animation: gf-turn .6s var(--gf-spring); }\
.gf-glyph--more { width: 30px; height: 12px; stroke-width: 1.7; }\
@keyframes gf-turn { from { rotate: -90deg; } to { rotate: 0deg; } }\
\
.gf-menu {\
  position: absolute;\
  right: 22px;\
  bottom: 90px;\
  z-index: 20;\
  min-width: 176px;\
  padding: 6px;\
  border-radius: 16px;\
  display: flex;\
  flex-direction: column;\
  background: rgba(252, 252, 253, .72);\
  -webkit-backdrop-filter: blur(24px) saturate(1.6);\
  backdrop-filter: blur(24px) saturate(1.6);\
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9), 0 0 0 .5px rgba(0, 0, 0, .14), 0 24px 48px -16px rgba(10, 12, 20, .4);\
  transform-origin: 100% 100%;\
  opacity: 0;\
  visibility: hidden;\
  transform: translateY(6px) scale(.94);\
  transition: opacity .2s var(--gf-ease), transform .32s var(--gf-spring), visibility 0s .32s;\
}\
.gf-menu[data-open] { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }\
.gf-root[data-tone="dark"] .gf-menu { background: rgba(30, 30, 34, .72); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1), 0 0 0 .5px rgba(255, 255, 255, .1), 0 24px 48px -16px rgba(0, 0, 0, .8); }\
.gf-menu-item {\
  all: unset;\
  box-sizing: border-box;\
  padding: 9px 12px;\
  border-radius: 10px;\
  font-size: 13.5px;\
  font-weight: 450;\
  color: #18181b;\
  cursor: pointer;\
}\
.gf-root[data-tone="dark"] .gf-menu-item { color: #f4f4f5; }\
.gf-menu-item:hover, .gf-menu-item:focus-visible { background: rgba(24, 24, 27, .07); }\
.gf-root[data-tone="dark"] .gf-menu-item:hover, .gf-root[data-tone="dark"] .gf-menu-item:focus-visible { background: rgba(255, 255, 255, .09); }\
.gf-menu-item--danger { color: #d92d20; }\
.gf-root[data-tone="dark"] .gf-menu-item--danger { color: #ff6b5e; }\
\
.gf-root:not([data-entered]) .gf-back,\
.gf-root:not([data-entered]) .gf-back-rim { translate: 0 22px; opacity: 0; }\
.gf-root:not([data-entered]) .gf-sheet { translate: 0 -120px; opacity: 0; }\
.gf-root:not([data-entered]) .gf-front { translate: 0 46px; opacity: 0; }\
.gf-root:not([data-entered]) .gf-key { opacity: 0; scale: .6; }\
.gf-root:not([data-entered]) .gf-shadow { opacity: 0; }\
.gf-back, .gf-back-rim { transition: translate 1s var(--gf-ease), opacity .9s var(--gf-ease); }\
.gf-root[data-entered] .gf-sheet { transition-delay: calc(var(--gf-depth) * 40ms), 0s, calc(.18s + var(--gf-depth) * 90ms), calc(.18s + var(--gf-depth) * 90ms); }\
.gf-root[data-entered] .gf-front { transition-delay: 0s, .42s, .42s; }\
.gf-key { transition: transform .35s var(--gf-spring), box-shadow .35s var(--gf-ease), opacity .6s var(--gf-ease) .7s, scale .7s var(--gf-spring) .7s; }\
\
@media (prefers-reduced-motion: reduce) {\
  .gf-root *, .gf-root *::before, .gf-root *::after {\
    transition-duration: 0s !important;\
    transition-delay: 0s !important;\
    animation: none !important;\
  }\
  .gf-tilt { transform: none; }\
}\
';

})();
