// 打楽器と、効果音の「からだ」になる短い音を、その場で計算して作る（純粋。音のファイルは持たない）。
// 1 つずつは 1 秒もない。鳴らすときは、できた波をそのまま再生するだけなので軽い。

export type Wave = Float32Array;

/** いつも同じ並びになる乱数（テストで同じ波になるように） */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const TAU = Math.PI * 2;

function make(sr: number, sec: number, fn: (t: number, i: number) => number): Wave {
  const n = Math.max(1, Math.floor(sr * sec));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = fn(i / sr, i);
  // 終わりのぷつっという音を消す
  const fade = Math.min(n, Math.floor(sr * 0.004));
  for (let i = 0; i < fade; i += 1) out[n - 1 - i] *= i / fade;
  return out;
}

/** 1 次のフィルター（lp：高い音を削る・hp：低い音を削る） */
function onePole(x: Wave, sr: number, hz: number | ((t: number) => number), hp = false): Wave {
  let y = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    const f = typeof hz === 'number' ? hz : hz(i / sr);
    const a = 1 - Math.exp((-TAU * f) / sr);
    y += a * (x[i] - y);
    out[i] = hp ? x[i] - y : y;
  }
  return out;
}

/** 帯だけ通す（2 次） */
function band(x: Wave, sr: number, hz: number | ((t: number) => number), q: number): Wave {
  let lo = 0;
  let bp = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    const f = Math.min(sr * 0.22, typeof hz === 'number' ? hz : hz(i / sr));
    const k = 2 * Math.sin((Math.PI * f) / sr);
    lo += k * bp;
    const hi = x[i] - lo - bp / q;
    bp += k * hi;
    out[i] = bp;
  }
  return out;
}

function noise(sr: number, sec: number, seed: number): Wave {
  const r = rng(seed);
  return make(sr, sec, () => r() * 2 - 1);
}

function mix(...parts: [Wave, number][]): Wave {
  const n = Math.max(...parts.map(([w]) => w.length));
  const out = new Float32Array(n);
  for (const [w, g] of parts) for (let i = 0; i < w.length; i += 1) out[i] += w[i] * g;
  return out;
}

function shape(x: Wave, sr: number, env: (t: number) => number, drive = 1): Wave {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) out[i] = Math.tanh(x[i] * drive) * env(i / sr);
  return out;
}

function norm(x: Wave, peak: number): Wave {
  let m = 0;
  for (let i = 0; i < x.length; i += 1) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i += 1) x[i] *= peak / m;
  return x;
}

/** 金物の地金（割り切れない高さの矩形波を重ねる） */
function metal(sr: number, sec: number, base: number): Wave {
  const fs = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523].map((k) => k * base);
  return make(sr, sec, (t) => {
    let s = 0;
    for (const f of fs) s += Math.sin(TAU * f * t) > 0 ? 1 : -1;
    return s / fs.length;
  });
}

/** 高さが動くサイン波 */
function sweep(sr: number, sec: number, f: (t: number) => number): Wave {
  let ph = 0;
  return make(sr, sec, (t) => {
    ph += (TAU * f(t)) / sr;
    return Math.sin(ph);
  });
}

type Recipe = (sr: number) => Wave;

