// ピンボールの台の描画（canvas）。PinballWorld の状態を読むだけで、書きかえない。

import { img, ready } from '../core/util';
import { RARITY_COLOR } from '../core/catalog';
import { ELEM_COLOR } from './elements';
import { MAX_PULL, MIN_PULL } from './world';
import { PinballWorld, SLING, TABLE_H, flipperTip } from './pinball';
import { drawEnemies, drawFx, drawOverlay, drawRingsWaves, medallion, roundRect, type Rink } from './render';

const TAU = Math.PI * 2;
const NEON = '#3fd0ff';

export function drawPinball(ctx: CanvasRenderingContext2D, wd: PinballWorld, rink: Rink, cw: number, ch: number, bgUrl: string, dpr: number): void {
  const s = rink.w / wd.w;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // 背景
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, cw, ch);
  const bg = img(bgUrl);
  if (ready(bg)) {
    const k = Math.max(cw / bg.naturalWidth, ch / bg.naturalHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bg, (cw - bg.naturalWidth * k) / 2, (ch - bg.naturalHeight * k) / 2, bg.naturalWidth * k, bg.naturalHeight * k);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
  }

  const q = wd.quake;
  ctx.save();
  ctx.translate(rink.x + (q ? (Math.random() - 0.5) * q : 0), rink.y + (q ? (Math.random() - 0.5) * q : 0));
  ctx.scale(s, s);

  // 台の板（上が丸い）
  ctx.save();
  tablePath(ctx);
  ctx.fillStyle = 'rgba(8,14,34,0.78)';
  ctx.fill();
  ctx.clip();
  // 台の模様：下へ向かう細い線（坂のしるし）
  ctx.strokeStyle = 'rgba(120,200,255,0.06)';
  ctx.lineWidth = 1;
  for (let y = 40; y < TABLE_H; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(360, y);
    ctx.stroke();
  }
  // 台の切りかえ：光が下から上へ走る
  if (wd.phase === 'zoom') {
    const k = Math.min(1, wd.zoomT / wd.zoomDur);
    const y = TABLE_H * (1 - k);
    const g = ctx.createLinearGradient(0, y - 120, 0, y + 20);
    g.addColorStop(0, 'rgba(255,225,77,0)');
    g.addColorStop(1, 'rgba(255,225,77,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 120, 360, 140);
  }
  ctx.restore();

  drawLamps(ctx, wd);
  drawWalls(ctx, wd);
  drawBumpers(ctx, wd);
  drawRingsWaves(ctx, wd, s);
  drawEnemies(ctx, wd);
  drawFlippers(ctx, wd);

  // 球（マルチボールの仲間・本物の球）
  for (const m of wd.mates) medallion(ctx, m.x, m.y, m.r, m.hero.img, RARITY_COLOR[m.hero.rarity], 1);
  const p = wd.puck;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 700 && wd.trail.length > 1) {
    ctx.lineCap = 'round';
    for (let i = 1; i < wd.trail.length; i += 1) {
      const a = wd.trail[i - 1];
      const b = wd.trail[i];
      const k = 1 - (wd.time - b.t) / 0.18;
      ctx.globalAlpha = Math.max(0, k) * 0.4;
      ctx.strokeStyle = ELEM_COLOR[wd.attack];
      ctx.lineWidth = p.r * 2 * Math.max(0.2, k);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }
  const ac = wd.hold.active ? ELEM_COLOR.green : ELEM_COLOR[wd.attack];
  ctx.strokeStyle = ac;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 2, 0, TAU);
  ctx.stroke();
  medallion(ctx, p.x, p.y, p.r, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  // 止まっている球：打ち出しの案内
  if (wd.parked && !wd.hold.active) {
    const pulse = 1 + Math.sin(wd.time * 6 + wd.parkT * 6) * 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.r + 10) * pulse, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, wd.parked === 'plunger' ? '引っぱって打ち出す' : 'ねらって撃てる', p.x, p.y + p.r + 22, 12, '#ffffff');
  }
  if (wd.hold.active) aimArc(ctx, wd);

  drawFx(ctx, wd);
  ctx.restore();

  ctx.save();
  ctx.translate(rink.x, rink.y);
  drawOverlay(ctx, wd, rink);
  ctx.restore();
  // 台の番号（切りかえ中）
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

/** 台のふちの形（上の角は丸い） */
function tablePath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, TABLE_H);
  ctx.lineTo(0, 90);
  ctx.arc(90, 90, 90, Math.PI, Math.PI * 1.5);
  ctx.lineTo(270, 0);
  ctx.arc(270, 90, 90, Math.PI * 1.5, TAU);
  ctx.lineTo(360, TABLE_H);
  ctx.closePath();
}

