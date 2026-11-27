// ノルマを納めたごほうび：Limited シリーズ（挑戦の間ずっと付く。メリットとデメリットが混ざった札）を選ぶ画面。
// ユーザーの指定：説明の文は出さない。見出しは「Limited Extension」だけ。札は絵・名前・効き目（よいことは白、デメリットは赤の文）・対象の部品の名前だけ。
// - 選ぶ：タップ（PC はマウスを重ねる）で選んだ状態（光る枠）。選んだ札にだけ「決定」のボタン。選んだ札をもう 1 回タップしても決まる。PC は 1 クリックで決まる
// - 選んだ札の対象の部品を、横（スマホは上）の台の絵で見せる（ほかの部品はグレー、対象は黄色い線でかこんで実演。part-view.ts）
// - 閉じる（×）：候補も選ぶ権利も残り、遊んでいないときの画面の左上の「Limited Offer!」から開き直せる
// - 引き直す：GUM（値段はショップと共有の回数で 10 から 2 倍ずつ。挑戦が終わるまで戻らない）
// 選ぶ権利が 2 つ以上あれば、1 つ選ぶと次の候補が並ぶ。ヒートの印を付ける札は、決めたあとに部品を選ぶ（44px 以上のボタン）。

import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, chime, se } from '../core/audio';
import { limitedById, limitedOf, rollLimited } from '../game/mods';
import { heatChoices, limitedCands, pickLimited, addHeat, rerollCands } from '../game/limiteds';
import { limitedCards, payReroll, rerollPrice } from '../game/quota';
import { heatPer, srcShort } from '../game/exts';
import type { GumSrc } from '../game/tally';
import { PARTS } from '../game/parts';
import { startPartView } from './part-view';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const partName = (id: string): string => PARTS.find((p) => p.id === id)?.name ?? '';
const X_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';

export interface LimitedHooks {
  /** 1 つ選んだ（ヒートの印まで済んだ）：強さを計算し直してセーブ */
  picked(id: number): void;
  /** GUM や候補が変わった */
  changed(): void;
  /** 閉じた（選び終えた・× で閉じた。閉じても候補と選ぶ権利は残る） */
  closed(): void;
}

/** 札の中身：絵・名前・効き目（よいことは白、デメリットは赤） */
export function limitedCardBody(id: number): string {
  const l = limitedById(id);
  const d = limitedOf(id);
  if (!l) return '';
  return `<img src="${esc(l.img)}" alt=""><b>${esc(l.name)}</b>
    <span class="lim-fx"><span class="lim-good">${esc(d.good)}</span>${d.bad ? `<span class="lim-bad">${esc(d.bad)}</span>` : ''}</span>`;
}

