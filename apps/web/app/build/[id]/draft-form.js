'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { saveDraft } from '@/app/actions/weddings';
import { DESIGNS } from '@/lib/designs';
import { splitDateISO } from '@/lib/draft';

function FieldError({ message }) {
  if (!message) return null;
  return <p className="field-error">{message}</p>;
}

function savedTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DraftForm({ wedding, content }) {
  const [state, formAction, pending] = useActionState(saveDraft, { errors: {} });
  const errors = state?.errors || {};
  const { date, time } = splitDateISO(content.dateISO);
  const saved = savedTime(state?.savedAt || wedding.updated_at);

  return (
    <div className="build-grid">
      <form id="draft-form" action={formAction} className="stack">
        <input type="hidden" name="id" value={wedding.id} />

        {state?.error ? (
          <p className="alert error" role="alert">
            {state.error}
          </p>
        ) : null}

        {state?.savedAt ? (
          <p className="alert ok" role="status">
            Saved. You can close this page — the draft is stored in your account.
          </p>
        ) : null}

        <section className="card">
          <div className="section-title">
            <h2>The couple</h2>
            <span>Names are required</span>
          </div>

          <div className="stack">
            <div className="row">
              <div className="field">
                <label htmlFor="bride">First partner</label>
                <input
                  id="bride"
                  name="bride"
                  defaultValue={content.names[0]}
                  maxLength={60}
                  required
                  aria-invalid={errors.bride ? 'true' : undefined}
                />
                <FieldError message={errors.bride} />
              </div>

              <div className="field">
                <label htmlFor="groom">Second partner</label>
                <input
                  id="groom"
                  name="groom"
                  defaultValue={content.names[1]}
                  maxLength={60}
                  required
                  aria-invalid={errors.groom ? 'true' : undefined}
                />
                <FieldError message={errors.groom} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="date">Wedding date</label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={date}
                  aria-invalid={errors.date ? 'true' : undefined}
                />
                <span className="hint">You can leave this until later.</span>
                <FieldError message={errors.date} />
              </div>

              <div className="field">
                <label htmlFor="time">Start time</label>
                <input id="time" name="time" type="time" defaultValue={time} />
              </div>

              <div className="field">
                <label htmlFor="locale">Main language</label>
                <select id="locale" name="locale" defaultValue={content.locale}>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
                <span className="hint">The invitation still shows both languages.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>The day</h2>
            <span>Venue and timings</span>
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="venue-name">Venue name</label>
              <input
                id="venue-name"
                name="venueName"
                defaultValue={content.venue.name}
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="venue-address">Venue address</label>
              <textarea
                id="venue-address"
                name="venueAddress"
                defaultValue={content.venue.address}
                maxLength={240}
                rows={2}
              />
            </div>

            <div className="field">
              <label htmlFor="venue-maps">Google Maps link</label>
              <input
                id="venue-maps"
                name="venueMaps"
                type="url"
                defaultValue={content.venue.mapsUrl}
                placeholder="https://maps.google.com/…"
              />
              <span className="hint">Leave empty to search by venue name instead.</span>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="ceremony">Ceremony</label>
                <input
                  id="ceremony"
                  name="ceremony"
                  type="time"
                  defaultValue={content.schedule.ceremony}
                />
              </div>

              <div className="field">
                <label htmlFor="reception">Reception</label>
                <input
                  id="reception"
                  name="reception"
                  type="time"
                  defaultValue={content.schedule.reception}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>The story</h2>
            <span>One paragraph per line</span>
          </div>

          <div className="stack">
            <div className="field">
              <label htmlFor="story-en">Story, English</label>
              <textarea
                id="story-en"
                name="storyEn"
                defaultValue={content.story.en.join('\n')}
                rows={5}
                placeholder={'How you met.\nThe proposal.\nWhat comes next.'}
              />
            </div>

            <div className="field">
              <label htmlFor="story-id">Story, Bahasa Indonesia</label>
              <textarea
                id="story-id"
                name="storyId"
                defaultValue={content.story.id.join('\n')}
                rows={5}
              />
            </div>

            <div className="field">
              <label htmlFor="dress-en">Dress code, English</label>
              <textarea
                id="dress-en"
                name="dressEn"
                defaultValue={content.dress.en}
                rows={2}
                maxLength={600}
              />
            </div>

            <div className="field">
              <label htmlFor="dress-id">Dress code, Bahasa Indonesia</label>
              <textarea
                id="dress-id"
                name="dressId"
                defaultValue={content.dress.id}
                rows={2}
                maxLength={600}
              />
            </div>

            <div className="field">
              <label htmlFor="host">Hosted by</label>
              <input id="host" name="host" defaultValue={content.host} maxLength={80} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <h2>Design</h2>
            <span>Change it without losing your words</span>
          </div>

          <div className="field">
            <label htmlFor="design">Theme</label>
            <select id="design" name="design" defaultValue={wedding.design}>
              {DESIGNS.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      </form>

      <aside className="build-side">
        <div className="card">
          <div className="draft-meta" style={{ marginBottom: '0.65rem' }}>
            <span className={`badge ${wedding.status}`}>{wedding.status}</span>
            {saved ? <span>Saved {saved}</span> : null}
          </div>
          <p className="small muted" style={{ marginBottom: '0.35rem' }}>
            Invitation link
          </p>
          <code className="slug" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
            {wedding.slug}
          </code>
          <p className="inline-note" style={{ margin: 0 }}>
            {wedding.status === 'draft'
              ? 'Private for now. The link goes live when you publish after checkout.'
              : 'Published. Edits can be saved, and republishing ships them.'}
          </p>
        </div>

        <div className="card">
          <button className="button" type="submit" form="draft-form" disabled={pending}>
            {pending ? 'Saving…' : 'Save draft'}
          </button>
          <p className="inline-note" style={{ margin: '0.75rem 0 0' }}>
            <Link href="/dashboard">Back to all invitations</Link>
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.35rem' }}>Not in this step</h3>
          <p className="inline-note" style={{ margin: 0 }}>
            Photos, gift details, guest list and publishing arrive next. Everything you save here
            carries over.
          </p>
        </div>
      </aside>
    </div>
  );
}
