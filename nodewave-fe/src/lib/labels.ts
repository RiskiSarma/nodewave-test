import type { Department, Role, TaskStatus } from './types';

export const DEPARTMENT_LABEL: Record<Department, string> = {
  PRODUCT: 'Product',
  UIUX: 'UI/UX',
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
};
export const DEPARTMENTS = Object.keys(DEPARTMENT_LABEL) as Department[];
export const ROLE_LABEL: Record<Role, string> = {
  PM: 'Product Manager',
  INTERNAL: 'Internal team',
  CLIENT: 'Client guest',
};
export const STATUS_ACTION: Record<TaskStatus, { to: TaskStatus; label: string }[]> = {
  TODO: [{ to: 'IN_PROGRESS', label: 'Start work' }],
  IN_PROGRESS: [
    { to: 'TODO', label: 'Move back to To do' },
    { to: 'DONE', label: 'Mark as done' },
  ],
  DONE: [{ to: 'IN_PROGRESS', label: 'Reopen' }],
};
