// Disabled.
//
// This endpoint previously flipped an invitation to `published` based purely
// on request-body "credentials" — anyone could publish any invitation, and the
// client could not even read the DOKU keys to call it honestly. Publishing now
// happens through `publishInvitation` (app/actions/publish.js), which verifies
// the owner's session; RLS on `weddings` enforces ownership.
//
// A real DOKU webhook needs DOKU's documented signature scheme to be verified
// against process.env.DOKU_SECRET_KEY before touching the database. That
// contract is not in this repo, so this route fails closed.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      message:
        'Direct webhook publishing is disabled. Publish from your manage page; a signed DOKU webhook must be implemented server-side before it can flip status here.',
    },
    { status: 501 }
  );
}
