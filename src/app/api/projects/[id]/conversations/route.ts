import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getConversations } from '@/lib/db/queries/conversations';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { handleChatResponse } from '@/lib/ai/chat-responder';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const conversations = getConversations(id);
  return NextResponse.json(conversations);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const brainstorm = getBrainstorm(id);
  if (!brainstorm) {
    return NextResponse.json({ error: 'No brainstorm found' }, { status: 400 });
  }

  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  try {
    const result = await handleChatResponse(id, brainstorm.id, message.trim());
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Chat response failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
