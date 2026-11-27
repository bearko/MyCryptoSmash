// 段階とアクセシビリティ：<html> に付ける印（CSS・台の絵・音がここを読む）。
// - data-clown="0..4"：台に宿るピエロの段階。台が直るほど UI の色が戻り、電球が点く（src/styles/kit.css）
// - class "calm"：演出をひかえめに（点滅・ゆれ・全画面の光を弱める）
// - class "big"：文字を大きく（--k-fs）
// - data-q="high|mid|low"：画質

export type Quality = 'high' | 'mid' | 'low';
const root = (): HTMLElement => document.documentElement;

/** 演出をひかえめにしているか */
export const isCalm = (): boolean => root().classList.contains('calm');
/** いまの段階（0..4） */
export const clownStage = (): number => Number(root().dataset.clown ?? 0);
/** 端末の「視差効果を減らす」設定 */
export const prefersCalm = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let wakeTimer = 0;
/**
 * 段階を付ける。wake = true なら「直った瞬間」（電球が左から順に灯る。1.4 秒 html.k-waking）。
 * 変わったときは document に 'kit:clown'（detail: { from, to }）を出す（台の絵・音の担当が聞ける）
 */
export function setClown(n: number, wake = false): void {
  const el = root();
  const to = Math.max(0, Math.min(4, Math.round(n)));
  const had = el.dataset.clown !== undefined;
  const from = clownStage();
  el.dataset.clown = String(to);
  if (!had || from === to) return;
  document.dispatchEvent(new CustomEvent('kit:clown', { detail: { from, to } }));
  if (!wake || to < from) return;
  el.classList.add('k-waking');
  clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(() => el.classList.remove('k-waking'), 1400);
}

/** 設定をページに付ける（main.ts の applySettings が呼ぶ） */
export function applyA11y(s: { calm?: boolean; bigText?: boolean; quality?: Quality }): void {
  const el = root();
  el.classList.toggle('calm', !!s.calm);
  el.classList.toggle('big', !!s.bigText);
  el.dataset.q = s.quality ?? 'high';
}

/** ほこりと傷の 1 枚（段階 0〜2 だけ見える）を足す */
export function mountDust(app: HTMLElement): void {
  if (app.querySelector(':scope > .k-dustlayer')) return;
  const d = document.createElement('i');
  d.className = 'k-dustlayer';
  d.setAttribute('aria-hidden', 'true');
  app.appendChild(d);
}
