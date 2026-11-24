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

describe('まとめて開放・おまかせ', () => {
  it('先のスキルまでの道すじと、合計の値段', async () => {
    const { pathTo, pathCost } = await import('../src/game/skills');
    expect(pathTo({}, 'r_home')).toEqual(['r_pow', 'r_slide', 'r_home']);
    expect(pathTo({ r_pow: 3 }, 'r_home')).toEqual(['r_slide', 'r_home']);
    expect(pathCost({ r_pow: 3 }, 'r_home')).toBe(25 + 120);
  });
  it('おまかせ（バランス）：持っている GUM の中で、4 色に散らして上げる', async () => {
    const { autoPlan, SKILL_MAP: M, skillCost } = await import('../src/game/skills');
    const { steps, cost } = autoPlan({}, 3000, 'balance', { red: 0, blue: 0, green: 0 });
    expect(cost).toBeLessThanOrEqual(3000);
    const branches = new Set(steps.map((s) => M[s.id].branch));
    expect(branches.size).toBe(4);
    // 手前から順に（親より先に子を上げない）
    const l: Record<string, number> = {};
    let total = 0;
    for (const s of steps) {
      const p = M[s.id].parent;
      if (p) expect(l[p] ?? 0).toBeGreaterThan(0);
      for (let i = 0; i < s.n; i += 1) total += skillCost(M[s.id], (l[s.id] ?? 0) + i);
      l[s.id] = (l[s.id] ?? 0) + s.n;
    }
    expect(total).toBe(cost);
  });
  it('おまかせ（よく使う操作）：よく当てている色に多く使う', async () => {
    const { autoPlan, SKILL_MAP: M, skillCost } = await import('../src/game/skills');
    const { steps } = autoPlan({}, 20000, 'usage', { red: 900, blue: 50, green: 50 });
    const spent: Record<string, number> = {};
    const l: Record<string, number> = {};
    for (const s of steps) {
      for (let i = 0; i < s.n; i += 1) spent[M[s.id].branch] = (spent[M[s.id].branch] ?? 0) + skillCost(M[s.id], (l[s.id] ?? 0) + i);
      l[s.id] = (l[s.id] ?? 0) + s.n;
    }
    expect(spent.red).toBeGreaterThan((spent.blue ?? 0) * 3);
  });
});
