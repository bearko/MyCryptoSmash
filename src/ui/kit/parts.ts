// 様式「呪われたカーニバル」の部品（HTML の文字列を返す関数と、動く部品）。CSS は src/styles/kit.css。見本は ?kit=1（demo.ts）。
// 文字列を返す関数は innerHTML にそのまま入れられる（渡す文字はエスケープされる。html: と付く引数だけそのまま）。

import { canHover } from '../device';
import { isCalm } from './stage';

export type KTone = 'blood' | 'ticket' | 'curse' | 'emb' | 'bone' | 'ink';
export const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const appRoot = (): HTMLElement => document.getElementById('app') ?? document.body;
const attrs = (a?: Record<string, string | number | boolean | undefined>): string =>
  Object.entries(a ?? {}).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(String(v))}"`)).join('');

// ---------------------------------------------------------------- 文字列を返す部品
export interface BtnOpts {
  /** 主（黄・光が横切る。画面に 1 つ）・副・危険・呪い・アイコン */
  kind?: 'go' | 'sub' | 'danger' | 'curse' | 'icon';
  /** 下の小さな字（2 語まで） */
  sub?: string;
  /** 前に置く絵（HTML） */
  iconHtml?: string;
  /** 特別な音（data-sfx）。confirm・cancel・tab・open・close・buy・deny・wipe */
  sfx?: string;
  /** マウスオーバーの説明 */
  tip?: string;
  wide?: boolean;
  big?: boolean;
  disabled?: boolean;
  /** そのほかの属性（id・data-act など） */
  attrs?: Record<string, string | number | boolean | undefined>;
}
/** 傾いたボタン */
export function btn(label: string, o: BtnOpts = {}): string {
  const k = o.kind ?? 'go';
  const cls = ['k-btn', k === 'go' ? 'k-btn--go' : `k-btn--${k}`, o.wide ? 'k-btn--wide' : '', o.big ? 'k-btn--big' : ''].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}"${attrs({ 'data-sfx': o.sfx, 'data-tip': o.tip, disabled: o.disabled, ...o.attrs })}>${o.iconHtml ?? ''}<span>${esc(label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`;
}
/** 札（タグ） */
export const tag = (label: string, tone: KTone = 'bone', en = false): string => `<span class="k-tag${en ? ' k-tag--en' : ''}" data-tone="${tone}">${esc(label)}</span>`;
/** 「?」のヘルプ（説明の文はここだけ。スマホはタップ、PC はマウスを乗せる） */
export const help = (tip: string, title = ''): string => `<button type="button" class="k-help" aria-label="説明" data-tip="${esc(tip)}"${title ? ` data-tip-title="${esc(title)}"` : ''}>?</button>`;
/** ゲージ（v は 0〜1） */
export const gauge = (v: number, tone: KTone = 'ticket', seg = false): string =>
  `<div class="k-gauge${seg ? ' k-gauge--seg' : ''}${v >= 1 ? ' is-full' : ''}" data-tone="${tone}" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)}"><i></i></div>`;
/** 数字（大きく・傾け・縁どり）。あとで rollNumber(el, 値) で転がす */
export const num = (text: string, size: '' | 's' | 'l' | 'xl' = '', tone?: KTone): string => `<b class="k-num${size ? ` k-num--${size}` : ''}"${tone ? ` data-tone="${tone}"` : ''}>${esc(text)}</b>`;
/** スート（♠♥♦♣） */
export const suit = (s: 'spade' | 'heart' | 'diamond' | 'club'): string => `<i class="k-suit" data-suit="${s}" aria-hidden="true"></i>`;
/** スートの並び（見出しの飾り。段階 3 から見える） */
export const suits = (): string => `<span class="k-suits" aria-hidden="true">${suit('spade')}${suit('heart')}${suit('club')}${suit('diamond')}</span>`;
/** 電球の列（幅いっぱい） */
export const bulbs = (): string => '<i class="k-bulbs" aria-hidden="true"></i>';
/** 攻撃の色の形（赤＝●の連打・青＝◇の輪・緑＝▲の矢） */
export const atk = (c: 'red' | 'blue' | 'green'): string => `<i class="k-atk" data-atk="${c}" aria-hidden="true"></i>`;
/** 見出しの帯 */
export const ribbon = (label: string, tone: KTone = 'blood', level: 2 | 3 = 2): string => `<h${level} class="k-ribbon" data-tone="${tone}">${esc(label)}</h${level}>`;
/** 破れたチケットの札（stub は左の半券の字。bodyHtml はそのまま入る） */
export const ticket = (bodyHtml: string, stub = '', tone: KTone = 'ticket'): string =>
  `<div class="k-ticket" data-tone="${tone}">${stub ? `<span class="k-ticket-stub">${esc(stub)}</span>` : ''}<div>${bodyHtml}</div></div>`;

