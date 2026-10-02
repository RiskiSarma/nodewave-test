import { describe, expect, test } from 'bun:test';
import {
  type Actor,
  type PolicyTask,
  canUploadAttachment,
  computeMetrics,
  evaluateStatusChange,
  isBlocked,
  permissionsFor,
} from '../src/lib/policy';

const pm: Actor = { id: 'pm', role: 'PM', department: 'PRODUCT' };
const fe: Actor = { id: 'fe', role: 'INTERNAL', department: 'FRONTEND' };
const otherFe: Actor = { id: 'fe2', role: 'INTERNAL', department: 'FRONTEND' };
const client: Actor = { id: 'c', role: 'CLIENT', department: null };

const task = (over: Partial<PolicyTask> = {}): PolicyTask => ({
  status: 'TODO',
  assigneeId: 'fe',
  prerequisites: [],
  ...over,
});
const doneDep = { id: 'a', title: 'UI', status: 'DONE' as const };
const openDep = { id: 'b', title: 'API', status: 'IN_PROGRESS' as const };

describe('state-based permissions', () => {
  test('executor can start a task whose prerequisites are all DONE', () => {
    expect(
      evaluateStatusChange(fe, task({ prerequisites: [doneDep] }), 'IN_PROGRESS').allowed,
    ).toBe(true);
  });

  test('task is blocked until BOTH prerequisites are done', () => {
    const t = task({ prerequisites: [doneDep, openDep] });
    expect(isBlocked(t)).toBe(true);
    const d = evaluateStatusChange(fe, t, 'IN_PROGRESS');
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.code).toBe('TASK_BLOCKED');
      expect(d.httpStatus).toBe(422);
    }
  });

  test('PM cannot move IN_PROGRESS -> DONE, executor can', () => {
    const t = task({ status: 'IN_PROGRESS' });
    const d = evaluateStatusChange(pm, t, 'DONE');
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('PM_CANNOT_COMPLETE');
    expect(evaluateStatusChange(fe, t, 'DONE').allowed).toBe(true);
  });

  test('only the assignee may change status', () => {
    const d = evaluateStatusChange(otherFe, task(), 'IN_PROGRESS');
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('NOT_EXECUTOR');
  });

  test('clients are read-only and TODO -> DONE is illegal', () => {
    expect(evaluateStatusChange(client, task(), 'IN_PROGRESS').allowed).toBe(false);
    const d = evaluateStatusChange(fe, task(), 'DONE');
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('INVALID_TRANSITION');
  });

  test('permissionsFor tells the UI which buttons to lock', () => {
    const p = permissionsFor(fe, task({ prerequisites: [openDep] }));
    expect(p.status.IN_PROGRESS.allowed).toBe(false);
    expect(p.status.IN_PROGRESS.code).toBe('TASK_BLOCKED');
    expect(p.canEditCore).toBe(false);
  });

  test('attachments: PM or assignee only', () => {
    expect(canUploadAttachment(fe, task()).allowed).toBe(true);
    expect(canUploadAttachment(otherFe, task()).allowed).toBe(false);
    expect(canUploadAttachment(client, task()).allowed).toBe(false);
  });
});

describe('metrics', () => {
  test('percent complete + blocked counts', () => {
    const m = computeMetrics([
      task({ status: 'DONE' }),
      task({ status: 'IN_PROGRESS' }),
      task({ prerequisites: [openDep] }),
      task(),
    ]);
    expect(m).toEqual({
      total: 4,
      done: 1,
      inProgress: 1,
      todo: 1,
      blocked: 1,
      percentComplete: 25,
    });
  });

  test('empty project is 0%', () => {
    expect(computeMetrics([]).percentComplete).toBe(0);
  });
});
