import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getTask, updateTask } from '@/lib/db/queries/tasks';
import { getSubProject } from '@/lib/db/queries/sub-projects';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  await ensureDb();
  const { taskId } = await params;
  const body = await request.json() as { projectId?: string; subProjectId?: string };

  if (!body.subProjectId) {
    return NextResponse.json({ error: 'subProjectId is required' }, { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const targetSub = getSubProject(body.subProjectId);
  if (!targetSub) return NextResponse.json({ error: 'Target sub-project not found' }, { status: 404 });

  const updated = updateTask(taskId, {
    project_id: targetSub.project_id,
    sub_project_id: targetSub.id,
  });

  return NextResponse.json(updated);
}
