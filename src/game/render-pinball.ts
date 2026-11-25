// ピンボールの台の描画（canvas）。PinballWorld の状態を読むだけで、書きかえない。
//
// 豪華な台の見た目：きらめく盤面の絵（一度描いて取っておく）・RGB のランプとライトショー・
// LED の光るサイドレール・金属のアーマー・ワイヤーのランプ・立体的なバンパーとフリッパー・
// 色つきのプラスチック・台の下からの光・レーザー・上の液晶ディスプレイ。
// 重くならないように、光のにじみは作っておいた丸い光の絵を「足し算」で重ねるだけにする（影ぼかしは使わない）。

import { img, ready } from '../core/util';
import { RARITY_COLOR } from '../core/catalog';
import { ELEM_COLOR } from './elements';
import { MAX_PULL, MIN_PULL } from './world';
import { HOLE_PULL, PinballWorld, RAMP_PATH, SLING, TABLE_H, TARGET_SLOTS, ZONE_COMBO, flipperTip, type Show } from './pinball';
import { drawEnemies, drawFx, drawOverlay, drawRingsWaves, medallion, roundRect, type Rink } from './render';

const TAU = Math.PI * 2;
const W = 360;

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
/** 足し算で光を置く（呼ぶ側で globalCompositeOperation = 'lighter' にしておく） */
function addGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  if (a <= 0.02) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
}
/** 虹の色（光の絵が増えすぎないように 24 段に丸める） */
const hue = (h: number): string => `hsl(${Math.round((((h % 360) + 360) % 360) / 15) * 15} 100% 60%)`;

/** 台の下からの光（半分の細かさで描いて取っておく） */
const underCache = new Map<string, HTMLCanvasElement>();
function underGlow(color: string): HTMLCanvasElement {
  let c = underCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = (W + 80) / 2;
  c.height = (TABLE_H + 80) / 2;
  const g = c.getContext('2d');
  if (g) {
    g.scale(0.5, 0.5);
    g.translate(40, 40);
    tablePath(g, -4);
    g.strokeStyle = color;
    g.globalAlpha = 0.08;
    g.lineWidth = 40;
    g.stroke();
    g.globalAlpha = 0.16;
    g.lineWidth = 18;
    g.stroke();
  }
  underCache.set(color, c);
  return c;
}

// ------------------------------------------------------------------ 台の形
function tablePath(ctx: CanvasRenderingContext2D, inset = 0): void {
  const i = inset;
  ctx.beginPath();
  ctx.moveTo(i, TABLE_H + 40);
  ctx.lineTo(i, 90);
  ctx.arc(90, 90, 90 - i, Math.PI, Math.PI * 1.5);
  ctx.lineTo(270, i);
  ctx.arc(270, 90, 90 - i, Math.PI * 1.5, TAU);
  ctx.lineTo(W - i, TABLE_H + 40);
}

// ------------------------------------------------------------------ ランプ（盤面に埋めこんだ色つきのガラス）
type LampShape = 'arrow' | 'circle' | 'rect' | 'star';
interface Lamp { x: number; y: number; shape: LampShape; size: number; color: string; angle: number; id: string }
const HOLE_LAMPS: [number, number][] = [[180, 318], [180, 128]];

function buildLamps(wd: PinballWorld): Lamp[] {
  const L: Lamp[] = [];
  const add = (id: string, x: number, y: number, shape: LampShape, size: number, color: string, angle = -Math.PI / 2) => L.push({ id, x, y, shape, size, color, angle });
  for (let k = 0; k < 3; k += 1) {
    add(`loopL${k}`, 22, 262 - k * 30, 'arrow', 8, '#3fd0ff');
    add(`loopR${k}`, 338, 262 - k * 30, 'arrow', 8, '#3fd0ff');
  }
  add('ramp0', 282, 312, 'arrow', 9, '#ffd23f');
  add('ramp1', 282, 286, 'arrow', 9, '#ffd23f');
  add('sauc', wd.saucer.x, wd.saucer.y + 40, 'arrow', 7, '#ff8f2e', Math.PI / 2);
  TARGET_SLOTS.forEach(([x, y], i) => add(`t${i}`, x, y + 24, 'rect', 9, '#ff4f5e', 0));
  add('emblem', 180, 228, 'star', 15, '#ff6ad5');
  add('inL', 68, 532, 'star', 7, '#4fe07a');
  add('inR', 292, 532, 'star', 7, '#4fe07a');
  add('again', 180, 624, 'rect', 26, '#4fe07a', 0);
  HOLE_LAMPS.forEach(([x, y], i) => add(`hole${i}`, x, y, 'circle', 22, '#c08bff'));
  return L;
}

