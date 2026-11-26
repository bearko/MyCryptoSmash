import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import {
  CAPSULE_FAM_PRICE, CAPSULE_RAR_PRICE, FAMILIES, FAM_WEIGHTS, buyCapsule, capsulePool, capsulePrice, drawCapsule, familyOf, famOdds,
  heroDexCount, restockCapsules, rollCapsules, type Capsule,
} from '../src/game/gacha';
import { EXT_PRICE } from '../src/game/stack';
import { resetChallenge } from '../src/game/quota';

/** 決まった並びの乱数 */
const seq = (seed = 1) => { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; };
const starter = cat.heroes.find((h) => h.rarity === 1)!.id;
const fresh = () => freshSave(starter);

describe('ヒーローのガチャ', () => {
  it('値段：★が高いほど高く、同じ★のエクステンション以上', () => {
    for (let r = 1; r <= 5; r += 1) {
      expect(capsulePrice({ kind: 'rar', r })).toBe(CAPSULE_RAR_PRICE[r - 1]);
      expect(CAPSULE_RAR_PRICE[r - 1]).toBeGreaterThanOrEqual(EXT_PRICE[r - 1]);
      if (r > 1) expect(CAPSULE_RAR_PRICE[r - 1]).toBeGreaterThan(CAPSULE_RAR_PRICE[r - 2]);
    }
    expect(capsulePrice({ kind: 'fam', fam: 'phy' })).toBe(CAPSULE_FAM_PRICE);
    expect(capsulePrice({ kind: 'rar', r: 1 }, 99)).toBe(1);
  });

  it('レアリティのカプセルは、その★の持っていないヒーローだけが出る', () => {
    const s = fresh();
    const rnd = seq(7);
    for (let r = 1; r <= 5; r += 1) {
      for (let i = 0; i < 40; i += 1) {
        const h = drawCapsule(s, { kind: 'rar', r }, rnd);
        expect(h).not.toBeNull();
        expect(h!.rarity).toBe(r);
        expect(s.heroes).not.toContain(h!.id);
      }
    }
  });

  it('系統のカプセルは、その系統だけ。★1 が多く★5 はまれ', () => {
    const s = fresh();
    const rnd = seq(3);
    for (const fam of FAMILIES) {
      const count = [0, 0, 0, 0, 0];
      for (let i = 0; i < 4000; i += 1) {
        const h = drawCapsule(s, { kind: 'fam', fam }, rnd)!;
        expect(familyOf(h)).toBe(fam);
        count[h.rarity - 1] += 1;
      }
      const odds = famOdds(s, fam);
      expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      // 出られる★では、★1 の確率がいちばん高く、★5 がいちばん低い
      const live = odds.map((o, i) => [o, i] as const).filter(([o]) => o > 0);
      expect(live[0][1]).toBe(0);
      expect(count[0]).toBeGreaterThan(count[4]);
      expect(count[4] / 4000).toBeLessThan(0.06);
    }
    expect(FAM_WEIGHTS[0]).toBeGreaterThan(FAM_WEIGHTS[4]);
  });

  it('全部持っている★・系統のカプセルは並ばない・出ない', () => {
    const s = fresh();
    s.heroes = cat.heroes.filter((h) => h.rarity === 5 || familyOf(h) === 'agi').map((h) => h.id);
    expect(drawCapsule(s, { kind: 'rar', r: 5 })).toBeNull();
    expect(drawCapsule(s, { kind: 'fam', fam: 'agi' })).toBeNull();
    const rnd = seq(11);
    for (let i = 0; i < 200; i += 1) {
      const caps = rollCapsules(s, rnd);
      expect(caps.some((c) => c.kind === 'rar' && c.r === 5)).toBe(false);
      expect(caps.some((c) => c.kind === 'fam' && c.fam === 'agi')).toBe(false);
      for (const c of caps) expect(capsulePool(s, c).length).toBeGreaterThan(0);
    }
    // 系統のカプセルの★は、持っていない★だけで割りなおす
    expect(famOdds(s, 'phy')[4]).toBe(0);
  });

  it('並ぶのはレアリティ 2 つ（★が違う）＋系統 1〜2 つ（系統が違う）', () => {
    const s = fresh();
    const rnd = seq(5);
    const nFam = new Set<number>();
    for (let i = 0; i < 300; i += 1) {
      const caps = rollCapsules(s, rnd);
      const rar = caps.filter((c): c is Capsule & { kind: 'rar'; r: number } => c.kind === 'rar');
      const fam = caps.filter((c): c is Capsule & { kind: 'fam'; fam: 'phy' } => c.kind === 'fam');
      expect(rar.length).toBe(2);
      expect(new Set(rar.map((c) => c.r)).size).toBe(2);
      expect(fam.length).toBeGreaterThanOrEqual(1);
      expect(fam.length).toBeLessThanOrEqual(2);
      expect(new Set(fam.map((c) => c.fam)).size).toBe(fam.length);
      nFam.add(fam.length);
    }
    expect(nFam.size).toBe(2);
  });

  it('買う：エンブレムを払い、持ち物・図鑑・空いた枠の編成に入り、カプセルは買ったになる', () => {
    const s = fresh();
    s.emblems = 100;
    s.heroSlots = 2;
    s.capsules = [{ kind: 'rar', r: 3 }, { kind: 'fam', fam: 'int' }];
    const r = buyCapsule(s, 0, 0, seq(2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hero.rarity).toBe(3);
    expect(s.emblems).toBe(100 - CAPSULE_RAR_PRICE[2]);
    expect(s.heroes).toContain(r.hero.id);
    expect(s.heroDex).toContain(r.hero.id);
    expect(s.party).toEqual([starter, r.hero.id]);
    expect(r.party).toBe(true);
    expect(s.capsules[0].sold).toBe(true);
    // 買ったカプセルはもう買えない
    expect(buyCapsule(s, 0).ok).toBe(false);
    // 枠がいっぱいなら編成には入らない（持ち物には入る）
    const r2 = buyCapsule(s, 1, 0, seq(4));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.party).toBe(false);
    expect(s.party.length).toBe(2);
    expect(s.heroes).toContain(r2.hero.id);
  });

  it('エンブレムが足りなければ買えない（何も変わらない）', () => {
    const s = fresh();
    s.emblems = CAPSULE_RAR_PRICE[4] - 1;
    s.capsules = [{ kind: 'rar', r: 5 }];
    const r = buyCapsule(s, 0);
    expect(r).toEqual({ ok: false, why: 'poor' });
    expect(s.emblems).toBe(CAPSULE_RAR_PRICE[4] - 1);
    expect(s.heroes).toEqual([starter]);
  });

  it('GAME OVER で、はじめのヒーローだけに戻る。図鑑には残る', () => {
    const s = fresh();
    s.emblems = 200;
    s.heroSlots = 3;
    s.capsules = [{ kind: 'rar', r: 4 }, { kind: 'rar', r: 5 }];
    const a = buyCapsule(s, 0, 0, seq(9));
    const b = buyCapsule(s, 1, 0, seq(10));
    expect(a.ok && b.ok).toBe(true);
    // ガチャのヒーローをリーダーにしていても戻る
    if (a.ok) { s.hero = a.hero.id; s.party = [a.hero.id, starter]; }
    resetChallenge(s);
    expect(s.heroes).toEqual([starter]);
    expect(s.hero).toBe(starter);
    expect(s.party).toEqual([starter]);
    expect(s.capsules).toEqual([]);
    expect(heroDexCount(s)).toBe(3);
  });

  it('品ぞろえ：なければ引き、持って出せなくなったカプセルは外す', () => {
    const s = fresh();
    s.capsules = [];
    restockCapsules(s, false, seq(1));
    expect(s.capsules!.length).toBeGreaterThanOrEqual(3);
    const before = JSON.stringify(s.capsules);
    restockCapsules(s, false, seq(2));
    expect(JSON.stringify(s.capsules)).toBe(before);
    s.capsules = [{ kind: 'rar', r: 5 }, { kind: 'rar', r: 1, sold: true }];
    s.heroes = cat.heroes.filter((h) => h.rarity === 5).map((h) => h.id);
    restockCapsules(s, false);
    expect(s.capsules).toEqual([{ kind: 'rar', r: 1, sold: true }]);
  });
});
