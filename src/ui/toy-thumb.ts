// ギミックの札の絵：その部品を台の上と同じ描き方で、部品だけ（透明な地・球なし）描いて取っておく。
// ショップの札・見本の見出し・NEW GIMMICK の見せ場が使う（ユーザーの指定：エクステンションの絵ではなく、ギミックそのものの見た目）。
// 描くのは render-pinball.ts の drawPinballOn（pv.solo・pv.noBalls）。台は part-view.ts の previewWorld（その部品だけを付けた写し）。
// 絵や書体がまだ読みこまれていないことがあるので、少しあとに何回か描き直す。描けたら <img data-thumb="id"> の絵を差しかえる。

import { cat } from '../core/catalog';
import type { Save } from '../core/save';
import { PARTS } from '../game/parts';
import type { ToyId } from '../game/toys';
import { drawPinballOn, newPinView } from '../game/render-pinball';
import { previewWorld } from './part-view';
import { runDemo } from './guide';

/** 札の絵の寄り方（部品の丸から決めると合わないものだけ）。x・y は台のユニット、vw は映す幅 */
const FRAME: Partial<Record<ToyId, { x?: number; y?: number; vw?: number }>> = {
  outlane: { vw: 230 },
  hammer: { x: 394, y: 650, vw: 200 },
  moai: { vw: 230 },
  lights: { vw: 200 },
};

/** 札の絵の大きさ（CSS の px。画素はこの 2 倍） */
const SIZE = 120;
const DPR = 2;
/** 描き直す間合い（ms）：絵と書体が読みこまれるのを待つ */
const RETRY = [500, 1500, 4000];
/** 描けるまでの空の絵（1 画素の透明） */
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const cache = new Map<ToyId, string>();
const started = new Set<ToyId>();
let lastSave: Save | null = null;

function render(id: ToyId, save: Save): string | null {
  const part = PARTS.find((p) => p.toy === id);
  if (!part) return null;
  const cv = document.createElement('canvas');
  cv.width = SIZE * DPR;
  cv.height = SIZE * DPR;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const world = previewWorld(save, [id], true);
  // 少し進めて動く部品を落ち着かせてから、実演と同じ準備（星・穴・城などを出しておく。球は描かない）
  for (let i = 0; i < 20; i += 1) world.step(1 / 60);
  runDemo(world, part);
  world.step(1 / 60);
  const pv = newPinView();
  pv.solo = true;
  pv.noBalls = true;
  pv.bare = true;
  const f = FRAME[id];
  const x = f?.x ?? part.x;
  const y = f?.y ?? part.y;
  const vw = f?.vw ?? Math.max(110, Math.min(420, part.r * 3.2));
  pv.guide.cam = { x, y, vw, over: vw };
  Object.assign(pv.cam, { x, y, vw, runT: world.runStartT, inited: true, last: performance.now() });
  try {
    drawPinballOn(pv, ctx, world, { x: 0, y: 0, w: SIZE, h: SIZE }, { x: 0, y: 0, w: 0, h: 0 }, SIZE, SIZE, cat.bgs[0] ?? '', DPR);
  } catch (err) {
    console.warn(err);
    return null;
  }
  if (id === 'zone') zoneMark(ctx);
  // ふちは溶かす（となりの部品の切れはしが四角く切れて見えないように）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  const c = cv.width / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'source-over';
  return cv.toDataURL('image/png');
}

/** ZONE は形のある部品ではないので、台の液晶と同じ光る文字と稲妻で */
function zoneMark(ctx: CanvasRenderingContext2D): void {
  const c = SIZE * DPR;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.translate(c / 2, c / 2);
  ctx.rotate(-0.12);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.42);
  g.addColorStop(0, 'rgba(110,255,170,0.45)');
  g.addColorStop(1, 'rgba(110,255,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-c / 2, -c / 2, c, c);
  ctx.globalCompositeOperation = 'source-over';
  // 稲妻
  ctx.beginPath();
  ctx.moveTo(-c * 0.02, -c * 0.34); ctx.lineTo(-c * 0.16, c * 0.02); ctx.lineTo(-c * 0.02, c * 0.02);
  ctx.lineTo(-c * 0.1, c * 0.34); ctx.lineTo(c * 0.16, -c * 0.06); ctx.lineTo(c * 0.02, -c * 0.06); ctx.lineTo(c * 0.1, -c * 0.34);
  ctx.closePath();
  ctx.fillStyle = '#ffd21f';
  ctx.strokeStyle = '#0b0a10';
  ctx.lineWidth = c * 0.025;
  ctx.fill();
  ctx.stroke();
  ctx.font = `${Math.round(c * 0.2)}px 'Bangers', 'Dela Gothic One', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = c * 0.05;
  ctx.strokeText('ZONE', 0, c * 0.05);
  ctx.fillStyle = '#6dffb0';
  ctx.fillText('ZONE', 0, c * 0.05);
  ctx.restore();
}

function paint(id: ToyId, save: Save): void {
  const url = render(id, save);
  if (!url) return;
  cache.set(id, url);
  document.querySelectorAll<HTMLImageElement>(`img[data-thumb="${id}"]`).forEach((im) => { im.src = url; });
}

/** ギミックの札の絵（まだなら空の絵を返し、描けたら <img data-thumb="id"> を差しかえる） */
export function toyThumb(id: ToyId, save?: Save): string {
  if (save) lastSave = save;
  const hit = cache.get(id);
  if (hit) return hit;
  const sv = lastSave;
  if (sv && !started.has(id)) {
    started.add(id);
    const run = (): void => paint(id, lastSave ?? sv);
    window.setTimeout(run, 0);
    for (const ms of RETRY) window.setTimeout(run, ms);
  }
  return BLANK;
}

/** 札の絵の <img>（描けたら差しかわる） */
export const toyThumbImg = (id: ToyId, save?: Save, cls = ''): string =>
  `<img data-thumb="${id}"${cls ? ` class="${cls}"` : ''} src="${toyThumb(id, save)}" alt="">`;
