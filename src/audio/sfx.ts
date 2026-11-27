// 効果音。全部その場で合成し、いまの曲の調（music.key()）の音階に合わせて鳴らす。
// 手ごたえは「低いドン」＋「高いキラ」の重ね。当たりの強さ（power）で音色と大きさ、左右の位置（x）でパンが変わる。
// 呼び方：sfx('bumper', { x: -0.4, power: 0.8, step: 5 })

import { buf, buildRig, claim, duck, isMuted, liveRig, sfxOut, sfxSend, wave, type Rig } from './engine';
import { music, type HitKind, type KeyInfo } from './music';
import { chimeStep, chordTone, degree, ftom, mtof, PENTA, snap } from './theory';

export interface SfxOpts {
  /** 左右の位置 −1（左）〜 1（右） */
  x?: number;
  /** 強さ 0〜1 */
  power?: number;
  /** 続けて当たった数（音階を上る） */
  step?: number;
  /** 進みぐあい 0〜1（数字が転がる音など） */
  p?: number;
  vol?: number;
}

interface Cx { rig: Rig; t: number; key: KeyInfo; pan: number; pw: number; step: number; p: number; vol: number }

// ---------------------------------------------------------------- 音の部品
/** node を効果音の出口へつなぐ（左右の位置と、響きへの送り）。出口は使い回す（engine.ts の sfxOut・sfxSend） */
function route(c: Cx, node: AudioNode, rev = 0): void {
  node.connect(sfxOut(c.rig, c.pan));
  if (rev) node.connect(sfxSend(c.rig, rev));
}

interface ToneO { f: number; to?: number; dur: number; vol: number; type?: string; a?: number; lp?: number; at?: number; rev?: number }
function tone(c: Cx, o: ToneO): void {
  const ctx = c.rig.ctx;
  const t = c.t + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const ty = o.type ?? 'chip';
  if (ty === 'sine' || ty === 'square' || ty === 'sawtooth' || ty === 'triangle') osc.type = ty;
  else osc.setPeriodicWave(wave(c.rig, ty));
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to && o.to !== o.f) osc.frequency.exponentialRampToValueAtTime(Math.max(25, o.to), t + o.dur);
  const g = ctx.createGain();
  const v = o.vol * c.vol * 1.6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.a ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let head: AudioNode = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    head = osc.connect(f);
  }
  head.connect(g);
  route(c, g, o.rev);
  osc.start(t);
  osc.stop(t + o.dur + 0.03);
}

/** FM のベル（キラ・チン） */
function bell(c: Cx, f: number, dur: number, vol: number, at = 0, idx = 2.4, rev = 0.25): void {
  const ctx = c.rig.ctx;
  const t = c.t + at;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  const g = ctx.createGain();
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(f * 3.01, t);
  mg.gain.setValueAtTime(f * idx, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.1), t + dur * 0.6);
  const v = vol * c.vol * 1.7;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mod.connect(mg).connect(car.frequency);
  car.connect(g);
  route(c, g, rev);
  car.start(t); mod.start(t);
  car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
}

/** 計算で作った短い音（dsp.ts）を鳴らす */
function smp(c: Cx, name: string, vol: number, rate = 1, at = 0, rev = 0): void {
  const ab = buf(c.rig, name);
  if (!ab) return;
  const ctx = c.rig.ctx;
  const s = ctx.createBufferSource();
  s.buffer = ab;
  s.playbackRate.value = Math.max(0.25, Math.min(4, rate));
  const g = ctx.createGain();
  g.gain.value = vol * c.vol;
  s.connect(g);
  route(c, g, rev);
  s.start(c.t + at);
}

/** しぼった雑音（歓声・風） */
function nz(c: Cx, dur: number, vol: number, f0: number, f1: number, q = 0.7, at = 0): void {
  const ab = buf(c.rig, 'noise');
  if (!ab) return;
  const ctx = c.rig.ctx;
  const t = c.t + at;
  const s = ctx.createBufferSource();
  s.buffer = ab;
  s.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  const v = vol * c.vol;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + Math.min(0.12, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * 0.6), t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g);
  route(c, g, 0.15);
  s.start(t, (t * 0.37) % 1.5);
  s.stop(t + dur + 0.05);
}

