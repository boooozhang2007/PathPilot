#!/usr/bin/env bash
# PathPilot 服务一键重启（API :3000 + Web :3001）
# 用法: bash scripts/restart-services.sh
cd "$(dirname "$0")/.." || exit 1

echo "[restart] 停止现有 node 进程…"
taskkill //F //IM node.exe >/dev/null 2>&1
sleep 1

echo "[restart] 启动 API (:3000)…"
(cd apps/server && npx tsx src/index.ts > /tmp/pp-server.log 2>&1 &)

echo "[restart] 启动 Web (:3001)…"
(cd apps/web && npx next start -p 3001 > /tmp/pp-web.log 2>&1 &)

sleep 8
curl -s --max-time 5 http://localhost:3000/api/health >/dev/null && echo "[restart] API  ✓ http://localhost:3000" || echo "[restart] API  ✗ 未启动，查看 /tmp/pp-server.log"
curl -s --max-time 5 -o /dev/null http://localhost:3001/dashboard && echo "[restart] Web  ✓ http://localhost:3001" || echo "[restart] Web  ✗ 未启动，查看 /tmp/pp-web.log"
