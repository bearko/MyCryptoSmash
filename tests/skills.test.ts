import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { stats } from '../src/game/economy';
import { BRANCHES, SKILLS, SKILL_MAP, isOpen, isTeaser, migrateLevels, nodePos } from '../src/game/skills';

describe('スキルツリー', () => {
  it('4 色の枝があり、どの枝も中心から始まって到達点で終わる', () => {
    for (const b of BRANCHES) {
      const list = SKILLS.filter((s) => s.branch === b.id);
      expect(list.filter((s) => !s.parent)).toHaveLength(1);
      expect(list.some((s) => s.kind === 'cap')).toBe(true);
      for (const s of list) if (s.parent) expect(SKILL_MAP[s.parent].branch).toBe(b.id);
    }
  });
  it('スキルどうしが重ならない', () => {
    const pts = SKILLS.map((s) => ({ id: s.id, ...nodePos(s) }));
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(0.95);
      }
    }
  });
  it('親を取ると子が取れる。親が見えているだけの子は「？」', () => {
    const l = {};
    expect(isOpen(l, SKILL_MAP.r_pow)).toBe(true);
    expect(isTeaser(l, SKILL_MAP.r_slide)).toBe(true);
    expect(isOpen(l, SKILL_MAP.r_home)).toBe(false);
    expect(isTeaser(l, SKILL_MAP.r_home)).toBe(false);
    expect(isOpen({ r_pow: 1 }, SKILL_MAP.r_slide)).toBe(true);
  });
  it('前の版の強化を読みかえる', () => {
    const l = migrateLevels({ atk: 7, mates: 2, power: 3 });
    expect(l.r_pow).toBe(7);
    expect(l.b_pow).toBe(7);
    expect(l.y_mates).toBe(2);
    expect(l.y_magnet).toBeGreaterThanOrEqual(1); // 親もつながる
    expect(l.r_slide).toBe(3);
  });
  it('到達点で弱点の倍率が上がる', () => {
    const h = cat.heroes[0];
    expect(stats({}, h, 0).weakMul.red).toBe(2.5);
    expect(stats({ r_cap: 1 }, h, 0).weakMul.red).toBe(4);
  });
  it('アイコンの素材がそろっている', async () => {
    const { existsSync } = await import('node:fs');
    for (const s of SKILLS) if (s.icon !== 'gum') expect(existsSync(`public/mch/Image/Extensions/${s.icon}.png`)).toBe(true);
  });
});
