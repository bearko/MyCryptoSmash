// ショップの最上段（ギミック）の見本：品を触ると、その仕掛けと球だけを暗い舞台に出して実演を流す（台は映さない）。
// 実演は part-view.ts の solo（Limited の札と共通のしくみ。その仕掛けだけを付けた写しの台で動かす。GUM やセーブは変わらない）。
// 下に「買う」（値段）、上に閉じるボタン。説明の文は ? を触ったとき（PC はマウスを重ねたとき）だけ。
// 買うと、台の絵の上に判（SOLD）が押されてから閉じ、取り付けの演出（gimmick.ts の showToyGet）へ続く。

import type { Save } from '../core/save';
import { sfx } from '../core/audio';
import { shake } from './kit';
import { fmt } from '../core/util';
import { PARTS } from '../game/parts';
import { TOY_NAME, TOY_SHORT, type ToyId } from '../game/toys';
import { startPartView } from './part-view';
import { toyThumbImg } from './toy-thumb';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export interface ToyPreviewOpts {
  price: number;
  /** もう台に付いている（買えない） */
  owned: boolean;
  /** 買う。買えたら「判が押されたあとにすること」を返す（買えなければ null） */
  buy(): (() => void) | null;
  /** 閉じた */
  closed(): void;
}

/** 見本を開く。返り値は閉じる関数 */
export function openToyPreview(host: HTMLElement, save: Save, id: ToyId, o: ToyPreviewOpts): () => void {
  const part = PARTS.find((p) => p.toy === id);
  const el = document.createElement('div');
  el.className = 'tp';
  el.dataset.toy = id;
  el.innerHTML = `
    <div class="tp-card">
      <header class="tp-head">
        ${toyThumbImg(id, save)}
        <h3>${esc(TOY_NAME[id] ?? id)}</h3>
        <button class="tp-help" data-act="help" data-sfx="none" aria-label="説明"></button>
        <button class="tp-x" data-act="close" data-sfx="none" aria-label="閉じる"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg></button>
      </header>
      <div class="tp-view"><canvas></canvas><p class="tp-what" hidden>${esc(TOY_SHORT[id] ?? part?.what ?? '')}</p></div>
      <footer class="tp-foot">
        ${o.owned ? '<span class="tp-own">SOLD</span>' : `<button class="k-btn k-btn--go k-btn--big tp-buy${save.emblems < o.price ? ' is-off poor' : ''}" data-act="buy" data-sfx="none"><span>買う</span><b><i class="emb"></i>${fmt(o.price)}</b></button>`}
      </footer>
    </div>`;
  host.append(el);
  const cv = el.querySelector('canvas') as HTMLCanvasElement;
  const what = el.querySelector('.tp-what') as HTMLElement;
  // 実演：台は映さず、この仕掛けと球だけ（part-view.ts の solo。ユーザーの指定：どう動く仕掛けかが分かるように）
  const board = startPartView(cv, save, { solo: true });
  board.set(part?.id ?? null, [id]);

  const close = (): void => {
    if (el.classList.contains('leaving')) return;
    board.stop();
    window.removeEventListener('keydown', onKey);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
    o.closed();
  };
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const helpBtn = el.querySelector('.tp-help') as HTMLElement;
  helpBtn.addEventListener('pointerenter', () => { if (hover.matches) what.hidden = false; });
  helpBtn.addEventListener('pointerleave', () => { if (hover.matches) what.hidden = true; });
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    // 札の外（暗いところ）を触ると閉じる
    if (!t) { if (!(e.target as HTMLElement).closest('.tp-card')) close(); return; }
    const act = t.dataset.act;
    if (el.classList.contains('bought')) return;
    if (act === 'close') { sfx('close'); close(); }
    else if (act === 'help') { what.hidden = !what.hidden; sfx('toggle'); }
    else if (act === 'buy') {
      const after = o.buy();
      if (!after) { shake(t); sfx('deny'); return; }
      // 買った：台の絵が光り、判が押される。少し見せてから閉じて、取り付けの演出へ
      sfx('buy');
      el.classList.add('bought');
      const stamp = document.createElement('b');
      stamp.className = 'tp-stamp';
      stamp.textContent = 'SOLD';
      el.querySelector('.tp-view')?.append(stamp);
      window.setTimeout(() => sfx('stamp'), 110);
      window.setTimeout(() => { close(); after(); }, 620);
    }
  });
  sfx('open');
  return close;
}
