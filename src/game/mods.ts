// 台の改造（エクステンション）：ショップでエンブレムを払って買い、枠（3〜5）に装備するもの（プレイごとに付け替え・売却できる）と、
// ノルマを納めるたびに選ぶ Limited シリーズ（ID 5501 以降。挑戦の間は外せない。GAME OVER で失う）。
//
// エクステンションの効果はどれもスコアにつながる（exts.ts）。プレイのあとの発表で、装備の並び順（左から）に掛かる。
// 一部の品は台の動きも変える改造（磁石・塗料・柵・予備のセーブなど）を持ち、その値は ModTotals に足し合わせて PinballWorld が読む。
// Limited の効き目も ModTotals に足し合わせる。

import { cat, type Ext, type ItemKind, type LimitedArt } from '../core/catalog';
import type { Elem } from './elements';
import { extDef, FAMILY_INFO } from './exts';
import { limitedOf } from './limiteds';
import type { ToyId } from './toys';

/** ショップのエクステンションの値段（エンブレム）：★1〜★5。売値は半分（切り捨て） */
export const EXT_PRICE = [3, 4, 5, 6, 8];
export const extPrice = (rarity: number): number => EXT_PRICE[Math.max(1, Math.min(5, rarity)) - 1];
export const extSell = (rarity: number): number => Math.floor(extPrice(rarity) / 2);

