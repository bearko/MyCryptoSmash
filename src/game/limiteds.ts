// Limited シリーズ（ノルマを納めるたびに 1 つ選ぶ。挑戦の間ずっと付く。ID 5501〜の 54 個）。
//
// ユーザーの指定：単純に倍率を上げる効果ではなく、**メリットとデメリットが混ざった効果**にする（取引の札のように）。
// 型は 6 つ：代償と引きかえ・便利と不便・台を変える・効果を増やす・運と店・壊れものと組む。メリットだけの札もまれに混ぜる。
// 札ではメリットを黄、デメリットを赤で書く。選んだその場で一度だけ効くもの（once）と、挑戦の間ずっと効くもの（add）がある。
// heat：選んだとき、ヒートの印を付ける部品を選ぶ（src/ui/limited.ts）。curse：呪いの穴（台のどこかに、入ると球が消える赤い骸骨の穴）。

import { cat, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import type { Elem } from './elements';
import type { ModTotals } from './mods';

type NumKey = Exclude<keyof ModTotals, 'colorGum'>;
export type LimType = 'trade' | 'tradeoff' | 'table' | 'boost' | 'luck' | 'fragile';
export const LIM_TYPE: Record<LimType, { name: string; color: string }> = {
  trade: { name: '代償と引きかえ', color: '#ff8f2e' },
  tradeoff: { name: '便利と不便', color: '#3fd0ff' },
  table: { name: '台を変える', color: '#ff6ad5' },
  boost: { name: '効果を増やす', color: '#c08bff' },
  luck: { name: '運と店', color: '#4fe07a' },
  fragile: { name: '壊れものと組む', color: '#ff4f5e' },
};

export interface LimitedDef {
  /** 付く部品（parts.ts の id。解説モード） */
  part: string;
  type: LimType;
  /** メリット（黄）とデメリット（赤。なければメリットだけの札） */
  good: string;
  bad?: string;
  /** 挑戦の間ずっと効く（ModTotals に足し合わせる） */
  add?: Partial<Record<NumKey, number>> & { color?: [Elem, number] };
  /** 選んだその場で一度だけ効く。起きたことを短く返す（発表用） */
  once?: (s: Save) => string;
  /** 選んだとき、ヒートの印を付ける部品の数 */
  heat?: number;
  /** プレイの GUM ×（発表の全体の倍率） */
  gum?: number;
  /** 札の文（メリット／デメリット） */
  text: string;
}
const L = (part: string, type: LimType, good: string, bad: string | undefined, o: Omit<LimitedDef, 'part' | 'type' | 'good' | 'bad' | 'text'> = {}): LimitedDef =>
  ({ part, type, good, bad, ...o, text: bad ? `${good}／${bad}` : good });

const extById = (id: number): Ext | undefined => cat.exts.find((e) => e.id === id);
/** いちばん右の装備を壊す（装備と持ち物から消える） */
function breakRight(s: Save): string {
  const id = s.equip[s.equip.length - 1];
  if (id === undefined) return '壊れる品がなかった';
  s.equip = s.equip.filter((x) => x !== id);
  s.owned = s.owned.filter((x) => x !== id);
  if (s.extGrow) delete s.extGrow[id];
  return `${extById(id)?.name ?? '品'}が壊れた`;
}
/** 装備の品を★ +1（★5 はそのまま）。育ちは引きつぐ */
function upgrade(s: Save, ids: number[]): number {
  let n = 0;
  for (const id of ids) {
    const e = extById(id);
    if (!e || e.rarity >= 5) continue;
    const up = id + 1000;
    if (!extById(up) || s.owned.includes(up)) continue;
    s.owned = s.owned.map((x) => (x === id ? up : x));
    s.equip = s.equip.map((x) => (x === id ? up : x));
    if (s.extGrow?.[id] !== undefined) { s.extGrow[up] = s.extGrow[id]; delete s.extGrow[id]; }
    if (!s.exts.includes(up)) s.exts.push(up);
    n += 1;
  }
  return n;
}

/** 54 個の Limited（品の名前と絵から決めた効き目） */
export const LIMITED_FIXED: Record<number, LimitedDef> = {
  // ---------------------------------------------------------------- 代償と引きかえ
  5502: L('targets', 'trade', 'エクステンションの枠 +1', '選んだとき、手持ちのエンブレムをすべて失う', {
    add: { extSlot: 1 }, once: (s) => { const n = s.emblems; s.emblems = 0; return `エンブレム ${n} を失った`; } }),
  5627: L('multi', 'trade', 'ヒーローの枠 +2（控えの球が増える）', '選んだとき、いちばん右のエクステンションが壊れる', {
    add: { heroSlot: 2 }, once: breakRight }),
  5597: L('targets', 'trade', '選んだとき、残りの装備のエクステンションをすべて★ +1', '選んだとき、いちばん右のエクステンションが壊れる', {
    once: (s) => { const b = breakRight(s); const n = upgrade(s, [...s.equip]); return `${b}・${n} つが★ +1`; } }),
  5599: L('targets', 'trade', '装備のエクステンションの効果が強くなる（上乗せ分 ×1.25）', '選んだとき、手持ちの GUM の半分を失う', {
    add: { extPow: 0.25 }, once: (s) => { const g = Math.floor(s.gum / 2); s.gum -= g; return `${g} GUM を失った`; } }),
  5548: L('mystery', 'trade', 'ショップに★の高い品が並びやすい（ノルマ 3 つ先の品ぞろえ）', '選んだとき、手持ちの GUM の半分を失う', {
    add: { shopAhead: 3 }, once: (s) => { const g = Math.floor(s.gum / 2); s.gum -= g; return `${g} GUM を失った`; } }),
  5561: L('bumper', 'trade', 'GUM ×2', '呪いの穴 +2（入ると球が消える。プレイごとに場所が変わる）', { gum: 2, add: { curse: 2 } }),
  5536: L('plunger', 'trade', 'ノルマを納めたときのエンブレム +4', '1 プレイごとのエンブレム +1 がなくなる', { add: { emblemQuota: 4, emblemPlay: -1 } }),
  5509: L('lanes', 'trade', 'GUM ×1.5', 'エクステンションとギミックの値段 +1', { gum: 1.5, add: { shopDiscount: -1 } }),
  5582: L('targets', 'trade', 'エクステンションの枠 +2', '装備の品は、すべて壊れもの（10%）になる', { add: { extSlot: 2, allFragile: 0.1 } }),

  // ---------------------------------------------------------------- 便利と不便
  5556: L('plunger', 'tradeoff', '1 プレイの時間 +6 秒', 'ボールセーブがきかない', { add: { extraTime: 6, noSave: 1 } }),
  5504: L('save', 'tradeoff', '予備のセーブ +2（1 プレイに 2 回、落ちても戻る）', '1 プレイの時間 −4 秒', { add: { spareSave: 2, extraTime: -4 } }),
  5611: L('plunger', 'tradeoff', 'プレイごとにエンブレム +1（時は金なり）', '1 プレイの時間 −3 秒', { add: { emblemPlay: 1, extraTime: -3 } }),
  5531: L('lanes', 'tradeoff', 'G-U-M の大当たりのたびにエンブレム +1（1 プレイ 2 まで）', '1 プレイの時間 −2 秒', { add: { emblemLane: 1, extraTime: -2 } }),
  5518: L('flipper', 'tradeoff', '球を落としても、G-U-M の倍率が 1 に戻らない', 'ボールセーブの時間 −2 秒', { add: { dropKeep: 1, saveSec: -2 } }),
  5535: L('kickback', 'tradeoff', 'キックバックがすぐ点き直す（−60%）・打ち戻した球が緑の貫通', 'ボールセーブがきかない', { add: { kickRelit: 0.6, kickGreen: 1, noSave: 1 } }),
  5558: L('zone', 'tradeoff', 'ZONE の間、のこり時間が減らない', '連鎖が切れるまでの猶予 −0.3 秒', { add: { zoneSlow: 1, comboCore: -0.3 } }),
  5626: L('targets', 'tradeoff', 'ボスの動きが 30% 遅い・ボスを倒したプレイは GUM ×2', '連鎖が切れるまでの猶予 −0.3 秒', { add: { bossSlow: 0.3, bossPlayX: 1, comboCore: -0.3 } }),
  5581: L('outlane', 'tradeoff', '1 プレイに 1 回、アウトレーンの柵がかならずはじき返す', '1 プレイの時間 −2 秒', { add: { fenceOnce: 1, extraTime: -2 } }),
  5595: L('lock', 'tradeoff', 'マルチボールに必要なロック −1・マルチボールの球 +2', 'ボールセーブの時間 −2 秒', { add: { lockLess: 1, multiBalls: 2, saveSec: -2 } }),
  5630: L('multi', 'tradeoff', 'マルチボール中、2 秒ごとにレーザーが的を撃つ・マルチボールの間の GUM ×2', '坂が 10% 重い（球が速く落ちる）', { add: { laser: 1, multiGum: 1, slope: 0.1 } }),
  5613: L('multi', 'tradeoff', 'リーダーの能力が 2 回発動する', '控えのヒーローの能力が効かない', { add: { leaderTwice: 1, mateOff: 1 } }),

  // ---------------------------------------------------------------- 台を変える（ヒート・呪いの穴・部品）
  5517: L('lanes', 'table', '部品を 2 つ選んで、ヒートの印を付ける（当たるたびに倍率が上がる）', '1 プレイの時間 −3 秒', { heat: 2, add: { extraTime: -3 } }),
  5574: L('hole', 'table', '部品を 3 つ選んで、ヒートの印を付ける', '呪いの穴 +1', { heat: 3, add: { curse: 1 } }),
  5600: L('targets', 'table', '部品を 2 つ選んで、ヒートの印を付ける', 'エクステンションとギミックの値段 +1', { heat: 2, add: { shopDiscount: -1 } }),
  5528: L('zone', 'table', '部品を 1 つ選んでヒートの印・ヒートの印の倍率 ×1.5', '呪いの穴 +1', { heat: 1, add: { heatAmp: 0.5, curse: 1 } }),
  5575: L('targets', 'table', 'ヒートの印の倍率 ×1.8', 'ショップの品数 −2', { add: { heatAmp: 0.8, shopSlots: -2 } }),
  5551: L('sling', 'table', '三角のばねとバンパーにヒートの印', '下のフリッパーが 10% 短い', { add: { flipperLen: -0.1 }, once: (s) => addHeat(s, ['sling', 'bumper']) }),
  5624: L('lights', 'table', '通り道のライトにヒートの印・全部灯したごほうび ×2', '呪いの穴 +1', { add: { lightPay: 1, curse: 1 }, once: (s) => addHeat(s, ['light']) }),
  5625: L('inlane', 'table', 'インレーンの GUM ×3・カエルにヒートの印', 'キックバックがなくなる', { add: { inlaneGum: 1, kickOff: 1 }, once: (s) => addHeat(s, ['popup', 'lane']) }),
  5598: L('lanes', 'table', '台に入ったとき G が点いた状態・G-U-M の大当たりの GUM ×2', '1 プレイの時間 −3 秒', { add: { startLane: 1, laneJackpot: 1, extraTime: -3 } }),
  5640: L('lanes', 'table', 'G・U・M を全部点けたとき、倍率が 1 つ多く上がる', '品ぞろえと Limited の引き直しの値段 ×2', { add: { laneMul: 1, rerollPow: 1 } }),
  5573: L('zone', 'table', 'ZONE の間、バンパーから雷・バンパーにヒートの印', 'ボールセーブの時間 −2 秒', { add: { zoneShock: 1, saveSec: -2 }, once: (s) => addHeat(s, ['bumper']) }),
  5537: L('zone', 'table', '振ったときの台ゆらし +25%・連鎖が切れるまでの猶予 +0.5 秒', '呪いの穴 +1', { add: { rockMul: 0.25, comboCore: 0.5, curse: 1 } }),
  5612: L('star', 'table', 'ゴーストスターの間隔 −40%・分身 +1', undefined, { add: { starEvery: 0.4 } }),

  // ---------------------------------------------------------------- 効果を増やす
  5501: L('targets', 'boost', 'いちばん左のエクステンションの効果が 2 回発動する', 'いちばん右のエクステンションは発動しない', { add: { leftTwice: 1, rightOff: 1 } }),
  5506: L('flipper', 'boost', 'いちばん右のエクステンションの効果が 2 回発動する', 'いちばん左のエクステンションは発動しない', { add: { rightTwice: 1, leftOff: 1 } }),
  5515: L('targets', 'boost', '×倍率のエクステンションが強くなる（上乗せ分 ×1.4）', '+倍率のエクステンションの効果が半分', { add: { extXPow: 0.4, extMultPow: -0.5 } }),
  5596: L('bumper', 'boost', '+倍率のエクステンションの効果 ×1.6', '×倍率のエクステンションの上乗せ分 −30%', { add: { extMultPow: 0.6, extXPow: -0.3 } }),
  5503: L('lanes', 'boost', '次に選ぶ Limited が 2 回発動する（悪いほうも）', undefined, { once: (s) => { s.quota.doubleNext = (s.quota.doubleNext ?? 0) + 1; return '次の Limited が 2 回'; } }),
  5508: L('lights', 'boost', '育つエクステンションの育ちが 2 倍', 'ショップの品数 −1', { add: { growPow: 1, shopSlots: -1 } }),
  5579: L('flipper', 'boost', '選んだとき、装備の育つエクステンションをすべて +4 育てる', 'エクステンションとギミックの値段 +1', { add: { shopDiscount: -1 }, once: (s) => growAll(s, 4) }),
  5530: L('outlane', 'boost', '選んだとき、装備のエクステンションをすべて★ +1', undefined, { once: (s) => `${upgrade(s, [...s.equip])} つが★ +1` }),
  5550: L('zone', 'boost', '球を全部は落とさなかったプレイは GUM ×1.6', '球を全部落としたプレイは GUM ×0.7', { add: { noDrainX: 0.6, drainX: 0.3 } }),
  5534: L('targets', 'boost', 'このノルマの 3 プレイ目は GUM ×2.5', '1・2 プレイ目は GUM ×0.75', { add: { lastPlayX: 1.5, otherPlayX: 0.25 } }),
  5651: L('plunger', 'boost', 'プレイが終わるとき、そのプレイの GUM ×1.15（おみやげ）', undefined, { add: { souvenir: 0.15 } }),

  // ---------------------------------------------------------------- 運と店
  5559: L('plunger', 'luck', 'エクステンションとギミックの値段 −1', '品ぞろえと Limited の引き直しができない', { add: { shopDiscount: 1, rerollOff: 1 } }),
  5516: L('warp', 'luck', 'ショップの品数 +2', '品ぞろえと Limited の引き直しができない', { add: { shopSlots: 2, rerollOff: 1 } }),
  5580: L('warp', 'luck', '引き直しの値段がいつも 10 GUM', 'ショップの品数 −1', { add: { rerollFixed: 1, shopSlots: -1 } }),
  5674: L('plunger', 'luck', 'ショップの品数 +2・エクステンションを買値で売れる', '引き直しの値段 ×2', { add: { shopSlots: 2, sellFull: 1, rerollPow: 1 } }),
  5647: L('plunger', 'luck', 'ノルマを納めたときのエンブレム +2（金魚すくいのおまけ）', undefined, { add: { emblemQuota: 2 } }),
  5557: L('save', 'luck', 'ボールセーブ +3 秒・予備のセーブ +1', undefined, { add: { saveSec: 3, spareSave: 1 } }),

  // ---------------------------------------------------------------- 壊れものと組む
  5510: L('save', 'fragile', '壊れものが壊れたとき、挑戦の間 1 回だけ直る', '壊れものが壊れる確率 +10%', { add: { fragileRepair: 1, fragileAdd: 0.1 } }),
  5529: L('plunger', 'fragile', '壊れものの効果 ×1.5（上乗せ分）', '壊れものが壊れる確率 +10%', { add: { fragilePow: 0.5, fragileAdd: 0.1 } }),
  5549: L('spinner', 'fragile', 'エクステンションが壊れるたびに、エンブレム +3', undefined, { add: { fragileEmblem: 3 } }),
};
/** 選んだとき、決まった部品にヒートの印を付ける */
export function addHeat(s: Save, srcs: string[]): string {
  s.heat ??= [];
  for (const x of srcs) if (!s.heat.includes(x)) s.heat.push(x);
  return `ヒートの印：${srcs.length} か所`;
}
/** 装備の育つ品をまとめて育てる */
function growAll(s: Save, n: number): string {
  s.extGrow ??= {};
  let k = 0;
  for (const id of s.equip) {
    const d = GROWERS.has(id % 1000);
    if (!d) continue;
    s.extGrow[id] = (s.extGrow[id] ?? 0) + n;
    k += 1;
  }
  return `${k} つが +${n} 育った`;
}
/** 育ちをセーブに持つエクステンションのシリーズ（exts.ts の grow） */
const GROWERS = new Set([19, 44, 79]);

/** 品ごとの固有の効き目があるか */
export const hasOwnEffect = (id: number): boolean => !!LIMITED_FIXED[id];
/** 新しく素材に Limited が増えたときの予備 */
const SPARE = L('lanes', 'luck', 'ノルマを納めたときのエンブレム +1', undefined, { add: { emblemQuota: 1 } });
export function limitedOf(id: number): LimitedDef {
  return LIMITED_FIXED[id] ?? SPARE;
}

// ------------------------------------------------------------------ 選ぶ・あとで選ぶ（純粋。画面は src/ui/limited.ts）
/** ヒートの印を付けられる部品（台にあるものだけ。もう印のあるものは除く） */
const BASE_HEAT = ['bumper', 'sling', 'spin', 'lane', 'ramp', 'loop', 'light', 'enemy', 'gumlane', 'jackpot', 'mystery', 'warp'];
const TOY_HEAT: Record<string, string> = { hyperloop: 'hyperloop', castle: 'castle', face: 'face', crane: 'crane', captive: 'captive', popup: 'popup', mini: 'mini', dino: 'dino', ufo: 'ufo', moai: 'moai', hammer: 'hammer' };
export function heatChoices(s: Save): string[] {
  const own = (s.toys ?? []).map((t) => TOY_HEAT[t]).filter(Boolean);
  return [...BASE_HEAT, ...own].filter((x) => !(s.heat ?? []).includes(x));
}
/**
 * Limited を選んだ：持ち物に足し（「次に選ぶ Limited が 2 回」なら 2 回）、選んだときの効き目を起こす。
 * 起きたこと（発表用）と、これから選ぶヒートの印の数を返す
 */
export function pickLimited(s: Save, id: number): { notes: string[]; heat: number } {
  const d = limitedOf(id);
  const times = s.quota.doubleNext ? 2 : 1;
  s.quota.doubleNext = 0;
  const notes: string[] = [];
  let heat = 0;
  for (let k = 0; k < times; k += 1) {
    s.limited.push(id);
    if (d.once) notes.push(d.once(s));
    heat += d.heat ?? 0;
  }
  if (times > 1) notes.unshift('2 回発動！');
  s.quota.picks = Math.max(0, s.quota.picks - 1);
  s.quota.cards = 0;
  s.quota.saved = [];
  s.quota.offer = undefined;
  // ヒートの印はこのあと選ぶ（選ぶ前に閉じても、次に開いたときに選べるように残す）
  if (heat > 0 && heatChoices(s).length) s.quota.heatLeft = (s.quota.heatLeft ?? 0) + heat;
  return { notes, heat };
}
/** あとで選ぶ：今回の候補を取っておき、選ぶ権利を次に納めたときへ持ちこす */
export function deferLimited(s: Save, cands: number[]): void {
  s.quota.saved = [...cands];
  s.quota.later = (s.quota.later ?? 0) + 1;
  s.quota.picks = Math.max(0, s.quota.picks - 1);
  s.quota.cards = 0;
  s.quota.offer = undefined;
}
/**
 * 候補：取っておいたもの（まだ持っていないもの）＋新しく n 枚。
 * 一度出した候補は s.quota.offer に残し、閉じて開き直しても同じ札を出す（開き直しでただの引き直しにならないように）
 */
export function limitedCands(s: Save, n: number, roll: (owned: number[], n: number) => number[]): number[] {
  const kept = (s.quota.offer ?? []).filter((id) => !s.limited.includes(id));
  if (kept.length) return kept;
  const saved = (s.quota.saved ?? []).filter((id) => !s.limited.includes(id));
  const out = [...saved, ...roll([...s.limited, ...saved], n)];
  s.quota.offer = [...out];
  return out;
}
