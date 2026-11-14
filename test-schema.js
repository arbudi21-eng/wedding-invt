// Regression tests for templates/wedding_schema.sql and its call sites.
// These guard the specific bugs that made a fresh install fail or leak data.
// Run with: node test-schema.js
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS: ' + msg); }
  else { failed++; console.log('  FAIL: ' + msg); }
}

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sqlRaw = read('templates/wedding_schema.sql');
const admin = read('templates/admin.html');
const core = read('lib/core.js');

// Comments legitimately describe the old broken behaviour, so checks that look
// for a construct must ignore `--` lines. `drop function if exists f()` is also
// a valid statement and must not be mistaken for a zero-argument call.
const sql = sqlRaw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const sqlCalls = sql.split('\n').filter(l => !/drop function if exists/i.test(l)).join('\n');

console.log('=== schema structure ===');

// Dollar-quoted bodies must be balanced, otherwise the whole file aborts.
const dollars = (sqlRaw.match(/\$\$/g) || []).length;
ok(dollars % 2 === 0, 'dollar-quoted blocks are balanced (' + dollars + ' markers)');

// Every policy is dropped first, so re-running the file does not collide.
const policies = [...sql.matchAll(/create policy (\w+)/g)].map(m => m[1]);
const missingDrop = policies.filter(n => !new RegExp('drop policy if exists ' + n + '\\b').test(sql));
ok(missingDrop.length === 0, 'every create policy has a matching drop policy' + (missingDrop.length ? ' (missing: ' + missingDrop.join(', ') + ')' : ''));

console.log('');
console.log('=== fresh-install safety ===');

// settings used to be a single global row inserted with only `id`, which
// violated `wedding_id not null` and aborted the script partway through.
ok(!/create table if not exists public\.settings[\s\S]{0,400}?check \(id = 1\)/.test(sql), 'settings is not constrained to a single row');
ok(/create table if not exists public\.settings[\s\S]{0,200}?wedding_id\s+uuid primary key/.test(sql), 'settings is keyed by wedding_id');
ok(!/insert into public\.settings \(id\)/.test(sql), 'settings is not seeded with a bare id');
ok(/trigger weddings_seed_settings/.test(sql), 'new weddings seed their settings row');

