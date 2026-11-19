import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { designName } from '@/lib/designs';
import { draftTitle, formatDateISO } from '@/lib/draft';
import { publishInvitation } from '@/app/actions/publish';
import DevSkipPublish from './dev-skip-publish';
import PublishForm from './PublishForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Manage invitation',
};

export default async function ManagePage({ params }) {
  const { slug } = await params;

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) redirect(`/login?next=${encodeURIComponent(`/manage/${slug}`)}`);

  const { data: wedding, error } = await supabase
    .from('weddings')
    .select('id, slug, design, status, content, created_at, updated_at, published_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load this invitation: ${error.message}`);
  }
  if (!wedding) notFound();

  const title = draftTitle(wedding.content);
  const when = formatDateISO(wedding.content?.dateISO);
  const published = wedding.status === 'published';

  return (
    <>
      <SiteHeader email={claims.email} />
      <main>
        <p className="small" style={{ marginBottom: '0.75rem' }}>
          <Link href="/dashboard">← All invitations</Link>
        </p>

        <div className="page-head">
          <div>
            <p className="eyebrow">Invitation</p>
            <h1>{title}</h1>
          </div>
          <span className={`badge ${wedding.status}`}>{wedding.status}</span>
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
                <h2>Live now</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Your invitation is shareable at <code className="slug">/{wedding.slug}</code>.
                  Edits you save in the studio ship with the next publish.
                </p>
                <div className="hero-actions" style={{ margin: 0 }}>
                  <Link className="button" href={`/${wedding.slug}`} target="_blank" rel="noreferrer">
                    View live invitation
                  </Link>
                  <Link className="button secondary" href={`/build/${wedding.id}`}>
                    Edit invitation
                  </Link>
                  <Link className="button secondary" href={`/manage/${wedding.slug}/kirim`}>
                    Kirim undangan
                  </Link>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                <h2>Ready to publish?</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Your invitation stays private until you publish. Preview it first — everything
                  ships exactly as guests will see it.
                </p>
                <div className="hero-actions" style={{ margin: 0 }}>
                  <Link
                    className="button secondary"
                    href={`/preview/${wedding.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview invitation
                  </Link>
                  <Link className="button secondary" href={`/build/${wedding.id}`}>
                    Keep editing
                  </Link>
                </div>
              </div>
            )}
          </section>

          {!published ? (
            <section className="card">
              <div className="section-title">
                <h2>Publish</h2>
                <span>Satu pembayaran · Rp 100.000</span>
              </div>

              {/* Dev-only free publish — never rendered in production. */}
              <DevSkipPublish invitationId={wedding.id} />

              {/* Paid publish flow with visible promo code field. */}
              <PublishForm invitationId={wedding.id} />
              <Link
                className="button secondary"
                href={`/preview/${wedding.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Preview undangan
              </Link>
              <Link className="button secondary" href={`/build/${wedding.id}`}>
                Terus mengedit
              </Link>
            </section>
          ) : (
            <section className="card">
              <div className="section-title">
                <h2>Share &amp; details</h2>
                <span>Unlisted link</span>
              </div>
              <p className="inline-note" style={{ margin: 0 }}>
                Published {wedding.published_at ? new Date(wedding.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'recently'}.
                The link is unlisted; share it only with your guests.
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
