/* geo-speakable.js, add SpeakableSpecification to each guide's Article schema.
   Speakable tells voice assistants and AI answer engines which part of the page is
   the canonical, quotable answer. We point it at the H1 and the .gd-answer lead block
   (the direct answer we already render at the top of every guide). Idempotent. */
const fs = require('fs');
const path = require('path');

const GUIDES = path.join(__dirname, '..', 'guides');
const SPEAKABLE = '  "speakable": { "@type": "SpeakableSpecification", "cssSelector": ["h1", ".gd-answer"] },\n';

let changed = 0, skipped = 0;
for (const file of fs.readdirSync(GUIDES)) {
  if (!file.endsWith('.html') || file === 'index.html') continue;
  const p = path.join(GUIDES, file);
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('SpeakableSpecification')) { skipped++; continue; }
  // Insert right after the first `"inLanguage": "en",` line (which lives in the
  // Article block on every guide), keeps the JSON valid and the change surgical.
  const anchor = '"inLanguage": "en",\n';
  const idx = html.indexOf(anchor);
  if (idx === -1) { console.log('  no anchor:', file); skipped++; continue; }
  const insertAt = idx + anchor.length;
  html = html.slice(0, insertAt) + SPEAKABLE + html.slice(insertAt);
  fs.writeFileSync(p, html);
  changed++;
}
console.log(`speakable: ${changed} guides updated, ${skipped} skipped`);
