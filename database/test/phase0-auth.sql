\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ---------- isolation: user 1 is admin of wedding 1 only ----------
select public.test_assert(
  (select count(*) from public.weddings) = 1,
  'u1 sees exactly one wedding');

select public.test_assert(
  (select count(*) from public.guests) = 2,
  'u1 sees only the two guests of wedding 1');

select public.test_assert(
  (select count(*) from public.settings) = 1,
  'u1 sees only one settings row');

select public.test_assert(
  public.am_i_admin('amara-dewa-AAAAAA') is true,
  'am_i_admin true for own slug');

select public.test_assert(
  public.am_i_admin('rina-budi-BBBBBB') is false,
  'am_i_admin false for another slug');

select public.test_assert(
  public.is_admin((select id from public._test_ids where label = 'w1')) is true,
  'is_admin true for own wedding');

select public.test_assert(
  public.is_admin((select id from public._test_ids where label = 'w2')) is false,
  'is_admin false for another wedding');

-- ---------- dashboard summary is scoped ----------
select public.test_assert(
  (select count(*) from public.guest_summary) = 1,
  'guest_summary returns one row for u1');

select public.test_assert(
  (select total_guests from public.guest_summary) = 2,
  'guest_summary counts only wedding 1 guests');

select public.test_assert(
  (select people_coming from public.guest_summary) = 2,
  'guest_summary sums pax for wedding 1 only');

-- ---------- cross-wedding writes are refused ----------
do $$
declare err text;
begin
  begin
    insert into public.guests (wedding_id, code, name, phone)
    values ((select id from public._test_ids where label = 'w2'),
            'HACK000001', 'Hacker', '628000000000');
  exception when others then err := sqlerrm;
  end;
  if err is null then
    raise exception 'ASSERT FAILED: u1 inserted a guest into another wedding';
  end if;
  raise notice 'ok: cross-wedding insert blocked (%)', err;
end $$;

do $$
declare n int;
begin
  update public.guests set name = 'hacked'
   where wedding_id = (select id from public._test_ids where label = 'w2');
  get diagnostics n = row_count;
  perform public.test_assert(n = 0, 'cross-wedding update affects zero rows');
end $$;

do $$
declare n int;
begin
  delete from public.guests
   where wedding_id = (select id from public._test_ids where label = 'w2');
  get diagnostics n = row_count;
  perform public.test_assert(n = 0, 'cross-wedding delete affects zero rows');
end $$;

-- ---------- user 2 sees the mirror image ----------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select public.test_assert(
  (select count(*) from public.guests) = 1,
  'u2 sees only the single guest of wedding 2');

select public.test_assert(
  public.am_i_admin('rina-budi-BBBBBB') is true
  and public.am_i_admin('amara-dewa-AAAAAA') is false,
  'u2 admin scope is inverted');

select public.test_assert(
  (select count(*) from public.wishes) = 0,
  'u2 cannot see wedding 1 wishes');

reset role;
