import fs from 'fs';
import { getDbPath } from '../utils/paths';
import { initSchema } from './schema';
import { initScheduler } from '../scheduler';

// Compatibility wrapper: mimics better-sqlite3 API on top of sql.js
class DatabaseWrapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private dbPath: string;
  private dirty = false;
  private inTransaction = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  private save() {
    if (!this.dirty) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
    this.dirty = false;
  }

  private immediatelySave() {
    this.dirty = true;
    if (!this.inTransaction) this.save();
  }

  private rowsToObjects(columns: string[], values: unknown[][]): Record<string, unknown>[] {
    return values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
      return obj;
    });
  }

  prepare(sql: string) {
    const self = this;
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(sql);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all(...params: unknown[]): any[] {
        const stmt = self.db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const columns: string[] = stmt.getColumnNames();
        const rows: unknown[][] = [];
        while (stmt.step()) {
          rows.push(stmt.get());
        }
        stmt.free();
        return self.rowsToObjects(columns, rows);
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(...params: unknown[]): any {
        const stmt = self.db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let result: Record<string, unknown> | undefined;
        if (stmt.step()) {
          const columns = stmt.getColumnNames();
          const row = stmt.get();
          const obj: Record<string, unknown> = {};
          columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
          result = obj;
        }
        stmt.free();
        return result;
      },

      run(...params: unknown[]) {
        self.db.run(sql, params);
        if (isWrite) self.immediatelySave();
        const changes = self.db.getRowsModified();
        return { changes };
      },
    };
  }

  exec(sql: string) {
    this.db.exec(sql);
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/im.test(sql)) {
      this.immediatelySave();
    }
  }

  pragma(str: string) {
    if (str.startsWith('table_info(')) {
      const table = str.match(/table_info\((\w+)\)/)?.[1];
      if (!table) return [];
      const result = this.db.exec(`PRAGMA table_info(${table})`);
      if (!result.length) return [];
      return this.rowsToObjects(result[0].columns, result[0].values);
    }
    if (str.includes('journal_mode') || str.includes('wal_checkpoint')) {
      this.immediatelySave();
      return 'memory';
    }
    if (str.includes('foreign_keys')) {
      try { this.db.run(`PRAGMA ${str}`); } catch { /* ignore */ }
      return;
    }
    try {
      const result = this.db.exec(`PRAGMA ${str}`);
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
    } catch { /* ignore */ }
  }

  transaction<T>(fn: () => T): () => T {
    const self = this;
    return () => {
      self.inTransaction = true;
      self.db.run('BEGIN');
      try {
        const result = fn();
        self.db.run('COMMIT');
        self.inTransaction = false;
        self.immediatelySave();
        return result;
      } catch (err) {
        self.inTransaction = false;
        try { self.db.run('ROLLBACK'); } catch { /* already rolled back */ }
        throw err;
      }
    };
  }

  close() {
    this.immediatelySave();
    this.db.close();
  }
}

let wrapper: DatabaseWrapper | null = null;
let initPromise: Promise<DatabaseWrapper> | null = null;

async function initAsync(): Promise<DatabaseWrapper> {
  if (wrapper) return wrapper;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js/dist/sql-wasm.js');
  // In Node, sql.js resolves the .wasm file relative to its own __dirname
  // (node_modules/sql.js/dist). `serverExternalPackages: ['sql.js']` keeps
  // the package unbundled so that resolution works.
  const SQL = await initSqlJs();

  const dbPath = getDbPath();
  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  wrapper = new DatabaseWrapper(db, dbPath);
  initSchema(wrapper as unknown as Parameters<typeof initSchema>[0]);

  process.on('exit', () => wrapper?.close());

  // Start morning notification scheduler
  initScheduler();

  return wrapper;
}

/** Call once before using getDb(). Safe to call multiple times. */
export async function ensureDb(): Promise<DatabaseWrapper> {
  if (wrapper) return wrapper;
  if (!initPromise) {
    initPromise = initAsync();
  }
  return initPromise;
}

/** Sync getter — only works after ensureDb() has resolved. */
export function getDb(): DatabaseWrapper {
  if (!wrapper) {
    throw new Error('Database not initialized. Call await ensureDb() first.');
  }
  return wrapper;
}
