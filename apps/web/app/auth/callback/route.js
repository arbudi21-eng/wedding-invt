import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

function redirectNoStore(path) {
  const response = NextResponse.redirect(new URL(path, siteUrl()), 303);
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  response.headers.set('Expires', '0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

function safeNext(value) {
  const next = String(value || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/dashboard';
  return next;
}

/**
 * PKCE callback for email confirmation and Google OAuth.
 * Exchanges the one-time code for a session cookie, then returns to the app.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (!code) {
    return redirectNoStore('/login?error=' + encodeURIComponent('Missing confirmation code.'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectNoStore(
      '/login?error=' + encodeURIComponent('That link is invalid or has expired. Request a new one.')
    );
  }

  return redirectNoStore(next);
}
