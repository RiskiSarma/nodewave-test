'use client';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useMembers, useProjectAudit, useStandup, useUsers } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEPARTMENT_LABEL, ROLE_LABEL } from '@/lib/labels';
import type { User } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function StandupPanel({ projectId }: { projectId: string }) {
  const [date, setDate] = useState('');
  const { data, isLoading, error, refetch } = useStandup(projectId, date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="standup-date" className="mb-1 block text-sm font-semibold">
            Day to summarize
          </label>
          <Input
            id="standup-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-48"
          />
        </div>
        <p className="pb-2 text-sm text-ink-soft">
          Empty = yesterday (UTC). Generated from the audit trail.
        </p>
      </div>

      {isLoading && <Skeleton className="h-40" />}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />}
      {data && (
        <>
          <p className="text-sm text-ink-soft">
            {data.date}: <strong>{data.totals.completed}</strong> completed,{' '}
            <strong>{data.totals.blocked}</strong> blocked today
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.departments.map((d) => (
              <section key={d.department} className="rounded-xl border border-line bg-surface p-4">
                <h3 className="mb-3 font-bold">{DEPARTMENT_LABEL[d.department]}</h3>
                <h4 className="text-xs font-semibold text-done">Completed</h4>
                {d.completedYesterday.length === 0 ? (
                  <p className="mb-3 text-sm text-ink-soft">Nothing completed.</p>
                ) : (
                  <ul className="mb-3 list-disc pl-5 text-sm">
                    {d.completedYesterday.map((c) => (
                      <li key={c.taskId + c.completedAt}>
                        {c.title} <span className="text-ink-soft">by {c.completedBy}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <h4 className="text-xs font-semibold text-blocked">Blocked today</h4>
                {d.blockedToday.length === 0 ? (
                  <p className="text-sm text-ink-soft">Nothing blocked.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm">
                    {d.blockedToday.map((b) => (
                      <li key={b.taskId}>
                        {b.title}{' '}
                        <span className="text-ink-soft">
                          waiting on {b.blockedBy.map((x) => x.title).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ActivityPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch, isPlaceholderData } = useProjectAudit(projectId, page);

  if (isLoading) return <Skeleton className="h-48" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (!data?.entries.length)
    return <EmptyState title="No activity yet" hint="Every change to a task shows up here." />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-soft">
            <tr>
              <th className="p-3 font-semibold">When</th>
              <th className="p-3 font-semibold">Who</th>
              <th className="p-3 font-semibold">Field</th>
              <th className="p-3 font-semibold">Old → New</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id} className="border-b border-line/60 last:border-0">
                <td className="p-3 whitespace-nowrap text-ink-soft">{formatDate(e.createdAt)}</td>
                <td className="p-3">{e.user.name}</td>
                <td className="p-3">
                  <code className="rounded bg-paper px-1">{e.changedColumn}</code>
                </td>
                <td className="p-3">
                  <span className="text-ink-soft">{e.oldValue ?? '∅'}</span> → {e.newValue ?? '∅'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">
          Page {data.page} of {data.totalPage} · {data.totalData} entries
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
            disabled={page >= data.totalPage || isPlaceholderData}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TeamPanel({ projectId, members }: { projectId: string; members: User[] }) {
  const users = useUsers(true);
  const { add, remove } = useMembers(projectId);
  const [userId, setUserId] = useState('');
  const available = (users.data?.entries ?? []).filter(
    (u) => u.role !== 'PM' && !members.some((m) => m.id === u.id),
  );

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm"
          >
            <span>
              <span className="font-semibold">{m.name}</span>{' '}
              <span className="text-ink-soft">
                · {ROLE_LABEL[m.role]}
                {m.department ? ` · ${DEPARTMENT_LABEL[m.department]}` : ''}
              </span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${m.name}`}
              onClick={() => remove.mutate(m.id, { onError: (e) => toast.error(errorMessage(e)) })}
            >
              <UserMinus className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Select aria-label="Add member" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">
            {users.isLoading ? 'Loading users…' : 'Add a person to this project…'}
          </option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {ROLE_LABEL[u.role]}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          disabled={!userId || add.isPending}
          onClick={() =>
            add.mutate(userId, {
              onSuccess: () => setUserId(''),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <UserPlus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
