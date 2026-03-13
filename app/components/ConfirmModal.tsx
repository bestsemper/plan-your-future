"use client";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const confirmButtonClass =
    confirmVariant === 'danger'
      ? 'border-red-400 text-red-500 hover:bg-red-500/10'
      : 'border-panel-border-strong text-text-primary hover:bg-hover-bg';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-md bg-panel-bg border border-panel-border rounded-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-heading mb-2">{title}</h2>
        <p className="text-sm text-text-secondary mb-6">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 border border-panel-border-strong rounded font-semibold text-text-primary hover:bg-hover-bg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`px-4 py-2 border rounded font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${confirmButtonClass}`}
          >
            {isConfirming ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
