// Vetted-domain allowlist. data/vetting.json is produced by scripts/vet.js (legitimacy checks:
// official domain, HTTPS, domain age, contact details, policies, pricing sanity, reputation, scam
// lists). The server scrapes and links ONLY domains whose entry passed. Everything else is refused.
const doc = require('../data/vetting.json');

const passed = doc.entries.filter((e) => e.status === 'pass');
const allow = [...new Set(passed.flatMap((e) => e.allow || []))].map((a) => a.toLowerCase());

function hostOk(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return allow.some((a) => h === a || h.endsWith('.' + a));
}
function isVetted(url) {
  try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') && hostOk(u.hostname); } catch { return false; }
}
const ofKind = (kind) => passed.filter((e) => e.kind === kind);
const meta = () => ({ generatedAt: doc.generatedAt, counts: doc.counts, allowlist: allow.length, rule: doc.rule });

module.exports = { isVetted, hostOk, ofKind, meta, doc };
