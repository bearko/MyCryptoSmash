// タップで送る短い場面の連なり（導入とエンディングで使う）。
// 絵は CSS とピエロの絵だけで作る（背景の画像は足さない）。場面（sc）が変わるときは 600ms で重ねて切りかえる。
// 文字は 1 つずつ出し、触ると最後まで出す。もう一度触ると次へ。

import { blip, buzz, chime, roar, se, unlockAudio } from '../core/audio';
import { typeIn } from './talk';

export interface Beat {
  /** 場面（背景）の名前 */
  sc: string;
  /** 話している人（空ならト書き） */
  who?: string;
  text: string;
  /** 演出：voice（遠くの声）・clown（ピエロが浮かぶ）・slam（ドアが閉まる）・open（扉が開く）・cheer（歓声） */
  fx?: 'voice' | 'clown' | 'slam' | 'open' | 'cheer';
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

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function openStory(root: HTMLElement, o: StoryOpts): HTMLElement {
  const el = document.createElement('div');
  el.className = `story ${o.cls}`;
  el.innerHTML = `<div class="st-scenes"></div>
    <div class="st-box"><b class="st-who"></b><p class="st-text"></p><div class="st-ask"></div><span class="st-next" aria-hidden="true">▼</span></div>
    ${o.skip ? '<button class="st-skip" aria-label="スキップ">スキップ ▶▶</button>' : ''}`;
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

  const setScene = (sc: string): void => {
    if (sc === cur) return;
    cur = sc;
    const old = [...scenesEl.children];
    const s = document.createElement('div');
    s.className = `st-sc sc-${sc}`;
    s.innerHTML = o.scenes[sc] ?? '';
    scenesEl.append(s);
    window.setTimeout(() => old.forEach((x) => x.remove()), 650);
  };
  const fx = (f: Beat['fx']): void => {
    const sc = scenesEl.lastElementChild as HTMLElement | null;
    if (f === 'voice') { for (let k = 0; k < 3; k += 1) window.setTimeout(() => blip(330 - k * 40, 0.18, 'sine', 0.04, 0.8), k * 260); }
    if (f === 'clown') { sc?.classList.add('lit'); for (let k = 0; k < 6; k += 1) window.setTimeout(() => chime(k * 2), 80 + k * 110); }
    if (f === 'slam') {
      sc?.classList.add('shut');
      el.classList.remove('quake');
      void el.offsetWidth;
      el.classList.add('quake');
      se('blast', 0.9, 0, 0.45);
      roar(0.5, 0.4);
      buzz([0, 90, 40, 140]);
      window.setTimeout(() => blip(90, 0.25, 'square', 0.08, 0.6), 420);
      const b = document.createElement('div');
      b.className = 'st-bang';
      b.textContent = 'バタン!!';
      el.append(b);
      window.setTimeout(() => b.remove(), 1400);
    }
    if (f === 'open') {
      sc?.classList.add('opened');
      se('win', 0.7, 0);
      for (let k = 0; k < 8; k += 1) window.setTimeout(() => chime(k * 2), k * 120);
    }
    if (f === 'cheer') { sc?.classList.add('cheer'); roar(0.9, 2.2); se('buff', 0.5, 0, 1.2); }
  };
  const show = (k: number): void => {
    i = k;
    const b = o.beats[k];
    setScene(b.sc);
    fx(b.fx);
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
      askEl.innerHTML = `<input class="st-input" type="text" maxlength="${(o.askMax ?? 10) + 2}" enterkeyhint="done" autocomplete="off" spellcheck="false" placeholder="お客さん" value="${esc(o.askValue ?? '')}" aria-label="名前"><button class="st-ok">決定</button>`;
      const inp = askEl.querySelector('input') as HTMLInputElement;
      const ok = (): void => {
        if (asked) return;
        asked = true;
        o.ask?.(inp.value);
        inp.blur();
        blip(880, 0.08, 'square', 0.07, 1.6);
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
      btn.className = 'start st-go';
      btn.textContent = o.lastLabel;
      btn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
      askEl.append(btn);
    }
  };
  const close = (): void => {
    if (closing) return;
    closing = true;
    unlockAudio();
    el.classList.add('leaving');
    blip(660, 0.12, 'square', 0.08, 1.5);
    window.setTimeout(() => { el.remove(); o.done(); }, 600);
  };
  el.addEventListener('click', () => {
    unlockAudio();
    if (closing) return;
    if (finish()) return; // 文字を出しきる
    const b = o.beats[i];
    if (b.ask || i >= o.beats.length - 1) return; // 名前は「決定」、最後はボタンで
    blip(700, 0.04, 'square', 0.04, 1.2);
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
