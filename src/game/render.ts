// フィールドの描画（canvas）。World の状態を読むだけで、書きかえない。

import { cat, ITEM_COLOR, RARITY_COLOR } from '../core/catalog';
import { img, ready } from '../core/util';
import { MAX_PULL, MIN_PULL, type World } from './world';
import { ELEM_COLOR, WEAK_TO, type Elem } from './elements';
import { FLOOR_GROW } from './economy';

/** その色の攻撃を出す操作（敵の頭の上に、効く操作を出す） */
const ACTION: Record<Elem, string> = { red: '傾', blue: '振', green: '引' };

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

export function draw(ctx: CanvasRenderingContext2D, wd: World, rink: Rink, cw: number, ch: number, bgUrl: string, prevBgUrl: string, dpr: number): void {
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

  // テーブル（四角か楕円。設定で切りかえ）
  const rr = 18;
  const oval = wd.oval;
  const shape = (x: number, y: number, w: number, h: number, r: number) => {
    if (oval) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, TAU); }
    else roundRect(ctx, x, y, w, h, r);
  };
  ctx.fillStyle = 'rgba(8,16,38,0.62)';
  shape(0, 0, rink.w, rink.h, rr);
  ctx.fill();
  const pat = holePattern(ctx, 18 * s);
  if (pat) { ctx.fillStyle = pat; shape(0, 0, rink.w, rink.h, rr); ctx.fill(); }
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
  // （影ぼかしは重いので、太い半透明の線を重ねて光らせる）
  shape(1.5, 1.5, rink.w - 3, rink.h - 3, rr);
  ctx.strokeStyle = 'rgba(63,208,255,0.25)';
  ctx.lineWidth = 9 + q;
  ctx.stroke();
  ctx.strokeStyle = '#3fd0ff';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  shape(0, 0, rink.w, rink.h, rr);
  ctx.clip();
  // 階の切りかえ：いまの階が一回り縮み、まわりに新しい階が広がる（ピラミッドを下りていく）
  const zk = wd.phase === 'zoom' ? easeOut(Math.min(1, wd.zoomT / wd.zoomDur)) : 1;
  const vz = FLOOR_GROW + (1 - FLOOR_GROW) * zk;
  if (wd.phase === 'zoom') {
    const old = img(prevBgUrl);
    const ow = (rink.w * vz) / FLOOR_GROW;
    const oh = (rink.h * vz) / FLOOR_GROW;
    if (ready(old)) {
      ctx.globalAlpha = (1 - zk) * 0.85;
      const k = Math.max(ow / old.naturalWidth, oh / old.naturalHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(old, (rink.w - old.naturalWidth * k) / 2, (rink.h - old.naturalHeight * k) / 2, old.naturalWidth * k, old.naturalHeight * k);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
    }
  }
  // ピラミッドの段（上の階のふち）
  for (let i = 1; i <= 6; i += 1) {
    const f = vz / FLOOR_GROW ** i;
    ctx.strokeStyle = `rgba(140,220,255,${(0.16 / i).toFixed(3)})`;
    ctx.lineWidth = i === 1 ? 2 : 1;
    shape((rink.w * (1 - f)) / 2, (rink.h * (1 - f)) / 2, rink.w * f, rink.h * f, rr * f);
    ctx.stroke();
  }
  ctx.translate(rink.w / 2, rink.h / 2);
  ctx.scale(vz, vz);
  ctx.translate(-rink.w / 2, -rink.h / 2);
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

  // 青の波
  for (const w of wd.waves) {
    if (w.t < 0) continue;
    const k = Math.min(1, w.t / w.life);
    const r = w.r1 * (1 - (1 - k) ** 3);
    ctx.globalAlpha = 0.4 * (1 - k);
    ctx.fillStyle = ELEM_COLOR.blue;
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = (1 - k * 0.6) * 0.35;
    ctx.strokeStyle = ELEM_COLOR.blue;
    ctx.lineWidth = 16 * (1 - k) + 6;
    ctx.stroke();
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.lineWidth = 6 * (1 - k) + 2;
    ctx.stroke();
    ctx.strokeStyle = '#e6f4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 落とし物
  const gum = img(cat.icons.gum);
  const dz = Math.max(0.45, Math.sqrt(wd.z));
  for (const d of wd.drops) {
    const bob = Math.sin((wd.time + d.x) * 6) * 1.5;
    const blink = d.age > 7 && Math.floor(d.age * 8) % 2 === 0 ? 0.45 : 1;
    ctx.globalAlpha = blink;
    if (d.kind === 'gum') {
      if (ready(gum)) ctx.drawImage(gum, d.x - 10 * dz, d.y - 10 * dz + bob, 20 * dz, 20 * dz);
    } else if (d.kind === 'item' && d.ext) {
      const col = ITEM_COLOR[d.ext.kind];
      ctx.fillStyle = 'rgba(10,14,30,0.85)';
      roundRect(ctx, d.x - 16, d.y - 16 + bob, 32, 32, 7);
      ctx.fill();
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
      ctx.fillStyle = '#10162e';
      roundRect(ctx, -22, -28, 44, 56, 8);
      ctx.fill();
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
    // 足もとの色の輪（敵の色）
    const col = ELEM_COLOR[e.elem];
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.75, e.r * 0.9 * pop, e.r * 0.3 * pop, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.75, e.r * 1.05 * pop, e.r * 0.38 * pop, 0, 0, TAU);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.stroke();
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
    // HP（減ってから）と、効く操作のしるし
    const top = e.y - e.r * 1.35;
    if (!e.boss && e.hp < e.maxHp) {
      const w = e.r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2 - 1, top - 1, w + 2, 5);
      ctx.fillStyle = col;
      ctx.fillRect(e.x - w / 2, top, w * Math.max(0, e.hp / e.maxHp), 3);
    }
    if (pop >= 1) weakBadge(ctx, e.x - e.r * 0.95, top - 2, e.boss ? 12 : 9.5, e.elem);
  }

  // 仲間
  for (const m of wd.mates) medallion(ctx, m.x, m.y, m.r, m.hero.img, RARITY_COLOR[m.hero.rarity], 0.9);

  // 残像
  const p = wd.puck;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 500 && wd.trail.length > 1) {
    // 尾を引く（速いほど濃く）
    const strength = Math.min(1, (sp - 500) / 1500);
    ctx.lineCap = 'round';
    for (let i = 1; i < wd.trail.length; i += 1) {
      const a = wd.trail[i - 1];
      const b = wd.trail[i];
      const k = 1 - (wd.time - b.t) / 0.22;
      ctx.globalAlpha = Math.max(0, k) * 0.45 * strength;
      ctx.strokeStyle = wd.buffOn('rush') ? '#3fd0ff' : '#cdf4ff';
      ctx.lineWidth = p.r * 2 * Math.max(0.15, k);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
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
  const hugePuck = p.r * 2 >= Math.min(wd.w, wd.h) * 1.1;
  if (!hugePuck) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 6, p.r, p.r * 0.9, 0, 0, TAU);
    ctx.fill();
  }
  // いまの攻撃の色（赤＝傾き・青＝振り・緑＝はじき）
  const ac = wd.hold.active ? ELEM_COLOR.green : ELEM_COLOR[wd.attack];
  ctx.strokeStyle = ac;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 2, 0, TAU);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.stroke();
  if (p.r * 2 < Math.min(wd.w, wd.h) * 1.1) {
    medallion(ctx, p.x, p.y, p.r, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 1);
  } else {
    // フィールドより大きいマレット：画面ごとマレットの中。色を薄くかぶせ、まん中にヒーローを出す
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, wd.w, wd.h);
    const hr = Math.min(wd.w, wd.h) * 0.3;
    medallion(ctx, wd.w / 2, wd.h / 2, hr, wd.hero.img, RARITY_COLOR[wd.hero.rarity], 0.28);
  }
  // 小さくなったマレットも見失わないように、まわりに目じるしの輪を出す（画面で 14px 以上）
  const minR = 14 / (s * vz);
  if (!hugePuck && p.r < minR) {
    const pulse = 1 + Math.sin(wd.time * 7) * 0.08;
    ctx.strokeStyle = ac;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2 / s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, minR * pulse, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (wd.hold.active) aimGuide(ctx, wd);

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
    ctx.fillStyle = ELEM_COLOR[boss.elem];
    roundRect(ctx, 22, 12, (w - 4) * Math.max(0, boss.hp / boss.maxHp), 20, 5);
    ctx.fill();
    ctx.font = "13px 'DotGothic16', sans-serif";
    ctx.textAlign = 'left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(`BOSS  ${boss.art.name}`, 30, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(`BOSS  ${boss.art.name}`, 30, 22);
    ctx.textAlign = 'right';
    const weak = WEAK_TO[boss.elem];
    ctx.strokeText(`弱点 ${ACTION[weak]}`, 14 + w, 22);
    ctx.fillStyle = ELEM_COLOR[weak];
    ctx.fillText(`弱点 ${ACTION[weak]}`, 14 + w, 22);
  }
  // 連続ヒット
  if (wd.combo >= 3) {
    const left = Math.max(0, wd.comboT - wd.time) / 1.4;
    const y = boss ? 58 : 34;
    const pop = 1 + Math.min(0.45, Math.max(0, 0.15 - (1.4 - (wd.comboT - wd.time))) * 3);
    ctx.save();
    ctx.translate(rink.w / 2, y);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.font = `${wd.combo >= 20 ? 40 : wd.combo >= 10 ? 34 : 30}px 'Bangers', 'Dela Gothic One', sans-serif`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#0a0d1c';
    const txt = `${wd.combo} COMBO`;
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = wd.combo >= 20 ? `hsl(${(wd.time * 360) % 360} 100% 62%)` : wd.combo >= 10 ? '#ffd23f' : '#ffffff';
    ctx.fillText(txt, 0, 0);
    ctx.font = "12px 'DotGothic16', sans-serif";
    ctx.lineWidth = 4;
    const sub = `GUM ×${wd.comboMul.toFixed(2)}`;
    ctx.strokeText(sub, 0, 24);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(sub, 0, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-40, 32, 80 * left, 3);
    ctx.restore();
  }
  // 階の切りかえ中は、新しい階の番号を大きく
  if (wd.phase === 'zoom') {
    const a = zk < 0.7 ? 1 : 1 - (zk - 0.7) / 0.3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(rink.w / 2, rink.h * 0.42);
    ctx.scale(1.4 - zk * 0.4, 1.4 - zk * 0.4);
    ctx.textAlign = 'center';
    ctx.font = "64px 'Bangers', 'Dela Gothic One', sans-serif";
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a0d1c';
    ctx.strokeText(`FLOOR ${wd.floor}`, 0, 0);
    ctx.fillStyle = wd.floor % 10 === 0 ? '#ff4f5e' : '#ffe14d';
    ctx.fillText(`FLOOR ${wd.floor}`, 0, 0);
    ctx.restore();
  }
  // 引いている間は、ふちを暗くしてスローモーションを見せる
  if (wd.hold.active) {
    const v = ctx.createRadialGradient(rink.w / 2, rink.h / 2, rink.w * 0.4, rink.w / 2, rink.h / 2, rink.h * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,10,30,0.45)');
    ctx.fillStyle = v;
    shape(0, 0, rink.w, rink.h, rr);
    ctx.fill();
  }
  ctx.restore(); // translate
}

