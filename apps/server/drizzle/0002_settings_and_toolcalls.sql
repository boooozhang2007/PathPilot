-- 运行时应用设置（LLM 配置等，管理页可改）+ 聊天工具调用追踪
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE agent_chat_messages ADD COLUMN tool_calls TEXT;
