// 打ち出し待ちの台の上に重ねる、小さな部品（ボタンや大きな枠は出さない）。
// - 打ち出しの案内：「引っぱって離す」の手の動きの絵（文は最小限）。showLaunchHint / hideLaunchHint
//   はじめての人には main.ts がすぐ出す。チュートリアル（ピエロの案内）からも呼べる
// - 遊び方：上の ? のアイコン。タップで開く（PC はマウスオーバーで開く）

import { blip } from '../core/audio';
import { canHover, isPc } from './device';

let hintEl: HTMLElement | null = null;
let hintTimer = 0;

/**
 * 「引っぱって離す」の案内を台の上に重ねる（打ち出すと main.ts が消す）。
 * where：画面（#app）の中の位置（0〜1。省くと台の下のほう、まん中）。text：下に出す短い文（省くと「引っぱって離す」）
 */
export function showLaunchHint(root: HTMLElement, opts: { x?: number; y?: number; text?: string } = {}): void {
  window.clearTimeout(hintTimer);
  if (!hintEl || !hintEl.isConnected) {
    hintEl = document.createElement('div');
    hintEl.className = 'launch-hint';
    hintEl.setAttribute('aria-hidden', 'true');
    hintEl.innerHTML = `<i class="lh-arrow"></i><i class="lh-line"></i><i class="lh-dot"></i>
      <svg class="lh-hand" viewBox="0 0 48 56" width="48" height="56"><path fill="#fff" stroke="#0a0d1c" stroke-width="3" stroke-linejoin="round"
        d="M17 6c0-3 5-3 5 0v18l2-1V12c0-3 5-3 5 0v12l2-.5V15c0-3 5-3 5 0v10l1.5-.3V20c0-3 5-3 5 0v14c0 10-6 18-15 18h-3c-6 0-9-3-12-8L5 34c-2-3 2-6 5-3l7 7z"/></svg>
      <b class="lh-text"></b>`;
    root.append(hintEl);
  }
  hintEl.style.left = `${(opts.x ?? 0.5) * 100}%`;
  hintEl.style.top = `${(opts.y ?? 0.56) * 100}%`;
  (hintEl.querySelector('.lh-text') as HTMLElement).textContent = opts.text ?? (isPc() ? 'マウスで引っぱって離す' : '引っぱって離す');
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

/** 遊び方の中身（スマホと PC で操作の書き方を変える） */
function helpHtml(): string {
  const pc = isPc();
  return `<h3>遊び方</h3>
    <ul class="howto">
      <li class="green"><b>${pc ? 'マウスで引っぱって離す' : '引っぱって離す'}：打ち出し・緑</b>${pc ? '台を押して下へ引き、離すと上へ打ち出す' : '画面のどこでも押して下へ引き、離すと上へ打ち出す'}。打ち出すとプレイ（40 秒）が始まる。打ち出したあとは、引いた向きと反対へ飛ぶ</li>
      <li class="red"><b>${pc ? 'W・A・S・D で傾ける：赤' : '傾ける：赤'}</b>打ち出したあと、傾けた向きへ球が少し曲がる</li>
      <li class="blue"><b>${pc ? 'スペースで揺らす：青' : '振る：青'}</b>台を揺らして、球を振った向きへ飛ばす</li>
      <li class="aff">赤い敵は<span class="c-blue">青</span>、青い敵は<span class="c-green">緑</span>、緑の敵は<span class="c-red">赤</span>に弱い</li>
    </ul>
    <p class="rule">フリッパーは自動。稼いだ GUM は<b>入金口</b>へ。<b>3 プレイ以内</b>にノルマを納められなければ GAME OVER。</p>
    ${pc ? '' : '<p class="note">はじめに持った角度が「水平」になります。遊んでいる間は左下の「水平リセット」で合わせ直せます。</p>'}`;
}

/** 上の ? のアイコンと、遊び方の吹き出しをつなぐ */
export function initHelp(btn: HTMLElement, root: HTMLElement): void {
  const pop = document.createElement('div');
  pop.className = 'help-pop';
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
    blip(700, 0.05, 'square', 0.05, 1.2);
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
