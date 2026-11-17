// Client-side image compression.
//
// Photos straight from a phone are often 6–15 MB; the upload action caps at
// 8 MB. Instead of rejecting the user's photo we shrink it here: cap the
// longest edge, then re-encode as WebP/JPEG with decreasing quality until the
// file is under the target ceiling. GIFs pass through untouched (re-encoding
// would destroy the animation).

export async function compressImage(file, { maxDim = 2560, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (file.size <= maxBytes) return file;

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const prefersAlpha = /png|webp/i.test(file.type);
    const type = prefersAlpha ? 'image/webp' : 'image/jpeg';
    const quality = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

    for (const q of quality) {
      // eslint-disable-next-line no-await-in-loop
      const blob = await canvasToBlob(canvas, type, q);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], renamed(file.name, type), { type, lastModified: Date.now() });
      }
    }

    // Last resort: smallest quality even if slightly over the target —
    // still better than rejecting the user's photo outright.
    const blob = await canvasToBlob(canvas, type, 0.25);
    if (blob) {
      return new File([blob], renamed(file.name, type), { type, lastModified: Date.now() });
    }
    return file;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name, type) {
  const base = String(name || 'photo').replace(/\.[^.]+$/, '');
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  return `${base}.${ext}`;
}
