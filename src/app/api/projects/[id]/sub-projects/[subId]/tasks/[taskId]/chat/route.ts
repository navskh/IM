import { NextRequest, NextResponse } from 'next/server';
import { getTaskConversations, addTaskConversation } from '@/lib/db/queries/task-conversations';
import { getTask } from '@/lib/db/queries/tasks';
import { getTaskPrompt } from '@/lib/db/queries/task-prompts';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { runClaude } from '@/lib/ai/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  const { taskId } = await params;
  const conversations = getTaskConversations(taskId);
  return NextResponse.json(conversations);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  const { id: projectId, taskId } = await params;
  const body = await request.json();

  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Save user message
  const userMsg = addTaskConversation(taskId, 'user', body.message);

  // Build context for AI
  const history = getTaskConversations(taskId);
  const prompt = getTaskPrompt(taskId);
  const brainstorm = getBrainstorm(projectId);

  const systemPrompt = `You are a helpful assistant helping refine a development task. Respond in Korean. Be concise.

Task: ${task.title}
Description: ${task.description}
Status: ${task.status}
${prompt?.content ? `Current prompt:\n${prompt.content}` : ''}
${brainstorm?.content ? `\nBrainstorming context:\n${brainstorm.content.slice(0, 3000)}` : ''}`;

  const conversationText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const aiResponse = await runClaude(`${systemPrompt}\n\nConversation:\n${conversationText}`);
    const aiMsg = addTaskConversation(taskId, 'assistant', aiResponse.trim());
    return NextResponse.json({ userMessage: userMsg, aiMessage: aiMsg });
  } catch {
    return NextResponse.json({ error: 'AI response failed' }, { status: 500 });
  }
}
