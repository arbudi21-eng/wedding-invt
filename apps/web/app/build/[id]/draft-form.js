'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { saveDraft } from '@/app/actions/weddings';
import { uploadAsset } from '@/app/actions/photos';
import { DESIGNS } from '@/lib/designs';
import { splitDateISO } from '@/lib/draft';
import AssetUpload from '@/components/AssetUpload';

function FieldError({ message }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}

function savedTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  // Deterministic in Node (SSR) and the browser — no locale, no separator ambiguity.
  return `${day}/${month} ${hours}:${minutes}`;
}

// Keys that live in the visible form (kept for FormData-submit + preview).
const FORM_KEYS = [
  'bride',
  'groom',
  'date',
  'time',
  'locale',
  'venueName',
  'venueAddress',
  'venueMaps',
  'ceremony',
  'reception',
  'host',
  'videoLink',
  'musicUrl',
  'gift1Bank',
  'gift1Name',
  'gift1No',
  'gift2Bank',
  'gift2Name',
  'gift2No',
  'gift3Bank',
  'gift3Name',
  'gift3No',
];

// Keys that are edited inline in the preview; carried as hidden fields.
const EDITED_KEYS = [
  'heroHId',
  'heroHPId',
  'introHId',
  'introPId',
  'manPId',
  'manFId',
  'womanPId',
  'womanFId',
  'dressId',
  'giftMessageId',
  'storyId',
  'capsId',
];

const VIDEO_LINK_PLACEHOLDER = 'https://www.youtube.com/watch?v=…';

const editedFromContent = (c) => ({
  heroHId: c.text.hero.id.h,
  heroHPId: c.text.hero.id.hp,
  introHId: c.text.intro.id.h,
  introPId: c.text.intro.id.p,
  manPId: c.couple.man.id.p,
  manFId: c.couple.man.id.parents,
  womanPId: c.couple.woman.id.p,
  womanFId: c.couple.woman.id.parents,
  dressId: c.dress.id,
  giftMessageId: c.text.giftMessage.id,
  storyId: c.story.id.join('\n'),
  capsId: c.captions.id.join('\n'),
});

const formValuesFromContent = (c) => {
  const { date, time } = splitDateISO(c.dateISO);
  const values = {
    bride: c.names[0] || '',
    groom: c.names[1] || '',
    date: date || '',
    time: time || '',
    locale: c.locale || 'id',
    venueName: c.venue.name,
    venueAddress: c.venue.address,
    venueMaps: c.venue.mapsUrl,
    ceremony: c.schedule.ceremony,
    reception: c.schedule.reception,
    host: c.host,
    videoLink: c.video.link,
    musicUrl: c.music?.url || '',
  };
  (c.gifts || []).slice(0, 3).forEach((gift, index) => {
    values[`gift${index + 1}Bank`] = gift.bank;
    values[`gift${index + 1}Name`] = gift.name;
    values[`gift${index + 1}No`] = gift.no;
  });
  return values;
};

function buildPreviewUrl(formValues, edited, designId, photos, videoSrc) {
  const params = new URLSearchParams();
  const set = (key, value) => {
    const s = String(value ?? '').trim();
    if (s) params.set(key, s);
  };
  for (const key of FORM_KEYS) set(key, formValues[key]);
  for (const key of EDITED_KEYS) set(key, edited[key]);
  if (designId) params.set('design', designId);

  if (photos.cover) params.set('cover', photos.cover);
  if (photos.man) params.set('man', photos.man);
  if (photos.woman) params.set('woman', photos.woman);
  if (photos.hero) params.set('hero', photos.hero);
  const story = (photos.story || []).filter(Boolean);
  const album = (photos.album || []).filter(Boolean);
  if (story.length) params.set('storyPhotos', story.join('|'));
  if (album.length) params.set('albumPhotos', album.join('|'));
  if (videoSrc) params.set('videoSrc', videoSrc);

  // edit=1 turns on the contenteditable wiring injected by the preview route.
  params.set('edit', '1');
  return `/preview/new?${params.toString()}`;
}

