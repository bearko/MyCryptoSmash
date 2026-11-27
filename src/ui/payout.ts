// プレイのあとの GUM の発表（RESULT の中。このゲームでいちばんの見せ場）。様式は src/styles/show.css の .py-＊。
// 形：入金口から出てくるレシート（出どころの行）→ 並んだ札（装備のエクステンションと、スキルなどの印）→ 基本額と倍率の 2 枚の板 → 合計。
//   1. レシートが 1 行ずつ刷られ、基本額が転がって積み上がる
//   2. 行に掛かる効果（Limited の出どころの倍率・エクステンションの「行 ×」）：札から飛んで、その行に判が押される
//   3. 札が左から順に効く。+基本額＝弧を描いて基本額の板へ／+倍率＝まっすぐ倍率の板へ／×倍率＝大きな判を叩きつける／エンブレム＝上の印へ。
//      こだま（もう 1 回）は輪が 2 つ、うつし鏡・王冠（コピー）は札が裏返る。効かなかった札は震えて伏せる。
//      育った札は ▲ の印、壊れものは割れて落ちる、直った札は光る
//   4. 全体の倍率（スキル・Limited・リーダーの能力・取引）の印が倍率の板を叩く
//   5. 2 枚の板がぶつかって 1 つの合計になる。額の大きさで段が変わる（ふつう・大きい・記録更新・ノルマを一気に納められる）
// 触ると早送り（合計は必ず見せる）。数字は桁が増えるほど大きく・熱くなる（data-heat）。文は置かない（名前は data-tip と aria-label）。

import { buzz, music, sfx } from '../core/audio';
import { fmt } from '../core/util';
import { SRC_INFO, type ExtEffect, type GumBoost, type GumSrc } from '../game/tally';
import { FAMILY_INFO, extDef } from '../game/exts';
import { burst, isCalm } from './kit';

