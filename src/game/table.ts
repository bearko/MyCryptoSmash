// ピンボールの台の形（データ）。遊び（pinball.ts）と描画（render-pinball.ts）の両方がここを読む。
//
// 台は幅 720・高さ 1280 ユニット（画面に収まる大きさの 4 倍の広さ。カメラが球を追って一部を映す）。
//   上：丸い角（ループの道）・G-U-M のレーン・ボスの舞台
//   中：左右のバンパーの群れ・的の列・ロックのホール・ミステリーのホール・ワープ・ブースター・2 本のワイヤーのランプ
//   下：左右の坂（上のフリッパー）・スリングショット・下のフリッパー・アウトレーン（キックバック）
//   右端：打ち出しの細い通路（シューターレーン）。球は右の通路を駆け上がって台の上を回る
// 挑戦のはじめの台は、外のふち・打ち出しの通路・左右の坂・フリッパーと、フリッパーへ流しこむ下の坂（エプロン）だけ。
// ほかの部品（壁のある三角のばね・内側と外側の通路・ループの壁・レーンの仕切り）は、買ったときだけ壁になる（SegDef.part）。

export const TW = 720;
export const TH = 1280;
const MID = TW / 2;

export type P = [number, number];

/**
 * 壁。part があれば、そのギミック（toys.ts の ToyId）を持っているときだけある。
 * unless があれば、そのギミックを持っていないときだけある（外側の通路を買うまでの、フリッパーへ流しこむ下の坂）
 */
export interface SegDef { a: P; b: P; kick?: boolean; outer?: boolean; oneWay?: boolean; part?: string; unless?: string }
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
  pts.push([720, 860], [720, TH + 50]);
  return pts;
})();
for (let i = 1; i < OUTER.length; i += 1) wall(OUTER[i - 1], OUTER[i], { outer: true });

/** 打ち出しの通路（シューターレーン）：右端の x 672〜720。下に球を置き、引っぱって離すとまっすぐ上へ */
export const SHOOT_X0 = 672;
/** 右の坂の線（(720, 860) から (550, 1050)）が通路の内側の壁と交わる高さ */
export const SHOOT_Y0 = 860 + ((720 - SHOOT_X0) / 170) * 190;
export const SHOOT_FLOOR = 1252;
// 右の坂（台の内側）と、台の右の下のふち
wall([SHOOT_X0, SHOOT_Y0], [550, 1050]);
wall([550, 1050], [550, TH + 50]);
// 通路の内側の壁と床
wall([SHOOT_X0, SHOOT_Y0], [SHOOT_X0, SHOOT_FLOOR]);
wall([SHOOT_X0, SHOOT_FLOOR], [720, SHOOT_FLOOR]);
// 通路の出口のふた：上から来た球は坂として受け止め、下から来た球（打ち出し）は通す
wall([SHOOT_X0, SHOOT_Y0], [720, 860], { oneWay: true });

// ループの内側の壁（左右の通路）
both([64, 780], [64, 260], { part: 'loop' });
// 上のレーンの仕切り
export const LANE_Y: [number, number] = [56, 96];
for (const x of [306, 342, 378, 414]) wall([x, LANE_Y[0]], [x, LANE_Y[1]], { part: 'lanes' });
// インレーンの案内（外側がアウトレーン）：外側の通路を買うと、ここが仕切りになる
export const INLANE_GUIDE: [P, P] = [[220, 1105], [274, 1203]];
both(INLANE_GUIDE[0], INLANE_GUIDE[1], { part: 'outlane' });
// 外側の通路を買うまでは、左右の坂の下から、フリッパーの根元まで流しこむ坂（エプロン）。外へ落ちる道がない
export const APRON: [P, P] = [[170, 1050], [274, 1203]];
both(APRON[0], APRON[1], { unless: 'outlane' });
// スリングショット（内向きの斜めの辺が、当たると強くはじく）
export const SLING: P[] = [[274, 1076], [274, 1122], [304, 1142]];
both(SLING[0], SLING[1], { part: 'sling' });
both(SLING[1], SLING[2], { part: 'sling' });
both(SLING[0], SLING[2], { kick: true, part: 'sling' });

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
export const PLUNGER: P = [696, 1226];
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
export const STAR_SPOTS: P[] = [[250, 470], [470, 470], [250, 850], [470, 850], [300, 690]];

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

