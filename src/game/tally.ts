// GUM の集計（プレイのあとに発表する）。
// プレイ中は GUM を財布に入れず、どこで稼いだか（出どころ）ごとに「回数」と「基本額」をためておく。
// プレイが終わったら、基本額に倍率（スキル・装備のエクステンション・Limited・ヒーローの能力・取引）を順に掛けて、
// 最後の額を財布に入れる。発表の画面は src/ui/payout.ts。

/** GUM の出どころ */
export type GumSrc =
  | 'enemy' | 'boss' | 'bumper' | 'sling' | 'spin' | 'lane' | 'skill' | 'ramp' | 'loop' | 'jackpot' | 'light' | 'warp' | 'mystery'
  | 'hyperloop' | 'castle' | 'face' | 'crane' | 'captive' | 'popup' | 'mini' | 'dino' | 'ufo' | 'moai'
  | 'pyramid' | 'hero' | 'mods' | 'gumlane' | 'hammer';

export const SRC_INFO: Record<GumSrc, { name: string; color: string }> = {
  enemy: { name: '的（エネミー）', color: '#ff8f2e' },
  boss: { name: 'ボス', color: '#ff4f5e' },
  bumper: { name: 'バンパー', color: '#ff6ad5' },
  sling: { name: '三角のばね', color: '#6dffb0' },
  spin: { name: 'スピナー', color: '#9fe8ff' },
  lane: { name: 'レーン', color: '#ffd23f' },
  skill: { name: 'スキルショット', color: '#4fe07a' },
  ramp: { name: 'ランプ', color: '#ffd23f' },
  loop: { name: 'ループ', color: '#3fd0ff' },
  jackpot: { name: 'ジャックポット', color: '#ffe14d' },
  light: { name: '通り道のライト', color: '#ffffff' },
  warp: { name: 'ワープ', color: '#c08bff' },
  mystery: { name: 'ミステリー', color: '#ffd23f' },
  hyperloop: { name: 'ハイパーループ', color: '#3fd0ff' },
  castle: { name: 'ボスの城', color: '#ffd23f' },
  face: { name: 'ピエロの口', color: '#ff6ad5' },
  crane: { name: 'つかむ手', color: '#ffd23f' },
  captive: { name: '捕まった球', color: '#3fd0ff' },
  popup: { name: 'カエル', color: '#4fe07a' },
  mini: { name: '上の小さな台', color: '#c08bff' },
  dino: { name: '食べて吐く怪物', color: '#ff8f2e' },
  ufo: { name: 'UFO', color: '#6dffb0' },
  moai: { name: 'モアイ', color: '#ffd23f' },
  pyramid: { name: 'ピラミッド', color: '#ffd23f' },
  hero: { name: 'ヒーローのボーナス', color: '#ffe14d' },
  mods: { name: '改造のボーナス', color: '#ff8f2e' },
  gumlane: { name: 'G-U-M の大当たり', color: '#ffd23f' },
  hammer: { name: 'ボスの反撃', color: '#ff4f5e' },
};

/** プレイのあとに掛ける倍率（1 行ずつ発表する） */
export interface GumBoost { name: string; sub: string; mul: number; img?: string; color: string }

/** 装備のエクステンションのスコアの効果（発表で 1 つずつ見せる）。chips は GUM の額、mult は足す倍率、xmult は掛ける倍率 */
export interface ExtEffect { id: number; name: string; sub: string; kind: 'chips' | 'mult' | 'xmult'; amount: number; fired: boolean; img: string }

/** このプレイの集計 */
export class Tally {
  rows = new Map<GumSrc, { n: number; v: number }>();
  /** 回数を数えずに額だけ足す（GUM のかけらを拾った・あとから入る分） */
  add(src: GumSrc, v: number, n = 1): void {
    const r = this.rows.get(src) ?? { n: 0, v: 0 };
    r.n += n;
    r.v += v;
    this.rows.set(src, r);
  }
  get base(): number {
    let s = 0;
    for (const r of this.rows.values()) s += r.v;
    return s;
  }
  clear(): void { this.rows.clear(); }
  /** 発表する順：少ない額から（だんだん大きくなる）。額のないものは出さない */
  list(): { src: GumSrc; n: number; v: number }[] {
    return [...this.rows.entries()].filter(([, r]) => r.v > 0).map(([src, r]) => ({ src, ...r })).sort((a, b) => a.v - b.v);
  }
}

/** 倍率をすべて掛けた最後の額 */
export function payout(base: number, boosts: GumBoost[]): number {
  return boosts.reduce((a, b) => a * b.mul, base);
}

/**
 * 最後の額：基本額（出どころごと × 出どころの倍率）に、装備の効果を左から順に（+基本額・+倍率・×倍率）、
 * そのあと全体の倍率を掛ける。最後は 基本額 × 倍率（倍率は 1 から）。
 */
export function settle(rows: { src: GumSrc; v: number }[], rowBoosts: (GumBoost & { src: GumSrc })[], exts: ExtEffect[], all: GumBoost[]): { chips: number; mult: number; total: number } {
  let chips = rows.reduce((a, r) => a + r.v * (rowBoosts.find((b) => b.src === r.src)?.mul ?? 1), 0);
  let mult = 1;
  for (const e of exts) {
    if (!e.fired) continue;
    if (e.kind === 'chips') chips += e.amount;
    else if (e.kind === 'mult') mult += e.amount;
    else mult *= e.amount;
  }
  for (const b of all) mult *= b.mul;
  return { chips, mult, total: chips * mult };
}
