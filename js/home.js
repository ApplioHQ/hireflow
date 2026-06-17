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
  const name = document.getElementById('paid-name');
  const price = document.getElementById('paid-price');
  const period = document.getElementById('paid-period');
  const sub = document.getElementById('paid-sub');
  const cta = document.getElementById('paid-cta');
  if (mode === 'lifetime') {
    name.textContent = 'Lifetime';
    price.textContent = '$39.99';
    period.textContent = ' once';
    sub.textContent = 'Pay once. Use forever.';
    cta.textContent = 'Buy Lifetime';
  } else {
    name.textContent = 'Premium';
    price.textContent = '$9.99';
    period.textContent = '/month';
    sub.textContent = 'Best for serious job seekers';
    cta.textContent = 'Go Premium';
  }
}

// ----- Testimonial carousel -----
const TESTIMONIALS = [
  { quote: '"I was skeptical about AI resumes, but the ATS score went from 42 to 96. Got my dream job within a month."',
    name: 'Marcus T.', role: 'Product Manager at Stripe', pill: 'ATS: 42 → 96', avatar: '👨‍💼' },
  { quote: '"Applio rewrote my bullets with actual numbers I forgot to mention. Recruiter called within a week."',
    name: 'Priya S.', role: 'Senior Designer at Figma', pill: 'ATS: 58 → 92', avatar: '👩‍🎨' },
  { quote: '"The interview prep generated questions that came up almost verbatim. I felt prepared, not panicked."',
    name: 'James K.', role: 'Software Engineer at Airbnb', pill: 'Offers: 3 in 6 weeks', avatar: '👨‍💻' },
  { quote: '"Switched from a $400 resume writer to Applio. Better output, faster, and a fraction of the price."',
    name: 'Aisha R.', role: 'Marketing Lead at Notion', pill: 'ATS: 64 → 98', avatar: '👩‍💼' },
  { quote: '"As a new grad, I had no idea what ATS even meant. Applio scored my resume and told me exactly what to fix."',
    name: 'Dev P.', role: 'New Grad → Data Analyst', pill: 'ATS: 31 → 89', avatar: '🧑‍🎓' },
];
let tIdx = 0;
function renderTestimonial() {
  const t = TESTIMONIALS[tIdx];
  document.getElementById('t-quote').textContent = t.quote;
  document.getElementById('t-name').textContent = t.name;
  document.getElementById('t-role').textContent = t.role;
  document.getElementById('t-pill').textContent = t.pill;
  document.getElementById('t-avatar').textContent = t.avatar;
  const dots = document.getElementById('t-dots');
  dots.innerHTML = TESTIMONIALS.map((_, i) =>
    `<span class="${i === tIdx ? 'active' : ''}" onclick="goTestimonial(${i})"></span>`
  ).join('');
}
function testimonialNext() { tIdx = (tIdx + 1) % TESTIMONIALS.length; renderTestimonial(); }
function testimonialPrev() { tIdx = (tIdx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length; renderTestimonial(); }
function goTestimonial(i) { tIdx = i; renderTestimonial(); }
renderTestimonial();
setInterval(testimonialNext, 7000);

// ----- Countdown to a fixed target so it persists across reloads -----
// Resets every day at midnight UTC for the next day's "limited offer".
function tickCountdown() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diff = Math.max(0, Math.floor((tomorrow - now) / 1000));
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  const eh = document.getElementById('cd-h');
  const em = document.getElementById('cd-m');
  const es = document.getElementById('cd-s');
  if (eh) eh.textContent = h;
  if (em) em.textContent = m;
  if (es) es.textContent = s;
}
tickCountdown();
setInterval(tickCountdown, 1000);

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
  '.problem-card, .feat-card, .step, .trust-card, .price-card, .faq details, .sol-item'
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
