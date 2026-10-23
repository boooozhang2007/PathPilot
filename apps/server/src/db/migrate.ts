// 极简迁移执行器：按文件名序执行 drizzle/*.sql，_migrations 表记录进度（幂等）
// PRD 7.2：数据库迁移纳入代码仓库
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Database } from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'drizzle');

export function migrate(sqlite: Database, migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
  );
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const newlyApplied: string[] = [];
  const insert = sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(sql);
      insert.run(file, new Date().toISOString());
      sqlite.exec('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw new Error(`迁移 ${file} 失败: ${err instanceof Error ? err.message : err}`);
    }
  }
  return newlyApplied;
}

// CLI: npm run db:migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/')) {
  const { getDb } = await import('./client.js');
  const { sqlite } = getDb();
  const applied = migrate(sqlite, MIGRATIONS_DIR);
  console.log(applied.length ? `已应用迁移: ${applied.join(', ')}` : '数据库已是最新');
}
