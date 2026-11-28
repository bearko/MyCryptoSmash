// ピンボールの台の演出（当たりの手ごたえと見せ場）。PinballWorld の状態を読むだけで、遊びは変えない。
//
// しくみ：台ごとに演出の状態を 1 つ持つ（ショップの見本の台は別の状態）。毎コマ fxStep が台を見回って、
//   ・球の速さが急に変わった＝ぶつかった → 火花・閃光・ほこり・つぶれ・ゆれ・衝撃波
//   ・バンパー・三角のばね・フリッパー・壁の光りはじめ → その部品らしい粒
//   ・world.fxq（当たった・倒した。攻撃の色つき）→ 色ごとに形の違う粒（赤＝●・青＝◇・緑＝▲）
//   ・大当たり・マルチボール・ZONE・ボス・のこり 5 秒・TIME UP → 台全体の見せ場
// を粒子（particles.ts）と、後がけ（post.ts）に渡す数字に変える。
// ヒットストップ（world.freeze）の間も粒は動く（止まるのは遊びの時間だけ。docs/GAME_DESIGN.md「手ざわりの方針」）。

import * as T from '../game/table';
import { PARTS } from '../game/parts';
import type { PinballWorld } from '../game/pinball';
import { flipperTip } from '../game/pinball';
import { ELEM_COLOR } from '../game/elements';
import { PK, Particles } from './particles';
import { calm, quality } from './quality';
import { emitHit } from './attack';

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

interface Track {
  vx: number; vy: number; x: number; y: number;
  /** つぶれ：はじまった時刻（演出の時計）・向き・量 */
  sqT: number; nx: number; ny: number; amt: number;
  lastHit: number;
  /** 残像：少し前の位置（輪になった配列） */
  hx: Float32Array; hy: Float32Array; hi: number; hn: number;
}
export interface Shock { x: number; y: number; t: number; p: number }
export interface Arc { i: number; t: number; a0: number; a1: number; hit: boolean }
export interface Install { id: string; x: number; y: number; r: number; t: number; fired: boolean }

export interface TableFx {
  parts: Particles;
  /** 演出の時計（本当の時間で進む。ヒットストップや打ち出し待ちでも止まらない） */
  clock: number;
  last: number;
  wdTime: number;
  runT: number;
  tracks: WeakMap<object, Track>;
  segFlash: Float32Array;
  bumpFlash: Float32Array;
  flipFlash: Float32Array;
  flipUp: Uint8Array;
  arcs: Arc[];
  shocks: Shock[];
  /** ゆれ：ばねで戻る向きつきの押し＋細かいふるえ（px） */
  kx: number; ky: number; kvx: number; kvy: number; sx: number; sy: number;
  showT: number;
  dispT: number;
  multiballs: number;
  zone: boolean;
  boss: boolean;
  /** 見せ場の強さ（0〜1。少しずつ消える） */
  flash: number;
  flashColor: string;
  chroma: number;
  /** のこり 5 秒の鼓動（0〜1）と、最後に打った秒 */
  beat: number;
  beatSec: number;
  over: boolean;
  /** TIME UP のあとの色あせ（0〜1） */
  fade: number;
  /** マルチボールのスポットライト（0〜1） */
  spot: number;
  moteT: number;
  installs: Install[];
  /** その部品が付いた時刻（付いた直後は光らせる） */
  fresh: Map<string, number>;
}

const states = new WeakMap<object, TableFx>();

export function fxOf(wd: PinballWorld): TableFx {
  let f = states.get(wd);
  if (!f) {
    f = {
      parts: new Particles(), clock: 0, last: 0, wdTime: -1, runT: -1, tracks: new WeakMap(),
      segFlash: new Float32Array(0), bumpFlash: new Float32Array(0), flipFlash: new Float32Array(8), flipUp: new Uint8Array(8),
      arcs: [], shocks: [], kx: 0, ky: 0, kvx: 0, kvy: 0, sx: 0, sy: 0,
      showT: -1, dispT: -1, multiballs: 0, zone: false, boss: false,
      flash: 0, flashColor: '#ffffff', chroma: 0, beat: 0, beatSec: -1, over: false, fade: 0, spot: 0, moteT: 0,
      installs: [], fresh: new Map(),
    };
    states.set(wd, f);
  }
  return f;
}

