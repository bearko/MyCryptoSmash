// 盤面の絵（動かない部分）。render-pinball.ts が 1 回だけオフスクリーンの canvas に描かせて使い回す。
//
// 様式：古いゲームコーナーの奥の、サーカスと人形劇の匂いがする台。木とニスの盤面に、切り絵のポスターのような手描きの絵
// （テントの縞・円形の舞台・ハーレクインのひし形・トランプのスート・星・リボン）。
// ピエロの段階（0〜4）で直っていく：0 はほこり・色あせ・はがれた絵・ひび・くもの巣、4 は色が戻ってニスが光り、金の粉が舞う。
// 買っていない部品の場所には、うすい跡（日焼けしていない木の色）とねじ穴を残す（買い足したくなる空き地）。
// 球・的・フリッパーがいちばん見やすいように、盤面は暗めの中間色で、絵のコントラストは低く抑える。

import * as T from '../game/table';
import { PARTS } from '../game/parts';

const TAU = Math.PI * 2;
const W = T.TW;
const H = T.TH;

/** 決まった種からの乱数（盤面の絵はいつも同じ） */
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export interface BoardOpts {
  toys: Record<string, boolean>;
  /** ピエロの段階 0〜4 */
  tier: number;
  /** ステージの絵（読みこめていれば、まん中の丸い額に入れる） */
  bg: HTMLImageElement | null;
  /** 台の何枚目か（木の色を少し変える） */
  floor: number;
  /** 軽く描く（画質が低のとき：木目・粉を減らす） */
  lite: boolean;
}

function tablePath(g: CanvasRenderingContext2D): void {
  g.beginPath();
  T.OUTER.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, rot: number, n = 5): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i += 1) {
    const a = rot + (i / (n * 2)) * TAU - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** トランプのスート（0 ♠・1 ♥・2 ♦・3 ♣）。s は高さの半分くらい */
export function suitPath(g: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number): void {
  g.beginPath();
  if (kind === 2) {
    g.moveTo(x, y - s); g.lineTo(x + s * 0.72, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.72, y); g.closePath();
  } else if (kind === 1) {
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.25, x, y - s * 0.45);
    g.bezierCurveTo(x + s * 0.75, y - s * 1.25, x + s * 1.5, y - s * 0.1, x, y + s * 0.95);
    g.closePath();
  } else if (kind === 0) {
    g.moveTo(x, y - s);
    g.bezierCurveTo(x + s * 1.5, y + s * 0.1, x + s * 0.8, y + s * 1.0, x + s * 0.12, y + s * 0.45);
    g.lineTo(x + s * 0.4, y + s); g.lineTo(x - s * 0.4, y + s); g.lineTo(x - s * 0.12, y + s * 0.45);
    g.bezierCurveTo(x - s * 0.8, y + s * 1.0, x - s * 1.5, y + s * 0.1, x, y - s);
    g.closePath();
  } else {
    const r = s * 0.42;
    g.arc(x, y - s * 0.5, r, 0, TAU);
    g.moveTo(x - s * 0.48 + r, y + s * 0.12); g.arc(x - s * 0.48, y + s * 0.12, r, 0, TAU);
    g.moveTo(x + s * 0.48 + r, y + s * 0.12); g.arc(x + s * 0.48, y + s * 0.12, r, 0, TAU);
    g.moveTo(x - s * 0.1, y); g.lineTo(x + s * 0.1, y); g.lineTo(x + s * 0.38, y + s); g.lineTo(x - s * 0.38, y + s); g.closePath();
  }
}

// 様式の色（UI と同じ：墨・骨・血・チケット黄・呪いの紫・エンブレムの青緑）
const INK = '#0b0a10';
const BONE = '#f4efe4';
const BLOOD = '#e5163a';
const TICKET = '#ffd21f';
const CURSE = '#7b2cff';
const TEAL = '#22e5c0';

