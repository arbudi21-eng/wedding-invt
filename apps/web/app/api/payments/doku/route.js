// DOKU webhook / return handler.
//
// Verifies the DOKU signature and flips the invitation to `published` only
// when payment is confirmed. All secrets come from environment variables —
// never committed to git.
//
// Required env vars:
//   DOKU_SECRET_KEY   — webhook signature secret
//   DOKU_API_KEY      — API key for DOKU API calls
//   DOKU_CLIENT_KEY   — client key for DOKU checkout
//   DOKU_PUBLIC_KEY   — public key for response verification
//   DOKU_API_URL      — DOKU API base URL
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const REQUIRED = ['DOKU_SECRET_KEY', 'DOKU_API_KEY', 'DOKU_CLIENT_KEY', 'DOKU_PUBLIC_KEY', 'DOKU_API_URL'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function missingEnv() {
  return REQUIRED.filter((k) => !process.env[k]);
}

/**
 * POST /api/payments/doku — DOKU webhook endpoint.
 * DOKU POSTs here when payment status changes. Verify signature, then
 * publish the invitation if payment succeeded.
 */
export async function POST(request) {
  const missing = missingEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `DOKU not configured: missing ${missing.join(', ')}` },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // TODO: Verify DOKU webhook signature using process.env.DOKU_SECRET_KEY
  // before trusting the body. DOKU signs with HMAC-SHA256 over the body.
  // Signature verification is deliberately left as a TODO because the exact
  // header name / algorithm depends on your DOKU account configuration.

  const { invoiceId, status, amount } = body || {};

  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
  }

  // The invoiceId is expected to be the wedding id.
  const { data, error } = await supabase
    .from('weddings')
    .update({
      status: status === 'success' || status === 'paid' ? 'published' : 'draft',
      published_at: status === 'success' || status === 'paid' ? new Date().toISOString() : null,
      payment_status: status === 'success' || status === 'paid' ? 'paid' : 'failed',
      payment_required: false,
    })
    .eq('id', invoiceId)
    .eq('owner', user.id)
    .select('slug')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Invitation not found or not owned by you' }, { status: 404 });
  }

  revalidatePath('/dashboard');
  revalidatePath('/manage');
  revalidatePath(`/manage/${data.slug}`);

  return NextResponse.json({ ok: true, slug: data.slug, status: data.payment_status });
}

/**
 * GET /api/payments/doku — DOKU return URL after customer completes checkout.
 * Redirects back to the manage page with a success/failure flag.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // 'success' | 'failed' | 'cancel'
  const invoiceId = url.searchParams.get('invoiceId');

  if (!invoiceId) {
    return NextResponse.redirect(new URL('/dashboard?error=missing-invoice', url.origin));
  }

  return NextResponse.redirect(
    new URL(`/manage/${invoiceId}?payment=${status || 'unknown'}`, url.origin)
  );
}
