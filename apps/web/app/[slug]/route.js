// Public guest view — /{slug} is the invitation URL handed to guests.
//
// Published invitations are static-generated WedCore pages with the couple's
// real content baked in; drafts return 404 so an unfinished invitation is
// never reachable by guessing the slug.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInvitationHtml } from '@/lib/preview';
import { isDesignId } from '@/lib/designs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { slug } = await params;

  // Slugs are lowercase names + base32 suffix; anything else is not ours.
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$/.test(slug)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_published_wedding', { p_slug: slug });

  if (error || !data || data.length === 0) {
    return new NextResponse('This invitation is not live yet.', { status: 404 });
  }

  const wedding = data[0];
  const design = isDesignId(wedding.design) ? wedding.design : '01-editorial-mocha';
  const html = buildInvitationHtml({ design, content: wedding.content, slug: wedding.slug });

  return new NextResponse(html.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=300',
    },
  });
}
