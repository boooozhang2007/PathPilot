-- PathPilot 初始结构（PRD §8） 时间戳均为 UTC ISO 文本，JSON 字段存 text
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  school TEXT,
  major TEXT,
  grade TEXT NOT NULL DEFAULT 'sophomore',
  graduation_date TEXT,
  target_role TEXT,
  career_path TEXT NOT NULL DEFAULT 'undecided',
  weekly_hours INTEGER NOT NULL DEFAULT 8,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_uq ON profiles (user_id);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS skills_name_uq ON skills (name);

CREATE TABLE IF NOT EXISTS profile_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills (id),
  level INTEGER NOT NULL DEFAULT 1,
  evidence_status TEXT NOT NULL DEFAULT 'unevaluated',
  evidence_description TEXT,
  evidence_url TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_skills_uq ON profile_skills (user_id, skill_id);

CREATE TABLE IF NOT EXISTS experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  technologies TEXT NOT NULL DEFAULT '[]',
  role TEXT,
  start_date TEXT,
  end_date TEXT,
  result TEXT,
  evidence_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS experiences_user_idx ON experiences (user_id, type);

CREATE TABLE IF NOT EXISTS job_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  analysis_id INTEGER,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  employment_type TEXT,
  education_requirement TEXT,
  experience_requirement TEXT,
  description TEXT,
  source_url TEXT,
  source_type TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_sources_hash_idx ON job_sources (content_hash);
CREATE INDEX IF NOT EXISTS job_sources_analysis_idx ON job_sources (analysis_id);

CREATE TABLE IF NOT EXISTS job_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_source_id INTEGER NOT NULL REFERENCES job_sources (id) ON DELETE CASCADE,
  skill_id INTEGER,
  original_text TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  evidence_text TEXT
);
CREATE INDEX IF NOT EXISTS job_requirements_source_idx ON job_requirements (job_source_id);

CREATE TABLE IF NOT EXISTS roadmaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  parent_version_id INTEGER,
  target_role TEXT NOT NULL,
  career_path TEXT NOT NULL,
  weekly_hours INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  generation_reason TEXT,
  engine TEXT NOT NULL DEFAULT 'rules',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmaps_user_version_uq ON roadmaps (user_id, version);

CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roadmap_id INTEGER NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  semester INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_hours INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'not_started',
  prerequisites TEXT NOT NULL DEFAULT '[]',
  deliverable TEXT,
  acceptance_criteria TEXT,
  related_skills TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  actual_hours INTEGER,
  evidence_url TEXT,
  result_note TEXT,
  deferred_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS roadmap_tasks_user_idx ON roadmap_tasks (user_id);
CREATE INDEX IF NOT EXISTS roadmap_tasks_roadmap_idx ON roadmap_tasks (roadmap_id);

CREATE TABLE IF NOT EXISTS job_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  city TEXT,
  employment_type TEXT NOT NULL DEFAULT 'internship',
  sample_count INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'rules',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_analyses_user_idx ON job_analyses (user_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input_summary TEXT,
  error_code TEXT,
  result_type TEXT,
  result_id INTEGER,
  error_detail TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON agent_runs (user_id, status);

CREATE TABLE IF NOT EXISTS agent_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_chat_sessions_user_idx ON agent_chat_sessions (user_id);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES agent_chat_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  engine TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_chat_messages_session_idx ON agent_chat_messages (session_id);
