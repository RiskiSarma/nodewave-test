'use client';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { DEPARTMENT_LABEL } from '@/lib/labels';
import type { User } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
  department: z.enum(['UIUX', 'FRONTEND', 'BACKEND']),
});
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', department: 'FRONTEND' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', values);
      setSession(res.token, res.user);
      toast.success('Account created. Ask a PM to add you to a project.');
      router.replace('/projects');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthShell title="Create your account" subtitle="Sign up as a member of the internal team.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        </Field>
        <Field label="Department" htmlFor="department" error={errors.department?.message}>
          <Select id="department" {...form.register('department')}>
            {(['UIUX', 'FRONTEND', 'BACKEND'] as const).map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-wave-700 underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
