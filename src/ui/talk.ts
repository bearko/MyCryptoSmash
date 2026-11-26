// 台に宿るピエロのセリフの吹き出し（文字だけ。声は付けない）。
// - talkHtml：ピエロの絵と吹き出し（タイトル・納品・GAME OVER・ギミックの演出の中に置く）
// - typeIn：文字を 1 つずつ出す（触ると最後まで出す）
// - clownSay：プレイの前に、右上の実況のピエロの左に小さく出す（台を覆わないように、少しの間だけ）
// セリフは src/game/clown-lines.ts。

import { clownArt } from '../game/toys';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** ピエロの絵と吹き出し。text は差しこみずみのセリフ（data-say に入れ、typeIn で出す） */
export function talkHtml(tier: number, text: string, cls = ''): string {
  return `<div class="talk ${cls}" data-tier="${tier}"><div class="talk-art"><img src="${clownArt(tier)}" alt=""></div><p class="talk-b" data-say="${esc(text)}"></p></div>`;
}

/** 文字を 1 つずつ出す。返り値を呼ぶと最後まで出す（出しきっていれば false） */
export function typeIn(el: HTMLElement, text: string, speed = 30): () => boolean {
  const chars = Array.from(text);
  let i = 0;
  el.textContent = '';
  el.classList.add('typing');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const end = (): boolean => {
    if (i >= chars.length) return false;
    i = chars.length;
    el.textContent = text;
    el.classList.remove('typing');
    window.clearInterval(timer);
    return true;
  };
  const timer = window.setInterval(() => {
    i += 1;
    el.textContent = chars.slice(0, i).join('');
    if (i >= chars.length) { el.classList.remove('typing'); window.clearInterval(timer); }
  }, speed);
  if (reduce) end();
  return end;
}

/** root の中の吹き出し（talkHtml で作ったもの）の文字を出す */
export function startTalk(root: HTMLElement, delay = 0): void {
  root.querySelectorAll<HTMLElement>('.talk-b[data-say]').forEach((b) => {
    const text = b.dataset.say ?? '';
    b.removeAttribute('data-say');
    window.setTimeout(() => typeIn(b, text), delay);
  });
}

/** プレイの前：右上の実況のピエロの左に、吹き出しを少しの間だけ出す */
let sayEl: HTMLElement | null = null;
let sayTimer = 0;
export function clownSay(root: HTMLElement, text: string, ms = 3600): void {
  sayEl?.remove();
  window.clearTimeout(sayTimer);
  const el = document.createElement('p');
  el.className = 'jk-say';
  root.append(el);
  sayEl = el;
  typeIn(el, text, 26);
  const j = root.querySelector('.joker');
  j?.classList.add('talk');
  window.setTimeout(() => j?.classList.remove('talk'), Math.min(ms, 1600));
  sayTimer = window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => { el.remove(); if (sayEl === el) sayEl = null; }, 400);
  }, ms);
}
/** 吹き出しをすぐ消す（打ち出したとき） */
export function clownHush(): void {
  if (!sayEl) return;
  const el = sayEl;
  sayEl = null;
  window.clearTimeout(sayTimer);
  el.classList.add('out');
  window.setTimeout(() => el.remove(), 400);
}
