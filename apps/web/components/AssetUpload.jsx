'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadAsset, removeAsset } from '@/app/actions/photos';
import { compressImage } from '@/lib/image';

export default function AssetUpload({
  weddingId,
  slot,
  label,
  kind = 'image',
  currentUrl,
  onUploaded,
}) {
  const [picked, setPicked] = useState(null);
  const [localPreview, setLocalPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, startTransition] = useTransition();
  const fileRef = useRef(null);

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    setError('');
    if (!file) {
      setPicked(null);
      setLocalPreview('');
      return;
    }
    setPicked(file);
    setLocalPreview(kind === 'image' ? URL.createObjectURL(file) : '');
  };

  const upload = () => {
    if (!picked) return;
    setError('');

    const maxBytes =
      kind === 'video'
        ? 40 * 1024 * 1024
        : kind === 'audio'
          ? 30 * 1024 * 1024
          : 8 * 1024 * 1024;
    if (picked.size > maxBytes) {
      setError(
        kind === 'video'
          ? 'Video lebih besar dari 40 MB.'
          : kind === 'audio'
            ? 'Berkas musik lebih besar dari 30 MB.'
            : 'Gambar lebih besar dari 8 MB.'
      );
      return;
    }

    startTransition(async () => {
      // Shrink phone photos (often > 8 MB) to fit under the upload cap.
      // Audio and video pass through untouched.
      const file = await compressImage(picked);

      const fd = new FormData();
      fd.set('id', weddingId);
      fd.set('slot', slot);
      fd.set('file', file);
      const result = await uploadAsset(null, fd);
      if (!result || !result.ok) {
        setError((result && result.error) || 'Gagal mengunggah. Coba lagi.');
        return;
      }
      setPicked(null);
      setLocalPreview('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(slot, result.url || '');
    });
  };

  const remove = () => {
    setError('');
    startTransition(async () => {
      const fd = new FormData();
      fd.set('id', weddingId);
      fd.set('slot', slot);
      const result = await removeAsset(null, fd);
      if (!result || !result.ok) {
        setError((result && result.error) || 'Gagal menghapus berkas. Coba lagi.');
        return;
      }
      onUploaded(slot, '');
    });
  };

  const previewSrc = localPreview || currentUrl || '';

  return (
    <div className="asset-upload">
      <div className="asset-upload-info">
        <span className="asset-upload-label">{label}</span>
        {previewSrc ? (
          kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="asset-upload-thumb" src={previewSrc} alt="" />
          ) : (
            <span className="inline-note" style={{ margin: 0 }}>
              {kind === 'audio' ? 'Musik tersimpan ✓' : 'Video tersimpan ✓'}
            </span>
          )
        ) : (
          <span className="inline-note" style={{ margin: 0, opacity: 0.65 }}>
            Belum ada yang diunggah
          </span>
        )}
      </div>

      <div className="asset-upload-actions">
        <label className="asset-pick">
          <input
            ref={fileRef}
            className="asset-file"
            type="file"
            accept={
              kind === 'image'
                ? 'image/*'
                : kind === 'audio'
                  ? 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.wav,.webm'
                  : 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
            }
            onChange={onFileChange}
          />
          {picked
            ? picked.name.slice(0, 40)
            : kind === 'image'
              ? 'Pilih foto…'
              : kind === 'audio'
                ? 'Pilih berkas musik…'
                : 'Pilih video…'}
        </label>
        <button
          className="button small secondary"
          type="button"
          onClick={upload}
          disabled={busy || !picked}
        >
          {busy ? 'Memproses…' : 'Unggah'}
        </button>
      </div>

      {error ? <p className="field-error" style={{ margin: 0 }}>{error}</p> : null}

      {currentUrl ? (
        <button className="link-button asset-remove" type="button" onClick={remove} disabled={busy}>
          {busy ? 'Menghapus…' : 'Hapus'}
        </button>
      ) : null}
    </div>
  );
}
