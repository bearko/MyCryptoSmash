// 上がった瞬間の演出（ギミックの演出 .toyget と同じ作り。触ると閉じる）。
// - エクステンションの進化：同じシリーズを重ねてレアリティが上がった。古い絵が震えて白く光り、上の★の品（名前と絵が変わる）へ
// - マレットのレベルアップ：基礎ポイントが回って上がる
// 数値と判定は src/game/stack.ts（重ね）と src/game/quota.ts（マレット）。

import type { Ext } from '../core/catalog';
import { RARITY_COLOR } from '../core/catalog';
import { blip, buzz, chime, roar, se } from '../core/audio';
import { fmt } from '../core/util';
import { extName, extText } from '../game/exts';
import { RARITY_NAME, gaugeOf } from '../game/stack';
import { malletPoints, malletPts } from '../game/quota';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function overlay(root: HTMLElement, cls: string, html: string, done: () => void, lock: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `toyget evo ${cls}`;
  el.innerHTML = `<div class="tg-rays"></div><div class="tg-stage">${html}</div><p class="tg-tap">タップで閉じる</p>`;
  root.append(el);
  let closable = false;
  const t = window.setTimeout(() => { closable = true; el.classList.add('closable'); }, lock);
  el.addEventListener('click', () => {
    if (!closable || el.classList.contains('leaving')) return;
    window.clearTimeout(t);
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); done(); }, 420);
  });
  return el;
}

/** エクステンションの進化：重ねてレアリティが上がった（エピック以上はさらに派手に） */
export function showExtEvolve(root: HTMLElement, from: Ext, to: Ext, pts: number, done: () => void): void {
  const g = gaugeOf(pts);
  const big = to.rarity >= 4;
  overlay(root, `ext-evo r${to.rarity}${big ? ' big' : ''}`, `
    <p class="tg-kick">RARITY UP!</p>
    <div class="tg-evo"><img class="old" src="${esc(from.img)}" alt=""><img class="new" src="${esc(to.img)}" alt=""><i class="tg-burst"></i></div>
    <h2 class="tg-name" style="--c:${RARITY_COLOR[to.rarity]}"><small>${RARITY_NAME[to.rarity - 1]}</small>${esc(to.name)}</h2>
    <p class="tg-sub">${esc(from.name)} が <b>${esc(to.name)}</b> に進化した！（${pts} 点${g.hi === null ? '・最高のレアリティ' : `・${RARITY_NAME[to.rarity]}まで あと ${g.need} 点`}）</p>
    <p class="tg-what">${esc(extName(to))}：${esc(extText(to))}</p>
    ${big ? `<p class="tg-boom">${to.rarity >= 5 ? 'LEGENDARY!!' : 'EPIC!'}</p>` : ''}`, done, 2200);
  for (let i = 0; i < 8; i += 1) setTimeout(() => chime(i * 2 + (big ? 4 : 0)), 100 + i * 130);
  setTimeout(() => { se('win', 0.8, 0); roar(big ? 1 : 0.7, big ? 2.2 : 1.4); buzz(big ? [0, 60, 40, 60, 40, 140] : [0, 40, 40, 60]); }, 1250);
  if (big) setTimeout(() => { se('blast', 0.6, 0, 1.2); for (let i = 0; i < 5; i += 1) setTimeout(() => blip(990 + i * 220, 0.08, 'square', 0.06, 1.6), i * 60); }, 1500);
}

/** マレットのレベルアップ：基礎ポイントが回って上がる */
export function showMalletUp(root: HTMLElement, heroImg: string, from: number, to: number, done: () => void): void {
  const a = malletPoints(from);
  const b = malletPoints(to);
  const k = malletPts(to);
  const kf = k < 10 ? (Math.round(k * 10) / 10).toString() : fmt(Math.round(k));
  const el = overlay(root, 'mallet-up-fx', `
    <p class="tg-kick">MALLET LV UP!</p>
    <div class="tg-evo mallet-evo"><img class="new" src="${esc(heroImg)}" alt=""><i class="tg-burst"></i><b class="mlv">Lv <span>${to}</span></b></div>
    <h2 class="tg-name"><small>基礎ポイント</small><span>${fmt(a)}</span> → <em class="mpts">${fmt(a)}</em></h2>
    <p class="tg-sub">全部の球の GUM の基本額が <b>×${kf}</b> に！</p>
    <p class="tg-what">Lv ${from} → Lv ${to}（GAME OVER で Lv 1 に戻る）</p>`, done, 1200);
  // 新しい数字が回って上がる
  const num = el.querySelector('.mpts') as HTMLElement;
  const t0 = performance.now();
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0 - 500) / 600);
    if (k > 0) num.textContent = fmt(Math.round(a + (b - a) * k));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  se('buff', 0.7, 0, 1.3);
  [0, 80, 160, 240, 320].forEach((d, i) => setTimeout(() => blip(520 + i * 180, 0.08, 'square', 0.07, 1.5), d));
  setTimeout(() => { roar(0.6, 1.5); buzz([0, 40, 30, 60]); chime(12); }, 700);
}
