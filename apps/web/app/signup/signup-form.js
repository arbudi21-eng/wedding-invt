'use client';

import { useActionState } from 'react';
import { signInWithGoogle, signup } from '@/app/actions/auth';

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, {});

  return (
    <>
      {state?.error ? (
        <p className="alert error" role="alert">
          {state.error}
        </p>
      ) : null}

      {state?.notice ? (
        <p className="alert ok" role="status">
          {state.notice}
        </p>
      ) : null}

      <form action={formAction} className="form">
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
          <label htmlFor="password">Kata sandi</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="hint">Minimal 8 karakter.</span>
        </div>

        <div className="field">
          <label htmlFor="confirm">Konfirmasi kata sandi</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Membuat akun…' : 'Buat akun'}
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
