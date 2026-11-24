// 実況のことばを、アメコミの擬音のようなド派手な文字で出す。連鎖の段階（tier 0〜3）で大きさと派手さが上がる。

const SPIKES = [11, 14, 18, 24];
const BURST = [['#ffd23f', '#fff3a8'], ['#ff4f5e', '#ffb3ba'], ['#3fa9ff', '#bfe2ff'], ['#ff2ea6', '#ffe14d']];

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

let live: HTMLElement[] = [];

export function callout(root: HTMLElement, text: string, tier: number, big: boolean): void {
  const t = Math.max(0, Math.min(3, tier));
  const el = document.createElement('div');
  el.className = `co t${t}${big ? ' big' : ''}`;
  const seed = Math.random() * 100;
  // 置き場所：まん中寄りの上半分。大きな区切りはまん中
  const x = big ? 50 : 22 + Math.random() * 56;
  const y = big ? 40 : 24 + Math.random() * 26;
  const rot = (Math.random() * 2 - 1) * (6 + t * 3);
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  el.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
  const [b1, b2] = BURST[t];
  const safe = text.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;');
  el.innerHTML = `
    <svg class="co-burst" viewBox="-140 -90 280 180" aria-hidden="true">
      <polygon points="${burstPoints(SPIKES[t], seed)}" fill="${b1}" stroke="#0a0d1c" stroke-width="7" stroke-linejoin="round"/>
      <polygon points="${burstPoints(SPIKES[t], seed + 1)}" fill="${b2}" transform="scale(0.72)" opacity="0.9"/>
      <g class="co-dots" fill="#0a0d1c" opacity="0.13">${Array.from({ length: 40 }, (_, i) => `<circle cx="${((i % 8) - 3.5) * 22}" cy="${(Math.floor(i / 8) - 2) * 22}" r="3.2"/>`).join('')}</g>
    </svg>
    <span class="co-text"><span class="co-out" aria-hidden="true">${safe}</span><span class="co-fill">${safe}</span></span>`;
  root.append(el);
  live.push(el);
  // 同時に出すのは 3 つまで（古いものから消す）
  while (live.length > 3) live.shift()?.remove();
  const life = 1100 + t * 150 + (big ? 400 : 0);
  window.setTimeout(() => {
    el.remove();
    live = live.filter((e) => e !== el);
  }, life);
  el.style.setProperty('--life', `${life}ms`);
}

/** 画面がぱっと光る（tier 2 から） */
export function flash(root: HTMLElement, color: string): void {
  const f = document.createElement('div');
  f.className = 'screen-flash';
  f.style.background = color;
  root.append(f);
  window.setTimeout(() => f.remove(), 350);
}
