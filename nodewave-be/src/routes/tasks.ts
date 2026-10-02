import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config';
import { type Tx, prisma } from '../db';
import { AppError, notFound } from '../errors';
import { logChanges, logEvent } from '../lib/audit';
import { wouldCreateCycle } from '../lib/dependencies';
import { ok, parseJson } from '../lib/http';
import { guardedTaskUpdate, versionConflict } from '../lib/lock';
import { type Decision, canUploadAttachment, evaluateStatusChange } from '../lib/policy';
import { buildListQuery, paginated } from '../lib/query';
import {
  assertNotClient,
  assertProjectAccess,
  loadTaskFor,
  serializeTaskClient,
  serializeTaskInternal,
  taskInclude,
  toPolicyTask,
} from '../lib/tasks';
import { type AppEnv, requireAuth, requireRole } from '../middleware/auth';

const CORE_COLUMNS = [
  'title',
  'description',
  'status',
  'department',
  'assigneeId',
  'clientVisible',
  'dueDate',
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const internalSpec = {
  allowedFields: [
    'title',
    'description',
    'status',
    'department',
    'assigneeId',
    'clientVisible',
    'dueDate',
    'createdAt',
    'updatedAt',
    'assignee.name',
  ],
  allowedRelations: ['assignee'],
  defaultOrder: { createdAt: 'asc' as const },
};
// Clients may only filter/sort on columns that are already visible to them, otherwise
// ordering by e.g. `assignee.name` would leak masked data through the result order.
const clientSpec = {
  allowedFields: ['title', 'description', 'status', 'dueDate', 'createdAt', 'updatedAt'],
  defaultOrder: { createdAt: 'asc' as const },
};

const enforce = (d: Decision) => {
  if (!d.allowed) throw new AppError(d.httpStatus, d.code, d.message, d.details);
};

const isoDate = z.string().datetime({ offset: true });
const department = z.enum(['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND']);

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).default(''),
  department,
  assigneeId: z.string().min(1).nullable().optional(),
  clientVisible: z.boolean().default(false),
  dueDate: isoDate.nullable().optional(),
});

const patchBody = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).optional(),
    department: department.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    clientVisible: z.boolean().optional(),
    dueDate: isoDate.nullable().optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), { message: 'Nothing to update' });

const statusBody = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  version: z.number().int().positive(),
});

async function assertAssignable(tx: Tx, projectId: string, userId: string) {
  const member = await tx.projectMember.findFirst({
    where: { projectId, userId, deletedAt: null, user: { deletedAt: null, role: 'INTERNAL' } },
  });
  if (!member) {
    throw new AppError(
      422,
      'INVALID_ASSIGNEE',
      'Assignee must be an internal team member of this project',
    );
  }
}

const auditCtx = (userId: string, t: { id: string; projectId: string }) => ({
  userId,
  projectId: t.projectId,
  taskId: t.id,
  entity: 'TASK',
  entityId: t.id,
});

/* ==================================================================== *
 *  /projects/:projectId/tasks
 * ==================================================================== */
export const projectTaskRoutes = new Hono<AppEnv>();
projectTaskRoutes.use('*', requireAuth);

projectTaskRoutes.get('/', async (c) => {
  const user = c.get('user');
  const project = await assertProjectAccess(user, c.req.param('projectId') as string);
  const isClient = user.role === 'CLIENT';
  const q = buildListQuery(c.req.query(), isClient ? clientSpec : internalSpec, {
    projectId: project.id,
    deletedAt: null,
    // ABAC: clients only ever see tasks the PM explicitly flagged as visible.
    ...(isClient ? { clientVisible: true } : {}),
  });
  const where = q.where as Prisma.TaskWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      orderBy: q.orderBy as Prisma.TaskOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
      include: taskInclude,
    }),
    prisma.task.count({ where }),
  ]);
  const entries = rows.map((t) =>
    isClient ? serializeTaskClient(t) : serializeTaskInternal(t, user),
  );
  return ok(c, paginated(entries, total, q));
});

