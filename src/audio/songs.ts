// 曲の楽譜（純粋なデータ）。様式は「呪われたカーニバル」：カリオペとオルガン・ファンクのベース・ブレイクビーツ・ブラス。
// どの曲も主音は「レ」で、同じ動機（ラ・レ・ファ・ミ・レ・ド♯ → レ・ラ・シ♭・ラ・ソ♯・ラ）を形を変えて使う。
// c ＝ その楽器が入るピエロの段階（0〜4）、i ＝ 入る盛り上がり（0〜1）、x ＝ その盛り上がりから先は外れる。

import { chordOf, chordTone, noteNum, voicing, type Chord, type Mode } from './theory';

export type SceneName = 'idle' | 'play' | 'boss' | 'shop' | 'lab' | 'result' | 'gameover' | 'ending';

interface Gate { c?: number; i?: number; x?: number; vol?: number }
interface LineSrc extends Gate { pat: string[]; rel?: 'root' | 'tone'; base?: number; gate?: number }
interface StabSrc extends Gate { pat: string[]; center: number; n?: number }
interface DrumSrc extends Gate { pat: string[]; kit: string }
interface SongSrc {
  bpm: number; beats: number; div: number; swing?: number; mode: Mode;
  chords: string[];
  /** リードの音色（HARMONICS の名前）とベースの弾き方 */
  leadWave?: string; bassStyle?: 'funk' | 'pizz' | 'sub';
  lead?: LineSrc; lead2?: LineSrc; bass?: LineSrc; bell?: LineSrc;
  organ?: StabSrc; brass?: StabSrc;
  drums: DrumSrc[];
}