// ------------------------------------------------------------------ 部品を買って付いた瞬間
const pending: string[] = [];
/** 部品を買った（main.ts の toyBought から呼ぶ）。次に台が見えたとき、その場所で取り付けの演出を流す */
export function fxToyInstalled(id: string): void {
  if (!pending.includes(id)) pending.push(id);
}
/**
 * 取り付けの流れ（秒。ins.t から）：寄って点線の輪が縮む（〜0.42）→ ドンと付く → 光の波が台じゅうへ広がり、
 * 通った所の電球が灯り、きらめきが舞う（台が蘇る。0.42〜2.4。カメラは台全体へ引く）→ 打ち出しの所へ戻る（〜3.4）
 */
export const INSTALL = { hit: 0.42, wave: 1.9, cam: 2.6, end: 3.4 };
/** 光の波の半径（台のユニット）。t は付いてからの秒 */
export const waveRadius = (t: number): number => {
  const k = Math.min(1, Math.max(0, t / INSTALL.wave));
  return 1500 * (1 - (1 - k) ** 2.4);
};
let installHook: ((id: string) => void) | null = null;
/** 部品が台に付いた瞬間に呼ぶ（main.ts が、その部品の名前と効き目のひとことを出す） */
export function onToyInstalled(fn: (id: string) => void): void { installHook = fn; }
/** 取り付けの演出を待っている部品があるか */
export const fxInstallPending = (): boolean => pending.length > 0;

function track(f: TableFx, b: { x: number; y: number; vx: number; vy: number }): Track {
  let t = f.tracks.get(b);
  if (!t) {
    t = { vx: b.vx, vy: b.vy, x: b.x, y: b.y, sqT: -9, nx: 0, ny: 1, amt: 0, lastHit: -9, hx: new Float32Array(6), hy: new Float32Array(6), hi: 0, hn: 0 };
    f.tracks.set(b, t);
  }
  return t;
}

/** 向きつきの押し（ゆれ） */
function kick(f: TableFx, nx: number, ny: number, p: number): void {
  const k = calm() ? 0.25 : 1;
  f.kvx += nx * p * 60 * k;
  f.kvy += ny * p * 60 * k;
}
function shock(f: TableFx, x: number, y: number, p: number): void {
  if (f.shocks.length >= 4) f.shocks.shift();
  f.shocks.push({ x, y, t: f.clock, p });
}

/** ぶつかった所の基本の粒：閃光・火花・（古い台なら）ほこり */
function impact(f: TableFx, x: number, y: number, nx: number, ny: number, power: number, color: string, stage: number): void {
  const q = quality();
  const P = f.parts;
  P.add(PK.Flash, x, y, 0, 0, 0.14, 16 + power * 26, color);
  const n = Math.round((2 + power * 7) * (q === 0 ? 0.4 : q === 1 ? 0.7 : 1));
  const base = Math.atan2(ny, nx);
  for (let i = 0; i < n; i += 1) {
    const a = base + rand(-1.15, 1.15);
    const s = rand(160, 420) * (0.6 + power * 0.7);
    P.add(PK.Spark, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.16, 0.38), rand(1.4, 2.6), i % 3 ? color : '#fff3c4', 500, 2.4);
  }
  if (power > 0.55) P.add(PK.Ring, x, y, 0, 0, 0.26, 26 + power * 34, color);
  // 古い台は、当たるとほこりが舞う
  if (stage <= 1 && q > 0 && power > 0.3) {
    for (let i = 0; i < (stage === 0 ? 3 : 1); i += 1) {
      const a = base + rand(-1.3, 1.3);
      P.add(PK.Dust, x, y, Math.cos(a) * rand(20, 70), Math.sin(a) * rand(20, 70) - 14, rand(0.5, 0.9), rand(7, 13), '#b9a98c', -20, 1.8);
    }
  }
}

