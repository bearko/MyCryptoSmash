// プレイのあとの GUM の発表（RESULT のカードの中）。下の札はいつも「基本額 × 倍率」。
//   1. 出どころごとに「回数」と「基本額」を少ない順に出し、基本額が回って増える
//   2. 出どころの行に掛かる効果：Limited の出どころの倍率と、エクステンションの「行 ×」（装備の並び順）。
//      その行へ飛んで、行が光って額が増える
//   3. ヒート（Limited の印）と、装備のエクステンションの効果が、装備の並び順（左から）に 1 つずつ発動する
//      （+基本額は基本額へ、+倍率と ×倍率は倍率へ。発動しなかった品は「発動せず」。育った品は「育った！」、
//      壊れものは効いたあとにひびが入って砕ける）
//   4. 全体の倍率（スキル・Limited・リーダーの能力・取引）が倍率に掛かる
//   2〜4 は、掛ける直前にその品の絵と効き目をまん中に大きく出し（どの品が効いたかわかるように）、
//   掛かる場所（行・基本額・倍率）へ飛ばしてはめこむ
//   5. 基本額 × 倍率 ＝ 最後の額をド派手に出す
// カードを触ると早送り（最後の額は見せる）。

import { blip, chime, roar, se } from '../core/audio';
import { fmt } from '../core/util';
import { SRC_INFO, type ExtEffect, type GumBoost, type GumSrc } from '../game/tally';
import { FAMILY_INFO } from '../game/exts';

