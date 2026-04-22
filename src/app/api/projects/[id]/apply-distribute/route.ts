import { NextRequest, NextResponse } from 'next/server';
import { createSubProject } from '@/lib/db/queries/sub-projects';
import { createTask } from '@/lib/db/queries/tasks';
import { getProject } from '@/lib/db/queries/projects';
import { createDistributionHistory } from '@/lib/db/queries/distribution-history';
import { ensureDb } from '@/lib/db';
import type { ItemPriority } from '@/types';

interface DistTask {
  title: string;
  description?: string;
  priority?: ItemPriority;
}

interface Distribution {
  sub_project_name: string;
  is_new: boolean;
  existing_sub_id: string | null;
  tasks: DistTask[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json();
  const distributions: Distribution[] = body.distributions;

  if (!Array.isArray(distributions)) {
    return NextResponse.json({ error: 'distributions array required' }, { status: 400 });
  }

  const results: { sub_project_id: string; sub_project_name: string; tasks_created: number }[] = [];
  const createdSubIds: string[] = [];
  const createdTaskIds: string[] = [];

  for (const dist of distributions) {
    if (!dist.tasks || dist.tasks.length === 0) continue;

    let subId: string;

    if (dist.is_new || !dist.existing_sub_id) {
      const sp = createSubProject({
        project_id: id,
        name: dist.sub_project_name,
      });
      subId = sp.id;
      createdSubIds.push(subId);
    } else {
      subId = dist.existing_sub_id;
    }

    let tasksCreated = 0;
    for (const task of dist.tasks) {
      if (!task.title?.trim()) continue;
      const created = createTask({
        project_id: id,
        sub_project_id: subId,
        title: task.title.trim(),
        description: task.description || '',
        priority: task.priority || 'medium',
      });
      createdTaskIds.push(created.id);
      tasksCreated++;
    }

    results.push({
      sub_project_id: subId,
      sub_project_name: dist.sub_project_name,
      tasks_created: tasksCreated,
    });
  }

  const totalTasks = createdTaskIds.length;
  let historyId: string | null = null;
  if (totalTasks > 0 || createdSubIds.length > 0) {
    const summary = `${totalTasks}개 태스크 · ${createdSubIds.length}개 신규 서브프로젝트`;
    const history = createDistributionHistory({
      project_id: id,
      source: 'auto-distribute',
      created_sub_project_ids: createdSubIds,
      created_task_ids: createdTaskIds,
      summary,
    });
    historyId = history.id;
  }

  return NextResponse.json({ results, historyId });
}
