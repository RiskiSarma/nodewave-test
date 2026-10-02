'use client';
import { ProgressBar } from '@/components/board/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useCreateProject, useProjects } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().max(2000),
});

function CreateProject() {
  const [open, setOpen] = useState(false);
  const create = useCreateProject();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await create.mutateAsync(v);
      toast.success('Project created');
      form.reset();
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent title="New project">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="p-name" error={form.formState.errors.name?.message}>
            <Input id="p-name" {...form.register('name')} />
          </Field>
          <Field label="Description" htmlFor="p-desc">
            <Textarea id="p-desc" {...form.register('description')} />
          </Field>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch, isPlaceholderData } = useProjects({
    searchFilters: debounced ? { name: debounced } : undefined,
    orderKey: 'createdAt',
    orderRule: 'desc',
    page,
    rows: 9,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Projects</h1>
          <p className="text-sm text-ink-soft">
            {user?.role === 'CLIENT'
              ? 'Your project and its progress.'
              : 'Projects you have access to.'}
          </p>
        </div>
        {user?.role === 'PM' && <CreateProject />}
      </div>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-soft"
          aria-hidden
        />
        <Input
          aria-label="Search projects"
          placeholder="Search projects…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />}
      {data && data.entries.length === 0 && (
        <EmptyState
          title={debounced ? 'No projects match your search' : 'No projects yet'}
          hint={
            debounced
              ? 'Try a different keyword.'
              : user?.role === 'PM'
                ? 'Create your first project.'
                : 'You have not been added to any project yet.'
          }
        />
      )}
      {data && data.entries.length > 0 && (
        <>
          <ul
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {data.entries.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block h-full rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md"
                >
                  <h2 className="font-bold">{p.name}</h2>
                  <p className="mb-4 mt-1 line-clamp-2 min-h-10 text-sm text-ink-soft">
                    {p.description || 'No description'}
                  </p>
                  <ProgressBar percent={p.metrics.percentComplete} />
                  <p className="mt-2 flex justify-between text-xs text-ink-soft">
                    <span>{p.metrics.percentComplete}% complete</span>
                    <span>
                      {p.metrics.done}/{p.metrics.total} tasks
                      {p.metrics.blocked > 0 ? ` · ${p.metrics.blocked} blocked` : ''}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {data.totalPage > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-soft">
                Page {data.page} of {data.totalPage}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= data.totalPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
