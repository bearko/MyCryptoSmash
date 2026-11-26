import { describe, expect, it } from 'vitest';
import { freshSave, type Save } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { Tally, settle } from '../src/game/tally';
import { PinballWorld } from '../src/game/pinball';
import { MOD_KIND, SLOTS_CAP, limitedOf, rollShop, scoreOf, slotsOf, totalsOf } from '../src/game/mods';
import { abilityOf } from '../src/game/abilities';
import { GROWTH, enemyGum } from '../src/game/economy';
import { commitFocus, deliver, playEmblems, quotaAmount, quotaEmblems, startPlay } from '../src/game/quota';
import { TOY_PRICE } from '../src/game/toys';
import { fixParty } from '../src/ui/home';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(equip: number[] = [], limited: number[] = [], f?: (s: Save) => void, ev: Record<string, unknown> = {}): PinballWorld {
  const s = freshSave(cat.heroes[0].id);
  s.owned = [...equip];
  s.equip = [...equip];
  s.limited = [...limited];
  f?.(s);
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}
const extOf = (series: number, rarity = 5) => cat.exts.find((e) => e.id === rarity * 1000 + series)!;
const rows = [{ src: 'bumper' as const, v: 100 }];

describe('並び順の効果（もう 1 回・コピー）', () => {
  it('こだま：左隣の効果をもう 1 回発動する（+倍率なら 2 回足す）', () => {
    const plus = extOf(57).id; // 倍率 +0.9
    const again = extOf(67).id;
    expect(scoreOf(extOf(67))?.kind).toBe('again');
    const r = make([plus, again]).gumBoosts();
    expect(r.exts).toHaveLength(2);
    expect(r.exts[1].fired).toBe(true);
    expect(settle(rows, [], r.exts, []).mult).toBeCloseTo(1 + 0.9 + 0.9);
    // 左隣に効果がなければ発動しない
    const r2 = make([again, plus]).gumBoosts();
    expect(r2.exts[0].fired).toBe(false);
    expect(settle(rows, [], r2.exts, []).mult).toBeCloseTo(1.9);
  });
  it('うつし鏡：右隣の効果をコピーする（×倍率なら 2 回掛かる）。並び順でさらに変わる', () => {
    const times = extOf(50).id; // 落とさなければ ×2.5
    const copy = extOf(105).id;
    expect(scoreOf(extOf(105))?.kind).toBe('copy');
    const r = make([copy, times]).gumBoosts();
    expect(r.exts[0].fired).toBe(true);
    expect(settle(rows, [], r.exts, []).mult).toBeCloseTo(2.5 * 2.5);
    const r2 = make([times, copy]).gumBoosts(); // 右隣がない
    expect(settle(rows, [], r2.exts, []).mult).toBeCloseTo(2.5);
    // こだまの左がうつし鏡なら、コピーした効果をもう 1 回
    const r3 = make([copy, extOf(67).id, times]).gumBoosts();
    expect(r3.exts.map((x) => x.fired)).toEqual([false, false, true]); // 鏡の右はこだま（コピーできない）
    const r4 = make([extOf(57).id, copy, extOf(67).id]).gumBoosts();
    expect(r4.exts[1].fired).toBe(false); // 鏡の右がこだま
  });
});

describe('育つ倍率', () => {
  it('観察眼：いちばん稼いだ出どころの回数 10 ごとに +倍率', () => {
    const w = make([extOf(102).id]);
    const t = new Tally();
    t.add('bumper', 500, 34);
    t.add('enemy', 100, 3);
    const r = w.gumBoosts(t);
    expect(r.exts[0].kind).toBe('mult');
    expect(r.exts[0].amount).toBeCloseTo(3 * 0.4);
    expect(r.exts[0].sub).toContain('バンパー 34 回');
  });
  it('育つ卵：いちばん稼いだ出どころが同じプレイが続くほど ×倍率が育つ（×4 まで）', () => {
    const w = make([extOf(92).id]);
    const t = new Tally();
    t.add('bumper', 500, 10);
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(1.5);
    commitFocus(w.save, 'bumper');
    commitFocus(w.save, 'bumper');
    expect(w.save.focus).toEqual({ src: 'bumper', n: 2 });
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(1 + 0.5 * 3);
    commitFocus(w.save, 'enemy'); // 出どころが変わると 1 から
    expect(w.save.focus).toEqual({ src: 'enemy', n: 1 });
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(1.5);
    w.save.focus = { src: 'bumper', n: 30 };
    expect(w.gumBoosts(t).exts[0].amount).toBe(4);
  });
});

