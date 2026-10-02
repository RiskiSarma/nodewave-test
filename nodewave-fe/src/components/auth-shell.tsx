import type { ReactNode } from 'react';
import { Brand } from './brand';

export function AuthShell({
  title,
  subtitle,
  children,
}: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="hidden flex-col justify-between bg-wave-900 p-12 text-white lg:flex">
        <Brand className="text-xl" />
        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">
            Ship deliverables in the right order.
          </h2>
          <p className="mt-4 text-wave-100">
            One board for product, design, frontend and backend — with the client seeing only the
            progress that matters to them.
          </p>
        </div>
        <p className="text-sm text-wave-100/70">Tasks unlock when their prerequisites are done.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Brand className="mb-8 text-xl lg:hidden" />
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-soft">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
