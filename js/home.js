// ============ Applio home page interactivity ============

// ----- Typewriter hero word -----
const ROTATOR_WORDS = ['Interviews', 'Offers', 'Callbacks', 'Opportunities'];
const rotEl = document.getElementById('hero-rotator');
(function typewriter() {
  if (!rotEl) return;
  let wordIdx = 0, charIdx = ROTATOR_WORDS[0].length, erasing = false;
  rotEl.textContent = ROTATOR_WORDS[0];
  function tick() {
    const word = ROTATOR_WORDS[wordIdx];
    if (!erasing) {
      // Hold then start erasing
      erasing = true;
      setTimeout(tick, 1800);
      return;
    }
    // Erasing
    charIdx--;
    rotEl.textContent = word.slice(0, charIdx);
    if (charIdx <= 0) {
      erasing = false;
      wordIdx = (wordIdx + 1) % ROTATOR_WORDS.length;
      charIdx = 0;
      setTimeout(tick, 250);
      return;
    }
    setTimeout(tick, 38);
    return;
    // (typing branch, reached when charIdx < word.length)
  }
  // Also need typing branch, restructure:
  rotEl.textContent = '';
  charIdx = 0; erasing = false; wordIdx = 0;
  function step() {
    const word = ROTATOR_WORDS[wordIdx];
    if (!erasing) {
      // Typing
      charIdx++;
      rotEl.textContent = word.slice(0, charIdx);
      if (charIdx >= word.length) {
        erasing = true;
        setTimeout(step, 1800);
      } else {
        setTimeout(step, 65);
      }
    } else {
      // Erasing
      charIdx--;
      rotEl.textContent = word.slice(0, charIdx);
      if (charIdx <= 0) {
        erasing = false;
        wordIdx = (wordIdx + 1) % ROTATOR_WORDS.length;
        setTimeout(step, 260);
      } else {
        setTimeout(step, 38);
      }
    }
  }
  setTimeout(step, 600);
})();

// ----- Pricing toggle (Monthly / Lifetime) -----
function setPriceMode(mode) {
  document.querySelectorAll('.pt-btn').forEach(b => b.classList.toggle('active', b.dataset.plan === mode));
  const name   = document.getElementById('paid-name');
  const price  = document.getElementById('paid-price');
  const period = document.getElementById('paid-period');
  const sub    = document.getElementById('paid-sub');
  const cta    = document.getElementById('paid-cta');
  const savings = document.getElementById('price-savings');
  const badge  = document.getElementById('price-badge');
  if (mode === 'lifetime') {
    if (badge)  badge.textContent  = 'BEST VALUE';
    if (name)   name.textContent   = 'Lifetime';
    if (price)  price.textContent  = '$39.99';
    if (period) period.textContent = ' once';
    if (sub)    sub.textContent    = 'Pay once. Use forever.';
    if (cta)    cta.textContent    = 'Buy Lifetime';
    if (savings) { savings.textContent = 'Save $79.89 vs. 12 months of monthly'; savings.style.display ='block'; }
    const pp = document.getElementById('price-social-proof');
    if (pp) pp.textContent = 'Most popular choice, pay once, own it forever.';
  } else {
    if (badge)  badge.textContent  = 'MOST POPULAR';
    if (name)   name.textContent   = 'Premium';
    if (price)  price.textContent  = '$9.99';
    if (period) period.textContent = '/month';
    if (sub)    sub.textContent    = 'Best for serious job seekers';
    if (cta)    cta.textContent    = 'Go Premium';
    if (savings) { savings.textContent = ''; savings.style.display = 'none'; }
    const pp = document.getElementById('price-social-proof');
    if (pp) pp.textContent = 'Most users choose Lifetime, pay once, use forever.';
  }
  if (window._positionPricePill) window._positionPricePill();
}

