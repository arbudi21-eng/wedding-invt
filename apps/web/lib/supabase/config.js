// Supabase connection settings.
//
// Both values are read on the server only. The app deliberately has no browser
// Supabase client, so these are not NEXT_PUBLIC_* and never reach the bundle.
// The anon key is public by design, but there is no reason to ship it.

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Copy apps/web/.env.local.example to .env.local ' +
        'and set SUPABASE_URL and SUPABASE_ANON_KEY.'
    );
  }

  return { url, anonKey };
}

/** Public origin of this app, used for OAuth and email-confirmation redirects. */
export function siteUrl() {
  return (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
