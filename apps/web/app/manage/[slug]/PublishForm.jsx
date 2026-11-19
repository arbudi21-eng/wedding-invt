'use client';

import { useActionState, useState } from 'react';
import { publishWithPayment, createDokuPayment } from '@/app/actions/publish';

export default function PublishForm({ invitationId }) {
  const [state, formAction, pending] = useActionState(publishWithPayment, {
    ok: false,
    error: '',
  });
  const [dokuState, dokuAction, dokuPending] = useActionState(createDokuPayment, {
    ok: false,
    error: '',
  });
  const [promoCode, setPromoCode] = useState('');

  const isFree = promoCode.toUpperCase() === 'SAGALA';

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isFree) {
      // Free via promo code — publish immediately.
      const fd = new FormData();
      fd.set('id', invitationId);
      fd.set('promoCode', promoCode);
      await formAction(fd);
      return;
    }

    // Paid path — create DOKU transaction and redirect to checkout.
    const fd = new FormData();
    fd.set('id', invitationId);
    const result = await dokuAction(fd);

    if (result?.ok && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="publish-form" style={{ marginTop: '1rem' }}>
      <input type="hidden" name="id" value={invitationId} />

      <div className="field">
        <label htmlFor="promo-code">Kode promosi (opsional)</label>
        <input
          id="promo-code"
          name="promoCode"
          type="text"
          placeholder="Masukkan kode promosi…"
          defaultValue=""
          onChange={(e) => setPromoCode(e.target.value)}
        />
        <p className="hint" style={{ marginTop: '0.35rem' }}>
          Kode <strong>SAGALA</strong> untuk publish gratis tanpa pembayaran.
        </p>
      </div>

      <button
        className="button"
        type="submit"
        disabled={pending || dokuPending}
      >
        {pending || dokuPending ? 'Memproses…' : isFree ? 'Terbitkan gratis (SAGALA)' : 'Terbitkan (Rp 100.000)'}
      </button>

      {state?.error && (
        <p className="inline-note" style={{ marginTop: '0.5rem', color: '#9b2c2c' }}>
          {state.error}
        </p>
      )}
      {dokuState?.error && (
        <p className="inline-note" style={{ marginTop: '0.5rem', color: '#9b2c2c' }}>
          {dokuState.error}
        </p>
      )}
      {!isFree && (
        <p className="inline-note" style={{ marginTop: '0.5rem' }}>
          Pembayaran melalui DOKU. Setelah pembayaran berhasil, undangan akan langsung
          diterbitkan dan dapat dibuka oleh tamu.
        </p>
      )}
    </form>
  );
}