const SONGS: Record<SceneName, SongSrc> = {
  // 打ち出しを待つ台：ワルツのカリオペ。ブンチャッチャ
  idle: {
    bpm: 96, beats: 3, div: 2, mode: 'min', leadWave: 'calliope', bassStyle: 'pizz',
    chords: ['Dm', 'Dm', 'A7', 'A7', 'Gm', 'Dm', 'A7', 'Dm'],
    lead: { pat: [
      'D5 - F5 - A5 -', 'A5 G#5 A5 - F5 -', 'E5 - G5 - Bb5 -', 'A5 - - G5 E5 C#5',
      'D5 - G5 - Bb5 -', 'A5 - F5 - D5 -', 'C#5 - E5 - G5 E5', 'D5 - - - . .',
    ] },
    bass: { c: 1, rel: 'root', base: 38, pat: ['0 - . . . .', '7 - . . . .'], vol: 0.9 },
    organ: { c: 2, center: 62, pat: ['..x.x.'], vol: 0.55 },
    bell: { c: 3, i: 0, pat: [
      'D6 . . . A5 .', '. . A5 . . .', 'E6 . . . Bb5 .', '. . A5 . . .',
      'D6 . . . Bb5 .', '. . F5 . . .', 'C#6 . . . G5 .', 'D6 . . . . .',
    ], vol: 0.5 },
    drums: [
      { kit: 'block', pat: ['x.....'], vol: 0.3, x: 2, c: 0 },
      { kit: 'tri', c: 3, pat: ['x.....', '......'], vol: 0.35 },
      { kit: 'kick', c: 2, pat: ['x.....'], vol: 0.5 },
      { kit: 'hat', c: 2, pat: ['..x.x.'], vol: 0.3 },
      { kit: 'tamb', c: 4, pat: ['..x.x.', '..x.xx'], vol: 0.3 },
    ],
  },
  // プレイ中：ファンクのベースとブレイクビーツ。連鎖で楽器が増える
  play: {
    bpm: 124, beats: 4, div: 4, swing: 0.1, mode: 'min', leadWave: 'calliope', bassStyle: 'funk',
    chords: ['Dm', 'Dm', 'Bb7', 'A7', 'Dm', 'Gm', 'Bb7', 'A7'],
    lead: { pat: [
      'A4 - D5 - F5 E5 D5 C#5', 'D5 - A4 - Bb4 A4 G#4 A4', 'Bb4 - D5 - F5 - Ab5 F5', 'E5 - C#5 - A4 B4 C#5 E5',
      'F5 - A5 - G5 F5 E5 D5', 'G5 - Bb5 - A5 G5 F5 D5', 'F5 - D5 - Bb4 D5 F5 Ab5', 'A5 G5 E5 C#5 A4 - . .',
    ] },
    // 最高潮：オクターブ上でもう 1 本
    lead2: { c: 4, i: 0.75, vol: 0.5, pat: [
      'A5 - D6 - F6 E6 D6 C#6', 'D6 - A5 - Bb5 A5 G#5 A5', 'Bb5 - D6 - F6 - Ab6 F6', 'E6 - C#6 - A5 B5 C#6 E6',
      'F6 - A6 - G6 F6 E6 D6', 'G6 - Bb6 - A6 G6 F6 D6', 'F6 - D6 - Bb5 D6 F6 Ab6', 'A6 G6 E6 C#6 A5 - . .',
    ] },
    bass: { c: 1, rel: 'root', base: 38, pat: [
      '0 . . 0 . . 12 . . 10 . 12 0 . 7 10', '0 . . 0 . . 12 . . 10 . 12 0 . 10 12',
      '0 . . 0 . . 12 . . 10 . 12 0 . 7 10', '0 . . 0 . 0 . 3 . 5 . 6 7 . 10 12',
    ] },
    organ: { c: 2, center: 65, pat: ['..x...x...x..x.x', '..x...x...x.x...'], vol: 0.6 },
    brass: { c: 3, i: 0.3, center: 69, pat: ['................', 'x..x..x.........', '................', 'x.....x..x.x....'], vol: 0.75 },
    bell: { c: 4, i: 0.3, rel: 'tone', base: 74, pat: ['0 1 2 3 4 3 2 1 0 1 2 3 4 5 4 2'], vol: 0.4, gate: 0.6 },
    drums: [
      { kit: 'block', c: 0, x: 0.5, pat: ['x...x...x...x...'], vol: 0.32 },
      { kit: 'block', c: 0, i: 0.5, pat: ['x.x.x.x.x.x.x.xx'], vol: 0.34 },
      { kit: 'kick', c: 1, pat: ['x.....x...x.....', 'x.....x..xx.....'], vol: 0.95 },
      { kit: 'snare', c: 2, pat: ['....x.......x...', '....x.......x..x'], vol: 0.8 },
      { kit: 'rim', c: 1, pat: ['....x.......x...'], vol: 0.4 },
      { kit: 'ghost', c: 2, i: 0.25, pat: ['.......x.x.....x'], vol: 0.5 },
      { kit: 'hat', c: 1, x: 0.4, pat: ['x.x.x.x.x.x.x.x.'], vol: 0.36 },
      { kit: 'hat', c: 1, i: 0.4, pat: ['xoxoxoxoxoxoxoxo'], vol: 0.36 },
      { kit: 'hatO', c: 2, i: 0.2, pat: ['..............x.'], vol: 0.3 },
      { kit: 'clap', c: 4, i: 0.6, pat: ['....x.......x...'], vol: 0.5 },
      { kit: 'tamb', c: 3, i: 0.35, pat: ['..x...x...x...x.', '..x...x...x..xx.'], vol: 0.34 },
      { kit: 'crash', c: 2, i: 0.6, pat: ['x...............', '................', '................', '................'], vol: 0.4 },
    ],
  },
  // ボス・ラストステージ：速い 4 つ打ちと、にごった和音
  boss: {
    bpm: 142, beats: 4, div: 4, mode: 'min', leadWave: 'organ', bassStyle: 'funk',
    chords: ['Dm', 'Eb', 'Dm', 'A7', 'Dm', 'Eb', 'F', 'A7'],
    lead: { pat: [
      'D5 - D5 Eb5 D5 - A4 -', 'Eb5 - Eb5 G5 Bb5 - G5 -', 'A5 - A5 Bb5 A5 - F5 D5', 'C#5 E5 G5 Bb5 A5 - . .',
      'D5 - D5 Eb5 D5 - A4 -', 'G5 - Bb5 - Eb6 - Bb5 G5', 'A5 - C6 - F5 - A5 C6', 'Bb5 A5 G5 E5 C#5 - A4 -',
    ] },
    bass: { c: 0, rel: 'root', base: 38, pat: ['0 . 0 0 12 . 0 0 0 . 0 0 12 . 10 12', '0 . 0 0 12 . 0 0 0 . 0 12 0 12 7 12'] },
    organ: { c: 1, center: 64, pat: ['x.....x...x.....', '..x...x...x.x.x.'], vol: 0.55 },
    brass: { c: 2, center: 68, pat: ['x-......x.x-....', '........x-..x-..'], vol: 0.8 },
    bell: { c: 3, i: 0.4, rel: 'tone', base: 74, pat: ['0 2 1 3 2 4 3 5 4 3 2 4 3 2 1 0'], vol: 0.35, gate: 0.5 },
    drums: [
      { kit: 'kick', pat: ['x...x...x...x...', 'x...x...x...x.x.'], vol: 1 },
      { kit: 'snare', c: 1, pat: ['....x.......x...', '....x.......x.xx'], vol: 0.85 },
      { kit: 'hat', pat: ['..x...x...x...x.'], vol: 0.4, x: 0.3 },
      { kit: 'hat', i: 0.3, pat: ['xoxoxoxoxoxoxoxo'], vol: 0.4 },
      { kit: 'tom', c: 2, pat: ['................', '................', '................', '..........x.x.xx'], vol: 0.7 },
      { kit: 'clap', c: 3, i: 0.5, pat: ['....x.......x...'], vol: 0.5 },
      { kit: 'crash', c: 1, pat: ['x...............', '................', '................', '................'], vol: 0.45 },
    ],
  },
  // ショップ（人形劇）：はねるリズムと、リードの笛
  shop: {
    bpm: 104, beats: 4, div: 2, swing: 0.3, mode: 'min', leadWave: 'reed', bassStyle: 'pizz',
    chords: ['Dm', 'A7', 'Dm', 'D7', 'Gm', 'Dm', 'A7', 'Dm'],
    lead: { pat: [
      'D5 F5 A5 F5 D5 . A4 .', 'C#5 E5 G5 E5 C#5 . A4 .', 'D5 F5 A5 D6 - A5 F5 .', 'F#5 A5 C6 A5 F#5 . D5 .',
      'G5 Bb5 D6 Bb5 G5 . D5 .', 'F5 A5 D6 A5 F5 . D5 .', 'E5 G5 Bb5 A5 G5 E5 C#5 E5', 'D5 - A4 . D5 . . .',
    ], gate: 0.7 },
    bass: { c: 1, rel: 'root', base: 38, pat: ['0 . . . 7 . . .', '0 . . . 7 . 10 .'] },
    organ: { c: 2, center: 64, pat: ['..x...x.', '..x...xx'], vol: 0.5 },
    bell: { c: 3, rel: 'tone', base: 74, pat: ['. . 2 . . . 1 .', '. . 2 . 3 . 1 .'], vol: 0.45 },
    drums: [
      { kit: 'block', pat: ['x...x...', 'x...x.xx'], vol: 0.35 },
      { kit: 'rim', c: 1, pat: ['..x...x.'], vol: 0.4 },
      { kit: 'hat', c: 2, pat: ['.xxx.xxx'], vol: 0.22 },
      { kit: 'tri', c: 3, pat: ['x.......', '........'], vol: 0.3 },
      { kit: 'kick', c: 4, pat: ['x...x...'], vol: 0.5 },
      { kit: 'tamb', c: 4, pat: ['..x...x.'], vol: 0.3 },
    ],
  },
  // ラボ：ゆっくりのアルペジオとこだま
  lab: {
    bpm: 88, beats: 4, div: 4, mode: 'min', leadWave: 'dusty', bassStyle: 'sub',
    chords: ['Dm7', 'BbM7', 'Gm7', 'A7'],
    bell: { rel: 'tone', base: 62, pat: ['0 . 2 . 3 . 5 . 4 . 3 . 2 . 5 .', '0 . 2 . 4 . 6 . 5 . 3 . 2 . 4 .'], vol: 1.6, gate: 0.9 },
    lead: { c: 1, pat: ['A4 - D5 - F5 - E5 -', 'D5 - - - . . F5 -', 'G5 - F5 - D5 - Bb4 -', 'A4 - - - C#5 - E5 -'], vol: 0.7 },
    bass: { c: 1, rel: 'root', base: 38, pat: ['0 - - - - - - - . . . . 0 - . .'], vol: 0.9 },
    organ: { c: 3, center: 60, n: 3, pat: ['x---------------'], vol: 0.3 },
    drums: [
      { kit: 'block', pat: ['x.......x.......'], vol: 0.2 },
      { kit: 'rim', c: 2, pat: ['....x.......x...'], vol: 0.3 },
      { kit: 'hat', c: 2, pat: ['..x...x...x...x.'], vol: 0.18 },
      { kit: 'kick', c: 3, pat: ['x.........x.....'], vol: 0.5 },
      { kit: 'tri', c: 4, pat: ['x...............', '................'], vol: 0.25 },
    ],
  },
  // RESULT：上っていく和音で、発表を待つ
  result: {
    bpm: 116, beats: 4, div: 4, mode: 'min', leadWave: 'calliope', bassStyle: 'pizz',
    chords: ['Dm', 'F', 'G', 'A'],
    lead: { pat: ['D5 - F5 - A5 - . .', 'C5 - F5 - A5 - C6 -', 'D5 - G5 - B5 - D6 -', 'E5 - A5 - C#6 - E6 -'], vol: 0.8 },
    bass: { c: 1, rel: 'root', base: 38, pat: ['0 . . . 0 . . . 0 . . . 0 . 7 .'] },
    organ: { c: 2, center: 64, pat: ['x-----x---x-----'], vol: 0.45 },
    brass: { c: 3, center: 67, pat: ['................', '................', '................', 'x-..x-..x.x.x-..'], vol: 0.6 },
    bell: { c: 3, rel: 'tone', base: 74, pat: ['0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 .'], vol: 0.35 },
    drums: [
      { kit: 'block', x: 1.1, c: 0, pat: ['x...x...x...x...'], vol: 0.25 },
      { kit: 'kick', c: 1, pat: ['x.......x.......'], vol: 0.7 },
      { kit: 'ghost', c: 1, pat: ['xxxxxxxxxxxxxxxx'], vol: 0.22 },
      { kit: 'snare', c: 2, pat: ['................', '................', '................', '........x.x.xxxx'], vol: 0.5 },
      { kit: 'tamb', c: 3, pat: ['..x...x...x...x.'], vol: 0.3 },
    ],
  },
  // GAME OVER：止まりかけのオルゴール
  gameover: {
    bpm: 58, beats: 3, div: 2, mode: 'min', leadWave: 'dusty', bassStyle: 'sub',
    chords: ['Dm', 'Gm', 'A7', 'Dm'],
    lead: { pat: ['A4 - D5 - F5 -', 'E5 - D5 - Bb4 -', 'A4 - C#5 - E5 -', 'D5 - - - . .'], vol: 0.8 },
    bell: { pat: ['. . . . D6 .', '. . . . . .', '. . . . A5 .', '. . D5 . . .'], vol: 0.4 },
    bass: { rel: 'root', base: 38, pat: ['0 - - - . .'], vol: 0.7 },
    drums: [{ kit: 'block', pat: ['x.....', '......'], vol: 0.15 }],
  },
  // エンディング：同じ動機が長調になる
  ending: {
    bpm: 100, beats: 4, div: 4, swing: 0.06, mode: 'maj', leadWave: 'calliope', bassStyle: 'funk',
    chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'Em', 'A'],
    lead: { pat: [
      'A4 - D5 - F#5 E5 D5 C#5', 'D5 - B4 - D5 - F#5 -', 'G5 - B5 - A5 G5 F#5 D5', 'E5 - C#5 - A4 B4 C#5 E5',
      'F#5 - A5 - G5 F#5 E5 D5', 'B5 - A5 - F#5 - D5 -', 'G5 - B5 - E5 - G5 -', 'A5 G5 E5 C#5 A4 - . .',
    ] },
    bass: { c: 0, rel: 'root', base: 38, pat: ['0 . . . 0 . 7 . 12 . . 7 0 . 7 .'] },
    organ: { c: 0, center: 64, pat: ['x-----x---x---x-'], vol: 0.5 },
    brass: { c: 2, center: 69, pat: ['................', '................', '................', 'x-..x-....x.x-..'], vol: 0.6 },
    bell: { c: 1, rel: 'tone', base: 74, pat: ['0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 .'], vol: 0.4 },
    drums: [
      { kit: 'kick', pat: ['x.....x...x.....'], vol: 0.8 },
      { kit: 'snare', pat: ['....x.......x...'], vol: 0.6 },
      { kit: 'hat', pat: ['x.x.x.x.x.x.x.x.'], vol: 0.3 },
      { kit: 'tamb', c: 2, pat: ['..x...x...x...x.'], vol: 0.3 },
      { kit: 'tri', c: 1, pat: ['x...............', '................'], vol: 0.3 },
      { kit: 'crash', c: 3, pat: ['x...............', '................', '................', '................'], vol: 0.35 },
    ],
  },
};