export const KIT: Record<string, Recipe> = {
  // ---------------------------------------------------------------- ドラム
  kick: (sr) => norm(shape(mix(
    [sweep(sr, 0.34, (t) => 46 + 120 * Math.exp(-t * 34)), 1],
    [onePole(noise(sr, 0.02, 11), sr, 3000), 0.5],
  ), sr, (t) => Math.exp(-t * 9.5), 1.7), 0.95),
  snare: (sr) => norm(mix(
    [shape(sweep(sr, 0.2, (t) => 176 + 90 * Math.exp(-t * 50)), sr, (t) => Math.exp(-t * 26)), 0.6],
    [shape(onePole(noise(sr, 0.24, 23), sr, 1400, true), sr, (t) => Math.exp(-t * 19)), 0.9],
  ), 0.9),
  ghost: (sr) => norm(shape(onePole(noise(sr, 0.08, 29), sr, 2200, true), sr, (t) => Math.exp(-t * 55)), 0.5),
  hat: (sr) => norm(shape(onePole(mix([metal(sr, 0.07, 5400), 0.6], [noise(sr, 0.07, 31), 0.5]), sr, 7000, true), sr, (t) => Math.exp(-t * 85)), 0.7),
  hatO: (sr) => norm(shape(onePole(mix([metal(sr, 0.36, 5400), 0.6], [noise(sr, 0.36, 37), 0.5]), sr, 6500, true), sr, (t) => Math.exp(-t * 9)), 0.7),
  clap: (sr) => {
    const n = band(noise(sr, 0.3, 41), sr, 1500, 1.4);
    return norm(shape(n, sr, (t) => (t < 0.036 ? Math.exp(-((t % 0.012) * 240)) : Math.exp(-(t - 0.036) * 22))), 0.85);
  },
  tom: (sr) => norm(shape(sweep(sr, 0.36, (t) => 92 + 90 * Math.exp(-t * 18)), sr, (t) => Math.exp(-t * 9), 1.3), 0.9),
  crash: (sr) => norm(shape(onePole(mix([metal(sr, 1.5, 3900), 0.5], [noise(sr, 1.5, 43), 0.7]), sr, 4200, true), sr, (t) => Math.exp(-t * 3.2)), 0.8),
  block: (sr) => norm(shape(mix([sweep(sr, 0.09, () => 1180), 1], [sweep(sr, 0.09, () => 1790), 0.5]), sr, (t) => Math.exp(-t * 62)), 0.8),
  tamb: (sr) => {
    const j = make(sr, 0.2, (t) => Math.sin(TAU * 7400 * t) * Math.sin(TAU * 9100 * t) * (0.6 + 0.4 * Math.sin(TAU * 43 * t)));
    return norm(shape(mix([j, 0.7], [onePole(noise(sr, 0.2, 47), sr, 6000, true), 0.6]), sr, (t) => Math.exp(-t * 24)), 0.7);
  },
  tri: (sr) => norm(shape(mix([sweep(sr, 0.9, () => 4186), 1], [sweep(sr, 0.9, () => 5560), 0.45], [sweep(sr, 0.9, () => 9820), 0.2]), sr, (t) => Math.exp(-t * 5.5)), 0.6),
  rim: (sr) => norm(shape(mix([sweep(sr, 0.04, () => 1720), 1], [noise(sr, 0.01, 53), 0.6]), sr, (t) => Math.exp(-t * 120)), 0.8),

  // ---------------------------------------------------------------- 効果音のからだ
  /** 低い「ドン」 */
  thump: (sr) => norm(shape(sweep(sr, 0.22, (t) => 52 + 70 * Math.exp(-t * 40)), sr, (t) => Math.exp(-t * 16), 1.5), 0.95),
  /** ソレノイドの「カチッ」 */
  clack: (sr) => norm(mix(
    [shape(band(noise(sr, 0.05, 59), sr, 2600, 2), sr, (t) => Math.exp(-t * 130)), 1],
    [shape(sweep(sr, 0.05, (t) => 150 + 500 * Math.exp(-t * 200)), sr, (t) => Math.exp(-t * 70)), 0.8],
  ), 0.9),
  /** ばねの「ビヨン」 */
  spring: (sr) => norm(shape(sweep(sr, 0.5, (t) => 210 + 380 * t + 120 * Math.sin(TAU * 27 * t) * Math.exp(-t * 5)), sr, (t) => Math.min(1, t * 200) * Math.exp(-t * 7)), 0.8),
  /** 高い「キラ」 */
  sparkle: (sr) => {
    const r = rng(61);
    const parts: [number, number][] = [];
    for (let i = 0; i < 9; i += 1) parts.push([3200 + r() * 6200, i * 0.035 + r() * 0.02]);
    return norm(make(sr, 0.6, (t) => {
      let s = 0;
      for (const [f, at] of parts) if (t >= at) s += Math.sin(TAU * f * (t - at)) * Math.exp(-(t - at) * 16);
      return s;
    }), 0.6);
  },
  /** 爆発 */
  boom: (sr) => norm(mix(
    [shape(onePole(noise(sr, 1.0, 67), sr, (t) => 300 + 5200 * Math.exp(-t * 7)), sr, (t) => Math.exp(-t * 4.5), 2.2), 0.9],
    [shape(sweep(sr, 0.9, (t) => 34 + 60 * Math.exp(-t * 9)), sr, (t) => Math.exp(-t * 5), 1.6), 1],
  ), 0.95),
  /** 風を切る */
  whoosh: (sr) => norm(shape(band(noise(sr, 0.5, 71), sr, (t) => 500 + 5200 * (t / 0.5) ** 2, 2.2), sr, (t) => Math.sin((Math.PI * t) / 0.5) ** 1.5), 0.8),
  /** 紙がめくれる・帯が走る */
  paper: (sr) => norm(shape(onePole(noise(sr, 0.3, 73), sr, (t) => 900 + 4200 * (t / 0.3), true), sr, (t) => Math.sin((Math.PI * t) / 0.3) ** 0.7 * (0.7 + 0.3 * Math.sin(TAU * 38 * t))), 0.6),
  /** ボタンを押しこむ */
  thock: (sr) => norm(mix(
    [shape(sweep(sr, 0.07, (t) => 130 + 150 * Math.exp(-t * 90)), sr, (t) => Math.exp(-t * 55)), 1],
    [shape(band(noise(sr, 0.02, 79), sr, 3400, 1.5), sr, (t) => Math.exp(-t * 260)), 0.35],
  ), 0.8),
  /** 金属の球が当たる */
  ping: (sr) => norm(shape(mix([sweep(sr, 0.5, () => 2093), 1], [sweep(sr, 0.5, () => 2093 * 2.76), 0.4], [sweep(sr, 0.5, () => 2093 * 5.4), 0.18]), sr, (t) => Math.exp(-t * 11)), 0.7),
  /** レコードのぷちぷち（回しっぱなしにする地の音） */
  crackle: (sr) => {
    const r = rng(83);
    const hiss = onePole(noise(sr, 2, 89), sr, 5000);
    const out = new Float32Array(hiss.length);
    for (let i = 0; i < out.length; i += 1) out[i] = hiss[i] * 0.12;
    for (let k = 0; k < 42; k += 1) {
      const at = Math.floor(r() * (out.length - 200));
      const a = (0.3 + r() * 0.7) * (r() < 0.5 ? 1 : -1);
      const len = 8 + Math.floor(r() * 30);
      for (let i = 0; i < len; i += 1) out[at + i] += a * Math.exp(-i / (len * 0.25));
    }
    // つなぎ目で途切れないように、はじめと終わりをならす
    const f = Math.floor(sr * 0.02);
    for (let i = 0; i < f; i += 1) { out[i] *= i / f; out[out.length - 1 - i] *= i / f; }
    return norm(out, 0.7);
  },
  /** 雑音（歓声・風に使う） */
  noise: (sr) => noise(sr, 2, 97),
};

