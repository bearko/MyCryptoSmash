import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { bossHp, enemyHp, heroRarityWeights, impactFactor, stats } from '../src/game/economy';
import { SKILLS, skillCost } from '../src/game/skills';

describe('数値', () => {
  it('強化の値段は段ごとに上がる', () => {
    for (const u of SKILLS.filter((x) => x.kind === 'repeat')) expect(skillCost(u, 5)).toBeGreaterThan(skillCost(u, 4));
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
    expect(cat.bosses.length).toBeGreaterThan(0);
    expect(cat.exts.length).toBeGreaterThan(50);
  });
});
