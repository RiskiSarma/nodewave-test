import { prisma } from '../db';
import { AppError } from '../errors';
import { type Department, isBlocked, unresolvedPrerequisites } from '../lib/policy';

const DEPARTMENTS: Department[] = ['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND'];
const DAY_MS = 86_400_000;

export const yesterdayUtc = (now = new Date()) =>
  new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);

/**
 * Daily standup auto-summary, derived purely from the immutable audit trail + current board:
 *  - completedYesterday: audit rows where `status` became DONE during [date 00:00Z, date+1 00:00Z)
 *  - blockedToday: open tasks that currently have unfinished prerequisites
 * grouped per department, as structured JSON.
 */
export async function buildStandup(projectId: string, date?: string) {
  const day = date ?? yesterdayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new AppError(400, 'INVALID_DATE', 'date must be formatted as YYYY-MM-DD');
  }
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);

  const logs = await prisma.auditLog.findMany({
    where: {
      projectId,
      entity: 'TASK',
      changedColumn: 'status',
      newValue: 'DONE',
      createdAt: { gte: start, lt: end },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const doneTasks = await prisma.task.findMany({
    where: { id: { in: [...new Set(logs.map((l) => l.taskId).filter((x): x is string => !!x))] } },
    select: { id: true, title: true, department: true, status: true },
  });
  const taskById = new Map(doneTasks.map((t) => [t.id, t]));

  const openTasks = await prisma.task.findMany({
    where: { projectId, deletedAt: null, status: { not: 'DONE' } },
    include: {
      dependencies: {
        where: { deletedAt: null, dependsOn: { deletedAt: null } },
        include: { dependsOn: { select: { id: true, title: true, status: true } } },
      },
    },
  });

  const departments = DEPARTMENTS.map((department) => {
    const completedYesterday = logs
      .filter((l) => l.taskId && taskById.get(l.taskId)?.department === department)
      .map((l) => ({
        taskId: l.taskId as string,
        title: taskById.get(l.taskId as string)?.title ?? '',
        completedBy: l.user.name,
        completedAt: l.createdAt,
      }));
    const blockedToday = openTasks
      .filter((t) => t.department === department)
      .map((t) => ({
        t,
        pt: {
          status: t.status,
          assigneeId: t.assigneeId,
          prerequisites: t.dependencies.map((d) => d.dependsOn),
        },
      }))
      .filter(({ pt }) => isBlocked(pt))
      .map(({ t, pt }) => ({
        taskId: t.id,
        title: t.title,
        blockedBy: unresolvedPrerequisites(pt),
      }));
    return { department, completedYesterday, blockedToday };
  });

  return {
    projectId,
    date: day,
    generatedAt: new Date().toISOString(),
    totals: {
      completed: departments.reduce((n, d) => n + d.completedYesterday.length, 0),
      blocked: departments.reduce((n, d) => n + d.blockedToday.length, 0),
    },
    departments,
  };
}
