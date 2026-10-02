# NodeWave Backend

Bun + Hono + Prisma + PostgreSQL API for the deliverable-management assessment.

## Run locally

```bash
cp .env.example .env        # set DATABASE_URL + JWT_SECRET
bun install
bunx prisma migrate deploy  # applies prisma/migrations (tables + immutable audit triggers)
bun run seed                # seeded accounts, password: Password123!
bun run dev                 # http://localhost:8080
```

Checks: `bun run lint`, `bun run typecheck`, `bun test` (unit), `E2E=1 bun test` (integration, needs migrated + seeded DB).

## Seeded accounts (password `Password123!`)

| Role | Email |
| --- | --- |
| Product Manager | pm@nodewave.test |
| UI/UX | uiux@nodewave.test |
| Frontend | frontend@nodewave.test |
| Backend | backend@nodewave.test |
| Client Guest (Project Apollo) | client@nodewave.test |
| Client Guest (Project Zephyr) | client2@nodewave.test |

## Architecture

- **RBAC + ABAC** – `src/lib/policy.ts` is a pure module (no I/O). Role = who, membership/department/assignee = attributes, task status = state. The same functions guard the API and produce `permissions` on each task so the UI disables exactly what the API would reject.
- **State-based permissions** – legal transitions `TODO→IN_PROGRESS`, `IN_PROGRESS→TODO|DONE`, `DONE→IN_PROGRESS`. Executor (assignee) only; PM cannot do `IN_PROGRESS→DONE` (`403 PM_CANNOT_COMPLETE`); engineers cannot edit core fields (route is PM-only).
- **Dependencies** – `TaskDependency(taskId, dependsOnId)`. "Blocked" is derived, never stored: a task with any prerequisite not `DONE` cannot enter `IN_PROGRESS`/`DONE` (`422 TASK_BLOCKED` + list of blockers). Cycles rejected (`422 CIRCULAR_DEPENDENCY`).
- **Concurrency** – optimistic locking with `Task.version`. Writes are `UPDATE ... WHERE id AND version = :sent` + `version + 1`; 0 rows → `409 VERSION_CONFLICT` with the latest task in `error.details`. Covered by a parallel-request e2e test.
- **Audit trail** – `AuditLog` row per changed column (user, timestamp, column, old, new), written in the same transaction as the change. DB triggers reject `UPDATE`/`DELETE`/`TRUNCATE` on the table. Soft deletes (`deletedAt`) everywhere; nothing is physically removed.
- **Client isolation & masking** – client sees own project only (404 for others), only `clientVisible` tasks, and whitelist serializers return `id/title/description/status/isBlocked/dueDate` only: no names, avatars, departments, comments, attachments, versions. Filter/sort by hidden columns is rejected (400) so order cannot leak masked data.
- **Standup** – `GET /projects/:id/standup?date=YYYY-MM-DD` (default: yesterday, UTC): per department `completedYesterday` (from audit) and `blockedToday`.
- **Query contract** – every list endpoint uses `@nodewave/prisma-ezfilter`: `filters`, `searchFilters`, `rangedFilters` (JSON), `orderKey`, `orderRule`, `page`, `rows`. Response: `{ entries, totalData, totalPage, page, rows }`. Field allowlist enforced per endpoint.

## Endpoints

`POST /auth/register|login|logout`, `GET /auth/me` · `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `/projects/:id/metrics|members|audit-logs|standup` · `GET/POST /projects/:id/tasks` · `GET/PATCH/DELETE /tasks/:id`, `PATCH /tasks/:id/status`, `POST/DELETE /tasks/:id/dependencies`, `/tasks/:id/attachments|comments|audit-logs` · `GET /users` (PM).

Responses: `{ success: true, data }` / `{ success: false, error: { code, message, details? } }`.

## Deploy (Railway / Render / Fly)

Provision PostgreSQL, set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` (frontend origin, comma separated for several), deploy with the `Dockerfile` (runs migrate + seed + start). Attachments use local disk (`UPLOAD_DIR`); mount a volume for persistence.
