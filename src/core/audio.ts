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

/** 短い合成音（GUM を拾う・壁に当たる など） */
export function blip(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.12, slide = 1.6): void {
  const c = ac();
  if (!c || !master || muted) return;
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
export function buzz(ms: number | number[]): void {
  if (!vibrateOn) return;
  try { navigator.vibrate?.(ms); } catch { /* noop */ }
}
