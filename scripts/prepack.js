// Runs after `npm install` (also on Render's build machine): pre-minifies and pre-compresses the
// static shell into server/.pack/ so the 0.1-CPU server doesn't spend its cold start doing it.
try { console.log('[prepack]', require('../server/packer').prepare()); } catch (e) { console.log('[prepack] skipped:', e.message); }
