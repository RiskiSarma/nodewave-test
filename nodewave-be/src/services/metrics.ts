import { prisma } from '../db';
import { type Metrics, computeMetrics } from '../lib/policy';

/** Aggregate progress per project (soft-deleted tasks excluded, blocked derived from dependencies). */
export async function metricsForProjects(projectIds: string[]): Promise<Record<string, Metrics>> {
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    select: {
      projectId: true,
      status: true,
      assigneeId: true,
      dependencies: {
        where: { deletedAt: null, dependsOn: { deletedAt: null } },
        select: { dependsOn: { select: { id: true, title: true, status: true } } },
      },
    },
  });
  const byProject: Record<string, typeof tasks> = {};
  for (const id of projectIds) byProject[id] = [];
  for (const t of tasks) byProject[t.projectId]?.push(t);

  const result: Record<string, Metrics> = {};
  for (const id of projectIds) {
    result[id] = computeMetrics(
      (byProject[id] ?? []).map((t) => ({
        status: t.status,
        assigneeId: t.assigneeId,
        prerequisites: t.dependencies.map((d) => d.dependsOn),
      })),
    );
  }
  return result;
}
