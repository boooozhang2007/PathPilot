// 档案保存独立于 Agent 模块，覆盖移动端字段修改后的持久化与重读。
import { describe, expect, it } from 'vitest';
import { profilePatchInput } from '@pathpilot/shared';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { getProfile, upsertProfile } from '../../src/services/profileService.js';

describe('个人资料字段持久化回归', () => {
  it('三位数周时长及不同毕业年月可保存重读，单字段保存保留其它资料', async () => {
    const [user] = await db.insert(users).values({ email: `profile-persistence-${Date.now()}@t.cn`, passwordHash: 'test-only' }).returning();
    await upsertProfile(user.id, { nickname: '测试同学', targetRole: 'Java 后端开发', graduationDate: '2028-06-01', weeklyHours: 80 });

    for (const weeklyHours of [100, 168]) {
      await upsertProfile(user.id, profilePatchInput.parse({ weeklyHours }));
      const reloaded = await getProfile(user.id);
      expect(reloaded?.weeklyHours).toBe(weeklyHours);
      expect(reloaded?.graduationDate).toBe('2028-06-01');
    }
    await upsertProfile(user.id, profilePatchInput.parse({ graduationDate: '2031-11-01' }));
    const reloaded = await getProfile(user.id);
    expect(reloaded?.graduationDate).toBe('2031-11-01');
    expect(reloaded?.weeklyHours).toBe(168);
    expect(reloaded?.targetRole).toBe('Java 后端开发');
    expect(reloaded?.nickname).toBe('测试同学');
  });
});
