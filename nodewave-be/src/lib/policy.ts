/**
 * Pure authorization rules (RBAC + ABAC). No I/O here on purpose:
 * the exact same functions are used by the API guards AND to tell the UI which buttons to lock,
 * so the frontend can never disagree with the backend.
 */
export type Role = 'PM' | 'INTERNAL' | 'CLIENT';
export type Department = 'PRODUCT' | 'UIUX' | 'FRONTEND' | 'BACKEND';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface Actor {
  id: string;
  role: Role;
  department: Department | null;
}

export interface Prerequisite {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface PolicyTask {
  status: TaskStatus;
  assigneeId: string | null;
  /** Prerequisite tasks (already excluding soft-deleted ones). */
  prerequisites: Prerequisite[];
}

export type Decision =
  | { allowed: true }
  | {
      allowed: false;
      httpStatus: 400 | 403 | 422;
      code: string;
      message: string;
      details?: unknown;
    };

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/** Legal state machine edges. Skipping straight TODO -> DONE is never allowed. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['TODO', 'DONE'],
  DONE: ['IN_PROGRESS'],
};

const deny = (
  httpStatus: 400 | 403 | 422,
  code: string,
  message: string,
  details?: unknown,
): Decision => ({ allowed: false, httpStatus, code, message, details });

/** Prerequisites that are not DONE yet. A task with any of them is "Blocked". */
export const unresolvedPrerequisites = (task: Pick<PolicyTask, 'prerequisites'>): Prerequisite[] =>
  task.prerequisites.filter((p) => p.status !== 'DONE');

export const isBlocked = (task: PolicyTask): boolean =>
  task.status === 'TODO' && unresolvedPrerequisites(task).length > 0;

/** Only the PM edits the "core" of a task (title, description, assignee, visibility ...). */
export const canEditCore = (actor: Actor): boolean => actor.role === 'PM';

export const canManageDependencies = (actor: Actor): boolean => actor.role === 'PM';

export const canUploadAttachment = (
  actor: Actor,
  task: Pick<PolicyTask, 'assigneeId'>,
): Decision => {
  if (actor.role === 'PM') return { allowed: true };
  if (actor.role === 'INTERNAL' && task.assigneeId === actor.id) return { allowed: true };
  return deny(403, 'NOT_EXECUTOR', 'Only the PM or the assigned executor can upload attachments');
};

/**
 * Can `actor` move `task` to status `to`?
 *  - CLIENT never changes anything.
 *  - PM may change status but can NOT complete work (IN_PROGRESS -> DONE): only the executor can.
 *  - INTERNAL must be the assignee (executor).
 *  - Starting (-> IN_PROGRESS) is locked while any prerequisite is not DONE (task is Blocked).
 */
export function evaluateStatusChange(actor: Actor, task: PolicyTask, to: TaskStatus): Decision {
  if (actor.role === 'CLIENT') {
    return deny(403, 'FORBIDDEN', 'Client guests are read-only');
  }
  if (task.status === to) {
    return deny(400, 'NO_CHANGE', `Task is already ${to}`);
  }
  if (!TRANSITIONS[task.status].includes(to)) {
    return deny(422, 'INVALID_TRANSITION', `Cannot move a task from ${task.status} to ${to}`);
  }
  if (actor.role === 'PM' && task.status === 'IN_PROGRESS' && to === 'DONE') {
    return deny(
      403,
      'PM_CANNOT_COMPLETE',
      'A Product Manager cannot mark work as Done. Only the executor can complete it',
    );
  }
  if (actor.role === 'INTERNAL' && task.assigneeId !== actor.id) {
    return deny(403, 'NOT_EXECUTOR', 'Only the assigned executor can change this task status');
  }
  if (to === 'IN_PROGRESS' || to === 'DONE') {
    const open = unresolvedPrerequisites(task);
    if (open.length > 0) {
      return deny(
        422,
        'TASK_BLOCKED',
        `Task is blocked by ${open.length} unfinished prerequisite task(s)`,
        { blockedBy: open },
      );
    }
  }
  return { allowed: true };
}

export interface TaskPermissions {
  canEditCore: boolean;
  canUploadAttachment: boolean;
  canManageDependencies: boolean;
  /** Per target status: whether the button should be enabled + why not. */
  status: Record<TaskStatus, { allowed: boolean; code?: string; reason?: string }>;
}

export function permissionsFor(actor: Actor, task: PolicyTask): TaskPermissions {
  const status = {} as TaskPermissions['status'];
  for (const s of STATUSES) {
    const d = evaluateStatusChange(actor, task, s);
    status[s] = d.allowed ? { allowed: true } : { allowed: false, code: d.code, reason: d.message };
  }
  return {
    canEditCore: canEditCore(actor),
    canUploadAttachment: canUploadAttachment(actor, task).allowed,
    canManageDependencies: canManageDependencies(actor),
    status,
  };
}

/** Progress numbers used for the client-facing aggregate ("50% complete"). */
export interface Metrics {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
  percentComplete: number;
}

export function computeMetrics(tasks: PolicyTask[]): Metrics {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const blocked = tasks.filter(isBlocked).length;
  const todo = tasks.filter((t) => t.status === 'TODO').length - blocked;
  return {
    total,
    done,
    inProgress,
    todo,
    blocked,
    percentComplete: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
