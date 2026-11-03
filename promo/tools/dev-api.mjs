// 宣传片录制用的隔离后端：独立 SQLite（data/promo.db）+ 演示账号种子，端口 3000
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const child = spawn('npm', ['run', 'dev', '-w', '@pathpilot/server'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    DB_PATH: './data/promo.db',
    PATHPILOT_SEED_DEMO: '1',
    PORT: '3000',
    // 录制用：Web(3001) 与 Expo Web(8081) 都要能跨域调用本地 API
    CORS_ORIGINS:
      'http://localhost:3000,http://localhost:3001,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:8081',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
