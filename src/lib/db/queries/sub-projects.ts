import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { ISubProject, ISubProjectWithStats, TaskStatus } from '@/types';

export function getSubProjects(projectId: string): ISubProject[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sub_projects WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId) as ISubProject[];
}

export function getSubProject(id: string): ISubProject | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sub_projects WHERE id = ?').get(id) as ISubProject | undefined;
}

export function getSubProjectsWithStats(projectId: string): ISubProjectWithStats[] {
  const db = getDb();
  const subProjects = db.prepare(
    'SELECT * FROM sub_projects WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId) as ISubProject[];

  return subProjects.map(sp => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as task_count,
        SUM(CASE WHEN status IN ('submitted','testing') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status IN ('idea','writing') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count,
        SUM(CASE WHEN status = 'problem' THEN 1 ELSE 0 END) as problem_count,
        MAX(updated_at) as last_activity
      FROM tasks WHERE sub_project_id = ?
    `).get(sp.id) as {
      task_count: number;
      active_count: number;
      pending_count: number;
      done_count: number;
      problem_count: number;
      last_activity: string | null;
    };

    const previewTasks = db.prepare(
      `SELECT title, status FROM tasks WHERE sub_project_id = ?
       ORDER BY CASE status
         WHEN 'submitted' THEN 0 WHEN 'testing' THEN 1 WHEN 'writing' THEN 2
         WHEN 'idea' THEN 3 WHEN 'problem' THEN 4 WHEN 'done' THEN 5
       END, sort_order ASC LIMIT 5`
    ).all(sp.id) as { title: string; status: TaskStatus }[];

    return {
      ...sp,
      task_count: stats.task_count ?? 0,
      active_count: stats.active_count ?? 0,
      pending_count: stats.pending_count ?? 0,
      done_count: stats.done_count ?? 0,
      problem_count: stats.problem_count ?? 0,
      last_activity: stats.last_activity,
      preview_tasks: previewTasks,
    };
  });
}

export function createSubProject(data: {
  project_id: string;
  name: string;
  description?: string;
  folder_path?: string;
}): ISubProject {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as max_order FROM sub_projects WHERE project_id = ?'
  ).get(data.project_id) as { max_order: number | null };
  const sortOrder = (maxOrder?.max_order ?? -1) + 1;

  db.prepare(
    `INSERT INTO sub_projects (id, project_id, name, description, folder_path, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.project_id, data.name, data.description ?? '', data.folder_path ?? null, sortOrder, now, now);

  return getSubProject(id)!;
}

export function updateSubProject(id: string, data: {
  name?: string;
  description?: string;
  folder_path?: string | null;
}): ISubProject | undefined {
  const db = getDb();
  const sp = getSubProject(id);
  if (!sp) return undefined;

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE sub_projects SET name = ?, description = ?, folder_path = ?, updated_at = ? WHERE id = ?'
  ).run(
    data.name ?? sp.name,
    data.description ?? sp.description,
    data.folder_path !== undefined ? data.folder_path : sp.folder_path,
    now,
    id,
  );

  return getSubProject(id);
}

export function deleteSubProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM sub_projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderSubProjects(projectId: string, orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE sub_projects SET sort_order = ? WHERE id = ? AND project_id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run(idx, id, projectId));
  });
  tx();
}
