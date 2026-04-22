import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { getSubProjects } from '@/lib/db/queries/sub-projects';
import { getTasksByProject } from '@/lib/db/queries/tasks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const subProjects = getSubProjects(id);
  const subById = new Map(subProjects.map(sp => [sp.id, sp]));
  const tasks = getTasksByProject(id);

  const payload = {
    format_version: 1,
    source: 'idea-manager',
    exported_at: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description,
      agent_type: project.agent_type,
      project_path: project.project_path,
      ai_context: project.ai_context,
    },
    sub_projects: subProjects.map(sp => ({
      name: sp.name,
      description: sp.description,
      sort_order: sp.sort_order,
    })),
    tasks: tasks.map(t => ({
      sub_project_name: subById.get(t.sub_project_id)?.name ?? '',
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      tags: t.tags,
      sort_order: t.sort_order,
    })),
  };

  const safeName = project.name.replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 40) || 'project';
  const filename = `idea-manager-${safeName}-${Date.now()}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
