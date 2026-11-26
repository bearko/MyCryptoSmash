// 台の大きな仕掛け（おもちゃ）：ハイパーループ・大砲・ガチャマシン・ボスの城・13 球マルチボール・しゃべる顔・回転盤・ボスの反撃。
// どれも ON/OFF を切りかえられる（あとでスキルツリーで解放する形にするかもしれないので、決めるのはここ 1 か所）。
// 置き場所は台のユニット（table.ts と同じ）。ぶつかる壁は足さず、ふれたら動きが変わる「場所」として作る（球がはさまらないように）。

import type { Save } from '../core/save';
import type { P } from './table';

export type ToyId = 'hyperloop' | 'cannon' | 'gacha' | 'castle' | 'mega13' | 'face' | 'disc' | 'hammer';
export const TOY_IDS: ToyId[] = ['hyperloop', 'cannon', 'gacha', 'castle', 'mega13', 'face', 'disc', 'hammer'];
export const TOY_NAME: Record<ToyId, string> = {
  hyperloop: 'ハイパーループ', cannon: '大砲', gacha: 'ガチャマシン', castle: 'ボスの城',
  mega13: '13 球マルチボール', face: 'しゃべる顔', disc: '回転盤', hammer: 'ボスの反撃',
};

/** どの仕掛けが台にあるか。いまは全部ある（スキルツリーで解放するときは、ここで save.up を見る） */
export function toysOf(save: Save): Record<ToyId, boolean> {
  const off = save.settings.toysOff ?? [];
  return Object.fromEntries(TOY_IDS.map((id) => [id, !off.includes(id)])) as Record<ToyId, boolean>;
}

/** ハイパーループ：光の輪。下の口に勢いよく入ると、輪を何周も回ってから出てくる */
export const HYPER = { x: 128, y: 450, r: 34, mouth: [128, 490] as P, lapSpeed: 1700 };
/** 大砲：入ると首を振る。引っぱって離すと、そのときの向きへ撃ち出す */
export const CANNON = { x: 600, y: 430, r: 16 };
/** ガチャマシン：ロックした球が中に見える（ロックの穴のそば） */
export const GACHA: P = [628, 650];
/** ボスの城：ボスの舞台のうしろ。跳ね橋（3 回当てると下りる）と、中へ入る口 */
export const CASTLE = { x: 360, y: 190, bridgeY: 270, halfW: 34, hits: 3 };
/** しゃべる顔：まん中の飾りの場所。口が開いたときに入れると大当たり */
export const FACE = { x: 360, y: 365, mouthY: 386, mouthR: 18, every: 12, open: 4 };
/** 回転盤：下のまん中。乗った球の向きをずらす */
export const DISC = { x: 360, y: 975, r: 58, accel: 900, flip: 8 };
/** ボスの反撃：ボスがいる間、ときどき台を叩く（光で知らせて 1 秒後） */
export const HAMMER = { every: 10, warn: 1, reach: 220 };
/** 13 球マルチボール：その回のマルチボールが 3 の倍数回目なら、球が 13 個になる（短い間だけ） */
export const MEGA13 = { every: 3, balls: 13, time: 8 };
