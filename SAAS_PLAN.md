# Turning Wedding Studio into a real SaaS

Status: plan only. No code written yet.
Date: 2026-11-14

---

## 1. Verdict

Feasible. The hard part is already done.

`lib/core.js` is not browser code. `test-build.js` calls `build()` in plain
Node against all 33 designs and it passes. That means:

> **The generator is a library. A SaaS is an HTTP wrapper, a database, a
> storage bucket and a payment webhook around it.**

What does *not* exist today, and must be built:

| Missing | Why it blocks selling |
|---|---|
| Server that runs `build()` | Couples can't be trusted with a ZIP + SQL editor |
| Auth + accounts | No idea who owns which invitation |
| Payment | No revenue path |
| Photo upload + storage | Assets live inside a local ZIP |
| Publish pipeline | Every sale needs you to deploy by hand |
| Entitlements | Nothing stops a free user publishing everything |
| Draft/publish state | No editing after going live |

---

## 2. Current state audit

### Reusable as-is (do not rewrite)

| Asset | Notes |
|---|---|
| `lib/core.js` `build()` | Pure string transform, Node-ready, 30 tests |
| `lib/core.js` `configJs()` / `headers()` | Already parameterised by slug |
| `designs/*.html` (33 files, 967 KB total) | The product's inventory |
| `templates/wedding_schema.sql` | Guest RPCs and per-wedding RLS are sound |
| `templates/admin.html` | Guest CRUD, bulk import, CSV, WhatsApp send — free admin console |
| `templates/wiring.js` | RSVP/wish client wiring |
| `test-build.js`, `test-schema.js`, `test-slug.js` | Your regression net for every refactor below |

`build(designHtml, ev, assets, wiringJs, slug)` returns `{html, miss}` where
`assets` is **just an object of path strings**
(`{cover, man, woman, story[], album[], video:{src}}`). It never sees a File.
So server-side generation only needs paths — the storage decision is free.

`ev.host` is already consumed by `metaTags()` for canonical + `og:url`. A SaaS
gets correct social previews for nothing.

### Must fix before launch

1. **The SQL has only been verified at the Postgres layer on a hosted project.**
   It installs, re-installs, and enforces its security model on a real Supabase
   project (see `database/README.md`). What remains unproven is the HTTP path:
   PostgREST and GoTrue with a real anon key and real JWTs.
2. `weddings` has no owner column. Ownership is currently expressed only
   through `admins`.
3. Slug generation dedupes against an in-memory `Set` — meaningless. Uniqueness
   must come from a DB unique constraint.
4. Guest codes are fine (10 chars, 32-symbol alphabet, `crypto.getRandomValues`,
   256/32 divides evenly so no modulo bias). Leave as-is.

---

## 3. Target architecture

```
                    ┌─────────────────────────────────────────┐
  couple  ─────────►│  app.yourdomain.com  (Next.js / Vercel)  │
                    │  marketing · auth · builder · billing    │
                    │  /manage/{slug}  → admin console         │
                    └────────────┬───────────────┬─────────────┘
                                 │               │
                    ┌────────────▼───┐   ┌───────▼──────────┐
                    │   Supabase     │   │  Cloudflare R2   │
                    │  auth + Postgres│  │  static output   │
                    │  RLS per wedding│  │  {slug}/index.html│
                    └────────────────┘   └───────┬──────────┘
                                                 │
  guest  ────────────────────────────────────────┴──► undangan.yourdomain.com/{slug}/?c=CODE
                                                       (Worker → R2, cacheable, no server)
```

### Why this shape

- **Static output, not SSR.** An invitation is read hundreds of times in one
  afternoon and never changes. Static on R2 costs nothing and never falls over
  during the wedding.
- **Content in Postgres, compiled on publish.** Editing writes JSONB; publishing
  renders files. Drafts never reach the public bucket.
- **Two hostnames on purpose.** Public invites on a Worker+R2 origin; the app and
  admin console on the app origin, where the Supabase session already lives.
  Never serve `admin/` from the public bucket.
- **One Supabase project for all weddings**, isolated by `wedding_id` + RLS. This
  is the model you already chose and the schema already assumes.

### Routing rules

