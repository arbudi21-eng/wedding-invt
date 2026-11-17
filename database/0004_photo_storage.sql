-- =====================================================================
-- 0004_photo_storage.sql — Phase 2: invitation photos & video
--
-- Apply after 0003_public_published.sql. Idempotent (re-running is safe).
--
-- Creates the bucket the studio uploads into, grants public READ (the
-- published invitation hotlinks photos from this bucket), and lets each
-- signed-in user write into their OWN folder only: objects are stored at
-- <auth.uid()>/<wedding-id>/<slot>-<timestamp>.<ext>, and every storage
-- policy keys off the first path segment being auth.uid().
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', true)
on conflict (id) do nothing;

-- Public may read anything in the bucket (it is the invitation media CDN).
drop policy if exists wedding_photos_public_read on storage.objects;
create policy wedding_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'wedding-photos');

-- Authenticated users may upload ONLY inside their own folder.
drop policy if exists wedding_photos_own_insert on storage.objects;
create policy wedding_photos_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wedding-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- …and may update/delete only files in their own folder.
drop policy if exists wedding_photos_own_update on storage.objects;
create policy wedding_photos_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wedding-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'wedding-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists wedding_photos_own_delete on storage.objects;
create policy wedding_photos_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wedding-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );
