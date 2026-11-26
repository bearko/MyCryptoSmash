import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { freshSave, type Save } from '../src/core/save';
import {
  EXT_PRICE, OVERFLOW_EMBLEM, PTS_MAX, RARITY_PTS, addPts, buyExt, fitSlots, gaugeOf, migrateInventory, ptsOf, rarityOfPts, rankUp, sellExt, sellPrice, stackPreview,
} from '../src/game/stack';
import { rollShop, slotsOf, totalsOf } from '../src/game/mods';
import { SLOT_VALS, extDef } from '../src/game/exts';
import { MALLET_MAX, MALLET_PTS, buyMallet, malletLv, malletPrice, malletPts, resetChallenge } from '../src/game/quota';
import { PinballWorld } from '../src/game/pinball';
import { enemyGum } from '../src/game/economy';
import { SKILL_MAP, skillCost } from '../src/game/skills';
import { stats } from '../src/game/economy';
import { fixParty, restockShop } from '../src/ui/home';

const fresh = (): Save => freshSave(cat.heroes[0].id);
const ext = (series: number, rarity = 1): number => rarity * 1000 + series;
const extOf = (id: number) => cat.exts.find((e) => e.id === id)!;
const seeded = (seed: number) => { let s = seed; return (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

describe('レアリティと点', () => {
  it('点は コモン 1・アンコモン 2・レア 3・エピック 5・レジェンダリー 10。合計の点でレアリティが決まる', () => {
    expect(RARITY_PTS).toEqual([1, 2, 3, 5, 10]);
    expect([1, 2, 3, 4, 5, 6, 9, 10].map(rarityOfPts)).toEqual([1, 2, 3, 3, 4, 4, 4, 5]);
    expect(PTS_MAX).toBe(10);
  });
  it('★のゲージ：しきいの間の余りが残る（レア 3 点＋コモン 1 点＝4 点で、エピックまであと 1 点）', () => {
    const g = gaugeOf(4);
    expect(g.r).toBe(3);
    expect(g.hi).toBe(5);
    expect(g.need).toBe(1);
    expect(g.frac).toBeCloseTo(0.5);
    expect(gaugeOf(10).hi).toBe(null);
    expect(gaugeOf(10).frac).toBe(1);
  });
});

describe('重ね（同じシリーズの品を買う）', () => {
  it('装備している品に重なり、点が合計される。レアリティが上がると名前と絵も上の★の品に変わる', () => {
    const s = fresh();
    s.emblems = 100;
    const r1 = buyExt(s, ext(9, 3), { price: EXT_PRICE[2], slots: 3 });
    expect(r1.ok && r1.kind).toBe('new');
    expect(s.equip).toEqual([ext(9, 3)]);
    expect(ptsOf(s, ext(9, 3))).toBe(3);
    // レア＋コモン＝4 点：レアのまま
    const pv = stackPreview(s, ext(9, 1));
    expect(pv).toMatchObject({ pts: 4, add: 1, evolve: false, to: ext(9, 3) });
    const r2 = buyExt(s, ext(9, 1), { price: 3, slots: 3 });
    expect(r2.ok && r2.kind).toBe('stack');
    expect(s.equip).toEqual([ext(9, 3)]);
    expect(ptsOf(s, ext(9, 3))).toBe(4);
    // ＋コモン＝5 点：エピックへ（ID・名前・絵が変わる）
    const before = extOf(ext(9, 3));
    const r3 = buyExt(s, ext(9, 1), { price: 3, slots: 3 });
    expect(r3.ok && r3.kind === 'stack' && r3.stack.evolve).toBe(true);
    expect(s.equip).toEqual([ext(9, 4)]);
    const after = extOf(ext(9, 4));
    expect(after.name).not.toBe(before.name);
    expect(after.img).not.toBe(before.img);
    expect(s.exts).toContain(ext(9, 4)); // 図鑑にも載る
  });
  it('アンコモン＋レア＝エピック、コモン＋アンコモン＝レア', () => {
    const s = fresh();
    s.equip = [ext(5, 2), ext(21, 1)];
    expect(addPts(s, ext(5, 2), 3).to).toBe(ext(5, 4));
    expect(addPts(s, ext(21, 1), 2).to).toBe(ext(21, 3));
    expect(s.equip).toEqual([ext(5, 4), ext(21, 3)]);
  });
  it('レジェンダリーで止まり、あふれた点はエンブレムに換わる', () => {
    const s = fresh();
    s.equip = [ext(1, 4)];
    s.stack = { 1: { p: 8, paid: 30 } };
    s.emblems = 0;
    const st = addPts(s, ext(1, 4), 5);
    expect(st.to).toBe(ext(1, 5));
    expect(st.pts).toBe(10);
    expect(st.overflow).toBe(3);
    expect(s.emblems).toBe(3 * OVERFLOW_EMBLEM);
    expect(ptsOf(s, ext(1, 5))).toBe(10);
  });
  it('育ちは重ねても引きつぐ', () => {
    const s = fresh();
    s.equip = [ext(19, 2)];
    s.extGrow = { [ext(19, 2)]: 4 };
    addPts(s, ext(19, 2), 1);
    expect(s.extGrow[ext(19, 3)]).toBe(4);
    expect(s.extGrow[ext(19, 2)]).toBeUndefined();
  });
  it('★ +1（Limited）は次のレアリティのしきいまで点を足す', () => {
    const s = fresh();
    s.equip = [ext(2, 3)];
    s.stack = { 2: { p: 4, paid: 15 } };
    expect(rankUp(s, ext(2, 3))).toBe(ext(2, 4));
    expect(ptsOf(s, ext(2, 4))).toBe(5);
    s.equip = [ext(3, 5)];
    expect(rankUp(s, ext(3, 5))).toBe(null);
  });
});

describe('持ち物の一覧はない（持てるのは装備の枠の分だけ）', () => {
  it('買うと装備に付く。枠がいっぱいなら、入れかえる品を選んで売らないと買えない', () => {
    const s = fresh();
    s.emblems = 100;
    for (const sr of [1, 2, 3]) expect(buyExt(s, ext(sr), { price: 3, slots: 3 }).ok).toBe(true);
    expect(s.equip).toEqual([ext(1), ext(2), ext(3)]);
    const no = buyExt(s, ext(5), { price: 3, slots: 3 });
    expect(no).toEqual({ ok: false, why: 'full' });
    expect(s.equip).toHaveLength(3);
    // 入れかえ：選んだ品を売って、その場所に入る
    const em = s.emblems;
    const r = buyExt(s, ext(5), { price: 3, slots: 3, replace: ext(2) });
    expect(r.ok).toBe(true);
    expect(s.equip).toEqual([ext(1), ext(5), ext(3)]);
    expect(s.emblems).toBe(em - 3 + 1); // 売値（コモンは 1）
    // 同じシリーズなら、枠がいっぱいでも重ねられる
    expect(buyExt(s, ext(1), { price: 3, slots: 3 }).ok).toBe(true);
    expect(s.equip).toEqual([ext(1, 2), ext(5), ext(3)]);
  });
  it('入れかえの売値も足して払える', () => {
    const s = fresh();
    s.equip = [ext(1, 4), ext(2), ext(3)];
    s.emblems = 10;
    expect(sellPrice(s, ext(1, 4))).toBe(11);
    expect(buyExt(s, ext(5, 3), { price: 12, slots: 3, replace: ext(1, 4) }).ok).toBe(true);
    expect(s.emblems).toBe(9);
  });
  it('売る：いまのレアリティの買値の半分。点と育ちも消える', () => {
    const s = fresh();
    s.equip = [ext(19, 3)];
    s.stack = { 19: { p: 4, paid: 9 } };
    s.extGrow = { [ext(19, 3)]: 2 };
    s.emblems = 0;
    expect(sellExt(s, ext(19, 3))).toBe(6);
    expect(s.equip).toEqual([]);
    expect(s.stack[19]).toBeUndefined();
    expect(s.extGrow[ext(19, 3)]).toBeUndefined();
    // 「買値で売れる」は払ったエンブレム（重ねた品で得をしない）
    s.equip = [ext(19, 5)];
    s.stack = { 19: { p: 10, paid: 30 } };
    expect(sellPrice(s, ext(19, 5), true)).toBe(30);
  });
  it('枠が減ってはみ出した品は、右から売る', () => {
    const s = fresh();
    s.equip = [ext(1), ext(2), ext(3), ext(5)];
    s.emblems = 0;
    expect(fitSlots(s, 3)).toEqual([ext(5)]);
    expect(s.equip).toEqual([ext(1), ext(2), ext(3)]);
    expect(s.emblems).toBe(1);
  });
  it('古いセーブ：装備していない持ち物は売値ぶんのエンブレムで返し、同じシリーズの装備は重ねる', () => {
    const s = fresh() as Save & { owned?: number[] };
    s.owned = [ext(1, 2), ext(2, 4), ext(9, 3), ext(9, 1)];
    s.equip = [ext(1, 2), ext(9, 3), ext(9, 1)];
    s.emblems = 0;
    const back = migrateInventory(s);
    expect(back).toBe(11); // ★4 の売値
    expect(s.owned).toBeUndefined();
    expect(s.equip).toEqual([ext(1, 2), ext(9, 3)]);
    expect(ptsOf(s, ext(9, 3))).toBe(4);
    expect(s.emblems).toBe(11);
  });
});

describe('装備の枠を広げる品', () => {
  it('そろいの衣装・空き枠のお守り：装備している間、枠が増える（自分の枠をふくむ。★で 1・2・2・3・4）', () => {
    expect(SLOT_VALS).toEqual([1, 2, 2, 3, 4]);
    for (const sr of [173, 174]) expect(extDef({ id: sr })?.mod?.key).toBe('extSlot');
    const s = fresh();
    expect(slotsOf(s).ext).toBe(3);
    s.equip = [ext(174, 5)];
    expect(slotsOf(s).ext).toBe(7);
    s.equip = [ext(174, 3), ext(173, 4)];
    expect(slotsOf(s).ext).toBe(8); // 上限 8
    // 枠を広げる品を売ると、はみ出した品も売られる
    s.equip = [ext(174, 5), ext(1), ext(2), ext(3), ext(5), ext(9)];
    sellExt(s, ext(174, 5));
    fixParty(s);
    expect(s.equip).toEqual([ext(1), ext(2), ext(3)]);
  });
  it('Limited の枠と足し合わせ', () => {
    const s = fresh();
    s.limited = [5502];
    s.equip = [ext(173, 2)];
    expect(slotsOf(s).ext).toBe(3 + 1 + 2);
    expect(totalsOf(s.equip, s.limited).extSlot).toBe(3);
  });
});

describe('マレットのレベル（基礎ポイント）', () => {
  it('エンブレムで鍛える。値段はレベルとともに上がり、基礎ポイントも伸びる', () => {
    const s = fresh();
    expect(malletLv(s)).toBe(1);
    expect(malletPts(1)).toBe(1);
    for (let l = 2; l <= MALLET_MAX; l += 1) {
      expect(MALLET_PTS[l - 1]).toBeGreaterThan(MALLET_PTS[l - 2]);
      expect(malletPrice(l)).toBeGreaterThan(malletPrice(l - 1));
    }
    s.emblems = malletPrice(1) - 1;
    expect(buyMallet(s)).toBe(false);
    s.emblems = 100;
    expect(buyMallet(s)).toBe(true);
    expect(malletLv(s)).toBe(2);
    expect(s.emblems).toBe(100 - malletPrice(1));
    s.quota.mallet = MALLET_MAX;
    expect(buyMallet(s)).toBe(false);
  });
  it('全部の球の GUM の基本額と、+基本額の単位（的 1 体ぶん）に掛かる', () => {
    const s = fresh();
    const w = new PinballWorld(s, { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} } as never);
    w.startRun(1);
    const g1 = w.gumMul;
    const u1 = w.playStats().unit;
    s.quota.mallet = 5;
    expect(w.gumMul).toBeCloseTo(g1 * malletPts(5));
    expect(w.playStats().unit).toBeCloseTo(enemyGum(1, 0) * malletPts(5));
    expect(u1).toBeCloseTo(enemyGum(1, 0));
  });
  it('挑戦の間だけ：GAME OVER で Lv 1 に戻る', () => {
    const s = fresh();
    s.quota.mallet = 7;
    resetChallenge(s);
    expect(malletLv(s)).toBe(1);
  });
});

describe('スキル「仕入れの目利き」', () => {
  it('黄の枝にあり、値段はエンブレム。段が上がるほど、装備と同じシリーズがショップに並びやすい', () => {
    const sk = SKILL_MAP.y_stock;
    expect(sk.branch).toBe('yellow');
    expect(sk.max).toBe(5);
    expect(skillCost(sk, 0)).toBeGreaterThanOrEqual(1);
    expect(stats({ y_stock: 3 }, cat.heroes[0], 0).stock).toBe(3);
    const equip = [ext(9), ext(5), ext(21)];
    const count = (stock: number): number => {
      const rnd = seeded(11);
      let k = 0;
      for (let i = 0; i < 300; i += 1) for (const id of rollShop(1, 6, rnd, { quota: 3, equip, stock })) if (equip.some((e) => e % 1000 === id % 1000)) k += 1;
      return k;
    };
    const c0 = count(0);
    const c5 = count(5);
    expect(c5).toBeGreaterThan(c0 * 2);
  });
  it('ショップの品ぞろえに効く（restockShop）', () => {
    const s = fresh();
    s.equip = [ext(9), ext(5), ext(21)];
    s.quota.n = 3;
    const n = (lv: number): number => {
      s.up = { y_stock: lv };
      const rnd = seeded(5);
      let k = 0;
      for (let i = 0; i < 200; i += 1) { restockShop(s, true, rnd); k += s.shop.filter((id) => s.equip.some((e) => e % 1000 === id % 1000)).length; }
      return k;
    };
    expect(n(5)).toBeGreaterThan(n(0) * 2);
  });
});
