// 解説モード（台のしくみ）：台を止めて全体を映し、部品に番号の名札を立てる。
// 名札や下の一覧を触ると、カメラがその部品へ寄り、球がその部品を通る実演が流れる（実演が主役）。
// 下の半券に出す文は「名前・1 行・付けられる改造の数」まで。くわしい文と改造の名前は「?」の中。
// 実演は本物の台の計算（PinballWorld）を、セーブの写しと何もしない知らせで動かす（GUM やセーブは変わらない）。

import { PinballWorld } from '../game/pinball';
import type { WorldEvents } from '../game/world';
import { PARTS as ALL_PARTS, type Part } from '../game/parts';
import { limitedById, modsForPart } from '../game/mods';
import { guideView } from '../game/render-pinball';
import type { Save } from '../core/save';
import './guide.css';
import { sfx } from '../core/audio';
import { help, isCalm } from './kit';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const DEMO_EVERY = 3.6;

export interface GuideHooks {
  /** 閉じた（台の世界をもとにもどす） */
  close(): void;
  /** 画面の大きさが変わった（台を映す窓を測りなおす） */
  layout(): void;
}
export interface Guide {
  world: PinballWorld;
  el: HTMLElement;
  /** 毎コマ（実演のくり返し） */
  tick(dt: number): void;
  /** 台を触った（台のユニット） */
  tap(x: number, y: number): void;
  select(i: number): void;
  close(): void;
}

