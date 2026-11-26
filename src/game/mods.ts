// 台の改造（エクステンション）：ショップで買って 5 つまで装備するもの（プレイごとに付け替え・売却できる）と、
// 台を突破するたびに選ぶ Limited シリーズ（ID 5501 以降。永続で外せない）。
//
// どちらも効き目は ModTotals に足し合わせ、PinballWorld がその数字を読む。
// ショップのエクステンションは種類（攻撃力・GUM・磁石・加速・衝撃波・巨大化）ごとに改造の系統が決まり、★で強さが決まる。
// 同じ名前のエクステンションは、いつも同じ改造になる。

import { cat, type Ext, type ItemKind, type LimitedArt } from '../core/catalog';
import type { Elem } from './elements';
import { enemyGum } from './economy';

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
}

export function emptyTotals(): ModTotals {
  return {
    atkPct: 0, gumPct: 0, colorGum: { red: 0, blue: 0, green: 0 }, bumperGum: 0, paint: 0, fence: 0, spareSave: 0, rampAmp: 0,
    magnet: 0, insurance: 0, kickRelit: 0, comboCore: 0, gatePull: 0, loopAmp: 0, lightPay: 0, flipperLen: 0, boosterMul: 0,
    extraTime: 0, pyramidTime: 0, startLane: 0, zoneShock: 0, shopSlots: 0,
    bossAtk: 0, warpGum: 0, dawnGum: 0, upperFlipLen: 0, waveMul: 0, greenAtk: 0, killWave: 0, kickGreen: 0, bossGum: 0, rockMul: 0, mysteryLuck: 0, spinGum: 0, comboTen: 0, slingGum: 0, saveSec: 0, zoneSlow: 0, firstKill: 0, holeEvery: 0, flipPower: 0, warpSpeed: 0, fenceOnce: 0, mateAtk: 0, lockLess: 0, bumperPower: 0, crit: 0, bossHp: 0, starEvery: 0, pipGum: 0, inlaneGum: 0, bossSlow: 0, abilityPct: 0, laser: 0, laneMul: 0, souvenir: 0,
  };
}
type NumKey = Exclude<keyof ModTotals, 'colorGum'>;

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const sec = (v: number): string => `${Math.round(v * 10) / 10} 秒`;

/** ショップのエクステンションの改造 */
export interface ModDef {
  key: NumKey;
  name: string;
  /** 付く部品（parts.ts の id） */
  part: string;
  /** ★1 と ★5 の強さ */
  lo: number;
  hi: number;
  text: (v: number) => string;
  /** 整数の効き目（回数） */
  int?: boolean;
}
export const MOD_KIND: Record<ItemKind, ModDef[]> = {
  atk: [
    { key: 'paint', name: '塗料タンク', part: 'targets', lo: 0.25, hi: 1, text: (v) => `球が当たった的を、いまの攻撃の色の弱点に塗る（${pct(v)}）` },
    { key: 'atkPct', name: '強打', part: 'targets', lo: 0.1, hi: 0.5, text: (v) => `的への攻撃 +${pct(v)}` },
  ],
  gum: [
    { key: 'bumperGum', name: '金のバンパー', part: 'bumper', lo: 1, hi: 5, text: (v) => `バンパーの GUM ×${(1 + v).toFixed(1)}` },
    { key: 'insurance', name: '落下保険', part: 'outlane', lo: 0.03, hi: 0.15, text: (v) => `球が落ちると、このプレイで稼いだ GUM の ${pct(v)} が戻る` },
    { key: 'lightPay', name: '光の道の配当', part: 'lights', lo: 1, hi: 5, text: (v) => `通り道のライトを全部灯したごほうび ×${(1 + v).toFixed(1)}` },
  ],
  magnet: [
    { key: 'magnet', name: '磁石ポスト', part: 'targets', lo: 1, hi: 3, text: (v) => `球が近くの的へ少し寄る（強さ ${v.toFixed(1)}）` },
    { key: 'gatePull', name: '入口の引力', part: 'gate', lo: 0.3, hi: 1.2, text: (v) => `ピラミッドの入口が吸い寄せる範囲 ×${(1 + v).toFixed(1)}` },
  ],
  rush: [
    { key: 'rampAmp', name: 'ランプの増幅', part: 'ramp', lo: 0.5, hi: 2, text: (v) => `ランプを続けて通したときの GUM の伸び ×${(1 + v).toFixed(1)}` },
    { key: 'loopAmp', name: 'ループの増幅', part: 'loop', lo: 0.1, hi: 0.5, text: (v) => `ループ 1 回ごとに、その台の GUM +${pct(v)}` },
  ],
  wave: [
    { key: 'kickRelit', name: '再点灯キックバック', part: 'kickback', lo: 0.25, hi: 0.67, text: (v) => `キックバックが点き直すまで −${pct(v)}` },
    { key: 'comboCore', name: '連鎖の芯', part: 'zone', lo: 0.5, hi: 2, text: (v) => `連鎖が切れるまでの猶予 +${sec(v)}` },
  ],
  giant: [
    { key: 'fence', name: 'アウトレーンの柵', part: 'outlane', lo: 0.1, hi: 0.4, text: (v) => `アウトレーンに落ちかけた球を ${pct(v)} ではじき返す` },
    { key: 'spareSave', name: '予備のセーブ', part: 'save', lo: 1, hi: 2, int: true, text: (v) => `ボールセーブが 1 プレイに ${v} 回もどる` },
  ],
};

