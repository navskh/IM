import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IDistributionHistory } from '../../../types';

interface HistoryRow {
  id: string;
  project_id: string;
  source: string;
  created_sub_project_ids: string;
  created_task_ids: string;
  summary: string;
  created_at: string;
  rolled_back_at: string | null;
}

function rowToHistory(row: HistoryRow): IDistributionHistory {
  let subIds: string[] = [];
  let taskIds: string[] = [];
  try { subIds = JSON.parse(row.created_sub_project_ids || '[]'); } catch { /* */ }
  try { taskIds = JSON.parse(row.created_task_ids || '[]'); } catch { /* */ }
  return {
    id: row.id,
    project_id: row.project_id,
    source: row.source,
    created_sub_project_ids: subIds,
    created_task_ids: taskIds,
    summary: row.summary,
    created_at: row.created_at,
    rolled_back_at: row.rolled_back_at,
  };
}

export function createDistributionHistory(data: {
  project_id: string;
  source?: string;
  created_sub_project_ids: string[];
  created_task_ids: string[];
  summary: string;
}): IDistributionHistory {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO distribution_history
      (id, project_id, source, created_sub_project_ids, created_task_ids, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.project_id,
    data.source ?? 'auto-distribute',
    JSON.stringify(data.created_sub_project_ids),
    JSON.stringify(data.created_task_ids),
    data.summary,
    now,
  );

  return getDistributionHistory(id)!;
}

export function getDistributionHistory(id: string): IDistributionHistory | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM distribution_history WHERE id = ?').get(id) as HistoryRow | undefined;
  return row ? rowToHistory(row) : undefined;
}

export function listDistributionHistory(projectId: string, limit = 20): IDistributionHistory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM distribution_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(projectId, limit) as HistoryRow[];
  return rows.map(rowToHistory);
}

export function markRolledBack(id: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE distribution_history SET rolled_back_at = ? WHERE id = ?').run(now, id);
}
