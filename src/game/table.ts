// ピンボールの台の形（データ）。遊び（pinball.ts）と描画（render-pinball.ts）の両方がここを読む。
//
// 台は幅 720・高さ 1280 ユニット（画面に収まる大きさの 4 倍の広さ。カメラが球を追って一部を映す）。
//   上：丸い角（ループの道）・G-U-M のレーン・ボスの舞台
//   中：左右のバンパーの群れ・的の列・ロックのホール・ミステリーのホール・ワープ・ブースター・2 本のワイヤーのランプ
//   下：左右の坂（上のフリッパー）・スリングショット・下のフリッパー・打ち出す場所・アウトレーン（キックバック）

export const TW = 720;
export const TH = 1280;
const MID = TW / 2;

export type P = [number, number];

export interface SegDef { a: P; b: P; kick?: boolean; outer?: boolean }
export interface FlipperDef { px: number; py: number; side: 1 | -1; len: number; rest: number; up: number }

const segs: SegDef[] = [];
const wall = (a: P, b: P, opt: Partial<SegDef> = {}) => segs.push({ a, b, ...opt });
const mx = ([x, y]: P): P => [TW - x, y];
const both = (a: P, b: P, opt: Partial<SegDef> = {}) => { wall(a, b, opt); wall(mx(a), mx(b), opt); };

/** 外のふち（左下から時計回り）。アーマーと LED もこの線にそって描く */
export const OUTER: P[] = (() => {
  const pts: P[] = [[170, TH + 50], [170, 1050], [0, 860], [0, 180]];
  for (let i = 1; i <= 12; i += 1) {
    const a = Math.PI + (i / 12) * (Math.PI / 2);
    pts.push([180 + Math.cos(a) * 180, 180 + Math.sin(a) * 180]);
  }
  pts.push([540, 0]);
  for (let i = 1; i <= 12; i += 1) {
    const a = Math.PI * 1.5 + (i / 12) * (Math.PI / 2);
    pts.push([540 + Math.cos(a) * 180, 180 + Math.sin(a) * 180]);
  }
  pts.push([720, 860], [550, 1050], [550, TH + 50]);
  return pts;
})();
for (let i = 1; i < OUTER.length; i += 1) wall(OUTER[i - 1], OUTER[i], { outer: true });

// ループの内側の壁（左右の通路）
both([64, 780], [64, 260]);
// 上のレーンの仕切り
export const LANE_Y: [number, number] = [56, 96];
for (const x of [306, 342, 378, 414]) wall([x, LANE_Y[0]], [x, LANE_Y[1]]);
// インレーンの案内（外側がアウトレーン）
both([220, 1105], [274, 1203]);
// スリングショット（内向きの斜めの辺が、当たると強くはじく）
export const SLING: P[] = [[274, 1076], [274, 1122], [304, 1142]];
both(SLING[0], SLING[1]);
both(SLING[1], SLING[2]);
both(SLING[0], SLING[2], { kick: true });

export const SEGS = segs;

export const BUMPERS: { x: number; y: number; r: number }[] = [
  { x: 220, y: 330, r: 24 }, { x: 300, y: 330, r: 24 }, { x: 260, y: 400, r: 24 },
  { x: 420, y: 330, r: 24 }, { x: 500, y: 330, r: 24 }, { x: 460, y: 400, r: 24 },
];

/** フリッパー：下の 2 本と、左右の坂の上の 2 本（坂にそって寝ている） */
export const FLIPPERS: FlipperDef[] = [
  { px: 278, py: 1212, side: 1, len: 64, rest: 0.5, up: -0.45 },
  { px: 442, py: 1212, side: -1, len: 64, rest: 0.5, up: -0.45 },
  { px: 56, py: 924, side: 1, len: 60, rest: 0.84, up: -0.2 },
  { px: 664, py: 924, side: -1, len: 60, rest: 0.84, up: -0.2 },
];

/** G-U-M のレーン */
export const LANES = [324, 360, 396];
/** 打ち出す場所・ボールセーブで戻す場所・球が落ちたとみなす高さ */
export const PLUNGER: P = [MID, 1110];
export const SAVE_SPOT: P = [MID, TH - 40];
export const DRAIN_Y = TH + 30;
/** ボスの舞台（左右に行き来する） */
export const BOSS_HOME: P = [MID, 210];
export const BOSS_SWAY = 140;

