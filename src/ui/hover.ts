// マウスオーバーで出す説明の吹き出し（PC。マウスのない端末では何もしない）。
// 使い方：要素に data-tip="説明"（改行は \n）を付けるだけ。見出しを付けるなら data-tip-title="名前"。
// 中身の要素を作り直しても（innerHTML で描き直しても）そのまま効く（document で見張る）。

import { canHover } from './device';

let tipEl: HTMLElement | null = null;
let cur: HTMLElement | null = null;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function place(t: HTMLElement, tip: HTMLElement): void {
  const r = t.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(vw - w - 8, x));
  // 下に入らなければ上に
  let y = r.bottom + 8;
  if (y + h > vh - 8) y = Math.max(8, r.top - h - 8);
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function show(t: HTMLElement): void {
  const text = t.dataset.tip ?? '';
  if (!text) return;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'hover-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.append(tipEl);
  }
  cur = t;
  const title = t.dataset.tipTitle;
  tipEl.innerHTML = `${title ? `<b>${esc(title)}</b>` : ''}${esc(text).replace(/\\n|\n/g, '<br>')}`;
  tipEl.classList.add('on');
  place(t, tipEl);
}

/**
 * 説明を、その要素のそばに少しの間だけ出す（スマホ：スイッチを切りかえたときなど、触った返事として意味を見せる）。
 * PC はマウスを乗せれば出るので、何もしない
 */
let flashTimer = 0;
export function flashTip(t: HTMLElement, ms = 2200): void {
  if (canHover() || !t.dataset.tip) return;
  show(t);
  tipEl?.classList.add('k-taptip');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { if (cur === t) hideTip(); }, ms);
}

/** いま出ている説明を消す */
export function hideTip(): void {
  cur = null;
  tipEl?.classList.remove('on');
}

/** マウスオーバーの説明を始める（1 回だけ呼ぶ） */
export function initHover(): void {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !canHover()) return;
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]');
    if (t === cur) return;
    if (!t) { hideTip(); return; }
    show(t);
  });
  document.addEventListener('pointerout', (e) => {
    if (!cur) return;
    const to = e.relatedTarget as Node | null;
    if (to && cur.contains(to)) return;
    hideTip();
  });
  // 押したら・動かしたら消す（クリックで中身が描き直されると、残った説明が古くなる）
  document.addEventListener('pointerdown', () => { if (cur) hideTip(); }, true);
  document.addEventListener('scroll', hideTip, true);
  window.addEventListener('blur', hideTip);
}
