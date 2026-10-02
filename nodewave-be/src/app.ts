import { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { ZodError } from 'zod';
import { config } from './config';
import { AppError } from './errors';
import type { AppEnv } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { projectTaskRoutes, taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';

export const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.corsOrigins,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition'],
  }),
);

app.get('/', (c) => c.json({ success: true, data: { name: 'nodewave-be', status: 'ok' } }));
app.get('/health', (c) => c.json({ success: true, data: { status: 'ok' } }));

app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/projects/:projectId/tasks', projectTaskRoutes);
app.route('/projects', projectRoutes);
app.route('/tasks', taskRoutes);

app.notFound((c) =>
  c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);

const fail = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

app.onError((err, c) => {
  if (err instanceof AppError) return c.json(fail(err.code, err.message, err.details), err.status);
  if (err instanceof ZodError) {
    return c.json(fail('VALIDATION_ERROR', 'Invalid request body', err.flatten()), 400);
  }
  if (err instanceof HTTPException) return c.json(fail('HTTP_ERROR', err.message), err.status);
  if (err instanceof Prisma.PrismaClientValidationError) {
    return c.json(fail('INVALID_QUERY', 'A filter value has an invalid type or value'), 400);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return c.json(fail('CONFLICT', 'Unique constraint violated'), 409);
    if (err.code === 'P2025') return c.json(fail('NOT_FOUND', 'Record not found'), 404);
  }
  console.error(err);
  return c.json(fail('INTERNAL_ERROR', 'Something went wrong'), 500);
});
