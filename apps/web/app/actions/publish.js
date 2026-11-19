'use server';

import { revalidatePath } from 'next/cache';
import { getClaims } from '@/lib/supabase/server';
import { cleanLine } from '@/lib/draft';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One flat price for every invitation: RP 100.000.
const PUBLISH_PRICE_IDR = 100000;

// Promo codes that waive the payment entirely.
// Visible in the promo field on the manage page.
const FREE_PROMO_CODES = new Set(['SAGALA']);

/**
 * @typedef {Object} PublishResultOk
 * @property {boolean} ok - always true
 * @property {string} slug
 * @property {boolean} paid
 * @property {number} amountIdr
 */
/**
 * @typedef {Object} PublishResultFail
 * @property {boolean} ok - always false
 * @property {string} error
 * @property {boolean} [paymentRequired]
 * @property {number} [amountIdr]
 */
/**
 * @typedef {PublishResultOk | PublishResultFail} PublishResult
 */

/**
 * @typedef {Object} DokuPaymentResult
 * @property {boolean} ok
 * @property {string} [checkoutUrl] - URL to redirect the user to for DOKU payment
 * @property {string} [error]
 */

/**
 * Publish an invitation with a single flat payment of RP 100.000.
 *
 * If a valid promo code is supplied (currently only SAGALA), publication is
 * free and no payment is required. Otherwise the caller must pay PUBLISH_PRICE_IDR
 * through DOKU before the invitation flips to `published`.
 *
 * Ownership is enforced by RLS (owner only) and the caller's Supabase session.
 *
 * @param {object} prevState
 * @param {FormData} formData
 * @returns {Promise<PublishResult>}
 */
export async function publishWithPayment(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const promoCode = cleanLine(formData.get('promoCode'), 40);
  const isFree = FREE_PROMO_CODES.has(String(promoCode).toUpperCase());

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi Anda habis. Masuk kembali.' };

  const { data: existing, error: readError } = await supabase
    .from('weddings')
    .select('id, slug, status, payment_status, amount_idr, promo_code_used')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, error: 'Gagal memuat undangan. Coba lagi.' };
  if (!existing) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (existing.status === 'published') {
    return { ok: true, slug: existing.slug, paid: true, amountIdr: existing.amount_idr ?? 0 };
  }

  // Free via promo code — publish immediately, no payment.
  if (isFree) {
    const { data, error } = await supabase
      .from('weddings')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        payment_status: 'free',
        amount_idr: 0,
        promo_code_used: String(promoCode).toUpperCase(),
      })
      .eq('id', id)
      .select('slug')
      .maybeSingle();

    if (error) return { ok: false, error: 'Gagal terbitkan undangan. Coba lagi.' };
    if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

    revalidatePath('/dashboard');
    revalidatePath('/manage');
    revalidatePath(`/manage/${data.slug}`);

    return { ok: true, slug: data.slug, paid: true, amountIdr: 0 };
  }

  // Paid path: require RP 100.000 via DOKU.
  // Record a pending payment record. The client will create a DOKU payment
  // transaction via createDokuPayment and redirect to DOKU checkout.
  const { data, error } = await supabase
    .from('weddings')
    .update({
      payment_status: 'pending',
      amount_idr: PUBLISH_PRICE_IDR,
      payment_required: true,
    })
    .eq('id', id)
    .select('slug, payment_status, amount_idr')
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal mencatat pembayaran. Coba lagi.' };
  if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

  return {
    ok: false,
    error: `Pembayaran Rp ${PUBLISH_PRICE_IDR.toLocaleString('id-ID')} diperlukan sebelum terbitkan.`,
    paymentRequired: true,
    amountIdr: PUBLISH_PRICE_IDR,
  };
}

/**
 * Create a DOKU payment transaction for the invitation.
 * Returns a checkout URL the client should redirect to.
 *
 * @param {FormData} formData - must include 'id' (wedding UUID)
 * @returns {Promise<DokuPaymentResult>}
 */
export async function createDokuPayment(formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data: wedding, error: readError } = await supabase
    .from('weddings')
    .select('id, slug, status, payment_status, amount_idr, content')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, error: 'Gagal memuat undangan.' };
  if (!wedding) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (wedding.status === 'published') {
    return { ok: false, error: 'Undangan sudah diterbitkan.' };
  }
  if (wedding.payment_status !== 'pending') {
    return { ok: false, error: 'Pembayaran belum dalam status pending.' };
  }

  const apiUrl = process.env.DOKU_API_URL || 'https://api.doku.com';
  const clientKey = process.env.DOKU_CLIENT_KEY;
  const apiKey = process.env.DOKU_API_KEY;

  if (!clientKey || !apiKey) {
    return { ok: false, error: 'DOKU tidak dikonfigurasi di server.' };
  }

  // Build the DOKU payment request. Exact field names depend on your DOKU
  // account configuration; adjust to match DOKU's API documentation.
  const orderId = `INV-${id.slice(0, 8)}-${Date.now()}`;
  const returnUrl = `${process.env.SITE_URL || 'http://localhost:3001'}/api/payments/doku`;
  const callbackUrl = `${process.env.SITE_URL || 'http://localhost:3001'}/api/payments/doku`;

  try {
    const resp = await fetch(`${apiUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Key': clientKey,
        'Api-Key': apiKey,
      },
      body: JSON.stringify({
        orderId,
        amount: PUBLISH_PRICE_IDR,
        currency: 'IDR',
        returnUrl,
        callbackUrl,
        customerName: wedding.content?.names?.join(' & ') || 'Pelanggan',
        description: `Publish undangan pernikahan ${wedding.slug}`,
        metadata: { weddingId: id },
      }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      return { ok: false, error: `DOKU error: ${result.message || resp.status}` };
    }

    // DOKU typically returns a payment URL / redirectUrl / invoiceUrl
    const checkoutUrl =
      result.redirectUrl ||
      result.paymentUrl ||
      result.invoiceUrl ||
      result.url;

    if (!checkoutUrl) {
      return { ok: false, error: 'DOKU tidak mengembalikan URL pembayaran.' };
    }

    return { ok: true, checkoutUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'DOKU request gagal.' };
  }
}

/**
 * Confirm a completed payment and publish the invitation.
 * Called after DOKU webhook / return URL confirms payment.
 *
 * @param {FormData} formData
 * @returns {Promise<{ok: boolean, slug?: string, error?: string}>}
 */
export async function confirmPayment(formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data, error } = await supabase
    .from('weddings')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      payment_status: 'paid',
      payment_required: false,
    })
    .eq('id', id)
    .eq('payment_status', 'pending')
    .select('slug')
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal mengonfirmasi pembayaran.' };
  if (!data) return { ok: false, error: 'Pembayaran belum tertunda atau undangan tidak ditemukan.' };

  revalidatePath('/dashboard');
  revalidatePath('/manage');
  revalidatePath(`/manage/${data.slug}`);

  return { ok: true, slug: data.slug };
}

/**
 * Legacy alias kept so existing call sites (dev-skip-publish, etc.) keep working.
 * Always publishes for free — no payment, no promo.
 *
 * @param {object} prevState
 * @param {FormData} formData
 * @returns {Promise<PublishResult>}
 */
export async function publishInvitation(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data, error } = await supabase
    .from('weddings')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal terbitkan undangan. Coba lagi.' };
  if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

  revalidatePath('/dashboard');
  revalidatePath('/manage');
  revalidatePath(`/manage/${data.slug}`);

  return { ok: true, slug: data.slug };
}
