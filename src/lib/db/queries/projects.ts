import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IProject } from '@/types';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  ai_context: string;
  watch_enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): IProject {
  return { ...row, watch_enabled: row.watch_enabled === 1 };
}

export function listProjects(): IProject[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): IProject | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : undefined;
}

export function createProject(name: string, description: string = '', projectPath?: string): IProject {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO projects (id, name, description, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, description, projectPath ?? null, now, now);

  // Also create a default brainstorm
  const brainstormId = generateId();
  db.prepare(
    'INSERT INTO brainstorms (id, project_id, content, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(brainstormId, id, '', now, now);

  return getProject(id)!;
}

export function updateProject(id: string, data: { name?: string; description?: string; project_path?: string | null; ai_context?: string; watch_enabled?: boolean }): IProject | undefined {
  const db = getDb();
  const project = getProject(id);
  if (!project) return undefined;

  const now = new Date().toISOString();

  db.prepare(
    'UPDATE projects SET name = ?, description = ?, project_path = ?, ai_context = ?, watch_enabled = ?, updated_at = ? WHERE id = ?'
  ).run(
    data.name ?? project.name,
    data.description ?? project.description,
    data.project_path !== undefined ? data.project_path : project.project_path,
    data.ai_context !== undefined ? data.ai_context : (project.ai_context ?? ''),
    data.watch_enabled !== undefined ? (data.watch_enabled ? 1 : 0) : (project.watch_enabled ? 1 : 0),
    now,
    id,
  );

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}
