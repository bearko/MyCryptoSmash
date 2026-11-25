// BGM（<audio> で流す）と効果音（Web Audio）。音が出ない環境でもゲームは止めない。

import { cat } from './catalog';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let bgm: HTMLAudioElement | null = null;
let bgmKey = '';
let unlocked = false;
let muted = false;
const last = new Map<string, number>();

function ac(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

async function load(key: string): Promise<void> {
  const c = ac();
  const url = cat.se[key];
  if (!c || !url || buffers.has(key)) return;
  try {
    const res = await fetch(url);
    buffers.set(key, await c.decodeAudioData(await res.arrayBuffer()));
  } catch {
    /* その音は鳴らないだけ */
  }
}

/** 最初のタップの中で呼ぶ */
export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
  if (unlocked) return;
  unlocked = true;
  for (const k of Object.keys(cat.se)) void load(k);
  if (bgm && !muted) void bgm.play().catch(() => undefined);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.8;
  if (bgm) {
    bgm.muted = m;
    if (!m && unlocked && document.visibilityState === 'visible') void bgm.play().catch(() => undefined);
  }
}

/** 実況の声など、ほかの音の部品が同じ出口を使うため */
export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  const c = ac();
  return c && master ? { ctx: c, out: master } : null;
}
export const isMuted = (): boolean => muted;

/** 実況がしゃべっている間、BGM を少し下げる */
export function duckBgm(on: boolean): void {
  if (bgm) bgm.volume = on ? 0.14 : 0.35;
}

/** 連続ヒットの音：1 ヒットごとに半音ずつ上がる（24 ヒットで 2 オクターブ上、そこからは上で回る） */
let lastChime = 0;
export function chime(step: number): void {
  const c = ac();
  if (!c || !master || muted) return;
  const now = performance.now();
  if (now - lastChime < 45) return;
  lastChime = now;
  try {
    const n = step <= 24 ? step : 24 + ((step - 24) % 12);
    const f = 440 * 2 ** (n / 12);
    const t = c.currentTime;
    for (const [mul, type, vol] of [[1, 'triangle', 0.09], [2, 'sine', 0.04], [3, 'sine', 0.02]] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * mul, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.4);
    }
  } catch { /* noop */ }
}

let noise: AudioBuffer | null = null;
/** 歓声（雑音をしぼって作る）。strength 0〜1 */
let lastRoar = 0;
export function roar(strength: number, dur = 1.4): void {
  const c = ac();
  if (!c || !master || muted) return;
  const now = performance.now();
  if (now - lastRoar < 600) return;
  lastRoar = now;
  try {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(1100, t + dur);
    bp.Q.value = 0.6;
    const g = c.createGain();
    const v = 0.05 + 0.13 * strength;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.12);
    g.gain.exponentialRampToValueAtTime(v * 0.6, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  } catch { /* noop */ }
}

export function playBgm(key: 'field' | 'boss' | ''): void {
  if (bgmKey === key) return;
  bgmKey = key;
  try {
    if (bgm) { bgm.pause(); bgm.src = ''; bgm = null; }
    if (!key) return;
    bgm = new Audio(cat.bgm[key]);
    bgm.loop = true;
    bgm.volume = 0.35;
    bgm.muted = muted;
    if (unlocked) void bgm.play().catch(() => undefined);
  } catch {
    bgm = null;
  }
}

export function pauseBgm(paused: boolean): void {
  if (!bgm) return;
  if (paused) bgm.pause();
  else if (unlocked && !muted) void bgm.play().catch(() => undefined);
}

/** 素材の効果音。gap ミリ秒以内の連打は間引く */
export function se(key: string, vol = 0.6, gap = 50, rate = 1): void {
  const c = ac();
  const buf = buffers.get(key);
  if (!c || !master || !buf || muted) return;
  const now = performance.now();
  if (now - (last.get(key) ?? 0) < gap) return;
  last.set(key, now);
  try {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g).connect(master);
    s.start();
  } catch { /* noop */ }
}

/** 合成音を鳴らしすぎない（同時にたくさん鳴ると端末が固まる）：0.1 秒に 6 つまで */
const blipTimes: number[] = [];
function blipAllowed(): boolean {
  const now = performance.now();
  while (blipTimes.length && now - blipTimes[0] > 100) blipTimes.shift();
  if (blipTimes.length >= 6) return false;
  blipTimes.push(now);
  return true;
}

/** 短い合成音（GUM を拾う・壁に当たる など） */
export function blip(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.12, slide = 1.6): void {
  const c = ac();
  if (!c || !master || muted || !blipAllowed()) return;
  try {
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* noop */ }
}

let vibrateOn = true;
export function setVibrate(v: boolean): void { vibrateOn = v; }
let lastBuzz = 0;
export function buzz(ms: number | number[]): void {
  if (!vibrateOn) return;
  // 振動の命令を立て続けに出すと端末が重くなるので、0.08 秒に 1 回まで
  const now = performance.now();
  if (now - lastBuzz < 80) return;
  lastBuzz = now;
  try { navigator.vibrate?.(ms); } catch { /* noop */ }
}