function confetti(f: TableFx, x: number, y: number, ang: number, spread: number, n: number, speed: number, cols: string[]): void {
  const k = quality() === 0 ? 0.35 : quality() === 1 ? 0.65 : 1;
  for (let i = 0; i < n * k; i += 1) {
    const a = ang + rand(-spread, spread);
    const s = speed * rand(0.35, 1);
    f.parts.add(PK.Confetti, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(1.1, 2.1), rand(2.6, 4.6), cols[i % cols.length], 260, 1.5, rand(0, TAU), rand(-9, 9));
  }
}
function chips(f: TableFx, x: number, y: number, n: number): void {
  if (quality() === 0) n = Math.min(n, 1);
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + rand(-0.9, 0.9);
    const s = rand(130, 260);
    f.parts.add(PK.Chip, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.45, 0.7), rand(2.6, 3.8), '#ffd21f', 620, 0.6);
  }
}

const CONFETTI = ['#e5163a', '#ffd21f', '#f4efe4', '#7b2cff', '#22e5c0'];

/** 毎コマ：台を見回って、粒・ゆれ・見せ場を進める。view は映している範囲（台のユニット）。main は本物の台（見本でない） */
export function fxStep(f: TableFx, wd: PinballWorld, view: { x0: number; y0: number; x1: number; y1: number }, stage: number, main: boolean): void {
  const now = performance.now();
  const dt = f.last ? Math.min(0.05, Math.max(0, (now - f.last) / 1000)) : 0.016;
  f.last = now;
  f.clock += dt;
  const q = quality();
  const P = f.parts;
  P.limit = q === 2 ? 640 : q === 1 ? 360 : 140;
  const cm = calm();

  // プレイがはじまり直した：前のプレイの演出を片づける
  if (f.runT !== wd.runStartT || wd.time < f.wdTime - 0.5) {
    f.runT = wd.runStartT;
    f.showT = wd.time;
    f.dispT = wd.display.t;
    f.multiballs = wd.multiballs;
    f.beatSec = -1;
    f.over = false;
    f.fade = 0;
    f.arcs.length = 0;
  }
  f.wdTime = wd.time;

  if (f.segFlash.length !== wd.segs.length) f.segFlash = new Float32Array(wd.segs.length);
  if (f.bumpFlash.length !== wd.bumpers.length) f.bumpFlash = new Float32Array(wd.bumpers.length);

  // --- 球：速さの急な変わり＝ぶつかった
  const balls: { x: number; y: number; vx: number; vy: number; r: number }[] = [wd.puck];
  for (const m of wd.mates) balls.push(m);
  const moving = !wd.waiting && wd.freeze <= 0;
  for (let bi = 0; bi < balls.length; bi += 1) {
    const b = balls[bi];
    const tr = track(f, b);
    const jump = Math.hypot(b.x - tr.x, b.y - tr.y);
    if (moving && jump < 120) {
      const dvx = b.vx - tr.vx;
      const dvy = b.vy - tr.vy;
      const dv = Math.hypot(dvx, dvy);
      if (dv > 420 && f.clock - tr.lastHit > 0.06) {
        tr.lastHit = f.clock;
        const nx = dvx / dv;
        const ny = dvy / dv;
        const power = Math.min(1, (dv - 300) / 1900);
        tr.sqT = f.clock;
        tr.nx = nx; tr.ny = ny;
        tr.amt = 0.12 + power * 0.26;
        // 当たった所は、押し返された向きの反対側のふち
        const cx = b.x - nx * b.r;
        const cy = b.y - ny * b.r;
        if (cx > view.x0 - 20 && cx < view.x1 + 20 && cy > view.y0 - 20 && cy < view.y1 + 20) {
          impact(f, cx, cy, nx, ny, power, bi === 0 ? '#ffe9a8' : '#bfe9ff', stage);
          if (bi === 0 || power > 0.6) kick(f, nx, ny, 0.5 + power * 2.2);
          if (power > 0.7 && bi === 0) shock(f, cx, cy, 0.35 + power * 0.4);
        }
      }
    }
    if (jump > 120) tr.hn = 0;
    tr.vx = b.vx; tr.vy = b.vy; tr.x = b.x; tr.y = b.y;
    // 残像の位置をためる
    tr.hx[tr.hi] = b.x;
    tr.hy[tr.hi] = b.y;
    tr.hi = (tr.hi + 1) % tr.hx.length;
    tr.hn = Math.min(tr.hx.length, tr.hn + 1);
  }

  // --- 部品の光りはじめ
  for (let i = 0; i < wd.bumpers.length; i += 1) {
    const b = wd.bumpers[i];
    if (b.flash > f.bumpFlash[i] + 0.01) {
      P.add(PK.Ring, b.x, b.y, 0, 0, 0.3, b.r * 3.4, '#ff6ad5');
      for (let k = 0; k < (q === 0 ? 2 : 5); k += 1) {
        const a = rand(0, TAU);
        P.add(PK.Twinkle, b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, Math.cos(a) * 90, Math.sin(a) * 90, rand(0.25, 0.45), rand(5, 9), '#ffd6f2', 0, 2);
      }
      chips(f, b.x, b.y - b.r, 1);
    }
    f.bumpFlash[i] = b.flash;
  }
  for (let i = 0; i < wd.segs.length; i += 1) {
    const s = wd.segs[i];
    if (s.kick && s.flash > f.segFlash[i] + 0.01) {
      // 三角のばね：辺から外へ、緑の矢が飛ぶ
      const mx = (s.ax + s.bx) / 2;
      const my = (s.ay + s.by) / 2;
      const l = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
      let nx = (s.by - s.ay) / l;
      let ny = -(s.bx - s.ax) / l;
      if ((wd.puck.x - mx) * nx + (wd.puck.y - my) * ny < 0) { nx = -nx; ny = -ny; }
      for (let k = 0; k < (q === 0 ? 2 : 5); k += 1) {
        const u = rand(0.1, 0.9);
        P.add(PK.Tri, s.ax + (s.bx - s.ax) * u, s.ay + (s.by - s.ay) * u, nx * rand(260, 460), ny * rand(260, 460), rand(0.2, 0.34), rand(5, 8), '#6dffb0', 0, 3);
      }
      chips(f, mx, my, 1);
      kick(f, nx, ny, 1.4);
    }
    f.segFlash[i] = s.flash;
  }
  for (let i = 0; i < wd.flippers.length && i < 8; i += 1) {
    const fl = wd.flippers[i];
    const up = fl.up > 0 ? 1 : 0;
    if (up && !f.flipUp[i]) {
      // 振り抜きの弧
      if (f.arcs.length > 6) f.arcs.shift();
      f.arcs.push({ i, t: f.clock, a0: fl.rest, a1: fl.upA, hit: false });
    }
    f.flipUp[i] = up;
    if (fl.flash > f.flipFlash[i] + 0.01) {
      const [tx, ty] = flipperTip(fl);
      const arc = f.arcs.find((a) => a.i === i);
      if (arc) arc.hit = true;
      P.add(PK.Ring, tx, ty, 0, 0, 0.28, 54, '#ffb347');
      for (let k = 0; k < (q === 0 ? 3 : 8); k += 1) {
        const a = -Math.PI / 2 + rand(-0.8, 0.8);
        const sp = rand(220, 520);
        P.add(PK.Spark, tx, ty, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.18, 0.4), rand(1.6, 2.8), k % 2 ? '#ffb347' : '#fff3c4', 300, 2);
      }
      kick(f, 0, 1, 1.6);
    }
    f.flipFlash[i] = fl.flash;
  }

  // --- 当たった・倒した（攻撃の色ごとに形を変える）
  if (wd.fxq.length) {
    for (const e of wd.fxq) {
      if (e.k === 'kill') {
        confetti(f, e.x, e.y, -Math.PI / 2, Math.PI, e.p >= 3 ? 70 : 12, e.p >= 3 ? 520 : 300, CONFETTI);
        chips(f, e.x, e.y, e.p >= 3 ? 12 : 4);
        if (e.p >= 3) { shock(f, e.x, e.y, 1); f.flash = Math.max(f.flash, cm ? 0.25 : 0.8); f.flashColor = '#ffd21f'; f.chroma = Math.max(f.chroma, 1); }
        continue;
      }
      const c = e.c as keyof typeof ELEM_COLOR | undefined;
      const big = e.p >= 2;
      emitHit(P, c, e.x, e.y, big, wd.puck.vx, wd.puck.vy);
      if (big) { shock(f, e.x, e.y, 0.7); f.chroma = Math.max(f.chroma, 0.7); }
      if (e.p >= 1.5 && q > 0) P.add(PK.Ring, e.x, e.y, 0, 0, 0.3, 70, c ? ELEM_COLOR[c] : '#ffffff');
    }
    wd.fxq.length = 0;
  }

  // --- ライトショーと知らせ：見せ場
  let newShowT = f.showT;
  for (const s of wd.shows) {
    if (s.t0 <= f.showT) continue;
    newShowT = Math.max(newShowT, s.t0);
    if (s.kind === 'strobe' || s.kind === 'rainbow') {
      // 大当たり：左右の下のすみから紙吹雪の大砲
      confetti(f, view.x0 + 10, view.y1 - 10, -1.05, 0.45, 46, 900, CONFETTI);
      confetti(f, view.x1 - 10, view.y1 - 10, -Math.PI + 1.05, 0.45, 46, 900, CONFETTI);
      shock(f, s.x, s.y, 1);
      f.flash = Math.max(f.flash, cm ? 0.2 : 0.7);
      f.flashColor = s.color;
      f.chroma = 1;
    } else if (s.kind === 'chase') {
      for (let k = 0; k < (q === 0 ? 4 : 12); k += 1) {
        const a = rand(0, TAU);
        P.add(PK.Twinkle, s.x + Math.cos(a) * rand(10, 60), s.y + Math.sin(a) * rand(10, 60), 0, -30, rand(0.3, 0.7), rand(6, 11), s.color, 0, 0);
      }
    }
  }
  f.showT = newShowT;
  if (wd.display.t > f.dispT) {
    f.dispT = wd.display.t;
    if (wd.display.tier >= 3) {
      confetti(f, (view.x0 + view.x1) / 2, view.y0 - 10, Math.PI / 2, 1.3, 60, 420, CONFETTI);
      f.flash = Math.max(f.flash, cm ? 0.2 : 0.55);
      f.chroma = Math.max(f.chroma, 0.8);
    } else if (wd.display.tier === 2) {
      f.chroma = Math.max(f.chroma, 0.4);
    }
  }
  if (wd.multiballs > f.multiballs) {
    // マルチボール：ロックのホールから光の輪が 3 つ、紙吹雪、スポットライト
    const sc = wd.saucer;
    for (let k = 0; k < 3; k += 1) P.add(PK.Ring, sc.x, sc.y, 0, 0, 0.5 + k * 0.18, 120 + k * 90, k === 1 ? '#ffd21f' : '#ff8f2e');
    confetti(f, sc.x, sc.y, -Math.PI / 2, Math.PI, 50, 620, CONFETTI);
    shock(f, sc.x, sc.y, 1);
    f.flash = Math.max(f.flash, cm ? 0.2 : 0.6);
    f.flashColor = '#ffd21f';
  }
  f.multiballs = wd.multiballs;
  f.spot += ((wd.multi && !wd.waiting ? 1 : 0) - f.spot) * Math.min(1, dt * 3);
  if (wd.zone && !f.zone) {
    f.flash = Math.max(f.flash, cm ? 0.2 : 0.5);
    f.flashColor = '#22e5c0';
    shock(f, wd.puck.x, wd.puck.y, 0.9);
  }
  f.zone = wd.zone;
  if (wd.zone && q > 0 && Math.random() < dt * 40) {
    // ZONE：左右のふちを光の筋が駆け上がる
    const x = Math.random() < 0.5 ? view.x0 + rand(4, 40) : view.x1 - rand(4, 40);
    P.add(PK.Spark, x, view.y1 + 10, 0, -rand(700, 1300), 0.6, rand(1.5, 3), `hsl(${Math.floor(rand(0, 24)) * 15} 100% 65%)`, 0, 0);
  }
  if (wd.bossAlive && !f.boss && !wd.waiting) {
    // ボス：赤い閃光と、上から落ちるほこり
    f.flash = Math.max(f.flash, cm ? 0.2 : 0.5);
    f.flashColor = '#e5163a';
    shock(f, T.BOSS_HOME[0], T.BOSS_HOME[1], 1);
    for (let k = 0; k < (q === 0 ? 6 : 18); k += 1) P.add(PK.Dust, rand(view.x0, view.x1), view.y0 + rand(0, 40), rand(-10, 10), rand(40, 120), rand(0.8, 1.5), rand(8, 16), '#b9a98c', 40, 1);
    kick(f, 0, 1, 4);
  }
  f.boss = wd.bossAlive;

  // --- のこり 5 秒：鼓動。TIME UP：色あせ
  const playing = wd.phase === 'play' && !wd.waiting && wd.runLeft < 9000;
  if (playing && wd.runLeft <= 5 && wd.runLeft > 0) {
    const sec = Math.ceil(wd.runLeft);
    if (sec !== f.beatSec) {
      f.beatSec = sec;
      f.beat = 1;
      P.add(PK.Ring, wd.puck.x, wd.puck.y, 0, 0, 0.45, 90, '#e5163a');
    }
  }
  f.beat = Math.max(0, f.beat - dt * 2.6);
  const over = wd.phase === 'over';
  if (over && !f.over) { f.flash = Math.max(f.flash, cm ? 0.25 : 0.9); f.flashColor = '#f4efe4'; shock(f, (view.x0 + view.x1) / 2, (view.y0 + view.y1) / 2, 1); }
  f.over = over;
  f.fade += ((over ? 1 : 0) - f.fade) * Math.min(1, dt * 4);
  f.flash = Math.max(0, f.flash - dt * 2.2);
  f.chroma = Math.max(0, f.chroma - dt * 2.5);

  // --- 空気の中のほこり・金の粉（打ち出し前も舞う）
  f.moteT -= dt;
  if (f.moteT <= 0 && q > 0) {
    f.moteT = stage <= 1 ? 0.07 : 0.16;
    const x = rand(view.x0, view.x1);
    const y = rand(view.y0, view.y1);
    if (stage <= 1) P.add(PK.Dust, x, y, rand(-8, 8), rand(-14, -4), rand(2.4, 4), rand(1.6, 3.2), '#d8cdb8', 0, 0);
    else P.add(PK.Twinkle, x, y, rand(-6, 6), rand(-12, 0), rand(0.9, 1.8), rand(2.5, 4 + stage), stage >= 4 ? (Math.random() < 0.5 ? '#ffd21f' : '#22e5c0') : '#ffe9a8', 0, 0);
  }

  // --- 買った部品の取り付け（本物の台だけ。台が見えていて、打ち出しを待っているとき）
  if (main && pending.length && wd.waiting && f.installs.length === 0 && typeof document !== 'undefined' && document.getElementById('app')?.classList.contains('ready')) {
    const id = pending.shift() as string;
    const part = PARTS.find((p) => p.toy === id);
    if (part && wd.toys[id as keyof typeof wd.toys]) f.installs.push({ id, x: part.x, y: part.y, r: Math.max(26, Math.min(70, part.r)), t: f.clock + 0.35, fired: false });
  }
  for (const ins of f.installs) {
    const t = f.clock - ins.t;
    if (!ins.fired && t >= 0.42) {
      // ドン、と台に付く：閃光・輪・火花・紙吹雪・ほこり・ねじの光
      ins.fired = true;
      f.fresh.set(ins.id, f.clock);
      P.add(PK.Flash, ins.x, ins.y, 0, 0, 0.3, ins.r * 3.2, '#fff3c4');
      P.add(PK.Ring, ins.x, ins.y, 0, 0, 0.5, ins.r * 3.6, '#ffd21f');
      P.add(PK.Ring, ins.x, ins.y, 0, 0, 0.8, ins.r * 5.5, '#22e5c0');
      for (let k = 0; k < 22; k += 1) {
        const a = rand(0, TAU);
        const s = rand(180, 520);
        P.add(PK.Spark, ins.x + Math.cos(a) * ins.r * 0.6, ins.y + Math.sin(a) * ins.r * 0.6, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.55), rand(1.6, 3), k % 2 ? '#ffd21f' : '#fff3c4', 200, 2.2);
      }
      for (let k = 0; k < 8; k += 1) {
        const a = rand(0, TAU);
        P.add(PK.Dust, ins.x + Math.cos(a) * ins.r, ins.y + Math.sin(a) * ins.r, Math.cos(a) * 60, Math.sin(a) * 60, rand(0.6, 1.1), rand(10, 18), '#b9a98c', -10, 1.6);
      }
      confetti(f, ins.x, ins.y, -Math.PI / 2, Math.PI, 36, 420, CONFETTI);
      shock(f, ins.x, ins.y, 0.9);
      kick(f, 0, 1, 3.5);
      f.flash = Math.max(f.flash, 0.45);
      f.flashColor = '#ffd21f';
      installHook?.(ins.id);
    }
    // 光の波：波の先にきらめきが舞い、台が蘇っていく
    const wt = t - INSTALL.hit;
    if (ins.fired && wt > 0 && wt < INSTALL.wave + 0.2) {
      const r = waveRadius(wt);
      const n = q === 0 ? 2 : q === 1 ? 5 : 8;
      for (let k = 0; k < n; k += 1) {
        const a = rand(0, TAU);
        const x = ins.x + Math.cos(a) * r;
        const y = ins.y + Math.sin(a) * r;
        if (x < 10 || x > T.TW - 10 || y < 10 || y > T.TH - 10) continue;
        P.add(PK.Twinkle, x, y, rand(-10, 10), rand(-30, -8), rand(0.7, 1.4), rand(3, 6.5), k % 3 === 0 ? '#22e5c0' : k % 3 === 1 ? '#ffd21f' : '#fff3c4', 0, 0);
      }
    }
  }
  f.installs = f.installs.filter((i) => f.clock - i.t < INSTALL.end);

  // --- ゆれ：ばね（向きつきの押し）＋ world.quake のふるえ
  const K = 520;
  const D = 22;
  f.kvx += (-K * f.kx - D * f.kvx) * dt;
  f.kvy += (-K * f.ky - D * f.kvy) * dt;
  f.kx += f.kvx * dt;
  f.ky += f.kvy * dt;
  const qk = wd.quake * (cm ? 0.2 : 0.7);
  f.sx = f.kx + (Math.random() - 0.5) * qk;
  f.sy = f.ky + (Math.random() - 0.5) * qk;

  while (f.shocks.length && f.clock - f.shocks[0].t > 0.7) f.shocks.shift();
  while (f.arcs.length && f.clock - f.arcs[0].t > 0.22) f.arcs.shift();
  P.step(dt);
}

