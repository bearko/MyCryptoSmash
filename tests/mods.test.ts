import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { PinballWorld } from '../src/game/pinball';
import { MOD_KIND, hasOwnEffect, limitedCount, limitedOf, modOf, modValue, modsForPart, priceOf, rollLimited, rollShop, totalsOf } from '../src/game/mods';
import { PARTS } from '../src/game/parts';
import * as T from '../src/game/table';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(equip: number[] = [], limited: number[] = [], ev: Record<string, unknown> = {}): PinballWorld {
  const s = freshSave(cat.heroes[0].id);
  s.owned = [...equip];
  s.equip = [...equip];
  s.limited = [...limited];
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}
const extWith = (key: string, rarity = 5) => cat.exts.find((e) => e.rarity === rarity && modOf(e).key === key)!;

describe('台の改造（エクステンション・Limited）', () => {
  it('どのエクステンションにも改造があり、付く部品は台にある。★が高いほど強い', () => {
    for (const e of cat.exts) {
      const d = modOf(e);
      expect(PARTS.some((p) => p.id === d.part)).toBe(true);
    }
    for (const list of Object.values(MOD_KIND)) for (const d of list) expect(modValue(d, 5)).toBeGreaterThanOrEqual(modValue(d, 1));
  });
  it('Limited は ID 5501 以降の 54 個で、どれにも効き目と部品がある', () => {
    expect(cat.limited.length).toBe(54);
    for (const l of cat.limited) {
      expect(l.id).toBeGreaterThan(5500);
      expect(l.id).toBeLessThan(11000);
      const d = limitedOf(l.id);
      expect(d.text.length).toBeGreaterThan(3);
      expect(PARTS.some((p) => p.id === d.part)).toBe(true);
    }
  });
  it('どの部品から見ても、付けられる改造がわかる', () => {
    const total = PARTS.reduce((a, p) => a + modsForPart(p.id).limited.length, 0);
    expect(total).toBe(54);
  });
  it('Limited の候補は持っていないものから。早く突破すると候補が増える', () => {
    const owned = cat.limited.slice(0, 50).map((l) => l.id);
    const c = rollLimited(owned, 5);
    expect(c.length).toBe(4);
    for (const id of c) expect(owned.includes(id)).toBe(false);
    expect(limitedCount(20)).toBe(3);
    expect(limitedCount(14)).toBe(4);
    expect(limitedCount(8)).toBe(5);
  });
  it('ショップ：最初は★1 だけ。先の台へ進むと高い★も並ぶ。値段は★と台で上がる', () => {
    const a = rollShop(1, 6).map((id) => cat.exts.find((e) => e.id === id)!);
    expect(a.length).toBe(6);
    expect(a.every((e) => e.rarity === 1)).toBe(true);
    const many = Array.from({ length: 20 }, () => rollShop(30, 6)).flat().map((id) => cat.exts.find((e) => e.id === id)!.rarity);
    expect(Math.max(...many)).toBe(5);
    const e1 = cat.exts.find((e) => e.rarity === 1)!;
    const e5 = cat.exts.find((e) => e.rarity === 5)!;
    expect(priceOf(e5, 1)).toBeGreaterThan(priceOf(e1, 1));
    expect(priceOf(e1, 10)).toBeGreaterThan(priceOf(e1, 1));
  });
  it('装備した改造の数字が台に入る（足し合わせ・上限あり）', () => {
    const f = extWith('fence');
    const t = totalsOf([f.id, f.id, f.id], []);
    expect(t.fence).toBeLessThanOrEqual(0.6);
    const w = make([extWith('bumperGum').id]);
    expect(w.mods.bumperGum).toBeGreaterThan(0);
  });
  it('予備のセーブ：落ちても決まった回数だけ戻る', () => {
    const texts: string[] = [];
    const w = make([extWith('spareSave').id], [], { pin: (t: string) => { texts.push(t); } });
    w.parked = null; w.ballSaveUntil = 0; w.freeze = 0;
    w.puck.x = 360; w.puck.y = T.DRAIN_Y + 20; w.puck.vy = 300;
    w.step(1 / 60);
    expect(texts).toContain('SPARE SAVE!');
    expect(w.drains).toBe(0);
  });
  it('Limited：1 プレイの時間がのびる・G が点いた状態で始まる', () => {
    const w = make([], [5556, 5598]);
    expect(w.runTime).toBe(42);
    expect(w.runLeft).toBe(42);
    expect(w.lanes[0].lit).toBe(true);
  });
  it('金のバンパー：バンパーの GUM が増える（プレイのあとの発表で）', () => {
    const gumOf = (equip: number[]) => {
      let g = 0;
      const w = make(equip, [], { gum: (v: number) => { g += v; } });
      w.parked = null; w.freeze = 0;
      const b = w.bumpers[0];
      w.puck.x = b.x; w.puck.y = b.y - b.r - w.puck.r - 1; w.puck.vx = 0; w.puck.vy = 400;
      for (let i = 0; i < 6; i += 1) { w.freeze = 0; w.step(1 / 120); }
      return g;
    };
    // プレイ中の基本額は同じで、プレイのあとの発表でバンパーの行に倍率が掛かる
    expect(gumOf([extWith('bumperGum').id])).toBeCloseTo(gumOf([]));
    const w = make([extWith('bumperGum').id], []);
    const row = w.gumBoosts().rows.find((r) => r.src === 'bumper');
    expect(row?.mul).toBeGreaterThan(1.5);
  });
});

