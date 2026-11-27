// 場面の切りかえ（ワイプ）と見せ場。関数 1 つで呼ぶ。
//   await wipe('bars', () => 切りかえる);          // 斜めの帯（墨・血・黄）
//   wipe('page', fn) / wipe('curtain', fn) / wipe('clap', fn, { text: 'TIME UP!' })
//   beat('launch', { text: 'TABLE 1', sub: '40' }) // 打ち出した瞬間（台を覆わない）
//   beat('timeup' | 'deposit' | 'gameover' | 'evolve', …)
// 画面がいちばん覆われた瞬間に mid を呼ぶ（その裏で中身を入れかえる）。終わると Promise が解ける。
// 音の担当へ：document に 'kit:wipe'（detail: { kind, phase }）と 'kit:beat'（detail: { name, phase }）を出す（phase は 'start'・'mid'・'end'）。
// 「演出をひかえめに」（html.calm）のときは、帯や幕を走らせず短い暗転にする（mid は同じように呼ぶ）。

import { isCalm } from './stage';

export type WipeKind = 'bars' | 'page' | 'curtain' | 'clap';
export type Tone = 'ticket' | 'blood' | 'bone';
export interface WipeOpts {
  /** まん中に出す文字（欧文は大きく）と、その下の小さな字 */
  text?: string;
  sub?: string;
  tone?: Tone;
  /** 虹の箔の字（全クリなど） */
  foil?: boolean;
  /** 長さ（ms）。省くと型ごとの長さ */
  ms?: number;
  /** 出す場所（省くと #app） */
  root?: HTMLElement;
  /** 下の画面を触れるままにする */
  ghost?: boolean;
}
const WIPE_MS: Record<WipeKind, number> = { bars: 650, page: 700, curtain: 900, clap: 1450 };
/** 覆いきる時点（長さに対する割合） */
const WIPE_MID: Record<WipeKind, number> = { bars: 0.5, page: 0.5, curtain: 0.5, clap: 0.5 };
const WIPE_PARTS: Record<WipeKind, number> = { bars: 3, page: 2, curtain: 2, clap: 3 };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const appRoot = (): HTMLElement => document.getElementById('app') ?? document.body;
const emit = (type: string, detail: Record<string, unknown>): void => { document.dispatchEvent(new CustomEvent(type, { detail })); };
const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

function textHtml(o: WipeOpts): string {
  if (!o.text) return '';
  return `<p class="k-wipe-text${o.foil ? ' is-foil' : ''}"${o.tone ? ` data-tone="${o.tone}"` : ''}>${esc(o.text)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</p>`;
}

/** 場面の切りかえ。mid は画面が覆われた瞬間に 1 回呼ばれる */
export async function wipe(kind: WipeKind, mid?: () => void, opts: WipeOpts = {}): Promise<void> {
  const calm = isCalm();
  const ms = calm ? Math.min(420, opts.ms ?? WIPE_MS[kind]) + (opts.text ? 500 : 0) : opts.ms ?? WIPE_MS[kind];
  const el = document.createElement('div');
  el.className = `k-wipe ${calm ? 'k-wipe--calm' : `k-wipe--${kind}`}${opts.ghost ? ' is-ghost' : ''}`;
  el.style.setProperty('--d', `${ms}ms`);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = (calm ? '' : '<i></i>'.repeat(WIPE_PARTS[kind])) + textHtml(opts);
  (opts.root ?? appRoot()).appendChild(el);
  emit('kit:wipe', { kind, phase: 'start' });
  await sleep(ms * WIPE_MID[kind]);
  try { mid?.(); } finally { emit('kit:wipe', { kind, phase: 'mid' }); }
  await sleep(ms * (1 - WIPE_MID[kind]) + 30);
  el.remove();
  emit('kit:wipe', { kind, phase: 'end' });
}

export type BeatName = 'launch' | 'timeup' | 'deposit' | 'gameover' | 'evolve';
export interface BeatOpts extends WipeOpts {
  /** 画面が覆われた瞬間（timeup・gameover）に呼ぶ */
  mid?: () => void;
}
function overlay(cls: string, html: string, ms: number, root?: HTMLElement): Promise<void> {
  const el = document.createElement('div');
  el.className = `k-beat ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  (root ?? appRoot()).appendChild(el);
  return sleep(ms).then(() => el.remove());
}
/**
 * 見せ場の型：
 * - launch：打ち出した瞬間。上を帯が斜めに抜け、text（台の名前）と sub（秒数）を叩きつける。台は覆わない（0.95 秒）
 * - timeup：墨の三角が上下からかみ合って閉じ、text を判のように出して開く（1.45 秒。mid で RESULT を用意）
 * - deposit：判を押す（text。省くと PAID）。0.75 秒
 * - gameover：縞の幕が左右から閉じ、mid で GAME OVER の画面を入れ、開く（1 秒）
 * - evolve：光の帯が画面を 1 回なめる（setClown(n, true) と組で。1.1 秒）
 */
export async function beat(name: BeatName, opts: BeatOpts = {}): Promise<void> {
  emit('kit:beat', { name, phase: 'start' });
  const calm = isCalm();
  if (name === 'timeup') await wipe('clap', () => { opts.mid?.(); emit('kit:beat', { name, phase: 'mid' }); }, { text: 'TIME UP!', ...opts });
  else if (name === 'gameover') await wipe('curtain', () => { opts.mid?.(); emit('kit:beat', { name, phase: 'mid' }); }, { ms: 1000, ...opts });
  else if (name === 'launch') {
    await overlay('k-beat--launch', `<i></i><b><span>${esc(opts.text ?? '')}</span>${opts.sub ? `<em>${esc(opts.sub)}</em>` : ''}</b>`, calm ? 700 : 950, opts.root);
  } else if (name === 'deposit') {
    await overlay('k-beat--stamp', `<i></i><b>${esc(opts.text ?? 'PAID')}</b>`, 750, opts.root);
  } else {
    await overlay('k-beat--wake', '<i></i>', 1100, opts.root);
  }
  emit('kit:beat', { name, phase: 'end' });
}

const SUITS = ['spade', 'heart', 'diamond', 'club'];
const CONFETTI = ['var(--k-ticket)', 'var(--k-blood)', 'var(--k-bone)', 'var(--k-emb)'];
/** 成功は弾ける：その要素のまん中から、スートの紙吹雪（n 枚）。段階が高いほど枚数を足してよい */
export function burst(at: HTMLElement, n = 10, root?: HTMLElement): void {
  if (isCalm()) return;
  const host = root ?? appRoot();
  const a = host.getBoundingClientRect();
  const r = at.getBoundingClientRect();
  for (let i = 0; i < n; i += 1) {
    const c = document.createElement('i');
    c.className = 'k-suit k-confetti';
    c.dataset.suit = SUITS[i % 4];
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const d = 50 + Math.random() * 70;
    c.style.cssText = `left:${r.left - a.left + r.width / 2 - 8}px;top:${r.top - a.top + r.height / 2 - 8}px;color:${CONFETTI[i % CONFETTI.length]};--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d + 40}px;--r:${Math.round(Math.random() * 540 - 270)}deg;animation-delay:${i * 12}ms`;
    host.appendChild(c);
    setTimeout(() => c.remove(), 1000 + i * 12);
  }
}
function once(el: HTMLElement, cls: string, ms: number): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
/** 失敗は震える（買えない・足りない） */
export const shake = (el: HTMLElement): void => once(el, 'is-shake', 340);
/** 成功は弾む（数字が増えた・手に入れた） */
export const pop = (el: HTMLElement): void => once(el, 'is-pop', 400);
