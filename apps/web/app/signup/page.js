import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import SignupForm from './signup-form';

export const metadata = {
  title: 'Create account',
};

export default function SignupPage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow">
        <div className="card">
          <div className="auth-head">
            <p className="eyebrow">Free to start</p>
            <h1>Create your account</h1>
            <p className="muted">
              Build the invitation first. You only pay when you publish it.
            </p>
          </div>
          <SignupForm />
          <p className="small muted" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            Already have an account? <Link href="/login">Sign in</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