export interface PayoutData {
  rows: { src: GumSrc; n: number; v: number }[];
  rowBoosts: (GumBoost & { src: GumSrc })[];
  exts: ExtEffect[];
  all: GumBoost[];
  /** 段を決める材料：ノルマの額・このプレイの前の手持ち・これまででいちばん大きかった 1 プレイの額（なければ 0） */
  ctx?: { need: number; have: number; best: number };
}
export interface PayoutHooks {
  /** 最後の額が決まった（財布に入れるのはここ） */
  final(total: number): void;
  /** 発表が終わった（入金口を出す）。tier は演出の段 0〜3 */
  done(total: number, tier: number): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 小さい額は小数 1 けたまで（文字） */
export const fmtPay = (n: number): string => (n < 10 ? (Math.round(n * 10) / 10).toString() : fmt(n));
/** 額の見せ方：小数と単位（K・M…）は小さく添える（6.2 → 6 と小さな .2） */
/** 小数がぜんぶ 0 なら出さない（37.0K → 37K。小さな「.0K」は「.OK」に見える） */
const trimZero = (d: string | undefined): string => (d && /[1-9]/.test(d) ? d : '');
/** 数字を 整数・小数・単位 に分けて組む：単位が付く額（12.3K）は小数をそのままの大きさで単位だけ小さく、付かない額は小数を小さく */
function splitNum(text: string): string {
  const m = /^(-?[\d,]+)(\.\d+)?([A-Za-z]*)$/.exec(text);
  if (!m) return esc(text);
  const dec = trimZero(m[2]);
  return m[3] ? `${m[1]}${dec}<small>${m[3]}</small>` : `${m[1]}${dec ? `<small>${dec}</small>` : ''}`;
}
/** 額の見せ方：小数と単位（K・M…）は小さく添える（6.2 → 6 と小さな .2） */
export function payNum(n: number): string {
  return splitNum(fmtPay(n));
}
const mulText = (m: number): string => (m < 10 ? (Math.round(m * 100) / 100).toString() : fmt(m));
const mulNum = (m: number): string => splitNum(mulText(m));
/** 数字の熱さ（桁が増えるほど上がる。0〜6） */
export const heatOf = (n: number): number => (n < 10 ? 0 : Math.min(6, Math.floor(Math.log10(n))));
/** 効果の短い字（札の下と、飛ぶ判） */
function effText(e: ExtEffect): string {
  if (e.kind === 'chips') return `+${fmtPay(e.amount)}`;
  if (e.kind === 'mult') return `+${mulText(e.amount)}`;
  if (e.kind === 'emblem') return `+${Math.round(e.amount)}`;
  return `×${mulText(e.amount)}`;
}
const LINKS = ['again', 'copy', 'copyFirst'];

interface Roller { to(v: number, ms: number): void; set(v: number): void }
/** 転がって増える数字（el の中身は html(v)。data-heat に熱さ） */
function roller(el: HTMLElement, html: (n: number) => string, isFast: () => boolean, tick?: (k: number) => void): Roller {
  let shown = 0;
  let token = 0;
  const put = (v: number): void => { el.innerHTML = html(v); el.dataset.heat = String(heatOf(v)); };
  return {
    set(v) { token += 1; shown = v; put(v); },
    to(v, ms) {
      const from = shown;
      token += 1;
      const my = token;
      const t0 = performance.now();
      let lastTick = 0;
      if (isFast()) { shown = v; put(v); return; }
      const step = (now: number): void => {
        if (my !== token) return;
        const k = isFast() ? 1 : Math.max(0, Math.min(1, (now - t0) / ms));
        shown = from + (v - from) * (1 - (1 - k) ** 3);
        put(k >= 1 ? v : shown);
        if (tick && k < 1 && now - lastTick > 64) { lastTick = now; tick(k); }
        if (k < 1) requestAnimationFrame(step);
        else shown = v;
      };
      requestAnimationFrame(step);
    },
  };
}

export function runPayout(box: HTMLElement, card: HTMLElement, d: PayoutData, hooks: PayoutHooks): void {
  box.innerHTML = `
    <div class="py" data-phase="rows">
      <span class="py-emb" hidden><i class="emb"></i><b>+0</b></span>
      <div class="py-tape"><div class="py-paper"></div></div>
      <div class="py-deck"></div>
      <div class="py-slabs">
        <div class="py-slab py-base"><small>基本額</small><b data-heat="0">0</b></div>
        <i class="py-x" aria-hidden="true"></i>
        <div class="py-slab py-mult"><small>倍率</small><b data-heat="0">1</b></div>
      </div>
      <div class="py-total" hidden><i class="py-rays" aria-hidden="true"></i><span class="py-stamp" hidden></span><b class="py-sum" data-heat="0">0</b><em>GUM</em></div>
    </div>`;
  const py = box.querySelector('.py') as HTMLElement;
  const paper = box.querySelector('.py-paper') as HTMLElement;
  const deck = box.querySelector('.py-deck') as HTMLElement;
  const slabs = box.querySelector('.py-slabs') as HTMLElement;
  const baseBox = box.querySelector('.py-base') as HTMLElement;
  const multBox = box.querySelector('.py-mult') as HTMLElement;
  const totalBox = box.querySelector('.py-total') as HTMLElement;
  const sumEl = box.querySelector('.py-sum') as HTMLElement;
  const stampEl = box.querySelector('.py-stamp') as HTMLElement;
  const embBox = box.querySelector('.py-emb') as HTMLElement;
  card.classList.add('paying');
  const calm = isCalm();

  let fast = false;
  const skip = (): void => { if (!fast) { fast = true; py.classList.add('is-fast'); } };
  card.addEventListener('pointerdown', skip);
  const wait = (ms: number): Promise<void> => (fast ? Promise.resolve() : new Promise((ok) => {
    // 早送りにしたら、待ちをすぐ切り上げる
    const t0 = performance.now();
    const poll = (): void => { if (fast || performance.now() - t0 >= ms) ok(); else setTimeout(poll, Math.min(40, ms)); };
    setTimeout(poll, Math.min(40, ms));
  }));
  const isFast = (): boolean => fast;
  const snd = (name: string, o?: { step?: number; p?: number; vol?: number; power?: number }): void => { if (!fast) sfx(name, o); };
  const baseN = roller(baseBox.querySelector('b') as HTMLElement, payNum, isFast);
  const multN = roller(multBox.querySelector('b') as HTMLElement, mulNum, isFast);
  multN.set(1);
  /** 叩かれた板・札が跳ねる */
  const punch = (el: HTMLElement, s = 1.25, ms = 340): void => {
    if (fast || calm) return;
    el.animate([{ transform: `scale(${s}) rotate(${(Math.random() - 0.5) * 6}deg)` }, { transform: 'none' }], { duration: ms, easing: 'cubic-bezier(0.3,1.9,0.4,1)' });
  };
  /** 画面のゆれ（強さ 1〜3） */
  const quake = (p = 1): void => {
    if (fast || calm) return;
    py.animate([{ transform: `translate(${-4 * p}px, ${2 * p}px)` }, { transform: `translate(${3 * p}px, ${-3 * p}px)` }, { transform: `translate(${-2 * p}px, ${p}px)` }, { transform: 'none' }], { duration: 160 + p * 40 });
  };
  /** 当たった所の輪 */
  const ring = (at: HTMLElement, color: string): void => {
    if (fast || calm) return;
    const r = document.createElement('i');
    r.className = 'py-ring';
    r.style.setProperty('--c', color);
    at.appendChild(r);
    setTimeout(() => r.remove(), 520);
  };
  /** py の中の座標で、要素のまん中 */
  const centre = (el: HTMLElement): { x: number; y: number } => {
    const a = py.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  };
  /**
   * 札から的（板・行・エンブレムの印）へ、効き目の判を飛ばす。
   * arc＝弧を描く（+基本額）／dart＝まっすぐ刺さる（+倍率・行）／slam＝まん中で大きくなって叩きつける（×倍率）／rise＝ふわりと上がる（エンブレム）
   */
  const shoot = async (from: HTMLElement, to: HTMLElement, text: string, how: 'arc' | 'dart' | 'slam' | 'rise', color: string): Promise<void> => {
    if (fast || calm) return;
    const a = centre(from);
    const b = centre(to);
    const s = document.createElement('b');
    s.className = `py-shot py-shot--${how}`;
    s.textContent = text;
    s.style.setProperty('--c', color);
    s.style.left = `${a.x}px`;
    s.style.top = `${a.y}px`;
    py.appendChild(s);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const T = (x: number, y: number, sc: number, r: number): string => `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${sc}) rotate(${r}deg)`;
    let frames: Keyframe[];
    let ms = 360;
    if (how === 'arc') {
      frames = [{ transform: T(0, 0, 0.5, -20), opacity: 0.6 }, { transform: T(dx * 0.45, Math.min(dy * 0.4, -10) - 46, 1.35, 12), opacity: 1, offset: 0.5 }, { transform: T(dx, dy, 0.8, -6), opacity: 1 }];
      ms = 400;
    } else if (how === 'dart') {
      frames = [{ transform: T(0, 0, 0.6, 0), opacity: 0.7 }, { transform: T(-dx * 0.06, -dy * 0.06 - 8, 1.3, -8), opacity: 1, offset: 0.3 }, { transform: T(dx, dy, 0.9, 4), opacity: 1 }];
      ms = 300;
    } else if (how === 'slam') {
      const mid = { x: py.clientWidth / 2 - a.x, y: py.clientHeight * 0.42 - a.y };
      frames = [{ transform: T(0, 0, 0.5, -30), opacity: 0.5 }, { transform: T(mid.x, mid.y, 3.2, -8), opacity: 1, offset: 0.4 }, { transform: T(mid.x, mid.y - 6, 3.5, -5), opacity: 1, offset: 0.7 }, { transform: T(dx, dy, 1, 0), opacity: 1 }];
      ms = 620;
    } else {
      frames = [{ transform: T(0, 0, 0.6, 0), opacity: 0.7 }, { transform: T(dx * 0.3, dy * 0.5 - 18, 1.4, 14), opacity: 1, offset: 0.45 }, { transform: T(dx, dy, 0.7, 0), opacity: 0.9 }];
      ms = 460;
    }
    await s.animate(frames, { duration: ms, easing: how === 'slam' ? 'cubic-bezier(0.6,0,0.9,0.4)' : 'cubic-bezier(0.4,0,0.7,0.2)', fill: 'forwards' }).finished.catch(() => undefined);
    s.remove();
  };

  // ---------------------------------------------------------------- 札（装備の並び順。あとからスキルなどの印が右に足される）
  const mkCard = (o: { name: string; sub: string; img?: string; color: string; kind: string; token?: boolean; heat?: boolean }, i: number): HTMLElement => {
    const el = document.createElement('div');
    el.className = `py-card is-wait${o.token ? ' is-token' : ''}${o.heat ? ' is-heat' : ''}`;
    el.dataset.kind = o.kind;
    el.style.setProperty('--c', o.color);
    el.style.setProperty('--i', String(i));
    el.setAttribute('data-tip', o.sub);
    el.setAttribute('data-tip-title', o.name);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${o.name}：${o.sub}`);
    el.innerHTML = `<span class="py-face">${o.img ? `<img src="${esc(o.img)}" alt="">` : '<i class="py-flame"></i>'}</span><i class="py-kind" aria-hidden="true"></i><em></em>`;
    deck.appendChild(el);
    deck.dataset.n = String(deck.childElementCount);
    return el;
  };
  const lit = (el: HTMLElement, text: string): void => {
    el.classList.remove('is-wait');
    el.classList.add('is-on');
    (el.querySelector('em') as HTMLElement).textContent = text;
  };
  const dud = async (el: HTMLElement): Promise<void> => {
    el.classList.remove('is-wait');
    el.classList.add('is-off');
    snd('deny', { vol: 0.35 });
    await wait(240);
  };
  /** 育った：▲ の印と段 */
  const grew = (el: HTMLElement, lv: number): void => {
    const g = document.createElement('span');
    g.className = 'py-grew';
    g.textContent = String(lv);
    el.appendChild(g);
    snd('levelup', { vol: 0.5 });
    punch(el, 1.3, 420);
  };
  /** 壊れた：ひびが入り、2 つに割れて落ちる（枠だけ残る） */
  const shatter = async (el: HTMLElement): Promise<void> => {
    el.classList.add('is-crack');
    snd('tick');
    await wait(420);
    el.classList.remove('is-crack');
    el.classList.add('is-broke');
    const face = el.querySelector('.py-face');
    if (face && !fast && !calm) {
      for (const side of ['a', 'b']) {
        const h = face.cloneNode(true) as HTMLElement;
        h.className = `py-face py-half py-half--${side}`;
        el.appendChild(h);
        setTimeout(() => h.remove(), 800);
      }
    }
    snd('explode', { vol: 0.55 });
    buzz(30);
    quake(1);
    await wait(460);
  };
  /** 壊れかけたが直った：ひびが光って消える */
  const mend = async (el: HTMLElement): Promise<void> => {
    el.classList.add('is-crack');
    snd('tick');
    await wait(360);
    el.classList.remove('is-crack');
    el.classList.add('is-mend');
    snd('shimmer', { vol: 0.6 });
    await wait(260);
  };

  const extCards = d.exts.map((e, i) => {
    const color = e.heat ? 'var(--k-blood-0)' : e.fam ? FAMILY_INFO[e.fam].color : 'var(--k-bone-0)';
    const link = e.id ? extDef({ id: e.id })?.kind : undefined;
    const el = mkCard({ name: e.name, sub: e.sub, img: e.img, color, kind: e.kind, heat: e.heat }, i);
    if (link && LINKS.includes(link)) el.dataset.link = link;
    return el;
  });

  const vals = new Map<GumSrc, number>();
  const rowEl = new Map<GumSrc, HTMLElement>();
  const sum = (): number => [...vals.values()].reduce((a, b) => a + b, 0);
  /** 行に判を押す（その行をレシートのいちばん下へ刷り直して見せる） */
  const stampRow = async (src: GumSrc, mul: number, from: HTMLElement | null, color: string, step: number): Promise<void> => {
    const el = rowEl.get(src);
    const v = vals.get(src);
    if (!el || v === undefined) return;
    if (el !== paper.lastElementChild) { paper.appendChild(el); el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in'); }
    if (from) await shoot(from, el, `×${mulText(mul)}`, 'dart', color);
    el.classList.add('is-boost');
    let tag = el.querySelector('.py-rx') as HTMLElement | null;
    if (!tag) { tag = document.createElement('em'); tag.className = 'py-rx'; el.insertBefore(tag, el.querySelector('b')); }
    tag.textContent = `×${mulText(mul)}`;
    tag.classList.remove('is-hit');
    void tag.offsetWidth;
    tag.classList.add('is-hit');
    vals.set(src, v * mul);
    (el.querySelector('b') as HTMLElement).innerHTML = payNum(v * mul);
    baseN.to(sum(), 420);
    snd('stamp', { vol: 0.7 });
    snd('mult', { step });
    punch(el, 1.06, 260);
    punch(baseBox, 1.12);
  };

  void (async () => {
    await wait(380);
    // 1. レシート：出どころごと（少ない順に刷られ、だんだん大きくなる）
    const gap = Math.max(60, Math.min(230, 2200 / Math.max(1, d.rows.length)));
    let i = 0;
    for (const r of d.rows) {
      const info = SRC_INFO[r.src];
      const el = document.createElement('div');
      el.className = 'py-row is-in';
      el.style.setProperty('--c', info.color);
      el.innerHTML = `<i class="py-dot" aria-hidden="true"></i><span>${esc(info.name)}</span>${r.n > 0 ? `<u>×${fmt(r.n)}</u>` : '<u></u>'}<b>${payNum(r.v)}</b>`;
      paper.appendChild(el);
      rowEl.set(r.src, el);
      vals.set(r.src, r.v);
      baseN.to(sum(), gap * 0.9);
      snd('count', { p: Math.min(1, i / Math.max(4, d.rows.length - 1)) });
      i += 1;
      await wait(gap);
    }
    if (!d.rows.length) {
      // 何も稼げなかった：白いレシートが出るだけ
      paper.innerHTML = '<div class="py-row py-row--void is-in" aria-label="0 GUM"><i class="py-dot"></i><span></span><u></u><b>0</b></div>';
      snd('deny', { vol: 0.4 });
      await wait(420);
    }
    await wait(220);
    punch(baseBox, 1.15);
    ring(baseBox, 'var(--k-bone-0)');
    snd('stamp', { vol: 0.5 });
    await wait(320);

    // 2. 行に掛かる効果：Limited の出どころの倍率（印を右に足す）→ エクステンションの「行 ×」（装備の並び順）
    let k = 0;
    let extra = d.exts.length;
    for (const b of d.rowBoosts) {
      if (!rowEl.has(b.src)) continue;
      const tok = mkCard({ name: b.name, sub: b.sub, img: b.img, color: b.color, kind: 'row', token: true }, extra);
      extra += 1;
      await wait(200);
      py.dataset.phase = 'boost';
      await stampRow(b.src, b.mul, tok, b.color, k);
      lit(tok, `×${mulText(b.mul)}`);
      k += 1;
      await wait(420);
    }
    const rowDone = new Set<number>();
    for (let j = 0; j < d.exts.length; j += 1) {
      const e = d.exts[j];
      if (e.kind !== 'row' || !e.fired || !e.src || !rowEl.has(e.src)) continue;
      rowDone.add(j);
      const el = extCards[j];
      py.dataset.phase = 'boost';
      el.classList.add('is-fire');
      await stampRow(e.src, e.amount, el, 'var(--k-ticket-0)', k);
      el.classList.remove('is-fire');
      lit(el, `×${mulText(e.amount)}`);
      k += 1;
      if (e.grew) grew(el, e.grew);
      if (e.broke) await shatter(el);
      if (e.repaired) await mend(el);
      await wait(400);
    }

    // 3. 札が左から順に効く
    py.dataset.phase = 'cards';
    let chips = sum();
    let mult = 1;
    const tempo = (): number => Math.max(180, 440 - k * 45);
    for (let j = 0; j < d.exts.length; j += 1) {
      if (rowDone.has(j)) continue;
      const e = d.exts[j];
      const el = extCards[j];
      if (!e.fired) { await dud(el); continue; }
      el.classList.add('is-fire');
      // 特別な品：こだま（もう 1 回）は輪が 2 つ広がり、うつし鏡・王冠（コピー）は札が裏返る
      const link = el.dataset.link;
      if (link && !fast && !calm) {
        if (link === 'again') { ring(el, 'var(--k-emb-0)'); setTimeout(() => ring(el, 'var(--k-emb-0)'), 140); snd('pip', { step: k }); }
        else { el.classList.add('is-flip'); snd('page'); }
        await wait(340);
      }
      if (e.kind === 'emblem') {
        embBox.hidden = false;
        await shoot(el, embBox, effText(e), 'rise', 'var(--k-emb-0)');
        lit(el, effText(e));
        const cur = Number(embBox.dataset.n ?? 0) + Math.round(e.amount);
        embBox.dataset.n = String(cur);
        (embBox.querySelector('b') as HTMLElement).textContent = `+${cur}`;
        punch(embBox, 1.4);
        snd('shimmer');
      } else if (e.kind === 'chips' || e.kind === 'row') {
        await shoot(el, baseBox, effText(e), 'arc', 'var(--k-bone-0)');
        lit(el, effText(e));
        chips += e.kind === 'chips' ? e.amount : (vals.get(e.src as GumSrc) ?? 0) * (e.amount - 1);
        baseN.to(chips, 380);
        punch(baseBox, 1.18 + Math.min(0.2, k * 0.03));
        ring(baseBox, 'var(--k-bone-0)');
        snd('coin', { step: k });
        snd('count', { p: Math.min(1, k / 10) });
      } else if (e.kind === 'mult') {
        await shoot(el, multBox, effText(e), 'dart', 'var(--k-blood-0)');
        lit(el, effText(e));
        mult += e.amount;
        multN.to(mult, 320);
        punch(multBox, 1.22 + Math.min(0.25, k * 0.04));
        ring(multBox, 'var(--k-blood-0)');
        snd('mult', { step: k });
      } else {
        // ×倍率：まん中で大きくなり、倍率の板に叩きつける
        await shoot(el, multBox, effText(e), 'slam', 'var(--k-ticket-0)');
        lit(el, effText(e));
        mult *= e.amount;
        multN.to(mult, 420);
        multBox.classList.remove('is-slam');
        void multBox.offsetWidth;
        multBox.classList.add('is-slam');
        punch(multBox, 1.4 + Math.min(0.3, k * 0.04), 460);
        ring(multBox, 'var(--k-ticket-0)');
        quake(2);
        buzz(20);
        snd('mult', { step: k + 2 });
        snd('thwack', { vol: 0.7 });
      }
      el.classList.remove('is-fire');
      k += 1;
      music.intensity(Math.min(1, 0.3 + k * 0.1));
      if (e.grew) grew(el, e.grew);
      if (e.broke) await shatter(el);
      if (e.repaired) await mend(el);
      await wait(tempo());
    }
    // 4. 全体の倍率（スキル・Limited・リーダーの能力・取引）：印が右に足され、倍率の板を叩く
    for (const b of d.all) {
      const tok = mkCard({ name: b.name, sub: b.sub, img: b.img, color: b.color, kind: 'xmult', token: true }, extra);
      extra += 1;
      await wait(160);
      tok.classList.add('is-fire');
      await shoot(tok, multBox, `×${mulText(b.mul)}`, 'dart', 'var(--k-ticket-0)');
      tok.classList.remove('is-fire');
      lit(tok, `×${mulText(b.mul)}`);
      mult *= b.mul;
      multN.to(mult, 360);
      punch(multBox, 1.3 + Math.min(0.3, k * 0.04));
      ring(multBox, 'var(--k-ticket-0)');
      quake(1);
      snd('mult', { step: k + 1 });
      k += 1;
      await wait(tempo());
    }
    // 早送りで残った札を、効いた姿にそろえる
    extCards.forEach((el, j) => { if (el.classList.contains('is-wait')) { if (d.exts[j].fired) lit(el, effText(d.exts[j])); else { el.classList.remove('is-wait'); el.classList.add('is-off'); } } });
    baseN.set(chips);
    multN.set(mult);

    // 5. 基本額 × 倍率 ＝ 合計（2 枚の板がぶつかって 1 つになる。ここは早送りでも見せる）
    const skipped = fast;
    fast = false;
    py.classList.remove('is-fast');
    const money = chips * mult;
    const c = d.ctx;
    let tier = 0;
    if (c && c.need > 0 && money >= c.need * 0.5) tier = 1;
    if (c && c.best > 0 && money > c.best) tier = 2;
    if (c && c.need > 0 && c.have < c.need && money >= c.need) tier = 3;
    if (money <= 0) tier = 0;
    await wait(skipped ? 80 : 260);
    py.dataset.phase = 'clash';
    slabs.classList.add('is-charge');
    sfx('wipe', { vol: 0.6 });
    music.hit('fill');
    await wait(calm ? 120 : 460);
    slabs.classList.remove('is-charge');
    slabs.classList.add('is-clash');
    await wait(calm ? 60 : 150);
    sfx('stamp');
    sfx('thwack', { vol: 0.8 });
    music.hit('crash');
    buzz([0, 30, 20, 50]);
    quake(3);
    const fl = document.createElement('i');
    fl.className = 'py-flash';
    py.appendChild(fl);
    setTimeout(() => fl.remove(), 500);
    slabs.hidden = true;
    totalBox.hidden = false;
    totalBox.dataset.tier = String(tier);
    totalBox.setAttribute('aria-label', `${fmtPay(money)} GUM`);
    py.dataset.phase = 'total';
    py.dataset.tier = String(tier);
    const rollMs = money <= 0 ? 200 : [900, 1300, 1700, 1900][tier];
    const sumN = roller(sumEl, payNum, () => false, (p) => sfx('count', { p }));
    sumN.set(0);
    sumN.to(money, calm ? 300 : rollMs);
    hooks.final(money);
    await wait((calm ? 300 : rollMs) + 60);
    // 着地：額の段ごとの決め
    if (!calm) sumEl.animate([{ transform: 'scale(1.5) rotate(-7deg)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.3,1.9,0.4,1)' });
    totalBox.classList.add('is-set');
    if (money <= 0) sfx('deny');
    else if (tier === 0) sfx('coin', { step: 4 });
    else { sfx('fanfare'); if (tier >= 2) sfx('jackpot'); burst(sumEl, tier >= 2 ? 22 : 12); quake(tier); buzz([0, 40, 30, 60]); }
    if (tier >= 2) {
      stampEl.textContent = tier === 3 ? 'QUOTA OK!' : 'NEW RECORD';
      stampEl.hidden = false;
      setTimeout(() => sfx('stamp'), 180);
    }
    await wait(tier >= 2 ? 900 : tier === 1 ? 600 : 380);
    py.dataset.phase = 'done';
    card.classList.remove('paying');
    card.removeEventListener('pointerdown', skip);
    hooks.done(money, tier);
  })();
}
