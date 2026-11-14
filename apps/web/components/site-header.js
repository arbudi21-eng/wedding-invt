import Link from 'next/link';

export default function SiteHeader({ email }) {
  return (
    <header className="site-header">
      <Link className="brand" href={email ? '/dashboard' : '/'}>
        Wedding Studio
      </Link>
      <nav className="site-nav" aria-label="Account">
        {email ? (
          <>
            <span className="who" title={email}>
              {email}
            </span>
            <Link href="/dashboard">Dashboard</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="link-button">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">Sign in</Link>
            <Link className="button small" href="/signup">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
