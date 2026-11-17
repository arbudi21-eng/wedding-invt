// Server-side cleanup of abandoned drafts.
//
// Drafts that stay unpublished for the abandonment window are deleted along
// with every photo/video stored in their owner's folder, so unused uploads
// never pile up in the bucket. Triggered lazily from the dashboard open —
// there is no cron; the next dashboard view is the sweep trigger.
import { getClaims } from '@/lib/supabase/server';

// Abandonment window, in days.
const STALE_DAYS = 3;
const BUCKET = 'wedding-photos-2';

/**
 * Delete the caller's drafts whose status is still 'draft' and that were
 * created more than STALE_DAYS days ago. Their storage folder and wedding
 * row (and its children via cascade) are removed as well.
 *
 * Returns { pruned, errors }.
 */
export async function pruneStaleDrafts() {
  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { pruned: 0, errors: [] };

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // RLS already scopes to the caller's own rows.
  const { data: stale, error } = await supabase
    .from('weddings')
    .select('id, owner, status, content, created_at')
    .eq('status', 'draft')
    .lt('created_at', cutoff);

  if (error) {
    console.error('pruneStaleDrafts: select failed', error.message);
    return { pruned: 0, errors: [error.message] };
  }
  if (!stale || stale.length === 0) return { pruned: 0, errors: [] };

  const errors = [];
  let pruned = 0;

  for (const wedding of stale) {
    const prefix = `${claims.sub}/${wedding.id}/`;

    // List every object under the draft's folder and delete it.
    const { data: objects, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 100 });

    if (listError) {
      errors.push(`list ${wedding.id}: ${listError.message}`);
    } else if (objects && objects.length > 0) {
      const paths = objects.map((object) => `${prefix}${object.name}`);
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
      if (removeError) {
        errors.push(`remove ${wedding.id}: ${removeError.message}`);
      }
    }

    // Finally remove the wedding row. Cascade removes the dependents.
    const { error: deleteError } = await supabase.from('weddings').delete().eq('id', wedding.id);
    if (deleteError) {
      errors.push(`delete ${wedding.id}: ${deleteError.message}`);
      continue;
    }
    pruned += 1;
  }

  return { pruned, errors };
}
