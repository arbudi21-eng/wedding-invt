import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import { DESIGNS } from '@/lib/designs';
import styles from './home.module.css';

export const metadata = {
  title: 'Undangan pernikahan yang Anda buat sendiri',
};

const showcaseIds = ['01-editorial-mocha', '10-batik-nusantara', '06-midnight-celestial'];
const showcase = showcaseIds
  .map((id) => DESIGNS.find((design) => design.id === id))
  .filter(Boolean);

const heroPreview =
  '/preview/new?design=01-editorial-mocha&bride=Amara&groom=Dewa' +
  '&date=2027-03-13&time=10:00&venueName=' +
  encodeURIComponent('Gedung Tirta Nirmala');

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.home}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Undangan pernikahan, tanpa biaya agensi</p>
            <h1 className={styles.title}>Buat sendiri. Terbitkan saat semuanya siap.</h1>
            <p className={styles.lede}>
              Pilih satu dari 33 desain, tulis kisah Anda, lengkapi tempat dan jadwal, lalu bagikan
              satu tautan. Tamu bisa konfirmasi kehadiran dan memberi ucapan langsung dari
              undangan — tanpa mengunduh aplikasi.
            </p>
            <div className={styles.heroActions}>
              <Link className="button" href="/signup">
                Mulai membuat draf
              </Link>
              <Link className="button secondary" href="/login">
                Masuk
              </Link>
            </div>
          </div>

          <div className={styles.showcase}>
            <div className={styles.browser}>
              <div className={styles.browserBar}>
                <span className={styles.dots} aria-hidden="true">
                  <i className={styles.dot} />
                  <i className={styles.dot} />
                  <i className={styles.dot} />
                </span>
                <span className={styles.address}>pratinjau undangan · Amara &amp; Dewa</span>
              </div>
              <iframe
                className={styles.screen}
                src={heroPreview}
                title="Pratinjau undangan Amara dan Dewa"
                loading="eager"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
            <p className={styles.caption}>Pratinjau langsung · 01 Editorial Mocha</p>
          </div>
        </section>

        <section className={styles.rail} aria-label="Contoh desain undangan">
          <p className={styles.railLabel}>Contoh desain</p>
          <ul className={styles.railGrid}>
            {showcase.map((design) => (
              <li key={design.id} className={styles.tile}>
                <iframe
                  className={styles.tileShot}
                  src={`/designs/${design.id}.html`}
                  title={`Pratinjau ${design.name}`}
                  loading="lazy"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <div className={styles.tileFoot}>
                  <span className={styles.tileName}>{design.name}</span>
                  <span className={styles.tileNum}>{design.id.slice(0, 2)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.steps} aria-label="Cara kerjanya">
          <div className={styles.stepsHead}>
            <h2>Cara kerjanya</h2>
          </div>
          <ol className={styles.stepList}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <span>
                <strong>Buat draf.</strong> Undangan Anda tersimpan di akun, bukan hilang di tab
                browser.
              </span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <span>
                <strong>Edit santai.</strong> Tutup laptop, lanjutkan dari ponsel — detailnya tetap
                ada.
              </span>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <span>
                <strong>Terbitkan saat siap.</strong> Draf tetap privat sampai Anda membuat
                tautannya aktif.
              </span>
            </li>
          </ol>
        </section>

        <section className={styles.features} aria-label="Yang Anda dapatkan">
          <article className={styles.feature}>
            <h3>33 tema desain</h3>
            <p>Dari editorial netral hingga batik nusantara dan celestial. Ganti desain tanpa mengubah tulisan Anda.</p>
          </article>
          <article className={styles.feature}>
            <h3>Daftar tamu tersambung</h3>
            <p>Kode pribadi, jumlah konfirmasi dan tombol kirim WhatsApp. Tanpa repot spreadsheet.</p>
          </article>
          <article className={styles.feature}>
            <h3>Ucapan yang bertahan</h3>
            <p>Tamu bisa meninggalkan ucapan tanpa membuat akun. Anda menyaring yang tampil.</p>
          </article>
          <article className={styles.feature}>
            <h3>Satu tautan, semua perangkat</h3>
            <p>Undangan adalah halaman cepat dan ringan — tetap terbuka saat sinyal lemah di lokasi acara.</p>
          </article>
        </section>
      </main>
      <footer className="foot">Wedding Studio · buat gratis, terbitkan saat Anda siap</footer>
    </>
  );
}
