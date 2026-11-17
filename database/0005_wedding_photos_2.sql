-- =====================================================================
-- 0005_wedding_photos_2.sql — corrective: switch to the Dashboard-created
-- bucket `wedding-photos-2`.
--
-- Direct deletion from storage.buckets is blocked by Supabase
-- (storage.protect_delete), so instead of fighting the SQL-only bucket
-- `wedding-photos` (which the Storage API never surfaces), the Dashboard
-- flow created `wedding-photos-2` and the app now uses it. Live to trying
-- to re-create wedding-photos via SQL never worked because Storage keeps
-- its own bucket registry/cache separate from the table.
--
-- Idempotent: re-running is fine (drops + re-creates the policies).
-- =====================================================================

-- Old policies for `wedding-photos` are left alone on purpose — they become
-- unreachable no-ops once the app stops pointing at that bucket.

-- Public may read anything in the bucket (it is the invitation media CDN).
drop policy if exists wedding_photos_public_read on storage.objects;
create policy wedding_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'wedding-photos-2');

-- Authenticated users may write ONLY inside their own folder.
drop policy if exists wedding_photos_own_insert on storage.objects;
create policy wedding_photos_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wedding-photos-2'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists wedding_photos_own_update on storage.objects;
create policy wedding_photos_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wedding-photos-2'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'wedding-photos-2'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists wedding_photos_own_delete on storage.objects;
create policy wedding_photos_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wedding-photos-2'
    and split_part(name, '/', 1) = auth.uid()::text
  );