/** エクステンション → 改造（同じ ID はいつも同じ） */
export function modOf(e: Ext): ModDef {
  const list = MOD_KIND[e.kind];
  return list[(e.id * 7 + Math.floor(e.id / 1000)) % list.length];
}
export function modValue(def: ModDef, rarity: number): number {
  const v = def.lo + ((def.hi - def.lo) * (Math.max(1, Math.min(5, rarity)) - 1)) / 4;
  return def.int ? Math.round(v) : v;
}
export function modText(e: Ext): string {
  const d = modOf(e);
  return d.text(modValue(d, e.rarity));
}

// ------------------------------------------------------------------ Limited シリーズ
export interface LimitedDef {
  /** この品の効き目（足し合わせる値） */
  add: Partial<Record<NumKey, number>> & { color?: [Elem, number] };
  part: string;
  text: string;
}
const L = (part: string, text: string, add: LimitedDef['add']): LimitedDef => ({ part, text, add });
/** 品の姿から決めた、固有の効き目 */
const LIMITED_FIXED: Record<number, LimitedDef> = {
  5501: L('targets', '的への攻撃 +10%', { atkPct: 0.1 }),
  5502: L('targets', '球が近くの的へ少し寄る', { magnet: 0.8 }),
  5503: L('lanes', 'GUM +8%', { gumPct: 0.08 }),
  5504: L('outlane', 'アウトレーンに柵：落ちかけた球を 15% ではじき返す', { fence: 0.15 }),
  5506: L('flipper', '下のフリッパーが 8% 長くなる', { flipperLen: 0.08 }),
  5508: L('lights', '通り道のライトを全部灯したごほうび ×2', { lightPay: 1 }),
  5509: L('zone', '青（振り）の間の GUM +15%', { color: ['blue', 0.15] }),
  5510: L('save', 'ボールセーブが 1 プレイに 1 回もどる', { spareSave: 1 }),
  5530: L('outlane', '球が落ちると、このプレイで稼いだ GUM の 5% が戻る', { insurance: 0.05 }),
  5531: L('booster', 'ブースターの速さ +15%', { boosterMul: 0.15 }),
  5556: L('plunger', '1 プレイが 2 秒のびる', { extraTime: 2 }),
  5561: L('bumper', 'バンパーの GUM ×2', { bumperGum: 1 }),
  5573: L('zone', 'ZONE の間、バンパーから雷が走る', { zoneShock: 1 }),
  5575: L('targets', '緑（引っぱり）の間の GUM +15%', { color: ['green', 0.15] }),
  5598: L('lanes', '台に入ったとき、G が点いた状態で始まる', { startLane: 1 }),
  5600: L('targets', '赤（傾き）の間の GUM +15%', { color: ['red', 0.15] }),
  5611: L('gate', 'ピラミッドの時間が 2 秒のびる', { pyramidTime: 2 }),
  5613: L('zone', '連鎖が切れるまでの猶予 +0.5 秒', { comboCore: 0.5 }),
  5647: L('bumper', 'バンパーの GUM ×2', { bumperGum: 1 }),
  5674: L('plunger', 'ショップの品数 +1', { shopSlots: 1 }),
  5515: L('targets', 'ボスへの攻撃 +25%', { bossAtk: 0.25 }),
  5516: L('warp', 'ワープを通るたびに GUM（旅の記録）', { warpGum: 1 }),
  5517: L('lanes', '台に入ってから 8 秒間、GUM +30%（夜明けの光）', { dawnGum: 0.3 }),
  5518: L('flipper', '坂の上のフリッパーが 12% 長い', { upperFlipLen: 0.12 }),
  5528: L('zone', '青（振り）の波が 25% 広い', { waveMul: 0.25 }),
  5529: L('plunger', '緑（貫通）の攻撃 +30%', { greenAtk: 0.3 }),
  5534: L('targets', '的を倒すと、そこから衝撃波（審判の一撃）', { killWave: 1 }),
  5535: L('kickback', 'キックバックで打ち戻した球が、緑の貫通になる', { kickGreen: 1 }),
  5536: L('targets', 'ボスを倒したときの GUM +50%', { bossGum: 0.5 }),
  5537: L('zone', '振ったときの台ゆらしの勢い +25%', { rockMul: 0.25 }),
  5548: L('mystery', 'ミステリーのホールで、GUM の雨が出やすい', { mysteryLuck: 0.35 }),
  5549: L('spinner', 'スピナーの GUM ×3', { spinGum: 2 }),
  5550: L('zone', '連鎖が 10 の倍数に届くたびに GUM（十の戒め）', { comboTen: 1 }),
  5551: L('sling', 'スリングショットの GUM ×3', { slingGum: 2 }),
  5557: L('save', 'ボールセーブの時間 +2 秒', { saveSec: 2 }),
  5558: L('zone', 'ZONE の間、のこり時間の減りが 30% ゆっくり', { zoneSlow: 0.3 }),
  5559: L('targets', '台で最初に的を倒すと GUM ×5（先陣）', { firstKill: 1 }),
  5574: L('hole', 'ブラックホールが開く間隔 −30%', { holeEvery: 0.3 }),
  5579: L('flipper', 'フリッパーで打ち返す勢い +12%（伸びる棒）', { flipPower: 0.12 }),
  5580: L('warp', 'ワープから出る速さ ×1.5', { warpSpeed: 0.5 }),
  5581: L('outlane', '1 プレイに 1 回、アウトレーンに落ちかけた球を柵がかならずはじき返す', { fenceOnce: 1 }),
  5582: L('multi', 'マルチボールの仲間の球の攻撃 +40%', { mateAtk: 0.4 }),
  5595: L('lock', 'マルチボールに必要なロック −1（最低 1 回）', { lockLess: 1 }),
  5596: L('bumper', 'バンパーではじく力 +15%', { bumperPower: 0.15 }),
  5597: L('targets', '的への攻撃が 10% で会心（3 倍）', { crit: 0.1 }),
  5599: L('targets', 'ボスの体力 −15%', { bossHp: 0.15 }),
  5612: L('star', 'ゴーストスターの間隔 −40%、分身 +1', { starEvery: 0.4 }),
  5624: L('lights', '通り道のライトを灯すたびに少し GUM', { pipGum: 1 }),
  5625: L('inlane', 'インレーンを通るたびの GUM ×3（跳ねる金のカエル）', { inlaneGum: 1 }),
  5626: L('targets', 'ボスの動きが 30% 遅い（凍える）', { bossSlow: 0.3 }),
  5627: L('multi', '装備したヒーローの能力が 15% 強い（ひな壇）', { abilityPct: 0.15 }),
  5630: L('multi', 'マルチボール中、2 秒ごとに上からレーザーが的を撃つ', { laser: 1 }),
  5640: L('lanes', 'G・U・M を全部点けたとき、倍率が 1 つ多く上がる', { laneMul: 1 }),
  5651: L('plunger', 'プレイが終わるとき、そのプレイの GUM +10%（おみやげ）', { souvenir: 0.1 }),
};
/** 新しく素材に Limited が増えたときの予備（いまの 54 個はすべて固有の効き目を持つ） */
const LIMITED_CYCLE: LimitedDef[] = [
  L('targets', '的への攻撃 +6%', { atkPct: 0.06 }),
  L('lanes', 'GUM +5%', { gumPct: 0.05 }),
  L('zone', '連鎖が切れるまでの猶予 +0.25 秒', { comboCore: 0.25 }),
  L('ramp', 'ランプを続けて通したときの GUM の伸び ×1.3', { rampAmp: 0.3 }),
  L('gate', 'ピラミッドの入口が吸い寄せる範囲 ×1.25', { gatePull: 0.25 }),
  L('kickback', 'キックバックが点き直すまで −15%', { kickRelit: 0.15 }),
  L('outlane', '球が落ちると、このプレイで稼いだ GUM の 3% が戻る', { insurance: 0.03 }),
  L('loop', 'ループ 1 回ごとに、その台の GUM +5%', { loopAmp: 0.05 }),
];
/** 品ごとの固有の効き目があるか */
export const hasOwnEffect = (id: number): boolean => !!LIMITED_FIXED[id];
export function limitedOf(id: number): LimitedDef {
  const fixed = LIMITED_FIXED[id];
  if (fixed) return fixed;
  const rest = cat.limited.filter((l) => !LIMITED_FIXED[l.id]).map((l) => l.id);
  const i = Math.max(0, rest.indexOf(id));
  return LIMITED_CYCLE[i % LIMITED_CYCLE.length];
}
export const limitedById = (id: number): LimitedArt | undefined => cat.limited.find((l) => l.id === id);

