import { DEPARTMENT_LABEL } from '@/lib/labels';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Lock, MessageSquare, Paperclip } from 'lucide-react';

export function TaskCard({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      data-testid="task-card"
      className={cn(
        'w-full rounded-lg border bg-surface p-3 text-left transition-shadow hover:shadow-md',
        task.isBlocked ? 'border-blocked/40' : 'border-line',
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{task.title}</p>
        {task.isBlocked && (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blocked" aria-label="Blocked" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
        <span className="rounded bg-wave-50 px-1.5 py-0.5 font-semibold text-wave-700">
          {DEPARTMENT_LABEL[task.department]}
        </span>
        <span>{task.assignee?.name ?? 'Unassigned'}</span>
      </div>

      {task.isBlocked && (
        <p className="mt-2 rounded bg-blocked/10 px-2 py-1 text-xs font-medium text-blocked">
          Waiting on {task.blockedBy.map((b) => b.title).join(', ')}
        </p>
      )}

      {(task.commentCount > 0 || task.attachmentCount > 0 || task.dependsOn.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
          {task.dependsOn.length > 0 && (
            <span>
              {task.dependsOn.filter((d) => d.status === 'DONE').length}/{task.dependsOn.length}{' '}
              prerequisites
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" aria-hidden /> {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" aria-hidden /> {task.attachmentCount}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
