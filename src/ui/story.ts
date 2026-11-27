// タップで送る短い場面の連なり（導入とエンディングで使う）。
// 絵は CSS とピエロの絵だけで作る（背景の画像は足さない）。場面（sc）が変わるときは、斜めの帯のワイプ（650ms）の裏で入れかえる。
// 枠（セリフの紙・ト書きの墨の札・名前の入力・ボタン）の見た目は src/styles/show.css。
// 文字は 1 つずつ出し、触ると最後まで出す。もう一度触ると次へ。

import { buzz, sfx, unlockAudio } from '../core/audio';
import { isCalm, wipe } from './kit';
import { typeIn } from './talk';

export interface Beat {
  /** 場面（背景）の名前 */
  sc: string;
  /** 話している人（空ならト書き） */
  who?: string;
  text: string;
  /**
   * 演出：voice（遠くの声）・clown（ピエロが浮かぶ）・open（扉が開く）・cheer（歓声）・
   * slam（背後の扉が閉まる：背後から差しこむ光 .beam が細くなって消え、バタン。部屋がまっくらになり、台の光が浮かび上がる）
   */
  fx?: 'voice' | 'clown' | 'slam' | 'open' | 'cheer';
  /** 場面をワイプでなく、暗いまま重ねて切りかえる（暗転のつながりを切らない） */
  soft?: boolean;
  /** 名前をたずねる（入力欄を出す） */
  ask?: boolean;
  /** 場面に足す HTML（記録など） */
  extra?: string;
}
export interface StoryOpts {
  cls: string;
  /** 場面の背景 */
  scenes: Record<string, string>;
  beats: Beat[];
  /** {name} などを差しこむ */
  fill(text: string): string;
  /** 名前を決めた（ask の場面） */
  ask?(raw: string): void;
  /** 名前の入力欄のはじめの値・いちばん長い文字数 */
  askValue?: string;
  askMax?: number;
  /** 最後の場面のボタン */
  lastLabel: string;
  /** スキップのボタンを出す */
  skip?: boolean;
  done(): void;
}

