import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { PinballWorld } from '../src/game/pinball';
import { MOD_KIND, limitedCount, limitedOf, modOf, modValue, modsForPart, priceOf, rollLimited, rollShop, totalsOf } from '../src/game/mods';
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
  it('金のバンパー：バンパーの GUM が増える', () => {
    const gumOf = (equip: number[]) => {
      let g = 0;
      const w = make(equip, [], { gum: (v: number) => { g += v; } });
      w.parked = null; w.freeze = 0;
      const b = w.bumpers[0];
      w.puck.x = b.x; w.puck.y = b.y - b.r - w.puck.r - 1; w.puck.vx = 0; w.puck.vy = 400;
      for (let i = 0; i < 6; i += 1) { w.freeze = 0; w.step(1 / 120); }
      return g;
    };
    expect(gumOf([extWith('bumperGum').id])).toBeGreaterThan(gumOf([]) * 1.5);
  });
});
