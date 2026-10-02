import { http, type ListParams, api, listParams } from '@/lib/api';
import type {
  AuditEntry,
  ClientTask,
  Comment,
  Department,
  Metrics,
  Paginated,
  ProjectDetail,
  ProjectSummary,
  Standup,
  Task,
  TaskDetail,
  TaskStatus,
  User,
} from '@/lib/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/* ------------------------------ projects ------------------------------ */

export const useProjects = (params: ListParams = {}) =>
  useQuery({
    queryKey: ['projects', params],
    queryFn: () => api.get<Paginated<ProjectSummary>>('/projects', listParams(params)),
    placeholderData: keepPreviousData,
  });

export const useProject = (id: string) =>
  useQuery({ queryKey: ['project', id], queryFn: () => api.get<ProjectDetail>(`/projects/${id}`) });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      api.post<ProjectSummary>('/projects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};

export const useUsers = (enabled: boolean) =>
  useQuery({
    queryKey: ['users'],
    enabled,
    queryFn: () => api.get<Paginated<User>>('/users', listParams({ rows: 100, orderKey: 'name' })),
  });

export const useMembers = (projectId: string) => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['project', projectId] });
  return {
    add: useMutation({
      mutationFn: (userId: string) => api.post(`/projects/${projectId}/members`, { userId }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.delete(`/projects/${projectId}/members/${userId}`),
      onSuccess: invalidate,
    }),
  };
};

export const useStandup = (projectId: string, date: string, enabled = true) =>
  useQuery({
    queryKey: ['standup', projectId, date],
    enabled,
    queryFn: () => api.get<Standup>(`/projects/${projectId}/standup`, date ? { date } : undefined),
  });

export const useProjectAudit = (projectId: string, page: number, enabled = true) =>
  useQuery({
    queryKey: ['project-audit', projectId, page],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api.get<Paginated<AuditEntry & { taskId: string | null }>>(
        `/projects/${projectId}/audit-logs`,
        listParams({ page, rows: 15 }),
      ),
  });

/* ------------------------------ tasks ------------------------------ */

export const useTasks = <T extends Task | ClientTask>(projectId: string) =>
  useQuery({
    queryKey: ['tasks', projectId],
    // The board shows the whole project at once (API max page size is 100).
    queryFn: () =>
      api.get<Paginated<T>>(
        `/projects/${projectId}/tasks`,
        listParams({ rows: 100, orderKey: 'createdAt', orderRule: 'asc' }),
      ),
  });

export const useTask = (id: string | null) =>
  useQuery({
    queryKey: ['task', id],
    enabled: !!id,
    refetchInterval: 15_000,
    queryFn: () => api.get<TaskDetail>(`/tasks/${id}`),
  });

export const useTaskAudit = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['task-audit', id],
    enabled,
    queryFn: () =>
      api.get<Paginated<AuditEntry>>(`/tasks/${id}/audit-logs`, listParams({ rows: 50 })),
  });

export const useComments = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['comments', id],
    enabled,
    queryFn: () => api.get<Paginated<Comment>>(`/tasks/${id}/comments`, listParams({ rows: 50 })),
  });

export function useTaskActions(projectId: string, taskId?: string) {
  const qc = useQueryClient();
  const refresh = (id?: string) => {
    qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['standup', projectId] });
    qc.invalidateQueries({ queryKey: ['project-audit', projectId] });
    if (id) {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['task-audit', id] });
    }
  };

  return {
    refresh,
    create: useMutation({
      mutationFn: (body: {
        title: string;
        description: string;
        department: Department;
        assigneeId?: string | null;
        clientVisible: boolean;
      }) => api.post<Task>(`/projects/${projectId}/tasks`, body),
      onSuccess: (t) => refresh(t.id),
    }),
    update: useMutation({
      mutationFn: (body: {
        version: number;
        title?: string;
        description?: string;
        department?: Department;
        assigneeId?: string | null;
        clientVisible?: boolean;
      }) => api.patch<Task>(`/tasks/${taskId}`, body),
      onSuccess: () => refresh(taskId),
    }),
    changeStatus: useMutation({
      mutationFn: (body: { status: TaskStatus; version: number }) =>
        api.patch<Task>(`/tasks/${taskId}/status`, body),
      onSuccess: () => refresh(taskId),
    }),
    remove: useMutation({
      mutationFn: (version: number) => api.delete(`/tasks/${taskId}`, { version }),
      onSuccess: () => refresh(taskId),
    }),
    addDependency: useMutation({
      mutationFn: (dependsOnId: string) =>
        api.post<Task>(`/tasks/${taskId}/dependencies`, { dependsOnId }),
      onSuccess: () => refresh(taskId),
    }),
    removeDependency: useMutation({
      mutationFn: (dependsOnId: string) =>
        api.delete<Task>(`/tasks/${taskId}/dependencies/${dependsOnId}`),
      onSuccess: () => refresh(taskId),
    }),
    upload: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return (await http.post(`/tasks/${taskId}/attachments`, form)).data;
      },
      onSuccess: () => refresh(taskId),
    }),
    comment: useMutation({
      mutationFn: (body: string) => api.post(`/tasks/${taskId}/comments`, { body }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['comments', taskId] });
        refresh(taskId);
      },
    }),
  };
}

export const downloadAttachment = async (id: string, fileName: string) => {
  const res = await http.get(`/tasks/attachments/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export type { Metrics };
