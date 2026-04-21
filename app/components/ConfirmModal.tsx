"use client";

import { Icon } from "./Icon";

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

  const isDanger = confirmVariant === 'danger';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-panel-bg border border-panel-border rounded-3xl shadow-xl p-6 relative" onClick={(e) => e.stopPropagation()}>

        {/* X close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-5 right-5 text-text-primary/80 hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <Icon name="x" color="currentColor" width={22} height={22} />
        </button>

        {/* Centered icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDanger ? 'bg-red-500/10' : 'bg-badge-blue-bg'}`}>
            {isDanger ? (
              <Icon name="alert-circle" color="currentColor" width={22} height={22} className="text-red-500" />
            ) : (
              <Icon name="help-circle" color="currentColor" width={22} height={22} className="text-badge-blue-text" />
            )}
          </div>
        </div>

        {/* Text */}
        <h2 className="text-xl font-semibold text-heading text-center mb-2">{title}</h2>
        <p className="text-sm text-text-secondary text-center mb-6">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 px-4 py-2.5 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-panel-bg-alt text-text-primary hover:bg-hover-bg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`flex-1 px-4 py-2.5 rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isDanger ? 'text-white bg-red-500/85 hover:bg-red-500' : 'text-button-text bg-button-bg hover:bg-button-hover'}`}
          >
            {isConfirming ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