export interface PayoutData {
  rows: { src: GumSrc; n: number; v: number }[];
  rowBoosts: (GumBoost & { src: GumSrc })[];
  exts: ExtEffect[];
  all: GumBoost[];
}
export interface PayoutHooks {
  /** 最後の額が決まった（財布に入れるのはここ） */
  final(total: number): void;
  /** 発表が終わった（ボタンを出す） */
  done(): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mulText = (m: number): string => (m < 10 ? (Math.round(m * 100) / 100).toString() : fmt(m));
/** 小さい額は小数 1 けたまで */
export const fmtPay = (n: number): string => (n < 10 ? (Math.round(n * 10) / 10).toString() : fmt(n));
/** スコアの効果の色：+基本額＝青・+倍率＝赤・×倍率＝紫・行＝水色・エンブレム＝青紫。ヒートは炎の色 */
const KIND_COLOR = { chips: '#3fa9ff', mult: '#ff4f5e', xmult: '#c06bff', row: '#3fd0ff', emblem: '#8f7bff' } as const;
const HEAT_COLOR = '#ff7a2e';
/** 効果の大きな文字 */
function effBig(e: ExtEffect): string {
  if (e.kind === 'chips') return `基本額 +${fmtPay(e.amount)}`;
  if (e.kind === 'mult') return `倍率 +${mulText(e.amount)}`;
  if (e.kind === 'xmult') return `倍率 ×${mulText(e.amount)}`;
  if (e.kind === 'row') return `行 ×${mulText(e.amount)}`;
  return `エンブレム +${Math.round(e.amount)}`;
}

/** 回る数字 */
function roller(el: HTMLElement, fmtFn: (n: number) => string, isFast: () => boolean): { to(v: number, ms: number): void; set(v: number): void } {
  let shown = 0;
  let goal = 0;
  return {
    set(v) { shown = v; goal = v; el.textContent = fmtFn(v); },
    to(v, ms) {
      const from = shown;
      goal = v;
      const t0 = performance.now();
      const step = (now: number): void => {
        if (goal !== v) return;
        const k = isFast() ? 1 : Math.min(1, (now - t0) / ms);
        shown = from + (v - from) * (1 - (1 - k) ** 3);
        el.textContent = fmtFn(shown);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
  };
}

export function runPayout(box: HTMLElement, card: HTMLElement, d: PayoutData, hooks: PayoutHooks): void {
  box.innerHTML = `
    <div class="pay">
      <div class="pay-list"></div>
      <div class="pay-boosts" hidden></div>
      <div class="pay-total">
        <div class="pay-cm"><span class="pay-chips"><small>基本額</small><b>0</b></span><i>×</i><span class="pay-mult"><small>倍率</small><b>1</b></span></div>
        <span class="pay-label" hidden>GUM GET!</span><b class="pay-num" hidden>0</b>
      </div>
    </div>`;
  const list = box.querySelector('.pay-list') as HTMLElement;
  const boosts = box.querySelector('.pay-boosts') as HTMLElement;
  const total = box.querySelector('.pay-total') as HTMLElement;
  const chipsBox = box.querySelector('.pay-chips') as HTMLElement;
  const multBox = box.querySelector('.pay-mult') as HTMLElement;
  const num = box.querySelector('.pay-num') as HTMLElement;
  card.classList.add('paying');

  let fast = false;
  const skip = (): void => { fast = true; };
  card.addEventListener('pointerdown', skip);
  const wait = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, fast ? 0 : ms));
  const isFast = (): boolean => fast;
  const chipsN = roller(chipsBox.querySelector('b') as HTMLElement, fmtPay, isFast);
  const multN = roller(multBox.querySelector('b') as HTMLElement, mulText, isFast);
  const finalN = roller(num, fmtPay, isFast);
  multN.set(1);
  const punch = (el: HTMLElement, s = 1.3): void => {
    el.animate([{ transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: fast ? 1 : 320, easing: 'cubic-bezier(0.3,1.8,0.4,1)' });
  };
  const shake = (): void => {
    card.animate([{ transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -4px)' }, { transform: 'none' }], { duration: fast ? 1 : 180 });
  };

  /** 掛ける直前：品の絵と効き目をまん中に大きく出し、掛かる場所へ飛ばす */
  const spotlight = async (o: { name: string; sub: string; img?: string; color: string; big: string }, target: HTMLElement): Promise<void> => {
    if (fast) return;
    const sp = document.createElement('div');
    sp.className = 'pay-spot';
    sp.style.setProperty('--c', o.color);
    sp.innerHTML = `<i class="ps-rays"></i>${o.img ? `<img src="${o.img}" alt="">` : ''}<b>${esc(o.name)}</b><small>${esc(o.sub)}</small><em>${esc(o.big)}</em>`;
    card.appendChild(sp);
    se('buff', 0.55, 0, 1.1);
    blip(660, 0.18, 'triangle', 0.06, 1.8);
    await wait(820);
    if (fast) { sp.remove(); return; }
    const sr = sp.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const dx = tr.left + tr.width / 2 - (sr.left + sr.width / 2);
    const dy = tr.top + tr.height / 2 - (sr.top + sr.height / 2);
    const k = Math.max(0.15, Math.min(1, tr.height / sr.height));
    sp.classList.add('fly');
    await sp.animate(
      [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${k})`, opacity: 0.4 }],
      { duration: 340, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
    ).finished.catch(() => undefined);
    sp.remove();
    blip(180, 0.1, 'square', 0.08, 0.6);
  };
  /** 効き目の札（発表した順に並ぶ） */
  const addCard = (o: { name: string; sub: string; img?: string; color: string; big: string; off?: boolean }): HTMLElement => {
    const el = document.createElement('div');
    el.className = `pay-boost wait${o.off ? ' off' : ''}`;
    el.style.setProperty('--c', o.color);
    el.innerHTML = `${o.img ? `<img src="${o.img}" alt="">` : '<i></i>'}<div><b>${esc(o.name)}</b><small>${esc(o.sub)}</small></div><em>${esc(o.big)}</em>`;
    boosts.appendChild(el);
    boosts.scrollTop = boosts.scrollHeight;
    return el;
  };
  const showCard = (el: HTMLElement): void => { el.classList.remove('wait'); el.classList.add('on'); };
  /** 育った：札に「育った！」 */
  const grewMark = (el: HTMLElement, lv: number): void => {
    const g = document.createElement('span');
    g.className = 'pay-grew';
    g.textContent = `育った！ ${lv}`;
    el.appendChild(g);
    if (!fast) { blip(880, 0.1, 'triangle', 0.06, 1.8); setTimeout(() => blip(1320, 0.12, 'triangle', 0.05, 1.6), 90); }
  };
  /** 壊れた：ひびが入って砕ける（札は暗く残る） */
  const shatter = async (el: HTMLElement): Promise<void> => {
    el.classList.add('cracking');
    if (!fast) blip(1400, 0.05, 'square', 0.05, 0.5);
    await wait(380);
    el.classList.add('broke');
    for (let i = 0; i < 9; i += 1) {
      const sh = document.createElement('i');
      sh.className = 'pay-shard';
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
      sh.style.setProperty('--dx', `${Math.cos(a) * (40 + Math.random() * 50)}px`);
      sh.style.setProperty('--dy', `${Math.sin(a) * (30 + Math.random() * 40) - 20}px`);
      sh.style.setProperty('--r', `${(Math.random() - 0.5) * 540}deg`);
      el.appendChild(sh);
    }
    const t = document.createElement('span');
    t.className = 'pay-broke';
    t.textContent = '壊れた！';
    el.appendChild(t);
    if (!fast) { se('blast', 0.45, 0, 1.6); blip(220, 0.25, 'sawtooth', 0.06, 0.4); }
    await wait(420);
  };

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
      chipsN.to(sum(), gap * 0.9);
      if (!fast) chime(step);
      step += 1;
      await wait(gap);
    }
    if (!d.rows.length) {
      list.innerHTML = '<p class="pay-empty">このプレイの GUM はなし</p>';
      await wait(500);
    }
    await wait(300);
    punch(chipsBox, 1.2);
    blip(520, 0.12, 'square', 0.06, 1.2);
    await wait(400);

    // 2. Limited の出どころの倍率：その行に掛かる
    for (const b of d.rowBoosts) {
      const el = rowEl.get(b.src);
      const v = vals.get(b.src);
      if (!el || v === undefined) continue;
      el.scrollIntoView({ block: 'nearest' });
      await spotlight({ ...b, big: `×${mulText(b.mul)}` }, el);
      el.classList.add('boosted');
      const tag = document.createElement('em');
      tag.className = 'pay-tag';
      tag.textContent = `×${mulText(b.mul)}`;
      el.appendChild(tag);
      const note = document.createElement('div');
      note.className = 'pay-note';
      note.innerHTML = `${b.img ? `<img src="${b.img}" alt="">` : ''}<span>${esc(b.name)}</span>`;
      el.appendChild(note);
      vals.set(b.src, v * b.mul);
      (el.querySelector('b') as HTMLElement).textContent = fmtPay(v * b.mul);
      chipsN.to(sum(), 500);
      if (!fast) se('buff', 0.5, 0, 1.2);
      punch(el, 1.08);
      await wait(700);
    }
    // エクステンションの「行 ×」：その行へ飛ぶ（装備の並び順）
    for (const e of d.exts) {
      if (e.kind !== 'row' || !e.fired || !e.src) continue;
      const el = rowEl.get(e.src);
      const v = vals.get(e.src);
      if (!el || v === undefined) continue;
      el.scrollIntoView({ block: 'nearest' });
      const color = e.fam ? FAMILY_INFO[e.fam].color : KIND_COLOR.row;
      await spotlight({ name: e.name, sub: e.sub, img: e.img, color, big: `×${mulText(e.amount)}` }, el);
      el.classList.add('boosted');
      const tag = document.createElement('em');
      tag.className = 'pay-tag';
      tag.textContent = `×${mulText(e.amount)}`;
      el.appendChild(tag);
      const note = document.createElement('div');
      note.className = 'pay-note';
      note.innerHTML = `${e.img ? `<img src="${e.img}" alt="">` : ''}<span>${esc(e.name)}</span>`;
      el.appendChild(note);
      vals.set(e.src, v * e.amount);
      (el.querySelector('b') as HTMLElement).textContent = fmtPay(v * e.amount);
      chipsN.to(sum(), 500);
      if (!fast) se('buff', 0.5, 0, 1.3);
      punch(el, 1.1);
      if (e.grew) grewMark(note, e.grew);
      if (e.broke) await shatter(note);
      await wait(650);
    }

    // 3・4. 装備の効果（左から）→ 全体の倍率
    let chips = sum();
    let mult = 1;
    if (d.exts.length || d.all.length) {
      list.classList.add('folded');
      await wait(380);
      list.hidden = true;
      boosts.hidden = false;
    }
    let k = 0;
    for (const e of d.exts) {
      if (e.kind === 'row' && e.fired && e.src && rowEl.has(e.src)) continue; // 行へ飛んだ（上で出した）
      const color = e.heat ? HEAT_COLOR : e.fam ? FAMILY_INFO[e.fam].color : KIND_COLOR[e.kind];
      const big = effBig(e);
      if (!e.fired) {
        const el = addCard({ name: e.name, sub: e.sub, img: e.img, color: '#5a6080', big: '発動せず', off: true });
        showCard(el);
        if (!fast) blip(220, 0.08, 'triangle', 0.04, 0.8);
        await wait(420);
        continue;
      }
      const el = addCard({ name: e.name, sub: e.sub, img: e.img, color, big });
      if (e.heat) el.classList.add('heat');
      if (e.kind === 'emblem') {
        await spotlight({ name: e.name, sub: e.sub, img: e.img, color, big }, el);
        showCard(el);
        if (!fast) { chime(14); blip(990, 0.1, 'square', 0.06, 1.6); }
        await wait(520);
        continue;
      }
      const target = e.kind === 'chips' || e.kind === 'row' ? chipsBox : multBox;
      await spotlight({ name: e.name, sub: e.sub, img: e.img, color, big }, target);
      showCard(el);
      if (e.kind === 'chips') { chips += e.amount; chipsN.to(chips, 520); }
      else if (e.kind === 'row') { chips += (vals.get(e.src as GumSrc) ?? 0) * (e.amount - 1); chipsN.to(chips, 520); }
      else { mult = e.kind === 'mult' ? mult + e.amount : mult * e.amount; multN.to(mult, 520); }
      punch(target, 1.25 + Math.min(0.25, k * 0.05));
      shake();
      if (!fast) { chime(12 + k * 2); blip(300 + k * 90, 0.16, 'sawtooth', 0.06, 2.4); }
      k += 1;
      if (e.grew) grewMark(el, e.grew);
      if (e.broke) await shatter(el);
      await wait(Math.max(380, 700 - k * 50));
    }
    for (const b of d.all) {
      const el = addCard({ ...b, big: `×${mulText(b.mul)}` });
      await spotlight({ ...b, big: `倍率 ×${mulText(b.mul)}` }, multBox);
      showCard(el);
      mult *= b.mul;
      multN.to(mult, 520);
      punch(multBox, 1.25 + Math.min(0.25, k * 0.05));
      shake();
      if (!fast) { chime(12 + k * 2); blip(300 + k * 90, 0.16, 'sawtooth', 0.06, 2.4); }
      k += 1;
      await wait(Math.max(380, 700 - k * 50));
    }

    // 5. 基本額 × 倍率 ＝ 最後の額（基本額と倍率がぶつかって 1 つの額になる）
    fast = false;
    await wait(300);
    total.classList.add('merge');
    blip(140, 0.4, 'sawtooth', 0.08, 4);
    await wait(420);
    const money = chips * mult;
    boosts.classList.add('folded');
    list.classList.add('folded');
    total.classList.remove('merge');
    total.classList.add('final');
    (total.querySelector('.pay-cm') as HTMLElement).hidden = true;
    (total.querySelector('.pay-label') as HTMLElement).hidden = false;
    num.hidden = false;
    finalN.set(0);
    finalN.to(money, 1300);
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
