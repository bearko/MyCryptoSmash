// オファー：ミステリーのホールで実況が持ちかける取引。いいことと悪いことを見せて、受けるか断るかを選ぶ（その間は時間が止まる）。

import { blip, chime } from '../core/audio';
import { offerById, type OfferId } from '../game/offers';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function openOffer(root: HTMLElement, id: OfferId, done: (accept: boolean) => void): void {
  const o = offerById(id);
  const el = document.createElement('div');
  el.className = 'offer';
  el.innerHTML = `
    <div class="offer-in">
      <p class="offer-kick">MYSTERY</p>
      <h2>OFFER!</h2>
      <p class="offer-sub">取引を持ちかけられた。受けると、このプレイの間ずっと効く</p>
      <div class="offer-cards">
        <div class="offer-good"><small>いいこと</small><b>${esc(o.good)}</b></div>
        <div class="offer-bad"><small>そのかわり</small><b>${esc(o.bad)}</b></div>
      </div>
      <div class="offer-btns">
        <button class="pill" data-act="no">断る</button>
        <button class="pill main" data-act="yes">受ける</button>
      </div>
    </div>`;
  root.append(el);
  blip(330, 0.25, 'sawtooth', 0.07, 1.6);
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    const yes = t.dataset.act === 'yes';
    if (yes) chime(12); else blip(220, 0.1, 'square', 0.05, 0.8);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 380);
    done(yes);
  });
}
