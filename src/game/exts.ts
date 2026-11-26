// エクステンション（ショップでエンブレムを払って買い、枠に装備する品）の効果。
//
// 104 シリーズ（MCH のエクステンション。同じシリーズは★1〜★5 で強さだけが変わる）のどれにも、スコアにつながる効果が 1 つある。
// 効果はプレイのあとの GUM の発表で、装備の並び順（左から）に 1 つずつ掛かる。最後の額は 基本額 × 倍率。
//   +基本額（chips）：基本額に足す（的 1 体ぶんの GUM を単位にする）
//   +倍率（mult）   ：倍率に足す
//   ×倍率（xmult）  ：倍率に掛ける
//   行（row）       ：決まった出どころ（バンパー・仕掛けなど）の行の基本額に掛ける
//   エンブレム      ：プレイのあとにエンブレムを生む
// 品には「系統」の札があり、同じ系統の数・となり・ぜんぶ違う、などの組み合わせで効く品がある（ビルドを組む）。
// 仕掛け（toys.ts）と結びつく品は、その仕掛けを持っていないと効かない（店の札に「この仕掛けが要る」）。
// 育つ品は条件を満たすたびに育ち、挑戦の間は残る（売る・壊れると消える）。壊れものは強いが、効いたあと決まった確率で壊れる。

import type { Ext } from '../core/catalog';
import type { GumSrc } from './tally';
import type { ToyId } from './toys';

// ------------------------------------------------------------------ 系統
export type Family = 'ball' | 'pull' | 'paint' | 'bounce' | 'run' | 'refund' | 'copy' | 'finish' | 'snipe' | 'big' | 'econ';
export const FAMILIES: Family[] = ['ball', 'pull', 'paint', 'bounce', 'run', 'refund', 'copy', 'finish', 'snipe', 'big', 'econ'];
/** 系統の名前・色・どれだけビルドの軸になるか（S〜B。出やすさと値段に使う）・説明 */
export const FAMILY_INFO: Record<Family, { name: string; color: string; tier: 'S' | 'A' | 'B'; text: string }> = {
  ball: { name: '球と枠', color: '#ff9a3d', tier: 'S', text: '球の数・マルチボール・ヒーローの数で伸びる' },
  pull: { name: '寄せる', color: '#c08bff', tier: 'S', text: '1 つの出どころに寄せて、その行を伸ばす' },
  paint: { name: '塗る', color: '#4fe07a', tier: 'A', text: '部品にヒートの印を付ける・塗って伸ばす' },
  bounce: { name: '跳ね', color: '#ff6ad5', tier: 'A', text: 'バンパー・三角のばね・回転盤の回数で伸びる' },
  run: { name: '走り', color: '#3fd0ff', tier: 'A', text: 'ランプ・ループ・スピナー・ワープの回数で伸びる' },
  refund: { name: '還元', color: '#ffd23f', tier: 'A', text: '落とした・届かなかったときに取り返す' },
  copy: { name: '保険と複製', color: '#cfd8ff', tier: 'A', text: 'となりの効果をもう 1 回・落ちても守る' },
  finish: { name: '仕上げ', color: '#ff5f4f', tier: 'A', text: '条件つきの ×倍率・並び順で強い' },
  snipe: { name: '一点狙い', color: '#ff8f2e', tier: 'B', text: '1 つの仕掛けだけに強く効く' },
  big: { name: '終盤の大物', color: '#ff4fd8', tier: 'B', text: 'そろうまで弱いが、そろうと巨大な ×倍率' },
  econ: { name: '経済', color: '#b6ff4f', tier: 'B', text: 'エンブレム・値段・空き枠で効く' },
};

// ------------------------------------------------------------------ プレイの記録（効果の条件）
/** 1 回のプレイの記録。PinballWorld.playStats() が作る（テストでは手で作れる） */
export interface PlayStats {
  /** 出どころごとの回数と基本額（GUM） */
  n: Partial<Record<GumSrc, number>>;
  v: Partial<Record<GumSrc, number>>;
  /** 的 1 体ぶんの GUM（+基本額の単位） */
  unit: number;
  kills: number; bosses: number; drains: number; saves: number; bestCombo: number; multiballs: number;
  zones: number; colors: number; tables: number;
  /** 台に同時に出た本物の球のいちばん多い数 */
  maxBalls: number;
  /** ヒーローの枠のヒーローの数 */
  heroes: number;
  /** 持っている仕掛け */
  toys: ToyId[];
  /** 仕掛けの使われた回数（大砲を撃った・回転盤に乗った・ロック・磁石が投げた・ミステリーに入った・城が崩れた・…） */
  uses: Partial<Record<string, number>>;
  /** 手持ちのエンブレム・いまのノルマ・このノルマの何プレイ目か・納めたノルマの数・手持ちの GUM・ノルマ額 */
  emblems: number; quotaN: number; played: number; delivered: number; gum: number; need: number;
  /** マルチボールの間・13 球マルチボールの間・仲間の球（控え・マルチボール）が稼いだ基本額 */
  multiChips: number; megaChips: number; mateChips: number;
  weakKills: number; crits: number; fences: number; warps: number; boosts: number;
  /** プレイで最初に当てた部品（出どころ） */
  firstSrc: GumSrc | null;
  /** 1 プレイでのびた時間（秒） */
  extraTime: number;
  /** ヒートの印の付いた出どころ（Limited と装備の品） */
  heat: GumSrc[];
  /** 装備の枠の数 */
  slots: number;
  /** いちばん稼いだ出どころが同じプレイが続いた数（今回をふくむ） */
  focus: number;
}
export const emptyStats = (): PlayStats => ({
  n: {}, v: {}, unit: 1, kills: 0, bosses: 0, drains: 0, saves: 0, bestCombo: 0, multiballs: 0, zones: 0, colors: 0, tables: 0,
  maxBalls: 1, heroes: 1, toys: [], uses: {}, emblems: 0, quotaN: 1, played: 1, delivered: 0, gum: 0, need: 200,
  multiChips: 0, megaChips: 0, mateChips: 0, weakKills: 0, crits: 0, fences: 0, warps: 0, boosts: 0, firstSrc: null, extraTime: 0, heat: [], slots: 3, focus: 0,
});

/** 品の置き場所（並び順の効果に使う） */
export interface SlotCtx {
  i: number;
  /** 装備の並び（左から） */
  defs: (ExtDef | null)[];
  /** この品の育ち（育つ品だけ。今回の分をふくむ） */
  grow: number;
  /** この品より左で掛かった ×倍率の積（しんがりの効果に使う） */
  prevX: number;
}

