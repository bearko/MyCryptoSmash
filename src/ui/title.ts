// ホーム画面（開くたびに最初に出る。ユーザーの指定）。暗いゲームコーナーで、うしろに本物の台（canvas）がぼんやり光る。
// ロゴと、チケットの形のメニュー：つづきから（セーブがあるとき。黄＝主ボタン）・はじめから・設定・チャット（共通基盤の SDK が読めたときだけ）。
// セーブが無いときは「はじめる」（導入へ）。「はじめから」は 2 回たしかめてから全部消す（main.ts の restartAll）。
// 遊んでいる途中からも、設定の「ホームへ」で戻れる（プレイ中なら時間は止まる）。見た目は title.css。

import './title.css';
import type { Save } from '../core/save';
import { sfx, unlockAudio } from '../core/audio';
import { clownArt, clownOf } from '../game/toys';
import { quotaTag } from './home';
import { isCalm, openModal, shake } from './kit';

export interface TitleOpts {
  save: Save;
  /** セーブがある（名前を決めてある） */
  hasSave: boolean;
  /** チャットを出せるか（SDK が遅れて読まれることがあるので、開いている間ときどき見る） */
  chatOn(): boolean;
  version: string;
  /** つづきから（セーブがあるとき）・はじめる（無いとき） */
  play(): void;
  /** 「はじめから」を 2 回たしかめた */
  restart(): void;
  settings(): void;
  chat(): void;
}
export interface Title {
  el: HTMLElement;
  /** 閉じる（チケットが飛んでいき、闇が晴れる。消えてから after） */
  close(after?: () => void): void;
  /** 名前・ノルマの札を描き直す（設定で名前を変えたときなど） */
  refresh(): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const SUIT = (s: string): string => `<i class="k-suit" data-suit="${s}" aria-hidden="true"></i>`;

/** つづきからの札の小さな字：名前とノルマの札 */
const contSub = (save: Save): string => `<span class="tt-name">${esc(save.name)}</span><span class="tt-q">${quotaTag(save)}</span>`;

export function openTitle(root: HTMLElement, o: TitleOpts): Title {
  const el = document.createElement('div');
  el.className = 'tt';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'ホーム');
  const tier = clownOf(o.save);
  const tickets: string[] = [];
  let i = 0;
  const tk = (act: string, label: string, tone: string, suit: string, sub = '', main = false): string =>
    `<button type="button" class="tt-tk k-in${main ? ' is-main' : ''}" data-act="${act}" data-tone="${tone}" data-press style="--i:${(i += 1) + 3}"${act === 'chat' ? ' hidden' : ''}
      data-sfx="${main ? 'confirm' : act === 'restart' ? 'deny' : 'open'}">
      <span class="tt-stub">${SUIT(suit)}</span><span class="tt-lbl"><b>${label}</b>${sub ? `<small class="tt-sub">${sub}</small>` : ''}</span></button>`;
  if (o.hasSave) {
    tickets.push(tk('play', 'つづきから', 'ticket', 'spade', contSub(o.save), true));
    tickets.push(tk('restart', 'はじめから', 'bone', 'heart'));
  } else {
    tickets.push(tk('play', 'はじめる', 'ticket', 'spade', '', true));
  }
  tickets.push(tk('settings', '設定', 'bone', 'club'));
  tickets.push(tk('chat', 'チャット', 'emb', 'diamond'));
  el.innerHTML = `
    <div class="tt-dark" aria-hidden="true"><i class="tt-beam"></i><i class="tt-beam b2"></i></div>
    <header class="tt-logo k-drop-in">
      <img class="tt-clown" src="${clownArt(tier)}" alt="">
      <i class="k-bulbs tt-bulbs" aria-hidden="true"></i>
      <span class="tt-my">MY CRYPTO</span>
      <h1 class="tt-smash" aria-label="My Crypto Smash"><span>S</span><span>M</span><span>A</span><span>S</span><span>H</span></h1>
      <span class="k-suits tt-suits" aria-hidden="true">${SUIT('spade')}${SUIT('heart')}${SUIT('diamond')}${SUIT('club')}</span>
      <i class="k-bulbs tt-bulbs b2" aria-hidden="true"></i>
    </header>
    <nav class="tt-menu" aria-label="メニュー">${tickets.join('')}</nav>
    <small class="tt-ver">v${esc(o.version)}</small>`;
  root.append(el);
  // 切りこみが終わったら k-in を外す（残すと、押したときの沈みが効かない）
  el.querySelectorAll<HTMLElement>('.tt-tk').forEach((b) => b.addEventListener('animationend', () => b.classList.remove('k-in'), { once: true }));

  const chatBtn = el.querySelector<HTMLElement>('[data-act="chat"]');
  const syncChat = (): void => {
    if (chatBtn) chatBtn.hidden = !o.chatOn();
  };
  syncChat();
  const chatTimer = window.setInterval(syncChat, 700);

  let closing = false;
  let asking = false;
  /** はじめから：2 回たしかめる（1 回目：何が消えるか／2 回目：本当に？） */
  const askRestart = (btn: HTMLElement): void => {
    if (asking) return;
    asking = true;
    shake(btn);
    openModal({
      title: 'はじめから',
      tone: 'blood',
      bodyHtml: `<div class="tt-ask"><p>セーブを全部消して、最初から</p>
        <ul><li>名前</li><li>スキルツリー</li><li>図鑑</li><li>記録</li></ul></div>`,
      buttons: [{ label: 'やめる', act: '', kind: 'sub', sfx: 'cancel' }, { label: '消す', act: 'next', kind: 'danger', sfx: 'deny' }],
      close(act) {
        if (act !== 'next') { asking = false; return; }
        window.setTimeout(() => {
          openModal({
            title: '本当に？',
            tone: 'blood',
            bodyHtml: '<div class="tt-ask is-last"><p>もとに戻せない</p></div>',
            buttons: [{ label: 'やめる', act: '', kind: 'sub', sfx: 'cancel' }, { label: '全部消す', act: 'wipe', kind: 'danger', sfx: 'deny' }],
            close(act2) {
              asking = false;
              if (act2 === 'wipe') o.restart();
            },
          });
        }, 220);
      },
    });
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || closing) return;
    unlockAudio();
    const act = b.dataset.act;
    if (act === 'play') o.play();
    else if (act === 'restart') askRestart(b);
    else if (act === 'settings') o.settings();
    else if (act === 'chat') o.chat();
  });
  // 待っている間：ロゴの電球と字がときどき揺れる（止まった画面にしない）。最初にひとつ音
  window.setTimeout(() => { if (!closing) sfx('shimmer', { vol: 0.6 }); }, 300);

  return {
    el,
    close(after) {
      if (closing) return;
      closing = true;
      window.clearInterval(chatTimer);
      el.classList.add('is-leaving');
      window.setTimeout(() => { el.remove(); after?.(); }, isCalm() ? 120 : 620);
    },
    refresh() {
      const sub = el.querySelector('[data-act="play"] .tt-sub');
      if (sub && o.hasSave) sub.innerHTML = contSub(o.save);
      const img = el.querySelector<HTMLImageElement>('.tt-clown');
      if (img) img.src = clownArt(clownOf(o.save));
    },
  };
}
