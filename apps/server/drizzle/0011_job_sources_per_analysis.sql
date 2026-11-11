-- 0011：岗位来源按「分析」归属去重
-- 原唯一约束 (user_id, dedupe_key) 让同一岗位在一个用户下只能有一行，重复分析时旧分析的来源行
-- 会被改挂到新分析（历史分析的来源列表变空）。改为 (user_id, analysis_id, dedupe_key)：
-- 每次分析保留自己的来源快照，同一次分析内仍然去重。
-- 既有数据满足旧约束，必然满足新约束，无需清理。
DROP INDEX IF EXISTS job_sources_user_dedupe_uq;
CREATE UNIQUE INDEX IF NOT EXISTS job_sources_user_analysis_dedupe_uq ON job_sources (user_id, analysis_id, dedupe_key);
