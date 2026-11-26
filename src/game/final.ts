// ラストステージ（ユーザーの指定：ジョーカーになったあとに始まる、それまでのボスが全部出てくるボスラッシュ。突破で脱出）。
// - レイドボス 5 体（10・20・30・40・50 台目のボス）が順に出る。ボスが出るたびに、そのボスの台の掟（offers.ts の RULES）がかかる。
// - 制限時間 FINAL_TIME 秒。全部倒すと脱出。3 回まで挑める（quota.ts の FINAL_TRIES。3 回とも失敗で GAME OVER）。
// - ボスの体力は、その時点の順当な装備（自動プレイ・素直に買う買い方でノルマ 10 まで進めた台）で 6〜7 割が突破できるように測って合わせた値。
// 台の動きは pinball.ts の startFinal・beginFloor・floorClear。

import { ruleOf, type RuleDef } from './offers';

/** 出てくる順のボス（そのボスが出る台の番号） */
export const FINAL_FLOORS = [10, 20, 30, 40, 50];
/** 制限時間（秒） */
export const FINAL_TIME = 90;
/**
 * ボスの体力（順に。攻撃力がはじめのヒーローくらいのとき）。後のボスほど硬い。
 * 順当な装備（スキルツリーなし）の自動プレイで、1 回の挑戦の 6〜7 割が突破できるように測った値。
 */
export const FINAL_HP = [37, 48, 59, 72, 85];
/** はじめのヒーローくらいの攻撃力（stats の atk × 色の威力の平均） */
export const FINAL_BASE_POWER = 6;
/**
 * 攻撃力に合わせた体力の倍率：攻撃力の比の平方根（強くなるほど楽になるが、一撃では終わらない）。
 * power は stats の atk × 色の威力の平均
 */
export const finalScale = (power: number): number => Math.max(1, Math.sqrt(Math.max(0, power) / FINAL_BASE_POWER));

export interface FinalBoss { floor: number; rule: RuleDef; hp: number }
/** i 体目（0〜4）のボス。power は攻撃力（finalScale） */
export function finalBoss(i: number, power = FINAL_BASE_POWER): FinalBoss {
  const k = Math.max(0, Math.min(FINAL_FLOORS.length - 1, i));
  const floor = FINAL_FLOORS[k];
  return { floor, rule: ruleOf(floor) as RuleDef, hp: FINAL_HP[k] * finalScale(power) };
}
