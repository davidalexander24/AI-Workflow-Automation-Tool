'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { requestJson, Workflow } from '../lib/api';
import { ThemeToggle } from './theme-toggle';

const navLinks = [
  { href: '/workflows', label: 'workflows' },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const [workflowCount, setWorkflowCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const items = await requestJson<Workflow[]>('/workflows');
        if (!cancelled) {
          setWorkflowCount(items.length);
        }
      } catch {
        if (!cancelled) {
          setWorkflowCount(null);
        }
      }
    }

    void loadCount();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-rule bg-bg px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <Link href="/workflows" className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-tight text-ink">
              AI/WFA
            </span>
            <span className="font-mono text-[10px] text-ink-faint">v0.1.0</span>
          </Link>
          <nav className="flex items-center gap-3 font-mono text-[11px] tracking-wide">
            {navLinks.map((link) => {
              const active = isLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`uppercase ${active ? 'text-accent' : 'text-ink-muted hover:text-ink'}`}
                >
                  {active ? '>' : ' '} {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-rule bg-bg-sunken px-5 py-6 md:flex">
        <Link href="/workflows" className="flex items-baseline gap-2">
          <span className="font-mono text-base font-semibold tracking-tight text-ink">
            AI/WFA
          </span>
          <span className="font-mono text-[10px] text-ink-faint">v0.1.0</span>
        </Link>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
          AI WORKFLOW AUTOMATION
        </div>

        <div className="mt-8 border-t border-rule pt-6">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {'// navigation'}
          </p>
          <nav className="mt-3 space-y-1">
            {navLinks.map((link) => {
              const active = isLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 font-mono text-sm transition ${
                    active
                      ? 'text-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="w-3 text-accent">{active ? '>' : ''}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-4">
          <div className="border-t border-rule pt-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {'// stats'}
            </p>
            <dl className="mt-3 space-y-2 font-mono text-[11px]">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-muted">workflows</dt>
                <dd className="text-ink">
                  {workflowCount === null ? '—' : workflowCount}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-muted">status</dt>
                <dd
                  className={
                    workflowCount === null ? 'text-warn' : 'text-ok'
                  }
                >
                  {workflowCount === null ? 'OFFLINE' : 'OK'}
                </dd>
              </div>
            </dl>
          </div>

          <ThemeToggle />

          <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
            press <span className="text-ink-muted">⌘/Ctrl + Enter</span> to run
            a workflow from the input field.
          </p>
        </div>
      </aside>
    </>
  );
}
