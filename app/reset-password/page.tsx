"use client";

import { useState, Suspense } from 'react';
import { resetPassword, initiatePasswordReset } from '../actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '../components/Icon';

const UVA_EMAIL_REGEX = /^[a-z0-9]+@virginia\.edu$/i;

function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    if (!UVA_EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid UVA email (e.g. abc1de@virginia.edu)');
      return;
    }

    setLoading(true);
    const res = await initiatePasswordReset(email);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      setEmailSent(true);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    
    setError(null);
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const res = await resetPassword(token, password);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/login?reset=success');
    }
  }

  if (token) {
    return (
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
      <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-heading">Choose a New Password</h1>
        </div>
        <p className="text-text-secondary text-sm font-medium">Must be at least 8 characters.</p>
      </div>

        <form className="space-y-6" onSubmit={handlePasswordSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">New Password</label>
              <input
                type="password"
                name="password"
                minLength={8}
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                minLength={8}
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">Check Your Email</h1>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            We sent a password reset link to your <span className="font-semibold text-text-primary">@virginia.edu</span> address.
          </p>
        </div>

        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <Icon name="mail" color="currentColor" width={28} height={28} className="text-uva-blue" />
          </div>
          <p className="text-text-secondary text-sm font-medium mt-1">
            Click the link in that email to reset your password.
          </p>
          <p className="text-text-secondary text-sm">
            The link expires in 15 minutes. If you don&apos;t see it, check your spam folder.
          </p>
          <a href="/login" className="mt-1 text-sm text-uva-blue hover:underline font-medium">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
      <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-heading">Reset Password</h1>
        </div>
        <p className="text-text-secondary text-sm font-medium">
          Enter your UVA email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleEmailSubmit}>
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
            <Icon name="alert-circle" color="currentColor" width={16} height={16} />
            <span>{error}</span>
          </div>
        )}

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

        <div className="flex flex-col gap-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <a
            href="/login"
            className="text-center text-sm text-text-secondary hover:text-text-primary font-medium transition-colors"
          >
            Back to Sign In
          </a>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <Suspense fallback={<div className="max-w-lg mx-auto p-8 text-center text-text-secondary">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
