import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { draftTitle } from '@/lib/draft';
import { wordFrequencies } from '@/lib/wishes';
import GuestList from './guest-list';
import WishCloud from './wish-cloud';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kirim undangan',
};

export default async function KirimPage({ params }) {
  const { slug } = await params;

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) redirect(`/login?next=${encodeURIComponent(`/manage/${slug}/kirim`)}`);

  const { data: wedding, error } = await supabase
    .from('weddings')
    .select('id, slug, design, status, content, published_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !wedding) redirect('/dashboard');
  if (wedding.status !== 'published') redirect(`/manage/${slug}`);

  const title = draftTitle(wedding.content);
  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('id, code, name, phone, lang, sent_status, sent_at, rsvp, pax, opened_at')
    .eq('wedding_id', wedding.id)
    .order('created_at', { ascending: false });

  if (guestsError) {
    throw new Error(`Could not load guests: ${guestsError.message}`);
  }

  const { data: wishes, error: wishesError } = await supabase
    .from('wishes')
    .select('message')
    .eq('wedding_id', wedding.id)
    .order('created_at', { ascending: false });

  if (wishesError) {
    throw new Error(`Could not load wishes: ${wishesError.message}`);
  }

  // Absolute base URL for the shareable link.
  const reqHeaders = await headers();
  const host = reqHeaders.get('host') || 'localhost:3001';
  const proto = reqHeaders.get('x-forwarded-proto') || 'http';
  const siteUrl = `${proto}://${host}`;

  const guestList = guests || [];
  const wishList = wishes || [];

  const total = guestList.length;
  const attending = guestList.filter((g) => g.rsvp === 'attending');
  const declined = guestList.filter((g) => g.rsvp === 'declined');
  const pending = guestList.filter((g) => !g.rsvp || g.rsvp === 'pending');
  const peopleComing = attending.reduce((sum, g) => sum + (Number(g.pax) || 1), 0);
  const sent = guestList.filter((g) => g.sent_status === 'sent').length;
  const opened = guestList.filter((g) => g.opened_at).length;

  const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const attendedPct = pct(attending.length);
  const declinedPct = pct(declined.length);
  const pendingPct = Math.max(0, 100 - attendedPct - declinedPct);

  const cloudWords = wordFrequencies(wishList.map((w) => w.message));

  return (
    <>
      <SiteHeader email={claims.email} />
      <main>
        <p className="small" style={{ marginBottom: '0.75rem' }}>
          <Link href={`/manage/${slug}`}>← Kembali ke kelola</Link>
        </p>

        <div className="page-head">
          <div>
            <p className="eyebrow">Kirim undangan</p>
            <h1>{title}</h1>
          </div>
          <span className="badge published">published</span>
        </div>

        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title">
            <h2>Link undangan tamu</h2>
            <span>Untuk dikirim manual</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Bagikan link pribadi ini ke setiap tamu lewat WhatsApp / email / media sosial. Setiap
            tamu akan melihat nama mereka di undangan dan bisa mengonfirmasi kehadiran.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <code className="slug" style={{ display: 'inline' }}>
              {`${siteUrl}/${wedding.slug}`}
            </code>
          </div>
        </section>

        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title">
            <h2>Statistik kehadiran</h2>
            <span>RSVP {total} tamu</span>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Total tamu</span>
              <span className="stat-value">{total}</span>
              <span className="stat-sub">{sent} dikirim · {opened} dibuka</span>
            </div>
            <div className="stat-card ok">
              <span className="stat-label">Hadir</span>
              <span className="stat-value">{attending.length}</span>
              <span className="stat-sub">≈ {peopleComing} orang</span>
            </div>
            <div className="stat-card danger">
              <span className="stat-label">Tidak hadir</span>
              <span className="stat-value">{declined.length}</span>
              <span className="stat-sub">{declinedPct}%</span>
            </div>
            <div className="stat-card warn">
              <span className="stat-label">Menunggu</span>
              <span className="stat-value">{pending.length}</span>
              <span className="stat-sub">{pendingPct}% belum konfirmasi</span>
            </div>
          </div>

          <div className="rsvp-bar" role="img" aria-label={`Hadir ${attendedPct}%, tidak hadir ${declinedPct}%, menunggu ${pendingPct}%`}>
            <div className="rsvp-seg attend" style={{ width: `${attendedPct}%` }} />
            <div className="rsvp-seg decline" style={{ width: `${declinedPct}%` }} />
            <div className="rsvp-seg wait" style={{ width: `${pendingPct}%` }} />
          </div>
          <div className="rsvp-legend">
            <span><i className="dot attend" /> Hadir {attendedPct}%</span>
            <span><i className="dot decline" /> Tidak hadir {declinedPct}%</span>
            <span><i className="dot wait" /> Menunggu {pendingPct}%</span>
          </div>
        </section>

        <section className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title">
            <h2>Wordcloud ucapan</h2>
            <span>{wishList.length} ucapan · kata yang paling sering muncul</span>
          </div>
          <WishCloud words={cloudWords} />
        </section>

        <GuestList
          weddingId={wedding.id}
          weddingSlug={wedding.slug}
          siteUrl={siteUrl}
          weddingTitle={title}
          guests={guestList}
        />
      </main>
    </>
  );
}
