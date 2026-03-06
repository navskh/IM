import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getItemTree } from '@/lib/db/queries/items';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { cleanupItems } from '@/lib/ai/cleanup';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const items = getItemTree(id);
  if (items.length === 0) {
    return NextResponse.json({ items: [], changed: false });
  }

  const brainstorm = getBrainstorm(id);
  const brainstormContent = brainstorm?.content || '';

  try {
    const result = await cleanupItems(id, brainstorm?.id || '', items, brainstormContent);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
