// 台を突破したとき：Limited シリーズ（永続の改造）を 1 つ選ぶ。選んでいる間は時間が止まる。
// 候補はまだ持っていない品から 3 枚（15 秒以内の突破で +1、10 秒以内で +2）。GUM で引き直せる。
// 1 回タップで選び、同じ札をもう 1 回タップで決定（ユーザーの指定）。

import { RARITY_COLOR } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, chime } from '../core/audio';
import { limitedById, limitedCount, limitedOf, rerollPrice, rollLimited, totalsOf } from '../game/mods';
import { PARTS } from '../game/parts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const partName = (id: string): string => PARTS.find((p) => p.id === id)?.name ?? '';

export interface LimitedHooks {
  /** 選んだ（または何も残っていなかった）：閉じてゲームを続ける */
  done(picked: number | null): void;
  /** GUM が変わった */
  changed(): void;
}

/** 候補がなければ開かずに null を返す */
export function openLimitedPick(root: HTMLElement, save: Save, floor: number, clearT: number, hooks: LimitedHooks, bonus = 0, note = ''): HTMLElement | null {
  const n = limitedCount(clearT) + bonus;
  let cands = rollLimited(save.limited, n);
  if (!cands.length) return null;
  let sel = -1;
  let rerolls = 0;
  const el = document.createElement('div');
  el.className = 'limpick';
  root.append(el);
  const discount = (): number => totalsOf(save.equip, save.limited).shopSlots * 0.2;

  function render(): void {
    const price = rerollPrice(floor, discount()) * (1 + rerolls);
    el.innerHTML = `
      <div class="limpick-in">
        <p class="limpick-kick">TABLE ${floor} CLEAR・${clearT.toFixed(1)} 秒${n - bonus > 3 ? `<b>　はやい！ 候補 +${n - bonus - 3}</b>` : ''}${note ? `<b>　${esc(note)}</b>` : ''}</p>
        <h2>LIMITED を 1 つ選ぶ</h2>
        <p class="limpick-sub">タップで選び、<b>もう 1 回タップで決定</b>。選んだ品は台にずっと付く（外せない）。時間は止まっています。</p>
        <div class="limpick-cards">${cands.map((id, i) => {
          const l = limitedById(id);
          const d = limitedOf(id);
          if (!l) return '';
          return `<button class="lim-card${i === sel ? ' sel' : ''}" data-i="${i}" style="--c:${RARITY_COLOR[5]};--d:${i * 70}ms">
            <img src="${esc(l.img)}" alt=""><b>${esc(l.name)}</b><small>${esc(partName(d.part))}</small><span>${esc(d.text)}</span><em class="lim-again">もう 1 回タップで決定</em></button>`;
        }).join('')}</div>
        <div class="limpick-btns">
          <button class="pill" data-act="reroll"${save.gum < price ? ' disabled' : ''}>引き直す<small>${fmt(price)} GUM</small></button>
        </div>
      </div>`;
  }
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.i) {
      const i = Number(t.dataset.i);
      // 選んでいる札をもう 1 回タップ：決定
      if (i === sel) { pick(); return; }
      sel = i;
      blip(760 + sel * 80, 0.06, 'square', 0.06, 1.4);
      // 作り直さずに印だけ動かす（入ってくる動きをくり返さない）
      el.querySelectorAll('.lim-card').forEach((c, k) => c.classList.toggle('sel', k === sel));
      return;
    }
    if (t.dataset.act === 'reroll') {
      const price = rerollPrice(floor, discount()) * (1 + rerolls);
      if (save.gum < price) return;
      save.gum -= price;
      rerolls += 1;
      const next = rollLimited(save.limited, n);
      if (next.length) cands = next;
      sel = -1;
      hooks.changed();
      blip(500, 0.1, 'sawtooth', 0.06, 2);
      render();
      return;
    }
  });
  let picked = false;
  function pick(): void {
    if (picked || sel < 0) return;
    picked = true;
    const id = cands[sel];
    save.limited.push(id);
    chime(10);
    el.querySelectorAll('.lim-card')[sel]?.classList.add('chosen');
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    hooks.done(id);
  }
  render();
  return el;
}
