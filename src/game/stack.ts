// エクステンションの重ねと持ち物（ユーザーの指定）。
//
// - 持てるのは装備の枠の分だけ（持つ＝効く）。持ち物の一覧はない。枠がいっぱいのときは、入れかえる品を売るか、同じシリーズに重ねる。
// - レアリティはコモン（★1）・アンコモン（★2）・レア（★3）・エピック（★4）・レジェンダリー（★5）。点は 1・2・3・5・10。
// - 同じシリーズの品を買うと、装備している品に重なり、点が合計される。合計の点でレアリティが決まる（RARITY_PTS のしきい）。
//   しきいの間の余りは「★のゲージ」に残る。レジェンダリー（10 点）で止まり、あふれた点は 1 点ごとにエンブレム OVERFLOW_EMBLEM に換える。
// - MCH のエクステンションは千の位が★（1009 → 2009 → … → 5009）で、★ごとに名前と絵が違う。レアリティが上がると、装備の品の ID も上の★の品に変わる。
// - 点と払ったエンブレムは、シリーズごとに save.stack に持つ（GAME OVER で消える）。
// 画面は src/ui/home.ts（ショップ）と src/ui/levelup.ts（進化の演出）。

import { cat, type Ext } from '../core/catalog';
import type { Save } from '../core/save';

