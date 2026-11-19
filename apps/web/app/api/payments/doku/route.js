// DOKU notification / return endpoint.
//
// ACKNOWLEDGEMENT ONLY. This route never authenticates a user, never imports
// Supabase, and never changes a wedding row. Privileged payment writes are not
// allowed here: the authenticated manage page asks DOKU for the authoritative
// transaction status and publishes only after the exact Rp 100.000 payment is
// confirmed. That keeps the anon key non-privileged and needs no privileged
// database key.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/payments/doku — accept a DOKU notification and acknowledge it. */
export async function POST(request) {
  try {
    await request.json();
  } catch {
    // Some gateways send an empty body for a ping. Acknowledge it anyway.
  }
  return NextResponse.json({ ok: true, received: true });
}

/** GET /api/payments/doku — return URL back to the authenticated manage page. */
export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || url.searchParams.get('invoiceNumber');
  const status = url.searchParams.get('status') || 'unknown';

  if (!slug) {
    return NextResponse.redirect(new URL('/dashboard', url.origin));
  }

  return NextResponse.redirect(
    new URL(`/manage/${encodeURIComponent(slug)}?payment=${encodeURIComponent(status)}`, url.origin)
  );
}
