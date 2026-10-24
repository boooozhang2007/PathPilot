// 测试环境：临时 SQLite + 迁移 + seed（先于任何业务模块导入执行）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'pathpilot-test-'));
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.AGENT_API_KEY = ''; // 规则引擎通道，无网络依赖
delete process.env.TAVILY_API_KEY;
delete process.env.LIEPIN_USER_TOKEN; // 测试不依赖外部猎聘通道

// 迁移 + seed
const { getDb } = await import('../src/db/client.js');
const { migrate, MIGRATIONS_DIR } = await import('../src/db/migrate.js');
const { seedIfNeeded } = await import('../src/db/seed.js');
migrate(getDb().sqlite, MIGRATIONS_DIR);
await seedIfNeeded();

process.on('exit', () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