export function openGuide(root: HTMLElement, save: Save, hooks: GuideHooks, startId?: string): Guide {
  // 何もしない知らせ（GUM・実況・ピラミッドへの切りかえなどは起こさない）
  const quiet = new Proxy({}, { get: () => () => undefined }) as unknown as WorldEvents;
  const copy = JSON.parse(JSON.stringify(save)) as Save;
  const world = new PinballWorld(copy, quiet);
  world.calcStats();
  world.startRun(1);
  world.phase = 'play';
  world.runLeft = 9999;
  world.hole.next = 9999;
  world.star.next = 9999;
  // 切ってある仕掛けは一覧に出さない
  const PARTS = ALL_PARTS.filter((p) => !p.toy || world.toys[p.toy]);

  const el = document.createElement('div');
  el.className = 'guide';
  el.dataset.sfxIn = 'page';
  el.innerHTML = `
    <header class="guide-head">
      <button class="k-btn k-btn--icon" data-act="close" data-sfx="close" aria-label="戻る">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
      </button>
      <h2 class="k-ribbon" data-tone="blood">台のしくみ</h2>
      <button class="guide-count" data-f="count" data-sfx="none" aria-label="台の全体を見る"></button>
    </header>
    <section class="guide-card">
      <nav class="guide-chips" data-f="chips">${PARTS.map((p, i) => `<button data-i="${i}" data-sfx="none" aria-label="${esc(p.name)}"><b>${i + 1}</b><span>${esc(p.name)}</span></button>`).join('')}</nav>
      <div class="guide-row">
        <button class="k-btn k-btn--icon" data-act="prev" data-sfx="none" aria-label="まえへ"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16 3 6 12l10 9z"/></svg></button>
        <div class="guide-info" data-f="info"></div>
        <button class="k-btn k-btn--go k-btn--icon guide-next" data-act="next" data-sfx="none" aria-label="つぎへ"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="m8 3 10 9-10 9z"/></svg></button>
      </div>
    </section>`;
  root.append(el);
  const infoEl = el.querySelector('[data-f="info"]') as HTMLElement;
  const chipsEl = el.querySelector('[data-f="chips"]') as HTMLElement;
  const countEl = el.querySelector('[data-f="count"]') as HTMLElement;

  let sel = -1;
  let demoT = 0;

  function pins(): void {
    guideView.pins = PARTS.map((p, i) => ({ x: p.pin?.[0] ?? p.x, y: p.pin?.[1] ?? p.y, hx: p.x, hy: p.y, r: p.r, n: i + 1, sel: i === sel }));
  }

  function overview(): void {
    sel = -1;
    guideView.cam = { x: 360, y: 640, vw: 9999 };
    pins();
    countEl.innerHTML = `<b>${PARTS.length}</b>`;
    chipsEl.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
    // 全体：文は置かない。番号の札が順に弾んで「触れる」ことを見せる
    infoEl.innerHTML = `<p class="guide-all" aria-label="番号を触ると、その部品の動きを見せます">${PARTS.slice(0, 7).map((_, i) => `<i style="--i:${i}">${i + 1}</i>`).join('')}</p>`;
    el.classList.add('is-all');
    animateInfo();
  }

  function select(i: number, hover = false): void {
    sel = (i + PARTS.length) % PARTS.length;
    const p = PARTS[sel];
    guideView.cam = { x: p.x, y: p.y, vw: p.view };
    pins();
    el.classList.remove('is-all');
    countEl.innerHTML = `<b>${sel + 1}</b>/${PARTS.length}`;
    chipsEl.querySelectorAll('button').forEach((b, k) => {
      if (k === sel) {
        b.setAttribute('aria-current', 'true');
        if (!hover) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      } else b.removeAttribute('aria-current');
    });
    infoEl.innerHTML = info(p, world);
    animateInfo();
    sfx('select', { step: sel });
    demoT = 0.55; // カメラが寄ってから走らせる
  }

  function animateInfo(): void {
    if (isCalm()) return;
    infoEl.animate(
      [{ transform: 'translateX(22px) skewX(-12deg)', opacity: 0 }, { transform: 'translateX(-3px)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
      { duration: 300, easing: 'cubic-bezier(0.2,0.9,0.25,1)' },
    );
  }

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.i) { select(Number(t.dataset.i)); return; }
    const act = t.dataset.act;
    if (act === 'close') close();
    else if (act === 'next') select(sel + 1);
    else if (act === 'prev') select(sel < 0 ? PARTS.length - 1 : sel - 1);
  });
  // 右上の数を触ると、台の全体へ戻る
  countEl.addEventListener('click', () => { sfx('tab'); overview(); });
  // PC：名前の札にマウスを乗せると、その部品へ寄って説明を出す（クリックしなくてよい。少し止めたときだけ）
  let hoverT = 0;
  chipsEl.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]');
    window.clearTimeout(hoverT);
    if (!t) return;
    const i = Number(t.dataset.i);
    if (i !== sel) hoverT = window.setTimeout(() => select(i, true), 160);
  });
  chipsEl.addEventListener('pointerleave', () => window.clearTimeout(hoverT));
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') select(sel + 1);
    else if (e.key === 'ArrowLeft') select(sel - 1);
  };
  window.addEventListener('keydown', onKey);

  function close(): void {
    if (!el.isConnected) return;
    window.removeEventListener('keydown', onKey);
    ro?.disconnect();
    guideView.cam = null;
    guideView.pins = null;
    el.classList.add('leaving');
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), isCalm() ? 0 : 420);
    hooks.close();
  }

  const g: Guide = {
    world,
    el,
    tick(dt) {
      world.runLeft = 9999;
      if (sel < 0) return;
      demoT -= dt;
      if (demoT <= 0) { demoT = DEMO_EVERY; const p = PARTS[sel]; runDemo(world, p, () => el.isConnected && PARTS[sel] === p); }
    },
    tap(x, y) {
      // いちばん近い名札（台の上で 40 ユニット以内）
      let best = -1;
      let bd = 40;
      PARTS.forEach((p, i) => {
        const d = Math.hypot((p.pin?.[0] ?? p.x) - x, (p.pin?.[1] ?? p.y) - y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) select(best);
    },
    select,
    close,
  };
  // 説明のカードの高さが変わったら、台を映す窓を測りなおす
  const cardEl = el.querySelector('.guide-card') as HTMLElement;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (el.isConnected && !el.classList.contains('leaving')) hooks.layout(); }) : null;
  ro?.observe(cardEl);
  requestAnimationFrame(() => {
    hooks.layout();
    const i = startId ? PARTS.findIndex((p) => p.id === startId) : -1;
    if (i >= 0) select(i);
    else overview();
  });
  return g;
}

