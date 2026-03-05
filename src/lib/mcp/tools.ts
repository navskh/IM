import type { IItemTree, IItem, IPrompt } from '@/types';

// Re-export query functions for MCP tools
// These are imported from DB queries when the MCP server initializes

export interface McpToolContext {
  listProjects: () => { id: string; name: string; description: string; created_at: string; updated_at: string }[];
  getProject: (id: string) => { id: string; name: string; description: string } | undefined;
  getItemTree: (projectId: string) => IItemTree[];
  getItems: (projectId: string) => IItem[];
  getPrompt: (itemId: string) => IPrompt | undefined;
  updateItem: (id: string, data: Record<string, unknown>) => IItem | undefined;
}

export function getNextTask(ctx: McpToolContext, projectId: string): {
  item: IItem;
  prompt?: IPrompt;
} | null {
  const items = ctx.getItems(projectId);

  // Find unlocked + pending items (ready to execute)
  const ready = items.filter(i => !i.is_locked && i.status === 'pending');

  if (ready.length === 0) return null;

  // Sort by sort_order
  ready.sort((a, b) => a.sort_order - b.sort_order);
  const item = ready[0];
  const prompt = ctx.getPrompt(item.id);

  return { item, prompt };
}

export function getProjectContext(ctx: McpToolContext, projectId: string): {
  project: { id: string; name: string; description: string } | undefined;
  tree: IItemTree[];
  stats: { total: number; pending: number; inProgress: number; done: number; unlocked: number };
} {
  const project = ctx.getProject(projectId);
  const tree = ctx.getItemTree(projectId);
  const items = ctx.getItems(projectId);

  const stats = {
    total: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    done: items.filter(i => i.status === 'done').length,
    unlocked: items.filter(i => !i.is_locked).length,
  };

  return { project, tree, stats };
}

export function formatItemForMcp(item: IItem, prompt?: IPrompt): string {
  const lines = [
    `제목: ${item.title}`,
    `설명: ${item.description}`,
    `유형: ${item.item_type}`,
    `우선순위: ${item.priority}`,
    `상태: ${item.status}`,
    `잠금: ${item.is_locked ? '잠금' : '해제'}`,
  ];

  if (prompt) {
    lines.push('', '--- 프롬프트 ---', prompt.content);
  }

  return lines.join('\n');
}

export function formatTreeForMcp(tree: IItemTree[], indent = 0): string {
  const lines: string[] = [];
  for (const item of tree) {
    const prefix = '  '.repeat(indent);
    const lock = item.is_locked ? '🔐' : '🔓';
    const status = item.status === 'done' ? '✅' : item.status === 'in_progress' ? '🔄' : '⏳';
    lines.push(`${prefix}${lock} ${item.title} ${status}`);
    if (item.children.length > 0) {
      lines.push(formatTreeForMcp(item.children, indent + 1));
    }
  }
  return lines.join('\n');
}