/** 通り道のライト：通ると灯り、続けて灯るほど音が高くなる（ピピピピ）。全部灯るとごほうび */
/** part があれば、通り道のライト（lights）に加えて、その部品も持っているときだけ灯る */
export interface LightPath { id: string; color: string; pts: P[]; part?: string }
function along(pts: P[], step = 22): P[] {
  const out: P[] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const l = Math.hypot(bx - ax, by - ay);
    let s = carry;
    while (s <= l) {
      out.push([ax + ((bx - ax) * s) / l, ay + ((by - ay) * s) / l]);
      s += step;
    }
    carry = s - l;
  }
  return out;
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 16): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P;
  });
}
const off = ([ax, ay]: P, [bx, by]: P, d: number, t0: number, t1: number): P[] => {
  const l = Math.hypot(bx - ax, by - ay);
  const nx = (by - ay) / l;
  const ny = -(bx - ax) / l;
  return [[ax + (bx - ax) * t0 + nx * d, ay + (by - ay) * t0 + ny * d], [ax + (bx - ax) * t1 + nx * d, ay + (by - ay) * t1 + ny * d]];
};
const mirror = (pts: P[]): P[] => pts.map(([x, y]) => [TW - x, y] as P);
const funnel = off([0, 860], [170, 1050], 18, 0.1, 0.95);
const inlane = off([220, 1105], [274, 1203], 18, 0.05, 0.9);
export const LIGHT_PATHS: LightPath[] = [
  { id: 'loopL', color: '#3fd0ff', pts: along([[32, 780], [32, 270]]) },
  { id: 'loopR', color: '#3fd0ff', pts: along([[688, 270], [688, 780]]) },
  { id: 'orbit', color: '#ffd23f', pts: along([...arc(180, 180, 158, Math.PI, Math.PI * 1.5), [540, 22], ...arc(540, 180, 158, Math.PI * 1.5, Math.PI * 2)], 24) },
  { id: 'funL', color: '#c08bff', pts: along(funnel, 20) },
  { id: 'funR', color: '#c08bff', pts: along(mirror(off([0, 860], [170, 1050], 18, 0.32, 0.95)), 20) },
  { id: 'shoot', color: '#4fe07a', pts: along([[696, 1196], [696, 930]], 22) },
  { id: 'outL', color: '#4fe07a', pts: along([[195, 1070], [195, 1270]], 20), part: 'outlane' },
  { id: 'outR', color: '#4fe07a', pts: along([[525, 1070], [525, 1270]], 20), part: 'outlane' },
  { id: 'inL', color: '#ff8f2e', pts: along(inlane, 16), part: 'inlane' },
  { id: 'inR', color: '#ff8f2e', pts: along(mirror(inlane), 16), part: 'inlane' },
  { id: 'center', color: '#ffffff', pts: along([[MID, 1064], [MID, 850]], 22) },
  { id: 'veeL', color: '#ff6ad5', pts: along([[236, 850], [300, 650]], 22) },
  { id: 'veeR', color: '#ff6ad5', pts: along([[484, 850], [420, 650]], 22) },
  { id: 'nestL', color: '#ff6ad5', pts: arc(260, 353, 80, 0, Math.PI * 2, 20).slice(0, 20), part: 'bumper' },
  { id: 'nestR', color: '#ff6ad5', pts: arc(460, 353, 80, 0, Math.PI * 2, 20).slice(0, 20), part: 'bumper' },
  { id: 'gate', color: '#ffd23f', pts: arc(MID, 450, 64, 0, Math.PI * 2, 18).slice(0, 18) },
  { id: 'myst', color: '#ffd23f', pts: along([[MYSTERY[0], 640], [MYSTERY[0], 780]], 22), part: 'mystery' },
  { id: 'lock', color: '#ff8f2e', pts: along([[LOCK[0], 640], [LOCK[0], 780]], 22), part: 'lock' },
];
/** ワイヤーのランプの上の LED（道にそって 30 ごと） */
export const RAMP_LED_STEP = 30;
