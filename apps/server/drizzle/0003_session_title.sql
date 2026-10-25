-- 会话自定义标题（App 端历史管理：重命名对话）
ALTER TABLE agent_chat_sessions ADD COLUMN title TEXT;
