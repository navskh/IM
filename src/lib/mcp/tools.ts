import type { ITask, ITaskPrompt, ISubProject } from '@/types';

export interface McpToolContext {
  listProjects: () => { id: string; name: string; description: string; created_at: string; updated_at: string }[];
  getProject: (id: string) => { id: string; name: string; description: string } | undefined;
  getSubProjects: (projectId: string) => ISubProject[];
  getTasksByProject: (projectId: string) => ITask[];
  getTaskPrompt: (taskId: string) => ITaskPrompt | undefined;
  updateTask: (id: string, data: Record<string, unknown>) => ITask | undefined;
}

export function getNextTask(ctx: McpToolContext, projectId: string): {
  task: ITask;
  prompt?: ITaskPrompt;
} | null {
  const tasks = ctx.getTasksByProject(projectId);

  // Find submitted tasks with prompts (ready to execute)
  const ready = tasks.filter(t => t.status === 'submitted');
  if (ready.length === 0) return null;

  ready.sort((a, b) => a.sort_order - b.sort_order);
  const task = ready[0];
  const prompt = ctx.getTaskPrompt(task.id);

  return { task, prompt };
}

export function getProjectContext(ctx: McpToolContext, projectId: string): {
  project: { id: string; name: string; description: string } | undefined;
  subProjects: ISubProject[];
  tasks: ITask[];
  stats: { total: number; idea: number; writing: number; submitted: number; testing: number; done: number; problem: number };
} {
  const project = ctx.getProject(projectId);
  const subProjects = ctx.getSubProjects(projectId);
  const tasks = ctx.getTasksByProject(projectId);

  const stats = {
    total: tasks.length,
    idea: tasks.filter(t => t.status === 'idea').length,
    writing: tasks.filter(t => t.status === 'writing').length,
    submitted: tasks.filter(t => t.status === 'submitted').length,
    testing: tasks.filter(t => t.status === 'testing').length,
    done: tasks.filter(t => t.status === 'done').length,
    problem: tasks.filter(t => t.status === 'problem').length,
  };

  return { project, subProjects, tasks, stats };
}

export function formatTaskForMcp(task: ITask, prompt?: ITaskPrompt): string {
  const lines = [
    `Title: ${task.title}`,
    `Description: ${task.description}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
  ];

  if (prompt?.content) {
    lines.push('', '--- Prompt ---', prompt.content);
  }

  return lines.join('\n');
}

export function formatProjectForMcp(
  subProjects: ISubProject[],
  tasks: ITask[],
): string {
  const lines: string[] = [];
  for (const sp of subProjects) {
    lines.push(`[${sp.name}]`);
    const spTasks = tasks.filter(t => t.sub_project_id === sp.id);
    if (spTasks.length === 0) {
      lines.push('  (no tasks)');
    } else {
      for (const t of spTasks) {
        const icon = t.status === 'done' ? 'v' : t.status === 'submitted' ? '>' : t.status === 'testing' ? '~' : t.status === 'problem' ? '!' : '-';
        lines.push(`  ${icon} ${t.title} [${t.status}]`);
      }
    }
  }
  return lines.join('\n');
}
