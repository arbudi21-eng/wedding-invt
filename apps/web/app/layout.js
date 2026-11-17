import './globals.css';

export const metadata = {
  title: {
    default: 'Wedding Studio',
    template: '%s · Wedding Studio',
  },
  description:
    'Buat undangan pernikahan Anda, undang tamu lewat WhatsApp, dan terbitkan saat semuanya siap.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <a className="skip-link" href="#main">
          Lewati konten
        </a>
        {children}
      </body>
    </html>
  );
}
