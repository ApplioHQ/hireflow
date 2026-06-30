// Client-side ATS résumé checker — pure logic, runs entirely in the browser
// (no network, no auth, no AI). Powers the public ats-checker.html tool. Scores
// raw résumé text against a job description: keyword coverage, formatting,
// quantified impact, and completeness. Node-testable via globalThis.AtsEngine.
(function (g) {
  const STOP = new Set("a an the and or but for nor of to in on at by with from as is are was were be been being this that these those you your our we they it its their will would can could should may might must do does did have has had not no if then than so into over under more most very who whom which what when where why how about after again all also any because before between both during each few here own same some too up out off down only just via per etc using use used uses including include includes work works working role roles team teams ability strong excellent good great new ideal candidate join help build builds building plus years year experience experienced required preferred responsibilities requirements skills".split(/\s+/));
  const PHRASES = ["project management","machine learning","data analysis","customer service","product management","software development","web development","cloud computing","ci/cd","unit testing","data science","user experience","quality assurance","business development","social media","supply chain","financial analysis","problem solving","time management","public speaking","team leadership","stakeholder management","continuous integration","rest api","version control"];
  const SKILLS = new Set("python java javascript typescript react angular vue node nodejs go golang rust ruby php swift kotlin scala sql nosql postgres postgresql mysql mongodb redis aws azure gcp kubernetes docker terraform linux git github graphql html css sass tailwind django flask spring express rails kafka spark hadoop tableau excel powerpoint salesforce sap jira figma photoshop seo marketing sales accounting finance leadership communication analytics agile scrum devops cybersecurity nursing teaching".split(/\s+/));
  const VERBS = new Set("led managed built created developed designed launched delivered drove increased decreased reduced improved grew scaled owned shipped implemented architected automated optimized streamlined coordinated directed founded established mentored trained negotiated analyzed researched produced generated achieved exceeded won spearheaded oversaw migrated rebuilt refactored deployed".split(/\s+/));
  const norm = s => String(s == null ? '' : s).toLowerCase();

  function extractKeywords(jd) {
    const text = norm(jd);
    if (!text.trim()) return [];
    const found = new Map();
    for (const ph of PHRASES) if (text.includes(ph)) found.set(ph, true);
    const words = text.match(/[a-z][a-z0-9+.#/]{1,}/g) || [];
    const freq = new Map();
    for (const raw of words) {
      const w = raw.replace(/^[.\-/_]+|[.\-/_]+$/g, '');
      if (w.length < 2 || STOP.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
      if (SKILLS.has(w)) found.set(w, true);
    }
    const ranked = [...freq.entries()].filter(([w]) => w.length >= 3).sort((a, b) => b[1] - a[1]);
    for (const [w] of ranked) { if (found.size >= 24) break; if (!found.has(w)) found.set(w, true); }
    return [...found.keys()].slice(0, 24);
  }

  function bulletLines(text) {
    return String(text || '').split(/\n+/)
      .map(l => l.replace(/^[\s•*\-▪◦·–—>]+/, '').trim())
      .filter(l => l.length > 0);
  }

  function score(resumeText, jd) {
    const rt = norm(resumeText);
    const hasJD = !!(jd && String(jd).trim().length >= 20);
    const kws = hasJD ? extractKeywords(jd) : [];
    const matched = [], missing = [];
    for (const k of kws) {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const present = k.includes(' ') ? rt.includes(k)
        : new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)').test(rt);
      (present ? matched : missing).push(k);
    }
    const kwScore = (hasJD && kws.length) ? Math.round(100 * matched.length / kws.length) : 50;

    const lines = bulletLines(resumeText);
    const hasEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(resumeText);
    const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(resumeText);
    const hasBullets = /(^|\n)\s*[•*\-▪◦·]/.test(resumeText) || lines.length >= 5;
    const wordCount = (resumeText.match(/\b[\w']+\b/g) || []).length;
    const lenOk = wordCount >= 150 && wordCount <= 1200;
    const sectionHits = ['experience', 'education', 'skill', 'summary', 'project'].filter(s => rt.includes(s)).length;
    const fmtChecks = [hasEmail, hasPhone, hasBullets, lenOk, sectionHits >= 2];
    const fmtScore = Math.round(100 * fmtChecks.filter(Boolean).length / fmtChecks.length);

    const quantified = lines.filter(l => /\d/.test(l)).length;
    const actionStarts = lines.filter(l => VERBS.has((l.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, ''))).length;
    const quantRatio = lines.length ? quantified / lines.length : 0;
    const actionRatio = lines.length ? actionStarts / lines.length : 0;
    const impactScore = Math.round(100 * (0.55 * Math.min(1, quantRatio / 0.4) + 0.45 * Math.min(1, actionRatio / 0.5)));

    const hasSummary = /summary|objective|profile/.test(rt);
    const hasExp = /experience|employment|work history/.test(rt);
    const hasEdu = /education|university|college|degree|b\.s\.|b\.a\.|bachelor|master/.test(rt);
    const hasSkills = /skills|technologies|proficienc|competenc/.test(rt);
    const compChecks = [hasSummary, hasExp, hasEdu, hasSkills, wordCount >= 150];
    const compScore = Math.round(100 * compChecks.filter(Boolean).length / compChecks.length);

    const w = hasJD ? { kw: .40, fmt: .20, impact: .25, comp: .15 } : { kw: .10, fmt: .30, impact: .35, comp: .25 };
    const overall = Math.max(0, Math.min(100, Math.round(kwScore * w.kw + fmtScore * w.fmt + impactScore * w.impact + compScore * w.comp)));

    const wins = [], issues = [];
    if (hasJD && matched.length) wins.push(`Matches ${matched.length} of ${kws.length} key terms from the job posting`);
    if (quantRatio >= 0.4) wins.push(`${Math.round(quantRatio * 100)}% of your lines include measurable results`);
    if (actionRatio >= 0.5) wins.push(`Most lines start with a strong action verb`);
    if (hasEmail && hasPhone) wins.push(`Contact details are clear and easy for an ATS to read`);
    if (compScore >= 80) wins.push(`All the core résumé sections are present`);
    if (hasJD && missing.length) issues.push(`Add these terms from the posting where they truly apply: ${missing.slice(0, 8).join(', ')}`);
    if (quantRatio < 0.4) issues.push(`Only ${Math.round(quantRatio * 100)}% of lines include numbers — add metrics like %, $, time saved, or scale`);
    if (actionRatio < 0.5) issues.push(`Start more bullet points with strong action verbs (Led, Built, Improved…)`);
    if (!hasEmail || !hasPhone) issues.push(`Add clear contact info — email and phone — near the top`);
    if (!hasSummary) issues.push(`Add a short professional summary at the top`);
    if (!lenOk) issues.push(wordCount < 150 ? `Your résumé looks short — add more detail to your experience` : `Your résumé is long — trim to your most relevant, recent experience`);
    if (!wins.length) wins.push(`You have a solid base to build on`);
    if (!issues.length) issues.push(`Looking strong — polish the wording and keep it concise`);

    return {
      score: overall, hasJD,
      breakdown: { keywords: kwScore, formatting: fmtScore, impact: impactScore, completeness: compScore },
      matchedKeywords: matched, missingKeywords: missing,
      wins: wins.slice(0, 4), issues: issues.slice(0, 5),
    };
  }

  g.AtsEngine = { score, extractKeywords };
})(typeof window !== 'undefined' ? window : globalThis);
