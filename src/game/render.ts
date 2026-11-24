// フィールドの描画（canvas）。World の状態を読むだけで、書きかえない。

import { cat, ITEM_COLOR, RARITY_COLOR } from '../core/catalog';
import { img, ready } from '../core/util';
import type { World } from './world';

export interface Rink { x: number; y: number; w: number; h: number }

const TAU = Math.PI * 2;
let holes: HTMLCanvasElement | null = null;
let holesPat: CanvasPattern | null = null;

/** エアテーブルの穴の模様（1 枚作って並べる） */
function holePattern(ctx: CanvasRenderingContext2D, step: number): CanvasPattern | null {
  if (!holes || holes.width !== Math.max(4, Math.round(step))) {
    holesPat = null;
    holes = document.createElement('canvas');
    const s = Math.max(4, Math.round(step));
    holes.width = s;
    holes.height = s;
    const c = holes.getContext('2d');
    if (c) {
      c.fillStyle = 'rgba(160,220,255,0.10)';
      c.beginPath();
      c.arc(s / 2, s / 2, Math.max(0.8, s * 0.07), 0, TAU);
      c.fill();
    }
  }
  if (!holesPat) holesPat = ctx.createPattern(holes, 'repeat');
  return holesPat;
}

export function draw(ctx: CanvasRenderingContext2D, wd: World, rink: Rink, cw: number, ch: number, bgUrl: string, dpr: number): void {
  const s = rink.w / wd.w;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // 背景（ステージの絵を画面いっぱいに）
  const bg = img(bgUrl);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, cw, ch);
  if (ready(bg)) {
    const k = Math.max(cw / bg.naturalWidth, ch / bg.naturalHeight);
    const bw = bg.naturalWidth * k;
    const bh = bg.naturalHeight * k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bg, (cw - bw) / 2, (ch - bh) / 2, bw, bh);
    ctx.imageSmoothingEnabled = false;
  }
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, 'rgba(6,10,24,0.55)');
  g.addColorStop(0.5, 'rgba(6,10,24,0.25)');
  g.addColorStop(1, 'rgba(6,10,24,0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);

  // 揺れ
  const q = wd.quake;
  const ox = q ? (Math.random() - 0.5) * q : 0;
  const oy = q ? (Math.random() - 0.5) * q : 0;
  ctx.save();
  ctx.translate(rink.x + ox, rink.y + oy);

  // テーブル
  const rr = 18;
  ctx.fillStyle = 'rgba(8,16,38,0.62)';
  roundRect(ctx, 0, 0, rink.w, rink.h, rr);
  ctx.fill();
  const pat = holePattern(ctx, 18 * s);
  if (pat) { ctx.fillStyle = pat; roundRect(ctx, 0, 0, rink.w, rink.h, rr); ctx.fill(); }
  ctx.strokeStyle = 'rgba(120,210,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, rink.h / 2);
  ctx.lineTo(rink.w, rink.h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rink.w / 2, rink.h / 2, 46 * s, 0, TAU);
  ctx.stroke();
  // ふち（勢いよく当たると光る）
  ctx.shadowColor = '#3fd0ff';
  ctx.shadowBlur = 12 + q * 2;
  ctx.strokeStyle = '#3fd0ff';
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, rink.w - 3, rink.h - 3, rr);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.save();
  roundRect(ctx, 0, 0, rink.w, rink.h, rr);
  ctx.clip();
  ctx.scale(s, s);

  // 輪の演出
  for (const r of wd.rings) {
    const k = r.t / r.life;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3 / s + 3 * (1 - k);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(k), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 落とし物
  const gum = img(cat.icons.gum);
  for (const d of wd.drops) {
    const bob = Math.sin((wd.time + d.x) * 6) * 1.5;
    const blink = d.age > 7 && Math.floor(d.age * 8) % 2 === 0 ? 0.45 : 1;
    ctx.globalAlpha = blink;
    if (d.kind === 'gum') {
      if (ready(gum)) ctx.drawImage(gum, d.x - 10, d.y - 10 + bob, 20, 20);
    } else if (d.kind === 'item' && d.ext) {
      const col = ITEM_COLOR[d.ext.kind];
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(10,14,30,0.85)';
      roundRect(ctx, d.x - 16, d.y - 16 + bob, 32, 32, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = RARITY_COLOR[d.ext.rarity];
      ctx.lineWidth = 2;
      ctx.stroke();
      const im = img(d.ext.img);
      if (ready(im)) ctx.drawImage(im, d.x - 13, d.y - 13 + bob, 26, 26);
    } else if (d.kind === 'hero' && d.hero) {
      const col = RARITY_COLOR[d.hero.rarity];
      const pulse = 1 + Math.sin(wd.time * 8) * 0.06;
      ctx.save();
      ctx.translate(d.x, d.y + bob);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = col;
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#10162e';
      roundRect(ctx, -22, -28, 44, 56, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.stroke();
      const im = img(d.hero.img);
      if (ready(im)) ctx.drawImage(im, -20, -22, 40, 40);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // エネミー
  for (const e of wd.enemies) {
    const age = wd.time - e.born;
    const pop = Math.min(1, age / 0.3);
    const size = e.r * 2.5 * easeOutBack(pop);
    const sq = e.squash;
    const sx = size * (1 + sq * 0.5);
    const sy = size * (1 - sq * 0.4);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.75, e.r * 0.9 * pop, e.r * 0.3 * pop, 0, 0, TAU);
    ctx.fill();
    const im = img(e.art.img);
    if (ready(im)) {
      ctx.save();
      ctx.translate(e.x, e.y + e.r * 0.75);
      ctx.scale(e.face, 1);
      ctx.drawImage(im, -sx / 2, -sy * 0.86, sx, sy);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, e.flash / 0.12);
        ctx.drawImage(im, -sx / 2, -sy * 0.86, sx, sy);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
    // HP（減ってから）
    if (!e.boss && e.hp < e.maxHp) {
      const w = e.r * 1.6;
      const y = e.y - e.r * 1.35;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#ff5f4f';
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  // 仲間
  for (const m of wd.mates) medallion(ctx, m.x, m.y, m.r, m.hero.img, RARITY_COLOR[m.hero.rarity], 0.9);

  // 残像
  const p = wd.puck;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 500) {
    for (const t of wd.trail) {
      const k = 1 - (wd.time - t.t) / 0.22;
      ctx.globalAlpha = k * 0.35 * Math.min(1, (sp - 500) / 900);
      ctx.fillStyle = '#9fe8ff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.r * (0.5 + k * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 磁石の範囲（強化したら見える）
  if (wd.magnet > 40) {
    ctx.strokeStyle = wd.buffOn('magnet') ? 'rgba(192,139,255,0.35)' : 'rgba(255,210,63,0.13)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + wd.magnet, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // マレット
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x + 3, p.y + 6, p.r, p.r * 0.9, 0, 0, TAU);
  ctx.fill();
  const ring = wd.buffOn('atk') ? '#ff5f4f' : wd.buffOn('rush') ? '#3fd0ff' : RARITY_COLOR[wd.hero.rarity];
  medallion(ctx, p.x, p.y, p.r, wd.hero.img, ring, 1);
  if (wd.hold.active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -wd.time * 40;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 7, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 攻撃のエフェクト（100px ごとのコマ）
  for (const f of wd.sprites) {
    const sheet = img(cat.fx[f.sheet]);
    if (!ready(sheet)) continue;
    const cols = Math.round(sheet.naturalWidth / 100);
    const total = cols * cols;
    const fr = Math.min(total - 1, Math.floor((f.t / f.dur) * total));
    ctx.drawImage(sheet, (fr % cols) * 100, Math.floor(fr / cols) * 100, 100, 100, f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
  }

  // 火花
  for (const k of wd.sparks) {
    ctx.globalAlpha = 1 - k.t / k.life;
    ctx.fillStyle = k.color;
    ctx.fillRect(k.x - k.size / 2, k.y - k.size / 2, k.size, k.size);
  }
  ctx.globalAlpha = 1;

  // ダメージの数字
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const n of wd.nums) {
    const pop = n.t < 0.12 ? 1 + (0.12 - n.t) * 4 : 1;
    ctx.globalAlpha = n.t > 0.6 ? 1 - (n.t - 0.6) / 0.3 : 1;
    ctx.font = `${Math.round(n.size * pop)}px 'DotGothic16', sans-serif`;
    const half = ctx.measureText(n.text).width / 2 + 4;
    const nx = Math.min(Math.max(n.x, half), wd.w - half); // 端で切れないように
    ctx.strokeStyle = '#0a0d1c';
    ctx.lineWidth = 4;
    ctx.strokeText(n.text, nx, n.y);
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, nx, n.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore(); // clip + scale

  // ボスの HP
  const boss = wd.enemies.find((e) => e.boss);
  if (boss) {
    const w = rink.w - 40;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, 20, 10, w, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#ff4f5e';
    roundRect(ctx, 22, 12, (w - 4) * Math.max(0, boss.hp / boss.maxHp), 20, 5);
    ctx.fill();
    ctx.font = "13px 'DotGothic16', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`BOSS  ${boss.art.name}`, 30, 22);
  }
  ctx.restore(); // translate
}

/** ヒーローの丸いメダル（マレット・仲間） */
function medallion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, url: string, ring: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, ring);
  gr.addColorStop(1, shade(ring));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#121a36';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  ctx.fill();
  const im = img(url);
  if (ready(im)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, TAU);
    ctx.clip();
    ctx.drawImage(im, x - r * 0.95, y - r * 0.95, r * 1.9, r * 1.9);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.45);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