projectTaskRoutes.post('/', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const project = await assertProjectAccess(user, c.req.param('projectId') as string);
  const body = await parseJson(c, createBody);

  const task = await prisma.$transaction(async (tx) => {
    if (body.assigneeId) await assertAssignable(tx, project.id, body.assigneeId);
    const created = await tx.task.create({
      data: {
        projectId: project.id,
        title: body.title,
        description: body.description,
        department: body.department,
        assigneeId: body.assigneeId ?? null,
        clientVisible: body.clientVisible,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdById: user.id,
      },
      include: taskInclude,
    });
    await logChanges(tx, auditCtx(user.id, created), 'CREATE', {}, created, CORE_COLUMNS);
    return created;
  });
  return ok(c, serializeTaskInternal(task, user), 201);
});

/* ==================================================================== *
 *  /tasks
 * ==================================================================== */
export const taskRoutes = new Hono<AppEnv>();
taskRoutes.use('*', requireAuth);

taskRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const task = await loadTaskFor(user, c.req.param('id'));
  if (user.role === 'CLIENT') return ok(c, serializeTaskClient(task));

  const [attachments, dependents] = await Promise.all([
    prisma.attachment.findMany({
      where: { taskId: task.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    }),
    prisma.taskDependency.findMany({
      where: { dependsOnId: task.id, deletedAt: null, task: { deletedAt: null } },
      select: { task: { select: { id: true, title: true, status: true } } },
    }),
  ]);
  return ok(c, {
    ...serializeTaskInternal(task, user),
    dependents: dependents.map((d) => d.task),
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
      uploader: a.uploader,
    })),
  });
});

/** PM edits the core of the task. Engineers can never reach this route. */
taskRoutes.patch('/:id', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const body = await parseJson(c, patchBody);
  const { version, ...fields } = body;

  const result = await prisma.$transaction(async (tx) => {
    const before = await loadTaskFor(user, c.req.param('id'), tx);
    if (before.version !== version) throw await versionConflict(tx, user, before.id, version);
    if (fields.assigneeId) await assertAssignable(tx, before.projectId, fields.assigneeId);

    const data: Prisma.TaskUncheckedUpdateManyInput = {};
    if (fields.title !== undefined) data.title = fields.title;
    if (fields.description !== undefined) data.description = fields.description;
    if (fields.department !== undefined) data.department = fields.department;
    if (fields.assigneeId !== undefined) data.assigneeId = fields.assigneeId;
    if (fields.clientVisible !== undefined) data.clientVisible = fields.clientVisible;
    if (fields.dueDate !== undefined)
      data.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;

    await guardedTaskUpdate(tx, user, before.id, version, data);
    const after = await tx.task.findUniqueOrThrow({
      where: { id: before.id },
      include: taskInclude,
    });
    await logChanges(tx, auditCtx(user.id, after), 'UPDATE', before, after, Object.keys(data));
    return after;
  });
  return ok(c, serializeTaskInternal(result, user));
});

/**
 * Status change. Three layers of protection:
 *   1. policy (role / executor / dependency lock)  -> 403 / 422, same rules the UI uses to disable buttons
 *   2. optimistic lock (version)                    -> 409
 *   3. audit row written in the same transaction
 */
taskRoutes.patch('/:id/status', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const body = await parseJson(c, statusBody);

  const result = await prisma.$transaction(async (tx) => {
    const before = await loadTaskFor(user, c.req.param('id'), tx);
    if (before.version !== body.version)
      throw await versionConflict(tx, user, before.id, body.version);
    enforce(evaluateStatusChange(user, toPolicyTask(before), body.status));

    await guardedTaskUpdate(tx, user, before.id, body.version, { status: body.status });
    const after = await tx.task.findUniqueOrThrow({
      where: { id: before.id },
      include: taskInclude,
    });
    await logChanges(tx, auditCtx(user.id, after), 'STATUS_CHANGE', before, after, ['status']);
    return after;
  });
  return ok(c, serializeTaskInternal(result, user));
});

