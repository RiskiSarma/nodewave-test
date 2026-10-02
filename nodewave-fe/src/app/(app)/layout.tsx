'use client';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/states';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/labels';
import { useAuth } from '@/stores/auth';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

/** Guarded shell: everything under (app) requires a session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { token, user, hydrated, clear } = useAuth();

  useEffect(() => {
    if (hydrated && !token) router.replace('/login');
  }, [hydrated, token, router]);

  if (!hydrated || !token || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Spinner label="Checking session" />
      </main>
    );
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout'); // revokes the JWT server-side
    } catch {
      /* already expired – still clear locally */
    }
    clear();
    qc.clear();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/projects">
            <Brand />
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-ink-soft">{ROLE_LABEL[user.role]}</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" /> Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
