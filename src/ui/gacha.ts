// ヒーローマレットのガチャの見せ場（CSS と DOM だけ。canvas の重い描き方はしない。見た目は gacha.css、様式は kit）。
// カプセルが落ちる → 揺れる → （エピック以上は確定演出）→ ひびが入る → 開いて、ヒーローがトランプの札で出る。
// 出るレアリティで、光の色（RARITY_COLOR）・揺れの回数・光の量・紙吹雪・音を変える。
// 確定演出：エピックは画面が光ってカプセルが金に変わり、「EPIC!!」の帯が横切ってピエロがのぞく（BGM に合いの手）。
//          レジェンダリーは画面が揺れ、幕が閉じて開くとカプセルが箔の色に変わり「LEGENDARY!!」（BGM はボスの曲に変わり、開いた瞬間に大当たりの一発）。
// 結果は絵と短い札だけ：★・名前・系統と能力の名前・行き先（編成の枠のどこに入ったか／控え室の絵）。
// 触ると次の場面へ送れる（とばしすぎないよう、場面ごとに少し待つ）。最後は触って閉じる。
// 計算は src/game/gacha.ts。

import { RARITY_COLOR, RARITY_NAME, cat, type Hero } from '../core/catalog';
import './gacha.css';
import './reward.css';
import { buzz, music, sfx } from '../core/audio';
import { burst, isCalm, wipe } from './kit';
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
const BENCH_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.5 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6zm15.5 0c0-2-.8-3.8-2.1-5.1.4-.1.7-.1 1.1-.1 3 0 5.5 2.3 5.5 5.2z"/></svg>';

export interface GachaOpts {
  /** いまのピエロの段階（のぞくピエロの絵） */
  tier: number;
  /** 編成に入った（false なら控え室） */
  party: boolean;
  /** 編成の枠の数と、入った場所（0 が先頭）。行き先の絵に使う */
  slots?: { n: number; at: number; used: number };
  done(): void;
}

