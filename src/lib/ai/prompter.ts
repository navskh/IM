import { query } from '@anthropic-ai/claude-agent-sdk';
import { getPrompt, createPrompt } from '../db/queries/prompts';
import { getBrainstorm } from '../db/queries/brainstorms';
import { getRecentConversations } from '../db/queries/conversations';
import type { IPrompt, IItem } from '@/types';

export async function generatePrompt(
  item: IItem,
  projectContext?: { brainstormContent?: string; conversationHistory?: string },
): Promise<IPrompt> {
  // Check for existing manual prompt — don't overwrite
  const existing = getPrompt(item.id);
  if (existing?.prompt_type === 'manual') {
    return existing;
  }

  const systemPrompt = `You are a prompt engineering expert. Generate a clear, actionable prompt for a coding assistant (like Cursor or Claude Code) to implement the given task.

Rules:
- Output ONLY the prompt text, nothing else
- Write in Korean
- Be specific and actionable
- Include conditions, constraints, and requirements
- Include relevant context from the brainstorming and conversation
- The prompt should be ready to paste into a coding tool
- Keep it concise but complete (under 500 chars)
- Do NOT include markdown fences or extra formatting`;

  let context = '';
  if (projectContext?.brainstormContent) {
    context += `\n\n브레인스토밍 원문:\n${projectContext.brainstormContent}`;
  }
  if (projectContext?.conversationHistory) {
    context += `\n\nAI 대화 이력:\n${projectContext.conversationHistory}`;
  }

  const prompt = `다음 항목에 대한 실행 프롬프트를 생성하세요:

제목: ${item.title}
설명: ${item.description}
유형: ${item.item_type}
우선순위: ${item.priority}${context}`;

  let resultText = '';

  for await (const message of query({
    prompt: `${systemPrompt}\n\n${prompt}`,
    options: {
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if (message.type === 'result') {
      resultText = (message as { type: string; result: string }).result || '';
    }
  }

  resultText = resultText.trim();

  return createPrompt({
    project_id: item.project_id,
    item_id: item.id,
    content: resultText,
    prompt_type: 'auto',
  });
}

export async function generatePromptForItem(
  item: IItem,
): Promise<IPrompt> {
  // Load project context
  const brainstorm = getBrainstorm(item.project_id);
  const conversations = getRecentConversations(item.project_id, 20);

  const conversationHistory = conversations.length > 0
    ? conversations.map(c => `${c.role === 'user' ? '사용자' : 'AI'}: ${c.content}`).join('\n')
    : undefined;

  return generatePrompt(item, {
    brainstormContent: brainstorm?.content,
    conversationHistory,
  });
}
