"use client";

import { ReactNode, useEffect, useRef, useState } from 'react';

// CustomDropdown Props
type CustomDropdownProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
};

// CustomDropdownContent Props
type CustomDropdownContentProps = {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
};

// CustomDropdownItem Props
type CustomDropdownItemProps = {
  onClick: () => void;
  selected?: boolean;
  children: ReactNode;
  icon?: ReactNode;
};

/**
 * Main dropdown wrapper component that handles opening/closing and positioning
 */
export function CustomDropdown({
  isOpen,
  onOpenChange,
  trigger,
  children,
  disabled = false,
  align = 'left',
  className = '',
}: CustomDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div onClick={() => !disabled && onOpenChange(!isOpen)}>
        {trigger}
      </div>

      {isOpen && !disabled && (
        <div className={`absolute z-20 mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden ${
          align === 'right' ? 'right-0' : 'left-0 w-full'
        }`}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Content container for dropdown items with scrolling support
 */
export function CustomDropdownContent({
  children,
  maxHeight = 'max-h-48',
  className = '',
}: CustomDropdownContentProps) {
  return (
    <div className={`${maxHeight} overflow-y-auto p-1.5 space-y-0.5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Individual dropdown item with optional selection checkmark
 */
export function CustomDropdownItem({
  onClick,
  selected = false,
  children,
  icon,
}: CustomDropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-2 ${
        selected ? 'bg-uva-blue/10 text-uva-blue font-semibold' : 'text-text-primary hover:bg-hover-bg'
      }`}
    >
      <span className="truncate">{children}</span>
      {selected && icon ? (
        icon
      ) : selected ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0 text-uva-blue"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
}
