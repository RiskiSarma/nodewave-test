import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { logChanges, logEvent } from '../lib/audit';
import { ok, parseJson } from '../lib/http';
import { buildListQuery, paginated } from '../lib/query';
import { assertNotClient, assertProjectAccess, projectWhereFor } from '../lib/tasks';
import { type AppEnv, requireAuth, requireRole } from '../middleware/auth';
import { metricsForProjects } from '../services/metrics';
import { buildStandup } from '../services/standup';

export const projectRoutes = new Hono<AppEnv>();
projectRoutes.use('*', requireAuth);

const projectBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
});

const memberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  avatarUrl: true,
} as const;

/** Client-safe projection: no member list, no internal identities. */
const clientProject = (p: { id: string; name: string; description: string }) => ({
  id: p.id,
  name: p.name,
  description: p.description,
});

projectRoutes.get('/', async (c) => {
  const user = c.get('user');
  const q = buildListQuery(
    c.req.query(),
    {
      allowedFields: ['name', 'description', 'createdAt', 'updatedAt'],
      defaultOrder: { createdAt: 'desc' },
    },
    projectWhereFor(user) as Record<string, unknown>,
  );
  const where = q.where as Prisma.ProjectWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: q.orderBy as Prisma.ProjectOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
    }),
    prisma.project.count({ where }),
  ]);
  const metrics = await metricsForProjects(rows.map((r) => r.id));
  const entries = rows.map((p) => ({
    ...clientProject(p),
    ...(user.role === 'CLIENT' ? {} : { createdAt: p.createdAt, updatedAt: p.updatedAt }),
    metrics: metrics[p.id],
  }));
  return ok(c, paginated(entries, total, q));
});

projectRoutes.post('/', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const body = await parseJson(c, projectBody);
  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({ data: body });
    await logChanges(
      tx,
      { userId: user.id, projectId: p.id, entity: 'PROJECT', entityId: p.id },
      'CREATE',
      {},
      p,
      ['name', 'description'],
    );
    return p;
  });
  return ok(c, project, 201);
});

projectRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const project = await assertProjectAccess(user, c.req.param('id'));
  const metrics = (await metricsForProjects([project.id]))[project.id];
  if (user.role === 'CLIENT') return ok(c, { ...clientProject(project), metrics });

  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id, deletedAt: null },
    include: { user: { select: memberSelect } },
  });
  return ok(c, {
    ...clientProject(project),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    metrics,
    members: members.map((m) => m.user),
  });
});

/** Aggregate metrics only – the one thing a Client Guest is allowed to see about the whole project. */
projectRoutes.get('/:id/metrics', async (c) => {
  const project = await assertProjectAccess(c.get('user'), c.req.param('id'));
  return ok(c, (await metricsForProjects([project.id]))[project.id]);
});

projectRoutes.patch('/:id', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const body = await parseJson(c, projectBody.partial());
  const before = await assertProjectAccess(user, c.req.param('id'));
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: before.id }, data: body });
    await logChanges(
      tx,
      { userId: user.id, projectId: p.id, entity: 'PROJECT', entityId: p.id },
      'UPDATE',
      before,
      p,
      ['name', 'description'],
    );
    return p;
  });
  return ok(c, updated);
});

/** Soft delete. Nothing is ever physically removed. */
projectRoutes.delete('/:id', requireRole('PM'), async (c) => {
  const user = c.get('user');
  const project = await assertProjectAccess(user, c.req.param('id'));
  await prisma.$transaction(async (tx) => {
    const deletedAt = new Date();
    await tx.project.update({ where: { id: project.id }, data: { deletedAt } });
    await logEvent(
      tx,
      { userId: user.id, projectId: project.id, entity: 'PROJECT', entityId: project.id },
      'DELETE',
      'deletedAt',
      null,
      deletedAt,
    );
  });
  return ok(c, { deleted: true });
});

/* ------------------------------ members ------------------------------ */

projectRoutes.post('/:id/members', requireRole('PM'), async (c) => {
  const actor = c.get('user');
  const { userId } = await parseJson(c, z.object({ userId: z.string().min(1) }));
  const project = await assertProjectAccess(actor, c.req.param('id'));
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!target) throw notFound('User');
  if (target.role === 'PM')
    throw new AppError(400, 'INVALID_MEMBER', 'PMs already have access to every project');

  if (target.role === 'CLIENT') {
    // Tenant isolation: a client guest belongs to exactly one project.
    const other = await prisma.projectMember.findFirst({
      where: {
        userId,
        deletedAt: null,
        projectId: { not: project.id },
        project: { deletedAt: null },
      },
    });
    if (other)
      throw new AppError(
        409,
        'CLIENT_ALREADY_ASSIGNED',
        'Client guest already belongs to another project',
      );
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId },
      update: { deletedAt: null },
    });
    await logEvent(
      tx,
      { userId: actor.id, projectId: project.id, entity: 'PROJECT_MEMBER', entityId: userId },
      'ADD_MEMBER',
      'member',
      null,
      userId,
    );
  });
  return ok(c, { added: true }, 201);
});

projectRoutes.delete('/:id/members/:userId', requireRole('PM'), async (c) => {
  const actor = c.get('user');
  const project = await assertProjectAccess(actor, c.req.param('id'));
  const userId = c.req.param('userId');
  const membership = await prisma.projectMember.findFirst({
    where: { projectId: project.id, userId, deletedAt: null },
  });
  if (!membership) throw notFound('Member');
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    });
    await logEvent(
      tx,
      { userId: actor.id, projectId: project.id, entity: 'PROJECT_MEMBER', entityId: userId },
      'REMOVE_MEMBER',
      'member',
      userId,
      null,
    );
  });
  return ok(c, { removed: true });
});

/* ------------------------- audit + standup (internal only) ------------------------- */

projectRoutes.get('/:id/audit-logs', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const project = await assertProjectAccess(user, c.req.param('id'));
  const q = buildListQuery(
    c.req.query(),
    {
      allowedFields: ['taskId', 'entity', 'action', 'changedColumn', 'userId', 'createdAt'],
      defaultOrder: { createdAt: 'desc' },
    },
    { projectId: project.id },
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

projectRoutes.get('/:id/standup', async (c) => {
  const user = c.get('user');
  assertNotClient(user);
  const project = await assertProjectAccess(user, c.req.param('id'));
  return ok(c, await buildStandup(project.id, c.req.query('date')));
});
