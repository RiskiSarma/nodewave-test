import type { TaskStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, CircleDashed, Lock, PlayCircle } from 'lucide-react';

export type BoardStatus = TaskStatus | 'BLOCKED';

const META: Record<BoardStatus, { label: string; cls: string; icon: typeof Lock }> = {
  BLOCKED: { label: 'Blocked', cls: 'bg-blocked/10 text-blocked', icon: Lock },
  TODO: { label: 'To do', cls: 'bg-todo/10 text-todo', icon: CircleDashed },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-progress/10 text-progress', icon: PlayCircle },
  DONE: { label: 'Done', cls: 'bg-done/10 text-done', icon: CheckCircle2 },
};

export const boardStatusOf = (t: { status: TaskStatus; isBlocked: boolean }): BoardStatus =>
  t.isBlocked ? 'BLOCKED' : t.status;

export function StatusBadge({ status, className }: { status: BoardStatus; className?: string }) {
  const { label, cls, icon: Icon } = META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export const statusLabel = (s: BoardStatus) => META[s].label;
