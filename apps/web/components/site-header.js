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
            <Link href="/dashboard">Dasbor</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="link-button">
                Keluar
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">Masuk</Link>
            <Link className="button small" href="/signup">
              Buat akun
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
