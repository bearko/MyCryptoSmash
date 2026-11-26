// 台のギミック（買い足すもの）：基本の部品と、大きな仕掛け（おもちゃ）。
//
// 挑戦のはじめの台は「打ち出し」と「フリッパー」だけ（ユーザーの指定）。ほかの部品（三角のばね・内側の通路・丸いばね・…・
// 通り道のライト・ZONE・ボールセーブ）も、ハイパーループ・大砲などの大きな仕掛けも、ショップのギミックの節でエンブレムを払って買い足す。
// ノルマを納めるたびに買える種類が増える（TOY_UNLOCK・TOY_UNLOCK_AT）。部品どうしで「先に要る」ものは TOY_NEEDS。
// 台に出るかどうかは toysOf の 1 か所で決める。持っているギミックの数（部品もふくむ）で、台に宿るピエロの姿（レアリティ）が上がる。
// チュートリアル（ノルマ 0）では、三角のばね・内側の通路・丸いばねを 1 つずつ買って台を育てる流れを案内する（TUTORIAL_PARTS・tutorialShop）。
// 大きな仕掛けの置き場所は台のユニット（table.ts と同じ）。ぶつかる壁は足さず、ふれたら動きが変わる「場所」として作る（球がはさまらないように）。

import type { Save } from '../core/save';
import type { P } from './table';

/** 基本の部品（parts.ts の id と同じ文字。打ち出し plunger・フリッパー flipper ははじめからあるので入れない。ピラミッドの入口 gate は本編では売らない） */
export type PartToyId = 'sling' | 'inlane' | 'outlane' | 'kickback' | 'bumper' | 'spinner' | 'loop' | 'ramp' | 'lanes' | 'targets'
  | 'lock' | 'mystery' | 'multi' | 'jackpot' | 'save' | 'warp' | 'booster' | 'hole' | 'star' | 'lights' | 'zone';
/** 大きな仕掛け */
export type BigToyId = 'hyperloop' | 'cannon' | 'gacha' | 'castle' | 'mega13' | 'face' | 'disc' | 'hammer'
  | 'crane' | 'captive' | 'popup' | 'mini' | 'dino' | 'ufo' | 'magnet' | 'moai';
export type ToyId = PartToyId | BigToyId;
export const PART_TOYS: PartToyId[] = ['sling', 'inlane', 'outlane', 'kickback', 'bumper', 'spinner', 'loop', 'ramp', 'lanes', 'targets',
  'lock', 'mystery', 'multi', 'jackpot', 'save', 'warp', 'booster', 'hole', 'star', 'lights', 'zone'];
export const BIG_TOYS: BigToyId[] = ['hyperloop', 'cannon', 'gacha', 'castle', 'mega13', 'face', 'disc', 'hammer',
  'crane', 'captive', 'popup', 'mini', 'dino', 'ufo', 'magnet', 'moai'];
export const TOY_IDS: ToyId[] = [...PART_TOYS, ...BIG_TOYS];
export const isPartToy = (id: string): id is PartToyId => (PART_TOYS as string[]).includes(id);
export const TOY_NAME: Record<ToyId, string> = {
  sling: '三角のばね', inlane: '内側の通路', outlane: '外側の通路', kickback: '打ち戻し', bumper: '丸いばね', spinner: '回転板',
  loop: '左右の通路', ramp: 'ワイヤーの坂', lanes: '上の 3 本の道', targets: '倒れる的', lock: '球をためる穴', mystery: 'なぞの穴',
  multi: '球が増える', jackpot: '大当たり', save: '落ちても戻る', warp: '瞬間移動', booster: '緑の矢印', hole: '渦を巻く穴',
  star: '浮かぶ星', lights: '小さなライト', zone: '連鎖の最高潮',
  hyperloop: 'ハイパーループ', cannon: '大砲', gacha: 'ガチャマシン', castle: 'ボスの城',
  mega13: '13 球マルチボール', face: 'しゃべる顔', disc: '回転盤', hammer: 'ボスの反撃',
  crane: 'つかむ手', captive: '捕まった球', popup: '出たり引っこむ的', mini: '上の小さな台',
  dino: '食べて吐く怪物', ufo: 'ゆれる UFO', magnet: '磁石', moai: '倒れる的の壁',
};

