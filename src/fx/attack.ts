// 攻撃の 3 色を、色だけでなく形でも見せる（色覚の多様性への配慮。ピラミッドとピンボールで共通）。
//   赤（傾き・近距離連続）＝●の玉：球のまわりを回り、当たると丸い玉がばらばらと散る
//   青（振り・範囲）　　　＝◇のひし形：球を囲む枠、当たるとひし形の輪が広がる
//   緑（引っぱり・貫通）　＝▲の矢じり：進む向きを指し、当たると矢じりが突き抜ける

import { ELEM_COLOR, type Elem } from '../game/elements';
import { PK, Particles } from './particles';

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** 球（マレット）のまわりの印。u は線の太さなどの単位（画面で 1px くらいになる長さ） */
export function attackMark(ctx: CanvasRenderingContext2D, kind: Elem, x: number, y: number, r: number, vx: number, vy: number, t: number, u = 1): void {
  const color = ELEM_COLOR[kind];
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0b0a10';
  ctx.lineWidth = u;
  if (kind === 'red') {
    for (let i = 0; i < 3; i += 1) {
      const a = t * 7 + (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * (r + 7 * u), y + Math.sin(a) * (r + 7 * u), 2.6 * u, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'blue') {
    const rr = (r + 8 * u + Math.sin(t * 9) * 1.5 * u) * 1.15;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(x, y - rr); ctx.lineTo(x + rr, y); ctx.lineTo(x, y + rr); ctx.lineTo(x - rr, y);
    ctx.closePath();
    ctx.lineWidth = 4 * u;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  } else {
    // 進む向き（止まっていれば上）
    const a = Math.hypot(vx, vy) > 60 ? Math.atan2(vy, vx) : -Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < 2; i += 1) {
      const d = r + (6 + i * 7 + ((t * 30) % 7) * 0.4) * u;
      const cx = x + ca * d;
      const cy = y + sa * d;
      ctx.globalAlpha = i ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + ca * 5 * u, cy + sa * 5 * u);
      ctx.lineTo(cx - ca * 2 * u - sa * 5.5 * u, cy - sa * 2 * u + ca * 5.5 * u);
      ctx.lineTo(cx - ca * 0.2 * u, cy - sa * 0.2 * u);
      ctx.lineTo(cx - ca * 2 * u + sa * 5.5 * u, cy - sa * 2 * u - ca * 5.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** 当たった所の粒（色ごとの形）。vx・vy は球の速さ（緑の矢じりの向き）、u は大きさの単位 */
export function emitHit(P: Particles, c: string | undefined, x: number, y: number, big: boolean, vx: number, vy: number, u = 1): void {
  if (c === 'red') {
    for (let k = 0; k < (big ? 7 : 4); k += 1) {
      const a = rand(0, TAU);
      const s = rand(60, 200) * u;
      P.add(PK.Dot, x + Math.cos(a) * 6 * u, y + Math.sin(a) * 6 * u, Math.cos(a) * s, Math.sin(a) * s, rand(0.18, 0.32), rand(3, 5.5) * (big ? 1.3 : 1) * u, ELEM_COLOR.red, 0, 4);
    }
  } else if (c === 'blue') {
    P.add(PK.Diamond, x, y, 0, 0, 0.34, (big ? 60 : 38) * u, ELEM_COLOR.blue);
    P.add(PK.Diamond, x, y, 0, 0, 0.5, (big ? 90 : 58) * u, '#bfe2ff');
  } else if (c === 'green') {
    const sp = Math.hypot(vx, vy) || 1;
    const ux = vx / sp;
    const uy = vy / sp;
    for (let k = 0; k < (big ? 5 : 3); k += 1) {
      const off = (k - 1) * 9 * u;
      P.add(PK.Tri, x - uy * off, y + ux * off, ux * rand(420, 700) * u, uy * rand(420, 700) * u, rand(0.2, 0.32), rand(7, 10) * (big ? 1.3 : 1) * u, ELEM_COLOR.green, 0, 2.5);
    }
  }
}
