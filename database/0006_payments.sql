-- =====================================================================
-- 0006_payments.sql -- Phase 3: one flat publish fee + SAGALA promo
--
-- Apply after 0005_wedding_photos_2.sql, in Supabase dashboard >
-- SQL Editor > New query. Idempotent: safe to re-run. It never rewrites
-- existing rows beyond the one-time backfill of already-published drafts.
--
-- Why this is a separate file: the anon/publishable key cannot run DDL, and
-- this project deliberately never uses service_role. Run this SQL as the
-- project owner in the SQL Editor, then the app can write these columns
-- through the existing owner-only RLS policies from 0002_saas.sql.
--
-- What this adds
--   * payment_status / amount_idr / promo_code_used / payment_required
--   * payment_invoice_number, the DOKU invoice mapped to this wedding
--   * invariants so a row cannot claim a paid state with a bogus amount
-- =====================================================================

-- ---------- 1. Columns -------------------------------------------------

alter table public.weddings
  add column if not exists payment_status        text    not null default 'unpaid',
  add column if not exists amount_idr            integer not null default 0,
  add column if not exists promo_code_used       text,
  add column if not exists payment_required      boolean not null default false,
  add column if not exists payment_invoice_number text,
  add column if not exists payment_reference_no   text,
  add column if not exists payment_qr_content     text;

-- ---------- 2. Invariants ----------------------------------------------

alter table public.weddings drop constraint if exists weddings_payment_status_check;
alter table public.weddings add constraint weddings_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'free', 'failed'));

alter table public.weddings drop constraint if exists weddings_amount_idr_check;
alter table public.weddings add constraint weddings_amount_idr_check
  check (amount_idr >= 0);

-- A free publish records no money; a paid one records exactly Rp 100.000.
-- Pending rows are allowed to carry the price before the customer pays.
alter table public.weddings drop constraint if exists weddings_payment_amount_check;
alter table public.weddings add constraint weddings_payment_amount_check
  check (
       (payment_status in ('unpaid', 'free') and amount_idr = 0)
    or (payment_status in ('pending', 'paid', 'failed') and amount_idr = 100000)
  );

-- One invoice/reference can only ever belong to one invitation. Partial
-- indexes: most drafts have neither.
create unique index if not exists weddings_payment_invoice_key
  on public.weddings (payment_invoice_number)
  where payment_invoice_number is not null;

create unique index if not exists weddings_payment_reference_key
  on public.weddings (payment_reference_no)
  where payment_reference_no is not null;

-- ---------- 3. Backfill ------------------------------------------------

-- Invitations published before payments existed were published through the
-- free/dev path. Mark them free so the dashboard does not claim unpaid debt.
update public.weddings
   set payment_status   = 'free',
       amount_idr       = 0,
       payment_required = false
 where status = 'published'
   and payment_status = 'unpaid';

-- ---------- 4. Notes ---------------------------------------------------

-- No anon policies and no SECURITY DEFINER payment RPC are added here.
-- Payment writes go through the existing owner-only UPDATE policy
-- (weddings_owner_update) from 0002_saas.sql. The DOKU webhook only
-- acknowledges signed notifications; the authenticated manage page verifies
-- the transaction with DOKU's status API before publishing. This keeps the
-- anon key non-privileged and needs no service_role key anywhere.
