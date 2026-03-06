import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IProjectContext } from '@/types';

export function getProjectContexts(projectId: string): IProjectContext[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM project_context WHERE project_id = ? ORDER BY file_path ASC'
  ).all(projectId) as IProjectContext[];
}

export function getProjectContextSummary(projectId: string): string {
  const contexts = getProjectContexts(projectId);
  if (contexts.length === 0) return '';

  return contexts
    .map(c => `--- ${c.file_path} ---\n${c.content}`)
    .join('\n\n');
}

export interface SubProjectContext {
  name: string;         // sub-project directory name (or "(root)")
  contexts: IProjectContext[];
  totalSize: number;
}

export function getProjectContextsBySubProject(projectId: string): SubProjectContext[] {
  const contexts = getProjectContexts(projectId);
  if (contexts.length === 0) return [];

  // Simple grouping: first path segment = sub-project
  // e.g. "jabis-template/apps/prototype/src/App.tsx" → "jabis-template"
  //      "package.json" or "__directory_tree.txt" → "(root)"
  const groups = new Map<string, IProjectContext[]>();

  for (const ctx of contexts) {
    const parts = ctx.file_path.split('/');
    const group = (parts.length <= 1 || ctx.file_path.startsWith('__'))
      ? '(root)'
      : parts[0];

    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(ctx);
  }

  return Array.from(groups.entries()).map(([name, ctxs]) => ({
    name,
    contexts: ctxs,
    totalSize: ctxs.reduce((sum, c) => sum + c.content.length, 0),
  }));
}

export function buildSubProjectSummary(sub: SubProjectContext): string {
  return sub.contexts
    .map(c => `--- ${c.file_path} ---\n${c.content}`)
    .join('\n\n');
}

export function replaceProjectContexts(projectId: string, files: { file_path: string; content: string }[]): IProjectContext[] {
  const db = getDb();
  const now = new Date().toISOString();

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM project_context WHERE project_id = ?').run(projectId);

    for (const file of files) {
      const id = generateId();
      db.prepare(
        'INSERT INTO project_context (id, project_id, file_path, content, scanned_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, projectId, file.file_path, file.content, now);
    }
  });

  replace();
  return getProjectContexts(projectId);
}
