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
  const message = String(error?.message || 'Terjadi kesalahan. Silakan coba lagi.');
  if (/invalid login credentials/i.test(message)) return 'Email atau kata sandi tidak cocok.';
  if (/email not confirmed/i.test(message)) return 'Konfirmasi alamat email Anda terlebih dahulu — periksa kotak masuk.';
  if (/user already registered/i.test(message)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/password should be at least/i.test(message)) return message;
  if (/rate limit|too many/i.test(message)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  return message;
}

export async function login(prevState, formData) {
  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email || !password) {
    return { error: 'Masukkan email dan kata sandi Anda.' };
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
    return { error: 'Masukkan alamat email yang valid.' };
  }
  if (password.length < 8) {
    return { error: 'Gunakan minimal 8 karakter untuk kata sandi.' };
  }
  if (password !== confirm) {
    return { error: 'Kedua kata sandi tidak sama.' };
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
    notice: 'Periksa kotak masuk Anda dan konfirmasi email, lalu masuk. Tautan berlaku selama 24 jam.',
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
