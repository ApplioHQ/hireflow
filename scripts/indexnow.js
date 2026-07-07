#!/usr/bin/env node
/* Submit all sitemap URLs to IndexNow (Bing, Yandex, and partners — which powers
   ChatGPT/Copilot search). Run after publishing:  node scripts/indexnow.js
   Re-run anytime content changes; it's safe to call repeatedly. */
const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'appliohq.com';
const KEY = '12f89dd0b9309d2d9aef4f5ab897ded6';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// Read URLs from sitemap.xml so this always matches what's published.
const sitemap = fs.readFileSync(path.join(process.cwd(), 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

if (!urlList.length) { console.error('No <loc> URLs found in sitemap.xml'); process.exit(1); }

const payload = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });

const req = https.request({
  hostname: 'api.indexnow.org',
  path: '/indexnow',
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log(`IndexNow HTTP ${res.statusCode} — submitted ${urlList.length} URLs`);
    // 200 = accepted, 202 = accepted (pending), 4xx = check key file / host
    if (res.statusCode >= 400) console.log('Response:', body || '(empty)');
    else console.log('Success. Bing will crawl these on its schedule.');
  });
});
req.on('error', e => { console.error('IndexNow request failed:', e.message); process.exit(1); });
req.write(payload);
req.end();
