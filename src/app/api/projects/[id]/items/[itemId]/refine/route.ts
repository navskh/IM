import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/db/queries/items';
import { getProject } from '@/lib/db/queries/projects';
import { refineItem } from '@/lib/ai/refiner';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: projectId, itemId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const item = getItem(itemId);
  if (!item || item.project_id !== projectId) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  try {
    const result = await refineItem(item, message.trim());
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Refine failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
