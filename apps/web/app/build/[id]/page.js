import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { getClaims } from '@/lib/supabase/server';
import { normalizeContent } from '@/lib/draft';
import DraftForm from './draft-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Edit invitation',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BuildPage({ params }) {
  const { id } = await params;

  if (!UUID_RE.test(id)) notFound();

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) redirect(`/login?next=${encodeURIComponent(`/build/${id}`)}`);

  // RLS makes "not yours" indistinguishable from "does not exist" — both are
  // a 404, which is exactly what we want.
  const { data: wedding, error } = await supabase
    .from('weddings')
    .select('id, slug, design, status, content, created_at, updated_at, published_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load this invitation: ${error.message}`);
  }
  if (!wedding) notFound();

  if (wedding.status === 'published') {
    redirect(`/manage/${wedding.slug}`);
  }

  const content = normalizeContent(wedding.content);

  return (
    <>
      <SiteHeader email={claims.email} />
      <main>
        <p className="small" style={{ marginBottom: '0.75rem' }}>
          <Link href="/dashboard">← All invitations</Link>
        </p>
        <DraftForm wedding={wedding} content={content} />
      </main>
    </>
  );
}
