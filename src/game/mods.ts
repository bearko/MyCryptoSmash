// 台の改造（エクステンション）：ショップでエンブレムを払って買い、枠（3〜5）に装備するもの（プレイごとに付け替え・売却できる）と、
// ノルマを納めるたびに選ぶ Limited シリーズ（ID 5501 以降。挑戦の間は外せない。GAME OVER で失う）。
//
// どちらも効き目は ModTotals に足し合わせ、PinballWorld がその数字を読む。
// ショップのエクステンションは種類（攻撃力・GUM・磁石・加速・衝撃波・巨大化）ごとに改造の系統が決まり、★で強さが決まる。
// 同じ名前のエクステンションは、いつも同じ改造になる。
// ただし GUM の種類のエクステンションは台の改造ではなく「スコアの効果」（ScoreDef：+基本額・+倍率・×倍率）を持ち、
// プレイのあとの発表で、装備の並び順（左から）に全体のスコアへ掛かる。

import { cat, type Ext, type ItemKind, type LimitedArt } from '../core/catalog';
import type { Elem } from './elements';
import { extPrice, extSell } from './quota';

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
    // GUM の種類は台の改造を持たない（スコアの効果：SCORE_DEFS）
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
export function modOf(e: Ext): ModDef | null {
  const list = MOD_KIND[e.kind];
  if (!list.length) return null;
  return list[(e.id * 7 + Math.floor(e.id / 1000)) % list.length];
}
export function modValue(def: ModDef, rarity: number): number {
  const v = def.lo + ((def.hi - def.lo) * (Math.max(1, Math.min(5, rarity)) - 1)) / 4;
  return def.int ? Math.round(v) : v;
}
export function modText(e: Ext): string {
  const sc = scoreOf(e);
  if (sc) return sc.text(sc.vals[Math.max(1, Math.min(5, e.rarity)) - 1]);
  const d = modOf(e);
  return d ? d.text(modValue(d, e.rarity)) : '';
}
/** 品の効き目の名前（台の改造の名前、またはスコアの効果の名前） */
export function modName(e: Ext): string {
  return scoreOf(e)?.name ?? modOf(e)?.name ?? '';
}

