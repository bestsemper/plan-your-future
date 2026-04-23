"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '../actions';
import { Icon } from '../components/Icon';

const CONFIRM_TEXT = 'delete account';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setValue('');
    setError(null);
    setIsOpen(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    setValue('');
    setError(null);
  };

  const handleConfirm = () => {
    if (value.toLowerCase() !== CONFIRM_TEXT) return;
    startTransition(async () => {
      const result = await deleteAccount();
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
        className="text-sm font-semibold text-red-500 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
      >
        Delete
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
              This cannot be undone. All your data will be permanently deleted. Type <span className="font-semibold text-text-primary">delete account</span> to confirm.
            </p>

            <div className="mb-4">
              <input
                type="text"
                placeholder="delete account"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
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
              <button type="button" onClick={handleConfirm} disabled={isPending || value.toLowerCase() !== CONFIRM_TEXT} className="flex-1 px-4 py-2.5 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white bg-red-500/85 hover:bg-red-500">
                {isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
