"use client";

import { useState, useEffect } from 'react';
import { useTheme } from "next-themes";
import { Icon } from "../components/Icon";

const options = [
  { value: 'light',  label: 'Light',  icon: 'sun'     },
  { value: 'dark',   label: 'Dark',   icon: 'moon'    },
  { value: 'system', label: 'System', icon: 'monitor' },
] as const;

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  const current = mounted ? (theme ?? 'system') : 'system';

  return (
    <div className="flex items-center gap-0.5 bg-hover-bg border border-panel-border rounded-full p-1 shrink-0 self-start">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            current === opt.value
              ? 'bg-panel-bg text-text-primary'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          {opt.icon && <Icon name={opt.icon} color="currentColor" width={13} height={13} className="shrink-0" />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
