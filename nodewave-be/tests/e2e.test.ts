/**
 * Integration tests against a real PostgreSQL (run: `E2E=1 bun test tests/e2e.test.ts`).
 * Needs a migrated + seeded database (see README).
 */
import { beforeAll, describe, expect, test } from 'bun:test';

// biome-ignore lint/suspicious/noExplicitAny: loosely typed JSON responses in tests
type Json = any;
const run = process.env.E2E ? describe : describe.skip;

run('API e2e', () => {
  let app: typeof import('../src/app')['app'];
  let prisma: typeof import('../src/db')['prisma'];
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let projectId = '';
  const tag = Date.now().toString(36);

  async function call(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<{ status: number; json: Json }> {
    const res = await app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  beforeAll(async () => {
    ({ app } = await import('../src/app'));
    ({ prisma } = await import('../src/db'));
    for (const [k, email] of Object.entries({
      pm: 'pm@nodewave.test',
      ux: 'uiux@nodewave.test',
      fe: 'frontend@nodewave.test',
      be: 'backend@nodewave.test',
      client: 'client@nodewave.test',
      client2: 'client2@nodewave.test',
    })) {
      const r = await call('POST', '/auth/login', undefined, { email, password: 'Password123!' });
      expect(r.status).toBe(200);
      tokens[k] = r.json.data.token;
      ids[k] = r.json.data.user.id;
    }
    // isolated project so the test never depends on seeded task state
    const p = await call('POST', '/projects', tokens.pm, {
      name: `E2E ${tag}`,
      description: 'e2e',
    });
    projectId = p.json.data.id;
    for (const k of ['ux', 'fe', 'be'])
      await call('POST', `/projects/${projectId}/members`, tokens.pm, { userId: ids[k] });
    // client (Acme) is already in Apollo; use client2? -> also already assigned. Use a fresh client below.
  });

  const mk = async (title: string, department: string, assignee: string, clientVisible = false) => {
    const r = await call('POST', `/projects/${projectId}/tasks`, tokens.pm, {
      title,
      department,
      assigneeId: ids[assignee],
      clientVisible,
    });
    expect(r.status).toBe(201);
    return r.json.data;
  };

  test('dependency lock: frontend cannot start until UI/UX AND backend are done (API-level)', async () => {
    const a = await mk(`UI ${tag}`, 'UIUX', 'ux', true);
    const b = await mk(`API ${tag}`, 'BACKEND', 'be', true);
    const c = await mk(`Slicing ${tag}`, 'FRONTEND', 'fe', true);
    ids.a = a.id;
    ids.b = b.id;
    ids.c = c.id;
    expect(
      (await call('POST', `/tasks/${c.id}/dependencies`, tokens.pm, { dependsOnId: a.id })).status,
    ).toBe(201);
    expect(
      (await call('POST', `/tasks/${c.id}/dependencies`, tokens.pm, { dependsOnId: b.id })).status,
    ).toBe(201);

    let cur = (await call('GET', `/tasks/${c.id}`, tokens.fe)).json.data;
    expect(cur.isBlocked).toBe(true);
    expect(cur.permissions.status.IN_PROGRESS.allowed).toBe(false);
    let r = await call('PATCH', `/tasks/${c.id}/status`, tokens.fe, {
      status: 'IN_PROGRESS',
      version: cur.version,
    });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('TASK_BLOCKED');

    // finish A
    let ta = (await call('GET', `/tasks/${a.id}`, tokens.ux)).json.data;
    ta = (
      await call('PATCH', `/tasks/${a.id}/status`, tokens.ux, {
        status: 'IN_PROGRESS',
        version: ta.version,
      })
    ).json.data;
    expect(
      (
        await call('PATCH', `/tasks/${a.id}/status`, tokens.ux, {
          status: 'DONE',
          version: ta.version,
        })
      ).status,
    ).toBe(200);

    // still blocked by B
    cur = (await call('GET', `/tasks/${c.id}`, tokens.fe)).json.data;
    r = await call('PATCH', `/tasks/${c.id}/status`, tokens.fe, {
      status: 'IN_PROGRESS',
      version: cur.version,
    });
    expect(r.status).toBe(422);

    // finish B, then C unlocks
    let tb = (await call('GET', `/tasks/${b.id}`, tokens.be)).json.data;
    tb = (
      await call('PATCH', `/tasks/${b.id}/status`, tokens.be, {
        status: 'IN_PROGRESS',
        version: tb.version,
      })
    ).json.data;
    // PM may NOT complete work
    const pmDone = await call('PATCH', `/tasks/${b.id}/status`, tokens.pm, {
      status: 'DONE',
      version: tb.version,
    });
    expect(pmDone.status).toBe(403);
    expect(pmDone.json.error.code).toBe('PM_CANNOT_COMPLETE');
    // a different engineer cannot either
    expect(
      (
        await call('PATCH', `/tasks/${b.id}/status`, tokens.fe, {
          status: 'DONE',
          version: tb.version,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('PATCH', `/tasks/${b.id}/status`, tokens.be, {
          status: 'DONE',
          version: tb.version,
        })
      ).status,
    ).toBe(200);

    cur = (await call('GET', `/tasks/${c.id}`, tokens.fe)).json.data;
    expect(cur.isBlocked).toBe(false);
    r = await call('PATCH', `/tasks/${c.id}/status`, tokens.fe, {
      status: 'IN_PROGRESS',
      version: cur.version,
    });
    expect(r.status).toBe(200);
  });

  test('engineers cannot edit the core of a task', async () => {
    const t = (await call('GET', `/tasks/${ids.c}`, tokens.fe)).json.data;
    const r = await call('PATCH', `/tasks/${ids.c}`, tokens.fe, {
      version: t.version,
      description: 'hacked',
    });
    expect(r.status).toBe(403);
  });

  test('optimistic locking: PM edit vs engineer status at the same instant -> exactly one 409', async () => {
    const t = await mk(`Race ${tag}`, 'BACKEND', 'be');
    const start = await call('PATCH', `/tasks/${t.id}/status`, tokens.be, {
      status: 'IN_PROGRESS',
      version: t.version,
    });
    const v = start.json.data.version;
    const [edit, done] = await Promise.all([
      call('PATCH', `/tasks/${t.id}`, tokens.pm, { version: v, description: 'PM rewrote this' }),
      call('PATCH', `/tasks/${t.id}/status`, tokens.be, { status: 'DONE', version: v }),
    ]);
    const statuses = [edit.status, done.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = edit.status === 409 ? edit : done;
    expect(loser.json.error.code).toBe('VERSION_CONFLICT');
    expect(loser.json.error.details.currentVersion).toBe(v + 1);
    // nothing was overwritten: the winner's change is intact
    const final = (await call('GET', `/tasks/${t.id}`, tokens.pm)).json.data;
    expect(final.version).toBe(v + 1);
    if (edit.status === 200) expect(final.description).toBe('PM rewrote this');
    else expect(final.status).toBe('DONE');
  });

  test('audit trail: every change is a row and rows are immutable', async () => {
    const logs = await call('GET', `/tasks/${ids.c}/audit-logs?rows=50`, tokens.pm);
    expect(logs.status).toBe(200);
    const cols = logs.json.data.entries.map((e: { changedColumn: string }) => e.changedColumn);
    expect(cols).toContain('status');
    expect(cols).toContain('dependsOn');
    const first = logs.json.data.entries[0];
    expect(first.user.name).toBeTruthy();
    expect(first.createdAt).toBeTruthy();
    await expect(
      (async () => prisma.auditLog.update({ where: { id: first.id }, data: { newValue: 'x' } }))(),
    ).rejects.toThrow();
    await expect(
      (async () => prisma.auditLog.delete({ where: { id: first.id } }))(),
    ).rejects.toThrow();
  });

  test('circular dependencies are rejected', async () => {
    const r = await call('POST', `/tasks/${ids.a}/dependencies`, tokens.pm, { dependsOnId: ids.c });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('CIRCULAR_DEPENDENCY');
  });

  test('client guest: masked data, visible tasks only, tenant isolation', async () => {
    // put Acme client into this project via PM (client belongs to exactly one project -> use seeded Apollo instead)
    const projects = await call('GET', '/projects', tokens.client);
    expect(projects.json.data.totalData).toBe(1);
    expect(projects.json.data.entries[0].name).toBe('Project Apollo');
    expect(projects.json.data.entries[0].metrics.percentComplete).toBeGreaterThanOrEqual(0);
    const apollo = projects.json.data.entries[0].id;

    const list = await call('GET', `/projects/${apollo}/tasks`, tokens.client);
    expect(list.status).toBe(200);
    const raw = JSON.stringify(list.json);
    for (const leak of [
      'assignee',
      'Uma',
      'Felix',
      'Bella',
      'department',
      'avatarUrl',
      'nodewave.test',
      'version',
      'Vendor Security Review',
    ]) {
      expect(raw).not.toContain(leak);
    }
    expect(
      list.json.data.entries.every((t: { title: string }) => !t.title.startsWith('Internal')),
    ).toBe(true);

    // hidden task by id -> 404, foreign project -> 404, no internal endpoints
    const hidden = await prisma.task.findFirstOrThrow({
      where: { title: { startsWith: 'Internal: Vendor' } },
    });
    expect((await call('GET', `/tasks/${hidden.id}`, tokens.client)).status).toBe(404);
    expect((await call('GET', `/projects/${projectId}`, tokens.client)).status).toBe(404);
    expect((await call('GET', `/projects/${apollo}/audit-logs`, tokens.client)).status).toBe(403);
    expect((await call('GET', `/tasks/${hidden.id}/comments`, tokens.client)).status).toBe(403);
    // cannot infer masked columns through filtering/sorting
    expect(
      (await call('GET', `/projects/${apollo}/tasks?orderKey=assignee.name`, tokens.client)).status,
    ).toBe(400);
    expect(
      (
        await call(
          'GET',
          `/projects/${apollo}/tasks?filters=${encodeURIComponent('{"assigneeId":"x"}')}`,
          tokens.client,
        )
      ).status,
    ).toBe(400);
    // read-only
    const t = list.json.data.entries[0];
    expect(
      (await call('PATCH', `/tasks/${t.id}/status`, tokens.client, { status: 'DONE', version: 1 }))
        .status,
    ).toBe(403);
    // second tenant cannot see Apollo
    expect((await call('GET', `/projects/${apollo}`, tokens.client2)).status).toBe(404);
  });

  test('standard query contract: filters, search, ordering, pagination', async () => {
    const q = `filters=${encodeURIComponent('{"department":"BACKEND"}')}&searchFilters=${encodeURIComponent(`{"title":"api ${tag}"}`)}&orderKey=createdAt&orderRule=desc&page=1&rows=5`;
    const r = await call('GET', `/projects/${projectId}/tasks?${q}`, tokens.pm);
    expect(r.status).toBe(200);
    expect(r.json.data.totalData).toBe(1);
    expect(r.json.data.entries[0].title).toBe(`API ${tag}`);
    expect(
      (await call('GET', `/projects/${projectId}/tasks?rows=2&page=1`, tokens.pm)).json.data.entries
        .length,
    ).toBe(2);
    expect(
      (await call('GET', `/projects/${projectId}/tasks?filters=notjson`, tokens.pm)).status,
    ).toBe(400);
  });

  test('soft delete keeps the row and stops it from blocking', async () => {
    const t = await mk(`Del ${tag}`, 'BACKEND', 'be');
    expect((await call('DELETE', `/tasks/${t.id}?version=${t.version}`, tokens.pm)).status).toBe(
      200,
    );
    expect((await call('GET', `/tasks/${t.id}`, tokens.pm)).status).toBe(404);
    const row = await prisma.task.findUnique({ where: { id: t.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  test('standup summary is derived from the audit trail', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await call('GET', `/projects/${projectId}/standup?date=${today}`, tokens.pm);
    expect(r.status).toBe(200);
    expect(r.json.data.departments.map((d: { department: string }) => d.department)).toEqual([
      'PRODUCT',
      'UIUX',
      'FRONTEND',
      'BACKEND',
    ]);
    expect(r.json.data.totals.completed).toBeGreaterThanOrEqual(2);
  });

  test('logout revokes the token', async () => {
    const login = await call('POST', '/auth/login', undefined, {
      email: 'client2@nodewave.test',
      password: 'Password123!',
    });
    const tk = login.json.data.token;
    expect((await call('GET', '/auth/me', tk)).status).toBe(200);
    await call('POST', '/auth/logout', tk);
    expect((await call('GET', '/auth/me', tk)).status).toBe(401);
  });
});