function drawWalls(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  ctx.lineCap = 'round';
  // スリングショットの三角を塗る
  for (const side of [1, -1]) {
    const x = (v: number) => (side === 1 ? v : 360 - v);
    const lit = wd.segs.find((s) => s.kick && (side === 1 ? s.ax < 180 : s.ax > 180))?.flash ?? 0;
    ctx.fillStyle = lit > 0 ? 'rgba(109,255,176,0.55)' : 'rgba(109,255,176,0.14)';
    ctx.beginPath();
    SLING.forEach(([sx, sy], i) => (i ? ctx.lineTo(x(sx), sy) : ctx.moveTo(x(sx), sy)));
    ctx.closePath();
    ctx.fill();
  }
  for (const s of wd.segs) {
    const outer = s.ax === 0 || s.ax === 360 || s.ay === 0 || s.by === 0 || (s.ay < 92 && (s.ax < 92 || s.ax > 268));
    ctx.strokeStyle = s.kick ? (s.flash > 0 ? '#ffffff' : '#6dffb0') : outer ? 'rgba(63,208,255,0.9)' : 'rgba(170,220,255,0.85)';
    ctx.lineWidth = s.kick ? 4 : outer ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawBumpers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  for (const b of wd.bumpers) {
    const lit = b.flash > 0;
    const r = b.r * (lit ? 1.12 : 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 4, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = lit ? '#ffffff' : '#ff6ad5';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = lit ? '#ffe14d' : '#7a1f63';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = lit ? '#ffffff' : '#ffc2f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.62, 0, TAU);
    ctx.stroke();
    if (lit) {
      ctx.globalAlpha = b.flash / 0.16;
      ctx.strokeStyle = '#ff6ad5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 8 * (1 - b.flash / 0.16) + 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function drawFlippers(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  for (const f of wd.flippers) {
    const [tx, ty] = flipperTip(f);
    const up = f.up > 0;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0a0d1c';
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(f.px, f.py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = up ? '#ffe14d' : '#f2f4ff';
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.strokeStyle = up ? '#ff8f2e' : '#ff4f5e';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#0a0d1c';
    ctx.beginPath();
    ctx.arc(f.px, f.py, 3, 0, TAU);
    ctx.fill();
  }
}

/** ランプ・レーン・スピナー・ホール・ワープ・キックバック・倍率 */
function drawLamps(ctx: CanvasRenderingContext2D, wd: PinballWorld): void {
  // ロールオーバーレーンの文字
  wd.lanes.forEach((l, i) => {
    const lit = l.lit || l.flash > 0 && Math.floor(l.flash * 12) % 2 === 0;
    ctx.fillStyle = lit ? '#ffd23f' : 'rgba(255,210,63,0.16)';
    ctx.beginPath();
    ctx.arc(l.x, 76, 10, 0, TAU);
    ctx.fill();
    label(ctx, PinballWorld.LETTERS[i], l.x, 77, 13, lit ? '#0a0d1c' : 'rgba(255,255,255,0.55)', false);
  });
  // GUM の倍率のランプ
  for (let i = 2; i <= 8; i += 1) {
    const x = 180 + (i - 5) * 22;
    const on = wd.pinMul >= i;
    ctx.fillStyle = on ? '#ffd23f' : 'rgba(255,210,63,0.12)';
    roundRect(ctx, x - 9, 404, 18, 14, 4);
    ctx.fill();
    label(ctx, `×${i}`, x, 411, 9, on ? '#0a0d1c' : 'rgba(255,255,255,0.4)', false);
  }
  // ループの矢印（左右の道）
  for (const side of [-1, 1]) {
    const x = side === -1 ? 22 : 338;
    ctx.fillStyle = 'rgba(63,208,255,0.35)';
    for (let k = 0; k < 3; k += 1) {
      const y = 250 - k * 26 + ((wd.time * 40) % 26);
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x - 7, y + 4);
      ctx.lineTo(x + 7, y + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  // スピナー
  const sp = wd.spinner;
  const w = Math.abs(Math.cos(sp.angle)) * 18 + 2;
  ctx.fillStyle = sp.speed > 1 ? '#ffd23f' : '#c9d6ff';
  ctx.fillRect(sp.x - w, sp.y - 3, w * 2, 6);
  ctx.strokeStyle = '#0a0d1c';
  ctx.lineWidth = 1;
  ctx.strokeRect(sp.x - w, sp.y - 3, w * 2, 6);
  // キャプチャーホール（ロックのランプ）
  const sc = wd.saucer;
  ctx.fillStyle = '#05070f';
  ctx.beginPath();
  ctx.arc(sc.x, sc.y, sc.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = sc.flash > 0 ? '#ffffff' : '#ff8f2e';
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = sc.locks > i ? '#ff8f2e' : 'rgba(255,143,46,0.18)';
    ctx.beginPath();
    ctx.arc(sc.x - 16 + i * 16, sc.y + 24, 5, 0, TAU);
    ctx.fill();
  }
  label(ctx, 'LOCK', sc.x, sc.y + 36, 9, 'rgba(255,190,120,0.8)', false);
  // ワープ
  const wp = wd.warpIn;
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = `rgba(192,139,255,${0.8 - i * 0.22})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, wp.r - i * 4, wd.time * 4 + i, wd.time * 4 + i + 4.4);
    ctx.stroke();
  }
  label(ctx, 'WARP', wp.x, wp.y + 24, 9, 'rgba(210,180,255,0.85)', false);
  ctx.strokeStyle = 'rgba(192,139,255,0.5)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(wd.warpOut.x, wd.warpOut.y, 10, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // キックバック（左のアウトレーン）
  const kb = wd.kickback;
  ctx.fillStyle = kb.lit ? (kb.flash > 0 && Math.floor(kb.flash * 10) % 2 ? '#ffffff' : '#4fe07a') : 'rgba(79,224,122,0.15)';
  roundRect(ctx, 10, 600, 24, 10, 3);
  ctx.fill();
  label(ctx, 'KICK', 22, 590, 8, kb.lit ? '#bfffd4' : 'rgba(255,255,255,0.3)', false);
  // ボールセーブ
  const save = wd.ballSaveUntil > wd.time;
  if (save) label(ctx, 'BALL SAVE', 180, 626, 12, Math.floor(wd.time * 6) % 2 ? '#4fe07a' : '#ffffff');
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
  // 速さは World.holdEnd と同じ計算（ピンボールでは 0.62 倍・上限あり）
  const v = Math.min(2565, wd.st.launch * (0.25 + 0.75 * k ** 0.85) * 0.62);
  let x = p.x;
  let y = p.y;
  let vx = ux * v;
  let vy = uy * v;
  const h = 1 / 60;
  for (let i = 0; i < 40; i += 1) {
    vy += 1150 * h;
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
