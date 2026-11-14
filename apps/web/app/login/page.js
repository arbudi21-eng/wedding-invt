import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import LoginForm from './login-form';

export const metadata = {
  title: 'Sign in',
};

function first(value) {
  return typeof value === 'string' ? value : '';
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = first(params?.error);
  const next = first(params?.next) || '/dashboard';

  return (
    <>
      <SiteHeader />
      <main className="narrow">
        <div className="card">
          <div className="auth-head">
            <p className="eyebrow">Welcome back</p>
            <h1>Sign in</h1>
            <p className="muted">Your drafts and published invitations are waiting.</p>
          </div>
          <LoginForm next={next} initialError={error} />
          <p className="small muted" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            New here? <Link href="/signup">Create an account</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
