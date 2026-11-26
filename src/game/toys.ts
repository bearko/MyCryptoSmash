// 台の大きな仕掛け（おもちゃ）：ハイパーループ・大砲・ガチャマシン・ボスの城・13 球マルチボール・しゃべる顔・回転盤・ボスの反撃・
// つかむ手・捕まった球・出たり引っこむ的・上の小さな台・食べて吐く怪物・ゆれる UFO・磁石・倒れる的の壁。
// 挑戦のはじめは 1 つもない（古ぼけた台）。ショップのギミックの節でエンブレムを払って買い足す（ノルマを納めるたびに買える種類が増える）。
// 台に出るかどうかは toysOf の 1 か所で決める。持っている仕掛けの数で、台に宿るピエロの姿（レアリティ）が上がる。
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
 * ピエロ（face）は、持っている仕掛けの数で決まるピエロの姿（clownTier）の絵。実況のピエロもこの絵を使う。
 * ティラノは台が進むほど上のレアリティの絵になる。カエル・モアイは段階の絵を並べて使う。
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
  /** ショップの札だけに使う（台の上では図形で描く） */
  gacha: [1119],
  mega13: [4143],
};
export const toyArt = (id: number): string => `mch/Image/Extensions/${id}.png`;
/** 台の番号に合った絵（10 台ごとに 1 段上がる） */
export const tierArt = (ids: number[], table: number): number => ids[Math.min(ids.length - 1, Math.max(0, Math.floor((table - 1) / 10)))];

/** どの仕掛けが台にあるか：この挑戦で買った仕掛け（save.toys）だけ。設定の toysOff は、持っている仕掛けを切るためだけに使う */
export function toysOf(save: Save): Record<ToyId, boolean> {
  const off = save.settings.toysOff ?? [];
  const own = save.toys ?? [];
  return Object.fromEntries(TOY_IDS.map((id) => [id, own.includes(id) && !off.includes(id)])) as Record<ToyId, boolean>;
}

// ---------------------------------------------------------------- ギミックのショップ（エンブレムで買い足す）
/**
 * 買える順番（ノルマを納めるたびに解放される）。地味で分かりやすいものを先に、派手で強いものを後に。
 * はじめは TOY_START 種、ノルマを 1 つ納めるたびに TOY_PER_QUOTA 種ずつ増える（ノルマ 7 を納めると全部）。
 */
export const TOY_UNLOCK: ToyId[] = ['popup', 'moai', 'captive', 'hammer', 'disc', 'gacha', 'magnet', 'crane', 'face', 'dino',
  'hyperloop', 'cannon', 'ufo', 'castle', 'mini', 'mega13'];
export const TOY_START = 3;
export const TOY_PER_QUOTA = 2;
/**
 * 値段（エンブレム）：後で解放されるものほど高い。
 * 素直な買い方で、ジョーカー（10 個）に届くのがノルマ 8〜9 のころになるように合わせた（全部で 98。安い順に 10 個で 42）
 */
