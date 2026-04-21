"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '../actions';
import { Icon } from '../components/Icon';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setPassword('');
    setError(null);
    setIsOpen(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    setPassword('');
    setError(null);
  };

  const handleConfirm = () => {
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    startTransition(async () => {
      const result = await deleteAccount(password);
      if (result?.error) {
        setError(result.error);
      } else {
        router.push('/login?accountDeleted=true');
      }
    });
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isPending}
        className="w-full sm:w-auto px-4 py-2.5 border border-panel-border-strong rounded-full hover:bg-hover-bg font-semibold text-text-primary transition-colors cursor-pointer disabled:opacity-50 flex justify-center items-center gap-2"
      >
        <Icon name="trash" color="currentColor" width={16} height={16} />
        Delete Account
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={handleCancel}>
          <div className="w-full max-w-sm bg-panel-bg border border-panel-border rounded-3xl shadow-xl p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={handleCancel} className="absolute top-5 right-5 text-text-primary/80 hover:text-text-primary transition-colors cursor-pointer" aria-label="Close">
              <Icon name="x" color="currentColor" width={22} height={22} />
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-red-500/10">
                <Icon name="alert-circle" color="currentColor" width={22} height={22} className="text-red-500" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-heading text-center mb-2">Delete Account?</h2>
            <p className="text-sm text-text-secondary text-center mb-6">
              This cannot be undone. All your data will be permanently deleted. Enter your password to confirm.
            </p>

            <div className="mb-4">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-red-400 placeholder:text-text-tertiary"
                autoFocus
              />
              {error && (
                <p className="text-red-500 text-sm font-medium mt-2 px-1">{error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={handleCancel} disabled={isPending} className="flex-1 px-4 py-2.5 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-panel-bg-alt text-text-primary hover:bg-hover-bg">
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={isPending || !password} className="flex-1 px-4 py-2.5 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white bg-red-500/85 hover:bg-red-500">
                {isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
