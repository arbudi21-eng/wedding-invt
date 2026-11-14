\set ON_ERROR_STOP on

-- ---------- users ----------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.com')
on conflict (id) do nothing;

-- ---------- two weddings, claimed by two different users ----------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.claim_slug('amara-dewa-AAAAAA') as w1_created;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select public.claim_slug('rina-budi-BBBBBB') as w2_created;

-- duplicate slug must be refused
do $$
declare err text;
begin
  begin
    perform public.claim_slug('amara-dewa-AAAAAA');
  exception when others then err := sqlerrm;
  end;
  if err is null then
    raise exception 'ASSERT FAILED: duplicate slug was accepted';
  elsif err like 'slug already taken%' then
    raise notice 'ok: duplicate slug rejected';
  else
    raise exception 'ASSERT FAILED: duplicate slug raised unexpected error: %', err;
  end if;
end $$;
reset role;

-- ---------- schema invariants (as owner, bypassing RLS) ----------
select public.test_assert(
  (select owner from public.weddings where slug = 'amara-dewa-AAAAAA')
    = '11111111-1111-1111-1111-111111111111'::uuid,
  'claim_slug stores auth.uid() as owner');

select public.test_assert(
  (select count(*) from public.settings s
     join public.weddings w on w.id = s.wedding_id) = 2,
  'settings row auto-seeded for every wedding');

-- ---------- link users to weddings ----------
create table if not exists public._test_ids (label text primary key, id uuid);
grant select on public._test_ids to authenticated;

insert into public._test_ids (label, id) values
  ('w1', (select id from public.weddings where slug = 'amara-dewa-AAAAAA')),
  ('w2', (select id from public.weddings where slug = 'rina-budi-BBBBBB'))
on conflict (label) do update set id = excluded.id;

insert into public.admins (user_id, wedding_id) values
  ('11111111-1111-1111-1111-111111111111', (select id from public._test_ids where label = 'w1')),
  ('22222222-2222-2222-2222-222222222222', (select id from public._test_ids where label = 'w2'))
on conflict do nothing;

-- ---------- guests ----------
insert into public.guests (wedding_id, code, name, phone, lang) values
  ((select id from public._test_ids where label = 'w1'), 'CODEW1GUEST1', 'Budi Santoso', '6281234500001', 'id'),
  ((select id from public._test_ids where label = 'w1'), 'CODEW1GUEST2', 'Jane Lee',     '61400000002',   'en'),
  ((select id from public._test_ids where label = 'w2'), 'CODEW2GUEST1', 'Siti Rahayu',  '6281234500003', 'id')
on conflict (code) do nothing;

select public.test_assert(
  (select count(*) from public.guests) = 3,
  'three guests inserted');

select public.test_assert(
  (select count(*) from public.guest_summary) = 2,
  'guest_summary groups by wedding (2 rows)');
