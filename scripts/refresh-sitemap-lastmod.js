#!/usr/bin/env node
/*
 * Keeps sitemap lastmod values tied to each public HTML page's most recent Git
 * change. Use after a content release, before submitting the sitemap to search
 * engines. It never invents a current date for an unchanged page.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const sitemapPath = path.join(ROOT, 'sitemap.xml');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');

function sourceFor(url) {
  const route = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
  const candidates = route
    ? [route + '.html', path.join(route, 'index.html')]
    : ['index.html'];
  return candidates.find((file) => fs.existsSync(path.join(ROOT, file))) || null;
}

// Files edited but not yet committed are still the page's most recent change,
// so fall back to today for them. Without this, running before a commit would
// stamp a stale date onto a page that genuinely changed.
const dirty = (() => {
  try {
    return new Set(
      execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
    );
  } catch (_) {
    return new Set();
  }
})();
const today = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
})();

function modifiedDate(file) {
  if (dirty.has(file)) return today;
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();
  } catch (_) {
    return '';
  }
}

let changed = 0;
let unmapped = 0;
const refreshed = sitemap.replace(/<url>([\s\S]*?)<\/url>/g, (block) => {
  const match = block.match(/<loc>([^<]+)<\/loc>/);
  if (!match) return block;
  const file = sourceFor(match[1]);
  if (!file) { unmapped++; return block; }
  const date = modifiedDate(file);
  if (!date) { unmapped++; return block; }
  let next;
  if (/<lastmod>[^<]*<\/lastmod>/.test(block)) {
    next = block.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>' + date + '</lastmod>');
  } else if (/<changefreq>/.test(block)) {
    next = block.replace(/(\s*)<changefreq>/, '$1<lastmod>' + date + '</lastmod>$1<changefreq>');
  } else {
    next = block.replace(/<\/url>/, '    <lastmod>' + date + '</lastmod>\n  </url>');
  }
  if (next !== block) changed++;
  return next;
});

fs.writeFileSync(sitemapPath, refreshed);
console.log('Updated lastmod for ' + changed + ' sitemap URLs; unmapped: ' + unmapped + '.');