// ----- Hamburger menu toggle -----
const hamburger = document.getElementById('nav-hamburger');
const navLinks  = document.querySelector('.home-nav-links');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    navLinks.classList.toggle('nav-open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // Close on nav link click
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('nav-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

// ----- Scroll-spy active nav link -----
const navSections = document.querySelectorAll('section[id]');
const navAnchors  = document.querySelectorAll('.home-nav-links a[href^="#"]');
const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const id = entry.target.id;
    navAnchors.forEach(a => {
      a.classList.toggle('nav-active', a.getAttribute('href') === '#' + id);
    });
  });
}, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
navSections.forEach(s => spyObserver.observe(s));

// ----- Smooth scroll for nav links -----
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// ----- Nav: solidify background on scroll -----
const homeNav = document.querySelector('.home-nav');
const scrollProgress = document.getElementById('scroll-progress');
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY > 60;
  homeNav && homeNav.classList.toggle('home-nav-solid', scrolled);
  const btt = document.getElementById('back-to-top');
  if (btt) btt.classList.toggle('visible', window.scrollY > 500);
  // Sticky mini-CTA: show after the hero, hide near the footer/final CTA
  const sticky = document.getElementById('sticky-cta');
  if (sticky) {
    const heroH = (document.querySelector('.hero') || {}).offsetHeight || 600;
    const nearEnd = window.scrollY + window.innerHeight > document.documentElement.scrollHeight - 700;
    sticky.classList.toggle('visible', window.scrollY > heroH && !nearEnd);
  }
  // Scroll progress bar
  if (scrollProgress) {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    scrollProgress.style.width = pct + '%';
  }
}, { passive: true });

// ----- Scroll-triggered fade-in animations -----
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('fade-in-up');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(
  '.problem-card, .feat-card, .step, .trust-card, .price-card, .faq details, .tcard, .ba-card, .spotlight'
).forEach(el => {
  el.classList.add('fade-ready');
  fadeObserver.observe(el);
});

// ----- Animated stat counters -----
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    let start = 0;
    const duration = 1200;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.add('counted');
    countObserver.unobserve(el);
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stat-num[data-count]').forEach(el => {
  el.textContent = '0';
  countObserver.observe(el);
});

// ----- ATS ring animation -----
const atsSection = document.querySelector('.float-ats');
if (atsSection) {
  const atsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const ring = document.getElementById('ats-ring-fill');
      const num  = document.getElementById('ats-num');
      if (!ring) return;
      // Animate stroke-dashoffset from 213.6 (empty) to 8.5 (96%)
      const startOffset = 213.6;
      const endOffset   = 8.5;
      const targetNum   = 96;
      let startTime = null;
      const duration = 1600;
      function animateRing(ts) {
        if (!startTime) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        ring.style.strokeDashoffset = startOffset - eased * (startOffset - endOffset);
        if (num) num.textContent = Math.floor(eased * targetNum);
        if (progress < 1) requestAnimationFrame(animateRing);
        else if (num) num.textContent = targetNum;
      }
      requestAnimationFrame(animateRing);
      atsObserver.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  atsObserver.observe(atsSection);
}

// ----- FAQ smooth animation -----
document.querySelectorAll('.faq details').forEach(detail => {
  const summary = detail.querySelector('summary');
  const content = detail.querySelector('.faq-content');
  if (!summary || !content) return;
  summary.addEventListener('click', e => {
    e.preventDefault();
    if (detail.open) {
      content.style.maxHeight = content.scrollHeight + 'px';
      requestAnimationFrame(() => { content.style.maxHeight = '0'; });
      content.addEventListener('transitionend', () => { detail.open = false; }, { once: true });
    } else {
      detail.open = true;
      content.style.maxHeight = '0';
      requestAnimationFrame(() => { content.style.maxHeight = content.scrollHeight + 'px'; });
    }
  });
});


// =========================================================
// ANIMATIONS & INTERACTIONS
// =========================================================

// ── Hero: cursor-tracking spotlight glow ──
(function () {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  hero.addEventListener('mousemove', function (e) {
    const r = hero.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width * 100).toFixed(1);
    const y = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
    hero.style.setProperty('--mx', x + '%');
    hero.style.setProperty('--my', y + '%');
  });
  hero.addEventListener('mouseleave', function () {
    hero.style.setProperty('--mx', '50%');
    hero.style.setProperty('--my', '40%');
  });
})();

