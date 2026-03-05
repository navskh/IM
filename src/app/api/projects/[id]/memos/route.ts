import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getMemos } from '@/lib/db/queries/memos';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const unresolvedOnly = request.nextUrl.searchParams.get('unresolved') === 'true';
  const memos = getMemos(id, unresolvedOnly);
  return NextResponse.json(memos);
}
