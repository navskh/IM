import { NextRequest, NextResponse } from 'next/server';
import { getTaskPrompt, upsertTaskPrompt } from '@/lib/db/queries/task-prompts';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  const { taskId } = await params;
  const prompt = getTaskPrompt(taskId);
  return NextResponse.json(prompt ?? { content: '', prompt_type: 'manual' });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  const { taskId } = await params;
  const body = await request.json();

  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const prompt = upsertTaskPrompt(taskId, body.content, body.prompt_type);
  return NextResponse.json(prompt);
}