/** 的（ドロップターゲット）を置く場所。前の 5 つが中央の列、あとは台が進むと増える */
export const TARGET_SLOTS: P[] = [
  [256, 540], [308, 548], [360, 552], [412, 548], [464, 540],
  [150, 250], [570, 250], [360, 290], [260, 470], [460, 470], [360, 720],
];

/** ロックのホール（3 回でマルチボール）・ミステリーのホール（何かが起きる） */
export const LOCK: P = [590, 560];
export const MYSTERY: P = [118, 560];

/** ワープ：入口と出口・出るときの速さ */
export const WARPS: { in: P; out: P; v: P }[] = [
  { in: [200, 700], out: [MID, 40], v: [0, 260] },
  { in: [520, 700], out: [630, 210], v: [-300, 220] },
];

/** スピナー（左右のループの通路）。ループの線もここ（左を上がって右を下りるとループ） */
export const SPINNERS: P[] = [[32, 640], [688, 640]];
export const LOOP_LINE = 640;
export const LOOP_X: [number, number] = [64, 656];

/** ブースター（ゲームならでは：通ると矢印の向きへ一気に加速）。向きはラジアン */
export const BOOSTERS: { x: number; y: number; a: number }[] = [
  { x: 32, y: 740, a: -Math.PI / 2 },
  { x: 300, y: 880, a: -Math.PI / 2 - 0.26 },
  { x: 420, y: 880, a: -Math.PI / 2 + 0.26 },
];

/** キックバック（左右のアウトレーン）：この x より外で、この高さより下 */
export const KICKBACKS: { x: number; side: -1 | 1 }[] = [{ x: 220, side: -1 }, { x: 500, side: 1 }];
export const KICK_Y = 1240;

/** インレーンの星（通ると光る）：範囲 */
export const INLANES: { x0: number; x1: number; y0: number; y1: number; lamp: P }[] = [
  { x0: 224, x1: 272, y0: 1140, y1: 1200, lamp: [248, 1172] },
  { x0: 448, x1: 496, y0: 1140, y1: 1200, lamp: [472, 1172] },
];

/** ブラックホール・ゴーストスターの出る場所 */
export const HOLE_SPOTS: P[] = [[MID, 240], [230, 620], [490, 620]];
/** ピラミッドへの入口（G-U-M を全部点けると開く。台のまん中） */
export const GATE: P = [MID, 450];
export const STAR_SPOTS: P[] = [[250, 470], [470, 470], [230, 770], [490, 770], [MID, 800]];

/** GUM の倍率のランプ（×2〜×8）の並び */
export const MUL_LAMPS: P[] = Array.from({ length: 7 }, (_, i) => [MID + (i - 3) * 22, 640] as P);

/** ワイヤーのランプ（球が浮いて走る道）。右：右の入口から上を回って左のインレーンへ。左：左の入口から上のレーンへ */
export const RAMPS: { id: 'R' | 'L'; path: P[]; color: string }[] = [
  {
    id: 'R',
    color: '#ffd23f',
    path: [
      [550, 820], [588, 730], [612, 620], [620, 500], [615, 380], [600, 280], [570, 190], [525, 125], [465, 82], [395, 62],
      [325, 62], [255, 82], [195, 125], [150, 190], [120, 280], [98, 380], [88, 500], [86, 620], [90, 740], [110, 860],
      [150, 960], [195, 1040], [232, 1082],
    ],
  },
  {
    id: 'L',
    color: '#3fd0ff',
    path: [
      [170, 820], [152, 720], [146, 620], [152, 520], [168, 420], [190, 330], [225, 250], [270, 180], [312, 122], [334, 84], [338, 44],
    ],
  },
];

/** 台のロゴ・中央の星（飾り） */
export const LOGO: P = [MID, 1172];
export const EMBLEM: P = [MID, 365];
export const BALL_SAVE_LAMP: P = [MID, TH - 16];