// ------------------------------------------------------------------ 品の効果
export type EffKind = 'chips' | 'mult' | 'xmult' | 'row' | 'emblem';
export type LinkKind = 'again' | 'copy' | 'copyFirst';
export interface EvalOut { amount: number; note: string; kind?: EffKind; src?: GumSrc | null }
export interface ExtDef {
  series: number;
  fam: Family;
  name: string;
  kind: EffKind | LinkKind;
  /** ★1〜★5 の強さ */
  vals: number[];
  text: (v: number) => string;
  /** このプレイでの量（kind が chips なら「的何体ぶん」） */
  eval?: (s: PlayStats, c: SlotCtx, v: number) => EvalOut;
  /** 結びつく仕掛け（持っていないと効かない） */
  toy?: ToyId;
  /** 結びつく出どころ（発表でその行へ飛ばす・ヒートの印） */
  src?: GumSrc;
  /** 装備している間、この出どころにヒートの印を付ける */
  heat?: GumSrc;
  /** 壊れもの：効いたあと、この確率で壊れる */
  fragile?: number;
  /** 育つ：このプレイで育つ量（0 なら育たない） */
  grow?: (s: PlayStats) => number;
  /** 台の動きを変える改造（mods.ts の ModTotals の名前と、★1〜★5 の値） */
  mod?: { key: string; vals: number[] };
}

const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();
const pc = (v: number): string => `${Math.round(v * 100)}%`;
const E = (amount: number, note: string, kind?: EffKind, src?: GumSrc | null): EvalOut => ({ amount, note, kind, src });
const cnt = (s: PlayStats, src: GumSrc): number => s.n[src] ?? 0;
const use = (s: PlayStats, k: string): number => s.uses[k] ?? 0;
/** 装備の中の、ある系統の品の数 */
const famCount = (c: SlotCtx, f: Family): number => c.defs.filter((d) => d?.fam === f).length;
/** 出どころを稼いだ順に */
const ranked = (s: PlayStats): GumSrc[] => (Object.keys(s.v) as GumSrc[]).filter((k) => (s.v[k] ?? 0) > 0 && k !== 'mods' && k !== 'hero' && k !== 'pyramid').sort((a, b) => (s.v[b] ?? 0) - (s.v[a] ?? 0));
const TOY_SRC: Partial<Record<ToyId, GumSrc>> = { hyperloop: 'hyperloop', castle: 'castle', face: 'face', crane: 'crane', captive: 'captive', popup: 'popup', mini: 'mini', dino: 'dino', ufo: 'ufo', moai: 'moai', hammer: 'hammer' };

/** ヒートの印の部品に当たったときに上がる倍率（よく当たる部品ほど小さい。発表で出す） */
export const HEAT_PER: Partial<Record<GumSrc, number>> = {
  spin: 0.01, bumper: 0.025, sling: 0.06, light: 0.03, lane: 0.08, mini: 0.04,
  enemy: 0.15, moai: 0.09, popup: 0.1, ufo: 0.15, castle: 0.5, dino: 0.3, crane: 0.6, captive: 0.6, hyperloop: 1,
  ramp: 0.5, loop: 0.5, jackpot: 0.5, gumlane: 0.4, mystery: 0.8, face: 1.2, hammer: 1.5, warp: 0.3,
}
/** ヒートの印を付けられる出どころ（仕掛けは持っているときだけ） */
export const HEAT_SRCS = Object.keys(HEAT_PER) as GumSrc[];
export const heatPer = (src: GumSrc): number => HEAT_PER[src] ?? 0.1;

const SRC_NAME_SHORT: Partial<Record<GumSrc, string>> = {
  bumper: 'バンパー', sling: '三角のばね', spin: 'スピナー', lane: 'レーン', ramp: 'ランプ', loop: 'ループ', jackpot: 'ジャックポット', light: '通り道のライト',
  warp: 'ワープ', mystery: 'ミステリー', enemy: '的', boss: 'ボス', hyperloop: 'ハイパーループ', castle: 'ボスの城', face: 'ピエロの口', crane: 'つかむ手',
  captive: '捕まった球', popup: 'カエル', mini: '上の小さな台', dino: '怪物', ufo: 'UFO', moai: 'モアイ', gumlane: 'G-U-M の大当たり', hammer: 'ボスの反撃', skill: 'スキルショット',
};
export const srcShort = (s: GumSrc): string => SRC_NAME_SHORT[s] ?? s;

/**
 * ★ごとの強さの伸び。効果の「上乗せ分」（×倍率なら 1 を超えた分、+倍率・+基本額ならその量）に掛ける（★1 が 1）。
 * 品の★はノルマが進むと並ぶ（mods.ts の RARITY_QUOTA）ので、これがノルマの 4 倍に打ち勝つ伸びの芯になる
 */
export const STAR_POW = [1, 2.4, 4.2, 6.5, 9.5];
const r2 = (v: number): number => Math.round(v * 100) / 100;
/** ×倍率・行：★1 の値 b から（1 を超えた分が伸びる） */
const X = (b: number): number[] => STAR_POW.map((k) => r2(1 + (b - 1) * k));
/** +倍率・+基本額・回数あたり：★1 の値 b から */
const A = (b: number): number[] => STAR_POW.map((k) => r2(b * k));

