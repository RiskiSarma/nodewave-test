'use client';
import { Spinner } from '@/components/ui/states';
import { useAuth } from '@/stores/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  const { token, hydrated } = useAuth();
  useEffect(() => {
    if (hydrated) router.replace(token ? '/projects' : '/login');
  }, [hydrated, token, router]);
  return (
    <main className="grid min-h-screen place-items-center">
      <Spinner />
    </main>
  );
}
