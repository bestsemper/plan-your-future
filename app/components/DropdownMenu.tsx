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
  contentClassName?: string;
  onClear?: () => void;
  showClearButton?: boolean;
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
        <div className={`absolute z-20 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden max-w-full ${
          align === 'right' ? 'right-0' : 'left-0'
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
    <div className={`${maxHeight} flex flex-col overflow-y-auto overflow-x-hidden max-w-full ${className}`}>
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
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between ${
        selected ? 'bg-hover-bg text-primary' : 'text-text-primary hover:bg-hover-bg'
      }`}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className={`truncate ${selected ? 'font-semibold' : ''}`}>{children}</span>
        {description && (
          <span className={`text-xs truncate mt-0.5 ${selected ? 'text-primary/70 font-normal' : 'text-text-muted'}`}>
            {description}
          </span>
        )}
      </div>
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