// ---------------------------------------------------------------- 転がって増える数字
interface Roll { shown: number; to: number; raf: number; text: string }
const rolls = new WeakMap<HTMLElement, Roll>();
/** 文字を入れかえる。変わった桁だけ下から転がって入る */
export function rollText(el: HTMLElement, text: string): void {
  const st = rolls.get(el);
  const old = st?.text ?? el.textContent ?? '';
  if (old === text && el.childElementCount) return;
  if (st) st.text = text;
  // 桁は右からそろえて比べる
  const pad = text.length - old.length;
  let html = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const was = old[i - pad];
    html += `<i${was !== ch ? ' class="is-roll"' : ''}>${esc(ch)}</i>`;
  }
  el.innerHTML = html;
}
export interface RollOpts {
  /** 数 → 文字（省くと 3 桁区切り） */
  fmt?: (n: number) => string;
  /** かける時間（ms。省くと 600） */
  ms?: number;
  /** ここから数え始める（省くと、いま出ている数） */
  from?: number;
  /** 着いたとき */
  done?: () => void;
}
/** 数字を転がして to まで増やす（減るときはすぐ変える）。同じ要素に続けて呼ぶと、いまの数から続ける */
export function rollNumber(el: HTMLElement, to: number, o: RollOpts = {}): void {
  const fmt = o.fmt ?? ((n: number) => Math.round(n).toLocaleString('en-US'));
  let st = rolls.get(el);
  if (!st) { st = { shown: o.from ?? to, to, raf: 0, text: el.textContent ?? '' }; rolls.set(el, st); }
  if (o.from !== undefined) st.shown = o.from;
  cancelAnimationFrame(st.raf);
  st.to = to;
  const from = st.shown;
  if (to <= from || isCalm() || (o.ms ?? 600) <= 0) { st.shown = to; rollText(el, fmt(to)); o.done?.(); return; }
  const ms = o.ms ?? 600;
  const t0 = performance.now();
  let lastT = 0;
  const s = st;
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - (1 - k) ** 3;
    s.shown = from + (to - from) * e;
    // 文字は 45ms ごとに入れかえる（毎コマ変えると転がる動きが見えない）
    if (k >= 1 || now - lastT > 45) { lastT = now; rollText(el, fmt(k >= 1 ? to : s.shown)); }
    if (k < 1) s.raf = requestAnimationFrame(tick);
    else { s.shown = to; o.done?.(); }
  };
  st.raf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- トースト・バナー
let toastEl: HTMLElement | null = null;
let toastTimer = 0;
export interface ToastOpts { text: string; sub?: string; icon?: string | null; tone?: KTone; /** チケットの色を直に（レアリティの色など） */ color?: string; root?: HTMLElement }
/** 左下から飛び出すチケットの半券（2.6 秒）。文は短く（text は 2 語、sub は数字や名前） */
export function toast(o: ToastOpts): void {
  const host = o.root ?? appRoot();
  if (!toastEl || !toastEl.isConnected) {
    toastEl = host.querySelector<HTMLElement>(':scope > #toast') ?? document.createElement('div');
    toastEl.setAttribute('role', 'status');
    if (!toastEl.isConnected) host.appendChild(toastEl);
  }
  const el = toastEl;
  el.className = 'k-toast k-ticket';
  el.dataset.tone = o.tone ?? 'bone';
  if (o.color) el.style.setProperty('--tone', o.color); else el.style.removeProperty('--tone');
  el.innerHTML = `${o.icon ? `<img src="${esc(o.icon)}" alt="">` : ''}<div><b>${esc(o.text)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2600);
}
let bannerEl: HTMLElement | null = null;
let bannerTimer = 0;
/** 画面を斜めに横切る帯（1.8 秒。ボスの登場など）。台を覆いすぎないよう 1 行＋小さな 1 行 */
export function banner(text: string, sub = '', tone: KTone = 'ink', root?: HTMLElement): void {
  const host = root ?? appRoot();
  if (!bannerEl || !bannerEl.isConnected) {
    bannerEl = host.querySelector<HTMLElement>(':scope > #banner') ?? document.createElement('div');
    if (!bannerEl.isConnected) host.appendChild(bannerEl);
  }
  const el = bannerEl;
  el.className = 'k-banner';
  el.innerHTML = `<div class="k-banner-in" data-tone="${tone}"><b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  el.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------------------------------------------------------- モーダル
export interface ModalOpts {
  title?: string;
  /** 中身（HTML） */
  bodyHtml: string;
  tone?: KTone;
  /** ボタン（左から。act が close の引数になる） */
  buttons?: { label: string; act: string; kind?: BtnOpts['kind']; sfx?: string }[];
  /** 外側・×で閉じられる（省くと true） */
  dismiss?: boolean;
  root?: HTMLElement;
  /** 閉じたとき（押したボタンの act。外側・×は ''） */
  close?: (act: string) => void;
}
export interface Modal { el: HTMLElement; close(act?: string): void }
/** 骨の紙のモーダル（下から傾いて飛びこむ。閉じるときは 200ms で落ちる） */
export function openModal(o: ModalOpts): Modal {
  const host = o.root ?? appRoot();
  const el = document.createElement('div');
  el.className = 'k-scrim';
  const dismiss = o.dismiss !== false;
  el.innerHTML = `<section class="k-modal k-panel k-panel--paper" data-tone="${o.tone ?? 'blood'}" role="dialog" aria-modal="true">
    ${o.title ? `<h2 class="k-ribbon" data-tone="${o.tone ?? 'blood'}">${esc(o.title)}</h2>` : ''}
    ${dismiss ? '<button type="button" class="k-btn k-btn--icon k-modal-x" data-act="" data-sfx="close" aria-label="閉じる">×</button>' : ''}
    <div class="k-modal-body">${o.bodyHtml}</div>
    ${o.buttons?.length ? `<div class="k-modal-btns">${o.buttons.map((b) => btn(b.label, { kind: b.kind ?? 'go', sfx: b.sfx, attrs: { 'data-act': b.act } })).join('')}</div>` : ''}
  </section>`;
  let gone = false;
  const close = (act = ''): void => {
    if (gone) return;
    gone = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 210);
    o.close?.(act);
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-act]');
    if (b) close(b.dataset.act ?? '');
    else if (dismiss && t === el) close('');
  });
  host.appendChild(el);
  return { el, close };
}