/** Soft delete (requires the version the PM last saw). */
taskRoutes.delete('/:id', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const version = Number(c.req.query('version'));
  if (!Number.isInteger(version) || version < 1) {
    throw new AppError(400, 'VERSION_REQUIRED', "Pass the task's current version as ?version=");
  }
  await prisma.$transaction(async (tx) => {
    const task = await loadTaskFor(user, c.req.param('id'), tx);
    if (task.version !== version) throw await versionConflict(tx, user, task.id, version);
    const deletedAt = new Date();
    await guardedTaskUpdate(tx, user, task.id, version, { deletedAt });
    await logEvent(tx, auditCtx(user.id, task), 'DELETE', 'deletedAt', null, deletedAt);
  });
  return ok(c, { deleted: true });
});

/* ------------------------------ dependencies ------------------------------ */

taskRoutes.post('/:id/dependencies', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const { dependsOnId } = await parseJson(c, z.object({ dependsOnId: z.string().min(1) }));

  const result = await prisma.$transaction(async (tx) => {
    const task = await loadTaskFor(user, c.req.param('id'), tx);
    const prerequisite = await tx.task.findFirst({
      where: { id: dependsOnId, projectId: task.projectId, deletedAt: null },
    });
    if (!prerequisite) throw notFound('Prerequisite task (must be in the same project)');
    if (await wouldCreateCycle(tx, task.id, prerequisite.id)) {
      throw new AppError(
        422,
        'CIRCULAR_DEPENDENCY',
        'This dependency would create a circular chain',
      );
    }
    const existing = await tx.taskDependency.findUnique({
      where: { taskId_dependsOnId: { taskId: task.id, dependsOnId: prerequisite.id } },
    });
    if (existing && !existing.deletedAt) {
      throw new AppError(409, 'DEPENDENCY_EXISTS', 'This dependency already exists');
    }
    if (existing) {
      await tx.taskDependency.update({ where: { id: existing.id }, data: { deletedAt: null } });
    } else {
      await tx.taskDependency.create({ data: { taskId: task.id, dependsOnId: prerequisite.id } });
    }
    // Bump the version: anyone editing this task with a stale view (e.g. an engineer about to
    // start it) now gets a 409 instead of racing past the new dependency.
    await guardedTaskUpdate(tx, user, task.id, task.version, {});
    await logEvent(
      tx,
      auditCtx(user.id, task),
      'ADD_DEPENDENCY',
      'dependsOn',
      null,
      prerequisite.id,
    );
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
  });
  return ok(c, serializeTaskInternal(result, user), 201);
});

taskRoutes.delete('/:id/dependencies/:dependsOnId', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const result = await prisma.$transaction(async (tx) => {
    const task = await loadTaskFor(user, c.req.param('id'), tx);
    const dependsOnId = c.req.param('dependsOnId');
    const edge = await tx.taskDependency.findFirst({
      where: { taskId: task.id, dependsOnId, deletedAt: null },
    });
    if (!edge) throw notFound('Dependency');
    await tx.taskDependency.update({ where: { id: edge.id }, data: { deletedAt: new Date() } });
    await guardedTaskUpdate(tx, user, task.id, task.version, {});
    await logEvent(
      tx,
      auditCtx(user.id, task),
      'REMOVE_DEPENDENCY',
      'dependsOn',
      dependsOnId,
      null,
    );
    return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
  });
  return ok(c, serializeTaskInternal(result, user));
});

/* ------------------------------ attachments ------------------------------ */