export interface ModTotals {
  /** 的への攻撃 +割合 */
  atkPct: number;
  /** GUM +割合 */
  gumPct: number;
  /** 攻撃の色ごとの GUM +割合 */
  colorGum: Record<Elem, number>;
  /** バンパーの GUM ×(1+v) */
  bumperGum: number;
  /** 当たった的を、いまの攻撃の色の弱点に塗る確率 */
  paint: number;
  /** アウトレーンに落ちかけた球を柵がはじき返す確率 */
  fence: number;
  /** ボールセーブがもう一度きく回数（1 プレイ） */
  spareSave: number;
  /** ランプを続けて通したときの伸び ×(1+v) */
  rampAmp: number;
  /** 球を的へ寄せる強さ */
  magnet: number;
  /** 球が落ちたとき、そのプレイで稼いだ GUM から戻る割合 */
  insurance: number;
  /** キックバックが点き直すまでを短く（割合） */
  kickRelit: number;
  /** 連鎖が切れるまでの猶予 +秒 */
  comboCore: number;
  /** ピラミッドの入口の引力 ×(1+v) */
  gatePull: number;
  /** ループ 1 回ごとの GUM 倍率 +v（その台の間） */
  loopAmp: number;
  /** 通り道のライトのごほうび ×(1+v) */
  lightPay: number;
  /** 下のフリッパーの長さ +割合 */
  flipperLen: number;
  /** ブースターの速さ +割合 */
  boosterMul: number;
  /** 1 プレイの時間 +秒 */
  extraTime: number;
  /** ピラミッドの時間 +秒 */
  pyramidTime: number;
  /** 台に入ったとき G が点いた状態で始まる */
  startLane: number;
  /** ZONE の間、バンパーから雷 */
  zoneShock: number;
  /** ショップの品数 +v */
  shopSlots: number;
  /** ボスへの攻撃 +割合 */
  bossAtk: number;
  /** ワープを通るたびの GUM */
  warpGum: number;
  /** 台に入ってから 8 秒の GUM +割合 */
  dawnGum: number;
  /** 坂の上のフリッパーの長さ +割合 */
  upperFlipLen: number;
  /** 青（振り）の波の広さ +割合 */
  waveMul: number;
  /** 緑（貫通）の攻撃 +割合 */
  greenAtk: number;
  /** 的を倒すと衝撃波 */
  killWave: number;
  /** キックバックで打ち戻した球が緑の貫通 */
  kickGreen: number;
  /** ボスを倒したときの GUM +割合 */
  bossGum: number;
  /** 台ゆらしの勢い +割合 */
  rockMul: number;
  /** ミステリーで GUM の雨が出る確率 */
  mysteryLuck: number;
  /** スピナーの GUM +割合 */
  spinGum: number;
  /** 連鎖が 10 の倍数に届くたびの GUM */
  comboTen: number;
  /** スリングショットの GUM +割合 */
  slingGum: number;
  /** ボールセーブ +秒 */
  saveSec: number;
  /** ZONE の間、時間の減り −割合 */
  zoneSlow: number;
  /** 台の最初の的を倒したときの GUM */
  firstKill: number;
  /** ブラックホールの間隔 −割合 */
  holeEvery: number;
  /** フリッパーで打ち返す勢い +割合 */
  flipPower: number;
  /** ワープから出る速さ +割合 */
  warpSpeed: number;
  /** 1 プレイに 1 回、柵がかならずはじき返す */
  fenceOnce: number;
  /** 仲間の球の攻撃 +割合 */
  mateAtk: number;
  /** マルチボールに必要なロック −回 */
  lockLess: number;
  /** バンパーではじく力 +割合 */
  bumperPower: number;
  /** 会心（攻撃 3 倍）の確率 */
  crit: number;
  /** ボスの体力 −割合 */
  bossHp: number;
  /** ゴーストスターの間隔 −割合（分身 +1） */
  starEvery: number;
  /** ライトを灯すたびの GUM */
  pipGum: number;
  /** インレーンの GUM ×(1+2v) */
  inlaneGum: number;
  /** ボスの動き −割合 */
  bossSlow: number;
  /** ヒーローの能力 +割合 */
  abilityPct: number;
  /** マルチボール中のレーザー */
  laser: number;
  /** G・U・M を全部点けたときの倍率の上がり方 +v */
  laneMul: number;
  /** プレイの終わりに、そのプレイの GUM +割合 */
  souvenir: number;
  /** プレイごとのエンブレム +v */
  emblemPlay: number;
  /** G-U-M の大当たりのたびにエンブレム +1（1 プレイ 2 まで） */
  emblemLane: number;
  /** 納品のごほうびのエンブレム +v */
  emblemQuota: number;
  /** リーダーの能力が 2 回発動する */
  leaderTwice: number;
  /** エクステンションの枠 +v・ヒーローの枠 +v */
  extSlot: number;
  heroSlot: number;
  /** G-U-M の大当たりの GUM +割合 */
  laneJackpot: number;
  /** エクステンションとギミックの値段 −v（最低 1） */
  shopDiscount: number;
  /** ヒートの印の倍率 ×(1+v) */
  heatAmp: number;
  /** 壊れものが壊れる確率 +v・壊れものの効果 ×(1+v) */
  fragileAdd: number;
  fragilePow: number;
  /** 壊れものが壊れたとき直る回数（挑戦の間）・壊れるたびのエンブレム・すべての装備が壊れもの（確率） */
  fragileRepair: number;
  fragileEmblem: number;
  allFragile: number;
  /** エクステンションの効果の上乗せ分 ×(1+v)：ぜんぶ・×倍率の品・+倍率の品 */
  extPow: number;
  extXPow: number;
  extMultPow: number;
  /** いちばん左・右の品が 2 回／発動しない */
  leftTwice: number;
  rightTwice: number;
  leftOff: number;
  rightOff: number;
  /** 育ちの速さ ×(1+v) */
  growPow: number;
  /** ショップの品ぞろえを v ノルマ先に（★の高い品が並びやすい） */
  shopAhead: number;
  /** 引き直しができない・いつも 10 GUM・値段 ×2 */
  rerollOff: number;
  rerollFixed: number;
  rerollPow: number;
  /** エクステンションを買値で売れる */
  sellFull: number;
  /** 呪いの穴の数（入ると球が消える） */
  curse: number;
  /** ボールセーブがきかない・キックバックがない・坂が重い（+割合） */
  noSave: number;
  kickOff: number;
  slope: number;
  /** 球を落としても G-U-M の倍率が戻らない */
  dropKeep: number;
  /** マルチボールの球 +v・マルチボールの間の GUM ×(1+v) */
  multiBalls: number;
  multiGum: number;
  /** 控えのヒーローの能力が効かない */
  mateOff: number;
  /** プレイの GUM の条件つきの倍率：ボスを倒した ×(1+v)・全部は落とさなかった ×(1+v)・全部落とした ×(1−v)・3 プレイ目 ×(1+v)・それ以外 ×(1−v) */
  bossPlayX: number;
  noDrainX: number;
  drainX: number;
  lastPlayX: number;
  otherPlayX: number;
}