// 系統ごとに、組み合わせで効く品（同じ系統の数・3 つそろう）
const sameFam = (series: number, fam: Family, name: string, b: number): ExtDef => ({
  series, fam, name, kind: 'mult', vals: A(b),
  text: (v) => `装備の「${FAMILY_INFO[fam].name}」の品 1 つごとに、倍率 +${f2(v)}（自分もふくむ）`,
  eval: (_s, c, v) => { const k = famCount(c, fam); return E(k * v, `${FAMILY_INFO[fam].name} ${k} つ`); },
});
const bigFam = (series: number, fam: Family, name: string, b: number): ExtDef => ({
  series, fam: 'big', name, kind: 'xmult', vals: X(b),
  text: (v) => `装備に「${FAMILY_INFO[fam].name}」の品が 3 つ以上あれば、倍率 ×${f2(v)}`,
  eval: (_s, c, v) => { const k = famCount(c, fam); return E(k >= 3 ? v : 1, `${FAMILY_INFO[fam].name} ${k} / 3`); },
});
/** 出どころの行に掛ける品（行の大きい出どころだけ） */
const rowOf = (series: number, fam: Family, name: string, src: GumSrc, b: number, toy?: ToyId): ExtDef => ({
  series, fam, name, kind: 'row', vals: X(b), toy, src,
  text: (v) => `${srcShort(src)}の行の基本額 ×${f2(v)}`,
  eval: (s, _c, v) => E((s.v[src] ?? 0) > 0 ? v : 1, `${srcShort(src)} ${cnt(s, src)} 回`, 'row', src),
});
/** 出どころにヒートの印を付ける品（装備している間）。当たるたびに倍率が上がる */
const heatOf = (series: number, name: string, src: GumSrc, b: number, toy?: ToyId): ExtDef => ({
  series, fam: 'paint', name, kind: 'mult', vals: A(b), toy, src, heat: src,
  text: (v) => `${srcShort(src)}にヒートの印（装備している間）。当たるたびに倍率 +${f2(heatPer(src) * v)}`,
  eval: (s, _c, v) => { const k = cnt(s, src); return E(k * heatPer(src) * v, `${srcShort(src)} ${k} 回`, 'mult', src); },
});
/** 回数ごとに +倍率 */
const perMult = (series: number, fam: Family, name: string, what: string, get: (s: PlayStats) => number, b: number, extra: Partial<ExtDef> = {}): ExtDef => ({
  series, fam, name, kind: 'mult', vals: A(b), ...extra,
  text: (v) => `${what}${what.endsWith('ごと') ? 'に' : 'たびに'}、倍率 +${f2(v)}`,
  eval: (s, _c, v) => { const k = get(s); return E(k * v, `${k} 回`, 'mult', extra.src); },
});
/** 回数ごとに ×(1 + v × 回数) */
const perLin = (series: number, fam: Family, name: string, what: string, get: (s: PlayStats) => number, b: number, extra: Partial<ExtDef> = {}): ExtDef => ({
  series, fam, name, kind: 'xmult', vals: A(b), ...extra,
  text: (v) => `${what}たびに、倍率 ×(1 + ${f2(v)} × 回数)`,
  eval: (s, _c, v) => { const k = get(s); return E(1 + v * k, `${k} 回`); },
});
/** 回数ごとに ×v（掛け算で重なる） */
const perPow = (series: number, fam: Family, name: string, what: string, get: (s: PlayStats) => number, b: number, extra: Partial<ExtDef> = {}): ExtDef => ({
  series, fam, name, kind: 'xmult', vals: X(b), ...extra,
  text: (v) => `${what}たびに、倍率 ×${f2(v)}`,
  eval: (s, _c, v) => { const k = get(s); return E(v ** k, `${k} 回`); },
});
/** 回数ごとに +基本額 */
const perChips = (series: number, fam: Family, name: string, what: string, get: (s: PlayStats) => number, b: number, extra: Partial<ExtDef> = {}): ExtDef => ({
  series, fam, name, kind: 'chips', vals: A(b), ...extra,
  text: (v) => `${what}たびに、基本額 +的 ${f2(v)} 体ぶん`,
  eval: (s, _c, v) => { const k = get(s); return E(k * v, `${k} 回`, 'chips', extra.src); },
});
/** 条件を満たせば ×v */
const condX = (series: number, fam: Family, name: string, what: string, ok: (s: PlayStats, c: SlotCtx) => boolean, note: (s: PlayStats, c: SlotCtx) => string, b: number, extra: Partial<ExtDef> = {}): ExtDef => ({
  series, fam, name, kind: 'xmult', vals: X(b), ...extra,
  text: (v) => `${what}、倍率 ×${f2(v)}`,
  eval: (s, c, v) => E(ok(s, c) ? v : 1, note(s, c)),
});
/** 育つ：条件を満たしたプレイごとに育ち、×(1 + v × 育ち) */
const growX = (series: number, fam: Family, name: string, when: string, g: (s: PlayStats) => number, b: number, cap = 99): ExtDef => ({
  series, fam, name, kind: 'xmult', vals: A(b), grow: g,
  text: (v) => `育つ：${when}育つ。倍率 ×(1 + ${f2(v)} × 育ち)${cap < 99 ? `（×${cap} まで）` : ''}`,
  eval: (_s, c, v) => E(Math.min(cap, 1 + v * c.grow), `育ち ${c.grow}`),
});

const allHits = (s: PlayStats): number => Object.values(s.n).reduce((a, b) => a + (b ?? 0), 0);

