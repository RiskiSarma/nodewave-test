export type Role = 'PM' | 'INTERNAL' | 'CLIENT';
export type Department = 'PRODUCT' | 'UIUX' | 'FRONTEND' | 'BACKEND';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: Department | null;
  avatarUrl: string | null;
}

export interface Paginated<T> {
  entries: T[];
  totalData: number;
  totalPage: number;
  page: number;
  rows: number;
}

export interface Metrics {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  blocked: number;
  percentComplete: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  metrics: Metrics;
  createdAt?: string;
}

export interface ProjectDetail extends ProjectSummary {
  members?: User[];
}

export interface Prerequisite {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface StatusPermission {
  allowed: boolean;
  code?: string;
  reason?: string;
}

/** What PM / Internal users receive. */
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  department: Department;
  assignee: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: Department | null;
  } | null;
  clientVisible: boolean;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  isBlocked: boolean;
  blockedBy: Prerequisite[];
  dependsOn: Prerequisite[];
  commentCount: number;
  attachmentCount: number;
  permissions: {
    canEditCore: boolean;
    canUploadAttachment: boolean;
    canManageDependencies: boolean;
    status: Record<TaskStatus, StatusPermission>;
  };
}

export interface TaskDetail extends Task {
  dependents: Prerequisite[];
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
    uploader: { id: string; name: string };
  }[];
}

/** What a Client Guest receives: identities are already masked by the API. */
export interface ClientTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
  dueDate: string | null;
  updatedAt: string;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null; department: Department | null };
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  changedColumn: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string; department: Department | null };
}

export interface Standup {
  projectId: string;
  date: string;
  generatedAt: string;
  totals: { completed: number; blocked: number };
  departments: {
    department: Department;
    completedYesterday: {
      taskId: string;
      title: string;
      completedBy: string;
      completedAt: string;
    }[];
    blockedToday: { taskId: string; title: string; blockedBy: Prerequisite[] }[];
  }[];
}
