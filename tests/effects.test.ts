import { describe, expect, it } from 'vitest';
import { freshSave, type Save } from '../src/core/save';
import { partsSave } from './fixtures';
import { cat } from '../src/core/catalog';
import { Tally, settle } from '../src/game/tally';
import { PinballWorld } from '../src/game/pinball';
import { SLOTS_CAP, limitedOf, rollShop, slotsOf, totalsOf } from '../src/game/mods';
import { extDef, extVal } from '../src/game/exts';
import { abilityOf } from '../src/game/abilities';
import { enemyGum } from '../src/game/economy';
import { commitFocus, deliver, playEmblems, quotaAmount, quotaEmblems, startPlay } from '../src/game/quota';
import { TOY_PRICE } from '../src/game/toys';
import { fixParty } from '../src/ui/home';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(equip: number[] = [], limited: number[] = [], f?: (s: Save) => void, ev: Record<string, unknown> = {}): PinballWorld {
  const s = partsSave(cat.heroes[0].id);
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
const V = (series: number, rarity = 5): number => extVal(extOf(series, rarity), extDef(extOf(series, rarity))!);

describe('並び順の効果（もう 1 回・コピー）', () => {
  it('こだま：左隣の効果をもう 1 回発動する（+倍率なら 2 回足す）', () => {
    const plus = extOf(11).id; // 倍率 +5.5
    const again = extOf(67).id;
    expect(extDef(extOf(67))?.kind).toBe('again');
    const r = make([plus, again]).gumBoosts();
    expect(r.exts).toHaveLength(2);
    expect(r.exts[1].fired).toBe(true);
    expect(settle(rows, [], r.exts, []).mult).toBeCloseTo(1 + V(11) * 2);
    // 左隣に効果がなければ発動しない
    const r2 = make([again, plus]).gumBoosts();
    expect(r2.exts[0].fired).toBe(false);
    expect(settle(rows, [], r2.exts, []).mult).toBeCloseTo(1 + V(11));
  });
  it('うつし鏡：右隣の効果をコピーする（×倍率なら 2 回掛かる）。並び順でさらに変わる', () => {
    const times = extOf(50).id; // 落とさなければ ×
    const copy = extOf(105).id;
    expect(extDef(extOf(105))?.kind).toBe('copy');
    const r = make([copy, times]).gumBoosts();
    expect(r.exts[0].fired).toBe(true);
    expect(settle(rows, [], r.exts, []).mult).toBeCloseTo(V(50) * V(50));
    const r2 = make([times, copy]).gumBoosts(); // 右隣がない
    expect(settle(rows, [], r2.exts, []).mult).toBeCloseTo(V(50));
    // こだまの左がうつし鏡なら、コピーした効果をもう 1 回
    const r3 = make([copy, extOf(67).id, times]).gumBoosts();
    expect(r3.exts.map((x) => x.fired)).toEqual([false, false, true]); // 鏡の右はこだま（コピーできない）
    const r4 = make([extOf(11).id, copy, extOf(67).id]).gumBoosts();
    expect(r4.exts[1].fired).toBe(false); // 鏡の右がこだま
  });
});

describe('育つ倍率', () => {
  it('観察眼：いちばん多く当てた部品の回数 10 ごとに +倍率', () => {
    const w = make([extOf(102).id]);
    const t = new Tally();
    t.add('bumper', 500, 34);
    t.add('enemy', 100, 3);
    const r = w.gumBoosts(t);
    expect(r.exts[0].kind).toBe('mult');
    expect(r.exts[0].amount).toBeCloseTo(3 * V(102));
    expect(r.exts[0].sub).toContain('バンパー 34 回');
  });
  it('育つ卵：いちばん稼いだ出どころが同じプレイが続くほど ×倍率が育つ（上限は★1 で ×8、★で上がる）', () => {
    const w = make([extOf(92).id]);
    const t = new Tally();
    t.add('bumper', 500, 10);
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(1 + V(92));
    commitFocus(w.save, 'bumper');
    commitFocus(w.save, 'bumper');
    expect(w.save.focus).toEqual({ src: 'bumper', n: 2 });
    const cap = 1 + 7 * (V(92) / V(92, 1));
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(Math.min(cap, 1 + V(92) * 3));
    commitFocus(w.save, 'enemy'); // 出どころが変わると 1 から
    expect(w.save.focus).toEqual({ src: 'enemy', n: 1 });
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(1 + V(92));
    w.save.focus = { src: 'bumper', n: 999 };
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(cap);
  });
});

describe('エンブレム獲得・2 回発動・枠の拡張', () => {
  it('時は金なり：プレイごとにエンブレム +1', () => {
    const s = partsSave(cat.heroes[0].id);
    expect(playEmblems(s)).toBe(1);
    s.limited = [5611];
    startPlay(s);
    expect(s.emblems).toBe(2);
  });
  it('金魚すくいのおまけ：納品のエンブレム +2。スキル「納品のごほうび」は 1 段ごとに +3', () => {
    const s = partsSave(cat.heroes[0].id);
    s.limited = [5647];
    s.up = { y_pyramid: 2 };
    startPlay(s);
    s.gum = quotaAmount(1);
    const r = deliver(s)!;
    expect(r.emblems).toBe(quotaEmblems(2, 1) + 2 + 3 * 2);
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
  it('大陸軍・ひな壇：Limited でエクステンションの枠 +1・ヒーローの枠 +2（6 まで）', () => {
    const s = partsSave(cat.heroes[0].id);
    expect(slotsOf(s)).toEqual({ ext: 3, hero: 1 });
    s.limited = [5502, 5627];
    expect(slotsOf(s)).toEqual({ ext: 4, hero: 3 });
    s.extSlots = 5;
    s.heroSlots = 5;
    expect(slotsOf(s)).toEqual({ ext: SLOTS_CAP, hero: SLOTS_CAP });
    // 6 つ装備できる（同じシリーズは重なるので、ちがうシリーズを 6 つ）
    const ids = cat.exts.filter((e) => e.rarity === 1 && !extDef(e)?.mod).slice(0, 6).map((e) => e.id);
    s.equip = [...ids];
    fixParty(s);
    expect(s.equip).toHaveLength(6);
  });
});

describe('置きかえ', () => {
  it('台の仕掛けと Limited の数だけで掛かる倍率（台が育つ倍率）はない', () => {
    const w = make([], [5501, 5503], (s) => { s.toys = ['popup', 'moai', 'captive']; });
    const all = w.gumBoosts().all;
    expect(all.some((b) => b.name === '台の仕掛け' || b.name === 'Limited の輝き')).toBe(false);
  });
  it('エクステンションの★は、台が進まなくてもノルマが進むと並ぶ（高いレアリティはたまに）', () => {
    let seed = 3;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rar = (quota: number) => Array.from({ length: 60 }, () => rollShop(1, 6, rnd, { quota })).flat().map((id) => cat.exts.find((e) => e.id === id)!.rarity);
    expect(new Set(rar(1))).toEqual(new Set([1]));
    expect(Math.max(...rar(4))).toBe(3);
    const late = rar(10);
    expect(late.includes(5)).toBe(true);
    // ノルマ 10 でも、レジェンダリーそのものは少ない（重ねて上げるのが本筋）
    expect(late.filter((r) => r === 5).length / late.length).toBeLessThan(0.15);
  });
  it('本編で効かない効果（ピラミッドの時間・入口の引力）は、どの品にも残っていない', () => {
    for (const e of cat.exts) expect(['gatePull', 'pyramidTime']).not.toContain(extDef(e)?.mod?.key);
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