// ---------------------------------------------------------------- 押した返事と、タップで出す説明（1 回だけ initKit を呼ぶ）
/** 押すと星形の穴あけが広がり、離すと跳ねる。前からのボタン（.pill・.start など）にも効く */
const PRESS = '.k-btn, .k-help, [data-press], .pill, .level, .start, .res-tree, .icon, .seg button, .home-nav button, .lab-card';
let tipEl: HTMLElement | null = null;
let tipFor: HTMLElement | null = null;
function hideTapTip(): void {
  tipFor?.setAttribute('aria-expanded', 'false');
  tipFor = null;
  tipEl?.classList.remove('on');
}
function showTapTip(t: HTMLElement): void {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'hover-tip k-taptip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.append(tipEl);
  }
  const title = t.dataset.tipTitle;
  tipEl.innerHTML = `${title ? `<b>${esc(title)}</b>` : ''}${esc(t.dataset.tip ?? '').replace(/\\n|\n/g, '<br>')}`;
  const r = t.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  let y = r.bottom + 10;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 10);
  tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  tipEl.classList.remove('on');
  void tipEl.offsetWidth;
  tipEl.classList.add('on');
  tipFor = t;
  t.setAttribute('aria-expanded', 'true');
}
let inited = false;
export function initKit(): void {
  if (inited) return;
  inited = true;
  document.addEventListener('pointerdown', (e) => {
    if (tipFor && !(e.target as HTMLElement | null)?.closest?.('.k-help')) hideTapTip();
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>(PRESS);
    if (!t || (t as HTMLButtonElement).disabled || t.classList.contains('is-off') || isCalm()) return;
    const r = t.getBoundingClientRect();
    const p = document.createElement('i');
    p.className = 'k-punch';
    p.style.left = `${e.clientX - r.left}px`;
    p.style.top = `${e.clientY - r.top}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    t.appendChild(p);
    setTimeout(() => p.remove(), 440);
  }, { passive: true, capture: true });
  const up = (e: Event): void => {
    const t = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(PRESS);
    if (!t || isCalm()) return;
    t.classList.remove('is-boing');
    void t.offsetWidth;
    t.classList.add('is-boing');
    setTimeout(() => t.classList.remove('is-boing'), 320);
  };
  document.addEventListener('pointerup', up, { passive: true, capture: true });
  // 「?」：スマホはタップで吹き出し（もう 1 回・ほかを触ると閉じる）。PC はマウスを乗せるだけ（hover.ts）
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('.k-help[data-tip]');
    if (!t) return;
    e.stopPropagation();
    if (canHover()) return;
    if (tipFor === t) hideTapTip(); else showTapTip(t);
  }, true);
  document.addEventListener('scroll', hideTapTip, true);
}