/** 導入の暗い部屋（intro.ts の BEAM）：扉の開き（0 開いている 〜 1 閉じた）に合わせた光の切り抜き：開いている所は [a, 1]（右の端へ細くなる） */
export function gapPoints(a: number): string {
  const r = (v: number): string => v.toFixed(2);
  return `${r(26 + 48 * a)},0 74,0 74,51.3 97,102 ${r(4 + 93 * a)},102 ${r(26 + 48 * a)},51.3`;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function openStory(root: HTMLElement, o: StoryOpts): HTMLElement {
  const el = document.createElement('div');
  el.className = `story ${o.cls}`;
  el.innerHTML = `<div class="st-scenes"></div>
    <div class="st-box"><b class="st-who"></b><p class="st-text"></p><div class="st-ask"></div><span class="st-next" aria-hidden="true">▼</span></div>
    ${o.skip ? '<button type="button" class="st-skip k-btn k-btn--sub" data-sfx="cancel" aria-label="スキップ"><span>SKIP</span></button>' : ''}`;
  root.append(el);
  const scenesEl = el.querySelector('.st-scenes') as HTMLElement;
  const who = el.querySelector('.st-who') as HTMLElement;
  const text = el.querySelector('.st-text') as HTMLElement;
  const askEl = el.querySelector('.st-ask') as HTMLElement;
  let i = -1;
  let cur = '';
  let finish: () => boolean = () => false;
  let closing = false;
  let asked = false;

  /** 場面を入れかえる。はじめの場面はそのまま、2 つ目からは斜めの帯のワイプの裏で（soft なら、前の場面の上に重ねてゆっくり出す） */
  const setScene = (sc: string, after: () => void, soft = false): void => {
    if (sc === cur) { after(); return; }
    const first = !cur;
    cur = sc;
    const make = (): HTMLElement => {
      const s = document.createElement('div');
      s.className = `st-sc sc-${sc}`;
      s.innerHTML = o.scenes[sc] ?? '';
      return s;
    };
    const swap = (): void => {
      [...scenesEl.children].forEach((x) => x.remove());
      scenesEl.append(make());
      after();
    };
    if (first) swap();
    else if (soft) {
      const olds = [...scenesEl.children];
      const s = make();
      s.classList.add('soft-in');
      scenesEl.append(s);
      window.setTimeout(() => olds.forEach((x) => x.remove()), 1000);
      after();
    } else void wipe('bars', swap, { root: el, ghost: true });
  };
  /** 背後の扉が閉まる：光の切り抜きを右の端へせばめ（だんだん速く）、閉じきった瞬間にバタン */
  const closeDoor = (sc: HTMLElement | null, bang: () => void): void => {
    const gap = sc?.querySelector<SVGPolygonElement>('.gap');
    if (!sc || !gap) { bang(); return; }
    sc.classList.add('closing');
    sfx('wipe', { vol: 0.55 });
    const ms = isCalm() ? 160 : 520;
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / ms);
      // はじめはゆっくり、最後に勢いよく閉まる
      gap.setAttribute('points', gapPoints(k * k * (0.35 + 0.65 * k)));
      if (k < 1) requestAnimationFrame(step);
      else bang();
    };
    requestAnimationFrame(step);
  };
  const fx = (f: Beat['fx']): void => {
    const sc = scenesEl.lastElementChild as HTMLElement | null;
    if (f === 'voice') { for (let k = 0; k < 3; k += 1) window.setTimeout(() => sfx('hover', { vol: 0.9, step: -k }), k * 260); }
    if (f === 'clown') { sc?.classList.add('lit'); for (let k = 0; k < 6; k += 1) window.setTimeout(() => sfx('pip', { step: k }), 80 + k * 110); }
    if (f === 'slam') closeDoor(sc, () => {
      // 閉じた：光は消え、部屋がまっくらに。少しして台の明かりがぼんやり浮かぶ（CSS の .shut）
      sc?.classList.add('shut');
      el.classList.remove('quake');
      void el.offsetWidth;
      el.classList.add('quake');
      sfx('explode');
      sfx('stamp');
      buzz([0, 90, 40, 140]);
      window.setTimeout(() => sfx('deny'), 420);
      const b = document.createElement('div');
      b.className = 'st-bang';
      b.textContent = 'バタン!!';
      el.append(b);
      window.setTimeout(() => b.remove(), 1400);
      // 闇の中で、台が目を覚ます音
      window.setTimeout(() => { if (el.isConnected) for (let k = 0; k < 4; k += 1) window.setTimeout(() => sfx('pip', { step: k * 2, vol: 0.5 }), k * 140); }, 1250);
      window.setTimeout(() => { if (el.isConnected) sfx('shimmer', { vol: 0.5 }); }, 1900);
    });
    if (f === 'open') {
      sc?.classList.add('opened');
      sfx('fanfare');
      for (let k = 0; k < 8; k += 1) window.setTimeout(() => sfx('pip', { step: k }), k * 120);
    }
    if (f === 'cheer') { sc?.classList.add('cheer'); sfx('roar'); sfx('shimmer'); }
  };
  const show = (k: number): void => {
    i = k;
    const b = o.beats[k];
    setScene(b.sc, () => fx(b.fx), b.soft);
    el.classList.toggle('narr', !b.who);
    who.textContent = b.who ?? '';
    const last = k === o.beats.length - 1;
    askEl.innerHTML = '';
    el.classList.toggle('asking', !!b.ask);
    el.classList.toggle('last', last);
    const box = el.querySelector('.st-box') as HTMLElement;
    box.classList.remove('in');
    void box.offsetWidth;
    box.classList.add('in');
    finish = typeIn(text, o.fill(b.text), 34);
    if (b.ask) {
      asked = false;
      askEl.innerHTML = `<input class="st-input" type="text" maxlength="${(o.askMax ?? 10) + 2}" enterkeyhint="done" autocomplete="off" spellcheck="false" placeholder="お客さん" value="${esc(o.askValue ?? '')}" aria-label="名前"><button type="button" class="st-ok k-btn k-btn--go" data-sfx="confirm"><span>決定</span></button>`;
      const inp = askEl.querySelector('input') as HTMLInputElement;
      const ok = (): void => {
        if (asked) return;
        asked = true;
        o.ask?.(inp.value);
        inp.blur();
        show(k + 1);
      };
      askEl.querySelector('.st-ok')?.addEventListener('click', (e) => { e.stopPropagation(); ok(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      inp.addEventListener('click', (e) => e.stopPropagation());
      window.setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch { /* noop */ } }, 700);
    }
    if (b.extra) askEl.innerHTML = b.extra;
    if (last) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'st-go k-btn k-btn--go k-btn--wide k-btn--big';
      btn.dataset.sfx = 'confirm';
      btn.innerHTML = '<span></span>';
      (btn.firstElementChild as HTMLElement).textContent = o.lastLabel;
      btn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
      askEl.append(btn);
    }
  };
  const close = (): void => {
    if (closing) return;
    closing = true;
    unlockAudio();
    // 終わり：紙がめくれるワイプの裏で消える
    void wipe('page', () => { el.remove(); o.done(); });
  };
  el.addEventListener('click', () => {
    unlockAudio();
    if (closing) return;
    if (finish()) return; // 文字を出しきる
    const b = o.beats[i];
    if (b.ask || i >= o.beats.length - 1) return; // 名前は「決定」、最後はボタンで
    sfx('page', { vol: 0.5 });
    show(i + 1);
  });
  el.querySelector('.st-skip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudio();
    // まだ名前を決めていなければ、名前をたずねる場面へ
    const ask = o.beats.findIndex((b) => b.ask);
    if (ask > i && !asked) show(ask);
    else show(o.beats.length - 1);
  });
  show(0);
  return el;
}
