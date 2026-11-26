import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { bossHp, enemyHp, heroRarityWeights, impactFactor, stats } from '../src/game/economy';
import { SKILLS, skillCost } from '../src/game/skills';

describe('数値', () => {
  it('強化の値段はエンブレム 1〜5。段が進むと上がり（下がらない）、先のスキルほど高い', () => {
    for (const u of SKILLS) {
      for (let lv = 0; lv < Math.min(u.max, 40); lv += 1) {
        const c = skillCost(u, lv);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(5);
        if (lv > 0) expect(c).toBeGreaterThanOrEqual(skillCost(u, lv - 1));
      }
    }
    for (const u of SKILLS.filter((x) => x.kind === 'repeat' && x.max >= 20)) expect(skillCost(u, 12)).toBeGreaterThan(skillCost(u, 0));
    const r = (id: string) => SKILLS.find((s) => s.id === id)!;
    expect(skillCost(r('r_pow'), 0)).toBe(1);
    expect(skillCost(r('r_cap'), 0)).toBe(5);
    expect(skillCost(r('r_slide'), 0)).toBeGreaterThan(skillCost(r('r_pow'), 0));
  });
  it('強化すると強くなる', () => {
    const h = cat.heroes[0];
    const a = stats({}, h, 0);
    const b = stats({ r_pow: 10, y_size: 3, y_magnet: 3, y_gum: 3 }, h, 0);
    expect(b.colorMul.red).toBeGreaterThan(a.colorMul.red);
    expect(b.radius).toBeGreaterThan(a.radius);
    expect(b.magnet).toBeGreaterThan(a.magnet);
    expect(b.gumMul).toBeGreaterThan(a.gumMul);
  });
  it('ステージ 1：軽い当たりでは数回、全力の一撃なら 1 回で倒せる', () => {
    const h = cat.heroes.find((x) => x.rarity === 1) ?? cat.heroes[0];
    const st = stats({}, h, 0);
    expect(enemyHp(1, 0) / (st.atk * impactFactor(700))).toBeGreaterThan(2);
    expect(enemyHp(1, 0) / (st.atk * impactFactor(st.launch) * 1.5)).toBeLessThan(1);
    expect(bossHp(1)).toBeGreaterThan(enemyHp(1, 0) * 10);
  });
  it('遅すぎる当たりはダメージにならない', () => {
    expect(impactFactor(50)).toBe(0);
  });
  it('レアリティの重みはステージが進むと上に寄る', () => {
    const a = heroRarityWeights(1);
    const b = heroRarityWeights(30);
    expect(b[5] / b.reduce((x, y) => x + y)).toBeGreaterThan(a[5] / a.reduce((x, y) => x + y));
  });
  it('素材がそろっている', () => {
    expect(cat.heroes.length).toBeGreaterThan(100);
    expect(cat.enemySets.length).toBe(10);
    expect(cat.raids.length).toBe(5);
    expect(cat.shadows.length).toBeGreaterThan(20);
    expect(cat.exts.length).toBeGreaterThan(50);
  });
});
