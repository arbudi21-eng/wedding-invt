import Link from 'next/link';
import SiteHeader from '@/components/site-header';

export const metadata = {
  title: 'Undangan pernikahan yang Anda buat sendiri',
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Undangan pernikahan, tanpa biaya agensi</p>
            <h1>Buat sendiri. Terbitkan saat semuanya siap.</h1>
            <p className="lede">
              Pilih satu dari 33 desain, tulis kisah Anda, lengkapi tempat dan jadwal, lalu bagikan
              satu tautan. Tamu bisa konfirmasi kehadiran dan memberi ucapan langsung dari
              undangan — tanpa mengunduh aplikasi.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/signup">
                Mulai membuat draf
              </Link>
              <Link className="button secondary" href="/login">
                Masuk
              </Link>
            </div>
          </div>
          <aside className="hero-card">
            <h2>Cara kerjanya</h2>
            <ol>
              <li>
                <strong>Buat draf.</strong> Undangan Anda tersimpan di akun, bukan hilang di tab
                browser.
              </li>
              <li>
                <strong>Edit santai.</strong> Tutup laptop, lanjutkan dari ponsel — detailnya tetap
                ada.
              </li>
              <li>
                <strong>Terbitkan saat siap.</strong> Draf tetap privat sampai Anda membuat
                tautannya aktif.
              </li>
            </ol>
          </aside>
        </section>

        <section className="feature-grid" aria-label="Yang Anda dapatkan">
          <article className="feature">
            <h3>33 tema desain</h3>
            <p>Dari editorial netral hingga batik nusantara dan celestial. Ganti desain tanpa mengubah tulisan Anda.</p>
          </article>
          <article className="feature">
            <h3>Daftar tamu tersambung</h3>
            <p>Kode pribadi, jumlah konfirmasi dan tombol kirim WhatsApp. Tanpa repot spreadsheet.</p>
          </article>
          <article className="feature">
            <h3>Ucapan yang bertahan</h3>
            <p>Tamu bisa meninggalkan ucapan tanpa membuat akun. Anda menyaring yang tampil.</p>
          </article>
          <article className="feature">
            <h3>Satu tautan, semua perangkat</h3>
            <p>Undangan adalah halaman cepat dan ringan — tetap terbuka saat sinyal lemah di lokasi acara.</p>
          </article>
        </section>
      </main>
      <footer className="foot">Wedding Studio · buat gratis, terbitkan saat Anda siap</footer>
    </>
  );
}
