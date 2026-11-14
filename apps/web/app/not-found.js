import Link from 'next/link';
import SiteHeader from '@/components/site-header';

export const metadata = {
  title: 'Not found',
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="narrow">
        <div className="card">
          <p className="eyebrow">404</p>
          <h1>That page is not here</h1>
          <p className="muted">
            The invitation may have been deleted, or the link belongs to another account.
          </p>
          <Link className="button" href="/dashboard">
            Go to your invitations
          </Link>
        </div>
      </main>
    </>
  );
}
