import type { Context } from 'hono';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../errors';

/** Parse + validate a JSON body. ZodError is turned into a 400 by the global error handler. */
export async function parseJson<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
  return schema.parse(body);
}

export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) =>
  c.json({ success: true, data }, status);
