// 実況の声。ことばのかけら（voice-pieces.ts、中身は public/voice-en.bin）を鳴らす。
// しゃべっている間に次のことばが来たら、もうすぐ終わるなら待たずに言い、そうでなければ言わない。
// 大きな場面（priority）だけは割りこむ。どこで失敗しても止めない。

import { audioOut, duckBgm, isMuted } from './audio';
import { PIECES } from './voice-pieces';

/** バイトのかき混ぜを戻す（scripts/pack-voice.mjs と同じ。2 回かけると元に戻る） */
export function scramble(bytes: Uint8Array, at: number): Uint8Array {
  for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= ((at + i) * 131 + 71) & 255;
  return bytes;
}

const INDEX = new Map(PIECES.map(([t], i) => [t, i]));
export const hasLine = (text: string): boolean => INDEX.has(text);

const buffers = new Map<number, AudioBuffer>();
let loading = false;
let enabled = true;
let current: AudioBufferSourceNode | null = null;
let endsAt = 0;
let volume = 1;

export function setVoice(on: boolean): void {
  enabled = on;
  if (!on) stopVoice();
}

/** 最初のタップのあとに呼ぶ（読みこんで、ぜんぶ先に音にしておく） */
export async function loadVoice(): Promise<void> {
  if (loading) return;
  const a = audioOut();
  if (!a) return;
  loading = true;
  try {
    const res = await fetch('voice-en.bin');
    const all = new Uint8Array(await res.arrayBuffer());
    for (let i = 0; i < PIECES.length; i += 1) {
      const [, at, len] = PIECES[i];
      const bytes = scramble(all.slice(at, at + len), at);
      try {
        buffers.set(i, await a.ctx.decodeAudioData(bytes.buffer as ArrayBuffer));
      } catch { /* そのかけらは言わないだけ */ }
    }
  } catch {
    loading = false; // 次の機会にもう一度
  }
}

export function speaking(): boolean {
  const a = audioOut();
  return !!a && a.ctx.currentTime < endsAt;
}

function stopVoice(): void {
  try { current?.stop(); } catch { /* noop */ }
  current = null;
  endsAt = 0;
  duckBgm(false);
}

/** 言えたら秒数、言えなければ 0 */
export function say(text: string, priority = false): number {
  const a = audioOut();
  const i = INDEX.get(text);
  if (!a || i === undefined || !enabled || isMuted()) return 0;
  const buf = buffers.get(i);
  if (!buf) return 0;
  const left = endsAt - a.ctx.currentTime;
  if (left > 0.15 && !priority) return 0;
  if (left > 0) stopVoice();
  try {
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const g = a.ctx.createGain();
    g.gain.value = 1.35 * volume;
    src.connect(g).connect(a.out);
    src.start();
    current = src;
    endsAt = a.ctx.currentTime + buf.duration;
    duckBgm(true);
    src.onended = () => { if (current === src) { current = null; duckBgm(false); } };
    return buf.duration;
  } catch {
    return 0;
  }
}
