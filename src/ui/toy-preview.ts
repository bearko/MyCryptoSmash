// ショップの最上段（ギミック）の見本：品を触ると、ピンボールの台を映してその仕掛けの実演を流す。
// 実演は解説モードと同じしくみ（parts.ts の部品の demo と guide.ts の runDemo）を、セーブの写しに仕掛けを足した台で動かす
// （GUM やセーブは変わらない）。台は自分の canvas に描く（render-pinball.ts の drawPinballOn。ふだんの台の画面のカメラは変えない）。
// 下に「買う」（値段）、上に閉じるボタン。説明の文は ? を触ったとき（PC はマウスを重ねたとき）だけ。

import { cat } from '../core/catalog';
import type { Save } from '../core/save';
import { blip } from '../core/audio';
import { fmt } from '../core/util';
import { PinballWorld } from '../game/pinball';
import type { WorldEvents } from '../game/world';
import { PARTS } from '../game/parts';
import { TOY_ART, TOY_NAME, TOY_SHORT, type ToyId } from '../game/toys';
import { drawPinballOn, newPinView } from '../game/render-pinball';
import { runDemo } from './guide';
import { toyCardArt } from './gimmick';
/** 仕掛けの札の絵（絵のない仕掛けは空の文字） */
const toyImg = (id: ToyId): string => ((TOY_ART as Partial<Record<string, number[]>>)[id]?.length ? toyCardArt(id) : '');

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const DEMO_EVERY = 3.6;

export interface ToyPreviewOpts {
  price: number;
  /** もう台に付いている（買えない） */
  owned: boolean;
  /** 買う（買えたら true。閉じるのは呼んだ側） */
  buy(): boolean;
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
        ${toyImg(id) ? `<img src="${esc(toyImg(id))}" alt="">` : ''}
        <h3>${esc(TOY_NAME[id] ?? id)}</h3>
        <button class="tp-help" data-act="help" aria-label="説明">?</button>
        <button class="tp-x" data-act="close" aria-label="閉じる"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg></button>
      </header>
      <div class="tp-view"><canvas></canvas><p class="tp-what" hidden>${esc(TOY_SHORT[id] ?? part?.what ?? '')}</p></div>
      <footer class="tp-foot">
        ${o.owned ? '<span class="tp-own">SOLD</span>' : `<button class="tp-buy${save.emblems < o.price ? ' poor' : ''}" data-act="buy"><span>買う</span><b><i class="emb"></i>${fmt(o.price)}</b></button>`}
      </footer>
    </div>`;
  host.append(el);
  const cv = el.querySelector('canvas') as HTMLCanvasElement;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const what = el.querySelector('.tp-what') as HTMLElement;

  // 実演の台：セーブの写しに、この仕掛けを足す（何もしない知らせで動かす）
  const quiet = new Proxy({}, { get: () => () => undefined }) as unknown as WorldEvents;
  const copy = JSON.parse(JSON.stringify(save)) as Save;
  copy.toys = [...new Set([...(copy.toys ?? []), id])];
  copy.settings.toysOff = [];
  const world = new PinballWorld(copy, quiet);
  world.calcStats();
  world.startRun(1);
  world.phase = 'play';
  world.runLeft = 9999;
  world.hole.next = 9999;
  world.star.next = 9999;
  const pv = newPinView();
  if (part) {
    pv.guide.cam = { x: part.x, y: part.y, vw: part.view };
    // 部品だけを明るく（番号の名札は画面の外に置いて出さない）
    pv.guide.pins = [{ x: -9999, y: -9999, hx: part.x, hy: part.y, r: part.r, n: 0, sel: true }];
  } else pv.guide.cam = { x: 360, y: 640, vw: 9999 };
  const bg = cat.bgs[0] ?? '';

  let cw = 0;
  let ch = 0;
  let dpr = 1;
  const fit = (): void => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(cv);
  fit();

  let demoT = 0.7; // カメラが寄ってから走らせる
  let last = performance.now();
  let raf = 0;
  const still = (): boolean => el.isConnected;
  const frame = (now: number): void => {
    if (!el.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    world.runLeft = 9999;
    world.tilt = [0, 0];
    world.step(dt);
    if (part) {
      demoT -= dt;
      if (demoT <= 0) { demoT = DEMO_EVERY; runDemo(world, part, still); }
    }
    raf = requestAnimationFrame(frame);
    try {
      drawPinballOn(pv, ctx, world, { x: 0, y: 0, w: cw, h: ch }, { x: 0, y: 0, w: 0, h: 0 }, cw, ch, bg, dpr);
    } catch (err) {
      // 1 コマ描けなくても見本は止めない
      console.warn(err);
    }
  };
  raf = requestAnimationFrame(frame);

  const close = (): void => {
    if (el.classList.contains('leaving')) return;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    window.removeEventListener('keydown', onKey);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 360);
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
    if (act === 'close') { blip(420, 0.05, 'square', 0.05, 1); close(); }
    else if (act === 'help') { what.hidden = !what.hidden; blip(700, 0.04, 'square', 0.04, 1.2); }
    else if (act === 'buy') {
      if (o.buy()) close();
      else {
        t.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 });
        blip(160, 0.12, 'sawtooth', 0.06, 0.8);
      }
    }
  });
  blip(620, 0.06, 'triangle', 0.05, 1.5);
  return close;
}
