// App-level tests for the Phase 1 shell.
// Run with: npm test  (from apps/web)
//
// These are the checks that cannot live in SQL: the JavaScript shape of a
// draft, the slug the app generates, and the drift between the app's rules and
// database/0002_saas.sql.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSlug, slugify } from '../lib/core.js';
import {
  DESIGNS,
  DEFAULT_DESIGN,
  designName,
  isDesignId,
} from '../lib/designs.js';
import {
  SLUG_RE,
  buildDateISO,
  cleanLine,
  cleanMultiline,
  cleanUrl,
  draftFromForm,
  draftTitle,
  formatDateISO,
  normalizeContent,
  splitDateISO,
} from '../lib/draft.js';
import { buildInvitationHtml, readDesignHtml, readWiring } from '../lib/preview.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, '..');
const repoRoot = path.join(appRoot, '..', '..');

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS: ' + message);
  } else {
    failed += 1;
    console.log('  FAIL: ' + message);
  }
}

function eq(actual, expected, message) {
  if (actual === expected) {
    passed += 1;
    console.log('  PASS: ' + message);
  } else {
    failed += 1;
    console.log(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

// ---------------------------------------------------------------- designs

console.log('=== designs ===');

const designFiles = fs
  .readdirSync(path.join(repoRoot, 'designs'))
  .filter((name) => name.endsWith('.html'))
  .map((name) => name.slice(0, -'.html'.length))
  .sort();

const designIds = DESIGNS.map((d) => d.id).sort();

eq(DESIGNS.length, 33, 'exactly 33 designs are offered');
eq(
  JSON.stringify(designIds),
  JSON.stringify(designFiles),
  'every listed design exists as designs/<id>.html and nothing is missing'
);
eq(new Set(DESIGNS.map((d) => d.id)).size, DESIGNS.length, 'design ids are unique');
ok(isDesignId(DEFAULT_DESIGN), 'DEFAULT_DESIGN is a real design');
eq(designName(DEFAULT_DESIGN), 'Editorial Mocha', 'design names resolve');
eq(designName('not-a-design'), 'not-a-design', 'unknown design name falls back to the id');

const dbSql = read('database/0002_saas.sql');

ok(
  /check \(design ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$' and char_length\(design\) <= 60\)/.test(dbSql),
  'database design constraint matches the id shape used by designs.js'
);
ok(
  DESIGNS.every((design) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(design.id)),
  'every design id satisfies the database design constraint'
);

// ------------------------------------------------------------------ slugs

console.log('=== slug format ===');

const DB_SLUG_CHECK = "check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$')";
ok(dbSql.includes(DB_SLUG_CHECK), 'database slug constraint is exactly the shape in this test');
ok(
  /char_length\(slug\) between 10 and 64/.test(dbSql),
  'database slug length bound matches the shortest slug makeSlug() can generate'
);
eq(SLUG_RE.source, '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$', 'SLUG_RE matches the SQL regex');

const samples = [
  ['Amara', 'Dewa'],
  ['Renée', 'Zoë'],
  ['Müller', 'François'],
  ['A', 'B'],
  ['', 'Solo'],
  ['admin', 'Dewa'],
  ['  spaced  ', 'names  '],
  ['A'.repeat(80), 'B'.repeat(80)],
  ['李', '王'],
];

for (const names of samples) {
  const slug = makeSlug(names);
  ok(SLUG_RE.test(slug), `makeSlug(${JSON.stringify(names)}) -> ${slug} matches SLUG_RE`);
  ok(slug.length >= 10 && slug.length <= 64, `${slug} fits the 10..64 length constraint`);
  ok(
    !/^(admin|assets|api|sites)(-|$)/.test(slug),
    `${slug} does not start with a reserved prefix`
  );
}

ok(slugify('Renée') === 'renee', 'diacritics are stripped before hashing the slug');
eq(makeSlug(['admin', 'Dewa']).split('-')[0], 'wedding', 'a reserved name falls back to wedding-<random>');
eq(makeSlug(['', '']).split('-')[0], 'wedding', 'two empty names fall back to wedding-<random>');

ok(SLUG_RE.test('amara-dewa-A2B3C4'), 'valid mixed-case slug is accepted');
ok(!SLUG_RE.test('amara-dewa-a2b3c4'), 'lowercase suffix is rejected');
ok(!SLUG_RE.test('Amara-dewa-A2B3C4'), 'uppercase name part is rejected');
ok(!SLUG_RE.test('amara-dewa-A2B3C1'), 'digits 0/1 outside base32 are rejected');
ok(!SLUG_RE.test('amara--dewa-A2B3C4'), 'double hyphen is rejected');
ok(!SLUG_RE.test('amara-dewa-A2B3C4-extra'), 'trailing segment is rejected');

// --------------------------------------------------------------- cleaning

console.log('=== cleaning ===');

eq(cleanLine('  Amara\u0000  Dewa  ', 60), 'Amara Dewa', 'cleanLine strips control chars and collapses spaces');
eq(cleanLine('x'.repeat(100), 10), 'xxxxxxxxxx', 'cleanLine caps length');
eq(cleanMultiline('a\r\nb\r\n\r\n\r\nc', 100), 'a\nb\n\nc', 'cleanMultiline normalises newlines and squeezes blank lines');
eq(cleanUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1', 'https URL survives');
eq(cleanUrl('javascript:alert(1)'), '', 'javascript: URL is rejected');
eq(cleanUrl('data:text/html,hi'), '', 'data: URL is rejected');
eq(cleanUrl('not a url'), '', 'garbage URL is rejected');
eq(cleanUrl(''), '', 'empty URL stays empty');

console.log('=== dates ===');

eq(buildDateISO('2027-03-13', '10:30'), '2027-03-13T10:30:00', 'date and time combine');
eq(buildDateISO('2027-03-13', ''), '2027-03-13T10:00:00', 'missing time defaults to 10:00');
eq(buildDateISO('2027-03-13', '99:99'), '2027-03-13T10:00:00', 'invalid time falls back to 10:00');
eq(buildDateISO('2027-02-31', '10:00'), '', 'a date that does not exist is rejected');
eq(buildDateISO('2028-02-29', '10:00'), '2028-02-29T10:00:00', 'leap day in a leap year is accepted');
eq(buildDateISO('2027-02-29', '10:00'), '', 'leap day in a normal year is rejected');
eq(buildDateISO('', '10:00'), '', 'an empty date has no dateISO');
eq(buildDateISO('13/03/2027', '10:00'), '', 'a non-ISO date is rejected');

const split = splitDateISO('2027-03-13T18:45:00');
eq(split.date, '2027-03-13', 'splitDateISO returns the date');
eq(split.time, '18:45', 'splitDateISO returns the time');
eq(formatDateISO('2027-03-13T18:45:00'), '13 Mar 2027 · 18:45', 'formatDateISO renders a readable label');
eq(formatDateISO(''), '', 'formatDateISO is empty without a date');

// ----------------------------------------------------------- draft parsing

console.log('=== draftFromForm ===');

const minimal = draftFromForm(form({ bride: 'Amara', groom: 'Dewa' }));
ok(minimal.ok, 'names alone are enough to create a draft');
eq(minimal.content.names[0], 'Amara', 'first name is stored');
eq(minimal.content.names[1], 'Dewa', 'second name is stored');
eq(minimal.content.dateISO, '', 'an omitted date leaves dateISO empty');
eq(minimal.design, DEFAULT_DESIGN, 'a missing design falls back to the default');
eq(minimal.content.locale, 'id', 'locale defaults to Indonesian');

const missing = draftFromForm(form({ bride: '  ', groom: '' }));
ok(!missing.ok, 'missing names are rejected');
ok(Boolean(missing.errors.bride), 'the first missing name gets an inline error');
ok(Boolean(missing.errors.groom), 'the second missing name gets an inline error');
eq(missing.content, null, 'a rejected form produces no content');

const badDate = draftFromForm(form({ bride: 'A', groom: 'B', date: '2027-02-31' }));
ok(!badDate.ok, 'an impossible date is rejected');
ok(Boolean(badDate.errors.date), 'the date error is attached to the date field');

const blankDate = draftFromForm(form({ bride: 'A', groom: 'B', date: '' }));
ok(blankDate.ok, 'an empty date is still allowed for a draft');

const full = draftFromForm(
  form({
    bride: 'Amara',
    groom: 'Dewa',
    date: '2027-03-13',
    time: '18:45',
    design: '10-batik-nusantara',
    locale: 'en',
    venueName: 'Gedung  Serbaguna',
    venueAddress: 'Jl. Merdeka 1\r\nJakarta',
    venueMaps: 'https://maps.google.com/?q=test',
    ceremony: '16:00',
    reception: '19:00',
    dressEn: 'Formal',
    dressId: 'Formal',
    storyEn: 'We met at a wedding.\n\nThen we danced.',
    storyId: 'Kami bertemu di pesta.',
    host: 'Keluarga Amara',
  })
);
ok(full.ok, 'a complete form is accepted');
eq(full.design, '10-batik-nusantara', 'the chosen design is kept');
eq(full.content.locale, 'en', 'the chosen locale is kept');
eq(full.content.dateISO, '2027-03-13T18:45:00', 'the date and time become a dateISO');
eq(full.content.venue.name, 'Gedung Serbaguna', 'venue text is collapsed');
eq(full.content.venue.mapsUrl, 'https://maps.google.com/?q=test', 'the maps URL is kept');
eq(full.content.schedule.ceremony, '16:00', 'the ceremony time is kept');
eq(full.content.story.en.length, 2, 'blank lines split the story into beats');
eq(full.content.story.id[0], 'Kami bertemu di pesta.', 'the Indonesian story is kept');
eq(full.content.host, 'Keluarga Amara', 'the host is kept');
eq(full.content.gifts.length, 0, 'gifts start empty in Phase 1');
eq(full.content.photos.cover, '', 'photos start empty in Phase 1');

const oddDesign = draftFromForm(form({ bride: 'A', groom: 'B', design: '../../etc/passwd' }));
eq(oddDesign.design, DEFAULT_DESIGN, 'an unknown design cannot reach the database');

const oddLocale = draftFromForm(form({ bride: 'A', groom: 'B', locale: 'xx' }));
eq(oddLocale.content.locale, 'id', 'an unknown locale falls back to Indonesian');

// -------------------------------------------------------- normalizeContent

console.log('=== normalizeContent ===');

const empty = normalizeContent(null);
eq(empty.version, 1, 'a missing draft normalises to version 1');
eq(empty.names.length, 2, 'names are always a pair');
eq(empty.names[0], '', 'a missing name is an empty string, not undefined');
eq(empty.locale, 'id', 'a missing locale defaults to Indonesian');
eq(empty.story.en.length, 0, 'missing story beats become an empty list');
eq(empty.gifts.length, 0, 'missing gifts become an empty list');
ok(empty.venue && typeof empty.venue === 'object', 'venue is always an object');

const messy = normalizeContent({
  names: ['  Amara ', null],
  dateISO: 123,
  venue: 'not-an-object',
  schedule: { ceremony: '7pm', reception: '19:00' },
  story: { en: [' one ', '', 2], id: 'nope' },
  gifts: [
    { bank: 'BCA', name: 'Amara', no: '123' },
    { bank: '', no: '999' },
    { bank: 'Mandiri', no: '' },
    'junk',
  ],
  photos: { cover: 'x', story: ['a', 'b'] },
  locale: 'en',
});
eq(messy.names[0], 'Amara', 'names are trimmed');
eq(messy.names[1], '', 'a null name becomes an empty string');
eq(messy.dateISO, '123', 'a non-string dateISO is coerced');
eq(messy.venue.name, '', 'a non-object venue becomes an empty object');
eq(messy.schedule.ceremony, '', 'an invalid time is dropped');
eq(messy.schedule.reception, '19:00', 'a valid time is kept');
eq(messy.story.en.length, 2, 'non-string story entries are coerced or dropped');
eq(messy.story.en[0], 'one', 'story entries are trimmed');
eq(messy.gifts.length, 1, 'gifts without a bank or account number are dropped');
eq(messy.gifts[0].bank, 'BCA', 'the surviving gift keeps its bank');
eq(messy.photos.story.length, 2, 'photo lists stay lists');
eq(messy.locale, 'en', 'a valid locale is kept');

eq(draftTitle({ names: ['Amara', 'Dewa'] }), 'Amara & Dewa', 'the title joins both names');
eq(draftTitle({ names: ['Amara', ''] }), 'Amara', 'a single name is its own title');
eq(draftTitle({}), 'Untitled invitation', 'an empty draft has a safe title');

// ------------------------------------------------------------- app wiring

console.log('=== app wiring ===');

const appSource = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'test') continue;
    if (entry.name === 'scripts' || entry.name.includes('.generated.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs)$/.test(entry.name)) appSource.push(full);
  }
})(appRoot);

const combined = appSource.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

ok(!/process\.env\.NEXT_PUBLIC/.test(combined), 'no Supabase key is exposed to the browser via process.env.NEXT_PUBLIC_*');
ok(!/SERVICE_ROLE|service_role/.test(combined), 'no code path loads a service_role key');
ok(!combined.includes('createBrowserClient'), 'the app has no browser Supabase client');
ok(!/auth\.getSession\(/.test(combined), 'sessions are verified with getClaims(), never auth.getSession()');

const proxy = fs.readFileSync(path.join(appRoot, 'proxy.js'), 'utf8');
ok(/export async function proxy\(/.test(proxy), 'proxy.js exports proxy() for Next 16');
ok(!/export (async )?function middleware\(/.test(proxy), 'proxy.js does not export the old middleware() name');
ok(proxy.includes("'/dashboard'") && proxy.includes("'/build'"), 'proxy guards both dashboard and build routes');

const actionFiles = appSource.filter((file) => file.includes(`${path.sep}actions${path.sep}`));
ok(actionFiles.length >= 2, 'both action modules exist');
for (const file of actionFiles) {
  const src = fs.readFileSync(file, 'utf8');
  ok(src.startsWith("'use server'"), `${path.basename(file)} is a server action module`);
  ok(!/^export (const|let|function|class) /m.test(src), `${path.basename(file)} only exports async actions`);
}

const weddingActions = fs.readFileSync(
  path.join(appRoot, 'app', 'actions', 'weddings.js'),
  'utf8'
);
ok(weddingActions.includes("rpc('create_wedding'"), 'drafts are created through create_wedding()');
ok(weddingActions.includes("error.code !== '23505'"), 'the slug retry loop only retries unique violations');
ok(weddingActions.includes('MAX_SLUG_ATTEMPTS'), 'the slug retry loop is bounded');
ok(!/\.insert\(/.test(weddingActions), 'the app never inserts into weddings directly');

// ------------------------------------------------- generated invitation HTML

console.log('=== generated invitation scripts ===');

// Regression guard. A single JavaScript syntax error inside a generated
// template (e.g. an unescaped quote in an inline event handler) silently kills
// the ENTIRE template script: uploaded photos never apply and every `.rv`
// section stays at opacity 0. Every inline <script> body the generator emits
// must therefore parse as JavaScript.
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function inlineScriptBodies(html) {
  const bodies = [];
  let match;
  SCRIPT_RE.lastIndex = 0;
  while ((match = SCRIPT_RE.exec(html))) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // external script: nothing to parse
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    // Only classic/module JavaScript. JSON-LD blocks are data, not code.
    if (type && !/(java|ecma)script|module/i.test(type[1])) continue;
    bodies.push(body);
  }
  return bodies;
}

const probeContent = {
  names: ['Eko', 'Karto'],
  dateISO: '2026-12-31T10:00:00',
  locale: 'id',
  venue: { name: 'Gedung', address: 'Jl. Mawar 1', mapsUrl: '' },
  story: { en: ['We met.'], id: ['Kami bertemu.'] },
  gifts: [{ bank: 'Mandiri', name: 'Eko', no: '1234567890' }],
  photos: {
    cover: 'https://example.com/cover.jpg',
    man: 'https://example.com/man.jpg',
    woman: 'https://example.com/woman.jpg',
    hero: 'https://example.com/hero.jpg',
    story: [],
    album: [],
  },
  video: { link: 'https://www.youtube.com/watch?v=ghZt2cILcCU', src: '' },
};

let scriptTotal = 0;
let scriptBad = 0;
let ytDesigns = 0;
let ytUnsafe = 0;

for (const design of DESIGNS) {
  const { html } = buildInvitationHtml({
    design: design.id,
    content: probeContent,
    slug: 'eko-karto-K7DCHO',
  });

  const bodies = inlineScriptBodies(html);
  scriptTotal += bodies.length;
  bodies.forEach((body, index) => {
    try {
      // Compiles the body without executing it — a syntax error throws here.
      new Function(body);
    } catch (error) {
      scriptBad += 1;
      console.log(`  FAIL: ${design.id} inline script #${index} does not parse — ${error.message}`);
    }
  });

  // The YouTube poster fallback keeps its inline handler quoted with the
  // &quot; HTML entity so it never terminates the surrounding JS string.
  if (html.includes('i.ytimg.com')) {
    ytDesigns += 1;
    if (!html.includes('this.src=&quot;https://i.ytimg.com')) ytUnsafe += 1;
  }
}

ok(scriptTotal > 0, `the generator emits inline scripts to check (${scriptTotal} found)`);
eq(scriptBad, 0, 'every generated inline script parses as JavaScript');
ok(ytDesigns > 0, `the YouTube video block is present to check (${ytDesigns} designs)`);
eq(ytUnsafe, 0, 'the YouTube poster onerror handler is quoted with &quot;, never a raw quote');

// The photo-slot wiring must be injected after the CFG patch so uploaded
// images apply at runtime.
const wiringHtml = buildInvitationHtml({
  design: DESIGNS[0].id,
  content: probeContent,
  slug: 'eko-karto-K7DCHO',
}).html;
ok(/data-photo="/.test(wiringHtml), 'templates carry data-photo slots');
ok(
  /Object\.assign\(CFG,\{[\s\S]*?\}\);[\s\S]*?var map=\{cover:CFG\.cover/.test(wiringHtml),
  'the photo-slot wiring is injected directly after the CFG patch'
);

// ------------------------------------------------------- bundled templates

console.log('=== bundled templates ===');

// The generator reads templates from lib/templates.generated.js, which is
// inlined from <repo>/designs and <repo>/templates at build time. It must stay
// byte-identical to the source files, or the deployed app would ship a stale
// design. Regenerate with: npm run gen:templates
let staleDesigns = 0;
for (const id of designFiles) {
  const raw = fs.readFileSync(path.join(repoRoot, 'designs', `${id}.html`), 'utf8');
  if (readDesignHtml(id) !== raw) {
    staleDesigns += 1;
    console.log(`  FAIL: ${id} bundled template is stale — run npm run gen:templates`);
  }
}
eq(staleDesigns, 0, `all ${designFiles.length} bundled templates match designs/<id>.html`);
eq(
  readWiring(),
  fs.readFileSync(path.join(repoRoot, 'templates', 'wiring.js'), 'utf8'),
  'bundled wiring matches templates/wiring.js'
);

// ------------------------------------------------------- publish payments

console.log('=== publish payments ===');

const publishAction = read('apps/web/app/actions/publish.js');
const publishForm = read('apps/web/app/manage/[slug]/PublishForm.jsx');
const managePage = read('apps/web/app/manage/[slug]/page.js');
const dokuWebhook = read('apps/web/app/api/payments/doku/route.js');
const dokuMcp = read('apps/web/lib/doku/mcp.js');
const paymentsSql = read('database/0006_payments.sql');

ok(publishAction.includes("from '@/lib/doku/mcp'"), 'publish actions use the DOKU MCP client');
ok(
  !publishAction.includes('@/lib/doku/snap'),
  'publish actions no longer call the unverified SNAP client'
);
ok(
  publishAction.includes('const PUBLISH_PRICE_IDR = 100000'),
  'publishing costs one flat Rp 100.000'
);
ok(
  publishAction.includes("new Set(['SAGALA'])"),
  'the promo value is validated only on the server'
);
ok(
  publishAction.includes('export async function createDokuPayment(prevState, formData)'),
  'createDokuPayment matches the useActionState signature'
);
ok(
  publishAction.includes('export async function checkDokuPayment(prevState, formData)'),
  'checkDokuPayment matches the useActionState signature'
);
ok(!publishForm.includes('SAGALA'), 'the promo code is not shipped in the client form');
ok(!/dku_key_|api_key_/.test(publishForm), 'no DOKU key format is shipped to the browser');
ok(
  publishForm.includes('checkDokuPayment'),
  'the client verifies payment through the authenticated action'
);
ok(
  publishForm.includes('type="button"') &&
    publishForm.includes('onClick={handlePayment}') &&
    publishForm.includes("formData.set('promoCode', '')"),
  'a dedicated payment button works even when the promo field is empty'
);
ok(
  publishForm.includes('Bayar Rp 100.000'),
  'the always-available action is labelled as a payment'
);
ok(
  publishForm.includes('onSubmit={handlePromoSubmit}') &&
    publishForm.includes('Pakai kode promosi'),
  'promo submission remains a separate, optional action'
);
ok(publishForm.includes('<img'), 'the client renders the QRIS image');
ok(publishForm.includes('Cek status pembayaran'), 'manual status check is available');
ok(dokuMcp.includes('/^api_key_/i'), 'the MCP client rejects legacy key formats');
ok(dokuMcp.includes('create_qris_payment'), 'the MCP client creates QRIS via the live tool');
ok(
  dokuMcp.includes('get_transaction_by_invoice_number'),
  'the MCP client queries invoices via the live tool'
);
ok(!dokuWebhook.includes('@/lib/supabase'), 'the DOKU webhook never imports Supabase');
ok(!dokuWebhook.includes("from('weddings')"), 'the DOKU webhook performs no database writes');
ok(managePage.includes('payment_qr_content'), 'the manage page loads the saved QRIS');
ok(
  managePage.includes('paymentsReady'),
  'the manage page degrades when the payment migration is missing'
);
ok(paymentsSql.includes('amount_idr = 100000'), 'the migration enforces the flat price');
ok(
  paymentsSql.includes('weddings_payment_invoice_key'),
  'the migration enforces unique DOKU invoices'
);
ok(
  !/service_role/.test(publishAction + dokuMcp + dokuWebhook),
  'no service_role key in any payment path'
);

// ---------------------------------------------------------- music uploads

console.log('=== music uploads ===');

const photosAction = read('apps/web/app/actions/photos.js');
const assetUpload = read('apps/web/components/AssetUpload.jsx');

ok(photosAction.includes("AUDIO_SLOTS = new Set(['music'])"), 'music is a valid upload slot');
ok(
  photosAction.includes("['audio/flac', 'flac']"),
  'common song formats beyond MP3 are accepted'
);
ok(
  photosAction.includes('AUDIO_EXT.get(extensionOf(file.name))'),
  'audio uploads fall back to the filename extension when MIME is missing'
);
ok(
  photosAction.includes('const MAX_AUDIO_BYTES = 30 * 1024 * 1024'),
  'a full-length song fits under the music size cap'
);
ok(
  /Gunakan MP3, M4A, AAC, OGG, WAV, atau FLAC/.test(photosAction),
  'audio format errors are in Bahasa Indonesia'
);
ok(
  assetUpload.includes('.aac,.ogg,.oga,.opus,.flac,.wav,.webm'),
  'the file picker offers the formats the server accepts'
);
ok(
  assetUpload.includes('Berkas musik lebih besar dari 30 MB.'),
  'the picker rejects oversized songs before the upload starts'
);

// ---------------------------------------------------------------- summary

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
