import { NextRequest, NextResponse } from 'next/server';
import { getArchivedTasks, restoreTask, deleteTask } from '@/lib/db/queries/tasks';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  await ensureDb();
  const projectId = request.nextUrl.searchParams.get('projectId') || undefined;
  const tasks = getArchivedTasks(projectId);
  return NextResponse.json(tasks);
}

// Restore or permanently delete
export async function PUT(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  const { taskId, action } = body;

  if (!taskId || !action) {
    return NextResponse.json({ error: 'taskId and action required' }, { status: 400 });
  }

  if (action === 'restore') {
    const task = restoreTask(taskId);
    return task
      ? NextResponse.json(task)
      : NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (action === 'delete') {
    const ok = deleteTask(taskId);
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
