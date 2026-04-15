"use client";

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon } from '../../components/Icon';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();

  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConfirm() {
    if (!token || status === 'loading') return;
    setStatus('loading');

    const res = await fetch('/api/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      if (data.error === 'invalid-token') {
        router.push('/login?error=invalid-token');
      } else {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
      }
      return;
    }

    router.push(data.newUser ? '/?newUser=1' : '/');
  }

  if (!token) {
    router.push('/login?error=invalid-token');
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <h1 className="text-3xl font-bold text-heading mb-2">Confirm Your Email</h1>
          <p className="text-text-secondary text-sm font-medium">
            One last step — click below to complete your Hoos Plan account.
          </p>
        </div>

        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <Icon name="mail" color="currentColor" width={28} height={28} className="text-uva-blue" />
          </div>

          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 w-full justify-center">
              <Icon name="alert-circle" color="currentColor" width={15} height={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={status === 'loading'}
            className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer disabled:opacity-60 flex justify-center items-center gap-2"
          >
            {status === 'loading' ? 'Verifying…' : 'Complete Sign Up'}
            {status !== 'loading' && <Icon name="arrow-right" color="currentColor" width={16} height={16} />}
          </button>

          <a href="/login" className="text-sm text-uva-blue hover:underline font-medium">
            Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-10 px-4 text-center text-text-secondary">Loading…</div>}>
      <ConfirmContent />
    </Suspense>
  );
}
