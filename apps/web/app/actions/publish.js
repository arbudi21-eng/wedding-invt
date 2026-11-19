'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { getClaims } from '@/lib/supabase/server';
import { cleanLine } from '@/lib/draft';
import { createQris, isDokuConfigured, queryQris } from '@/lib/doku/mcp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One flat price for every invitation: Rp 100.000.
const PUBLISH_PRICE_IDR = 100000;

// Server-only. The promo value is never rendered or shipped to the browser.
const FREE_PROMO_CODES = new Set(['SAGALA']);

function revalidateManage(slug) {
  revalidatePath('/dashboard');
  revalidatePath('/manage');
  revalidatePath(`/manage/${slug}`);
}

function currency(idr) {
  return `Rp ${Number(idr).toLocaleString('id-ID')}`;
}

const PAYMENT_UNAVAILABLE =
  'Fitur pembayaran belum aktif. Hubungi pemilik toko untuk menyiapkan tabel pembayaran.';

/** The payment migration has not been applied in Supabase yet. */
function paymentSchemaMissing(error) {
  const message = String(error?.message || '');
  return error?.code === '42703' || /does not exist|undefined column/i.test(message);
}

/**
 * Resolve whether a submitted promo waives the fee, then either publish for
 * free or mark the invitation as awaiting a Rp 100.000 DOKU payment.
 *
 * Ownership is enforced by the owner-only RLS policies and the caller's
 * Supabase session — never by a privileged database key.
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
    .select('id, slug, status, payment_status, amount_idr')
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: paymentSchemaMissing(readError) ? PAYMENT_UNAVAILABLE : 'Gagal memuat undangan. Coba lagi.',
    };
  }
  if (!existing) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (existing.status === 'published') {
    return { ok: true, slug: existing.slug, paid: true, amountIdr: existing.amount_idr ?? 0 };
  }

  if (isFree) {
    const { data, error } = await supabase
      .from('weddings')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        payment_status: 'free',
        amount_idr: 0,
        payment_required: false,
        promo_code_used: String(promoCode).toUpperCase(),
      })
      .eq('id', id)
      .select('slug')
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: paymentSchemaMissing(error) ? PAYMENT_UNAVAILABLE : 'Gagal terbitkan undangan. Coba lagi.',
      };
    }
    if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

    revalidateManage(data.slug);
    return { ok: true, slug: data.slug, paid: true, amountIdr: 0 };
  }

  const { data, error } = await supabase
    .from('weddings')
    .update({
      payment_status: 'pending',
      amount_idr: PUBLISH_PRICE_IDR,
      payment_required: true,
    })
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: paymentSchemaMissing(error) ? PAYMENT_UNAVAILABLE : 'Gagal mencatat pembayaran. Coba lagi.',
    };
  }
  if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

  return {
    ok: false,
    error: `Pembayaran ${currency(PUBLISH_PRICE_IDR)} diperlukan sebelum terbitkan.`,
    paymentRequired: true,
    amountIdr: PUBLISH_PRICE_IDR,
  };
}

/**
 * Generate a DOKU MCP dynamic QRIS for the flat publish fee and store the
 * invoice on the invitation so its status can be queried later.
 *
 * The `(prevState, formData)` shape is required by React's useActionState.
 *
 * @returns {Promise<{ok: boolean, qrDataUrl?: string, invoiceNumber?: string, error?: string}>}
 */
