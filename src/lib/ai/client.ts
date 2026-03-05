import { query } from '@anthropic-ai/claude-agent-sdk';
import type { IStructureWithQuestions } from '@/types';

export interface IStructuredItem {
  title: string;
  description: string;
  item_type: 'feature' | 'task' | 'bug' | 'idea' | 'note';
  priority: 'high' | 'medium' | 'low';
  children?: IStructuredItem[];
}

export async function runStructure(brainstormContent: string): Promise<IStructuredItem[]> {
  const systemPrompt = `You are a JSON-only structuring machine. You NEVER respond with text, explanations, or conversation.
You ALWAYS output ONLY a raw JSON array, nothing else.

Your job: convert ANY input text into a structured JSON array of items.
Even if the input seems like a greeting or conversation, extract the implicit intent and structure it.

Schema per item:
{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "children": [same schema] }

Rules:
- Output MUST start with [ and end with ]
- No markdown fences, no explanation, no text before or after the JSON
- Keep titles concise (under 50 chars)
- Group related ideas under parent items
- If input is vague, interpret it as best you can and create at least 1 item`;

  const prompt = `Analyze this brainstorming content and structure it into a JSON tree:\n\n${brainstormContent}`;

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

  // Strip markdown fences if present
  resultText = resultText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Extract JSON from the response
  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON');
  }

  return JSON.parse(jsonMatch[0]) as IStructuredItem[];
}

export async function runStructureWithQuestions(
  brainstormContent: string,
  conversationHistory: { role: 'assistant' | 'user'; content: string }[],
): Promise<IStructureWithQuestions> {
  const systemPrompt = `You are an AI assistant that structures brainstorming content AND identifies ambiguous areas.
You ALWAYS output ONLY a raw JSON object (not an array), nothing else.

Your job:
1. Convert the brainstorming text into a structured JSON tree of items
2. Identify 0-5 areas where the brainstorming is ambiguous or could benefit from clarification
3. Consider the conversation history to avoid repeating questions already answered

Output schema:
{
  "items": [{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "children": [same] }],
  "questions": [{ "anchor_text": string, "question": string }]
}

Rules:
- Output MUST be a JSON object with "items" and "questions" keys
- No markdown fences, no explanation, no text before or after the JSON
- Keep titles concise (under 50 chars)
- Group related ideas under parent items
- questions[].anchor_text MUST be an exact substring from the brainstorming content (5-20 chars)
- questions[].question should be a helpful Korean question asking for clarification
- Generate 0-5 questions. Skip questions already answered in conversation history.
- If the brainstorming is clear enough, return an empty questions array
- All questions MUST be in Korean`;

  let historyContext = '';
  if (conversationHistory.length > 0) {
    historyContext = '\n\n이전 대화:\n' + conversationHistory
      .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
      .join('\n');
  }

  const prompt = `다음 브레인스토밍 내용을 분석하고 구조화하세요:\n\n${brainstormContent}${historyContext}`;

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

  // Strip markdown fences if present
  resultText = resultText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Extract JSON object from the response
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    items: parsed.items || [],
    questions: parsed.questions || [],
  } as IStructureWithQuestions;
}
