'use server';

import { revalidatePath } from 'next/cache';
import { getClaims } from '@/lib/supabase/server';
import { cleanLine } from '@/lib/draft';

const PHONE_RE = /^[0-9]{8,16}$/;
const LANGS = new Set(['id', 'en']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SAVE_RE = /^[a-f0-9-]{36}$/i;

/**
 * Owner-verified insert of one guest. RLS on `guests` requires the caller to
 * be an admin of the wedding, so this path cannot be used to add guests to a
 * wedding you do not own.
 */
export async function createGuest(prevState, formData) {
  const weddingId = cleanLine(formData.get('weddingId'), 40);
  if (!UUID_RE.test(weddingId)) return { ok: false, error: 'Unknown invitation.' };

  const name = cleanLine(formData.get('name'), 120);
  if (!name) return { ok: false, error: 'Tulis nama tamu.' };

  const phoneRaw = cleanLine(formData.get('phone'), 20);
  const phone = phoneRaw.replace(/^\+/, '').replace(/[\s-]/g, '');
  if (!PHONE_RE.test(phone)) return { ok: false, error: 'Nomor WhatsApp tidak valid (8–16 digit, contoh: 62812...).' };

  const lang = LANGS.has(formData.get('lang')) ? formData.get('lang') : 'id';

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi Anda habis. Masuk kembali.' };

  const { data, error } = await supabase
    .from('guests')
    .insert({ wedding_id: weddingId, name, phone, lang })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal menambah tamu. Coba lagi.' };

  revalidatePath('/manage');
  return { ok: true, id: data?.id };
}

/** Owner-verified mark-as-sent toggle. */
export async function setGuestSent(formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_SAVE_RE.test(id) && !UUID_RE.test(id)) return { ok: false, error: 'Unknown guest.' };
  const sent = formData.get('sent') === '1';

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis. Masuk kembali.' };

  const payload = sent ? { sent_status: 'sent', sent_at: new Date().toISOString() } : { sent_status: 'new', sent_at: null };

  const { error } = await supabase
    .from('guests')
    .update(payload)
    .eq('id', id);

  if (error) return { ok: false, error: 'Gagal memperbarui status. Coba lagi.' };

  revalidatePath('/manage');
  return { ok: true };
}

/** Owner-verified delete. */
export async function deleteGuest(formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Unknown guest.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Sesi habis.' };

  const { error } = await supabase.from('guests').delete().eq('id', id);
  if (error) return { ok: false, error: 'Gagal menghapus tamu. Coba lagi.' };

  revalidatePath('/manage');
  return { ok: true };
}
