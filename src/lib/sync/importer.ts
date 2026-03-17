import fs from 'fs';
import { ensureDb, getDb } from '../db';
import { getDbPath } from '../utils/paths';

// Import order: parents first, then children
const IMPORT_ORDER = ['projects', 'brainstorms', 'sub_projects', 'tasks', 'task_prompts', 'task_conversations'];
// Delete order: children first, then parents
const DELETE_ORDER = [...IMPORT_ORDER].reverse();

export async function backupDb(): Promise<string> {
  await ensureDb();
  const dbPath = getDbPath();
  const db = getDb();
  // Flush WAL before backup
  db.pragma('wal_checkpoint(TRUNCATE)');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup-${timestamp}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

export async function importFromFile(filePath: string): Promise<{ tables: Record<string, number> }> {
  await ensureDb();
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  if (!data.version || !data.tables) {
    throw new Error('Invalid sync data format');
  }

  const db = getDb();
  const counts: Record<string, number> = {};

  const doImport = db.transaction(() => {
    db.pragma('foreign_keys = OFF');

    // Delete all data in reverse dependency order
    for (const table of DELETE_ORDER) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
      } catch {
        // Table might not exist, skip
      }
    }

    // Insert data in dependency order
    for (const table of IMPORT_ORDER) {
      const rows = data.tables[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        counts[table] = 0;
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        stmt.run(...columns.map(col => row[col] ?? null));
      }

      counts[table] = rows.length;
    }

    db.pragma('foreign_keys = ON');
  });

  doImport();

  return { tables: counts };
}
