export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
/** 1234 → "1,234"、123456 → "123K"、1.5e9 → "1.50B" */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 10000) return Math.floor(n).toLocaleString('en-US');
  let u = 0;
  let v = a;
  while (v >= 1000 && u < UNITS.length - 1) { v /= 1000; u += 1; }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return (n < 0 ? '-' : '') + s + UNITS[u];
}

/** 画像を読み込む（失敗しても止めない） */
const imgCache = new Map<string, HTMLImageElement>();
export function img(url: string): HTMLImageElement {
  let im = imgCache.get(url);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    imgCache.set(url, im);
  }
  return im;
}
export const ready = (im: HTMLImageElement): boolean => im.complete && im.naturalWidth > 0;
