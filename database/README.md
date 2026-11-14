# Database

SQL that gets applied to the shared Supabase project. One project hosts every
couple's invitation; rows are isolated per wedding by `wedding_id` + RLS.

## `0001_baseline.sql`

The frozen, validated baseline. This is the file you paste into
**Supabase dashboard → SQL Editor** for a new project. It is idempotent, so
running it twice is safe.

It was validated on 2026-11-14 against PostgreSQL 16.16 with a Supabase shim
(see `test/`), covering 49 assertions: schema install, RLS isolation between two
admins, guest RPC behaviour, and the grant surface.

The same file was then applied to a live Supabase project (PostgreSQL 17.11),
re-applied to confirm idempotency, and passed all 49 assertions there. Test
weddings, guests and auth users were deleted afterwards, and the live grant
matrix was audited: `anon` can execute only `open_invitation`, `submit_rsvp`,
`submit_wish` and `list_wishes`, and holds no privilege on any table or view.

`templates/wedding_schema.sql` remains the source of truth during development.
`database/0001_baseline.sql` must stay identical below its
`BEGIN FROZEN BASELINE` marker — `node test-schema.js` fails if they drift.
Once the product is live, stop editing both: add `0002_*.sql` instead.

### Apply to Supabase

1. Dashboard → SQL Editor → New query.
2. Paste all of `0001_baseline.sql`, run it.
3. Create the couple's auth user, then register them as admin (the last section
   of the file shows the exact `insert into public.admins` statement).

Via `psql` (pooler connection string from Project Settings → Database):

```bash
psql "postgresql://postgres.<ref>:<password>@<host>:6543/postgres" \
  -v ON_ERROR_STOP=1 -f database/0001_baseline.sql
```

## `0002_saas.sql`

Phase 1 of the SaaS: drafts that live in Postgres instead of a browser tab.
Apply it **after** `0001_baseline.sql`; it is idempotent and never touches the
frozen baseline or rewrites existing rows.

What it adds:

- Columns on `public.weddings`: `design`, `status` (`draft|published|archived`),
  `content` (JSONB, ≤ 256 KB), `published_at`, `build_hash`, `active_until`,
  `updated_at`.
- Constraints: the slug shape `{names}-{BASE32}`, slug length 10–64, the status
  set, a slug-shaped design id, and a JSON-object content body.
- `weddings_slug_lower_idx`: uniqueness is case-insensitive, so nobody can claim
  `Amara-Dewa-ABCDEF` as a shadow of `amara-dewa-ABCDEF`. The original
  `weddings_slug_key` index from `0001` is left alone.
- `weddings_guard()`: the slug is immutable once `status <> 'draft'`, and
  `updated_at` advances on every update.
- Owner RLS on `weddings` for `select` / `update` / `delete`. There is
  deliberately **no insert policy**.
- `create_wedding(p_slug, p_design, p_content)`, a `security definer` function
  that inserts the row and registers the owner in `admins`. It is revoked from
  `anon` and granted to `authenticated`.

### Why creation is a function

`create_wedding()` is the only insert path, so the browser never needs insert
rights and cannot forge an owner. It also must **not** catch
`unique_violation`: PostgREST returns SQLSTATE `23505` to the app, which
regenerates the base32 suffix and retries (five attempts in
`apps/web/app/actions/weddings.js`). Malformed or reserved slugs raise `22023`;
an unauthenticated call raises `42501`.

The slug keeps its mixed case — lowercase name parts, uppercase base32 suffix —
so the trigger and the function never call `lower(slug)`. Only the unique index
is case-insensitive.

### Slug length is 10, not 12

`makeSlug()` can emit `a-b-ABCDEF` for two one-letter names. The bound starts at
10 because that is the shortest real output; a stricter minimum would reject
valid couples at sign-up. Both the database suite and
`apps/web/test/app.test.js` assert this.

### Apply to Supabase

Paste `0001_baseline.sql` first, then `0002_saas.sql`, into the SQL Editor. Via
`psql`, use the **session** pooler on port 5432 for migrations — the 6543
transaction pooler does not keep `SET ROLE` alive across statements:

