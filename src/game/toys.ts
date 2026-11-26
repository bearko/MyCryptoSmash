// 台の大きな仕掛け（おもちゃ）：ハイパーループ・大砲・ガチャマシン・ボスの城・13 球マルチボール・しゃべる顔・回転盤・ボスの反撃・
// つかむ手・捕まった球・出たり引っこむ的・上の小さな台・食べて吐く怪物・ゆれる UFO・磁石・倒れる的の壁。
// どれも ON/OFF を切りかえられる（あとでスキルツリーで解放する形にするかもしれないので、決めるのはここ 1 か所）。
// 置き場所は台のユニット（table.ts と同じ）。ぶつかる壁は足さず、ふれたら動きが変わる「場所」として作る（球がはさまらないように）。

import type { Save } from '../core/save';
import type { P } from './table';

export type ToyId = 'hyperloop' | 'cannon' | 'gacha' | 'castle' | 'mega13' | 'face' | 'disc' | 'hammer'
  | 'crane' | 'captive' | 'popup' | 'mini' | 'dino' | 'ufo' | 'magnet' | 'moai';
export const TOY_IDS: ToyId[] = ['hyperloop', 'cannon', 'gacha', 'castle', 'mega13', 'face', 'disc', 'hammer',
  'crane', 'captive', 'popup', 'mini', 'dino', 'ufo', 'magnet', 'moai'];
export const TOY_NAME: Record<ToyId, string> = {
  hyperloop: 'ハイパーループ', cannon: '大砲', gacha: 'ガチャマシン', castle: 'ボスの城',
  mega13: '13 球マルチボール', face: 'しゃべる顔', disc: '回転盤', hammer: 'ボスの反撃',
  crane: 'つかむ手', captive: '捕まった球', popup: '出たり引っこむ的', mini: '上の小さな台',
  dino: '食べて吐く怪物', ufo: 'ゆれる UFO', magnet: '磁石', moai: '倒れる的の壁',
};

/**
 * 仕掛けに使うマイクリの絵（エクステンションの ID）。scripts/sync-assets.mjs がこの表の番号の絵を写す。
 * 段階のあるもの（ピエロ・ティラノ・カエル・モアイ）は、台が進むほど上のレアリティの絵になる。
 */
export const TOY_ART = {
  face: [1063, 2063, 3063, 4063, 5063],
  cannon: [4074],
  castle: [5182],
  disc: [5038],
  hyperloop: [4192],
  hammer: [5034],
  crane: [1097],
  captive: [1143],
  popup: [1125, 2125, 3125, 4125, 5125],
  mini: [1118, 2118, 3118],
  dino: [1088, 2088, 3088, 4088, 5088],
  ufo: [5143],
  magnet: [1156],
  moai: [1106, 2106, 3106, 4106, 5106],
};
export const toyArt = (id: number): string => `mch/Image/Extensions/${id}.png`;
/** 台の番号に合った絵（10 台ごとに 1 段上がる） */
export const tierArt = (ids: number[], table: number): number => ids[Math.min(ids.length - 1, Math.max(0, Math.floor((table - 1) / 10)))];

/** どの仕掛けが台にあるか。いまは全部ある（スキルツリーで解放するときは、ここで save.up を見る） */
export function toysOf(save: Save): Record<ToyId, boolean> {
  const off = save.settings.toysOff ?? [];
  return Object.fromEntries(TOY_IDS.map((id) => [id, !off.includes(id)])) as Record<ToyId, boolean>;
}

/** ハイパーループ：光の輪。下の口に勢いよく入ると、輪を何周も回ってから出てくる */
export const HYPER = { x: 128, y: 450, r: 34, mouth: [128, 490] as P, lapSpeed: 1700 };
/** 大砲：入ると首を振る。引っぱって離すと、そのときの向きへ撃ち出す */
export const CANNON = { x: 600, y: 430, r: 16, auto: 3 };
/** ガチャマシン：ロックした球が中に見える（ロックの穴のそば） */
export const GACHA: P = [628, 650];
/** ボスの城：ボスの舞台のうしろ。跳ね橋（3 回当てると下りる）と、中へ入る口 */
export const CASTLE = { x: 360, y: 190, bridgeY: 270, halfW: 34, hits: 3 };
/** しゃべる顔（ピエロ）：まん中の飾りの場所。口が開いたときに入れると大当たり */
export const FACE = { x: 360, y: 365, mouthY: 386, mouthR: 18, every: 12, open: 4 };
/** 回転盤：下のまん中。乗った球の向きをずらす */
export const DISC = { x: 360, y: 975, r: 58, accel: 900, flip: 8 };
/** ボスの反撃：ボスがいる間、ときどき台を叩く（光で知らせて 1 秒後） */
export const HAMMER = { every: 10, warn: 1, reach: 220 };
/** 13 球マルチボール：その回のマルチボールが 3 の倍数回目なら、球が 13 個になる（短い間だけ） */
export const MEGA13 = { every: 3, balls: 13, time: 8 };

/** つかむ手：まん中の下の受け皿に入った球をつかみ、上まで運んで、3 つの賞のどれかへ落とす（傾けた側を選ぶ） */
export const CRANE = { cup: [360, 860] as P, r: 16, railY: 120, drops: [150, 360, 570], down: 0.35, lift: 1.1, end: 3.2 };
export const CRANE_PRIZE = ['GUM', 'LANE', 'LOCK'] as const;
/** 捕まった球：左の上のガラスの筒。下の口に当てると中の球が上がり、てっぺんまで届くと 1 回 */
export const CAPTIVE = { x: 230, y: 205, r: 16, len: 88, hits: 3 };
/** 出たり引っこむ的：床から出て、しばらくすると引っこむ。出ている間に当てると GUM */
export const POPUPS: P[] = [[120, 330], [600, 330], [215, 770], [505, 770]];
export const POPUP = { r: 15, up: 3.5, every: 2.2, all: 4 };
/** 上の小さな台：右の上の入口（エレベーター）から入る、フリッパー付きの小さな台。台の大きさは別の座標 */
export const MINI = { x: 490, y: 205, r: 18, w: 240, h: 300, br: 9, time: 10 };
export const MINI_BUMPERS: { x: number; y: number; r: number }[] = [{ x: 66, y: 96, r: 20 }, { x: 174, y: 96, r: 20 }, { x: 120, y: 168, r: 20 }];
/** 食べて吐く怪物：左の下。口に入った球をかんで（かむたびに GUM）、敵へ向けて吐き出す */
export const DINO = { x: 92, y: 818, mouth: [120, 834] as P, r: 22, chew: 3 };
/** ゆれる UFO：まん中でゆれて浮かぶ。3 回当てると開いて、光線で敵を撃つ */
export const UFO = { x: 360, y: 625, r: 22, sway: 40, hits: 3 };
/** 磁石：右の下。近くを通った球を止めて、ぐるぐる回してから投げる */
export const MAGNET = { x: 620, y: 800, r: 34, spin: 1.1 };
/** 倒れる的の壁：4 体のモアイ。全部倒すと金のモアイが出て、当てると大当たり */
export const MOAI = { xs: [300, 340, 380, 420], y: 800, r: 14, gold: 8 };
