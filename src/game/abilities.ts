// ヒーローの能力：どのヒーロー（球）にも 1 つ。いちばん高い能力値（体力・知力・素早さ）で系統が決まり、
// その中のどれかを ID で固定して当てる（同じヒーローはいつも同じ能力）。レアリティで強さが決まる（★1 で 1、★5 で 2.2）。
// リーダー（自分の球）の能力はいつも効き、強さ ×1.5。控えの能力は、そのヒーローの球が台に出ている間だけ効く
// （控えはリーダーに続いて打ち出される。落ちると、次に打ち出し直すまで効かない）。

import type { Hero } from '../core/catalog';

export type AbilityId =
  | 'heavy' | 'thunder' | 'gambler' | 'split' | 'bounce' | 'shield'
  | 'paint' | 'cashback' | 'recharge' | 'mimic' | 'piggy' | 'jackpot'
  | 'light' | 'wind' | 'homing' | 'gate' | 'feeder';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** 系統：体力・知力・素早さ */
  family: 'phy' | 'int' | 'agi';
  text: (k: number) => string;
}
const pct = (v: number): string => `${Math.round(v * 100)}%`;
export const ABILITIES: AbilityDef[] = [
  { id: 'heavy', family: 'phy', name: '重い球', text: (k) => `坂で少し重くなるかわりに、的への攻撃 +${pct(0.5 * k)}` },
  { id: 'thunder', family: 'phy', name: '雷の球', text: () => 'バンパーに当たると、まわりの的に電撃' },
  { id: 'gambler', family: 'phy', name: '大当たり狙い', text: (k) => `ランプを通ったあと 3 秒、攻撃 +${pct(1.5 * k)}（ほかは −15%）` },
  { id: 'split', family: 'phy', name: '分裂', text: () => 'バンパーに 10 回当たるごとに、自分の分身が 1 つ出る' },
  { id: 'bounce', family: 'phy', name: '跳ね返り', text: () => '1 プレイに 1 回、落ちかけたら跳ね戻る' },
  { id: 'shield', family: 'phy', name: '守りの球', text: (k) => `ボールセーブの時間 +${(1.5 * k).toFixed(1)} 秒` },
  { id: 'paint', family: 'int', name: '塗り', text: (k) => `当たった的を、いまの攻撃の色の弱点に塗る（${pct(Math.min(1, 0.3 * k))}）` },
  { id: 'cashback', family: 'int', name: '色で還元', text: (k) => `弱点を突いて的を倒すと GUM +${pct(0.3 * k)}` },
  { id: 'recharge', family: 'int', name: '再充填', text: () => '緑（貫通）で的を倒すと、キックバックが点き直し、ボールセーブがのびる' },
  { id: 'mimic', family: 'int', name: 'まね', text: () => '編成でとなり（次）にいるヒーローの能力をまねる' },
  { id: 'piggy', family: 'int', name: '貯金箱', text: (k) => `持っている GUM の桁 1 つごとに GUM +${pct(0.02 * k)}` },
  { id: 'jackpot', family: 'int', name: '大当たりの目', text: (k) => `ジャックポット・ランプ・ループの GUM +${pct(0.5 * k)}` },
  { id: 'light', family: 'agi', name: '軽い球', text: (k) => `坂の重さ −${pct(Math.min(0.3, 0.1 * k))}。長く台の上にいられる` },
  { id: 'wind', family: 'agi', name: '風の球', text: (k) => `ブースターとループでさらに加速し、2 秒間の攻撃 +${pct(0.5 * k)}` },
  { id: 'homing', family: 'agi', name: 'ゆるい誘導', text: () => '近くの的へ少し曲がる' },
  { id: 'gate', family: 'agi', name: '入口好き', text: (k) => `ブラックホールとピラミッドの入口に吸われやすい（×${(1 + 0.3 * k).toFixed(1)}）` },
  { id: 'feeder', family: 'agi', name: '倍率の供給', text: (k) => `台に出ているだけで GUM +${pct(0.1 * k)}` },
];
export const abilityById = (id: AbilityId): AbilityDef => ABILITIES.find((a) => a.id === id) as AbilityDef;
/**
 * その能力が働くのに要る台のギミック（toys.ts の ToyId。どれか 1 つあれば働く）。台にないと空回りするので、画面で「台に〜が要る」と出すのに使う
 */
export const ABILITY_TOYS: Partial<Record<AbilityId, string[]>> = {
  thunder: ['bumper'], split: ['bumper'], gambler: ['ramp'], recharge: ['targets'], paint: ['targets'], cashback: ['targets'], homing: ['targets'],
  jackpot: ['loop', 'ramp'], wind: ['booster', 'loop'], gate: ['hole'],
};
/** その能力が、持っているギミックの台で働くか */
export const abilityReady = (id: AbilityId, own: readonly string[]): boolean => (ABILITY_TOYS[id] ?? []).length === 0 || (ABILITY_TOYS[id] ?? []).some((t) => own.includes(t));

/** ヒーロー → 能力（同じヒーローはいつも同じ） */
export function abilityOf(h: Hero): AbilityDef {
  const fam: AbilityDef['family'] = h.phy >= h.int && h.phy >= h.agi ? 'phy' : h.int >= h.agi ? 'int' : 'agi';
  const list = ABILITIES.filter((a) => a.family === fam);
  return list[(h.id * 13 + 7) % list.length];
}
/** 強さ：★1 で 1、★5 で 2.2。リーダーは ×1.5 */
export function abilityPower(h: Hero, leader: boolean): number {
  return (1 + 0.3 * (Math.max(1, Math.min(5, h.rarity)) - 1)) * (leader ? 1.5 : 1);
}
/** まねを解いた能力（まねる相手がまね・いなければ、まね自身＝何もしない） */
export function resolveAbility(party: Hero[], i: number): AbilityDef {
  const a = abilityOf(party[i]);
  if (a.id !== 'mimic') return a;
  const next = party[(i + 1) % party.length];
  if (!next || next === party[i]) return a;
  const b = abilityOf(next);
  return b.id === 'mimic' ? a : b;
}
