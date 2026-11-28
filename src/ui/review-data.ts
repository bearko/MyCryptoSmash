// ピエロのセリフの見直し用のデータ（scripts/review-lines.mjs が ?review=1 の画面から読む）。遊びには使わない。
// セリフの表はゲームが使うものをそのまま渡す（ここに写さない）。どの場面で出るかの説明もここに書く。

import { CLOWN_SCENES, CLOWN_TABLE, FINAL_LINES, NORMAL_END, TUTORIAL_LINES, TUTORIAL_SCENES, type ClownScene, type TutorialScene } from '../game/clown-lines';
import { CLOWN_NAME, CLOWN_STEPS } from '../game/toys';
import { INTRO_BEATS } from './intro';

/** 場面の名前と、いつ出るか */
export const CLOWN_SCENE_INFO: Record<ClownScene, { title: string; when: string }> = {
  title: { title: '台の前（ひとりごと）', when: '打ち出しを待つ台で、6 秒以上触らないと 16〜24 秒ごとに右上のピエロがつぶやく' },
  prePlay: { title: 'プレイの前（まだ足りない）', when: '台を見せたとき（打ち出しを待つ間）。ノルマに足りず、のこり 2 プレイ以上' },
  lastPlay: { title: 'プレイの前（最後の 1 プレイ）', when: '台を見せたとき。ノルマに足りず、のこり 1 プレイ' },
  ready: { title: 'プレイの前（もう納められる）', when: '台を見せたとき。手持ちでノルマを納められる' },
  deposit: { title: '入金口に納めた', when: 'RESULT の入金口で納めた直後（CLEAR の判の下）' },
  gimmick: { title: 'ギミックを買った', when: 'ショップでギミックを買った直後の NEW GIMMICK!（姿は買う前のもの）' },
  evolve: { title: 'ピエロの姿が上がった', when: 'ギミックの数で姿が上がった瞬間の進化の演出（姿は新しいもの）' },
  gameOver: { title: 'GAME OVER', when: 'ノルマを 3 プレイで納められなかったとき' },
};
export const TUTORIAL_INFO: Record<TutorialScene, { title: string; when: string }> = {
  launch: { title: '打ち出す', when: 'チュートリアルのはじめと、2・3 プレイ目の前（台を見せたとき）' },
  sling: { title: '③三角のばねを買う', when: '1 プレイ目のあと（RESULT・ショップ）' },
  inlane: { title: '④内側の通路を買う', when: '2 プレイ目のあと（RESULT・ショップ）' },
  bumper: { title: '⑦丸いばねを買う', when: 'ノルマ 0 を納めたあと（ごほうびのエンブレムで）' },
  again: { title: '買ったので次のプレイへ', when: '部品を買ったあと、台へ戻るまで' },
  deposit: { title: '入金口に納める', when: '3 プレイ目のあと（RESULT の入金口）' },
  gift: { title: '足りない分のおまけ', when: '3 プレイで 50 GUM に届かなかったとき（入金口で納めた直後）' },
  start: { title: '本当のノルマ 1 へ', when: 'チュートリアルを終えて台を見せたとき' },
};

export function reviewData(): unknown {
  return {
    tiers: CLOWN_NAME.map((name, i) => ({ name, toys: CLOWN_STEPS[i] })),
    clown: CLOWN_SCENES.map((sc) => ({ id: sc, ...CLOWN_SCENE_INFO[sc], tiers: CLOWN_TABLE.map((t) => t[sc]) })),
    tutorial: TUTORIAL_SCENES.map((sc) => ({ id: sc, ...TUTORIAL_INFO[sc], lines: TUTORIAL_LINES[sc] })),
    final: [
      { id: 'pre', title: 'ラストステージの前', when: 'ラストステージの台を見せたとき（{tries} はのこりの回数）', lines: FINAL_LINES.pre },
      { id: 'fail', title: 'ラストステージに失敗', when: 'ボスラッシュを倒しきれず、まだ挑めるとき', lines: FINAL_LINES.fail },
      { id: 'title', title: '（使っていない）', when: 'どこからも呼ばれていない', lines: FINAL_LINES.title },
    ],
    normal: (['door', 'hint'] as const).map((sc) => ({ id: sc, title: sc === 'door' ? '通常のエンディング：扉を開ける' : '通常のエンディング：次へのヒント', when: 'ジョーカーでないままノルマ 10 を納めたとき（姿 0〜3）', tiers: NORMAL_END.map((t) => t[sc]) })),
    intro: INTRO_BEATS.map((b) => ({ sc: b.sc, who: b.who ?? '', text: b.text })),
  };
}
