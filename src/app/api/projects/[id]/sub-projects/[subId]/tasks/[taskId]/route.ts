import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask, deleteTask, archiveTask } from '@/lib/db/queries/tasks';
import { ensureDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { taskId } = await params;
  const body = await request.json();
  const task = updateTask(taskId, body);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { taskId } = await params;
  const mode = request.nextUrl.searchParams.get('mode') || 'archive';

  if (mode === 'permanent') {
    const deleted = deleteTask(taskId);
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  // Default: archive
  const task = archiveTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, archived: true });
}
