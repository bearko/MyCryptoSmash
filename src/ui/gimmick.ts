// ギミック（台に買い足す部品と大きな仕掛け）の画面の部品：
// - 仕掛けを買った瞬間の演出（台に仕掛けが足された）と、ピエロが進化する演出（古い絵 → 新しい絵、光・音・名前）
// - ピエロが上がる条件（あと何個）は、画面のどこにも出さない（ユーザーの指定）
// 数値と判定は src/game/toys.ts（TOY_PRICE・toysUnlocked・clownTier）。

import { blip, buzz, chime, roar, se } from '../core/audio';
import { CLOWN_NAME, CLOWN_RARITY, TOY_ART, TOY_NAME, TOY_SHORT, clownArt, toyArt, type ToyId } from '../game/toys';
import { clownLine } from '../game/clown-lines';
import { startTalk, talkHtml } from './talk';


/** 仕掛けの札に出す絵（段階のあるものは、いちばん下の絵） */
export const toyCardArt = (id: ToyId): string => toyArt(TOY_ART[id][0]);

/**
 * 仕掛けを買った瞬間の演出：仕掛けの絵が大きく飛びこみ、光の筋が回って「NEW GIMMICK!」。
 * そのあとピエロの姿が上がったなら、進化の演出を続ける。触ると早送り、最後は触って閉じる。
 */
export function showToyGet(root: HTMLElement, id: ToyId, from: number, to: number, name: string, done: () => void): void {
  const el = document.createElement('div');
  el.className = 'toyget';
  el.innerHTML = `
    <div class="tg-rays"></div>
    <div class="tg-stage">
      <p class="tg-kick">NEW GIMMICK!</p>
      <div class="tg-art"><img src="${toyCardArt(id)}" alt=""></div>
      <h2>${TOY_NAME[id]}</h2>
      <p class="tg-sub">台に取り付けた！</p>
      <p class="tg-what">${TOY_SHORT[id]}</p>
      ${talkHtml(from, clownLine('gimmick', from, { name }))}
    </div>
    <p class="tg-tap">タップで閉じる</p>`;
  root.append(el);
  startTalk(el, 700);
  // 音：はめこむ音と歓声
  se('buff', 0.7, 0, 1.2);
  [0, 90, 180, 270].forEach((d, i) => setTimeout(() => blip(660 + i * 220, 0.08, 'square', 0.07, 1.5), d));
  setTimeout(() => { roar(0.6, 1.2); buzz([0, 30, 30, 30]); }, 380);
  let stage: 'get' | 'evolve' | 'end' = 'get';
  let timer = 0;
  const close = (): void => {
    if (stage === 'end' && el.classList.contains('leaving')) return;
    stage = 'end';
    window.clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); done(); }, 420);
  };
  const evolve = (): void => {
    stage = 'evolve';
    el.classList.add('evo');
    const st = el.querySelector('.tg-stage') as HTMLElement;
    st.innerHTML = `
      <p class="tg-kick">……台が、息を吹きかえす</p>
      <div class="tg-evo"><img class="old" src="${clownArt(from)}" alt=""><img class="new" src="${clownArt(to)}" alt=""><i class="tg-burst"></i></div>
      <h2 class="tg-name"><small>${CLOWN_RARITY[to]}</small>${CLOWN_NAME[to]}</h2>
      <p class="tg-sub">${CLOWN_NAME[from]} が <b>${CLOWN_NAME[to]}</b> に進化した！</p>
      <p class="tg-what">${to >= CLOWN_NAME.length - 1 ? '台に宿る道化が、本来の姿に戻った！' : '台が育つほど、道化は本来の姿に近づく'}</p>
      ${talkHtml(to, clownLine('evolve', to, { name }))}`;
    startTalk(st, 2000);
    // 古い絵が震えて光り、白く飛んで新しい絵へ（光の点滅に合わせて上がっていく音）
    for (let i = 0; i < 8; i += 1) setTimeout(() => chime(i * 2), 120 + i * 140);
    setTimeout(() => { se('win', 0.8, 0); roar(1, 2); buzz([0, 60, 40, 60, 40, 120]); }, 1300);
    timer = window.setTimeout(() => { stage = 'end'; el.classList.add('closable'); }, 2600);
  };
  timer = window.setTimeout(() => {
    if (to > from) evolve();
    else { stage = 'end'; el.classList.add('closable'); }
  }, 1500);
  el.addEventListener('click', () => {
    if (stage === 'get') { window.clearTimeout(timer); if (to > from) evolve(); else { stage = 'end'; el.classList.add('closable'); } return; }
    if (stage === 'evolve') return; // 進化は最後まで見せる（2.6 秒）
    close();
  });
}
