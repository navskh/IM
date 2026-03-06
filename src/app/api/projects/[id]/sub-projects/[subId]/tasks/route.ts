import { NextRequest, NextResponse } from 'next/server';
import { getTasks, createTask } from '@/lib/db/queries/tasks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { subId } = await params;
  const tasks = getTasks(subId);
  return NextResponse.json(tasks);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { id, subId } = await params;
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const task = createTask({
    project_id: id,
    sub_project_id: subId,
    title: body.title,
    description: body.description,
    status: body.status,
    priority: body.priority,
  });
  return NextResponse.json(task, { status: 201 });
}
