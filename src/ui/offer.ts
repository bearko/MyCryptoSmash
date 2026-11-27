// オファー：ミステリーのホールで実況が持ちかける取引。受けるか断るかを選ぶ（その間は時間が止まる）。
// 見た目は 2 つに切れるチケット：上の半券＝いいこと（＋）、下の半券＝そのかわり（−）。説明の文は置かない（「?」の中）。
// 受けると判が押されて 2 枚が重なり、断ると破れて落ちる。

import { buzz, sfx } from '../core/audio';
import { offerById, type OfferId } from '../game/offers';
import { btn, help, isCalm } from './kit';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
/** 文の頭の「このプレイの間、」「このプレイの」は、どの取引も同じなので札には書かない（「?」に書く） */
const short = (s: string): string => s.replace(/^このプレイの間、/, '').replace(/^このプレイの/, '');

export function openOffer(root: HTMLElement, id: OfferId, done: (accept: boolean) => void): void {
  const o = offerById(id);
  const el = document.createElement('div');
  el.className = 'offer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '取引');
  el.dataset.sfxIn = 'open';
  el.innerHTML = `
    <div class="of-in">
      <h2 class="of-title"><span>OFFER</span>${help('受けると、このプレイの間だけ効く。断っても何も起きない', 'ミステリーの取引')}</h2>
      <div class="of-ticket">
        <div class="of-half of-good"><i class="of-mark" aria-hidden="true">+</i><b>${esc(short(o.good))}</b></div>
        <div class="of-half of-bad"><i class="of-mark" aria-hidden="true">−</i><b>${esc(short(o.bad))}</b></div>
        <i class="of-stamp" aria-hidden="true">DEAL</i>
      </div>
      <div class="of-btns">
        ${btn('断る', { kind: 'sub', sfx: 'none', attrs: { 'data-act': 'no' } })}
        ${btn('受ける', { kind: 'go', big: true, sfx: 'none', attrs: { 'data-act': 'yes' } })}
      </div>
    </div>`;
  root.append(el);
  let gone = false;
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
    if (!t || gone) return;
    gone = true;
    const yes = t.dataset.act === 'yes';
    if (yes) { sfx('stamp'); buzz([0, 30, 20, 40]); } else sfx('cancel');
    el.classList.add(yes ? 'is-yes' : 'is-no');
    const ms = isCalm() ? 120 : yes ? 780 : 420;
    setTimeout(() => el.remove(), ms);
    // 台は、札が片づくのを待たずに動き出す（止めない）
    setTimeout(() => done(yes), isCalm() ? 0 : yes ? 300 : 120);
  });
}
