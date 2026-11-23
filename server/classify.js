// Category classifier + airsoft-only relevance filter.
//
// Signals, strongest first: the store's own product_type / categories, the title (with negative
// rules: a magazine "for M4" is a magazine; a title with M4/AK/AEG/rifle/SMG/shotgun is never a
// pistol), known model names, and price sanity. Low confidence lands in "other", never in a
// wrong gun category.

const CAT_IDS = ['rifles', 'pistols', 'snipers', 'mags', 'holsters', 'gear', 'optics', 'parts', 'batteries', 'bbs', 'gas', 'other'];
const GUNS = new Set(['rifles', 'pistols', 'snipers']);

const norm = (s) => ' ' + String(s || '').toLowerCase()
  .replace(/&amp;/g, '&').replace(/&#8211;|–|—/g, '-').replace(/[’'`"]/g, '')
  .replace(/[^a-z0-9.&/+\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

// ---- title: accessories ----
const MAG_PART = /\b(mag(azine)?s? ?(feed ?lips?|springs?|adapters?|catch(es)?|releases?|wells?|seals?|base ?plates?|gaskets?|valves?|followers?|parts?|lips?|repair|rebuild|o-?rings?|loading tools?|couplers?|clamps?|extensions?|bumpers?|pulls?)|feed ?lips?|mag ?wells?|magwells?|mag(azine)? (pouch(es)?|carriers?|holders?|bags?|racks?))\b/;
const MAG_GEAR = /\bmag(azine)? (pouch(es)?|carriers?|holders?|bags?|racks?)\b/;
const R = {
  mags: /\b(magazines?|mags?|mid[ -]?caps?|midcaps?|hi[ -]?caps?|hicaps?|high[ -]?caps?|high[ -]?capacity|low[ -]?caps?|lowcaps?|drum|drums|box mag|speed ?loaders?|bb loaders?|loaders?|shotgun shells?|shells|cartridges? for)\b/,
  batteries: /\b(batter(y|ies)|lipo|li-?po|nimh|ni-?mh|li-?ion|lifepo4|life battery|\d{3,5} ?mah|mah|chargers?|charging|9\.6v|8\.4v|7\.4v|11\.1v|lipo guard)\b/,
  bbs: /\b(\d?\.\d{2} ?g(rams?)?\b.*\b(bbs?|rounds?|tracers?|bio)|bbs|bb s|bio ?bbs?|biodegradable|tracer bbs?|bb (bottles?|bags?|jugs?)|\d+(k| ?ct| ?count| ?rounds| ?rds| ?pcs) .*\bbbs?\b|precision (grade )?bbs?|match grade .*bbs?|\d?\.\d{2} ?g bio)\b/,
  gas: /\b(green ?gas|top ?gas|red ?gas|black ?gas|propane|ultra ?air|duster|gas (cans?|bottles?|refills?|canisters?)|co2 (cartridges?|capsules?|cylinders?|powerlets?|12 ?g)|12 ?g(ram)? co2|\d+ ?(pk|pack|ct) .*co2|hfc ?-?134a?|hfc ?-?22|gas \d+ ?(oz|g|ml)|\d+ ?(oz|g|ml) gas|airsoft gas)\b/,
  holsters: /\b(holsters?)\b/,
  optics: /\b(scope (mounts?|rings?|bases?)|ring mounts?|optic (mounts?|risers?|plates?)|light mounts?|laser mounts?|scopes?|riflescopes?|red ?dots?|holo ?(graphic)?( sights?)?|reflex|sights?|magnifiers?|optics?|lpvo|acog|lasers?|flash ?lights?|weapon ?lights?|tactical lights?|lights?|torch|peq|dbal|ngal|illuminators?|scope (mounts?|rings?)|optic (mounts?|risers?|plates?)|risers?|(top|scope|optic|\\d\\dmm) rings?|ring mounts?|scope mounts?|optic mounts?|killflash|kill flash|lens (covers?|protectors?)|scope caps?|range ?finders?)\b/,
  gearStrong: /\b(kywis?|vests?|plate ?carriers?|chest ?rigs?|rigs|pouch(es)?|helmets?|masks?|goggles?|eye ?pro|eye ?protection|eyewear|shooting glasses|glasses|face ?(protection|shields?)|lower face|mesh|gloves?|battle ?belts?|belts?|slings?|bags?|cases?|backpacks?|ruck|patch(es)?|uniforms?|bdus?|combat (shirt|pants)|pants|shirts?|jackets?|boots?|headsets?|ear ?pro|hearing protection|knee ?pads?|elbow ?pads?|kneepads|boonie|shemagh|balaclava|radios?|ptt|hydration|harness|suspenders?|placards?|cummerbunds?|armor|(dummy|armor|ballistic|foam|soft|trauma) plates?|ghillie|suits?|rig|hearing protectors?|protectors?|waist packs?|bladders?|reservoirs?|lens(es)?|face ?wraps?|wraps?|holders?|panels?|landmines?|grenade cores?|thunder b|cloaks?|camo(uflage)?|neck gaiters?|gaiter|nvg mounts?|armbands?|identification bands?|morale|lanyards?|wrist|ponchos?|hoods?|tourniquet|ifak|med(ical)? kit|smoke|grenades?|chronograph|targets?|dummy rounds?)\b/,
  parts: /\b(hop[ -]?ups?|hop (units?|chambers?|arms?|rubbers?|nubs?)|buckings?|nubs?|inner ?barrels?|outer ?barrels?|barrels?|tightbore|gearbox(es)?|gear ?box(es)?|gears?|gear ?sets?|motors?|pistons?|piston ?heads?|cylinders?|cylinder ?heads?|nozzles?|tappets?|tappet ?plates?|springs?|spring ?guides?|guide ?rods?|recoil (rods?|springs?|buffers?)|bushings?|bearings?|mosfets?|etus?|triggers?|trigger ?(units?|boards?|guards?)|selectors?|selector ?(plates?|switch)|cut[ -]?off ?levers?|anti[ -]?reversal|sector|bevel|spur|wiring|wires?|deans|tamiya|xt60|connectors?|fuses?|switch(es)?|slides?|frames?|receivers?|uppers?|lowers?|stocks?|buffer ?tubes?|grips?|handguards?|hand ?guards?|rails?|rail (covers?|sections?|systems?|panels?)|m-?lok|keymod|foregrips?|bipods?|muzzle ?(devices?|brakes?)|flash ?hiders?|compensators?|silencers?|suppressors?|tracer ?units?|tracers?|barrel ?extensions?|thread (adapters?|protectors?)|charging ?handles?|bolt (carriers?|catch(es)?|releases?|stops?|handles?)|mag ?wells?|magwells?|feed ?lips?|dust ?covers?|forward ?assists?|blowback ?units?|valves?|hammers?|sears?|o-?rings?|seals?|gaskets?|screws?|pins?|engines?|hpa (engines?|lines?|tanks?|regulators?|kits?|adapters?)|regulators?|air ?lines?|remote ?lines?|tanks?|polarstar|fusion engine|titan|aster|warfet|conversion ?kits?|upgrade ?kits?|rebuild ?kits?|parts? kits?|kits?|parts?|internals?|externals?|chassis|npas|buffers?|suppresors?|blu ?link|gauges?|thumb ?rests?|bifrost|acetech|tracer|nozzle|bb tubes?|tubes?|fittings?|barbs?|quick disconnects?|baffles?|monopods?|latch(es)?|safety|furniture( sets?)?|microswitch(es)?|fire control( group)?|plates?|ccw|cw|hoses?|shims?|shimming|lube|lubricants?|grease|oil|silicone|tools?|spacers?|adapters?|adaptors?|tensioners?|hop|usb link|control station|programming cards?|mounts?|stock ?pads?|butt ?pads?|buttpads?|end ?plates?|gas routers?|feed ?tubes?|feed ?blocks?|chambers?|cocking handles?|hand ?stops?|qd|swivels?|levers?|caps?|nuts?|covers?|shells?|bodies|body|wrench|keys?|locks?|washers?|upgrade|fps|joule|bolt|bolts|cleaning)\b/,
};
// Explicit gun words and model names.
const SNIPER = /\b(snipers?|bolt[ -]?action|vsr[ -]?(10|one|1)?|ssg[ -]?(1|10|24|96)\b|ssg ?mk|l96|aws|aw ?338|awm|awp|m24|m40(a\d)?|m700|srs|tac[ -]?41|htI|kar ?98k?|mosin|mb ?0\d|mb ?44\d\d|mb\d{4}|ssr ?(63|0?\d)|striker|m28|m200|cheytac|msr ?303|sv-?98|ssx ?mk|scout sniper|jae ?100|zero dawn)\b/;
const SHOTGUN = /\b(tri-?shot|shotguns?|m870|m3 super ?90|spas|aa[ -]?12|saiga|m1014|scattergun|m590|super ?90|kel-?tec ksg|ksg|ma ?870|breacher|mossberg|remington 870|db ?shotgun|double barrel|lever action|winchester|m1887|m1897|trench gun)\b/;
const RIFLE_WORD = /\b(aegs?|aeps? rifle|rifles?|carbines?|smgs?|sub[ -]?machine( ?guns?)?|gbbrs?|lmgs?|dmrs?|pdws?|sbrs?|battle rifle|machine ?guns?|hpa rifles?)\b/;
const RIFLE_MODEL = /\b(ronin t\d+|hk ?33|hk ?53|g3a3|lar osw|xm4|m4a1|m4|m16(a\d)?|ar[ -]?15|ar15|ak[ -]?\d{2,3}[a-z]*|ak|akm[sn]?|aks[ -]?\d*|aks|ak-?12|hk ?416[a-z0-9]*|416[a-z0-9]*|hk ?417|mp5[a-z0-9]*|mp5|mp7[a-z0-9]*|mp7|ump\d*|p90|ps90|vector|scar[ -]?[lh]?|g36[a-z]*|aug|m14|ebr|famas|tavor|tar[ -]?21|x95|mcx|mpx|arp ?9|arp ?556|cm ?16|cm16|cm18|ssr|g3[a-z0-9]*|m249|m60|m240|pkm|rpk\d*|sr[ -]?25|m110|mk ?(12|16|17|18|20)|mk18|mk12|m27|iar|l85|l119|sa80|qbz|galil|bren|scorpion evo|evo ?3|evo|uzi|mac[ -]?1[01]|thompson|m1a1|mp40|sten|garand|m1 carbine|sks|vss|as val|groza|krink|ak74u|aks74u|trident|lancer|nemesis|hellion|warhawk|rec7|cqb ?r|urgi|m4 ?cqb|m4 ?sopmod|mws|ngrs|gbls|daniel defense|mk ?18|mk1[2-8]|mws|vfc avalon|avalon|raider|arp9|arp556|tr16|tr4|combat machine|cm ?\d{3}|specna|edge|ptw|hpa m4|hk ?53|g&g gc16|gc16|fn ?f2000|p-?90|kriss|vz ?58|vz58|sig ?(552|553|556|716|mcx)|lvoa|honey ?badger|amoeba|ksc ?ga|xcr|masada|acr|m4 ?mlok|mlok aeg|bolt b4|b4 sobr|vss vintorez|aug a3|ar-?57|qbz-?95|f2000|pp-?19|bizon|vityaz|ak105|ak74|ak47|ak74m)\b/;
const PISTOL_WORD = /\b(pistols?|handguns?|revolvers?|derringer)\b/;
const PISTOL_MODEL = /\b(glock|g ?(17|18c?|19x?|19|22|23|26|34|42|45|47|48)( gen ?\d)?|hi[ -]?capa|hicapa|1911|m1911|2011|m9a?\d?|m92f?s?|92fs|px4|p226|p229|p320|p365|m17|m18|usp(-?c|-?compact)?|mk ?23|socom mk23|desert eagle|deagle|aap[ -]?01|cz ?(75|shadow|p-?09|p-?10|sp-?01)|beretta|tm22|walther|ppq|p99|ppk|pdp|fn ?509|five[ -]?seven|m&p ?9?|sig ?p\d{3}|hudson|staccato|sti|oz9|zev|f229|tanfoglio|makarov|tt-?33|tokarev|g18c|vp9|sp2022|p30|hk45|hk usp|mk1 pistol|ssx ?303|ssx ?23|ssx303|ssx23|vorsk vp|vp-?x|bsf-?19|m29|m19|m327|colt sa|saa|webley|ksc g|kwa atp|atp|tm g|mk23|hx ?\d{2}|combat master|jw3|jw4|we ?g|marui g|g-series|t1911|vpx|cz ?shadow|fowler|edge 2011|hi-cap 5\.1|r17|rk ?17|p226r|m45a1|meu|kimber|gp1799|gpm1911|gtp9|smc9|gpm92|tm hi-capa|hk vp9)\b/;
// "Accessory for X": cut the title at the compatibility phrase.
const FOR_RE = /\s(for|fits|compatible( with)?|to fit|designed for)\s/;
const BUNDLE_RE = /\s(w\/|(with|includes?|including|incl\.?|\+|bundle|package|combo|set w)\s)/;

function lastIdx(re, s) { return lastMatch(re, s).end; }
// End and length of the last match (ties on the same end go to the longer, more specific phrase).
function lastMatch(re, s) { const g = new RegExp(re.source, 'g'); let m, end = -1, len = 0; while ((m = g.exec(s))) { if (m.index + m[0].length >= end) { end = m.index + m[0].length; len = m[0].length; } if (!m[0].length) g.lastIndex++; } return { end, len }; }
function firstIdx(re, s) { const m = re.exec(s); return m ? m.index : -1; }

function titleAccessory(head) {
  if (/\bbb loaders?|speed ?loaders?\b/.test(head) && !/\b(pouch|holder|bag)\b/.test(head)) return 'mags';
  // English puts the head noun last: "Magazine MOLLE Pouch" is a pouch, "Magazine Top Seal" a part.
  let best = null, bestEnd = -1, bestLen = 0;
  // Plug names after "battery" ("LiPo Battery Deans") describe the battery.
  if (R.batteries.test(head)) head = head.replace(/\b(deans|tamiya|mini ?tamiya|xt-?30|xt-?60|t[ -]?plug|plug|connector)\b/g, ' ');
  const consider = (cat, re) => { const { end, len } = lastMatch(re, head); if (end > bestEnd || (end === bestEnd && end >= 0 && len > bestLen)) { best = cat; bestEnd = end; bestLen = len; } };
  for (const k of ['batteries', 'bbs', 'gas', 'mags', 'holsters', 'optics', 'gearStrong', 'parts']) consider(k === 'gearStrong' ? 'gear' : k, R[k]);
  if (MAG_PART.test(head) && best === 'mags') best = MAG_GEAR.test(head) ? 'gear' : 'parts';
  return best;
}
function titleGun(s) {
  // Explicit type words first; the user's rule: M4/AK/AEG/rifle/carbine/SMG/shotgun is never a pistol.
  if (/\b(snipers?|bolt[ -]?action)\b/.test(s) && !/\b(sniper (pistol|scope|bag|case)|bolt[ -]?action pistol)\b/.test(s)) return { cat: 'snipers', how: 'word' };
  if (SHOTGUN.test(s)) return { cat: 'rifles', how: 'word' };
  const rifleWord = RIFLE_WORD.test(s), pistolWord = PISTOL_WORD.test(s);
  const aep = /\baeps?\b/.test(s);
  if (rifleWord && !(aep && pistolWord)) {
    if (SNIPER.test(s) && !/\bdmr\b/.test(s)) return { cat: 'snipers', how: 'model' };
    return { cat: 'rifles', how: 'word' };
  }
  if (SNIPER.test(s) && !pistolWord) return { cat: 'snipers', how: 'model' };
  if (RIFLE_MODEL.test(s) && !(pistolWord && !/\b(m4|m16|ak\d*|aeg|smg|carbine)\b/.test(s) && PISTOL_MODEL.test(s))) {
    // "MP7 GBB pistol"-style naming still counts as a rifle-bucket SMG; a bare pistol word with a pistol model wins.
    if (pistolWord && PISTOL_MODEL.test(s) && !/\b(m4|m16|ak\d*|aeg|smg|carbine|rifle)\b/.test(s)) return { cat: 'pistols', how: 'word' };
    return { cat: 'rifles', how: 'model' };
  }
  if (pistolWord || aep) return { cat: 'pistols', how: 'word' };
  if (PISTOL_MODEL.test(s)) return { cat: 'pistols', how: 'model' };
  if (/\b(gbb|gas blowback|green gas pistol|co2 pistol|nbb)\b/.test(s)) return { cat: 'pistols', how: 'weak' };
  return null;
}
const GUN_ANY = new RegExp(`${SNIPER.source}|${SHOTGUN.source}|${RIFLE_WORD.source}|${RIFLE_MODEL.source}|${PISTOL_WORD.source}|${PISTOL_MODEL.source}|\\b(gbb|aeg|airsoft gun)\\b`);

const GUN_STRONG = new RegExp(`${SNIPER.source}|${SHOTGUN.source}|${RIFLE_WORD.source.replace('aegs?|', '').replace('gbbrs?|', '')}|${RIFLE_MODEL.source}|${PISTOL_WORD.source}|${PISTOL_MODEL.source}`);

// ---- store's own product type / category ----
function hintCat(hint) {
  const h = norm(hint);
  if (h.trim().length < 2) return null;
  if (/\b(batter|lipo|charger|nimh|li-?ion)/.test(h)) return 'batteries';
  if (/\b(bb ammo|bbs|bio bbs?|tracer bbs?)\b|^ bb $|^ bb s $/.test(h)) return 'bbs';
  if (/^ (green |airsoft |propane )?gas( & co2| and co2)? $|\bpropane\b|co2 (cartridges|capsules)|\bgas (cans?|refills?)\b/.test(h)) return 'gas';
  if (/magazine (parts|seals?|catch|adapters?|springs?|lips?)|mag(azine)? parts|feed lips?|magwell/.test(h)) return 'parts';
  if (/mag(azine)? (pouch|carrier)/.test(h)) return 'gear';
  if (/\b(magazines?|mags?|shells)\b/.test(h)) return 'mags';
  if (/holster/.test(h)) return 'holsters';
  if (/\b(optic|scope|sights?|red dots?|flash ?lights?|lasers?|lights?)\b/.test(h) && !/parts/.test(h)) return 'optics';
  if (/\b(parts?|internals?|externals?|upgrades?|barrels?|hop|gears\b|gear set|gearbox|motors?|pistons?|springs?|nozzles?|cylinders?|tappet|bushings?|bearings?|triggers?|mosfet|etu|switch|receivers?|stocks?|grips?|handguards?|rails?|muzzle|silencers?|suppressors?|flash hider|bucking|seals?|catch|selector|valves?|guide|cut off|smithing|tools?|shock|hpa|regulators?|tanks?|kits?|conversion|o-?rings|gaskets|mounts?|tracers?|nubs?|pads?|sound device|bipods?|cocking|pump arm)\b/.test(h)) return 'parts';
  if (/\b(tactical gear|gear|safety|apparel|helmets?|masks?|goggles?|vests?|carriers?|chest|rigs?|pouch|belts?|slings?|bags?|backpacks?|patch(es)?|headsets?|headwear|gloves|uniforms?|eye pro|face|protection|hoodie)\b/.test(h)) return 'gear';
  if (/\b(sniper|bolt action)\b/.test(h)) return 'snipers';
  if (/\b(pistols?|handguns?|revolvers?)\b/.test(h)) return 'pistols';
  if (/\b(rifles?|aegs?|smgs?|shotguns?|carbines?|gbbr)\b/.test(h)) return 'rifles';
  if (/\bguns?\b/.test(h)) return 'gun';
  return null;
}

function classify(p) {
  const raw = norm(p.title);
  // Drop parenthesised variant notes ("(Black)", "(Steel Slide)") and trailing " - Color" for the type decision.
  const segs = String(p.title || '').split(/\s\|\s/);
  // "Title | Variant | Variant" (keep the first part) vs "Brand | Title" (keep the longest).
  const main = segs[0].trim().split(/\s+/).length >= 4 || /\d/.test(segs[0]) ? segs[0] : segs.reduce((a, b) => (b.length > a.length ? b : a), '');
  const noParen = norm(main.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));
  let head = noParen;
  const fi = head.search(FOR_RE);
  const forTail = fi > 0 ? head.slice(fi) : '';
  if (fi > 0) head = head.slice(0, fi) + ' ';
  const bi = head.search(BUNDLE_RE);
  if (bi > 0) head = head.slice(0, bi) + ' ';
  head = head.replace(/ - (black|tan|fde|od|green|grey|gray|coyote|brown|multicam|silver|white|red|blue|pink|purple|orange|sand|bronze|gold|olive|ranger green|dark earth|woodland|acu|camo)( ?\/ ?[a-z]+)* $/, ' ');
  // Installed electronics / rail words in a gun title describe the gun ("…AEG Rifle w/ MOSFET", "M4 M-LOK AEG").
  if (/\b(aegs?|gbbr?|rifles?|carbines?|smgs?|pdws?|sbrs?|pistols?|shotguns?|snipers?)\b/.test(head)) head = head.replace(/\b(feature enhanced|mosfet|etu|aster|titan|warfet|gate|m-?lok|keymod|ris|ras|rails?|handguards?|upgraded|folding stock|crane stock|slim)\b/g, ' ');

  const hint = hintCat([p.ptype, ...(Array.isArray(p.cats) ? p.cats : [])].filter(Boolean).join(', '));
  let acc = titleAccessory(head);
  const acc0 = acc;
  let gun = titleGun(head) || (fi > 0 ? null : titleGun(noParen));
  // Nothing in the main part: look at the whole title, variant segments and "( AEG )" notes included.
  if (!acc && !gun) { const full = norm(p.title); acc = titleAccessory(full.search(FOR_RE) > 0 ? full.slice(0, full.search(FOR_RE)) + ' ' : full); if (!acc) gun = titleGun(full); }
  // Accessory words that come *before* the last gun word describe the gun ("M4 MLOK AEG", "Hi-Capa 5.1 Gold Match Pistol").
  if (acc && gun && fi <= 0) {
    const gunEnd = lastIdx(GUN_STRONG, head);
    const accRe = acc === 'gear' ? R.gearStrong : R[acc] || R.parts;
    const accEnd = lastIdx(accRe, head);
    // ...but carry gear never describes a gun: "Dbl Mag Pouch Glock Mag" is a pouch, "KYWI ... Glock" a pouch.
    if (accEnd >= 0 && gunEnd >= accEnd && gun.how !== 'weak' && !/\b(pouch(es)?|kywis?|holsters?|mag(azine)? carriers?|holders?)\b/.test(head)
      // ...nor does a bare model name after a part noun with no gun word: "Aluminum Trigger T2 Hi Capa / 1911" is a trigger.
      && !(gun.how === 'model' && acc === 'parts' && /\b(triggers?|hammers?|sears?|nozzles?|inner barrels?|hop[ -]?ups?|buckings?|valves?|springs?|guide rods?|recoil springs?|mag(azine)? catch(es)?|thumb safety|safet(y|ies)|grip safety|slide stops?|charging handles?)\b/.test(head))) acc = null;
  }
  // "Green gas" describing a gun or a magazine ("CZ P-09 Green Gas/CO2 Gun", "Hi-Capa 28 round magazine, green gas").
  if (acc === 'gas') {
    if (R.mags.test(head)) acc = 'mags';
    else if (gun && gun.how !== 'weak' && (Number(p.price) || 0) >= 40) acc = null;
    else if (/\b(green ?gas|co2|gas)\b ?(\/ ?co2 )?(powered|pistols?|guns?|rifles?|blowback|gbb|shotguns?|launchers?)\b/.test(head) && (Number(p.price) || 0) >= 40) acc = null;
  }
  // "...AEG ... Battery & Charger Combo", "...Starter Kit": a gun bundle is still the gun.
  if (acc && gun && gun.how !== 'weak' && /\b(combo|package|bundle|starter kit|ultimate kit|full load|gift set)\b/.test(noParen)) acc = null;
  const price = Number(p.price) || 0;
  let cat = null, conf = 0;
  if (acc) {
    cat = acc; conf = hint === acc ? 3 : 2;
    // A gun title with a gun hint but a weak accessory word ("…Kit") stays a gun.
    if (hint && GUNS.has(hint) && gun && acc === 'parts' && /\bkit\b/.test(head) && !/conversion|upgrade|rebuild|parts/.test(head)) { cat = gun.cat; conf = 2; }
  } else if (gun) {
    if (hint && !GUNS.has(hint) && hint !== 'gun') { cat = hint; conf = 2; }
    else if (hint && GUNS.has(hint) && hint !== gun.cat) {
      // Store says pistol, title says M4 (or similar): explicit title words win, otherwise "other".
      if (gun.how === 'word' || gun.how === 'model') { cat = gun.cat; conf = 1; } else { cat = 'other'; conf = 0; }
    } else { cat = gun.cat; conf = hint ? 3 : gun.how === 'weak' ? 1 : 2; }
  } else if (hint && hint !== 'gun') { cat = hint; conf = 1; }
  else { cat = 'other'; conf = 0; }
  // Price sanity: a $9 "rifle" is a part or a toy; a gun category needs a gun-like price.
  if (GUNS.has(cat)) {
    if ((cat === 'pistols' && price && price < 12) || (cat !== 'pistols' && price && price < 20)) { cat = acc || acc0 || (hint && !GUNS.has(hint) && hint !== 'gun' ? hint : 'other'); conf = 0; }
  }
  if (cat === 'gun') cat = 'other';
  return { cat, conf, hint, forTail: !!forTail };
}

// ---- airsoft-only filter ----
const HARD_OUT = [
  ['gift card', /\b(gift ?cards?|gift ?certificates?|e-?gift|store credit)\b/],
  ['event/service', /\b(events?|tickets?|admission|field fees?|walk-?on|open play|day pass|play with rental|all day play|hour play|rentals?|rental gun|membership|birthday party|private party|lessons?|classes|tech service|labor|installation service|repair service|shipping protection|order protection|route protection|package protection|insurance|warranty|handling fee|mws_fee|processing fee|deposit|layaway|donation|raffle|mystery (box|bundle|bag)|grab bag)\b/],
  ['real firearm', /\b(for real firearms?|real firearms? only|not for airsoft|ffl|rimfire|centerfire|live ammo|ammunition|\.22 ?lr|9mm luger|\d+ ?gauge (shells?|ammo)|brass cases?|reloading|gun cleaning kit|bore snake|cleaning rod|firearm)\b/],
  ['pellet/steel BB airgun', /(\.177|\.22 cal|\.22 caliber|\.25 cal|\b4\.5 ?mm\b|\b5\.5 ?mm\b|\bpellets?\b|\bpcp\b|\bpre-?charged pneumatic\b|\bsteel bbs?\b|\bcopper ?(coated )?bbs?\b|\bdaisy\b|\bcrosman\b|\bgamo\b|\bbenjamin\b|\bbb air (pistol|rifle|gun)\b|\bair (rifle|pistol)\b|\bnbb\b.*\bbb\b|\bslingshots?\b|\bblowguns?\b|\bcrossbows?\b|\barchery\b|\barrows?\b)/],
  ['gel/foam/paintball', /\b(gel ?blasters?|gellets?|gel ?balls?|orbeez|gellyball|nerf|foam darts?|dart blasters?|rekt|water beads?|paintballs?|\.68 cal|\.50 cal paintball|first strike rounds?|tippmann|planet eclipse|dye proto|empire paintball)\b/],
  ['fishing', /\b(fishing|tackle|lures?|fish ?hooks?|jig heads?|bait|sinkers?|bobbers?|spinning reels?|fly rods?|rod and reel)\b/],
  ['knife/tool', /\b(knife|knives|machetes?|daggers?|karambits?|tomahawks?|hatchets?|axes?|bayonets?|sharpeners?|multi-?tools?|multitool|leatherman|pliers|pocket tool|folding blade|fixed blade)\b/],
  ['food/drink', /\b(coffee|energy drinks?|soda|jerky|snacks?|candy|beverages?|chewing gum|protein bars?|mres?|meals? ready|hot sauce|beer|whiskey|bourbon|tumblers?|mugs?|koozies?|water bottles?)\b/],
  ['toy/collectible', /\b(lego|funko|pop! vinyl|plush(ies)?|stuffed|action figures?|figurines?|bobble ?heads?|toys?|model kits?|keychains?|key ?chains?|key ?rings?|coins?|challenge coins?|trading cards?|puzzles?|board games?|collectibles?|dummy (guns?|replicas?)|non-?firing|display replica|cap guns?|water guns?|squirt)\b/],
  ['general apparel', /\b(t-?shirts?|tees?|tank tops?|hoodies?|sweatshirts?|sweatpants|joggers|crew socks|socks|beanies?|snapbacks?|trucker hats?|dad hats?|baseball caps?|flat ?bill|5-panel|underwear|boxers|pajamas|stickers?|decals?|posters?|banners?|flags?|wallets?|watches?|sunglasses|phone cases?|car (mats|accessories)|air fresheners?|license plates?|candles?|towels?|blankets?)\b/],
];
// Things that are airsoft gear even when a title also trips a soft word ("Coffee morale patch",
// "US flag patch", "Rubber training knife", "Tactical combat shirt").
const KEEP_OVERRIDE = {
  'food/drink': /\b(patch(es)?|pouch|hydration|bladder|molle|carriers?|holders?)\b/,
  'general apparel': /\b(patch(es)?|combat|tactical|bdu|ripstop|multicam|camo|uniform|ghillie|morale|velcro|hook ?& ?loop|hook and loop|flag holder|flag pole mount|arm ?band|grip|for (hi ?capa|glock|m4|aeg|gbb))\b/,
  'knife/tool': /\b(airsoft|aeg|gbbr?|pdw|smg|pistol|rifle|mount)\b(?!.*\b(knife|knives|sheath|blades?|axe)\b)|\b(rubber|training|foam|dummy|plastic|tpr) (knife|knives|bayonet|dagger|karambit|tomahawk)|\b(knife|bayonet|dagger) (trainer|training)|\b(regulator|hpa|airsoft|gearbox|spring|hop[ -]?up|barrel|nozzle|gbb|aeg) (multi-?tool|tool)\b/,
  'toy/collectible': /\b(airsoft (pistol|rifle|gun)|aeg|gbb|gbbr)\b(?!.*\b(lego|funko|keychains?|key ?chains?|coins?|stickers?)\b)/,
  'gel/foam/paintball': /\b(airsoft)\b(?!.*\b(gel ?blasters?|gellets?|nerf|foam darts?)\b)/,
  'fishing': /\b(airsoft|bb|aeg|gbb)\b(?!.*\bfishing\b)/,
  'real firearm': /\b(airsoft|aeg|gbb|gbbr|6mm)\b(?!.*\b(for real firearms?|real firearms? only|ffl|ammunition|live ammo)\b)/,
  'pellet/steel BB airgun': /\b(6mm|airsoft|aeg|gbbr?)\b(?!.*(\.177|\bpellets?\b|\bsteel bbs?\b|\bpcp\b))/,
};
// Clearly airsoft words anywhere (title, product type, tags).
const AIRSOFT_WORD = /\b(airsoft|aegs?|aeps?|gbbr?s?|hpa|green ?gas|6mm|6\.0[0-9] ?mm|hop[ -]?up|bbs|bio ?bbs|0\.\d\d ?g|tightbore|gearbox|mosfet|polarstar|wolverine|mtw|heretic labs|speedsoft|milsim|cqb|fps)\b/;

function isAirsoft(p, c = classify(p), store = null) {
  const t = norm(`${p.title} ${p.ptype || ''}`);
  const tags = norm([].concat(p.tags || [], p.cats || []).join(' '));
  for (const [reason, re] of HARD_OUT) {
    if (!re.test(t)) continue;
    const keep = KEEP_OVERRIDE[reason];
    if (keep && keep.test(norm(p.title))) continue;
    return { ok: false, reason };
  }
  // Store types that are airguns/firearm items rather than airsoft.
  if (!(c.cat === 'gear' && /^ apparel $/.test(norm(p.ptype))) && /^ (bb guns?|air guns?|airguns?|pellet guns?|firearms?|ammo|knives|fishing|apparel|merch(andise)?|gift cards?|events?|insurance|services?|key ?chain|dummy & replica|toys?) $/.test(norm(p.ptype)) && !/\b(airsoft|6mm)\b/.test(norm(p.title))) return { ok: false, reason: 'store type: ' + String(p.ptype).toLowerCase() };
  // When unsure, exclude: an uncategorised item needs an explicit airsoft signal.
  if (c.cat === 'other' && !store?.airsoftOnly && !AIRSOFT_WORD.test(t) && !/\bairsoft\b/.test(tags)) return { ok: false, reason: 'unsure (no airsoft signal)' };
  return { ok: true };
}

module.exports = { classify, isAirsoft, hintCat, CAT_IDS, norm };
