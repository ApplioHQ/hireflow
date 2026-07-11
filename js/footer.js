/* footer.js — one shared site footer, injected on public pages for consistent
   internal linking (SEO) + trust signals. Uses the design tokens from styles.css,
   so it adapts to light/dark automatically. Skips pages that already have a
   <footer> (e.g. the landing page has its own). */
(function () {
  if (document.querySelector('footer.app-footer') || document.querySelector('.home-footer')) return;

  var YEAR = new Date().getFullYear();
  var css = ''
    + '.app-footer{border-top:1px solid var(--border);margin-top:64px;padding:44px 20px 30px;color:var(--muted);font-size:13.5px;background:var(--bg-1);} '
    + '.app-footer-in{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:28px;} '
    + '@media(max-width:720px){.app-footer-in{grid-template-columns:1fr 1fr;gap:22px;}} '
    + '.app-footer-brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px;color:var(--text);} '
    + '.app-footer-brand img{width:26px;height:26px;border-radius:7px;} '
    + '.app-footer-tag{margin-top:10px;line-height:1.55;max-width:260px;} '
    + '.app-footer h4{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text);margin:2px 0 12px;} '
    + '.app-footer a{display:block;color:var(--muted);padding:4px 0;transition:color .15s;} '
    + '.app-footer a:hover{color:var(--accent);} '
    + '.app-footer-bot{max-width:1080px;margin:30px auto 0;padding-top:20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:12.5px;} '
    + '.app-footer-bot a{display:inline;} ';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var html = ''
    + '<div class="app-footer-in">'
    +   '<div>'
    +     '<div class="app-footer-brand"><img src="/logo.jpeg" alt="Applio"> Applio</div>'
    +     '<div class="app-footer-tag">Your AI career copilot — build ATS-optimized resumes, tailor them to any job, and land more interviews.</div>'
    +   '</div>'
    +   '<div><h4>Product</h4>'
    +     '<a href="/resume-builder">Resume Builder</a>'
    +     '<a href="/resume-templates">Resume Templates</a>'
    +     '<a href="/ats-checker">Free ATS Checker</a>'
    +     '<a href="/cover-letter-generator">Cover Letter Generator</a>'
    +     '<a href="/interview-preparation">Interview Prep</a>'
    +     '<a href="/resume-examples">Resume Examples</a>'
    +     '<a href="/guides">Guides</a>'
    +     '<a href="/blog">Blog</a>'
    +     '<a href="/pricing">Pricing</a>'
    +   '</div>'
    +   '<div><h4>Get started</h4>'
    +     '<a href="/login?mode=signup">Build a resume free</a>'
    +     '<a href="/login">Sign in</a>'
    +     '<a href="/editor">Resume Builder</a>'
    +   '</div>'
    +   '<div><h4>Company</h4>'
    +     '<a href="/privacy">Privacy</a>'
    +     '<a href="/terms">Terms</a>'
    +     '<a href="/.well-known/security.txt">Security</a>'
    +   '</div>'
    + '</div>'
    + '<div class="app-footer-bot">'
    +   '<span>© ' + YEAR + ' Applio · Built for job seekers everywhere</span>'
    +   '<span style="display:inline-flex;align-items:center;gap:7px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.8;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Data encrypted · PBKDF2-hashed passwords · Never sold</span>'
    + '</div>';

  var footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = html;
  document.body.appendChild(footer);
})();