/** そのランプのいまの明るさ（0〜1）。ゲームの状態で決まる明るさ */
function lampBase(wd: PinballWorld, l: Lamp): number {
  const t = wd.time;
  const blink = (hz: number) => (Math.floor(t * hz * 2) % 2 ? 1 : 0.15);
  const jackpot = wd.mates.some((b) => b.ghost === undefined);
  if (l.id.startsWith('loop')) {
    const k = Number(l.id.slice(-1));
    if (jackpot) return blink(5);
    return 0.15 + 0.6 * Math.max(0, Math.sin(t * 5 - k * 1.3)); // ゆっくり上へ流れる
  }
  if (l.id.startsWith('ramp')) {
    if (jackpot || t - wd.rampLastT < 5) return blink(4);
    return 0.2 + 0.55 * Math.max(0, Math.sin(t * 4 - Number(l.id.slice(-1)) * 1.5));
  }
  if (l.id === 'sauc') return wd.saucer.locks === 2 ? blink(4) : 0.3 + 0.3 * Math.sin(t * 3);
  if (/^t\d+$/.test(l.id)) {
    const [x, y] = TARGET_SLOTS[Number(l.id.slice(1))];
    const alive = wd.enemies.some((e) => !e.boss && e.hp > 0 && e.tx === x && e.ty === y);
    const left = wd.enemies.filter((e) => !e.boss).length;
    return alive ? (left <= 1 ? blink(4) : 1) : 0;
  }
  if (l.id === 'emblem') return wd.zone ? 1 : jackpot ? blink(3) : 0.35 + 0.35 * Math.sin(t * 2);
  if (l.id === 'inL') return wd.inlane[0] > 0 ? 1 : 0.1;
  if (l.id === 'inR') return wd.inlane[1] > 0 ? 1 : 0.1;
  if (l.id === 'again') return wd.ballSaveUntil > t ? blink(3) : 0;
  if (l.id.startsWith('hole')) {
    const [x, y] = HOLE_LAMPS[Number(l.id.slice(-1))];
    if (wd.hole.on && wd.hole.x === x && wd.hole.y === y) return 1;
    return !wd.hole.on && wd.hole.next < 2 ? blink(6) * 0.6 : 0.08;
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
      color = s.kind === 'rainbow' ? hue(x * 1.2 + y * 0.6 + wd.time * 400) : s.color;
    }
  }
  return { a, color };
}
function showValue(s: Show, k: number, x: number, y: number, time: number): number {
  const fade = 1 - k;
  switch (s.kind) {
    case 'radial': {
      const d = Math.hypot(x - s.x, y - s.y);
      return Math.exp(-((d - k * 360) ** 2) / 1800) * fade;
    }
    case 'chase': {
      const band = TABLE_H + 40 - k * (TABLE_H + 120);
      return Math.exp(-((y - band) ** 2) / 2400) * (0.6 + 0.4 * fade);
    }
    case 'strobe': return (Math.floor(time * 24) % 2 ? 1 : 0.1) * fade;
    case 'rainbow': return 0.75 + 0.25 * Math.sin(time * 10 + x * 0.05);
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
    const pts: [number, number][] = [[z, 0], [-z * 0.5, z * 0.9], [-z * 0.15, 0], [-z * 0.5, -z * 0.9]];
    pts.forEach(([u, v], i) => {
      const px = l.x + u * c - v * s;
      const py = l.y + u * s + v * c;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
  } else {
    starPath(ctx, l.x, l.y, l.size, l.size * 0.45, 0);
  }
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
let field: { key: string; cv: HTMLCanvasElement } | null = null;
let lamps: Lamp[] | null = null;
let lampKey = '';

function playfield(wd: PinballWorld, bgUrl: string, pxW: number, pxH: number): HTMLCanvasElement | null {
  const bg = img(bgUrl);
  const fontsReady = document.fonts ? document.fonts.status === 'loaded' : true;
  const key = `${bgUrl}|${pxW}|${pxH}|${ready(bg)}|${fontsReady}|${wd.saucer.x}`;
  if (field && field.key === key) return field.cv;
  const cv = field?.cv ?? document.createElement('canvas');
  cv.width = pxW;
  cv.height = pxH;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.setTransform(pxW / W, 0, 0, pxH / TABLE_H, 0, 0);
  g.clearRect(0, 0, W, TABLE_H);
  g.save();
  tablePath(g);
  g.closePath();
  g.clip();
  // 下地：深い藍から紫へ
  const base = g.createLinearGradient(0, 0, 0, TABLE_H);
  base.addColorStop(0, '#160a40');
  base.addColorStop(0.55, '#0a1644');
  base.addColorStop(1, '#05081c');
  g.fillStyle = base;
  g.fillRect(0, 0, W, TABLE_H);
  // ステージの絵を薄く敷く
  if (ready(bg)) {
    const k = Math.max(W / bg.naturalWidth, TABLE_H / bg.naturalHeight);
    g.globalAlpha = 0.42;
    g.imageSmoothingEnabled = true;
    g.drawImage(bg, (W - bg.naturalWidth * k) / 2, (TABLE_H - bg.naturalHeight * k) / 2, bg.naturalWidth * k, bg.naturalHeight * k);
    g.globalAlpha = 1;
  }
  // 中央から放射する光の筋
  g.save();
  g.translate(180, 228);
  for (let i = 0; i < 28; i += 1) {
    g.rotate(TAU / 28);
    g.fillStyle = i % 2 ? 'rgba(255,210,63,0.06)' : 'rgba(255,106,213,0.045)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-30, -520);
    g.lineTo(30, -520);
    g.closePath();
    g.fill();
  }
  g.restore();
  // ふちを暗く
  const vg = g.createRadialGradient(180, 300, 120, 180, 320, 420);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, TABLE_H);
  // バンパーのまわりの飾りの輪
  g.strokeStyle = 'rgba(255,210,63,0.35)';
  g.lineWidth = 2;
  g.setLineDash([2, 6]);
  g.beginPath();
  g.arc(180, 228, 92, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,106,213,0.22)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(180, 228, 100, 0, TAU);
  g.stroke();
  // フリッパーの下の塗り（扇形）
  for (const side of [1, -1]) {
    const px = side === 1 ? 98 : 262;
    const fan = g.createRadialGradient(px, 572, 10, px, 572, 90);
    fan.addColorStop(0, 'rgba(255,79,94,0.25)');
    fan.addColorStop(1, 'rgba(255,79,94,0)');
    g.fillStyle = fan;
    g.beginPath();
    g.moveTo(px, 572);
    g.arc(px, 572, 90, side === 1 ? -0.6 : Math.PI - 0.9, side === 1 ? 0.9 : Math.PI + 0.6);
    g.closePath();
    g.fill();
  }
  // ループの道（左右の通路）
  for (const x of [0, 316]) {
    const lane = g.createLinearGradient(x, 0, x + 44, 0);
    lane.addColorStop(0, 'rgba(63,208,255,0.02)');
    lane.addColorStop(0.5, 'rgba(63,208,255,0.12)');
    lane.addColorStop(1, 'rgba(63,208,255,0.02)');
    g.fillStyle = lane;
    g.fillRect(x, 150, 44, 230);
  }
  // 台のロゴ
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.font = "16px 'Bangers', 'Dela Gothic One', sans-serif";
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.strokeText('MY CRYPTO', 180, 520);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('MY CRYPTO', 180, 520);
  g.font = "30px 'Bangers', 'Dela Gothic One', sans-serif";
  g.lineWidth = 5;
  g.strokeText('SMASH', 180, 544);
  const lg = g.createLinearGradient(0, 530, 0, 558);
  lg.addColorStop(0, '#fff3a6');
  lg.addColorStop(1, '#ff9e1f');
  g.fillStyle = lg;
  g.globalAlpha = 0.8;
  g.fillText('SMASH', 180, 544);
  g.globalAlpha = 1;
  // きらめき（ラメ）
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 700; i += 1) {
    g.globalAlpha = 0.08 + rnd() * 0.35;
    g.fillStyle = rnd() < 0.7 ? '#ffffff' : rnd() < 0.5 ? '#ffd23f' : '#9fe8ff';
    const sz = rnd() < 0.9 ? 0.8 : 1.6;
    g.fillRect(rnd() * W, rnd() * TABLE_H, sz, sz);
  }
  g.globalAlpha = 1;
  // ランプのくぼみ（消えているときの色ガラス）
  for (const l of buildLamps(wd)) {
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
  field = { key, cv };
  return cv;
}

// ------------------------------------------------------------------ 本体
export interface DisplayRect { x: number; y: number; w: number; h: number }

export function drawPinball(
  ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink, disp: DisplayRect, cw: number, ch: number, bgUrl: string, dpr: number,
): void {
  const s = rink.w / W;
  const t = wd.time;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const gi = giColor(wd);

  // 外の暗がり（キャビネットの中）
  const bgk = ctx.createLinearGradient(0, 0, 0, ch);
  bgk.addColorStop(0, '#060814');
  bgk.addColorStop(1, '#0b0f24');
  ctx.fillStyle = bgk;
  ctx.fillRect(0, 0, cw, ch);

  drawDisplay(ctx, wd, disp);

  const q = wd.quake;
  ctx.save();
  ctx.translate(rink.x + (q ? (Math.random() - 0.5) * q : 0), rink.y + (q ? (Math.random() - 0.5) * q : 0));
  // ジャックポットなどで一瞬寄る
  const pk = 1 + wd.punch * 0.025;
  ctx.translate(rink.w / 2, rink.h / 2);
  ctx.scale(pk * s, pk * (rink.h / TABLE_H));
  ctx.translate(-W / 2, -TABLE_H / 2);

  // 台の下からの光（色ごとに一度だけ描いて取っておく）
  if (!wd.lowFx) lit(ctx, () => ctx.drawImage(underGlow(gi), -40, -40, W + 80, TABLE_H + 80));

  // 盤面の絵
  const pf = playfield(wd, bgUrl, Math.max(8, Math.round(rink.w * dpr)), Math.max(8, Math.round(rink.h * dpr)));
  if (pf) {
    // 画面の点と 1 対 1 なので、寄せているときだけなめらかにする（そのほうが軽い）
    ctx.imageSmoothingEnabled = wd.punch > 0;
    ctx.drawImage(pf, 0, 0, W, TABLE_H);
    ctx.imageSmoothingEnabled = false;
  }

  ctx.save();
  tablePath(ctx);
  ctx.closePath();
  ctx.clip();
  // 全体の光（モードで色が変わる）
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = wd.zone ? 0.1 : 0.05;
  ctx.fillStyle = gi;
  ctx.fillRect(0, 0, W, TABLE_H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawLamps(ctx, wd);
  if (!wd.lowFx) drawTwinkles(ctx, t);
  drawWalls(ctx, wd);
  drawHole(ctx, wd);
  drawStar(ctx, wd);
  drawBumpers(ctx, wd, gi);
  drawRingsWaves(ctx, wd, s);
  drawEnemies(ctx, wd);
  drawFlippers(ctx, wd);
  drawBalls(ctx, wd, false);
  drawLasers(ctx, wd);
  ctx.restore();

  // アーマーと LED のサイドレール（台のふち）
  drawArmor(ctx, wd, gi);
  // ワイヤーのランプ（盤面より上）と、その上を走る球
  drawRamp(ctx, wd);
  if (wd.onRamp) drawBalls(ctx, wd, true);
  if (wd.hold.active) aimArc(ctx, wd);
  if (wd.parked && !wd.hold.active) {
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

  ctx.save();
  ctx.translate(rink.x, rink.y);
  drawOverlay(ctx, wd, rink);
  ctx.restore();
  if (wd.phase === 'zoom') {
    const k = Math.min(1, wd.zoomT / wd.zoomDur);
    ctx.save();
    ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    ctx.translate(rink.x + rink.w / 2, rink.y + rink.h * 0.42);
    ctx.scale(1.3 - k * 0.3, 1.3 - k * 0.3);
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

/** 全体の光の色：ふつうは青白、ボス中は赤、ブラックホール中は紫、マルチボールと ZONE は虹 */
function giColor(wd: PinballWorld): string {
  if (wd.zone) return hue(wd.time * 300);
  if (wd.mates.some((b) => b.ghost === undefined)) return hue(wd.time * 120);
  if (wd.hole.on) return '#c08bff';
  if (wd.bossAlive) return '#ff4f5e';
  return '#7fd6ff';
}

function lit(ctx: CanvasRenderingContext2D, fn: () => void): void {
  ctx.globalCompositeOperation = 'lighter';
  fn();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawLamps(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const key = `${wd.saucer.x},${wd.saucer.y}`;
  if (!lamps || lampKey !== key) { lamps = buildLamps(wd); lampKey = key; }
  const idle = wd.parked === 'plunger' && wd.shows.length === 0;
  for (const l of lamps) {
    let a = lampBase(wd, l);
    let color = l.color;
    const sh = showLight(wd, l.x, l.y);
    if (sh.a > a) { a = sh.a; color = sh.color ?? color; }
    // 打ち出し待ちの間は、ゆっくり光が流れる（見ていて飽きないように）
    if (idle) {
      const v = 0.5 + 0.5 * Math.sin(wd.time * 3 - l.y * 0.02 + l.x * 0.01);
      if (v * 0.7 > a) { a = v * 0.7; color = hue(l.y * 0.6 + wd.time * 60); }
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
  // レーンの文字と倍率（ランプの上の字）
  wd.lanes.forEach((ln, i) => {
    const on = ln.lit || (ln.flash > 0 && Math.floor(ln.flash * 12) % 2 === 0);
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,0.16)';
    ctx.beginPath();
    ctx.arc(ln.x, 76, 10, 0, TAU);
    ctx.fill();
    if (on) lit(ctx, () => addGlow(ctx, ln.x, 76, 26, '#ffd23f', 0.8));
    label(ctx, PinballWorld.LETTERS[i], ln.x, 77, 13, on ? '#0a0d1c' : 'rgba(255,255,255,0.55)', false);
  });
  for (let i = 2; i <= 8; i += 1) {
    const x = 180 + (i - 5) * 22;
    const on = wd.pinMul >= i;
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,0.12)';
    roundRect(ctx, x - 9, 404, 18, 14, 4);
    ctx.fill();
    if (on) lit(ctx, () => addGlow(ctx, x, 411, 18, '#ffd23f', 0.6));
    label(ctx, `×${i}`, x, 411, 9, on ? '#0a0d1c' : 'rgba(255,255,255,0.4)', false);
  }
  // スピナー
  const sp = wd.spinner;
  const w = Math.abs(Math.cos(sp.angle)) * 18 + 2;
  ctx.fillStyle = sp.speed > 1 ? '#ffd23f' : '#c9d6ff';
  ctx.fillRect(sp.x - w, sp.y - 3, w * 2, 6);
  ctx.strokeStyle = '#0a0d1c';
  ctx.lineWidth = 1;
  ctx.strokeRect(sp.x - w, sp.y - 3, w * 2, 6);
  // キャプチャーホール
  const sc = wd.saucer;
  const hg = ctx.createRadialGradient(sc.x, sc.y, 2, sc.x, sc.y, sc.r);
  hg.addColorStop(0, '#000');
  hg.addColorStop(1, '#2a1a10');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(sc.x, sc.y, sc.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = sc.flash > 0 ? '#ffffff' : '#ff8f2e';
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = sc.locks > i ? '#ff8f2e' : 'rgba(255,143,46,0.18)';
    ctx.beginPath();
    ctx.arc(sc.x - 16 + i * 16, sc.y + 22, 4.5, 0, TAU);
    ctx.fill();
  }
  // ワープ（渦）
  const wp = wd.warpIn;
  for (let i = 0; i < 4; i += 1) {
    ctx.strokeStyle = `rgba(192,139,255,${0.85 - i * 0.18})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, wp.r - i * 3, wd.time * 5 + i * 1.3, wd.time * 5 + i * 1.3 + 4.2);
    ctx.stroke();
  }
  lit(ctx, () => addGlow(ctx, wp.x, wp.y, 30, '#c08bff', 0.35 + 0.15 * Math.sin(wd.time * 6)));
  // キックバック
  const kb = wd.kickback;
  ctx.fillStyle = kb.lit ? (kb.flash > 0 && Math.floor(kb.flash * 10) % 2 ? '#ffffff' : '#4fe07a') : 'rgba(79,224,122,0.15)';
  roundRect(ctx, 10, 600, 24, 10, 3);
  ctx.fill();
  if (kb.lit) lit(ctx, () => addGlow(ctx, 22, 605, 18, '#4fe07a', 0.5));
  label(ctx, 'KICK', 22, 590, 8, kb.lit ? '#bfffd4' : 'rgba(255,255,255,0.3)', false);
  if (wd.ballSaveUntil > wd.time) label(ctx, 'SHOOT AGAIN', 180, 624, 8, '#0a0d1c', false);
}

/** ラメがときどききらっと光る */
function drawTwinkles(ctx: CanvasRenderingContext2D, t: number): void {
  lit(ctx, () => {
    for (let i = 0; i < 16; i += 1) {
      const u = t * 0.8 + i * 0.37;
      const cyc = Math.floor(u);
      const h1 = Math.sin(cyc * 127.1 + i * 311.7) * 43758.5453;
      const h2 = Math.sin(cyc * 269.5 + i * 183.3) * 43758.5453;
      const x = (h1 - Math.floor(h1)) * W;
      const y = (h2 - Math.floor(h2)) * TABLE_H;
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
    const seg = wd.segs.find((sg) => sg.kick && (side === 1 ? sg.ax < 180 : sg.ax > 180));
    const on = (seg?.flash ?? 0) > 0;
    const pts = SLING.map(([sx, sy]) => [side === 1 ? sx : W - sx, sy] as [number, number]);
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
    const [cx, cy] = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
    for (const [px, py] of pts) screw(ctx, px + (cx - px) * 0.22, py + (cy - py) * 0.22);
    if (on) lit(ctx, () => addGlow(ctx, cx, cy, 40, '#6dffb0', 0.8));
  }
  for (const sg of wd.segs) {
    const outer = sg.ax === 0 || sg.ax === W || sg.ay === 0 || sg.by === 0 || (sg.ay < 92 && (sg.ax < 92 || sg.ax > 268));
    if (outer) continue; // 外の壁はアーマーとして描く
    if (sg.kick) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(sg.ax, sg.ay);
      ctx.lineTo(sg.bx, sg.by);
      ctx.stroke();
      ctx.strokeStyle = sg.flash > 0 ? '#ffd23f' : '#ff4f5e';
      ctx.lineWidth = 2;
      ctx.stroke();
      continue;
    }
    // 金属のガイド（影・本体・光）
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sg.ax + 2, sg.ay + 3);
    ctx.lineTo(sg.bx + 2, sg.by + 3);
    ctx.stroke();
    ctx.strokeStyle = '#8a97b8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sg.ax, sg.ay);
    ctx.lineTo(sg.bx, sg.by);
    ctx.stroke();
    ctx.strokeStyle = '#eef3ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // レーンの仕切りの頭（プラスチックの小さな帽子）
  for (const x of [126, 162, 198, 234]) {
    ctx.fillStyle = '#ff6ad5';
    ctx.beginPath();
    ctx.arc(x, 56, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x - 1, 55, 1.4, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#c9d2e8';
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#4a5370';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x - 1.2, y);
  ctx.lineTo(x + 1.2, y);
  ctx.stroke();
}

function drawBumpers(ctx: CanvasRenderingContext2D, wd: PinballWorld, gi: string): void {
  for (const b of wd.bumpers) {
    const on = b.flash > 0;
    const k = on ? b.flash / 0.16 : 0;
    const r = b.r * (1 + k * 0.1);
    // 下の光（いつもうっすら、当たると強く）
    if (on || !wd.lowFx) lit(ctx, () => addGlow(ctx, b.x, b.y, r * 2.6, on ? '#ff6ad5' : gi, on ? 1 : 0.25 + 0.1 * Math.sin(wd.time * 4 + b.x)));
    // 影・台座
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(b.x + 3, b.y + 6, r + 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1030';
    ctx.beginPath();
    ctx.arc(b.x, b.y + 2, r + 3, 0, TAU);
    ctx.fill();
    // 胴
    const body = ctx.createLinearGradient(b.x - r, b.y, b.x + r, b.y);
    body.addColorStop(0, '#7a1f63');
    body.addColorStop(0.45, on ? '#ffffff' : '#ff6ad5');
    body.addColorStop(1, '#5a1048');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    // 帽子（白いふた）と星
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
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 10 * (1 - k) + 4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawFlippers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  for (const f of wd.flippers) {
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
    ctx.strokeStyle = up ? '#ffb347' : '#e8203a'; // ゴム
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = '#f4f6ff'; // 白いバット
    ctx.lineWidth = 10;
    ctx.stroke();
    line(0, 2);
    ctx.strokeStyle = 'rgba(160,170,200,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 軸の金具
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
  if (wd.hole.held >= 0) {
    // ブラックホールに吸いこまれていく
    const k = Math.min(1, wd.hole.held / 0.35);
    medallion(ctx, p.x, p.y, p.r * (1 - k * 0.85), wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1 - k * 0.7);
    return;
  }
  const r = p.r * (onRamp ? 1.28 : 1);
  // 尾
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 700 && wd.trail.length > 1) {
    ctx.lineCap = 'round';
    lit(ctx, () => {
      for (let i = 1; i < wd.trail.length; i += 1) {
        const a = wd.trail[i - 1];
        const b = wd.trail[i];
        const k = 1 - (wd.time - b.t) / 0.18;
        ctx.globalAlpha = Math.max(0, k) * 0.35;
        ctx.strokeStyle = wd.zone ? hue(wd.time * 600 + i * 30) : ELEM_COLOR[wd.attack];
        ctx.lineWidth = r * 2 * Math.max(0.2, k);
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

/** ブラックホール：渦を巻く光の輪と、吸いこまれていく粒 */
function drawHole(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const h = wd.hole;
  if (!h.on) return;
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
  // 降着円盤
  for (let i = 0; i < 5; i += 1) {
    const rr = R * (1.9 - i * 0.18);
    ctx.strokeStyle = i % 2 ? '#ff8f2e' : '#c08bff';
    ctx.globalAlpha = 0.5 + 0.1 * i;
    ctx.lineWidth = 3 - i * 0.3;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, rr, rr * 0.42, h.spin * 0.15, h.spin * (1 + i * 0.3), h.spin * (1 + i * 0.3) + 4);
    ctx.stroke();
  }
  // 吸いこまれていく粒
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
  if (!st.on) return;
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
  // 残り時間の輪
  ctx.strokeStyle = 'rgba(191,233,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(st.x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, st.t / 8));
  ctx.stroke();
}

/** レーザー：マルチボール・ZONE・大きな知らせのときに、上から光の線が走る */
function drawLasers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const big = wd.shows.some((x) => x.kind === 'rainbow' || x.kind === 'strobe');
  if (!(wd.zone || big || wd.mates.some((b) => b.ghost === undefined))) return;
  ctx.lineCap = 'round';
  lit(ctx, () => {
    for (let i = 0; i < 4; i += 1) {
      const ox = i < 2 ? 40 : 320;
      const a = Math.PI / 2 + Math.sin(wd.time * (1.3 + i * 0.4) + i) * 0.75;
      const col = wd.zone ? hue(wd.time * 200 + i * 90) : ['#ff2ea6', '#3fd0ff', '#4fe07a', '#ffd23f'][i];
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(ox, -10);
      ctx.lineTo(ox + Math.cos(a) * 760, -10 + Math.sin(a) * 760);
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

/** アーマー（台のふちの金属）と、そこに並ぶ LED */
function drawArmor(ctx: CanvasRenderingContext2D, wd: PinballWorld, gi: string): void {
  tablePath(ctx, -3);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#6b0d1d');
  g.addColorStop(0.03, '#ff5a6e');
  g.addColorStop(0.06, '#8a1024');
  g.addColorStop(0.5, '#b8162e');
  g.addColorStop(0.94, '#8a1024');
  g.addColorStop(0.97, '#ff5a6e');
  g.addColorStop(1, '#6b0d1d');
  ctx.strokeStyle = g;
  ctx.lineWidth = 9;
  ctx.stroke();
  tablePath(ctx, 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // LED：ふちにそって並び、光が流れる。大きな知らせのときは白く点滅
  let flash = 0;
  for (const x of wd.shows) if (x.kind === 'strobe') flash = Math.max(flash, showValue(x, (wd.time - x.t0) / x.dur, 0, 0, wd.time));
  lit(ctx, () => {
    let i = 0;
    const led = (x: number, y: number) => {
      const wave = 0.35 + 0.65 * Math.max(0, Math.sin(wd.time * 6 - i * 0.45));
      const col = flash > 0.5 ? '#ffffff' : wd.zone ? hue(i * 18 + wd.time * 400) : gi;
      if (!wd.lowFx) addGlow(ctx, x, y, 7, col, wave);
      ctx.globalAlpha = 0.6 + 0.4 * wave;
      ctx.fillStyle = col;
      ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
      i += 1;
    };
    for (let y = TABLE_H - 20; y > 96; y -= 18) { led(-3, y); led(W + 3, y); }
    for (let k = 0; k <= 8; k += 1) {
      const a = Math.PI + (k / 8) * (Math.PI / 2);
      led(90 + Math.cos(a) * 93, 90 + Math.sin(a) * 93);
      led(270 - Math.cos(a) * 93, 90 + Math.sin(a) * 93);
    }
    for (let x = 100; x <= 260; x += 20) led(x, -3);
  });
}

/** ワイヤーのランプ（色つきの金属の 2 本の線と、それを支える柱） */
function drawRamp(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const off = 9;
  const normal = (i: number): [number, number] => {
    const [ax, ay] = RAMP_PATH[Math.max(0, i - 1)];
    const [bx, by] = RAMP_PATH[Math.min(RAMP_PATH.length - 1, i + 1)];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [-(by - ay) / l, (bx - ax) / l];
  };
  const rail = (sign: number, dx: number, dy: number) => {
    ctx.beginPath();
    RAMP_PATH.forEach(([x, y], i) => {
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
    rail(sg, 5, 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // 柱と横の渡し
  for (let i = 0; i < RAMP_PATH.length; i += 1) {
    const [x, y] = RAMP_PATH[i];
    const [nx, ny] = normal(i);
    if (i % 3 === 1) {
      ctx.strokeStyle = 'rgba(180,190,210,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5, y + 9);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,210,63,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - nx * off, y - ny * off);
    ctx.lineTo(x + nx * off, y + ny * off);
    ctx.stroke();
  }
  // 2 本の線（金色の塗装と光）
  const on = wd.onRamp !== null || wd.time - wd.rampLastT < 0.6;
  for (const sg of [-1, 1]) {
    rail(sg, 0, 0);
    ctx.strokeStyle = '#9c6a00';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.strokeStyle = on ? '#fff6c2' : '#ffd23f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // 入口のプラスチック
  const [mx, my] = RAMP_PATH[0];
  ctx.fillStyle = 'rgba(255,210,63,0.4)';
  ctx.beginPath();
  ctx.moveTo(mx - 18, my + 10);
  ctx.lineTo(mx + 18, my + 10);
  ctx.lineTo(mx + 11, my - 6);
  ctx.lineTo(mx - 11, my - 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  label(ctx, 'RAMP', mx, my + 2, 9, '#2a1a00', false);
  if (on) lit(ctx, () => addGlow(ctx, mx, my, 40, '#ffd23f', 0.6));
}

/** 打ち出しの道すじ（坂の重さで曲がる） */
function aimArc(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  const p = wd.puck;
  const { px, py } = wd.hold;
  const len = Math.hypot(px, py);
  const k = wd.pullPower;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = k >= 1 ? '#ffd23f' : '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * k);
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
  // 速さは PinballWorld.holdEnd と同じ計算（0.62 倍・上限あり）
  const v = Math.min(2565, wd.st.launch * (0.25 + 0.75 * k ** 0.85) * 0.62);
  let x = p.x;
  let y = p.y;
  let vx = ux * v;
  let vy = uy * v;
  const h = 1 / 60;
  const g = 1150 * (wd.combo >= ZONE_COMBO ? 0.6 : 1);
  for (let i = 0; i < 40; i += 1) {
    vy += g * h;
    x += vx * h;
    y += vy * h;
    if (x < 4 || x > 356) vx = -vx;
    if (y < 4) vy = -vy;
    if (y > TABLE_H) break;
    if (i % 2) continue;
    ctx.globalAlpha = 1 - i / 44;
    ctx.fillStyle = k >= 1 ? '#ffd23f' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ 上の液晶ディスプレイ
const stripeCache = new Map<string, HTMLCanvasElement>();
/** 液晶の背景の斜めの縞（22px ごとにくり返すので、22px までずらして貼れば動いて見える） */
function stripes(color: string, w: number, h: number): HTMLCanvasElement {
  const key = `${color}|${Math.round(w)}|${Math.round(h)}`;
  let c = stripeCache.get(key);
  if (c) return c;
  if (stripeCache.size > 40) stripeCache.clear();
  c = document.createElement('canvas');
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
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
  scanCv.width = Math.round(w);
  scanCv.height = Math.round(h);
  const g = scanCv.getContext('2d');
  if (g) { g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }
  return scanCv;
}
const HINTS: [string, string][] = [
  ['SHOOT THE RAMP', '右の入口へ勢いよく。続けて通すほど GUM'],
  ['LIGHT G-U-M', '上の 3 つのレーンで GUM の倍率アップ'],
  ['LOCK 3 = MULTIBALL', 'ホールに 3 回で仲間のヒーローが球に'],
  ['LOOP!', '左の道を上がって右から下りる'],
  ['BLACK HOLE', '開いたら吸いこまれて超高速で撃ち出す'],
  ['GHOST STAR', '星に触ると分身球'],
  [`${ZONE_COMBO} COMBO = ZONE`, '坂が軽くなり GUM ×2'],
];

function drawDisplay(ctx: CanvasRenderingContext2D, wd: PinballWorld, d: DisplayRect): void {
  if (d.h < 10) return;
  const t = wd.time;
  const tier = wd.display.tier;
  const age = t - wd.display.t;
  const fresh = age < 2.6 && wd.display.t > 0;
  ctx.save();
  // 枠（色つきの金属）
  roundRect(ctx, d.x - 3, d.y - 3, d.w + 6, d.h + 6, 10);
  const fr = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
  fr.addColorStop(0, '#ff5a6e');
  fr.addColorStop(0.5, '#8a1024');
  fr.addColorStop(1, '#ff5a6e');
  ctx.fillStyle = fr;
  ctx.fill();
  roundRect(ctx, d.x, d.y, d.w, d.h, 8);
  ctx.clip();
  // 背景：動く斜めの縞（知らせの強さで色が変わる）
  const cols = ['#10204a', '#103a5a', '#3a1060', '#5a0a2a'];
  const base = wd.zone ? hue(t * 200) : cols[fresh ? Math.min(3, tier) : 0];
  // （縞は色ごとに一度だけ描いて、ずらして貼る）
  ctx.drawImage(stripes(base, d.w, d.h), d.x - 22 + ((t * 40) % 22), d.y, d.w + 44, d.h);
  // ヒーロー
  const hr = d.h * 0.4;
  medallion(ctx, d.x + hr + 8, d.y + d.h / 2, hr, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  // 文字
  let title: string;
  let sub: string;
  if (fresh) {
    title = wd.display.text;
    sub = wd.display.sub;
  } else if (wd.parked === 'plunger') {
    [title, sub] = HINTS[Math.floor(t / 2.6) % HINTS.length];
  } else {
    title = wd.bossAlive ? 'BOSS BATTLE' : `TABLE ${wd.floor}`;
    const locks = '●'.repeat(wd.saucer.locks) + '○'.repeat(3 - wd.saucer.locks);
    sub = `LOCK ${locks}  RAMP ${wd.ramps}  LOOP ${wd.loops}  的 ${wd.enemies.filter((e) => !e.boss).length}`;
  }
  const left = d.x + hr * 2 + 16;
  const right = d.x + d.w - 56;
  const cx = (left + right) / 2;
  const pop = fresh ? 1 + Math.max(0, 0.25 - age) * 1.2 : 1;
  ctx.save();
  ctx.translate(cx, d.y + d.h * 0.42);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.min(d.h * 0.48, 26);
  ctx.font = `${Math.round(fs)}px 'Bangers', 'Dela Gothic One', sans-serif`;
  const tw = ctx.measureText(title).width;
  const maxW = right - left;
  if (tw > maxW) ctx.scale(maxW / tw, 1);
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.strokeText(title, 0, 0);
  const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, fresh && tier >= 2 ? '#ffd23f' : '#9fe8ff');
  ctx.fillStyle = wd.zone ? hue(t * 300) : tg;
  ctx.fillText(title, 0, 0);
  ctx.restore();
  // 下の小さな字（はみ出すときは縮める）
  const ss = Math.min(11, d.h * 0.2);
  ctx.font = `${ss}px 'DotGothic16', sans-serif`;
  const sw = ctx.measureText(sub).width;
  ctx.save();
  ctx.translate(cx, d.y + d.h * 0.8);
  if (sw > maxW) ctx.scale(maxW / sw, 1);
  label(ctx, sub, 0, 0, ss, 'rgba(255,255,255,0.85)');
  ctx.restore();
  // 右：GUM の倍率
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
  // 走査線
  ctx.drawImage(scanlines(d.w, d.h), d.x, d.y);
  // 新しい知らせの光
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
