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

/** Sign-out is a POST so a random link cannot end someone's session. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirectNoStore('/login');
}

export async function GET() {
  return redirectNoStore('/login');
}
