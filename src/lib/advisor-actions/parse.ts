import type { AdvisorAction } from '@/types/advisor-actions';

const ACTION_BLOCK_RE = /```action\s*\n([\s\S]*?)```/g;

export interface ParsedContent {
  segments: ({ type: 'markdown'; text: string } | { type: 'actions'; actions: AdvisorAction[] })[];
}

function validateAction(obj: unknown): AdvisorAction | null {
  if (!obj || typeof obj !== 'object') return null;
  const a = obj as Record<string, unknown>;
  if (a.type === 'create_task') {
    if (typeof a.subProjectId !== 'string' || typeof a.title !== 'string') return null;
    return {
      type: 'create_task',
      subProjectId: a.subProjectId,
      projectId: typeof a.projectId === 'string' ? a.projectId : undefined,
      title: a.title,
      description: typeof a.description === 'string' ? a.description : undefined,
      priority: ['high', 'medium', 'low'].includes(a.priority as string) ? a.priority as 'high' | 'medium' | 'low' : undefined,
      status: typeof a.status === 'string' ? (a.status as string) : undefined,
    } as AdvisorAction;
  }
  if (a.type === 'update_task') {
    if (typeof a.taskId !== 'string' || !a.changes || typeof a.changes !== 'object') return null;
    return { type: 'update_task', taskId: a.taskId, changes: a.changes as Record<string, unknown> } as AdvisorAction;
  }
  return null;
}

export function parseAdvisorContent(content: string): ParsedContent {
  const segments: ParsedContent['segments'] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(ACTION_BLOCK_RE)) {
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) segments.push({ type: 'markdown', text: before });

    try {
      const raw = JSON.parse(match[1]);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr.map(validateAction).filter((a): a is AdvisorAction => a !== null);
      if (valid.length > 0) {
        segments.push({ type: 'actions', actions: valid });
      } else {
        segments.push({ type: 'markdown', text: match[0] });
      }
    } catch {
      segments.push({ type: 'markdown', text: match[0] });
    }

    lastIndex = (match.index ?? 0) + match[0].length;
  }

  const remaining = content.slice(lastIndex);
  if (remaining.trim()) segments.push({ type: 'markdown', text: remaining });

  return { segments };
}
