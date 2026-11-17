'use client';

import { useActionState } from 'react';
import { login, signInWithGoogle } from '@/app/actions/auth';

export default function LoginForm({ next, initialError }) {
  const [state, formAction, pending] = useActionState(
    login,
    initialError ? { error: initialError } : {}
  );

  return (
    <>
      {state?.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="form">
        <input type="hidden" name="next" value={next} />

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Masuk…' : 'Masuk'}
        </button>
      </form>

      <div className="divider" style={{ margin: '1.25rem 0' }}>
        atau
      </div>

      <form action={signInWithGoogle}>
        <button className="button secondary" type="submit" style={{ width: '100%' }}>
          Lanjutkan dengan Google
        </button>
      </form>
    </>
  );
}
