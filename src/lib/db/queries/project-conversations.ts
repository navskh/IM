import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IProjectConversation } from '../../../types';

export function getProjectConversations(projectId: string, limit = 50): IProjectConversation[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM project_conversations WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(projectId, limit).reverse() as IProjectConversation[];
}

export function addProjectConversation(
  projectId: string,
  role: 'assistant' | 'user' | 'system',
  content: string,
): IProjectConversation {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO project_conversations (id, project_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, projectId, role, content, now);
  return db.prepare('SELECT * FROM project_conversations WHERE id = ?').get(id) as IProjectConversation;
}

export function clearProjectConversations(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM project_conversations WHERE project_id = ?').run(projectId);
}
