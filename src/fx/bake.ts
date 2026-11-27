// あらかじめ描いておく絵（部品の台座・球）。毎コマ、何枚も塗り重ねたりグラデーションを作ったりしないで、
// 1 回だけ小さな canvas に描いて取っておき、あとは貼るだけにする（速さのため）。
// 取っておく数には上限があり、あふれたら全部捨てて作り直す。

import { quality } from './quality';

export interface Baked { cv: HTMLCanvasElement; w: number; h: number }

/** 取っておく絵の細かさ（台のユニット 1 つあたりの画素） */
const RES = 3;

const sprites = new Map<string, Baked>();

/** 絵を 1 つ作って取っておく。paint は、まん中が (0, 0) の w × h の中に描く */
export function baked(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, res = RES): Baked {
  let b = sprites.get(key);
  if (b) return b;
  if (sprites.size > 400) sprites.clear();
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.ceil(w * res));
  cv.height = Math.max(2, Math.ceil(h * res));
  const g = cv.getContext('2d');
  if (g) {
    g.setTransform(res, 0, 0, res, (w * res) / 2, (h * res) / 2);
    paint(g);
  }
  b = { cv, w, h };
  sprites.set(key, b);
  return b;
}

/** 取っておいた絵を、まん中を (x, y) に合わせて貼る（scale で大きさ、rot で回す） */
export function stamp(ctx: CanvasRenderingContext2D, b: Baked, x: number, y: number, scale = 1, rot = 0, smooth = quality() === 2): void {
  const w = b.w * scale;
  const h = b.h * scale;
  // なめらかに縮めて貼るのは、画質が高のときと、小さくて大事な絵（球）だけ
  ctx.imageSmoothingEnabled = smooth;
  if (rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(b.cv, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else ctx.drawImage(b.cv, x - w / 2, y - h / 2, w, h);
  ctx.imageSmoothingEnabled = false;
}

/** 確認用：取っておいた絵の数 */
export const bakeInfo = (): { sprites: number } => ({ sprites: sprites.size });