export function emptyTotals(): ModTotals {
  return {
    atkPct: 0, gumPct: 0, colorGum: { red: 0, blue: 0, green: 0 }, bumperGum: 0, paint: 0, fence: 0, spareSave: 0, rampAmp: 0,
    magnet: 0, insurance: 0, kickRelit: 0, comboCore: 0, gatePull: 0, loopAmp: 0, lightPay: 0, flipperLen: 0, boosterMul: 0,
    extraTime: 0, pyramidTime: 0, startLane: 0, zoneShock: 0, shopSlots: 0,
    bossAtk: 0, warpGum: 0, dawnGum: 0, upperFlipLen: 0, waveMul: 0, greenAtk: 0, killWave: 0, kickGreen: 0, bossGum: 0, rockMul: 0, mysteryLuck: 0, spinGum: 0, comboTen: 0, slingGum: 0, saveSec: 0, zoneSlow: 0, firstKill: 0, holeEvery: 0, flipPower: 0, warpSpeed: 0, fenceOnce: 0, mateAtk: 0, lockLess: 0, bumperPower: 0, crit: 0, bossHp: 0, starEvery: 0, pipGum: 0, inlaneGum: 0, bossSlow: 0, abilityPct: 0, laser: 0, laneMul: 0, souvenir: 0,
    emblemPlay: 0, emblemLane: 0, emblemQuota: 0, leaderTwice: 0, extSlot: 0, heroSlot: 0, laneJackpot: 0, shopDiscount: 0, heatAmp: 0, fragileAdd: 0, fragilePow: 0,
    fragileRepair: 0, fragileEmblem: 0, allFragile: 0, extPow: 0, extXPow: 0, extMultPow: 0, leftTwice: 0, rightTwice: 0, leftOff: 0, rightOff: 0, growPow: 0,
    shopAhead: 0, rerollOff: 0, rerollFixed: 0, rerollPow: 0, sellFull: 0, curse: 0, noSave: 0, kickOff: 0, slope: 0, dropKeep: 0, multiBalls: 0, multiGum: 0, mateOff: 0,
    bossPlayX: 0, noDrainX: 0, drainX: 0, lastPlayX: 0, otherPlayX: 0,
  };
}
type NumKey = Exclude<keyof ModTotals, 'colorGum'>;

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const sec = (v: number): string => `${Math.round(v * 10) / 10} 秒`;

// ------------------------------------------------------------------ エクステンション（効果は exts.ts）
export { extDef, extName, extText, extVal, KIND_TAG, FAMILY_INFO, type ExtDef, type Family } from './exts';

/** エクステンションの台の改造の値（★で決まる。改造を持たない品は null） */
export function extMod(e: Ext): { key: NumKey; v: number } | null {
  const d = extDef(e);
  if (!d?.mod) return null;
  return { key: d.mod.key as NumKey, v: d.mod.vals[Math.max(1, Math.min(5, e.rarity)) - 1] };
}

// ------------------------------------------------------------------ Limited シリーズ（効き目は limiteds.ts）
export { LIMITED_FIXED, LIM_TYPE, hasOwnEffect, limitedOf, type LimitedDef, type LimType } from './limiteds';
export const limitedById = (id: number): LimitedArt | undefined => cat.limited.find((l) => l.id === id);

// ------------------------------------------------------------------ 足し合わせ
export function totalsOf(equip: number[], limited: number[]): ModTotals {
  const t = emptyTotals();
  const add = (k: NumKey, v: number) => { t[k] += v; };
  for (const id of equip) {
    const e = cat.exts.find((x) => x.id === id);
    if (!e) continue;
    const m = extMod(e);
    if (m) add(m.key, m.v);
  }
  for (const id of limited) {
    const d = limitedOf(id);
    for (const [k, v] of Object.entries(d.add ?? {})) {
      if (k === 'color') { const [c, n] = v as [Elem, number]; t.colorGum[c] += n; } else add(k as NumKey, v as number);
    }
  }
  // 上限（強くなりすぎないように）
  t.paint = Math.min(1, t.paint);
  t.fence = Math.min(0.6, t.fence);
  t.insurance = Math.min(0.3, t.insurance);
  t.kickRelit = Math.min(0.8, t.kickRelit);
  t.flipperLen = Math.max(-0.2, Math.min(0.16, t.flipperLen));
  t.extraTime = Math.max(-12, t.extraTime);
  t.comboCore = Math.max(-0.6, t.comboCore);
  t.zoneSlow = Math.min(1, t.zoneSlow);
  t.curse = Math.min(4, t.curse);
  return t;
}

/** 装備の枠のいちばん多い数（ショップで広げられるのは SLOTS_MAX まで。Limited でさらに 1 つ） */
export const SLOTS_CAP = 6;
/** いまの装備の枠：ショップで広げた枠 ＋ Limited の枠 */
export function slotsOf(save: { extSlots: number; heroSlots: number; limited: number[] }): { ext: number; hero: number } {
  const t = totalsOf([], save.limited ?? []);
  return { ext: Math.min(SLOTS_CAP, save.extSlots + t.extSlot), hero: Math.min(SLOTS_CAP, save.heroSlots + t.heroSlot) };
}

