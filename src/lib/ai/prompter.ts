import { runClaude } from './client';
import { getPrompt, createPrompt } from '../db/queries/prompts';
import { getBrainstorm } from '../db/queries/brainstorms';
import { getRecentConversations } from '../db/queries/conversations';
import { getProjectContextSummary } from '../db/queries/context';
import type { IPrompt, IItem } from '@/types';

export async function generatePrompt(
  item: IItem,
  projectContext?: { brainstormContent?: string; conversationHistory?: string; projectDocs?: string },
): Promise<IPrompt> {
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
- Include relevant context from the brainstorming, conversation, and project documentation
- The prompt should be ready to paste into a coding tool
- Keep it concise but complete (under 500 chars)
- Do NOT include markdown fences or extra formatting`;

  const CONTEXT_LIMIT = 30_000; // 30KB max for prompt generation context
  let context = '';
  if (projectContext?.brainstormContent) {
    context += `\n\n브레인스토밍 원문:\n${projectContext.brainstormContent.slice(0, 3000)}`;
  }
  if (projectContext?.conversationHistory) {
    context += `\n\nAI 대화 이력:\n${projectContext.conversationHistory.slice(0, 5000)}`;
  }
  if (projectContext?.projectDocs) {
    const remaining = CONTEXT_LIMIT - context.length;
    if (remaining > 1000) {
      context += `\n\n프로젝트 문서:\n${projectContext.projectDocs.slice(0, remaining)}`;
    }
  }

  const prompt = `${systemPrompt}\n\n다음 항목에 대한 실행 프롬프트를 생성하세요:

제목: ${item.title}
설명: ${item.description}
유형: ${item.item_type}
우선순위: ${item.priority}${context}`;

  const resultText = await runClaude(prompt);

  return createPrompt({
    project_id: item.project_id,
    item_id: item.id,
    content: resultText.trim(),
    prompt_type: 'auto',
  });
}

export async function generatePromptForItem(
  item: IItem,
): Promise<IPrompt> {
  const brainstorm = getBrainstorm(item.project_id);
  const conversations = getRecentConversations(item.project_id, 20);

  const conversationHistory = conversations.length > 0
    ? conversations.map(c => `${c.role === 'user' ? '사용자' : 'AI'}: ${c.content}`).join('\n')
    : undefined;

  const projectDocs = getProjectContextSummary(item.project_id) || undefined;

  return generatePrompt(item, {
    brainstormContent: brainstorm?.content,
    conversationHistory,
    projectDocs,
  });
}
