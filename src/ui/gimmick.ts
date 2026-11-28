// ギミック（台に買い足す部品と大きな仕掛け）の見せ場（見た目は reward.css。様式は kit）：
// - 仕掛けを買った瞬間：星形の切り絵の上に仕掛けの絵（台の上と同じ見た目。toy-thumb.ts）が落ちてきて「NEW GIMMICK!」と名札。閉じるとき、絵は台（ピンボールのタブ）へ飛んでいく
//   → 台が見えたとき、その場所で取り付けの演出（src/fx/table-fx.ts の fxToyInstalled。main.ts が呼ぶ）
// - ピエロの進化：古い絵が震えて白く飛び、新しい絵が弾けて出る。変わった瞬間に onEvolve（main.ts が画面全体の段階を上げる）。閉じると光の帯（beat('evolve')）
// - 文は名前と数字だけ（ピエロのセリフは世界観なので残す）。ピエロが上がる条件（あと何個）は、画面のどこにも出さない（ユーザーの指定）
// 数値と判定は src/game/toys.ts（TOY_PRICE・toysUnlocked・clownTier）。

import './reward.css';
import { buzz, music, sfx } from '../core/audio';
import { CLOWN_NAME, TOY_NAME, clownArt, type ToyId } from '../game/toys';
import { clownLine } from '../game/clown-lines';
import { startTalk, talkHtml } from './talk';
import { toyThumbImg } from './toy-thumb';
import { burst, isCalm, pop } from './kit';

/** 見せ場の枠：回る光の筋・上下の帯（電球）・舞台・閉じられる印 */
export const rewardFrame = (stage: string): string => `<i class="tg-rays"></i>
  <i class="tg-band t"><i class="k-bulbs"></i></i><i class="tg-band b"><i class="k-bulbs"></i></i>
  <div class="tg-stage">${stage}</div><i class="tg-tap" role="img" aria-label="タップで閉じる"></i>`;

/** 閉じるとき：絵が行き先（ピンボールのタブなど）へ飛んでいき、着いた所が弾む */
export function flyTo(img: HTMLElement | null, dst: HTMLElement | null): void {
  if (!img || !dst || isCalm() || dst.offsetParent === null) return;
  const a = img.getBoundingClientRect();
  const b = dst.getBoundingClientRect();
  const g = img.cloneNode(true) as HTMLElement;
  g.removeAttribute('class');
  g.style.cssText = `position:fixed;z-index:90;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;pointer-events:none;image-rendering:pixelated;animation:none;opacity:1`;
  document.body.append(g);
  img.style.visibility = 'hidden';
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  g.animate([
    { transform: 'none' },
    { transform: `translate(${dx * 0.2}px, ${dy * 0.2 - 60}px) scale(1.15) rotate(-14deg)`, offset: 0.35 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.22) rotate(20deg)` },
  ], { duration: 460, easing: 'cubic-bezier(0.5, 0, 0.4, 1)' }).onfinish = () => {
    g.remove();
    pop(dst);
    burst(dst, 8);
    sfx('stamp', { vol: 0.8 });
  };
}

/**
 * 仕掛けを買った瞬間の見せ場。そのあとピエロの姿が上がったなら、進化を続ける。触ると早送り、最後は触って閉じる。
 * onEvolve は、ピエロの絵が変わった瞬間（画面全体の段階を上げるのに使う）。
 */
export function showToyGet(root: HTMLElement, id: ToyId, from: number, to: number, name: string, done: () => void, onEvolve?: () => void): void {
  const el = document.createElement('div');
  el.className = 'toyget';
  el.innerHTML = rewardFrame(`
      <p class="tg-kick">NEW GIMMICK!</p>
      <div class="tg-art">${toyThumbImg(id)}</div>
      <h2>${TOY_NAME[id]}</h2>
      ${talkHtml(from, clownLine('gimmick', from, { name }))}`);
  root.append(el);
  startTalk(el, 700);
  // 音：落ちてきて、はまる。BGM も合いの手
  sfx('shimmer');
  music.hit('fill');
  const t1 = window.setTimeout(() => { sfx('thwack', { power: 0.7 }); buzz([0, 30, 30, 30]); const art = el.querySelector<HTMLElement>('.tg-art'); if (art) burst(art, 10, el); }, 520);
  let stage: 'get' | 'evolve' | 'end' = 'get';
  let timer = 0;
  let evolved = false;
  const fireEvolve = (): void => { if (!evolved) { evolved = true; onEvolve?.(); } };
  const close = (): void => {
    if (el.classList.contains('leaving')) return;
    stage = 'end';
    window.clearTimeout(timer);
    window.clearTimeout(t1);
    if (to > from) fireEvolve();
    // 絵は台へ：スマホはフッターの「ピンボール」、PC は見えている台へ
    if (to <= from) flyTo(el.querySelector<HTMLElement>('.tg-art img'), document.querySelector<HTMLElement>('.home-nav button:nth-child(2)'));
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); done(); }, 380);
  };
  const ready = (): void => { stage = 'end'; el.classList.add('closable'); };
  const evolve = (): void => {
    stage = 'evolve';
    window.clearTimeout(t1);
    el.classList.add('evo', 'clown-evo');
    const st = el.querySelector('.tg-stage') as HTMLElement;
    st.innerHTML = `
      <div class="tg-evo"><img class="old" src="${clownArt(from)}" alt=""><img class="new" src="${clownArt(to)}" alt=""><i class="tg-burst"></i></div>
      <h2><small>${'★'.repeat(to + 1)}</small>${CLOWN_NAME[to]}</h2>
      <p class="tg-names"><s>${CLOWN_NAME[from]}</s><i class="arrow"></i><b>${CLOWN_NAME[to]}</b></p>
      ${talkHtml(to, clownLine('evolve', to, { name }))}`;
    startTalk(st, 2000);
    // 古い絵が震えるあいだ、音が上がっていく。変わった瞬間に進化の音・BGM の一発・画面全体の色が戻る
    for (let i = 0; i < 8; i += 1) setTimeout(() => { if (el.isConnected) sfx('mult', { step: i, vol: 0.7 }); }, 120 + i * 140);
    setTimeout(() => {
      if (!el.isConnected) return;
      el.classList.add('lit');
      sfx('evolve');
      music.hit('crash');
      buzz([0, 60, 40, 60, 40, 120]);
      fireEvolve();
      const evo = el.querySelector<HTMLElement>('.tg-evo');
      if (evo) burst(evo, 12 + to * 3, el);
    }, 1300);
    timer = window.setTimeout(ready, 2600);
  };
  timer = window.setTimeout(() => { if (to > from) evolve(); else ready(); }, 1500);
  el.addEventListener('click', () => {
    if (stage === 'get') { window.clearTimeout(timer); if (to > from) evolve(); else close(); return; }
    if (stage === 'evolve') return; // 進化は最後まで見せる（2.6 秒）
    close();
  });
}
