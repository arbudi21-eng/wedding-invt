\set ON_ERROR_STOP on

set role anon;
set request.jwt.claims = '{"role":"anon"}';

-- ---------- anon must not read tables directly ----------
do $$
declare n int;
begin
  begin
    select count(*) into n from public.guests;
    raise exception 'ASSERT FAILED: anon read guests (% rows)', n;
  exception when insufficient_privilege then
    raise notice 'ok: anon blocked from public.guests';
  end;
end $$;

do $$
declare n int;
begin
  begin
    select count(*) into n from public.settings;
    raise exception 'ASSERT FAILED: anon read settings (% rows)', n;
  exception when insufficient_privilege then
    raise notice 'ok: anon blocked from public.settings';
  end;
end $$;

do $$
declare n int;
begin
  begin
    select count(*) into n from public.guest_summary;
    raise exception 'ASSERT FAILED: anon read guest_summary (% rows)', n;
  exception when insufficient_privilege then
    raise notice 'ok: anon blocked from public.guest_summary';
  end;
end $$;

-- ---------- guest RPCs ----------
select public.test_assert(
  (public.open_invitation('amara-dewa-AAAAAA', 'CODEW1GUEST1') ->> 'name') = 'Budi Santoso',
  'open_invitation returns the guest by slug + code');

select public.test_assert(
  (public.open_invitation('amara-dewa-AAAAAA', 'CODEW1GUEST1') ->> 'couple_phone') is not null,
  'open_invitation includes couple_phone from settings');

-- code belongs to wedding 2, slug says wedding 1
select public.test_assert(
  public.open_invitation('amara-dewa-AAAAAA', 'CODEW2GUEST1') is null,
  'open_invitation rejects a code from another wedding');

select public.test_assert(
  public.open_invitation('no-such-wedding-XXXXXX', 'CODEW1GUEST1') is null,
  'open_invitation returns null for an unknown slug');

-- ---------- RSVP ----------
select public.test_assert(
  (public.submit_rsvp('amara-dewa-AAAAAA', 'CODEW1GUEST1', 'attending', 2) ->> 'pax')::int = 2,
  'submit_rsvp stores headcount');

do $$
declare err text;
begin
  begin
    perform public.submit_rsvp('amara-dewa-AAAAAA', 'CODEW1GUEST1', 'maybe', 1);
  exception when others then err := sqlerrm;
  end;
  perform public.test_assert(err = 'invalid rsvp', 'submit_rsvp rejects an invalid rsvp value');
end $$;

do $$
declare err text;
begin
  begin
    perform public.submit_rsvp('rina-budi-BBBBBB', 'CODEW1GUEST1', 'attending', 1);
  exception when others then err := sqlerrm;
  end;
  perform public.test_assert(err = 'unknown code', 'submit_rsvp rejects a code from another wedding');
end $$;

-- ---------- wishes ----------
select public.test_assert(
  (public.submit_wish('amara-dewa-AAAAAA', 'CODEW1GUEST1', '  Selamat menempuh hidup baru  ') ->> 'ok')::boolean,
  'submit_wish accepts a wish');

select public.test_assert(
  (select count(*) from public.list_wishes('amara-dewa-AAAAAA')) = 1,
  'list_wishes returns the wish for wedding 1');

select public.test_assert(
  (select message from public.list_wishes('amara-dewa-AAAAAA') limit 1) = 'Selamat menempuh hidup baru',
  'wish message is trimmed');

select public.test_assert(
  (select count(*) from public.list_wishes('rina-budi-BBBBBB')) = 0,
  'list_wishes does not leak wishes across weddings');

-- re-send replaces, does not duplicate
select public.submit_wish('amara-dewa-AAAAAA', 'CODEW1GUEST1', 'Updated wish');
select public.test_assert(
  (select count(*) from public.list_wishes('amara-dewa-AAAAAA')) = 1
  and (select message from public.list_wishes('amara-dewa-AAAAAA') limit 1) = 'Updated wish',
  'submit_wish replaces the previous wish');

do $$
declare err text;
begin
  begin
    perform public.submit_wish('amara-dewa-AAAAAA', 'CODEW1GUEST1', '');
  exception when others then err := sqlerrm;
  end;
  perform public.test_assert(err is not null, 'submit_wish rejects an empty message');
end $$;

reset role;