describe('エンブレム獲得・2 回発動・枠の拡張', () => {
  it('時は金なり：プレイごとにエンブレム +1', () => {
    const s = freshSave(cat.heroes[0].id);
    expect(playEmblems(s)).toBe(1);
    s.limited = [5611];
    startPlay(s);
    expect(s.emblems).toBe(2);
  });
  it('金魚すくいのおまけ：納品のエンブレム +2。スキル「納品のごほうび」は 1 段ごとに +1', () => {
    const s = freshSave(cat.heroes[0].id);
    s.limited = [5647];
    s.up = { y_pyramid: 2 };
    startPlay(s);
    s.gum = quotaAmount(1);
    const r = deliver(s)!;
    expect(r.emblems).toBe(quotaEmblems(2, 1) + 2 + 2);
  });
  it('黄金の足あと：G-U-M の大当たりのたびにエンブレム +1（1 プレイ 2 まで）', () => {
    const w = make([], [5531]);
    for (let k = 0; k < 4; k += 1) (w as unknown as { lanesDone(): void }).lanesDone();
    expect(w.runEmblems).toBe(2);
    w.startRun(1);
    expect(w.runEmblems).toBe(0);
  });
  it('おうむ返し：リーダーの GUM の倍率の能力が発表で 2 回掛かる', () => {
    const feeder = cat.heroes.find((h) => abilityOf(h).id === 'feeder')!;
    const w = make([], [5613], (s) => { s.hero = feeder.id; s.heroes = [feeder.id]; s.party = [feeder.id]; });
    const lead = w.gumBoosts().all.filter((b) => b.sub.startsWith('リーダーの能力'));
    expect(lead).toHaveLength(2);
    expect(lead[0].mul).toBeCloseTo(lead[1].mul);
  });
  it('大陸軍・ひな壇：Limited でエクステンションとヒーローの枠が 1 つ増える（6 まで）', () => {
    const s = freshSave(cat.heroes[0].id);
    expect(slotsOf(s)).toEqual({ ext: 3, hero: 1 });
    s.limited = [5502, 5627];
    expect(slotsOf(s)).toEqual({ ext: 4, hero: 2 });
    s.extSlots = 5;
    s.heroSlots = 5;
    expect(slotsOf(s)).toEqual({ ext: SLOTS_CAP, hero: SLOTS_CAP });
    // 6 つ装備できる
    const ids = cat.exts.slice(0, 6).map((e) => e.id);
    s.owned = [...ids];
    s.equip = [...ids];
    fixParty(s);
    expect(s.equip).toHaveLength(6);
  });
});

describe('台が育つ倍率・置きかえ', () => {
  it('台の仕掛け 1 つごとに ×、Limited 1 つごとに × の倍率が、発表の全体の倍率に入る', () => {
    const w = make([], [5501, 5503], (s) => { s.toys = ['popup', 'moai', 'captive']; });
    const all = w.gumBoosts().all;
    expect(all.find((b) => b.name === '台の仕掛け')?.mul).toBeCloseTo(GROWTH.toy ** 3);
    expect(all.find((b) => b.name === 'Limited の輝き')?.mul).toBeCloseTo(GROWTH.lim ** 2);
    const none = make().gumBoosts().all;
    expect(none.some((b) => b.name === '台の仕掛け' || b.name === 'Limited の輝き')).toBe(false);
  });
  it('エクステンションの★は、台が進まなくてもノルマが進むと並ぶ', () => {
    const rar = (quota: number) => new Set(Array.from({ length: 30 }, () => rollShop(1, 6, Math.random, [], quota)).flat().map((id) => cat.exts.find((e) => e.id === id)!.rarity));
    expect([...rar(1)]).toEqual([1]);
    expect(Math.max(...rar(4))).toBe(3);
    expect(rar(8).has(5)).toBe(true);
  });
  it('本編で効かない効果（ピラミッドの時間・入口の引力）は、どの品にも残っていない', () => {
    for (const list of Object.values(MOD_KIND)) for (const d of list) expect(['gatePull', 'pyramidTime']).not.toContain(d.key);
    for (const id of cat.limited.map((l) => l.id)) {
      const t = totalsOf([], [id]);
      expect(t.pyramidTime).toBe(0);
      expect(t.gatePull).toBe(0);
    }
    expect(limitedOf(5611).text).toContain('エンブレム');
  });
  it('ボスの反撃：値段は 6。叩かれて跳ねた球に大きな基本額が入る', () => {
    expect(TOY_PRICE.hammer).toBe(6);
    const got: [string, number][] = [];
    const w = make([], [], (s) => { s.toys = ['hammer']; }, { gum: (v: number, src: string) => { got.push([src, v]); } });
    w.enemies = [];
    w.spawnBoss();
    w.parked = null;
    w.puck.x = 360; w.puck.y = 700; w.puck.vx = 0; w.puck.vy = 0;
    w.hammer.x = 360; w.hammer.y = 700;
    (w as unknown as { slam(): void }).slam();
    const v = got.filter(([s]) => s === 'hammer').reduce((a, [, x]) => a + x, 0);
    // 的 1 体ぶんの 10 倍以上
    expect(v).toBeGreaterThan(10 * enemyGum(1, 0));
  });
});
