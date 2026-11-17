'use server';

import { revalidatePath } from 'next/cache';
import { getClaims } from '@/lib/supabase/server';
import { cleanLine, cleanUrl } from '@/lib/draft';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'wedding-photos-2';

// Any slot the UI knows about. Story/album indexes are fixed-size galleries.
const IMAGE_SLOTS = new Set(['cover', 'man', 'woman', 'hero']);
for (let i = 0; i < 5; i += 1) IMAGE_SLOTS.add(`story${i}`);
for (let i = 0; i < 9; i += 1) IMAGE_SLOTS.add(`album${i}`);

const IMAGE_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const VIDEO_MIME = new Map([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

function friendlyStorageError(error) {
  if (!error) return 'Could not save the upload. Please try again.';
  if (/Bucket not found/i.test(error.message || '')) {
    return 'Photo storage is not reachable yet. Check that the wedding-photos-2 bucket exists (Public ON) and that database/0005_wedding_photos_2.sql has been applied.';
  }
  if (/row-level security|security policy|not authorized|must be owner/i.test(error.message || '')) {
    return 'Your session was rejected while saving the file. Sign in again.';
  }
  return 'Could not save the upload. Please try again.';
}

/**
 * Upload one image (or the invitation video) for a draft invitation.
 *
 * The file lands at `<auth.uid()>/<wedding-id>/<slot>-<timestamp>.<ext>` in
 * the `wedding-photos-2` bucket (Dashboard-created); the row is updated with the public URL.
 * Ownership is enforced twice: the session client can only see the owner's
 * rows, and the storage RLS policy only allows writing into the caller's
 * own folder.
 */
export async function uploadAsset(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  const slot = cleanLine(formData.get('slot'), 12);

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Unknown invitation.' };
  if (!IMAGE_SLOTS.has(slot) && slot !== 'video') {
    return { ok: false, slot, error: 'Unknown upload slot.' };
  }

  const file = formData.get('file');
  if (!file || typeof file !== 'object' || typeof file.name !== 'string') {
    return { ok: false, slot, error: 'Choose a file first.' };
  }

  const kind = slot === 'video' ? 'video' : 'image';
  const mimeMap = kind === 'video' ? VIDEO_MIME : IMAGE_MIME;
  const ext = mimeMap.get(file.type);
  if (!ext) {
    return {
      ok: false,
      slot,
      error: kind === 'video' ? 'Use MP4, WebM or MOV.' : 'Use JPEG, PNG, WebP or AVIF.',
    };
  }

  const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (typeof file.size === 'number' && file.size > maxBytes) {
    return {
      ok: false,
      slot,
      error: kind === 'video' ? 'Video is larger than 40 MB.' : 'Image is larger than 8 MB.',
    };
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Your session expired. Sign in again.' };

  // RLS: reading the row proves ownership; "not yours" looks identical to
  // "does not exist".
  const { data: existing, error: readError } = await supabase
    .from('weddings')
    .select('content')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, slot, error: friendlyStorageError(readError) };
  if (!existing) return { ok: false, slot, error: 'Invitation not found.' };

  const content =
    existing.content && typeof existing.content === 'object' ? existing.content : {};
  const photos =
    content.photos && typeof content.photos === 'object' && !Array.isArray(content.photos)
      ? content.photos
      : {};

  const cleanExt = ext.replace(/[^a-z0-9]/g, '');
  const stamp = Date.now().toString(36);
  const path = `${claims.sub}/${id}/${slot}-${stamp}.${cleanExt}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { ok: false, slot, error: friendlyStorageError(uploadError) };

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = publicData && publicData.publicUrl ? cleanUrl(publicData.publicUrl) : '';
  if (!url) return { ok: false, slot, error: 'Upload saved, but its URL could not be built.' };

  const nextPhotos = {
    cover: typeof photos.cover === 'string' ? photos.cover : '',
    man: typeof photos.man === 'string' ? photos.man : '',
    woman: typeof photos.woman === 'string' ? photos.woman : '',
    hero: typeof photos.hero === 'string' ? photos.hero : '',
    story: Array.isArray(photos.story) ? [...photos.story] : [],
    album: Array.isArray(photos.album) ? [...photos.album] : [],
  };

  if (kind === 'video') {
    content.video = { ...(content.video && typeof content.video === 'object' ? content.video : {}), src: url };
  } else if (slot === 'cover' || slot === 'man' || slot === 'woman' || slot === 'hero') {
    nextPhotos[slot] = url;
  } else if (slot.startsWith('story')) {
    const index = Number(slot.slice(5));
    nextPhotos.story[index] = url;
  } else if (slot.startsWith('album')) {
    const index = Number(slot.slice(5));
    nextPhotos.album[index] = url;
  }

  if (kind !== 'video') content.photos = nextPhotos;

  const { error: updateError } = await supabase
    .from('weddings')
    .update({ content })
    .eq('id', id);

  if (updateError) {
    return { ok: false, slot, error: friendlyStorageError(updateError) };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/build/${id}`);
  revalidatePath(`/preview/${id}`);

  return { ok: true, slot, url };
}

/**
 * Remove a previously uploaded asset, both the marker in content and the
 * file in storage (best effort — a failed delete still unlinks the URL).
 */
export async function removeAsset(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  const slot = cleanLine(formData.get('slot'), 12);

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Unknown invitation.' };
  if (!IMAGE_SLOTS.has(slot) && slot !== 'video') {
    return { ok: false, slot, error: 'Unknown upload slot.' };
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Your session expired. Sign in again.' };

  const { data: existing, error: readError } = await supabase
    .from('weddings')
    .select('content')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, slot, error: friendlyStorageError(readError) };
  if (!existing) return { ok: false, slot, error: 'Invitation not found.' };

  const content =
    existing.content && typeof existing.content === 'object' ? existing.content : {};
  const photos =
    content.photos && typeof content.photos === 'object' && !Array.isArray(content.photos)
      ? content.photos
      : {};

  const nextPhotos = {
    cover: typeof photos.cover === 'string' ? photos.cover : '',
    man: typeof photos.man === 'string' ? photos.man : '',
    woman: typeof photos.woman === 'string' ? photos.woman : '',
    hero: typeof photos.hero === 'string' ? photos.hero : '',
    story: Array.isArray(photos.story) ? [...photos.story] : [],
    album: Array.isArray(photos.album) ? [...photos.album] : [],
  };

  let removed = '';
  if (slot === 'video') {
    removed = (content.video && content.video.src) || '';
    content.video = { ...(content.video && typeof content.video === 'object' ? content.video : {}), src: '' };
  } else if (slot === 'cover' || slot === 'man' || slot === 'woman' || slot === 'hero') {
    removed = nextPhotos[slot];
    nextPhotos[slot] = '';
  } else if (slot.startsWith('story')) {
    const index = Number(slot.slice(5));
    removed = nextPhotos.story[index] || '';
    nextPhotos.story[index] = '';
  } else if (slot.startsWith('album')) {
    const index = Number(slot.slice(5));
    removed = nextPhotos.album[index] || '';
    nextPhotos.album[index] = '';
  }

  if (slot !== 'video') content.photos = nextPhotos;

  // Best effort: strip the storage path out of the public URL and delete it.
  if (removed) {
    const marker = `/object/public/${BUCKET}/`;
    const idx = removed.indexOf(marker);
    const path = idx === -1 ? null : decodeURIComponent(removed.slice(idx + marker.length));
    // Only unlink files that live under the caller's own folder.
    if (path && path.split('/')[0] === claims.sub) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
  }

  const { error: updateError } = await supabase
    .from('weddings')
    .update({ content })
    .eq('id', id);

  if (updateError) return { ok: false, slot, error: friendlyStorageError(updateError) };

  revalidatePath('/dashboard');
  revalidatePath(`/build/${id}`);
  revalidatePath(`/preview/${id}`);

  return { ok: true, slot, url: '' };
}