| Host / path | Serves |
|---|---|
| `app.yourdomain.com/` | marketing, pricing, login |
| `app.yourdomain.com/build/{id}` | the builder (auth required) |
| `app.yourdomain.com/manage/{slug}` | admin console, `config.js` inlined |
| `app.yourdomain.com/api/*` | publish, upload signer, webhooks |
| `undangan.yourdomain.com/{slug}/` | published invitation |
| `undangan.yourdomain.com/{slug}/assets/*` | photos, video, music |
| `undangan.yourdomain.com/{slug}/config.js` | public URL + anon key + slug |

Draft preview: `app.yourdomain.com/preview/{token}` — `noindex`, noindex always,
so a couple can check the design before paying.

---

## 4. Data model

Keep the existing schema. Add tables; do not rename `weddings` (the guest RPCs
depend on it).

```sql
-- ownership + lifecycle on the existing table
alter table public.weddings
  add column if not exists owner_id     uuid references auth.users(id) on delete set null,
  add column if not exists design       text not null default '01-editorial-mocha',
  add column if not exists status       text not null default 'draft'
                                        check (status in ('draft','published','archived')),
  add column if not exists content      jsonb not null default '{}'::jsonb, -- draft source of truth
  add column if not exists published_at timestamptz,
  add column if not exists build_hash   text,          -- last published render
  add column if not exists active_until timestamptz;   -- wedding_date + grace

create unique index if not exists weddings_slug_key on public.weddings (lower(slug));

create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  wedding_id   uuid references public.weddings(id) on delete set null,
  plan_id      text not null,
  amount       integer not null,             -- minor units, IDR has none
  currency     text not null default 'IDR',
  provider     text not null check (provider in ('midtrans','stripe','manual')),
  provider_ref text,
  status       text not null default 'pending'
               check (status in ('pending','paid','failed','refunded')),
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.orders (user_id, status);

create table public.plans (
  id              text primary key,          -- 'basic','premium'
  price           integer not null,
  currency        text not null default 'IDR',
  max_story       integer not null default 8,
  max_gallery     integer not null default 40,
  allow_music     boolean not null default true,
  allow_video     boolean not null default true,
  guest_limit     integer,                   -- null = unlimited
  active_days     integer not null default 60
);

create table public.assets (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings(id) on delete cascade,
  kind        text not null check (kind in ('cover','man','woman','story','album','video','music')),
  position    integer not null default 0,
  r2_key      text not null,
  width       integer, height integer, bytes integer,
  created_at  timestamptz not null default now()
);
```

### RLS additions

```sql
-- owner sees and edits only their own drafts
create policy weddings_owner on public.weddings
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy orders_owner on public.orders
  for select to authenticated using (user_id = auth.uid());

-- anonymous guests must not see drafts even with a valid slug
-- (add the status check inside open_invitation / list_wishes)
```

Two schema changes the guest RPCs need:

1. `open_invitation` / `list_wishes` reject when `status <> 'published'`.
2. `submit_wish` and `submit_rsvp` reject when `now() > active_until`.

Everything else — slug-scoped RPCs, `is_admin(p_wedding)`, `am_i_admin(p_slug)`,
per-wedding `settings` with the seed trigger — works unchanged.

### Slug generation, fixed

Generate server-side only:

```
slug = makeSlug([bride, groom])          // unchanged, still {a}-{b}-{BASE32}
loop:
  try insert -> 23505 on unique(slug) -> regenerate suffix, max 5 attempts
```

Never trust a client-supplied slug. Slug is immutable after publish; one rename
is allowed while `status = 'draft'`. Reserved words `admin|api|assets|sites`
already handled in `makeSlug()`.

---

## 5. Build order

Each phase ships something testable. Do not start a phase before the previous
one's acceptance test passes.

### Phase 0 — Prove the ground (1–2 days) — DONE locally, cloud run pending

Executed 2026-11-14 against PostgreSQL 16.16 under a Supabase shim (roles,
`auth` schema, `auth.uid()`, default privileges). 49 assertions, all green:
`database/test/run.ps1`. Findings and the frozen baseline live in `database/`.

- `wedding_schema.sql` installs cleanly and is idempotent on re-run.
- Two real security bugs found and fixed (both would have shipped):
  anon could call `claim_slug` because Supabase grants `EXECUTE` to `anon`
  explicitly, and anon held full DML on the `guest_summary` view.
- `test-schema.js` now fails if either regression returns, and fails if the
  frozen baseline drifts from the source schema.
- RLS verified with two admins: no cross-wedding read, write, or delete.
- Guest RPCs verified as anon: code must match the slug's wedding, wishes are
  trimmed and replaced not duplicated, `list_wishes` does not leak.

