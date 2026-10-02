import type { Prisma } from '@prisma/client';
import type { Tx } from '../db';
import { AppError } from '../errors';
import type { Actor } from './policy';
import { serializeTaskInternal, taskInclude } from './tasks';

/**
 * Optimistic locking. The client sends the `version` it last saw; the UPDATE only matches
 * when the row still has that version, and bumps it atomically:
 *
 *   UPDATE "Task" SET ..., version = version + 1 WHERE id = $1 AND version = $2
 *
 * Two actors editing the same task "at the same second" therefore can never overwrite each
 * other: exactly one UPDATE matches, the other affects 0 rows and receives 409 Conflict
 * together with the latest state so the UI can reload and let the user retry.
 */
export async function guardedTaskUpdate(
  tx: Tx,
  actor: Actor,
  taskId: string,
  expectedVersion: number,
  data: Prisma.TaskUncheckedUpdateManyInput,
) {
  const res = await tx.task.updateMany({
    where: { id: taskId, version: expectedVersion, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count === 0) throw await versionConflict(tx, actor, taskId, expectedVersion);
}

export async function versionConflict(tx: Tx, actor: Actor, taskId: string, sent: number) {
  const current = await tx.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: taskInclude,
  });
  if (!current)
    return new AppError(409, 'VERSION_CONFLICT', 'This task was deleted by someone else');
  return new AppError(
    409,
    'VERSION_CONFLICT',
    'This task was modified by someone else. Reload the latest version and try again',
    {
      sentVersion: sent,
      currentVersion: current.version,
      current: serializeTaskInternal(current, actor),
    },
  );
}
