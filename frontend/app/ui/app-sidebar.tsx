'use client';

import { Bot, Home, Sparkles, Workflow } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  {
    href: '/',
    label: 'Overview',
    icon: Home,
  },
  {
    href: '/workflows',
    label: 'Workflows',
    icon: Workflow,
  },
];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="rounded-xl bg-teal-600/90 p-2 text-white shadow-sm shadow-teal-600/30">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Workflow</p>
              <p className="text-xs text-slate-500">Automation Dashboard</p>
            </div>
          </div>
          <nav className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isLinkActive(pathname, link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <aside className="hidden w-72 shrink-0 border-r border-slate-200/70 bg-white/80 px-5 py-8 backdrop-blur md:flex md:flex-col">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="rounded-xl bg-teal-600/90 p-2.5 text-white shadow-sm shadow-teal-600/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">AI Workflow</p>
            <p className="text-xs text-slate-500">Automation Dashboard</p>
          </div>
        </div>

        <nav className="mt-7 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isLinkActive(pathname, link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-teal-600/10 text-teal-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span
                  className={`rounded-lg p-1.5 transition ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-orange-200/70 bg-orange-50 p-4 text-sm text-slate-700 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-orange-500" />
            Prompt Tip
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Use variables like {'{{input}}'} in templates so each run adapts to user
            payloads instantly.
          </p>
        </div>
      </aside>
    </>
  );
}
