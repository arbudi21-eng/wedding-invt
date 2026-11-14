\set ON_ERROR_STOP on

-- ============================================================
-- The grant surface. Supabase's default privileges hand EXECUTE
-- to anon on every new function in schema public, so a
-- `revoke ... from public` does NOT remove anon's explicit grant.
-- ============================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare err text;
begin
  begin
    perform public.claim_slug('evil-slug-ZZZZZZ');
  exception when insufficient_privilege then
    err := 'blocked';
  when others then
    err := sqlerrm;
  end;
  if err = 'blocked' then
    raise notice 'ok: anon cannot execute claim_slug';
  else
    raise exception 'SECURITY: anon CAN execute claim_slug (%). Add: revoke all on function public.claim_slug(text, uuid) from anon;', coalesce(err, 'no error');
  end if;
end $$;

do $$
declare err text;
begin
  begin
    perform public.am_i_admin('amara-dewa-AAAAAA');
  exception when insufficient_privilege then
    err := 'blocked';
  when others then
    err := sqlerrm;
  end;
  if err = 'blocked' then
    raise notice 'ok: anon cannot execute am_i_admin';
  else
    raise notice 'note: anon can execute am_i_admin (returns false, no data leak)';
  end if;
end $$;

do $$
declare err text;
begin
  begin
    perform public.is_admin((select id from public._test_ids where label = 'w1'));
  exception when insufficient_privilege then
    err := 'blocked';
  when others then
    err := sqlerrm;
  end;
  if err = 'blocked' then
    raise notice 'ok: anon cannot execute is_admin';
  else
    raise exception 'SECURITY: anon CAN execute is_admin (%)', coalesce(err, 'no error');
  end if;
end $$;

-- The other attack path: anon writing to the table directly.
do $$
declare err text;
begin
  begin
    insert into public.weddings (slug) values ('direct-insert-DDDDDD');
  exception when insufficient_privilege then
    err := 'blocked';
  when others then
    err := sqlerrm;
  end;
  if err = 'blocked' then
    raise notice 'ok: anon cannot insert into public.weddings directly';
  else
    raise exception 'SECURITY: anon CAN insert into public.weddings (%)', coalesce(err, 'no error');
  end if;
end $$;

-- And the summary view: it is a relation, so it inherits default privileges.
do $$
declare n int;
begin
  begin
    select count(*) into n from public.guest_summary;
  exception when insufficient_privilege then
    n := null;
  end;
  if n is null then
    raise notice 'ok: anon has no grant on public.guest_summary';
  else
    raise exception 'SECURITY: anon can read guest_summary (% rows)', n;
  end if;
end $$;

-- authenticated must still be able to claim. Role must change too, not just
-- the claims: `set request.jwt.claims` does not grant privileges.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.test_assert(
  public.claim_slug('second-wedding-CCCCCC') is not null,
  'authenticated can still claim a slug');

reset role;

-- cleanup the row this test created so the suite stays re-runnable
delete from public.weddings where slug = 'second-wedding-CCCCCC';