// A wish wall policy or query based on current_setting('app.slug') can never
// match, because PostgREST does not set that variable.
ok(!/current_setting\('app\.slug'/.test(sql), 'no policy depends on current_setting(app.slug)');
ok(/function public\.list_wishes\(p_slug text\)/.test(sql), 'list_wishes(p_slug) exists');
ok(/grant execute on function[^;]*public\.list_wishes\(text\)[^;]*to anon/.test(sql), 'list_wishes is callable by guests');

console.log('');
console.log('=== per-wedding isolation ===');

ok(/create table if not exists public\.admins[\s\S]{0,260}?wedding_id\s+uuid not null/.test(sql), 'admins is scoped by wedding_id');
ok(/primary key \(user_id, wedding_id\)/.test(sql), 'one user can admin several weddings');
ok(/function public\.is_admin\(p_wedding uuid\)/.test(sql), 'is_admin takes a wedding');
ok(!/is_admin\(\s*\)/.test(sqlCalls), 'no zero-argument is_admin() call remains');
ok(/function public\.am_i_admin\(p_slug text\)/.test(sql), 'am_i_admin takes a slug');
ok(!/am_i_admin\(\s*\)/.test(sqlCalls), 'no zero-argument am_i_admin() call remains');
ok(/guest_summary[\s\S]{0,900}?group by wedding_id/.test(sql), 'guest_summary is grouped per wedding');
ok(/revoke all on public\.guests, public\.settings, public\.admins, public\.weddings, public\.wishes from anon/.test(sql), 'anon has no table access');
ok(!/grant execute on function[^;]*claim_slug[^;]*to anon/.test(sql), 'claim_slug is not exposed to anon');
ok(/grant execute on function public\.claim_slug\(text, uuid\) to authenticated/.test(sql), 'claim_slug is admin-only');

console.log('');
console.log('=== grant surface (anon must not reach admin paths) ===');

// Supabase's default privileges grant EXECUTE on every new function in schema
// public *explicitly to anon*, so `revoke ... from public` does not stop anon.
// Each admin-only function needs a revoke that names anon (and PUBLIC where the
// implicit grant would otherwise survive).
const adminOnlyFunctions = [
  ['claim_slug(text, uuid)', /revoke all on function public\.claim_slug\(text, uuid\) from [^;]*\banon\b/i],
  ['is_admin(uuid)', /revoke all on function public\.is_admin\(uuid\) from [^;]*\banon\b/i],
  ['am_i_admin(text)', /revoke all on function public\.am_i_admin\(text\) from [^;]*\banon\b/i]
];
for (const [name, re] of adminOnlyFunctions) {
  ok(re.test(sql), 'anon is explicitly revoked from ' + name);
}

// is_admin also needs the implicit PUBLIC grant removed, or revoking anon alone
// leaves the function callable by everyone.
ok(/revoke all on function public\.is_admin\(uuid\) from [^;]*\bpublic\b/i.test(sql),
  'is_admin drops the implicit PUBLIC execute grant');

// A trigger function can never be called directly, but the default EXECUTE
// grant still shows up in a privilege audit as a false positive.
ok(/revoke all on function public\.seed_wedding_settings\(\) from [^;]*\banon\b/i.test(sql),
  'seed_wedding_settings is not callable by anon');

// The guest_summary view is created after the table revokes, so it inherits
// default privileges: anon would hold INSERT/UPDATE/DELETE on it.
ok(/revoke all on public\.guest_summary from anon/i.test(sql), 'anon has no grant on the guest_summary view');
ok(/revoke insert, update, delete, truncate, references, trigger on public\.guest_summary from authenticated/i.test(sql),
  'guest_summary is read-only even for admins');
ok(/grant select on public\.guest_summary to authenticated/i.test(sql), 'admins can still read guest_summary');

// Locking down admin paths must not lock out guests.
ok(/grant execute on function[^;]*public\.open_invitation\(text, text\)[^;]*to anon/.test(sql), 'guests can still open an invitation');
ok(/grant execute on function[^;]*public\.submit_rsvp\(text, text, text, integer\)[^;]*to anon/.test(sql), 'guests can still RSVP');
ok(/grant execute on function[^;]*public\.submit_wish\(text, text, text\)[^;]*to anon/.test(sql), 'guests can still leave a wish');

console.log('');
console.log('=== frozen baseline matches the schema ===');

// database/0001_baseline.sql is what gets pasted into a real Supabase project.
// Guard against fixing one copy and forgetting the other.
const baselinePath = path.join(__dirname, 'database', '0001_baseline.sql');
const baselineMarker = '-- ---- BEGIN FROZEN BASELINE ----';
if (!fs.existsSync(baselinePath)) {
  ok(false, 'database/0001_baseline.sql exists');
} else {
  const baselineRaw = fs.readFileSync(baselinePath, 'utf8');
  const at = baselineRaw.indexOf(baselineMarker);
  ok(at !== -1, 'baseline carries the frozen-baseline marker');
  if (at !== -1) {
    const norm = s => s.replace(/\r\n/g, '\n').trim();
    const body = norm(baselineRaw.slice(at + baselineMarker.length));
    ok(body === norm(sqlRaw),
      'baseline body is identical to templates/wedding_schema.sql (update both, or add database/0002_*.sql)');
  }
}

console.log('');
console.log('=== phase 1 migration (drafts + ownership) ===');

const saasPath = path.join(__dirname, 'database', '0002_saas.sql');
if (!fs.existsSync(saasPath)) {
  ok(false, 'database/0002_saas.sql exists');
} else {
  const saasRaw = fs.readFileSync(saasPath, 'utf8');
  const saas = saasRaw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

  const saasDollars = (saasRaw.match(/\$\$/g) || []).length;
  ok(saasDollars % 2 === 0, '0002 dollar-quoted blocks are balanced');

  // Re-running the migration must not collide with existing objects.
  const saasPolicies = [...saas.matchAll(/create policy (\w+)/g)].map(m => m[1]);
  const saasMissingDrop = saasPolicies.filter(n => !new RegExp('drop policy if exists ' + n + '\\b').test(saas));
  ok(saasMissingDrop.length === 0,
    '0002 drops every policy it recreates' + (saasMissingDrop.length ? ' (missing: ' + saasMissingDrop.join(', ') + ')' : ''));

  // Reuse the existing owner column; a second owner_id would split the truth.
  ok(!/owner_id\s+uuid/i.test(saas), '0002 does not add a duplicate owner_id column');
  ok(/alter table public\.weddings[\s\S]{0,400}?add column if not exists status/i.test(saas),
    '0002 adds the lifecycle columns idempotently');
  ok(/add column if not exists content\s+jsonb/i.test(saas), '0002 adds JSONB content');

  // The app generates {names}-{UPPERCASE base32}; the constraint must allow it.
  ok(/slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*-\[A-Z2-7\]\{6\}\$'/.test(saas),
    'the slug constraint allows an uppercase base32 suffix');
  ok(/create unique index if not exists weddings_slug_lower_idx[\s\S]{0,80}?lower\(slug\)/i.test(saas),
    'slug uniqueness is case-insensitive');
  ok(!/create unique index if not exists weddings_slug_key/i.test(saas),
    '0002 does not reuse the implicit weddings_slug_key index name');

  ok(/jsonb_typeof\(content\) = 'object'/.test(saas), 'content is constrained to a JSON object');
  ok(/octet_length\(content::text\) <= 262144/.test(saas), 'content has a 256 KB cap');
  ok(/status in \('draft', 'published', 'archived'\)/.test(saas), 'status has a closed set of values');
  // makeSlug() can emit a-b-XXXXXX for two one-letter names; the bound must
  // start at 10 or short-named couples cannot create a draft at all.
  ok(/char_length\(slug\) between 10 and 64/.test(saas),
    'the slug length bound admits the shortest generated slug');

  // Creation is a definer function: the client never needs insert rights.
  ok(/function public\.create_wedding\(/.test(saas), 'create_wedding() exists');
  ok(/security definer/.test(saas), 'create_wedding() is security definer');
  ok(/revoke all on function public\.create_wedding\(text, text, jsonb\) from [^;]*\banon\b/i.test(saas),
    'create_wedding is revoked from anon');
  ok(/grant execute on function public\.create_wedding\(text, text, jsonb\) to authenticated/i.test(saas),
    'create_wedding is authenticated-only');
  ok(/insert into public\.admins/i.test(saas), 'create_wedding registers the owner as admin');
  ok(!/exception when unique_violation/i.test(saas),
    'create_wedding lets 23505 escape so the app can retry the slug');

  // Owner RLS: read/update/delete only. Insert stays RPC-only.
  ok(/create policy weddings_owner_read[\s\S]{0,200}?using \(owner = auth\.uid\(\)\)/.test(saas),
    'owners can read their own weddings');
  ok(/create policy weddings_owner_update[\s\S]{0,240}?with check \(owner = auth\.uid\(\)\)/.test(saas),
    'owners can update their own weddings without transferring them');
  ok(/create policy weddings_owner_delete[\s\S]{0,160}?using \(owner = auth\.uid\(\)\)/.test(saas),
    'owners can delete their own weddings');
  ok(!/create policy weddings_owner_insert/i.test(saas),
    'there is no direct insert policy for weddings');

  ok(/function public\.weddings_guard\(\)/.test(saas), 'the slug guard trigger function exists');
  ok(/slug is immutable after publish/.test(saas), 'the slug is immutable after publish');
  ok(/revoke all on function public\.weddings_guard\(\) from [^;]*\banon\b/i.test(saas),
    'the trigger function is revoked from anon');

  // Phase 1 must not smuggle in later-phase tables half-finished.
  ok(!/create table[^;]*public\.(orders|plans|assets)/i.test(saas),
    '0002 leaves orders/plans/assets to later phases');
  ok(!/open_invitation[\s\S]{0,300}?status/i.test(saas),
    '0002 does not gate guest RPCs on status yet');
}

console.log('');
console.log('=== call sites match the schema ===');

ok(!/from\('wishes'\)\.select/.test(core), 'guest site does not select the wishes table directly');
ok(/rpc\('list_wishes',\{p_slug:SLUG\}\)/.test(core), 'guest site reads wishes through list_wishes');
ok(!/\.eq\('id',1\)/.test(admin), 'admin console no longer queries settings by id=1');
ok(/from\('settings'\)\.select\('\*'\)\.eq\('wedding_id',S\.wid\)/.test(admin), 'admin console reads settings by wedding_id');
ok(/from\('guest_summary'\)\.select\('\*'\)\.eq\('wedding_id',S\.wid\)/.test(admin), 'admin console scopes the summary to its wedding');
ok(/rpc\('am_i_admin',\{p_slug:SLUG\}\)/.test(admin), 'admin console checks admin rights for its own slug');

// The app re-derives the slug rule in JS so it can fail before a round trip.
// If the two ever disagree, someone gets a database error they cannot fix.
const appDraftPath = path.join(__dirname, 'apps', 'web', 'lib', 'draft.js');
if (fs.existsSync(appDraftPath)) {
  const appDraft = fs.readFileSync(appDraftPath, 'utf8');
  const match = appDraft.match(/SLUG_RE = \/(.+)\//);
  ok(match && match[1] === '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$',
    'apps/web SLUG_RE is identical to the database slug constraint');
} else {
  ok(false, 'apps/web/lib/draft.js exists');
}

console.log('');
console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
