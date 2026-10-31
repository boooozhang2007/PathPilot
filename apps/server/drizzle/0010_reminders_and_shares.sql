-- 学习提醒（任务到期提醒 + 每周总结）与规划分享（只读链接）
-- reminders：持久化提醒，dedupe_key 防止重复生成；dismiss 后不再展示
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  task_id INTEGER,
  scheduled_at TEXT NOT NULL,
  dismissed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX reminders_user_idx ON reminders(user_id);
CREATE UNIQUE INDEX reminders_user_dedupe_uq ON reminders(user_id, dedupe_key);

-- roadmap_shares：同一规划同一时刻只保留一个有效分享，撤销/过期后失效
CREATE TABLE roadmap_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX roadmap_shares_token_uq ON roadmap_shares(token);
CREATE INDEX roadmap_shares_roadmap_idx ON roadmap_shares(roadmap_id);
