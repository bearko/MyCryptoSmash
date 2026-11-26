// プレイのあとの GUM の発表（結果のカードの中）。
//   1. 出どころごとに「回数」と「基本額」を少ない順に出し、基本額が回って増える
//   2. 装備の改造がその出どころの行に掛かる（行が光って額が増える）
//   3. 全体の倍率（スキル・Limited・リーダーの能力・取引）が 1 枚ずつ叩きつけられ、合計が倍々になる
//   4. 最後の額をド派手に出す
// カードを触ると早送り（最後まで一気に）。

import { blip, chime, roar, se } from '../core/audio';
import { fmt } from '../core/util';
import { SRC_INFO, type GumBoost, type GumSrc } from '../game/tally';

export interface PayoutData {
  rows: { src: GumSrc; n: number; v: number }[];
  rowBoosts: (GumBoost & { src: GumSrc })[];
  all: GumBoost[];
}
export interface PayoutHooks {
  /** 最後の額が決まった（財布に入れるのはここ） */
  final(total: number): void;
  /** 発表が終わった（ボタンを出す） */
  done(): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 小さい額は小数 1 けたまで */
export const fmtPay = (n: number): string => (n < 10 ? (Math.round(n * 10) / 10).toString() : fmt(n));

export function runPayout(box: HTMLElement, card: HTMLElement, d: PayoutData, hooks: PayoutHooks): void {
  box.innerHTML = `
    <div class="pay">
      <div class="pay-list"></div>
      <div class="pay-boosts" hidden></div>
      <div class="pay-total"><span class="pay-label">基本額</span><b class="pay-num">0</b><i class="pay-mul"></i></div>
    </div>`;
  const list = box.querySelector('.pay-list') as HTMLElement;
  const boosts = box.querySelector('.pay-boosts') as HTMLElement;
  const total = box.querySelector('.pay-total') as HTMLElement;
  const num = box.querySelector('.pay-num') as HTMLElement;
  const label = box.querySelector('.pay-label') as HTMLElement;
  const mulEl = box.querySelector('.pay-mul') as HTMLElement;
  card.classList.add('paying');

  let fast = false;
  const skip = (): void => { fast = true; };
  card.addEventListener('pointerdown', skip);
  const wait = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, fast ? 0 : ms));
  // 数字は目標へ向かって回る
  let shown = 0;
  let goal = 0;
  let rolling = false;
  const roll = (to: number, ms: number): void => {
    const from = shown;
    goal = to;
    const t0 = performance.now();
    const step = (now: number): void => {
      if (goal !== to) return;
      const k = fast ? 1 : Math.min(1, (now - t0) / ms);
      shown = from + (to - from) * (1 - (1 - k) ** 3);
      num.textContent = fmtPay(shown);
      if (k < 1) requestAnimationFrame(step);
      else rolling = false;
    };
    rolling = true;
    requestAnimationFrame(step);
  };
  const punch = (el: HTMLElement, s = 1.3): void => {
    el.animate([{ transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: fast ? 1 : 320, easing: 'cubic-bezier(0.3,1.8,0.4,1)' });
  };
  void rolling;

  const vals = new Map<GumSrc, number>();
  const rowEl = new Map<GumSrc, HTMLElement>();
  const sum = (): number => [...vals.values()].reduce((a, b) => a + b, 0);

  void (async () => {
    await wait(450);
    // 1. 出どころごと（少ない順）
    const gap = Math.max(70, Math.min(260, 2600 / Math.max(1, d.rows.length)));
    let step = 0;
    for (const r of d.rows) {
      const info = SRC_INFO[r.src];
      const el = document.createElement('div');
      el.className = 'pay-row';
      el.style.setProperty('--c', info.color);
      el.innerHTML = `<span class="pay-name">${esc(info.name)}</span><span class="pay-n">${r.n > 0 ? `×${r.n}` : ''}</span><b>${fmtPay(r.v)}</b>`;
      list.appendChild(el);
      list.scrollTop = list.scrollHeight;
      rowEl.set(r.src, el);
      vals.set(r.src, r.v);
      roll(sum(), gap * 0.9);
      if (!fast) chime(step);
      step += 1;
      await wait(gap);
    }
    if (!d.rows.length) {
      list.innerHTML = '<p class="pay-empty">このプレイの GUM はなし</p>';
      await wait(500);
    }
    await wait(350);
    punch(num, 1.25);
    blip(520, 0.12, 'square', 0.06, 1.2);
    await wait(450);

    // 2. 装備の改造：その出どころの行に掛かる
    for (const b of d.rowBoosts) {
      const el = rowEl.get(b.src);
      const v = vals.get(b.src);
      if (!el || v === undefined) continue;
      el.scrollIntoView({ block: 'nearest' });
      el.classList.add('boosted');
      const tag = document.createElement('em');
      tag.className = 'pay-tag';
      tag.textContent = `×${b.mul.toFixed(1)}`;
      el.appendChild(tag);
      const note = document.createElement('div');
      note.className = 'pay-note';
      note.innerHTML = `${b.img ? `<img src="${b.img}" alt="">` : ''}<span>${esc(b.name)}</span>`;
      el.appendChild(note);
      vals.set(b.src, v * b.mul);
      (el.querySelector('b') as HTMLElement).textContent = fmtPay(v * b.mul);
      roll(sum(), 500);
      if (!fast) se('buff', 0.5, 0, 1.2);
      punch(el, 1.08);
      await wait(800);
    }

    // 3. 全体の倍率：1 枚ずつ叩きつけ、合計が倍々になる
    let money = sum();
    if (d.all.length) {
      list.classList.add('folded');
      await wait(fast ? 0 : 380);
      list.hidden = true;
      boosts.hidden = false;
      label.textContent = '合計';
      let mul = 1;
      let k = 0;
      for (const b of d.all) {
        const el = document.createElement('div');
        el.className = 'pay-boost';
        el.style.setProperty('--c', b.color);
        el.innerHTML = `${b.img ? `<img src="${b.img}" alt="">` : '<i></i>'}<div><b>${esc(b.name)}</b><small>${esc(b.sub)}</small></div><em>×${b.mul < 10 ? b.mul.toFixed(2) : fmt(b.mul)}</em>`;
        boosts.appendChild(el);
        boosts.scrollTop = boosts.scrollHeight;
        await wait(260);
        mul *= b.mul;
        money *= b.mul;
        mulEl.textContent = `×${mul < 100 ? mul.toFixed(2) : fmt(mul)}`;
        roll(money, 520);
        punch(total, 1.12 + Math.min(0.25, k * 0.05));
        card.animate([{ transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -4px)' }, { transform: 'none' }], { duration: fast ? 1 : 180 });
        if (!fast) { chime(12 + k * 2); blip(300 + k * 90, 0.16, 'sawtooth', 0.06, 2.4); }
        k += 1;
        await wait(Math.max(380, 760 - k * 60));
      }
    }

    // 4. 最後の額
    fast = false;
    await wait(250);
    boosts.classList.add('folded');
    list.classList.add('folded');
    total.classList.add('final');
    label.textContent = 'GUM GET!';
    mulEl.textContent = '';
    shown = 0;
    roll(money, 1300);
    hooks.final(money);
    se('chest', 0.7, 0);
    roar(1, 2.2);
    for (let i = 0; i < 26; i += 1) {
      const c = document.createElement('i');
      c.className = 'pay-coin';
      c.style.setProperty('--x', `${Math.random() * 100}%`);
      c.style.setProperty('--d', `${Math.random() * 0.8}s`);
      c.style.setProperty('--r', `${(Math.random() - 0.5) * 720}deg`);
      total.appendChild(c);
    }
    await wait(1350);
    se('win', 0.7, 0);
    punch(total, 1.35);
    boosts.hidden = true;
    list.hidden = true;
    card.classList.remove('paying');
    card.removeEventListener('pointerdown', skip);
    hooks.done();
  })();
}
