'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }) {
  return (
    <main className="narrow">
      <div className="card">
        <p className="eyebrow">Terjadi kendala</p>
        <h1>Halaman ini tidak dapat dimuat</h1>
        <p className="muted">
          Tidak ada yang hilang. Coba lagi, atau kembali ke dasbor dan buka undangan Anda.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={() => reset()}>
            Coba lagi
          </button>
          <Link className="button secondary" href="/dashboard">
            Dasbor
          </Link>
        </div>
      </div>
    </main>
  );
}
