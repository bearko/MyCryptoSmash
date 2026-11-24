import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { UPGRADES, bossHp, cost, enemyHp, heroRarityWeights, impactFactor, stats } from '../src/game/economy';

describe('数値', () => {
  it('強化の値段は段ごとに上がる', () => {
    for (const u of UPGRADES) expect(cost(u, 5)).toBeGreaterThan(cost(u, 4));
  });
  it('強化すると強くなる', () => {
    const h = cat.heroes[0];
    const a = stats({}, h, 0);
    const b = stats({ atk: 10, size: 3, magnet: 3, gum: 3 }, h, 0);
    expect(b.atk).toBeGreaterThan(a.atk);
    expect(b.radius).toBeGreaterThan(a.radius);
    expect(b.magnet).toBeGreaterThan(a.magnet);
    expect(b.gumMul).toBeGreaterThan(a.gumMul);
  });
  it('ステージ 1 のエネミーは数回の体当たりで倒せる', () => {
    const h = cat.heroes.find((x) => x.rarity === 1) ?? cat.heroes[0];
    const hit = stats({}, h, 0).atk * impactFactor(1100);
    const n = enemyHp(1, 0) / hit;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(6);
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
