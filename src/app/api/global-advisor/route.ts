import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getGlobalConversations, addGlobalConversation, clearGlobalConversations } from '@/lib/db/queries/global-conversations';
import { buildGlobalAdvisorPrompt, trimHistory } from '@/lib/ai/global-context';
import { runAgent } from '@/lib/ai/client';

export async function GET() {
  await ensureDb();
  const messages = getGlobalConversations();
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const userMsg = addGlobalConversation('user', body.message);

  const systemPrompt = buildGlobalAdvisorPrompt();
  const history = getGlobalConversations();
  const trimmed = trimHistory(history.map(m => ({ role: m.role, content: m.content })));
  const conversationText = trimmed
    .map(m => `${m.role === 'user' ? 'User' : m.role === 'system' ? 'System' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}\n\n=== CONVERSATION ===\n${conversationText}`;

  try {
    const aiResponse = await runAgent('claude', fullPrompt, undefined, undefined, { timeoutMs: 120000 });
    const trimmedResponse = aiResponse.trim();
    if (!trimmedResponse) {
      const fallback = addGlobalConversation('assistant', '(AI 응답을 생성하지 못했습니다.)');
      return NextResponse.json({ userMessage: userMsg, aiMessage: fallback });
    }
    const aiMsg = addGlobalConversation('assistant', trimmedResponse);
    return NextResponse.json({ userMessage: userMsg, aiMessage: aiMsg });
  } catch {
    const errorMsg = addGlobalConversation('assistant', '(AI 호출에 실패했습니다.)');
    return NextResponse.json({ userMessage: userMsg, aiMessage: errorMsg });
  }
}

export async function DELETE() {
  await ensureDb();
  clearGlobalConversations();
  return NextResponse.json({ ok: true });
}
