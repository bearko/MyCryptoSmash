// 別の canvas に台を映し、1 つの部品を目立たせて実演を流す（ショップのギミックの見本・Limited の札の対象の部品）。
// 台はセーブの写しで動かす（GUM やセーブは変わらない）。実演は解説モードと同じしくみ（parts.ts の demo と guide.ts の runDemo）。
// 描くのは render-pinball.ts の drawPinballOn（ふだんの台の画面のカメラは変えない）。
// gray：ほかの部品をグレーにする（Limited の札）。台にまだない部品は、写しの台に足して描き、うすく見せる（場所が分かるように）。

import { cat } from '../core/catalog';
import type { Save } from '../core/save';
import { PinballWorld } from '../game/pinball';
import type { WorldEvents } from '../game/world';
import { PARTS, type Part } from '../game/parts';
import { TOY_NEEDS, type ToyId } from '../game/toys';
import { drawPinballOn, newPinView } from '../game/render-pinball';
import { runDemo } from './guide';

const DEMO_EVERY = 3.6;
/** 何もしない知らせ（実演の台は音も演出も出さない） */
const quiet = new Proxy({}, { get: () => () => undefined }) as unknown as WorldEvents;

export interface PartView {
  /** 映す部品を変える（null なら台の全体をグレーで）。add は写しの台に足すギミック */
  set(partId: string | null, add?: ToyId[]): void;
  /** 止める（canvas は呼んだ側が消す） */
  stop(): void;
}

/** 先に要るギミックもいっしょに足す（球をためる穴がないのにマルチボール、などにしない） */
function withNeeds(ids: ToyId[]): ToyId[] {
  const out = new Set<ToyId>();
  const add = (id: ToyId): void => {
    if (out.has(id)) return;
    out.add(id);
    for (const n of TOY_NEEDS[id] ?? []) add(n);
  };
  ids.forEach(add);
  return [...out];
}

export function startPartView(cv: HTMLCanvasElement, save: Save, o: { gray?: boolean } = {}): PartView {
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const pv = newPinView();
  const bg = cat.bgs[0] ?? '';
  let world: PinballWorld | null = null;
  let part: Part | null = null;
  /** 台にまだない部品（うすく描く） */
  let ghost = false;
  let demoT = 0.7;

  function build(add: ToyId[]): PinballWorld {
    const copy = JSON.parse(JSON.stringify(save)) as Save;
    copy.toys = [...new Set([...(copy.toys ?? []), ...withNeeds(add)])];
    copy.settings.toysOff = [];
    const w = new PinballWorld(copy, quiet);
    w.calcStats();
    w.startRun(1);
    w.phase = 'play';
    w.runLeft = 9999;
    w.hole.next = 9999;
    w.star.next = 9999;
    return w;
  }

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
    aim();
  };
  /** カメラ：部品が縦にも入る幅で寄る（横長の窓でも丸がはみ出さない） */
  function aim(): void {
    if (!part) {
      pv.guide.cam = { x: 360, y: 640, vw: 9999 };
      pv.guide.pins = o.gray ? [{ x: -9999, y: -9999, hx: -9999, hy: -9999, r: 0, n: 0, sel: true, gray: true }] : null;
      return;
    }
    const aspect = ch / Math.max(1, cw);
    // 台の幅（720）以上を渡すと全体を映すしるしになるので、それより少し狭く
    const vw = Math.min(700, Math.max(part.view, (part.r + 70) * 2 / Math.max(0.3, aspect)));
    pv.guide.cam = { x: part.x, y: part.y, vw };
    // 部品だけを明るく（番号の名札は画面の外に置いて出さない）
    pv.guide.pins = [{ x: -9999, y: -9999, hx: part.x, hy: part.y, r: part.r, n: 0, sel: true, gray: o.gray, ghost }];
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(cv);

  let last = performance.now();
  let raf = 0;
  let stopped = false;
  const still = (): boolean => !stopped && cv.isConnected;
  const frame = (now: number): void => {
    if (!still() || !world) return;
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
      // 1 コマ描けなくても止めない
      console.warn(err);
    }
  };

  const view: PartView = {
    set(partId, add = []) {
      part = partId ? PARTS.find((p) => p.id === partId) ?? null : null;
      const need = part?.toy ? [part.toy as ToyId] : [];
      ghost = !!o.gray && !!part?.toy && !(save.toys ?? []).includes(part.toy);
      world = build([...add, ...need]);
      demoT = 0.7; // カメラが寄ってから走らせる
      aim();
      if (!raf && !stopped) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    },
  };
  fit();
  return view;
}
