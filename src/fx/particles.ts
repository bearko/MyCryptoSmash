// 軽い粒子の仕組み。粒は型つき配列の決まった数の席を使い回す（毎コマ配列を作らない）。
// 種類：火花（光の筋）・紙吹雪・GUM のかけら・ほこり・攻撃の色の形（赤＝●・青＝◇・緑＝▲）・光の輪・きらめき・閃光。
// 座標は台のユニット。描くのは render-pinball.ts の台の座標の中。

import { coreSprite, ringSprite, softSprite } from './sprites';

export const enum PK { Spark, Confetti, Chip, Dust, Dot, Diamond, Tri, Ring, Twinkle, Flash }

const TAU = Math.PI * 2;
const CAP = 640;

export class Particles {
  n = 0;
  /** いまの上限（画質で変える） */
  limit = CAP;
  private x = new Float32Array(CAP);
  private y = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private age = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  private size = new Float32Array(CAP);
  private rot = new Float32Array(CAP);
  private vr = new Float32Array(CAP);
  private grav = new Float32Array(CAP);
  private drag = new Float32Array(CAP);
  private kind = new Uint8Array(CAP);
  private col = new Uint8Array(CAP);
  private colors: string[] = [];
  private colorIx = new Map<string, number>();

  private ci(c: string): number {
    let i = this.colorIx.get(c);
    if (i === undefined) {
      if (this.colors.length >= 250) return 0;
      i = this.colors.length;
      this.colors.push(c);
      this.colorIx.set(c, i);
    }
    return i;
  }

  clear(): void { this.n = 0; }

  /** 粒を 1 つ足す。席がなければ、いちばん古い席を上書きする（大事な閃光・輪は残りやすいように前から探さない） */
  add(kind: PK, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grav = 0, drag = 0, rot = 0, vr = 0): void {
    let i = this.n;
    if (i >= this.limit) {
      if (kind === PK.Dust || kind === PK.Twinkle) return;
      i = Math.floor(Math.random() * this.limit);
    } else this.n += 1;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size;
    this.rot[i] = rot; this.vr[i] = vr; this.grav[i] = grav; this.drag[i] = drag;
    this.kind[i] = kind; this.col[i] = this.ci(color);
  }

  step(dt: number): void {
    let n = this.n;
    for (let i = 0; i < n; i += 1) {
      const a = this.age[i] + dt;
      if (a >= this.life[i]) {
        // 最後の席をここへ移す
        n -= 1;
        if (i !== n) {
          this.x[i] = this.x[n]; this.y[i] = this.y[n]; this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n];
          this.age[i] = this.age[n]; this.life[i] = this.life[n]; this.size[i] = this.size[n];
          this.rot[i] = this.rot[n]; this.vr[i] = this.vr[n]; this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n];
          this.kind[i] = this.kind[n]; this.col[i] = this.col[n];
          i -= 1;
        }
        continue;
      }
      this.age[i] = a;
      const d = this.drag[i];
      if (d) {
        const k = Math.max(0, 1 - d * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
    }
    this.n = n;
  }

