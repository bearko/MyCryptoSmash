// ノルマを納めたごほうび：Limited シリーズ（挑戦の間ずっと付く改造）を 1 つ選ぶ。
// 候補はまだ持っていない品から 3 枚（余らせたプレイ 1 つ・ボス台の掟を破った 1 回ごとに +1）。
// GUM で引き直せる（値段はショップと共有の回数で 10 から 2 倍ずつ。挑戦が終わるまで戻らない）。
// 1 回タップで選び、同じ札をもう 1 回タップで決定（ユーザーの指定）。

import { RARITY_COLOR } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, chime } from '../core/audio';
import { limitedById, limitedOf, rollLimited } from '../game/mods';
import { limitedCards, payReroll, rerollCost } from '../game/quota';
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
export function openLimitedPick(root: HTMLElement, save: Save, hooks: LimitedHooks, kick: string, note = ''): HTMLElement | null {
  const n = limitedCards(save.quota);
  let cands = rollLimited(save.limited, n);
  if (!cands.length) return null;
  let sel = -1;
  const el = document.createElement('div');
  el.className = 'limpick';
  root.append(el);

  function render(): void {
    const price = rerollCost(save.quota.rerolls);
    el.innerHTML = `
      <div class="limpick-in">
        <p class="limpick-kick">${esc(kick)}${n > 3 ? `<b>　候補 +${n - 3}</b>` : ''}${note ? `<b>　${esc(note)}</b>` : ''}</p>
        <h2>LIMITED を 1 つ選ぶ</h2>
        <p class="limpick-sub">タップで選び、<b>もう 1 回タップで決定</b>。選んだ品はこの挑戦の間ずっと台に付く（外せない）。</p>
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
      if (!payReroll(save)) return;
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
    save.quota.picks = Math.max(0, save.quota.picks - 1);
    save.quota.cards = 0;
    chime(10);
    el.querySelectorAll('.lim-card')[sel]?.classList.add('chosen');
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    hooks.done(id);
  }
  render();
  return el;
}
