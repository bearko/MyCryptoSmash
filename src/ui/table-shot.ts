// 台の写真：ピンボールの台を、ふだんと同じ描き方で全体を 1 枚に描く（導入の暗い部屋の台に貼る。ユーザーの指定：本物の台に見せる）。
// 描くのは render-pinball.ts の drawPinballOn（球と打ち出しのねらいは描かない）。台は part-view.ts の previewWorld（セーブの写し）。
// 盤面の絵や書体がまだ読みこまれていないことがあるので、少しあとに何回か描き直す。画像のファイルは作らない（MCH の絵をリポジトリに入れないため）。

import { cat } from '../core/catalog';
import type { Save } from '../core/save';
import type { ToyId } from '../game/toys';
import { drawPinballOn, newPinView } from '../game/render-pinball';
import { TH, TW } from '../game/table';
import { previewWorld } from './part-view';

const RETRY = [0, 700, 2000, 4500];

function shot(save: Save, toys: ToyId[], w: number): string | null {
  const h = Math.round((w * TH) / TW);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const copy = { ...save, toys: [] as ToyId[] } as Save;
  const world = previewWorld(copy, toys);
  for (let i = 0; i < 30; i += 1) world.step(1 / 60);
  const pv = newPinView();
  pv.noBalls = true;
  // 全体を映す：名札や全体図は出さない（pins を空に）
  pv.guide.cam = { x: TW / 2, y: TH / 2, vw: 9999 };
  pv.guide.pins = [];
  const vw = TW + 24;
  Object.assign(pv.cam, { x: TW / 2, y: TH / 2, vw, runT: world.runStartT, inited: true, last: performance.now() });
  try {
    drawPinballOn(pv, ctx, world, { x: 0, y: 0, w, h }, { x: 0, y: 0, w: 0, h: 0 }, w, h, cat.bgs[0] ?? '', 1);
  } catch (err) {
    console.warn(err);
    return null;
  }
  return cv.toDataURL('image/jpeg', 0.86);
}

/** el の中の台（.machine .pf）に、台の写真を貼る（CSS の --pf-shot。el に .real-table を付ける） */
export function paintTableShot(el: HTMLElement, save: Save, toys: ToyId[] = [], w = 360): void {
  for (const ms of RETRY) {
    window.setTimeout(() => {
      if (!el.isConnected && ms > 0) return;
      const url = shot(save, toys, w);
      if (!url) return;
      el.style.setProperty('--pf-shot', `url("${url}")`);
      el.classList.add('real-table');
    }, ms);
  }
}