/** 実演：部品の手前に球を置いて投げる（くり返し呼ぶ）。still は、まだその部品を見ているか */
export function runDemo(w: PinballWorld, p: Part, still: () => boolean = () => true): void {
  const d = p.demo;
  w.phase = 'play';
  w.runLeft = 9999;
  w.onRamp = null;
  w.gate.entering = -1;
  w.hole.held = -1;
  if (d.kind !== 'multi' && d.kind !== 'jackpot' && d.kind !== 'mega13') w.mates = [];
  // 前の実演の控えの打ち出しが残らないように（打ち出しの実演では、打ち出したあと控えも続けて出る）
  w.reserveQueue = [];
  w.puckAs = null;
  w.hold.active = false;
  if (d.kind === 'launch') {
    w.park('plunger');
    setTimeout(() => {
      if (!still()) return;
      w.holdStart();
      w.holdPull(-6, 150);
      w.holdEnd();
    }, 450);
    return;
  }
  w.parked = null;
  if (d.kind === 'multi' || d.kind === 'mega13') { w.saucer.locks = Math.max(0, w.locksNeeded - 1); w.saucer.cool = 0; }
  if (d.kind === 'jackpot' && !w.multi) w.multiball();
  if (d.kind === 'hole') { w.hole.on = true; w.hole.t = 7; w.hole.x = p.x; w.hole.y = p.y; }
  if (d.kind === 'star') { w.star.on = true; w.star.t = 8; w.star.x = p.x; w.star.y = p.y; }
  if (d.kind === 'gate' && !w.gate.open) w.openGate();
  if (d.kind === 'save') w.ballSaveUntil = w.time + 5;
  if (d.kind === 'zone') { w.combo = Math.max(w.combo, 22); w.comboT = w.time + 6; }
  if ((d.kind === 'castle' || d.kind === 'hammer') && !w.bossAlive) {
    for (const e of w.enemies) e.hp = 0;
    w.enemies = [];
    w.spawnBoss();
  }
  if (d.kind === 'castle') { w.castle.hits = 2; w.castle.cd = 0; }
  if (d.kind === 'hammer') { w.hammer.next = 0; w.hammer.warn = -1; }
  if (d.kind === 'face') { w.face.open = true; w.face.t = 4; }
  if (d.kind === 'popup') { const pp = w.pops[2]; pp.up = true; pp.t = 6; pp.h = 1; }
  if (d.kind === 'moai') { w.moai.up = [true, false, false, false]; w.moai.rise = 0; w.moai.gold = 0; }
  w.carry = null;
  if (d.kind === 'mega13') { w.multiballs = 2; w.saucer.locks = Math.max(0, w.locksNeeded - 1); w.saucer.cool = 0; }
  const b = w.puck;
  b.x = d.x; b.y = d.y; b.vx = d.vx; b.vy = d.vy;
}

/** 下の半券：名前・1 行・いまの台の数字・付けられる改造の数。くわしい文と改造の名前は「?」の中 */
function info(p: Part, w: PinballWorld): string {
  const m = modsForPart(p.id);
  const have = m.limited.filter((id) => w.save.limited?.includes(id));
  const names = [...m.shop, ...have.map((id) => limitedById(id)?.name ?? '')].filter(Boolean);
  const total = m.shop.length + m.limited.length;
  // 1 行：はじめの文だけ
  const first = p.what.split('。')[0];
  const more = p.what.length > first.length + 1;
  const tip = `${p.what}${names.length ? `\n\n改造：${names.join('・')}${m.limited.length > have.length ? `・Limited ${m.limited.length - have.length} 種（未入手）` : ''}` : ''}`;
  const stat = p.stat ? `<span class="k-tag k-tag--en" data-tone="ink">${esc(p.stat(w.st))}</span>` : '';
  const mods = total ? `<span class="k-tag" data-tone="curse" aria-label="付けられる改造 ${total} 種"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M21 6.5a5 5 0 0 1-6.6 4.7L6 19.6 3.4 17l8.4-8.4A5 5 0 0 1 17.5 2l-3 3 1 2.5 2.5 1 3-3z"/></svg><b>${total}</b></span>` : '';
  return `<h3>${esc(p.name)}${more || names.length ? help(tip, `${p.name}（${p.call}）`) : ''}</h3><p class="guide-what">${esc(first)}</p>${stat || mods ? `<div class="guide-tags">${stat}${mods}</div>` : ''}`;
}
