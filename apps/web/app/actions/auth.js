'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/config';

function text(formData, key) {
  return String(formData.get(key) ?? '').trim();
}

/** Only allow same-origin relative paths. `//evil.com` is not a path. */
function safeNext(value) {
  const next = String(value ?? '');
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/dashboard';
  return next;
}

function authMessage(error) {
  const message = String(error?.message || 'Something went wrong. Please try again.');
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email address first — check your inbox.';
  if (/user already registered/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/password should be at least/i.test(message)) return message;
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  return message;
}

export async function login(prevState, formData) {
  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email || !password) {
    return { error: 'Enter both your email and password.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authMessage(error) };

  redirect(next);
}

export async function signup(prevState, formData) {
  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { error: 'Use at least 8 characters for your password.' };
  }
  if (password !== confirm) {
    return { error: 'The two passwords do not match.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { error: authMessage(error) };
  if (data.session) redirect('/dashboard');

  return {
    notice: 'Check your inbox and confirm your email, then sign in. The link is valid for 24 hours.',
  };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error || !data?.url) {
    redirect(`/login?error=${encodeURIComponent(authMessage(error))}`);
  }

  redirect(data.url);
}
