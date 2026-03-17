import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/db/queries/projects';
import { ensureDb } from '@/lib/db';

export async function GET() {
  await ensureDb();
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = createProject(name, description || '', body.project_path || undefined);
  return NextResponse.json(project, { status: 201 });
}
