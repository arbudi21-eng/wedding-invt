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
console.log('=== call sites match the schema ===');

ok(!/from\('wishes'\)\.select/.test(core), 'guest site does not select the wishes table directly');
ok(/rpc\('list_wishes',\{p_slug:SLUG\}\)/.test(core), 'guest site reads wishes through list_wishes');
ok(!/\.eq\('id',1\)/.test(admin), 'admin console no longer queries settings by id=1');
ok(/from\('settings'\)\.select\('\*'\)\.eq\('wedding_id',S\.wid\)/.test(admin), 'admin console reads settings by wedding_id');
ok(/from\('guest_summary'\)\.select\('\*'\)\.eq\('wedding_id',S\.wid\)/.test(admin), 'admin console scopes the summary to its wedding');
ok(/rpc\('am_i_admin',\{p_slug:SLUG\}\)/.test(admin), 'admin console checks admin rights for its own slug');

console.log('');
console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
