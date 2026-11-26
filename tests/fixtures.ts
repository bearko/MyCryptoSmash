// テストの共通の準備。
import { freshSave, type Save } from '../src/core/save';
import { PART_TOYS, type ToyId } from '../src/game/toys';

/**
 * 基本の部品（三角のばね・バンパー・レーン・ランプ・…）を全部付けた台で、チュートリアルを終えてノルマ 1 にいるセーブ。
 * 前の版の「はじめから部品が全部ある台」と同じ（部品ごとの動きを見るテスト用）。toys を渡すと、その仕掛けも付ける
 */
export function partsSave(hero: number, toys: ToyId[] = []): Save {
  const s = freshSave(hero);
  s.toys = [...PART_TOYS, ...toys];
  s.quota.n = 1;
  s.quota.guide = false;
  s.tutorialDone = true;
  return s;
}
