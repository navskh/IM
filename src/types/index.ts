export interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  ai_context: string;
  created_at: string;
  updated_at: string;
}

export interface IProjectContext {
  id: string;
  project_id: string;
  file_path: string;
  content: string;
  scanned_at: string;
}

export interface IBrainstorm {
  id: string;
  project_id: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ItemType = 'feature' | 'task' | 'bug' | 'idea' | 'note';
export type ItemStatus = 'pending' | 'in_progress' | 'done';
export type ItemPriority = 'high' | 'medium' | 'low';

export interface IItem {
  id: string;
  project_id: string;
  brainstorm_id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  item_type: ItemType;
  priority: ItemPriority;
  status: ItemStatus;
  is_locked: boolean;
  is_pinned: boolean;
  sort_order: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface IItemTree extends IItem {
  children: IItemTree[];
}

export interface IStructureResult {
  items: {
    id?: string;
    parent_id: string | null;
    title: string;
    description: string;
    item_type: ItemType;
    priority: ItemPriority;
    children?: IStructureResult['items'];
  }[];
}

export interface IConversation {
  id: string;
  project_id: string;
  role: 'assistant' | 'user';
  content: string;
  metadata: string | null;
  created_at: string;
}

export interface IMemo {
  id: string;
  project_id: string;
  conversation_id: string | null;
  anchor_text: string;
  question: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface IPrompt {
  id: string;
  project_id: string;
  item_id: string;
  content: string;
  prompt_type: 'auto' | 'manual';
  version: number;
  created_at: string;
}

// v2 types
export type TaskStatus = 'idea' | 'writing' | 'submitted' | 'testing' | 'done' | 'problem';

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

export interface ISubProjectWithStats extends ISubProject {
  task_count: number;
  active_count: number;
  pending_count: number;
  done_count: number;
  problem_count: number;
  last_activity: string | null;
  preview_tasks: { title: string; status: TaskStatus }[];
}

export interface IStructureWithQuestions {
  items: {
    title: string;
    description: string;
    item_type: ItemType;
    priority: ItemPriority;
    children?: IStructureWithQuestions['items'];
  }[];
  questions: {
    anchor_text: string;
    question: string;
  }[];
}
