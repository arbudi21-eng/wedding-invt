'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }) {
  return (
    <main className="narrow">
      <div className="card">
        <p className="eyebrow">Something broke</p>
        <h1>We could not load this page</h1>
        <p className="muted">
          Nothing was lost. Try again, or go back to your dashboard and reopen the invitation.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="button" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="button secondary" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
