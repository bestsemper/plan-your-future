"use client";
import { useState, useEffect } from 'react';
import { useTheme } from "next-themes";
import { Icon } from "../components/Icon";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const isDark = mounted ? resolvedTheme === 'dark' : false;

  return (
    <button 
      onClick={toggleTheme}
      className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-panel-bg-alt border border-panel-border-strong rounded-xl hover:bg-hover-bg transition-colors text-text-primary font-semibold cursor-pointer shrink-0"
    >
      {(!mounted ? false : !isDark) ? (
        <>
          <Icon name="moon" color="currentColor" width={18} height={18} className="shrink-0" />
          Dark Mode
        </>
      ) : (
        <>
          <Icon name="sun" color="currentColor" width={18} height={18} className="shrink-0" />
          Light Mode
        </>
      )}
    </button>
  );
}