// ---------------------------------------------------------------- 楽譜 → 1 ステップごとの出来事
export interface Note { m: number; len: number; vel: number }
export interface Line { c: number; i: number; x: number; vol: number; ev: (Note | null)[] }
export interface Stab { c: number; i: number; x: number; vol: number; ev: ({ notes: number[]; len: number; vel: number } | null)[] }
export interface Drum { kit: string; c: number; i: number; x: number; vol: number; hits: Float32Array }
export interface Song {
  name: SceneName; bpm: number; beats: number; div: number; swing: number; bars: number; perBar: number; steps: number;
  mode: Mode; chords: Chord[]; leadWave: string; bassStyle: 'funk' | 'pizz' | 'sub';
  lines: Partial<Record<'lead' | 'lead2' | 'bass' | 'bell', Line>>;
  stabs: Partial<Record<'organ' | 'brass', Stab>>;
  drums: Drum[];
}

const gateOf = (g: Gate): { c: number; i: number; x: number; vol: number } => ({ c: g.c ?? 0, i: g.i ?? 0, x: g.x ?? 9, vol: g.vol ?? 1 });
const VEL: Record<string, number> = { x: 1, X: 1.3, o: 0.5 };

function compile(name: SceneName, s: SongSrc): Song {
  const perBar = s.beats * s.div;
  const bars = s.chords.length;
  const steps = bars * perBar;
  const chords = s.chords.map(chordOf);
  const line = (src: LineSrc): Line => {
    const ev: (Note | null)[] = new Array(steps).fill(null);
    for (let b = 0; b < bars; b += 1) {
      const toks = src.pat[b % src.pat.length].trim().split(/\s+/);
      const k = perBar / toks.length;
      if (!Number.isInteger(k)) throw new Error(`${name}: 小節の割りが合わない（${toks.length}）`);
      toks.forEach((tok, j) => {
        if (tok === '.' || tok === '-') return;
        let n = 1;
        while (toks[j + n] === '-') n += 1;
        const tied = n > 1;
        const m = /^-?\d+$/.test(tok)
          ? (src.rel === 'tone' ? chordTone(chords[b], src.base ?? 72, Number(tok)) : (src.base ?? 38) + ((chords[b].root - (src.base ?? 38)) % 12 + 12) % 12 + Number(tok))
          : noteNum(tok);
        ev[b * perBar + j * k] = { m, len: n * k * (tied ? 0.96 : src.gate ?? 0.86), vel: 1 };
      });
    }
    return { ...gateOf(src), ev };
  };
  const stab = (src: StabSrc): Stab => {
    const ev: Stab['ev'] = new Array(steps).fill(null);
    for (let b = 0; b < bars; b += 1) {
      const p = src.pat[b % src.pat.length].replace(/\s/g, '');
      const k = perBar / p.length;
      if (!Number.isInteger(k)) throw new Error(`${name}: 和音の割りが合わない`);
      for (let j = 0; j < p.length; j += 1) {
        const v = VEL[p[j]];
        if (!v) continue;
        let n = 1;
        while (p[j + n] === '-') n += 1;
        ev[b * perBar + j * k] = { notes: voicing(chords[b], src.center, src.n ?? 3), len: n * k * (n > 1 ? 0.95 : 0.6), vel: v };
      }
    }
    return { ...gateOf(src), ev };
  };
  const drum = (src: DrumSrc): Drum => {
    const hits = new Float32Array(steps);
    for (let b = 0; b < bars; b += 1) {
      const p = src.pat[b % src.pat.length].replace(/\s/g, '');
      const k = perBar / p.length;
      if (!Number.isInteger(k)) throw new Error(`${name}: ドラムの割りが合わない`);
      for (let j = 0; j < p.length; j += 1) hits[b * perBar + j * k] = VEL[p[j]] ?? 0;
    }
    return { kit: src.kit, ...gateOf(src), hits };
  };
  const lines: Song['lines'] = {};
  for (const k of ['lead', 'lead2', 'bass', 'bell'] as const) { const src = s[k]; if (src) lines[k] = line(src); }
  const stabs: Song['stabs'] = {};
  for (const k of ['organ', 'brass'] as const) { const src = s[k]; if (src) stabs[k] = stab(src); }
  return {
    name, bpm: s.bpm, beats: s.beats, div: s.div, swing: s.swing ?? 0, bars, perBar, steps, mode: s.mode, chords,
    leadWave: s.leadWave ?? 'calliope', bassStyle: s.bassStyle ?? 'funk', lines, stabs, drums: s.drums.map(drum),
  };
}

export const SCENES = Object.keys(SONGS) as SceneName[];
const cache = new Map<SceneName, Song>();
export function songOf(name: SceneName): Song {
  let s = cache.get(name);
  if (!s) { s = compile(name, SONGS[name]); cache.set(name, s); }
  return s;
}

/** その楽器がいま鳴るか（ピエロの段階と盛り上がり） */
export const gateOn = (g: { c: number; i: number; x: number }, stage: number, heat: number): boolean => stage >= g.c && heat >= g.i && heat < g.x;