export const EXT_DEFS: ExtDef[] = [
  // ---------------------------------------------------------------- 球と枠（巨大化・魔法少女のセット）
  perMult(4, 'ball', '控えの行進', '台に同時に出た本物の球のいちばん多い数 1 つごと', (s) => s.maxBalls, 0.4),
  { ...perMult(18, 'ball', 'ロックの近道', 'ロックのホールに球が入る', (s) => use(s, 'lock'), 0.8), mod: { key: 'lockLess', vals: [1, 1, 1, 1, 1] },
    text: (v) => `マルチボールに必要なロック −1。ロックのホールに球が入るたびに、倍率 +${f2(v)}` },
  { series: 31, fam: 'ball', name: '祭りの足音', kind: 'chips', vals: A(1),
    text: (v) => `仲間の球（控え・マルチボール）が稼いだ基本額 +${pc(v)}`,
    eval: (s, _c, v) => E((s.mateChips / s.unit) * v, `仲間の球 ${Math.round(s.mateChips)}`) },
  perPow(59, 'ball', '大祭りの帽子', '13 球マルチボールになる', (s) => use(s, 'mega13'), 1.8, { toy: 'mega13' }),
  perMult(95, 'ball', 'ガチャの号令', 'ガチャのカプセルが増える（ロック）', (s) => use(s, 'gacha'), 1, { toy: 'gacha' }),
  perPow(96, 'ball', 'カプセルの帯', 'ガチャのカプセルが増える（ロック）', (s) => use(s, 'gacha'), 1.4, { toy: 'gacha' }),
  { series: 141, fam: 'ball', name: '揃いの羽織', kind: 'xmult', vals: X(1.15),
    text: (v) => `ヒーローの枠のヒーロー 1 人ごとに、倍率 ×${f2(v)}`,
    eval: (s, _c, v) => E(v ** s.heroes, `ヒーロー ${s.heroes} 人`) },
  rowOf(193, 'ball', '小さな台のゆりかご', 'mini', 3, 'mini'),
  sameFam(174, 'ball', 'マルチの奇跡', 0.5),

  // ---------------------------------------------------------------- 保険と複製（巨大化・ホルン・鏡）
  { series: 67, fam: 'copy', name: 'こだま', kind: 'again', vals: [1, 1, 1, 1, 1], text: () => '左隣のエクステンションの効果を、もう 1 回発動する' },
  { series: 105, fam: 'copy', name: 'うつし鏡', kind: 'copy', vals: [1, 1, 1, 1, 1], text: () => '右隣のエクステンションの効果をコピーする' },
  { series: 36, fam: 'copy', name: '王冠の写し', kind: 'copyFirst', vals: [1, 1, 1, 1, 1], text: () => 'いちばん左のエクステンションの効果をコピーする（自分が左端なら効かない）' },
  { ...condX(61, 'copy', '身代わりのマント', '球を全部は落とさなければ', (s) => s.drains === 0, (s) => (s.drains === 0 ? '全部は落とさなかった' : `${s.drains} 回落とした`), 1.4),
    mod: { key: 'spareSave', vals: [1, 1, 1, 2, 2] },
    text: (v) => `ボールセーブが 1 プレイに ${v >= 3 ? 2 : 1} 回もどる。球を全部は落とさなければ、倍率 ×${f2(v)}` },
  { ...perMult(81, 'copy', '柵の鎧', 'アウトレーンの柵が球をはじき返す', (s) => s.fences, 1.5), mod: { key: 'fence', vals: [0.12, 0.18, 0.25, 0.32, 0.4] },
    text: (v) => `アウトレーンに柵（落ちかけた球をはじき返す）。はじき返すたびに、倍率 +${f2(v)}` },
  { series: 110, fam: 'copy', name: '結び目', kind: 'row', vals: X(2.5),
    text: (v) => `持っている仕掛けのうち、いちばん稼いだ仕掛けの行の基本額 ×${f2(v)}`,
    eval: (s, _c, v) => {
      const best = s.toys.map((t) => TOY_SRC[t]).filter((x): x is GumSrc => !!x).sort((a, b) => (s.v[b] ?? 0) - (s.v[a] ?? 0))[0];
      return best && (s.v[best] ?? 0) > 0 ? E(v, srcShort(best), 'row', best) : E(1, '仕掛けの GUM がない', 'row', null);
    } },

  // ---------------------------------------------------------------- 寄せる（磁石・モノクル）
  { ...perChips(9, 'pull', '的寄せの指輪', '的を倒す', (s) => s.kills, 8), mod: { key: 'magnet', vals: [1, 1.5, 2, 2.5, 3] },
    text: (v) => `球が近くの的へ少し寄る。的を倒すたびに、基本額 +的 ${f2(v)} 体ぶん` },
  { series: 10, fam: 'pull', name: '集める盾', kind: 'row', vals: X(2),
    text: (v) => `いちばん稼いだ出どころの行の基本額 ×${f2(v)}`,
    eval: (s, _c, v) => { const t = ranked(s)[0]; return t ? E(v, srcShort(t), 'row', t) : E(1, 'なし', 'row', null); } },
  { series: 17, fam: 'pull', name: '二番手の首飾り', kind: 'row', vals: X(2.5),
    text: (v) => `2 番目に稼いだ出どころの行の基本額 ×${f2(v)}`,
    eval: (s, _c, v) => { const t = ranked(s)[1]; return t ? E(v, srcShort(t), 'row', t) : E(1, 'なし', 'row', null); } },
  { ...perMult(75, 'pull', '見通しの眼鏡', 'ミステリーのホールに入る', (s) => use(s, 'mystery'), 1), mod: { key: 'mysteryLuck', vals: [0.2, 0.3, 0.4, 0.5, 0.6] },
    text: (v) => `ミステリーで GUM の雨が出やすい。ミステリーのホールに入るたびに、倍率 +${f2(v)}` },
  rowOf(98, 'pull', '龍の玉', 'gumlane', 1.8),
  { series: 102, fam: 'pull', name: '観察眼', kind: 'mult', vals: A(0.12),
    text: (v) => `いちばん多く当てた部品の回数 10 ごとに、倍率 +${f2(v)}`,
    eval: (s, _c, v) => { const t = (Object.keys(s.n) as GumSrc[]).filter((k) => k !== 'mods' && k !== 'hero').sort((a, b) => cnt(s, b) - cnt(s, a))[0]; const k = t ? cnt(s, t) : 0; return E(Math.floor(k / 10) * v, t ? `${srcShort(t)} ${k} 回` : 'なし'); } },
  { series: 111, fam: 'pull', name: '止まる時計', kind: 'chips', vals: A(10), mod: { key: 'extraTime', vals: [1, 1.5, 2, 2.5, 3] },
    text: (v) => `1 プレイの時間がのびる（★で 1〜3 秒）。基本額 +的 ${f2(v)} 体ぶん`,
    eval: (_s, _c, v) => E(v, 'いつでも') },
  perLin(143, 'pull', '天球の引力', '捕まった球を突き上げる', (s) => cnt(s, 'captive'), 0.4, { toy: 'captive', src: 'captive' }),
  perMult(147, 'pull', '誘導の石碑', 'つかむ手が球を運ぶ', (s) => use(s, 'crane'), 1.2, { toy: 'crane' }),
  perLin(156, 'pull', '磁石の極', '磁石が球を投げる', (s) => use(s, 'magnet'), 0.5, { toy: 'magnet' }),

  // ---------------------------------------------------------------- 塗る（衝撃波の果物・色・筆パレ）
  heatOf(39, '赤い熱', 'bumper', 1.2),
  heatOf(40, '橙の熱', 'moai', 1.2, 'moai'),
  heatOf(41, '緑の熱', 'enemy', 1.2),
  heatOf(43, '紫の熱', 'popup', 1.2, 'popup'),
  heatOf(45, '青い熱', 'sling', 1.2),
  { series: 42, fam: 'paint', name: '燃え広がり', kind: 'xmult', vals: X(1.15),
    text: (v) => `ヒートの印の付いた部品 1 つごとに、倍率 ×${f2(v)}`,
    eval: (s, _c, v) => E(v ** s.heat.length, `ヒート ${s.heat.length} か所`) },
  growX(44, 'paint', '残り火', 'ヒートの部品に 20 回以上当てたプレイごとに', (s) => (s.heat.reduce((a, h) => a + cnt(s, h), 0) >= 20 ? 1 : 0), 0.08),
  { series: 46, fam: 'paint', name: '金の塗り', kind: 'row', vals: X(2.5),
    text: (v) => `プレイで最初に当てた部品を金色に塗る：その行の基本額 ×${f2(v)}`,
    eval: (s, _c, v) => (s.firstSrc && (s.v[s.firstSrc] ?? 0) > 0 ? E(v, srcShort(s.firstSrc), 'row', s.firstSrc) : E(1, 'なし', 'row', null)) },
  { series: 55, fam: 'paint', name: 'とっておき', kind: 'xmult', vals: X(1.6), fragile: 0.25, text: (v) => `倍率 ×${f2(v)}`, eval: (_s, _c, v) => E(v, 'いつでも') },
  sameFam(58, 'paint', '塗り重ね', 0.5),
  { ...perChips(104, 'paint', '弱点の筆', '弱点の色で的を倒す', (s) => s.weakKills, 10), mod: { key: 'paint', vals: [0.25, 0.4, 0.6, 0.8, 1] },
    text: (v) => `当たった的を、いまの攻撃の色の弱点に塗る。弱点の色で倒すたびに、基本額 +的 ${f2(v)} 体ぶん` },

  // ---------------------------------------------------------------- 跳ね（楽器など）
  { series: 71, fam: 'bounce', name: '連打の太鼓', kind: 'mult', vals: A(0.3), src: 'bumper',
    text: (v) => `バンパー 10 回ごとに、倍率 +${f2(v)}`,
    eval: (s, _c, v) => E(Math.floor(cnt(s, 'bumper') / 10) * v, `バンパー ${cnt(s, 'bumper')} 回`, 'mult', 'bumper') },
  perChips(66, 'bounce', 'ばねの鈴', '三角のばねに当たる', (s) => cnt(s, 'sling'), 3, { src: 'sling' }),
  perChips(65, 'bounce', '弦の響き', 'バンパーに当たる', (s) => cnt(s, 'bumper'), 1.5, { src: 'bumper' }),
  perLin(69, 'bounce', '三角の弓', '三角のばねに当たる', (s) => cnt(s, 'sling'), 0.05, { src: 'sling' }),
  condX(70, 'bounce', '二本の弦', 'バンパー 20 回以上と三角のばね 8 回以上で', (s) => cnt(s, 'bumper') >= 20 && cnt(s, 'sling') >= 8, (s) => `バンパー ${cnt(s, 'bumper')}・ばね ${cnt(s, 'sling')}`, 1.6),
  { series: 72, fam: 'bounce', name: '跳ねの共鳴', kind: 'xmult', vals: X(1.12),
    text: (v) => `装備の「跳ね」の品 1 つごとに、倍率 ×${f2(v)}（自分もふくむ）`,
    eval: (_s, c, v) => { const k = famCount(c, 'bounce'); return E(v ** k, `跳ね ${k} つ`); } },
  perMult(64, 'bounce', '回る笛', '回転盤に乗る', (s) => use(s, 'disc'), 0.1, { toy: 'disc' }),
  perLin(32, 'bounce', '舞の扇', '回転盤に乗る', (s) => use(s, 'disc'), 0.06, { toy: 'disc' }),
  perPow(68, 'bounce', '反撃の鍵盤', 'ボスの反撃で球が跳ねる', (s) => cnt(s, 'hammer'), 1.5, { toy: 'hammer', src: 'hammer' }),
  { series: 30, fam: 'bounce', name: '割れる杯', kind: 'xmult', vals: A(0.2), fragile: 0.15,
    text: (v) => `いちばん長い連鎖 10 ごとに、倍率 ×(1 + ${f2(v)} × 10 の数)`,
    eval: (s, _c, v) => { const k = Math.floor(s.bestCombo / 10); return E(1 + v * k, `いちばん長い連鎖 ${s.bestCombo}`); } },
  { series: 37, fam: 'bounce', name: 'となりの軍配', kind: 'mult', vals: A(0.8),
    text: (v) => `となりの品が「跳ね」なら、1 つごとに倍率 +${f2(v)}`,
    eval: (_s, c, v) => { const k = [c.defs[c.i - 1], c.defs[c.i + 1]].filter((d) => d?.fam === 'bounce').length; return E(k * v, `となりの跳ね ${k}`); } },

  // ---------------------------------------------------------------- 走り（加速の動物・ホーキ・ランタン）
  perMult(5, 'run', '駆ける馬', 'ランプを通る', (s) => cnt(s, 'ramp'), 0.6, { src: 'ramp' }),
  perMult(21, 'run', 'ループの虎', 'ループを通る', (s) => cnt(s, 'loop'), 0.6, { src: 'loop' }),
  { series: 26, fam: 'run', name: '巻きつく蛇', kind: 'mult', vals: A(0.25), src: 'spin',
    text: (v) => `スピナー 20 回ごとに、倍率 +${f2(v)}`,
    eval: (s, _c, v) => E(Math.floor(cnt(s, 'spin') / 20) * v, `スピナー ${cnt(s, 'spin')} 回`, 'mult', 'spin') },
  perLin(22, 'run', '昇り龍', 'ハイパーループを 1 周する', (s) => cnt(s, 'hyperloop'), 0.8, { toy: 'hyperloop', src: 'hyperloop' }),
  perMult(23, 'run', '突進', '大砲で撃ち出す', (s) => use(s, 'cannon'), 1.2, { toy: 'cannon' }),
  growX(19, 'run', '歩みの甲羅', 'ランプとループを合わせて 2 回以上通したプレイごとに', (s) => (cnt(s, 'ramp') + cnt(s, 'loop') >= 2 ? 1 : 0), 0.08),
  { ...perChips(20, 'run', '鶏の早駆け', 'ブースターを通る', (s) => s.boosts, 4), mod: { key: 'boosterMul', vals: [0.05, 0.08, 0.1, 0.13, 0.15] },
    text: (v) => `ブースターが少し速い。ブースターを通るたびに、基本額 +的 ${f2(v)} 体ぶん` },
  condX(25, 'run', '綱渡り', 'ランプとループを両方通したら', (s) => cnt(s, 'ramp') > 0 && cnt(s, 'loop') > 0, (s) => `ランプ ${cnt(s, 'ramp')}・ループ ${cnt(s, 'loop')}`, 1.6),
  perChips(27, 'run', '瞬間移動の犬', 'ワープを通る', (s) => s.warps, 8),
  sameFam(24, 'run', '群れの行進', 0.5),
  perChips(80, 'run', '空飛ぶ配当', 'ループかランプを通る', (s) => cnt(s, 'ramp') + cnt(s, 'loop'), 10),
  perChips(150, 'run', '灯りの配当', '通り道のライトを 1 本全部灯す', (s) => cnt(s, 'light'), 2, { src: 'light' }),

  // ---------------------------------------------------------------- 一点狙い（攻撃力・恐竜・ジョーカーの札）
  perMult(86, 'snipe', '渦の殻', 'ハイパーループを 1 周する', (s) => cnt(s, 'hyperloop'), 1.5, { toy: 'hyperloop', src: 'hyperloop' }),
  perLin(74, 'snipe', '砲声', '大砲で撃つ', (s) => use(s, 'cannon'), 0.6, { toy: 'cannon' }),
  condX(90, 'snipe', '城崩しの角', 'ボスの城を崩したら', (s) => use(s, 'castle') > 0, (s) => `崩した ${use(s, 'castle')} 回`, 2, { toy: 'castle' }),
  perMult(15, 'snipe', '攻城の矛', 'ボスの城の跳ね橋に当てる', (s) => cnt(s, 'castle'), 0.8, { toy: 'castle', src: 'castle' }),
  { series: 82, fam: 'snipe', name: '十三の刃', kind: 'chips', vals: A(2), toy: 'mega13',
    text: (v) => `13 球マルチボールの間に稼いだ基本額 +${pc(v)}`,
    eval: (s, _c, v) => E((s.megaChips / s.unit) * v, `大祭り中 ${Math.round(s.megaChips)}`) },
  perMult(73, 'snipe', '口へのひと振り', 'しゃべる顔の口に入れる', (s) => cnt(s, 'face'), 2, { toy: 'face', src: 'face' }),
  perPow(178, 'snipe', 'ジョーカーの札', 'しゃべる顔の口に入れる', (s) => cnt(s, 'face'), 1.6, { toy: 'face', src: 'face' }),
  perMult(34, 'snipe', '反撃返し', 'ボスの反撃で球が跳ねる', (s) => cnt(s, 'hammer'), 1, { toy: 'hammer', src: 'hammer' }),
  perPow(97, 'snipe', '爪の賞品', 'つかむ手が球を運ぶ', (s) => use(s, 'crane'), 1.5, { toy: 'crane' }),
  condX(89, 'snipe', '水底の首', '捕まった球の大当たり（てっぺんに 3 回）で', (s) => use(s, 'captive') > 0, (s) => `大当たり ${use(s, 'captive')} 回`, 2, { toy: 'captive' }),
  perChips(13, 'snipe', 'カエル射ち', 'カエルに当てる', (s) => cnt(s, 'popup'), 5, { toy: 'popup', src: 'popup' }),
  perMult(94, 'snipe', '頭突き', 'モアイに当てる', (s) => cnt(s, 'moai'), 0.15, { toy: 'moai', src: 'moai' }),
  perPow(87, 'snipe', '上空の翼', '上の小さな台で MINI JACKPOT になる', (s) => use(s, 'mini'), 1.3, { toy: 'mini' }),
  perMult(88, 'snipe', '腹ぺこ', '怪物が球をかむ', (s) => cnt(s, 'dino'), 0.4, { toy: 'dino', src: 'dino' }),
  perLin(93, 'snipe', '丸のみ', '怪物が球を食べる', (s) => use(s, 'dino'), 0.6, { toy: 'dino' }),
  perMult(161, 'snipe', '光線の照準', 'UFO に当てる', (s) => cnt(s, 'ufo'), 0.2, { toy: 'ufo', src: 'ufo' }),
  perLin(100, 'snipe', '開く円盤', 'UFO が開く', (s) => use(s, 'ufo'), 0.6, { toy: 'ufo' }),
  perChips(99, 'snipe', '鉄の手甲', '磁石が球を投げる', (s) => use(s, 'magnet'), 20, { toy: 'magnet' }),

  // ---------------------------------------------------------------- 仕上げ（攻撃力）
  condX(1, 'finish', '一の太刀', 'いちばん左に置くと', (_s, c) => c.i === 0, (_s, c) => (c.i === 0 ? '左端' : `${c.i + 1} 番目`), 1.7),
  { series: 6, fam: 'finish', name: 'しんがりの太刀', kind: 'xmult', vals: [0.35, 0.5, 0.65, 0.8, 1],
    text: (v) => `いちばん右に置くと、それまでに掛かった ×倍率の ${pc(v)} を、もう一度掛ける`,
    eval: (_s, c, v) => { const last = c.i === c.defs.length - 1; return E(last ? 1 + (c.prevX - 1) * v : 1, last ? `それまで ×${f2(c.prevX)}` : `${c.i + 1} 番目`); } },
  condX(2, 'finish', '一斉射撃', '装備の品が 3 つ以上で、系統がぜんぶ違えば',
    (_s, c) => { const f = c.defs.filter((d): d is ExtDef => !!d).map((d) => d.fam); return f.length >= 3 && new Set(f).size === f.length; },
    (_s, c) => { const f = c.defs.filter((d): d is ExtDef => !!d).map((d) => d.fam); return `${new Set(f).size} 系統 / ${f.length} 品`; }, 1.8),
  { series: 11, fam: 'finish', name: '割れる斧', kind: 'mult', vals: A(1.5), fragile: 0.12, text: (v) => `倍率 +${f2(v)}`, eval: (_s, _c, v) => E(v, 'いつでも') },
  condX(14, 'finish', '三色の構え', '赤・青・緑の攻撃をぜんぶ的に当てたら', (s) => s.colors >= 3, (s) => `当てた色 ${s.colors} / 3`, 1.8),
  { ...perChips(28, 'finish', '急所突き', '会心が出る', (s) => s.crits, 10), mod: { key: 'crit', vals: [0.04, 0.06, 0.08, 0.1, 0.12] },
    text: (v) => `的への攻撃がときどき会心（3 倍）。会心のたびに、基本額 +的 ${f2(v)} 体ぶん` },
  { series: 29, fam: 'finish', name: '六連発', kind: 'xmult', vals: X(1.3),
    text: (v) => `装備のほかの壊れもの 1 つごとに、倍率 ×${f2(v)}`,
    eval: (_s, c, v) => { const k = c.defs.filter((d, i) => i !== c.i && d?.fragile).length; return E(v ** k, `壊れもの ${k} つ`); } },
  condX(35, 'finish', '大物狙い', 'このプレイでボスを倒したら', (s) => s.bosses > 0, (s) => `ボス ${s.bosses} 体`, 2),
  condX(48, 'finish', '背水の刃', 'このノルマの 3 プレイ目（最後のプレイ）なら', (s) => s.played >= 3, (s) => `${s.played} プレイ目`, 1.8),
  { series: 49, fam: 'finish', name: '並び撃ち', kind: 'xmult', vals: X(1.25),
    text: (v) => `となりの品と系統が同じなら、1 つごとに倍率 ×${f2(v)}`,
    eval: (_s, c, v) => { const me = c.defs[c.i]; const k = [c.defs[c.i - 1], c.defs[c.i + 1]].filter((d) => d && me && d.fam === me.fam).length; return E(v ** k, `同じ系統のとなり ${k}`); } },
  { series: 51, fam: 'finish', name: '鞭の連打', kind: 'mult', vals: A(0.4),
    text: (v) => `ぜんぶの部品の当たり 100 回ごとに、倍率 +${f2(v)}`,
    eval: (s, _c, v) => { const k = allHits(s); return E(Math.floor(k / 100) * v, `当たり ${k} 回`); } },
  { series: 56, fam: 'finish', name: '死神の鎌', kind: 'xmult', vals: X(1.8), fragile: 0.25, text: (v) => `倍率 ×${f2(v)}`, eval: (_s, _c, v) => E(v, 'いつでも') },

  // ---------------------------------------------------------------- 終盤の大物
  condX(183, 'big', '堕天の鎖', '台の仕掛けを 10 個以上持っていれば（ジョーカー）', (s) => s.toys.length >= 10, (s) => `仕掛け ${s.toys.length} / 10`, 3),
  condX(171, 'big', '運命の鋏', '装備の枠がぜんぶうまり、系統が 4 種以上なら',
    (s, c) => { const d = c.defs.filter((x): x is ExtDef => !!x); return d.length >= s.slots && new Set(d.map((x) => x.fam)).size >= 4; },
    (s, c) => { const d = c.defs.filter((x): x is ExtDef => !!x); return `${d.length} / ${s.slots} 枠・${new Set(d.map((x) => x.fam)).size} 系統`; }, 2.5),
  bigFam(91, 'run', '竜の翼', 2.5),
  bigFam(152, 'bounce', '神砕き', 2.5),
  condX(164, 'big', '魔王の拳', '台に本物の球が同時に 6 つ以上そろったら', (s) => s.maxBalls >= 6, (s) => `いちばん多いとき ${s.maxBalls} 球`, 2.5),
  growX(79, 'big', '伸びる棒', '装備して遊ぶたびに', () => 1, 0.05, 10),
  { series: 92, fam: 'big', name: '育つ卵', kind: 'xmult', vals: A(0.12),
    text: (v) => `育つ：いちばん稼いだ出どころが同じプレイが続くほど育つ。倍率 ×(1 + ${f2(v)} × 続いた数)（×8 まで）`,
    eval: (s, _c, v) => E(Math.min(8, 1 + v * s.focus), `${s.focus} プレイ続けて`) },

  // ---------------------------------------------------------------- 還元（GUM の種類）
  { series: 50, fam: 'refund', name: '戒めの石版', kind: 'xmult', vals: X(1.5),
    text: (v) => `球を一度も落とさなければ倍率 ×${f2(v)}。落としたら、1 回ごとに基本額 +的 ${f2(v * 6)} 体ぶん（返金）`,
    eval: (s, _c, v) => (s.drains === 0 ? E(v, '一度も落とさなかった', 'xmult') : E(s.drains * v * 6, `${s.drains} 回落とした・返金`, 'chips')) },
  condX(8, 'refund', '借りの帳面', 'このノルマの 2・3 プレイ目で、まだノルマに届いていなければ', (s) => s.played >= 2 && s.gum < s.need,
    (s) => (s.played >= 2 && s.gum < s.need ? `${s.played} プレイ目・あと ${Math.ceil(s.need - s.gum)}` : `${s.played} プレイ目`), 1.8),
  perMult(103, 'refund', '厄よけの札', '球が落ちる（ボールセーブで戻ってもふくむ）', (s) => s.drains + s.saves, 0.6),
  perMult(3, 'refund', '署名の羽ペン', '入金口に納めたノルマ 1 つごと', (s) => s.delivered, 0.15),

  // ---------------------------------------------------------------- 経済（GUM の種類）
  { series: 57, fam: 'econ', name: '金の杖', kind: 'mult', vals: A(0.04),
    text: (v) => `手持ちのエンブレム 1 つごとに、倍率 +${f2(v)}（30 まで）`,
    eval: (s, _c, v) => { const k = Math.min(30, s.emblems); return E(k * v, `エンブレム ${s.emblems}`); } },
  { series: 16, fam: 'econ', name: '値切りの巻物', kind: 'mult', vals: A(0.3), mod: { key: 'shopDiscount', vals: [1, 1, 1, 2, 2] },
    text: (v) => `エクステンションとギミックの値段 −${v >= 1.2 ? 2 : 1}（最低 1）。倍率 +${f2(v)}`,
    eval: (_s, _c, v) => E(v, 'いつでも') },
  { series: 173, fam: 'econ', name: '空き枠のお守り', kind: 'xmult', vals: X(1.3),
    text: (v) => `装備の空き枠 1 つごとに、倍率 ×${f2(v)}`,
    eval: (s, c, v) => { const k = Math.max(0, s.slots - c.defs.filter((d) => !!d).length); return E(v ** k, `空き枠 ${k}`); } },
  { series: 158, fam: 'econ', name: '両替の杖', kind: 'emblem', vals: [1, 1, 2, 2, 3], text: (v) => `プレイのあと、エンブレム +${v}`, eval: (_s, _c, v) => E(v, 'プレイのあと') },
];

