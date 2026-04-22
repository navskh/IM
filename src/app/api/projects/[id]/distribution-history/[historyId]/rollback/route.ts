import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import {
  getDistributionHistory,
  markRolledBack,
} from '@/lib/db/queries/distribution-history';
import { deleteTask } from '@/lib/db/queries/tasks';
import { deleteSubProject } from '@/lib/db/queries/sub-projects';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; historyId: string }> },
) {
  await ensureDb();
  const { id, historyId } = await params;

  const history = getDistributionHistory(historyId);
  if (!history) {
    return NextResponse.json({ error: 'History not found' }, { status: 404 });
  }
  if (history.project_id !== id) {
    return NextResponse.json({ error: 'Project mismatch' }, { status: 400 });
  }
  if (history.rolled_back_at) {
    return NextResponse.json({ error: 'Already rolled back' }, { status: 409 });
  }

  let tasksDeleted = 0;
  for (const taskId of history.created_task_ids) {
    if (deleteTask(taskId)) tasksDeleted++;
  }

  let subsDeleted = 0;
  for (const subId of history.created_sub_project_ids) {
    if (deleteSubProject(subId)) subsDeleted++;
  }

  markRolledBack(historyId);

  return NextResponse.json({
    tasks_deleted: tasksDeleted,
    sub_projects_deleted: subsDeleted,
  });
}
