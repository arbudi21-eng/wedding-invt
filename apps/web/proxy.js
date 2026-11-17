import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from './lib/supabase/config.js';

const PROTECTED = ['/dashboard', '/build', '/manage'];

function isProtected(pathname) {
  return PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthPage(pathname) {
  return pathname === '/login' || pathname === '/signup';
}

/**
 * Next.js 16 Proxy (the renamed middleware).
 *
 * Two jobs only:
 *   1. Refresh the Supabase session so Server Components never have to.
 *   2. Redirect anonymous visitors away from the studio and signed-in visitors
 *      away from the auth pages.
 *
 * Authorisation itself is never decided here — RLS and the server actions own
 * that. This is a UX gate.
 */
export async function proxy(request) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = supabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Auth responses must never be cached by a CDN or shared proxy.
        for (const [key, value] of Object.entries(headers || {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  const { pathname, search } = request.nextUrl;

  if (!claims && isProtected(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (claims && isAuthPage(pathname)) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = '/dashboard';
    dashboard.search = '';
    return NextResponse.redirect(dashboard);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)'],
};