/** 木の盤面（板・木目・節） */
function paintWood(g: CanvasRenderingContext2D, o: BoardOpts, rnd: () => number): void {
  const t = o.tier / 4;
  // 板の色：段階が低いと灰色がかって暗く、高いと赤みのあるマホガニー。台が進むと色味が少し回る
  const hueBase = 20 + ((o.floor - 1) % 5) * 3;
  const sat = 16 + t * 34;
  const lum = 13 + t * 5;
  g.fillStyle = `hsl(${hueBase} ${sat}% ${lum}%)`;
  g.fillRect(0, 0, W, H);
  const PLANK = 72;
  for (let px = 0; px < W; px += PLANK) {
    const dl = (rnd() - 0.5) * 5;
    const dh = (rnd() - 0.5) * 8;
    const gr = g.createLinearGradient(px, 0, px + PLANK, 0);
    gr.addColorStop(0, `hsl(${hueBase + dh} ${sat}% ${lum + dl - 2.5}%)`);
    gr.addColorStop(0.5, `hsl(${hueBase + dh} ${sat + 4}% ${lum + dl + 2}%)`);
    gr.addColorStop(1, `hsl(${hueBase + dh} ${sat}% ${lum + dl - 1.5}%)`);
    g.fillStyle = gr;
    g.fillRect(px, 0, PLANK, H);
    // 木目：ゆるく波うつ細い線
    const lines = o.lite ? 5 : 11;
    for (let i = 0; i < lines; i += 1) {
      const x0 = px + 4 + rnd() * (PLANK - 8);
      const amp = 1.5 + rnd() * 4;
      const ph = rnd() * TAU;
      const fr = 0.004 + rnd() * 0.006;
      g.strokeStyle = rnd() < 0.7 ? `rgba(0,0,0,${0.1 + rnd() * 0.16})` : `rgba(255,214,170,${0.03 + rnd() * 0.05})`;
      g.lineWidth = 0.6 + rnd() * 1.2;
      g.beginPath();
      for (let y = 0; y <= H; y += 40) {
        const x = x0 + Math.sin(y * fr + ph) * amp;
        if (y) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    // 節
    if (rnd() < 0.7) {
      const kx = px + 14 + rnd() * (PLANK - 28);
      const ky = 60 + rnd() * (H - 120);
      for (let r = 9; r > 1; r -= 2.2) {
        g.strokeStyle = `rgba(0,0,0,${0.12 + (9 - r) * 0.02})`;
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(kx, ky, r * 0.7, r * 1.6, 0, 0, TAU);
        g.stroke();
      }
    }
    // 板の合わせ目
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(px - 0.8, 0, 1.6, H);
    g.fillStyle = 'rgba(255,220,180,0.05)';
    g.fillRect(px + 0.8, 0, 1, H);
  }
}

/** 手描きの絵（切り絵のポスター風）。別の canvas に描き、はがれを抜いてから盤面に重ねる */
function paintArt(g: CanvasRenderingContext2D, o: BoardOpts, rnd: () => number): void {
  const own = o.toys;
  const MID = W / 2;
  g.lineJoin = 'round';

  // --- 上の丸屋根：テントの天幕（縞が頂点から広がる）と、すそのスカラップ
  g.save();
  g.beginPath();
  g.rect(0, 0, W, 300);
  g.clip();
  const N = 18;
  for (let i = 0; i < N; i += 1) {
    const a0 = Math.PI * (i / N);
    const a1 = Math.PI * ((i + 1) / N);
    g.fillStyle = i % 2 ? 'rgba(229,22,58,0.42)' : 'rgba(244,239,228,0.2)';
    g.beginPath();
    g.moveTo(MID, -40);
    g.lineTo(MID + Math.cos(a0) * 900, -40 + Math.sin(a0) * 900);
    g.lineTo(MID + Math.cos(a1) * 900, -40 + Math.sin(a1) * 900);
    g.closePath();
    g.fill();
  }
  g.restore();
  // すそ：半円がならぶ飾り（黄の縁）
  for (let x = 20; x < W; x += 40) {
    g.fillStyle = (x / 40) % 2 < 1 ? 'rgba(229,22,58,0.5)' : 'rgba(244,239,228,0.26)';
    g.beginPath();
    g.arc(x, 300, 20, 0, Math.PI);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,210,31,0.55)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(x, 300, 20, 0, Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(255,210,31,0.6)';
    g.beginPath();
    g.arc(x, 322, 2.4, 0, TAU);
    g.fill();
  }

  // --- 円形の舞台（まん中）：おがくずの輪・金のふち・星
  const [gx, gy] = T.GATE;
  g.fillStyle = 'rgba(11,10,16,0.35)';
  g.beginPath();
  g.arc(gx, gy, 118, 0, TAU);
  g.fill();
  for (let i = 0; i < 24; i += 1) {
    g.fillStyle = i % 2 ? 'rgba(123,44,255,0.3)' : 'rgba(255,210,31,0.2)';
    g.beginPath();
    g.moveTo(gx, gy);
    g.arc(gx, gy, 110, (i / 24) * TAU, ((i + 1) / 24) * TAU);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,210,31,0.6)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(gx, gy, 112, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(11,10,16,0.7)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(gx, gy, 116, 0, TAU);
  g.stroke();
  g.beginPath();
  g.arc(gx, gy, 106, 0, TAU);
  g.stroke();
  star(g, gx, gy, 46, 20, 0);
  g.fillStyle = 'rgba(255,210,31,0.3)';
  g.fill();
  g.strokeStyle = 'rgba(11,10,16,0.6)';
  g.lineWidth = 2;
  g.stroke();

  // --- ハーレクインのひし形の帯（まん中の下）
  g.save();
  g.beginPath();
  g.rect(64, 600, W - 128, 210);
  g.clip();
  const DW = 46;
  const DH = 70;
  for (let row = 0; row < 4; row += 1) {
    for (let cx = 0; cx < 17; cx += 1) {
      const x = 64 + cx * DW + (row % 2 ? DW / 2 : 0);
      const y = 600 + row * (DH / 2) + DH / 2;
      const k = (cx + row * 3) % 3;
      g.fillStyle = k === 0 ? 'rgba(123,44,255,0.26)' : k === 1 ? 'rgba(11,10,16,0.3)' : 'rgba(229,22,58,0.2)';
      g.beginPath();
      g.moveTo(x, y - DH / 2); g.lineTo(x + DW / 2, y); g.lineTo(x, y + DH / 2); g.lineTo(x - DW / 2, y);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
  for (const y of [600, 810]) {
    g.fillStyle = 'rgba(255,210,31,0.45)';
    g.fillRect(64, y - 2, W - 128, 4);
    g.fillStyle = 'rgba(11,10,16,0.6)';
    g.fillRect(64, y - 4, W - 128, 1.5);
    g.fillRect(64, y + 2.5, W - 128, 1.5);
  }

  // --- ステージの絵：丸い額（のぞき窓）に入れる
  const px = MID;
  const py = 960;
  const pr = 84;
  g.fillStyle = 'rgba(11,10,16,0.55)';
  g.beginPath();
  g.arc(px, py, pr + 10, 0, TAU);
  g.fill();
  if (o.bg) {
    g.save();
    g.beginPath();
    g.arc(px, py, pr, 0, TAU);
    g.clip();
    const k = Math.max((pr * 2) / o.bg.naturalWidth, (pr * 2) / o.bg.naturalHeight) * 1.5;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.62;
    g.drawImage(o.bg, px - (o.bg.naturalWidth * k) / 2, py - (o.bg.naturalHeight * k) / 2, o.bg.naturalWidth * k, o.bg.naturalHeight * k);
    g.globalAlpha = 1;
    // 古い写真の色（茶色の膜）
    g.fillStyle = `rgba(70,40,20,${0.42 - o.tier * 0.07})`;
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    g.restore();
  }
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * TAU;
    g.fillStyle = i % 2 ? 'rgba(255,210,31,0.7)' : 'rgba(229,22,58,0.7)';
    g.beginPath();
    g.arc(px + Math.cos(a) * (pr + 5), py + Math.sin(a) * (pr + 5), 3.2, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,210,31,0.65)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(px, py, pr, 0, TAU);
  g.stroke();

  // --- トランプのスート（大きく、うすく）
  const suits: [number, number, number, number, string][] = [
    [0, 150, 480, 40, 'rgba(11,10,16,0.5)'], [1, 570, 480, 40, 'rgba(229,22,58,0.5)'],
    [2, 132, 900, 44, 'rgba(229,22,58,0.45)'], [3, 588, 900, 42, 'rgba(11,10,16,0.5)'],
  ];
  for (const [kind, x, y, s, c] of suits) {
    suitPath(g, kind, x + 3, y + 4, s);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fill();
    suitPath(g, kind, x, y, s);
    g.fillStyle = c;
    g.fill();
    g.strokeStyle = 'rgba(244,239,228,0.4)';
    g.lineWidth = 2;
    g.stroke();
  }

  // --- 星のつらなり（左右の坂にそって）
  for (const side of [1, -1]) {
    for (let i = 0; i < 6; i += 1) {
      const k = i / 5;
      const x = side === 1 ? 26 + k * 120 : W - 26 - k * 120;
      const y = 880 + k * 150;
      star(g, x + (side === 1 ? 34 : -34), y - 34, 9 - k * 2, 3.8 - k, rnd() * 2);
      g.fillStyle = i % 2 ? 'rgba(255,210,31,0.5)' : 'rgba(34,229,192,0.4)';
      g.fill();
    }
  }

  // --- 下のエプロン：排水口から広がるテントの縞
  g.save();
  g.beginPath();
  g.moveTo(170, 1050); g.lineTo(274, 1203); g.lineTo(274, H + 50); g.lineTo(170, H + 50);
  g.closePath();
  g.moveTo(550, 1050); g.lineTo(446, 1203); g.lineTo(446, H + 50); g.lineTo(550, H + 50);
  g.closePath();
  g.clip();
  for (let i = -12; i < 12; i += 1) {
    g.fillStyle = (i + 12) % 2 ? 'rgba(229,22,58,0.5)' : 'rgba(244,239,228,0.28)';
    g.beginPath();
    g.moveTo(MID, H + 120);
    g.lineTo(MID + i * 46, 1000);
    g.lineTo(MID + (i + 1) * 46, 1000);
    g.closePath();
    g.fill();
  }
  g.restore();

  // --- フリッパーの下の扇（血の色の半円と、墨の縁）
  for (const f of T.FLIPPERS) {
    g.fillStyle = 'rgba(229,22,58,0.22)';
    g.beginPath();
    g.moveTo(f.px, f.py);
    g.arc(f.px, f.py, 78, f.side === 1 ? -0.9 : Math.PI - 0.55, f.side === 1 ? 0.55 : Math.PI + 0.9);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,210,31,0.3)';
    g.lineWidth = 1.5;
    g.setLineDash([3, 5]);
    g.beginPath();
    g.arc(f.px, f.py, 78, f.side === 1 ? -0.9 : Math.PI - 0.55, f.side === 1 ? 0.55 : Math.PI + 0.9);
    g.stroke();
    g.setLineDash([]);
  }

  // --- 打ち出しの通路：墨の地と、黄の目盛り
  g.fillStyle = 'rgba(11,10,16,0.5)';
  g.fillRect(T.SHOOT_X0, T.SHOOT_Y0, W - T.SHOOT_X0, T.SHOOT_FLOOR - T.SHOOT_Y0);
  for (let y = T.SHOOT_FLOOR - 20; y > T.SHOOT_Y0 + 10; y -= 26) {
    g.fillStyle = 'rgba(255,210,31,0.28)';
    g.fillRect(T.SHOOT_X0 + 4, y, 8, 2);
    g.fillRect(W - 12, y, 8, 2);
  }

  // --- 買った部品の下の絵
  if (own.bumper) {
    for (const [cx, cy] of [[260, 353], [460, 353]] as T.P[]) {
      g.fillStyle = 'rgba(11,10,16,0.4)';
      g.beginPath();
      g.arc(cx, cy, 86, 0, TAU);
      g.fill();
      for (let i = 0; i < 12; i += 1) {
        g.fillStyle = i % 2 ? 'rgba(229,22,58,0.36)' : 'rgba(244,239,228,0.18)';
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, 82, (i / 12) * TAU, ((i + 1) / 12) * TAU);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = 'rgba(255,210,31,0.55)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, 84, 0, TAU);
      g.stroke();
    }
  }
  if (own.loop) {
    for (const x of [0, T.LOOP_X[1]]) {
      g.fillStyle = 'rgba(34,229,192,0.12)';
      g.fillRect(x, 260, 64, 520);
      for (let y = 290; y < 770; y += 44) {
        g.fillStyle = 'rgba(34,229,192,0.3)';
        g.beginPath();
        g.moveTo(x + 32, y - 9); g.lineTo(x + 44, y + 7); g.lineTo(x + 32, y + 2); g.lineTo(x + 20, y + 7);
        g.closePath();
        g.fill();
      }
    }
  }

  // --- リボンの看板（台のロゴ）
  const [lx, ly] = T.LOGO;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.moveTo(lx - 78, ly - 20 + 4); g.lineTo(lx + 78, ly - 26 + 4); g.lineTo(lx + 70, ly + 4); g.lineTo(lx + 80, ly + 24 + 4); g.lineTo(lx - 76, ly + 30 + 4); g.lineTo(lx - 68, ly + 6 + 4);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(11,10,16,0.82)';
  g.beginPath();
  g.moveTo(lx - 78, ly - 20); g.lineTo(lx + 78, ly - 26); g.lineTo(lx + 70, ly); g.lineTo(lx + 80, ly + 24); g.lineTo(lx - 76, ly + 30); g.lineTo(lx - 68, ly + 6);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,210,31,0.7)';
  g.lineWidth = 2;
  g.stroke();
  g.save();
  g.translate(lx, ly);
  g.rotate(-0.04);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = "13px 'Bangers', 'Dela Gothic One', sans-serif";
  g.fillStyle = 'rgba(244,239,228,0.8)';
  g.fillText('MY CRYPTO', 0, -13);
  g.font = "30px 'Bangers', 'Dela Gothic One', sans-serif";
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.strokeText('SMASH', 0, 9);
  g.fillStyle = BLOOD;
  g.fillText('SMASH', 2, 11);
  g.fillStyle = TICKET;
  g.fillText('SMASH', 0, 9);
  g.restore();
}

/** はがれ（絵の層から抜く）：ぎざぎざの小さな島をたくさん */
function peel(g: CanvasRenderingContext2D, amount: number, rnd: () => number): void {
  if (amount <= 0) return;
  g.globalCompositeOperation = 'destination-out';
  const n = Math.round(150 * amount);
  for (let i = 0; i < n; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 4 + rnd() * rnd() * 46 * amount;
    g.globalAlpha = 0.35 + rnd() * 0.65;
    g.beginPath();
    const m = 7 + Math.floor(rnd() * 5);
    for (let k = 0; k < m; k += 1) {
      const a = (k / m) * TAU;
      const rr = r * (0.45 + rnd() * 0.75);
      const qx = x + Math.cos(a) * rr * 1.4;
      const qy = y + Math.sin(a) * rr;
      if (k) g.lineTo(qx, qy); else g.moveTo(qx, qy);
    }
    g.closePath();
    g.fill();
  }
  // 球がよく通る道は、こすれて絵がうすい
  g.globalAlpha = 0.3 * amount;
  g.lineCap = 'round';
  g.lineWidth = 30;
  g.beginPath();
  g.moveTo(300, 1180); g.quadraticCurveTo(200, 800, 120, 300);
  g.moveTo(420, 1180); g.quadraticCurveTo(520, 800, 600, 300);
  g.moveTo(360, 1150); g.lineTo(360, 560);
  g.stroke();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineCap = 'butt';
}

/** ひび（墨の折れ線と、片側の明るい縁） */
function crack(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, rnd: () => number, depth = 0): void {
  let cx = x;
  let cy = y;
  let a = ang;
  const pts: T.P[] = [[cx, cy]];
  const steps = Math.max(3, Math.round(len / 16));
  for (let i = 0; i < steps; i += 1) {
    a += (rnd() - 0.5) * 0.9;
    const l = 10 + rnd() * 14;
    cx += Math.cos(a) * l;
    cy += Math.sin(a) * l;
    pts.push([cx, cy]);
    if (depth < 2 && rnd() < 0.22) crack(g, cx, cy, len * 0.4, a + (rnd() < 0.5 ? 0.8 : -0.8), rnd, depth + 1);
  }
  const path = (dx: number, dy: number) => {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy)));
  };
  path(0.8, 0.8);
  g.strokeStyle = 'rgba(255,225,190,0.14)';
  g.lineWidth = 1.2 - depth * 0.3;
  g.stroke();
  path(0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 1.5 - depth * 0.4;
  g.stroke();
}

/** 古さ（色あせ・しみ・ひび・ひっかき傷・ほこり・くもの巣）。w は 1（段階 0）〜 0（段階 4） */
function paintWear(g: CanvasRenderingContext2D, w: number, rnd: () => number, lite: boolean): void {
  if (w <= 0) return;
  // 色あせ：灰色がかった茶の膜
  g.fillStyle = `rgba(64,58,52,${0.34 * w})`;
  g.fillRect(0, 0, W, H);
  // しみ
  const stains = Math.round(16 * w);
  for (let i = 0; i < stains; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 30 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    gr.addColorStop(0, `rgba(10,8,6,${0.1 + rnd() * 0.2 * w})`);
    gr.addColorStop(0.8, `rgba(10,8,6,${0.06 * w})`);
    gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ひっかき傷
  const scratches = Math.round((lite ? 40 : 110) * w);
  g.lineCap = 'round';
  for (let i = 0; i < scratches; i += 1) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
    const l = 8 + rnd() * 50;
    g.strokeStyle = `rgba(255,236,210,${0.04 + rnd() * 0.1})`;
    g.lineWidth = 0.5 + rnd() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.lineCap = 'butt';
  // ひび
  const cracks: [number, number, number, number][] = [[96, 700, 190, -0.5], [600, 1010, 150, -2.2], [430, 190, 140, 1.9], [250, 1010, 110, -1.0]];
  const nc = w > 0.9 ? 4 : w > 0.6 ? 2 : w > 0.3 ? 1 : 0;
  for (let i = 0; i < nc; i += 1) crack(g, cracks[i][0], cracks[i][1], cracks[i][2], cracks[i][3], rnd);
  // ほこり（こまかい点）
  const dust = Math.round((lite ? 500 : 1500) * w);
  for (let i = 0; i < dust; i += 1) {
    g.globalAlpha = 0.05 + rnd() * 0.16;
    g.fillStyle = rnd() < 0.6 ? '#d8cdb8' : '#000000';
    const s = rnd() < 0.85 ? 1 : 2;
    g.fillRect(rnd() * W, rnd() * H, s, s);
  }
  g.globalAlpha = 1;
  // くもの巣（左上のすみ。いちばん古いときだけ）
  if (w > 0.6) {
    const ox = 46;
    const oy = 118;
    g.strokeStyle = `rgba(230,225,215,${0.28 * w})`;
    g.lineWidth = 0.8;
    const rays = 7;
    for (let i = 0; i < rays; i += 1) {
      const a = -0.25 + (i / (rays - 1)) * 1.5;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a) * 120, oy + Math.sin(a) * 120);
      g.stroke();
    }
    for (let r = 24; r <= 110; r += 20) {
      g.beginPath();
      for (let i = 0; i < rays; i += 1) {
        const a = -0.25 + (i / (rays - 1)) * 1.5;
        const x = ox + Math.cos(a) * r;
        const y = oy + Math.sin(a) * r;
        if (!i) g.moveTo(x, y);
        else {
          const am = a - 0.75 / (rays - 1);
          g.quadraticCurveTo(ox + Math.cos(am) * r * 0.86, oy + Math.sin(am) * r * 0.86, x, y);
        }
      }
      g.stroke();
    }
  }
}

