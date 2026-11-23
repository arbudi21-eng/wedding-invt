import Link from 'next/link';
import SiteHeader from '@/components/site-header';

export const metadata = {
  title: 'Tidak ditemukan',
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="narrow">
        <div className="card">
          <p className="eyebrow">404</p>
          <h1>Halaman ini tidak ada</h1>
          <p className="muted">
            Undangan mungkin sudah dihapus, atau tautan ini milik akun lain.
          </p>
          <Link className="button" href="/dashboard">
            Ke undangan saya
          </Link>
        </div>
      </main>
    </>
  );
}
