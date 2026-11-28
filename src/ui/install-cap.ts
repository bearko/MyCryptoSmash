// 部品が台に付いた瞬間（取り付けの光の波が広がる間）に、台の下のほうへ出す札：部品の絵・名前・効き目のひとこと。
// ユーザーの指定：買った部品でどんな効果が見こめるかを簡単に見せる。文は toys.ts の TOY_SHORT（1 行）だけ。触ると消える。3.6 秒で消える。
// 呼ぶのは main.ts（src/fx/table-fx.ts の onToyInstalled）。見た目は reward.css の .inst-cap。

import './reward.css';
import { sfx } from '../core/audio';
import { TOY_NAME, TOY_SHORT, type ToyId } from '../game/toys';
import { toyThumbImg } from './toy-thumb';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const SHOW_MS = 3600;

export function showInstallCap(root: HTMLElement, id: string): void {
  const name = TOY_NAME[id as ToyId];
  if (!name) return;
  root.querySelector(':scope > .inst-cap')?.remove();
  const el = document.createElement('div');
  el.className = 'inst-cap';
  el.setAttribute('role', 'status');
  el.dataset.sfx = 'none';
  el.innerHTML = `<i class="ic-art">${toyThumbImg(id as ToyId)}</i><div class="ic-t"><b>${esc(name)}</b><p>${esc(TOY_SHORT[id as ToyId] ?? '')}</p></div>`;
  root.append(el);
  sfx('shimmer', { vol: 0.8 });
  let gone = false;
  const close = (): void => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 320);
  };
  el.addEventListener('click', close);
  window.setTimeout(close, SHOW_MS);
}
