import type { Tx } from '../db';

/**
 * Adding "taskId depends on dependsOnId" creates a cycle iff `taskId` is already reachable by
 * walking the prerequisites of `dependsOnId` (A -> B -> C -> A would deadlock the board forever).
 */
export async function wouldCreateCycle(
  tx: Tx,
  taskId: string,
  dependsOnId: string,
): Promise<boolean> {
  if (taskId === dependsOnId) return true;
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const edges = await tx.taskDependency.findMany({
      where: { taskId: current, deletedAt: null },
      select: { dependsOnId: true },
    });
    for (const e of edges) stack.push(e.dependsOnId);
  }
  return false;
}
