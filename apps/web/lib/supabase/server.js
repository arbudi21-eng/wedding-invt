import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from './config.js';

/**
 * A request-scoped Supabase client that authenticates with the session cookies.
 *
 * Always create a new client per request; never cache one across requests.
 * In Server Components the cookie store is read-only, so `setAll` swallows the
 * error — `proxy.js` is what writes refreshed tokens there.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Read-only render. proxy.js owns token refresh.
        }
      },
    },
  });
}

/**
 * Verify the JWT and return the claims. `getClaims()` validates the token
 * locally against the project's JWKS, unlike `getSession()` which trusts the
 * cookie blindly.
 */
export async function getClaims() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return { supabase, claims: data?.claims ?? null, error };
}
