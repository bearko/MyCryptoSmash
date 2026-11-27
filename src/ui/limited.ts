// ノルマを納めたごほうび：Limited シリーズ（挑戦の間ずっと付く。メリットとデメリットが混ざった札）を選ぶ画面。
// ユーザーの指定：説明の文は出さない。見出しは「Limited Extension」だけ。札は絵・名前・効き目（よいことは黄の帯、デメリットは血の帯）・対象の部品の名前だけ。
// 見た目は limited.css（様式は kit：骨の紙の呪いの札）。スクロールしない：札が入りきらないときは .compact（札は絵と名前、選んだ札の効き目は下の帯）。
// - 選ぶ：タップ（PC はマウスを重ねる）で選んだ状態（札が持ち上がる）。下の「決定」か、選んだ札をもう 1 回タップで決まる。PC は 1 クリックで決まる
// - 選んだ札の対象の部品を、横（スマホは上）の台の絵で見せる（ほかの部品はグレー、対象は黄色い線でかこんで実演。part-view.ts）
// - 閉じる（×）：候補も選ぶ権利も残り、遊んでいないときの画面の左上の「Limited Offer!」から開き直せる
// - 引き直す：GUM（値段はショップと共有の回数で 10 から 2 倍ずつ。挑戦が終わるまで戻らない）
// 選ぶ権利が 2 つ以上あれば、1 つ選ぶと次の候補が並ぶ。ヒートの印を付ける札は、決めたあとに部品を選ぶ（44px 以上のボタン）。