// ── Hero canvas particle network (skipped when the waves background is present) ──
(function () {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (document.getElementById('hero-waves')) return; // waves.js owns the hero bg
  const canvas = document.createElement('canvas');
  canvas.id = 'hero-particles';
  hero.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W, H, dots;
  function resize() { W = canvas.width = hero.offsetWidth; H = canvas.height = hero.offsetHeight; }
  function mkDot() {
    return { x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .4,
             vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
             a: Math.random() * .55 + .15 };
  }
  function init() { resize(); dots = Array.from({ length: 55 }, mkDot); }
  let running = false, visible = true, timer = null;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = W; if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H; if (d.y > H) d.y = 0;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139,92,246,${d.a})`; ctx.fill();
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        const dist = Math.hypot(d.x - b.x, d.y - b.y);
        if (dist < 110) {
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(99,102,241,${.14 * (1 - dist / 110)})`;
          ctx.lineWidth = .6; ctx.stroke();
        }
      }
    }
    timer = setTimeout(draw, 30);
  }
  function start() { if (running) return; running = true; draw(); }
  function stop()  { running = false; clearTimeout(timer); }
  function sync()  { (visible && !document.hidden) ? start() : stop(); }
  init();
  // Only animate while the hero is on-screen and the tab is visible (saves CPU)
  new IntersectionObserver(es => { visible = es[0].isIntersecting; sync(); }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', init, { passive: true });
  start();
})();

// ── Logo wall: duplicate chips for seamless marquee ──
(function () {
  const wall = document.querySelector('.logo-wall');
  if (!wall) return;
  const chips = Array.from(wall.querySelectorAll('.logo-chip'));
  // One moving wrapper containing two identical tracks; animating the
  // wrapper by exactly -50% loops seamlessly with no chip overlap/cut.
  const marquee = document.createElement('div'); marquee.className = 'logo-marquee';
  const track1 = document.createElement('div'); track1.className = 'logo-track';
  const track2 = document.createElement('div'); track2.className = 'logo-track'; track2.setAttribute('aria-hidden', 'true');
  chips.forEach(c => track1.appendChild(c));
  chips.forEach(c => track2.appendChild(c.cloneNode(true)));
  marquee.appendChild(track1); marquee.appendChild(track2);
  wall.innerHTML = ''; wall.appendChild(marquee);
})();

// ── Parallax: hero floating cards + mock resume on scroll ──
(function () {
  const ats  = document.querySelector('.float-ats');
  const kw   = document.querySelector('.float-keywords');
  const mock = document.querySelector('.mock-resume');
  if (!ats && !kw) return;
  window.addEventListener('scroll', function () {
    const y = window.scrollY;
    if (ats)  ats.style.transform  = `translateY(${-y * .055}px)`;
    if (kw)   kw.style.transform   = `translateY(${y * .038}px)`;
    if (mock) mock.style.transform = `rotate(2deg) translateY(${-y * .025}px)`;
  }, { passive: true });
})();

// ── Feature card 3D tilt on mousemove ──
document.querySelectorAll('.feat-card').forEach(function (card) {
  card.addEventListener('mousemove', function (e) {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - .5;
    const y = (e.clientY - r.top)  / r.height - .5;
    card.style.transform = `perspective(700px) rotateX(${-y * 7}deg) rotateY(${x * 7}deg) translateY(-3px)`;
    card.style.transition = 'transform .05s ease';
  });
  card.addEventListener('mouseleave', function () {
    card.style.transform = '';
    card.style.transition = 'all .25s ease';
  });
});

// ── Problem stat: animated fill bar injected + triggered on scroll ──
(function () {
  const stat = document.querySelector('.problem-stat');
  if (!stat) return;
  // Drive the fill width from the actual stat number so the bar can never drift from
  // the label (e.g. a "98%" stat fills to 98%, not a hardcoded value).
  const big = stat.querySelector('.stat-big');
  const pct = big ? Math.max(0, Math.min(100, parseInt(big.textContent, 10) || 70)) : 70;
  const bar  = document.createElement('div'); bar.className = 'problem-bar';
  const fill = document.createElement('div'); fill.className = 'problem-bar-fill';
  bar.appendChild(fill); stat.after(bar);
  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { fill.style.width = pct + '%'; fill.classList.add('animated'); obs.unobserve(e.target); }
    });
  }, { threshold: .5 }).observe(stat);
})();

