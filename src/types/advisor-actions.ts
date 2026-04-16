import type { TaskStatus } from './index';

export interface CreateTaskAction {
  type: 'create_task';
  subProjectId: string;
  projectId?: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: TaskStatus;
}

export interface UpdateTaskAction {
  type: 'update_task';
  taskId: string;
  changes: {
    status?: TaskStatus;
    priority?: 'high' | 'medium' | 'low';
    description?: string;
    title?: string;
    is_today?: boolean;
  };
}

export type AdvisorAction = CreateTaskAction | UpdateTaskAction;
