import Link from 'next/link';
import SiteHeader from '@/components/site-header';

export const metadata = {
  title: 'Wedding invitations you build yourself',
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Wedding invitations, without the agency invoice</p>
            <h1>Build it yourself. Publish it when it is ready.</h1>
            <p className="lede">
              Pick one of 33 designs, write your story, add the venue and schedule, then share a
              single link. Guests RSVP and leave wishes without installing anything.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/signup">
                Start a draft
              </Link>
              <Link className="button secondary" href="/login">
                Sign in
              </Link>
            </div>
          </div>
          <aside className="hero-card">
            <h2>How it works</h2>
            <ol>
              <li>
                <strong>Create a draft.</strong> Your invitation lives in your account, not in a
                browser tab.
              </li>
              <li>
                <strong>Edit at your pace.</strong> Close the laptop, come back on your phone — the
                details are still there.
              </li>
              <li>
                <strong>Publish when ready.</strong> Drafts stay private until you choose to make
                the link live.
              </li>
            </ol>
          </aside>
        </section>

        <section className="feature-grid" aria-label="What you get">
          <article className="feature">
            <h3>33 designed themes</h3>
            <p>From editorial neutrals to batik and celestial. Change the design without losing your words.</p>
          </article>
          <article className="feature">
            <h3>Guest list built in</h3>
            <p>Personal codes, RSVP headcounts and a WhatsApp send button. No spreadsheet juggling.</p>
          </article>
          <article className="feature">
            <h3>Wishes that stay</h3>
            <p>Guests can leave a message without an account. You moderate what appears.</p>
          </article>
          <article className="feature">
            <h3>One link, all devices</h3>
            <p>The invitation is a fast static page, so it still opens on a weak signal at the venue.</p>
          </article>
        </section>
      </main>
      <footer className="foot">Wedding Studio · build free, publish when you are ready</footer>
    </>
  );
}
