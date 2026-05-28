'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'wfa-theme';

function readStoredTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from DOM-attached theme on mount
    setTheme(readStoredTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — storage may be unavailable in private mode
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="group flex w-full items-center justify-between border border-rule px-3 py-2 font-mono text-[11px] tracking-wide text-ink-muted transition hover:border-rule-strong hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span>THEME</span>
      <span className="flex items-center gap-2">
        <span className={theme === 'dark' ? 'text-accent' : ''}>DARK</span>
        <span className="text-ink-faint">/</span>
        <span className={theme === 'light' ? 'text-accent' : ''}>LIGHT</span>
      </span>
    </button>
  );
}
