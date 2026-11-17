// Brand detection from the user's brand list (data/brand-list-from-user.txt, Evike-style directory)
// plus a few makers that list on our stores but aren't in that directory.
//
// - "A / B" names become aliases of one brand ("Elite Force / Umarex", "UTG / Leapers").
// - The vendor field wins when it names a known brand; otherwise the earliest brand mention in the
//   title before "for/fits/compatible" (an "Angel Custom barrel for Tokyo Marui" is Angel Custom).
// - Licensed real-firearm brands (Glock, SIG, H&K, Colt, FN…) are used only when no airsoft maker
//   is named, and only on listings that already passed the airsoft-only filter.
// - Brand names that are ordinary words (BOLT, MAG, STAR, WELL, Matrix, Galaxy…) match only at the
//   start of the title or in the vendor field.
const fs = require('fs');
const path = require('path');

const LIST = path.join(__dirname, '..', 'data', 'brand-list-from-user.txt');
const EXTRA = ['Lancer Tactical', 'Novritsch', 'Vorsk Airsoft', 'Retro Arms', 'Perun', 'Amoeba', 'Double Bell', 'Raven', 'Kizuna Works', 'LA Capa Customs', 'Maple Leaf', 'Laylax', 'Umarex', 'Marui', 'Mayo Gang', 'Zion Arms', 'Bullgear', 'Atlas Custom Works', 'Mancraft', 'Hostile Energy', 'Amarok', 'Cytac', 'Amomax', 'Vector Optics', 'Dr. Black', 'Speed Airsoft', 'Modify', 'Guarder', 'Poseidon', 'Nine Ball'];
// Extra spellings for list entries.
const MORE_ALIASES = {
  'Tokyo Marui': ['TM', 'Marui'], 'G&G': ['G and G', 'GnG', 'G&G Armament'], 'H&K / Heckler & Koch': ['HK', 'H&K', 'Heckler and Koch', 'Heckler Koch'],
  'SIG SAUER': ['SIG', 'Sig Sauer'], 'ASG': ['Action Sport Games', 'ASG'], 'SIG AIR': ['ProForce', 'SIG AIR ProForce'], 'WE-TECH': ['WE', 'WE Tech', 'WETECH'], 'Krytac / KRISS USA': ['Krytac'],
  'KRISS USA': ['KRISS'], 'Prometheus / Laylax': ['Prometheus', 'Laylax'], 'APS / Hakkotsu': ['APS', 'Hakkotsu'], '5KU / APS': ['5KU'],
  'SAI – Salient Arms Intl': ['SAI', 'Salient Arms', 'Salient Arms International'], 'Echo1 / JAG': ['Echo1', 'Echo 1', 'JAG Arms', 'JAG'],
  'Command Arms (CAA)': ['CAA', 'Command Arms'], 'Maple Leaf (AST)': ['Maple Leaf', 'AST'], 'DoubleStar (ACE Ltd)': ['DoubleStar', 'ACE Ltd'],
  'Knight’s Armament Airsoft': ['Knights Armament', "Knight's Armament", 'KAC'], 'Novak’s Inc.': ['Novak', 'Novaks'], 'Hudson Mfg.': ['Hudson'],
  'High Speed Gear / HSGI': ['High Speed Gear', 'HSGI'], 'FN Herstal': ['FN'], 'Smith & Wesson': ['S&W', 'Smith and Wesson'], 'CZ-USA': ['CZ'],
  'Cybergun / Spartan Mil/LE': ['Cybergun'], 'Valken / Annex': ['Valken', 'Annex'], 'Elite Force / Umarex': ['Elite Force', 'Umarex', 'EliteForce'],
  'King Arms / Eagle Force': ['King Arms', 'Eagle Force'], 'UTG / Leapers': ['UTG', 'Leapers'], 'NcSTAR / VISM': ['NcSTAR', 'NC Star', 'VISM'],
  'Angry Gun / Andax Works': ['Angry Gun', 'AngryGun', 'Andax Works'], 'Element / Z-Tactical': ['Element', 'Z-Tactical', 'Z Tactical', 'Ztac'],
  'Galaxy/ZM/Ukarms': ['Galaxy', 'UKArms', 'UK Arms'], 'Mayflower / Velocity Systems': ['Mayflower', 'Velocity Systems'], 'SHS / PPS': ['SHS', 'PPS', 'Shenhuasheng'],
  'Bravo / Defcon': ['Bravo', 'Defcon'], 'Arcturus': ['Arcturus'], 'ARES': ['Ares', 'Amoeba'], 'EmersonGear': ['Emerson', 'Emerson Gear'], 'Tru Spec': ['Tru-Spec', 'TruSpec'],
  'SPEED Airsoft': ['Speed Airsoft'], 'LCT Airsoft': ['LCT'], 'Wolverine Airsoft': ['Wolverine'], 'Amped Airsoft': ['Amped'], 'Unicorn Airsoft': ['Unicorn'],
  'Skyway Airsoft': ['Skyway'], 'Tapp Airsoft': ['Tapp'], 'E&L Airsoft': ['E&L'], 'EPeS Airsoft': ['EPeS'], 'lambda Airsoft': ['Lambda'], 'Helix Airsoft': ['Helix Airsoft'],
  'JG Works': ['JG', 'JG Works'], 'K Tech': ['K-Tech', 'KTech'], 'Maxx Model Products': ['Maxx Model', 'Maxx', 'MaxxModel'], 'TMC FMA': ['TMC', 'FMA'],
  'T-N.T. Studios': ['TNT Studios', 'T-N.T.'], 'Siegetek Concepts': ['Siegetek'], 'Taran Tactical Innovations': ['Taran Tactical', 'TTI'], 'Tanaka Works': ['Tanaka'],
  'Hera Arms': ['Hera Arms'], 'Haley Strategic': ['Haley Strategic', 'HSP'], 'SAT Modified Parts': ['SAT'], 'CowCow Technology': ['CowCow', 'Cow Cow'],
  'Airtech Studios': ['AirTech Studios', 'Airtech'], 'Big Bang Air Guns': ['Big Bang'], 'Code Red Headsets': ['Code Red'], 'Enola Gaye': ['Enola Gaye'],
  'Evike Custom Guns': ['Evike Custom'], 'Evike Exclusive': ['Evike.com Exclusive', 'Evike Exclusive'], 'Evike Performance Shop': ['EPS'],
  'Geissele Automatics': ['Geissele'], 'Golden Eagle': ['Golden Eagle'], 'Double Eagle': ['Double Eagle'], 'BO Manufacture': ['BO Manufacture', 'BO'],
  'Beta Project': ['Beta Project'], 'Caliber Airsoft': ['Caliber Airsoft'], 'Creation Airsoft': ['Creation Airsoft'], 'Rocket Airsoft': ['Rocket Airsoft'],
  'Forge Airsoft': ['Forge Airsoft'], 'Black Owl Gear': ['Black Owl'], 'Grey Ghost Gear': ['Grey Ghost'], 'Blue Force Gear': ['Blue Force Gear', 'BFG'],
  'Airsoft Innovations': ['Airsoft Innovations', 'AI'], 'Airsoft Masterpiece': ['Airsoft Masterpiece'], 'Armored Claw': ['Armored Claw'], 'Army Armament': ['Army Armament'],
  'Asura Dynamics': ['Asura'], 'Avatar Grenade': ['Avatar'], 'Spartan Armor Systems': ['Spartan Armor'], 'Dynamic Precision': ['Dynamic Precision', 'DP'],
  'JE Machine': ['JE Machine'], 'JL Progression': ['JL Progression', 'JLP'], 'Lancer Systems': ['Lancer Systems'], 'OSS Suppressors': ['OSS'],
  'Save Phace': ['Save Phace', 'SavePhace'], 'Wii TECH': ['Wii Tech', 'WiiTech'], 'ZCI Ltd.': ['ZCI'], 'Win Gun': ['Win Gun', 'WinGun'], 'Hexmag': ['HexMag'],
  'Retro Arms': ['Retro Arms', 'RetroArms'], 'Vorsk Airsoft': ['Vorsk'], 'LA Capa Customs': ['LA Capa'], 'Dr. Black': ['Dr Black'], 'Kizuna Works': ['Kizuna'],
};
const LICENSED = new Set(['GLOCK', 'SIG SAUER', 'H&K / Heckler & Koch', 'FN Herstal', 'Smith & Wesson', 'Walther', 'Barrett', 'CZ-USA', 'Daniel Defense', 'BCM', 'IWI', 'Kalashnikov', 'KRISS USA', 'Colt', 'Beretta', 'Tanfoglio', 'Geissele Automatics', 'TROY Industries', 'Hera Arms', 'Haley Strategic', 'Novak’s Inc.', 'Hudson Mfg.', 'SB Tactical', 'Lancer Systems', 'Magpul', 'Ruger', 'Springfield Armory', 'Desert Eagle', 'Taran Tactical Innovations', 'Staccato', 'Salient Arms']);
// Ordinary words: title-start or vendor only.
const GENERIC = new Set(['BOLT', 'MAG', 'STAR', 'WELL', 'Matrix', 'Revision', 'GATE', 'Element / Z-Tactical', 'Galaxy/ZM/Ukarms', 'AXL', 'KAOS', 'BAAL', 'Avengers', 'Condor', 'Silverback', 'Bravo / Defcon', 'Swiss Arms', 'Systema', 'Trinity Force', 'Modify', 'Raven', 'Guarder', 'Nine Ball', 'Amarok', 'Perun', 'Hostile Energy', 'Echo1 / JAG', 'AIM Top', 'AIM Sports', 'Titan Power', 'Tokyo Marui', 'ESS', 'AIP', 'SAT Modified Parts', 'BO Manufacture', 'Airsoft Innovations', 'Dynamic Precision', 'EMG', 'PTS', 'MAG', 'Maxx Model Products', 'TMC FMA', 'Amped Airsoft', 'Wolverine Airsoft', 'Speed Airsoft']);
// Only the alias that's an ordinary word is restricted; longer forms ("Tokyo Marui", "Echo1") match anywhere.
const GENERIC_ALIAS = new Set(['bolt', 'mag', 'star', 'well', 'matrix', 'revision', 'gate', 'element', 'galaxy', 'axl', 'kaos', 'baal', 'avengers', 'condor', 'silverback', 'bravo', 'defcon', 'systema', 'trinity force', 'modify', 'raven', 'guarder', 'nine ball', 'amarok', 'perun', 'tm', 'marui', 'jag', 'aip', 'sat', 'bo', 'ai', 'dp', 'emg', 'pts', 'ess', 'maxx', 'tmc', 'fma', 'amped', 'wolverine', 'speed airsoft', 'we', 'hk', 'cz', 'fn', 'sig', 'tti', 'hsp', 'eps', 'bfg', 'jg', 'ast', 'pps', 'caa', 'kac', 'oss', 'zci', 'jlp', 'annex', 'avatar', 'asura', 'unicorn', 'lambda', 'tapp', 'helix airsoft', 'colt', 'magpul', 'emerson', 'arcturus', 'skyway']);
// Aliases where the restriction is only "not followed by" a word that changes the meaning.
const NOT_AFTER = { hk: '(?! ?army)', bolt: '(?! ?(action|carrier|catch|release|stop|handle|head|cover))', star: '(?! ?wars)', well: '(?! ?(made|built))', gate: '(?! ?(titan|aster|warfet|pico|nova))' };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normT = (s) => ' ' + String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/[’'`"]/g, '').replace(/[^a-z0-9&.+ -]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

function load() {
  let names = [];
  try { names = fs.readFileSync(LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean); } catch { /* list optional */ }
  names = [...new Set([...names, ...EXTRA, 'Colt', 'Beretta', 'Magpul', 'Ruger'])];
  const byAlias = new Map();
  const brands = [];
  for (const label of names) {
    const parts = label.split(/\s*\/\s*|\s*\(\s*|\s*\)\s*|\s+–\s+/).map((s) => s.trim()).filter(Boolean);
    const display = (label.includes('/') || label.includes('(') || label.includes('–')) ? parts[0].replace(/\.$/, '') : label.replace(/\.$/, '');
    const aliases = new Set([label, ...parts, ...(MORE_ALIASES[label] || [])].map((a) => a.toLowerCase().replace(/[’']/g, '').replace(/\.$/, '').trim()).filter((a) => a.length >= 2));
    // Already defined (e.g. "Maple Leaf" extra vs "Maple Leaf (AST)"): merge into the first brand.
    const key = parts[0].toLowerCase().replace(/[’']/g, '').replace(/\.$/, '').trim();
    const existing = byAlias.get(key) || byAlias.get(label.toLowerCase().replace(/[’']/g, '').trim());
    if (existing) { aliases.forEach((a) => { if (!byAlias.has(a)) { byAlias.set(a, existing); existing.aliases.push(a); } }); continue; }
    const b = { id: slug(display), name: display, label, aliases: [], licensed: LICENSED.has(label) || LICENSED.has(display) };
    for (const a of aliases) if (!byAlias.has(a)) { byAlias.set(a, b); b.aliases.push(a); }
    brands.push(b);
  }
  // Longest alias first so "CYMA Platinum" beats "CYMA" and "SIG AIR" beats "SIG".
  const all = [...byAlias.entries()].sort((a, b) => b[0].length - a[0].length);
  const matchers = all.map(([a, b]) => ({
    alias: a, brand: b, startOnly: GENERIC_ALIAS.has(a),
    re: new RegExp(`(^| )${esc(normT(a).trim()).replace(/\\ /g, '[ -]?').replace(/&/g, ' ?& ?')}${NOT_AFTER[a] || ''}(?= |$)`),
  }));
  return { brands, byAlias, matchers, byId: new Map(brands.map((b) => [b.id, b])) };
}
const DB = load();

// Brand of one listing: { id, name, licensed } or null.
function vendorBrand(p) {
  const v = normT(p.brand).trim();
  if (!v) return null;
  if (DB.byAlias.has(v)) return DB.byAlias.get(v);
  for (const m of DB.matchers) if (!m.startOnly && m.re.test(' ' + v + ' ')) return m.brand;
  return null;
}
// Title first (store vendor fields are sometimes the importer, e.g. "UK Arms" on Lancer goggles);
// the vendor fills in when the title names no maker.
function detect(p) {
  const t = normT(p.title);
  const fi = t.search(/ (for|fits|compatible( with)?|to fit|designed for) /);
  const head = fi > 0 ? t.slice(0, fi + 1) : t;
  const hits = [];
  for (const m of DB.matchers) {
    const r = m.re.exec(head);
    if (!r) continue;
    const at = r.index + r[1].length;
    if (m.startOnly && at > 1) continue;
    if (hits.some((h) => at >= h.at && at < h.end)) continue; // inside a longer alias already matched
    hits.push({ at, end: at + r[0].length, b: m.brand });
  }
  hits.sort((a, b) => a.at - b.at);
  // "Glock 17 Gen5 by Umarex": "by <maker>" wins over a licensed name at the start.
  const by = head.match(/ by ([a-z0-9&.+ -]+?)(?= \(| -|$| for )/);
  if (by && p._by !== false) { const b = detect({ title: by[1], _by: false }); if (b && !b.licensed) return b; }
  const maker = hits.find((h) => !h.b.licensed);
  if (maker) return pub(maker.b);
  const vb = vendorBrand(p);
  if (vb) return pub(vb);
  return hits.length ? pub(hits[0].b) : null;
}
const pub = (b) => ({ id: b.id, name: b.name, licensed: b.licensed || undefined });

module.exports = { detect, list: () => DB.brands, byId: (id) => DB.byId.get(id), slug };
