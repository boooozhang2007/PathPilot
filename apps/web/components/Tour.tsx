'use client';
// 手把手教学引导:聚光遮罩逐个点亮侧栏功能,五步讲清使用闭环
// 锚点为侧栏真实导航元素([data-tour-anchor]),首次访问自动开启,可随时从侧栏重看
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { Ic, Logo } from './Icon';

export const TOUR_KEY = 'pp_tour_done';

interface Step {
  href: string;
  icon: string;
  title: string;
  body: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    href: '/profile',
    icon: 'layers',
    title: '第一步 · 建立档案',
    body: '目标岗位、每周可投入时间、年级与 MBTI 都在这里。AI 的每一次规划都以这份档案为起点。',
    tip: '技能分「专业能力 / 通用能力」两组,附证据链接',
  },
  {
    href: '/jobs',
    icon: 'globe',
    title: '第二步 · 看清岗位',
    body: '输入目标岗位,AI 联网采集真实招聘样本,统计技能出现频次、学历与经验分布。',
    tip: '也可以粘贴一条岗位描述单独解析',
  },
  {
    href: '/roadmap',
    icon: 'roadmap',
    title: '第三步 · 生成路线',
    body: '岗位数据 + 你的档案,生成按学期拆解的成长路线:每项任务都有时长、产出与验收标准。',
    tip: '没有路线时,页面上有「生成规划」按钮',
  },
  {
    href: '/tasks',
    icon: 'checkCircle',
    title: '第四步 · 执行与记录',
    body: '任务按状态分栏,开始/完成一键打卡;做完提交成果链接,攒出能写进简历的真实经历。',
    tip: '支持批量管理与删除,任务说明可自行编辑',
  },
  {
    href: '/advisor',
    icon: 'chat',
    title: '第五步 · 随时问 AI',
    body: '一句话就能查数据、调规划、加任务:「帮我加一个 Redis 学习任务」「把每周改成 8 小时并重新规划」。',
    tip: '操作真实生效,可切换模型、复制与重新生成',
  },
];

function rectOf(el: Element | null): DOMRect | null {
  return el ? el.getBoundingClientRect() : null;
}

export function Tour({ onClose }: { onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = STEPS[idx];

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour-anchor="${step.href}"]`);
    setBox(rectOf(el));
  }, [step.href]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  function finish() {
    localStorage.setItem(TOUR_KEY, '1');
    onClose();
  }

  const last = idx === STEPS.length - 1;
  // 引导卡片放侧栏右侧,垂直位置跟随聚光目标
  const cardTop = box ? Math.min(Math.max(box.top + box.height / 2 - 130, 90), window.innerHeight - 360) : 120;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* 遮罩:用超大发散阴影在目标四周形成聚光 */}
      {box && (
        <div
          className="coach-target pointer-events-none fixed"
          style={{
            left: box.left - 6,
            top: box.top - 6,
            width: box.width + 12,
            height: box.height + 12,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(7, 19, 32, 0.62)',
            border: '1.5px solid rgba(66,110,254,0.9)',
            transition: 'all .35s cubic-bezier(.22,.8,.32,1)',
          }}
        />
      )}
      {!box && <div className="absolute inset-0 bg-[rgba(7,19,32,0.62)]" />}

      {/* 步骤卡片 */}
      <div
        className="pp-card reveal fixed w-[380px] overflow-hidden p-0"
        style={{ left: 276, top: cardTop, boxShadow: '0 24px 64px -16px rgba(7,19,32,0.5)' }}
        key={idx}
      >
        <div className="ink-panel bp-grid-dark relative px-6 pb-5 pt-6 text-white">
          <div className="flex items-center justify-between">
            <Logo size={30} />
            <button onClick={finish} className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white" title="跳过引导">
              <Ic name="close" size={15} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent/40">
              <Ic name={step.icon} size={17} />
            </span>
            <div className="font-display text-lg font-bold">{step.title}</div>
          </div>
          <p className="mt-2.5 text-[13px] leading-6 text-white/75">{step.body}</p>
        </div>

        <div className="px-6 py-4">
          {step.tip && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[11.5px] leading-5 text-accent-deep">
              <Ic name="info" size={13} className="mt-0.5 shrink-0" />
              {step.tip}
            </div>
          )}
          {/* 进度:路线节点 */}
          <div className="mb-4 flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s.href} className={`h-1.5 flex-1 rounded-full transition-all ${i < idx ? 'bg-teal' : i === idx ? 'bg-accent' : 'bg-line'}`} />
            ))}
            <span className="num ml-2 text-[10px] font-semibold text-slate-2">
              {idx + 1}/{STEPS.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button className="pp-btn pp-btn-ghost px-4 py-2 text-xs" onClick={() => setIdx((v) => v - 1)}>
                上一步
              </button>
            )}
            {last ? (
              <Link href="/profile" onClick={finish} className="pp-btn pp-btn-primary flex-1 py-2.5 text-sm">
                开始使用,去完善档案
              </Link>
            ) : (
              <>
                <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-sm" onClick={() => setIdx((v) => v + 1)}>
                  下一步
                </button>
                {idx === 0 && (
                  <button className="pp-btn pp-btn-ghost px-4 py-2.5 text-xs" onClick={finish}>
                    跳过
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
