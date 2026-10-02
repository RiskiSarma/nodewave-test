import type { MiddlewareHandler } from 'hono';
import { prisma } from '../db';
import { AppError, forbidden } from '../errors';
import { verifyToken } from '../lib/jwt';
import type { Actor, Role } from '../lib/policy';

export interface AuthUser extends Actor {
  email: string;
  name: string;
}
export type AppEnv = { Variables: { user: AuthUser } };

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');

  const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
  // tokenVersion mismatch == the user logged out after this token was issued.
  if (!user || user.tokenVersion !== payload.tv) {
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  }
  c.set('user', {
    id: user.id,
    role: user.role,
    department: user.department,
    email: user.email,
    name: user.name,
  });
  await next();
};

export const requireRole =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!roles.includes(c.get('user').role))
      throw forbidden('Your role cannot access this resource');
    await next();
  };
