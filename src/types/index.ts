export type AgentType = 'claude' | 'gemini' | 'codex';

export interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  ai_context: string;
  watch_enabled: boolean;
  agent_type: AgentType;
  created_at: string;
  updated_at: string;
}

export interface IBrainstorm {
  id: string;
  project_id: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ItemPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'idea' | 'doing' | 'writing' | 'submitted' | 'testing' | 'done' | 'problem';
export const ACTIVE_STATUSES: TaskStatus[] = ['idea', 'doing', 'done', 'problem'];
export const LEGACY_STATUSES: TaskStatus[] = ['writing', 'submitted', 'testing'];

export interface ISubProject {
  id: string;
  project_id: string;
  name: string;
  description: string;
  folder_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ITask {
  id: string;
  project_id: string;
  sub_project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: ItemPriority;
  is_today: boolean;
  is_archived: boolean;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ITaskPrompt {
  id: string;
  task_id: string;
  content: string;
  prompt_type: 'manual' | 'ai_assisted';
  created_at: string;
  updated_at: string;
}

export interface ITaskConversation {
  id: string;
  task_id: string;
  role: 'assistant' | 'user';
  content: string;
  created_at: string;
}

export interface IProjectConversation {
  id: string;
  project_id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  created_at: string;
}

export interface IGitSyncResult {
  projectId: string;
  projectName: string;
  projectPath: string;
  status: 'success' | 'error' | 'no-git' | 'no-path';
  message: string;
}

export interface ISubProjectWithStats extends ISubProject {
  task_count: number;
  active_count: number;
  pending_count: number;
  done_count: number;
  problem_count: number;
  last_activity: string | null;
  preview_tasks: { title: string; status: TaskStatus }[];
}
