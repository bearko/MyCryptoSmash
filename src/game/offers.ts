// オファー：ミステリーのホールで、ときどき実況が持ちかける取引。いいことと悪いことがセットで、受けるか断るかを選ぶ。
// 効き目はそのプレイの間だけ。弱点以外の攻撃を半分にする、のような「半減」は使わない（攻撃の色の決まり）。
//
// ボス台の掟：10・20・30・40・50 台（レイドボスの台）に入ると、台が 1 つ意地悪に変わる。突破すると、次にノルマを納めたときの Limited の候補が 1 枚多い。

export type OfferId = 'gum2' | 'bumper3' | 'limited2' | 'multi' | 'time8' | 'atk';
export interface OfferDef { id: OfferId; good: string; bad: string }
export const OFFERS: OfferDef[] = [
  { id: 'gum2', good: 'このプレイの GUM ×2', bad: 'このプレイの間、キックバックがなくなる' },
  { id: 'bumper3', good: 'このプレイのバンパーの GUM ×3', bad: '赤（傾き）以外でバンパーに当てても GUM が出ない' },
  { id: 'limited2', good: '次にノルマを納めたとき、Limited をもう 1 つ選べる', bad: 'のこり時間 −5 秒' },
  { id: 'multi', good: 'いますぐマルチボール', bad: 'このプレイの間、ボールセーブがきかない' },
  { id: 'time8', good: 'のこり時間 +8 秒', bad: '装備したエクステンションが 1 つ、このプレイの間だけ外れる' },
  { id: 'atk', good: 'このプレイの的への攻撃 +50%', bad: '坂が 15% 重くなる' },
];
export const offerById = (id: OfferId): OfferDef => OFFERS.find((o) => o.id === id) as OfferDef;
/** ミステリーのホールに入ったとき、オファーが来る確率と、1 プレイの上限 */
export const OFFER_CHANCE = 0.3;
export const OFFER_MAX = 2;

export type RuleId = 'shortFlip' | 'steep' | 'dark' | 'reverse';
export interface RuleDef { id: RuleId; name: string; text: string }
export const RULES: RuleDef[] = [
  { id: 'shortFlip', name: 'SHORT FLIPPERS', text: '下のフリッパーが短い' },
  { id: 'steep', name: 'STEEP TABLE', text: '坂が急（球が速く落ちる）' },
  { id: 'dark', name: 'BLACKOUT', text: '通り道のライトが消えて、ごほうびが出ない' },
  { id: 'reverse', name: 'REVERSE', text: '傾けると、反対へ曲がる' },
];
export const ruleById = (id: RuleId): RuleDef => RULES.find((r) => r.id === id) as RuleDef;
/** その台の掟（レイドボスの台だけ。台ごとに決まっている） */
export function ruleOf(floor: number): RuleDef | null {
  if (floor % 10 !== 0) return null;
  return RULES[(floor / 10 - 1) % RULES.length];
}
