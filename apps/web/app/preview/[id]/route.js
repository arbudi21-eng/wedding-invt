// Owner-only preview of a saved draft.
//
// GET /preview/<id> — the same WedCore page guests get at /{slug}, rendered
// from the stored draft. Auth: a signed-in session; RLS on `weddings`
// guarantees "not your draft" == "doesn't exist". Returns 404 either way so
// the route can never confirm the existence of someone else's invitation.
import { NextResponse } from 'next/server';
import { getClaims } from '@/lib/supabase/server';
import { buildInvitationHtml } from '@/lib/preview';
import { isDesignId } from '@/lib/designs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { supabase, claims } = await getClaims();
  if (!claims?.sub) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(`/preview/${id}`)}`, request.url)
    );
  }

  const { data: wedding, error } = await supabase
    .from('weddings')
    .select('id, slug, design, status, content')
    .eq('id', id)
    .maybeSingle();

  if (error || !wedding) {
    return new NextResponse('Not found', { status: 404 });
  }

  const design = isDesignId(wedding.design) ? wedding.design : '01-editorial-mocha';
  const html = buildInvitationHtml({ design, content: wedding.content, slug: wedding.slug });

  return new NextResponse(html.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}
