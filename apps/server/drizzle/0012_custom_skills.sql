-- 0012：区分「精选技能词典」与「用户自填技能」
-- skills 表既是全局词典（岗位分析关键词抽取的词源、技能选择器的候选），也承载用户自填的技能名
-- （profile_skills 通过外键引用）。此前两者混在一起，任何用户自填的词都会进入所有人的岗位分析。
-- custom=1 的行只作为该技能名的存档，不参与词典。
ALTER TABLE skills ADD COLUMN custom INTEGER NOT NULL DEFAULT 0;
-- 回填：精选词条全部带别名；用户自填词条插入时别名恒为空数组。
UPDATE skills SET custom = 1 WHERE aliases = '[]';
