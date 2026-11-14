\set ON_ERROR_STOP on

-- ============================================================
-- Phase 1: drafts, ownership, slug guards.
-- Runs after the Phase 0 suites, so weddings from phase0-setup
-- already exist and u1/u2 are their admins.
-- ============================================================

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'u3@example.com')
on conflict (id) do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- ---------- create_wedding(): the only insert path ----------
select public.create_wedding('carla-dimas-ABCDEF') as w3_id \gset

select public.test_assert(
  (select owner = '33333333-3333-3333-3333-333333333333'::uuid
          and status = 'draft'
          and design = '01-editorial-mocha'
          and content = '{}'::jsonb
          and updated_at is not null
     from public.weddings where slug = 'carla-dimas-ABCDEF'),
  'create_wedding stores owner, draft status and defaults');

select public.test_assert(
  exists (
    select 1
    from public.admins a
    join public.weddings w on w.id = a.wedding_id
    where w.slug = 'carla-dimas-ABCDEF'
      and a.user_id = '33333333-3333-3333-3333-333333333333'
  ),
  'create_wedding registers the owner as an admin');

select public.test_assert(
  (select count(*) from public.weddings) = 1,
  'owner sees exactly their own wedding');

-- Reusing a slug must surface the real SQLSTATE, not a friendly message: the
-- app catches 23505 and regenerates the base32 suffix.
do $$
declare st text;
begin
  begin
    perform public.create_wedding('carla-dimas-ABCDEF');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '23505',
    'duplicate slug raises 23505 for the app to retry');
end $$;

do $$
declare st text;
begin
  st := null;
  begin
    perform public.create_wedding('Carla-Dimas-ABCDEF');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '22023', 'uppercase name parts are rejected');

  st := null;
  begin
    perform public.create_wedding('admin-foo-ABCDEF');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '22023', 'reserved slug prefixes are rejected');

  st := null;
  begin
    perform public.create_wedding('carla-dimas-ABCDE');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '22023', 'a slug without a 6-char suffix is rejected');

  -- The shortest slug makeSlug() can produce: two one-letter names. The
  -- length constraint must accept it or short-named couples cannot sign up.
  perform public.create_wedding('a-b-ABCDEF');
  perform public.test_assert(
    exists (select 1 from public.weddings where slug = 'a-b-ABCDEF'),
    'the shortest generated slug (a-b-XXXXXX) is accepted');
  delete from public.weddings where slug = 'a-b-ABCDEF';
end $$;

-- ---------- tenant isolation ----------
select public.test_assert(
  (select count(*) from public.weddings where slug = 'amara-dewa-AAAAAA') = 0,
  'a second owner cannot see the first owner''s wedding');

do $$
declare n int;
begin
  update public.weddings set content = '{"hacked":true}'::jsonb
   where slug = 'amara-dewa-AAAAAA';
  get diagnostics n = row_count;
  perform public.test_assert(n = 0, 'cross-tenant update affects zero rows');

  delete from public.weddings where slug = 'amara-dewa-AAAAAA';
  get diagnostics n = row_count;
  perform public.test_assert(n = 0, 'cross-tenant delete affects zero rows');
end $$;

-- ---------- insert / ownership transfer are not client-writable ----------
do $$
declare st text;
begin
  begin
    insert into public.weddings (slug, owner)
    values ('forged-owned-ABCDEF', '33333333-3333-3333-3333-333333333333');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '42501',
    'authenticated cannot insert a wedding directly');
end $$;

do $$
declare st text;
begin
  begin
    update public.weddings
       set owner = '11111111-1111-1111-1111-111111111111'
     where slug = 'carla-dimas-ABCDEF';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '42501', 'an owner cannot transfer ownership');
end $$;

-- ---------- editing a draft ----------
do $$
declare before_ts timestamptz;
declare after_ts  timestamptz;
begin
  select updated_at into before_ts
    from public.weddings where slug = 'carla-dimas-ABCDEF';

  update public.weddings
     set content = '{"names":["Carla","Dimas"]}'::jsonb,
         design  = '07-terracotta-boho'
   where slug = 'carla-dimas-ABCDEF';

  select updated_at into after_ts
    from public.weddings where slug = 'carla-dimas-ABCDEF';

  perform public.test_assert(after_ts > before_ts,
    'updated_at advances when a draft is saved');
  perform public.test_assert(
    (select design from public.weddings where slug = 'carla-dimas-ABCDEF') = '07-terracotta-boho',
    'a draft can change design');
end $$;

update public.weddings set slug = 'carla-dewi-ABCDEF'
 where slug = 'carla-dimas-ABCDEF';
select public.test_assert(
  (select count(*) from public.weddings where slug = 'carla-dewi-ABCDEF') = 1,
  'the slug can change while the wedding is a draft');
update public.weddings set slug = 'carla-dimas-ABCDEF'
 where slug = 'carla-dewi-ABCDEF';

-- ---------- content and status invariants ----------
do $$
declare st text;
begin
  st := null;
  begin
    update public.weddings set content = '[]'::jsonb
     where slug = 'carla-dimas-ABCDEF';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '23514', 'content must be a JSON object');

  st := null;
  begin
    update public.weddings
       set content = jsonb_build_object('story', repeat('x', 300000))
     where slug = 'carla-dimas-ABCDEF';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '23514', 'content over 256 KB is rejected');

  st := null;
  begin
    update public.weddings set status = 'live'
     where slug = 'carla-dimas-ABCDEF';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '23514', 'an unknown status is rejected');
end $$;

-- ---------- slug immutability after publish ----------
reset role;
update public.weddings
   set status = 'published', published_at = now()
 where slug = 'carla-dimas-ABCDEF';

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare msg text;
begin
  begin
    update public.weddings set slug = 'carla-dewi-ABCDEF'
     where slug = 'carla-dimas-ABCDEF';
  exception when others then
    msg := sqlerrm;
  end;
  perform public.test_assert(msg = 'slug is immutable after publish',
    'the slug is immutable once published');
end $$;

-- ---------- anon cannot reach the create path ----------
reset role;
set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare st text;
begin
  begin
    perform public.create_wedding('anon-evil-ABCDEF');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
  end;
  perform public.test_assert(st = '42501', 'anon cannot execute create_wedding');
end $$;

reset role;

-- ---------- delete cascades ----------
insert into public._test_ids (label, id) values ('w3', :'w3_id'::uuid)
on conflict (label) do update set id = excluded.id;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

delete from public.weddings where slug = 'carla-dimas-ABCDEF';

select public.test_assert(
  (select count(*) from public.weddings where slug = 'carla-dimas-ABCDEF') = 0,
  'an owner can delete their own wedding');

reset role;

select public.test_assert(
  (select count(*) from public.admins
    where wedding_id = (select id from public._test_ids where label = 'w3')) = 0,
  'deleting a wedding removes its admins rows');

select public.test_assert(
  (select count(*) from public.settings
    where wedding_id = (select id from public._test_ids where label = 'w3')) = 0,
  'deleting a wedding removes its settings row');
