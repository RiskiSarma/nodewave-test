'use client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useTaskActions } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { DEPARTMENTS, DEPARTMENT_LABEL } from '@/lib/labels';
import type { User } from '@/lib/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(10000),
  department: z.enum(['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND']),
  assigneeId: z.string(),
  clientVisible: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function CreateTaskDialog({ projectId, members }: { projectId: string; members: User[] }) {
  const [open, setOpen] = useState(false);
  const { create } = useTaskActions(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      department: 'FRONTEND',
      assigneeId: '',
      clientVisible: false,
    },
  });
  const { errors } = form.formState;
  const assignable = members.filter((m) => m.role === 'INTERNAL');

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await create.mutateAsync({ ...v, assigneeId: v.assigneeId || null });
      toast.success('Task created');
      form.reset();
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent title="New task" description="Dependencies can be added once the task exists.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Title" htmlFor="ct-title" error={errors.title?.message}>
            <Input id="ct-title" {...form.register('title')} />
          </Field>
          <Field label="Description" htmlFor="ct-desc" error={errors.description?.message}>
            <Textarea id="ct-desc" {...form.register('description')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" htmlFor="ct-dept">
              <Select id="ct-dept" {...form.register('department')}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABEL[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="ct-assignee">
              <Select id="ct-assignee" {...form.register('assigneeId')}>
                <option value="">Unassigned</option>
                {assignable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.department ? DEPARTMENT_LABEL[m.department] : '—'})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-wave-600"
              {...form.register('clientVisible')}
            />
            Visible to the client guest
          </label>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
