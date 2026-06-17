// ============ Applio home page interactivity ============

// ----- Rotating hero word -----
const ROTATOR_WORDS = ['Interviews', 'Offers', 'Callbacks', 'Opportunities'];
let rotIdx = 0;
const rotEl = document.getElementById('hero-rotator');
function rotateWord() {
  if (!rotEl) return;
  rotIdx = (rotIdx + 1) % ROTATOR_WORDS.length;
  rotEl.style.opacity = '0';
  rotEl.style.transform = 'translateY(-12px)';
  setTimeout(() => {
    rotEl.textContent = ROTATOR_WORDS[rotIdx];
    rotEl.style.transition = 'opacity .35s, transform .35s';
    rotEl.style.opacity = '1';
    rotEl.style.transform = 'translateY(0)';
  }, 300);
}
if (rotEl) {
  rotEl.style.transition = 'opacity .35s, transform .35s';
  setInterval(rotateWord, 2400);
}

// ----- Pricing toggle (Monthly / Lifetime) -----
function setPriceMode(mode) {
  document.querySelectorAll('.pt-btn').forEach(b => b.classList.toggle('active', b.dataset.plan === mode));
  const name   = document.getElementById('paid-name');
  const price  = document.getElementById('paid-price');
  const period = document.getElementById('paid-period');
  const sub    = document.getElementById('paid-sub');
  const cta    = document.getElementById('paid-cta');
  const savings = document.getElementById('price-savings');
  if (mode === 'lifetime') {
    if (name)   name.textContent   = 'Lifetime';
    if (price)  price.textContent  = '$39.99';
    if (period) period.textContent = ' once';
    if (sub)    sub.textContent    = 'Pay once. Use forever.';
    if (cta)    cta.textContent    = 'Buy Lifetime';
    if (savings) savings.textContent = '🎉 Save $79.89 vs. 12 months of monthly';
  } else {
    if (name)   name.textContent   = 'Premium';
    if (price)  price.textContent  = '$9.99';
    if (period) period.textContent = '/month';
    if (sub)    sub.textContent    = 'Best for serious job seekers';
    if (cta)    cta.textContent    = 'Go Premium';
    if (savings) savings.textContent = '';
  }
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
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY > 60;
  homeNav && homeNav.classList.toggle('home-nav-solid', scrolled);
  const btt = document.getElementById('back-to-top');
  if (btt) btt.classList.toggle('visible', window.scrollY > 500);
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
  '.problem-card, .feat-card, .step, .trust-card, .price-card, .faq details, .tcard, .ba-card'
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
    countObserver.unobserve(el);
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stat-num[data-count]').forEach(el => countObserver.observe(el));

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

// ----- Live activity ticker -----
const TICKER_MSGS = [
  'Sarah from Austin just built her resume in 28 seconds 🎉',
  'Alex got an interview at Google after using Applio 🚀',
  'Priya\'s ATS score jumped from 54 → 91 just now ✨',
  'James landed 3 offers in 6 weeks using AI tailoring 🏆',
  '127 resumes built in the last hour ⚡',
  'Maria just downloaded her polished PDF in 1 click 📄',
  'David\'s resume is now optimized for Product Manager roles 🎯',
  'Aisha went from 0 callbacks to 4 interviews this week 🙌',
];
let tickerIdx = 0;
const tickerEl = document.getElementById('ticker-msg');
if (tickerEl) {
  setInterval(() => {
    tickerIdx = (tickerIdx + 1) % TICKER_MSGS.length;
    tickerEl.style.opacity = '0';
    setTimeout(() => {
      tickerEl.textContent = TICKER_MSGS[tickerIdx];
      tickerEl.style.opacity = '1';
    }, 300);
  }, 5000);
}