/** その球のいまのつぶれ：[向きの角度, つぶれる向きの倍率, 直角の向きの倍率] */
export function squashOf(f: TableFx, b: object, vx: number, vy: number): [number, number, number] {
  const tr = f.tracks.get(b);
  const sp = Math.hypot(vx, vy);
  // 速い球は進む向きに少しのびる
  const st = Math.min(0.14, Math.max(0, (sp - 900) / 9000));
  if (!tr) return [Math.atan2(vy, vx), 1 + st, 1 - st * 0.6];
  const t = f.clock - tr.sqT;
  if (t < 0.24) {
    // ぶつかった瞬間につぶれ、行きすぎてのびてから戻る
    const e = Math.exp(-t * 16) * Math.cos(t * 38) * tr.amt;
    return [Math.atan2(tr.ny, tr.nx), 1 - e, 1 + e * 0.7];
  }
  return [Math.atan2(vy, vx), 1 + st, 1 - st * 0.6];
}

/** 残像：少し前の位置を古い順に fn へ（k は 0〜1 で新しいほど 1） */
export function ghostsOf(f: TableFx, b: object, fn: (x: number, y: number, k: number) => void): void {
  const tr = f.tracks.get(b);
  if (!tr || tr.hn < 3) return;
  const n = tr.hx.length;
  for (let i = tr.hn - 1; i >= 1; i -= 1) {
    const ix = (tr.hi - 1 - i + n * 2) % n;
    fn(tr.hx[ix], tr.hy[ix], 1 - i / tr.hn);
  }
}