describe('Limited の固有の効き目', () => {
  it('54 個すべてに、その品だけの効き目がある', () => {
    for (const l of cat.limited) expect(hasOwnEffect(l.id)).toBe(true);
  });
  it('真・大軍師の采配：マルチボールに必要なロックが 1 回へる', () => {
    expect(make([], [5595]).locksNeeded).toBe(make().locksNeeded - 1);
  });
  it('ぐらふぁいとみやげ：プレイが終わるとき、そのプレイの GUM +10%', () => {
    const w = make([], [5651]);
    const b = w.gumBoosts().all.find((x) => x.sub.includes('おみやげ'));
    expect(b?.mul).toBeCloseTo(1.1);
  });
  it('真・皇帝のトリコーン：台で最初の的を倒すと GUM が多い（2 体目はふつう）', () => {
    const gums: number[] = [];
    const w = make([], [5559], { gum: (v: number) => { gums.push(v); } });
    const [a, b] = w.enemies;
    w.damage(a, 1e12, a.x, a.y, 'hit');
    const first = gums.reduce((x, y) => x + y, 0);
    gums.length = 0;
    w.damage(b, 1e12, b.x, b.y, 'hit');
    const second = gums.reduce((x, y) => x + y, 0);
    expect(first).toBeGreaterThan(second);
  });
  it('真・メギド：マルチボール中、上からレーザーが的を撃つ', () => {
    const w = make([], [5630]);
    w.multiball();
    const hp = w.enemies.reduce((a, e) => a + e.hp, 0);
    for (let i = 0; i < 10; i += 1) { w.freeze = 0; w.step(1 / 60); }
    expect(w.beams.length + (w.enemies.reduce((a, e) => a + e.hp, 0) < hp ? 1 : 0)).toBeGreaterThan(0);
  });
  it('ソーマ：ZONE の間、のこり時間の減りがゆっくり', () => {
    const w = make([], [5558]);
    w.combo = 25; w.comboT = w.time + 99; w.zone = true;
    const t = w.runLeft;
    w.parked = null; w.puck.x = 300; w.puck.y = 620; w.puck.vx = 0; w.puck.vy = 0;
    w.freeze = 0; w.step(0.05);
    expect(t - w.runLeft).toBeLessThan(0.05);
  });
});
