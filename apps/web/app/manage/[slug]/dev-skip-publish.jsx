'use client';

import { useActionState, useEffect } from 'react';
import { publishInvitation } from '@/app/actions/publish';

/**
 * DEV-ONLY affordance. In development only, exposes a "skip payment and
 * publish" path so the team can see the live invitation without going
 * through DOKU checkout. In production builds this component renders null
 * and the real flow goes through the paywall.
 *
 * Owner-verified since it goes through the same publishInvitation action as
 * the paywall, with the same RLS scoping — just without taking money.
 */
export default function DevSkipPublish({ invitationId }) {
  const isDev = process.env.NODE_ENV !== 'production';
  const [state, formAction, pending] = useActionState(
    publishInvitation,
    { ok: false, error: '' }
  );

  // After a successful publish, hard-navigate so server components re-read the row.
  useEffect(() => {
    if (state?.ok) window.location.reload();
  }, [state?.ok]);

  if (!isDev) return null;

  return (
    <div className="alert notice" style={{ fontSize: '0.85rem' }}>
      <p style={{ margin: '0 0 0.5rem' }}>
        <strong>Development only.</strong> Klik "Terbitkan (tanpa bayar)" untuk melihat undangan
        Anda tanpa melewati DOKU. Tidak muncul di produksi.
      </p>
      <form action={formAction}>
        <input type="hidden" name="id" value={invitationId} />
        <input type="hidden" name="plan" value="starter" />
        <button className="button small secondary" type="submit" disabled={pending}>
          {pending ? 'Menerbitkan…' : 'Terbitkan (tanpa bayar)'}
        </button>
      </form>
      {state?.ok ? (
        <p style={{ margin: '0.5rem 0 0' }}>Diterbitkan. Memuat ulang…</p>
      ) : state?.error ? (
        <p style={{ margin: '0.5rem 0 0' }}>{state.error}</p>
      ) : null}
    </div>
  );
}
