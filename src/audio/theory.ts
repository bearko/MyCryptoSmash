// 音の高さと拍の計算（純粋。WebAudio を使わないので、テストがそのまま見られる）。
// 曲はどれも「レ」が主音。音の高さは MIDI の番号（A4 = 69）で持つ。

export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
export const ftom = (f: number): number => 69 + 12 * Math.log2(Math.max(1, f) / 440);

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'A4'・'C#5'・'Bb3' → MIDI の番号 */
export function noteNum(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`音名が読めない: ${s}`);
  return NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

export type Quality = 'm' | 'M' | '7' | 'm7' | 'M7' | 'dim';
const QUAL: Record<Quality, number[]> = {
  m: [0, 3, 7], M: [0, 4, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], dim: [0, 3, 6, 9],
};
export interface Chord { root: number; tones: number[] }
/** 'Dm'・'Bb7'・'A7'・'F'・'C#dim' → 根音（0〜11）と、根音からの半音 */
export function chordOf(s: string): Chord {
  const m = /^([A-G])([#b]?)(m7|M7|dim|m|7)?$/.exec(s);
  if (!m) throw new Error(`コードが読めない: ${s}`);
  const root = (NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, tones: QUAL[(m[3] ?? 'M') as Quality] };
}

/** コードの音を center（MIDI）のまわりに n 個並べる（近い転回形） */
export function voicing(ch: Chord, center: number, n = 3): number[] {
  const out: number[] = [];
  const pcs = ch.tones.map((t) => (ch.root + t) % 12);
  // 上の 3 音（7th があるときは 5 度を抜く）で、にごらないように
  const use = pcs.length > n ? [pcs[1], pcs[pcs.length - 1], pcs[0]].slice(0, n) : pcs;
  for (const pc of use) {
    let m = pc + 12 * Math.round((center - pc) / 12);
    if (m < center - 6) m += 12;
    if (m > center + 6) m -= 12;
    out.push(m);
  }
  return out.sort((a, b) => a - b);
}

/** コードの音を下から順に（アルペジオ用。i が音の数をこえたらオクターブ上へ） */
export function chordTone(ch: Chord, base: number, i: number): number {
  const n = ch.tones.length;
  const root = ch.root + 12 * Math.ceil((base - ch.root) / 12);
  return root + ch.tones[((i % n) + n) % n] + 12 * Math.floor(i / n);
}

/** 短調と長調の 5 音（効果音を曲に合わせる。どのコードの上でもにごりにくい） */
export const PENTA = { min: [0, 3, 5, 7, 10], maj: [0, 2, 4, 7, 9] } as const;
export type Mode = keyof typeof PENTA;

/** 音階の段（0 = 主音。5 段で 1 オクターブ）→ MIDI */
export function degree(tonic: number, mode: Mode, step: number): number {
  const sc = PENTA[mode];
  const n = sc.length;
  return tonic + sc[((step % n) + n) % n] + 12 * Math.floor(step / n);
}

/** いちばん近い音階の音へ寄せる（pcs は 0〜11 の集まり） */
export function snap(midi: number, tonic: number, pcs: readonly number[]): number {
  let best = midi;
  let bd = 99;
  for (let o = -1; o <= 1; o += 1) {
    for (const pc of pcs) {
      const base = tonic + pc;
      const c = base + 12 * Math.round((midi - base) / 12) + 12 * o;
      const d = Math.abs(c - midi);
      if (d < bd - 1e-9) { bd = d; best = c; }
    }
  }
  return best;
}

/** 連続ヒットの段：はじめは 5 音の階段を上り、3 オクターブ目からは上の 1 オクターブで回る */
export function chimeStep(step: number): number {
  return step <= 14 ? step : 10 + ((step - 10) % 5);
}

/** 拍の長さ（秒） */
export const beatSec = (bpm: number): number => 60 / bpm;

/** 次の区切り（grid 秒ごと。origin から数える）までの秒数 */
export function toGrid(now: number, origin: number, grid: number): number {
  const k = Math.ceil((now - origin) / grid - 1e-6);
  return origin + k * grid - now;
}
