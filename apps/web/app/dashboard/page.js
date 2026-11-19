import Link from 'next/link';
import { redirect } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { draftTitle, formatDateISO } from '@/lib/draft';
import { designName } from '@/lib/designs';
import { pruneStaleDrafts } from '@/lib/cleanup';
import NewInvitationForm from './new-invitation-form';
import DeleteDraftButton from './delete-draft-button';
import DesignBrowser from '@/components/DesignBrowser';

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

  // Sweep abandoned drafts (unpublished for 3+ days): remove their storage
  // folders and their rows. Best-effort; a failure never blocks the page.
  const { pruned } = await pruneStaleDrafts();

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
        {pruned > 0 ? (
          <section className="alert notice" role="status" style={{ marginBottom: '1.25rem' }}>
            {pruned} {pruned === 1 ? 'draf lama' : 'draf lama'} yang tidak diterbitkan lebih dari
            3 hari telah otomatis dihapus beserta foto-fotonya.
          </section>
        ) : null}

        <div className="studio-head">
          <div>
            <p className="eyebrow">Studio Anda</p>
            <h1>Undangan</h1>
          </div>
          <p className="small muted studio-head-count">
            {drafts.length === 0
              ? 'Belum ada undangan'
              : `${drafts.length} undangan`}
          </p>
        </div>
        <p className="muted small" style={{ marginBottom: '1rem' }}>
          Draf yang tidak diterbitkan dalam <strong>3 hari</strong> akan otomatis dihapus
          beserta semua foto dan datanya.
        </p>

        <section className="studio-card">
          <div className="section-title">
            <h2>Undangan baru</h2>
            <span>Nama saja sudah cukup</span>
          </div>
          <DesignBrowser />
          <div className="studio-form">
            <NewInvitationForm />
          </div>
        </section>

        {drafts.length === 0 ? (
          <section className="empty">
            <h2>Draf pertama Anda dimulai di atas</h2>
            <p className="muted">
              Tidak akan ada yang diterbitkan sampai Anda menekan tombol terbit. Anda bisa
              menutup tab ini dan kembali nanti.
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
                        <span>Diedit {updatedLabel(wedding.updated_at)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="draft-actions">
                    {wedding.status === 'published' ? (
                      <Link className="button small" href={`/${wedding.slug}`} target="_blank" rel="noreferrer">
                        Lihat
                      </Link>
                    ) : (
                      <Link className="button small" href={`/build/${wedding.id}`}>
                        Edit
                      </Link>
                    )}
                    <Link className="button small secondary" href={`/manage/${wedding.slug}`}>
                      Manage
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