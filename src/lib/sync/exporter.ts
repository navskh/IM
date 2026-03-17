import fs from 'fs';
import { getDb } from '../db';

// v2 active tables
const V2_TABLES = ['projects', 'brainstorms', 'sub_projects', 'tasks', 'task_prompts', 'task_conversations'];

function getExistingTables(db: ReturnType<typeof getDb>): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  return rows.map(r => r.name);
}

export function exportToFile(filePath: string): { tables: Record<string, number> } {
  const db = getDb();
  const existingTables = getExistingTables(db);

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  // Export all known tables using raw SELECT for perfect round-trip
  for (const table of V2_TABLES) {
    if (existingTables.includes(table)) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      tables[table] = rows;
      counts[table] = rows.length;
    }
  }

  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tables,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  return { tables: counts };
}
