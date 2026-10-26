ALTER TABLE job_sources ADD COLUMN relevance_score INTEGER;
ALTER TABLE job_sources ADD COLUMN content_quality_score INTEGER;
ALTER TABLE job_sources ADD COLUMN dedupe_key TEXT;
CREATE INDEX IF NOT EXISTS job_sources_dedupe_idx ON job_sources (dedupe_key);

ALTER TABLE roadmap_tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE roadmap_tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roadmap_tasks ADD COLUMN due_date TEXT;
ALTER TABLE roadmap_tasks ADD COLUMN dependency_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE roadmap_tasks ADD COLUMN completion_rule TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE agent_runs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 2;
ALTER TABLE agent_runs ADD COLUMN next_retry_at TEXT;
ALTER TABLE agent_runs ADD COLUMN progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN progress_message TEXT;
ALTER TABLE agent_runs ADD COLUMN locked_at TEXT;
ALTER TABLE agent_runs ADD COLUMN worker_id TEXT;
ALTER TABLE agent_runs ADD COLUMN input_json TEXT;

ALTER TABLE agent_chat_sessions ADD COLUMN flow_state TEXT NOT NULL DEFAULT 'profile_check';
ALTER TABLE agent_chat_sessions ADD COLUMN profile_snapshot TEXT;
ALTER TABLE agent_chat_sessions ADD COLUMN selected_intent TEXT;
ALTER TABLE agent_chat_sessions ADD COLUMN last_result_ref TEXT;
