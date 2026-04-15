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
  align?: 'left' | 'right' | 'center';
  className?: string;
  contentClassName?: string;
  onClear?: () => void;
  showClearButton?: boolean;
  tutorialTarget?: string;
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
  description?: ReactNode;
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
  contentClassName = '',
  onClear,
  showClearButton = false,
  tutorialTarget,
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
    <div className={`relative ${className}`} ref={containerRef} data-dropdown-root data-tutorial-target={tutorialTarget || undefined}>
      <div className="relative" onClick={() => !disabled && onOpenChange(!isOpen)}>
        {trigger}
        {showClearButton && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-danger-text p-2 cursor-pointer flex items-center justify-center transition-all"
            aria-label="Clear selection"
          >
            <Icon
              name="x"
              color="currentColor"
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <div data-tutorial-dropdown-content className={`absolute z-20 mt-1.5 bg-panel-bg border border-panel-border rounded-3xl shadow-lg overflow-hidden max-w-full ${
          align === 'right' ? 'right-0 w-full' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0 w-full'
        } ${contentClassName}`}>
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
    <div data-tutorial-dropdown-content className={`${maxHeight} flex flex-col overflow-y-auto overflow-x-hidden max-w-full ${className}`}>
      {children}
    </div>
  );
}

// DropdownMenuSearch Props
type DropdownMenuSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Embedded search input for dropdown menus
 */
export function DropdownMenuSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: DropdownMenuSearchProps) {
  return (
    <div className={`border-b border-panel-border bg-panel-bg ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-tertiary"
      />
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
  description,
}: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center ${
        selected ? 'bg-hover-bg text-text-primary font-semibold' : 'text-text-primary hover:bg-hover-bg/50'
      }`}
    >
      <div className="flex flex-col min-w-0">
        <span className="truncate">{children}</span>
        {description && (
          <span className="text-xs truncate mt-0.5 text-text-muted">
            {description}
          </span>
        )}
      </div>
    </button>
  );
}
