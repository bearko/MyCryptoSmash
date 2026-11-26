// 実況のことばを、アメコミの擬音のようなド派手な文字で出す。連鎖の段階（tier 0〜3）で大きさと派手さが上がる。
// 実況しているのは画面の右上のジョーカー（ピエロのシリーズ）。ことばはジョーカーの左に出し、台を覆わないようにする。

import { TOY_ART, toyArt } from '../game/toys';

const SPIKES = [11, 14, 18, 24];
const BURST = [['#ffd23f', '#fff3a8'], ['#ff4f5e', '#ffb3ba'], ['#3fa9ff', '#bfe2ff'], ['#ff2ea6', '#ffe14d']];
/** ことばの大きさ（もとの大きさに対して） */
const SIZE = 0.72;
const SIZE_BIG = 0.8;
/** ジョーカーの幅（px）とことばの段：新しいことばはいつも上の段（ジョーカーの口もと）、前のことばは下の段へずれてうすくなる */
const JOKER_W = 78;
const ROWS = [32, 92];

/** ぎざぎざの吹き出し（星形）の頂点 */
function burstPoints(spikes: number, seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const jitter = 0.85 + 0.3 * Math.abs(Math.sin(seed * 13.7 + i * 2.3));
    const r = (i % 2 === 0 ? 96 : 62) * (i % 2 === 0 ? jitter : 1);
    pts.push(`${(Math.cos(a) * r * 1.35).toFixed(1)},${(Math.sin(a) * r * 0.82).toFixed(1)}`);
  }
  return pts.join(' ');
}

// ---------------------------------------------------------------- 実況のジョーカー
let joker: HTMLElement | null = null;
let talkTimer = 0;
function jokerOf(root: HTMLElement): HTMLElement {
  if (joker && joker.parentElement === root) return joker;
  joker = document.createElement('div');
  joker.className = 'joker';
  joker.innerHTML = `<i class="jk-aura"></i><i class="jk-ring"></i><img src="${toyArt(TOY_ART.announcer[0])}" alt=""><b class="jk-mic"></b>`;
  root.append(joker);
  return joker;
}
/** ジョーカーがしゃべる：段階が上がるほど大きく跳ねて、震えて、光る */
function jokerTalk(root: HTMLElement, tier: number, ms: number): void {
  const j = jokerOf(root);
  j.classList.remove('talk', 'k0', 'k1', 'k2', 'k3');
  void j.offsetWidth; // 動きを最初からやり直す
  j.classList.add('talk', `k${tier}`);
  window.clearTimeout(talkTimer);
  talkTimer = window.setTimeout(() => j.classList.remove('talk', 'k0', 'k1', 'k2', 'k3'), ms);
}
/** ことばなしで身ぶりだけ（仕掛けの知らせは電光掲示板に出るので、ジョーカーは言わずに盛り上がる） */
export function jokerCheer(tier: number): void {
  const j = joker;
  if (!j?.parentElement || j.classList.contains('talk')) return;
  j.classList.remove('k0', 'k1', 'k2', 'k3');
  void j.offsetWidth;
  j.classList.add(`k${tier}`);
  window.clearTimeout(talkTimer);
  talkTimer = window.setTimeout(() => j.classList.remove('k0', 'k1', 'k2', 'k3'), 600);
}
/** 画面を開いたときから右上にいる（待っている間もゆれている） */
export function initJoker(root: HTMLElement): void { jokerOf(root); }

let live: { el: HTMLElement; big: boolean }[] = [];

export function callout(root: HTMLElement, text: string, tier: number, big: boolean): void {
  const t = Math.max(0, Math.min(3, tier));
  const el = document.createElement('div');
  el.className = `co t${t}${big ? ' big' : ''}`;
  const seed = Math.random() * 100;
  const rot = (Math.random() * 2 - 1) * (4 + t * 2);
  el.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
  const [b1, b2] = BURST[t];
  const safe = text.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;');
  el.innerHTML = `
    <div class="co-in">
      <svg class="co-burst" viewBox="-140 -90 280 180" aria-hidden="true">
        <polygon points="${burstPoints(SPIKES[t], seed)}" fill="rgba(0,0,0,0.45)" transform="translate(0 7)"/>
        <polygon points="${burstPoints(SPIKES[t], seed)}" fill="${b1}" stroke="#0a0d1c" stroke-width="7" stroke-linejoin="round"/>
        <polygon points="${burstPoints(SPIKES[t], seed + 1)}" fill="${b2}" transform="scale(0.72)" opacity="0.9"/>
        <g class="co-dots" fill="#0a0d1c" opacity="0.13">${Array.from({ length: 40 }, (_, i) => `<circle cx="${((i % 8) - 3.5) * 22}" cy="${(Math.floor(i / 8) - 2) * 22}" r="3.2"/>`).join('')}</g>
      </svg>
      <span class="co-text"><span class="co-out" aria-hidden="true">${safe}</span><span class="co-fill">${safe}</span></span>
    </div>`;
  root.append(el);
  // 置き場所：ジョーカーの左の上の段。前のことばは下の段へずらし、もっと前のものは消す（同時に 2 つまで）
  const top = parseFloat(getComputedStyle(root).getPropertyValue('--rink-top')) || 70;
  while (live.length >= ROWS.length) live.shift()?.el.remove();
  live.forEach((x, i) => {
    x.el.classList.add('old');
    x.el.style.top = `${top + ROWS[Math.min(ROWS.length - 1, live.length - i)] + (x.big ? 6 : 0)}px`;
  });
  live.push({ el, big });
  const row = 0;
  const W = root.clientWidth;
  const textW = (el.querySelector('.co-text') as HTMLElement).offsetWidth;
  const room = W - JOKER_W - 14;
  // 長いことばは入る大きさまで小さくする
  const s = Math.min(big ? SIZE_BIG : SIZE, room / Math.max(1, textW + 24));
  const half = ((textW + 24) * s) / 2;
  const x = Math.max(half + 6, W - JOKER_W - 6 - half);
  el.style.left = `${x}px`;
  el.style.top = `${top + ROWS[row] + (big ? 6 : 0)}px`;
  el.style.setProperty('--s', s.toFixed(3));
  const life = 1100 + t * 150 + (big ? 400 : 0);
  el.style.setProperty('--life', `${life}ms`);
  jokerTalk(root, t, life * 0.8);
  window.setTimeout(() => {
    el.remove();
    live = live.filter((e) => e.el !== el);
  }, life);
}

/** 画面がぱっと光る（tier 2 から） */
let flashing = false;
export function flash(root: HTMLElement, color: string): void {
  if (flashing) return; // 重ねない
  flashing = true;
  window.setTimeout(() => { flashing = false; }, 300);
  const f = document.createElement('div');
  f.className = 'screen-flash';
  f.style.background = color;
  root.append(f);
  window.setTimeout(() => f.remove(), 350);
}
