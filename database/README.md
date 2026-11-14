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
| 3 | `test/phase0-setup.sql` | `claim_slug`, duplicate rejection, settings trigger, fixtures |
| 4 | `test/phase0-anon.sql` | guest RPCs work; anon cannot read tables or the view |
| 5 | `test/phase0-auth.sql` | two admins cannot see or write each other's data |
| 6 | `test/phase0-security.sql` | anon holds no execute grant on admin functions |
| 7–8 | schema + security again | re-running the file does not weaken grants |

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
