import type { Task } from '@/lib/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskCard } from './task-card';

const base: Task = {
  id: 't1',
  projectId: 'p1',
  title: 'Frontend Slicing',
  description: '',
  status: 'TODO',
  department: 'FRONTEND',
  assignee: { id: 'u1', name: 'Felix Frontend', avatarUrl: null, department: 'FRONTEND' },
  clientVisible: true,
  dueDate: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isBlocked: false,
  blockedBy: [],
  dependsOn: [],
  commentCount: 0,
  attachmentCount: 0,
  permissions: {
    canEditCore: false,
    canUploadAttachment: true,
    canManageDependencies: false,
    status: {
      TODO: { allowed: false },
      IN_PROGRESS: { allowed: true },
      DONE: { allowed: false },
    },
  },
};

describe('TaskCard', () => {
  it('shows the blocked state and what it is waiting on', () => {
    render(
      <TaskCard
        onOpen={() => {}}
        task={{
          ...base,
          isBlocked: true,
          blockedBy: [{ id: 'a', title: 'UI Design', status: 'IN_PROGRESS' }],
          dependsOn: [
            { id: 'a', title: 'UI Design', status: 'IN_PROGRESS' },
            { id: 'b', title: 'Backend API', status: 'DONE' },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/Waiting on UI Design/)).toBeInTheDocument();
    expect(screen.getByText('1/2 prerequisites')).toBeInTheDocument();
  });

  it('does not show a blocked warning for a ready task and opens on click', async () => {
    const onOpen = vi.fn();
    render(<TaskCard task={base} onOpen={onOpen} />);
    expect(screen.queryByLabelText('Blocked')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('task-card'));
    expect(onOpen).toHaveBeenCalledWith('t1');
  });
});
