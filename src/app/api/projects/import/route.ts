import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { createProject, updateProject } from '@/lib/db/queries/projects';
import { createSubProject } from '@/lib/db/queries/sub-projects';
import { createTask } from '@/lib/db/queries/tasks';
import type { AgentType, ItemPriority, TaskStatus } from '@/types';

interface ImportSubProject {
  name: string;
  description?: string;
  sort_order?: number;
}

interface ImportTask {
  sub_project_name?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: ItemPriority;
  tags?: string[];
  sort_order?: number;
}

interface ImportPayload {
  format_version?: number;
  source?: string;
  project?: {
    name?: string;
    description?: string;
    agent_type?: AgentType;
    project_path?: string | null;
    ai_context?: string;
  };
  sub_projects?: ImportSubProject[];
  tasks?: ImportTask[];
  // TIMO-style payload fallback
  projects?: { name?: string; agent_type?: AgentType }[];
}

const VALID_STATUSES: TaskStatus[] = ['idea', 'doing', 'writing', 'submitted', 'testing', 'done', 'problem'];
const VALID_PRIORITIES: ItemPriority[] = ['high', 'medium', 'low'];

export async function POST(request: NextRequest) {
  await ensureDb();

  let body: ImportPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Accept both idea-manager and TIMO-ish payload shapes
  const projectInfo = body.project ?? (body.projects && body.projects[0]) ?? {};
  const name = (projectInfo.name || 'Imported Project').trim();
  const description = (body.project?.description || '').trim();

  const project = createProject(name, description, body.project?.project_path || undefined);

  if (body.project?.agent_type || body.project?.ai_context) {
    updateProject(project.id, {
      agent_type: body.project.agent_type,
      ai_context: body.project.ai_context,
    });
  }

  const subs = Array.isArray(body.sub_projects) ? body.sub_projects : [];
  const subNameToId = new Map<string, string>();
  for (const sp of subs) {
    if (!sp?.name?.trim()) continue;
    const created = createSubProject({
      project_id: project.id,
      name: sp.name.trim(),
      description: sp.description ?? '',
    });
    subNameToId.set(sp.name.trim(), created.id);
  }

  // Default bucket for tasks that don't reference a sub-project
  let defaultSubId: string | null = null;
  const getDefaultSub = () => {
    if (defaultSubId) return defaultSubId;
    const created = createSubProject({
      project_id: project.id,
      name: 'Imported',
      description: '',
    });
    defaultSubId = created.id;
    return defaultSubId;
  };

  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  let taskCount = 0;
  for (const t of tasks) {
    if (!t?.title?.trim()) continue;
    const subName = t.sub_project_name?.trim() || '';
    let subId = subName ? subNameToId.get(subName) : undefined;
    if (!subId && subName) {
      const created = createSubProject({ project_id: project.id, name: subName });
      subNameToId.set(subName, created.id);
      subId = created.id;
    }
    if (!subId) subId = getDefaultSub();

    const status: TaskStatus = VALID_STATUSES.includes(t.status as TaskStatus)
      ? (t.status as TaskStatus)
      : 'idea';
    const priority: ItemPriority = VALID_PRIORITIES.includes(t.priority as ItemPriority)
      ? (t.priority as ItemPriority)
      : 'medium';

    createTask({
      project_id: project.id,
      sub_project_id: subId,
      title: t.title.trim(),
      description: t.description ?? '',
      status,
      priority,
    });
    taskCount++;
  }

  return NextResponse.json({
    project_id: project.id,
    project_name: project.name,
    sub_projects_created: subNameToId.size + (defaultSubId ? 1 : 0),
    tasks_created: taskCount,
  });
}
