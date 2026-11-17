-- =====================================================================
-- 0003_public_published.sql -- Phase 2: the guest link
--
-- Apply after 0002_saas.sql. Idempotent: re-running replaces the function
-- and its grants; it never touches rows.
--
-- Why this exists: /{slug} is the live invitation a couple sends to their
-- guests after DOKU payment flips status to 'published'. Guests have no
-- account, so the page cannot read `weddings` directly: 0002 gives owners
-- only a SELECT policy and there is no anon policy at all. The repo's rule
-- is the same one guests already use everywhere else — the only public
-- path is a SECURITY DEFINER RPC that returns exactly what the page needs
-- and nothing else.
--
-- get_published_wedding(p_slug) returns (design, content) for a slug whose
-- invitation is published, or zero rows otherwise (draft, archived,
-- nonexistent — indistinguishable from outside). Owner identity, timestamps
-- and payment state stay server-side.
-- =====================================================================

create or replace function public.get_published_wedding(p_slug text)
returns table (design text, content jsonb, slug text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$' then
    return;
  end if;

  return query
  select w.design, w.content, w.slug
  from public.weddings w
  where w.slug = p_slug
    and w.status = 'published';
end $$;

revoke all on function public.get_published_wedding(text) from public;
revoke all on function public.get_published_wedding(text) from anon;
grant execute on function public.get_published_wedding(text) to anon, authenticated;
