import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getItemTree } from '@/lib/db/queries/items';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const tree = getItemTree(id);
  return NextResponse.json(tree);
}
