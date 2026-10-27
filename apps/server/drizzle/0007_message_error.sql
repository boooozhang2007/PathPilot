-- 会话消息错误状态：失败/停止的 assistant 回复需要持久化，刷新后可恢复提示
ALTER TABLE agent_chat_messages ADD COLUMN error_code TEXT;

-- 常用查询索引
CREATE INDEX IF NOT EXISTS roadmaps_user_status_idx ON roadmaps (user_id, status);
CREATE INDEX IF NOT EXISTS job_sources_type_idx ON job_sources (source_type);
CREATE INDEX IF NOT EXISTS agent_chat_messages_session_order_idx ON agent_chat_messages (session_id, id);
