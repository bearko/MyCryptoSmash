// 攻撃の色（3 すくみ）
//
// - 赤：傾き。押しつけている間、近くの敵に連続で当たる
// - 青：振り。広がる波で、範囲の中の敵全員に当たる
// - 緑：引っぱり。まっすぐ突き抜けて、線の上の敵全員に当たる
//
// 赤い敵は青に弱く、青い敵は緑に弱く、緑の敵は赤に弱い。

export type Elem = 'red' | 'blue' | 'green';
export const ELEMS: Elem[] = ['red', 'blue', 'green'];

export const ELEM_COLOR: Record<Elem, string> = { red: '#ff4f5e', blue: '#3fa9ff', green: '#4fe07a' };
export const ELEM_NAME: Record<Elem, string> = { red: '赤', blue: '青', green: '緑' };
export const ELEM_ATTACK: Record<Elem, string> = { red: '連続', blue: '範囲', green: '貫通' };

/** この色の敵に効く攻撃の色 */
export const WEAK_TO: Record<Elem, Elem> = { red: 'blue', blue: 'green', green: 'red' };

export const WEAK_MUL = 2.5;
export const SAME_MUL = 0.5;

/** 攻撃の色 → 敵の色 のダメージ倍率 */
export function affinity(attack: Elem, enemy: Elem): number {
  if (WEAK_TO[enemy] === attack) return WEAK_MUL;
  if (attack === enemy) return SAME_MUL;
  return 1;
}
