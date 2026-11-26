// 解説モード（台のしくみ）：台を止めて全体を映し、部品に番号の名札を立てる。
// 名札や下の一覧を触ると、カメラがその部品へ寄り、球がその部品を通る実演が流れて、説明のカードが出る。
// 実演は本物の台の計算（PinballWorld）を、セーブの写しと何もしない知らせで動かす（GUM やセーブは変わらない）。

import { PinballWorld } from '../game/pinball';
import type { WorldEvents } from '../game/world';
import { PARTS, type Part } from '../game/parts';
import { limitedById, modsForPart } from '../game/mods';
import { guideView } from '../game/render-pinball';
import type { Save } from '../core/save';
import { blip } from '../core/audio';

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

  const el = document.createElement('div');
  el.className = 'guide';
  el.innerHTML = `
    <header class="guide-head">
      <button class="icon" data-act="close" aria-label="戻る">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
      </button>
      <h2>台のしくみ</h2>
      <span class="guide-count" data-f="count"></span>
    </header>
    <section class="guide-card">
      <nav class="guide-chips" data-f="chips">${PARTS.map((p, i) => `<button data-i="${i}"><b>${i + 1}</b>${esc(p.name)}</button>`).join('')}</nav>
      <div class="guide-info" data-f="info"></div>
      <div class="guide-btns">
        <button class="pill" data-act="prev">まえへ</button>
        <button class="pill" data-act="all">全体</button>
        <button class="pill main" data-act="next">つぎへ</button>
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
    countEl.textContent = `${PARTS.length} の部品`;
    chipsEl.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
    infoEl.innerHTML = `<p class="guide-lead">番号か、上の名前を触ると、その部品へ寄って動きを見せます。<br>「つぎへ」で順番にたどれます。</p>`;
    animateInfo();
  }

  function select(i: number): void {
    sel = (i + PARTS.length) % PARTS.length;
    const p = PARTS[sel];
    guideView.cam = { x: p.x, y: p.y, vw: p.view };
    pins();
    countEl.textContent = `${sel + 1} / ${PARTS.length}`;
    chipsEl.querySelectorAll('button').forEach((b, k) => {
      if (k === sel) {
        b.setAttribute('aria-current', 'true');
        b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      } else b.removeAttribute('aria-current');
    });
    infoEl.innerHTML = info(p, world);
    animateInfo();
    blip(660 + sel * 12, 0.05, 'square', 0.05, 1.3);
    demoT = 0.55; // カメラが寄ってから走らせる
  }

  function animateInfo(): void {
    infoEl.animate(
      [{ transform: 'translateX(18px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 320, easing: 'cubic-bezier(0.2,0.9,0.25,1)' },
    );
  }

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.i) { select(Number(t.dataset.i)); return; }
    const act = t.dataset.act;
    if (act === 'close') close();
    else if (act === 'all') overview();
    else if (act === 'next') select(sel + 1);
    else if (act === 'prev') select(sel < 0 ? PARTS.length - 1 : sel - 1);
  });
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
    setTimeout(() => el.remove(), 420);
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
  if (d.kind !== 'multi' && d.kind !== 'jackpot') w.mates = [];
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
  if (d.kind === 'multi') { w.saucer.locks = Math.max(0, w.locksNeeded - 1); w.saucer.cool = 0; }
  if (d.kind === 'jackpot' && !w.multi) w.multiball();
  if (d.kind === 'hole') { w.hole.on = true; w.hole.t = 7; w.hole.x = p.x; w.hole.y = p.y; }
  if (d.kind === 'star') { w.star.on = true; w.star.t = 8; w.star.x = p.x; w.star.y = p.y; }
  if (d.kind === 'gate' && !w.gate.open) w.openGate();
  if (d.kind === 'save') w.ballSaveUntil = w.time + 5;
  if (d.kind === 'zone') { w.combo = Math.max(w.combo, 22); w.comboT = w.time + 6; }
  const b = w.puck;
  b.x = d.x; b.y = d.y; b.vx = d.vx; b.vy = d.vy;
}

function info(p: Part, w: PinballWorld): string {
  const stat = p.stat ? `<p class="guide-stat">いまの台：<b>${esc(p.stat(w.st))}</b></p>` : '';
  const m = modsForPart(p.id);
  const have = m.limited.filter((id) => w.save.limited?.includes(id));
  const chips = [
    ...m.shop.map((n) => `<span>${esc(n)}</span>`),
    ...have.map((id) => `<span class="lim">${esc(limitedById(id)?.name ?? '')}</span>`),
  ];
  const rest = m.limited.length - have.length;
  const mods = chips.length || rest
    ? `<div class="guide-mods"><small>付けられる改造（ショップ・Limited）</small>${chips.join('')}${rest ? `<span class="lim off">Limited ${rest} 種（未入手）</span>` : ''}</div>`
    : '';
  return `<p class="guide-call">${esc(p.call)}</p><h3>${esc(p.name)}</h3><p class="guide-what">${esc(p.what)}</p>${stat}${mods}`;
}
