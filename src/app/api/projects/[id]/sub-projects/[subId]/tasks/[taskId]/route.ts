import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask, deleteTask } from '@/lib/db/queries/tasks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
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
  const { taskId } = await params;
  const body = await request.json();
  const task = updateTask(taskId, body);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  const { taskId } = await params;
  const deleted = deleteTask(taskId);
  if (!deleted) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