taskRoutes.get('/:id/attachments', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const task = await loadTaskFor(user, c.req.param('id'));
  const q = buildListQuery(
    c.req.query(),
    {
      allowedFields: ['fileName', 'mimeType', 'size', 'createdAt'],
      defaultOrder: { createdAt: 'desc' },
    },
    { taskId: task.id, deletedAt: null },
  );
  const where = q.where as Prisma.AttachmentWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.attachment.findMany({
      where,
      orderBy: q.orderBy as Prisma.AttachmentOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploader: { select: { id: true, name: true } },
      },
    }),
    prisma.attachment.count({ where }),
  ]);
  return ok(c, paginated(rows, total, q));
});

/** Executor (or PM) may attach work files. This is all an engineer can "write" besides status. */
taskRoutes.post('/:id/attachments', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const task = await loadTaskFor(user, c.req.param('id'));
  enforce(canUploadAttachment(user, task));

  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File))
    throw new AppError(400, 'FILE_REQUIRED', "Send multipart/form-data with a 'file' field");
  if (file.size === 0) throw new AppError(400, 'EMPTY_FILE', 'File is empty');
  if (file.size > MAX_UPLOAD_BYTES)
    throw new AppError(413, 'FILE_TOO_LARGE', 'Max upload size is 10 MB');

  const safeName =
    basename(file.name)
      .replace(/[^\w.\- ]/g, '_')
      .slice(0, 120) || 'file';
  const storagePath = join(config.UPLOAD_DIR, `${crypto.randomUUID()}-${safeName}`);
  await mkdir(config.UPLOAD_DIR, { recursive: true });
  await Bun.write(storagePath, file);

  const attachment = await prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({
      data: {
        taskId: task.id,
        uploaderId: user.id,
        fileName: safeName,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        storagePath,
      },
    });
    await logEvent(tx, auditCtx(user.id, task), 'ADD_ATTACHMENT', 'attachments', null, safeName);
    return a;
  });
  return ok(
    c,
    {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    },
    201,
  );
});

taskRoutes.get('/attachments/:attachmentId/download', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const attachment = await prisma.attachment.findFirst({
    where: { id: c.req.param('attachmentId'), deletedAt: null },
  });
  if (!attachment) throw notFound('Attachment');
  await loadTaskFor(user, attachment.taskId); // same project/tenant check as the task itself
  const file = Bun.file(attachment.storagePath);
  if (!(await file.exists())) throw notFound('File');
  return new Response(file, {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    },
  });
});

/* ------------------------------ comments (internal only) ------------------------------ */

taskRoutes.get('/:id/comments', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const task = await loadTaskFor(user, c.req.param('id'));
  const q = buildListQuery(
    c.req.query(),
    { allowedFields: ['body', 'createdAt'], defaultOrder: { createdAt: 'asc' } },
    { taskId: task.id, deletedAt: null },
  );
  const where = q.where as Prisma.CommentWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: q.orderBy as Prisma.CommentOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
      include: { author: { select: { id: true, name: true, avatarUrl: true, department: true } } },
    }),
    prisma.comment.count({ where }),
  ]);
  return ok(c, paginated(rows, total, q));
});

taskRoutes.post('/:id/comments', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const task = await loadTaskFor(user, c.req.param('id'));
  const { body } = await parseJson(c, z.object({ body: z.string().trim().min(1).max(5000) }));
  const comment = await prisma.comment.create({
    data: { taskId: task.id, authorId: user.id, body },
    include: { author: { select: { id: true, name: true, avatarUrl: true, department: true } } },
  });
  return ok(c, comment, 201);
});

/* ------------------------------ audit trail ------------------------------ */

taskRoutes.get('/:id/audit-logs', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const task = await loadTaskFor(user, c.req.param('id'));
  const q = buildListQuery(
    c.req.query(),
    {
      allowedFields: ['action', 'changedColumn', 'userId', 'createdAt'],
      defaultOrder: { createdAt: 'desc' },
    },
    { taskId: task.id },
  );
  const where = q.where as Prisma.AuditLogWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: q.orderBy as Prisma.AuditLogOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
      include: { user: { select: { id: true, name: true, department: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok(c, paginated(rows, total, q));
});
