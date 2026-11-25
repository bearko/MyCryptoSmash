// ピンボールの台の描画（canvas）。PinballWorld の状態を読むだけで、書きかえない（カメラの位置だけはここで持つ）。
//
// 台は画面の 4 倍の広さ（table.ts）。カメラが球を少し先回りして追い、速いときやマルチボールでは引いて広く、
// 吸いこまれるときは寄る。台を突破したときと、プレイの始まりは台全体を映す。右下に小さな全体図。
// 豪華な台の見た目：きらめく盤面の絵（一度描いて取っておく）・RGB のランプとライトショー・LED の光るアーマー・
// ワイヤーのランプ・立体的なバンパーとフリッパー・プラスチック・台の下からの光・レーザー・上の液晶ディスプレイ。
// 重くならないように、光のにじみは作っておいた丸い光の絵を「足し算」で重ねるだけにする（影ぼかしは使わない）。

import { img, ready } from '../core/util';
import { RARITY_COLOR } from '../core/catalog';
import { ELEM_COLOR } from './elements';
import { MAX_PULL, MIN_PULL } from './world';
import { GATE_PULL, HOLE_PULL, MYSTERIES, PinballWorld, ZONE_COMBO, flipperTip, type Show } from './pinball';
import * as T from './table';
import { drawEnemies, drawFx, drawOverlay, drawRingsWaves, medallion, roundRect, type Rink } from './render';

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