  /** 光る粒（足し算で重ねる）。呼ぶ側が globalCompositeOperation を 'lighter' にしておく */
  drawLit(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    ctx.lineCap = 'round';
    for (let i = 0; i < this.n; i += 1) {
      const kd = this.kind[i];
      if (kd === PK.Confetti || kd === PK.Chip || kd === PK.Dust) continue;
      const x = this.x[i];
      const y = this.y[i];
      const s = this.size[i];
      if (x < x0 - s - 40 || x > x1 + s + 40 || y < y0 - s - 40 || y > y1 + s + 40) continue;
      const k = this.age[i] / this.life[i];
      const c = this.colors[this.col[i]];
      if (kd === PK.Spark) {
        const vx = this.vx[i];
        const vy = this.vy[i];
        const a = 1 - k * k;
        ctx.globalAlpha = a;
        ctx.strokeStyle = c;
        ctx.lineWidth = s * (1 - k * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - vx * 0.035, y - vy * 0.035);
        ctx.stroke();
        ctx.globalAlpha = a * 0.9;
        ctx.drawImage(coreSprite(c), x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
      } else if (kd === PK.Ring) {
        const r = s * (0.25 + 0.75 * (1 - (1 - k) * (1 - k)));
        ctx.globalAlpha = (1 - k) * (1 - k);
        ctx.drawImage(ringSprite(c), x - r, y - r, r * 2, r * 2);
      } else if (kd === PK.Flash) {
        const r = s * (0.6 + 0.4 * k);
        ctx.globalAlpha = (1 - k) * (1 - k);
        ctx.drawImage(coreSprite(c), x - r, y - r, r * 2, r * 2);
      } else if (kd === PK.Twinkle) {
        const a = Math.sin(k * Math.PI);
        ctx.globalAlpha = a;
        ctx.fillStyle = c;
        const l = s * a;
        ctx.fillRect(x - l, y - 0.5, l * 2, 1);
        ctx.fillRect(x - 0.5, y - l, 1, l * 2);
        ctx.drawImage(coreSprite(c), x - l * 0.7, y - l * 0.7, l * 1.4, l * 1.4);
      } else if (kd === PK.Dot) {
        // 赤：丸い玉（連打）
        const r = s * (1 - k * 0.7);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, TAU);
        ctx.fill();
      } else if (kd === PK.Diamond) {
        // 青：ひし形の輪（広がる）
        const r = s * (0.3 + 0.7 * (1 - (1 - k) * (1 - k)));
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.4 * (1 - k) + 0.6;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.72, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.72, y);
        ctx.closePath();
        ctx.stroke();
      } else if (kd === PK.Tri) {
        // 緑：矢じり（進む向きを指す）
        const a = Math.atan2(this.vy[i], this.vx[i]);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const l = s * (1 - k * 0.4);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x + ca * l, y + sa * l);
        ctx.lineTo(x - ca * l * 0.7 - sa * l * 0.62, y - sa * l * 0.7 + ca * l * 0.62);
        ctx.lineTo(x - ca * l * 0.25, y - sa * l * 0.25);
        ctx.lineTo(x - ca * l * 0.7 + sa * l * 0.62, y - sa * l * 0.7 - ca * l * 0.62);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /** 光らない粒（紙吹雪・GUM のかけら・ほこり）。ふつうの重ね方で */
  drawSolid(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    for (let i = 0; i < this.n; i += 1) {
      const kd = this.kind[i];
      if (kd !== PK.Confetti && kd !== PK.Chip && kd !== PK.Dust) continue;
      const x = this.x[i];
      const y = this.y[i];
      const s = this.size[i];
      if (x < x0 - s - 20 || x > x1 + s + 20 || y < y0 - s - 20 || y > y1 + s + 20) continue;
      const k = this.age[i] / this.life[i];
      const c = this.colors[this.col[i]];
      if (kd === PK.Dust) {
        const r = s * (0.5 + k);
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.drawImage(softSprite(c), x - r, y - r, r * 2, r * 2);
      } else if (kd === PK.Confetti) {
        // ひらひら：回りながら、幅が表・裏で変わる
        const r = this.rot[i];
        const wv = Math.cos(r * 2.3);
        const ca = Math.cos(r) * s;
        const sa = Math.sin(r) * s;
        const hw = 0.3 + 0.35 * Math.abs(wv);
        ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        ctx.fillStyle = c;
        if (wv < 0) ctx.globalAlpha *= 0.6;
        ctx.beginPath();
        ctx.moveTo(x - ca - sa * hw, y - sa + ca * hw);
        ctx.lineTo(x + ca - sa * hw, y + sa + ca * hw);
        ctx.lineTo(x + ca + sa * hw, y + sa - ca * hw);
        ctx.lineTo(x - ca + sa * hw, y - sa - ca * hw);
        ctx.closePath();
        ctx.fill();
      } else {
        // GUM のかけら：墨の縁の黄色い丸（つやの点つき）
        const r = s * (k < 0.15 ? 0.6 + k * 2.7 : 1);
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.fillStyle = '#0b0a10';
        ctx.beginPath();
        ctx.arc(x, y, r + 1.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff6c2';
        ctx.fillRect(x - r * 0.5, y - r * 0.55, r * 0.5, r * 0.35);
      }
    }
    ctx.globalAlpha = 1;
  }
}
