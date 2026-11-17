#!/usr/bin/env node
// Legitimacy vetting for every store, marketplace and field link the app uses.
// Input:  data/vetting-input.json (name, kind, URL, how the official domain was confirmed, reputation notes)
// Output: data/vetting.json (per-domain checks, pass/fail, date). The server only scrapes and links
// domains that pass here (see server/vetting.js).
//
// Automated checks: DNS (DNS-over-HTTPS), valid HTTPS, domain age (RDAP), contact details
// (phone/address/contact page), return/shipping/privacy policies, pricing sanity (share of items
// 60%+ off), lookalike/typo domains, and public scam/phishing blocklists.
// Manual evidence (official-domain cross-check, reputation) comes from the input file.
// Usage: node scripts/vet.js            (all entries)
//        node scripts/vet.js id1 id2    (re-check some, keep the rest)
const fs = require('fs');
const path = require('path');
const UA = 'AirsoftDealsFinder/1.0 (personal price-comparison app; respects robots.txt)';
const IN = path.join(__dirname, '..', 'data', 'vetting-input.json');
const OUT = path.join(__dirname, '..', 'data', 'vetting.json');
const SHARED = new Set(['myshopify.com']); // platforms whose subdomains belong to different businesses
const BLOCKLISTS = {
  'HaGeZi Fake (scam shops)': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/fake-onlydomains.txt',
  'HaGeZi Threat Intelligence (mini)': 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/tif.mini-onlydomains.txt',
  'BlocklistProject Scam': 'https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/scam-nl.txt',
  'BlocklistProject Fraud': 'https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/fraud-nl.txt',
  'BlocklistProject Phishing': 'https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version/phishing-nl.txt',
  'Phishing.Database (active)': 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
  'OpenPhish': 'https://openphish.com/feed.txt',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rootOf = (h) => { const p = h.split('.'); const two = p.slice(-2).join('.'); return SHARED.has(two) ? h : two; };

async function f(url, { ms = 15000, accept = 'text/html,application/json', max = 3_000_000 } = {}) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    return { status: r.status, url: r.url, server: r.headers.get('server') || '', cfm: r.headers.get('cf-mitigated') || '', txt: (await r.text()).slice(0, max) };
  } catch (e) { return { err: String(e.cause?.code || e.cause?.message || e.message).slice(0, 80) }; }
}
async function doh(name) {
  try { const j = await (await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=A`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) })).json(); return j.Status === 0 && (j.Answer || []).length > 0; } catch { return null; }
}
async function rdap(host) {
  const root = rootOf(host).split('.').slice(-2).join('.'); const tld = root.split('.').pop();
  const urls = { com: `https://rdap.verisign.com/com/v1/domain/${root}`, net: `https://rdap.verisign.com/net/v1/domain/${root}`, org: `https://rdap.publicinterestregistry.org/rdap/domain/${root}`, us: `https://rdap.nic.us/domain/${root}` }[tld];
  for (const u of [urls, `https://rdap.org/domain/${root}`].filter(Boolean)) {
    for (let i = 0; i < 2; i++) {
      const r = await f(u, { accept: 'application/rdap+json' });
      try { const ev = (JSON.parse(r.txt).events || []).find((e) => e.eventAction === 'registration'); if (ev) return ev.eventDate.slice(0, 10); } catch { /* retry */ }
      await sleep(1000);
    }
  }
  return null;
}
const strip = (t) => t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#\d+;/g, ' ').replace(/\s+/g, ' ');
const PHONE = /tel:\+?\d|(\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b|\+\d{1,3}[\s-]\d[\d\s-]{7,}/;
const ADDR = /\b\d{2,6}\s+[A-Z0-9][\w.]*(\s[\w.]+){0,4}\s(St|Street|Ave|Avenue|Rd|Road|Blvd|Hwy|Highway|Dr|Drive|Ln|Lane|Way|Pkwy|Ct|Suite|Ste|Pike|Circle|Route|Rte)\b|"streetAddress"|\b[A-Z][a-z]+,?\s(?:[A-Z]{2}|[A-Z][a-z]+)\s\d{5}\b/;
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }

async function loadBlocklists() {
  const sets = {};
  for (const [name, url] of Object.entries(BLOCKLISTS)) {
    const r = await f(url, { ms: 120000, accept: 'text/plain', max: 200_000_000 });
    const s = new Set();
    if (r.txt) for (let l of r.txt.split('\n')) { l = l.trim(); if (!l || l[0] === '#' || l[0] === '!') continue; l = l.replace(/^0\.0\.0\.0\s+|^127\.0\.0\.1\s+/, '').replace(/^\*\./, '').replace(/^https?:\/\//, '').split(/[/\s]/)[0].toLowerCase(); if (l) s.add(l); }
    sets[name] = s; console.log(`blocklist ${name}: ${s.size}`);
  }
  return sets;
}

async function vet(e, ctx) {
  const checkedAt = new Date().toISOString().slice(0, 10);
  const out = { id: e.id, name: e.name, kind: e.kind, url: e.url, checkedAt, checks: {}, official: e.official || null, reputation: e.reputation || null };
  if (e.why) out.why = e.why;
  if (e.note) out.note = e.note;
  if (!e.url) { out.status = 'skipped'; return out; }
  const host = new URL(e.url).hostname; out.host = host; const root = rootOf(host);
  out.allow = SHARED.has(root.split('.').slice(-2).join('.')) ? [host] : [root];
  const C = out.checks; const man = e.manual || {};
  C.dns = await doh(host);
  const h = C.dns ? await f(e.url) : { err: 'no DNS' };
  C.https = !h.err && h.url.startsWith('https://');
  if (h.err) C.httpsError = h.err;
  const t = h.txt || '';
  const challenge = /<title>\s*(just a moment|attention required|access denied|before we continue|security verification)/i.test(t) || h.cfm === 'challenge' || ((h.status === 403 || h.status === 503) && /cloudflare|akamai/i.test(h.server + t.slice(0, 3000)));
  if (challenge) C.botCheck = true;
  if (h.status >= 500) C.httpStatus = h.status;
  const created = await rdap(host); C.created = created;
  C.ageDays = created ? Math.floor((Date.now() - Date.parse(created)) / 864e5) : null;
  C.age = created ? C.ageDays >= 365 : null;
  // contact + policies: home page, the pages its footer links to (contact/about/policies/FAQ), then common paths
  const base = h.url ? new URL(h.url).origin : e.url;
  let text = strip(t);
  const anchors = [...t.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)].map((m) => ({ href: m[1], label: strip(m[2]).toLowerCase() }));
  const hrefs = anchors.map((a) => a.href.toLowerCase() + ' ' + a.label).join(' | ');
  const POL = { refund: /refund|return/, privacy: /privacy/, shipping: /shipping|delivery/ };
  const pol = Object.fromEntries(Object.entries(POL).map(([k, re]) => [k, re.test(hrefs)]));
  if (C.https && !challenge) {
    const seen = new Set();
    const cand = anchors.filter((a) => /contact|about|location|find-us|find us|polic|refund|return|shipping|privacy|terms|faq|info|warranty/.test(a.href.toLowerCase() + ' ' + a.label))
      .map((a) => { try { return new URL(a.href, base).toString(); } catch { return null; } })
      .filter((u) => u && new URL(u).hostname.endsWith(rootOf(new URL(base).hostname)));
    const common = ['/pages/contact', '/pages/contact-us', '/contact', '/contact-us', '/policies/refund-policy', '/policies/privacy-policy', '/policies/shipping-policy'].map((p) => base + p);
    let contactOk = false;
    for (const u of [...common.slice(4), ...cand, ...common.slice(0, 4)]) {
      if (seen.has(u) || seen.size >= 20) continue; seen.add(u);
      if (PHONE.test(text) && ADDR.test(text) && pol.refund && pol.privacy && pol.shipping) break;
      const r = await f(u, { ms: 10000 }); if (r.status !== 200 || !r.txt) continue;
      const s2 = strip(r.txt); if (s2.length < 300) continue;
      if (/contact/i.test(u)) contactOk = true;
      const head = (u + ' ' + (r.txt.match(/<title[^>]*>([^<]*)/i)?.[1] || '') + ' ' + (r.txt.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')).toLowerCase();
      if (/refund|return/.test(head) || /return policy|refund policy|returns? (are|must|within)|days? of (delivery|purchase)/i.test(s2)) pol.refund = true;
      if (/privacy/.test(head) || /privacy policy|personal information/i.test(s2)) pol.privacy = true;
      if (/shipping|delivery/.test(head) || /shipping (policy|rates|times|methods)|we ship|orders? ship/i.test(s2)) pol.shipping = true;
      text += ' ' + s2.slice(0, 30000) + ' ' + (r.txt.match(/href="tel:[^"]+"/gi) || []).join(' ');
    }
    if (contactOk) pol.contactPage = true;
  }
  C.phone = PHONE.test(text); C.address = ADDR.test(text); C.contactPage = /contact/.test(hrefs) || !!pol.contactPage; delete pol.contactPage;
  if (man.age && !C.created) { C.age = `manual: ${man.age}`; }
  C.contact = man.contact ? `manual: ${man.contact}` : (C.phone || C.address) && (C.contactPage || C.phone);
  if (e.kind === 'store' || e.kind === 'link') C.policies = man.policies ? `manual: ${man.policies}` : pol.refund && pol.privacy && pol.shipping;
  else C.policies = man.policies ? `manual: ${man.policies}` : 'n/a (no online sales through this link)';
  C.policyPages = pol;
  // pricing sanity on Shopify / WooCommerce catalogs
  if (C.https && !challenge && e.kind !== 'excluded') {
    const pj = await f(base + '/products.json?limit=250', { accept: 'application/json' });
    let items = null;
    try { items = JSON.parse(pj.txt).products.map((p) => { const v = p.variants?.[0] || {}; return [+v.price, +v.compare_at_price]; }); } catch { /* not Shopify */ }
    if (!items) { const w = await f(base + '/wp-json/wc/store/v1/products?per_page=100', { accept: 'application/json' }); try { items = JSON.parse(w.txt).map((p) => [+p.prices.price, +p.prices.regular_price]); } catch { /* no feed */ } }
    if (items && items.length) {
      const deep = items.filter(([p, c]) => c > p && p / c <= 0.4).length;
      C.pricing = { sample: items.length, deep60offPct: Math.round(100 * deep / items.length), ok: deep / items.length < 0.25 };
    } else C.pricing = 'n/a (no public catalog)';
  }
  // lookalike / typo domains
  C.punycode = /xn--/.test(host);
  const near = ctx.roots.filter((r) => r !== root && lev(r.split('.')[0], root.split('.')[0]) <= 1 && Math.min(r.length, root.length) > 6);
  C.lookalike = near.length ? (man.lookalike ? `reviewed: ${man.lookalike}` : near) : false;
  // scam lists
  const hits = Object.entries(ctx.lists).filter(([, s]) => s.has(host) || s.has(root) || s.has('www.' + root)).map(([n]) => n);
  C.scamLists = hits.length ? hits : 'clean';
  // verdict
  const fails = [];
  if (!C.dns) fails.push('DNS');
  if (!C.https) fails.push('HTTPS');
  if (C.httpStatus) fails.push(`HTTP ${C.httpStatus}`);
  if (C.age === false) fails.push(`domain younger than 1 year (${created})`);
  if (C.age === null) fails.push('domain age unknown');
  if (!C.contact) fails.push('no address/phone');
  if (C.policies === false) fails.push('missing return/shipping/privacy policy');
  if (C.pricing && C.pricing.ok === false) fails.push('too-good-to-be-true pricing');
  if (C.punycode) fails.push('punycode domain');
  if (Array.isArray(C.lookalike)) fails.push('lookalike of ' + C.lookalike.join(', '));
  if (hits.length) fails.push('on scam list');
  if (!e.official && e.kind !== 'excluded') fails.push('official domain not confirmed');
  if (e.kind === 'excluded') fails.unshift('excluded after review: ' + e.why);
  out.failed = fails;
  out.status = fails.length ? 'fail' : 'pass';
  return out;
}

(async () => {
  const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const only = process.argv.slice(2);
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { entries: [] };
  const lists = await loadBlocklists();
  const roots = [...new Set(input.filter((e) => e.url).map((e) => rootOf(new URL(e.url).hostname)))];
  const ctx = { lists, roots };
  const res = new Array(input.length); let i = 0;
  async function worker() { while (i < input.length) { const k = i++; const e = input[k]; const old = prev.entries.find((p) => p.name === e.name && p.kind === e.kind); res[k] = only.length && !only.includes(e.id) && old ? old : await vet(e, ctx); process.stdout.write(res[k].status === 'pass' ? '.' : res[k].status === 'fail' ? 'x' : '-'); } }
  await Promise.all(Array.from({ length: 5 }, worker));
  const counts = res.reduce((a, r) => ((a[r.kind + ':' + r.status] = (a[r.kind + ':' + r.status] || 0) + 1), a), {});
  const doc = {
    generatedAt: new Date().toISOString(),
    method: 'scripts/vet.js — DNS over HTTPS, HTTPS fetch, RDAP registration date, contact & policy pages, Shopify/WooCommerce price sample, lookalike check, public blocklists; official-domain and reputation evidence recorded per entry from web searches (Trustpilot, BBB, Reddit, Yelp/Google listings, brand and distributor pages).',
    rule: 'Only entries with status "pass" are scraped or linked by the app. Anything failing or doubtful is excluded entirely.',
    blocklists: Object.fromEntries(Object.entries(lists).map(([k, s]) => [k, s.size])),
    counts,
    entries: res,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log('\n', counts);
  for (const r of res) if (r.status === 'fail' && r.kind !== 'excluded') console.log('FAIL', r.kind, r.name, '→', r.failed.join('; '));
})();
