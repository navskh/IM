import { NextRequest, NextResponse } from 'next/server';
import { getSubProjectsWithStats, createSubProject, reorderSubProjects } from '@/lib/db/queries/sub-projects';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const subProjects = getSubProjectsWithStats(id);
  return NextResponse.json(subProjects);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const sp = createSubProject({
    project_id: id,
    name: body.name,
    description: body.description,
    folder_path: body.folder_path,
  });
  return NextResponse.json(sp, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  if (!Array.isArray(body.orderedIds)) {
    return NextResponse.json({ error: 'orderedIds array is required' }, { status: 400 });
  }

  reorderSubProjects(id, body.orderedIds);
  const subProjects = getSubProjectsWithStats(id);
  return NextResponse.json(subProjects);
}
