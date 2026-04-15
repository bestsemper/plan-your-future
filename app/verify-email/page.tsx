"use client";

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { resendVerificationEmail } from '../actions';
import { Icon } from '../components/Icon';

// Exponential backoff delays matching the server: 30s, 5min, 30min
const RESEND_DELAYS = [30, 300, 1800];

function formatSecs(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [cooldown, setCooldown] = useState(0);
  const [resendAttempt, setResendAttempt] = useState(0);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [cooldown]);

  async function handleResend() {
    if (!email || cooldown > 0 || status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');

    const res = await resendVerificationEmail(email);

    if (res.error === 'too_soon' && res.secsLeft) {
      setCooldown(res.secsLeft);
      setStatus('idle');
      return;
    }
    if (res.error) {
      setErrorMsg(res.error as string);
      setStatus('error');
      return;
    }

    const nextAttempt = resendAttempt + 1;
    setResendAttempt(nextAttempt);
    const nextDelay = RESEND_DELAYS[Math.min(nextAttempt, RESEND_DELAYS.length - 1)];
    setCooldown(nextDelay);
    setStatus('sent');
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">Check Your Email</h1>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            We sent a verification link to your <span className="font-semibold text-text-primary">@virginia.edu</span> address.
          </p>
        </div>

        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <Icon name="mail" color="currentColor" width={28} height={28} className="text-uva-blue" />
          </div>

          <p className="text-text-secondary text-sm font-medium mt-1">
            Click the link in that email to verify your account.
          </p>
          <p className="text-text-secondary text-sm">
            The link expires in 15 minutes. If you don&apos;t see it, check your spam folder.
          </p>

          {status === 'sent' && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-600 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 w-full justify-center">
              <Icon name="check-circle" color="currentColor" width={15} height={15} />
              <span>Email resent successfully.</span>
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 w-full justify-center">
              <Icon name="alert-circle" color="currentColor" width={15} height={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {email && (
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || status === 'sending'}
              className="mt-1 text-sm font-medium text-uva-blue hover:underline disabled:text-text-secondary disabled:no-underline disabled:cursor-default transition-colors"
            >
              {status === 'sending'
                ? 'Sending…'
                : cooldown > 0
                ? `Resend in ${formatSecs(cooldown)}`
                : 'Resend email'}
            </button>
          )}

          <a href="/login" className="mt-1 text-sm text-uva-blue hover:underline font-medium">
            Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-10 px-4 text-center text-text-secondary">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
