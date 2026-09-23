var API = 'https://hireflow-api.pritamavuthu7.workers.dev';
var SITE = 'https://appliohq.com';

function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function msg(text, kind) { var m = $('msg'); m.textContent = text || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); }

// Extraction function injected into the active tab. Handles the major job boards
// with site-specific selectors, then falls back to Open Graph / <title>.
function extractJob() {
  function txt(sel) { var el = document.querySelector(sel); return el ? (el.textContent || '').trim() : ''; }
  var host = location.hostname;
  var title = '', company = '', loc = '';

  if (host.indexOf('linkedin.com') > -1) {
    title = txt('.job-details-jobs-unified-top-card__job-title') || txt('.top-card-layout__title') || txt('h1');
    company = txt('.job-details-jobs-unified-top-card__company-name') || txt('.topcard__org-name-link') || txt('.topcard__flavor');
    loc = txt('.job-details-jobs-unified-top-card__bullet') || txt('.topcard__flavor--bullet');
  } else if (host.indexOf('indeed.') > -1) {
    title = txt('[data-testid="jobsearch-JobInfoHeader-title"]') || txt('h1.jobsearch-JobInfoHeader-title') || txt('h1');
    company = txt('[data-testid="inlineHeader-companyName"]') || txt('[data-company-name]');
    loc = txt('[data-testid="jobsearch-JobInfoHeader-companyLocation"]') || txt('[data-testid="inlineHeader-companyLocation"]');
  } else if (host.indexOf('greenhouse.io') > -1 || host.indexOf('boards.greenhouse') > -1) {
    title = txt('.app-title') || txt('h1');
    company = txt('.company-name') || txt('.company-header');
    loc = txt('.location');
  } else if (host.indexOf('lever.co') > -1) {
    title = txt('.posting-headline h2') || txt('h2');
    company = (document.querySelector('.main-header-logo img') || {}).alt || '';
    loc = txt('.posting-categories .location') || txt('.sort-by-location');
  } else if (host.indexOf('ashbyhq.com') > -1) {
    title = txt('h1');
    company = (document.querySelector('meta[property="og:site_name"]') || {}).content || '';
  } else if (host.indexOf('workday') > -1 || host.indexOf('myworkdayjobs') > -1) {
    title = txt('[data-automation-id="jobPostingHeader"]') || txt('h1');
    loc = txt('[data-automation-id="locations"]');
  } else if (host.indexOf('glassdoor.') > -1) {
    title = txt('[data-test="job-title"]') || txt('h1');
    company = txt('[data-test="employer-name"]');
    loc = txt('[data-test="location"]');
  }

  // Fallbacks
  function meta(p) { var el = document.querySelector('meta[property="' + p + '"], meta[name="' + p + '"]'); return el ? el.content : ''; }
  if (!title) title = meta('og:title') || document.title.split(' - ')[0].split(' | ')[0].trim();
  if (!company) {
    var og = meta('og:site_name');
    if (og) company = og;
    else {
      var parts = document.title.split(/ [-|] /);
      if (parts.length > 1) company = parts[parts.length - 1].trim();
    }
  }
  return { title: title.slice(0, 160), company: company.slice(0, 120), location: loc.slice(0, 120), url: location.href };
}

function getToken() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(['hf_token'], function (r) { resolve(r.hf_token || null); });
  });
}

function api(path, method, body, token) {
  return fetch(API + path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
  });
}

var TOKEN = null;

function init() {
  getToken().then(function (token) {
    if (!token) { show('signin'); return; }
    TOKEN = token;
    show('form');
    // Extract job from the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) { return; }
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJob }, function (res) {
        if (chrome.runtime.lastError || !res || !res[0]) return;
        var job = res[0].result || {};
        if (job.title) $('f-title').value = job.title;
        if (job.company) $('f-company').value = job.company;
        if (job.location) $('f-location').value = job.location;
        window._jobUrl = job.url || (tab.url || '');
      });
    });
  });
}

$('go-signin').addEventListener('click', function () {
  chrome.tabs.create({ url: SITE + '/login' });
});
$('open-tracker').addEventListener('click', function () {
  chrome.tabs.create({ url: SITE + '/jobs' });
});

$('save').addEventListener('click', function () {
  var title = $('f-title').value.trim();
  var company = $('f-company').value.trim();
  if (!title || !company) { msg('Title and company are required.', 'err'); return; }
  var btn = $('save'); btn.disabled = true; btn.textContent = 'Saving…';

  // Load current jobs, append, save back (mirrors the tracker's format).
  api('/jobs', 'GET', null, TOKEN).then(function (doc) {
    var jobs = (doc && Array.isArray(doc.jobs)) ? doc.jobs : [];
    var now = Date.now();
    // Avoid duplicates by URL
    var url = window._jobUrl || '';
    if (url && jobs.some(function (j) { return j.notes === url || j.url === url; })) {
      throw new Error('This job is already in your tracker.');
    }
    jobs.unshift({
      id: now, addedAt: now, statusAt: now,
      title: title, company: company,
      location: $('f-location').value.trim(),
      status: $('f-status').value,
      notes: url, jd: ''
    });
    return api('/jobs', 'POST', { jobs: jobs, updatedAt: now }, TOKEN);
  }).then(function () {
    msg('Saved to your tracker!', 'ok');
    btn.textContent = 'Saved ✓';
    setTimeout(function () { btn.disabled = false; btn.textContent = 'Save to my tracker'; }, 1600);
  }).catch(function (e) {
    msg(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Save to my tracker';
  });
});

init();
