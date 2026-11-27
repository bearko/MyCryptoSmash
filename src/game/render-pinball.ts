// ピンボールの台の描画（canvas）。PinballWorld の状態を読むだけで、書きかえない（カメラの位置だけはここで持つ）。
//
// 台は画面の 4 倍の広さ（table.ts）。カメラが球を少し先回りして追い、速いときやマルチボールでは引いて広く、
// 吸いこまれるときは寄る。台を突破したときと、プレイの始まりは台全体を映す。右下に小さな全体図。
// 豪華な台の見た目：きらめく盤面の絵（一度描いて取っておく）・RGB のランプとライトショー・LED の光るアーマー・
// ワイヤーのランプ・立体的なバンパーとフリッパー・プラスチック・台の下からの光・レーザー・上の液晶ディスプレイ。
// 重くならないように、光のにじみは作っておいた丸い光の絵を「足し算」で重ねるだけにする（影ぼかしは使わない）。
// 買っていない部品（toys.ts）は描かない。はじめの台（打ち出しとフリッパーだけ）でも、外枠・盤面の絵・液晶・LED は動き続ける。

import { fmt, img, ready } from '../core/util';
import { RARITY_COLOR } from '../core/catalog';
import { dmd } from '../ui/dmd';
import { ELEM_COLOR } from './elements';
import { MAX_PULL, MIN_PULL } from './world';
import { GATE_PULL, HOLE_PULL, MYSTERIES, PinballWorld, ZONE_COMBO, flipperTip, type Show } from './pinball';
import * as T from './table';
import { CURSE_R } from './curse';
import {
  CANNON, CAPTIVE, CASTLE, CRANE, CRANE_PRIZE, DINO, DISC, FACE, GACHA, HAMMER, HYPER, MAGNET, MINI, MINI_BUMPERS, MOAI, POPUP, POPUPS, TOY_ART, UFO,
  TOY_IDS, clownTier, tierArt, toyArt,
} from './toys';
import { drawEnemies, drawFx, drawOverlay, drawRingsWaves, medallion, roundRect, type Rink } from './render';
import { paintBoard } from '../fx/board';
import { calm, clownStage, quality } from '../fx/quality';
import { fxOf, fxStep, ghostsOf, squashOf, type TableFx } from '../fx/table-fx';
import { sheenSprite, softSprite } from '../fx/sprites';
import { attackMark } from '../fx/attack';

const TAU = Math.PI * 2;
const W = T.TW;
const H = T.TH;

// ------------------------------------------------------------------ 光の絵（作っておいて使い回す）
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color);
    gr.addColorStop(0.25, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.9;
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, c);
  return c;
}
/** 足し算で光を置く（lit() の中で呼ぶ） */
function addGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  if (a <= 0.02 || !inView(x, y, r)) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
}
function lit(ctx: CanvasRenderingContext2D, fn: () => void): void {
  ctx.globalCompositeOperation = 'lighter';
  fn();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
/** 虹の色（光の絵が増えすぎないように 24 段に丸める） */
const hue = (h: number): string => `hsl(${Math.round((((h % 360) + 360) % 360) / 15) * 15} 100% 60%)`;
/** マイクリの絵（エクステンション）を置く。読みこめていなければ false（そのときは図形で描く） */
function drawArt(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, size: number, rot = 0, alpha = 1, flip = false): boolean {
  const im = img(toyArt(id));
  if (!ready(im)) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

/** ショップの見本の台を描いている間（カメラの確認用の上書き・取り付けの演出・後がけの数字を使わない） */
let inPreview = false;
/** いま描いている台の演出の状態と、台の直りぐあい（drawPinball が入れる） */
let curFx: TableFx | null = null;
let curStage = 0;

// ------------------------------------------------------------------ カメラ
/** いま映している範囲（台のユニット） */
const view = { x0: 0, y0: 0, x1: W, y1: H };
const inView = (x: number, y: number, r = 0): boolean => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;
const cam = { x: W / 2, y: H / 2, vw: W, last: 0, runT: -1, inited: false };
const BASE_VIEW = 420;

/** 解説モード：カメラの行き先・部品の名札・はじめて触れた部品の名札（main.ts と guide.ts が書く） */
export const guideView = {
  cam: null as null | { x: number; y: number; vw: number },
  /** gray：選んだ部品のほかをグレーに（Limited の札の台）。ghost：台にまだない部品（うすく描く） */
  pins: null as null | { x: number; y: number; hx: number; hy: number; r: number; n: number; sel: boolean; gray?: boolean; ghost?: boolean }[],
  tags: [] as { x: number; y: number; text: string; t0: number }[],
};
/** 画面の点（#app の中の px）→ 台のユニット */
export function tableAt(px: number, py: number, rink: Rink): [number, number] {
  const k = rink.w / cam.vw;
  return [view.x0 + (px - rink.x) / k, view.y0 + (py - rink.y) / k];
}

function updateCamera(wd: PinballWorld, aspect: number): void {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - cam.last) / 1000));
  cam.last = now;
  const full = Math.max(W, H / aspect) + 24;
  // プレイの始まり：台全体から、打ち出す場所へ寄っていく
  if (cam.runT !== wd.runStartT) {
    cam.runT = wd.runStartT;
    cam.x = W / 2;
    cam.y = H / 2;
    cam.vw = full;
    cam.inited = true;
  }
  const p = wd.puck;
  let tx = p.x;
  let ty = p.y;
  let vw = BASE_VIEW;
  const sp = Math.hypot(p.vx, p.vy);
  let rate = 5;
  const ins = !inPreview ? fxOf(wd).installs[0] : undefined;
  const dbg = !inPreview ? (globalThis as { __fxcam?: { x: number; y: number; vw: number } }).__fxcam : undefined;
  if (dbg) {
    // 確認用：コンソールから window.__fxcam = { x, y, vw } でカメラを決める
    tx = dbg.x; ty = dbg.y; vw = dbg.vw >= W ? full : dbg.vw; rate = 30;
  } else if (guideView.cam) {
    tx = guideView.cam.x; ty = guideView.cam.y; vw = guideView.cam.vw >= W ? full * 1.1 : guideView.cam.vw; rate = 4;
  } else if (ins) {
    // 買った部品が付く瞬間：その場所へ寄る
    tx = ins.x; ty = ins.y; vw = 400; rate = 5;
  } else if (wd.phase === 'zoom' || wd.phase === 'over') {
    tx = W / 2; ty = H / 2; vw = full; rate = 2.5;
  } else if (wd.parked === 'plunger') {
    ty = p.y - 140; vw = 460; rate = 2.2;
  } else if (wd.gate.entering >= 0 || wd.hole.held >= 0) {
    vw = 300; rate = 4;
  } else {
    // 少し先回りする
    const look = 0.13;
    tx += Math.max(-150, Math.min(150, p.vx * look));
    ty += Math.max(-170, Math.min(170, p.vy * look));
    vw += Math.min(1, Math.max(0, (sp - 800) / 1600)) * 130;
    if (wd.onRamp) vw = Math.max(vw, 480);
    // マルチボール：本物の球がぜんぶ入るように引く
    const balls = [p, ...wd.mates.filter((b) => b.ghost === undefined)];
    if (balls.length > 1) {
      const xs = balls.map((b) => b.x);
      const ys = balls.map((b) => b.y);
      const bx0 = Math.min(...xs); const bx1 = Math.max(...xs);
      const by0 = Math.min(...ys); const by1 = Math.max(...ys);
      tx = (bx0 + bx1) / 2 * 0.6 + tx * 0.4;
      ty = (by0 + by1) / 2 * 0.6 + ty * 0.4;
      vw = Math.max(vw, bx1 - bx0 + 220, (by1 - by0 + 300) / aspect);
    }
    // ボスのそばでは少し寄る
    const boss = wd.enemies.find((e) => e.boss);
    if (boss && Math.hypot(boss.x - p.x, boss.y - p.y) < 220 && balls.length === 1) vw = Math.min(vw, 380);
  }
  vw *= 1 - wd.punch * 0.06;
  vw = Math.min(guideView.cam ? full * 1.1 : full, vw);
  const kz = 1 - Math.exp(-3 * dt);
  const kp = 1 - Math.exp(-rate * dt);
  cam.vw += (vw - cam.vw) * kz;
  cam.x += (tx - cam.x) * kp;
  cam.y += (ty - cam.y) * kp;
  // 球はいつも画面の中に
  const vh = cam.vw * aspect;
  if (wd.phase === 'play' && !wd.parked && !guideView.cam) {
    const mx = cam.vw * 0.4;
    const my = vh * 0.4;
    cam.x = Math.max(p.x - mx, Math.min(p.x + mx, cam.x));
    cam.y = Math.max(p.y - my, Math.min(p.y + my, cam.y));
  }
  // 台の外は映しすぎない
  cam.x = cam.vw >= W ? W / 2 : Math.max(cam.vw / 2 - 10, Math.min(W - cam.vw / 2 + 10, cam.x));
  cam.y = vh >= H ? H / 2 : Math.max(vh / 2 - 10, Math.min(H + 30 - vh / 2, cam.y));
  view.x0 = cam.x - cam.vw / 2;
  view.x1 = cam.x + cam.vw / 2;
  view.y0 = cam.y - vh / 2;
  view.y1 = cam.y + vh / 2;
}

// ------------------------------------------------------------------ 台の形
function tablePath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  T.OUTER.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}
/** アーマーの LED の位置（ふちにそって 20 ごと） */
const LEDS: T.P[] = (() => {
  const out: T.P[] = [];
  let carry = 0;
  for (let i = 1; i < T.OUTER.length; i += 1) {
    const [ax, ay] = T.OUTER[i - 1];
    const [bx, by] = T.OUTER[i];
    const l = Math.hypot(bx - ax, by - ay);
    let s = carry;
    while (s < l) {
      const k = s / l;
      const x = ax + (bx - ax) * k;
      const y = ay + (by - ay) * k;
      if (y < H - 10) out.push([x, y]);
      s += 20;
    }
    carry = s - l;
  }
  return out;
})();

// ------------------------------------------------------------------ ランプ（盤面に埋めこんだ色つきのガラス）
type LampShape = 'arrow' | 'circle' | 'rect' | 'star';
/** part：そのランプを出す部品（買っていなければ描かない。なければいつもある） */
interface Lamp { x: number; y: number; shape: LampShape; size: number; color: string; angle: number; id: string; part?: string }

const LAMPS: Lamp[] = (() => {
  const L: Lamp[] = [];
  const add = (id: string, [x, y]: T.P, shape: LampShape, size: number, color: string, angle = -Math.PI / 2, part?: string) => L.push({ id, x, y, shape, size, color, angle, part });
  for (let k = 0; k < 3; k += 1) {
    add(`loopL${k}`, [32, 560 - k * 34], 'arrow', 9, '#3fd0ff', undefined, 'loop');
    add(`loopR${k}`, [688, 560 - k * 34], 'arrow', 9, '#3fd0ff', undefined, 'loop');
  }
  T.RAMPS.forEach((r, i) => {
    add(`ramp${i}a`, [r.path[0][0], r.path[0][1] + 60], 'arrow', 10, r.color, undefined, 'ramp');
    add(`ramp${i}b`, [r.path[0][0], r.path[0][1] + 34], 'arrow', 10, r.color, undefined, 'ramp');
  });
  add('lock', [T.LOCK[0], T.LOCK[1] + 44], 'arrow', 8, '#ff8f2e', Math.PI / 2, 'lock');
  add('myst', [T.MYSTERY[0], T.MYSTERY[1] + 44], 'arrow', 8, '#ffd23f', Math.PI / 2, 'mystery');
  T.TARGET_SLOTS.forEach(([x, y], i) => add(`t${i}`, [x, y + 24], 'rect', 9, '#ff4f5e', 0, 'targets'));
  add('emblem', T.EMBLEM, 'star', 16, '#ff6ad5');
  T.INLANES.forEach((z, i) => add(`in${i}`, z.lamp, 'star', 8, '#4fe07a', undefined, 'inlane'));
  add('again', T.BALL_SAVE_LAMP, 'rect', 30, '#4fe07a', 0, 'save');
  T.HOLE_SPOTS.forEach((p, i) => add(`hole${i}`, p, 'circle', 22, '#c08bff', undefined, 'hole'));
  for (let k = 0; k < 3; k += 1) add(`gate${k}`, [T.GATE[0], T.GATE[1] + 52 + k * 22], 'arrow', 8, '#ffd23f', undefined, 'lanes');
  return L;
})();
/** 持っているギミック（盤面の絵の取っておきを描き直すかどうかに使う） */
/** 台の直りぐあい（ピエロの段階 0〜4）。html[data-clown] があればそれ、なければ台のギミックの数から */
function stageOf(wd: PinballWorld): number { return clownStage(clownTier(TOY_IDS.reduce((n, id) => n + (wd.toys[id] ? 1 : 0), 0))); }
function ownSig(wd: PinballWorld): string { return TOY_IDS.filter((id) => wd.toys[id]).join(','); }
const lampOn = (wd: PinballWorld, l: Lamp): boolean => !l.part || !!wd.toys[l.part as keyof PinballWorld['toys']];

/** そのランプのいまの明るさ（0〜1）。ゲームの状態で決まる明るさ */
function lampBase(wd: PinballWorld, l: Lamp): number {
  const t = wd.time;
  const blink = (hz: number) => (Math.floor(t * hz * 2) % 2 ? 1 : 0.15);
  const jackpot = wd.multi;
  const id = l.id;
  if (id.startsWith('loop')) {
    if (jackpot) return blink(5);
    return 0.15 + 0.6 * Math.max(0, Math.sin(t * 5 - Number(id.slice(-1)) * 1.3));
  }
  if (id.startsWith('ramp')) {
    if (jackpot || t - wd.rampLastT < 6) return blink(4);
    return 0.2 + 0.55 * Math.max(0, Math.sin(t * 4 - (id.endsWith('a') ? 0 : 1.5)));
  }
  if (id === 'lock') return wd.saucer.locks === wd.locksNeeded - 1 ? blink(4) : 0.3 + 0.3 * Math.sin(t * 3);
  if (id === 'myst') return wd.mystery.cool > 0 ? 0.1 : 0.35 + 0.35 * Math.sin(t * 4 + 1);
  if (/^t\d+$/.test(id)) {
    const [x, y] = T.TARGET_SLOTS[Number(id.slice(1))];
    const alive = wd.enemies.some((e) => !e.boss && e.hp > 0 && e.tx === x && e.ty === y);
    const left = wd.enemies.filter((e) => !e.boss).length;
    return alive ? (left <= 1 ? blink(4) : 1) : 0;
  }
  if (id === 'emblem') return wd.zone ? 1 : jackpot ? blink(3) : 0.35 + 0.35 * Math.sin(t * 2);
  if (id.startsWith('in')) return wd.inlane[Number(id.slice(2))] > 0 ? 1 : 0.1;
  if (id === 'again') return wd.ballSaveUntil > t ? blink(3) : 0;
  if (id.startsWith('hole')) {
    const [x, y] = T.HOLE_SPOTS[Number(id.slice(4))];
    if (wd.hole.on && wd.hole.x === x && wd.hole.y === y) return 1;
    return !wd.hole.on && wd.hole.next < 2 ? blink(6) * 0.6 : 0.08;
  }
  if (id.startsWith('gate')) {
    if (!wd.gate.open) return 0.05;
    return Math.max(0, Math.sin(t * 8 + Number(id.slice(-1)) * 1.2));
  }
  return 0;
}

/** ライトショー：合図ごとの、その場所の明るさと色 */
function showLight(wd: PinballWorld, x: number, y: number): { a: number; color: string | null } {
  let a = 0;
  let color: string | null = null;
  for (const s of wd.shows) {
    const k = (wd.time - s.t0) / s.dur;
    if (k < 0 || k > 1) continue;
    const v = showValue(s, k, x, y, wd.time);
    if (v > a) {
      a = v;
      color = s.kind === 'rainbow' ? hue(x * 0.6 + y * 0.3 + wd.time * 400) : s.color;
    }
  }
  return { a, color };
}
function showValue(s: Show, k: number, x: number, y: number, time: number): number {
  const fade = 1 - k;
  switch (s.kind) {
    case 'radial': {
      const d = Math.hypot(x - s.x, y - s.y);
      return Math.exp(-((d - k * 520) ** 2) / 2600) * fade;
    }
    case 'chase': {
      const band = H + 60 - k * (H + 160);
      return Math.exp(-((y - band) ** 2) / 4000) * (0.6 + 0.4 * fade);
    }
    case 'strobe': return (Math.floor(time * 24) % 2 ? 1 : 0.1) * fade;
    case 'rainbow': return 0.75 + 0.25 * Math.sin(time * 10 + x * 0.03);
    case 'fade': return fade * 0.8;
  }
  return 0;
}

