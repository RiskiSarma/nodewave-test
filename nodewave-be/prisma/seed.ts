import { PrismaPg } from '@prisma/adapter-pg';
import { type Department, PrismaClient, type Role, type TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export const SEED_PASSWORD = 'Password123!';
const hour = 3_600_000;

async function upsertUser(email: string, name: string, role: Role, department: Department | null) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, department, passwordHash, deletedAt: null },
    create: { email, name, role, department, passwordHash },
  });
}

async function project(name: string, description: string, memberIds: string[]) {
  const p =
    (await prisma.project.findFirst({ where: { name, deletedAt: null } })) ??
    (await prisma.project.create({ data: { name, description } }));
  for (const userId of memberIds) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: p.id, userId } },
      update: { deletedAt: null },
      create: { projectId: p.id, userId },
    });
  }
  return p;
}

interface SeedTask {
  key: string;
  title: string;
  description: string;
  department: Department;
  assigneeId: string;
  status: TaskStatus;
  clientVisible: boolean;
  dependsOn?: string[];
  /** When the status was reached (used to fake yesterday's activity for the standup demo). */
  doneAt?: Date;
}

async function seedTasks(projectId: string, createdById: string, tasks: SeedTask[]) {
  const ids: Record<string, string> = {};
  for (const t of tasks) {
    const existing = await prisma.task.findFirst({
      where: { projectId, title: t.title, deletedAt: null },
    });
    if (existing) {
      ids[t.key] = existing.id;
      continue;
    }
    const created = await prisma.task.create({
      data: {
        projectId,
        title: t.title,
        description: t.description,
        department: t.department,
        assigneeId: t.assigneeId,
        status: t.status,
        clientVisible: t.clientVisible,
        createdById,
      },
    });
    ids[t.key] = created.id;
    const base = { projectId, taskId: created.id, entity: 'TASK', entityId: created.id };
    await prisma.auditLog.createMany({
      data: [
        {
          ...base,
          action: 'CREATE',
          userId: createdById,
          changedColumn: 'title',
          oldValue: null,
          newValue: t.title,
        },
        {
          ...base,
          action: 'CREATE',
          userId: createdById,
          changedColumn: 'status',
          oldValue: null,
          newValue: 'TODO',
        },
        ...(t.status !== 'TODO'
          ? [
              {
                ...base,
                action: 'STATUS_CHANGE',
                userId: t.assigneeId,
                changedColumn: 'status',
                oldValue: 'TODO',
                newValue: t.status,
                createdAt: t.doneAt ?? new Date(),
              },
            ]
          : []),
      ],
    });
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      const taskId = ids[t.key] as string;
      const dependsOnId = ids[dep] as string;
      await prisma.taskDependency.upsert({
        where: { taskId_dependsOnId: { taskId, dependsOnId } },
        update: { deletedAt: null },
        create: { taskId, dependsOnId },
      });
    }
  }
}

async function main() {
  const pm = await upsertUser('pm@nodewave.test', 'Paula Manager', 'PM', 'PRODUCT');
  const ux = await upsertUser('uiux@nodewave.test', 'Uma Designer', 'INTERNAL', 'UIUX');
  const fe = await upsertUser('frontend@nodewave.test', 'Felix Frontend', 'INTERNAL', 'FRONTEND');
  const be = await upsertUser('backend@nodewave.test', 'Bella Backend', 'INTERNAL', 'BACKEND');
  const client = await upsertUser('client@nodewave.test', 'Acme Client', 'CLIENT', null);
  const client2 = await upsertUser('client2@nodewave.test', 'Globex Client', 'CLIENT', null);

  const apollo = await project('Project Apollo', 'Customer portal redesign for Acme.', [
    ux.id,
    fe.id,
    be.id,
    client.id,
  ]);
  const zephyr = await project('Project Zephyr', 'Internal analytics revamp for Globex.', [
    fe.id,
    be.id,
    client2.id,
  ]);

  const yesterday = new Date(Date.now() - 24 * hour + 2 * hour);
  await seedTasks(apollo.id, pm.id, [
    {
      key: 'ui',
      title: 'UI Design – Dashboard',
      description: 'High-fidelity screens for the customer dashboard.',
      department: 'UIUX',
      assigneeId: ux.id,
      status: 'DONE',
      clientVisible: true,
      doneAt: yesterday,
    },
    {
      key: 'api',
      title: 'Backend API Integration',
      description: 'Expose dashboard endpoints and wire authentication.',
      department: 'BACKEND',
      assigneeId: be.id,
      status: 'IN_PROGRESS',
      clientVisible: true,
    },
    {
      key: 'slice',
      title: 'Frontend Slicing',
      description: 'Implement the dashboard UI. Needs the design AND the API.',
      department: 'FRONTEND',
      assigneeId: fe.id,
      status: 'TODO',
      clientVisible: true,
      dependsOn: ['ui', 'api'],
    },
    {
      key: 'notes',
      title: 'Internal: Vendor Security Review',
      description: 'Internal-only checklist. Not visible to the client.',
      department: 'BACKEND',
      assigneeId: be.id,
      status: 'TODO',
      clientVisible: false,
    },
    {
      key: 'qa',
      title: 'QA Regression Pass',
      description: 'Final QA once the frontend is sliced.',
      department: 'FRONTEND',
      assigneeId: fe.id,
      status: 'TODO',
      clientVisible: true,
      dependsOn: ['slice'],
    },
  ]);

  await seedTasks(zephyr.id, pm.id, [
    {
      key: 'z1',
      title: 'Zephyr – Data Model',
      description: 'Design the analytics schema.',
      department: 'BACKEND',
      assigneeId: be.id,
      status: 'IN_PROGRESS',
      clientVisible: true,
    },
    {
      key: 'z2',
      title: 'Zephyr – Charts UI',
      description: 'Build chart widgets.',
      department: 'FRONTEND',
      assigneeId: fe.id,
      status: 'TODO',
      clientVisible: true,
      dependsOn: ['z1'],
    },
  ]);

  console.log('Seed complete. All accounts use password:', SEED_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
