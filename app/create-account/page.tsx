"use client";

import { useState, useEffect } from 'react';
import { initiateSignup } from '../actions';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Icon } from '../components/Icon';

const UVA_EMAIL_REGEX = /^[a-z0-9]+@virginia\.edu$/i;

export default function CreateAccountPage() {
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  // Password requirement validators
  const passwordRequirements = {
    length: password.length >= 9,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const isPasswordValid = Object.values(passwordRequirements).every(req => req);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

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
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();

    if (!UVA_EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid UVA email (e.g. abc1de@virginia.edu)');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!isPasswordValid) {
      setError('Password does not meet all requirements');
      return;
    }

    const res = await initiateSignup(email, password, displayName);
    if (res?.error) {
      setError(res.error);
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(email.toLowerCase().trim())}`);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">Create Account</h1>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            Join Hoos Plan to build and track your academic journey.
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
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  placeholder="John"
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Doe"
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
            </div>
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.26 3.64"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  )}
                </button>
              </div>
              {password && (
                <div className="mt-3 space-y-2">
                  <div className={`text-xs flex items-center gap-2 ${passwordRequirements.length ? 'text-green-600' : 'text-text-secondary'}`}>
                    {passwordRequirements.length ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    )}
                    <span>At least 9 characters</span>
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${passwordRequirements.uppercase ? 'text-green-600' : 'text-text-secondary'}`}>
                    {passwordRequirements.uppercase ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    )}
                    <span>One uppercase letter (A-Z)</span>
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${passwordRequirements.lowercase ? 'text-green-600' : 'text-text-secondary'}`}>
                    {passwordRequirements.lowercase ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    )}
                    <span>One lowercase letter (a-z)</span>
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${passwordRequirements.number ? 'text-green-600' : 'text-text-secondary'}`}>
                    {passwordRequirements.number ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    )}
                    <span>One number (0-9)</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.26 3.64"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  )}
                </button>
              </div>
              {confirmPassword && (
                <div className={`mt-2 text-xs flex items-center gap-2 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                  {passwordsMatch ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  )}
                  <span>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <button
              type="submit"
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer"
            >
              Create Account
            </button>

            <div className="relative flex items-center justify-center py-2">
              <div className="border-t border-panel-border w-full absolute"></div>
              <span className="bg-panel-bg px-3 text-text-secondary text-xs font-semibold relative uppercase tracking-wider">or</span>
            </div>

            <a
              href="/login"
              className="w-full bg-panel-bg-alt border border-panel-border text-text-primary px-5 py-3 rounded-full hover:bg-hover-bg font-bold transition-colors text-center"
            >
              Already have an account? Sign In
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