/** 音階の段 → 周波数（oct はレから数えたオクターブ。0 ＝ D4） */
const deg = (c: Cx, n: number, oct = 0): number => mtof(degree(c.key.tonic + 12 * oct, c.key.mode, n));
/** いまのコードの音 → 周波数 */
const ct = (c: Cx, i: number, base = 62): number => mtof(chordTone(c.key.chord, base, i));
/** コードを駆け上がる */
function run(c: Cx, n: number, gap: number, vol: number, base = 74, type: 'bell' | string = 'bell', dur = 0.22): void {
  for (let i = 0; i < n; i += 1) {
    if (type === 'bell') bell(c, ct(c, i, base), dur, vol, i * gap);
    else tone(c, { f: ct(c, i, base), dur, vol, type, at: i * gap, rev: 0.2 });
  }
}

// ---------------------------------------------------------------- 音の一覧（返す数は、鳴っている秒数）
type Recipe = (c: Cx) => number;
const R: Record<string, Recipe> = {
  // ---- 台
  bumper: (c) => {
    smp(c, 'thump', 0.45 + 0.4 * c.pw, 1 + 0.35 * c.pw);
    smp(c, 'clack', 0.3, 1.1);
    bell(c, deg(c, chimeStep(c.step), 1), 0.2 + 0.1 * c.pw, 0.11 + 0.09 * c.pw, 0, 1.5 + 3 * c.pw);
    return 0.3;
  },
  sling: (c) => {
    smp(c, 'clack', 0.4, 1.4);
    smp(c, 'thump', 0.25, 1.7);
    const f = deg(c, 2 + (c.step % 3));
    tone(c, { f, to: f * 1.5, dur: 0.07, vol: 0.07 });
    return 0.12;
  },
  flipper: (c) => { smp(c, 'clack', 0.45, 0.8); smp(c, 'thump', 0.3, 1.5); return 0.1; },
  spring: (c) => {
    smp(c, 'spring', 0.4 + 0.2 * c.pw, 0.8 + 0.6 * c.pw);
    smp(c, 'thump', 0.4 + 0.4 * c.pw, 1.2);
    smp(c, 'whoosh', 0.35 * c.pw, 1 + c.pw, 0.03);
    return 0.5;
  },
  rail: (c) => { smp(c, 'whoosh', 0.3, 1.3); run(c, 4, 0.05, 0.06, 74, 'chip', 0.08); return 0.5; },
  target: (c) => {
    smp(c, 'clack', 0.4, 1.2);
    smp(c, 'ping', 0.3 + 0.2 * c.pw, deg(c, c.step % 5, 2) / 2093, 0, 0.2);
    return 0.3;
  },
  drop: (c) => { smp(c, 'thump', 0.5, 1.3); const f = deg(c, 2); tone(c, { f, to: f / 2, dur: 0.14, vol: 0.07 }); return 0.2; },
  hole: (c) => {
    const f = deg(c, 4);
    tone(c, { f, to: f / 4, dur: 0.32, vol: 0.1, type: 'sine', rev: 0.3 });
    smp(c, 'thump', 0.5, 0.8, 0.05);
    return 0.4;
  },
  eject: (c) => { smp(c, 'clack', 0.45, 1); const f = deg(c, 0); tone(c, { f, to: f * 3, dur: 0.12, vol: 0.07 }); smp(c, 'whoosh', 0.2, 1.8); return 0.25; },
  jackpot: (c) => {
    smp(c, 'thump', 0.9, 0.9);
    smp(c, 'boom', 0.4, 1.5);
    run(c, 6, 0.055, 0.1, 62, 'brass', 0.3);
    run(c, 6, 0.055, 0.07, 86);
    smp(c, 'sparkle', 0.35, 1, 0.2, 0.3);
    return 1;
  },
  pip: (c) => { bell(c, deg(c, chimeStep(c.step), 2), 0.07, 0.09, 0, 1, 0); return 0.06; },
  spin: (c) => { smp(c, 'rim', 0.12, 1.6 + (c.step % 4) * 0.12); return 0.03; },
  wall: (c) => { smp(c, 'thump', 0.2 + 0.35 * c.pw, 1.3 + 0.5 * c.pw); smp(c, 'clack', 0.12 + 0.15 * c.pw, 0.7); return 0.1; },
  drain: (c) => {
    const f = deg(c, 5);
    tone(c, { f, to: f / 5, dur: 0.5, vol: 0.1, type: 'sawtooth', lp: 1400, rev: 0.3 });
    smp(c, 'thump', 0.7, 0.7, 0.3);
    return 0.6;
  },
  lost: (c) => { const f = deg(c, 3); tone(c, { f, to: f / 2, dur: 0.18, vol: 0.1, type: 'triangle' }); smp(c, 'thump', 0.3, 1.2, 0.1); return 0.2; },
  save: (c) => { smp(c, 'clack', 0.4, 1); run(c, 4, 0.045, 0.09); smp(c, 'whoosh', 0.3, 1.6); return 0.4; },
  cannon: (c) => { smp(c, 'boom', 0.7, 1.25); smp(c, 'clack', 0.5, 0.7); smp(c, 'whoosh', 0.35, 1.5, 0.04); return 0.8; },
  coin: (c) => { bell(c, deg(c, 2, 2), 0.09, 0.07, 0, 1.2); bell(c, deg(c, 4, 2), 0.2, 0.08, 0.06, 1.2); return 0.25; },
  lights: (c) => { run(c, 5, 0.05, 0.07, 86); smp(c, 'sparkle', 0.2, 1.2, 0.1); return 0.5; },
  multiball: (c) => {
    smp(c, 'boom', 0.45, 1.3);
    smp(c, 'whoosh', 0.4, 0.8);
    run(c, 8, 0.045, 0.08, 62, 'brass', 0.25);
    smp(c, 'sparkle', 0.3, 1, 0.3, 0.3);
    return 1;
  },
  // ---- むかしの呼び名（se('hit') など）の中身
  thwack: (c) => {
    smp(c, 'clack', 0.5 * (0.6 + 0.4 * c.pw), 0.9 * c.p);
    smp(c, 'thump', 0.6 * (0.5 + 0.5 * c.pw), 1.3 * c.p);
    nz(c, 0.07, 0.12 * c.pw, 2200 * c.p, 900 * c.p, 1.2);
    return 0.15;
  },
  explode: (c) => {
    smp(c, 'boom', 0.75 * c.pw, c.p);
    smp(c, 'thump', 0.6 * c.pw, 0.8 * c.p);
    if (c.p >= 1.3) smp(c, 'sparkle', 0.2 * c.pw, c.p * 0.8, 0.04);
    return 0.9 / c.p;
  },
  shimmer: (c) => {
    const base = c.p >= 1.5 ? 86 : c.p >= 1.1 ? 74 : 62;
    run(c, 4, 0.045, 0.1 * c.pw, base);
    smp(c, 'sparkle', 0.22 * c.pw, 0.9 + 0.2 * c.p, 0.08, 0.3);
    return 0.5;
  },
  chest: (c) => {
    smp(c, 'clack', 0.5, 0.7);
    smp(c, 'thump', 0.4, 1.1);
    bell(c, deg(c, 0, 1), 0.2, 0.09, 0.05); bell(c, deg(c, 2, 1), 0.2, 0.09, 0.11); bell(c, deg(c, 4, 1), 0.35, 0.1, 0.17);
    smp(c, 'sparkle', 0.3, 1, 0.15, 0.3);
    return 0.6;
  },
  fanfare: (c) => {
    // タタタ・ターン（いまのコードで）
    const g = 0.11 / Math.max(0.8, c.p);
    for (let i = 0; i < 3; i += 1) for (const o of [0, 1]) tone(c, { f: ct(c, i + o * 2, 62), dur: 0.1, vol: 0.075, type: 'brass', at: i * g, lp: 3800, rev: 0.3 });
    for (const i of [0, 2, 3, 5]) tone(c, { f: ct(c, i, 62), dur: 0.7, vol: 0.07, type: 'brass', at: 3 * g, a: 0.02, lp: 4200, rev: 0.4 });
    smp(c, 'crash', 0.3, 1, 3 * g, 0.2);
    smp(c, 'kick', 0.7, 1, 3 * g);
    smp(c, 'sparkle', 0.3, 1, 3 * g + 0.05, 0.3);
    return 1.2;
  },
  roar: (c) => { nz(c, c.p, 0.12 + 0.3 * c.pw, 700, 1100, 0.6); nz(c, c.p, 0.05 + 0.12 * c.pw, 1900, 2600, 1.2, 0.05); return c.p; },
  // ---- 画面（UI）
  tap: (c) => { smp(c, 'thock', 0.4); return 0.06; },
  hover: (c) => { smp(c, 'rim', 0.11, 2.2); return 0.03; },
  confirm: (c) => { smp(c, 'thock', 0.35); bell(c, deg(c, 2, 1), 0.1, 0.08, 0, 1.2, 0.1); bell(c, deg(c, 4, 1), 0.2, 0.09, 0.07, 1.2, 0.15); return 0.3; },
  cancel: (c) => { smp(c, 'thock', 0.3, 0.8); const f = deg(c, 2); tone(c, { f, to: f * 0.66, dur: 0.12, vol: 0.05, type: 'triangle' }); return 0.15; },
  tab: (c) => { smp(c, 'paper', 0.2, 1.5); smp(c, 'block', 0.25, 0.75 * 2 ** ([0, 3, 7][c.step % 3] / 12)); return 0.2; },
  page: (c) => { smp(c, 'paper', 0.3, 1.2); return 0.25; },
  open: (c) => { smp(c, 'paper', 0.3, 1); const f = deg(c, 0); tone(c, { f, to: f * 2, dur: 0.16, vol: 0.04, type: 'triangle' }); smp(c, 'thock', 0.3, 1.2, 0.14); return 0.35; },
  close: (c) => { smp(c, 'paper', 0.25, 0.8); const f = deg(c, 5); tone(c, { f, to: f / 2, dur: 0.14, vol: 0.035, type: 'triangle' }); smp(c, 'thock', 0.3, 0.75, 0.1); return 0.3; },
  wipe: (c) => { smp(c, 'whoosh', 0.5, 0.7); smp(c, 'paper', 0.4, 0.7, 0.05); smp(c, 'thump', 0.5, 0.9, 0.3); return 0.7; },
  buy: (c) => {
    smp(c, 'clack', 0.5, 0.9);
    smp(c, 'thump', 0.4, 1.4);
    bell(c, deg(c, 4, 1), 0.12, 0.09, 0.05, 1.4); bell(c, deg(c, 7, 1), 0.4, 0.1, 0.12, 1.4);
    smp(c, 'sparkle', 0.2, 1.3, 0.12, 0.2);
    return 0.5;
  },
  deny: (c) => {
    const f = mtof(c.key.tonic - 12);
    tone(c, { f, dur: 0.09, vol: 0.09, type: 'square', lp: 700 });
    tone(c, { f: f * 0.94, dur: 0.14, vol: 0.09, type: 'square', lp: 700, at: 0.11 });
    smp(c, 'thock', 0.3, 0.6);
    return 0.3;
  },
  toggle: (c) => { smp(c, 'clack', 0.3, 1.5 + 0.4 * c.p); return 0.05; },
  select: (c) => { smp(c, 'thock', 0.25, 1.3); bell(c, deg(c, c.step % 10, 1), 0.14, 0.06, 0, 1, 0.1); return 0.15; },
  /** 数字が転がる（p 0〜1 で上がる） */
  count: (c) => { tone(c, { f: deg(c, Math.floor(c.p * 14), 1), dur: 0.035, vol: 0.07 }); return 0.04; },
  /** 倍率が掛かった（step ごとに上がる） */
  mult: (c) => {
    smp(c, 'thump', 0.4 + 0.03 * Math.min(10, c.step), 1.2);
    bell(c, deg(c, chimeStep(c.step), 1), 0.3, 0.1, 0, 2 + Math.min(3, c.step * 0.3));
    if (c.step >= 4) smp(c, 'sparkle', 0.12, 1 + c.step * 0.03, 0.03);
    return 0.3;
  },
  stamp: (c) => { smp(c, 'thump', 0.9, 0.8); smp(c, 'clack', 0.5, 0.6); smp(c, 'boom', 0.3, 1.8); return 0.4; },
  levelup: (c) => { run(c, 6, 0.05, 0.09, 62, 'chip', 0.12); run(c, 6, 0.05, 0.06, 86); smp(c, 'sparkle', 0.3, 1.1, 0.25, 0.3); return 0.7; },
  evolve: (c) => {
    smp(c, 'whoosh', 0.5, 0.5);
    run(c, 9, 0.06, 0.07, 62, 'brass', 0.2);
    smp(c, 'boom', 0.5, 1.2, 0.55);
    smp(c, 'sparkle', 0.4, 0.9, 0.55, 0.4);
    for (const i of [0, 1, 2, 3]) tone(c, { f: ct(c, i, 62), dur: 0.9, vol: 0.06, type: 'organ', at: 0.55, a: 0.02, rev: 0.4 });
    return 1.5;
  },
  tick: (c) => { smp(c, 'block', 0.5, c.p <= 0 ? 0.6 : 1.4); smp(c, 'thock', 0.3, 1); return 0.1; },
  over: (c) => {
    smp(c, 'boom', 0.8, 0.6);
    const f = mtof(c.key.tonic - 12);
    tone(c, { f: f * 1.4142, to: f, dur: 0.9, vol: 0.09, type: 'brass', lp: 1600, rev: 0.4 });
    tone(c, { f: f / 2, dur: 1.1, vol: 0.12, type: 'sine' });
    return 1.2;
  },
};
export type SfxName = keyof typeof R;
export const SFX_NAMES = Object.keys(R);