// ------------------------------------------------------------------ スコアの効果（GUM の種類のエクステンション）
/** +基本額（的 1 体ぶんの GUM を単位に足す）・+倍率・×倍率 */
export type ScoreKind = 'chips' | 'mult' | 'xmult';
/** プレイの記録（スコアの効果の条件に使う） */
export interface RunStats {
  kills: number; loopsRamps: number; lightsAll: number; bestCombo: number; tables: number; drains: number; bosses: number;
  colors: number; zones: number; jackpots: number; multiballs: number; emptySlots: number;
  /** この品を装備して遊んだ回数（今回をふくむ） */
  runsWith: number;
}
export interface ScoreDef {
  /** エクステンションのシリーズ（ID の下 3 けた） */
  series: number;
  name: string;
  kind: ScoreKind;
  /** ★1〜★5 の強さ */
  vals: number[];
  text: (v: number) => string;
  /** このプレイでの量：chips は「的何体ぶん」、mult は足す倍率、xmult は掛ける倍率（発動しなければ 0 か 1）。note は発表で出す説明 */
  eval: (r: RunStats, v: number) => { amount: number; note: string };
}
const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();
const ev = (amount: number, note: string) => ({ amount, note });
export const SCORE_DEFS: ScoreDef[] = [
  // +基本額
  { series: 8, name: '的の図鑑', kind: 'chips', vals: [0.3, 0.5, 0.8, 1.2, 1.8],
    text: (v) => `倒した的 1 体ごとに、基本額 +的 ${f2(v)} 体ぶん`, eval: (r, v) => ev(r.kills * v, `的 ${r.kills} 体`) },
  { series: 80, name: '空飛ぶ配当', kind: 'chips', vals: [0.6, 1, 1.5, 2.2, 3],
    text: (v) => `ループ・ランプ 1 回ごとに、基本額 +的 ${f2(v)} 体ぶん`, eval: (r, v) => ev(r.loopsRamps * v, `ループ・ランプ ${r.loopsRamps} 回`) },
  { series: 150, name: '灯りの配当', kind: 'chips', vals: [1, 1.6, 2.4, 3.5, 5],
    text: (v) => `通り道のライトを 1 本全部灯すごとに、基本額 +的 ${f2(v)} 体ぶん`, eval: (r, v) => ev(r.lightsAll * v, `全部灯した ${r.lightsAll} 本`) },
  // +倍率
  { series: 57, name: '魔法の倍率', kind: 'mult', vals: [0.2, 0.3, 0.45, 0.65, 0.9],
    text: (v) => `倍率 +${f2(v)}`, eval: (_r, v) => ev(v, 'いつでも') },
  { series: 3, name: '連鎖の筆', kind: 'mult', vals: [0.15, 0.25, 0.35, 0.5, 0.7],
    text: (v) => `いちばん長い連鎖 10 ごとに、倍率 +${f2(v)}`, eval: (r, v) => ev(Math.floor(r.bestCombo / 10) * v, `いちばん長い連鎖 ${r.bestCombo}`) },
  { series: 16, name: '旅の記録', kind: 'mult', vals: [0.3, 0.45, 0.6, 0.8, 1],
    text: (v) => `このプレイで突破した台 1 つごとに、倍率 +${f2(v)}`, eval: (r, v) => ev(r.tables * v, `突破した台 ${r.tables}`) },
  { series: 103, name: 'ボス封じ', kind: 'mult', vals: [0.3, 0.5, 0.7, 1, 1.4],
    text: (v) => `ボスを倒すごとに、倍率 +${f2(v)}`, eval: (r, v) => ev(r.bosses * v, `ボス ${r.bosses} 体`) },
  { series: 174, name: 'マルチの奇跡', kind: 'mult', vals: [0.25, 0.4, 0.6, 0.85, 1.2],
    text: (v) => `マルチボール 1 回ごとに、倍率 +${f2(v)}`, eval: (r, v) => ev(r.multiballs * v, `マルチボール ${r.multiballs} 回`) },
  // ×倍率
  { series: 50, name: '落とさない戒め', kind: 'xmult', vals: [1.3, 1.5, 1.75, 2, 2.5],
    text: (v) => `このプレイで一度も球を落とさなければ、倍率 ×${f2(v)}`, eval: (r, v) => ev(r.drains === 0 ? v : 1, r.drains === 0 ? '一度も落とさなかった' : `${r.drains} 回落とした`) },
  { series: 79, name: '伸びる棒', kind: 'xmult', vals: [0.02, 0.03, 0.04, 0.05, 0.07],
    text: (v) => `装備して遊ぶたびに育つ：倍率 ×(1 + ${f2(v)} × 遊んだ回数)（×3 まで）`, eval: (r, v) => ev(Math.min(3, 1 + v * r.runsWith), `遊んだ回数 ${r.runsWith}`) },
  { series: 104, name: '三色の筆', kind: 'xmult', vals: [1.2, 1.35, 1.5, 1.75, 2],
    text: (v) => `赤・青・緑の攻撃をぜんぶ的に当てたら、倍率 ×${f2(v)}`, eval: (r, v) => ev(r.colors >= 3 ? v : 1, `当てた色 ${r.colors} / 3`) },
  { series: 158, name: '悟りの ZONE', kind: 'xmult', vals: [0.1, 0.15, 0.2, 0.3, 0.4],
    text: (v) => `ZONE に入るたびに、倍率 ×(1 + ${f2(v)} × 回数)`, eval: (r, v) => ev(1 + v * r.zones, `ZONE ${r.zones} 回`) },
  { series: 173, name: '空き枠のお守り', kind: 'xmult', vals: [1.15, 1.25, 1.35, 1.5, 1.7],
    text: (v) => `装備の空き枠 1 つごとに、倍率 ×${f2(v)}`, eval: (r, v) => ev(v ** r.emptySlots, `空き枠 ${r.emptySlots}`) },
  { series: 178, name: 'ジャックポットの札', kind: 'xmult', vals: [0.1, 0.15, 0.2, 0.3, 0.4],
    text: (v) => `ジャックポット 1 回ごとに、倍率 ×(1 + ${f2(v)} × 回数)`, eval: (r, v) => ev(1 + v * r.jackpots, `ジャックポット ${r.jackpots} 回`) },
];
/** GUM の種類のエクステンションのスコアの効果（ほかの種類は null） */
export function scoreOf(e: Ext): ScoreDef | null {
  if (e.kind !== 'gum') return null;
  return SCORE_DEFS.find((d) => d.series === e.id % 1000) ?? null;
}
export const scoreVal = (e: Ext, d: ScoreDef): number => d.vals[Math.max(1, Math.min(5, e.rarity)) - 1];

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
    if (d) add(d.key, modValue(d, e.rarity));
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
/** 装備の枠のいちばん多い数（はじめは 3。ショップでエンブレムを払って広げる：save.extSlots） */
export const EQUIP_SLOTS = 5;
export const SHOP_BASE = 6;
/** 値段：★で決まるエンブレム（quota.ts の EXT_PRICE） */
export function priceOf(e: Ext): number {
  return extPrice(e.rarity);
}
/** 売値：買値の半分（切り捨て） */
export const sellOf = (e: Ext): number => extSell(e.rarity);
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
/** その部品に付けられる改造：ショップの改造の名前と、Limited の品 */
export function modsForPart(part: string): { shop: string[]; limited: number[] } {
  const shop: string[] = [];
  for (const list of Object.values(MOD_KIND)) for (const d of list) if (d.part === part && !shop.includes(d.name)) shop.push(d.name);
  const limited = cat.limited.map((l) => l.id).filter((id) => limitedOf(id).part === part);
  return { shop, limited };
}
