import type { Tx } from '../db';

export interface AuditContext {
  userId: string;
  projectId: string;
  taskId?: string | null;
  entity: string;
  entityId: string;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * Append one immutable row per changed column: who / when / which column / old / new.
 * Runs inside the caller's transaction so the change and its log commit (or roll back) together.
 */
export async function logChanges(
  tx: Tx,
  ctx: AuditContext,
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  columns: string[],
) {
  const rows = columns
    .filter((c) => str(before[c]) !== str(after[c]))
    .map((c) => ({
      ...ctx,
      action,
      changedColumn: c,
      oldValue: str(before[c]),
      newValue: str(after[c]),
    }));
  if (rows.length > 0) await tx.auditLog.createMany({ data: rows });
  return rows.length;
}

/** For create / delete style events that have no meaningful "before" or "after" object. */
export async function logEvent(
  tx: Tx,
  ctx: AuditContext,
  action: string,
  column: string,
  oldValue: unknown,
  newValue: unknown,
) {
  await tx.auditLog.create({
    data: {
      ...ctx,
      action,
      changedColumn: column,
      oldValue: str(oldValue),
      newValue: str(newValue),
    },
  });
}
