/* build-tools.js, writes the public, indexable head-term landing pages for the
   two tools that otherwise live behind auth (/cover-letter and /interview).
   These target "cover letter generator" and "interview preparation" and funnel
   into the actual tools. Reuses the same guide shell as build-rb.js. */
const fs = require('fs');
const path = require('path');
const { page } = require('./gen-rb.js');
const ROOT = path.join(__dirname, '..');

const relHub = { label: 'Free Resume Builder (all templates)', href: '/resume-builder' };
const relGuides = { label: 'All resume & job-search guides', href: '/guides' };
const relExamples = { label: 'Resume examples by job title', href: '/resume-examples' };
const relAts = { label: 'Free ATS resume checker', href: '/ats-checker' };

const pages = [
  {
    slug: 'cover-letter-generator', h1: 'Free Cover Letter Generator',
    title: 'Free Cover Letter Generator, Write One in Minutes | Applio',
    ogTitle: 'Free Cover Letter Generator',
    metaDescription: 'Free cover letter generator. Answer a few questions and get a tailored, one-page cover letter matched to the job, no fluff, no credit card, no watermark.',
    answer: 'A cover letter generator turns a job description and a few details about you into a tailored, one-page letter in minutes. Applio\'s free generator matches your experience to what the posting asks for, keeps the tone professional, and lets you edit every line before you send it.',
    sections: [
      { h2: 'How the cover letter generator works', bodyHtml: '&lt;ol&gt;&lt;li&gt;&lt;strong&gt;Paste the job posting.&lt;/strong&gt; Applio reads the role, company, and the skills it actually asks for, so the letter speaks to that job instead of sounding generic.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Add a few details.&lt;/strong&gt; Your name, target role, and one or two achievements are enough; if you already have a resume in Applio, it pulls from that automatically.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Generate and edit.&lt;/strong&gt; You get a structured draft, hook, fit, and close, that you can rewrite line by line, then export a clean copy ready to paste into any application.&lt;/li&gt;&lt;/ol&gt;' },
      { h2: 'What makes a strong cover letter', bodyHtml: '&lt;ul&gt;&lt;li&gt;&lt;strong&gt;A specific opening.&lt;/strong&gt; Name the role and one concrete reason you\'re a fit in the first two sentences; skip "I am writing to apply for."&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Evidence, not adjectives.&lt;/strong&gt; Back each claim with a quantified result from your resume rather than words like "hardworking" or "passionate."&lt;/li&gt;&lt;li&gt;&lt;strong&gt;A mirror of the job posting.&lt;/strong&gt; Use the same key skills and terms the listing uses, both so a human sees the match and so any ATS keyword screen passes.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;One page, three short paragraphs.&lt;/strong&gt; A hook, a paragraph proving fit, and a brief close with a call to action is all a hiring manager will read.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;A confident close.&lt;/strong&gt; End by stating you\'d welcome a conversation, not by apologizing or padding.&lt;/li&gt;&lt;/ul&gt;' },
      { h2: 'Cover letter mistakes to avoid', bodyHtml: '&lt;ul&gt;&lt;li&gt;Reusing one generic letter for every job, hiring managers spot it instantly, and it\'s the top reason cover letters get ignored.&lt;/li&gt;&lt;li&gt;Restating your resume line by line instead of telling the short story behind your best results.&lt;/li&gt;&lt;li&gt;Writing about what the job does for you rather than what you bring to the team.&lt;/li&gt;&lt;li&gt;Leaving in the wrong company name or role, always proofread the details a template fills in.&lt;/li&gt;&lt;/ul&gt;' }
    ],
    faq: [
      { q: 'Is the cover letter generator free?', a: 'Yes. You can generate and edit a tailored cover letter for free. Premium adds unlimited AI rewrites and downloads, but the core generator and editing are free with no credit card required.' },
      { q: 'Will the cover letter sound like a template?', a: 'It shouldn\'t. The generator writes from the specific job posting and your real achievements, and you can edit every line. The best results come from adding one or two concrete, quantified wins before you export.' },
      { q: 'Do I even need a cover letter?', a: 'When an application offers the field, a short, tailored cover letter still helps, especially for competitive roles, career changes, or when you want to explain something a resume can\'t. If a posting explicitly says not to include one, follow that.' },
      { q: 'Can it use my existing resume?', a: 'Yes. If you\'ve built or imported a resume in Applio, the generator pulls your experience and achievements automatically so you don\'t retype them.' }
    ],
    related: [relHub, { label: 'Interview preparation', href: '/interview-preparation' }, relExamples, relGuides],
    finalTitle: 'Write your cover letter now',
    finalSub: 'Free to start, no credit card, no watermark. Paste the job, add your details, and get a tailored letter in minutes.',
    finalCta: { href: '/cover-letter', label: 'Write my cover letter →' }
  },
  {
    slug: 'interview-preparation', h1: 'Interview Preparation',
    title: 'Interview Preparation, Practice Questions & Tips | Applio',
    ogTitle: 'Interview Preparation',
    metaDescription: 'Free interview preparation: research the role, rehearse answers with the STAR method, and practice the questions you\'ll actually be asked. Get interview-ready with Applio.',
    answer: 'Interview preparation means researching the company and role, rehearsing answers to likely questions using the STAR method, and practicing out loud until your delivery is calm and specific. Applio\'s free interview prep generates the questions you\'re most likely to face from a job posting and coaches your answers.',
    sections: [
      { h2: 'How to prepare for an interview', bodyHtml: '&lt;ol&gt;&lt;li&gt;&lt;strong&gt;Research the company and role.&lt;/strong&gt; Read the posting closely, learn what the team does, and note the exact skills they emphasize so your answers land on what they care about.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Predict the questions.&lt;/strong&gt; Every posting implies a set of behavioral and role-specific questions; list the ten most likely and draft a strong answer for each.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Rehearse out loud.&lt;/strong&gt; Practice answers aloud, ideally in a mock interview, so you tighten your delivery and stop relying on notes.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Prepare your own questions.&lt;/strong&gt; Have three thoughtful questions ready for the interviewer, it signals genuine interest and helps you evaluate the role.&lt;/li&gt;&lt;/ol&gt;' },
      { h2: 'The STAR method for behavioral questions', bodyHtml: '&lt;p&gt;Most "tell me about a time…" questions are best answered with STAR, which keeps you specific and concise under pressure:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;&lt;strong&gt;Situation&lt;/strong&gt;, briefly set the context: the project, the stakes, your role.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Task&lt;/strong&gt;, the specific problem or goal you were responsible for.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Action&lt;/strong&gt;, what &lt;em&gt;you&lt;/em&gt; did, in first person, focusing on your decisions and skills.&lt;/li&gt;&lt;li&gt;&lt;strong&gt;Result&lt;/strong&gt;, the measurable outcome, with a number wherever you can (time saved, revenue, users, error rate).&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Prepare four or five STAR stories from your experience and you can adapt them to most behavioral questions on the spot.&lt;/p&gt;' },
      { h2: 'Common interview questions to practice', bodyHtml: '&lt;ul&gt;&lt;li&gt;"Tell me about yourself", a 60-second pitch connecting your background to this specific role, not your life story.&lt;/li&gt;&lt;li&gt;"Why do you want this job?", tie your goals to what the company and team actually do.&lt;/li&gt;&lt;li&gt;"Tell me about a time you faced a challenge / conflict / failure", answered with STAR and a real result.&lt;/li&gt;&lt;li&gt;"What\'s your greatest strength / weakness?", a genuine answer with evidence, and for weakness, what you\'re doing about it.&lt;/li&gt;&lt;li&gt;"Where do you see yourself in a few years?", show ambition that fits the role\'s realistic path.&lt;/li&gt;&lt;li&gt;"Do you have any questions for us?", always yes; ask about the team, success in the role, or what\'s next.&lt;/li&gt;&lt;/ul&gt;' }
    ],
    faq: [
      { q: 'How should I prepare for an interview in a short time?', a: 'Prioritize three things: re-read the job posting and match your top achievements to it, prepare four STAR stories you can adapt to most behavioral questions, and rehearse your "tell me about yourself" answer out loud. Those cover the majority of what you\'ll be asked.' },
      { q: 'What is the STAR method?', a: 'STAR is a structure for answering behavioral questions: describe the Situation, the Task you owned, the Action you took, and the measurable Result. It keeps answers specific and concise instead of rambling.' },
      { q: 'What questions should I ask the interviewer?', a: 'Ask about what success looks like in the role, the biggest challenge the team faces, and what the first few months would look like. Thoughtful questions signal real interest and help you decide if the job fits you.' },
      { q: 'Is Applio\'s interview prep free?', a: 'Yes. You can generate role-specific practice questions and get feedback on your answers for free, so you can rehearse the interview you\'re actually about to have.' }
    ],
    related: [{ label: 'Free cover letter generator', href: '/cover-letter-generator' }, relHub, relExamples, relGuides],
    finalTitle: 'Practice the interview you\'re about to have',
    finalSub: 'Free interview prep tailored to the job. Generate likely questions, rehearse your answers, and walk in ready.',
    finalCta: { href: '/interview', label: 'Start interview prep →' }
  }
];

pages.forEach(p => {
  p.crumbNav = '';
  p.crumbParent = [];
  fs.writeFileSync(path.join(ROOT, p.slug + '.html'), page(p));
});
console.log('Generated:', pages.map(p => p.slug).join(', '));
