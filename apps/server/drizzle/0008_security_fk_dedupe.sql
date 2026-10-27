-- 0008：job_sources 外键 + 去重唯一约束
-- 1) user_id 增加外键（SQLite 无法直接给已存在列加约束，用加列/删列/改名重建；同时清理指向已注销用户的孤儿行）
ALTER TABLE job_sources ADD COLUMN user_id_ref INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE job_sources SET user_id_ref = user_id WHERE user_id IS NULL OR user_id IN (SELECT id FROM users);
ALTER TABLE job_sources DROP COLUMN user_id;
ALTER TABLE job_sources RENAME COLUMN user_id_ref TO user_id;

-- 2) 历史数据去重：同一用户同一 dedupe_key 只保留最早一行，否则唯一索引建不起来
DELETE FROM job_sources
WHERE dedupe_key IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM job_sources WHERE dedupe_key IS NOT NULL GROUP BY user_id, dedupe_key
  );

-- 3) 去重唯一约束（SQLite 唯一索引中 NULL 视为互不相同，预置库/缺失 key 的行不受影响）
CREATE UNIQUE INDEX IF NOT EXISTS job_sources_user_dedupe_uq ON job_sources (user_id, dedupe_key);
