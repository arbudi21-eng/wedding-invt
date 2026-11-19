'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  publishWithPayment,
  createDokuPayment,
  checkDokuPayment,
} from '@/app/actions/publish';

const POLL_MS = 5000;

/**
 * Publish paywall. Payment and promo are two independent ways to publish:
 * the Rp 100.000 button works with an empty promo field, while the promo code
 * is submitted separately and validated only on the server. Its value is never
 * hard-coded or shipped in this client bundle.
 *
 * When a payment is required, the QRIS image is rendered inline and the page
 * polls DOKU through the authenticated `checkDokuPayment` action. Only that
 * action may publish the invitation after DOKU confirms the exact payment.
 */
export default function PublishForm({
  invitationId,
  initialQrDataUrl = '',
  initialInvoiceNumber = '',
  initialPaymentStatus = '',
  paymentsReady = true,
}) {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(initialQrDataUrl);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [stopPolling, setStopPolling] = useState(false);
  const pollingRef = useRef(false);

  const checkStatus = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setChecking(true);
      const formData = new FormData();
      formData.set('id', invitationId);

      try {
        // Server actions are plain async functions when called from the client.
        // The first argument is the unused useActionState `prevState` slot.
        const result = await checkDokuPayment(null, formData);

        if (result?.paid) {
          setStopPolling(true);
          window.location.reload();
          return;
        }

        if (result?.status === 'failed') {
          setStopPolling(true);
          setMessage({
            type: 'error',
            text: 'Pembayaran gagal atau kedaluwarsa. Silakan coba lagi.',
          });
          return;
        }

        if (!silent && result?.ok === false) {
          setMessage({
            type: 'error',
            text: result.error || 'Gagal mengecek status pembayaran. Coba lagi.',
          });
        }
      } catch {
        if (!silent) {
          setMessage({
            type: 'error',
            text: 'Gagal mengecek status pembayaran. Coba lagi.',
          });
        }
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [invitationId]
  );

  // Start polling as soon as a QRIS is available — including on page reload,
  // when the QR comes from the saved invitation row.
  useEffect(() => {
    if (!qrDataUrl || stopPolling) return undefined;

    let active = true;
    const run = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        if (active) await checkStatus({ silent: true });
      } finally {
        pollingRef.current = false;
      }
    };

    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [qrDataUrl, stopPolling, checkStatus]);

  const startQris = useCallback(async () => {
    const paymentData = new FormData();
    paymentData.set('id', invitationId);

    const payment = await createDokuPayment(null, paymentData);

    if (payment?.ok && payment.qrDataUrl) {
      setInvoiceNumber(payment.invoiceNumber || '');
      setQrDataUrl(payment.qrDataUrl);
      setStopPolling(false);
      return true;
    }

    setMessage({
      type: 'error',
      text: payment?.error || 'Gagal membuat QRIS. Coba lagi.',
    });
    return false;
  }, [invitationId]);

  const runPublish = async (formData, { promoSubmitted }) => {
    const result = await publishWithPayment(null, formData);

    if (result?.ok) {
      window.location.reload();
      return;
    }

    if (result?.paymentRequired) {
      if (promoSubmitted) {
        setMessage({
          type: 'info',
          text: 'Kode promosi tidak berlaku. Silakan bayar Rp 100.000 atau coba kode lain.',
        });
      }
      await startQris();
      return;
    }

    setMessage({
      type: 'error',
      text: result?.error || 'Gagal menerbitkan undangan. Coba lagi.',
    });
  };

  // Dedicated payment action: never reads the promo field, so an empty promo
  // input cannot block publishing through DOKU.
  const handlePayment = async () => {
    setBusy(true);
    setMessage(null);

    const formData = new FormData();
    formData.set('id', invitationId);
    formData.set('promoCode', '');

    try {
      await runPublish(formData, { promoSubmitted: false });
    } catch {
      setMessage({
        type: 'error',
        text: 'Gagal terhubung ke server. Coba lagi.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Promo is optional: submitting an invalid or empty code still falls through
  // to the Rp 100.000 QRIS so the owner is never stuck with a dead button.
  const handlePromoSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      await runPublish(new FormData(event.currentTarget), { promoSubmitted: true });
    } catch {
      setMessage({
        type: 'error',
        text: 'Gagal terhubung ke server. Coba lagi.',
      });
    } finally {
      setBusy(false);
    }
  };

  const waitingForPayment =
    qrDataUrl || String(initialPaymentStatus).toLowerCase() === 'pending';

  return (
    <div className="publish-form" style={{ marginTop: '1rem' }}>
      {waitingForPayment ? (
        <div className="alert notice" style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: 0 }}>
            <strong>Menunggu pembayaran Rp 100.000.</strong> Undangan akan otomatis
            terbit setelah pembayaran dikonfirmasi DOKU.
          </p>
        </div>
      ) : null}

      {!paymentsReady ? (
        <p className="inline-note" style={{ marginTop: '0.5rem', color: '#9b2c2c' }}>
          Fitur pembayaran belum aktif. Hubungi pemilik toko.
        </p>
      ) : null}

      <button className="button" type="button" onClick={handlePayment} disabled={busy}>
        {busy ? 'Memproses…' : 'Bayar Rp 100.000'}
      </button>

      <form onSubmit={handlePromoSubmit} style={{ marginTop: '0.75rem' }}>
        <input type="hidden" name="id" value={invitationId} />

        <div className="field">
          <label htmlFor="promo-code">Punya kode promosi? (opsional)</label>
          <input
            id="promo-code"
            name="promoCode"
            type="text"
            placeholder="Masukkan kode promosi…"
            autoComplete="off"
          />
        </div>

        <button className="button secondary" type="submit" disabled={busy}>
          {busy ? 'Memproses…' : 'Pakai kode promosi'}
        </button>
      </form>

      {message ? (
        <p
          className="inline-note"
          role="status"
          aria-live="polite"
          style={{
            marginTop: '0.75rem',
            color: message.type === 'error' ? '#9b2c2c' : 'inherit',
          }}
        >
          {message.text}
        </p>
      ) : null}

      {qrDataUrl ? (
        <div className="card stack" style={{ marginTop: '1rem', gap: '0.75rem', maxWidth: '22rem' }}>
          <p className="eyebrow" style={{ margin: 0 }}>QRIS DOKU</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QRIS untuk membayar biaya penerbitan Rp 100.000"
            width={320}
            height={320}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {invoiceNumber ? (
            <p className="small" style={{ margin: 0, wordBreak: 'break-all' }}>
              No. pembayaran: <code>{invoiceNumber}</code>
            </p>
          ) : null}
          <button
            className="button secondary"
            type="button"
            disabled={checking}
            onClick={() => checkStatus()}
          >
            {checking ? 'Mengecek…' : 'Cek status pembayaran'}
          </button>
        </div>
      ) : null}

      <p className="inline-note" style={{ marginTop: '0.75rem' }}>
        Pembayaran melalui DOKU. Setelah pembayaran berhasil, undangan akan langsung
        diterbitkan dan dapat dibuka oleh tamu.
      </p>
    </div>
  );
}