export const TOY_PRICE: Record<ToyId, number> = {
  popup: 3, moai: 3, captive: 3, disc: 4, gacha: 4, magnet: 5, crane: 5, face: 6, dino: 6,
  hyperloop: 7, hammer: 3, cannon: 8, ufo: 8, castle: 10, mini: 11, mega13: 12,
};
/** ショップの札の短い説明（くわしくは parts.ts） */
export const TOY_SHORT: Record<ToyId, string> = {
  popup: '床からカエルが出たり引っこむ。出ている間に当てると GUM、4 匹で FROG PARTY',
  moai: '4 体のモアイ。全部倒すと金のモアイが出て大当たり',
  captive: 'ガラスの筒の球を突き上げる。3 回てっぺんで大当たりとフレンジー',
  disc: '下のまん中の回る円盤。乗った球の向きをずらす',
  gacha: 'ロックした球がカプセルで見える。マルチボールでノブが回る',
  magnet: '近くの球を止めて回し、UFO・入口・敵へ投げる',
  crane: '受け皿の球をつかんで運び、3 つの賞へ落とす',
  face: 'まん中のピエロの顔。口が開いたときに入れると BIG MOUTH',
  dino: '口に入った球をかんで GUM、敵へ向けて吐き出す',
  hyperloop: '光の輪に勢いよく入ると何周も回る。1 周ごとに GUM',
  hammer: 'ボスがときどき台を叩く。輪の中で跳ねた球に大きな GUM',
  cannon: '入った球を止めて首を振る。引っぱって離すと撃ち出す',
  ufo: '3 回当てると開いて、光線で敵を撃つ',
  castle: 'ボスの城。跳ね橋を下ろして中へ打ちこむとボスに大ダメージ',
  mini: '上の小さな台へ。フリッパー付きの台で 10 秒遊ぶ',
  mega13: '3 回に 1 回のマルチボールは、球が 13 個になる',
};
/** ギミックの札の候補の数 */
export const TOY_OFFERS = 3;
/** ノルマ n（いまのノルマ。n − 1 個を納めた）のときに買える種類 */
export function toysUnlocked(quotaN: number): ToyId[] {
  return TOY_UNLOCK.slice(0, Math.min(TOY_UNLOCK.length, TOY_START + TOY_PER_QUOTA * Math.max(0, quotaN - 1)));
}
/** ギミックの候補を引く（解放ずみでまだ持っていないものから TOY_OFFERS 個まで） */
export function rollToyShop(save: Save, rng: () => number = Math.random): void {
  const pool = toysUnlocked(save.quota.n).filter((id) => !save.toys.includes(id));
  const out: ToyId[] = [];
  while (pool.length && out.length < TOY_OFFERS) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  save.toyShop = out;
}
/** 候補がなければ引く（force なら引き直す） */
export function restockToys(save: Save, force = false, rng: () => number = Math.random): void {
  save.toyShop = (save.toyShop ?? []).filter((id) => TOY_IDS.includes(id));
  if (force || !save.toyShop.some((id) => !save.toys.includes(id))) rollToyShop(save, rng);
}
/** ギミックを買う（候補にあって、解放ずみで、エンブレムが足りれば true） */
export function buyToy(save: Save, id: ToyId, discount = 0): boolean {
  if (save.toys.includes(id) || !save.toyShop.includes(id) || !toysUnlocked(save.quota.n).includes(id)) return false;
  const price = Math.max(1, TOY_PRICE[id] - discount);
  if (save.emblems < price) return false;
  save.emblems -= price;
  save.toys.push(id);
  return true;
}

// ---------------------------------------------------------------- 台に宿るピエロ（持っている仕掛けの数で姿が上がる）
/** 姿が上がる仕掛けの数：ピエロ（コモン）→ エリートピエロ → ウィズダムピエロ → アルルカン → ジョーカー */
export const CLOWN_STEPS = [0, 2, 4, 7, 10];
export const CLOWN_NAME = ['ピエロ', 'エリートピエロ', 'ウィズダムピエロ', 'アルルカン', 'ジョーカー'];
export const CLOWN_RARITY = ['コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
/** 持っている仕掛けの数から、ピエロの段階（0〜4） */
export function clownTier(count: number): number {
  let t = 0;
  CLOWN_STEPS.forEach((n, i) => { if (count >= n) t = i; });
  return t;
}
/** 次の姿まであと何個（ジョーカーなら null） */
export function clownNext(count: number): number | null {
  const t = clownTier(count);
  return t >= CLOWN_STEPS.length - 1 ? null : CLOWN_STEPS[t + 1] - count;
}
/** ピエロの絵（段階 0〜4） */
export const clownArt = (tier: number): string => toyArt(TOY_ART.face[Math.max(0, Math.min(TOY_ART.face.length - 1, tier))]);
/** セーブから、いまのピエロの段階 */
export const clownOf = (save: Save): number => clownTier((save.toys ?? []).length);

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
/** gum：輪の中で叩かれて跳ねた球 1 つの基本額（的何体ぶん。まん中ほど多い） */
export const HAMMER = { every: 10, warn: 1, reach: 220, gum: 14 };
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