/** 続けて鳴らせるまでの間（ミリ秒）。書いていないものは 40 */
const GAP: Record<string, number> = { coin: 30, pip: 28, count: 26, hover: 70, tap: 50, spin: 22, bumper: 45, wall: 60, roar: 600, fanfare: 300, jackpot: 300, evolve: 500, wipe: 200 };
/** 大事な一発：次の拍（16 分）がすぐなら、そこに合わせる。BGM も少し下げる */
const BIG: Record<string, number> = { jackpot: 0.6, fanfare: 0.55, multiball: 0.6, evolve: 0.45, levelup: 0.7, stamp: 0.7, over: 0.3, explode: 0.8 };
export const SNAP_MAX = 0.09;
/** 曲のほうにも合いの手を入れる音 */
const HITS: Record<string, HitKind> = { jackpot: 'jackpot', drain: 'drain', spring: 'launch' };

/** rig に name の音を置く（本番も書き出しも同じ） */
export function placeSfx(rig: Rig, key: KeyInfo, name: string, o: SfxOpts, t: number, vol = 1): number {
  const r = R[name];
  if (!r) return 0;
  return r({ rig, t, key, pan: (o.x ?? 0) * 0.75, pw: o.power ?? 0.6, step: o.step ?? 0, p: o.p ?? 1, vol: (o.vol ?? 1) * vol });
}

