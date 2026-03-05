import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/db/queries/projects';

export async function GET() {
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = createProject(name, description || '');
  return NextResponse.json(project, { status: 201 });
}
