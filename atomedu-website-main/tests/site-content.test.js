import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const marketingPages = ['index.html', 'features.html', 'learn.html', 'about.html', 'contact.html', 'legal.html'];
const pages = [...marketingPages, 'proof-lab.html', 'art-contest.html', 'judging.html'];
const expectedNav = [
  ['Home', '/'],
  ['Features', '/features'],
  ['Learn', '/learn'],
  ['Art contest', '/art-contest'],
  ['About', '/about'],
  ['Contact', '/contact'],
  ['Start math', '/proof-lab'],
];
const pageRoutes = new Map([
  ['index.html', '/'], ['features.html', '/features'], ['learn.html', '/learn'],
  ['about.html', '/about'], ['contact.html', '/contact'],
]);

function read(page) { return readFileSync(resolve(root, page), 'utf8'); }
function links(markup) {
  return [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, label]) => [
    label.replace(/<[^>]*>/g, '').trim(),
    attrs.match(/\bhref="([^"]+)"/)?.[1],
  ]);
}

for (const page of ['art-contest.html', 'judging.html']) {
  test(`${page} shares the public navigation and footer, including Contact and Art contest`, () => {
    const html = read(page);
    const desktop = html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    const mobile = html.match(/<div class="mobile-nav"[^>]*>\s*<div class="inner">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(desktop, 'desktop navigation exists');
    assert.ok(mobile, 'mobile navigation exists');
    assert.deepEqual(links(desktop), expectedNav);
    assert.deepEqual(links(mobile), expectedNav);
    assert.match(html, /<footer class="site-footer">/);
    assert.match(html, /<div class="footer-banner">/);
    assert.match(html, /<div class="footer-cols">/);
    assert.match(html, /href="\/contact">Contact<\/a>/);
    assert.match(html, /site\.js/);
    assert.doesNotMatch(html, /class="(?:contest-footer|judge-footer|judge-header)"/);
  });
}

test('contest and judging use the exact shared site footer', () => {
  const footer = (page) => read(page).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
  const shared = footer('index.html');
  assert.ok(shared);
  for (const page of ['art-contest.html', 'judging.html']) assert.equal(footer(page), shared);
});

for (const page of marketingPages) {
  test(`${page} shares the complete Proof Lab navigation and honest product copy`, () => {
    const html = read(page);
    const desktop = html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1];
    const mobile = html.match(/<div class="mobile-nav"[^>]*>\s*<div class="inner">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(desktop, 'desktop navigation exists');
    assert.ok(mobile, 'mobile navigation exists');
    assert.deepEqual(links(desktop), expectedNav);
    assert.deepEqual(links(mobile), expectedNav);
    if (pageRoutes.has(page)) {
      const route = pageRoutes.get(page).replace('/', '\\/');
      assert.match(desktop, new RegExp(`data-nav="${route}"`));
      assert.match(mobile, new RegExp(`data-nav="${route}"`));
    }
    assert.match(html, /<footer class="site-footer">/);
    assert.match(html, /Bring the math\. Show the proof\./);
    assert.match(html, /<a class="btn btn-accent" href="\/proof-lab">Start math<\/a>/);
    assert.doesNotMatch(html, /<a\b[^>]*href="[^"]+\.html(?:[#?"])/, 'public links use clean routes');
    assert.doesNotMatch(html, /[—–·]/, 'public copy avoids dash and dot separators');
    assert.doesNotMatch(html, /\bphysics\b|five modes|math lab/i);
  });
}

test('Proof Lab has a dedicated dark app header and access back to the site', () => {
  const html = read('proof-lab.html');
  assert.match(html, /<header class="lab-topbar">/);
  assert.match(html, /class="lab-topbar-brand" href="\/"/);
  assert.match(html, /class="lab-back" href="\/"/);
  assert.match(html, /id="language-menu-button"/);
  assert.match(html, /data-language="en"/);
  assert.match(html, /data-language="es"/);
  assert.match(html, /id="tour-menu-button"/);
  assert.match(html, /id="tour-dialog"/);
  assert.match(html, /data-tour-view="generate"/);
  assert.match(html, /id="tour-examples"/);
  assert.match(html, /id="graph-sidebar-host"/);
  assert.match(html, /class="lab-art-link" href="\/art-contest"/);
  assert.doesNotMatch(html, /<footer class="site-footer">/);
});

test('all local public-page links point to real pages and valid anchors', () => {
  for (const page of pages) {
    for (const [, target] of read(page).matchAll(/\bhref="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:)/.test(target)) continue;
      const [pathname, fragment] = target.split('#');
      const cleanPath = pathname.split('?')[0];
      const destination = cleanPath === '' ? page : cleanPath === '/' ? 'index.html'
        : cleanPath.startsWith('/') && /\.[a-z0-9]+$/i.test(cleanPath) ? cleanPath.slice(1)
        : cleanPath.startsWith('/') ? `${cleanPath.slice(1)}.html` : cleanPath;
      assert.ok(existsSync(resolve(root, destination)), `${page}: missing ${target}`);
      if (fragment) assert.match(read(destination), new RegExp(`\\bid="${fragment}"`), `${page}: missing #${fragment}`);
    }
  }
});

test('the former Math Lab URL forwards to Proof Lab', () => {
  const old = read('math-lab.html');
  assert.match(old, /http-equiv="refresh" content="0; url=\/proof-lab"/);
  assert.match(old, /href="\/proof-lab"/);
});

test('legacy demos forward into the current proof tool', () => {
  assert.match(read('demo-stepgrader.html'), /http-equiv="refresh" content="0;url=\/proof-lab#check"/);
  assert.match(read('lab-projectile.html'), /http-equiv="refresh" content="0;url=\/proof-lab"/);
});

test('home carousel uses three distinct backgrounds', () => {
  const home = read('index.html');
  assert.match(home, /Live launch \| Friday, November 20, 2026 \| 7:00 PM CST/);
  assert.match(home, /atomEDU launches tonight at 7 PM CST\./);
  assert.match(home, /Join the launch stream for the official release of Proof Lab\./);
  assert.match(home, /id="launch"/);
  assert.match(home, /Online launch stream/);
  assert.match(home, /images\/bg1\.png/);
  assert.match(home, /images\/bg2\.jpg/);
  assert.match(home, /images\/bg3\.jpg/);
  assert.doesNotMatch(home, /images\/bg[23]\.svg/);
  assert.ok(existsSync(resolve(root, 'images/bg2.jpg')));
  assert.ok(existsSync(resolve(root, 'images/bg3.jpg')));
  assert.match(home, /Cosmic Cliffs in the Carina Nebula\. NASA, ESA, CSA, STScI\. Accessed November 11 2026 by Awasthi\./);
  assert.match(home, /Cape Mallow by AJ Higgs, CC BY 4\.0, via Wikimedia Commons\. Accessed November 11 2026 by Awasthi\./);
});

test('public pages expose canonical discovery metadata and a crawlable site map', () => {
  const canonicalByPage = new Map([
    ['index.html', 'https://atom-edu.org/'],
    ['features.html', 'https://atom-edu.org/features'],
    ['learn.html', 'https://atom-edu.org/learn'],
    ['about.html', 'https://atom-edu.org/about'],
    ['contact.html', 'https://atom-edu.org/contact'],
    ['legal.html', 'https://atom-edu.org/legal'],
    ['proof-lab.html', 'https://atom-edu.org/proof-lab'],
    ['art-contest.html', 'https://atom-edu.org/art-contest'],
  ]);
  for (const [page, canonical] of canonicalByPage) {
    const html = read(page);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replaceAll('.', '\\.')}`));
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:image" content="https:\/\/atom-edu\.org\/images\/atomedu-social\.png"/);
    assert.match(html, /name="robots" content="index, follow/);
  }
  assert.ok(existsSync(resolve(root, '404.html')));
  assert.match(read('404.html'), /This step does not follow\./);
  assert.match(read('404.html'), /name="robots" content="noindex, follow"/);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/atom-edu\.org\/sitemap\.xml/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/atom-edu\.org\/proof-lab<\/loc>/);
  assert.match(read('llms.txt'), /not an AI chat wrapper/i);
});

test('home explains the in-house engine and the role of partners and integrations', () => {
  const home = read('index.html');
  assert.match(home, /Proof Lab is not a chat interface placed over somebody else's model/);
  assert.match(home, /Partners build trust\. Integrations prove utility\./);
  assert.match(home, /Is atomEDU an AI wrapper\?/);
  assert.match(home, /"@type": "FAQPage"/);
  assert.match(home, /"@type": "Event"/);
});

test('home presents compact partner logos without the former VC Boom pill', () => {
  const home = read('index.html');
  assert.match(home, /Our featured partners/i);
  assert.match(home, /class="partner-logo-row"/);
  assert.match(home, /images\/vc-boom-partner-logo\.svg/);
  assert.match(home, /images\/medaestheticsos-partner-badge\.svg/);
  assert.match(home, /https:\/\/vcboom\.com\/\?promo=PARTNER-ATOMEDU/);
  assert.doesNotMatch(home, /Official VC Boom partner/);
  assert.match(home, /class="wrap home-dual"/);
  assert.doesNotMatch(home, /No account, API key, or paid tier is needed to use Proof Lab/);
});

test('Classroom integration is separate from featured partners and uses the official icon', () => {
  const home = read('index.html');
  const icon = readFileSync(resolve(root, 'images/google-classroom-icon.png'));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(home.indexOf('id="integrations-title"') > home.indexOf('id="partners-title"'));
  assert.match(home, /For use with Google Classroom™/);
  assert.match(home, /images\/google-classroom-icon\.png/);
  assert.match(home, /atomEDU is not affiliated with or endorsed by Google/);
  assert.match(home, /href="\/proof-lab#graph"/);
  const app = read('math-lab.js');
  assert.match(app, /buildGraphShareUrl\(\{ \.\.\.state, expressions \}, 'https:\/\/atom-edu\.org\/'\)/);
  assert.match(app, /Copy graph link/);
  assert.match(app, /navigator\.clipboard\.writeText\(graphUrl\)/);
  assert.match(app, /urlInput\.value = graphUrl/);
  assert.match(app, /urlRow\.hidden = false/);
  assert.match(app, /urlRow\.hidden = true/);
  assert.match(app, /classroom\.google\.com\/share/);
  assert.match(read('proof-lab.html'), /id="graph"/);
});

test('home integration cards use a responsive grid and label unavailable connections', () => {
  const home = read('index.html');
  const section = home.match(/<section class="section integrations-section"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /class="integration-grid"/);
  const cards = [...section.matchAll(/<article class="integration-card(?: [^"]+)?">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  assert.equal(cards.length, 6);
  assert.match(cards[0], /For use with Google Classroom™/);
  assert.match(cards[0], /href="\/proof-lab#graph"/);
  for (const [index, name] of ['Google Drive', 'Notion', 'Zapier', 'Dropbox', 'GitHub'].entries()) {
    const card = cards[index + 1];
    assert.match(card, new RegExp(`<h3>${name}${name === 'Google Drive' ? '™' : ''}<\\/h3>`));
    if (name === 'Google Drive') {
      assert.match(card, /directly to your own Google Drive/);
      assert.match(card, /logo_drive_2026_color/);
      assert.match(card, /href="\/proof-lab#graph"/);
    } else if (name === 'Dropbox') {
      assert.match(card, /Dropbox Saver/);
      assert.match(card, /Dropbox logo/);
      assert.match(card, /href="\/proof-lab#graph"/);
    } else if (name === 'GitHub') {
      assert.match(card, /unlisted Gist/);
      assert.match(card, /github-lockup\.svg/);
      assert.match(card, /href="\/proof-lab#graph"/);
    } else if (name === 'Notion') {
      assert.match(card, /new child page/);
      assert.match(card, /front-static\/logo-ios\.png/);
      assert.match(card, /href="\/proof-lab#graph"/);
    } else {
      assert.match(card, /class="integration-status">Coming soon<\/p>/);
      assert.match(card, /class="integration-placeholder" aria-hidden="true"/);
      assert.doesNotMatch(card, /<img\b|<svg\b|<a\b/, `${name} has no logo or live action`);
    }
  }
  assert.equal([...section.matchAll(/<img\b/g)].length, 5, 'All live integrations have logos');
  assert.match(section, /Other product names belong to their respective owners/);

  const css = read('styles.css');
  assert.match(css, /\.integration-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)\s*\{\s*\.integration-grid\s*\{\s*grid-template-columns:\s*1fr/);

  const translations = read('site-i18n.js');
  assert.match(translations, /'Coming soon': 'Próximamente'/);
  for (const name of ['Google Drive', 'Notion', 'Zapier', 'Dropbox', 'GitHub']) {
    assert.ok(translations.includes(`'${name}': '${name}'`));
  }
});

test('Solve exposes the strict word-problem mode separately from LaTeX and JSON', () => {
  const proof = read('proof-lab.html');
  const app = read('math-lab.js');
  assert.match(proof, /id="use-word-problem"/);
  assert.match(proof, /id="word-problem-input"/);
  assert.match(proof, /Other wording is reported as unsupported, not guessed/);
  assert.match(app, /word-problem-input/);
  assert.match(read('engine/index.js'), /parseWordProblem\(input\) \|\| latexToInput/);
});

test('about page shows three matching founder cards without the old group photo', () => {
  const about = read('about.html');
  for (const [name, image] of [
    ['Rahul Awasthi', 'awasthi.jpeg'], ['Pritam Avuthu', 'avuthu.jpeg'],
    ['Akshaj Sanikommu', 'sanikommu.jpeg'],
  ]) {
    assert.match(about, new RegExp(name));
    assert.match(about, new RegExp(`images/${image.replace('.', '\\.')}`));
    assert.ok(existsSync(resolve(root, `images/${image}`)));
  }
  assert.equal((about.match(/Co-founder and owner/g) || []).length, 3);
  assert.doesNotMatch(about, /Aryan Patel|patel\.jpeg/);
  assert.doesNotMatch(about, /founders-group\.jpg|founder-group wrap/);
});

test('public footers name all three owners consistently', () => {
  const footer = 'Maintained by Avuthu, Awasthi, and Sanikommu.';
  for (const page of [...marketingPages, 'art-contest.html', 'judging.html']) {
    assert.match(read(page), new RegExp(footer.replace('.', '\\.')));
  }
  assert.match(read('site-i18n.js'), /Mantenido por Avuthu, Awasthi y Sanikommu/);
});

test('Proof Lab keeps the entry surface concise and the keypad viewport-fixed', () => {
  const lab = read('proof-lab.html');
  const css = read('math-lab.css');
  const script = read('math-lab.js');
  const editor = read('math-editor.js');
  assert.doesNotMatch(lab, /Runs locally in your browser|No account\. No API keys\.|Local engine ready|Write naturally in LaTeX|A visual expression, with room to think/);
  assert.match(css, /\.math-keypad \{ position: fixed;/);
  assert.match(css, /\.math-keypad\.is-open/);
  assert.match(css, /difficulty-slider::\-webkit-slider-runnable-track/);
  assert.match(lab, /class="coverage-fab"/);
  assert.match(lab, /<dialog class="coverage-dialog" id="coverage"/);
  assert.match(lab, /<details class="lab-tour-examples"><summary>Examples<\/summary>/);
  assert.doesNotMatch(lab, /id="rail-add"|id="solve-input-help"/);
  assert.match(script, /view: 'generate', icon:/);
  assert.match(script, /150 - \(performance\.now\(\) - startedAt\)/);
  assert.match(script, /Show next step/);
  assert.match(script, /step-drag-handle/);
  assert.doesNotMatch(editor, /Active expression|Build it like you write it/);
});

test('legal page defines the free tool and states academic integrity consequences', () => {
  const legal = read('legal.html');
  assert.match(legal, /Last updated[\s\S]*November 17 2026/);
  assert.match(legal, /mailto:hello@atom-edu\.org/);
  assert.match(legal, /also called atom, Proof Lab, the tool, we, us, or our/);
  assert.match(legal, /If you use the tool to cheat or break a rule/);
  assert.match(legal, /disciplinary action, suspension/);
  assert.match(legal, /a link containing your graph expressions and window settings is sent to Google Classroom/);
  assert.match(legal, /official Classroom branding resources/);
  assert.doesNotMatch(legal, /plain-language draft|needs legal review|terms text is a draft/i);
});
