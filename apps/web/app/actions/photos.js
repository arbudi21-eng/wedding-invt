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
const AUDIO_SLOTS = new Set(['music']);
const ALL_SLOTS = new Set([...IMAGE_SLOTS, ...AUDIO_SLOTS, 'video']);

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

const AUDIO_MIME = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mpga', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/m4a', 'm4a'],
  ['audio/aac', 'm4a'],
  ['audio/x-aac', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/x-ogg', 'ogg'],
  ['audio/opus', 'ogg'],
  ['audio/flac', 'flac'],
  ['audio/x-flac', 'flac'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/vnd.wave', 'wav'],
  ['audio/webm', 'webm'],
]);

// Browsers — especially mobile ones — often send an empty or generic MIME
// type for .m4a / .mp3 files. Fall back to the extension so a valid song is
// never rejected just because the OS reported a weird content type.
const AUDIO_EXT = new Map([
  ['mp3', 'mp3'],
  ['m4a', 'm4a'],
  ['aac', 'm4a'],
  ['ogg', 'ogg'],
  ['oga', 'ogg'],
  ['opus', 'ogg'],
  ['flac', 'flac'],
  ['wav', 'wav'],
  ['webm', 'webm'],
]);

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
// A 4–5 minute high-bitrate song or a WAV can exceed 12 MB. Keep the cap
// under the Supabase free-tier 50 MB upload limit but generous for music.
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

function friendlyStorageError(error) {
  const raw = String(error?.message || '');
  if (!raw) return 'Gagal menyimpan berkas. Coba lagi.';
  if (/bucket not found|nosuchbucket/i.test(raw)) {
    return 'Penyimpanan foto belum tersedia. Pastikan bucket wedding-photos-2 sudah dibuat di Supabase dengan Public ON, lalu jalankan database/0005_wedding_photos_2.sql.';
  }
  if (/mime|content.?type|not allowed|unsupported|invalid.*type|415/i.test(raw)) {
    return 'Jenis berkas ini tidak diizinkan. Gunakan MP3, M4A, AAC, OGG, WAV, atau FLAC untuk musik.';
  }
  if (/too large|size limit|payload|413/i.test(raw)) {
    return 'Ukuran berkas terlalu besar. Kecilkan berkas lalu coba lagi.';
  }
  if (/row-level security|security policy|not authorized|must be owner/i.test(raw)) {
    return 'Sesi Anda ditolak saat menyimpan berkas. Masuk kembali.';
  }
  // Surface a trimmed reason so a failed upload is diagnosable instead of a
  // silent generic message. Never contains credentials — only storage errors.
  return `Gagal menyimpan berkas: ${raw.slice(0, 160)}`;
}

function slotKind(slot) {
  return slot === 'video' ? 'video' : slot === 'music' ? 'audio' : 'image';
}

function slotMimeMap(kind) {
  return kind === 'video' ? VIDEO_MIME : kind === 'audio' ? AUDIO_MIME : IMAGE_MIME;
}

function slotMaxBytes(kind) {
  return kind === 'video'
    ? MAX_VIDEO_BYTES
    : kind === 'audio'
      ? MAX_AUDIO_BYTES
      : MAX_IMAGE_BYTES;
}

function unsupportedTypeError(kind) {
  return kind === 'video'
    ? 'Gunakan MP4, WebM, atau MOV.'
    : kind === 'audio'
      ? 'Gunakan MP3, M4A, AAC, OGG, WAV, atau FLAC.'
      : 'Gunakan JPEG, PNG, WebP, atau AVIF.';
}

function tooLargeError(kind) {
  return kind === 'video'
    ? 'Video lebih besar dari 40 MB.'
    : kind === 'audio'
      ? 'Berkas musik lebih besar dari 30 MB.'
      : 'Gambar lebih besar dari 8 MB.';
}

