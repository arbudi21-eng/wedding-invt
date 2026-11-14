'use client';

import { useActionState } from 'react';
import { createDraft } from '@/app/actions/weddings';
import { DESIGNS } from '@/lib/designs';

export default function NewInvitationForm() {
  const [state, formAction, pending] = useActionState(createDraft, { errors: {} });
  const errors = state?.errors || {};

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
          <select id="new-design" name="design" defaultValue={DESIGNS[0].id}>
            {DESIGNS.map((design) => (
              <option key={design.id} value={design.id}>
                {design.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Creating draft…' : 'Create draft'}
        </button>
      </div>
    </form>
  );
}
