import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../config.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
}

export function createDb(dbPath = config.dbPath): DbHandle {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

let singleton: DbHandle | null = null;

/** 应用运行时单例；测试用 createDb(临时文件) 自行构造 */
export function getDb(): DbHandle {
  if (!singleton) singleton = createDb();
  return singleton;
}

// 便捷导出（进程内单例；测试通过 DB_PATH 环境变量指向临时库）
export const db = new Proxy({} as DbHandle['db'], {
  get(_t, prop, receiver) {
    return Reflect.get(getDb().db, prop, receiver);
  },
});