/**
 * ギミックに使うマイクリの絵（エクステンションの ID）。scripts/sync-assets.mjs がこの表の番号の絵を写す。
 * ピエロ（face）は、持っているギミックの数で決まるピエロの姿（clownTier）の絵。実況のピエロもこの絵を使う。
 * ティラノは台が進むほど上のレアリティの絵になる。カエル・モアイは段階の絵を並べて使う。
 * 基本の部品の絵はショップの札だけに使う（台の上では図形で描く）。
 */
export const TOY_ART: Record<ToyId, number[]> = {
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
  sling: [3035],
  inlane: [4096],
  outlane: [4031],
  kickback: [3020],
  bumper: [5071],
  spinner: [4032],
  loop: [4021],
  ramp: [4005],
  lanes: [4036],
  targets: [5013],
  lock: [4111],
  mystery: [4178],
  multi: [3143],
  jackpot: [5030],
  save: [5010],
  warp: [4150],
  booster: [4080],
  hole: [5086],
  star: [5150],
  lights: [3150],
  zone: [5104],
};
export const toyArt = (id: number): string => `mch/Image/Extensions/${id}.png`;
/** 台の番号に合った絵（10 台ごとに 1 段上がる） */
export const tierArt = (ids: number[], table: number): number => ids[Math.min(ids.length - 1, Math.max(0, Math.floor((table - 1) / 10)))];

/** どのギミックが台にあるか：この挑戦で買ったもの（save.toys）だけ。設定の toysOff は、持っている仕掛けを切るためだけに使う */
export function toysOf(save: Save): Record<ToyId, boolean> {
  const off = save.settings.toysOff ?? [];
  const own = save.toys ?? [];
  return Object.fromEntries(TOY_IDS.map((id) => [id, own.includes(id) && !off.includes(id)])) as Record<ToyId, boolean>;
}

/**
 * GUM の出どころ（tally.ts の GumSrc）→ それを出すギミック。ヒートの印を付けられる部品や、エクステンションの「この仕掛けが要る」に使う。
 * null ははじめからある部品（フリッパー・打ち出し・ふち）
 */
export const SRC_TOY: Record<string, ToyId | null> = {
  bumper: 'bumper', sling: 'sling', spin: 'spinner', lane: 'lanes', gumlane: 'lanes', ramp: 'ramp', loop: 'loop', jackpot: 'jackpot',
  light: 'lights', booster: 'booster', enemy: 'targets', boss: 'targets', mystery: 'mystery', warp: 'warp', inlane: 'inlane', outlane: 'outlane',
  hyperloop: 'hyperloop', castle: 'castle', face: 'face', crane: 'crane', captive: 'captive', popup: 'popup', mini: 'mini',
  dino: 'dino', ufo: 'ufo', moai: 'moai', hammer: 'hammer',
  flipper: null, plunger: null, wall: null,
};
/** その出どころが、持っているギミックの台にあるか（知らない出どころは「ある」） */
export function srcOnTable(own: readonly string[], src: string): boolean {
  const t = SRC_TOY[src];
  return t === undefined || t === null || own.includes(t);
}

/**
 * 先に要るギミック（これを持っていないと買えない。動きが前のギミックにつながっているもの）。
 * 打ち戻しは外側の通路に、マルチボールはロックに、ジャックポットはマルチボール中のループに、
 * ガチャマシンはロックに、13 球マルチボールはマルチボールに、ボスの城・ボスの反撃はボス（倒れる的を全部倒すと出る）に。
 */
export const TOY_NEEDS: Partial<Record<ToyId, ToyId[]>> = {
  kickback: ['outlane'], multi: ['lock'], jackpot: ['multi', 'loop'],
  gacha: ['lock'], mega13: ['multi'], castle: ['targets'], hammer: ['targets'],
};
/** 先に要るギミックをそろえているか */
export const toyReady = (own: readonly string[], id: ToyId): boolean => (TOY_NEEDS[id] ?? []).every((x) => own.includes(x));

// ---------------------------------------------------------------- ギミックのショップ（エンブレムで買い足す）
/**
 * 買える順番（ノルマを納めるたびに解放される）。基本の部品が先、派手な仕掛けが後。先に要るギミックは必ず前に置く。
 * 最初の 3 つはチュートリアル（ノルマ 0）で 1 つずつ買う部品。
 */