export function showGacha(root: HTMLElement, cap: Capsule, hero: Hero, o: GachaOpts): void {
  const r = Math.max(1, Math.min(5, hero.rarity));
  const col = RARITY_COLOR[r];
  const ab = abilityOf(hero);
  const el = document.createElement('div');
  el.className = `gx r${r}`;
  el.style.setProperty('--rc', col);
  // 行き先：編成に入ったら枠の並び（入った所が黄）、いっぱいなら控え室の絵と札
  const sl = o.slots;
  const to = o.party
    ? `${sl ? `<span class="ga-slots" role="img" aria-label="編成に入った">${Array.from({ length: sl.n }, (_, i) => `<i class="${i === sl.at ? 'me' : i < sl.used ? 'on' : 'off'}"></i>`).join('')}</span>` : ''}<span class="k-tag k-tag--en" data-tone="ticket">IN!</span>`
    : `${BENCH_ICON}<span class="k-tag" data-tone="ink">控え室</span>`;
  el.innerHTML = `
    <div class="ga-rays"></div>
    <i class="tg-band t"><i class="k-bulbs"></i></i><i class="tg-band b"><i class="k-bulbs"></i></i>
    <div class="ga-flash"></div>
    <div class="ga-sure" aria-hidden="true"><span><b>${r >= 5 ? 'LEGENDARY!!' : 'EPIC!!'}</b></span></div>
    <div class="ga-clown"><img src="${esc(clownArt(o.tier))}" alt=""><p></p></div>
    <div class="ga-stage">
      <i class="ga-floor"></i>
      <div class="ga-capwrap">${capsuleHtml(cap, 'big')}<svg class="ga-crack" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 52 L22 46 L30 56 L42 44 L52 55 L63 45 L72 56 L84 47 L94 52 M42 44 L38 30 M63 45 L68 32 M30 56 L26 68 M72 56 L76 70"/><path d="M8 52 L22 46 L30 56 L42 44 L52 55 L63 45 L72 56 L84 47 L94 52 M42 44 L38 30 M63 45 L68 32 M30 56 L26 68 M72 56 L76 70"/></svg></div>
      <i class="ga-pop"></i>
      <div class="ga-hero">
        <div class="ga-card"><img src="${esc(hero.img)}" alt=""><i class="k-suit a" data-suit="${['spade', 'club', 'diamond', 'heart', 'heart'][r - 1]}"></i><i class="k-suit b" data-suit="${['spade', 'club', 'diamond', 'heart', 'heart'][r - 1]}"></i><p class="ga-new">NEW</p></div>
        <p class="ga-stars" aria-label="${RARITY_NAME[r]}">${Array.from({ length: r }, (_, i) => `<i style="--i:${i}">★</i>`).join('')}</p>
        <h2>${esc(hero.name)}</h2>
        <p class="ga-ab"><span class="k-tag fam" style="--fc:${FAMILY_COLOR[ab.family]}">${FAMILY_NAME[ab.family]}</span><span class="k-tag" data-tone="bone">${esc(ab.name)}</span></p>
        <p class="ga-to">${to}</p>
      </div>
      <div class="ga-confetti"></div>
    </div>
    <i class="ga-tap" role="img" aria-label="タップで閉じる"></i>`;
  root.append(el);
  const capEl = el.querySelector('.ga-capwrap') as HTMLElement;
  const clownP = el.querySelector('.ga-clown p') as HTMLElement;

  let phase: Phase = 'drop';
  let phaseAt = performance.now();
  let timer = 0;
  const timers: number[] = [];
  const later = (ms: number, f: () => void): void => { timers.push(window.setTimeout(f, ms)); };
  const clearLater = (): void => { timers.splice(0).forEach((t) => window.clearTimeout(t)); };
  /** レジェンダリーの間だけ、BGM をボスの曲に（閉じるときに外す） */
  let unMusic: (() => void) | null = null;

  const go = (p: Phase): void => {
    window.clearTimeout(timer);
    clearLater();
    phase = p;
    phaseAt = performance.now();
    el.dataset.phase = p;
    if (p === 'drop') {
      later(420, () => { sfx('thwack', { power: 0.6 }); buzz(15); });
      later(570, () => sfx('spring', { power: 0.4 }));
      timer = window.setTimeout(() => go('shake'), 760);
    } else if (p === 'shake') {
      const n = SHAKES[r];
      capEl.style.setProperty('--n', String(n));
      // 揺れるたびに音が上がる（★が高いほど高くから）
      for (let i = 0; i < n; i += 1) later(i * 380 + 60, () => { sfx('mult', { step: i + r, vol: 0.8 }); buzz(12); });
      timer = window.setTimeout(() => go(r >= 4 ? 'sure' : 'crack'), n * 380 + 200);
    } else if (p === 'sure') {
      // 確定演出：画面が光り、カプセルが金（エピック）・箔（レジェンダリー）に変わる。帯が横切り、ピエロがのぞく
      const lines = SURE_LINES[r >= 5 ? 1 : 0];
      clownP.textContent = lines[Math.floor(Math.random() * lines.length)];
      sfx('shimmer');
      sfx('roar', { power: r >= 5 ? 0.9 : 0.6 });
      buzz(r >= 5 ? [0, 60, 40, 60, 40, 120] : [0, 40, 30, 40]);
      if (r >= 5) {
        // レジェンダリー：BGM がボスの曲に。幕が閉じ、開くと箔のカプセル
        unMusic ??= music.override('boss');
        music.hit('fill');
        const foil = (): void => { if (el.classList.contains('is-foil')) return; el.classList.add('is-foil'); sfx('jackpot'); music.hit('crash'); buzz([0, 80, 40, 120]); };
        if (isCalm()) foil();
        else { later(250, () => { void wipe('curtain', foil, { root: el, ghost: true }); }); later(900, foil); }
        for (let i = 0; i < 10; i += 1) later(1000 + i * 110, () => sfx('mult', { step: i + 4, vol: 0.6 }));
      } else {
        music.hit('fill');
        for (let i = 0; i < 6; i += 1) later(200 + i * 110, () => sfx('mult', { step: i + 2, vol: 0.6 }));
      }
      timer = window.setTimeout(() => go('crack'), r >= 5 ? 2500 : 1500);
    } else if (p === 'crack') {
      el.classList.add('is-foil');
      for (let i = 0; i < 3; i += 1) later(i * 150, () => sfx('tick', { step: i + r }));
      timer = window.setTimeout(() => go('open'), 620);
    } else if (p === 'open') {
      spray();
      // 開く音：★1・2 は箱が開くだけ。★3 から歓声、エピックはファンファーレと BGM の大当たり、レジェンダリーはさらに爆発
      sfx('chest');
      if (r >= 3) later(120, () => sfx('fanfare'));
      if (r >= 3) later(220, () => sfx('roar', { power: r >= 5 ? 1 : r >= 4 ? 0.8 : 0.45 }));
      if (r >= 4) music.hit('jackpot');
      if (r >= 5) { sfx('explode', { power: 1 }); later(500, () => music.hit('crash')); }
      buzz(r >= 4 ? [0, 40, 30, 40, 30, 80] : 30);
      const card = el.querySelector<HTMLElement>('.ga-card');
      if (card && r >= 2) later(200, () => burst(card, [0, 0, 6, 10, 18, 28][r], el));
      if (card && r >= 5) later(700, () => burst(card, 20, el));
      later(520, () => sfx('stamp', { vol: 0.7 })); // NEW の判
      timer = window.setTimeout(() => go('done'), r >= 4 ? 1400 : 900);
    }
  };

  // 紙吹雪（レアリティが高いほど多い。レジェンダリーは虹色）
  function spray(): void {
    const box = el.querySelector('.ga-confetti') as HTMLElement;
    const n = isCalm() ? 0 : CONFETTI[r];
    const cols = r >= 5 ? ['#ff2e5a', '#ffd21f', '#22e5c0', '#3fa9ff', '#b06bff', '#f4efe4'] : [col, '#f4efe4', col, '#ffd21f'];
    box.innerHTML = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 90 + Math.random() * 150;
      return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 60).toFixed(0)}px;--rot:${Math.round(Math.random() * 720 - 360)}deg;--d:${(Math.random() * 0.15).toFixed(2)}s;background:${cols[i % cols.length]}"></i>`;
    }).join('');
  }

  const close = (): void => {
    if (el.classList.contains('leaving')) return;
    window.clearTimeout(timer);
    clearLater();
    unMusic?.();
    unMusic = null;
    sfx('close');
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); o.done(); }, 400);
  };
  el.addEventListener('click', () => {
    const age = performance.now() - phaseAt;
    if (phase === 'done') { close(); return; }
    // 送りすぎない：場面が始まってすぐは送らない。確定演出は少し長く見せる
    if (age < (phase === 'sure' ? (r >= 5 ? 1400 : 900) : phase === 'open' ? 500 : 220)) return;
    if (phase === 'drop') go('shake');
    else if (phase === 'shake') go(r >= 4 ? 'sure' : 'crack');
    else if (phase === 'sure') go('crack');
    else if (phase === 'crack') go('open');
    else if (phase === 'open') go('done');
  });
  requestAnimationFrame(() => go('drop'));
}