// ------------------------------------------------------------------ ショップ
/** 装備の枠のいちばん多い数（はじめは 3。ショップでエンブレムを払って広げる：save.extSlots） */
export const EQUIP_SLOTS = 5;
export const SHOP_BASE = 6;
/** 値段：★で決まるエンブレム（EXT_PRICE）。discount は「値切りの巻物」など（最低 1） */
export function priceOf(e: Ext, discount = 0): number {
  return Math.max(1, extPrice(e.rarity) - discount);
}
/** 売値：★で決まる買値の半分（切り捨て）。full なら買値（Limited「悪魔商人」） */
export const sellOf = (e: Ext, full = false): number => (full ? extPrice(e.rarity) : extSell(e.rarity));
/** この品に要る仕掛け（持っていないと効かない） */
export const needsToy = (e: Ext): ToyId | null => extDef(e)?.toy ?? null;
/** 系統の評価（S＝ビルドの軸）ごとの出やすさ */
const TIER_WEIGHT = { S: 0.8, A: 1, B: 1.15 };
/** ★ごとに並びはじめるノルマ（または台）：★2 はノルマ 2（TABLE 2）、★3 は 4（5）、★4 は 6（10）、★5 は 8（20） */
export const RARITY_QUOTA = [1, 2, 4, 6, 8];
export const RARITY_TABLE = [1, 2, 5, 10, 20];
/** 品ぞろえ：★が高いものは、ノルマが進むほど（台が先へ進むほど）出やすい。quota はいまのノルマ */
export function rollShop(deepest: number, n: number, rnd: () => number = Math.random, avoid: number[] = [], quota = 1, toys: ToyId[] = [], ahead = 0): number[] {
  quota += ahead;
  const wr = (r: number): number => {
    const byTable = deepest - RARITY_TABLE[r - 1];
    const byQuota = (quota - RARITY_QUOTA[r - 1]) * 3;
    const over = Math.max(byTable, byQuota);
    if (over < 0) return 0;
    return [10, 6, 4, 2.2, 1][r - 1] * (1 + Math.min(1, over / 20));
  };
  // 持っていない仕掛けに結びつく品は出にくい（でも並ぶ：先を見て買える）
  const w = (e: Ext): number => {
    const d = extDef(e);
    const toy = d?.toy && !toys.includes(d.toy) ? 0.35 : 1;
    return wr(e.rarity) * toy * (d ? TIER_WEIGHT[FAMILY_INFO[d.fam].tier] : 1);
  };
  const pool = cat.exts.filter((e) => !avoid.includes(e.id) && wr(e.rarity) > 0);
  const out: number[] = [];
  for (let k = 0; k < n && pool.length; k += 1) {
    const total = pool.reduce((a, e) => a + w(e), 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i += 1) { r -= w(pool[i]); if (r <= 0) break; }
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}

/** Limited の候補：まだ持っていないものから n 枚 */
export function rollLimited(owned: number[], n: number, rnd: () => number = Math.random): number[] {
  const pool = cat.limited.map((l) => l.id).filter((id) => !owned.includes(id));
  const out: number[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
/** 部品（parts.ts）と出どころの対応（解説モードで、その部品に効くエクステンションを引く） */
const PART_SRC: Record<string, string[]> = {
  bumper: ['bumper'], sling: ['sling'], spinner: ['spin'], lanes: ['lane', 'gumlane'], ramp: ['ramp'], loop: ['loop'], jackpot: ['jackpot'],
  lights: ['light'], warp: ['warp'], mystery: ['mystery'], targets: ['enemy'], hammer: ['hammer'], hyperloop: ['hyperloop'], castle: ['castle'],
  face: ['face'], crane: ['crane'], captive: ['captive'], popup: ['popup'], mini: ['mini'], dino: ['dino'], ufo: ['ufo'], moai: ['moai'],
};
/** その部品に付けられる改造：効くエクステンションの効果の名前と、Limited の品 */
export function modsForPart(part: string): { shop: string[]; limited: number[] } {
  const shop: string[] = [];
  const srcs = PART_SRC[part] ?? [];
  for (const e of cat.exts) {
    const d = extDef(e);
    if (!d || shop.includes(d.name)) continue;
    if (d.toy === part || (d.src && srcs.includes(d.src)) || (d.heat && srcs.includes(d.heat))) shop.push(d.name);
  }
  const limited = cat.limited.map((l) => l.id).filter((id) => limitedOf(id).part === part);
  return { shop, limited };
}
