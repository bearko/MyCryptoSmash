// 画面（UI）の音。document 全体でボタンの「押す」「乗る」を拾う。
// data-sfx="名前" の付いた要素は、決定（click）のときにその音。付いていないボタンは、押しこみの「コトッ」だけ。
// data-sfx-in="名前" の付いた要素は、画面に足された瞬間にその音（ワイプ・シートなど）。data-sfx="none" で黙る。

import { sfx } from './sfx';

const PRESS = '[data-sfx], button, [role="button"], a[href], summary, select, input[type="checkbox"], input[type="range"], label';

let on = false;
export function initUiSounds(): void {
  if (on || typeof document === 'undefined') return;
  on = true;
  const pan = (e: MouseEvent): number => (window.innerWidth ? (e.clientX / window.innerWidth) * 2 - 1 : 0) * 0.5;
  const find = (e: Event): HTMLElement | null => (e.target instanceof Element ? e.target.closest<HTMLElement>(PRESS) : null);
  document.addEventListener('pointerdown', (e) => {
    const el = find(e);
    if (!el || el.dataset.sfx === 'none') return;
    const off = el.matches(':disabled, [aria-disabled="true"], .disabled');
    sfx(off ? 'deny' : 'tap', { x: pan(e), vol: off ? 0.6 : 1 });
  }, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-sfx]') : null;
    const name = el?.dataset.sfx;
    if (!el || !name || name === 'none') return;
    sfx(name, { x: pan(e), step: Number(el.dataset.sfxStep ?? 0) || 0 });
  }, { capture: true });
  // PC：マウスが乗った
  let lastOver: Element | null = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = find(e);
    if (el === lastOver) return;
    lastOver = el;
    if (el && el.dataset.sfx !== 'none' && !el.matches(':disabled')) sfx('hover', { x: pan(e) });
  }, { capture: true, passive: true });
  // 足された瞬間に鳴る要素
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const name = (n as HTMLElement).dataset?.sfxIn;
        if (name) sfx(name);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
