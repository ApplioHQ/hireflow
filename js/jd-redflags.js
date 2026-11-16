(function (g) {
  'use strict';

  var TECH_AGES = {
    react: 2013, vue: 2014, angular: 2016, 'next.js': 2016, nextjs: 2016,
    typescript: 2012, kotlin: 2011, swift: 2014, rust: 2010, go: 2009,
    golang: 2009, docker: 2013, kubernetes: 2014, terraform: 2014,
    graphql: 2015, tailwind: 2017, svelte: 2016, deno: 2018, bun: 2022,
    'flutter': 2017, 'react native': 2015, astro: 2021, remix: 2021,
    vite: 2020, solidjs: 2021, htmx: 2020, playwright: 2020,
  };

  var PHRASE_FLAGS = [
    // Culture red flags
    [/\bwe(?:'re| are) (?:like )?a family\b/i, 'red', 'culture', '"Like a family"', 'Often means blurred boundaries, expected overtime, and guilt-tripping when you set limits.'],
    [/\bwork hard[,]? play hard\b/i, 'yellow', 'culture', '"Work hard, play hard"', 'Frequently signals long hours normalized by occasional perks.'],
    [/\b(?:rockstar|ninja|guru|wizard|unicorn|hacker)\b/i, 'yellow', 'culture', 'Buzzword title', 'Inflated titles often mask poorly defined roles or unrealistic expectations.'],
    [/\bunlimited (?:pto|paid time off|vacation)\b/i, 'yellow', 'culture', 'Unlimited PTO', 'Studies show employees at unlimited-PTO companies often take fewer days off, not more.'],
    [/\bhustle\b/i, 'yellow', 'culture', 'Hustle culture', 'Signals that overwork may be expected or celebrated.'],

    // High turnover
    [/\burgentl?y hiring\b/i, 'yellow', 'turnover', 'Urgently hiring', 'May indicate high turnover or poor planning rather than growth.'],
    [/\bimmediate(?:ly)? (?:start|join|available)\b/i, 'yellow', 'turnover', 'Immediate start required', 'Pressure to start immediately can mean the last person left abruptly.'],
    [/\bwear many hats\b/i, 'yellow', 'turnover', '"Wear many hats"', 'Often means understaffed -- you will do multiple jobs for one salary.'],
    [/\bfast[- ]paced environment\b/i, 'yellow', 'turnover', '"Fast-paced environment"', 'Vague by itself, but combined with other flags it can signal chaos over speed.'],
    [/\bhigh[- ]?pressure\b/i, 'yellow', 'turnover', 'High-pressure role', 'Explicitly stating pressure is unusual -- most jobs have some without advertising it.'],

    // Vague compensation
    [/\bcompetitive (?:salary|compensation|pay)\b/i, 'yellow', 'compensation', '"Competitive salary"', 'No actual number given. Roles with genuinely strong pay usually say so.'],
    [/\b(?:salary|compensation|pay)[\s:]*(?:DOE|depends on experience|based on experience)\b/i, 'yellow', 'compensation', 'Pay depends on experience', 'Without a range, this gives the employer full leverage in negotiation.'],
    [/\bequity[- ]?(?:only|in lieu|instead)\b/i, 'red', 'compensation', 'Equity instead of salary', 'Equity-only compensation is a major risk unless it is an early-stage startup you believe in.'],
    [/\bunpaid\b/i, 'red', 'compensation', 'Unpaid position', 'Unpaid work is a red flag for exploitation, except in clearly structured internship or volunteer contexts.'],

    // Scope creep
    [/\bother duties as (?:assigned|required|needed)\b/i, 'yellow', 'scope', '"Other duties as assigned"', 'A catch-all clause that can expand your role well beyond what was described.'],

    // Discrimination signals
    [/\byoung (?:and |& )?dynamic\b/i, 'red', 'discrimination', '"Young and dynamic" team', 'Age-coded language that may signal age discrimination.'],
    [/\bdigital native\b/i, 'red', 'discrimination', '"Digital native" required', 'A proxy for age -- this term describes a generation, not a skill.'],
    [/\bculture fit\b/i, 'yellow', 'discrimination', 'Emphasis on "culture fit"', 'Vague "culture fit" criteria can mask bias. Look for concrete values instead.'],
    [/\bnative[- ]?(?:english|speaker)\b/i, 'yellow', 'discrimination', 'Native speaker required', 'Requiring "native" fluency rather than proficiency can be discriminatory.'],
    [/\b(?:recent|new) (?:graduate|grad)\s+only\b/i, 'yellow', 'discrimination', 'Recent grads only', 'Restricting to recent graduates can be a proxy for age discrimination.'],
  ];

  function norm(s) { return String(s == null ? '' : s).toLowerCase(); }

  function extractQuote(text, rx) {
    var m = text.match(rx);
    if (!m) return '';
    var start = Math.max(0, m.index - 20);
    var end = Math.min(text.length, m.index + m[0].length + 20);
    var slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
    return (start > 0 ? '...' : '') + slice + (end < text.length ? '...' : '');
  }

  function checkTechYears(text) {
    var flags = [];
    var yearNow = new Date().getFullYear();
    var rx = /(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+(?:with|in|using)\s+)?([a-z][a-z0-9. ]{1,20})/gi;
    var m;
    while ((m = rx.exec(text)) !== null) {
      var yrs = parseInt(m[1], 10);
      var tech = m[2].trim().toLowerCase().replace(/\s+/g, ' ');
      var born = TECH_AGES[tech];
      if (!born) continue;
      var maxYrs = yearNow - born;
      if (yrs > maxYrs) {
        flags.push({
          category: 'unrealistic',
          severity: 'red',
          title: yrs + '+ years of ' + tech + ' requested',
          detail: tech.charAt(0).toUpperCase() + tech.slice(1) + ' has only existed since ' + born + ' (' + maxYrs + ' years). Nobody can have ' + yrs + '+ years.',
          quote: extractQuote(text, new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
        });
      }
    }
    return flags;
  }

  function checkTechStackBreadth(text) {
    var stacks = 'react vue angular svelte next.js nuxt ember backbone jquery'.split(' ');
    var backends = 'node django flask rails spring express fastapi laravel'.split(' ');
    var langs = 'python java javascript typescript ruby go rust php c# c++ scala kotlin swift'.split(' ');
    var t = norm(text);
    var hitFE = stacks.filter(function (s) { return t.includes(s); });
    var hitBE = backends.filter(function (s) { return t.includes(s); });
    var hitLang = langs.filter(function (s) { return new RegExp('\\b' + s.replace(/[+#]/g, '\\$&') + '\\b').test(t); });
    var flags = [];
    if (hitFE.length >= 4) {
      flags.push({ category: 'unrealistic', severity: 'yellow', title: hitFE.length + ' frontend frameworks required', detail: 'Requiring ' + hitFE.join(', ') + ' suggests the team has not decided on a stack, or expects one person to maintain all of them.', quote: '' });
    }
    if (hitLang.length >= 5) {
      flags.push({ category: 'unrealistic', severity: 'yellow', title: hitLang.length + ' programming languages listed', detail: 'Listing ' + hitLang.join(', ') + ' is unusual. Most roles focus on 2-3 languages.', quote: '' });
    }
    return flags;
  }

  function checkScopeCreep(text) {
    var roles = [
      [/\b(?:design|figma|sketch|ui\/ux|wireframe)/i, 'designer'],
      [/\b(?:devops|deploy|infrastructure|ci\/cd|terraform|kubernetes)/i, 'devops'],
      [/\b(?:data scien|machine learning|ml model|neural network)/i, 'data scientist'],
      [/\b(?:project manag|scrum master|sprint planning|stakeholder manag)/i, 'project manager'],
      [/\b(?:sales|business development|revenue target|quota)/i, 'sales'],
      [/\b(?:customer support|helpdesk|ticket resolution)/i, 'support'],
      [/\b(?:copywriting|blog post|content strateg|seo writing)/i, 'content writer'],
      [/\b(?:backend|api develop|server[- ]side|database design)/i, 'backend dev'],
      [/\b(?:frontend|ui develop|client[- ]side|react|angular|vue)/i, 'frontend dev'],
      [/\b(?:qa|test automation|quality assurance|selenium)/i, 'QA'],
    ];
    var t = norm(text);
    var hit = [];
    roles.forEach(function (pair) { if (pair[0].test(t) && hit.indexOf(pair[1]) < 0) hit.push(pair[1]); });
    if (hit.length >= 4) {
      return [{ category: 'scope', severity: 'yellow', title: 'Spans ' + hit.length + ' distinct roles', detail: 'This job touches ' + hit.join(', ') + '. That is a lot for one person.', quote: '' }];
    }
    return [];
  }

  function scanJDRedFlags(text) {
    if (!text || typeof text !== 'string' || text.trim().length < 30) {
      return { flags: [], score: 100 };
    }
    var flags = [];
    var t = norm(text);

    PHRASE_FLAGS.forEach(function (rule) {
      var rx = rule[0], sev = rule[1], cat = rule[2], title = rule[3], detail = rule[4];
      if (rx.test(t)) {
        flags.push({ category: cat, severity: sev, title: title, detail: detail, quote: extractQuote(text, rx) });
      }
    });

    flags = flags.concat(checkTechYears(text));
    flags = flags.concat(checkTechStackBreadth(text));
    flags = flags.concat(checkScopeCreep(text));

    var score = 100;
    flags.forEach(function (f) { score -= (f.severity === 'red' ? 12 : 6); });
    score = Math.max(0, score);

    return { flags: flags, score: score };
  }

  g.scanJDRedFlags = scanJDRedFlags;
})(typeof window !== 'undefined' ? window : globalThis);
