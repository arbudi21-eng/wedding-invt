-- Minimal Supabase shim so templates/wedding_schema.sql can run on vanilla Postgres.
-- Mirrors the parts of a Supabase project the schema touches:
--   roles anon / authenticated / service_role, schema auth, auth.uid(), and the
--   default privileges Supabase grants on new objects in schema public.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Supabase reads the JWT subject from PostgREST's per-request GUC.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub'
  ), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role'
  ), '')
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's init scripts do exactly this for role postgres. This is why the
-- schema's `revoke ... from public` is not automatically enough.
alter default privileges for role postgres in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;

-- Assertion helper, usable from every role.
create or replace function public.test_assert(cond boolean, msg text)
returns void language plpgsql
as $$
begin
  if cond is not true then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
  raise notice 'ok: %', msg;
end $$;

grant execute on function public.test_assert(boolean, text) to anon, authenticated;
