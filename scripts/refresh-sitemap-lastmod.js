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

function modifiedDate(file) {
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
