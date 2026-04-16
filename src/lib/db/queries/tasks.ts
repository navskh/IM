import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { ITask, TaskStatus, ItemPriority } from '../../../types';

interface TaskRow {
  id: string;
  project_id: string;
  sub_project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: ItemPriority;
  is_today: number;
  is_archived: number;
  tags: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): ITask {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { /* */ }
  return { ...row, is_today: row.is_today === 1, is_archived: (row.is_archived ?? 0) === 1, tags };
}

export function getTasks(subProjectId: string): ITask[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE sub_project_id = ? AND is_archived = 0 ORDER BY sort_order ASC'
  ).all(subProjectId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getTask(id: string): ITask | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : undefined;
}

export function getTasksByProject(projectId: string): ITask[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND is_archived = 0 ORDER BY sort_order ASC'
  ).all(projectId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getTodayTasks(projectId: string): ITask[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND is_today = 1 AND is_archived = 0 ORDER BY sort_order ASC'
  ).all(projectId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getActiveTasks(projectId: string): ITask[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM tasks WHERE project_id = ? AND status IN ('doing','submitted','testing') AND is_archived = 0 ORDER BY sort_order ASC"
  ).all(projectId) as TaskRow[];
  return rows.map(rowToTask);
}

export function getArchivedTasks(projectId?: string): ITask[] {
  const db = getDb();
  const rows = projectId
    ? db.prepare('SELECT * FROM tasks WHERE project_id = ? AND is_archived = 1 ORDER BY updated_at DESC').all(projectId) as TaskRow[]
    : db.prepare('SELECT * FROM tasks WHERE is_archived = 1 ORDER BY updated_at DESC').all() as TaskRow[];
  return rows.map(rowToTask);
}

export function archiveTask(id: string): ITask | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET is_archived = 1, is_today = 0, updated_at = ? WHERE id = ?').run(now, id);
  return getTask(id);
}

export function restoreTask(id: string): ITask | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET is_archived = 0, updated_at = ? WHERE id = ?').run(now, id);
  return getTask(id);
}

export function createTask(data: {
  project_id: string;
  sub_project_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: ItemPriority;
}): ITask {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max_order FROM tasks WHERE sub_project_id = ?'
  ).get(data.sub_project_id) as { max_order: number | null };
  const sortOrder = (maxOrder?.max_order ?? -1) + 1;

  db.prepare(
    `INSERT INTO tasks (id, project_id, sub_project_id, title, description, status, priority, is_today, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, data.project_id, data.sub_project_id, data.title, data.description ?? '', data.status ?? 'idea', data.priority ?? 'medium', sortOrder, now, now);

  return getTask(id)!;
}

export function updateTask(id: string, data: {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: ItemPriority;
  is_today?: boolean;
  sort_order?: number;
  project_id?: string;
  sub_project_id?: string;
  tags?: string[];
}): ITask | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!row) return undefined;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?,
      is_today = ?, sort_order = ?, project_id = ?, sub_project_id = ?, tags = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.title ?? row.title,
    data.description ?? row.description,
    data.status ?? row.status,
    data.priority ?? row.priority,
    data.is_today !== undefined ? (data.is_today ? 1 : 0) : row.is_today,
    data.sort_order ?? row.sort_order,
    data.project_id ?? row.project_id,
    data.sub_project_id ?? row.sub_project_id,
    data.tags ? JSON.stringify(data.tags) : row.tags,
    now,
    id,
  );

  return getTask(id);
}

export function deleteTask(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderTasks(subProjectId: string, orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ? AND sub_project_id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run(idx, id, subProjectId));
  });
  tx();
}
