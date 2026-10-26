// 服务入口：迁移 → seed（首次） → 启动
import { buildApp } from './app.js';
import { getDb } from './db/client.js';
import { migrate, MIGRATIONS_DIR } from './db/migrate.js';
import { config } from './config.js';
import { seedIfNeeded } from './db/seed.js';
import { recoverStaleRuns } from './agent/core.js';


async function main(): Promise<void> {
  const { sqlite } = getDb();
  const applied = migrate(sqlite, MIGRATIONS_DIR);
  if (applied.length) console.log(`[db] 已应用迁移: ${applied.join(', ')}`);
  await seedIfNeeded();
  const recovered = await recoverStaleRuns();
  if (recovered) console.log(`[agent] 已恢复 ${recovered} 个遗留任务`);

  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[server] PathPilot API 已启动: https://pathpilot.070320.xyz`);
  const llm = await import('./agent/settings.js').then((m) => m.getLlmSettings());
  console.log(`[server] Agent 引擎: ${llm.apiKey ? `Pi LLM（${llm.baseUrl} / ${llm.model}）` : '规则引擎（未配置 API Key，管理页 /admin 可配置）'}`);
}

main().catch((err) => {
  console.error('[server] 启动失败:', err);
  process.exit(1);
});
