'use client';
import { ClientView } from '@/components/board/client-view';
import { CreateTaskDialog } from '@/components/board/create-task-dialog';
import { ActivityPanel, StandupPanel, TeamPanel } from '@/components/board/panels';
import { MetricsSummary } from '@/components/board/progress';
import { TaskBoard } from '@/components/board/task-board';
import { TaskDrawer } from '@/components/board/task-drawer';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useProject, useTasks } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import type { Task } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

const tabCls =
  '-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-ink-soft data-[state=active]:border-wave-600 data-[state=active]:text-ink';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  if (user?.role === 'CLIENT') return <ClientView projectId={id} />;
  return <InternalProject projectId={id} isPm={user?.role === 'PM'} />;
}

function InternalProject({ projectId, isPm }: { projectId: string; isPm: boolean }) {
  const project = useProject(projectId);
  const tasks = useTasks<Task>(projectId);
  const [openId, setOpenId] = useState<string | null>(null);
  const members = project.data?.members ?? [];

  if (project.error)
    return <ErrorState message={errorMessage(project.error)} onRetry={() => project.refetch()} />;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">
              {project.data?.name ?? <Skeleton className="h-8 w-64" />}
            </h1>
            <p className="text-sm text-ink-soft">{project.data?.description}</p>
          </div>
          {isPm && <CreateTaskDialog projectId={projectId} members={members} />}
        </div>
      </div>

      {project.data && <MetricsSummary metrics={project.data.metrics} />}

      <Tabs.Root defaultValue="board">
        <Tabs.List className="mb-4 flex overflow-x-auto border-b border-line">
          <Tabs.Trigger value="board" className={tabCls}>
            Board
          </Tabs.Trigger>
          <Tabs.Trigger value="standup" className={tabCls}>
            Daily standup
          </Tabs.Trigger>
          <Tabs.Trigger value="activity" className={tabCls}>
            Activity
          </Tabs.Trigger>
          {isPm && (
            <Tabs.Trigger value="team" className={tabCls}>
              Team
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="board">
          {tasks.isLoading && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          )}
          {tasks.error && (
            <ErrorState message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
          )}
          {tasks.data && <TaskBoard tasks={tasks.data.entries} onOpen={setOpenId} />}
        </Tabs.Content>
        <Tabs.Content value="standup">
          <StandupPanel projectId={projectId} />
        </Tabs.Content>
        <Tabs.Content value="activity">
          <ActivityPanel projectId={projectId} />
        </Tabs.Content>
        {isPm && (
          <Tabs.Content value="team">
            <TeamPanel projectId={projectId} members={members} />
          </Tabs.Content>
        )}
      </Tabs.Root>

      <TaskDrawer
        projectId={projectId}
        taskId={openId}
        allTasks={tasks.data?.entries ?? []}
        members={members}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
