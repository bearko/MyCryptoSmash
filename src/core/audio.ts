// 音の入口。むかしからの呼び方（se・blip・chime・roar・playBgm・duckBgm・buzz）はそのままに、
// 中身は src/audio/（その場で演奏する BGM と、合成の効果音）へつなぐ。音が出ない環境でもゲームは止めない。
// 新しく書くところは sfx('名前', { x, power, step }) と music.scene()・music.hit() を使う。

import { duckForVoice, isMuted, liveCtx, liveRig, setMuted as engineMuted, setVolumes } from '../audio/engine';
import { music, setBoss } from '../audio/music';
import { legacyBlip, legacyChime, legacySe, sfx } from '../audio/sfx';
import { initUiSounds } from '../audio/ui';

export { sfx, music, isMuted, setVolumes };
export type { Snapshot } from '../audio/music';

let unlocked = false;
let hidden = false;

/** 最初のタップの中で呼ぶ（iPhone はタップの中でしか音を始められない） */
export function unlockAudio(): void {
  const c = liveCtx();
  if (!c) return;
  if (c.state !== 'running' && !hidden) void c.resume().catch(() => undefined);
  if (unlocked) return;
  unlocked = true;
  try {
    // 無音を 1 つ鳴らして、出口を開ける
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start();
  } catch { /* noop */ }
}

if (typeof document !== 'undefined') {
  initUiSounds();
  // どこを触っても音が始められるように（導入の画面などでも）
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
  // ページが隠れたら全部止め、もどったら続きから
  document.addEventListener('visibilitychange', () => pauseBgm(document.visibilityState === 'hidden'));
}

export function setMuted(m: boolean): void { engineMuted(m); }

/** 実況の声など、ほかの音の部品が同じ出口を使うため（声のバス） */
export function audioOut(): { ctx: AudioContext; out: GainNode } | null {
  const r = liveRig();
  return r ? { ctx: r.ctx as AudioContext, out: r.voice } : null;
}

/** 実況がしゃべっている間、BGM を下げる */
export function duckBgm(on: boolean): void { duckForVoice(on); }

/** 連続ヒットの音：1 ヒットごとに音階を 1 段ずつ上る */
export function chime(step: number): void { legacyChime(step); }

/** 歓声。strength 0〜1 */
export function roar(strength: number, dur = 1.4): void { sfx('roar', { power: strength, p: dur }); }

/** むかしの呼び方：レイドボスが出た（'boss'）・いなくなった（'field'）。曲そのものは main.ts の music.direct() が画面に合わせて決める */
export function playBgm(key: 'field' | 'boss' | ''): void { setBoss(key === 'boss'); }

/** ページが隠れたとき：音を全部止める（もどったら続きから） */
export function pauseBgm(paused: boolean): void {
  hidden = paused;
  music.pause(paused);
  const c = liveCtx();
  if (!c) return;
  if (paused) void c.suspend().catch(() => undefined);
  else if (unlocked) void c.resume().catch(() => undefined);
}

/** 効果音（むかしは素材の音。いまは合成）。gap ミリ秒以内の連打は間引く */
export function se(key: string, vol = 0.6, gap = 50, rate = 1): void { legacySe(key, vol, gap, rate); }

/** 短い合成音。高さは曲の音階に寄せる */
export function blip(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.12, slide = 1.6): void { legacyBlip(freq, dur, type, vol, slide); }

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
