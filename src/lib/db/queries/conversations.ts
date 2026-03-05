import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IConversation } from '@/types';

export function getConversations(projectId: string, limit = 20): IConversation[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM conversations WHERE project_id = ?
     ORDER BY created_at ASC LIMIT ?`
  ).all(projectId, limit) as IConversation[];
}

export function getRecentConversations(projectId: string, limit = 20): IConversation[] {
  const db = getDb();
  // Get the last N messages ordered chronologically
  const rows = db.prepare(
    `SELECT * FROM (
       SELECT * FROM conversations WHERE project_id = ?
       ORDER BY created_at DESC LIMIT ?
     ) sub ORDER BY created_at ASC`
  ).all(projectId, limit) as IConversation[];
  return rows;
}

export function addMessage(
  projectId: string,
  role: 'assistant' | 'user',
  content: string,
  metadata?: string,
): IConversation {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO conversations (id, project_id, role, content, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, role, content, metadata ?? null, now);

  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as IConversation;
}

export function deleteConversations(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM conversations WHERE project_id = ?').run(projectId);
}