// ------------------------------------------------------------------ カメラ
/** いま映している範囲（台のユニット） */
const view = { x0: 0, y0: 0, x1: W, y1: H };
const inView = (x: number, y: number, r = 0): boolean => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;
const cam = { x: W / 2, y: H / 2, vw: W, last: 0, runT: -1, inited: false };
const BASE_VIEW = 420;

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
  if (wd.phase === 'zoom' || wd.phase === 'over') {
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
  vw = Math.min(full, vw);
  const kz = 1 - Math.exp(-3 * dt);
  const kp = 1 - Math.exp(-rate * dt);
  cam.vw += (vw - cam.vw) * kz;
  cam.x += (tx - cam.x) * kp;
  cam.y += (ty - cam.y) * kp;
  // 球はいつも画面の中に
  const vh = cam.vw * aspect;
  if (wd.phase === 'play' && !wd.parked) {
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
interface Lamp { x: number; y: number; shape: LampShape; size: number; color: string; angle: number; id: string }

const LAMPS: Lamp[] = (() => {
  const L: Lamp[] = [];
  const add = (id: string, [x, y]: T.P, shape: LampShape, size: number, color: string, angle = -Math.PI / 2) => L.push({ id, x, y, shape, size, color, angle });
  for (let k = 0; k < 3; k += 1) {
    add(`loopL${k}`, [32, 560 - k * 34], 'arrow', 9, '#3fd0ff');
    add(`loopR${k}`, [688, 560 - k * 34], 'arrow', 9, '#3fd0ff');
  }
  T.RAMPS.forEach((r, i) => {
    add(`ramp${i}a`, [r.path[0][0], r.path[0][1] + 60], 'arrow', 10, r.color);
    add(`ramp${i}b`, [r.path[0][0], r.path[0][1] + 34], 'arrow', 10, r.color);
  });
  add('lock', [T.LOCK[0], T.LOCK[1] + 44], 'arrow', 8, '#ff8f2e', Math.PI / 2);
  add('myst', [T.MYSTERY[0], T.MYSTERY[1] + 44], 'arrow', 8, '#ffd23f', Math.PI / 2);
  T.TARGET_SLOTS.forEach(([x, y], i) => add(`t${i}`, [x, y + 24], 'rect', 9, '#ff4f5e', 0));
  add('emblem', T.EMBLEM, 'star', 16, '#ff6ad5');
  T.INLANES.forEach((z, i) => add(`in${i}`, z.lamp, 'star', 8, '#4fe07a'));
  add('again', T.BALL_SAVE_LAMP, 'rect', 30, '#4fe07a', 0);
  T.HOLE_SPOTS.forEach((p, i) => add(`hole${i}`, p, 'circle', 22, '#c08bff'));
  for (let k = 0; k < 3; k += 1) add(`gate${k}`, [T.GATE[0], T.GATE[1] + 52 + k * 22], 'arrow', 8, '#ffd23f');
  return L;
})();

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

function playfield(bgUrl: string, cs: number, miniW: number, miniH: number): typeof field {
  const bg = img(bgUrl);
  const fontsReady = document.fonts ? document.fonts.status === 'loaded' : true;
  const key = `${bgUrl}|${cs.toFixed(3)}|${ready(bg)}|${fontsReady}|${Math.round(miniW)}`;
  if (field && field.key === key) return field;
  const cv = field?.cv ?? document.createElement('canvas');
  cv.width = Math.round(W * cs);
  cv.height = Math.round(H * cs);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.setTransform(cs, 0, 0, cs, 0, 0);
  g.clearRect(0, 0, W, H);
  g.save();
  tablePath(g);
  g.closePath();
  g.clip();
  // 下地：深い藍から紫へ
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#160a40');
  base.addColorStop(0.5, '#0a1644');
  base.addColorStop(1, '#05081c');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // ステージの絵を薄く敷く
  if (ready(bg)) {
    const k = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
    g.globalAlpha = 0.4;
    g.imageSmoothingEnabled = true;
    g.drawImage(bg, (W - bg.naturalWidth * k) / 2, (H - bg.naturalHeight * k) / 2, bg.naturalWidth * k, bg.naturalHeight * k);
    g.globalAlpha = 1;
  }
  // 入口から放射する光の筋
  g.save();
  g.translate(T.GATE[0], T.GATE[1]);
  for (let i = 0; i < 36; i += 1) {
    g.rotate(TAU / 36);
    g.fillStyle = i % 2 ? 'rgba(255,210,63,0.06)' : 'rgba(255,106,213,0.045)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-40, -1100);
    g.lineTo(40, -1100);
    g.closePath();
    g.fill();
  }
  g.restore();
  // ふちを暗く
  const vg = g.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H * 0.5, 820);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // バンパーの群れの飾りの輪
  for (const [cx, cy] of [[260, 353], [460, 353]] as T.P[]) {
    g.strokeStyle = 'rgba(255,210,63,0.35)';
    g.lineWidth = 2;
    g.setLineDash([2, 6]);
    g.beginPath();
    g.arc(cx, cy, 80, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,106,213,0.22)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 88, 0, TAU);
    g.stroke();
  }
  // ピラミッドへの入口のまわりの絵（金色の段々のピラミッド）
  g.save();
  g.translate(T.GATE[0], T.GATE[1]);
  for (let i = 5; i >= 1; i -= 1) {
    const s = 22 + i * 14;
    g.fillStyle = i % 2 ? 'rgba(255,190,60,0.10)' : 'rgba(255,230,140,0.07)';
    g.strokeStyle = 'rgba(255,210,63,0.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -s * 1.1);
    g.lineTo(s, s * 0.6);
    g.lineTo(-s, s * 0.6);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
  // フリッパーの下の塗り（扇形）
  for (const f of T.FLIPPERS) {
    const fan = g.createRadialGradient(f.px, f.py, 10, f.px, f.py, 90);
    fan.addColorStop(0, 'rgba(255,79,94,0.25)');
    fan.addColorStop(1, 'rgba(255,79,94,0)');
    g.fillStyle = fan;
    g.beginPath();
    g.arc(f.px, f.py, 90, 0, TAU);
    g.fill();
  }
  // ループの道（左右の通路）
  for (const x of [0, T.LOOP_X[1]]) {
    const lane = g.createLinearGradient(x, 0, x + 64, 0);
    lane.addColorStop(0, 'rgba(63,208,255,0.02)');
    lane.addColorStop(0.5, 'rgba(63,208,255,0.12)');
    lane.addColorStop(1, 'rgba(63,208,255,0.02)');
    g.fillStyle = lane;
    g.fillRect(x, 260, 64, 520);
  }
  // 台のロゴ
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.font = "16px 'Bangers', 'Dela Gothic One', sans-serif";
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.strokeText('MY CRYPTO', T.LOGO[0], T.LOGO[1] - 14);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('MY CRYPTO', T.LOGO[0], T.LOGO[1] - 14);
  g.font = "30px 'Bangers', 'Dela Gothic One', sans-serif";
  g.lineWidth = 5;
  g.strokeText('SMASH', T.LOGO[0], T.LOGO[1] + 10);
  const lg = g.createLinearGradient(0, T.LOGO[1] - 4, 0, T.LOGO[1] + 24);
  lg.addColorStop(0, '#fff3a6');
  lg.addColorStop(1, '#ff9e1f');
  g.fillStyle = lg;
  g.globalAlpha = 0.8;
  g.fillText('SMASH', T.LOGO[0], T.LOGO[1] + 10);
  g.globalAlpha = 1;
  // きらめき（ラメ）
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2400; i += 1) {
    g.globalAlpha = 0.08 + rnd() * 0.35;
    g.fillStyle = rnd() < 0.7 ? '#ffffff' : rnd() < 0.5 ? '#ffd23f' : '#9fe8ff';
    const sz = rnd() < 0.9 ? 0.8 : 1.6;
    g.fillRect(rnd() * W, rnd() * H, sz, sz);
  }
  g.globalAlpha = 1;
  // ランプのくぼみ（消えているときの色ガラス）
  for (const l of LAMPS) {
    drawLampShape(g, l);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill();
    g.globalAlpha = 0.22;
    g.fillStyle = l.color;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.restore();
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
    for (const r of T.RAMPS) {
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

  // 外の暗がり（キャビネットの中）
  const bgk = ctx.createLinearGradient(0, 0, 0, ch);
  bgk.addColorStop(0, '#060814');
  bgk.addColorStop(1, '#0b0f24');
  ctx.fillStyle = bgk;
  ctx.fillRect(0, 0, cw, ch);

  drawDisplay(ctx, wd, disp);

  // 台を映す窓
  ctx.save();
  roundRect(ctx, rink.x, rink.y, rink.w, rink.h, 14);
  ctx.clip();
  ctx.fillStyle = '#04060f';
  ctx.fillRect(rink.x, rink.y, rink.w, rink.h);
  const q = wd.quake;
  ctx.translate(rink.x + (q ? (Math.random() - 0.5) * q : 0), rink.y + (q ? (Math.random() - 0.5) * q : 0));
  ctx.scale(k, k);
  ctx.translate(-view.x0, -view.y0);

  // 台の下からの光
  if (!wd.lowFx) {
    lit(ctx, () => {
      tablePath(ctx);
      ctx.strokeStyle = gi;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 34;
      ctx.stroke();
    });
  }
  // 盤面の絵（映っている所だけを貼る）
  const miniH = Math.min(150, Math.max(80, rink.h * 0.2));
  const pf = playfield(bgUrl, (rink.w / BASE_VIEW) * dpr, miniH * (W / H) * dpr, miniH * dpr);
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
    ctx.globalAlpha = wd.zone ? 0.1 : 0.05;
    ctx.fillStyle = gi;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  });
  drawLamps(ctx, wd);
  drawLightPaths(ctx, wd);
  if (!wd.lowFx) drawTwinkles(ctx, t);
  drawBoosters(ctx, wd);
  drawWalls(ctx, wd);
  drawGate(ctx, wd);
  drawHole(ctx, wd);
  drawStar(ctx, wd);
  drawBumpers(ctx, wd, gi);
  if (wd.frenzy) drawLightning(ctx, wd);
  drawRingsWaves(ctx, wd, k);
  drawEnemies(ctx, wd);
  drawFlippers(ctx, wd);
  drawBalls(ctx, wd, false);
  drawLasers(ctx, wd);
  ctx.restore();

  drawArmor(ctx, wd, gi);
  drawRamps(ctx, wd);
  if (wd.onRamp) drawBalls(ctx, wd, true);
  if (wd.hold.active) aimArc(ctx, wd);
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
    label(ctx, wd.parked === 'plunger' ? '引っぱって打ち出す' : 'ねらって撃てる', p.x, p.y + p.r + 22, 12, '#ffffff');
  }
  drawFx(ctx, wd);
  ctx.restore();

  drawMinimap(ctx, wd, rink, pf);
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
    if (!inView(l.x, l.y, 40)) continue;
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
    ctx.globalAlpha = 0.25 + 0.75 * a;
    ctx.fillStyle = color;
    ctx.fill();
    if (a > 0.6) {
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
  // GUM の倍率
  T.MUL_LAMPS.forEach(([x, y], i) => {
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
  // ロックのホール
  const sc = wd.saucer;
  holeCup(ctx, sc.x, sc.y, sc.r, sc.flash > 0 ? '#ffffff' : '#ff8f2e');
  const need = wd.locksNeeded;
  for (let i = 0; i < need; i += 1) {
    ctx.fillStyle = sc.locks > i ? '#ff8f2e' : 'rgba(255,143,46,0.18)';
    ctx.beginPath();
    ctx.arc(sc.x - (need - 1) * 8 + i * 16, sc.y + 22, 4.5, 0, TAU);
    ctx.fill();
  }
  label(ctx, 'LOCK', sc.x, sc.y - 22, 9, 'rgba(255,190,120,0.9)', false);
  // ミステリーのホール（止まっている間はルーレット）
  const my = wd.mystery;
  const spinning = wd.parked === 'mystery';
  holeCup(ctx, my.x, my.y, my.r, spinning ? hue(wd.time * 900) : '#ffd23f');
  label(ctx, '?', my.x, my.y + 1, 14, spinning ? '#ffffff' : '#ffd23f', false);
  label(ctx, spinning ? MYSTERIES[Math.floor(wd.time * 14) % MYSTERIES.length].text : 'MYSTERY', my.x, my.y - 22, 9, 'rgba(255,230,150,0.95)', spinning);
  if (spinning) lit(ctx, () => addGlow(ctx, my.x, my.y, 50, hue(wd.time * 900), 0.8));
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
    label(ctx, `PYRAMID ${'●'.repeat(lit3)}${'○'.repeat(3 - lit3)}`, g.x, g.y + 36, 9, 'rgba(255,220,120,0.9)');
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
  // スリングショット：色つきのプラスチック（ねじ止め）
  for (const side of [1, -1]) {
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
    if (sg.outer) continue; // 外のふちはアーマーとして描く
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
    // 金属のガイド（影・本体・光）
    line(2, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 5;
    ctx.stroke();
    line(0, 0);
    ctx.strokeStyle = '#8a97b8';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#eef3ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // レーンの仕切りの頭（プラスチックの小さな帽子）
  for (const x of [306, 342, 378, 414]) {
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
  for (const f of wd.flippers) {
    if (!inView(f.px, f.py, 90)) continue;
    const [tx, ty] = flipperTip(f);
    const up = f.up > 0;
    const line = (dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(f.px + dx, f.py + dy);
      ctx.lineTo(tx + dx, ty + dy);
    };
    ctx.lineCap = 'round';
    line(3, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 15;
    ctx.stroke();
    line(0, 0);
    ctx.strokeStyle = up ? '#ffb347' : '#e8203a';
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = '#f4f6ff';
    ctx.lineWidth = 10;
    ctx.stroke();
    line(0, 2);
    ctx.strokeStyle = 'rgba(160,170,200,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const pv = ctx.createRadialGradient(f.px - 1.5, f.py - 1.5, 0.5, f.px, f.py, 5);
    pv.addColorStop(0, '#ffffff');
    pv.addColorStop(1, '#6b7590');
    ctx.fillStyle = pv;
    ctx.beginPath();
    ctx.arc(f.px, f.py, 4.5, 0, TAU);
    ctx.fill();
    ctx.lineCap = 'butt';
    if (up) lit(ctx, () => addGlow(ctx, (f.px + tx) / 2, (f.py + ty) / 2, 46, '#ffb347', 0.45));
  }
}

/** 球（本物・仲間・分身）。onRamp が true なら、ランプの上を走る球だけを浮かせて描く */
function drawBalls(ctx: CanvasRenderingContext2D, wd: PinballWorld, onRamp: boolean): void {
  const p = wd.puck;
  if (!onRamp) {
    for (const m of wd.mates) {
      if (!inView(m.x, m.y, 30)) continue;
      if (m.ghost !== undefined) {
        const left = Math.max(0, m.ghost - wd.time);
        lit(ctx, () => addGlow(ctx, m.x, m.y, m.r * 3, '#9fe8ff', 0.5));
        medallion(ctx, m.x, m.y, m.r, m.hero.img, '#9fe8ff', left < 1.5 && Math.floor(wd.time * 10) % 2 ? 0.25 : 0.55);
      } else {
        ballShadow(ctx, m.x, m.y, m.r, 1);
        medallion(ctx, m.x, m.y, m.r, m.hero.img, RARITY_COLOR[m.hero.rarity], 1);
        chrome(ctx, m.x, m.y, m.r);
      }
    }
    if (wd.onRamp) return;
  }
  if (wd.hole.held >= 0 || wd.gate.entering >= 0) {
    // 吸いこまれていく
    const kf = Math.min(1, (wd.hole.held >= 0 ? wd.hole.held : wd.gate.entering) / 0.5);
    medallion(ctx, p.x, p.y, p.r * (1 - kf * 0.85), wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1 - kf * 0.7);
    return;
  }
  const r = p.r * (onRamp ? 1.28 : 1);
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 700 && wd.trail.length > 1) {
    ctx.lineCap = 'round';
    lit(ctx, () => {
      for (let i = 1; i < wd.trail.length; i += 1) {
        const a = wd.trail[i - 1];
        const b = wd.trail[i];
        const kf = 1 - (wd.time - b.t) / 0.18;
        ctx.globalAlpha = Math.max(0, kf) * 0.35;
        ctx.strokeStyle = wd.zone ? hue(wd.time * 600 + i * 30) : ELEM_COLOR[wd.attack];
        ctx.lineWidth = r * 2 * Math.max(0.2, kf);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    ctx.lineCap = 'butt';
  }
  ballShadow(ctx, p.x, p.y, r, onRamp ? 2.6 : 1);
  const ac = wd.hold.active ? ELEM_COLOR.green : ELEM_COLOR[wd.attack];
  lit(ctx, () => addGlow(ctx, p.x, p.y, r * 2.6, ac, 0.5));
  medallion(ctx, p.x, p.y, r, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  chrome(ctx, p.x, p.y, r);
  ctx.strokeStyle = ac;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r + 2.5, 0, TAU);
  ctx.stroke();
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
function drawArmor(ctx: CanvasRenderingContext2D, wd: PinballWorld, gi: string): void {
  ctx.lineJoin = 'round';
  tablePath(ctx);
  ctx.strokeStyle = '#6b0d1d';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = '#b8162e';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,140,150,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  let flash = 0;
  for (const x of wd.shows) if (x.kind === 'strobe') flash = Math.max(flash, showValue(x, (wd.time - x.t0) / x.dur, 0, 0, wd.time));
  lit(ctx, () => {
    LEDS.forEach(([x, y], i) => {
      if (!inView(x, y, 8)) return;
      const wave = 0.35 + 0.65 * Math.max(0, Math.sin(wd.time * 6 - i * 0.45));
      const col = flash > 0.5 ? '#ffffff' : wd.zone ? hue(i * 18 + wd.time * 400) : gi;
      if (!wd.lowFx) addGlow(ctx, x, y, 8, col, wave);
      ctx.globalAlpha = 0.6 + 0.4 * wave;
      ctx.fillStyle = col;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
  });
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
function aimArc(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const p = wd.puck;
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

/** 右下の小さな全体図：いま映している範囲・球・ボス・入口・ブラックホール */
function drawMinimap(ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink, pf: typeof field): void {
  if (!pf) return;
  const mh = Math.min(150, Math.max(80, rink.h * 0.2));
  const mw = mh * (W / H);
  const x = rink.x + rink.w - mw - 8;
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
const HINTS: [string, string][] = [
  ['LIGHT G-U-M', '上の 3 つのレーンを点けるとピラミッドの入口が開く'],
  ['PYRAMID GATE', 'まん中の入口に入ると 15 秒のピラミッドへ'],
  ['SHOOT THE RAMPS', '左右の入口へ勢いよく。続けて通すほど GUM'],
  ['LOCK 3 = MULTIBALL', 'ロックのホールに 3 回で仲間のヒーローが球に'],
  ['MYSTERY', '「?」のホールに入ると何かが起きる'],
  ['BOOSTERS', '緑の矢印を通ると一気に加速'],
  ['BLACK HOLE', '開いたら吸いこまれて超高速で撃ち出す'],
  [`${ZONE_COMBO} COMBO = ZONE`, '坂が軽くなり GUM ×2'],
];
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

function drawDisplay(ctx: CanvasRenderingContext2D, wd: PinballWorld, d: DisplayRect): void {
  if (d.h < 10) return;
  const t = wd.time;
  const tier = wd.display.tier;
  const age = t - wd.display.t;
  const fresh = age < 2.6 && wd.display.t > 0;
  ctx.save();
  roundRect(ctx, d.x - 3, d.y - 3, d.w + 6, d.h + 6, 10);
  const fr = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
  fr.addColorStop(0, '#ff5a6e');
  fr.addColorStop(0.5, '#8a1024');
  fr.addColorStop(1, '#ff5a6e');
  ctx.fillStyle = fr;
  ctx.fill();
  roundRect(ctx, d.x, d.y, d.w, d.h, 8);
  ctx.clip();
  const cols = ['#10204a', '#103a5a', '#3a1060', '#5a0a2a'];
  const base = wd.zone ? hue(t * 200) : wd.gate.open ? '#5a4000' : cols[fresh ? Math.min(3, tier) : 0];
  ctx.drawImage(stripes(base, d.w, d.h), d.x - 22 + ((t * 40) % 22), d.y, d.w + 44, d.h);
  const hr = d.h * 0.4;
  medallion(ctx, d.x + hr + 8, d.y + d.h / 2, hr, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  let title: string;
  let sub: string;
  if (fresh) {
    title = wd.display.text;
    sub = wd.display.sub;
  } else if (wd.parked === 'plunger') {
    [title, sub] = HINTS[Math.floor(t / 2.6) % HINTS.length];
  } else if (wd.gate.open) {
    title = 'PYRAMID GATE OPEN';
    sub = `まん中の入口へ！ のこり ${Math.ceil(wd.gate.t)} 秒`;
  } else {
    title = wd.bossAlive ? 'BOSS BATTLE' : `TABLE ${wd.floor}`;
    const locks = '●'.repeat(wd.saucer.locks) + '○'.repeat(Math.max(0, wd.locksNeeded - wd.saucer.locks));
    const gum = wd.lanes.map((l, i) => (l.lit ? PinballWorld.LETTERS[i] : '・')).join('');
    sub = `${gum}  LOCK ${locks}  RAMP ${wd.rampsDone}  的 ${wd.enemies.filter((e) => !e.boss).length}`;
  }
  const left = d.x + hr * 2 + 16;
  const right = d.x + d.w - 56;
  const cx = (left + right) / 2;
  const maxW = right - left;
  const pop = fresh ? 1 + Math.max(0, 0.25 - age) * 1.2 : 1;
  ctx.save();
  ctx.translate(cx, d.y + d.h * 0.42);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.min(d.h * 0.48, 26);
  ctx.font = `${Math.round(fs)}px 'Bangers', 'Dela Gothic One', sans-serif`;
  const tw = ctx.measureText(title).width;
  if (tw > maxW) ctx.scale(maxW / tw, 1);
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.strokeText(title, 0, 0);
  const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, (fresh && tier >= 2) || wd.gate.open ? '#ffd23f' : '#9fe8ff');
  ctx.fillStyle = wd.zone ? hue(t * 300) : tg;
  ctx.fillText(title, 0, 0);
  ctx.restore();
  const ss = Math.min(11, d.h * 0.2);
  ctx.font = `${ss}px 'DotGothic16', sans-serif`;
  const sw = ctx.measureText(sub).width;
  ctx.save();
  ctx.translate(cx, d.y + d.h * 0.8);
  if (sw > maxW) ctx.scale(maxW / sw, 1);
  label(ctx, sub, 0, 0, ss, 'rgba(255,255,255,0.85)');
  ctx.restore();
  const mx = d.x + d.w - 28;
  ctx.font = `${Math.round(Math.min(22, d.h * 0.42))}px 'Bangers', 'Dela Gothic One', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  const mul = `×${wd.pinMul * (wd.zone ? 2 : 1)}`;
  ctx.strokeText(mul, mx, d.y + d.h * 0.42);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(mul, mx, d.y + d.h * 0.42);
  label(ctx, 'GUM', mx, d.y + d.h * 0.8, 9, 'rgba(255,210,63,0.8)', false);
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
