import type { Metrics } from '@/lib/types';

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Project completion"
      className={`h-2 w-full overflow-hidden rounded-full bg-line ${className ?? ''}`}
    >
      <div className="h-full rounded-full bg-wave-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function MetricsSummary({ metrics }: { metrics: Metrics }) {
  const items = [
    { label: 'Done', value: metrics.done, cls: 'text-done' },
    { label: 'In progress', value: metrics.inProgress, cls: 'text-progress' },
    { label: 'To do', value: metrics.todo, cls: 'text-todo' },
    { label: 'Blocked', value: metrics.blocked, cls: 'text-blocked' },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-end justify-between gap-4">
        <p className="text-3xl font-extrabold">{metrics.percentComplete}% complete</p>
        <p className="text-sm text-ink-soft">
          {metrics.done} of {metrics.total} tasks
        </p>
      </div>
      <ProgressBar percent={metrics.percentComplete} />
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-xs text-ink-soft">{i.label}</dt>
            <dd className={`text-xl font-bold ${i.cls}`}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