/** レアリティ（★1〜★5）ごとの点 */
export const RARITY_PTS = [1, 2, 3, 5, 10];
/** 点のいちばん多い数（レジェンダリー） */
export const PTS_MAX = RARITY_PTS[RARITY_PTS.length - 1];
/** レジェンダリーからあふれた点 1 つごとのエンブレム */
export const OVERFLOW_EMBLEM = 1;
export const RARITY_NAME = ['コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];

/**
 * ショップのエクステンションの値段（エンブレム）：★1〜★5。
 * 点あたりの値段がレアリティとともに上がる（3・3.5・4・4.4・5）ので、安い品を重ねて上げたほうが得
 */
export const EXT_PRICE = [3, 7, 12, 22, 50];
export const extPrice = (rarity: number): number => EXT_PRICE[clampR(rarity) - 1];
/** 売値：いまのレアリティの買値の半分（切り捨て） */
export const extSell = (rarity: number): number => Math.floor(extPrice(rarity) / 2);

const clampR = (r: number): number => Math.max(1, Math.min(5, Math.round(r)));
export const seriesOf = (id: number): number => id % 1000;
export const rarityOfId = (id: number): number => clampR(Math.floor(id / 1000));
export const idFor = (series: number, rarity: number): number => clampR(rarity) * 1000 + series;
const extById = (id: number): Ext | undefined => cat.exts.find((e) => e.id === id);

/** 点からレアリティ（1→コモン、2→アンコモン、3〜4→レア、5〜9→エピック、10→レジェンダリー） */
export function rarityOfPts(p: number): number {
  let r = 1;
  RARITY_PTS.forEach((g, i) => { if (p >= g) r = i + 1; });
  return r;
}
/** ★のゲージ：いまのレアリティのしきい（lo）・次のしきい（hi。レジェンダリーなら null）・次まであと何点 */
export function gaugeOf(p: number): { r: number; lo: number; hi: number | null; need: number; frac: number } {
  const r = rarityOfPts(p);
  const lo = RARITY_PTS[r - 1];
  const hi = r >= 5 ? null : RARITY_PTS[r];
  return { r, lo, hi, need: hi === null ? 0 : hi - p, frac: hi === null ? 1 : (p - lo) / (hi - lo) };
}

/** シリーズごとの点と払ったエンブレム */
export interface StackEntry { p: number; paid: number }
/** 装備の品の点（記録がなければ、その★の点） */
export function ptsOf(save: Save, id: number): number {
  const s = save.stack?.[seriesOf(id)];
  return s ? s.p : RARITY_PTS[rarityOfId(id) - 1];
}
/** 装備の品に払ったエンブレム（記録がなければ、その★の買値） */
export function paidOf(save: Save, id: number): number {
  return save.stack?.[seriesOf(id)]?.paid ?? extPrice(rarityOfId(id));
}
/** 装備のうち、同じシリーズの品（重ねる先） */
export function stackTarget(save: Save, cardId: number): number | null {
  return save.equip.find((id) => seriesOf(id) === seriesOf(cardId)) ?? null;
}

export interface StackPreview {
  /** 重ねる先（装備の品）と、重ねたあとの品 */
  from: number;
  to: number;
  /** 重ねたあとの点・足す点・あふれる点（エンブレムに換わる） */
  pts: number;
  add: number;
  overflow: number;
  /** レアリティが上がる */
  evolve: boolean;
}
/** この札を買ったら、どう重なるか（重ねる先がなければ null） */
export function stackPreview(save: Save, cardId: number): StackPreview | null {
  const from = stackTarget(save, cardId);
  if (from === null) return null;
  const add = RARITY_PTS[rarityOfId(cardId) - 1];
  const before = ptsOf(save, from);
  const raw = before + add;
  const pts = Math.min(PTS_MAX, raw);
  const to = idFor(seriesOf(from), rarityOfPts(pts));
  return { from, to, pts, add, overflow: raw - pts, evolve: rarityOfPts(pts) > rarityOfPts(before) };
}

/** 装備の品の ID を入れかえる（育ちの記録も移す。図鑑にも載せる） */
function swapId(save: Save, from: number, to: number): void {
  if (from === to) return;
  save.equip = save.equip.map((x) => (x === from ? to : x));
  if (save.extGrow?.[from] !== undefined) { save.extGrow[to] = save.extGrow[from]; delete save.extGrow[from]; }
  if (!save.exts.includes(to)) save.exts.push(to);
}
/**
 * 装備の品に点を足す（あふれた点はエンブレムに換える）。レアリティが上がれば上の★の品に変わる。
 * paid は払ったエンブレム（売値の記録）
 */
export function addPts(save: Save, id: number, add: number, paid = 0): StackPreview {
  const before = ptsOf(save, id);
  const raw = before + add;
  const pts = Math.min(PTS_MAX, Math.max(1, raw));
  const to = idFor(seriesOf(id), rarityOfPts(pts));
  save.stack ??= {};
  save.stack[seriesOf(id)] = { p: pts, paid: paidOf(save, id) + paid };
  swapId(save, id, to);
  const overflow = Math.max(0, raw - pts);
  save.emblems += overflow * OVERFLOW_EMBLEM;
  return { from: id, to, pts, add, overflow, evolve: rarityOfPts(pts) > rarityOfPts(before) };
}
/** ★ +1：次のレアリティのしきいまで点を足す（Limited。レジェンダリーはそのまま） */
export function rankUp(save: Save, id: number): number | null {
  const g = gaugeOf(ptsOf(save, id));
  if (g.hi === null) return null;
  return addPts(save, id, g.hi - ptsOf(save, id)).to;
}

/** 装備の品を手放す（売る・壊れる）：点と育ちも消える */
export function dropExt(save: Save, id: number): void {
  save.equip = save.equip.filter((x) => x !== id);
  if (save.extGrow) delete save.extGrow[id];
  if (save.stack) delete save.stack[seriesOf(id)];
}
/** 売値（full なら払ったエンブレムをそのまま：Limited「悪魔商人」） */
export function sellPrice(save: Save, id: number, full = false): number {
  return full ? paidOf(save, id) : extSell(rarityOfId(id));
}
/** 売る：エンブレムを受け取り、装備から消える */
export function sellExt(save: Save, id: number, full = false): number {
  if (!save.equip.includes(id)) return 0;
  const v = sellPrice(save, id, full);
  dropExt(save, id);
  save.emblems += v;
  return v;
}

export type BuyResult =
  | { ok: true; kind: 'stack'; id: number; stack: StackPreview }
  | { ok: true; kind: 'new'; id: number; sold?: { id: number; emblems: number } }
  | { ok: false; why: 'poor' | 'full' | 'gone' };
/**
 * 札を買う。同じシリーズを装備していれば重ねる（枠は要らない）。
 * そうでなければ空き枠に装備する。枠がいっぱいなら replace（売って入れかえる品）が要る
 */
export function buyExt(save: Save, cardId: number, o: { price: number; slots: number; replace?: number; full?: boolean }): BuyResult {
  const e = extById(cardId);
  if (!e) return { ok: false, why: 'gone' };
  const target = stackTarget(save, cardId);
  // 入れかえで手に入る売値も足して払えるか
  const sellBack = target === null && o.replace !== undefined && save.equip.includes(o.replace) ? sellPrice(save, o.replace, o.full) : 0;
  if (save.emblems + sellBack < o.price) return { ok: false, why: 'poor' };
  if (target !== null) {
    save.emblems -= o.price;
    const st = addPts(save, target, RARITY_PTS[e.rarity - 1], o.price);
    return { ok: true, kind: 'stack', id: st.to, stack: st };
  }
  let sold: { id: number; emblems: number } | undefined;
  if (save.equip.length >= o.slots) {
    if (o.replace === undefined || !save.equip.includes(o.replace)) return { ok: false, why: 'full' };
    const at = save.equip.indexOf(o.replace);
    sold = { id: o.replace, emblems: sellExt(save, o.replace, o.full) };
    save.emblems -= o.price;
    save.equip.splice(at, 0, cardId);
  } else {
    save.emblems -= o.price;
    save.equip.push(cardId);
  }
  save.stack ??= {};
  save.stack[e.id % 1000] = { p: RARITY_PTS[e.rarity - 1], paid: o.price };
  if (!save.exts.includes(cardId)) save.exts.push(cardId);
  return { ok: true, kind: 'new', id: cardId, sold };
}

/**
 * 枠が減って装備がはみ出したら、右から売る（壊れもの・枠を広げる品を売ったとき）。売った品の ID を返す
 */
export function fitSlots(save: Save, slots: number, full = false): number[] {
  const sold: number[] = [];
  while (save.equip.length > Math.max(0, slots)) {
    const id = save.equip[save.equip.length - 1];
    sellExt(save, id, full);
    sold.push(id);
  }
  return sold;
}

/**
 * 古いセーブ（持ち物の一覧があったころ）を移す：装備していない品は売値ぶんのエンブレムにして返す。
 * 装備に同じシリーズが 2 つ以上あれば、点を合計して 1 つに重ねる。返したエンブレムを返す
 */
export function migrateInventory(save: Save & { owned?: number[] }): number {
  let refund = 0;
  const owned = save.owned ?? [];
  for (const id of owned) if (!save.equip.includes(id)) refund += extSell(rarityOfId(id));
  delete save.owned;
  const seen = new Map<number, number>();
  const out: number[] = [];
  save.stack ??= {};
  for (const id of save.equip) {
    const s = seriesOf(id);
    const pts = RARITY_PTS[rarityOfId(id) - 1];
    const prev = seen.get(s);
    if (prev === undefined) {
      seen.set(s, out.length);
      out.push(id);
      save.stack[s] = save.stack[s] ?? { p: pts, paid: extPrice(rarityOfId(id)) };
    } else {
      const raw = save.stack[s].p + pts;
      const p = Math.min(PTS_MAX, raw);
      refund += (raw - p) * OVERFLOW_EMBLEM;
      save.stack[s] = { p, paid: save.stack[s].paid + extPrice(rarityOfId(id)) };
      const old = out[prev];
      const to = idFor(s, rarityOfPts(p));
      if (save.extGrow) {
        const g = Math.max(save.extGrow[old] ?? 0, save.extGrow[id] ?? 0);
        delete save.extGrow[old];
        delete save.extGrow[id];
        if (g) save.extGrow[to] = g;
      }
      out[prev] = to;
    }
  }
  save.equip = out;
  save.emblems += refund;
  return refund;
}