// ── Stagger fade-in delay for feature cards ──
document.querySelectorAll('.feature-grid .feat-card').forEach(function (card, i) {
  card.style.transitionDelay = (i * 0.07) + 's';
  card.addEventListener('mouseleave', function () {
    // Reset delay so hover transitions feel instant
    card.style.transitionDelay = '0s';
  });
});
// Re-add stagger after first fade completes so it's only for the scroll-in
const featObs = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (e.isIntersecting) { e.target.classList.add('fade-in-up'); featObs.unobserve(e.target); }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.feature-grid .feat-card').forEach(function (c) {
  c.classList.add('fade-ready'); featObs.observe(c);
});

// ── Pricing: sliding pill toggle ──
(function () {
  const toggle = document.querySelector('.price-toggle');
  if (!toggle) return;
  const pill = document.createElement('div');
  pill.id = 'price-toggle-pill';
  toggle.prepend(pill);
  function positionPill() {
    const active = toggle.querySelector('.pt-btn.active');
    if (!active) return;
    pill.style.left = active.offsetLeft + 'px';
    pill.style.width = active.offsetWidth + 'px';
  }
  window._positionPricePill = positionPill;
  positionPill();
  window.addEventListener('resize', positionPill, { passive: true });
})();

// ── Problem card: 3D tilt on mousemove ──
document.querySelectorAll('.problem-card').forEach(function (card) {
  card.addEventListener('mousemove', function (e) {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - .5;
    const y = (e.clientY - r.top)  / r.height - .5;
    card.style.transform = `perspective(600px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg) translateY(-3px)`;
    card.style.transition = 'transform .05s ease';
  });
  card.addEventListener('mouseleave', function () {
    card.style.transform = '';
    card.style.transition = 'all .25s ease';
  });
});

// ── Before/After: reveal "After" column + ATS score count on scroll ──
(function () {
  const baCard = document.querySelector('.ba-card');
  if (!baCard) return;
  const goodPill = baCard.querySelector('.ba-score-pill.ba-score-good');
  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      baCard.classList.add('ba-revealed');
      if (goodPill) {
        let start = null;
        const from = 34, to = 94, dur = 900;
        function animScore(ts) {
          if (!start) start = ts;
          const p = Math.min((ts - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          goodPill.textContent = 'ATS ' + Math.floor(from + eased * (to - from)) + ' / 100';
          if (p < 1) requestAnimationFrame(animScore);
          else goodPill.textContent = 'ATS 94 / 100';
        }
        setTimeout(function () { requestAnimationFrame(animScore); }, 300);
      }
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.4 }).observe(baCard);
})();

// ── Nav: close mobile menu on outside click ──
(function () {
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.querySelector('.home-nav-links');
  if (!hamburger || !navLinks) return;
  const overlay = document.createElement('div');
  overlay.className = 'nav-mobile-overlay';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function () {
    hamburger.classList.remove('open');
    navLinks.classList.remove('nav-open');
    hamburger.setAttribute('aria-expanded', 'false');
    overlay.classList.remove('active');
  });
  hamburger.addEventListener('click', function () {
    overlay.classList.toggle('active', hamburger.classList.contains('open'));
  });
})();

