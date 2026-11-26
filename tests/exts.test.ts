import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { Tally, settle } from '../src/game/tally';
import { PinballWorld } from '../src/game/pinball';
import { EXT_DEFS, FAMILIES, STAR_POW, emptyStats, extDef, extText, extVal, resolveExts, type PlayStats } from '../src/game/exts';
import * as extsMod from '../src/game/exts';
import { TOY_IDS } from '../src/game/toys';
import { commitPlay, dropExt } from '../src/game/quota';
import { rollShop } from '../src/game/mods';

const ext = (series: number, rarity = 5) => cat.exts.find((e) => e.id === rarity * 1000 + series)!;
const stats = (f: Partial<PlayStats> = {}): PlayStats => ({ ...emptyStats(), ...f });
/** ★の値 */
const V = (series: number, rarity = 5): number => extVal(ext(series, rarity), extDef(ext(series, rarity))!);
const rows = [{ src: 'bumper' as const, v: 100 }, { src: 'enemy' as const, v: 50 }];
const total = (equip: number[], s: PlayStats, opt = {}) => settle(rows, [], resolveExts(equip.map((x) => ext(x)), s, opt).effs, []);

describe('エクステンションの効果（104 シリーズ）', () => {
  it('どのシリーズにも、スコアにつながる効果と説明があり、★が高いほど強い', () => {
    const series = new Set(cat.exts.map((e) => e.id % 1000));
    expect(series.size).toBe(104);
    expect(EXT_DEFS.length).toBe(104);
    for (const n of series) {
      const d = EXT_DEFS.find((x) => x.series === n);
      expect(d, `シリーズ ${n}`).toBeTruthy();
      if (!d) continue;
      expect(d.name.length).toBeGreaterThan(1);
      if (d.kind !== 'again' && d.kind !== 'copy' && d.kind !== 'copyFirst') {
        expect(d.eval).toBeTypeOf('function');
        expect(d.vals[4]).toBeGreaterThanOrEqual(d.vals[0]);
      }
    }
    for (const e of cat.exts) expect(extText(e).length).toBeGreaterThan(4);
  });
  it('系統：11 の系統すべてに品がある', () => {
    for (const f of FAMILIES) expect(EXT_DEFS.filter((d) => d.fam === f).length, f).toBeGreaterThanOrEqual(4);
  });
  it('16 の仕掛けそれぞれに、相性のいい品が 2 つ以上ある', () => {
    for (const t of TOY_IDS) expect(EXT_DEFS.filter((d) => d.toy === t).length, t).toBeGreaterThanOrEqual(2);
  });
  it('単体で ×2 を超える品は、条件つき・壊れもの・★5 だけ（★4 までのいつでも効く ×倍率は ×2 まで）', () => {
    const s = stats();
    for (const d of EXT_DEFS) {
      if (!d.eval || d.fragile) continue;
      for (let r = 1; r <= 4; r += 1) {
        // 条件のない（いつでも効く）×倍率
        const out = d.eval(s, { i: 1, defs: [null, d], grow: 0, prevX: 1 }, d.vals[r - 1]);
        if ((out.kind ?? d.kind) === 'xmult' && out.note === 'いつでも') expect(out.amount, `${d.name} ★${r}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('並び順・系統の組み合わせ', () => {
  it('先頭：一の太刀はいちばん左でだけ効く', () => {
    const s = stats({ drains: 0 });
    expect(total([1, 50], s).mult).toBeCloseTo(V(1) * V(50));
    expect(total([50, 1], s).mult).toBeCloseTo(V(50));
  });
  it('しんがり：いちばん右なら、それまでの ×倍率をもう一度掛ける', () => {
    const s = stats({ drains: 0 });
    expect(total([50, 6], s).mult).toBeCloseTo(V(50) * V(50)); // ★5 は 100%
    expect(total([6, 50], s).mult).toBeCloseTo(V(50)); // 右端でない
  });
  it('同じ系統の数で伸びる・系統がぜんぶ違えば ×・となりが同じ系統なら ×', () => {
    const s = stats({ n: { bumper: 40, sling: 20 }, v: { bumper: 100 } });
    // 跳ねの共鳴：跳ねの品 3 つ（自分をふくむ）
    const r = resolveExts([ext(72), ext(65), ext(71)], s).effs;
    expect(r[0].amount).toBeCloseTo(V(72) ** 3);
    // 一斉射撃：系統がぜんぶ違う
    const ok = resolveExts([ext(2), ext(65), ext(9)], s).effs[0];
    expect(ok.fired).toBe(true);
    const ng = resolveExts([ext(2), ext(65), ext(71)], s).effs[0];
    expect(ng.fired).toBe(false);
    // 並び撃ち：となりが同じ系統（仕上げ）
    const nb = resolveExts([ext(1), ext(49), ext(14)], s).effs[1];
    expect(nb.amount).toBeCloseTo(V(49) ** 2);
    // 終盤の大物：跳ねが 3 つそろうと巨大な ×
    expect(resolveExts([ext(152), ext(65), ext(71), ext(72)], s).effs[0].amount).toBeCloseTo(V(152));
    expect(resolveExts([ext(152), ext(65), ext(71)], s).effs[0].fired).toBe(false);
  });
  it('こだま・うつし鏡・王冠の写し', () => {
    const s = stats({ drains: 0 });
    expect(total([50, 67], s).mult).toBeCloseTo(V(50) * V(50));
    expect(total([105, 50], s).mult).toBeCloseTo(V(50) * V(50));
    expect(total([50, 11, 36], s).mult).toBeCloseTo((1 * V(50) + V(11)) * V(50));
  });
});

describe('行に掛かる効果・仕掛けと結びつく効果', () => {
  it('行 ×：その出どころの基本額だけに掛かる（ほかの行はそのまま）', () => {
    const s = stats({ n: { gumlane: 2 }, v: { gumlane: 100, enemy: 50 } });
    const r = settle([{ src: 'gumlane', v: 100 }, { src: 'enemy', v: 50 }], [], resolveExts([ext(98)], s).effs, []); // G-U-M の大当たりの行 ×
    expect(r.chips).toBeCloseTo(100 * V(98) + 50);
    expect(r.mult).toBeCloseTo(1);
  });
  it('仕掛けがなければ効かない（持てば効く）', () => {
    const s0 = stats({ n: { moai: 10 }, v: { moai: 40, bumper: 100 } });
    expect(resolveExts([ext(94)], s0).effs[0].fired).toBe(false);
    const s1 = stats({ n: { moai: 10 }, v: { moai: 40, bumper: 100 }, toys: ['moai'] });
    const r = resolveExts([ext(94)], s1).effs[0];
    expect(r.fired).toBe(true);
    expect(r.amount).toBeCloseTo(10 * V(94));
    expect(r.src).toBe('moai');
  });
  it('ショップ：持っていない仕掛けに結びつく品は出にくい', () => {
    let rnd = 1;
    const seeded = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
    const count = (toys: string[]) => {
      let k = 0;
      for (let i = 0; i < 300; i += 1) for (const id of rollShop(1, 6, seeded, { quota: 1, toys: toys as never })) if (extDef({ id })?.toy === 'ufo') k += 1;
      return k;
    };
    expect(count(['ufo'])).toBeGreaterThan(count([]));
  });
  it('台の上：UFO が開いた回数・大砲を撃った回数が記録に入る', () => {
    const s = freshSave(cat.heroes[0].id);
    s.toys = ['ufo', 'cannon'];
    const w = new PinballWorld(s, { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} } as never);
    w.startRun(1);
    w.use('ufo');
    w.use('cannon', 2);
    const ps = w.playStats();
    expect(ps.uses.ufo).toBe(1);
    expect(ps.uses.cannon).toBe(2);
    expect(ps.toys).toEqual(expect.arrayContaining(['ufo', 'cannon']));
  });
});

describe('育つ・壊れもの・エンブレム', () => {
  it('育つ：条件を満たしたプレイごとに育ち、セーブに残る。売ると消える', () => {
    const turtle = ext(19);
    const s = stats({ n: { ramp: 1, loop: 1 } });
    const r1 = resolveExts([turtle], s, { grow: {} });
    expect(r1.grow[turtle.id]).toBe(1);
    expect(r1.effs[0].grew).toBe(1);
    const r2 = resolveExts([turtle], stats({ n: { ramp: 0 } }), { grow: r1.grow });
    expect(r2.grow[turtle.id]).toBe(1); // 条件を満たさないと育たない
    expect(r2.effs[0].grew).toBeUndefined();
    const save = freshSave(cat.heroes[0].id);
    save.equip = [turtle.id];
    commitPlay(save, { grow: r1.grow, broke: [], emblems: 0 });
    expect(save.extGrow?.[turtle.id]).toBe(1);
    dropExt(save, turtle.id);
    expect(save.extGrow?.[turtle.id]).toBeUndefined();
    expect(save.equip).toEqual([]);
  });
  it('壊れもの：効いたあと決まった確率で壊れる（乱数を固定）。壊れた品は装備から消える', () => {
    const scythe = ext(56); // 壊れもの 25%
    const s = stats();
    expect(resolveExts([scythe], s, { rng: () => 0.2 }).broke).toEqual([scythe.id]);
    expect(resolveExts([scythe], s, { rng: () => 0.3 }).broke).toEqual([]);
    expect(resolveExts([scythe], s).broke).toEqual([]); // 乱数がなければ壊れない（途中の見込み）
    // 壊れても、そのプレイの効果は効く
    const r = resolveExts([scythe], s, { rng: () => 0 });
    expect(r.effs[0].fired).toBe(true);
    expect(r.effs[0].broke).toBe(true);
    const save = freshSave(cat.heroes[0].id);
    save.equip = [scythe.id, ext(1).id];
    commitPlay(save, r);
    expect(save.equip).toEqual([ext(1).id]);
  });
  it('六連発：ほかの壊れもの 1 つごとに ×', () => {
    const r = resolveExts([ext(29), ext(56), ext(55)], stats()).effs[0];
    expect(r.amount).toBeCloseTo(V(29) ** 2);
  });
  it('エンブレムを生む品・手持ちのエンブレムで強くなる品', () => {
    const r = resolveExts([ext(158)], stats());
    expect(r.emblems).toBe(3);
    const save = freshSave(cat.heroes[0].id);
    commitPlay(save, r);
    expect(save.emblems).toBe(3);
    expect(resolveExts([ext(57)], stats({ emblems: 10 })).effs[0].amount).toBeCloseTo(10 * V(57));
  });
  it('ヒートの印の品：装備すると台の部品に炎が付き、当たるたびに倍率が上がる', () => {
    const s = freshSave(cat.heroes[0].id);
    const straw = ext(39);
    s.equip = [straw.id];
    const w = new PinballWorld(s, { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} } as never);
    w.startRun(1);
    expect(w.heat.has('bumper')).toBe(true);
    expect(w.heatSpots('bumper').length).toBe(w.bumpers.length);
    const t = new Tally();
    t.add('bumper', 10, 40);
    const e = w.gumBoosts(t).exts[0];
    expect(e.kind).toBe('mult');
    expect(e.amount).toBeGreaterThan(0);
  });
});

describe('ショップの札の数字（品の目覚めはない）', () => {
  it('品の目覚めはなくなった：札の数字は★の値のまま、発表でも同じ値が掛かる', () => {
    expect('AWAKE' in extsMod).toBe(false);
    expect('awakeOf' in extsMod).toBe(false);
    const scythe = ext(56, 3);
    const out = resolveExts([scythe], stats({ delivered: 9 })).effs[0].amount;
    expect(out).toBeCloseTo(V(56, 3));
    expect(extText(scythe)).toContain(`×${Math.round(out * 100) / 100}`);
    const axe = ext(11, 2);
    expect(extText(axe)).toContain(`+${Math.round(V(11, 2) * 100) / 100}`);
  });
  it('★の伸びはエピック・レジェンダリーで大きく跳ねる', () => {
    expect(STAR_POW[0]).toBe(1);
    for (let i = 1; i < 5; i += 1) expect(STAR_POW[i]).toBeGreaterThan(STAR_POW[i - 1]);
    // レア → エピック、エピック → レジェンダリーの伸びは、コモン → アンコモンより大きい
    expect(STAR_POW[3] / STAR_POW[2]).toBeGreaterThan(STAR_POW[2] / STAR_POW[1]);
    expect(STAR_POW[4] / STAR_POW[3]).toBeGreaterThan(STAR_POW[2] / STAR_POW[1]);
  });
  it('しきい値の文は★で決まる', () => {
    expect(extText(ext(16, 3))).toContain('−1');
    expect(extText(ext(16, 4))).toContain('−2');
    expect(extText(ext(61, 3))).toContain('1 回もどる');
    expect(extText(ext(61, 4))).toContain('2 回もどる');
  });
});