export const TOY_UNLOCK: ToyId[] = [
  // ノルマ 0（チュートリアル）
  'sling', 'inlane', 'bumper',
  // ノルマ 1（的・G-U-M のレーン・ループ：大当たりの芯になる部品を先に）
  'targets', 'lanes', 'loop', 'lights', 'spinner', 'popup',
  // ノルマ 2
  'ramp', 'save', 'outlane', 'kickback', 'moai', 'captive',
  // ノルマ 3
  'lock', 'multi', 'mystery', 'hammer',
  // ノルマ 4
  'warp', 'booster', 'disc', 'gacha',
  // ノルマ 5
  'jackpot', 'star', 'magnet', 'crane',
  // ノルマ 6
  'zone', 'hole', 'face', 'dino',
  // ノルマ 7
  'hyperloop', 'cannon', 'ufo',
  // ノルマ 8
  'castle', 'mini', 'mega13',
];
/** ノルマ n（いまのノルマ。0 はチュートリアル）のときに買える種類の数（n が大きければ最後の数） */
export const TOY_UNLOCK_AT = [3, 9, 15, 19, 23, 27, 31, 34, 37];
/**
 * 値段（エンブレム）：基本の部品は安め（1〜5）、大きな仕掛けは 6〜15（ユーザーの指定）。
 * チュートリアルの 3 つ（三角のばね・内側の通路・丸いばね）は 1（ユーザーの指定）。
 */