```bash
psql "postgresql://postgres.<ref>:<password>@<host>:5432/postgres" \
  -v ON_ERROR_STOP=1 -f database/0001_baseline.sql \
  -v ON_ERROR_STOP=1 -f database/0002_saas.sql
```

If the project already has weddings rows, run this first. It must return zero
rows, or the new constraints will refuse to install:

```sql
select id, slug
  from public.weddings
 where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$'
    or char_length(slug) not between 10 and 64
    or slug ~ '^(admin|assets|api|sites)(-|$)';
```

Fix or delete any row it finds before applying the migration.

## Local proof harness

`test/run.ps1` starts `postgres:16` in Docker, installs a shim that reproduces
what the schema actually depends on in Supabase — the `anon` / `authenticated` /
`service_role` roles, the `auth` schema, `auth.uid()`, and Supabase's default
privileges (`grant all on functions to anon` is what exposed the bug below) —
then runs the suites against a fresh database.

```powershell
powershell -ExecutionPolicy Bypass -File database/test/run.ps1
powershell -ExecutionPolicy Bypass -File database/test/run.ps1 -ShowAll   # print every assertion
powershell -ExecutionPolicy Bypass -File database/test/run.ps1 -Port 55433
```

Exit code 0 means every assertion passed. The runner leaves the container
running on failure so you can inspect it; `docker rm -f wg-pg` cleans up.

### What it runs

| Step | File | Proves |
|---|---|---|
| 1 | `test/supabase-stub.sql` | roles, `auth` schema, `auth.uid()`, default privileges |
| 2 | `0001_baseline.sql` | the schema installs on real PostgreSQL |
| 3 | `0002_saas.sql` | Phase 1 columns, constraints, owner RLS, `create_wedding()` |
| 4 | `test/phase0-setup.sql` | `claim_slug`, duplicate rejection, settings trigger, fixtures |
| 5 | `test/phase0-anon.sql` | guest RPCs work; anon cannot read tables or the view |
| 6 | `test/phase0-auth.sql` | two admins cannot see or write each other's data |
| 7 | `test/phase0-security.sql` | anon holds no execute grant on admin functions |
| 8 | `test/phase1-saas.sql` | draft creation, tenant isolation, edit rules, post-publish slug lock |
| 9–11 | schema + `0002` + grants again | re-running either file does not weaken grants |

73 assertions in total; exit code 0 means every one passed.

### What it does **not** prove

Already proven on the live project: schema install and re-install, the role
grant matrix, and RLS isolation with two admins.

Still unproven before charging money:

- GoTrue issues the JWTs that `auth.uid()` reads. The harness and the cloud run
  both set the claim GUC by hand; no real JWT was exchanged.
- PostgREST exposes the RPCs at the URLs the client actually calls, with the
  project's anon key. Needs the anon key — it is safe to share, unlike the
  database password.
- Transaction pooler mode (port 6543). The suites use session mode (5432)
  because `SET ROLE` must survive across statements. The app will use 6543, so
  confirm one RPC round-trip through it during Phase 1.
- The Phase 1 gate itself: create an invitation in the app, close the browser,
  sign in on another device, and confirm the draft is intact and the slug is
  unchanged. That needs the project's anon key and a deployed (or local) app.
- Project-level settings: statement timeout and that the project is on a paid
  plan (free projects pause, and a paused project breaks every live RSVP).
- `security_invoker` views require PostgreSQL 15+ — confirmed on 17.11.

## Two real bugs this harness caught

Both were invisible to static review and would have shipped:

1. **Anon could create wedding rows.** Supabase grants `EXECUTE` on every new
   function in `public` *explicitly to `anon`*. `revoke ... from public` only
   removes the implicit PUBLIC grant, so `claim_slug` stayed callable with the
   public anon key — anyone could insert arbitrary weddings and squat slugs
   before a paying customer claimed them.
2. **Anon held full DML on `guest_summary`.** The view is created after the
   table revokes, so it inherited default privileges. It only appeared safe
   because `security_invoker` made the underlying `guests` check fail.

Both are now fixed and asserted in `test-schema.js` and the SQL suites.

## Adding a migration

`database/0002_<topic>.sql`, then append it to the `$steps` list in
`test/run.ps1` so the harness exercises the real install order. Never edit
`0001_baseline.sql` after launch.
