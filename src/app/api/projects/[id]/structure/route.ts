import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { getProjectContextSummary } from '@/lib/db/queries/context';
import { structureWithChat } from '@/lib/ai/structurer';
import { getTask } from '@/lib/task-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ active: false });
  }
  return NextResponse.json({
    active: task.status === 'running',
    status: task.status,
    startedAt: task.startedAt,
    eventCount: task.events.length,
  });
}

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
  if (!brainstorm) {
    return NextResponse.json({ error: 'Project not initialized' }, { status: 400 });
  }

  const hasContent = brainstorm.content.trim();
  const hasContext = !!getProjectContextSummary(id);

  if (!hasContent && !hasContext) {
    return NextResponse.json({ error: '브레인스토밍 내용이나 프로젝트 스캔 결과가 필요합니다' }, { status: 400 });
  }

  // If brainstorm is empty but project context exists, use a placeholder prompt
  const content = hasContent
    ? brainstorm.content
    : '프로젝트 스캔 결과를 분석하여 현재 프로젝트의 구조, 진행 상황, TODO 항목을 파악해주세요.';

  try {
    const result = await structureWithChat(id, brainstorm.id, content);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI structuring failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
