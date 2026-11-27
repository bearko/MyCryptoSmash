// 打ち出し待ちの台の上に重ねる、小さな部品（ボタンや大きな枠は出さない）。
// - 打ち出しの案内：手の動きの絵だけ（押す → 下へ引く → 離すと上へ飛ぶ。文字は出さない）。showLaunchHint / hideLaunchHint
//   はじめての人には main.ts がすぐ出す。チュートリアル（ピエロの案内）からも呼べる
// - 遊び方：上の ? のアイコン。タップで開く（PC はマウスオーバーで開く）。中身は絵 3 コマ（引っぱる・傾ける・振る）とごく短い語、3 すくみの輪

import { sfx } from '../core/audio';
import { canHover, isPc } from './device';
import { atk } from './kit';

let hintEl: HTMLElement | null = null;
let hintTimer = 0;
const HAND = `<svg class="lh-hand" viewBox="0 0 48 56" width="48" height="56"><path fill="#f4efe4" stroke="#0b0a10" stroke-width="3.5" stroke-linejoin="round"
  d="M17 6c0-3 5-3 5 0v18l2-1V12c0-3 5-3 5 0v12l2-.5V15c0-3 5-3 5 0v10l1.5-.3V20c0-3 5-3 5 0v14c0 10-6 18-15 18h-3c-6 0-9-3-12-8L5 34c-2-3 2-6 5-3l7 7z"/></svg>`;

/**
 * 打ち出しの手の動きの絵を台の上に重ねる（打ち出すと main.ts が消す）。
 * where：画面（#app）の中の位置（0〜1。省くと台の下のほう、まん中）。text は読み上げ用（画面には出さない）
 */
export function showLaunchHint(root: HTMLElement, opts: { x?: number; y?: number; text?: string } = {}): void {
  window.clearTimeout(hintTimer);
  if (!hintEl || !hintEl.isConnected) {
    hintEl = document.createElement('div');
    hintEl.className = 'launch-hint';
    hintEl.setAttribute('role', 'img');
    hintEl.innerHTML = `<i class="lh-arrow"></i><i class="lh-line"></i><i class="lh-dot"></i>${HAND}`;
    root.append(hintEl);
  }
  hintEl.style.left = `${(opts.x ?? 0.5) * 100}%`;
  hintEl.style.top = `${(opts.y ?? 0.56) * 100}%`;
  hintEl.setAttribute('aria-label', opts.text ?? (isPc() ? 'マウスで引っぱって離す' : '引っぱって離す'));
  hintEl.classList.remove('out');
  hintEl.classList.add('on');
}
/** 案内を消す */
export function hideLaunchHint(): void {
  if (!hintEl) return;
  const el = hintEl;
  el.classList.add('out');
  el.classList.remove('on');
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { if (el.classList.contains('out')) el.remove(); if (hintEl === el && !el.isConnected) hintEl = null; }, 400);
}
export const launchHintShown = (): boolean => !!hintEl?.classList.contains('on');

/** 3 コマの絵（CSS で動く小さなスマホと球） */
const PHONE = '<i class="hp-phone"><i class="hp-ball"></i></i>';
/** 遊び方の中身：絵 3 コマとごく短い語。くわしい決まりは置かない（遊べば分かる。ノルマは台の上の液晶と入金口が見せる） */
function helpHtml(): string {
  const pc = isPc();
  const cell = (k: 'green' | 'red' | 'blue', word: string, key: string, say: string): string =>
    `<li class="hp-cell" data-k="${k}" aria-label="${say}"><div class="hp-pic">${PHONE}${k === 'green' ? `<i class="hp-finger"></i>` : k === 'blue' ? '<i class="hp-wave"></i>' : ''}</div><p>${atk(k)}<b>${word}</b></p>${pc ? `<kbd>${key}</kbd>` : ''}</li>`;
  return `<ul class="hp-cells">
      ${cell('green', '引っぱる', 'DRAG', '押して下へ引っぱり、離すと打ち出す。打ち出すと 40 秒のプレイが始まる')}
      ${cell('red', '傾ける', 'W A S D', '傾けた向きへ球が少し曲がる')}
      ${cell('blue', '振る', 'SPACE', '台を揺らして、球を振った向きへ飛ばす')}
    </ul>
    <p class="hp-weak" aria-label="赤い敵は青に、青い敵は緑に、緑の敵は赤に弱い">${atk('blue')}<i></i>${atk('red')}<i></i>${atk('green')}<i></i>${atk('blue')}</p>`;
}

/** 上の ? のアイコンと、遊び方の吹き出しをつなぐ */
export function initHelp(btn: HTMLElement, root: HTMLElement): void {
  const pop = document.createElement('div');
  pop.className = 'help-pop';
  btn.dataset.sfx = 'none';
  pop.hidden = true;
  root.append(pop);
  let pinned = false;
  const open = (pin: boolean): void => {
    pinned = pin || pinned;
    if (!pop.hidden) return;
    pop.innerHTML = helpHtml();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };
  const close = (): void => {
    pinned = false;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx(pop.hidden || !pinned ? 'open' : 'close');
    if (!pop.hidden && pinned) close();
    else open(true);
  });
  // PC：マウスを乗せると開き、離すと閉じる（クリックすると開いたまま）
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && canHover()) open(false); });
  btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) close(); });
  // ほかを触ると閉じる
  document.addEventListener('pointerdown', (e) => {
    if (pop.hidden) return;
    const t = e.target as Node;
    if (pop.contains(t) || btn.contains(t)) return;
    close();
  }, true);
}
