// チュートリアルの案内（はじめての挑戦だけ）：台に宿るピエロの吹き出し・光る枠・指の絵。
// - 見た目は破れたチケットの吹き出し（切り絵の紙）。文は短く。吹き出しはタップで閉じる（光る枠と指は残る）。「案内をとばす」で案内そのものをやめる
// - どこを光らせるかは main.ts の tutorialTick が、いまの画面とチュートリアルの状態（quota.ts の tutorialState）から決めて set を呼ぶ
// - 吹き出し・枠・指は body の直下に置く（PC の左右の列・RESULT・見本の画面の上にも重ねられるように）。毎コマ、光らせる要素の位置に合わせる
// - 位置は translate で決める（transform で決めると、枠がふくらむ scale の動きが位置まで拡大して、画面の下ほど枠がずれる）

import './coach.css';
import { sfx } from '../core/audio';
import { clownArt } from '../game/toys';
import { typeIn } from './talk';

export interface CoachSpec {
  /** 場面の鍵（変わると吹き出しを出し直す） */
  key: string;
  /** ピエロのセリフ（差しこみずみ） */
  text: string;
  /** ピエロの姿（絵） */
  tier: number;
  /** 光らせる要素（なければ吹き出しだけ）。毎コマ呼ぶ */
  target?: (() => HTMLElement | null) | null;
  /** 吹き出しの置き場所：auto（光らせる要素の近く）・top（画面の上。RESULT の数字を隠さないように） */
  place?: 'auto' | 'top';
}
export interface Coach {
  /** 出す案内（null で隠す） */
  set(spec: CoachSpec | null): void;
}

/** 見えている要素か（大きさがあり、隠れていない） */
const shown = (el: HTMLElement | null): el is HTMLElement => {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

const HAND = `<svg viewBox="0 0 48 56" width="44" height="52" aria-hidden="true"><path fill="#f4efe4" stroke="#0b0a10" stroke-width="3.5" stroke-linejoin="round"
  d="M17 6c0-3 5-3 5 0v18l2-1V12c0-3 5-3 5 0v12l2-.5V15c0-3 5-3 5 0v10l1.5-.3V20c0-3 5-3 5 0v14c0 10-6 18-15 18h-3c-6 0-9-3-12-8L5 34c-2-3 2-6 5-3l7 7z"/></svg>`;

export function initCoach(o: { skip(): void }): Coach {
  const box = document.createElement('div');
  box.className = 'coach';
  box.hidden = true;
  box.dataset.sfx = 'none';
  box.innerHTML = `<div class="co-art"><img alt=""></div><div class="co-b"><p class="co-t"></p><button class="co-skip" type="button" data-sfx="none" aria-label="案内をとばす"><span>とばす</span></button></div>`;
  const ring = document.createElement('div');
  ring.className = 'coach-ring';
  ring.hidden = true;
  const hand = document.createElement('div');
  hand.className = 'coach-hand';
  hand.hidden = true;
  hand.innerHTML = HAND;
  document.body.append(ring, hand, box);
  const text = box.querySelector('.co-t') as HTMLElement;
  const art = box.querySelector('.co-art img') as HTMLImageElement;

  let cur: CoachSpec | null = null;
  /** 閉じた吹き出しの鍵（同じ場面のあいだは出さない） */
  const closed = new Set<string>();
  let raf = 0;
  let finish: (() => boolean) | null = null;

  box.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.co-skip')) {
      sfx('cancel');
      o.skip();
      return;
    }
    // 1 回目は文を最後まで、2 回目で閉じる
    if (finish?.()) return;
    if (cur) closed.add(cur.key);
    box.classList.add('out');
    sfx('close');
    window.setTimeout(() => { if (box.classList.contains('out')) box.hidden = true; }, 300);
  });

  function place(): void {
    raf = 0;
    if (!cur) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const t = cur.target?.() ?? null;
    const ok = shown(t);
    let tr: DOMRect | null = null;
    if (ok) {
      tr = t.getBoundingClientRect();
      ring.hidden = false;
      const pad = 5;
      ring.style.translate = `${tr.left - pad}px ${tr.top - pad}px`;
      ring.style.width = `${tr.width + pad * 2}px`;
      ring.style.height = `${tr.height + pad * 2}px`;
      // 指：画面の下のほうの要素には上から、ほかは下から指さす
      const up = tr.top + tr.height / 2 > vh * 0.78;
      hand.hidden = false;
      hand.classList.toggle('down', up);
      // 横に長い的（納めるボタンなど）は、中の数字を隠さないよう、ふちに指先だけを掛ける
      const wide = tr.width > 200;
      const hx = tr.left + tr.width * 0.6 - 17;
      const hy = up ? tr.top + (wide ? 6 : tr.height * 0.4) - 52 : wide ? tr.bottom - 10 : tr.top + tr.height * 0.6;
      hand.style.translate = `${hx}px ${hy}px`;
    } else {
      ring.hidden = true;
      hand.hidden = true;
    }
    const top = cur.place === 'top';
    box.classList.toggle('top', top);
    document.documentElement.classList.toggle('coach-top', top && !box.hidden && !box.classList.contains('out'));
    if (!box.hidden) {
      const w = Math.min(top ? 372 : 336, vw - 20);
      box.style.width = `${w}px`;
      const bh = box.offsetHeight;
      let x: number;
      let y: number;
      const app = document.getElementById('app')?.getBoundingClientRect();
      if (cur.place === 'top') {
        // RESULT：見出しの場所を借りる（見出しは html.coach-top の間だけ引っこむ。数字には重ねない）
        x = app ? app.left + app.width / 2 - w / 2 : vw / 2 - w / 2;
        y = (app?.top ?? 0) + 6;
      } else if (tr) {
        x = tr.left + tr.width / 2 - w / 2;
        const below = tr.top + tr.height / 2 < vh * 0.45;
        const gap = 66; // 指の分
        y = below ? tr.bottom + gap : tr.top - bh - (tr.top + tr.height / 2 > vh * 0.78 ? gap : 14);
        if (y < 8) y = Math.min(vh - bh - 8, tr.bottom + gap);
      } else {
        x = app ? app.left + app.width / 2 - w / 2 : vw / 2 - w / 2;
        y = app ? app.top + app.height * 0.17 : vh * 0.17;
      }
      x = Math.max(10, Math.min(vw - w - 10, x));
      y = Math.max(8, Math.min(vh - bh - 8, y));
      box.style.translate = `${x}px ${y}px`;
    }
    raf = requestAnimationFrame(place);
  }

  return {
    set(spec) {
      if (!spec) {
        if (!cur) return;
        cur = null;
        document.documentElement.classList.remove('coach-top');
        box.hidden = true;
        ring.hidden = true;
        hand.hidden = true;
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      const fresh = !cur || cur.key !== spec.key;
      const wasHidden = !cur;
      cur = spec;
      if (fresh || wasHidden) {
        art.src = clownArt(spec.tier);
        box.dataset.tier = String(spec.tier);
        if (closed.has(spec.key)) box.hidden = true;
        else {
          box.hidden = false;
          box.classList.remove('out');
          box.style.animation = 'none';
          void box.offsetWidth;
          box.style.animation = '';
          finish = typeIn(text, spec.text, 28);
          if (fresh) sfx('open');
        }
      }
      if (!raf) raf = requestAnimationFrame(place);
    },
  };
}