export async function createDokuPayment(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data: wedding, error: readError } = await supabase
    .from('weddings')
    .select(
      'id, slug, status, payment_status, amount_idr, payment_invoice_number, payment_reference_no, payment_qr_content, content'
    )
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: paymentSchemaMissing(readError) ? PAYMENT_UNAVAILABLE : 'Gagal memuat undangan.',
    };
  }
  if (!wedding) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (wedding.status === 'published') return { ok: false, error: 'Undangan sudah diterbitkan.' };
  if (wedding.payment_status !== 'pending') {
    return { ok: false, error: 'Pembayaran belum dalam status pending.' };
  }
  if (!isDokuConfigured()) {
    return { ok: false, error: 'Pembayaran DOKU belum dikonfigurasi di server.' };
  }

  // Reuse an unexpired QR rather than generating duplicates on every click.
  if (wedding.payment_qr_content) {
    try {
      return {
        ok: true,
        invoiceNumber: wedding.payment_invoice_number || '',
        qrDataUrl: await QRCode.toDataURL(wedding.payment_qr_content, {
          width: 320, margin: 2, errorCorrectionLevel: 'M',
        }),
      };
    } catch {
      // Fall through and regenerate a fresh QR.
    }
  }

  // UUID keeps the invoice unique even when two owners publish at the same ms.
  const partnerReferenceNo = `WED-${id.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  const qr = await createQris({
    partnerReferenceNo,
    amountIdr: PUBLISH_PRICE_IDR,
    postalCode: cleanLine(wedding.content?.postalCode, 5) || undefined,
  });

  if (!qr.ok || !qr.qrContent) {
    return { ok: false, error: qr.error || 'DOKU tidak mengembalikan QRIS.' };
  }

  const { error: updateError } = await supabase
    .from('weddings')
    .update({
      payment_invoice_number: qr.partnerReferenceNo,
      payment_reference_no: qr.referenceNo || qr.partnerReferenceNo,
      payment_qr_content: qr.qrContent,
      amount_idr: PUBLISH_PRICE_IDR,
      payment_status: 'pending',
    })
    .eq('id', id)
    .eq('payment_status', 'pending');

  if (updateError) {
    return {
      ok: false,
      error: paymentSchemaMissing(updateError) ? PAYMENT_UNAVAILABLE : 'Gagal menyimpan QRIS. Coba lagi.',
    };
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qr.qrContent, {
      width: 320, margin: 2, errorCorrectionLevel: 'M',
    });
    return { ok: true, invoiceNumber: qr.partnerReferenceNo, qrDataUrl };
  } catch {
    return { ok: false, error: 'Gagal menampilkan QRIS. Coba lagi.' };
  }
}

/**
 * Ask DOKU for the transaction status. Only DOKU's authoritative success
 * response with the exact Rp 100.000 amount publishes the invitation.
 * Called by the authenticated manage page (polling + manual button).
 */
export async function checkDokuPayment(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data: wedding, error: readError } = await supabase
    .from('weddings')
    .select(
      'id, slug, status, payment_status, amount_idr, payment_invoice_number, payment_reference_no'
    )
    .eq('id', id)
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: paymentSchemaMissing(readError) ? PAYMENT_UNAVAILABLE : 'Gagal memuat undangan.',
    };
  }
  if (!wedding) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (wedding.status === 'published') return { ok: true, paid: true, slug: wedding.slug };
  if (wedding.payment_status !== 'pending') {
    return { ok: false, error: 'Pembayaran tidak dalam status pending.' };
  }
  if (!wedding.payment_invoice_number) {
    return { ok: false, error: 'QRIS belum dibuat. Coba lagi.' };
  }
  if (!isDokuConfigured()) {
    return { ok: false, error: 'Pembayaran DOKU belum dikonfigurasi di server.' };
  }

  const result = await queryQris({
    partnerReferenceNo: wedding.payment_invoice_number,
    expectedAmountIdr: wedding.amount_idr || PUBLISH_PRICE_IDR,
  });

  if (!result.ok) return { ok: false, error: result.error || 'Gagal cek status DOKU.' };

  if (result.status === 'paid') {
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
    if (!data) return { ok: false, error: 'Pembayaran sudah dikonfirmasi.' };

    revalidateManage(data.slug);
    return { ok: true, paid: true, slug: data.slug };
  }

  if (result.status === 'failed') {
    await supabase
      .from('weddings')
      .update({ payment_status: 'failed' })
      .eq('id', id)
      .eq('payment_status', 'pending');
  }

  return { ok: true, paid: false, status: result.status };
}

/**
 * Legacy alias kept so existing call sites (dev-skip-publish, etc.) keep working.
 * Always publishes for free — no payment, no promo.
 */
export async function publishInvitation(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Undangan tidak diketahui.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const { data: existing, error: readError } = await supabase
    .from('weddings')
    .select('slug, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, error: 'Gagal terbitkan undangan. Coba lagi.' };
  if (!existing) return { ok: false, error: 'Undangan tidak ditemukan.' };
  if (existing.status === 'published') {
    revalidateManage(existing.slug);
    return { ok: true, slug: existing.slug };
  }

  const { data, error } = await supabase
    .from('weddings')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal terbitkan undangan. Coba lagi.' };
  if (!data) return { ok: false, error: 'Undangan tidak ditemukan.' };

  revalidateManage(data.slug);
  return { ok: true, slug: data.slug };
}
