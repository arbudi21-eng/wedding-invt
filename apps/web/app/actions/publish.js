'use server';

import { revalidatePath } from 'next/cache';
import { getClaims } from '@/lib/supabase/server';
import { cleanLine } from '@/lib/draft';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = new Set(['starter', 'professional']);

/**
 * Owner-verified publish.
 *
 * Marks the invitation published via the caller's own Supabase session, so
 * RLS ("owner only") is the gate — nobody publishes somebody else's invitation.
 * DOKU capture is a test-mode stub in this repo: the live DOKU checkout
 * happens in their hosted page and confirms through the doku webhook route,
 * which is deliberately not wired to flip `status` from the client.
 */
export async function publishInvitation(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: 'Unknown invitation.' };

  const plan = PLANS.has(formData.get('plan')) ? formData.get('plan') : 'starter';

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, error: 'Your session expired. Sign in again.' };

  const { data, error } = await supabase
    .from('weddings')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .select('slug')
    .maybeSingle();

  if (error) return { ok: false, error: 'Could not publish invitation. Please try again.' };
  if (!data) return { ok: false, error: 'Invitation not found.' };

  revalidatePath('/dashboard');
  revalidatePath('/manage');
  revalidatePath(`/manage/${data.slug}`);

  return { ok: true, slug: data.slug, plan };
}
