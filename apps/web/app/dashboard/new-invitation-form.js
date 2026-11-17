'use client';

import { useActionState, useEffect, useState } from 'react';
import { createDraft } from '@/app/actions/weddings';
import { DESIGNS } from '@/lib/designs';

const PICKED_EVENT = 'studio:design-pick';

export default function NewInvitationForm() {
  const [state, formAction, pending] = useActionState(createDraft, { errors: {} });
  const [design, setDesign] = useState(DESIGNS[0].id);
  const errors = state?.errors || {};

  useEffect(() => {
    const sync = (event) => {
      if (typeof event.detail === 'string' && DESIGNS.some((d) => d.id === event.detail)) {
        setDesign(event.detail);
      }
    };
    window.addEventListener(PICKED_EVENT, sync);
    return () => window.removeEventListener(PICKED_EVENT, sync);
  }, []);

  const previewInvitation = (event) => {
    event.preventDefault();
    const form = event.currentTarget.form;
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const s = String(value).trim();
      if (s) params.set(key, s);
    }
    window.open(`/preview/new?${params.toString()}`, '_blank', 'noopener');
  };

  return (
    <form action={formAction} className="form">
      {state?.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="row">
        <div className="field">
          <label htmlFor="new-bride">First partner</label>
          <input
            id="new-bride"
            name="bride"
            autoComplete="off"
            maxLength={60}
            required
            aria-invalid={errors.bride ? 'true' : undefined}
          />
          {errors.bride ? <p className="field-error">{errors.bride}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="new-groom">Second partner</label>
          <input
            id="new-groom"
            name="groom"
            autoComplete="off"
            maxLength={60}
            required
            aria-invalid={errors.groom ? 'true' : undefined}
          />
          {errors.groom ? <p className="field-error">{errors.groom}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="new-date">Wedding date</label>
          <input id="new-date" name="date" type="date" aria-invalid={errors.date ? 'true' : undefined} />
          {errors.date ? <p className="field-error">{errors.date}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="new-time">Start time</label>
          <input id="new-time" name="time" type="time" defaultValue="10:00" />
        </div>

        <div className="field">
          <label htmlFor="new-design">Design</label>
          <select id="new-design" name="design" value={design} onChange={(event) => setDesign(event.target.value)}>
            {DESIGNS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="hint">Pick one in the gallery above — the dropdown follows your selection.</span>
        </div>
      </div>

      <div className="hero-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Creating draft…' : 'Create draft'}
        </button>
        <button className="button secondary" type="button" onClick={previewInvitation}>
          Preview design
        </button>
      </div>
    </form>
  );
}