/** 選ぶ画面を開く。候補がなければ開かずに null を返す（選ぶ権利も 0 にする） */
export function openLimitedPick(root: HTMLElement, save: Save, hooks: LimitedHooks): HTMLElement | null {
  let cands = limitedCands(save, limitedCards(save.quota), rollLimited);
  if (!cands.length) { save.quota.picks = 0; save.quota.offer = undefined; return null; }
  let sel = -1;
  let busy = false;
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const el = document.createElement('div');
  el.className = 'limpick';
  el.innerHTML = `
    <div class="limpick-in">
      <header class="limpick-head"><h2>Limited Extension</h2><span class="lim-marks"></span>
        <button class="limpick-x" data-act="close" aria-label="閉じる">${X_ICON}</button></header>
      <div class="limpick-body">
        <div class="limpick-board"><canvas></canvas><b class="lim-board-name"></b></div>
        <div class="limpick-cards"></div>
      </div>
      <div class="limpick-btns"><button class="pill" data-act="reroll"></button></div>
    </div>`;
  root.append(el);
  const cardsEl = el.querySelector('.limpick-cards') as HTMLElement;
  const marks = el.querySelector('.lim-marks') as HTMLElement;
  const rerollBtn = el.querySelector('[data-act="reroll"]') as HTMLButtonElement;
  const boardEl = el.querySelector('.limpick-board') as HTMLElement;
  const boardName = el.querySelector('.lim-board-name') as HTMLElement;
  const board = startPartView(el.querySelector('canvas') as HTMLCanvasElement, save, { gray: true });
  board.set(null);

  function renderTop(): void {
    // 選べる数（2 つ以上）と「次の札は 2 回発動」だけを小さく
    const n = save.quota.picks;
    marks.innerHTML = `${n > 1 ? `<b class="lim-count">×${n}</b>` : ''}${save.quota.doubleNext ? '<b class="lim-twice">2 回発動</b>' : ''}`;
    const price = rerollPrice(save);
    const can = Number.isFinite(price);
    rerollBtn.disabled = !can || save.gum < price;
    rerollBtn.innerHTML = `引き直す<small>${can ? `${fmt(price)} GUM` : '—'}</small>`;
  }
  function renderCards(): void {
    sel = -1;
    cardsEl.className = `limpick-cards c${Math.min(7, cands.length)}`;
    cardsEl.innerHTML = cands.map((id, i) => `<div class="lim-card" role="button" tabindex="0" data-i="${i}" style="--d:${i * 70}ms">
        ${limitedCardBody(id)}<span class="lim-foot"><small class="lim-part">${esc(partName(limitedOf(id).part))}</small><button class="lim-go" data-act="go">決定</button></span></div>`).join('');
    showBoard();
  }
  function showBoard(): void {
    const part = sel >= 0 ? limitedOf(cands[sel]).part : '';
    boardEl.classList.toggle('on', !!part);
    boardName.textContent = part ? partName(part) : '';
    board.set(part || null);
  }
  function select(i: number): void {
    if (i === sel || busy) return;
    sel = i;
    blip(760 + i * 80, 0.06, 'square', 0.06, 1.4);
    // 作り直さずに印だけ動かす（入ってくる動きをくり返さない）
    cardsEl.querySelectorAll('.lim-card').forEach((c, k) => c.classList.toggle('sel', k === sel));
    showBoard();
  }
  function close(): void {
    if (el.classList.contains('leaving')) return;
    board.stop();
    window.removeEventListener('keydown', onKey);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    hooks.closed();
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !busy) close();
  };
  window.addEventListener('keydown', onKey);

  // PC：マウスを重ねると選び、1 クリックで決まる
  cardsEl.addEventListener('pointerover', (e) => {
    if (!hover.matches || e.pointerType !== 'mouse') return;
    const c = (e.target as HTMLElement).closest<HTMLElement>('.lim-card');
    if (c) select(Number(c.dataset.i));
  });
  el.addEventListener('click', (e) => {
    if (busy) return;
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close') { blip(420, 0.05, 'square', 0.05, 1); close(); return; }
    if (act === 'reroll') {
      if (!payReroll(save)) return;
      cands = rerollCands(save, rollLimited);
      hooks.changed();
      blip(500, 0.1, 'sawtooth', 0.06, 2);
      renderTop();
      renderCards();
      return;
    }
    const c = t.closest<HTMLElement>('.lim-card');
    if (!c) return;
    const i = Number(c.dataset.i);
    // 「決定」・選んでいる札をもう 1 回・PC の 1 クリック：決める
    if (act === 'go' || i === sel || hover.matches) { sel = i; pick(); return; }
    select(i);
  });
  cardsEl.addEventListener('keydown', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.lim-card');
    if (!c || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    const i = Number(c.dataset.i);
    if (i === sel) pick(); else select(i);
  });

  function pick(): void {
    if (busy || sel < 0) return;
    busy = true;
    const id = cands[sel];
    const r = pickLimited(save, id);
    chime(10);
    cardsEl.querySelectorAll('.lim-card').forEach((c, k) => { c.classList.toggle('chosen', k === sel); c.classList.toggle('gone', k !== sel); });
    if (r.notes.length) {
      const tip = document.createElement('p');
      tip.className = 'lim-notes';
      tip.textContent = r.notes.join('・');
      el.querySelector('.limpick-in')?.appendChild(tip);
    }
    hooks.changed(); // 選んだ札（とこれから選ぶヒートの印の数）を残す
    const after = (): void => {
      hooks.picked(id);
      el.querySelector('.lim-notes')?.remove();
      busy = false;
      // まだ選べる：次の候補を並べる
      if (save.quota.picks > 0) {
        cands = limitedCands(save, limitedCards(save.quota), rollLimited);
        if (cands.length) { hooks.changed(); renderTop(); renderCards(); return; }
        save.quota.picks = 0;
      }
      close();
    };
    const wait = r.notes.length ? 900 : 520;
    if (r.heat > 0 && heatChoices(save).length) setTimeout(() => openHeatPick(el, save, r.heat, () => { el.querySelector('.heatpick')?.remove(); after(); }), wait);
    else setTimeout(after, wait);
  }
  renderTop();
  renderCards();
  return el;
}

/** ヒートの印を付ける部品を n つ選ぶ（Limited の札で） */
function openHeatPick(el: HTMLElement, save: Save, n: number, done: () => void): void {
  const choices = heatChoices(save);
  const want = Math.min(n, choices.length);
  const chosen: string[] = [];
  const box = document.createElement('div');
  box.className = 'heatpick';
  const draw = (): void => {
    box.innerHTML = `<div class="heatpick-in">
      <h3>ヒートの印を付ける部品を <b>${want}</b> つ選ぶ</h3>
      <p>印の部品に当たるたびに、そのプレイの倍率が上がる（台の上で炎が見える）。よく当たる部品ほど、1 回の上がり方は小さい。</p>
      <div class="heatpick-grid">${choices.map((src) => `<button data-src="${src}" aria-pressed="${chosen.includes(src)}"><b>${esc(srcShort(src as GumSrc))}</b><small>1 回 +${heatPer(src as GumSrc)}</small></button>`).join('')}</div>
      <button class="pill main" data-act="ok"${chosen.length < want ? ' disabled' : ''}>決定（${chosen.length} / ${want}）</button>
    </div>`;
  };
  box.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.src) {
      const src = t.dataset.src;
      const i = chosen.indexOf(src);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < want) chosen.push(src);
      else { chosen.shift(); chosen.push(src); }
      blip(600 + chosen.length * 120, 0.06, 'square', 0.05, 1.4);
      draw();
      return;
    }
    if (t.dataset.act === 'ok' && chosen.length >= want) {
      addHeat(save, chosen);
      save.quota.heatLeft = 0;
      se('buff', 0.6, 0, 0.9);
      blip(330, 0.3, 'sawtooth', 0.07, 2.4);
      box.classList.add('lit');
      setTimeout(done, 520);
    }
  });
  draw();
  el.appendChild(box);
}

/** 前に閉じたとき、ヒートの印を選び残していた：選ぶ画面だけを出す */
export function openHeatLeft(root: HTMLElement, save: Save, done: () => void): boolean {
  const n = save.quota.heatLeft ?? 0;
  if (n <= 0 || !heatChoices(save).length) { save.quota.heatLeft = 0; return false; }
  const el = document.createElement('div');
  el.className = 'limpick';
  root.append(el);
  openHeatPick(el, save, n, () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    done();
  });
  return true;
}
