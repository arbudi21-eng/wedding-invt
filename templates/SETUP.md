# Setup

1. Create a free project at supabase.com.
2. SQL Editor: run `database/wedding_schema.sql` on a **fresh** project. It creates `weddings`, per-wedding `settings`, and the guest RPCs (`open_invitation`, `submit_rsvp`, `submit_wish`, `list_wishes`). The schema is not an in-place migration — if you ran an older version of this file, drop `public.guest_summary`, `public.settings`, `public.wishes`, `public.guests`, `public.admins` and `public.weddings` first.
3. Register the slug, so the invitation's data has an owner: `select public.claim_slug('{SLUG}');` from the SQL editor (admin-only).
4. Authentication > Users > Add user (the couple's email + password), then grant that user this wedding only:
   ```sql
   insert into public.admins (user_id, wedding_id)
   select u.id, w.id from auth.users u, public.weddings w
    where u.email = 'PARTNER@EXAMPLE.COM' and w.slug = '{SLUG}';
   ```
   One database can serve many weddings; each admin only sees the wedding they are listed for. Add one row per person per wedding.
5. Settings > API: copy Project URL and anon public key into `site/{SLUG}/config.js`.
6. Put photos in `site/{SLUG}/assets/` (WebP, ~1600 px, <300 KB), music as `music.mp3` (<3 MB). Edit names, date, venue, gifts in `CFG` / `T` inside `site/{SLUG}/index.html`.
7. Deploy the invitation.
   - Shared host (Netlify, Cloudflare Pages, etc.): upload the **contents of `site/`** so every invitation lives at `/{SLUG}/`. Link: `https://YOUR-HOST/{SLUG}/`. Hosts only read `_headers` from the publish root, so copy the `/{SLUG}/...` rules from this folder's `_headers` into the root `_headers` file.
   - Separate host per couple: upload the **contents of `site/{SLUG}/`** as its own project. Link: `https://YOUR-PROJECT.netlify.app/`, or `https://{SLUG}.YOUR-DOMAIN/` if you have a wildcard DNS record.
8. In admin Settings set Base URL to that link (no `?c=`), for example `https://YOUR-HOST/{SLUG}/` or `https://{SLUG}.YOUR-DOMAIN/`. The console adds `/{SLUG}/` only when the Base URL does not already contain it, so copied guest links are always correct.
9. Remove demo data: `delete from public.guests where code like 'DEMO%';`
10. Add guests, tap Send on WhatsApp for each, watch RSVPs arrive. Guest link: `https://YOUR-HOST/{SLUG}/?c=<code>`; console: `https://YOUR-HOST/{SLUG}/admin/`.
