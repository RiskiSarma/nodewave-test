import { EmptyState } from '@/components/ui/states';
import { type BoardStatus, StatusBadge, boardStatusOf } from '@/components/ui/status';
import type { Task } from '@/lib/types';
import { TaskCard } from './task-card';

const COLUMNS: { key: BoardStatus; hint: string }[] = [
  { key: 'BLOCKED', hint: 'Waiting for prerequisites' },
  { key: 'TODO', hint: 'Ready to start' },
  { key: 'IN_PROGRESS', hint: 'Being worked on' },
  { key: 'DONE', hint: 'Completed' },
];

export function TaskBoard({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        hint="Create the first task to start planning this project."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => boardStatusOf(t) === col.key);
        return (
          <section key={col.key} aria-label={col.key} className="rounded-xl bg-line/40 p-3">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <StatusBadge status={col.key} />
                <p className="mt-1 text-xs text-ink-soft">{col.hint}</p>
              </div>
              <span className="text-sm font-bold text-ink-soft">{items.length}</span>
            </header>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-soft">
                  Nothing here
                </p>
              ) : (
                items.map((t) => <TaskCard key={t.id} task={t} onOpen={onOpen} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
