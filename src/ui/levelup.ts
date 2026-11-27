// 上がった瞬間の見せ場（ギミックの見せ場 .toyget と同じ舞台。見た目は reward.css。触ると閉じる）。文は名前と数字だけ。
// - エクステンションの進化：同じシリーズを重ねてレアリティが上がった。古い絵が震えて白く飛び、上の★の品（名前と絵が変わる）へ。★と点のゲージ
// - マレットのレベルアップ：Lv と基礎ポイントの数字が転がって上がる
// 数値と判定は src/game/stack.ts（重ね）と src/game/quota.ts（マレット）。

import './reward.css';
import type { Ext } from '../core/catalog';
import { RARITY_COLOR } from '../core/catalog';
import { buzz, music, sfx } from '../core/audio';
import { fmt } from '../core/util';
import { extName } from '../game/exts';
import { gaugeOf } from '../game/stack';
import { malletPoints, malletPts } from '../game/quota';
import { burst, rollNumber } from './kit';
import { rewardFrame } from './gimmick';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function overlay(root: HTMLElement, cls: string, html: string, done: () => void, lock: number, color = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `toyget ${cls}`;
  if (color) el.style.setProperty('--c', color);
  el.innerHTML = rewardFrame(html);
  root.append(el);
  let closable = false;
  const t = window.setTimeout(() => { closable = true; el.classList.add('closable'); }, lock);
  el.addEventListener('click', () => {
    if (!closable || el.classList.contains('leaving')) return;
    window.clearTimeout(t);
    sfx('close');
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); done(); }, 380);
  });
  return el;
}

/** エクステンションの進化：重ねてレアリティが上がった（エピック以上はさらに派手に） */
export function showExtEvolve(root: HTMLElement, from: Ext, to: Ext, pts: number, done: () => void): void {
  const g = gaugeOf(pts);
  const big = to.rarity >= 4;
  const el = overlay(root, `evo ext-evo r${to.rarity}${big ? ' big' : ''}`, `
    <p class="tg-kick">RARITY UP!</p>
    <div class="tg-evo"><img class="old" src="${esc(from.img)}" alt=""><img class="new" src="${esc(to.img)}" alt=""><i class="tg-burst"></i></div>
    <h2><small>${'★'.repeat(to.rarity)}</small>${esc(to.name)}</h2>
    <div class="tg-nums"><span class="k-tag" data-tone="bone">${esc(extName(to))}</span><div class="k-gauge${g.hi === null ? ' is-full' : ''}" style="--v:${g.hi === null ? 1 : g.frac.toFixed(3)};--tone:${RARITY_COLOR[to.rarity]}"><i></i></div><small>${g.hi === null ? 'MAX' : `${pts}/${g.hi}`}</small></div>
    ${big ? `<p class="tg-boom">${to.rarity >= 5 ? 'LEGENDARY!!' : 'EPIC!'}</p>` : ''}`, done, 2200, RARITY_COLOR[to.rarity]);
  // 古い絵が震えるあいだ音が上がり、変わった瞬間に進化の音。エピック以上は BGM の大当たりの合いの手とファンファーレ
  for (let i = 0; i < 8; i += 1) setTimeout(() => { if (el.isConnected) sfx('mult', { step: i + (big ? 3 : 0), vol: 0.7 }); }, 100 + i * 130);
  setTimeout(() => {
    if (!el.isConnected) return;
    sfx('evolve');
    music.hit(big ? 'jackpot' : 'crash');
    buzz(big ? [0, 60, 40, 60, 40, 140] : [0, 40, 40, 60]);
    const evo = el.querySelector<HTMLElement>('.tg-evo');
    if (evo) burst(evo, big ? 22 : 12, el);
  }, 1300);
  if (big) setTimeout(() => { if (el.isConnected) { sfx('fanfare'); sfx('roar', { power: to.rarity >= 5 ? 1 : 0.7 }); } }, 1600);
}

/** マレットのレベルアップ：Lv と基礎ポイントが転がって上がる */
export function showMalletUp(root: HTMLElement, heroImg: string, from: number, to: number, done: () => void): void {
  const a = malletPoints(from);
  const b = malletPoints(to);
  const k = malletPts(to);
  const kf = k < 10 ? (Math.round(k * 10) / 10).toString() : fmt(Math.round(k));
  const el = overlay(root, 'mallet-up-fx', `
    <p class="tg-kick">LEVEL UP!</p>
    <div class="tg-evo mallet-evo"><img class="new" src="${esc(heroImg)}" alt=""><i class="tg-burst"></i></div>
    <div class="tg-lv"><small>Lv</small><b class="k-num k-num--l was">${from}</b><i class="arrow"></i><b class="k-num k-num--xl">${to}</b></div>
    <div class="tg-nums"><b class="k-num k-num--s was">${fmt(a)}</b><i class="arrow"></i><b class="k-num k-num--l mpts">${fmt(a)}</b><span class="k-tag k-tag--en" data-tone="ticket">×${kf}</span></div>`, done, 1200);
  // 新しい数字が転がって上がる（数えるあいだ音が上がる）
  const num = el.querySelector('.mpts') as HTMLElement;
  setTimeout(() => { if (el.isConnected) rollNumber(num, b, { from: a, fmt, ms: 600 }); }, 520);
  for (let i = 0; i < 5; i += 1) setTimeout(() => { if (el.isConnected) sfx('count', { p: i / 4 }); }, 540 + i * 120);
  sfx('levelup');
  music.hit('fill');
  setTimeout(() => {
    if (!el.isConnected) return;
    buzz([0, 40, 30, 60]);
    const evo = el.querySelector<HTMLElement>('.tg-evo');
    if (evo) burst(evo, 10, el);
  }, 200);
}
