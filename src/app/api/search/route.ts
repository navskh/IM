import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureDb } from '@/lib/db';

export interface ISearchResult {
  type: 'task' | 'project' | 'sub-project' | 'brainstorm' | 'memo';
  projectId: string;
  projectName: string;
  subProjectId?: string;
  subProjectName?: string;
  taskId?: string;
  title: string;
  snippet?: string;
  status?: string;
  isArchived?: boolean;
  score: number;
}

interface TaskSearchRow {
  id: string;
  title: string;
  description: string;
  project_id: string;
  project_name: string;
  sub_project_id: string;
  sub_project_name: string;
  status: string;
  is_archived: number;
}

interface ProjectSearchRow {
  id: string;
  name: string;
  description: string;
}

interface SubProjectSearchRow {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
}

interface BrainstormSearchRow {
  project_id: string;
  project_name: string;
  content: string;
}

interface GlobalMemoSearchRow {
  content: string;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => '\\' + m);
}

function buildSnippet(body: string, query: string): string | undefined {
  if (!body) return undefined;
  const lower = body.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return body.slice(0, 120);
  const start = Math.max(0, idx - 30);
  const end = Math.min(body.length, idx + query.length + 60);
  return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
}

function scoreMatch(title: string, body: string, query: string): number {
  const q = query.toLowerCase();
  const t = (title ?? '').toLowerCase();
  const b = (body ?? '').toLowerCase();
  let score = 0;
  if (t === q) score += 100;
  else if (t.startsWith(q)) score += 50;
  else if (t.includes(q)) score += 30;
  if (b.includes(q)) score += 10;
  return score;
}

export async function GET(request: NextRequest) {
  await ensureDb();
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('q') ?? '').trim();
  if (raw.length < 1) return NextResponse.json([]);

  const q = raw.slice(0, 200);
  const like = `%${escapeLike(q)}%`;
  const db = getDb();

  const taskRows = db.prepare(`
    SELECT t.id, t.title, t.description, t.status, t.is_archived,
           t.project_id, p.name AS project_name,
           t.sub_project_id, sp.name AS sub_project_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN sub_projects sp ON sp.id = t.sub_project_id
    WHERE (t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')
    ORDER BY t.is_archived ASC, t.updated_at DESC
    LIMIT 40
  `).all(like, like) as TaskSearchRow[];

  const projectRows = db.prepare(`
    SELECT id, name, description FROM projects
    WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
    LIMIT 10
  `).all(like, like) as ProjectSearchRow[];

  const subProjectRows = db.prepare(`
    SELECT sp.id, sp.name, sp.project_id, p.name AS project_name
    FROM sub_projects sp
    JOIN projects p ON p.id = sp.project_id
    WHERE sp.name LIKE ? ESCAPE '\\'
    LIMIT 10
  `).all(like) as SubProjectSearchRow[];

  const brainstormRows = db.prepare(`
    SELECT b.project_id, p.name AS project_name, b.content
    FROM brainstorms b
    JOIN projects p ON p.id = b.project_id
    WHERE b.content LIKE ? ESCAPE '\\'
    LIMIT 10
  `).all(like) as BrainstormSearchRow[];

  const memoRows = db.prepare(`
    SELECT content FROM global_memos
    WHERE content LIKE ? ESCAPE '\\'
    LIMIT 1
  `).all(like) as GlobalMemoSearchRow[];

  const results: ISearchResult[] = [];

  for (const r of taskRows) {
    results.push({
      type: 'task',
      projectId: r.project_id,
      projectName: r.project_name,
      subProjectId: r.sub_project_id,
      subProjectName: r.sub_project_name,
      taskId: r.id,
      title: r.title,
      snippet: buildSnippet(r.description, q),
      status: r.status,
      isArchived: r.is_archived === 1,
      score: scoreMatch(r.title, r.description, q) + (r.is_archived ? -5 : 0),
    });
  }

  for (const r of projectRows) {
    results.push({
      type: 'project',
      projectId: r.id,
      projectName: r.name,
      title: r.name,
      snippet: buildSnippet(r.description, q),
      score: scoreMatch(r.name, r.description ?? '', q),
    });
  }

  for (const r of subProjectRows) {
    results.push({
      type: 'sub-project',
      projectId: r.project_id,
      projectName: r.project_name,
      subProjectId: r.id,
      subProjectName: r.name,
      title: r.name,
      score: scoreMatch(r.name, '', q),
    });
  }

  for (const r of brainstormRows) {
    results.push({
      type: 'brainstorm',
      projectId: r.project_id,
      projectName: r.project_name,
      title: `${r.project_name} · Brainstorm`,
      snippet: buildSnippet(r.content, q),
      score: scoreMatch('', r.content, q),
    });
  }

  for (const r of memoRows) {
    results.push({
      type: 'memo',
      projectId: '',
      projectName: 'Quick Memo',
      title: 'Quick Memo',
      snippet: buildSnippet(r.content, q),
      score: scoreMatch('', r.content, q),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return NextResponse.json(results.slice(0, 30));
}
