// ノルマを納めたごほうび：Limited シリーズ（挑戦の間ずっと付く。メリットとデメリットが混ざった札）を 1 つ選ぶ。
// 候補はまだ持っていない品から 3 枚（余らせたプレイ 1 つ・ボス台の掟を破った 1 回ごとに +1）。「あとで選ぶ」で取っておいた候補も並ぶ。
// GUM で引き直せる（値段はショップと共有の回数で 10 から 2 倍ずつ。挑戦が終わるまで戻らない）。
// 1 回タップで選び、同じ札をもう 1 回タップで決定（ユーザーの指定）。札ではメリットを黄、デメリットを赤で書く。
// 「あとで選ぶ」：今回の候補を取っておき、次にノルマを納めたときの候補に加える（選ぶ権利も持ちこす）。
// ヒートの印を付ける札は、決めたあとに部品を選ぶ（44px 以上のボタン）。

import { RARITY_COLOR } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, chime, se } from '../core/audio';
import { LIM_TYPE, limitedById, limitedOf, rollLimited } from '../game/mods';
import { deferLimited, heatChoices, limitedCands, pickLimited, addHeat } from '../game/limiteds';
import { limitedCards, payReroll, rerollPrice } from '../game/quota';
import { heatPer, srcShort } from '../game/exts';
import type { GumSrc } from '../game/tally';
import { PARTS } from '../game/parts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const partName = (id: string): string => PARTS.find((p) => p.id === id)?.name ?? '';

export interface LimitedHooks {
  /** 選んだ（または何も残っていなかった・あとにした）：閉じてゲームを続ける */
  done(picked: number | null): void;
  /** GUM が変わった */
  changed(): void;
}

/** 札の中身（メリット黄・デメリット赤） */
export function limitedCardBody(id: number): string {
  const l = limitedById(id);
  const d = limitedOf(id);
  if (!l) return '';
  const ty = LIM_TYPE[d.type];
  return `<img src="${esc(l.img)}" alt=""><b>${esc(l.name)}</b><small class="lim-type" style="--t:${ty.color}">${esc(ty.name)}</small>
    <span class="lim-good">${esc(d.good)}</span>${d.bad ? `<span class="lim-bad">${esc(d.bad)}</span>` : '<span class="lim-only">デメリットなし</span>'}`;
}

/** 候補がなければ開かずに null を返す */
export function openLimitedPick(root: HTMLElement, save: Save, hooks: LimitedHooks, kick: string, note = ''): HTMLElement | null {
  const n = limitedCards(save.quota);
  const savedN = (save.quota.saved ?? []).filter((id) => !save.limited.includes(id)).length;
  let cands = limitedCands(save, n, rollLimited);
  if (!cands.length) return null;
  let sel = -1;
  const el = document.createElement('div');
  el.className = 'limpick';
  root.append(el);

  function render(): void {
    const price = rerollPrice(save);
    const can = Number.isFinite(price);
    el.innerHTML = `
      <div class="limpick-in">
        <p class="limpick-kick">${esc(kick)}${n > 3 ? `<b>　候補 +${n - 3}</b>` : ''}${note ? `<b>　${esc(note)}</b>` : ''}${save.quota.doubleNext ? '<b>　次の札は 2 回発動！</b>' : ''}</p>
        <h2>LIMITED を 1 つ選ぶ</h2>
        <p class="limpick-sub">タップで選び、<b>もう 1 回タップで決定</b>。選んだ品はこの挑戦の間ずっと台に付く（外せない）。<span class="lim-good">黄＝いいこと</span>・<span class="lim-bad">赤＝そのかわり</span></p>
        <div class="limpick-cards c${Math.min(7, cands.length)}">${cands.map((id, i) => `<button class="lim-card${i === sel ? ' sel' : ''}${i < savedN ? ' saved' : ''}" data-i="${i}" style="--c:${RARITY_COLOR[5]};--d:${i * 70}ms">
            ${i < savedN ? '<i class="lim-kept">取っておいた</i>' : ''}${limitedCardBody(id)}<small class="lim-part">${esc(partName(limitedOf(id).part))}</small><em class="lim-again">もう 1 回タップで決定</em></button>`).join('')}</div>
        <div class="limpick-btns">
          <button class="pill" data-act="reroll"${!can || save.gum < price ? ' disabled' : ''}>引き直す<small>${can ? `${fmt(price)} GUM` : '引き直しできない'}</small></button>
          <button class="pill later" data-act="later">あとで選ぶ<small>次のノルマで選ぶ</small></button>
        </div>
      </div>`;
  }
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t || picked) return;
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
      // 引き直すのは新しい候補だけ（「あとで選ぶ」で取っておいた札は残す）
      const kept = cands.slice(0, savedN);
      const next = rollLimited([...save.limited, ...kept], n);
      if (next.length) cands = [...kept, ...next];
      save.quota.offer = [...cands];
      sel = -1;
      hooks.changed();
      blip(500, 0.1, 'sawtooth', 0.06, 2);
      render();
      return;
    }
    if (t.dataset.act === 'later') {
      picked = true;
      deferLimited(save, cands);
      blip(420, 0.12, 'triangle', 0.06, 1.2);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 420);
      hooks.done(null);
    }
  });
  let picked = false;
  function pick(): void {
    if (picked || sel < 0) return;
    picked = true;
    const id = cands[sel];
    const r = pickLimited(save, id);
    chime(10);
    el.querySelectorAll('.lim-card')[sel]?.classList.add('chosen');
    if (r.notes.length) {
      const tip = document.createElement('p');
      tip.className = 'lim-notes';
      tip.textContent = r.notes.join('・');
      el.querySelector('.limpick-in')?.appendChild(tip);
    }
    const finish = (): void => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 420);
      hooks.done(id);
    };
    hooks.changed(); // 選んだ札（とこれから選ぶヒートの印の数）を残す
    if (r.heat > 0 && heatChoices(save).length) setTimeout(() => openHeatPick(el, save, r.heat, finish), r.notes.length ? 900 : 500);
    else setTimeout(finish, r.notes.length ? 900 : 0);
  }
  render();
  return el;
}