function drawLampShape(ctx: CanvasRenderingContext2D, l: Lamp): void {
  ctx.beginPath();
  if (l.shape === 'circle') ctx.arc(l.x, l.y, l.size, 0, TAU);
  else if (l.shape === 'rect') roundRect(ctx, l.x - l.size, l.y - 3.5, l.size * 2, 7, 3);
  else if (l.shape === 'arrow') {
    const c = Math.cos(l.angle);
    const s = Math.sin(l.angle);
    const z = l.size;
    const pts: T.P[] = [[z, 0], [-z * 0.5, z * 0.9], [-z * 0.15, 0], [-z * 0.5, -z * 0.9]];
    pts.forEach(([u, v], i) => {
      const px = l.x + u * c - v * s;
      const py = l.y + u * s + v * c;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
  } else starPath(ctx, l.x, l.y, l.size, l.size * 0.45, 0);
}
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? r2 : r1;
    const a = -Math.PI / 2 + (i / 10) * TAU + rot;
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

// ------------------------------------------------------------------ 盤面の絵（一度だけ描いて取っておく）
let field: { key: string; cv: HTMLCanvasElement; cs: number; mini: HTMLCanvasElement } | null = null;

function playfield(bgUrl: string, cs: number, miniW: number, miniH: number, wd: PinballWorld): typeof field {
  const bg = img(bgUrl);
  const fontsReady = document.fonts ? document.fonts.status === 'loaded' : true;
  const tier = stageOf(wd);
  const lite = quality() === 0;
  const key = `${bgUrl}|${cs.toFixed(3)}|${ready(bg)}|${fontsReady}|${Math.round(miniW)}|${ownSig(wd)}|${tier}|${lite}|${wd.floor}`;
  if (field && field.key === key) return field;
  const cv = field?.cv ?? document.createElement('canvas');
  cv.width = Math.round(W * cs);
  cv.height = Math.round(H * cs);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.setTransform(cs, 0, 0, cs, 0, 0);
  g.clearRect(0, 0, W, H);
  // 木とニスの盤面・手描きの絵・古さ・買っていない部品の跡（src/fx/board.ts）
  paintBoard(g, { toys: wd.toys, tier, bg: ready(bg) ? bg : null, floor: wd.floor, lite }, (gg) => {
    // ランプのくぼみ（消えているときの色ガラス。部品のランプは買ったときだけ）
    for (const l of LAMPS) {
      if (!lampOn(wd, l)) continue;
      drawLampShape(gg, l);
      gg.fillStyle = 'rgba(0,0,0,0.6)';
      gg.fill();
      gg.globalAlpha = 0.22;
      gg.fillStyle = l.color;
      gg.fill();
      gg.globalAlpha = 1;
      gg.strokeStyle = 'rgba(255,225,170,0.35)';
      gg.lineWidth = 1;
      gg.stroke();
    }
  }, cs);
  // 小さな全体図
  const mini = field?.mini ?? document.createElement('canvas');
  mini.width = Math.max(4, Math.round(miniW));
  mini.height = Math.max(4, Math.round(miniH));
  const m = mini.getContext('2d');
  if (m) {
    m.clearRect(0, 0, mini.width, mini.height);
    m.imageSmoothingEnabled = true;
    m.drawImage(cv, 0, 0, mini.width, mini.height);
    m.setTransform(mini.width / W, 0, 0, mini.height / H, 0, 0);
    m.strokeStyle = '#ff5a6e';
    m.lineWidth = 10;
    tablePath(m);
    m.stroke();
    m.strokeStyle = 'rgba(255,210,63,0.8)';
    m.lineWidth = 6;
    for (const r of wd.ramps) {
      m.beginPath();
      r.path.forEach(([x, y], i) => (i ? m.lineTo(x, y) : m.moveTo(x, y)));
      m.stroke();
    }
  }
  field = { key, cv, cs, mini };
  return field;
}

// ------------------------------------------------------------------ 本体
export interface DisplayRect { x: number; y: number; w: number; h: number }

export function drawPinball(
  ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink, disp: DisplayRect, cw: number, ch: number, bgUrl: string, dpr: number,
): void {
  const t = wd.time;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const gi = giColor(wd);
  const aspect = rink.h / rink.w;
  updateCamera(wd, aspect);
  const k = rink.w / cam.vw;

  const stage = stageOf(wd);
  const fx = fxOf(wd);
  fxStep(fx, wd, view, stage, !inPreview);
  curFx = fx;
  curStage = stage;

  // 外の暗がり（キャビネットの中）
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(0, 0, cw, ch);

  drawDisplay(ctx, wd, disp);

  // 台を映す窓
  ctx.save();
  roundRect(ctx, rink.x, rink.y, rink.w, rink.h, 14);
  ctx.clip();
  ctx.fillStyle = '#0d0508';
  ctx.fillRect(rink.x, rink.y, rink.w, rink.h);
  // ゆれ：当たった向きへ押されて、ばねで戻る（src/fx/table-fx.ts）
  ctx.translate(rink.x + fx.sx, rink.y + fx.sy);
  ctx.scale(k, k);
  ctx.translate(-view.x0, -view.y0);

  // 台の下からの光（台が直るほど明るい）
  if (!wd.lowFx && stage > 0) {
    lit(ctx, () => {
      tablePath(ctx);
      ctx.strokeStyle = gi;
      ctx.globalAlpha = 0.04 + stage * 0.03;
      ctx.lineWidth = 34;
      ctx.stroke();
    });
  }
  // 盤面の絵（映っている所だけを貼る）
  const miniH = Math.min(150, Math.max(80, rink.h * 0.2));
  const pf = playfield(bgUrl, (rink.w / BASE_VIEW) * dpr, miniH * (W / H) * dpr, miniH * dpr, wd);
  if (pf) {
    const x0 = Math.max(0, view.x0);
    const y0 = Math.max(0, view.y0);
    const x1 = Math.min(W, view.x1);
    const y1 = Math.min(H, view.y1);
    if (x1 > x0 && y1 > y0) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pf.cv, x0 * pf.cs, y0 * pf.cs, (x1 - x0) * pf.cs, (y1 - y0) * pf.cs, x0, y0, x1 - x0, y1 - y0);
      ctx.imageSmoothingEnabled = false;
    }
  }

  ctx.save();
  tablePath(ctx);
  ctx.closePath();
  ctx.clip();
  lit(ctx, () => {
    ctx.globalAlpha = wd.zone ? 0.1 : 0.012 + stage * 0.009;
    ctx.fillStyle = gi;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  });
  drawInstallUnder(ctx, fx);
  drawLamps(ctx, wd);
  drawLightPaths(ctx, wd);
  if (!wd.lowFx && stage >= 2) drawTwinkles(ctx, t);
  drawShooter(ctx, wd);
  drawBoosters(ctx, wd);
  drawToysUnder(ctx, wd);
  drawWalls(ctx, wd);
  drawGate(ctx, wd);
  drawHole(ctx, wd);
  drawStar(ctx, wd);
  drawBumpers(ctx, wd, gi);
  if (wd.frenzy) drawLightning(ctx, wd);
  drawRingsWaves(ctx, wd, k);
  drawEnemies(ctx, wd);
  drawHeat(ctx, wd, t);
  drawCurse(ctx, wd, t);
  drawFlippers(ctx, wd);
  drawBalls(ctx, wd, false);
  drawLasers(ctx, wd);
  // Limited のレーザー：上から的へ
  for (const b of wd.beams) {
    const a = 1 - (wd.time - b.t) / 0.35;
    ctx.globalAlpha = Math.max(0, a);
    ctx.strokeStyle = '#ff4f5e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(b.x, view.y0);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    lit(ctx, () => addGlow(ctx, b.x, b.y, 50, '#ff4f5e', a));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawArmor(ctx, wd, gi);
  drawRamps(ctx, wd);
  if (wd.onRamp) drawBalls(ctx, wd, true);
  if (wd.hold.active || wd.parked === 'plunger') aimArc(ctx, wd);
  if ((wd.parked === 'plunger' || wd.parked === 'saucer') && !wd.hold.active) {
    const p = wd.puck;
    const pulse = 1 + Math.sin(t * 6) * 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.r + 10) * pulse, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  drawToysOver(ctx, wd);
  drawFx(ctx, wd);
  // 粒（紙吹雪・GUM のかけら・ほこり → 火花・輪・攻撃の形）
  fx.parts.drawSolid(ctx, view.x0, view.y0, view.x1, view.y1);
  lit(ctx, () => fx.parts.drawLit(ctx, view.x0, view.y0, view.x1, view.y1));
  drawInstallOver(ctx, fx);
  drawGuide(ctx, wd, k);
  ctx.restore();
  drawGlass(ctx, wd, fx, rink, stage);
  if (!inPreview) notePost(fx, rink, k, cw, ch, stage);

  if (!guideView.pins) drawMinimap(ctx, wd, rink, pf);
  drawMiniTable(ctx, wd, rink);
  ctx.save();
  ctx.translate(rink.x, rink.y);
  drawOverlay(ctx, wd, rink);
  ctx.restore();
  if (wd.phase === 'zoom') {
    const z = Math.min(1, wd.zoomT / wd.zoomDur);
    ctx.save();
    ctx.globalAlpha = z < 0.75 ? 1 : 1 - (z - 0.75) / 0.25;
    ctx.translate(rink.x + rink.w / 2, rink.y + rink.h * 0.42);
    ctx.scale(1.3 - z * 0.3, 1.3 - z * 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "60px 'Bangers', 'Dela Gothic One', sans-serif";
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a0d1c';
    ctx.strokeText(`TABLE ${wd.floor}`, 0, 0);
    ctx.fillStyle = wd.floor % 10 === 0 ? '#ff4f5e' : '#ffe14d';
    ctx.fillText(`TABLE ${wd.floor}`, 0, 0);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ ヒートの印（炎）
/** ヒートの印の部品に炎を描く。当たると大きく燃え上がる */
function drawHeat(ctx: CanvasRenderingContext2D, wd: PinballWorld, t: number): void {
  if (!wd.heat.size) return;
  for (const src of wd.heat) {
    const fl = wd.heatFlash.get(src) ?? 0;
    for (const [x, y] of wd.heatSpots(src)) {
      if (!inView(x, y, 30)) continue;
      flame(ctx, x, y, 12 + fl * 10, t + x * 0.013, fl);
    }
  }
}
/** 呪いの穴：赤く脈打つ穴と骸骨。球を吸いこむと大きく光る */
function drawCurse(ctx: CanvasRenderingContext2D, wd: PinballWorld, t: number): void {
  for (const [x, y] of wd.curse) {
    if (!inView(x, y, 60)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4 + x * 0.01);
    const r = CURSE_R + 7;
    lit(ctx, () => addGlow(ctx, x, y, r * (2.4 + pulse * 0.6 + wd.curseFlash * 2), '#ff2e3e', 0.45 + pulse * 0.25 + wd.curseFlash * 0.5));
    // 穴（黒い渦）
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, '#000');
    g.addColorStop(0.7, '#1a0006');
    g.addColorStop(1, '#5a0010');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // ふちの赤い輪（回る切れ目）
    ctx.strokeStyle = '#ff2e3e';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // 骸骨（頭・目・歯）
    const s = r * 0.62;
    ctx.fillStyle = `rgba(255, 220, 220, ${0.75 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.15, s * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - s * 0.36, y + s * 0.25, s * 0.72, s * 0.32);
    ctx.fillStyle = '#ff2e3e';
    ctx.beginPath();
    ctx.arc(x - s * 0.24, y - s * 0.18, s * 0.16, 0, TAU);
    ctx.arc(x + s * 0.24, y - s * 0.18, s * 0.16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0006';
    for (let i = -1; i <= 1; i += 1) ctx.fillRect(x + i * s * 0.2 - 1, y + s * 0.27, 2, s * 0.28);
  }
}
/** 小さな炎（3 枚の舌がゆらぐ） */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, hot: number): void {
  lit(ctx, () => addGlow(ctx, x, y, s * 2.6, '#ff7a2e', 0.5 + hot * 0.5));
  const k = Math.sin(t * 11) * 0.12;
  const tongue = (dx: number, h: number, w: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x + dx - w, y + s * 0.4);
    ctx.quadraticCurveTo(x + dx - w * 1.1, y - h * 0.4, x + dx + k * s, y - h);
    ctx.quadraticCurveTo(x + dx + w * 1.1, y - h * 0.4, x + dx + w, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
  };
  tongue(0, s * (1.6 + Math.sin(t * 7) * 0.15), s * 0.7, '#ff3d2e');
  tongue(-s * 0.35, s * (1.1 + Math.sin(t * 9 + 1) * 0.15), s * 0.4, '#ff8f2e');
  tongue(s * 0.35, s * (1.15 + Math.sin(t * 8 + 2) * 0.15), s * 0.4, '#ff8f2e');
  tongue(0, s * (0.9 + Math.sin(t * 13) * 0.1), s * 0.35, '#ffe14d');
}

// ------------------------------------------------------------------ 台の大きな仕掛け（toys.ts）
/** 盤面の高さのもの：回転盤・しゃべる顔・ボスの城・ハイパーループ・大砲・ガチャマシン */
function drawToysUnder(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const t = wd.time;
  const on = wd.toys;
  drawToysUnder2(ctx, wd);
  // 回転盤：縞の円盤が回る（逆回りになると色が変わる）
  if (on.disc && inView(DISC.x, DISC.y, DISC.r + 10)) {
    const col = wd.disc.dir > 0 ? '#3fd0ff' : '#ff8f2e';
    ctx.save();
    ctx.translate(DISC.x, DISC.y);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(8,12,30,0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, DISC.r, 0, TAU);
    ctx.fill();
    ctx.rotate(wd.disc.a);
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : col;
      ctx.globalAlpha = i % 2 ? 1 : 0.35;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, DISC.r - 4, (i / 8) * TAU, ((i + 1) / 8) * TAU);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, DISC.r - 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // 舵輪の絵が盤といっしょに回る
    if (!drawArt(ctx, TOY_ART.disc[0], DISC.x, DISC.y, DISC.r * 1.9, wd.disc.a, 0.9)) screw(ctx, DISC.x, DISC.y);
    lit(ctx, () => addGlow(ctx, DISC.x, DISC.y, DISC.r * 1.3, col, 0.25));
  }
  // しゃべる顔：ピエロの絵（持っている仕掛けの数で決まるピエロの姿）。目が球を追い、口がときどき大きく開く
  if (on.face && inView(FACE.x, FACE.y, 70)) {
    if (!drawFaceArt(ctx, wd)) drawClown(ctx, wd);
  }
  // ボスの城（ボスがいる間）：跳ね橋と、崩れていく城
  if (on.castle && (wd.bossAlive || wd.castle.crumble > 0) && inView(CASTLE.x, CASTLE.y, 120)) {
    const c = wd.castle;
    const cx = CASTLE.x;
    const by = CASTLE.bridgeY;
    const drop = c.crumble > 0 ? (1 - c.crumble) * 0 + c.crumble * 0 : 0;
    ctx.save();
    ctx.globalAlpha = c.crumble > 0 && !wd.bossAlive ? c.crumble : 1;
    const g = ctx.createLinearGradient(0, by - 110, 0, by);
    g.addColorStop(0, '#5a5f7a');
    g.addColorStop(1, '#2a2e44');
    ctx.fillStyle = g;
    // 塔と壁（崩れていると、上から欠ける）
    const cut = c.crumble * 50;
    const tower = (x: number, w: number, h: number) => {
      ctx.fillRect(x - w / 2, by - h + cut + drop, w, h - cut);
      for (let i = 0; i < 3; i += 1) ctx.fillRect(x - w / 2 + i * (w / 3), by - h - 8 + cut, w / 5, 8);
    };
    // お城の絵（崩れると下へ沈み、上から欠ける）
    const cim = img(toyArt(TOY_ART.castle[0]));
    if (ready(cim)) {
      const sz = 150;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - sz / 2, by - sz + cut, sz, sz - cut);
      ctx.clip();
      ctx.drawImage(cim, cx - sz / 2, by - sz + 6 + cut * 0.6, sz, sz);
      ctx.restore();
    } else {
      tower(cx - 56, 26, 100);
      tower(cx + 56, 26, 100);
      tower(cx, 90, 70);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 45, by - 70 + cut, 90, 70 - cut);
    }
    // 跳ね橋：当てた回数で下がっていく
    const open = c.open ? 1 : c.hits / CASTLE.hits;
    ctx.fillStyle = c.flash > 0 ? '#ffffff' : c.open ? '#ffd23f' : '#7a4a22';
    const bh = 40 * (1 - open * 0.85);
    ctx.fillRect(cx - CASTLE.halfW + 6, by - bh, (CASTLE.halfW - 6) * 2, bh);
    ctx.strokeStyle = '#2a1a00';
    for (let i = 1; i < 5; i += 1) { ctx.beginPath(); ctx.moveTo(cx - CASTLE.halfW + 6 + i * 11, by - bh); ctx.lineTo(cx - CASTLE.halfW + 6 + i * 11, by); ctx.stroke(); }
    ctx.restore();
    if (c.open) lit(ctx, () => addGlow(ctx, cx, by - 20, 60, '#ffd23f', 0.5 + 0.3 * Math.sin(t * 8)));
    label(ctx, c.open ? '中へ打ちこめ！' : `跳ね橋 ${c.hits} / ${CASTLE.hits}`, cx, by + 16, 11, c.open ? '#ffe14d' : '#ffffff');
  }
  // ハイパーループ：光の輪（光が流れる）
  if (on.hyperloop && inView(HYPER.x, HYPER.y, HYPER.r + 30)) {
    const ride = wd.hyper.ride;
    ctx.strokeStyle = 'rgba(160,220,255,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(HYPER.x, HYPER.y, HYPER.r, 0, TAU);
    ctx.stroke();
    // 戦輪の絵が回る（乗っている間は速く）
    drawArt(ctx, TOY_ART.hyperloop[0], HYPER.x, HYPER.y, HYPER.r * 2.7, t * (ride ? 9 : 0.8), 0.85);
    const n = 16;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      const v = ride ? 1 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 5 - i * 0.8));
      const x = HYPER.x + Math.cos(a) * HYPER.r;
      const y = HYPER.y + Math.sin(a) * HYPER.r;
      ctx.globalAlpha = v;
      ctx.fillStyle = ride ? hue(t * 400 + i * 22) : '#3fd0ff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (ride || wd.hyper.flash > 0) lit(ctx, () => addGlow(ctx, HYPER.x, HYPER.y, HYPER.r * 2.2, '#3fd0ff', ride ? 0.6 : wd.hyper.flash * 2));
    // 口（下）
    ctx.fillStyle = wd.hyper.cool > 0 ? 'rgba(255,255,255,0.2)' : '#3fd0ff';
    ctx.beginPath();
    ctx.moveTo(HYPER.mouth[0] - 12, HYPER.mouth[1] + 8);
    ctx.lineTo(HYPER.mouth[0], HYPER.mouth[1] - 6);
    ctx.lineTo(HYPER.mouth[0] + 12, HYPER.mouth[1] + 8);
    ctx.fill();
    label(ctx, ride ? `×${ride.done}` : 'HYPER', HYPER.x, HYPER.y, ride ? 14 : 9, '#bfe9ff');
  }
  // 大砲：台座と砲身（入っている間は首を振る）
  if (on.cannon && inView(CANNON.x, CANNON.y, 50)) {
    const a = wd.cannon.a;
    const loaded = wd.parked === 'cannon';
    ctx.fillStyle = '#2a2e44';
    ctx.beginPath();
    ctx.arc(CANNON.x, CANNON.y, 20, 0, TAU);
    ctx.fill();
    // 砲身：大筒の絵（絵の砲口は右上なので、45 度ずらして向ける）
    const recoil = Math.max(0, 0.25 - (wd.time - wd.cannon.fired)) * 40;
    if (!drawArt(ctx, TOY_ART.cannon[0], CANNON.x + Math.cos(a) * (14 - recoil), CANNON.y + Math.sin(a) * (14 - recoil), 70, a + Math.PI / 4)) {
      ctx.save();
      ctx.translate(CANNON.x, CANNON.y);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -9, 0, 9);
      g.addColorStop(0, '#c9d4ff');
      g.addColorStop(0.5, '#5a6080');
      g.addColorStop(1, '#1a1e30');
      ctx.fillStyle = g;
      ctx.fillRect(0, -9, 36, 18);
      ctx.fillStyle = loaded ? '#ff8f2e' : '#8a93b8';
      ctx.fillRect(32, -11, 6, 22);
      ctx.restore();
    }
    if (loaded) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,143,46,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANNON.x + Math.cos(a) * 40, CANNON.y + Math.sin(a) * 40);
      ctx.lineTo(CANNON.x + Math.cos(a) * 260, CANNON.y + Math.sin(a) * 260);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, '引っぱって離すと発射', CANNON.x - 30, CANNON.y + 34, 11, '#ffd7b0');
      // 自動で撃つまでの残り（輪が減っていく）
      const left = Math.max(0, 1 - wd.parkT / CANNON.auto);
      ctx.strokeStyle = left < 0.34 && Math.floor(wd.time * 10) % 2 ? '#ff4f5e' : '#ffd23f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(CANNON.x, CANNON.y, 28, -Math.PI / 2, -Math.PI / 2 + TAU * left);
      ctx.stroke();
    }
    if (wd.cannon.flash > 0) lit(ctx, () => addGlow(ctx, CANNON.x + Math.cos(a) * 40, CANNON.y + Math.sin(a) * 40, 50, '#ff8f2e', wd.cannon.flash * 2));
    screw(ctx, CANNON.x, CANNON.y);
  }
  // ガチャマシン：ロックした球がカプセルになって見える
  if (on.gacha && inView(GACHA[0], GACHA[1], 50)) {
    const [gx, gy] = GACHA;
    ctx.fillStyle = '#c0283a';
    ctx.fillRect(gx - 16, gy + 6, 32, 22);
    ctx.fillStyle = 'rgba(190,230,255,0.22)';
    ctx.strokeStyle = 'rgba(220,240,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy - 6, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const n = wd.saucer.locks;
    for (let i = 0; i < n; i += 1) {
      const a = t * 0.8 + (i / Math.max(1, n)) * TAU;
      const cx = gx + Math.cos(a) * 8;
      const cy = gy - 4 + Math.sin(a) * 6;
      ctx.fillStyle = hue(i * 120 + 30);
      ctx.beginPath();
      ctx.arc(cx, cy, 6, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI);
      ctx.fill();
    }
    // ノブ（マルチボールの瞬間に回る）
    const pop = wd.time - wd.gachaPop;
    ctx.save();
    ctx.translate(gx, gy + 17);
    ctx.rotate(pop < 1 ? pop * TAU : 0);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(-8, -2, 16, 4);
    ctx.restore();
    if (pop < 1) lit(ctx, () => addGlow(ctx, gx, gy, 60, '#ffd23f', 1 - pop));
    label(ctx, `${n} / ${wd.locksNeeded}`, gx, gy + 38, 10, '#ffffff');
  }
}
/** 新しい仕掛け（盤面の高さ）：つかむ手の受け皿とレール・捕まった球・出たり引っこむ的・上の台の入口・怪物・UFO・磁石・モアイ */
function drawToysUnder2(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const t = wd.time;
  const on = wd.toys;
  // つかむ手：受け皿（下のまん中）と、上の 3 つの賞
  if (on.crane) {
    const [cx, cy] = CRANE.cup;
    const carrying = wd.carry?.kind === 'crane';
    if (inView(cx, cy, 40)) {
      holeCup(ctx, cx, cy, CRANE.r, wd.crane.cool > 0 ? '#555a70' : '#ffd23f');
      if (!carrying && wd.crane.cool <= 0) {
        ctx.strokeStyle = '#ffd23f';
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, CRANE.r + 8, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      label(ctx, 'GRAB', cx, cy + 30, 10, '#ffe14d');
    }
    if (inView(360, CRANE.railY, 260)) {
      // レール
      ctx.strokeStyle = 'rgba(200,210,255,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(CRANE.drops[0] - 30, CRANE.railY - 34);
      ctx.lineTo(CRANE.drops[2] + 30, CRANE.railY - 34);
      ctx.stroke();
      const sel = carrying ? wd.carry?.sel ?? -1 : -1;
      const got = t - wd.crane.prizeT < 1 ? wd.crane.prize : -1;
      CRANE.drops.forEach((x, i) => {
        const hot = i === sel || i === got;
        ctx.fillStyle = hot ? 'rgba(255,210,63,0.35)' : 'rgba(10,14,30,0.6)';
        ctx.strokeStyle = hot ? '#ffe14d' : 'rgba(255,210,63,0.5)';
        ctx.lineWidth = 2;
        roundRect(ctx, x - 26, CRANE.railY + 4, 52, 22, 6);
        ctx.fill();
        ctx.stroke();
        label(ctx, CRANE_PRIZE[i], x, CRANE.railY + 15, 10, hot ? '#ffffff' : '#ffd23f');
        if (hot) lit(ctx, () => addGlow(ctx, x, CRANE.railY + 15, 40, '#ffd23f', 0.6));
      });
    }
  }
  // 捕まった球：ガラスの筒と、中の地球の球
  if (on.captive && inView(CAPTIVE.x, CAPTIVE.y - CAPTIVE.len / 2, 80)) {
    const cp = wd.captive;
    const x = CAPTIVE.x;
    const top = CAPTIVE.y - CAPTIVE.len - 16;
    ctx.fillStyle = 'rgba(160,220,255,0.12)';
    ctx.strokeStyle = cp.flash > 0 ? '#ffffff' : 'rgba(160,220,255,0.7)';
    ctx.lineWidth = 2;
    roundRect(ctx, x - 17, top, 34, CAPTIVE.len + 16, 14);
    ctx.fill();
    ctx.stroke();
    // てっぺんの印（届いた回数）
    for (let i = 0; i < CAPTIVE.hits; i += 1) {
      ctx.fillStyle = i < cp.hits ? '#3fd0ff' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(x - 10 + i * 10, top - 8, 3.5, 0, TAU);
      ctx.fill();
    }
    const by = CAPTIVE.y - 2 - cp.off;
    if (!drawArt(ctx, TOY_ART.captive[0], x, by, 32, cp.off * 0.05)) {
      ctx.fillStyle = '#3fd0ff';
      ctx.beginPath();
      ctx.arc(x, by, 13, 0, TAU);
      ctx.fill();
    }
    // 下の口（当てるところ）
    ctx.strokeStyle = '#3fd0ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(CAPTIVE.x, CAPTIVE.y, CAPTIVE.r, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (cp.flash > 0) lit(ctx, () => addGlow(ctx, x, by, 50, '#3fd0ff', cp.flash * 2));
  }
  // 出たり引っこむ的：穴と、せり上がるカエル
  if (on.popup) {
    POPUPS.forEach(([x, y], i) => {
      if (!inView(x, y, 40)) return;
      const pp = wd.pops[i];
      holeCup(ctx, x, y, POPUP.r, pp.up ? '#4fe07a' : '#2a6a3a');
      if (pp.h <= 0.02) return;
      const k = pp.h;
      const id = TOY_ART.popup[i % TOY_ART.popup.length];
      if (!drawArt(ctx, id, x, y - 6 * k, 42 * (0.35 + 0.65 * k), 0, k)) {
        ctx.fillStyle = '#4fe07a';
        ctx.beginPath();
        ctx.arc(x, y, POPUP.r * k, 0, TAU);
        ctx.fill();
      }
      if (pp.up && pp.t < 1 && Math.floor(t * 10) % 2) label(ctx, '!', x + 14, y - 18, 12, '#ff4f5e');
      if (pp.flash > 0) lit(ctx, () => addGlow(ctx, x, y, 40, '#4fe07a', pp.flash * 2));
    });
  }
  // 上の小さな台の入口（エレベーター）
  if (on.mini && inView(MINI.x, MINI.y, 40)) {
    holeCup(ctx, MINI.x, MINI.y, MINI.r, wd.mini.cool > 0 ? '#555a70' : '#c08bff');
    for (let i = 0; i < 3; i += 1) {
      const yy = MINI.y - 26 - ((t * 30 + i * 10) % 30);
      ctx.globalAlpha = 0.4 + 0.2 * i;
      ctx.fillStyle = '#c08bff';
      ctx.beginPath();
      ctx.moveTo(MINI.x - 7, yy + 6);
      ctx.lineTo(MINI.x, yy);
      ctx.lineTo(MINI.x + 7, yy + 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    label(ctx, 'UPPER', MINI.x, MINI.y + 30, 10, '#e2c8ff');
  }
  // 食べて吐く怪物（ティラノの絵。台が進むと上のレアリティ）
  if (on.dino && inView(DINO.x, DINO.y, 70)) {
    const chomp = Math.max(0, 0.2 - (t - wd.dino.chomp)) * 5;
    const eating = wd.carry?.kind === 'dino';
    const id = tierArt(TOY_ART.dino, wd.floor);
    if (!drawArt(ctx, id, DINO.x, DINO.y - chomp * 6, 84 * (1 + chomp * 0.12), Math.sin(t * 2) * 0.05)) {
      ctx.fillStyle = '#4a8a3a';
      ctx.beginPath();
      ctx.arc(DINO.x, DINO.y, 30, 0, TAU);
      ctx.fill();
    }
    // 口（入るところ）
    ctx.strokeStyle = wd.dino.cool > 0 ? 'rgba(255,255,255,0.25)' : '#ff4f5e';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(DINO.mouth[0], DINO.mouth[1], DINO.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (eating) label(ctx, 'CHOMP!', DINO.x, DINO.y - 52, 13, '#ffe14d');
  }
  // 磁石：ゆっくり回り、まわりに輪が広がる
  if (on.magnet && inView(MAGNET.x, MAGNET.y, 60)) {
    const busy = wd.carry?.kind === 'magnet';
    for (let i = 0; i < 2; i += 1) {
      const k = ((t * (busy ? 2.5 : 0.8) + i * 0.5) % 1);
      ctx.strokeStyle = '#c08bff';
      ctx.globalAlpha = (1 - k) * (wd.magToy.cool > 0 ? 0.2 : 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(MAGNET.x, MAGNET.y, MAGNET.r * (1.2 - k * 0.8), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!drawArt(ctx, TOY_ART.magnet[0], MAGNET.x, MAGNET.y, 72, busy ? t * 14 : Math.sin(t) * 0.3)) {
      ctx.fillStyle = '#ff4f5e';
      ctx.fillRect(MAGNET.x - 12, MAGNET.y - 5, 12, 10);
      ctx.fillStyle = '#3f7bff';
      ctx.fillRect(MAGNET.x, MAGNET.y - 5, 12, 10);
    }
    if (busy) lit(ctx, () => addGlow(ctx, MAGNET.x, MAGNET.y, 70, '#c08bff', 0.6));
  }
  // ゆれる UFO：3 回当てると開いて光線を撃つ
  if (on.ufo && inView(wd.ufo.x, wd.ufo.y, 60)) {
    const u = wd.ufo;
    if (u.open > 0) {
      lit(ctx, () => {
        ctx.fillStyle = 'rgba(109,255,176,0.18)';
        ctx.beginPath();
        ctx.moveTo(u.x - 14, u.y + 10);
        ctx.lineTo(u.x + 14, u.y + 10);
        ctx.lineTo(u.x + 60, u.y + 160);
        ctx.lineTo(u.x - 60, u.y + 160);
        ctx.fill();
      });
    }
    const wob = Math.sin(t * 2.6) * 0.12 + (u.flash > 0 ? Math.sin(t * 60) * 0.2 : 0);
    if (!drawArt(ctx, TOY_ART.ufo[0], u.x, u.y, 60, wob)) {
      ctx.fillStyle = '#9fb3ff';
      ctx.beginPath();
      ctx.ellipse(u.x, u.y, 26, 10, wob, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < UFO.hits; i += 1) {
      ctx.fillStyle = u.open > 0 || i < u.hits ? '#6dffb0' : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(u.x - 10 + i * 10, u.y + 32, 3.5, 0, TAU);
      ctx.fill();
    }
    if (u.open > 0 || u.flash > 0) lit(ctx, () => addGlow(ctx, u.x, u.y, 70, '#6dffb0', u.open > 0 ? 0.7 : u.flash * 2));
  }
  // 倒れる的の壁：4 体のモアイ。全部倒すと金のモアイ
  if (on.moai && inView(360, MOAI.y, 120)) {
    const m = wd.moai;
    MOAI.xs.forEach((x, i) => {
      const id = TOY_ART.moai[i];
      if (m.up[i] && m.rise <= 0) {
        if (!drawArt(ctx, id, x, MOAI.y - 4, 40)) {
          ctx.fillStyle = '#8a8f9c';
          ctx.fillRect(x - 10, MOAI.y - 16, 20, 30);
        }
      } else {
        // 倒れている（寝ている・うすく）
        const k = m.fall[i];
        drawArt(ctx, id, x, MOAI.y + 6 - k * 6, 40, (1 - k) * (i < 2 ? -1.4 : 1.4), 0.35 + k * 0.6);
      }
    });
    if (m.gold > 0) {
      const pop = Math.min(1, (MOAI.gold - m.gold) * 3);
      lit(ctx, () => addGlow(ctx, 360, MOAI.y, 70, '#ffd23f', 0.5 + 0.3 * Math.sin(t * 8)));
      drawArt(ctx, TOY_ART.moai[4], 360, MOAI.y - 6 - 4 * Math.sin(t * 5), 52 * pop);
      label(ctx, `${Math.ceil(m.gold)}`, 360, MOAI.y + 30, 11, '#ffe14d');
    }
    if (m.flash > 0) lit(ctx, () => addGlow(ctx, 360, MOAI.y, 120, '#ffd23f', m.flash));
  }
}
/** 新しい仕掛け（球より上）：つかむ手のアームと、UFO の光線 */
function drawToysOver2(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const c = wd.carry;
  if (c?.kind === 'crane') {
    const p = wd.puck;
    const [, cy] = CRANE.cup;
    const down = Math.min(1, c.t / CRANE.down);
    const clawY = c.t < CRANE.down ? cy - 90 + 90 * down - 20 : p.y - 20;
    const clawX = p.x;
    // ワイヤー（レールから）
    ctx.strokeStyle = 'rgba(220,230,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clawX, CRANE.railY - 34);
    ctx.lineTo(clawX, clawY - 14);
    ctx.stroke();
    ctx.fillStyle = '#c9d4ff';
    ctx.fillRect(clawX - 10, CRANE.railY - 40, 20, 10);
    // 爪の絵（指が下を向くように回す）
    if (!drawArt(ctx, TOY_ART.crane[0], clawX, clawY, 46, Math.PI * 1.25)) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(clawX - 12, clawY + 12);
      ctx.lineTo(clawX, clawY - 6);
      ctx.lineTo(clawX + 12, clawY + 12);
      ctx.stroke();
    }
    if (c.t > CRANE.down + CRANE.lift) label(ctx, '傾けて選ぶ', clawX, clawY - 34, 11, '#ffe14d');
  }
  for (const z of wd.zaps) {
    const a = 1 - (wd.time - z.t) / 0.4;
    ctx.globalAlpha = Math.max(0, a);
    ctx.strokeStyle = '#6dffb0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(wd.ufo.x, wd.ufo.y + 10);
    ctx.lineTo(z.x, z.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    lit(ctx, () => addGlow(ctx, z.x, z.y, 40, '#6dffb0', a));
  }
}
/** 上の小さな台：画面の下に出る小窓（入っている間だけ。0.5 秒で出入りする） */
function drawMiniTable(ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink): void {
  const shown = wd.mini.shown;
  if (shown <= 0) return;
  const e = shown * shown * (3 - 2 * shown);
  const ph = Math.min(rink.h * 0.56, (Math.min(rink.w * 0.62, 250) * MINI.h) / MINI.w);
  const pw = (ph * MINI.w) / MINI.h;
  const px = rink.x + (rink.w - pw) / 2;
  const py = rink.y + rink.h - ph - 14 + (1 - e) * (ph + 40);
  const s = pw / MINI.w;
  const m = wd.mini;
  const t = wd.time;
  ctx.save();
  ctx.globalAlpha = e;
  // 枠
  const g = ctx.createLinearGradient(0, py, 0, py + ph);
  g.addColorStop(0, '#2a1448');
  g.addColorStop(1, '#0c0820');
  ctx.fillStyle = g;
  roundRect(ctx, px - 6, py - 26, pw + 12, ph + 32, 14);
  ctx.fill();
  ctx.strokeStyle = hue(t * 120);
  ctx.lineWidth = 3;
  ctx.stroke();
  label(ctx, 'UPPER PLAYFIELD', px + pw / 2, py - 13, 12, '#e2c8ff');
  // のこり時間
  const left = wd.carry?.kind === 'mini' ? Math.max(0, 1 - wd.carry.t / MINI.time) : 0;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px, py - 4, pw, 3);
  ctx.fillStyle = '#c08bff';
  ctx.fillRect(px, py - 4, pw * left, 3);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.translate(px, py);
  ctx.scale(s, s);
  // 盤面の光る格子
  ctx.strokeStyle = 'rgba(192,139,255,0.12)';
  ctx.lineWidth = 1;
  for (let y = 20; y < MINI.h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MINI.w, y); ctx.stroke(); }
  // 下の坂とフリッパー
  ctx.strokeStyle = '#c08bff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, MINI.h - 90);
  ctx.lineTo(MINI.w / 2 - 38, MINI.h - 34);
  ctx.moveTo(MINI.w, MINI.h - 90);
  ctx.lineTo(MINI.w / 2 + 38, MINI.h - 34);
  ctx.stroke();
  const fa = m.flip > 0.1 ? -0.5 : 0.35;
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.translate(MINI.w / 2 + sd * 38, MINI.h - 34);
    ctx.scale(-sd, 1);
    ctx.rotate(fa);
    ctx.fillStyle = '#ff4f5e';
    roundRect(ctx, 0, -4, 30, 8, 4);
    ctx.fill();
    ctx.restore();
  }
  // 観覧車のバンパー（点くと光る）
  MINI_BUMPERS.forEach((bp, i) => {
    const on = m.lit[i];
    ctx.fillStyle = on ? 'rgba(255,210,63,0.35)' : 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = m.flash[i] > 0 ? '#ffffff' : on ? '#ffd23f' : '#c08bff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    drawArt(ctx, TOY_ART.mini[i % TOY_ART.mini.length], bp.x, bp.y, bp.r * 2.4, Math.sin(t * 1.5 + i) * 0.1);
    if (on || m.flash[i] > 0) lit(ctx, () => addGlow(ctx, bp.x, bp.y, bp.r * 2.2, '#ffd23f', on ? 0.4 : m.flash[i] * 3));
  });
  // 球
  if (wd.carry?.kind === 'mini') medallion(ctx, m.x, m.y, MINI.br, wd.ballHero.img, RARITY_COLOR[wd.ballHero.rarity], 1);
  ctx.restore();
  ctx.restore();
}
/** しゃべる顔（ピエロの絵）。口が開くと、口の位置に大きな穴が開く */
function drawFaceArt(ctx: CanvasRenderingContext2D, wd: PinballWorld): boolean {
  const id = TOY_ART.face[Math.max(0, Math.min(TOY_ART.face.length - 1, wd.clown))];
  if (!ready(img(toyArt(id)))) return false;
  const t = wd.time;
  const f = wd.face;
  const fx = FACE.x;
  const fy = FACE.y;
  // 台座（ピンクの縁の丸）
  ctx.fillStyle = 'rgba(20,8,30,0.8)';
  ctx.strokeStyle = f.open ? hue(t * 300) : '#ff6ad5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx, fy, 44, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const mo = f.open ? Math.min(1, (FACE.open - f.t) * 4 + 0.2) : 0;
  const sq = 1 + (f.flash > 0 ? 0.12 : 0) + mo * 0.06 * Math.sin(t * 18);
  drawArt(ctx, id, fx, fy - 4 + Math.sin(t * 3) * 1.5, 92 * sq, Math.sin(t * 1.7) * 0.06);
  if (f.open) {
    // 口：赤いくちびるの大きな穴
    ctx.fillStyle = '#ff2e4f';
    ctx.beginPath();
    ctx.ellipse(fx, FACE.mouthY + 4, 20, 6 + 10 * mo, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0a0d1c';
    ctx.beginPath();
    ctx.ellipse(fx, FACE.mouthY + 4, 14, 3 + 8 * mo, 0, 0, TAU);
    ctx.fill();
    lit(ctx, () => addGlow(ctx, fx, FACE.mouthY, 46, '#ff2e4f', 0.5 + 0.3 * Math.sin(t * 10)));
    label(ctx, 'OPEN!', fx, fy - 54, 12, '#ffe14d');
  }
  return true;
}
/** しゃべる顔（絵が読みこめないとき）：図形のピエロ */
function drawClown(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const t = wd.time;
  const f = wd.face;
  const p = wd.puck;
  const fx = FACE.x;
  const fy = FACE.y;
  const bob = Math.sin(t * 3) * 1.5;
  // もじゃもじゃの髪（左右。色が流れる）
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      ctx.fillStyle = hue(t * 60 + k * 50 + (sd > 0 ? 180 : 0));
      ctx.beginPath();
      ctx.arc(fx + sd * (34 + (k % 2) * 6), fy - 10 + k * 9 + bob, 9, 0, TAU);
      ctx.fill();
    }
  }
  // 顔（白）
  ctx.fillStyle = f.flash > 0 ? '#ffe14d' : '#fbf6ff';
  ctx.strokeStyle = '#ff6ad5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(fx, fy + 6, 34, 36, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // とんがり帽子とぽんぽん
  ctx.fillStyle = '#3fd0ff';
  ctx.beginPath();
  ctx.moveTo(fx - 20, fy - 24);
  ctx.lineTo(fx + 20, fy - 24);
  ctx.lineTo(fx + 6 + bob, fy - 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  for (let k = 0; k < 3; k += 1) { ctx.beginPath(); ctx.arc(fx - 8 + k * 7 + bob * 0.3, fy - 32 - k * 9, 2.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#ff4f5e';
  ctx.beginPath();
  ctx.arc(fx + 6 + bob, fy - 64, 6, 0, TAU);
  ctx.fill();
  // 目（ひし形の化粧と、球を追う黒目）
  for (const sx of [-13, 13]) {
    const ex = fx + sx;
    const ey = fy - 6;
    ctx.fillStyle = '#3fd0ff';
    ctx.beginPath();
    ctx.moveTo(ex, ey - 17); ctx.lineTo(ex + 5, ey - 10); ctx.lineTo(ex, ey - 3); ctx.lineTo(ex - 5, ey - 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex, ey + 3); ctx.lineTo(ex + 4, ey + 9); ctx.lineTo(ex, ey + 15); ctx.lineTo(ex - 4, ey + 9);
    ctx.closePath();
    ctx.fill();
    const a = Math.atan2(p.y - ey, p.x - ex);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0a0d1c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 7.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0a0d1c';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(a) * 3.5, ey + Math.sin(a) * 3.5, 3.8, 0, TAU);
    ctx.fill();
  }
  // 口（赤いくちびるの大きな笑い。開くと大きな穴）
  const mo = f.open ? Math.min(1, (FACE.open - f.t) * 4 + 0.2) : 0;
  ctx.fillStyle = '#ff2e4f';
  ctx.beginPath();
  ctx.ellipse(fx, FACE.mouthY + 2, 22, 7 + 12 * mo, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = f.open ? '#0a0d1c' : '#fbf6ff';
  ctx.beginPath();
  if (f.open) ctx.ellipse(fx, FACE.mouthY + 2, 15, 3 + 11 * mo, 0, 0, TAU);
  else ctx.ellipse(fx, FACE.mouthY - 2, 18, 5, 0, 0, Math.PI, true);
  ctx.fill();
  // 赤い鼻（口が開いている間は光る）
  ctx.fillStyle = '#ff2e4f';
  ctx.beginPath();
  ctx.arc(fx, fy + 8, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(fx - 2, fy + 6, 2, 0, TAU);
  ctx.fill();
  if (f.open) lit(ctx, () => { addGlow(ctx, fx, FACE.mouthY, 44, '#ff2e4f', 0.5 + 0.3 * Math.sin(t * 10)); addGlow(ctx, fx, fy + 8, 22, '#ff4f5e', 0.8); });
}
/** 上に重なるもの：ボスの反撃の知らせと叩いた瞬間 */
function drawToysOver(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  drawToysOver2(ctx, wd);
  const h = wd.hammer;
  if (wd.toys.hammer && h.warn >= 0) {
    const k = 1 - h.warn / HAMMER.warn;
    const blink = Math.floor(wd.time * 12) % 2 ? 1 : 0.4;
    ctx.strokeStyle = '#ff4f5e';
    ctx.globalAlpha = blink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(h.x, h.y, HAMMER.reach * (1 - k * 0.7), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 審判の槌が振りかぶって、下ろされる
    drawArt(ctx, TOY_ART.hammer[0], h.x + 34, h.y - 56, 110, -0.9 + k * k * 1.3);
    label(ctx, 'BOSS SMASH!', h.x, h.y - 20, 16, '#ff9aa3');
  }
  const since = wd.time - h.slamT;
  if (since < 0.35) drawArt(ctx, TOY_ART.hammer[0], h.x + 34, h.y - 40, 110, 0.4, 1 - since / 0.35);
  if (since < 0.5) {
    ctx.globalAlpha = 1 - since / 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 30 + since * 600, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    lit(ctx, () => addGlow(ctx, h.x, h.y, 160, '#ff4f5e', 1 - since / 0.5));
  }
}

/** 解説モードの名札（番号つきの丸）と、選んだ部品の光る輪。はじめて触れた部品の名札も */
function drawGuide(ctx: CanvasRenderingContext2D, wd: PinballWorld, k: number): void {
  const now = performance.now() / 1000;
  const pins = guideView.pins;
  if (pins) {
    // 台を少し暗くして、選んだ部品だけを明るく見せる
    const sel = pins.find((p) => p.sel);
    if (sel) {
      ctx.save();
      if (sel.gray) {
        // ほかの部品をグレーに（色だけを抜く。ぼかしは使わない）
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = '#808080';
        ctx.beginPath();
        ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
        ctx.arc(sel.hx, sel.hy, sel.r + 8, 0, TAU, true);
        ctx.fill('evenodd');
        ctx.globalCompositeOperation = 'source-over';
      }
      if (sel.ghost) {
        // 台にまだない部品：うすく見せる（場所だけ分かるように）
        ctx.fillStyle = 'rgba(2,4,12,0.5)';
        ctx.beginPath();
        ctx.arc(sel.hx, sel.hy, sel.r + 8, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = sel.gray ? 'rgba(2,4,12,0.3)' : 'rgba(2,4,12,0.45)';
      ctx.beginPath();
      ctx.rect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      ctx.arc(sel.hx, sel.hy, sel.r + 8, 0, TAU, true);
      ctx.fill('evenodd');
      const pulse = 1 + Math.sin(now * 5) * 0.06;
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = (sel.gray ? 4 : 3) / k;
      ctx.setLineDash([10 / k, 7 / k]);
      ctx.lineDashOffset = -now * 30 / k;
      ctx.beginPath();
      ctx.arc(sel.hx, sel.hy, (sel.r + 8) * pulse, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      lit(ctx, () => addGlow(ctx, sel.hx, sel.hy, sel.r + 40, '#ffd23f', 0.35));
      ctx.restore();
    }
    const pr = 13 / k;
    for (const p of pins) {
      if (!inView(p.x, p.y, pr)) continue;
      ctx.globalAlpha = sel && !p.sel ? 0.55 : 1;
      ctx.fillStyle = p.sel ? '#ffe14d' : 'rgba(10,14,34,0.92)';
      ctx.strokeStyle = p.sel ? '#ffffff' : '#ffe14d';
      ctx.lineWidth = 2 / k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sel ? pr * 1.2 : pr, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.sel ? '#1a1000' : '#ffe14d';
      ctx.font = `${(p.sel ? 15 : 13) / k}px 'Bangers', 'Dela Gothic One', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.n), p.x, p.y + 1 / k);
    }
    ctx.globalAlpha = 1;
  }
  // はじめて触れた部品の名札（2.8 秒で消える）
  guideView.tags = guideView.tags.filter((g) => now - g.t0 < 2.8);
  for (const g of guideView.tags) {
    const a = now - g.t0;
    const al = a < 0.2 ? a / 0.2 : a > 2.2 ? (2.8 - a) / 0.6 : 1;
    const y = g.y - 26 / k - a * 10 / k;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.font = `${13 / k}px 'DotGothic16', sans-serif`;
    const tw = ctx.measureText(g.text).width + 16 / k;
    ctx.fillStyle = 'rgba(8,12,30,0.9)';
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.roundRect(g.x - tw / 2, y - 12 / k, tw, 24 / k, 6 / k);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe14d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.text, g.x, y + 1 / k);
    ctx.restore();
  }
  void wd;
}

