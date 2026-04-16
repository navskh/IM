import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IProjectConversation } from '../../../types';

// Reuses IProjectConversation shape — project_id is always '__global__'.
const GLOBAL_ID = '__global__';

export function getGlobalConversations(limit = 50): IProjectConversation[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM global_conversations ORDER BY created_at DESC LIMIT ?`
  ).all(limit).reverse() as IProjectConversation[];
}

export function addGlobalConversation(
  role: 'assistant' | 'user' | 'system',
  content: string,
): IProjectConversation {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO global_conversations (id, project_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, GLOBAL_ID, role, content, now);
  return db.prepare('SELECT * FROM global_conversations WHERE id = ?').get(id) as IProjectConversation;
}

export function clearGlobalConversations(): void {
  const db = getDb();
  db.prepare('DELETE FROM global_conversations').run();
}