const BY_SERIES = new Map(EXT_DEFS.map((d) => [d.series, d]));
/** エクステンションの効果（シリーズで決まる） */
export const extDef = (e: Ext | { id: number }): ExtDef | null => BY_SERIES.get(e.id % 1000) ?? null;
export const extVal = (e: Ext, d: ExtDef): number => d.vals[Math.max(1, Math.min(5, e.rarity)) - 1];
export const extText = (e: Ext): string => { const d = extDef(e); return d ? d.text(extVal(e, d)) : ''; };
export const extName = (e: Ext): string => extDef(e)?.name ?? '';
/** 種類の札（+基本額・+倍率・×倍率・行・…） */
export const KIND_TAG: Record<EffKind | LinkKind, string> = { chips: '+基本額', mult: '+倍率', xmult: '×倍率', row: '行 ×', emblem: 'エンブレム', again: 'もう 1 回', copy: 'コピー', copyFirst: 'コピー' };

// ------------------------------------------------------------------ 装備の効果を左から解く
export interface ResolvedEff {
  /** 装備の品の ID（ヒートなど品でないものは 0） */
  id: number;
  name: string;
  sub: string;
  kind: EffKind;
  amount: number;
  fired: boolean;
  img: string;
  /** 行に掛かる出どころ（row）・結びつく出どころ（発表で飛ばす先） */
  src?: GumSrc;
  fam?: Family;
  /** 育った（新しい育ち） */
  grew?: number;
  /** この発表のあと壊れる */
  broke?: boolean;
  /** ヒート（Limited の印）の行 */
  heat?: boolean;
  /** 壊れるはずが直った（Limited） */
  repaired?: boolean;
}
export interface ResolveOut {
  effs: ResolvedEff[];
  /** 育ちの新しい値（品の ID ごと） */
  grow: Record<number, number>;
  /** 壊れた品の ID */
  broke: number[];
  /** 生んだエンブレム */
  emblems: number;
}
export interface ResolveOpts {
  /** 育ちのいまの値（品の ID ごと） */
  grow?: Record<number, number>;
  /** 壊れる判定の乱数（なければ壊れない：プレイの途中の見込み） */
  rng?: () => number;
  /** 壊れる確率の足し算（Limited） */
  fragileAdd?: number;
  /** 壊れものの効果の倍率（Limited） */
  fragilePow?: number;
  /** 効果の上乗せ分の倍率（Limited）：ぜんぶ・×倍率と行の品・+倍率の品（1 が元のまま） */
  pow?: number;
  xPow?: number;
  multPow?: number;
  /** すべての品が壊れもの（この確率。もともと壊れものの品はそのまま） */
  allFragile?: number;
  /** 育ちの速さ（1 が元のまま） */
  growPow?: number;
  /** いちばん左・右の品を 2 回／発動させない */
  leftTwice?: boolean;
  rightTwice?: boolean;
  leftOff?: boolean;
  rightOff?: boolean;
}

