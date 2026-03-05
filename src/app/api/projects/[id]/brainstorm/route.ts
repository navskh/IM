import { NextRequest, NextResponse } from 'next/server';
import { getBrainstorm, updateBrainstorm } from '@/lib/db/queries/brainstorms';
import { getProject } from '@/lib/db/queries/projects';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const brainstorm = getBrainstorm(id);
  return NextResponse.json(brainstorm ?? { content: '', version: 0 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { content } = body;

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const brainstorm = updateBrainstorm(id, content);
  if (!brainstorm) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json(brainstorm);
}
