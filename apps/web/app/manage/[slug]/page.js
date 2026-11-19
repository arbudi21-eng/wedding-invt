import Link from 'next/link';
import QRCode from 'qrcode';
import { notFound, redirect } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { designName } from '@/lib/designs';
import { draftTitle, formatDateISO } from '@/lib/draft';
import DevSkipPublish from './dev-skip-publish';
import PublishForm from './PublishForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kelola undangan',
};

const BASE_COLUMNS = 'id, slug, design, status, content, created_at, updated_at, published_at';
const PAYMENT_COLUMNS =
  'payment_status, amount_idr, payment_invoice_number, payment_reference_no, payment_qr_content';

function paymentColumnsMissing(error) {
  const message = String(error?.message || '');
  return error?.code === '42703' || /does not exist|undefined column/i.test(message);
}

export default async function ManagePage({ params }) {
  const { slug } = await params;

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) redirect(`/login?next=${encodeURIComponent(`/manage/${slug}`)}`);

  // The payment migration (database/0006_payments.sql) may not be applied yet.
  // Fall back to the original columns so the manage page still loads.
  let wedding;
  let paymentsReady = true;
  const full = await supabase
    .from('weddings')
    .select(`${BASE_COLUMNS}, ${PAYMENT_COLUMNS}`)
    .eq('slug', slug)
    .maybeSingle();

  if (full.error && paymentColumnsMissing(full.error)) {
    paymentsReady = false;
    const fallback = await supabase
      .from('weddings')
      .select(BASE_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    if (fallback.error) {
      throw new Error(`Gagal memuat undangan: ${fallback.error.message}`);
    }
    wedding = fallback.data;
  } else {
    if (full.error) {
      throw new Error(`Gagal memuat undangan: ${full.error.message}`);
    }
    wedding = full.data;
  }

  if (!wedding) notFound();

  const title = draftTitle(wedding.content);
  const when = formatDateISO(wedding.content?.dateISO);
  const published = wedding.status === 'published';
  const paymentStatus = String(wedding.payment_status || 'unpaid');
  const waitingForPayment = !published && paymentStatus === 'pending';

  // Render the saved QRIS on the server so it survives a page reload.
  let initialQrDataUrl = '';
  if (paymentsReady && wedding.payment_qr_content) {
    try {
      initialQrDataUrl = await QRCode.toDataURL(wedding.payment_qr_content, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      initialQrDataUrl = '';
    }
  }

  return (
    <>
      <SiteHeader email={claims.email} />
      <main>
        <p className="small" style={{ marginBottom: '0.75rem' }}>
          <Link href="/dashboard">← Semua undangan</Link>
        </p>

        <div className="page-head">
          <div>
            <p className="eyebrow">Undangan</p>
            <h1>{title}</h1>
          </div>
          <span className={`badge ${wedding.status}`}>
            {published ? 'terbit' : waitingForPayment ? 'menunggu bayar' : 'draf'}
          </span>
        </div>

        <div className="manage-grid">
          <section className="card stack" style={{ gap: '1rem' }}>
            <div className="draft-meta">
              <code className="slug">{wedding.slug}</code>
              <span>{designName(wedding.design)}</span>
              {when ? <span>{when}</span> : null}
            </div>

            {published ? (
              <div className="stack" style={{ gap: '0.75rem' }}>
                <h2>Sudah tayang</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Undangan Anda dapat dibagikan di <code className="slug">/{wedding.slug}</code>.
                  Undangan yang sudah diterbitkan tidak dapat diubah lagi.
                </p>
                <div className="hero-actions" style={{ margin: 0 }}>
                  <Link className="button" href={`/${wedding.slug}`} target="_blank" rel="noreferrer">
                    Lihat undangan
                  </Link>
                  <Link className="button secondary" href={`/manage/${wedding.slug}/kirim`}>
                    Kirim undangan
                  </Link>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                <h2>Siap diterbitkan?</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Undangan tetap privat sampai diterbitkan. Pratinjau dulu — semua yang tampil
                  akan sama seperti yang dilihat tamu.
                </p>
                <div className="hero-actions" style={{ margin: 0 }}>
                  <Link
                    className="button secondary"
                    href={`/preview/${wedding.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pratinjau undangan
                  </Link>
                  <Link className="button secondary" href={`/build/${wedding.id}`}>
                    Terus mengedit
                  </Link>
                </div>
              </div>
            )}
          </section>

          {!published ? (
            <section className="card">
              <div className="section-title">
                <h2>Terbitkan</h2>
                <span>Satu pembayaran · Rp 100.000</span>
              </div>

              {/* Dev-only free publish — never rendered in production. */}
              <DevSkipPublish invitationId={wedding.id} />

              <PublishForm
                invitationId={wedding.id}
                initialQrDataUrl={initialQrDataUrl}
                initialInvoiceNumber={wedding.payment_invoice_number || ''}
                initialPaymentStatus={paymentStatus}
                paymentsReady={paymentsReady}
              />
              <Link
                className="button secondary"
                href={`/preview/${wedding.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Pratinjau undangan
              </Link>
            </section>
          ) : (
            <section className="card">
              <div className="section-title">
                <h2>Bagikan &amp; detail</h2>
                <span>Tautan tidak terdaftar</span>
              </div>
              <p className="inline-note" style={{ margin: 0 }}>
                Diterbitkan{' '}
                {wedding.published_at
                  ? new Date(wedding.published_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'baru saja'}
                . Tautan ini tidak terdaftar; bagikan hanya kepada tamu Anda.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
