import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import styles from './panduan.module.css';

export const metadata = {
  title: 'Panduan penggunaan',
  description:
    'Panduan langkah demi langkah membuat, mempersonalisasi, menerbitkan, dan membagikan undangan pernikahan di Wedding Studio.',
};

const steps = [
  {
    title: 'Pilih desain',
    body: 'Pilih 1 dari 45 desain. Setiap tema punya gaya unik — dari elegan, modern, hingga tradisional.',
  },
  {
    title: 'Masuk dan isi detail acara',
    body: 'Masuk ke akun Anda, lalu isi detail acara: nama mempelai, tanggal, waktu, tempat, tautan peta, serta jadwal akad dan resepsi.',
  },
  {
    title: 'Personalisasi undangan',
    body: 'Edit teks langsung di pratinjau live, unggah foto, musik, atau video, dan lengkapi profil mempelai pria dan wanita.',
  },
  {
    title: 'Pratinjau dan simpan draf',
    body: 'Lihat hasil undangan secara langsung, simpan draf kapan saja, dan lanjutkan pengeditan saat Anda siap.',
  },
  {
    title: 'Terbitkan dan bagikan',
    body: 'Terbitkan undangan dengan pembayaran Rp 100.000 atau kode promo yang berlaku. Bagikan tautan publik, kirim undangan via WhatsApp, dan kelola RSVP serta ucapan tamu.',
  },
];

export default function PanduanPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <p className="eyebrow">Panduan</p>
          <h1>Cara menggunakan Wedding Studio</h1>
          <p className="lede">
            Panduan singkat untuk membuat, mempersonalisasi, menerbitkan, dan membagikan undangan
            pernikahan digital Anda.
          </p>
        </header>

        <section className={styles.videoWrap} aria-label="Video panduan">
          <video className={styles.video} controls preload="metadata">
            <source src="/panduan/output.mp4" type="video/mp4" />
            Browser Anda tidak mendukung pemutar video.{' '}
            <a href="/panduan/output.mp4">Unduh video panduan</a>.
          </video>
          <p className={styles.caption}>
            Video panduan penggunaan (Bahasa Indonesia). Gunakan kontrol pemutar untuk memutar atau
            menjeda.
          </p>
        </section>

        <section className={styles.stepsSection} aria-label="Langkah-langkah">
          <h2>Langkah-langkah</h2>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.num} aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className={styles.note}>
          <strong>Catatan:</strong> Setelah undangan diterbitkan, isi undangan tidak dapat diubah.
          Pastikan semua detail sudah benar sebelum menerbitkan.
        </p>

        <p>
          <Link className="button" href="/signup">
            Mulai membuat draf
          </Link>
        </p>
      </main>
      <footer className="foot">Wedding Studio · panduan penggunaan</footer>
    </>
  );
}
