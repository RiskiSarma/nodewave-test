'use client';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { StatusBadge, boardStatusOf } from '@/components/ui/status';
import { useProject, useTasks } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { ClientTask } from '@/lib/types';
import { MetricsSummary } from './progress';

/** Client Guest: aggregate progress + explicitly shared tasks. No names, avatars or comments exist in the payload. */
export function ClientView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const tasks = useTasks<ClientTask>(projectId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">
          {project.data?.name ?? <Skeleton className="h-8 w-64" />}
        </h1>
        <p className="mt-1 text-ink-soft">{project.data?.description}</p>
      </header>

      {project.isLoading && <Skeleton className="h-40" />}
      {project.error && (
        <ErrorState message={errorMessage(project.error)} onRetry={() => project.refetch()} />
      )}
      {project.data && <MetricsSummary metrics={project.data.metrics} />}

      <section aria-label="Shared deliverables">
        <h2 className="mb-3 text-lg font-bold">Shared deliverables</h2>
        {tasks.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {tasks.error && (
          <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
        )}
        {tasks.data?.entries.length === 0 && (
          <EmptyState
            title="Nothing shared yet"
            hint="Your project manager hasn't shared any deliverables with you yet."
          />
        )}
        <ul className="space-y-2">
          {tasks.data?.entries.map((t) => (
            <li key={t.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t.title}</p>
                <StatusBadge status={boardStatusOf(t)} />
              </div>
              {t.description && <p className="mt-1 text-sm text-ink-soft">{t.description}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