/** Apply an uploaded file's public URL to the invitation content. */
function contentWithAsset(existing, slot, kind, url) {
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

  if (kind === 'video') {
    content.video = {
      ...(content.video && typeof content.video === 'object' ? content.video : {}),
      src: url,
    };
  } else if (kind === 'audio') {
    content.music = {
      ...(content.music && typeof content.music === 'object' ? content.music : {}),
      url,
    };
  } else if (slot === 'cover' || slot === 'man' || slot === 'woman' || slot === 'hero') {
    nextPhotos[slot] = url;
  } else if (slot.startsWith('story')) {
    nextPhotos.story[Number(slot.slice(5))] = url;
  } else if (slot.startsWith('album')) {
    nextPhotos.album[Number(slot.slice(5))] = url;
  }

  if (kind === 'image') content.photos = nextPhotos;
  return content;
}

/** Verify the caller owns the invitation and return its current content. */
async function readOwnedWedding(supabase, id, slot) {
  const { data, error } = await supabase
    .from('weddings')
    .select('content, status')
    .eq('id', id)
    .maybeSingle();
  if (error) return { error: { ok: false, slot, error: friendlyStorageError(error) } };
  if (!data) return { error: { ok: false, slot, error: 'Undangan tidak ditemukan.' } };
  if (data.status === 'published') {
    return { error: { ok: false, slot, error: 'Undangan yang sudah diterbitkan tidak dapat diubah.' } };
  }
  return { data };
}

/** Save the updated content and revalidate the studio/preview routes. */
async function persistAsset(supabase, id, content, slot, url) {
  const { error } = await supabase.from('weddings').update({ content }).eq('id', id);
  if (error) return { ok: false, slot, error: friendlyStorageError(error) };

  revalidatePath('/dashboard');
  revalidatePath(`/build/${id}`);
  revalidatePath(`/preview/${id}`);
  return { ok: true, slot, url };
}

/**
 * Upload one media asset (image, the invitation video, or the invitation
 * music file) for a draft invitation.
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

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Undangan tidak ditemukan.' };
  if (!ALL_SLOTS.has(slot)) {
    return { ok: false, slot, error: 'Slot unggahan tidak dikenal.' };
  }

  const file = formData.get('file');
  if (!file || typeof file !== 'object' || typeof file.name !== 'string') {
    return { ok: false, slot, error: 'Pilih berkas terlebih dahulu.' };
  }

  const kind = slotKind(slot);
  const ext =
    slotMimeMap(kind).get(file.type) ||
    (kind === 'audio' ? AUDIO_EXT.get(extensionOf(file.name)) : '');
  if (!ext) return { ok: false, slot, error: unsupportedTypeError(kind) };

  if (typeof file.size === 'number' && file.size > slotMaxBytes(kind)) {
    return { ok: false, slot, error: tooLargeError(kind) };
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Sesi habis. Masuk kembali.' };

  // RLS: reading the row proves ownership; "not yours" looks identical to
  // "does not exist".
  const { data: existing, error: ownershipError } = await readOwnedWedding(supabase, id, slot);
  if (ownershipError) return ownershipError;

  const cleanExt = ext.replace(/[^a-z0-9]/g, '');
  const stamp = Date.now().toString(36);
  const path = `${claims.sub}/${id}/${slot}-${stamp}.${cleanExt}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return { ok: false, slot, error: friendlyStorageError(uploadError) };

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = publicData && publicData.publicUrl ? cleanUrl(publicData.publicUrl) : '';
  if (!url) return { ok: false, slot, error: 'Berkas tersimpan, tetapi tautannya gagal dibuat.' };

  return persistAsset(supabase, id, contentWithAsset(existing, slot, kind, url), slot, url);
}

/**
 * Issue a short-lived signed upload URL so the browser can send the file
 * straight to Supabase Storage. Server Actions on Vercel cap request bodies at
 * 4.5 MB, which is far below a normal song — passing the bytes through this
 * action is what made music uploads fail with a generic page error.
 *
 * Only small strings cross the action boundary here; the file never does.
 */
