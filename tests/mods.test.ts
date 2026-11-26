import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { Tally, settle } from '../src/game/tally';
import { cat } from '../src/core/catalog';
import { PinballWorld } from '../src/game/pinball';
import { MOD_KIND, SCORE_DEFS, scoreOf, hasOwnEffect, limitedOf, modOf, modValue, modsForPart, priceOf, rollLimited, sellOf, rollShop, totalsOf } from '../src/game/mods';
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
const extWith = (key: string, rarity = 5) => cat.exts.find((e) => e.rarity === rarity && modOf(e)?.key === key)!;

describe('台の改造（エクステンション・Limited）', () => {
  it('どのエクステンションにも改造かスコアの効果があり、改造の付く部品は台にある。★が高いほど強い', () => {
    for (const e of cat.exts) {
      const d = modOf(e);
      const sc = scoreOf(e);
      expect(!!d !== !!sc).toBe(true);
      if (d) expect(PARTS.some((p) => p.id === d.part)).toBe(true);
      if (sc) expect(sc.vals[4]).toBeGreaterThan(sc.vals[0]);
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
  it('Limited の候補は持っていないものから', () => {
    const owned = cat.limited.slice(0, 50).map((l) => l.id);
    const c = rollLimited(owned, 5);
    expect(c.length).toBe(4);
    for (const id of c) expect(owned.includes(id)).toBe(false);
  });
  it('ショップ：最初は★1 だけ。先の台へ進むと高い★も並ぶ。値段は★で決まるエンブレム（売値は半分）', () => {
    const a = rollShop(1, 6).map((id) => cat.exts.find((e) => e.id === id)!);
    expect(a.length).toBe(6);
    expect(a.every((e) => e.rarity === 1)).toBe(true);
    const many = Array.from({ length: 20 }, () => rollShop(30, 6)).flat().map((id) => cat.exts.find((e) => e.id === id)!.rarity);
    expect(Math.max(...many)).toBe(5);
    const e1 = cat.exts.find((e) => e.rarity === 1)!;
    const e5 = cat.exts.find((e) => e.rarity === 5)!;
    expect(priceOf(e1)).toBe(3);
    expect(priceOf(e5)).toBe(8);
    expect(sellOf(e1)).toBe(1);
    expect(sellOf(e5)).toBe(4);
  });
  it('装備した改造の数字が台に入る（足し合わせ・上限あり）', () => {
    const f = extWith('fence');
    const t = totalsOf([f.id, f.id, f.id], []);
    expect(t.fence).toBeLessThanOrEqual(0.6);
    const w = make([extWith('magnet').id]);
    expect(w.mods.magnet).toBeGreaterThan(0);
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
  it('Limited のバンパーの GUM ×2 は、プレイのあとの発表でバンパーの行に掛かる', () => {
    const w = make([], [5561]);
    const row = w.gumBoosts().rows.find((r) => r.src === 'bumper');
    expect(row?.mul).toBeCloseTo(2);
  });
});

describe('スコアの効果（GUM の種類のエクステンション）', () => {
  const extOf = (series: number, rarity = 5) => cat.exts.find((e) => e.id === rarity * 1000 + series)!;
  it('GUM の種類のエクステンションは、どれもスコアの効果を持つ（台の改造は持たない）', () => {
    const gum = cat.exts.filter((e) => e.kind === 'gum');
    expect(gum.length).toBeGreaterThan(0);
    for (const e of gum) { expect(scoreOf(e)).not.toBe(null); expect(modOf(e)).toBe(null); }
    const kinds = new Set(SCORE_DEFS.map((d) => d.kind));
    expect([...kinds].sort()).toEqual(['chips', 'mult', 'xmult']);
  });
  it('装備の並び順に効く：+倍率 → ×倍率 と ×倍率 → +倍率 で結果が変わる', () => {
    const plus = extOf(57).id; // 倍率 +0.9（いつでも）
    const times = extOf(50).id; // 落とさなければ ×2.5
    const a = make([plus, times], []);
    const b = make([times, plus], []);
    const ra = a.gumBoosts();
    const rb = b.gumBoosts();
    expect(ra.exts.map((x) => x.id)).toEqual([plus, times]);
    const rows = [{ src: 'bumper' as const, v: 100 }];
    const sa = settle(rows, [], ra.exts, []);
    const sb = settle(rows, [], rb.exts, []);
    expect(sa.mult).toBeCloseTo((1 + 0.9) * 2.5);
    expect(sb.mult).toBeCloseTo(1 * 2.5 + 0.9);
    expect(sa.total).toBeGreaterThan(sb.total);
  });
  it('×2 と ×3 があれば ×6（全体のスコアに掛かる）', () => {
    const rows = [{ src: 'enemy' as const, v: 10 }];
    const x = (amount: number) => ({ id: 0, name: '', sub: '', kind: 'xmult' as const, amount, fired: true, img: '' });
    expect(settle(rows, [], [x(2), x(3)], []).total).toBeCloseTo(60);
  });
  it('+基本額は的の数で増え、条件を満たさない ×倍率は発動しない', () => {
    const w = make([extOf(8).id, extOf(50).id], []);
    const t = new Tally();
    t.add('enemy', 0, 4);
    w.drains = 1;
    const r = w.gumBoosts(t).exts;
    expect(r[0].kind).toBe('chips');
    expect(r[0].amount).toBeGreaterThan(0);
    expect(r[1].fired).toBe(false);
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
