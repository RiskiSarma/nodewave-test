import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { Tx } from '../db';
import { forbidden, notFound } from '../errors';
import type { AuthUser } from '../middleware/auth';
import {
  type Actor,
  type PolicyTask,
  type Prerequisite,
  isBlocked,
  permissionsFor,
  unresolvedPrerequisites,
} from './policy';

export const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true, department: true } },
  dependencies: {
    where: { deletedAt: null, dependsOn: { deletedAt: null } },
    include: { dependsOn: { select: { id: true, title: true, status: true } } },
  },
  _count: {
    select: {
      comments: { where: { deletedAt: null } },
      attachments: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export const prerequisitesOf = (t: TaskRow): Prerequisite[] =>
  t.dependencies.map((d) => ({
    id: d.dependsOn.id,
    title: d.dependsOn.title,
    status: d.dependsOn.status,
  }));

export const toPolicyTask = (t: TaskRow): PolicyTask => ({
  status: t.status,
  assigneeId: t.assigneeId,
  prerequisites: prerequisitesOf(t),
});

/* ------------------------------------------------------------------ *
 *  Serializers. WHITELIST-based on purpose: a new column added to the
 *  table can never leak to a client by accident.
 * ------------------------------------------------------------------ */

/** PM / Internal view: full detail + per-viewer permissions for the UI. */
export function serializeTaskInternal(t: TaskRow, actor: Actor) {
  const pt = toPolicyTask(t);
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    status: t.status,
    department: t.department,
    assignee: t.assignee,
    clientVisible: t.clientVisible,
    dueDate: t.dueDate,
    version: t.version,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    isBlocked: isBlocked(pt),
    blockedBy: unresolvedPrerequisites(pt),
    dependsOn: pt.prerequisites,
    commentCount: t._count.comments,
    attachmentCount: t._count.attachments,
    permissions: permissionsFor(actor, pt),
  };
}

/**
 * Client Guest view. Data masking happens HERE, on the server:
 * no assignee / avatar / department, no comments, no attachments, no dependency ids,
 * no version. Only what the PM explicitly flagged as client-visible ever gets this far.
 */
export function serializeTaskClient(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    isBlocked: isBlocked(toPolicyTask(t)),
    dueDate: t.dueDate,
    updatedAt: t.updatedAt,
  };
}

/* ------------------------------------------------------------------ *
 *  Access helpers (ABAC: role + membership + client-visible flag)
 * ------------------------------------------------------------------ */

export const projectWhereFor = (user: AuthUser): Prisma.ProjectWhereInput =>
  user.role === 'PM'
    ? { deletedAt: null }
    : { deletedAt: null, members: { some: { userId: user.id, deletedAt: null } } };

/** 404 (not 403) for foreign projects so tenants can't even probe for existence. */
export async function assertProjectAccess(
  user: AuthUser,
  projectId: string,
  db: Tx | typeof prisma = prisma,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectWhereFor(user) },
  });
  if (!project) throw notFound('Project');
  return project;
}

/** Task row the actor is allowed to see, or 404. */
export async function loadTaskFor(user: AuthUser, taskId: string, db: Tx | typeof prisma = prisma) {
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      project: projectWhereFor(user),
      ...(user.role === 'CLIENT' ? { clientVisible: true } : {}),
    },
    include: taskInclude,
  });
  if (!task) throw notFound('Task');
  return task;
}

export function assertNotClient(user: AuthUser) {
  if (user.role === 'CLIENT') throw forbidden('Client guests have no access to this resource');
}