import type { Save } from '../core/save';
import { fmt } from '../core/util';
import './limited.css';
import { cat } from '../core/catalog';
import { music, sfx } from '../core/audio';
import { burst, shake } from './kit';
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
        <button class="limpick-x" data-act="close" data-sfx="none" aria-label="閉じる">${X_ICON}</button></header>
      <div class="limpick-body">
        <div class="limpick-board"><canvas></canvas><b class="lim-board-name"></b></div>
        <div class="limpick-cards"></div>
      </div>
      <div class="lim-detail2 lim-fx" aria-live="polite"></div>
      <div class="limpick-btns"><button class="k-btn k-btn--sub" data-act="reroll" data-sfx="none" aria-label="引き直す"></button><button class="k-btn k-btn--go lim-go" data-act="go" data-sfx="none" disabled>決定</button></div>
    </div>`;
  root.append(el);
  sfx('page');
  const cardsEl = el.querySelector('.limpick-cards') as HTMLElement;
  const marks = el.querySelector('.lim-marks') as HTMLElement;
  const rerollBtn = el.querySelector('[data-act="reroll"]') as HTMLButtonElement;
  const boardEl = el.querySelector('.limpick-board') as HTMLElement;
  const boardName = el.querySelector('.lim-board-name') as HTMLElement;
  const detailEl = el.querySelector('.lim-detail2') as HTMLElement;
  const goBtn = el.querySelector('.lim-go') as HTMLButtonElement;
  const RR_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4L15 9h2.2A5.9 5.9 0 0 0 6.1 11H4a8 8 0 0 1 8-7zm-7.4 11H2l3.5-4L9 15H6.8a5.9 5.9 0 0 0 11.1-2H20a8 8 0 0 1-15.4 2z"/></svg>';
  /** 札が入りきらないとき：札は絵と名前だけにして、選んだ札の効き目を下の帯に出す（スクロールさせない） */
  function fitCards(): void {
    el.classList.remove('compact');
    // 札のそのままの高さと、台の絵（いちばん小さくて 96px）を引いた残りを比べる（札は傾いているので scrollHeight では測らない）
    const body = cardsEl.parentElement as HTMLElement;
    const row = getComputedStyle(body).flexDirection === 'row';
    cardsEl.style.flex = 'none';
    const natural = cardsEl.offsetHeight;
    cardsEl.style.flex = '';
    const room = body.clientHeight - (row ? 0 : 96 + 12);
    if (natural > room + 1) el.classList.add('compact');
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fitCards()) : null;
  ro?.observe(el);
  const board = startPartView(el.querySelector('canvas') as HTMLCanvasElement, save, { gray: true });
  board.set(null);

  function renderTop(): void {
    // 選べる数（2 つ以上）と「次の札は 2 回発動」だけを小さく
    const n = save.quota.picks;
    marks.innerHTML = `${n > 1 ? `<b class="lim-count">×${n}</b>` : ''}${save.quota.doubleNext ? '<b class="lim-twice" title="次の札は 2 回発動">×2</b>' : ''}`;
    const price = rerollPrice(save);
    const can = Number.isFinite(price);
    rerollBtn.disabled = !can || save.gum < price;
    rerollBtn.innerHTML = `${RR_ICON}<img src="${esc(cat.icons.gum)}" alt="GUM"><b>${can ? fmt(price) : '—'}</b>`;
  }
  function renderCards(): void {
    sel = -1;
    cardsEl.className = `limpick-cards c${Math.min(7, cands.length)}`;
    cardsEl.innerHTML = cands.map((id, i) => `<div class="lim-card" role="button" tabindex="0" data-i="${i}" style="--d:${i * 70}ms">
        ${limitedCardBody(id)}<span class="lim-foot"><small class="lim-part">${esc(partName(limitedOf(id).part))}</small></span></div>`).join('');
    showBoard();
    fitCards();
  }
  function showBoard(): void {
    const part = sel >= 0 ? limitedOf(cands[sel]).part : '';
    boardEl.classList.toggle('on', !!part);
    boardName.textContent = part ? partName(part) : '';
    board.set(part || null);
    // 選んだ札の効き目（札が入りきらないときの帯）と「決定」
    const d = sel >= 0 ? limitedOf(cands[sel]) : null;
    detailEl.innerHTML = d ? `<span class="lim-good">${esc(d.good)}</span>${d.bad ? `<span class="lim-bad">${esc(d.bad)}</span>` : ''}` : '';
    goBtn.disabled = sel < 0;
  }
  function select(i: number): void {
    if (i === sel || busy) return;
    sel = i;
    sfx('select', { step: i });
    // 作り直さずに印だけ動かす（入ってくる動きをくり返さない）
    cardsEl.querySelectorAll('.lim-card').forEach((c, k) => c.classList.toggle('sel', k === sel));
    showBoard();
  }
  function close(): void {
    if (el.classList.contains('leaving')) return;
    board.stop();
    ro?.disconnect();
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
    if (act === 'close') { sfx('close'); close(); return; }
    if (act === 'reroll') {
      if (!payReroll(save)) { sfx('deny'); shake(rerollBtn); return; }
      cands = rerollCands(save, rollLimited);
      hooks.changed();
      // GUM を払い、札が配りなおされる
      sfx('coin');
      setTimeout(() => sfx('page'), 120);
      renderTop();
      renderCards();
      return;
    }
    if (act === 'go') { if (sel >= 0) pick(); return; }
    const c = t.closest<HTMLElement>('.lim-card');
    if (!c) return;
    const i = Number(c.dataset.i);
    // 「決定」・選んでいる札をもう 1 回・PC の 1 クリック：決める
    if (i === sel || hover.matches) { sel = i; pick(); return; }
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
    // 決めた：選んだ札が跳ねて弾け、ほかの札は落ちる。BGM に合いの手
    sfx('confirm');
    sfx('shimmer');
    music.hit('fill');
    goBtn.disabled = true;
    cardsEl.querySelectorAll<HTMLElement>('.lim-card').forEach((c, k) => { c.classList.toggle('chosen', k === sel); c.classList.toggle('gone', k !== sel); if (k === sel) burst(c, 12, el); });
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
    // 文は ? の中だけ。見出しは「ヒート ×n」、部品の札は名前と 1 回の上がり方（数字）
    box.innerHTML = `<div class="heatpick-in">
      <h3>ヒート<b>×${want}</b></h3>
      <button type="button" class="k-help" aria-label="説明" data-tip="印を付ける部品を ${want} つ選ぶ。印の部品に当たるたびに、そのプレイの倍率が上がる（台の上で炎が見える）。よく当たる部品ほど、1 回の上がり方は小さい。" data-tip-title="ヒートの印">?</button>
      <div class="heatpick-grid">${choices.map((src) => `<button data-sfx="none" data-src="${src}" aria-pressed="${chosen.includes(src)}"><b>${esc(srcShort(src as GumSrc))}</b><small>+${heatPer(src as GumSrc)}</small></button>`).join('')}</div>
      <button class="k-btn k-btn--go k-btn--wide" data-sfx="none" data-act="ok"${chosen.length < want ? ' disabled' : ''}>決定 <b>${chosen.length}/${want}</b></button>
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
      sfx('select', { step: chosen.length });
      draw();
      return;
    }
    if (t.dataset.act === 'ok' && chosen.length >= want) {
      addHeat(save, chosen);
      save.quota.heatLeft = 0;
      sfx('confirm');
      sfx('explode', { power: 0.5, vol: 0.7 });
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
