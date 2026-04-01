"use client";

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

// DropdownMenu Props
type DropdownMenuProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
};

// DropdownMenuContent Props
type DropdownMenuContentProps = {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
};

// DropdownMenuItem Props
type DropdownMenuItemProps = {
  onClick: () => void;
  selected?: boolean;
  children: ReactNode;
  icon?: ReactNode;
};

/**
 * Main dropdown wrapper component that handles opening/closing and positioning
 */
export function DropdownMenu({
  isOpen,
  onOpenChange,
  trigger,
  children,
  disabled = false,
  align = 'left',
  className = '',
}: DropdownMenuProps) {
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
        <div className={`absolute z-20 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden max-w-full ${
          align === 'right' ? 'right-0' : 'left-0'
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
export function DropdownMenuContent({
  children,
  maxHeight = 'max-h-48',
  className = '',
}: DropdownMenuContentProps) {
  return (
    <div className={`${maxHeight} overflow-y-auto overflow-x-hidden px-2 py-1.5 space-y-0.5 max-w-full ${className}`}>
      {children}
    </div>
  );
}

/**
 * Individual dropdown item with optional selection checkmark
 */
export function DropdownMenuItem({
  onClick,
  selected = false,
  children,
  icon,
}: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
        selected ? 'bg-hover-bg text-primary font-semibold' : 'text-text-primary hover:bg-hover-bg'
      }`}
    >
      <span className="truncate min-w-0">{children}</span>
      {selected && icon ? (
        icon
      ) : selected ? (
        <Icon
          name="check"
          color="currentColor"
          width={14}
          height={14}
          className="w-3.5 h-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
