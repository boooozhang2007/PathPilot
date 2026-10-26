ALTER TABLE roadmap_tasks ADD COLUMN parent_task_id INTEGER;
CREATE INDEX IF NOT EXISTS roadmap_tasks_parent_idx ON roadmap_tasks (parent_task_id);
