"use client";

import { useState, useEffect } from 'react';
import { mockLogin, mockSignUp } from '../actions';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Icon } from '../components/Icon';

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
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">{isSignUp ? 'Create Account' : 'Sign In'}</h1>
            <span className="bg-badge-orange-bg text-uva-orange border border-uva-orange/60 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
              <Icon name="lock" color="currentColor" width={12} height={12} />
              NetBadge
            </span>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            {isSignUp ? 'Join Hoos Plan to build and track your 4-year academic journey.' : 'Log in to keep your 4-year academic journey on track.'}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
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
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Computing ID</label>
              <input 
                type="text" 
                name="computingId"
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
            {isSignUp && (
              <div>
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <button 
              type="submit" 
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer flex justify-center items-center gap-2"
            >
              {isSignUp ? 'Create Account' : 'Log In'}
              {!isSignUp && <Icon name="arrow-right" color="currentColor" width={16} height={16} />}
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
              className="w-full bg-panel-bg-alt border border-panel-border text-text-primary px-5 py-3 rounded-full hover:bg-hover-bg font-bold transition-colors cursor-pointer"
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