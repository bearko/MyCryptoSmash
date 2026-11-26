// プレイのあとに掛ける効果を組み立てる（純粋。PinballWorld.gumBoosts と、数値を測るときに使う）。
// 出どころの行の倍率（Limited）→ ヒート（Limited の印）→ 装備のエクステンション（左から）→ 全体の倍率（スキル・Limited・リーダーの能力・取引）。

import { cat, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import type { ExtEffect, GumBoost, GumSrc } from './tally';
import { awakeOf, heatPer, resolveExts, srcShort, type PlayStats } from './exts';
import { limitedOf, totalsOf, type ModTotals } from './mods';

export interface ScoreCtx {
  mods: ModTotals;
  /** 装備しているエクステンション（左から） */
  equip: Ext[];
  /** スキルツリーの GUM の倍率 */
  skillMul: number;
  /** リーダーの能力の GUM の倍率（倍率の供給・貯金箱。なければ null） */
  lead: { name: string; sub: string; mul: number; img: string } | null;
  /** 取引「このプレイの GUM ×2」 */
  gum2: boolean;
  /** 取引：このプレイだけヒートの印（倍率 ×2）・エクステンションの上乗せ分 ×(1+v) */
  offerHeat?: GumSrc[];
  offerPow?: number;
  /** 壊れものの判定の乱数（プレイのあとの発表で 1 回だけ） */
  rng?: () => number;
}
export interface ScoreBoosts { rows: (GumBoost & { src: GumSrc })[]; exts: ExtEffect[]; all: GumBoost[]; grow: Record<number, number>; broke: number[]; emblems: number; repaired: number }

export function scoreBoosts(save: Save, ps: PlayStats, c: ScoreCtx): ScoreBoosts {
  const rows: (GumBoost & { src: GumSrc })[] = [];
  const all: GumBoost[] = [];
  const lim = save.limited ?? [];
  // 出どころごと（同じ出どころの改造は足し合わせて 1 行）
  const ROW: { key: 'bumperGum' | 'slingGum' | 'spinGum' | 'lightPay'; src: GumSrc; label: string }[] = [
    { key: 'bumperGum', src: 'bumper', label: 'バンパー' },
    { key: 'slingGum', src: 'sling', label: '三角のばね' },
    { key: 'spinGum', src: 'spin', label: 'スピナー' },
    { key: 'lightPay', src: 'light', label: '通り道のライト' },
  ];
  for (const r of ROW) {
    const items: { name: string; img: string }[] = [];
    let add = 0;
    for (const id of lim) {
      const v = totalsOf([], [id])[r.key];
      const l = cat.limited.find((x) => x.id === id);
      if (v > 0 && l) { add += v; items.push({ name: l.name, img: l.img }); }
    }
    if (add > 0) rows.push({ src: r.src, name: items.map((x) => x.name).join('・'), sub: `${r.label}の GUM`, mul: 1 + add, img: items[0].img, color: '#ff6ad5' });
  }
  const exts: ExtEffect[] = [];
  // ヒート（Limited の印）：印の部品に当たるたびに倍率が上がる（装備の品の印は、その品の効果として出る）
  for (const src of (save.heat ?? []) as GumSrc[]) {
    const k = ps.n[src] ?? 0;
    const per = heatPer(src) * (1 + c.mods.heatAmp);
    const amount = k * per;
    exts.push({ id: 0, name: `ヒート：${srcShort(src)}`, sub: `${k} 回・1 回ごとに +${Math.round(per * 1000) / 1000}`, kind: 'mult', amount, fired: amount > 0, img: '', src, heat: true });
  }
  for (const src of c.offerHeat ?? []) {
    const k = ps.n[src] ?? 0;
    const per = heatPer(src) * 2;
    exts.push({ id: 0, name: `取引のヒート：${srcShort(src)}`, sub: `${k} 回・1 回ごとに +${Math.round(per * 1000) / 1000}`, kind: 'mult', amount: k * per, fired: k > 0, img: '', src, heat: true });
  }
  // 装備のエクステンション（左から順に）
  const m = c.mods;
  const res = resolveExts(c.equip, ps, {
    grow: save.extGrow ?? {}, rng: c.rng, fragileAdd: m.fragileAdd, fragilePow: m.fragilePow ? 1 + m.fragilePow : undefined,
    pow: (1 + m.extPow) * (1 + (c.offerPow ?? 0)) * awakeOf(ps.delivered), xPow: Math.max(0, 1 + m.extXPow), multPow: Math.max(0, 1 + m.extMultPow), allFragile: m.allFragile || undefined,
    growPow: 1 + m.growPow, leftTwice: m.leftTwice > 0, rightTwice: m.rightTwice > 0, leftOff: m.leftOff > 0, rightOff: m.rightOff > 0,
  });
  // 壊れものが直る（Limited。挑戦の間の回数まで）
  let repaired = 0;
  const repairLeft = Math.max(0, m.fragileRepair - (save.quota?.repaired ?? 0));
  while (res.broke.length && repaired < repairLeft) {
    const id = res.broke.shift() as number;
    const e = res.effs.find((x) => x.id === id && x.broke);
    if (e) { e.broke = false; e.repaired = true; }
    repaired += 1;
  }
  exts.push(...res.effs);
  if (c.skillMul > 1.0001) all.push({ name: 'スキルツリー', sub: 'GUM の枝・ヒーローのボーナス', mul: c.skillMul, img: cat.icons.gum, color: '#ffd23f' });
  for (const id of lim) {
    const t = totalsOf([], [id]);
    const l = cat.limited.find((x) => x.id === id);
    if (!l) continue;
    if (t.gumPct > 0) all.push({ name: l.name, sub: 'Limited', mul: 1 + t.gumPct, img: l.img, color: '#ff8f2e' });
    if (t.souvenir > 0) all.push({ name: l.name, sub: 'Limited：おみやげ', mul: 1 + t.souvenir, img: l.img, color: '#ff8f2e' });
    const d = limitedOf(id);
    const push = (mul: number, sub: string): void => { if (Math.abs(mul - 1) > 1e-4) all.push({ name: l.name, sub: `Limited：${sub}`, mul, img: l.img, color: mul >= 1 ? '#ff8f2e' : '#ff4f5e' }); };
    if (d.gum) push(d.gum, `GUM ×${d.gum}`);
    if (t.bossPlayX && ps.bosses > 0) push(1 + t.bossPlayX, 'ボスを倒した');
    if (t.noDrainX && ps.drains === 0) push(1 + t.noDrainX, '球を全部は落とさなかった');
    if (t.drainX && ps.drains > 0) push(1 - t.drainX, '球を全部落とした');
    if (t.lastPlayX && ps.played >= 3) push(1 + t.lastPlayX, '3 プレイ目');
    if (t.otherPlayX && ps.played < 3) push(1 - t.otherPlayX, `${ps.played} プレイ目`);
  }
  if (c.lead) {
    all.push({ ...c.lead, color: '#3fd0ff' });
    // Limited「おうむ返し」：リーダーの能力がもう 1 回
    if (c.mods.leaderTwice) all.push({ ...c.lead, sub: `${c.lead.sub}（2 回目）`, color: '#3fd0ff' });
  }
  if (c.gum2) all.push({ name: '取引', sub: 'このプレイの GUM ×2', mul: 2, img: cat.icons.gum, color: '#c08bff' });
  return { rows, exts, all, grow: res.grow, broke: res.broke, emblems: res.emblems, repaired };
}