export const TOY_PRICE: Record<ToyId, number> = {
  sling: 1, inlane: 1, bumper: 1,
  targets: 1, lanes: 1, spinner: 1, lights: 1, save: 1,
  loop: 1, outlane: 1, kickback: 1,
  ramp: 1, lock: 1, multi: 1,
  mystery: 1, warp: 1, booster: 1, jackpot: 1,
  star: 1, zone: 1, hole: 1,
  popup: 6, moai: 6, captive: 6, disc: 7, gacha: 7, magnet: 8, crane: 8, face: 9, dino: 9,
  hyperloop: 10, hammer: 6, cannon: 11, ufo: 11, castle: 13, mini: 14, mega13: 15,
};
/** ショップの札の短い説明（くわしくは parts.ts） */
export const TOY_SHORT: Record<ToyId, string> = {
  sling: 'フリッパーの上の三角。当たると横へ強くはじく',
  inlane: 'フリッパーへ戻る安全な道。通ると光って GUM',
  outlane: 'いちばん外の道。落ちやすくなるが、通るとなぐさめの GUM。打ち戻しに要る',
  kickback: '外側の通路に落ちた球を上へ打ち戻す',
  bumper: '左右 3 つずつの丸いばね。当たるたびに強くはじいて GUM',
  spinner: '左右の通路の板。くるくる回るたびに GUM',
  loop: '左を上がって右へ下りる一周の道。通すと GUM とレーン',
  ramp: '台の上を通る 2 本の坂。続けて通すほど GUM',
  lanes: '上の G・U・M。全部点けると大当たりと GUM の倍率',
  targets: 'エネミーの的。倒すと GUM、全部倒すとボス',
  lock: '入ると球が止まり、ねらって撃てる',
  mystery: '入るとルーレット。GUM の雨・分身・倍率などのどれか',
  multi: 'ロックに 3 回でマルチボール。仲間の球がさらに出る',
  jackpot: 'マルチボール中のループとランプで大きな GUM',
  save: '打ち出してしばらくは、落ちてもすぐ戻る',
  warp: '入ると別の場所から飛び出す',
  booster: '通ると矢印の向きへ一気に加速',
  hole: 'ときどき開く穴。吸いこんで超高速で撃ち出す',
  star: 'ときどき浮かぶ星。触ると分身球が出る',
  lights: '通り道に並ぶライト。灯るたびにピッ、1 本全部で GUM',
  zone: '20 連鎖で ZONE。坂が軽く、GUM ×2',
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
/** ギミックの札の候補の数（最上段に並ぶ数） */
export const TOY_OFFERS = 4;
/** チュートリアル（ノルマ 0）で 1 つずつ買う部品：③三角のばね → ④内側の通路 → ⑦丸いばね（ユーザーの指定） */
export const TUTORIAL_PARTS: ToyId[] = ['sling', 'inlane', 'bumper'];
/** ノルマ n（いまのノルマ。0 はチュートリアル）のときに買える種類 */
export function toysUnlocked(quotaN: number): ToyId[] {
  const k = TOY_UNLOCK_AT[Math.max(0, Math.min(TOY_UNLOCK_AT.length - 1, Math.floor(quotaN)))];
  return TOY_UNLOCK.slice(0, k);
}
/**
 * チュートリアル（ノルマ 0）のギミックの候補。
 * はじめての挑戦（案内つき。save.quota.guide）は、n プレイ目のあとに n 番目の部品だけ（前のを買っていなければ、それが先）。
 * 2 回目からの挑戦は、まだ持っていないチュートリアルの部品がまとめて並ぶ。
 */
export function tutorialShop(save: Save): ToyId[] {
  const left = TUTORIAL_PARTS.filter((id) => !save.toys.includes(id));
  if (!save.quota.guide) return left;
  const k = Math.min(save.quota.played, TUTORIAL_PARTS.length);
  return left.length && TUTORIAL_PARTS.indexOf(left[0]) < k ? [left[0]] : [];
}
/** ギミックの候補を引く（解放ずみで、まだ持っていなくて、先に要るものをそろえたものから TOY_OFFERS 個まで） */
export function rollToyShop(save: Save, rng: () => number = Math.random): void {
  if (save.quota.n === 0) { save.toyShop = tutorialShop(save); return; }
  const pool = toysUnlocked(save.quota.n).filter((id) => !save.toys.includes(id) && toyReady(save.toys, id));
  const out: ToyId[] = [];
  while (pool.length && out.length < TOY_OFFERS) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  save.toyShop = out;
}
/** 候補がなければ引く（force なら引き直す）。チュートリアルの間はいつも、いまの手順の部品にする */
export function restockToys(save: Save, force = false, rng: () => number = Math.random): void {
  save.toyShop = (save.toyShop ?? []).filter((id) => TOY_IDS.includes(id));
  if (save.quota.n === 0 || force || !save.toyShop.some((id) => !save.toys.includes(id))) rollToyShop(save, rng);
}
/** ギミックを買う（候補にあって、解放ずみで、先に要るものをそろえていて、エンブレムが足りれば true） */
export function buyToy(save: Save, id: ToyId, discount = 0): boolean {
  if (save.toys.includes(id) || !save.toyShop.includes(id) || !toysUnlocked(save.quota.n).includes(id) || !toyReady(save.toys, id)) return false;
  const price = toyPrice(id, discount);
  if (save.emblems < price) return false;
  save.emblems -= price;
  save.toys.push(id);
  if (save.quota.n === 0) save.toyShop = tutorialShop(save);
  return true;
}
/** ギミックの値段（値切り discount を引く。1 より安くはならない） */
export const toyPrice = (id: ToyId, discount = 0): number => Math.max(1, TOY_PRICE[id] - discount);

// ---------------------------------------------------------------- 台に宿るピエロ（持っているギミックの数で姿が上がる）
/**
 * 姿が上がるギミックの数（基本の部品もふくむ。ユーザーの指定）：ピエロ（コモン）→ エリートピエロ → ウィズダムピエロ → アルルカン → ジョーカー。
 * チュートリアルの 3 つではコモンのまま。ジョーカーは 37 個のうち 30 個（基本の部品 21 個を全部そろえても、大きな仕掛けが 9 つ要る。
 * 前の版の「大きな仕掛け 10 個」とほぼ同じ重さ。部品の値段の合計ぶんは、ノルマの報酬のエンブレムを増やして返している）
 */
export const CLOWN_STEPS = [0, 7, 14, 22, 30];
export const CLOWN_NAME = ['ピエロ', 'エリートピエロ', 'ウィズダムピエロ', 'アルルカン', 'ジョーカー'];
export const CLOWN_RARITY = ['コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
/** 持っているギミックの数から、ピエロの段階（0〜4） */
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
/** 数に入るギミック（知らない ID は数えない） */
export const toyCount = (toys: readonly string[] | undefined): number => new Set((toys ?? []).filter((id) => (TOY_IDS as string[]).includes(id))).size;
/** セーブから、いまのピエロの段階 */
export const clownOf = (save: Save): number => clownTier(toyCount(save.toys));

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