/** 買っていない部品の跡：日焼けしていない木の色の丸と、ねじ穴 */
function paintGhosts(g: CanvasRenderingContext2D, o: BoardOpts, rnd: () => number): void {
  const seen = new Set<string>();
  for (const p of PARTS) {
    if (!p.toy || o.toys[p.toy] || seen.has(p.toy)) continue;
    seen.add(p.toy);
    if (p.x < 20 || p.x > W - 20 || p.y < 20 || p.y > H - 20) continue;
    const r = Math.max(12, Math.min(30, p.r * 0.5));
    // 部品が付いていた所は、日に焼けていない（まわりより濃い）
    g.fillStyle = 'rgba(28,14,8,0.24)';
    g.beginPath();
    g.arc(p.x, p.y, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(244,239,228,0.13)';
    g.lineWidth = 1.2;
    g.setLineDash([4, 5]);
    g.beginPath();
    g.arc(p.x, p.y, r + 2, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    // ねじ穴（3 つ。影と、ふちの光）
    const a0 = rnd() * TAU;
    for (let i = 0; i < 3; i += 1) {
      const a = a0 + (i / 3) * TAU;
      const x = p.x + Math.cos(a) * r * 0.72;
      const y = p.y + Math.sin(a) * r * 0.72;
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.arc(x, y, 2.3, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,225,190,0.22)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(x + 0.4, y + 0.5, 2.6, 0.2, Math.PI * 0.9);
      g.stroke();
    }
  }
}

/** 台の外（キャビネットの中）：暗いビロードの幕 */
function paintCurtain(g: CanvasRenderingContext2D, o: BoardOpts): void {
  const t = o.tier / 4;
  g.fillStyle = `hsl(348 ${28 + t * 30}% ${6 + t * 3}%)`;
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 28) {
    const gr = g.createLinearGradient(x, 0, x + 28, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(0.5, `rgba(229,22,58,${0.05 + t * 0.09})`);
    gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 28, H);
  }
}

/** 盤面を描く。g は台のユニットに合わせた変換が済んでいること。wells は、盤面に埋めこむランプのくぼみを描く関数 */
export function paintBoard(g: CanvasRenderingContext2D, o: BoardOpts, wells: (g: CanvasRenderingContext2D) => void, scale: number): void {
  const tier = Math.max(0, Math.min(4, o.tier));
  const w = [1, 0.7, 0.42, 0.18, 0][tier];
  const rnd = rng(1777 + (o.floor % 7) * 31);
  paintCurtain(g, o);
  g.save();
  tablePath(g);
  g.closePath();
  g.clip();
  paintWood(g, o, rnd);

  // 絵の層：別の canvas に描いて、はがれを抜く
  const layer = document.createElement('canvas');
  layer.width = Math.round(W * scale);
  layer.height = Math.round(H * scale);
  const lg = layer.getContext('2d');
  if (lg) {
    lg.setTransform(scale, 0, 0, scale, 0, 0);
    paintArt(lg, { ...o, tier }, rng(4242));
    peel(lg, w, rng(99));
    g.save();
    // 絵は段階が低いほどうすい（色あせ）。高くても、球や的より目立たない濃さで止める
    g.globalAlpha = 0.5 + 0.38 * (1 - w);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(layer, 0, 0);
    g.restore();
  }
  paintGhosts(g, { ...o, tier }, rng(555));
  paintWear(g, w, rng(31337), o.lite);

  // ニスのつや：斜めの明るい帯（段階が高いほどはっきり）
  g.globalCompositeOperation = 'lighter';
  for (const [x0, wd, a] of [[-200, 150, 0.035], [80, 60, 0.02], [330, 220, 0.03], [700, 90, 0.025]] as [number, number, number][]) {
    const gr = g.createLinearGradient(x0, 0, x0 + wd, 0);
    gr.addColorStop(0, 'rgba(255,235,200,0)');
    gr.addColorStop(0.5, `rgba(255,235,200,${a * (0.5 + tier * 0.4)})`);
    gr.addColorStop(1, 'rgba(255,235,200,0)');
    g.save();
    g.transform(1, 0, -0.45, 1, 0, 0);
    g.fillStyle = gr;
    g.fillRect(x0, 0, wd + 600, H);
    g.restore();
  }
  // 金の粉（段階 3 から）
  if (tier >= 3 && !o.lite) {
    const r2 = rng(808);
    for (let i = 0; i < (tier - 2) * 700; i += 1) {
      g.globalAlpha = 0.1 + r2() * 0.4;
      g.fillStyle = r2() < 0.6 ? TICKET : r2() < 0.5 ? BONE : TEAL;
      const s = r2() < 0.9 ? 0.9 : 1.7;
      g.fillRect(r2() * W, r2() * H, s, s);
    }
    g.globalAlpha = 1;
  }
  g.globalCompositeOperation = 'source-over';

  // ふちを暗く（まん中が明るい：照明が上から当たっている）
  const vg = g.createRadialGradient(W / 2, H * 0.48, 240, W / 2, H * 0.5, 860);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,4,${0.62 - tier * 0.05})`);
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // 外のふちの内側の落ち影（ふちの高さ）
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 22;
  g.lineJoin = 'round';
  g.save();
  g.translate(4, 7);
  tablePath(g);
  g.stroke();
  g.restore();

  wells(g);
  g.restore();
  void CURSE;
}