export default function DraftForm({ wedding, content }) {
  const [state, formAction, pending] = useActionState(saveDraft, { errors: {} });
  const errors = state?.errors || {};
  const { date, time } = splitDateISO(content.dateISO);
  const saved = savedTime(state?.savedAt || wedding.updated_at);

  const router = useRouter();
  const formRef = useRef(null);
  const frameRef = useRef(null);
  const timerRef = useRef(null);
  const intentRef = useRef('save');
  const editedRef = useRef(editedFromContent(content));
  const [, startUploadTransition] = useTransition();

  // Photo picked directly inside the preview template.
  const uploadFromTemplate = (slot, file) => {
    if (!file) return;
    startUploadTransition(async () => {
      const postBack = (ok, error) => {
        frameRef.current?.contentWindow?.postMessage(
          { type: 'wed:upload-result', ok, slot, error: error || '' },
          '*'
        );
      };
      try {
        const fd = new FormData();
        fd.set('id', wedding.id);
        fd.set('slot', slot);
        fd.set('file', file);
        const result = await uploadAsset(null, fd);
        if (result && result.ok) setUpload(slot, result.url || '');
        postBack(Boolean(result && result.ok), result?.error || '');
      } catch (err) {
        postBack(false, err instanceof Error ? err.message : String(err));
      }
    });
  };

  const [coverOpen, setCoverOpen] = useState(true);
  const [photos, setPhotos] = useState(() => ({
    cover: content.photos.cover || '',
    man: content.photos.man || '',
    woman: content.photos.woman || '',
    hero: content.photos.hero || '',
    story: Array.isArray(content.photos.story) ? content.photos.story : [],
    album: Array.isArray(content.photos.album) ? content.photos.album : [],
  }));
  const [videoSrc, setVideoSrc] = useState(content.video.src || '');
  const [musicUrl, setMusicUrl] = useState(content.music?.url || '');
  const photosRef = useRef(photos);
  const videoSrcRef = useRef(videoSrc);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    videoSrcRef.current = videoSrc;
  }, [videoSrc]);

  // Text typed inside the preview lands here through postMessage.
  const [edited, setEdited] = useState(() => editedFromContent(content));
  useEffect(() => {
    editedRef.current = edited;
  }, [edited]);

  useEffect(() => {
    const onMessage = (event) => {
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return;
      const m = event.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'wed:text' && typeof m.field === 'string' && EDITED_KEYS.includes(m.field)) {
        setEdited((prev) => ({ ...prev, [m.field]: String(m.value ?? '') }));
      } else if (m.type === 'wed:list-item' && typeof m.field === 'string' && EDITED_KEYS.includes(m.field)) {
        setEdited((prev) => {
          const lines = String(prev[m.field] ?? '').split('\n');
          const index = Number(m.index) || 0;
          lines[index] = String(m.value ?? '');
          return { ...prev, [m.field]: lines.slice(0, 20).join('\n') };
        });
      } else if (m.type === 'wed:pick' && typeof m.slot === 'string') {
        uploadFromTemplate(m.slot, m.file);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (intentRef.current === 'continue' && state?.savedAt && !state?.error) {
      router.push(`/manage/${wedding.slug}`);
    }
  }, [state?.savedAt, state?.error, router, wedding.slug]);

  const formValuesFrom = (form) => {
    const fd = new FormData(form);
    const values = {};
    for (const key of FORM_KEYS) {
      const value = String(fd.get(key) ?? '').trim();
      if (value) values[key] = value;
    }
    return values;
  };

  const refreshPreview = () => {
    if (!formRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const fd = new FormData(formRef.current);
      const designId = fd.get('design') ? String(fd.get('design')) : wedding.design;
      setPreviewUrl(
        buildPreviewUrl(formValuesFrom(formRef.current), editedRef.current, designId, photosRef.current, videoSrcRef.current)
      );
    }, 450);
  };

  const currentFullUrl = () => {
    if (!formRef.current) return previewUrl;
    const fd = new FormData(formRef.current);
    const designId = fd.get('design') ? String(fd.get('design')) : wedding.design;
    return buildPreviewUrl(formValuesFrom(formRef.current), editedRef.current, designId, photosRef.current, videoSrcRef.current);
  };

  const [previewUrl, setPreviewUrl] = useState(() =>
    buildPreviewUrl(
      formValuesFromContent(content),
      editedFromContent(content),
      wedding.design,
      {
        cover: content.photos.cover || '',
        man: content.photos.man || '',
        woman: content.photos.woman || '',
        hero: content.photos.hero || '',
        story: content.photos.story,
        album: content.photos.album,
      },
      content.video.src || ''
    )
  );

  const setUpload = (slot, url) => {
    if (slot === 'video') {
      setVideoSrc(url);
    } else if (slot === 'music') {
      setMusicUrl(url);
      // Keep the visible text field (the single source of truth for the URL)
      // in sync with an uploaded file, then rebuild the preview.
      const input = formRef.current?.elements?.namedItem('musicUrl');
      if (input) input.value = url;
      refreshPreview();
    } else {
      setPhotos((prev) => {
        const next = { ...prev, story: [...prev.story], album: [...prev.album] };
        if (slot === 'cover') next.cover = url;
        else if (slot === 'man') next.man = url;
        else if (slot === 'woman') next.woman = url;
        else if (slot === 'hero') next.hero = url;
        else if (slot.startsWith('story')) next.story[Number(slot.slice(5))] = url;
        else if (slot.startsWith('album')) next.album[Number(slot.slice(5))] = url;
        return next;
      });
    }
    // Apply instantly inside the iframe — no page reload at all.
    frameRef.current?.contentWindow?.postMessage({ type: 'wed:photo-apply', slot, url }, '*');
  };

  const storySlots = [0, 1, 2, 3, 4];
  const albumSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const gifts = content.gifts;

  return (
    <div className="build-grid">
      <form
        id="draft-form"
        ref={formRef}
        action={formAction}
        className="stack"
        onChange={refreshPreview}
      >
        <input type="hidden" name="id" value={wedding.id} />
        {/* Inline-edited text travels as hidden fields, refreshed from the preview. */}
        {Object.entries(edited).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {state?.error ? (
          <p className="alert error" role="alert">
            {state.error}
          </p>
        ) : null}

        {state?.savedAt ? (
          <p className="alert ok" role="status">
            Tersimpan. Anda bisa menutup halaman ini — draf sudah tersimpan di akun Anda.
          </p>
        ) : null}

        <section className="card">
          <div className="section-title">
            <h2>Mempelai</h2>
            <span>Nama mempelai wajib diisi</span>
          </div>

          <div className="stack">
            <div className="row">
              <div className="field">
                <label htmlFor="bride">Mempelai wanita</label>
                <input
                  id="bride"
                  name="bride"
                  defaultValue={content.names[0]}
                  maxLength={60}
                  required
                  aria-invalid={errors.bride ? 'true' : undefined}
                />
                <FieldError message={errors.bride} />
              </div>

              <div className="field">
                <label htmlFor="groom">Mempelai pria</label>
                <input
                  id="groom"
                  name="groom"
                  defaultValue={content.names[1]}
                  maxLength={60}
                  required
                  aria-invalid={errors.groom ? 'true' : undefined}
                />
                <FieldError message={errors.groom} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="date">Tanggal pernikahan</label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={date}
                  aria-invalid={errors.date ? 'true' : undefined}
                />
                <span className="hint">Boleh diisi belakangan.</span>
                <FieldError message={errors.date} />
              </div>

              <div className="field">
                <label htmlFor="time">Jam mulai</label>
                <input id="time" name="time" type="time" defaultValue={time} />
              </div>
            </div>

            <input type="hidden" name="locale" value="id" />
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Hari Acara</h2>
            <span>Tempat dan waktu</span>
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="venue-name">Nama tempat</label>
              <input
                id="venue-name"
                name="venueName"
                defaultValue={content.venue.name}
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="venue-address">Alamat tempat</label>
              <textarea
                id="venue-address"
                name="venueAddress"
                defaultValue={content.venue.address}
                maxLength={240}
                rows={2}
              />
            </div>

            <div className="field">
              <label htmlFor="venue-maps">Tautan Google Maps</label>
              <input
                id="venue-maps"
                name="venueMaps"
                type="url"
                defaultValue={content.venue.mapsUrl}
                placeholder="https://maps.google.com/…"
              />
              <span className="hint">Kosongkan untuk mencari dengan nama tempat saja.</span>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="ceremony">Akad</label>
                <input
                  id="ceremony"
                  name="ceremony"
                  type="time"
                  defaultValue={content.schedule.ceremony}
                />
              </div>

              <div className="field">
                <label htmlFor="reception">Resepsi</label>
                <input
                  id="reception"
                  name="reception"
                  type="time"
                  defaultValue={content.schedule.reception}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Foto-foto</h2>
            <span>Unggah langsung ke undangan</span>
          </div>

          <div className="upload-grid">
            <AssetUpload weddingId={wedding.id} slot="cover" label="Foto sampul" currentUrl={photos.cover} onUploaded={setUpload} />
            <AssetUpload weddingId={wedding.id} slot="man" label="Potret mempelai pria" currentUrl={photos.man} onUploaded={setUpload} />
            <AssetUpload weddingId={wedding.id} slot="woman" label="Potret mempelai wanita" currentUrl={photos.woman} onUploaded={setUpload} />
            {storySlots.map((index) => (
              <AssetUpload
                key={`story-${index}`}
                weddingId={wedding.id}
                slot={`story${index}`}
                label={`Foto momen ${index + 1}`}
                currentUrl={photos.story[index] || ''}
                onUploaded={setUpload}
              />
            ))}
            {albumSlots.map((index) => (
              <AssetUpload
                key={`album-${index}`}
                weddingId={wedding.id}
                slot={`album${index}`}
                label={`Foto galeri ${index + 1}`}
                currentUrl={photos.album[index] || ''}
                onUploaded={setUpload}
              />
            ))}
          </div>
          <p className="inline-note" style={{ marginBottom: 0 }}>
            Klik <strong>Ganti foto</strong> langsung di pratinjau besar untuk mengganti foto —
            atau unggah lewat tombol di sini. Tersimpan otomatis ke pratinjau; klik tombol simpan
            agar ikut saat diterbitkan.
          </p>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Film</h2>
            <span>Video kecil diputar langsung; tautan terbuka di halaman video</span>
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="video-link">Tautan video (YouTube, Drive…)</label>
              <input
                id="video-link"
                name="videoLink"
                type="url"
                defaultValue={content.video.link}
                placeholder={VIDEO_LINK_PLACEHOLDER}
              />
            </div>
            <AssetUpload
              weddingId={wedding.id}
              slot="video"
              label="Berkas video (opsional, diputar inline)"
              kind="video"
              currentUrl={videoSrc}
              onUploaded={setUpload}
            />
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Musik</h2>
            <span>Lagu latar yang diputar saat tamu membuka undangan</span>
          </div>

          <div className="stack">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="music-url">URL musik (MP3 langsung / YouTube)</label>
              <input
                id="music-url"
                name="musicUrl"
                type="url"
                defaultValue={musicUrl}
                placeholder="https://…/lagu.mp3 atau https://music.youtube.com/watch?v=…"
              />
              <p className="hint" style={{ marginTop: '0.35rem' }}>
                Tempel link berkas .mp3 langsung, atau link video YouTube / YouTube Music — keduanya
                diputar sebagai musik undangan. Kosongkan semuanya untuk tanpa musik.
              </p>
            </div>
            <AssetUpload
              weddingId={wedding.id}
              slot="music"
              label="Atau unggah berkas musik (MP3, M4A, OGG, WAV)"
              kind="audio"
              currentUrl={musicUrl}
              onUploaded={setUpload}
            />
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Hadiah</h2>
            <span>Rekening yang tampil di bagian hadiah</span>
          </div>

          <div className="stack">
            {[1, 2, 3].map((n) => (
              <div className="row gift-row" key={n}>
                <div className="field">
                  <label htmlFor={`gift-${n}-bank`}>Bank {n}</label>
                  <input
                    id={`gift-${n}-bank`}
                    name={`gift${n}Bank`}
                    defaultValue={gifts[n - 1]?.bank || ''}
                    maxLength={60}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`gift-${n}-name`}>Nama rekening</label>
                  <input
                    id={`gift-${n}-name`}
                    name={`gift${n}Name`}
                    defaultValue={gifts[n - 1]?.name || ''}
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`gift-${n}-no`}>Nomor rekening</label>
                  <input
                    id={`gift-${n}-no`}
                    name={`gift${n}No`}
                    defaultValue={gifts[n - 1]?.no || ''}
                    maxLength={40}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Desain</h2>
            <span>Ganti tampilan tanpa mengubah tulisan Anda</span>
          </div>

          <div className="field">
            <label htmlFor="design">Tema</label>
            <select id="design" name="design" defaultValue={wedding.design}>
              {DESIGNS.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Tulisan undangan</h2>
            <span>Edit langsung di pratinjau</span>
          </div>
          <p className="inline-note" style={{ margin: 0 }}>
            Klik teks undangan di pratinjau di sebelah kanan — judul, sambutan, mempelai, kisah,
            busana dan catatan hadiah — lalu ketik langsung di atasnya. Perubahan hanya tersimpan
            saat Anda menekan{' '}
            <strong>Simpan draf</strong> atau <strong>Simpan &amp; lanjut →</strong>.
          </p>
        </section>

        <input type="hidden" name="host" value={content.host} />

        <div className="form-footer">
          <button
            className="button"
            type="submit"
            disabled={pending}
            onClick={() => {
              intentRef.current = 'continue';
            }}
          >
            {pending ? 'Menyimpan…' : 'Simpan & lanjut →'}
          </button>
          <span className="inline-note" style={{ margin: 0 }}>
            Lanjut: tinjau, publikasikan, dan bagikan undangan Anda
          </span>
        </div>
      </form>

      <aside className="build-side">
        <div className="card live-preview">
          <div className="section-title" style={{ marginBottom: '0.6rem' }}>
            <h2>Pratinjau langsung</h2>
            <span className="preview-link-group">
              <button
                type="button"
                className="preview-link"
                onClick={() => {
                  const frameWindow = frameRef.current?.contentWindow;
                  frameWindow?.postMessage({ type: 'wed:toggle-cover' }, '*');
                  setCoverOpen((value) => !value);
                }}
              >
                {coverOpen ? 'Tutup sampul' : 'Buka sampul'}
              </button>
              <button type="button" className="preview-link" onClick={() => window.open(currentFullUrl(), '_blank', 'noopener')}>
                Buka penuh ↗
              </button>
            </span>
          </div>
          <div className="live-frame">
            <iframe
              ref={frameRef}
              key={previewUrl}
              src={previewUrl}
              title="Pratinjau undangan langsung"
              tabIndex={-1}
            />
          </div>
          <p className="inline-note" style={{ margin: '0.6rem 0 0' }}>
            Teks di sini bisa diklik dan diketik langsung. Tersimpan saat Anda menekan simpan.
          </p>
        </div>

        <div className="card">
          <div className="draft-meta" style={{ marginBottom: '0.65rem' }}>
            <span className={`badge ${wedding.status}`}>{wedding.status}</span>
            {saved ? <span>Tersimpan {saved}</span> : null}
          </div>
          <p className="small muted" style={{ marginBottom: '0.35rem' }}>
            Tautan undangan
          </p>
          <code className="slug" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
            {wedding.slug}
          </code>
          <p className="inline-note" style={{ margin: 0 }}>
            {wedding.status === 'draft'
              ? 'Masih privat. Tautan menjadi aktif saat Anda menerbitkan.'
              : 'Sudah diterbitkan. Setiap suntingan akan ikut saat diterbitkan ulang.'}
          </p>
        </div>

        <div className="card">
          <button
            className="button"
            type="submit"
            form="draft-form"
            disabled={pending}
            onClick={() => {
              intentRef.current = 'continue';
            }}
          >
            {pending ? 'Menyimpan…' : 'Simpan & lanjut →'}
          </button>
          <button
            className="button secondary"
            type="submit"
            form="draft-form"
            disabled={pending}
            style={{ marginTop: '0.6rem' }}
            onClick={() => {
              intentRef.current = 'save';
            }}
          >
            Simpan draf
          </button>
          <p className="inline-note" style={{ margin: '0.75rem 0 0' }}>
            Lanjut: pratinjau, publikasi, dan bagikan undangan Anda.
          </p>
          <p className="inline-note" style={{ margin: '0.35rem 0 0' }}>
            <Link href="/dashboard">← Kembali ke semua undangan</Link>
          </p>
        </div>
      </aside>
    </div>
  );
}
