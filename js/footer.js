/* footer.js, one shared site footer, injected on public pages for consistent
   internal linking (SEO) + trust signals. Uses the design tokens from styles.css,
   so it adapts to light/dark automatically. Existing static footers receive
   the same final halftone panel rather than a duplicate footer. */
(function () {
  var existingFooter = document.querySelector('footer.app-footer') || document.querySelector('.home-footer');
  if (existingFooter) { ensureTrustLinks(existingFooter); mountHalftoneFooter(existingFooter); return; }

  var YEAR = new Date().getFullYear();
  var css = ''
    + '.app-footer{border-top:1px solid var(--border);margin-top:64px;padding:44px 20px 30px;color:var(--muted);font-size:13.5px;background:var(--bg-1);} '
    + '.app-footer-in{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1.5fr repeat(5, 1fr);gap:26px;} '
    + '@media(max-width:900px){.app-footer-in{grid-template-columns:1fr 1fr 1fr;gap:24px;}} '
    + '@media(max-width:560px){.app-footer-in{grid-template-columns:1fr 1fr;gap:20px;}} '
    + '.app-footer-brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px;color:var(--text);} '
    + '.app-footer-brand img{width:26px;height:26px;border-radius:7px;} '
    + '.app-footer-tag{margin-top:10px;line-height:1.55;max-width:280px;} '
    + '.app-footer .gps-cta{display:flex;align-items:center;gap:11px;width:-moz-fit-content;width:fit-content;max-width:300px;margin-top:16px;padding:10px 12px;border-radius:18px;background:#eceafd;text-decoration:none;transition:transform .15s,box-shadow .15s;} '
    + '.app-footer .gps-cta:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(60,50,120,.3);} '
    + '.app-footer .gps-cta-logo{flex:0 0 auto;width:42px;height:42px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1);} '
    + '.app-footer .gps-cta-logo svg{width:25px;height:25px;} '
    + '.app-footer .gps-cta-text{flex:1;font-size:13.5px;font-weight:800;line-height:1.22;color:#2d2a45;letter-spacing:-.1px;} '
    + '.app-footer .gps-cta-arrow{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.1);color:#2d2a45;} '
    + '.app-footer .gps-cta-arrow svg{width:14px;height:14px;} '
    + '.app-footer-col-wide{grid-column:1 / -1;} '
    + '@media(min-width:901px){.app-footer-col-brand{grid-row:span 1;}} '
    + '.app-footer h4{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text);margin:2px 0 12px;} '
    + '.app-footer a{display:block;color:var(--muted);padding:4px 0;transition:color .15s;line-height:1.35;} '
    + '.app-footer a:hover{color:var(--accent);} '
    + '.app-footer-seo{max-width:1180px;margin:26px auto 0;padding-top:20px;border-top:1px solid var(--border);} '
    + '.app-footer-seo h4{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text);margin:0 0 10px;} '
    + '.app-footer-seo-links{display:flex;flex-wrap:wrap;gap:4px 0;} '
    + '.app-footer-seo-links a{color:var(--muted);font-size:12.5px;padding:3px 0;} '
    + '.app-footer-seo-links a:not(:last-child)::after{content:"·";margin:0 8px;color:var(--border);} '
    + '.app-footer-seo-links a:hover{color:var(--accent);} '
    + '.app-footer-bot{max-width:1180px;margin:26px auto 0;padding-top:20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:12.5px;} '
    + '.app-footer-bot a{display:inline;} '
    + '@media(max-width:768px){.app-footer a{padding:10px 0;}.app-footer-seo-links a{padding:9px 0;}.app-footer-seo-links{gap:2px 14px;}} ';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var html = ''
    + '<div class="app-footer-in">'
    +   '<div class="app-footer-col-brand">'
    +     '<div class="app-footer-brand"><img src="/logo-mark.png" alt="Applio AI resume builder logo"> Applio</div>'
    +     '<div class="app-footer-tag">The free AI resume builder and ATS checker. Build an ATS-friendly resume, tailor it to any job description, generate a cover letter, and land more interviews.</div>'
    +     '<a class="gps-cta" href="https://www.google.com/preferences/source?q=appliohq.com" target="_blank" rel="noopener" aria-label="Add Applio as a preferred source on Google">'
    +       '<span class="gps-cta-logo"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg></span>'
    +       '<span class="gps-cta-text">Add as a preferred source on Google</span>'
    +       '<span class="gps-cta-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>'
    +     '</a>'
    +   '</div>'
    +   '<div><h4>Resume Builder</h4>'
    +     '<a href="/resume-builder">AI Resume Builder</a>'
    +     '<a href="/resume-templates">Resume Templates</a>'
    +     '<a href="/tools/ai-resume-writer">AI Resume Writer</a>'
    +     '<a href="/resume-examples">Resume Examples</a>'
    +     '<a href="/editor">Build a Resume Free</a>'
    +     '<a href="/pricing">Pricing</a>'
    +   '</div>'
    +   '<div><h4>ATS & Cover Letters</h4>'
    +     '<a href="/ats-checker">Free ATS Checker</a>'
    +     '<a href="/tools/resume-scorer">Resume Scorer</a>'
    +     '<a href="/tools/resume-job-match">Resume Job Match</a>'
    +     '<a href="/cover-letter-generator">Cover Letter Generator</a>'
    +     '<a href="/cover-letter-templates">Cover Letter Templates</a>'
    +     '<a href="/cover-letter-examples">Cover Letter Examples</a>'
    +   '</div>'
    +   '<div><h4>Free Tools</h4>'
    +     '<a href="/tools">All Free Resume Tools</a>'
    +     '<a href="/tools/resume-summary-generator">Resume Summary Generator</a>'
    +     '<a href="/tools/resume-bullet-generator">Bullet Point Generator</a>'
    +     '<a href="/tools/resume-skills-generator">Skills Generator</a>'
    +     '<a href="/tools/resume-proofreader">Resume Proofreader</a>'
    +     '<a href="/salary">Salary Calculator</a>'
    +     '<a href="/connect">Connect to Claude &amp; ChatGPT</a>'
    +   '</div>'
    +   '<div><h4>Learn</h4>'
    +     '<a href="/guides">Resume Guides</a>'
    +     '<a href="/guides/what-is-an-ats">What Is an ATS?</a>'
    +     '<a href="/guides/how-to-pass-ats">How to Pass the ATS</a>'
    +     '<a href="/guides/how-to-write-a-resume">How to Write a Resume</a>'
    +     '<a href="/interview-preparation">Interview Prep</a>'
    +     '<a href="/wall-of-wins">Wall of Wins</a>'
    +   '</div>'
    +   '<div><h4>Compare</h4>'
    +     '<a href="/compare">Compare Resume Builders</a>'
    +     '<a href="/zety-alternative">Zety Alternative</a>'
    +     '<a href="/rezi-alternative">Rezi Alternative</a>'
    +     '<a href="/teal-alternative">Teal Alternative</a>'
    +     '<a href="/resume-io-alternative">Resume.io Alternative</a>'
    +     '<a href="/jobscan-alternative">Jobscan Alternative</a>'
    +   '</div>'
    + '</div>'
    + '<div class="app-footer-seo">'
    +   '<h4>Popular resume examples</h4>'
    +   '<div class="app-footer-seo-links">'
    +     '<a href="/resume-examples/software-engineer">Software Engineer</a>'
    +     '<a href="/resume-examples/registered-nurse">Registered Nurse</a>'
    +     '<a href="/resume-examples/project-manager">Project Manager</a>'
    +     '<a href="/resume-examples/data-analyst">Data Analyst</a>'
    +     '<a href="/resume-examples/accountant">Accountant</a>'
    +     '<a href="/resume-examples/teacher">Teacher</a>'
    +     '<a href="/resume-examples/marketing-manager">Marketing Manager</a>'
    +     '<a href="/resume-examples/customer-service-representative">Customer Service</a>'
    +     '<a href="/resume-examples/sales-representative">Sales Representative</a>'
    +     '<a href="/resume-examples/front-end-developer">Front-End Developer</a>'
    +     '<a href="/resume-examples/product-manager">Product Manager</a>'
    +     '<a href="/resume-examples/graphic-designer">Graphic Designer</a>'
    +     '<a href="/resume-examples/business-analyst">Business Analyst</a>'
    +     '<a href="/resume-examples/nurse-practitioner">Nurse Practitioner</a>'
    +     '<a href="/resume-examples">All 142 resume examples →</a>'
    +   '</div>'
    + '</div>'
    + '<div class="app-footer-seo">'
    +   '<h4>Beat the ATS by system</h4>'
    +   '<div class="app-footer-seo-links">'
    +     '<a href="/guides/workday-ats">Workday ATS</a>'
    +     '<a href="/guides/greenhouse-ats">Greenhouse ATS</a>'
    +     '<a href="/guides/lever-ats">Lever ATS</a>'
    +     '<a href="/guides/icims-ats">iCIMS ATS</a>'
    +     '<a href="/guides/taleo-ats">Taleo ATS</a>'
    +     '<a href="/guides/ashby-ats">Ashby ATS</a>'
    +     '<a href="/guides/resume-action-verbs">Resume Action Verbs</a>'
    +     '<a href="/guides/best-resume-format">Best Resume Format</a>'
    +     '<a href="/guides/how-to-tailor-resume-to-job">Tailor Resume to a Job</a>'
    +     '<a href="/privacy">Privacy</a>'
    +     '<a href="/terms">Terms</a>'
    +     '<a href="/about">About</a>'
    +     '<a href="/methodology">Methodology</a>'
    +     '<a href="/email-preferences">Email preferences</a>'
    +   '</div>'
    + '</div>'
    + '<div class="app-footer-bot">'
    +   '<span>© ' + YEAR + ' Applio · Built for job seekers everywhere · <a style="display:inline;color:var(--muted);" href="mailto:support@appliohq.com">support@appliohq.com</a></span>'
    +   '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.8;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Data encrypted · Passwords never stored in plain text · Never sold</span>'
    + '</div>';

  var footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = html;
  document.body.appendChild(footer);
  mountHalftoneFooter(footer);

  // Native implementation of the supplied Halftone Wordmark Footer. It stays
  // here, rather than in an unused React component, because this site ships
  // buildless HTML and JavaScript to browsers.
  function mountHalftoneFooter(host) {
    if (!host || host.querySelector('.hwf-root')) return;
    var footerBg = window.getComputedStyle(host).backgroundColor;
    if (!footerBg || footerBg === 'rgba(0, 0, 0, 0)') footerBg = window.getComputedStyle(document.body).backgroundColor;
    if (!footerBg || footerBg === 'rgba(0, 0, 0, 0)') footerBg = '#111113';
    var style = document.createElement('style');
    style.textContent = ''
      + '.hwf-root{--hwf-bg:#111113;--hwf-ink:#fff;--hwf-warm:#9d84ff;position:relative;isolation:isolate;overflow:hidden;height:280px;margin:42px -20px -30px;background:var(--hwf-bg);-webkit-font-smoothing:antialiased;}'
      + '.hwf-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;cursor:default;}.hwf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}@media(max-width:720px){.hwf-root{height:190px;margin-left:-16px;margin-right:-16px;}}';
    document.head.appendChild(style);

    var root = document.createElement('section');
    root.className = 'hwf-root';
    root.setAttribute('aria-label', 'Applio site footer');
    root.style.setProperty('--hwf-bg', footerBg);
    root.innerHTML = '<canvas aria-hidden="true"></canvas><span class="hwf-sr">applio</span>';
    host.appendChild(root);

    var canvas = root.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dots = new Float32Array(0), count = 0, width = 0, height = 0, dpr = 1;
    var px = -1e5, py = -1e5, raf = 0, visible = true, awake = true;
    var ring = { x: 0, y: 0, t: -1 }, grainTile = null;
    var ink = [255, 255, 255], warm = [157, 132, 255];
    function radius(coverage, gap) { return Math.sqrt(Math.max(0, Math.min(1, coverage))) * gap * .56; }
    function layout() {
      var rect = root.getBoundingClientRect(); width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height)); dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      var mask = document.createElement('canvas'); mask.width = width; mask.height = height;
      var m = mask.getContext('2d', { willReadFrequently: true }); if (!m) return;
      m.font = '800 100px Inter,Arial,sans-serif'; var word = 'applio'; var fit = m.measureText(word).width ? width * 1.02 / m.measureText(word).width * 100 : 0;
      m.font = '800 ' + fit + 'px Inter,Arial,sans-serif'; var box = m.measureText(word), cap = box.actualBoundingBoxAscent || fit * .72;
      m.fillStyle = '#000'; m.textBaseline = 'alphabetic'; m.fillText(word, (width - box.width) / 2, height + cap * .2);
      var img = m.getImageData(0, 0, width, height).data, gap = 6, cols = Math.ceil(width / gap), rows = Math.ceil(height / gap), values = [];
      for (var gy = 0; gy < rows; gy++) for (var gx = 0; gx < cols; gx++) { var sum = 0; for (var sy = 0; sy < 3; sy++) for (var sx = 0; sx < 3; sx++) { var x = Math.min(width - 1, Math.floor(gx * gap + ((sx + .5) * gap) / 3)), y = Math.min(height - 1, Math.floor(gy * gap + ((sy + .5) * gap) / 3)); sum += img[(y * width + x) * 4 + 3]; } var coverage = sum / (9 * 255); if (coverage >= .06) { var hx = gx * gap + gap / 2, hy = gy * gap + gap / 2; values.push(hx, hy, 0, 0, hx, hy, radius(coverage, gap)); } }
      dots = new Float32Array(values); count = values.length / 7;
      grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 128; var g = grainTile.getContext('2d'); if (g) { var data = g.createImageData(128, 128); for (var i = 0; i < data.data.length; i += 4) { var v = Math.random() * 255; data.data[i] = data.data[i + 1] = data.data[i + 2] = v; data.data[i + 3] = Math.random() < .5 ? 0 : 255; } g.putImageData(data, 0, 0); } awake = true;
    }
    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = footerBg; ctx.fillRect(0, 0, width, height);
      var ringAge = ring.t < 0 ? 1e9 : now - ring.t, ringR = ringAge * .9, moving = false;
      for (var i = 0; i < count; i++) { var j = i * 7, x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3], hx = dots[j + 4], hy = dots[j + 5]; if (!reduced) { if (ringAge < 900) { var dxr = hx - ring.x, dyr = hy - ring.y, dr = Math.sqrt(dxr * dxr + dyr * dyr) + .001, band = 1 - Math.min(1, Math.abs(dr - ringR) / 26); if (band > 0) { var force = band * 3.2 * (1 - ringAge / 900); vx += dxr / dr * force; vy += dyr / dr * force; } } var dx = x - px, dy = y - py, distance = Math.sqrt(dx * dx + dy * dy) + .001; if (distance < 80) { var push = (1 - distance / 80) * 2.6; vx += dx / distance * push; vy += dy / distance * push; } vx = (vx + (hx - x) * .05) * .84; vy = (vy + (hy - y) * .05) * .84; x += vx; y += vy; if (Math.abs(vx) + Math.abs(vy) > .02 || Math.abs(x - hx) + Math.abs(y - hy) > .05) moving = true; else { x = hx; y = hy; vx = vy = 0; } dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy; } var heat = Math.min(1, Math.hypot(x - hx, y - hy) / 28); ctx.fillStyle = heat > .02 ? 'rgb(' + Math.round(ink[0] + (warm[0] - ink[0]) * heat) + ',' + Math.round(ink[1] + (warm[1] - ink[1]) * heat) + ',' + Math.round(ink[2] + (warm[2] - ink[2]) * heat) + ')' : 'rgb(' + ink.join(',') + ')'; ctx.beginPath(); ctx.arc(x, y, dots[j + 6], 0, 6.2832); ctx.fill(); }
      if (grainTile) { ctx.globalAlpha = .045; ctx.globalCompositeOperation = 'overlay'; var pattern = ctx.createPattern(grainTile, 'repeat'); if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, width, height); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      awake = moving || ringAge < 900 || px > -1e4;
    }
    function loop(now) { raf = 0; if (!visible) return; draw(now); if (awake) raf = requestAnimationFrame(loop); }
    function wake() { awake = true; if (!raf && visible) raf = requestAnimationFrame(loop); }
    function point(e) { var b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    canvas.addEventListener('pointermove', function (e) { var p = point(e); px = p.x; py = p.y; wake(); });
    canvas.addEventListener('pointerleave', function () { px = py = -1e5; wake(); });
    canvas.addEventListener('pointerdown', function (e) { if (reduced) return; var p = point(e); ring = { x: p.x, y: p.y, t: performance.now() }; wake(); });
    layout(); draw(performance.now()); wake();
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { layout(); wake(); }); ro.observe(root); }
    if (window.IntersectionObserver) { var io = new IntersectionObserver(function (entries) { visible = entries[0] ? entries[0].isIntersecting : true; if (visible) wake(); }); io.observe(root); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); wake(); });
  }

  function ensureTrustLinks(host) {
    if (host.querySelector('a[href="/about"]')) return;
    var links = document.createElement('p');
    links.className = 'applio-trust-links';
    links.innerHTML = '<a href="/about">About</a><span aria-hidden="true"> · </span><a href="/methodology">Methodology</a>';
    var target = host.querySelector('.app-footer-bot') || host.querySelector('.footer-row') || host;
    target.appendChild(links);
    var style = document.createElement('style');
    style.textContent = '.applio-trust-links{margin:14px 0 0;font-size:12.5px;color:var(--muted)}.applio-trust-links a{display:inline;color:inherit;padding:0}.applio-trust-links a:hover{color:var(--accent)}';
    document.head.appendChild(style);
  }
})();
