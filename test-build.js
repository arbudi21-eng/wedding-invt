// Regression tests for WedCore.build() — run with: node test-build.js
const fs = require('fs');
const path = require('path');
const { build, configJs, headers } = require('./lib/core.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS: ' + msg); }
  else { failed++; console.log('  FAIL: ' + msg); }
}

const design = fs.readFileSync(path.join(__dirname, 'designs', '01-editorial-mocha.html'), 'utf8');
const ev = {
  names: ['Renée', 'Dewa'],
  slug: 'renee-dewa-k7x2q9',
  dateISO: '2027-03-13T10:00:00',
  schedule: { ceremony: '10:00', reception: '12:00' },
  venue: { name: 'Venue', address: 'Somewhere' },
  dress: { en: 'Warm tones', id: 'Warna hangat' },
  gifts: [{ bank: 'BCA', name: 'Renée', no: '123' }],
  supabase: { url: 'https://example.supabase.co', anonKey: 'anon-key' }
};

const { html, miss } = build(design, ev, {}, '', ev.slug);

console.log('=== build tests ===');
ok(miss.length === 0, 'no build warnings (' + JSON.stringify(miss) + ')');
ok(html.includes("const ms=$('#mas')"), 'gallery builder is preserved');
ok(html.includes('CFG.gifts.forEach'), 'gift-list builder is preserved');
ok(html.includes('CFG.wishes.length'), 'wish renderer is preserved');
ok(html.includes("rpc('list_wishes'"), 'wish wall reads through the slug-scoped RPC');
ok(!html.includes("from('wishes').select"), 'wish wall does not read the wishes table directly');
ok(!html.includes('let pax=1;const nm'), 'WhatsApp handlers were replaced');
ok(html.includes('parse();init();'), 'Supabase init runs after parse()');
ok((html.match(/parse\(\);/g) || []).length === 1, 'parse() is called exactly once');
ok(html.includes('"slug":"renee-dewa-k7x2q9"'), 'slug is injected into CFG');
ok(html.includes('<title>Renée & Dewa — Wedding Invitation</title>'), 'couple names replace the sample <title>');
ok(html.includes('<h1>Renée<i>and</i>Dewa</h1>'), 'couple names replace the sample hero');
ok(!html.includes('Amara'), 'no sample bride name remains');
ok(html.includes('Renée notices the small things'), 'names inside script strings are substituted');

// Every inline script must still parse as valid JavaScript.
const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
ok(scripts.length > 0, 'found inline scripts to syntax-check');
let syntaxOk = true;
for (const body of scripts) {
  try { new Function(body); } catch (e) { syntaxOk = false; console.log('    syntax error: ' + e.message); }
}
ok(syntaxOk, 'all inline scripts compile');

console.log('');
console.log('=== config.js tests ===');
const cfg = configJs({ url: 'https://x.supabase.co', anonKey: 'k', slug: 'amara-dewa-abc123' });
ok(cfg.includes('"amara-dewa-abc123"'), 'object form writes SLUG');
ok(cfg.includes('"https://x.supabase.co"'), 'object form writes URL');
ok(cfg.includes('"k"'), 'object form writes anon key');
const legacy = configJs({ url: 'https://x.supabase.co', anonKey: 'k' }, { slug: 'amara-dewa-abc123' });
ok(legacy.includes('"amara-dewa-abc123"'), 'legacy positional form keeps SLUG');
ok(legacy.includes('"https://x.supabase.co"'), 'legacy positional form keeps URL');

// An apostrophe in a name must not break the generated JS.
const tricky = build(design, Object.assign({}, ev, { names: ["O'Brien", 'Dewa'] }), {}, '', 'obrien-dewa-abc123');
const trickyScripts = [...tricky.html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
let trickyOk = true;
for (const body of trickyScripts) {
  try { new Function(body); } catch (e) { trickyOk = false; console.log('    syntax error: ' + e.message); }
}
ok(trickyOk, 'apostrophe in a name does not break the script');

console.log('');
console.log('=== all designs ===');
const failures = [];
const designFiles = fs.readdirSync(path.join(__dirname, 'designs')).filter(f => f.endsWith('.html'));
for (const file of designFiles) {
  const out = build(fs.readFileSync(path.join(__dirname, 'designs', file), 'utf8'), ev, {}, '', ev.slug);
  let error = out.miss.join(', ');
  if (!out.html.includes('CFG.gifts.forEach') || !out.html.includes('CFG.wishes.length') || !out.html.includes("const ms=$('#mas')")) {
    error = error || 'build lost gallery/gift/wish code';
  }
  const bodies = [...out.html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const body of bodies) {
    try { new Function(body); } catch (e) { error = error || e.message; break; }
  }
  if (error) failures.push(file + ': ' + error);
}
ok(failures.length === 0, 'all ' + designFiles.length + ' designs build and compile' + (failures.length ? ' — ' + failures.join(' | ') : ''));

console.log('');
console.log('=== _headers tests ===');
const hdr = headers('amara-dewa-abc123');
ok(hdr.includes('/admin/*\n  X-Robots-Tag: noindex'), 'root admin rules are present');
ok(hdr.includes('/config.js\n  Cache-Control: no-store'), 'root config rules are present');
ok(hdr.includes('/amara-dewa-abc123/admin/*\n  X-Robots-Tag: noindex'), 'slug-scoped admin rules are present');
ok(hdr.includes('/amara-dewa-abc123/config.js\n  Cache-Control: no-store'), 'slug-scoped config rules are present');
ok((headers('').match(/\/admin\/\*/g) || []).length === 1, 'empty slug emits root rules only');
ok((headers('   ').match(/\/admin\/\*/g) || []).length === 1, 'whitespace slug is trimmed');

// The studio must call the shared function, not carry its own copy.
const studio = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(studio.includes('WedCore.headers(ev.slug)'), 'studio writes _headers through WedCore.headers');

console.log('');
console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
