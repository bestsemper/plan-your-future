"use client";

import { useState, useEffect } from 'react';
import { mockLogin, mockSignUp } from '../actions';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const currentTheme = window.localStorage.getItem('theme');
    const stashed = window.localStorage.getItem('stashed-theme');
    if (currentTheme && currentTheme !== 'light' && !stashed) {
      window.localStorage.setItem('stashed-theme', currentTheme);
    }
    setTheme('light');
  }, [setTheme]);

  async function handleAction(formData: FormData) {
    const res = isSignUp
      ? await mockSignUp(
          formData.get('computingId') as string,
          formData.get('password') as string,
          formData.get('displayName') as string
        )
      : await mockLogin(
          formData.get('computingId') as string,
          formData.get('password') as string
        );

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const computingId = formData.get('computingId') as string;
    const password = formData.get('password') as string;
    setError(null);

    if (isSignUp) {
      const displayName = formData.get('displayName') as string;
      const confirmPassword = formData.get('confirmPassword') as string;

      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }
    
    await handleAction(formData);
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="max-w-md mx-auto mt-12 bg-panel-bg border border-panel-border p-8 rounded-lg">
        <div className="flex flex-col mb-6 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">{isSignUp ? 'Create Account' : 'Sign In'}</h1>
            <span className="bg-badge-orange-bg text-uva-orange border border-uva-orange px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              NetBadge
            </span>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            {isSignUp ? 'Join Hoos Plan to build and track your 4-year academic journey.' : 'Log in to keep your 4-year academic journey on track.'}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-md text-sm font-semibold flex items-center gap-2" role="alert">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Display Name</label>
                <input 
                  type="text" 
                  name="displayName"
                  className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none transition-all"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Computing ID</label>
              <input 
                type="text" 
                name="computingId"
                className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Password</label>
              <input 
                type="password" 
                name="password"
                className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none transition-all"
                required
              />
            </div>
            {isSignUp && (
              <div>
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  className="w-full p-3 border border-panel-border rounded-md bg-input-bg text-text-primary outline-none transition-all"
                  required
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <button 
              type="submit" 
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-md hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer flex justify-center items-center gap-2"
            >
              {isSignUp ? 'Create Account' : 'Log In'}
              {!isSignUp && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>}
            </button>
            
            <div className="relative flex items-center justify-center py-2">
              <div className="border-t border-panel-border w-full absolute"></div>
              <span className="bg-panel-bg px-3 text-text-secondary text-xs font-semibold relative uppercase tracking-wider">or</span>
            </div>

            <button 
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="w-full bg-panel-bg-alt border border-panel-border text-text-primary px-5 py-3 rounded-md hover:bg-hover-bg font-bold transition-colors cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </form>
      </div>

      <div className="text-center mt-6">
        <p className="text-sm font-medium text-text-secondary">
          This is a mock application. You can enter any mock Computing ID.
        </p>
      </div>
    </div>
  );
}