/** ヒートの印を付ける部品を n つ選ぶ（Limited の札で） */
function openHeatPick(el: HTMLElement, save: Save, n: number, done: () => void): void {
  const choices = heatChoices(save);
  const want = Math.min(n, choices.length);
  const chosen: string[] = [];
  const box = document.createElement('div');
  box.className = 'heatpick';
  const draw = (): void => {
    box.innerHTML = `<div class="heatpick-in">
      <h3>ヒートの印を付ける部品を <b>${want}</b> つ選ぶ</h3>
      <p>印の部品に当たるたびに、そのプレイの倍率が上がる（台の上で炎が見える）。よく当たる部品ほど、1 回の上がり方は小さい。</p>
      <div class="heatpick-grid">${choices.map((src) => `<button data-src="${src}" aria-pressed="${chosen.includes(src)}"><b>${esc(srcShort(src as GumSrc))}</b><small>1 回 +${heatPer(src as GumSrc)}</small></button>`).join('')}</div>
      <button class="pill main" data-act="ok"${chosen.length < want ? ' disabled' : ''}>決定（${chosen.length} / ${want}）</button>
    </div>`;
  };
  box.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.src) {
      const src = t.dataset.src;
      const i = chosen.indexOf(src);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < want) chosen.push(src);
      else { chosen.shift(); chosen.push(src); }
      blip(600 + chosen.length * 120, 0.06, 'square', 0.05, 1.4);
      draw();
      return;
    }
    if (t.dataset.act === 'ok' && chosen.length >= want) {
      addHeat(save, chosen);
      save.quota.heatLeft = 0;
      se('buff', 0.6, 0, 0.9);
      blip(330, 0.3, 'sawtooth', 0.07, 2.4);
      box.classList.add('lit');
      setTimeout(done, 520);
    }
  });
  draw();
  el.appendChild(box);
}

/** 前に閉じたとき、ヒートの印を選び残していた：選ぶ画面だけを出す */
export function openHeatLeft(root: HTMLElement, save: Save, done: () => void): boolean {
  const n = save.quota.heatLeft ?? 0;
  if (n <= 0 || !heatChoices(save).length) { save.quota.heatLeft = 0; return false; }
  const el = document.createElement('div');
  el.className = 'limpick';
  root.append(el);
  openHeatPick(el, save, n, () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 420);
    done();
  });
  return true;
}
