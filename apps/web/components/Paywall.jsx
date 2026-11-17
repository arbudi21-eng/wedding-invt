'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { publishInvitation } from '@/app/actions/publish';

export default function Paywall({ invitationId, designName }) {
  const [state, formAction, pending] = useActionState(publishInvitation, { ok: false });

  if (state?.ok) {
    return (
      <section className="paywall-success" aria-live="polite">
        <p className="eyebrow">Published</p>
        <h3>Your invitation is live</h3>
        <p className="muted">
          Guests can now open your link. You can keep editing — publishing again ships the latest
          words and photos.
        </p>
        <div className="hero-actions" style={{ marginTop: '1rem' }}>
          <Link className="button" href={`/${state.slug}`} target="_blank" rel="noreferrer">
            View live invitation
          </Link>
          <Link className="button secondary" href={`/manage/${state.slug}`}>
            Manage invitation
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="paywall">
      <p className="inline-note" style={{ margin: '0 0 0.75rem' }}>
        Test checkout. DOKU verification uses the sandbox keys configured in this project — your
        invitation goes live as soon as you confirm, without a real charge.
      </p>

      {state?.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="paywall-tiers">
        <form action={formAction} className="paywall-tier">
          <input type="hidden" name="id" value={invitationId} />
          <input type="hidden" name="plan" value="starter" />
          <div>
            <h3>Starter</h3>
            <p className="muted">50 guests · standard designs · email support</p>
          </div>
          <div className="paywall-tier-foot">
            <strong>Rp 150.000</strong>
            <button className="button small" type="submit" disabled={pending}>
              {pending ? 'Publishing…' : 'Pay & publish'}
            </button>
          </div>
        </form>

        <form action={formAction} className="paywall-tier is-featured">
          <input type="hidden" name="id" value={invitationId} />
          <input type="hidden" name="plan" value="professional" />
          <div>
            <h3>Professional</h3>
            <p className="muted">Unlimited guests · every design incl. premium · priority support</p>
          </div>
          <div className="paywall-tier-foot">
            <strong>Rp 350.000</strong>
            <button className="button small" type="submit" disabled={pending}>
              {pending ? 'Publishing…' : 'Pay & publish'}
            </button>
          </div>
        </form>
      </div>

      <p className="inline-note" style={{ marginBottom: 0 }}>
        Design in use: <strong>{designName}</strong>. Publishing does not lock the design — change
        it any time before your wedding.
      </p>
    </div>
  );
}
