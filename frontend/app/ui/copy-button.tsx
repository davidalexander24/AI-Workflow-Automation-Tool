'use client';

import { useEffect, useRef, useState } from 'react';

export function CopyButton({
  value,
  label = 'COPY',
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={`font-mono text-[11px] tracking-wide text-ink-muted transition hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted ${className}`}
    >
      [{copied ? 'COPIED' : label}]
    </button>
  );
}
