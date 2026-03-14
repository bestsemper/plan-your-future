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

  const isDanger = confirmVariant === 'danger';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-panel-bg border border-panel-border rounded-2xl shadow-xl p-6 relative" onClick={(e) => e.stopPropagation()}>

        {/* X close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-5 right-5 text-text-primary/80 hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        {/* Centered icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isDanger ? 'bg-red-100' : 'bg-uva-blue/10'}`}>
            {isDanger ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-uva-blue"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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
            className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-panel-bg-alt text-text-primary hover:bg-hover-bg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white ${isDanger ? 'bg-red-500/85 hover:bg-red-500' : 'bg-uva-blue/90 hover:bg-uva-blue'}`}
          >
            {isConfirming ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
