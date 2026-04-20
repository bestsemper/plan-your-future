"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '../actions';
import ConfirmModal from '../components/ConfirmModal';
import { Icon } from '../components/Icon';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteClick = () => {
    setError(null);
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    startTransition(async () => {
      const result = await deleteAccount();
      if (result?.error) {
        setError(result.error);
        setIsConfirmOpen(false);
      } else {
        // Redirect to login after successful deletion
        router.push('/login?accountDeleted=true');
      }
    });
  };

  const handleCancel = () => {
    setIsConfirmOpen(false);
    setError(null);
  };

  return (
    <>
      <button
        onClick={handleDeleteClick}
        disabled={isPending}
        className="w-full sm:w-auto px-4 py-2 border border-panel-border-strong rounded-full hover:bg-hover-bg font-semibold text-text-primary transition-colors cursor-pointer disabled:opacity-50 flex justify-center items-center gap-2"
      >
        <Icon name="trash" color="currentColor" width={16} height={16} />
        Delete Account
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 mt-3">
          <Icon name="alert-circle" color="currentColor" width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Delete Account?"
        message="This action cannot be undone. All your data will be permanently deleted. Your non-anonymous forum posts will be attributed to [deleted]."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        isConfirming={isPending}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancel}
      />
    </>
  );
}