/** 全体の光の色：ふつうは青白、ボス中は赤、ブラックホール中は紫、入口が開くと金、マルチボールと ZONE は虹 */
function giColor(wd: PinballWorld): string {
  if (wd.zone) return hue(wd.time * 300);
  if (wd.multi) return hue(wd.time * 120);
  if (wd.gate.open) return '#ffd23f';
  if (wd.hole.on) return '#c08bff';
  if (wd.bossAlive) return '#ff4f5e';
  return '#7fd6ff';
}

function drawLamps(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const idle = wd.parked === 'plunger' && wd.shows.length === 0;
  for (const l of LAMPS) {
    if (!inView(l.x, l.y, 40) || !lampOn(wd, l)) continue;
    let a = lampBase(wd, l);
    let color = l.color;
    const sh = showLight(wd, l.x, l.y);
    if (sh.a > a) { a = sh.a; color = sh.color ?? color; }
    // 打ち出し待ちの間は、ゆっくり光が流れる（見ていて飽きないように）
    if (idle) {
      const v = 0.5 + 0.5 * Math.sin(wd.time * 3 - l.y * 0.012 + l.x * 0.006);
      if (v * 0.7 > a) { a = v * 0.7; color = hue(l.y * 0.3 + wd.time * 60); }
    }
    if (wd.zone) color = hue(l.x + l.y + wd.time * 500);
    if (a <= 0.03) continue;
    drawLampShape(ctx, l);
    // 大きな丸いランプはべた塗りにしない（球や的より目立たないように、うすいガラス＋ふち）
    const soft = l.shape === 'circle' ? 0.4 : 1;
    ctx.globalAlpha = (0.25 + 0.75 * a) * soft;
    ctx.fillStyle = color;
    ctx.fill();
    if (soft < 1) {
      ctx.globalAlpha = 0.25 + 0.75 * a;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (a > 0.6) {
      ctx.globalAlpha = (a - 0.6) * 1.5;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    if (!wd.lowFx || a > 0.6) lit(ctx, () => addGlow(ctx, l.x, l.y, l.size * 2.6, color, a * 0.7));
  }
  ctx.globalAlpha = 1;
  // レーンの文字
  const ly = (T.LANE_Y[0] + T.LANE_Y[1]) / 2;
  wd.lanes.forEach((ln, i) => {
    const on = ln.lit || (ln.flash > 0 && Math.floor(ln.flash * 12) % 2 === 0);
    if (wd.skillShot?.lane === i) {
      // スキルショットのねらい（緑に点滅）
      const b = Math.floor(wd.time * 8) % 2 === 0;
      lit(ctx, () => addGlow(ctx, ln.x, ly, 34, '#4fe07a', b ? 1 : 0.4));
      label(ctx, 'SKILL', ln.x, T.LANE_Y[1] + 12, 9, '#7dffb0');
    }
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,0.16)';
    ctx.beginPath();
    ctx.arc(ln.x, ly, 10, 0, TAU);
    ctx.fill();
    if (on) lit(ctx, () => addGlow(ctx, ln.x, ly, 26, '#ffd23f', 0.8));
    label(ctx, PinballWorld.LETTERS[i], ln.x, ly + 1, 13, on ? '#0a0d1c' : 'rgba(255,255,255,0.55)', false);
  });
  // GUM の倍率（G-U-M のレーンかミステリーがあるときだけ。倍率が上がるのはその 2 つ）
  if (wd.toys.lanes || wd.toys.mystery) T.MUL_LAMPS.forEach(([x, y], i) => {
    const on = wd.pinMul >= i + 2;
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,0.12)';
    roundRect(ctx, x - 9, y - 7, 18, 14, 4);
    ctx.fill();
    if (on) lit(ctx, () => addGlow(ctx, x, y, 18, '#ffd23f', 0.6));
    label(ctx, `×${i + 2}`, x, y, 9, on ? '#0a0d1c' : 'rgba(255,255,255,0.4)', false);
  });
  // スピナー
  for (const sp of wd.spinners) {
    const w = Math.abs(Math.cos(sp.angle)) * 24 + 2;
    ctx.fillStyle = sp.speed > 1 ? '#ffd23f' : '#c9d6ff';
    ctx.fillRect(sp.x - w, sp.y - 3, w * 2, 6);
    ctx.strokeStyle = '#0a0d1c';
    ctx.lineWidth = 1;
    ctx.strokeRect(sp.x - w, sp.y - 3, w * 2, 6);
  }
  // ロックのホール（マルチボールの部品があれば、ロックの数の玉）
  const sc = wd.saucer;
  if (wd.toys.lock) holeCup(ctx, sc.x, sc.y, sc.r, sc.flash > 0 ? '#ffffff' : '#ff8f2e');
  const need = wd.toys.lock && wd.toys.multi ? wd.locksNeeded : 0;
  for (let i = 0; i < need; i += 1) {
    ctx.fillStyle = sc.locks > i ? '#ff8f2e' : 'rgba(255,143,46,0.18)';
    ctx.beginPath();
    ctx.arc(sc.x - (need - 1) * 8 + i * 16, sc.y + 22, 4.5, 0, TAU);
    ctx.fill();
  }
  if (wd.toys.lock) label(ctx, 'LOCK', sc.x, sc.y - 22, 9, 'rgba(255,190,120,0.9)', false);
  // ミステリーのホール（止まっている間はルーレット）
  const my = wd.mystery;
  const spinning = wd.parked === 'mystery';
  if (wd.toys.mystery) {
    holeCup(ctx, my.x, my.y, my.r, spinning ? hue(wd.time * 900) : '#ffd23f');
    label(ctx, '?', my.x, my.y + 1, 14, spinning ? '#ffffff' : '#ffd23f', false);
    label(ctx, spinning ? MYSTERIES[Math.floor(wd.time * 14) % MYSTERIES.length].text : 'MYSTERY', my.x, my.y - 22, 9, 'rgba(255,230,150,0.95)', spinning);
    if (spinning) lit(ctx, () => addGlow(ctx, my.x, my.y, 50, hue(wd.time * 900), 0.8));
  }
  // ワープ（渦）と出口
  for (const wp of wd.warps) {
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = `rgba(192,139,255,${0.85 - i * 0.18})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, wp.r - i * 3, wd.time * 5 + i * 1.3, wd.time * 5 + i * 1.3 + 4.2);
      ctx.stroke();
    }
    lit(ctx, () => addGlow(ctx, wp.x, wp.y, 30, '#c08bff', 0.35 + 0.15 * Math.sin(wd.time * 6)));
    ctx.strokeStyle = 'rgba(192,139,255,0.5)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(wp.out[0], wp.out[1], 10, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // キックバック（左右のアウトレーン）
  for (const kb of wd.kickbacks) {
    const x = kb.side === -1 ? 195 : 525;
    ctx.fillStyle = kb.lit ? (kb.flash > 0 && Math.floor(kb.flash * 10) % 2 ? '#ffffff' : '#4fe07a') : 'rgba(79,224,122,0.15)';
    roundRect(ctx, x - 12, T.KICK_Y + 6, 24, 10, 3);
    ctx.fill();
    if (kb.lit) lit(ctx, () => addGlow(ctx, x, T.KICK_Y + 11, 18, '#4fe07a', 0.5));
    label(ctx, 'KICK', x, T.KICK_Y - 4, 8, kb.lit ? '#bfffd4' : 'rgba(255,255,255,0.3)', false);
  }
  if (wd.ballSaveUntil > wd.time) label(ctx, 'SHOOT AGAIN', T.BALL_SAVE_LAMP[0], T.BALL_SAVE_LAMP[1], 8, '#0a0d1c', false);
  // スキルのセーブ（使えるときに光る）
  const saves: [string, boolean, string][] = [];
  if (wd.st.magna) saves.push(['MAGNA', wd.time >= wd.magnaReady, '#ff4f5e']);
  if (wd.st.shakeSave) saves.push(['SHAKE', wd.time >= wd.shakeSaveReady, '#3fa9ff']);
  saves.forEach(([name, ready, col], i) => {
    const x = T.TW / 2 + (i - (saves.length - 1) / 2) * 52;
    const y = 1200;
    ctx.fillStyle = ready ? col : 'rgba(255,255,255,0.08)';
    roundRect(ctx, x - 22, y - 6, 44, 12, 4);
    ctx.fill();
    if (ready) lit(ctx, () => addGlow(ctx, x, y, 22, col, 0.4));
    label(ctx, name, x, y, 8, ready ? '#0a0d1c' : 'rgba(255,255,255,0.35)', false);
  });
}

function holeCup(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rim: string): void {
  const hg = ctx.createRadialGradient(x, y, 2, x, y, r);
  hg.addColorStop(0, '#000');
  hg.addColorStop(1, '#2a1a10');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** ブースター（矢印が流れ続ける。通ると光る） */
function drawBoosters(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  for (const b of wd.boosters) {
    if (!inView(b.x, b.y, 40)) continue;
    const c = Math.cos(b.a);
    const s = Math.sin(b.a);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = b.flash > 0 ? '#ffffff' : '#4fe07a';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const ph = ((wd.time * 2.5 + i / 3) % 1);
      const d = -10 + ph * 20;
      const x = b.x + c * d;
      const y = b.y + s * d;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - c * 5 + -s * 7, y - s * 5 + c * 7);
      ctx.lineTo(x + c * 3, y + s * 3);
      ctx.lineTo(x - c * 5 - -s * 7, y - s * 5 - c * 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    lit(ctx, () => addGlow(ctx, b.x, b.y, 34, '#4fe07a', b.flash > 0 ? 1 : 0.25));
  }
}

/** ピラミッドへの入口：閉じているときは金色の扉、開くと渦を巻く金色の穴 */
function drawGate(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const g = wd.gate;
  if (!inView(g.x, g.y, 120)) return;
  // G-U-M のレーンがない台では、大当たりの扉もない（開いている入口は描く）
  if (!wd.toys.lanes && !g.open && g.entering < 0) return;
  if (!g.open && g.entering < 0) {
    // 閉じた扉（G・U・M の進み具合）
    ctx.fillStyle = '#2a1c05';
    ctx.beginPath();
    ctx.arc(g.x, g.y, 22, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + g.spin * 0.2;
      ctx.strokeStyle = 'rgba(255,210,63,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x + Math.cos(a) * 21, g.y + Math.sin(a) * 21);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 22, 0, TAU);
    ctx.stroke();
    const lit3 = wd.lanes.filter((l) => l.lit).length;
    label(ctx, `${wd.save.endless ? 'PYRAMID' : 'JACKPOT'} ${'●'.repeat(lit3)}${'○'.repeat(3 - lit3)}`, g.x, g.y + 36, 9, 'rgba(255,220,120,0.9)');
    return;
  }
  const R = 26 + Math.sin(wd.time * 6) * 2;
  lit(ctx, () => addGlow(ctx, g.x, g.y, GATE_PULL * 1.3, '#ffb020', 0.6));
  ctx.strokeStyle = 'rgba(255,210,63,0.35)';
  ctx.setLineDash([3, 7]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(g.x, g.y, GATE_PULL * wd.st.gatePull, -g.spin * 0.3, -g.spin * 0.3 + TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 4; i += 1) {
    ctx.strokeStyle = i % 2 ? '#fff3a6' : '#ffb020';
    ctx.lineWidth = 3 - i * 0.4;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R * (1.5 - i * 0.18), g.spin * (1 + i * 0.4), g.spin * (1 + i * 0.4) + 4.2);
    ctx.stroke();
  }
  const core = ctx.createRadialGradient(g.x, g.y, 1, g.x, g.y, R);
  core.addColorStop(0, '#fffbe0');
  core.addColorStop(0.35, '#ffcf3f');
  core.addColorStop(1, 'rgba(180,90,0,0.9)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(g.x, g.y, R, 0, TAU);
  ctx.fill();
  // ピラミッドの形
  ctx.fillStyle = '#7a4a00';
  ctx.beginPath();
  ctx.moveTo(g.x, g.y - 13);
  ctx.lineTo(g.x + 14, g.y + 9);
  ctx.lineTo(g.x - 14, g.y + 9);
  ctx.closePath();
  ctx.fill();
  if (g.open) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, g.t / wd.st.gateTime));
    ctx.stroke();
    label(ctx, 'PYRAMID GATE', g.x, g.y + R + 22, 11, '#ffe9a0');
  }
}

/** 通り道のライト：消えていても光がゆっくり流れ（いつもどこかが動く）、球が通ると灯って少しずつ消える */
function drawLightPaths(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  if (wd.rule?.id === 'dark') return;
  const t = wd.time;
  for (const lp of wd.lights) {
    if (lp.maxX < view.x0 || lp.minX > view.x1 || lp.maxY < view.y0 || lp.minY > view.y1) continue;
    const n = lp.pts.length;
    const fl = lp.flash > 0 ? lp.flash / 0.8 : 0;
    // 消えている粒は 1 回でまとめて描く
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      if (t - lp.lit[i] < 5) continue;
      const [x, y] = lp.pts[i];
      ctx.rect(x - 2, y - 2, 4, 4);
    }
    ctx.fill();
    ctx.fillStyle = fl > 0 ? '#ffffff' : lp.color;
    for (let i = 0; i < n; i += 1) {
      const [x, y] = lp.pts[i];
      const age = t - lp.lit[i];
      const on = age < 5 ? (age < 4 ? 1 : 5 - age) : 0;
      // 消えているときも、道にそって光の粒がゆっくり流れる（波の山のところだけ描く）
      const wave = Math.sin(t * 4 - (i / n) * 12);
      if (on <= 0 && fl <= 0 && wave < 0.6) continue;
      const a = Math.max(on, fl > 0 ? (Math.floor(t * 16) % 2 ? 1 : 0.4) : 0, (wave - 0.6) * 1.6);
      ctx.globalAlpha = Math.min(1, 0.3 + a);
      ctx.beginPath();
      ctx.arc(x, y, on > 0 ? 3.6 : 2.8, 0, TAU);
      ctx.fill();
      if (on > 0 && age < 0.25) {
        // 灯った瞬間は輪が広がる
        ctx.strokeStyle = lp.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 1 - age / 0.25;
        ctx.beginPath();
        ctx.arc(x, y, 4 + age * 40, 0, TAU);
        ctx.stroke();
      }
      if (on > 0.3 || fl > 0 || (!wd.lowFx && wave > 0.85)) lit(ctx, () => addGlow(ctx, x, y, on > 0 ? 11 : 7, lp.color, on > 0 ? 0.7 * on : 0.35));
    }
  }
  ctx.globalAlpha = 1;
}

/** ラメがときどききらっと光る（映っている所だけ） */
function drawTwinkles(ctx: CanvasRenderingContext2D, t: number): void {
  const w = view.x1 - view.x0;
  const h = view.y1 - view.y0;
  lit(ctx, () => {
    for (let i = 0; i < 14; i += 1) {
      const u = t * 0.8 + i * 0.37;
      const cyc = Math.floor(u);
      const h1 = Math.sin(cyc * 127.1 + i * 311.7) * 43758.5453;
      const h2 = Math.sin(cyc * 269.5 + i * 183.3) * 43758.5453;
      const x = view.x0 + (h1 - Math.floor(h1)) * w;
      const y = view.y0 + (h2 - Math.floor(h2)) * h;
      const a = Math.sin((u - cyc) * Math.PI);
      addGlow(ctx, x, y, 7, '#ffffff', a * 0.8);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 4 * a, y - 0.4, 8 * a, 0.8);
      ctx.fillRect(x - 0.4, y - 4 * a, 0.8, 8 * a);
    }
  });
}

function drawWalls(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  ctx.lineCap = 'round';
  // スリングショット：色つきのプラスチック（ねじ止め。買ったときだけ）
  for (const side of wd.toys.sling ? [1, -1] : []) {
    const seg = wd.segs.find((sg) => sg.kick && (side === 1 ? sg.ax < W / 2 : sg.ax > W / 2));
    const on = (seg?.flash ?? 0) > 0;
    const pts = T.SLING.map(([sx, sy]) => [side === 1 ? sx : W - sx, sy] as T.P);
    if (!inView(pts[0][0], pts[0][1], 80)) continue;
    const poly = (dx: number, dy: number) => {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
      ctx.closePath();
    };
    poly(3, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    const pg = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    pg.addColorStop(0, on ? 'rgba(255,255,255,0.95)' : 'rgba(109,255,176,0.55)');
    pg.addColorStop(1, on ? 'rgba(109,255,176,0.95)' : 'rgba(30,140,120,0.55)');
    poly(0, 0);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    for (const [px, py] of pts) screw(ctx, px + (cx - px) * 0.22, py + (cy - py) * 0.22);
    if (on) lit(ctx, () => addGlow(ctx, cx, cy, 40, '#6dffb0', 0.8));
  }
  for (const sg of wd.segs) {
    if (sg.outer) {
      // 外のふちはアーマーとして描く。強く当たったところだけ光る
      if (sg.flash > 0 && inView((sg.ax + sg.bx) / 2, (sg.ay + sg.by) / 2, Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / 2 + 10)) {
        ctx.globalAlpha = Math.min(1, sg.flash / 0.15);
        ctx.strokeStyle = '#fff3c4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sg.ax, sg.ay);
        ctx.lineTo(sg.bx, sg.by);
        ctx.stroke();
        ctx.globalAlpha = 1;
        lit(ctx, () => addGlow(ctx, (sg.ax + sg.bx) / 2, (sg.ay + sg.by) / 2, 34, '#ffe9a8', sg.flash / 0.15 * 0.6));
      }
      continue;
    }
    if (!inView((sg.ax + sg.bx) / 2, (sg.ay + sg.by) / 2, Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / 2 + 10)) continue;
    const line = (dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(sg.ax + dx, sg.ay + dy);
      ctx.lineTo(sg.bx + dx, sg.by + dy);
    };
    if (sg.kick) {
      line(0, 0);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = sg.flash > 0 ? '#ffd23f' : '#ff4f5e';
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    // 金属のレール：ずらした濃い影（高さ）・墨の縁・鋼の本体・上の光
    line(3, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 7;
    ctx.stroke();
    line(0, 0);
    ctx.strokeStyle = '#0b0a10';
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.strokeStyle = sg.flash > 0 ? '#fff3c4' : '#9aa0ae';
    ctx.lineWidth = 5;
    ctx.stroke();
    line(-0.8, -1);
    ctx.strokeStyle = '#f4efe4';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (sg.flash > 0) lit(ctx, () => addGlow(ctx, (sg.ax + sg.bx) / 2, (sg.ay + sg.by) / 2, 30, '#ffe9a8', 0.55));
  }
  // レールの両はしの柱（ねじ頭）
  for (const sg of wd.segs) {
    if (sg.outer || sg.kick) continue;
    for (const [x, y] of [[sg.ax, sg.ay], [sg.bx, sg.by]] as T.P[]) {
      if (!inView(x, y, 8)) continue;
      ctx.fillStyle = '#0b0a10';
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c9cdd6';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1.6, y - 1.8, 1.4, 1.2);
    }
  }
  // レーンの仕切りの頭（プラスチックの小さな帽子）
  for (const x of wd.toys.lanes ? [306, 342, 378, 414] : []) {
    ctx.fillStyle = '#ff6ad5';
    ctx.beginPath();
    ctx.arc(x, T.LANE_Y[0], 4, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#c9d2e8';
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, TAU);
  ctx.fill();
}

function drawBumpers(ctx: CanvasRenderingContext2D, wd: PinballWorld, gi: string): void {
  for (const b of wd.bumpers) {
    if (!inView(b.x, b.y, 60)) continue;
    const on = b.flash > 0;
    const kf = on ? b.flash / 0.16 : 0;
    const r = b.r * (1 + kf * 0.1);
    if (on || !wd.lowFx) lit(ctx, () => addGlow(ctx, b.x, b.y, r * 2.6, on ? '#ff6ad5' : gi, on ? 1 : 0.25 + 0.1 * Math.sin(wd.time * 4 + b.x)));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(b.x + 3, b.y + 6, r + 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1030';
    ctx.beginPath();
    ctx.arc(b.x, b.y + 2, r + 3, 0, TAU);
    ctx.fill();
    const body = ctx.createLinearGradient(b.x - r, b.y, b.x + r, b.y);
    body.addColorStop(0, '#7a1f63');
    body.addColorStop(0.45, on ? '#ffffff' : '#ff6ad5');
    body.addColorStop(1, '#5a1048');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    const cap = ctx.createRadialGradient(b.x - r * 0.25, b.y - r * 0.35, 1, b.x, b.y - 2, r * 0.72);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(1, on ? '#ffe14d' : '#ffd0f0');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(b.x, b.y - 2, r * 0.68, 0, TAU);
    ctx.fill();
    starPath(ctx, b.x, b.y - 2, r * 0.4, r * 0.17, wd.time * 0.6);
    ctx.fillStyle = on ? '#ff4f5e' : '#c0187d';
    ctx.fill();
    if (on) {
      ctx.globalAlpha = kf;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 10 * (1 - kf) + 4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawFlippers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const fx = curFx;
  // 振り抜きの弧：通ったあとに、うすいフリッパーの残像が扇に残る
  if (fx && fx.arcs.length) {
    lit(ctx, () => {
      ctx.lineCap = 'round';
      for (const arc of fx.arcs) {
        const f = wd.flippers[arc.i];
        if (!f || !inView(f.px, f.py, 100)) continue;
        const age = (fx.clock - arc.t) / 0.22;
        const N = 6;
        for (let j = 0; j < N; j += 1) {
          const u = j / (N - 1);
          const a = arc.a0 + (arc.a1 - arc.a0) * u;
          // まだそこまで振っていない角度は描かない
          if ((arc.a1 < arc.a0 ? a < f.a - 0.02 : a > f.a + 0.02)) continue;
          ctx.globalAlpha = Math.max(0, (1 - age) * (0.1 + 0.16 * u) * (arc.hit ? 1.7 : 1));
          ctx.strokeStyle = arc.hit ? '#ffd21f' : '#f4efe4';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(f.px + f.side * Math.cos(a) * f.len * 0.35, f.py + Math.sin(a) * f.len * 0.35);
          ctx.lineTo(f.px + f.side * Math.cos(a) * f.len, f.py + Math.sin(a) * f.len);
          ctx.stroke();
        }
        // 先がえがく弧
        ctx.globalAlpha = Math.max(0, 1 - age) * (arc.hit ? 0.9 : 0.5);
        ctx.strokeStyle = arc.hit ? '#fff3c4' : '#ffb347';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const s0 = f.side === 1 ? arc.a0 : Math.PI - arc.a0;
        const s1 = f.side === 1 ? Math.min(arc.a0, Math.max(arc.a1, f.a)) : Math.PI - Math.min(arc.a0, Math.max(arc.a1, f.a));
        ctx.arc(f.px, f.py, f.len + 3, s0, s1, f.side === 1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    });
  }
  for (const f of wd.flippers) {
    if (!inView(f.px, f.py, 90)) continue;
    const [tx, ty] = flipperTip(f);
    const up = f.up > 0;
    // 形：根元が太く先が細い（くさび）。ずらした濃い影・墨の縁・血の色のゴム・骨色の本体
    const body = (dx: number, dy: number, w0: number, w1: number) => {
      const l = Math.hypot(tx - f.px, ty - f.py) || 1;
      const nx = -(ty - f.py) / l;
      const ny = (tx - f.px) / l;
      ctx.beginPath();
      ctx.moveTo(f.px + dx + nx * w0, f.py + dy + ny * w0);
      ctx.lineTo(tx + dx + nx * w1, ty + dy + ny * w1);
      ctx.arc(tx + dx, ty + dy, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), f.side !== 1);
      ctx.lineTo(f.px + dx - nx * w0, f.py + dy - ny * w0);
      ctx.arc(f.px + dx, f.py + dy, w0, Math.atan2(-ny, -nx), Math.atan2(ny, nx), f.side !== 1);
      ctx.closePath();
    };
    body(4, 7, 9.5, 6.5);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    body(0, 0, 10.5, 7.5);
    ctx.fillStyle = '#0b0a10';
    ctx.fill();
    body(0, 0, 8.5, 5.5);
    ctx.fillStyle = up ? '#ffb347' : '#e5163a';
    ctx.fill();
    body(0, -0.6, 5.6, 3);
    ctx.fillStyle = '#f4efe4';
    ctx.fill();
    // 軸
    ctx.fillStyle = '#0b0a10';
    ctx.beginPath();
    ctx.arc(f.px, f.py, 5.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.arc(f.px, f.py, 3.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(f.px - 1.8, f.py - 2, 1.5, 1.3);
    if (up) lit(ctx, () => addGlow(ctx, (f.px + tx) / 2, (f.py + ty) / 2, 46, '#ffb347', 0.45));
    // 球を打ち返した瞬間：白く光る
    if (f.flash > 0) {
      const k = f.flash / 0.25;
      body(0, 0, 8.5, 5.5);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
      lit(ctx, () => addGlow(ctx, tx, ty, 70, '#ffe14d', 0.9 * k));
    }
  }
}

/** 球（本物・仲間・分身）。onRamp が true なら、ランプの上を走る球だけを浮かせて描く */
function drawBalls(ctx: CanvasRenderingContext2D, wd: PinballWorld, onRamp: boolean): void {
  const p = wd.puck;
  const fx = curFx;
  const hi = quality() === 2;
  /** つぶれ・のびを掛けて描く */
  const squashed = (b: { x: number; y: number; vx: number; vy: number }, fn: () => void) => {
    if (!fx) { fn(); return; }
    const [ang, s1, s2] = squashOf(fx, b, b.vx, b.vy);
    if (Math.abs(s1 - 1) < 0.012) { fn(); return; }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.scale(s1, s2);
    ctx.rotate(-ang);
    ctx.translate(-b.x, -b.y);
    fn();
    ctx.restore();
  };
  if (!onRamp) {
    for (const m of wd.mates) {
      if (!inView(m.x, m.y, 30)) continue;
      if (m.ghost !== undefined) {
        const left = Math.max(0, m.ghost - wd.time);
        lit(ctx, () => addGlow(ctx, m.x, m.y, m.r * 3, '#9fe8ff', 0.5));
        medallion(ctx, m.x, m.y, m.r, m.hero.img, '#9fe8ff', left < 1.5 && Math.floor(wd.time * 10) % 2 ? 0.25 : 0.55);
      } else {
        // 速い仲間の球：光の残像
        if (fx && hi && Math.hypot(m.vx, m.vy) > 900) {
          const col = RARITY_COLOR[m.hero.rarity];
          lit(ctx, () => ghostsOf(fx, m, (x, y, k) => addGlow(ctx, x, y, m.r * (0.9 + k), col, k * 0.4)));
        }
        ctx.globalAlpha = 0.4;
        ctx.drawImage(softSprite('#000000'), m.x - m.r * 2.6, m.y - m.r * 2.6, m.r * 5.2, m.r * 5.2);
        ctx.globalAlpha = 1;
        ballShadow(ctx, m.x, m.y, m.r, 1);
        // 打ち出されたばかりの控えの球：通路を駆け上がる間、緑に光って尾を引く
        if (m.shootT !== undefined) lit(ctx, () => { addGlow(ctx, m.x, m.y, m.r * 3, '#4fe07a', 0.6); addGlow(ctx, m.x, m.y + m.r * 3, m.r * 2.2, '#4fe07a', 0.35); });
        squashed(m, () => {
          medallion(ctx, m.x, m.y, m.r, m.hero.img, RARITY_COLOR[m.hero.rarity], 1);
          chrome(ctx, m.x, m.y, m.r);
        });
      }
    }
    if (wd.onRamp) return;
  }
  // 怪物の口の中・上の小さな台の中では、台の上に球を描かない
  if (wd.carry?.kind === 'dino' || wd.carry?.kind === 'mini') return;
  if (wd.hole.held >= 0 || wd.gate.entering >= 0) {
    // 吸いこまれていく
    const kf = Math.min(1, (wd.hole.held >= 0 ? wd.hole.held : wd.gate.entering) / 0.5);
    medallion(ctx, p.x, p.y, p.r * (1 - kf * 0.85), wd.ballHero.img, RARITY_COLOR[wd.ballHero.rarity], 1 - kf * 0.7);
    return;
  }
  const r = p.r * (onRamp ? 1.28 : 1);
  const sp = Math.hypot(p.vx, p.vy);
  const ac = wd.hold.active ? ELEM_COLOR.green : ELEM_COLOR[wd.attack];
  if (sp > 700 && wd.trail.length > 1) {
    // 光の尾：先が細くなる帯
    ctx.lineCap = 'round';
    lit(ctx, () => {
      for (let i = 1; i < wd.trail.length; i += 1) {
        const a = wd.trail[i - 1];
        const b = wd.trail[i];
        const kf = 1 - (wd.time - b.t) / 0.18;
        ctx.globalAlpha = Math.max(0, kf) * 0.4;
        ctx.strokeStyle = wd.zone ? hue(wd.time * 600 + i * 30) : ac;
        ctx.lineWidth = r * 2 * Math.max(0.15, kf * kf);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // 白い芯
      ctx.strokeStyle = '#ffffff';
      for (let i = 1; i < wd.trail.length; i += 1) {
        const a = wd.trail[i - 1];
        const b = wd.trail[i];
        const kf = 1 - (wd.time - b.t) / 0.18;
        ctx.globalAlpha = Math.max(0, kf * kf) * 0.5;
        ctx.lineWidth = r * 0.5 * Math.max(0.1, kf);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    ctx.lineCap = 'butt';
  }
  // とても速い球：輪かくの残像
  if (fx && sp > 1100) {
    ghostsOf(fx, p, (x, y, k) => {
      ctx.globalAlpha = k * 0.4;
      ctx.strokeStyle = ac;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * (0.8 + 0.2 * k), 0, TAU);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  // 球の下を少し暗く落とす（にぎやかな盤面の上でも、球がいちばん見やすいように）
  ctx.globalAlpha = 0.55;
  ctx.drawImage(softSprite('#000000'), p.x - r * 3.4, p.y - r * 3.4, r * 6.8, r * 6.8);
  ctx.globalAlpha = 1;
  ballShadow(ctx, p.x, p.y, r, onRamp ? 2.6 : 1);
  // 球の光：台を照らす大きなにじみ＋近くの色のにじみ
  lit(ctx, () => { addGlow(ctx, p.x, p.y, r * 4.4, '#fff3c4', 0.16); addGlow(ctx, p.x, p.y, r * 2.6, ac, 0.55); });
  squashed(p, () => {
    medallion(ctx, p.x, p.y, r, wd.ballHero.img, RARITY_COLOR[wd.ballHero.rarity], 1);
    chrome(ctx, p.x, p.y, r);
    // 墨の縁（どんな盤面の上でも球の形がはっきり見える）
    ctx.strokeStyle = '#0b0a10';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 1, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = ac;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, TAU);
    ctx.stroke();
  });
  // いまの攻撃の色を、形でも見せる（赤＝●・青＝◇・緑＝▲：src/fx/attack.ts）
  attackMark(ctx, wd.hold.active ? 'green' : wd.attack, p.x, p.y, r, p.vx, p.vy, wd.time);
  // カメラが引いているとき（マルチボールなど）：自分の球に目じるし（広がる輪と、上の三角）
  if (cam.vw > 540 && !wd.waiting) {
    const u = (wd.time * 1.4) % 1;
    const z = cam.vw / BASE_VIEW;
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = '#ffd21f';
    ctx.lineWidth = 2 * z;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + (6 + u * 16) * z, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const ty = p.y - r - (12 + Math.sin(wd.time * 8) * 2) * z;
    ctx.fillStyle = '#0b0a10';
    ctx.beginPath();
    ctx.moveTo(p.x, ty + 7 * z); ctx.lineTo(p.x - 7 * z, ty - 5 * z); ctx.lineTo(p.x + 7 * z, ty - 5 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(p.x, ty + 4.5 * z); ctx.lineTo(p.x - 4.6 * z, ty - 3.6 * z); ctx.lineTo(p.x + 4.6 * z, ty - 3.6 * z);
    ctx.closePath();
    ctx.fill();
  }
}
function ballShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, h: number): void {
  ctx.fillStyle = `rgba(0,0,0,${(0.45 / Math.sqrt(h)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x + 3 * h, y + 5 * h, r * (0.9 + 0.1 * h), r * 0.8, 0, 0, TAU);
  ctx.fill();
}
/** 金属の縁と、つやの光 */
function chrome(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#8d96ad');
  g.addColorStop(1, '#f2f5ff');
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.92, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, TAU);
  ctx.fill();
}

/** バンパー・フレンジー：同じ群れのバンパーの間に稲妻が走る */
function drawLightning(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const bs = wd.bumpers;
  ctx.lineJoin = 'round';
  lit(ctx, () => {
    for (let g = 0; g < bs.length; g += 3) {
      const grp = bs.slice(g, g + 3);
      for (let i = 0; i < grp.length; i += 1) {
        const a = grp[i];
        const b = grp[(i + 1) % grp.length];
        if (!inView((a.x + b.x) / 2, (a.y + b.y) / 2, 80)) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        for (let k = 1; k < 6; k += 1) {
          const f = k / 6;
          ctx.lineTo(a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 16, a.y + (b.y - a.y) * f + (Math.random() - 0.5) * 16);
        }
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#9fe8ff';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  });
}

/** ブラックホール：渦を巻く光の輪と、吸いこまれていく粒 */
function drawHole(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const h = wd.hole;
  if (!h.on || !inView(h.x, h.y, HOLE_PULL + 20)) return;
  const open = Math.min(1, Math.max(0.05, (7 - h.t) / 0.4));
  const R = 24 * open;
  lit(ctx, () => addGlow(ctx, h.x, h.y, HOLE_PULL * 1.2, '#7a3cff', 0.35 * open));
  ctx.strokeStyle = 'rgba(192,139,255,0.3)';
  ctx.setLineDash([3, 7]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(h.x, h.y, HOLE_PULL, h.spin * 0.2, h.spin * 0.2 + TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 5; i += 1) {
    const rr = R * (1.9 - i * 0.18);
    ctx.strokeStyle = i % 2 ? '#ff8f2e' : '#c08bff';
    ctx.globalAlpha = 0.5 + 0.1 * i;
    ctx.lineWidth = 3 - i * 0.3;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, rr, rr * 0.42, h.spin * 0.15, h.spin * (1 + i * 0.3), h.spin * (1 + i * 0.3) + 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffe1ff';
  for (let i = 0; i < 16; i += 1) {
    const ph = (wd.time * 0.7 + i / 16) % 1;
    const a = i * 2.4 + ph * 9;
    const d = (1 - ph) * HOLE_PULL;
    ctx.globalAlpha = ph;
    ctx.fillRect(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.8, 2, 2);
  }
  ctx.globalAlpha = 1;
  const core = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, R);
  core.addColorStop(0, '#000000');
  core.addColorStop(0.7, '#05000f');
  core.addColorStop(1, 'rgba(120,60,255,0.6)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(h.x, h.y, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const st = wd.star;
  if (!st.on || !inView(st.x, st.y, 40)) return;
  const y = st.y + Math.sin(wd.time * 3) * 4;
  const blink = st.t < 2 && Math.floor(wd.time * 8) % 2 === 1;
  lit(ctx, () => addGlow(ctx, st.x, y, 34, '#bfe9ff', blink ? 0.3 : 0.8));
  ctx.globalAlpha = blink ? 0.5 : 1;
  starPath(ctx, st.x, y, 12, 5, wd.time * 2);
  const sg = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(1, '#7fd6ff');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(191,233,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(st.x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, st.t / 8));
  ctx.stroke();
}

/** レーザー：マルチボール・ZONE・大きな知らせのときに、映っている範囲の上から光の線が走る */
function drawLasers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const big = wd.shows.some((x) => x.kind === 'rainbow' || x.kind === 'strobe');
  if (!(wd.zone || big || wd.multi)) return;
  const w = view.x1 - view.x0;
  ctx.lineCap = 'round';
  lit(ctx, () => {
    for (let i = 0; i < 4; i += 1) {
      const ox = view.x0 + (i < 2 ? 0.12 : 0.88) * w;
      const oy = view.y0 - 10;
      const a = Math.PI / 2 + Math.sin(wd.time * (1.3 + i * 0.4) + i) * 0.75;
      ctx.strokeStyle = wd.zone ? hue(wd.time * 200 + i * 90) : ['#ff2ea6', '#3fd0ff', '#4fe07a', '#ffd23f'][i];
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * 1400, oy + Math.sin(a) * 1400);
      if (!wd.lowFx) {
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 9;
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  });
  ctx.lineCap = 'butt';
}

/** アーマー（台のふちの赤い金属）と、そこに並ぶ LED */
/** 電球が切れているか（台の直りぐあいで決まる。場所ごとにいつも同じ） */
function bulbDead(i: number, stage: number): boolean {
  const h = Math.sin(i * 91.7 + 13.3) * 43758.5453;
  const r = h - Math.floor(h);
  return r < [0.62, 0.4, 0.2, 0.05, 0][stage];
}
/** 外のふち：真ちゅうのレール（古い台はくすむ）と、サーカスの看板の電球（切れた電球は台が直ると点く） */
function drawArmor(ctx: CanvasRenderingContext2D, wd: PinballWorld, gi: string): void {
  const stage = curStage;
  const fx = curFx;
  ctx.lineJoin = 'round';
  tablePath(ctx);
  ctx.strokeStyle = '#0b0a10';
  ctx.lineWidth = 15;
  ctx.stroke();
  // レール：くすんだ緑青 → みがいた真ちゅう
  ctx.strokeStyle = ['#4a4334', '#5e5032', '#80682c', '#a8862a', '#c9a227'][stage];
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = ['#2c281f', '#3a321f', '#4f3f18', '#6a5216', '#7d6212'][stage];
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.save();
  ctx.translate(-1.2, -1.6);
  tablePath(ctx);
  ctx.strokeStyle = `rgba(255,240,200,${0.18 + stage * 0.12})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  let flash = 0;
  for (const x of wd.shows) if (x.kind === 'strobe') flash = Math.max(flash, showValue(x, (wd.time - x.t0) / x.dur, 0, 0, wd.time));
  const beat = fx ? fx.beat : 0;
  const clock = fx ? fx.clock : wd.time;
  const idle = wd.waiting;
  // 電球：1 つおき（40 ごと）。ソケットは墨、点いていれば色ガラス＋にじみ
  for (let i = 0; i < LEDS.length; i += 2) {
    const [x, y] = LEDS[i];
    if (!inView(x, y, 14)) continue;
    const n = i / 2;
    const dead = bulbDead(n, stage);
    ctx.fillStyle = '#0b0a10';
    ctx.beginPath();
    ctx.arc(x, y, 4.6, 0, TAU);
    ctx.fill();
    // 流れる光：待っている間はゆっくり、プレイ中は速く
    let a = idle ? 0.35 + 0.65 * Math.max(0, Math.sin(clock * 2.6 - n * 0.5)) : 0.45 + 0.55 * Math.max(0, Math.sin(wd.time * 7 - n * 0.7));
    let col = wd.zone ? hue(n * 24 + wd.time * 400) : stage >= 4 ? hue(n * 30 + clock * 40) : n % 2 ? '#ffd21f' : stage >= 2 ? gi : '#ffb347';
    if (dead) {
      // 切れた電球：たまにチカッと点こうとする
      const fl = Math.sin(clock * 1.3 + n * 7.1) > 0.985 && Math.sin(clock * 50 + n) > 0;
      if (!fl && beat < 0.05 && flash < 0.5) {
        ctx.fillStyle = '#2a2622';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
        continue;
      }
      a = fl ? 0.5 : a;
    }
    if (beat > 0.05) { col = '#e5163a'; a = Math.max(0.15, beat); }
    if (flash > 0.5) { col = '#ffffff'; a = 1; }
    ctx.globalAlpha = 0.35 + 0.65 * a;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 0.8, y - 0.9, 1.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!wd.lowFx || a > 0.8) lit(ctx, () => addGlow(ctx, x, y, 13, col, a * 0.75));
  }
}

/** ワイヤーのランプ（色つきの金属の 2 本の線と、それを支える柱） */
function drawRamps(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const off = 9;
  wd.ramps.forEach((rp, ri) => {
    const path = rp.path;
    const normal = (i: number): T.P => {
      const [ax, ay] = path[Math.max(0, i - 1)];
      const [bx, by] = path[Math.min(path.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      return [-(by - ay) / l, (bx - ax) / l];
    };
    const rail = (sign: number, dx: number, dy: number) => {
      ctx.beginPath();
      path.forEach(([x, y], i) => {
        const [nx, ny] = normal(i);
        const px = x + nx * off * sign + dx;
        const py = y + ny * off * sign + dy;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const sg of [-1, 1]) {
      rail(sg, 6, 11);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    path.forEach(([x, y], i) => {
      if (!inView(x, y, 20)) return;
      const [nx, ny] = normal(i);
      if (i % 3 === 1) {
        ctx.strokeStyle = 'rgba(180,190,210,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 11);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - nx * off, y - ny * off);
      ctx.lineTo(x + nx * off, y + ny * off);
      ctx.stroke();
    });
    const on = (wd.onRamp && wd.onRamp.i === ri) || rp.flash > 0;
    for (const sg of [-1, 1]) {
      rail(sg, 0, 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = on ? '#ffffff' : rp.color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // レールの LED（球が走ると灯る。いつもは光が流れる）
    const leds = wd.rampLeds[ri];
    for (let i = 0; i < leds.length; i += 1) {
      const at = wd.rampAt(ri, i * 30);
      if (!inView(at.x, at.y, 10)) continue;
      const age = wd.time - leds[i];
      const on = age < 1.5 ? 1 - age / 1.5 : 0;
      const idle = 0.2 + 0.5 * Math.max(0, Math.sin(wd.time * 6 - i * 0.5));
      const a = Math.max(on, idle);
      const col = on > 0 ? '#ffffff' : rp.color;
      for (const sg of [-1, 1]) {
        const [nx, ny] = [-at.dy * off * sg, at.dx * off * sg];
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.fillRect(at.x + nx - 1.6, at.y + ny - 1.6, 3.2, 3.2);
        if (on > 0.2) lit(ctx, () => addGlow(ctx, at.x + nx, at.y + ny, 9, rp.color, on));
      }
    }
    ctx.globalAlpha = 1;
    // 入口のプラスチック
    const [mx, my] = path[0];
    if (inView(mx, my, 40)) {
      ctx.fillStyle = `${rp.color}66`;
      ctx.beginPath();
      ctx.moveTo(mx - 20, my + 12);
      ctx.lineTo(mx + 20, my + 12);
      ctx.lineTo(mx + 12, my - 6);
      ctx.lineTo(mx - 12, my - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      label(ctx, 'RAMP', mx, my + 3, 9, '#0a0d1c', false);
      if (on) lit(ctx, () => addGlow(ctx, mx, my, 40, rp.color, 0.6));
    }
  });
}

/** 打ち出しの道すじ（坂の重さで曲がる） */
/** 打ち出しの通路（右端）：通路の床・矢印・ふた・下のばね。通路と台の間は金属の板 */
function drawShooter(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const x0 = T.SHOOT_X0;
  const y0 = T.SHOOT_Y0;
  if (!inView(696, 1080, 260)) return;
  const t = wd.time;
  // 通路と台の間（台の外）：金属の板
  ctx.beginPath();
  ctx.moveTo(550, 1050);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0, H + 50);
  ctx.lineTo(550, H + 50);
  ctx.closePath();
  // 墨の板に、切り絵のチケット（黄の縁・ななめの縞）。打ち出し待ちの間は矢印が光る
  ctx.save();
  ctx.fillStyle = '#14101a';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(123,44,255,0.14)';
  for (let sy = 900; sy < H + 80; sy += 34) {
    ctx.beginPath();
    ctx.moveTo(540, sy); ctx.lineTo(680, sy - 60); ctx.lineTo(680, sy - 43); ctx.lineTo(540, sy + 17);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,210,31,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (const [sx, sy] of [[566, 1080], [656, 960], [566, 1250], [656, 1250]] as T.P[]) screw(ctx, sx, sy);
  {
    // チケットの札（-8° に傾いた平行四辺形）と、右を指す矢印
    const on = wd.parked === 'plunger';
    const pulse = on ? 0.6 + 0.4 * Math.sin(t * 6) : 0.3;
    ctx.save();
    ctx.translate(611, 1128);
    ctx.rotate(-0.14);
    ctx.fillStyle = '#0b0a10';
    ctx.beginPath();
    ctx.moveTo(-40 + 3, -15 + 4); ctx.lineTo(44 + 3, -15 + 4); ctx.lineTo(38 + 3, 15 + 4); ctx.lineTo(-46 + 3, 15 + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = on ? '#ffd21f' : '#6b5a1a';
    ctx.beginPath();
    ctx.moveTo(-40, -15); ctx.lineTo(44, -15); ctx.lineTo(38, 15); ctx.lineTo(-46, 15);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "19px 'Bangers', 'Dela Gothic One', sans-serif";
    ctx.fillStyle = '#0b0a10';
    ctx.fillText('SHOOT', -6, 1);
    ctx.beginPath();
    ctx.moveTo(24, -7); ctx.lineTo(34, 0); ctx.lineTo(24, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (on) lit(ctx, () => addGlow(ctx, 611, 1128, 60, '#ffd21f', 0.25 * pulse));
  }
  // 通路の床
  ctx.fillStyle = 'rgba(11,10,16,0.55)';
  ctx.fillRect(x0, y0, W - x0, T.SHOOT_FLOOR - y0);
  // 上向きの矢印（打ち出し待ちの間は下から上へ光が流れる）
  for (let i = 0; i < 6; i += 1) {
    const ay = 1150 - i * 42;
    const on = wd.parked === 'plunger' ? 0.25 + 0.75 * Math.max(0, Math.sin(t * 7 - i * 0.9)) : 0.18;
    ctx.globalAlpha = on;
    ctx.strokeStyle = '#4fe07a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(684, ay + 8);
    ctx.lineTo(696, ay - 4);
    ctx.lineTo(708, ay + 8);
    ctx.stroke();
    if (on > 0.7) lit(ctx, () => addGlow(ctx, 696, ay, 16, '#4fe07a', on * 0.5));
  }
  ctx.globalAlpha = 1;
  // 出口のふた（上から来た球だけを受け止める）：うすい金属の板
  ctx.strokeStyle = wd.inShooter ? 'rgba(125,255,176,0.35)' : 'rgba(220,230,255,0.8)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(W, 860);
  ctx.stroke();
  ctx.setLineDash([]);
  // 床の下のばね（引っぱるほど縮む）
  const pull = wd.parked === 'plunger' && wd.hold.active ? wd.pullPower : 0;
  const top = T.SHOOT_FLOOR + 2 + pull * 26;
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(x0 + 4, T.SHOOT_FLOOR, W - x0 - 8, H + 50 - T.SHOOT_FLOOR);
  ctx.strokeStyle = '#c9cdd6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i <= n; i += 1) {
    const yy = top + 4 + ((H + 30 - top - 4) * i) / n;
    const xx = i % 2 ? 708 : 684;
    if (i === 0) ctx.moveTo(696, yy); else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  const kg = ctx.createLinearGradient(0, top - 6, 0, top + 6);
  kg.addColorStop(0, '#fff3c4');
  kg.addColorStop(1, '#c9a227');
  ctx.fillStyle = kg;
  ctx.fillRect(680, top - 4, 32, 8);
}

function aimArc(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const p = wd.puck;
  if (wd.parked === 'cannon') {
    // 大砲：向きは大砲が決める。引いた強さだけ輪で見せる
    ctx.lineWidth = 3;
    ctx.strokeStyle = wd.pullPower >= 1 ? '#ffd23f' : '#ff8f2e';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * wd.pullPower);
    ctx.stroke();
    return;
  }
  if (wd.parked === 'plunger') {
    // 打ち出し：通路の左に強さのメーター（スキルショットの帯は緑）
    const gx = 652;
    const gy1 = 1236;
    const gh = 230;
    const k = wd.pullPower;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(gx - 7, gy1 - gh - 3, 14, gh + 6);
    const band = wd.shotBand;
    if (band) {
      ctx.fillStyle = 'rgba(79,224,122,0.55)';
      ctx.fillRect(gx - 7, gy1 - gh * band[1], 14, gh * (band[1] - band[0]));
    }
    const inBand = band && k >= band[0] && k <= band[1];
    const g = ctx.createLinearGradient(0, gy1, 0, gy1 - gh);
    g.addColorStop(0, '#3fd0ff');
    g.addColorStop(1, '#ffd23f');
    ctx.fillStyle = inBand ? '#7dffb0' : g;
    ctx.fillRect(gx - 4, gy1 - gh * k, 8, gh * k);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gx - 7, gy1 - gh - 3, 14, gh + 6);
    if (inBand) lit(ctx, () => addGlow(ctx, gx, gy1 - gh * k, 26, '#4fe07a', 0.9));
    return;
  }
  const { px, py } = wd.hold;
  const len = Math.hypot(px, py);
  const kk = wd.pullPower;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = kk >= 1 ? '#ffd23f' : '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * kk);
  ctx.stroke();
  if (len < MIN_PULL) return;
  const ux = -px / len;
  const uy = -py / len;
  const pl = Math.min(len, MAX_PULL) * 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - ux * (p.r + pl), p.y - uy * (p.r + pl));
  ctx.stroke();
  // 速さは PinballWorld.holdEnd と同じ計算（0.72 倍・上限あり）
  const v = Math.min(2660, wd.st.launch * (0.25 + 0.75 * kk ** 0.85) * 0.72);
  let x = p.x;
  let y = p.y;
  let vx = ux * v;
  let vy = uy * v;
  const h = 1 / 60;
  const g = 1150 * (wd.combo >= ZONE_COMBO ? 0.6 : 1);
  for (let i = 0; i < 60; i += 1) {
    vy += g * h;
    x += vx * h;
    y += vy * h;
    if (x < 4 || x > W - 4) vx = -vx;
    if (y < 4) vy = -vy;
    if (y > H) break;
    if (i % 2) continue;
    ctx.globalAlpha = 1 - i / 64;
    ctx.fillStyle = kk >= 1 ? '#ffd23f' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let miniLeft = true;
/** 下の小さな全体図：いま映している範囲・球・ボス・入口・ブラックホール */
function drawMinimap(ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink, pf: typeof field): void {
  if (!pf) return;
  const mh = Math.min(150, Math.max(80, rink.h * 0.2));
  const mw = mh * (W / H);
  // 球と反対の側の下に出す（球や打ち出しの通路を隠さないように。行ったり来たりしないよう、真ん中は余裕をもつ）
  const bx = wd.puck.x;
  if (bx > W * 0.62) miniLeft = true;
  else if (bx < W * 0.38) miniLeft = false;
  const x = miniLeft ? rink.x + 8 : rink.x + rink.w - mw - 8;
  const y = rink.y + rink.h - mh - 8;
  const s = mw / W;
  ctx.save();
  ctx.globalAlpha = 0.88;
  roundRect(ctx, x - 3, y - 3, mw + 6, mh + 6, 6);
  ctx.fillStyle = 'rgba(5,8,22,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pf.mini, x, y, mw, mh);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const dot = (px: number, py: number, r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + px * s, y + py * s, r, 0, TAU);
    ctx.fill();
  };
  if (wd.gate.open) dot(wd.gate.x, wd.gate.y, 3.5 + Math.sin(wd.time * 8), '#ffd23f');
  if (wd.hole.on) dot(wd.hole.x, wd.hole.y, 3, '#c08bff');
  for (const e of wd.enemies) dot(e.x, e.y, e.boss ? 3.5 : 1.6, e.boss ? '#ff4f5e' : '#ff9aa5');
  for (const m of wd.mates) dot(m.x, m.y, 2, m.ghost !== undefined ? '#9fe8ff' : '#ffffff');
  dot(wd.puck.x, wd.puck.y, 3, ELEM_COLOR[wd.attack]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + Math.max(0, view.x0) * s, y + Math.max(0, view.y0) * s, (Math.min(W, view.x1) - Math.max(0, view.x0)) * s, (Math.min(H, view.y1) - Math.max(0, view.y0)) * s);
  ctx.restore();
}

// ------------------------------------------------------------------ 上の液晶ディスプレイ
const stripeCache = new Map<string, HTMLCanvasElement>();
function stripes(color: string, w: number, h: number): HTMLCanvasElement {
  const key = `${color}|${Math.round(w)}|${Math.round(h)}`;
  let c = stripeCache.get(key);
  if (c) return c;
  if (stripeCache.size > 40) stripeCache.clear();
  c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.ceil((w + 44) * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    g.fillStyle = '#050816';
    g.fillRect(0, 0, w + 44, h);
    g.globalAlpha = 0.55;
    g.fillStyle = color;
    for (let x = -h; x < w + 44; x += 22) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + h, 0);
      g.lineTo(x + h + 10, 0);
      g.lineTo(x + 10, h);
      g.closePath();
      g.fill();
    }
  }
  stripeCache.set(key, c);
  return c;
}
let scanCv: HTMLCanvasElement | null = null;
function scanlines(w: number, h: number): HTMLCanvasElement {
  if (scanCv && scanCv.width === Math.round(w) && scanCv.height === Math.round(h)) return scanCv;
  scanCv = document.createElement('canvas');
  scanCv.width = Math.max(1, Math.round(w));
  scanCv.height = Math.max(1, Math.round(h));
  const g = scanCv.getContext('2d');
  if (g) { g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }
  return scanCv;
}

/** 液晶の小さな絵：のこりプレイの玉（使った玉は輪だけ） */
function dmdPips(ctx: CanvasRenderingContext2D, x: number, y: number, left: number, of: number, r: number, color: string): number {
  for (let i = 0; i < of; i += 1) {
    const on = i >= of - left;
    ctx.beginPath();
    ctx.arc(x + r + i * (r * 2 + 4), y, r, 0, TAU);
    ctx.fillStyle = on ? color : 'rgba(244,239,228,0.14)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = on ? '#0b0a10' : 'rgba(244,239,228,0.4)';
    ctx.stroke();
  }
  return of * (r * 2 + 4) - 4;
}
/** 液晶の小さな絵：ゲージ（v は 0〜1。10 枚つづりの目盛り） */
function dmdGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string, t: number): void {
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(244,239,228,0.16)';
  ctx.fillRect(x, y, w, h);
  const k = Math.max(0, Math.min(1, v));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * k, h);
  if (k >= 1) { ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t * 9)})`; ctx.fillRect(x, y, w, h); }
  else if (k > 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + w * k - 2, y, 2, h); }
  ctx.fillStyle = '#0b0a10';
  for (let i = 1; i < 10; i += 1) ctx.fillRect(x + (w * i) / 10 - 1, y, 2, h);
}
/** 液晶の小さな絵：引っぱって離す（球と、下へ流れる山形） */
function dmdPull(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  const ph = (t * 1.1) % 1;
  const pull = ph < 0.7 ? ph / 0.7 : 0;
  ctx.fillStyle = '#f4efe4';
  ctx.strokeStyle = '#0b0a10';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.3 + pull * s * 0.55 - (ph >= 0.7 ? ((ph - 0.7) / 0.3) * s * 1.2 : 0), s * 0.3, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#ffd21f';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const cx = x + s * 0.9 + i * s * 0.62;
    const a = ph < 0.7 ? 0.25 + 0.75 * Math.max(0, 1 - Math.abs(pull * 3 - i - 0.5)) : 0.25;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, y - s * 0.16);
    ctx.lineTo(cx, y + s * 0.16);
    ctx.lineTo(cx + s * 0.2, y - s * 0.16);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}
/** 液晶の太い欧文（縁どりつき）。幅に収まらなければ横に縮める。描いた幅を返す */
function dmdText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, color: string | CanvasGradient, maxW: number, align: CanvasTextAlign = 'center'): number {
  ctx.font = `${Math.round(fs)}px 'Bangers', 'Dela Gothic One', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const k = tw > maxW ? maxW / tw : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, 1);
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b0a10';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return tw * k;
}

/**
 * 台の上の液晶。文は出さない（ユーザーの指定）：
 * - 仕掛けの知らせは名前だけ（say の 2 つ目の文は描かない）
 * - 打ち出す前（wd.waiting）は、ノルマの札・のこりプレイの玉・手持ち／納品額のゲージ（src/ui/dmd.ts）と、「引っぱって離す」の小さな絵を交互に
 * - プレイ中は台の番号と、台にある部品の進み具合（G・U・M の字・LOCK の玉・RAMP の数）
 */
function drawDisplay(ctx: CanvasRenderingContext2D, wd: PinballWorld, d: DisplayRect): void {
  if (d.h < 10) return;
  const t = wd.time;
  const tier = wd.display.tier;
  const age = t - wd.display.t;
  const fresh = age < 2.6 && wd.display.t > 0;
  const info = wd.waiting ? dmd.info : null;
  ctx.save();
  // 枠：墨の板に、チケットの黄と血の 2 本の縁（角は切る）
  const cut = 7;
  const plate = (x: number, y: number, w: number, h: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut);
    ctx.closePath();
  };
  plate(d.x - 4, d.y - 4, d.w + 8, d.h + 8);
  ctx.fillStyle = '#0b0a10';
  ctx.fill();
  plate(d.x - 2, d.y - 2, d.w + 4, d.h + 4);
  ctx.fillStyle = fresh && tier >= 3 ? '#ffd21f' : info?.kind === 'deposit' ? '#ffd21f' : '#e5163a';
  ctx.fill();
  plate(d.x, d.y, d.w, d.h);
  ctx.clip();
  const cols = ['#1a1622', '#2a2436', '#3a1a6a', '#6a0d20'];
  const base = wd.zone ? hue(t * 200) : wd.gate.open ? '#5a4000' : cols[fresh ? Math.min(3, tier) : 0];
  ctx.drawImage(stripes(base, d.w, d.h), d.x - 22 + ((t * 40) % 22), d.y, d.w + 44, d.h);
  const hr = d.h * 0.4;
  medallion(ctx, d.x + hr + 8, d.y + d.h / 2, hr, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  const left = d.x + hr * 2 + 16;
  const right = d.x + d.w - 56;
  const cx = (left + right) / 2;
  const maxW = right - left;
  const y1 = d.y + d.h * 0.34;
  const y2 = d.y + d.h * 0.74;
  const fs = Math.min(d.h * 0.44, 24);
  const gh = Math.max(5, Math.min(9, d.h * 0.16));
  const bone = '#f4efe4';
  const gold = '#ffd21f';
  const page = Math.floor(t / 2.6);
  if (fresh) {
    // 知らせ：名前だけを大きく
    const pop = 1 + Math.max(0, 0.25 - age) * 1.2;
    const tg = ctx.createLinearGradient(0, d.y + d.h * 0.2, 0, d.y + d.h * 0.8);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(1, tier >= 2 || wd.gate.open ? gold : bone);
    ctx.save();
    ctx.translate(cx, d.y + d.h * 0.52);
    ctx.scale(pop, pop);
    dmdText(ctx, wd.display.text, 0, 0, Math.min(d.h * 0.62, 32), wd.zone ? hue(t * 300) : tg, maxW);
    ctx.restore();
  } else if (info && (page % 3 !== 2 || info.kind !== 'quota')) {
    if (info.kind === 'quota') {
      // QUOTA 3/10 ＋ のこりプレイの玉 ／ ゲージ ＋ 手持ち/納品額
      const pw = info.of * 14;
      const tw = dmdText(ctx, info.label, left, y1, fs, info.canPay ? gold : bone, maxW - pw - 8, 'left');
      dmdPips(ctx, Math.min(left + tw + 10, right - pw), y1, info.left, info.of, 5, info.left === 1 && !info.canPay ? '#e5163a' : gold);
      const nums = `${fmt(info.have)}/${fmt(info.need)}`;
      ctx.font = `${Math.round(Math.min(15, d.h * 0.3))}px 'Bangers', sans-serif`;
      const nw = Math.min(maxW * 0.5, ctx.measureText(nums).width);
      dmdGauge(ctx, left, y2 - gh / 2, maxW - nw - 10, gh, info.have / Math.max(1, info.need), info.canPay ? gold : info.left === 1 ? '#e5163a' : gold, t);
      dmdText(ctx, nums, right, y2, Math.min(15, d.h * 0.3), bone, maxW * 0.5, 'right');
    } else if (info.kind === 'final') {
      const tw = dmdText(ctx, 'LAST STAGE', left, y1, fs, gold, maxW - info.of * 14 - 8, 'left');
      dmdPips(ctx, Math.min(left + tw + 10, right - info.of * 14), y1, info.left, info.of, 5, '#e5163a');
      // ボスの数：ひし形
      for (let i = 0; i < info.bosses; i += 1) {
        const bx = left + 8 + i * 18;
        ctx.beginPath();
        ctx.moveTo(bx, y2 - 6); ctx.lineTo(bx + 6, y2); ctx.lineTo(bx, y2 + 6); ctx.lineTo(bx - 6, y2);
        ctx.closePath();
        ctx.fillStyle = '#e5163a';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = bone;
        ctx.stroke();
      }
      dmdPull(ctx, right - 44, y2, Math.min(12, d.h * 0.24), t);
    } else {
      // プレイを使いきった：入金口へ
      dmdText(ctx, 'DEPOSIT', cx, y1, fs, Math.sin(t * 8) > 0 ? gold : bone, maxW);
      dmdGauge(ctx, left, y2 - gh / 2, maxW, gh, info.have / Math.max(1, info.need), info.have >= info.need ? gold : '#e5163a', t);
    }
  } else if (wd.parked === 'plunger') {
    // 打ち出しの通路で待っている：台の番号（ボス台なら掟の名前）と「引っぱって離す」の絵
    dmdText(ctx, wd.rule && page % 2 === 0 ? wd.rule.name : wd.bossAlive ? 'BOSS BATTLE' : `TABLE ${wd.floor}`, cx, y1, fs, wd.rule ? gold : bone, maxW);
    dmdPull(ctx, cx - 26, y2, Math.min(12, d.h * 0.24), t);
  } else if (wd.gate.open) {
    dmdText(ctx, 'PYRAMID GATE', cx, y1, fs, gold, maxW);
    dmdGauge(ctx, left, y2 - gh / 2, maxW - 30, gh, wd.gate.t / 15, gold, t);
    dmdText(ctx, `${Math.ceil(wd.gate.t)}`, right, y2, Math.min(15, d.h * 0.3), bone, 26, 'right');
  } else {
    dmdText(ctx, wd.bossAlive ? 'BOSS BATTLE' : `TABLE ${wd.floor}`, cx, y1, fs, bone, maxW);
    // 台にある部品の進み具合だけを並べる（何もない台では打ち返した回数）
    const parts: string[] = [];
    if (wd.lanes.length) parts.push(wd.lanes.map((l, i) => (l.lit ? PinballWorld.LETTERS[i] : '・')).join(''));
    if (wd.toys.multi) parts.push(`LOCK ${'●'.repeat(wd.saucer.locks) + '○'.repeat(Math.max(0, wd.locksNeeded - wd.saucer.locks))}`);
    if (wd.ramps.length) parts.push(`RAMP ${wd.rampsDone}`);
    if (!parts.length) parts.push(`FLIP ${wd.pstat.uses.flip ?? 0}`);
    const sub = parts.join('  ');
    const ss = Math.min(12, d.h * 0.22);
    ctx.font = `${ss}px 'DotGothic16', sans-serif`;
    const sw = ctx.measureText(sub).width;
    ctx.save();
    ctx.translate(cx, y2);
    if (sw > maxW) ctx.scale(maxW / sw, 1);
    label(ctx, sub, 0, 0, ss, 'rgba(244,239,228,0.9)');
    ctx.restore();
  }
  // 右：いまの GUM の倍率
  const mx = d.x + d.w - 28;
  const mul = `×${wd.pinMul * (wd.zone ? 2 : 1)}`;
  dmdText(ctx, mul, mx, d.y + d.h * 0.42, Math.min(22, d.h * 0.42), gold, 44);
  label(ctx, 'GUM', mx, d.y + d.h * 0.8, 9, 'rgba(255,210,31,0.8)', false);
  ctx.drawImage(scanlines(d.w, d.h), d.x, d.y);
  if (fresh && age < 0.3) {
    ctx.globalAlpha = (0.3 - age) * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, outline = true): void {
  ctx.font = `${size}px 'DotGothic16', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a0d1c';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ------------------------------------------------------------------ 買った部品が台に付く瞬間
/** 付く前：その場所に、縮んでくる輪とねらいの十字 */
function drawInstallUnder(ctx: CanvasRenderingContext2D, fx: TableFx): void {
  for (const ins of fx.installs) {
    const t = fx.clock - ins.t;
    if (t < 0 || t > 0.42) continue;
    const k = t / 0.42;
    const r = ins.r * (3 - 2 * k * k);
    ctx.globalAlpha = 0.3 + 0.7 * k;
    ctx.strokeStyle = '#ffd21f';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 120;
    ctx.beginPath();
    ctx.arc(ins.x, ins.y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
/** 付いたあと：部品のまわりを星がひと回りし、後光が消えていく */
function drawInstallOver(ctx: CanvasRenderingContext2D, fx: TableFx): void {
  for (const ins of fx.installs) {
    const t = fx.clock - ins.t - 0.42;
    if (t < 0) continue;
    const k = Math.min(1, t / 1.0);
    lit(ctx, () => {
      addGlow(ctx, ins.x, ins.y, ins.r * (2.4 + k), '#ffd21f', (1 - k) * 0.8);
      for (let i = 0; i < 6; i += 1) {
        const a = k * 5 + (i / 6) * TAU;
        const rr = ins.r * (1.1 + k * 0.9);
        const x = ins.x + Math.cos(a) * rr;
        const y = ins.y + Math.sin(a) * rr;
        const l = 9 * (1 - k);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(x - l, y - 0.8, l * 2, 1.6);
        ctx.fillRect(x - 0.8, y - l, 1.6, l * 2);
      }
    });
  }
}

// ------------------------------------------------------------------ ガラスと、台全体の見せ場（画面の座標）
function drawGlass(ctx: CanvasRenderingContext2D, wd: PinballWorld, fx: TableFx, rink: Rink, stage: number): void {
  const cm = calm();
  ctx.save();
  roundRect(ctx, rink.x, rink.y, rink.w, rink.h, 14);
  ctx.clip();
  const { x, y, w, h } = rink;
  // TIME UP：幕が下りるように、台がくすむ
  if (fx.fade > 0.02) {
    ctx.fillStyle = `rgba(11,10,16,${(0.42 * fx.fade).toFixed(3)})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.globalCompositeOperation = 'lighter';
  // マルチボール：上のすみから、2 本のスポットライトが台をなめる
  if (fx.spot > 0.03 && quality() > 0) {
    for (const side of [0, 1]) {
      const ox = side ? x + w + 10 : x - 10;
      const a = (side ? Math.PI * 0.72 : Math.PI * 0.28) + Math.sin(fx.clock * (cm ? 0.5 : 1.3) + side * 2.1) * 0.3;
      const L = h * 1.3;
      const gr = ctx.createLinearGradient(ox, y, ox + Math.cos(a) * L, y + Math.sin(a) * L);
      gr.addColorStop(0, `rgba(255,${side ? 210 : 240},${side ? 120 : 200},${(0.2 * fx.spot).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(ox, y - 10);
      ctx.lineTo(ox + Math.cos(a - 0.13) * L, y + Math.sin(a - 0.13) * L);
      ctx.lineTo(ox + Math.cos(a + 0.13) * L, y + Math.sin(a + 0.13) * L);
      ctx.closePath();
      ctx.fill();
    }
  }
  // 見せ場の閃光（大当たり・マルチボール・ZONE・ボス・TIME UP）
  if (fx.flash > 0.02) {
    ctx.globalAlpha = Math.min(0.2, fx.flash * 0.22);
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
  // のこり 5 秒：1 秒ごとに、ふちが赤く脈打つ
  if (fx.beat > 0.02) {
    const a = fx.beat * (cm ? 0.25 : 0.6);
    const d = Math.min(w, h) * 0.22;
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(229,22,58,${a.toFixed(3)})`);
      gr.addColorStop(1, 'rgba(229,22,58,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(rx, ry, rw, rh);
    };
    edge(x, y, x + d, y, x, y, d, h);
    edge(x + w, y, x + w - d, y, x + w - d, y, d, h);
    edge(x, y, x, y + d, x, y, w, d);
    edge(x, y + h, x, y + h - d, x, y + h - d, w, d);
  }
  // ガラスの映りこみ：動かない細い帯と、ときどき横切る光の帯（打ち出し前はひんぱんに）
  if (quality() > 0) {
    const sh = sheenSprite();
    const period = wd.waiting ? 3.4 : 6.5;
    const u = (fx.clock % period) / period;
    ctx.save();
    ctx.transform(1, 0, -0.42, 1, 0, 0);
    const skew = 0.42 * (y + h);
    if (quality() === 2) {
      ctx.globalAlpha = 0.16 + stage * 0.03;
      ctx.drawImage(sh, x + w * 0.12 + skew * 0.5, y, w * 0.5, h);
    }
    if (!cm && u < 0.45) {
      const k = u / 0.45;
      ctx.globalAlpha = Math.sin(k * Math.PI) * (0.42 + stage * 0.07);
      ctx.drawImage(sh, x - w * 0.6 + (w * 1.9 + skew) * k, y, w * 0.55, h);
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // ガラスの上のふちの影（窓の奥行き）
  const tg = ctx.createLinearGradient(0, y, 0, y + 26);
  tg.addColorStop(0, 'rgba(0,0,0,0.5)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(x, y, w, 26);
  ctx.restore();
}

/** 後がけ（src/fx/post.ts）に渡す数字。本物の台を描くたびに書きかえる */
export const postState = {
  /** 衝撃波：画面の中の位置（0〜1。左上が 0,0）・はじまってからの秒・強さ */
  shocks: [] as { u: number; v: number; age: number; p: number }[],
  chroma: 0,
  beat: 0,
  fade: 0,
  stage: 0,
  /** 台を映す窓（0〜1） */
  rink: { x: 0, y: 0, w: 1, h: 1 },
  /** 最後に書いた時刻（古ければ、ピンボールを描いていない） */
  at: 0,
};
function notePost(fx: TableFx, rink: Rink, k: number, cw: number, ch: number, stage: number): void {
  const out = postState.shocks;
  out.length = 0;
  for (const s of fx.shocks) {
    out.push({ u: (rink.x + (s.x - view.x0) * k) / cw, v: (rink.y + (s.y - view.y0) * k) / ch, age: fx.clock - s.t, p: s.p });
  }
  postState.chroma = fx.chroma;
  postState.beat = fx.beat;
  postState.fade = fx.fade;
  postState.stage = stage;
  postState.rink.x = rink.x / cw;
  postState.rink.y = rink.y / ch;
  postState.rink.w = rink.w / cw;
  postState.rink.h = rink.h / ch;
  postState.at = performance.now();
}

// ------------------------------------------------------------------ 別の canvas に台を描く（ショップのギミックの見本）
/** 別の canvas 用のカメラ・盤面の絵の取りおき・解説の表示。drawPinballOn の間だけ、ふだんのものと入れかえる */
export interface PinView {
  cam: typeof cam;
  view: typeof view;
  field: typeof field;
  guide: { cam: typeof guideView.cam; pins: typeof guideView.pins; tags: typeof guideView.tags };
}
export function newPinView(): PinView {
  return { cam: { ...cam, runT: -1, inited: false }, view: { ...view }, field: null, guide: { cam: null, pins: null, tags: [] } };
}
/** pv のカメラで台を描く（ふだんの台の画面のカメラや盤面の絵は変えない） */
export function drawPinballOn(pv: PinView, ...args: Parameters<typeof drawPinball>): void {
  const keep = { cam: { ...cam }, view: { ...view }, field, g: { cam: guideView.cam, pins: guideView.pins, tags: guideView.tags } };
  Object.assign(cam, pv.cam);
  Object.assign(view, pv.view);
  field = pv.field;
  guideView.cam = pv.guide.cam;
  guideView.pins = pv.guide.pins;
  guideView.tags = pv.guide.tags;
  inPreview = true;
  try {
    drawPinball(...args);
  } finally {
    inPreview = false;
    Object.assign(pv.cam, cam);
    Object.assign(pv.view, view);
    pv.field = field;
    pv.guide.tags = guideView.tags;
    Object.assign(cam, keep.cam);
    Object.assign(view, keep.view);
    field = keep.field;
    guideView.cam = keep.g.cam;
    guideView.pins = keep.g.pins;
    guideView.tags = keep.g.tags;
  }
}
