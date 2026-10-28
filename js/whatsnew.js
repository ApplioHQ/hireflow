/* whatsnew.js, a one-time "what's new" popup shown to signed-in users after they
   land post-login. Shows once per VERSION: bump VERSION when a new batch of
   updates ships and returning users see it on their next visit. Brand-new signups
   are skipped (they're already being onboarded on current features) but still have
   the version marked so they don't see it afterward. Pure vanilla, no deps. */
(function () {
  'use strict';

  var VERSION = '2026-10c';   // bump this to re-show after the next batch of updates

  function ls(get, k, v) { try { return get ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { return null; } }

  var token = ls(true, 'hf_token');
  if (!token) return;                                   // signed-in only
  if (ls(true, 'hf_whatsnew_seen') === VERSION) return; // already shown this batch

  // Brand-new signup: onboarding introduces the current feature set, so don't
  // double up. Mark seen so it never appears for this batch.
  if (ls(true, 'hf_onboard_new')) { ls(false, 'hf_whatsnew_seen', VERSION); return; }

  var ITEMS = [
    { tint: 'accent', title: 'Skill Gap Coach redesign',
      desc: 'Centered hero layout, step cards, fuzzy-matched gaps with staggered animations, and one-click add to resume.',
      svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>' },
    { tint: 'success', title: 'Brag Doc redesign',
      desc: 'Feature cards, cleaner toolbar, and fade-up animations for your accomplishment sheet.',
      svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
    { tint: 'warn', title: 'Smarter command palette',
      desc: 'Fuzzy search, keyboard shortcut hints, match highlighting, and a smoother open/close animation.',
      svg: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
    { tint: 'accent', title: 'Six tools redesigned this month',
      desc: 'Salary, interview prep, autopilot, best match, skill gap, and brag doc all share a consistent new layout.',
      svg: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>' },
  ];

  var TINTS = {
    accent: { bg: 'rgba(109,77,252,.16)', fg: '#a5b4fc' },
    success: { bg: 'rgba(34,197,94,.14)', fg: '#4ade80' },
    warn: { bg: 'rgba(245,158,11,.14)', fg: '#fbbf24' },
  };

  function ico(paths, color, size) {
    return '<svg width="' + (size || 19) + '" height="' + (size || 19) + '" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function show() {
    if (document.getElementById('wn-overlay')) return;

    var style = document.createElement('style');
    style.textContent =
      '#wn-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,6,20,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .22s ease;}'
      + '#wn-overlay.in{opacity:1;}'
      + '.wn-card{width:100%;max-width:440px;background:var(--bg-1);border:1px solid var(--border);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);padding:24px;position:relative;transform:translateY(12px) scale(.98);transition:transform .24s cubic-bezier(.2,.8,.2,1);}'
      + '#wn-overlay.in .wn-card{transform:none;}'
      + '.wn-x{position:absolute;top:14px;right:14px;width:30px;height:30px;border:none;background:transparent;color:var(--muted);cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;}'
      + '.wn-x:hover{background:var(--bg-2);color:var(--text);}'
      + '.wn-head{text-align:center;margin-bottom:18px;}'
      + '.wn-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(109,77,252,.14);color:#a5b4fc;font-size:11.5px;font-weight:700;letter-spacing:.04em;padding:4px 10px;border-radius:999px;}'
      + '.wn-h{margin:10px 0 4px;font-size:19px;font-weight:800;letter-spacing:-.3px;}'
      + '.wn-sub{margin:0 0 16px;font-size:14px;color:var(--muted);line-height:1.5;}'
      + '.wn-item{display:flex;gap:13px;padding:13px 0;border-top:1px solid var(--border);}'
      + '.wn-item:last-of-type{border-bottom:1px solid var(--border);}'
      + '.wn-ico{width:38px;height:38px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;}'
      + '.wn-it-title{font-size:14.5px;font-weight:700;}'
      + '.wn-it-desc{font-size:13px;color:var(--muted);line-height:1.5;margin-top:2px;}'
      + '.wn-cta{width:100%;margin-top:20px;padding:11px;border-radius:var(--r-md);border:none;background:var(--accent);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .16s ease,transform .1s;}'
      + '.wn-cta:hover{background:var(--accent-hover);}'
      + '.wn-cta:active{transform:scale(.98);}'
      + '@media (prefers-reduced-motion: reduce){#wn-overlay,.wn-card{transition:none;}}';
    document.head.appendChild(style);

    var items = ITEMS.map(function (it) {
      var t = TINTS[it.tint] || TINTS.accent;
      return '<div class="wn-item"><div class="wn-ico" style="background:' + t.bg + ';">' + ico(it.svg, t.fg) + '</div>'
        + '<div><div class="wn-it-title">' + it.title + '</div>'
        + '<div class="wn-it-desc">' + it.desc + '</div></div></div>';
    }).join('');

    var ov = document.createElement('div');
    ov.id = 'wn-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', "What's new in Applio");
    ov.innerHTML =
      '<div class="wn-card">'
      + '<button class="wn-x" type="button" aria-label="Close">' + ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 'currentColor', 18) + '</button>'
      + '<div class="wn-head">'
      +   '<span class="wn-badge">' + ico('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>', '#a5b4fc', 13) + ' Just shipped</span>'
      +   '<h2 class="wn-h">What\'s new in Applio</h2>'
      +   '<p class="wn-sub">Every tool got a fresh redesign this month.</p>'
      + '</div>'
      + items
      + '<button class="wn-cta" type="button" data-wn-close>Got it</button>'
      + '</div>';
    document.body.appendChild(ov);

    function markSeen() { ls(false, 'hf_whatsnew_seen', VERSION); }
    function close() {
      markSeen();
      ov.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { ov.remove(); }, 230);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    ov.querySelector('.wn-x').onclick = close;
    ov.querySelector('[data-wn-close]').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(function () { ov.classList.add('in'); });
  }

  // Let the page settle (and any onboarding/first-run overlay take priority) first.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 900); });
  else setTimeout(show, 900);
})();
