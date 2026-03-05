import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { structureWithChat } from '@/lib/ai/structurer';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const brainstorm = getBrainstorm(id);
  if (!brainstorm || !brainstorm.content.trim()) {
    return NextResponse.json({ error: 'No brainstorm content to structure' }, { status: 400 });
  }

  try {
    const result = await structureWithChat(id, brainstorm.id, brainstorm.content);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI structuring failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
