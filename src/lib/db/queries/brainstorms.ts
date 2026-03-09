import { getDb } from '../index';
import type { IBrainstorm } from '../../../types';

export function getBrainstorm(projectId: string): IBrainstorm | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM brainstorms WHERE project_id = ? ORDER BY version DESC LIMIT 1'
  ).get(projectId) as IBrainstorm | undefined;
}

export function updateBrainstorm(projectId: string, content: string): IBrainstorm | undefined {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = getBrainstorm(projectId);
  if (!existing) return undefined;

  db.prepare(
    'UPDATE brainstorms SET content = ?, version = version + 1, updated_at = ? WHERE id = ?'
  ).run(content, now, existing.id);

  // Also update project's updated_at
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);

  return getBrainstorm(projectId);
}
