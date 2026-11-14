'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getClaims } from '@/lib/supabase/server';
import { makeSlug } from '@/lib/core';
import { cleanLine, draftFromForm, SLUG_RE } from '@/lib/draft';

const MAX_SLUG_ATTEMPTS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function friendlyDbError(error) {
  if (!error) return 'Could not save the invitation. Please try again.';
  if (error.code === '42501') return 'Your session expired. Sign in again.';
  if (error.code === '22023') return 'The invitation link could not be generated. Please try again.';
  if (error.code === '23514') return 'Some of the details were rejected. Check the names and date.';
  return 'Could not save the invitation. Please try again.';
}

/**
 * Create a draft through `create_wedding()`, the only insert path.
 *
 * The database generates nothing: the app supplies the slug and retries with a
 * fresh base32 suffix when Postgres reports a unique violation (23505).
 */
export async function createDraft(prevState, formData) {
  const parsed = draftFromForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, error: '' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { errors: {}, error: 'Your session expired. Sign in again.' };

  let lastError = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = makeSlug(parsed.content.names);
    // makeSlug already produces this shape; this is a cheap tripwire for
    // future edits to lib/core.js before the database rejects a bad slug.
    if (!SLUG_RE.test(slug)) continue;

    const { data, error } = await supabase.rpc('create_wedding', {
      p_slug: slug,
      p_design: parsed.design,
      p_content: parsed.content,
    });

    if (!error) {
      revalidatePath('/dashboard');
      redirect(`/build/${data}`);
    }

    lastError = error;
    if (error.code !== '23505') break;
  }

  return { errors: {}, error: friendlyDbError(lastError) };
}

export async function saveDraft(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  if (!UUID_RE.test(id)) return { errors: {}, error: 'Unknown invitation.' };

  const parsed = draftFromForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, error: '' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { errors: {}, error: 'Your session expired. Sign in again.' };

  // RLS scopes this to the owner; `maybeSingle()` turns "not yours" and
  // "does not exist" into the same safe answer.
  const { data, error } = await supabase
    .from('weddings')
    .update({ content: parsed.content, design: parsed.design })
    .eq('id', id)
    .select('id, updated_at')
    .maybeSingle();

  if (error) return { errors: {}, error: friendlyDbError(error) };
  if (!data) return { errors: {}, error: 'Invitation not found.' };

  revalidatePath('/dashboard');
  revalidatePath(`/build/${id}`);

  return { errors: {}, error: '', savedAt: data.updated_at };
}

export async function deleteDraft(formData) {
  const id = cleanLine(formData.get('id'), 40);

  if (UUID_RE.test(id)) {
    const { supabase, claims } = await getClaims();
    if (claims?.sub) {
      await supabase.from('weddings').delete().eq('id', id);
    }
  }

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
