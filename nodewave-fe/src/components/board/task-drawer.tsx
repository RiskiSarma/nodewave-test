'use client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { StatusBadge, boardStatusOf } from '@/components/ui/status';
import { WhyDisabled } from '@/components/ui/tooltip';
import {
  downloadAttachment,
  useComments,
  useTask,
  useTaskActions,
  useTaskAudit,
} from '@/hooks/queries';
import { ApiError, errorMessage } from '@/lib/api';
import { DEPARTMENTS, DEPARTMENT_LABEL, STATUS_ACTION } from '@/lib/labels';
import type { Task, TaskDetail, User } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Tabs from '@radix-ui/react-tabs';
import { AlertTriangle, Download, Paperclip, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(10000),
  department: z.enum(['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND']),
  assigneeId: z.string(),
  clientVisible: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toValues = (t: Task): Values => ({
  title: t.title,
  description: t.description,
  department: t.department,
  assigneeId: t.assignee?.id ?? '',
  clientVisible: t.clientVisible,
});

interface Props {
  projectId: string;
  taskId: string | null;
  allTasks: Task[];
  members: User[];
  onClose: () => void;
}

export function TaskDrawer({ projectId, taskId, allTasks, members, onClose }: Props) {
  return (
    <Dialog open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      {taskId && (
        <DialogContent side title="Task details">
          <DrawerBody
            key={taskId}
            projectId={projectId}
            taskId={taskId}
            allTasks={allTasks}
            members={members}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DrawerBody({ projectId, taskId, allTasks, members, onClose }: Props & { taskId: string }) {
  const { data: task, isLoading, error, refetch } = useTask(taskId);
  const actions = useTaskActions(projectId, taskId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error || !task) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <Content
      task={task}
      actions={actions}
      allTasks={allTasks}
      members={members}
      onClose={onClose}
    />
  );
}

function Content({
  task,
  actions,
  allTasks,
  members,
  onClose,
}: {
  task: TaskDetail;
  actions: ReturnType<typeof useTaskActions>;
  allTasks: Task[];
  members: User[];
  onClose: () => void;
}) {
  const perms = task.permissions;
  const [conflict, setConflict] = useState<string | null>(null);
  // Version the form was loaded from. Saves are sent with THIS version, so if someone
  // else changed the task meanwhile the API answers 409 instead of silently overwriting.
  const [baseVersion, setBaseVersion] = useState(task.version);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(task) });
  const dirty = form.formState.isDirty;
  const lastId = useRef(task.id);

  useEffect(() => {
    if (lastId.current !== task.id) {
      lastId.current = task.id;
      form.reset(toValues(task));
      setBaseVersion(task.version);
      return;
    }
    if (task.version === baseVersion) return;
    if (!dirty) {
      form.reset(toValues(task)); // nobody is mid-edit -> silently show the latest
      setBaseVersion(task.version);
    } else {
      setConflict('Someone else changed this task while you were editing.');
    }
  }, [task, baseVersion, dirty, form]);

  const loadLatest = () => {
    form.reset(toValues(task));
    setBaseVersion(task.version);
    setConflict(null);
  };

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      setConflict(e.message);
      actions.refresh(task.id);
    } else {
      toast.error(errorMessage(e));
    }
  };

  const save = form.handleSubmit(async (v) => {
    try {
      await actions.update.mutateAsync({
        version: baseVersion,
        title: v.title,
        description: v.description,
        department: v.department,
        assigneeId: v.assigneeId || null,
        clientVisible: v.clientVisible,
      });
      setConflict(null);
      toast.success('Task saved');
    } catch (e) {
      handleError(e);
    }
  });

  const changeStatus = async (status: Task['status']) => {
    try {
      await actions.changeStatus.mutateAsync({ status, version: task.version });
      toast.success('Status updated');
    } catch (e) {
      handleError(e);
    }
  };

  const candidates = allTasks.filter(
    (t) => t.id !== task.id && !task.dependsOn.some((d) => d.id === t.id),
  );
  const assignable = members.filter((m) => m.role === 'INTERNAL');

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={boardStatusOf(task)} />
          <span className="text-xs font-semibold text-wave-700">
            {DEPARTMENT_LABEL[task.department]}
          </span>
          <span className="text-xs text-ink-soft">v{task.version}</span>
        </div>
        <h2 className="text-xl font-extrabold leading-tight">{task.title}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {task.assignee ? `Executor: ${task.assignee.name}` : 'No executor assigned'} · Updated{' '}
          {formatDate(task.updatedAt)}
        </p>
      </header>

      {conflict && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-blocked/40 bg-blocked/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blocked" />
          <div className="flex-1">
            <p className="font-semibold">Conflict (409)</p>
            <p className="text-ink-soft">{conflict} Your unsaved edits were not applied.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={loadLatest}>
              Discard my edits and load latest
            </Button>
          </div>
        </div>
      )}

      {/* ---------- status actions: locked in the UI AND rejected by the API ---------- */}
      <section aria-label="Status actions" className="space-y-3">
        <h3 className="text-sm font-bold">Status</h3>
        {task.isBlocked && (
          <div className="rounded-lg bg-blocked/10 p-3 text-sm text-blocked">
            <p className="font-semibold">Blocked by {task.blockedBy.length} unfinished task(s)</p>
            <ul className="mt-1 list-disc pl-5">
              {task.blockedBy.map((b) => (
                <li key={b.id}>
                  {b.title}{' '}
                  <span className="opacity-70">({b.status.replace('_', ' ').toLowerCase()})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {STATUS_ACTION[task.status]
            .filter(({ to }) => perms.status[to].code !== 'INVALID_TRANSITION')
            .map(({ to, label }) => {
              const p = perms.status[to];
              return (
                <WhyDisabled key={to} reason={p.allowed ? undefined : p.reason}>
                  <Button
                    variant={to === 'DONE' ? 'primary' : 'outline'}
                    disabled={!p.allowed || actions.changeStatus.isPending}
                    onClick={() => changeStatus(to)}
                    aria-disabled={!p.allowed}
                  >
                    {label}
                  </Button>
                </WhyDisabled>
              );
            })}
        </div>
      </section>

      <Tabs.Root defaultValue="details">
        <Tabs.List className="mb-4 flex gap-1 border-b border-line">
          {[
            ['details', 'Details'],
            ['deps', `Dependencies (${task.dependsOn.length})`],
            ['files', `Files (${task.attachmentCount})`],
            ['comments', `Comments (${task.commentCount})`],
            ['history', 'History'],
          ].map(([v, l]) => (
            <Tabs.Trigger
              key={v}
              value={v as string}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-ink-soft data-[state=active]:border-wave-600 data-[state=active]:text-ink"
            >
              {l}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="details">
          {perms.canEditCore ? (
            <form onSubmit={save} className="space-y-4" noValidate>
              <Field label="Title" htmlFor="td-title" error={form.formState.errors.title?.message}>
                <Input id="td-title" {...form.register('title')} />
              </Field>
              <Field label="Description" htmlFor="td-desc">
                <Textarea id="td-desc" rows={6} {...form.register('description')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="td-dept">
                  <Select id="td-dept" {...form.register('department')}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {DEPARTMENT_LABEL[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Executor" htmlFor="td-assignee">
                  <Select id="td-assignee" {...form.register('assigneeId')}>
                    <option value="">Unassigned</option>
                    {assignable.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-wave-600"
                  {...form.register('clientVisible')}
                />
                Visible to the client guest
              </label>
              <div className="flex items-center justify-between gap-2">
                <Button type="submit" disabled={!dirty || actions.update.isPending}>
                  {actions.update.isPending ? 'Saving…' : 'Save changes'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Delete this task? It is soft-deleted and stays in the audit trail.',
                      )
                    )
                      return;
                    try {
                      await actions.remove.mutateAsync(task.version);
                      toast.success('Task deleted');
                      onClose();
                    } catch (e) {
                      handleError(e);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-sm">{task.description || 'No description.'}</p>
              <p className="text-xs text-ink-soft">
                Only the Product Manager can edit the core of a task. You can change its status and
                upload work files.
              </p>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="deps" className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-bold">Cannot start until these are done</h4>
            {task.dependsOn.length === 0 ? (
              <p className="text-sm text-ink-soft">No prerequisites.</p>
            ) : (
              <ul className="space-y-2">
                {task.dependsOn.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-line p-2.5 text-sm"
                  >
                    <span>
                      {d.title}{' '}
                      <span className={d.status === 'DONE' ? 'text-done' : 'text-blocked'}>
                        · {d.status === 'DONE' ? 'done' : d.status.replace('_', ' ').toLowerCase()}
                      </span>
                    </span>
                    {perms.canManageDependencies && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove prerequisite ${d.title}`}
                        onClick={() =>
                          actions.removeDependency.mutate(d.id, { onError: handleError })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {perms.canManageDependencies && (
            <AddDependency
              candidates={candidates}
              pending={actions.addDependency.isPending}
              onAdd={(id) =>
                actions.addDependency.mutate(id, {
                  onSuccess: () => toast.success('Dependency added'),
                  onError: handleError,
                })
              }
            />
          )}
          {task.dependents.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-bold">Waiting on this task</h4>
              <ul className="list-disc pl-5 text-sm text-ink-soft">
                {task.dependents.map((d) => (
                  <li key={d.id}>{d.title}</li>
                ))}
              </ul>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="files" className="space-y-3">
          {task.attachments.length === 0 && (
            <p className="text-sm text-ink-soft">No files attached yet.</p>
          )}
          <ul className="space-y-2">
            {task.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-line p-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.fileName}</span>
                  <span className="text-xs text-ink-soft">
                    {a.uploader.name} · {(a.size / 1024).toFixed(1)} KB · {formatDate(a.createdAt)}
                  </span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Download ${a.fileName}`}
                  onClick={() =>
                    downloadAttachment(a.id, a.fileName).catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <WhyDisabled
            reason={
              perms.canUploadAttachment
                ? undefined
                : 'Only the PM or the assigned executor can upload files'
            }
          >
            <label
              className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-semibold ${
                perms.canUploadAttachment ? 'hover:bg-wave-50' : 'pointer-events-none opacity-50'
              }`}
            >
              <Paperclip className="h-4 w-4" />
              {actions.upload.isPending ? 'Uploading…' : 'Upload work file'}
              <input
                type="file"
                className="sr-only"
                disabled={!perms.canUploadAttachment || actions.upload.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f)
                    actions.upload.mutate(f, {
                      onSuccess: () => toast.success('File uploaded'),
                      onError: (err) => toast.error(errorMessage(err)),
                    });
                }}
              />
            </label>
          </WhyDisabled>
        </Tabs.Content>

        <Tabs.Content value="comments">
          <CommentsPanel taskId={task.id} actions={actions} />
        </Tabs.Content>
        <Tabs.Content value="history">
          <HistoryPanel taskId={task.id} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function AddDependency({
  candidates,
  onAdd,
  pending,
}: {
  candidates: Task[];
  onAdd: (id: string) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2">
      <Select
        aria-label="Add prerequisite"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">Add a prerequisite task…</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </Select>
      <Button
        variant="outline"
        disabled={!value || pending}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </Button>
    </div>
  );
}

function CommentsPanel({
  taskId,
  actions,
}: { taskId: string; actions: ReturnType<typeof useTaskActions> }) {
  const { data, isLoading, error, refetch } = useComments(taskId, true);
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      {isLoading && <Skeleton className="h-16" />}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />}
      {data?.entries.length === 0 && (
        <p className="text-sm text-ink-soft">No comments yet. Internal only.</p>
      )}
      <ul className="space-y-2">
        {data?.entries.map((c) => (
          <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="mb-1 text-xs text-ink-soft">
              <span className="font-semibold text-ink">{c.author.name}</span> ·{' '}
              {formatDate(c.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          actions.comment.mutate(text.trim(), {
            onSuccess: () => setText(''),
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}
      >
        <Input
          aria-label="Add a comment"
          placeholder="Write an internal comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={actions.comment.isPending || !text.trim()}>
          Post
        </Button>
      </form>
    </div>
  );
}

function HistoryPanel({ taskId }: { taskId: string }) {
  const { data, isLoading, error, refetch } = useTaskAudit(taskId, true);
  if (isLoading) return <Skeleton className="h-24" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (!data?.entries.length) return <p className="text-sm text-ink-soft">No history yet.</p>;
  return (
    <ol className="space-y-2">
      {data.entries.map((e) => (
        <li key={e.id} className="rounded-lg border border-line p-2.5 text-sm">
          <p>
            <span className="font-semibold">{e.user.name}</span> changed{' '}
            <code className="rounded bg-paper px-1">{e.changedColumn}</code>
          </p>
          <p className="text-xs text-ink-soft">
            {e.oldValue ?? '∅'} → {e.newValue ?? '∅'} · {formatDate(e.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
