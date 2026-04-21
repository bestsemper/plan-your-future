"use client";

import { useState, useEffect, Suspense } from 'react';
import { login } from '../actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Icon } from '../components/Icon';

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setTheme } = useTheme();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const tokenError = searchParams.get('error') === 'invalid-token';

  useEffect(() => {
    const currentTheme = window.localStorage.getItem('theme');
    const stashed = window.localStorage.getItem('stashed-theme');
    if (currentTheme && currentTheme !== 'light' && !stashed) {
      window.localStorage.setItem('stashed-theme', currentTheme);
    }
    setTheme('light');
  }, [setTheme]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const res = await login(email, password);
    if (res?.error) {
      setError(res.error);
    } else {
      const stashedTheme = window.localStorage.getItem('stashed-theme');
      if (stashedTheme) {
        setTheme(stashedTheme);
        window.localStorage.removeItem('stashed-theme');
      }
      router.push('/');
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">Sign In</h1>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            Log in to keep your academic journey on track.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {resetSuccess && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-600 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="check-circle" color="currentColor" width={16} height={16} />
              <span>Password reset successfully. Please log in.</span>
            </div>
          )}
          {tokenError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>That verification link is invalid or has expired. Please sign up again.</span>
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">UVA Email</label>
              <input
                type="email"
                name="email"
                placeholder="abc1de@virginia.edu"
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Password</label>
              <input
                type="password"
                name="password"
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
          </div>

          <div className="text-right -mt-2">
            <a href="/reset-password" className="text-xs text-uva-blue hover:underline font-medium">
              Forgot password?
            </a>
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <button
              type="submit"
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer flex justify-center items-center gap-2"
            >
              Log In
              <Icon name="arrow-right" color="currentColor" width={16} height={16} />
            </button>

            <div className="relative flex items-center justify-center py-2">
              <div className="border-t border-panel-border w-full absolute"></div>
              <span className="bg-panel-bg px-3 text-text-secondary text-xs font-semibold relative uppercase tracking-wider">or</span>
            </div>

            <a
              href="/create-account"
              className="w-full bg-panel-bg-alt border border-panel-border text-text-primary px-5 py-3 rounded-full hover:bg-hover-bg font-bold transition-colors text-center"
            >
              Don&apos;t have an account? Sign Up
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-10 px-4 text-center text-text-secondary">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