**Gate (met locally):** `select * from public.guest_summary;` returns one
wedding's numbers only, with two weddings in the DB.

**Cloud run (2026-11-14):** `database/0001_baseline.sql` applied to a real
Supabase project (PostgreSQL 17.11) with exit 0 and re-applied to prove
idempotency, and all 49 assertions passed there too. Test weddings, guests and
users were then deleted — the project is empty again. The live grant matrix was
audited afterwards: only `open_invitation`, `submit_rsvp`, `submit_wish` and
`list_wishes` are executable by `anon`; `claim_slug`, `is_admin` and
`am_i_admin` are authenticated-only; `anon` has no privilege on any table or on
`guest_summary`.

**Still open:** PostgREST-over-HTTP verification with a real JWT (needs the
project's anon key), plus the pooler and project-setting checks listed in
`database/README.md`.

### Phase 1 — Repository + app shell (2–3 days)

- Keep the generator at `lib/core.js`. Do not fork it.
- New `apps/web` (Next.js App Router) importing `../lib/core.js`.
- Supabase Auth: email+password + Google. `app.yourdomain.com/dashboard`.
- Create-draft flow: names → save → returns slug + `/build/{id}`.
- Draft persistence in `weddings.content` (JSONB), one row per invitation.

**Gate:** create an invitation, close the browser, log back in on another device,
content is intact and the slug is unchanged.

**Built (2026-11-14):** `database/0002_saas.sql` adds the draft columns,
constraints, owner RLS, `create_wedding()` and the slug guard;
`database/test/phase1-saas.sql` proves them (73 assertions green in the harness,
66 static checks in `test-schema.js`). `apps/web` builds and runs on Next 16.4.6:
auth (`/login`, `/signup`, Google, sign-out), `/dashboard` create/list/delete,
`/build/{id}` edit-and-save, `proxy.js` session refresh + route guards, and 132
app assertions (`npm test`). Drafts may be incomplete: names are required, a
date is optional but must be real.

**Gate status:** not yet met on the live project. It needs the project's anon key
(public by design) in `apps/web/.env.local`, `0002` applied to Supabase, then the
create → new device → sign in → intact-draft check.

### Phase 2 — Generation + storage + publish (4–6 days)

- Port the studio form (`index.html` steps 1–7) to React. Keep every field name
  and validation rule; `build()` must not change.
- Photo upload: browser resizes to WebP ≤1600 px/≤300 KB via canvas, then
  presigned PUT straight to R2 (`{slug}/assets/…`). No server-side image work.
- `POST /api/invitations/{id}/publish`:
  1. verify session owns the wedding,
  2. verify entitlement (paid order or explicit trial),
  3. load `designs/{design}.html`, call `build(...)` with **relative** asset paths,
  4. render `config.js` with your single anon key + the slug,
  5. PUT `index.html`, `config.js`, `assets/*` to R2,
  6. set `status='published'`, `published_at`, `build_hash`,
  7. purge cache for those keys,
  8. return the guest URL.
- Cloudflare Worker: `undangan.domain/{slug}/*` → R2. Cache-Control:
  `index.html` 5 min, `assets/*` 1 year immutable (filenames include a hash or
  position).
- `admin/` is **not** published to R2. Serve `templates/admin.html` from the app
  origin at `/manage/{slug}` with `APP_CONFIG` inlined.

**Gate:** publish from the UI; the guest URL loads with working RSVP and wish
wall; unpublish returns 404; a second wedding cannot read the first's wishes.

### Phase 3 — Money (3–4 days)

- Product decision: **build free, pay to publish.** The couple must see their own
  invitation before paying; it converts far better and costs you one draft row.
- Midtrans Snap for Indonesia (QRIS, GoPay, VA, cards) + Stripe for international.
- `POST /api/checkout` creates `orders` row → provider session.
- Webhook → verify signature → `status='paid'` → unlock publish.
- Idempotency: unique on `(provider, provider_ref)`; ignore duplicate events.
- Refund → `status='refunded'` → unpublish, keep data 30 days.

**Gate:** sandbox purchase unlocks publish; duplicate webhook is a no-op; refund
revokes it; a manually-edited `orders` row cannot be forged by the browser.

### Phase 4 — Admin console + guests (3–4 days)

- Mount existing `templates/admin.html` at `/manage/{slug}`.
- Guest adding/import/CSV/WhatsApp already works — verify against real RLS.
- Auto-insert `admins(user_id, wedding_id)` for owner + invited partner email.
- Guard: publish requires at least 1 guest? No — but warn.
- Share a read-only "view as guest" link with `?c=` of a test guest.

**Gate:** a second couple's login cannot see the first couple's guests, wishes or
settings, even by editing the URL.

### Phase 5 — Hardening (3–5 days)

- EXIF strip on upload (GPS in wedding photos is a genuine privacy leak).
- Rate limit `/rest/v1/rpc/*` and the upload signer at the Worker edge.
- Verify every RPC rejects drafts and expired invitations — automated test.
- Backups: Supabase daily + R2 versioning; document a restore drill.
- Sentry + uptime check on one canary slug.
- Cron: flip `active_until` passed → `archived`, serve an archive page, email owner.
- `_headers` equivalent for the Worker: `X-Robots-Tag: noindex` on `/admin/*`,
  `Cache-Control: no-store` on `config.js` (already encoded in `headers()`).

**Gate:** a load test of 200 concurrent `open_invitation` calls succeeds; a
deliberately broken publish leaves the previous version live.

### Phase 6 — Only after revenue

Wildcard custom domains (`nama-mereka.yourdomain.com`), more designs, analytics,
team collaboration, A/B pricing. None of this is v1.

---

## 6. Cost model (verify current pricing before committing)

| Item | Free tier | Realistic paid |
|---|---|---|
| Vercel (app) | enough to launch | ~$20/mo when traffic grows |
| Cloudflare R2 + Worker | 10 GB storage, free egress | ~pennies per 100 weddings |
| Supabase | free **pauses idle projects** — fatal for live invitations | ~$25/mo Pro |
| Domain | — | ~$10–15/yr |
| Payments | — | ~2–3% per transaction |

Floor to run this properly: **~$45–50/month**. Do not launch a paying customer on
a free Supabase project that can pause; a paused project means every RSVP on
every live invitation fails silently.

Break-even at ~Rp 150k per invitation is low single-digit sales per month.

---

## 7. Risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| 1 | Schema never ran; first deploy breaks | Phase 0, on a scratch project |
| 2 | A wedding-day outage (RSVP down at the reception) | static invites, paid Supabase, uptime alert, canary |
| 3 | Publish half-succeeds, invite broken | write to a versioned prefix, flip a pointer last, keep last good |
| 4 | Cross-wedding data leak | RLS tests with two real accounts in CI, not by eye |
| 5 | Refactors silently break designs | `test-build.js` must stay green over all 33 designs |
| 6 | Couple uploads 50 × 8 MB photos | client-side resize + hard caps, server re-checks count from `plans` |
| 7 | Guest list is personal data | PDP Law (UU 27/2022): privacy page, consent on RSVP, deletion on request, sub-processor list |
| 8 | Selling to Indonesians as a platform | PSE registration (Kominfo) may apply — confirm with counsel before launch, not after |

---

## 8. Non-goals for v1

- Multiple invitations per order
- Couple-supplied Supabase projects (that is the current design, and it is the
  support nightmare you are removing)
- Custom domains
- Video transcoding
- Multi-language UI beyond EN/ID
- A visual drag-and-drop editor

---

## 9. Launch gate (foolproof checklist)

Charge money only when all of these are true:

- [x] `wedding_schema.sql` runs clean on a fresh project, verified twice
      (local harness + live Supabase project, both re-run)
- [ ] Ten invitations published and unpublished end-to-end by you alone
- [ ] One real wedding with 100+ guests, zero manual SQL during the event
- [ ] Two accounts cannot see each other's data (tested, not eyeballed)
- [ ] Refund → unpublish → data retained → deletion works
- [ ] `node test-build.js`, `test-schema.js`, `test-slug.js` all green
- [ ] Restore-from-backup drilled once
- [ ] Privacy page + RSVP consent line live
- [ ] Payment provider live mode tested with a real card/QRIS

---

## 10. Sequence summary

```
Phase 0  1–2d   run the SQL for real          ← DONE (local + live project)
Phase 1  2–3d   app shell + auth + drafts
Phase 2  4–6d   builder + R2 + publish        ← the actual product
Phase 3  3–4d   payments + entitlements
Phase 4  3–4d   admin console + guests
Phase 5  3–5d   hardening + monitoring
────────────────────────────────────────────
         ~3–5 weeks full-time, 6–8 part-time
```

Phases 1–2 are the ones that can be parallelised with a second person; Phases 3
and 5 cannot.
