import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { createTask, updateTask, getTask } from '@/lib/db/queries/tasks';
import { getSubProject } from '@/lib/db/queries/sub-projects';
import type { AdvisorAction } from '@/types/advisor-actions';

interface ActionResult {
  index: number;
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  const actions: AdvisorAction[] = body.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ error: 'actions array required' }, { status: 400 });
  }

  const results: ActionResult[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      if (action.type === 'create_task') {
        const sub = getSubProject(action.subProjectId);
        if (!sub) { results.push({ index: i, success: false, error: `Sub-project ${action.subProjectId} not found` }); continue; }
        createTask({
          project_id: action.projectId || sub.project_id,
          sub_project_id: action.subProjectId,
          title: action.title,
          description: action.description,
          priority: action.priority,
          status: action.status,
        });
        results.push({ index: i, success: true });
      } else if (action.type === 'update_task') {
        const task = getTask(action.taskId);
        if (!task) { results.push({ index: i, success: false, error: `Task ${action.taskId} not found` }); continue; }
        updateTask(action.taskId, action.changes);
        results.push({ index: i, success: true });
      } else {
        results.push({ index: i, success: false, error: 'Unknown action type' });
      }
    } catch (err) {
      results.push({ index: i, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results });
}