const last = new Map<string, number>();
export function sfx(name: SfxName | string, o: SfxOpts = {}): void {
  if (isMuted() || !R[name]) return;
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < (GAP[name] ?? 40)) return;
  const rig = liveRig();
  if (!rig || rig.ctx.state !== 'running') return;
  last.set(name, now);
  const big = BIG[name];
  const v = claim(0.25, big !== undefined);
  if (!v) return;
  try {
    let t = rig.ctx.currentTime;
    if (big !== undefined) {
      const g = music.toGrid();
      if (g > 0.004 && g <= SNAP_MAX) t += g;
      if (name !== 'explode' || (o.power ?? 0.6) >= 0.7) duck(rig, big, 0.25, t);
    }
    placeSfx(rig, music.key(), name, o, t, v);
    const h = HITS[name];
    if (h) music.hit(h);
  } catch { /* その音は鳴らないだけ */ }
}

// ---------------------------------------------------------------- むかしの呼び方（名前と引数はそのまま）
const SE_MAP: Record<string, string> = { hit: 'thwack', blast: 'explode', buff: 'shimmer', chest: 'chest', win: 'fanfare', clear: 'fanfare' };
const seLast = new Map<string, number>();
/** se('hit', 大きさ, 間引きのミリ秒, 高さ) */
export function legacySe(key: string, vol: number, gap: number, rate: number): void {
  const name = SE_MAP[key];
  if (!name) return;
  const now = performance.now();
  if (now - (seLast.get(key) ?? -1e9) < gap) return;
  seLast.set(key, now);
  last.delete(name);
  sfx(name, { power: Math.min(1, vol / 0.6), p: rate });
}