/** 装備（左から）の効果を解く。リンク（もう 1 回・コピー）としんがりは 2 回目に解く */
export function resolveExts(equip: Ext[], s: PlayStats, opt: ResolveOpts = {}): ResolveOut {
  const defs = equip.map((e) => extDef(e));
  const grow: Record<number, number> = {};
  const out: (ResolvedEff | null)[] = equip.map(() => null);
  const ctx = (i: number, prevX: number): SlotCtx => ({ i, defs, grow: grow[equip[i].id] ?? 0, prevX });
  // 育ち：今回の分をふくむ
  equip.forEach((e, i) => {
    const d = defs[i];
    if (!d?.grow) return;
    grow[e.id] = (opt.grow?.[e.id] ?? 0) + Math.round(d.grow(s) * (opt.growPow ?? 1));
  });
  const base = (i: number, prevX: number): ResolvedEff | null => {
    const e = equip[i];
    const d = defs[i];
    if (!d || !d.eval) return null;
    const v = extVal(e, d);
    if (d.toy && !s.toys.includes(d.toy)) {
      return { id: e.id, name: e.name, sub: `${d.name}：仕掛けがない`, kind: (d.kind as EffKind), amount: d.kind === 'xmult' || d.kind === 'row' ? 1 : 0, fired: false, img: e.img, fam: d.fam };
    }
    const r = d.eval(s, ctx(i, prevX), v);
    const kind = r.kind ?? (d.kind as EffKind);
    let amount = kind === 'chips' ? r.amount * s.unit : r.amount;
    // 上乗せ分を強める・弱める（Limited）
    let k = (opt.pow ?? 1) * (kind === 'xmult' || kind === 'row' ? opt.xPow ?? 1 : kind === 'mult' ? opt.multPow ?? 1 : 1);
    if (d.fragile && opt.fragilePow) k *= opt.fragilePow;
    if (k !== 1 && kind !== 'emblem') amount = kind === 'xmult' || kind === 'row' ? 1 + (amount - 1) * k : amount * k;
    const fired = kind === 'xmult' || kind === 'row' ? amount > 1.0001 && (kind !== 'row' || !!r.src) : amount > 0;
    const src = r.src ?? d.src;
    const old = opt.grow?.[e.id] ?? 0;
    return { id: e.id, name: e.name, sub: `${d.name}：${r.note}`, kind, amount, fired, img: e.img, src: src ?? undefined, fam: d.fam, grew: d.grow && (grow[e.id] ?? 0) > old ? grow[e.id] : undefined };
  };
  // 1 回目：リンクとしんがりでない品
  defs.forEach((d, i) => { if (d && d.kind !== 'again' && d.kind !== 'copy' && d.kind !== 'copyFirst' && d.series !== 6) out[i] = base(i, 1); });
  // 2 回目：左から。×倍率の積を数えながら、リンクとしんがりを解く
  let prevX = 1;
  const linked = (i: number, from: number, label: string): void => {
    const me = equip[i];
    const d = defs[i] as ExtDef;
    const f = out[from];
    const ok = from !== i && from >= 0 && !!f && f.fired && !!defs[from] && !['again', 'copy', 'copyFirst'].includes(defs[from]!.kind) && defs[from]!.series !== 6;
    out[i] = ok && f
      ? { ...f, id: me.id, name: me.name, sub: `${label}：${f.name}（${f.sub.split('：')[0]}）`, img: me.img, fam: d.fam, grew: undefined, broke: false }
      : { id: me.id, name: me.name, sub: `${label}：${from === i || from < 0 ? '写す品がない' : 'となりに効果がない'}`, kind: 'mult', amount: 0, fired: false, img: me.img, fam: d.fam };
  };
  for (let i = 0; i < equip.length; i += 1) {
    const d = defs[i];
    if (d?.kind === 'copy') linked(i, i + 1 < equip.length ? i + 1 : -1, d.name);
    else if (d?.kind === 'again') linked(i, i - 1, d.name);
    else if (d?.kind === 'copyFirst') linked(i, i === 0 ? -1 : 0, d.name);
    else if (d?.series === 6) out[i] = base(i, prevX);
    const o = out[i];
    if (o?.fired && o.kind === 'xmult') prevX *= o.amount;
  }
  // いちばん左・右（Limited）：発動しない／2 回
  const last = equip.length - 1;
  const off = (i: number): void => { const o = out[i]; if (o && i >= 0) out[i] = { ...o, fired: false, sub: `${o.sub.split('：')[0]}：Limited で止まった` }; };
  if (opt.leftOff) off(0);
  if (opt.rightOff && last > 0) off(last);
  // 壊れもの：効いたあと、決まった確率で壊れる（乱数があるときだけ）
  const broke: number[] = [];
  if (opt.rng) {
    equip.forEach((e, i) => {
      const d = defs[i];
      const o = out[i];
      const p = d?.fragile ?? opt.allFragile ?? 0;
      if (!p || !o?.fired) return;
      if (opt.rng!() < Math.min(0.95, p + (d?.fragile ? opt.fragileAdd ?? 0 : 0))) { o.broke = true; broke.push(e.id); }
    });
  }
  const twice = (i: number): ResolvedEff[] => {
    const o = out[i];
    if (!o) return [];
    const two = (i === 0 && opt.leftTwice) || (i === last && opt.rightTwice);
    return two && o.fired ? [o, { ...o, sub: `${o.sub.split('：')[0]}：2 回目`, grew: undefined, broke: false }] : [o];
  };
  const effs = equip.flatMap((_, i) => twice(i));
  const emblems = effs.filter((x) => x.kind === 'emblem' && x.fired).reduce((a, x) => a + x.amount, 0);
  return { effs, grow, broke, emblems };
}
