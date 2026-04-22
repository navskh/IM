// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initSchema(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brainstorms (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

  `);

  const projCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projCols.some(c => c.name === 'project_path')) {
    db.exec("ALTER TABLE projects ADD COLUMN project_path TEXT");
  }
  if (!projCols.some(c => c.name === 'ai_context')) {
    db.exec("ALTER TABLE projects ADD COLUMN ai_context TEXT NOT NULL DEFAULT ''");
  }
  if (!projCols.some(c => c.name === 'watch_enabled')) {
    db.exec("ALTER TABLE projects ADD COLUMN watch_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!projCols.some(c => c.name === 'agent_type')) {
    db.exec("ALTER TABLE projects ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'claude'");
  }

  // v2 tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sub_projects (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      folder_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sub_project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idea'
        CHECK(status IN ('idea','doing','writing','submitted','testing','done','problem')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK(priority IN ('high','medium','low')),
      is_today INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (sub_project_id) REFERENCES sub_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_prompts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      prompt_type TEXT NOT NULL DEFAULT 'manual'
        CHECK(prompt_type IN ('manual','ai_assisted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS global_memos (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_conversations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('assistant','user')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS distribution_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto-distribute',
      created_sub_project_ids TEXT NOT NULL DEFAULT '[]',
      created_task_ids TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rolled_back_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS global_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '__global__',
      role TEXT NOT NULL CHECK(role IN ('assistant','user','system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('assistant','user','system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // tasks archive migration
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskCols.some(c => c.name === 'is_archived')) {
    db.exec("ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskCols.some(c => c.name === 'tags')) {
    db.exec("ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  }

  // Legacy prompt → description 병합 (한 번만 실행; 마커로 중복 방지)
  const LEGACY_MARKER = '<!-- legacy-prompt -->';
  const promptRows = db.prepare(`
    SELECT tp.task_id AS task_id, tp.content AS content, t.description AS description
    FROM task_prompts tp
    JOIN tasks t ON t.id = tp.task_id
    WHERE tp.content IS NOT NULL AND TRIM(tp.content) <> ''
      AND (t.description IS NULL OR t.description NOT LIKE '%${LEGACY_MARKER}%')
  `).all() as { task_id: string; content: string; description: string | null }[];
  if (promptRows.length > 0) {
    const updateStmt = db.prepare('UPDATE tasks SET description = ? WHERE id = ?');
    for (const row of promptRows) {
      const existing = (row.description ?? '').trimEnd();
      const merged = [
        existing,
        existing ? '' : null,
        existing ? '---' : null,
        `${LEGACY_MARKER}`,
        '**Legacy Prompt**',
        '',
        row.content.trim(),
      ].filter(v => v !== null).join('\n');
      updateStmt.run(merged, row.task_id);
    }
  }

  // 'doing' status migration: old CHECK constraint lacks 'doing'.
  // SQLite can't alter CHECK, so rebuild tasks table when needed.
  const tasksTableRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'"
  ).get() as { sql: string } | undefined;
  if (tasksTableRow && !tasksTableRow.sql.includes("'doing'")) {
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        sub_project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idea'
          CHECK(status IN ('idea','doing','writing','submitted','testing','done','problem')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK(priority IN ('high','medium','low')),
        is_today INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_archived INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_project_id) REFERENCES sub_projects(id) ON DELETE CASCADE
      );
      INSERT INTO tasks_new (id, project_id, sub_project_id, title, description, status, priority, is_today, sort_order, created_at, updated_at, is_archived, tags)
        SELECT id, project_id, sub_project_id, title, description, status, priority, is_today, sort_order, created_at, updated_at, is_archived, tags FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
    `);
  }
}
