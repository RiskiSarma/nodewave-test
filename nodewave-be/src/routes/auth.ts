import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../errors';
import { ok, parseJson } from '../lib/http';
import { signToken } from '../lib/jwt';
import { type AppEnv, requireAuth } from '../middleware/auth';

const publicUser = (u: {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  avatarUrl: string | null;
}) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  department: u.department,
  avatarUrl: u.avatarUrl,
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  // Public sign-up only creates Internal Team members. PM & Client accounts are provisioned
  // (seeded / by PM) so nobody can self-promote to a privileged role.
  department: z.enum(['UIUX', 'FRONTEND', 'BACKEND']),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (c) => {
  const body = await parseJson(c, registerSchema);
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: 'INTERNAL',
      department: body.department,
    },
  });
  return ok(c, { token: signToken(user.id, user.tokenVersion), user: publicUser(user) }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await parseJson(c, loginSchema);
  const user = await prisma.user.findFirst({ where: { email: body.email, deletedAt: null } });
  const valid = user ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || !valid)
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return ok(c, { token: signToken(user.id, user.tokenVersion), user: publicUser(user) });
});

/** Server-side logout: bumping tokenVersion revokes every JWT issued before now. */
authRoutes.post('/logout', requireAuth, async (c) => {
  await prisma.user.update({
    where: { id: c.get('user').id },
    data: { tokenVersion: { increment: 1 } },
  });
  return ok(c, { loggedOut: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: c.get('user').id } });
  return ok(c, publicUser(user));
});