/** 引っぱっている間の表示：ゴム・強さの輪・飛ぶ道すじ（壁で 2 回まで跳ね返る） */
function aimGuide(ctx: CanvasRenderingContext2D, wd: World): void {
  const p = wd.puck;
  const { px, py } = wd.hold;
  const len = Math.hypot(px, py);
  const k = wd.pullPower;
  // 強さの輪
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
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
  // ゴム（引いた向きに伸びる）
  const pl = Math.min(len, MAX_PULL) * 0.9;
  const gx = p.x - ux * (p.r + pl);
  const gy = p.y - uy * (p.r + pl);
  ctx.strokeStyle = k >= 1 ? 'rgba(255,210,63,0.9)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3 - k * 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - uy * p.r * 0.8, p.y + ux * p.r * 0.8);
  ctx.lineTo(gx, gy);
  ctx.lineTo(p.x + uy * p.r * 0.8, p.y - ux * p.r * 0.8);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(gx, gy, 5, 0, TAU);
  ctx.fill();
  // 道すじ
  let x = p.x;
  let y = p.y;
  let dx = ux;
  let dy = uy;
  let remain = (140 + k * 560) * (wd.st.guide ? 1.5 : 1);
  const total = remain;
  const r = p.r;
  let bounces = 0;
  const dots: [number, number, number][] = [];
  let acc = 0;
  const maxBounce = wd.st.guide ? 4 : 2;
  while (remain > 0 && bounces <= maxBounce) {
    const step = 4;
    x += dx * step;
    y += dy * step;
    remain -= step;
    acc += step;
    if (wd.oval) {
      // 楕円のふちで、ふちの向きに合わせて跳ね返る
      const a = wd.w / 2 - r;
      const c = wd.h / 2 - r;
      const ex = x - wd.w / 2;
      const ey = y - wd.h / 2;
      const q = (ex / a) ** 2 + (ey / c) ** 2;
      if (q > 1 && a > 1 && c > 1) {
        const f = 1 / Math.sqrt(q);
        x = wd.w / 2 + ex * f;
        y = wd.h / 2 + ey * f;
        let nx = (ex * f) / (a * a);
        let ny = (ey * f) / (c * c);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const vn = dx * nx + dy * ny;
        if (vn > 0) { dx -= 2 * vn * nx; dy -= 2 * vn * ny; bounces += 1; }
      }
    } else {
      if (x < r || x > wd.w - r) { dx = -dx; x = clamp(x, r, wd.w - r); bounces += 1; }
      if (y < r || y > wd.h - r) { dy = -dy; y = clamp(y, r, wd.h - r); bounces += 1; }
    }
    if (acc >= 16) { acc = 0; dots.push([x, y, remain / total]); }
  }
  for (const [dxp, dyp, a] of dots) {
    ctx.globalAlpha = 0.2 + a * 0.8;
    ctx.fillStyle = k >= 1 ? '#ffd23f' : '#ffffff';
    ctx.beginPath();
    ctx.arc(dxp, dyp, 2 + a * 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 敵の頭の上の小さな丸：効く攻撃の色と、その操作の 1 文字 */
function weakBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, enemy: Elem): void {
  const w = WEAK_TO[enemy];
  ctx.fillStyle = '#0a0d1c';
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = ELEM_COLOR[w];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0d1c';
  ctx.font = `${Math.round(r * 1.35)}px 'DotGothic16', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ACTION[w], x, y + 0.5);
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

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
