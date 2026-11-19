'use client';

import { useActionState, useState } from 'react';
import { createGuest, setGuestSent, deleteGuest } from '@/app/actions/guests';

function buildShareUrl(siteUrl, slug, code, name, couple, lang, phone) {
  const link = `${siteUrl}/${slug}?c=${code}`;
  const text =
    lang === 'en'
      ? `Hi ${name}, you're invited to ${couple}'s wedding! Open your invitation here: ${link}`
      : `Halo ${name}, Anda diundang ke pernikahan ${couple}! Buka undangan Anda di sini: ${link}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export default function GuestList({ weddingId, weddingSlug, siteUrl, weddingTitle, guests }) {
  const [state, formAction, creating] = useActionState(createGuest, { ok: false });
  const [done, setDone] = useState({});

  return (
    <>
      {/* Add form */}
      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-title">
          <h2>Tambah tamu</h2>
          <span>nama, nomor WA, bahasa</span>
        </div>

        {state?.error ? (
          <p className="alert error" role="alert">
            {state.error}
          </p>
        ) : null}

        <form action={formAction} className="row" style={{ alignItems: 'end' }} key={state?.ok ? 'ok-' + (state.id || '') : 'new'}>
          <input type="hidden" name="weddingId" value={weddingId} />
          <div className="field" style={{ flex: '1.2' }}>
            <label htmlFor="guest-name">Nama tamu</label>
            <input id="guest-name" name="name" type="text" required placeholder="Budi Santoso" aria-invalid={state?.error ? 'true' : undefined} />
          </div>
          <div className="field" style={{ flex: '1.4' }}>
            <label htmlFor="guest-phone">No. WhatsApp</label>
            <input id="guest-phone" name="phone" type="tel" required placeholder="62812..." aria-invalid={state?.error ? 'true' : undefined} />
          </div>
          <div className="field" style={{ flex: '0.6' }}>
            <label htmlFor="guest-lang">Bahasa</label>
            <select id="guest-lang" name="lang" defaultValue="id">
              <option value="id">Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="field">
            <button className="button" type="submit" disabled={creating}>
              {creating ? 'Menambah…' : 'Tambah'}
            </button>
          </div>
        </form>
      </section>

      {/* Guest list */}
      <section className="card">
        <div className="section-title">
          <h2>Daftar tamu</h2>
          <span>{guests.length} tamu</span>
        </div>

        {guests.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Belum ada tamu. Tambahkan nama dan nomornya di atas.
          </p>
        ) : (
          <div className="guest-table-wrapper">
            <table className="guest-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>WhatsApp</th>
                  <th>Kode</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => {
                  const shareUrl = buildShareUrl(siteUrl, weddingSlug, guest.code, guest.name, weddingTitle, guest.lang, guest.phone);
                  const sent = guest.sent_status === 'sent';
                  return (
                    <tr key={guest.id}>
                      <td>
                        <strong>{guest.name}</strong>
                        {guest.opened_at ? <small className="muted" style={{ display: 'block' }}>Sudah dibuka</small> : null}
                      </td>
                      <td>{guest.phone}</td>
                      <td><code className="slug">{guest.code}</code></td>
                      <td>{sent ? <span className="badge published">Terkirim</span> : <span className="badge draft">Belum</span>}</td>
                      <td>
                        <div className="guest-actions" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                          <a className="button small" href={shareUrl} target="_blank" rel="noreferrer noopener">
                            Kirim WA
                          </a>
                          <form action={setGuestSent} style={{ display: 'inline' }}>
                            <input type="hidden" name="id" value={guest.id} />
                            <input type="hidden" name="sent" value={sent ? '0' : '1'} />
                            <button className="button small secondary" type="submit">
                              {sent ? 'Belum' : 'Terkirim'}
                            </button>
                          </form>
                          <form
                            action={deleteGuest}
                            style={{ display: 'inline' }}
                            onSubmit={(event) => {
                              if (!confirm(`Hapus ${guest.name}?`)) event.preventDefault();
                            }}
                          >
                            <input type="hidden" name="id" value={guest.id} />
                            <button className="button danger small" type="submit">Hapus</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
