"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

export type SelectOption = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyLabel,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (!searchable || !trimmedQuery) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(trimmedQuery));
  }, [options, searchQuery, searchable]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        className="w-full px-4 py-3 border border-panel-border rounded-xl bg-input-bg text-text-primary text-left cursor-pointer flex items-center justify-between gap-3 focus:outline-none focus:border-white focus:ring-2 focus:ring-white/20 hover:border-panel-border-strong transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? 'truncate' : 'truncate text-text-tertiary'}>
          {selectedOption?.label ?? placeholder}
        </span>
        <Icon
          name="chevron-down"
          color="currentColor"
          width={16}
          height={16}
          className={`w-4 h-4 shrink-0 text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-20 w-full mt-1.5 bg-panel-bg border border-panel-border rounded-xl shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-panel-border bg-panel-bg">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-2 border border-panel-border rounded-lg bg-input-bg text-text-primary text-sm outline-none focus:border-white focus:ring-2 focus:ring-white/20 transition-all"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5" role="listbox">
            {emptyLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${value === '' ? 'bg-badge-blue-bg text-badge-blue-text font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
              >
                {emptyLabel}
              </button>
            )}

            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors flex items-center justify-between gap-2 ${value === option.value ? 'bg-badge-blue-bg text-badge-blue-text font-semibold' : 'text-text-primary hover:bg-hover-bg'}`}
              >
                <span className="truncate">{option.label}</span>
                {value === option.value && (
                  <Icon
                    name="check"
                    color="currentColor"
                    width={14}
                    height={14}
                    className="w-3.5 h-3.5 shrink-0 text-badge-blue-text"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}

            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-secondary">No options found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}