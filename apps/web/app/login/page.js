import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import LoginForm from './login-form';

export const metadata = {
  title: 'Masuk',
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
            <p className="eyebrow">Selamat datang kembali</p>
            <h1>Masuk</h1>
            <p className="muted">Draf dan undangan yang sudah diterbitkan menunggu Anda.</p>
          </div>
          <LoginForm next={next} initialError={error} />
          <p className="small muted" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            Baru di sini? <Link href="/signup">Buat akun</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