// ── Magnetic hero CTA buttons ──
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.hero-ctas .btn').forEach(function (btn) {
    btn.addEventListener('mousemove', function (e) {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.3}px)`;
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = '';
    });
  });
})();

// ── Section title: gradient shine sweep when scrolled into view ──
(function () {
  const titleObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      // Skip light-on-dark titles (final CTA), they use .light and look fine as-is
      if (e.target.classList.contains('light')) { titleObs.unobserve(e.target); return; }
      e.target.classList.add('shine-in');
      e.target.addEventListener('animationend', function () {
        e.target.classList.remove('shine-in');
      }, { once: true });
      titleObs.unobserve(e.target);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.section-title').forEach(function (t) { titleObs.observe(t); });
})();

// ── 3 AI tools deck: auto-fan once when it scrolls into view (discoverability) ──
(function () {
  const deck = document.querySelector('.aitools-showcase .dcards');
  if (!deck) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(max-width: 760px)').matches) return; // mobile already shows a full stack
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      // brief peek so users learn the deck is interactive, then collapse
      setTimeout(() => {
        deck.classList.add('is-hinting');
        setTimeout(() => deck.classList.remove('is-hinting'), 1400);
      }, 400);
    });
  }, { threshold: 0.5 });
  obs.observe(deck);
})();

// ── Feature cards: cursor-tracking spotlight glow ──
document.querySelectorAll('.feat-card').forEach(function (card) {
  card.addEventListener('mousemove', function (e) {
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
});

// ── Hero mockup: count-up metrics + cursor parallax tilt ──
(function () {
  var hero = document.querySelector('.hero-right');
  if (!hero) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count the % metrics up once the hero scrolls into view.
  var metrics = hero.querySelectorAll('.mock-metric');
  if (metrics.length) {
    var mObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        mObs.disconnect();
        metrics.forEach(function (el) {
          var target = parseInt(el.dataset.count, 10) || 0;
          var suffix = el.dataset.suffix || '';
          if (reduce) { el.textContent = target + suffix; return; }
          var start = null;
          (function step(ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / 1100, 1);
            el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target) + suffix;
            if (p < 1) requestAnimationFrame(step);
          })(performance.now());
        });
      });
    }, { threshold: 0.4 });
    mObs.observe(hero);
  }

  // Parallax tilt: the resume card (and its peeking second page) lean toward the
  // cursor. Float cards keep their idle bob, so we leave them alone.
  if (reduce) return;
  var card = hero.querySelector('.mock-resume');
  var stack = hero.querySelector('.mock-resume-stack');
  hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width - 0.5;
    var py = (e.clientY - r.top) / r.height - 0.5;
    if (card) card.style.transform = 'rotate(2deg) rotateX(' + (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 7).toFixed(2) + 'deg)';
    if (stack) stack.style.transform = 'rotate(5deg) translate(' + (px * 9).toFixed(1) + 'px,' + (py * 9).toFixed(1) + 'px)';
  });
  hero.addEventListener('mouseleave', function () {
    if (card) card.style.transform = 'rotate(2deg)';
    if (stack) stack.style.transform = 'rotate(5deg)';
  });
})();

// ── Spotlights: animate each mockup when it scrolls into view ──
(function () {
  var spots = document.querySelectorAll('[data-spot]');
  if (!spots.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el, target) {
    if (reduce) { el.textContent = target; return; }
    var start = null;
    (function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / 1100, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  function animateSpot(el) {
    el.querySelectorAll('.sm-count').forEach(function (c) { countUp(c, parseInt(c.dataset.count, 10) || 0); });
    var ring = el.querySelector('.sm-ring-fill');
    if (ring) { var t = parseInt(ring.dataset.target, 10) || 0; ring.style.strokeDashoffset = (314 * (1 - t / 100)).toFixed(1); }
    el.querySelectorAll('.sm-bar-fill').forEach(function (b, i) {
      var w = (parseInt(b.dataset.w, 10) || 0) + '%';
      if (reduce) { b.style.width = w; } else { setTimeout(function () { b.style.width = w; }, 120 * i); }
    });
    el.querySelectorAll('.sm-chip.ok').forEach(function (c, i) {
      if (reduce) { c.classList.add('lit'); } else { setTimeout(function () { c.classList.add('lit'); }, 150 + 120 * i); }
    });
    if (!reduce) el.querySelectorAll('.sm-bullets li').forEach(function (li, i) { setTimeout(function () { li.classList.add('hl'); }, 180 * i); });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { animateSpot(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.35 });
    spots.forEach(function (s) { io.observe(s); });
  } else { spots.forEach(animateSpot); }
})();
