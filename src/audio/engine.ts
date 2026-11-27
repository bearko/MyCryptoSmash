// 音の出口（ミキサー）。BGM・SE・声のバス → コンプレッサー → リミッター → スピーカー。
// 本番の AudioContext でも、書き出し用の OfflineAudioContext でも同じ配線（Rig）を使う。

import { HARMONICS, KIT, impulse } from './dsp';

export interface Rig {
  ctx: BaseAudioContext;
  /** 全体（ミュートはここ） */
  master: GainNode;
  /** BGM：設定の音量 → ダッキング → 古さのフィルター */
  music: GainNode;
  musicVol: GainNode;
  musicDuck: GainNode;
  ageHp: BiquadFilterNode;
  ageLp: BiquadFilterNode;
  sfx: GainNode;
  voice: GainNode;
  /** 響き（リバーブ）とこだま（ディレイ）への送り口 */
  reverb: GainNode;
  delay: GainNode;
  delayNode: DelayNode;
  buffers: Map<string, AudioBuffer>;
  waves: Map<string, PeriodicWave>;
}

export function buildRig(ctx: BaseAudioContext): Rig {
  const g = (v: number): GainNode => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const master = g(0.9);
  // まとめる → 押さえる（コンプレッサー）→ 天井（リミッター）
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.18;
  // コンプレッサーは自分で持ち上げる（しきい値と比から決まる分）ので、ここでは少し戻す
  const makeup = g(0.62);
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.08;
  const sum = g(1);
  sum.connect(comp).connect(makeup).connect(limit).connect(master).connect(ctx.destination);

  const musicVol = g(1);
  const musicDuck = g(1);
  const ageHp = ctx.createBiquadFilter();
  ageHp.type = 'highpass'; ageHp.frequency.value = 30; ageHp.Q.value = 0.5;
  const ageLp = ctx.createBiquadFilter();
  ageLp.type = 'lowpass'; ageLp.frequency.value = 18000; ageLp.Q.value = 0.5;
  const music = g(0.6);
  music.connect(ageHp).connect(ageLp).connect(musicDuck).connect(musicVol).connect(sum);
  const sfx = g(0.9);
  sfx.connect(sum);
  const voice = g(1);
  voice.connect(sum);

  // 響き：古い店の小さな部屋
  const reverb = g(1);
  const delay = g(1);
  const conv = ctx.createConvolver();
  const sr = ctx.sampleRate;
  const ir = ctx.createBuffer(2, Math.floor(sr * 1.3), sr);
  ir.getChannelData(0).set(impulse(sr, 1.3, 101));
  ir.getChannelData(1).set(impulse(sr, 1.3, 103));
  conv.buffer = ir;
  const wet = g(0.5);
  reverb.connect(conv).connect(wet).connect(sum);
  // こだま：付点 8 分（テンポに合わせて music が長さを決める）
  const delayNode = ctx.createDelay(1.5);
  delayNode.delayTime.value = 0.36;
  const fb = g(0.34);
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass'; dlp.frequency.value = 2600;
  delay.connect(delayNode).connect(dlp).connect(fb).connect(delayNode);
  dlp.connect(g(0.5)).connect(sum);

  return { ctx, master, music, musicVol, musicDuck, ageHp, ageLp, sfx, voice, reverb, delay, delayNode, buffers: new Map(), waves: new Map() };
}

/** 計算で作った短い音（dsp.ts の KIT）。はじめて使うときに作る */
export function buf(rig: Rig, name: string): AudioBuffer | null {
  let b = rig.buffers.get(name);
  if (b) return b;
  const make = KIT[name];
  if (!make) return null;
  const w = make(rig.ctx.sampleRate);
  b = rig.ctx.createBuffer(1, w.length, rig.ctx.sampleRate);
  b.getChannelData(0).set(w);
  rig.buffers.set(name, b);
  return b;
}

export function wave(rig: Rig, name: string): PeriodicWave {
  let w = rig.waves.get(name);
  if (w) return w;
  const h = HARMONICS[name] ?? HARMONICS.organ;
  w = rig.ctx.createPeriodicWave(new Float32Array(h.length), new Float32Array(h));
  rig.waves.set(name, w);
  return w;
}

// ---------------------------------------------------------------- 本番の出口（1 つだけ）
let live: Rig | null = null;
let muted = false;
let vols = { bgm: 1, se: 1 };
let duckVoice = false;
let failed = false;

export function liveRig(): Rig | null {
  if (live || failed) return live;
  if (typeof window === 'undefined') return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    live = buildRig(new AC({ latencyHint: 'interactive' }));
    applyLevels();
  } catch {
    failed = true;
    live = null;
  }
  return live;
}
export const liveCtx = (): AudioContext | null => (liveRig()?.ctx as AudioContext | undefined) ?? null;

function applyLevels(): void {
  if (!live) return;
  const t = live.ctx.currentTime;
  live.master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.02);
  live.musicVol.gain.setTargetAtTime(vols.bgm, t, 0.05);
  live.sfx.gain.setTargetAtTime(0.9 * vols.se, t, 0.05);
}

export function setMuted(m: boolean): void { muted = m; applyLevels(); }
export const isMuted = (): boolean => muted;
/** 設定の音量（0〜1）。BGM と SE を分ける */
export function setVolumes(bgm: number, se: number): void {
  vols = { bgm: Math.max(0, Math.min(1, bgm)), se: Math.max(0, Math.min(1, se)) };
  applyLevels();
}

/** BGM を一時的に下げる（声が出ている間はずっと、大事な SE のときは短く） */
export function duck(rig: Rig, depth: number, hold: number, at = rig.ctx.currentTime): void {
  const g = rig.musicDuck.gain;
  const base = rig === live && duckVoice ? 0.42 : 1;
  g.cancelScheduledValues(at);
  g.setTargetAtTime(Math.min(base, depth), at, 0.015);
  g.setTargetAtTime(base, at + hold, 0.18);
}
export function duckForVoice(on: boolean): void {
  duckVoice = on;
  if (!live) return;
  const g = live.musicDuck.gain;
  const t = live.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(on ? 0.42 : 1, t, on ? 0.04 : 0.25);
}

// ---------------------------------------------------------------- 同時に鳴らす数の上限
/** いま鳴っている SE の数（重なったら小さく、多すぎたら鳴らさない） */
let active = 0;
export const MAX_SOUNDS = 22;
export const soundsNow = (): number => active;
/** 鳴らしてよければ、重なりに合わせた大きさ（0〜1）。だめなら 0。sec 秒後に数からはずす */
export function claim(sec: number, important = false): number {
  if (active >= MAX_SOUNDS && !important) return 0;
  active += 1;
  setTimeout(() => { active = Math.max(0, active - 1); }, Math.max(30, sec * 1000));
  return 1 / Math.sqrt(1 + (active - 1) / 5);
}