/** 合成音を鳴らしすぎない：0.1 秒に 6 つまで */
const blipTimes: number[] = [];
/** blip(高さ, 長さ, 波, 大きさ, 終わりの高さの比)。高さは曲の音階に寄せる */
export function legacyBlip(freq: number, dur: number, type: OscillatorType, vol: number, slide: number): void {
  if (isMuted()) return;
  const rig = liveRig();
  if (!rig || rig.ctx.state !== 'running') return;
  const now = performance.now();
  while (blipTimes.length && now - blipTimes[0] > 100) blipTimes.shift();
  if (blipTimes.length >= 6) return;
  blipTimes.push(now);
  const v = claim(dur);
  if (!v) return;
  try {
    const key = music.key();
    const f = mtof(snap(ftom(freq), key.tonic, PENTA[key.mode]));
    const c: Cx = { rig, t: rig.ctx.currentTime, key, pan: 0, pw: 0.6, step: 0, p: 1, vol: v };
    tone(c, { f, to: f * slide, dur: Math.max(0.03, dur), vol: vol * 0.8, type: type === 'square' ? 'chip' : type, lp: type === 'sawtooth' ? 3000 : undefined, rev: dur >= 0.15 ? 0.2 : 0 });
  } catch { /* noop */ }
}

/** 連続ヒットの音：1 ヒットごとに音階を 1 段ずつ上る（3 オクターブ目からは上で回る） */
let lastChime = 0;
export function legacyChime(step: number): void {
  const now = performance.now();
  if (now - lastChime < 45) return;
  lastChime = now;
  last.delete('mult');
  const rig = liveRig();
  if (isMuted() || !rig || rig.ctx.state !== 'running') return;
  const v = claim(0.3);
  if (!v) return;
  try {
    const key = music.key();
    const c: Cx = { rig, t: rig.ctx.currentTime, key, pan: 0, pw: 0.6, step, p: 1, vol: v };
    const f = deg(c, chimeStep(step), 1);
    bell(c, f, 0.35, 0.11, 0, 2 + Math.min(3, step * 0.12));
    tone(c, { f: f / 2, dur: 0.12, vol: 0.04, type: 'triangle' });
  } catch { /* noop */ }
}

/** 書き出し（確かめ用）：1 つの効果音を鳴らした波を返す */
export async function renderSfx(name: string, o: SfxOpts = {}, sec = 2): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.floor(44100 * sec), 44100);
  placeSfx(buildRig(ctx), { tonic: 62, mode: 'min', chord: { root: 2, tones: [0, 3, 7] } }, name, o, 0.05);
  return ctx.startRendering();
}
