// ============ Waves background, faithful vanilla port of the 21st.dev simplex-noise Waves ============
// The original is React + TypeScript + Tailwind and depends on the `simplex-noise`
// npm package. This codebase is plain HTML/CSS/JS with no build step, so the noise
// generator is vendored inline (compact public-domain 2D simplex) and the component
// is rewritten as a self-contained DOM/SVG animation that matches the original:
// white lines on a black field, dense straight segments (8px gaps), stroke-width 1,
// and a white pointer dot driven by --x/--y CSS variables. Auto-inits on #hero-waves.
// (Only additions that don't change the look: reduced-motion static fallback and an
//  off-screen pause for performance.)
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // --- Vendored compact 2D simplex noise (returns ~[-1, 1]) ---
  function createNoise2D() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const n = Math.floor(Math.random() * (i + 1)); const t = p[i]; p[i] = p[n]; p[n] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    return function (xin, yin) {
      const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2, X0 = i - t, Y0 = j - t, x0 = xin - X0, y0 = yin - Y0;
      let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      function corner(gx, gy, cx, cy) {
        let tt = 0.5 - cx * cx - cy * cy; if (tt < 0) return 0;
        const g = grad[perm[ii + gx + perm[jj + gy]] % 8]; tt *= tt; return tt * tt * (g[0] * cx + g[1] * cy);
      }
      return 70 * (corner(0, 0, x0, y0) + corner(i1, j1, x1, y1) + corner(1, 1, x2, y2));
    };
  }

  function initWaves(container, opts) {
    opts = opts || {};
    const strokeColor = opts.strokeColor || '#ffffff';      // White lines
    const backgroundColor = opts.backgroundColor || '#000000'; // Black background
    const pointerSize = opts.pointerSize || 0.5;
    const xGap = opts.xGap || 8, yGap = opts.yGap || 8;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    container.style.backgroundColor = backgroundColor;
    container.style.setProperty('--x', '-0.5rem');
    container.style.setProperty('--y', '50%');

    const svg = document.createElementNS(NS, 'svg');
    svg.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(svg);

    const dot = document.createElement('div');
    dot.className = 'wave-dot';
    dot.style.width = pointerSize + 'rem';
    dot.style.height = pointerSize + 'rem';
    dot.style.background = strokeColor;
    container.appendChild(dot);

    const noise = createNoise2D();
    const mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false };
    let lines = [], paths = [], bounding = null, raf = 0, running = false;

    function setSize() {
      bounding = container.getBoundingClientRect();
      svg.style.width = bounding.width + 'px';
      svg.style.height = bounding.height + 'px';
    }
    function setLines() {
      lines = [];
      paths.forEach(p => p.remove()); paths = [];
      const { width, height } = bounding;
      const oWidth = width + 200, oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / xGap), totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2, yStart = (height - yGap * totalPoints) / 2;
      for (let i = 0; i < totalLines; i++) {
        const points = [];
        for (let j = 0; j < totalPoints; j++) {
          points.push({ x: xStart + xGap * i, y: yStart + yGap * j, wave: { x: 0, y: 0 }, cursor: { x: 0, y: 0, vx: 0, vy: 0 } });
        }
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-opacity', String(opts.strokeOpacity != null ? opts.strokeOpacity : 1));
        svg.appendChild(path); paths.push(path); lines.push(points);
      }
    }
    function updateMouse(clientX, clientY) {
      // Fresh viewport-relative rect each move → correct at any scroll position.
      const rect = container.getBoundingClientRect();
      mouse.x = clientX - rect.left; mouse.y = clientY - rect.top;
      if (!mouse.set) { mouse.sx = mouse.x; mouse.sy = mouse.y; mouse.lx = mouse.x; mouse.ly = mouse.y; mouse.set = true; }
      container.style.setProperty('--x', mouse.sx + 'px');
      container.style.setProperty('--y', mouse.sy + 'px');
    }
    function movePoints(time) {
      lines.forEach(points => {
        points.forEach(p => {
          const move = noise((p.x + time * 0.008) * 0.003, (p.y + time * 0.003) * 0.002) * 8;
          p.wave.x = Math.cos(move) * 12; p.wave.y = Math.sin(move) * 6;
          const dx = p.x - mouse.sx, dy = p.y - mouse.sy, d = Math.hypot(dx, dy), l = Math.max(175, mouse.vs);
          if (d < l) {
            const s = 1 - d / l, f = Math.cos(d * 0.001) * s;
            p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035;
            p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035;
          }
          p.cursor.vx += (0 - p.cursor.x) * 0.01; p.cursor.vy += (0 - p.cursor.y) * 0.01;
          p.cursor.vx *= 0.95; p.cursor.vy *= 0.95;
          p.cursor.x += p.cursor.vx; p.cursor.y += p.cursor.vy;
          p.cursor.x = Math.min(50, Math.max(-50, p.cursor.x)); p.cursor.y = Math.min(50, Math.max(-50, p.cursor.y));
        });
      });
    }
    function moved(p, withCursor) {
      return { x: p.x + p.wave.x + (withCursor ? p.cursor.x : 0), y: p.y + p.wave.y + (withCursor ? p.cursor.y : 0) };
    }
    function drawLines() {
      lines.forEach((points, idx) => {
        if (points.length < 2 || !paths[idx]) return;
        const f = moved(points[0], false);
        let d = `M ${f.x} ${f.y}`;
        for (let i = 1; i < points.length; i++) { const c = moved(points[i], true); d += `L ${c.x} ${c.y}`; }
        paths[idx].setAttribute('d', d);
      });
    }
    function tick(time) {
      mouse.sx += (mouse.x - mouse.sx) * 0.1; mouse.sy += (mouse.y - mouse.sy) * 0.1;
      const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly, d = Math.hypot(dx, dy);
      mouse.v = d; mouse.vs += (d - mouse.vs) * 0.1; mouse.vs = Math.min(100, mouse.vs);
      mouse.lx = mouse.x; mouse.ly = mouse.y; mouse.a = Math.atan2(dy, dx);
      container.style.setProperty('--x', mouse.sx + 'px');
      container.style.setProperty('--y', mouse.sy + 'px');
      movePoints(time); drawLines();
      raf = requestAnimationFrame(tick);
    }
    function start() { if (running) return; running = true; raf = requestAnimationFrame(tick); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

    setSize(); setLines();
    if (reduce) { movePoints(0); drawLines(); return; }
    window.addEventListener('resize', () => { setSize(); setLines(); });
    window.addEventListener('mousemove', e => updateMouse(e.clientX, e.clientY));
    container.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) { e.preventDefault(); updateMouse(t.clientX, t.clientY); } }, { passive: false });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { entries[0].isIntersecting ? start() : stop(); }, { threshold: 0 }).observe(container);
    } else { start(); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const el = document.getElementById('hero-waves');
    // Themed to the app: indigo lines over the hero's brand gradient (transparent bg).
    if (el) initWaves(el, { strokeColor: '#818cf8', backgroundColor: 'transparent', strokeOpacity: 0.16 });
  });
})();
