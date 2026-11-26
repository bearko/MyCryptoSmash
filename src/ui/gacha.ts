// ヒーローマレットのガチャの演出（CSS と DOM だけ。canvas の重い描き方はしない）。
// カプセルが落ちる → 揺れる → （エピック以上は確定演出）→ ひびが入る → 開いてヒーローが出る。
// 出るレアリティで、光の色（RARITY_COLOR）・揺れの回数・光の量・音の高さを変える。
// 確定演出：エピックはカプセルが金に変わって画面が光り、ピエロがのぞく。レジェンダリーは虹色に変わり、幕が一度閉じて開き、画面が揺れる。
// 触ると次の場面へ送れる（とばしすぎないよう、場面ごとに少し待つ）。最後は触って閉じる。
// 計算は src/game/gacha.ts。

import { RARITY_COLOR, RARITY_NAME, cat, type Hero } from '../core/catalog';
import { blip, buzz, chime, roar, se } from '../core/audio';
import { abilityOf } from '../game/abilities';
import { FAMILY_COLOR, FAMILY_NAME, type Capsule } from '../game/gacha';
import { clownArt } from '../game/toys';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 揺れの回数（★1〜★5） */
const SHAKES = [0, 1, 2, 2, 3, 3];
/** 紙吹雪の数（★1〜★5） */
const CONFETTI = [0, 8, 14, 22, 40, 64];
const SURE_LINES = [
  ['おっと、これは……！', '来るぞ、来るぞ！', '台がざわついてる……！'],
  ['まさか……本物か！？', '見ろ、虹色だ！', 'こいつは伝説だぜ！'],
];

/** カプセルの色（★のカプセルはレアリティの色、系統のカプセルは系統の色） */
export const capsuleColor = (c: Capsule): string => (c.kind === 'rar' ? RARITY_COLOR[c.r] : FAMILY_COLOR[c.fam]);
/** カプセルの帯の印（★の数か、系統の絵） */
export function capsuleMark(c: Capsule): string {
  return c.kind === 'rar'
    ? `<span class="cap-stars">${'★'.repeat(c.r)}</span>`
    : `<img class="cap-fam" src="${esc(cat.icons[c.fam])}" alt="${FAMILY_NAME[c.fam]}">`;
}
/** カプセルの形（ショップの棚と演出で同じもの） */
export function capsuleHtml(c: Capsule, cls = ''): string {
  return `<i class="cap ${cls}" style="--cc:${capsuleColor(c)}"><i class="cap-top"></i><i class="cap-bot"></i><i class="cap-band">${capsuleMark(c)}</i><i class="cap-hl"></i></i>`;
}

type Phase = 'drop' | 'shake' | 'sure' | 'crack' | 'open' | 'done';

