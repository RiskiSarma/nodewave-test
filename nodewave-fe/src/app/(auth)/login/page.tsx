'use client';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import type { User } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type Values = z.infer<typeof schema>;

const DEMO = [
  { label: 'Product Manager', email: 'pm@nodewave.test' },
  { label: 'Frontend', email: 'frontend@nodewave.test' },
  { label: 'Client guest', email: 'client@nodewave.test' },
];

export default function LoginPage() {
  const router = useRouter();
  const { token, hydrated, setSession } = useAuth();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (hydrated && token) router.replace('/projects');
  }, [hydrated, token, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/login', values);
      setSession(res.token, res.user);
      router.replace('/projects');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your workspace.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-line bg-surface p-3">
        <p className="mb-2 text-xs font-semibold text-ink-soft">
          Demo accounts (password: Password123!)
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <Button
              key={d.email}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                form.setValue('email', d.email);
                form.setValue('password', 'Password123!');
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        New engineer?{' '}
        <Link href="/register" className="font-semibold text-wave-700 underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
