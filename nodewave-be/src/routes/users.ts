import type { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { prisma } from '../db';
import { ok } from '../lib/http';
import { buildListQuery, paginated } from '../lib/query';
import { type AppEnv, requireAuth, requireRole } from '../middleware/auth';

export const userRoutes = new Hono<AppEnv>();

// PM only: used to pick assignees / project members.
userRoutes.get('/', requireAuth, requireRole('PM'), async (c) => {
  const q = buildListQuery(
    c.req.query(),
    {
      allowedFields: ['name', 'email', 'role', 'department', 'createdAt'],
      defaultOrder: { name: 'asc' },
    },
    { deletedAt: null },
  );
  const where = q.where as Prisma.UserWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: q.orderBy as Prisma.UserOrderByWithRelationInput,
      skip: q.skip,
      take: q.take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        avatarUrl: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return ok(c, paginated(rows, total, q));
});