export function showGacha(root: HTMLElement, cap: Capsule, hero: Hero, o: { tier: number; party: boolean; done(): void }): void {
  const r = Math.max(1, Math.min(5, hero.rarity));
  const col = RARITY_COLOR[r];
  const ab = abilityOf(hero);
  const el = document.createElement('div');
  el.className = `gx r${r}`;
  el.style.setProperty('--rc', col);
  el.innerHTML = `
    <div class="ga-bg"></div>
    <div class="ga-rays"></div>
    <div class="ga-curtain l"></div><div class="ga-curtain r"></div>
    <div class="ga-flash"></div>
    <div class="ga-clown"><img src="${esc(clownArt(o.tier))}" alt=""><p></p></div>
    <div class="ga-stage">
      <div class="ga-capwrap">${capsuleHtml(cap, 'big')}<svg class="ga-crack" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 52 L22 46 L30 56 L42 44 L52 55 L63 45 L72 56 L84 47 L94 52"/><path d="M42 44 L38 30 M63 45 L68 32 M30 56 L26 68 M72 56 L76 70"/></svg></div>
      <div class="ga-hero">
        <div class="ga-art"><img src="${esc(hero.img)}" alt=""></div>
        <p class="ga-new">NEW</p>
        <p class="ga-stars">${'★'.repeat(r)}</p>
        <h2>${esc(hero.name)}</h2>
        <p class="ga-rar">${RARITY_NAME[r]}</p>
        <p class="ga-ab"><span style="--fc:${FAMILY_COLOR[ab.family]}">${FAMILY_NAME[ab.family]}</span>${esc(ab.name)}</p>
        <p class="ga-to">${o.party ? '編成に入った' : '控え室へ（ヒーローの枠がいっぱい）'}</p>
      </div>
      <div class="ga-confetti"></div>
    </div>
    <p class="ga-tap">タップ</p>`;
  root.append(el);
  const capEl = el.querySelector('.ga-capwrap') as HTMLElement;
  const clownP = el.querySelector('.ga-clown p') as HTMLElement;

  let phase: Phase = 'drop';
  let phaseAt = performance.now();
  let timer = 0;
  const timers: number[] = [];
  const later = (ms: number, f: () => void): void => { timers.push(window.setTimeout(f, ms)); };
  const clearLater = (): void => { timers.splice(0).forEach((t) => window.clearTimeout(t)); };

  const go = (p: Phase): void => {
    window.clearTimeout(timer);
    clearLater();
    phase = p;
    phaseAt = performance.now();
    el.dataset.phase = p;
    if (p === 'drop') {
      blip(300, 0.18, 'triangle', 0.06, 0.5);
      later(420, () => { blip(180, 0.08, 'square', 0.07, 0.8); buzz(15); });
      timer = window.setTimeout(() => go('shake'), 760);
    } else if (p === 'shake') {
      const n = SHAKES[r];
      capEl.style.setProperty('--n', String(n));
      for (let i = 0; i < n; i += 1) later(i * 380 + 60, () => { blip(420 + i * 160 + r * 40, 0.07, 'square', 0.06, 1.3); buzz(12); });
      timer = window.setTimeout(() => go(r >= 4 ? 'sure' : 'crack'), n * 380 + 200);
    } else if (p === 'sure') {
      // 確定演出：画面が光り、カプセルが金（エピック）・虹（レジェンダリー）に変わる。ピエロがのぞく。レジェンダリーは幕が閉じて開く
      const lines = SURE_LINES[r >= 5 ? 1 : 0];
      clownP.textContent = lines[Math.floor(Math.random() * lines.length)];
      se('buff', 0.8, 0, r >= 5 ? 0.8 : 1);
      roar(r >= 5 ? 0.9 : 0.6, 1.4);
      buzz(r >= 5 ? [0, 60, 40, 60, 40, 120] : [0, 40, 30, 40]);
      for (let i = 0; i < (r >= 5 ? 10 : 6); i += 1) later(200 + i * 110, () => chime(i * 2 + (r >= 5 ? 4 : 0)));
      timer = window.setTimeout(() => go('crack'), r >= 5 ? 2300 : 1500);
    } else if (p === 'crack') {
      for (let i = 0; i < 3; i += 1) later(i * 150, () => blip(700 + i * 260 + r * 60, 0.06, 'square', 0.06, 1.5));
      timer = window.setTimeout(() => go('open'), 620);
    } else if (p === 'open') {
      spray();
      se(r >= 3 ? 'win' : 'buff', r >= 4 ? 0.9 : 0.6, 0, r >= 5 ? 1.15 : 1);
      [0, 90, 180, 270, 360].slice(0, r + 1).forEach((d, i) => later(d, () => blip(660 + i * 220 + r * 30, 0.09, 'square', 0.07, 1.5)));
      if (r >= 3) later(200, () => roar(r >= 5 ? 1 : r >= 4 ? 0.8 : 0.45, r >= 4 ? 2 : 1.2));
      buzz(r >= 4 ? [0, 40, 30, 40, 30, 80] : 30);
      timer = window.setTimeout(() => go('done'), r >= 4 ? 1400 : 900);
    }
  };

  // 紙吹雪（レアリティが高いほど多い。レジェンダリーは虹色）
  function spray(): void {
    const box = el.querySelector('.ga-confetti') as HTMLElement;
    const n = CONFETTI[r];
    const cols = r >= 5 ? ['#ff4f5e', '#ffd23f', '#4fd67a', '#3fd0ff', '#c08bff', '#ff6ad5'] : [col, '#ffffff', col, '#ffe14d'];
    box.innerHTML = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 90 + Math.random() * 140;
      return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 60).toFixed(0)}px;--rot:${Math.round(Math.random() * 720 - 360)}deg;--d:${(Math.random() * 0.15).toFixed(2)}s;background:${cols[i % cols.length]}"></i>`;
    }).join('');
  }

  const close = (): void => {
    if (el.classList.contains('leaving')) return;
    window.clearTimeout(timer);
    clearLater();
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); o.done(); }, 420);
  };
  el.addEventListener('click', () => {
    const age = performance.now() - phaseAt;
    if (phase === 'done') { close(); return; }
    // 送りすぎない：場面が始まってすぐは送らない。確定演出は少し長く見せる
    if (age < (phase === 'sure' ? 900 : phase === 'open' ? 500 : 220)) return;
    if (phase === 'drop') go('shake');
    else if (phase === 'shake') go(r >= 4 ? 'sure' : 'crack');
    else if (phase === 'sure') go('crack');
    else if (phase === 'crack') go('open');
    else if (phase === 'open') go('done');
  });
  requestAnimationFrame(() => go('drop'));
}