// ------------------------------------------------------------------ 足し合わせ
export function totalsOf(equip: number[], limited: number[]): ModTotals {
  const t = emptyTotals();
  const add = (k: NumKey, v: number) => { t[k] += v; };
  for (const id of equip) {
    const e = cat.exts.find((x) => x.id === id);
    if (!e) continue;
    const d = modOf(e);
    add(d.key, modValue(d, e.rarity));
  }
  for (const id of limited) {
    const d = limitedOf(id);
    for (const [k, v] of Object.entries(d.add)) {
      if (k === 'color') { const [c, n] = v as [Elem, number]; t.colorGum[c] += n; } else add(k as NumKey, v as number);
    }
  }
  // 上限（強くなりすぎないように）
  t.paint = Math.min(1, t.paint);
  t.fence = Math.min(0.6, t.fence);
  t.insurance = Math.min(0.3, t.insurance);
  t.kickRelit = Math.min(0.8, t.kickRelit);
  t.flipperLen = Math.min(0.16, t.flipperLen);
  return t;
}

// ------------------------------------------------------------------ ショップ
export const EQUIP_SLOTS = 5;
export const SHOP_BASE = 6;
const PRICE_MUL = [8, 20, 50, 120, 300];
/** 値段：★と、いちばん先まで進んだ台で決まる GUM */
export function priceOf(e: Ext, deepest: number): number {
  return Math.ceil(enemyGum(Math.max(1, deepest), 0) * PRICE_MUL[Math.max(1, Math.min(5, e.rarity)) - 1]);
}
export const sellOf = (e: Ext, deepest: number): number => Math.floor(priceOf(e, deepest) / 2);
/** 品ぞろえ：★が高いものは、台が先へ進むほど出やすい */
export function rollShop(deepest: number, n: number, rnd: () => number = Math.random, avoid: number[] = []): number[] {
  const w = (r: number): number => {
    const need = [1, 2, 5, 10, 20][r - 1];
    if (deepest < need) return 0;
    return [10, 6, 4, 2.2, 1][r - 1] * (1 + Math.min(1, (deepest - need) / 20));
  };
  const pool = cat.exts.filter((e) => !avoid.includes(e.id) && w(e.rarity) > 0);
  const out: number[] = [];
  for (let k = 0; k < n && pool.length; k += 1) {
    const total = pool.reduce((a, e) => a + w(e.rarity), 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i += 1) { r -= w(pool[i].rarity); if (r <= 0) break; }
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
/** 台を早く突破したほど候補が増える（15 秒以内 +1、10 秒以内 +2） */
export const limitedCount = (clearT: number): number => 3 + (clearT <= 10 ? 2 : clearT <= 15 ? 1 : 0);
/** 引き直しの値段 */
export const rerollPrice = (floor: number, discount: number): number => Math.ceil(enemyGum(floor, 0) * 25 * (1 - Math.min(0.6, discount)));

/** その部品に付けられる改造：ショップの改造の名前と、Limited の品 */
export function modsForPart(part: string): { shop: string[]; limited: number[] } {
  const shop: string[] = [];
  for (const list of Object.values(MOD_KIND)) for (const d of list) if (d.part === part && !shop.includes(d.name)) shop.push(d.name);
  const limited = cat.limited.map((l) => l.id).filter((id) => limitedOf(id).part === part);
  return { shop, limited };
}