export async function prepareAssetUpload(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  const slot = cleanLine(formData.get('slot'), 12);

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Undangan tidak ditemukan.' };
  if (!ALL_SLOTS.has(slot)) {
    return { ok: false, slot, error: 'Slot unggahan tidak dikenal.' };
  }

  const kind = slotKind(slot);
  const fileName = cleanLine(formData.get('fileName'), 200);
  const fileType = cleanLine(formData.get('fileType'), 100);
  const ext =
    slotMimeMap(kind).get(fileType) ||
    (kind === 'audio' ? AUDIO_EXT.get(extensionOf(fileName)) : '');
  if (!ext) return { ok: false, slot, error: unsupportedTypeError(kind) };

  const fileSize = Number(formData.get('fileSize'));
  if (Number.isFinite(fileSize) && fileSize > slotMaxBytes(kind)) {
    return { ok: false, slot, error: tooLargeError(kind) };
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Sesi habis. Masuk kembali.' };

  const { data: existing, error: ownershipError } = await readOwnedWedding(supabase, id, slot);
  if (ownershipError) return ownershipError;

  const path = `${claims.sub}/${id}/${slot}-${Date.now().toString(36)}.${ext.replace(/[^a-z0-9]/g, '')}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false, slot, error: friendlyStorageError(error) };

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = publicData && publicData.publicUrl ? cleanUrl(publicData.publicUrl) : '';
  if (!url || !data?.signedUrl) {
    return { ok: false, slot, error: 'Berkas tersimpan, tetapi tautannya gagal dibuat.' };
  }

  return { ok: true, slot, signedUrl: data.signedUrl, url };
}

/**
 * Record the public URL after a direct-to-Storage upload. The file has already
 * been validated by `prepareAssetUpload`; ownership is checked again here.
 */
export async function saveAssetUrl(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  const slot = cleanLine(formData.get('slot'), 12);
  const url = cleanUrl(formData.get('url'));

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Undangan tidak ditemukan.' };
  if (!ALL_SLOTS.has(slot)) {
    return { ok: false, slot, error: 'Slot unggahan tidak dikenal.' };
  }
  if (!url) return { ok: false, slot, error: 'Tautan berkas tidak valid.' };

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Sesi habis. Masuk kembali.' };

  const { data: existing, error: ownershipError } = await readOwnedWedding(supabase, id, slot);
  if (ownershipError) return ownershipError;

  const content = contentWithAsset(existing, slot, slotKind(slot), url);
  return persistAsset(supabase, id, content, slot, url);
}

/**
 * Remove a previously uploaded asset, both the marker in content and the
 * file in storage (best effort — a failed delete still unlinks the URL).
 */
export async function removeAsset(prevState, formData) {
  const id = cleanLine(formData.get('id'), 40);
  const slot = cleanLine(formData.get('slot'), 12);

  if (!UUID_RE.test(id)) return { ok: false, slot, error: 'Undangan tidak ditemukan.' };
  if (!ALL_SLOTS.has(slot)) {
    return { ok: false, slot, error: 'Slot unggahan tidak dikenal.' };
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) return { ok: false, slot, error: 'Sesi habis. Masuk kembali.' };

  const { data: existing, error: readError } = await supabase
    .from('weddings')
    .select('content, status')
    .eq('id', id)
    .maybeSingle();

  if (readError) return { ok: false, slot, error: friendlyStorageError(readError) };
  if (!existing) return { ok: false, slot, error: 'Undangan tidak ditemukan.' };
  if (existing.status === 'published') {
    return { ok: false, slot, error: 'Undangan yang sudah diterbitkan tidak dapat diubah.' };
  }

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
  } else if (slot === 'music') {
    removed = (content.music && content.music.url) || '';
    content.music = { ...(content.music && typeof content.music === 'object' ? content.music : {}), url: '' };
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

  if (slot !== 'video' && slot !== 'music') content.photos = nextPhotos;

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