/** 響きの型（だんだん小さくなる雑音。左右で少し変える） */
export function impulse(sr: number, sec: number, seed: number): Wave {
  const r = rng(seed);
  return make(sr, sec, (t) => (r() * 2 - 1) * Math.exp(-t * (5.5 / sec)) * (t < 0.012 ? t / 0.012 : 1));
}

/** オルガンなどの倍音の並び（PeriodicWave の imag に入れる。[0] は使わない） */
export const HARMONICS: Record<string, number[]> = {
  // カリオペ（蒸気の笛）：基音が太く、偶数の倍音が少し
  calliope: [0, 1, 0.42, 0.2, 0.1, 0.05, 0.03],
  // 手回しオルガン：ドローバーを引いた音
  organ: [0, 1, 0.7, 0.1, 0.5, 0, 0.22, 0, 0.3, 0, 0.08],
  // リードの笛（奇数の倍音。人形劇のクラリネット）
  reed: [0, 1, 0.04, 0.55, 0.03, 0.3, 0.02, 0.14, 0, 0.08],
  // ブラス：倍音が多く、上は少しずつ弱く
  brass: [0, 1, 0.82, 0.7, 0.56, 0.44, 0.34, 0.27, 0.21, 0.16, 0.12, 0.09, 0.07, 0.05],
  // ほこりっぽい細い音（段階 0）
  dusty: [0, 1, 0.12, 0.3, 0.02, 0.1],
  // チップの音（角を少し丸めた矩形波）
  chip: [0, 1, 0, 0.33, 0, 0.18, 0, 0.1, 0, 0.05],
};

export interface Stats { peak: number; rms: number; sec: number }
export function stats(w: Wave, sr: number): Stats {
  let peak = 0;
  let sq = 0;
  for (let i = 0; i < w.length; i += 1) { peak = Math.max(peak, Math.abs(w[i])); sq += w[i] * w[i]; }
  return { peak, rms: Math.sqrt(sq / w.length), sec: w.length / sr };
}
