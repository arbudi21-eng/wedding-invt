import Link from 'next/link';
import { redirect } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { draftTitle, formatDateISO } from '@/lib/draft';
import { designName } from '@/lib/designs';
import NewInvitationForm from './new-invitation-form';
import DeleteDraftButton from './delete-draft-button';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
};

function updatedLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function DashboardPage() {
  const { supabase, claims } = await getClaims();

  if (!claims?.sub) redirect('/login?next=/dashboard');

  const { data: weddings, error } = await supabase
    .from('weddings')
    .select('id, slug, design, status, content, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load your invitations: ${error.message}`);
  }

  const drafts = weddings || [];

  return (
    <>
      <SiteHeader email={claims.email} />
      <main>
        <div className="page-head">
          <div>
            <p className="eyebrow">Your studio</p>
            <h1>Invitations</h1>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {drafts.length === 0
              ? 'No drafts yet'
              : `${drafts.length} invitation${drafts.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title">
            <h2>New invitation</h2>
            <span>Names are enough to start</span>
          </div>
          <NewInvitationForm />
        </section>

        {drafts.length === 0 ? (
          <section className="empty">
            <h2>Your first draft starts above</h2>
            <p className="muted">
              Nothing is published until you say so. You can close this tab and come back later.
            </p>
          </section>
        ) : (
          <section className="draft-list" aria-label="Your invitations">
            {drafts.map((wedding) => {
              const title = draftTitle(wedding.content);
              const when = formatDateISO(wedding.content?.dateISO);

              return (
                <article className="draft-card" key={wedding.id}>
                  <div>
                    <h2>{title}</h2>
                    <div className="draft-meta">
                      <span className={`badge ${wedding.status}`}>{wedding.status}</span>
                      <code className="slug">{wedding.slug}</code>
                      <span>{designName(wedding.design)}</span>
                      {when ? <span>{when}</span> : null}
                      {wedding.updated_at ? (
                        <span>Edited {updatedLabel(wedding.updated_at)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="draft-actions">
                    <Link className="button small" href={`/build/${wedding.id}`}>
                      Edit
                    </Link>
                    <DeleteDraftButton id={wedding.id} title={title} />
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}
