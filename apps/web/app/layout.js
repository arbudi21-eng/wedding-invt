import './globals.css';

export const metadata = {
  title: {
    default: 'Wedding Studio',
    template: '%s · Wedding Studio',
  },
  description:
    'Build your wedding invitation, invite guests by WhatsApp, and publish it when you are ready.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
