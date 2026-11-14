-- =====================================================================
-- 0002_saas.sql — Phase 1: drafts, ownership, lifecycle
--
-- Apply after 0001_baseline.sql. Idempotent: re-running drops and recreates
-- constraints, policies, functions and triggers. It never touches the frozen
-- baseline and never rewrites existing rows.
--
-- What this adds
--   * the draft columns the app writes (design, status, content, timestamps)
--   * owner RLS so a couple can see/edit/delete only their own invitations
--   * create_wedding(), the single authenticated path that creates a draft
--     and registers the owner in `admins`
--   * guards that keep the slug well-formed and immutable after publish
--
-- Not in this migration (deliberately deferred): orders, plans, assets, and
-- status/active_until gating inside the guest RPCs. Those land in later phases
-- so the Phase 0 suites keep passing unchanged.
-- =====================================================================

-- ---------- 1. Columns -------------------------------------------------

-- `owner` already exists from 0001. Do NOT add a second owner_id column.
alter table public.weddings
  add column if not exists design       text not null default '01-editorial-mocha',
  add column if not exists status       text not null default 'draft',
  add column if not exists content      jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists build_hash   text,
  add column if not exists active_until timestamptz,
  add column if not exists updated_at   timestamptz not null default now();

-- slug is still `unique`, but that is case-sensitive. A lower(slug) index makes
-- the guard case-insensitive too, so nobody can claim Amara-Dewa-ABCDEF as a
-- shadow of amara-dewa-ABCDEF. Do not reuse the name `weddings_slug_key`: that
-- belongs to the implicit index behind `slug text unique` from 0001.
create unique index if not exists weddings_slug_lower_idx
  on public.weddings (lower(slug));

-- ---------- 2. Invariants ----------------------------------------------

-- Slugs are {bride}-{groom}-{BASE32} in lowercase names and an uppercase
-- 6-char base32 suffix (A-Z2-7). `makeSlug()` in lib/core.js produces exactly
-- this; the constraint stops anything else reaching the public URL space.
alter table public.weddings drop constraint if exists weddings_slug_format_check;
alter table public.weddings add constraint weddings_slug_format_check
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$');

-- The shortest slug makeSlug() can produce is a-b-XXXXXX (10): two one-letter
-- names, two hyphens, a six-character suffix. Anything shorter is not ours.
alter table public.weddings drop constraint if exists weddings_slug_length_check;
alter table public.weddings add constraint weddings_slug_length_check
  check (char_length(slug) between 10 and 64);

alter table public.weddings drop constraint if exists weddings_status_check;
alter table public.weddings add constraint weddings_status_check
  check (status in ('draft', 'published', 'archived'));

alter table public.weddings drop constraint if exists weddings_design_check;
alter table public.weddings add constraint weddings_design_check
  check (design ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(design) <= 60);

-- Draft content is a JSON object, not an array or a bare scalar. Photos live in
-- object storage (Phase 2), so 256 KB of text is already generous.
alter table public.weddings drop constraint if exists weddings_content_object_check;
alter table public.weddings add constraint weddings_content_object_check
  check (jsonb_typeof(content) = 'object');

alter table public.weddings drop constraint if exists weddings_content_size_check;
alter table public.weddings add constraint weddings_content_size_check
  check (octet_length(content::text) <= 262144);

-- ---------- 3. Slug immutability + updated_at --------------------------

create or replace function public.weddings_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'slug is immutable after publish';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists weddings_guard on public.weddings;
create trigger weddings_guard before update on public.weddings
for each row execute function public.weddings_guard();

-- ---------- 4. Owner row level security --------------------------------

-- Ownership is the primary truth. `admins` stays the permission table the
-- guest console uses; create_wedding() keeps the two in sync.
--
-- There is deliberately no INSERT policy: a draft may only be created through
-- create_wedding(), so the app never needs arbitrary insert rights and a
-- forged owner cannot be written from the browser.
drop policy if exists weddings_owner_read on public.weddings;
create policy weddings_owner_read on public.weddings for select to authenticated
  using (owner = auth.uid());

drop policy if exists weddings_owner_update on public.weddings;
create policy weddings_owner_update on public.weddings for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists weddings_owner_delete on public.weddings;
create policy weddings_owner_delete on public.weddings for delete to authenticated
  using (owner = auth.uid());

-- ---------- 5. create_wedding(): the only way to start a draft ---------

-- Server-side slug generation, retried by the app on 23505. This function must
-- NOT catch unique_violation: the client needs the real SQLSTATE so it can roll
-- a fresh suffix and try again.
create or replace function public.create_wedding(
  p_slug    text,
  p_design  text default '01-editorial-mocha',
  p_content jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  -- Do not lower() the whole slug: the base32 suffix is uppercase by design.
  v_slug  text := btrim(coalesce(p_slug, ''));
  v_design text := coalesce(nullif(btrim(coalesce(p_design, '')), ''), '01-editorial-mocha');
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$' then
    raise exception 'invalid slug: %', v_slug using errcode = '22023';
  end if;

  if v_slug ~ '^(admin|assets|api|sites)(-|$)' then
    raise exception 'reserved slug: %', v_slug using errcode = '22023';
  end if;

  insert into public.weddings (slug, owner, design, content)
  values (v_slug, v_uid, v_design, coalesce(p_content, '{}'::jsonb))
  returning id into v_id;

  insert into public.admins (user_id, wedding_id)
  values (v_uid, v_id)
  on conflict do nothing;

  return v_id;
end $$;

-- ---------- 6. Grants --------------------------------------------------
-- Supabase grants EXECUTE on new functions explicitly to anon and
-- authenticated. Revoking PUBLIC alone is not enough; anon must be named.
revoke all on function public.create_wedding(text, text, jsonb) from public;
revoke all on function public.create_wedding(text, text, jsonb) from anon;
grant execute on function public.create_wedding(text, text, jsonb) to authenticated;

-- Trigger functions can never be invoked directly, but strip the default grant
-- so the live privilege matrix stays honest.
revoke all on function public.weddings_guard() from public, anon, authenticated;

-- ---------- 7. Backfill ------------------------------------------------
-- 0001 has no updated_at for pre-existing rows; the column default covers new
-- rows, this keeps the dashboard sort stable for anything created earlier.
update public.weddings
   set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;
