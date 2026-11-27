// UI の部品の見本（?kit=1。どこからもリンクしない）。あとの担当が、ここを見て同じ部品を使う。
// 上のボタンで段階（data-clown 0..4）・ひかえめ・大きな字を切りかえて、質感の変わり方を確かめられる。

import { applyA11y, isCalm, setClown } from './stage';
import { beat, burst, pop, shake, wipe, type BeatName, type WipeKind } from './motion';
import { atk, banner, btn, bulbs, gauge, help, num, openModal, ribbon, rollNumber, suit, suits, tag, ticket, toast } from './parts';

const sec = (title: string, cls: string, body: string): string => `<section class="kd-sec"><h3 class="kd-h">${title}<code>${cls}</code></h3><div class="kd-row">${body}</div></section>`;

export function openKitDemo(): void {
  const el = document.createElement('div');
  el.className = 'kd';
  const stage = Number(document.documentElement.dataset.clown ?? 0);
  el.innerHTML = `
    <header class="kd-head">
      ${ribbon('UI の見本', 'blood')}${suits()}
      <div class="kd-ctl">
        <div class="k-seg" role="group" aria-label="段階">${[0, 1, 2, 3, 4].map((i) => `<button data-clown="${i}" aria-pressed="${i === stage}">${i}</button>`).join('')}</div>
        ${btn('ひかえめ', { kind: 'sub', attrs: { 'data-a11y': 'calm' } })}${btn('大きな字', { kind: 'sub', attrs: { 'data-a11y': 'big' } })}${btn('とじる', { kind: 'danger', attrs: { 'data-close': '1' } })}
      </div>
      ${bulbs()}
    </header>
    <div class="kd-body">
      ${sec('ボタン', '.k-btn（--go 主・--sub 副・--danger 危険・--curse・--icon）／kit の btn()', `
        ${btn('納品する', { kind: 'go', sub: '−200 GUM', sfx: 'confirm' })}${btn('もどる', { kind: 'sub', sfx: 'cancel' })}${btn('消す', { kind: 'danger', sfx: 'deny' })}${btn('呪い', { kind: 'curse' })}
        <button class="k-btn k-btn--icon" aria-label="閉じる">×</button>${btn('買えない', { kind: 'go', disabled: true })}
        <button class="k-btn k-btn--sub" style="position:relative">強化<i class="k-badge">3</i></button>`)}
      ${sec('数字（転がって増える）', '.k-num（--s・--l・--xl）／rollNumber(el, 値)', `
        ${num('1,234', 's')}${num('56,700')}${num('0', 'l')}<span id="kdRoll">${num('0', 'xl')}</span>${btn('+ 増やす', { kind: 'sub', attrs: { 'data-roll': '1' } })}
        ${num('12', '', 'emb')}${num('×2.5', '', 'blood')}${num('LV 3', '', 'bone')}`)}
      ${sec('ゲージ', '.k-gauge（--seg・.is-full・data-tone）／gauge(v)', `
        <div class="kd-w">${gauge(0.35)}</div><div class="kd-w">${gauge(0.7, 'emb', true)}</div><div class="kd-w">${gauge(1, 'blood')}</div>`)}
      ${sec('札（タグ）・ヘルプ・スート・攻撃の形', '.k-tag／.k-help／.k-suit／.k-atk', `
        ${tag('コモン')}${tag('Limited', 'curse')}${tag('壊れもの 20%', 'blood')}${tag('育つ 3', 'emb')}${tag('NEW', 'ticket', true)}${tag('QUOTA 3/10', 'ink', true)}
        ${help('説明の文は「?」の中だけ。スマホはタップ、PC はマウスを乗せる', 'ヘルプ')}
        <span style="font-size:26px;display:inline-flex;gap:6px;color:var(--k-bone)">${suit('spade')}${suit('heart')}${suit('club')}${suit('diamond')}</span>
        <span style="font-size:22px;display:inline-flex;gap:10px">${atk('red')}${atk('blue')}${atk('green')}</span>`)}
      ${sec('切り絵のパネル', '.k-panel（--skew・--paper・data-tone）', `
        <div class="k-panel kd-p" data-tone="blood">墨の紙<br><small>ずっと出ている枠</small></div>
        <div class="k-panel k-panel--skew kd-p" data-tone="ticket">傾いた札</div>
        <div class="k-panel k-panel--paper kd-p" data-tone="curse">骨の紙<br><small>上に重ねて出すもの</small></div>`)}
      ${sec('チケットの札・見出しの帯', '.k-ticket（.k-ticket-stub）／.k-ribbon／ticket()・ribbon()', `
        ${ticket('<b>入金口</b><br>あと 120 GUM', 'No.3')}${ticket('<b>ジャグリングの球</b><br>+2 倍率', '★2', 'bone')}${ribbon('ショップ', 'ticket', 3)}${ribbon('Limited', 'curse', 3)}`)}
      ${sec('地の模様・電球の列', '.k-dots／.k-tent／.k-bulbs', `
        <div class="k-dots kd-sw"></div><div class="k-tent kd-sw"></div><div class="kd-w" style="width:220px">${bulbs()}</div>`)}
      ${sec('トースト・バナー・モーダル', 'toast({…})／banner(text, sub, tone)／openModal({…})', `
        ${btn('トースト', { kind: 'sub', attrs: { 'data-demo': 'toast' } })}${btn('バナー', { kind: 'sub', attrs: { 'data-demo': 'banner' } })}${btn('モーダル', { kind: 'sub', attrs: { 'data-demo': 'modal' } })}`)}
      ${sec('場面の切りかえ', "wipe('bars' | 'page' | 'curtain' | 'clap', 切りかえ, { text })", `
        ${(['bars', 'page', 'curtain', 'clap'] as WipeKind[]).map((k) => btn(k, { kind: 'sub', sfx: 'wipe', attrs: { 'data-wipe': k } })).join('')}`)}
      ${sec('見せ場', "beat('launch' | 'timeup' | 'deposit' | 'gameover' | 'evolve')・burst(el)・shake(el)・pop(el)", `
        ${(['launch', 'timeup', 'deposit', 'gameover', 'evolve'] as BeatName[]).map((k) => btn(k, { kind: 'sub', attrs: { 'data-beat': k } })).join('')}
        ${btn('弾ける', { kind: 'go', attrs: { 'data-demo': 'burst' } })}${btn('震える', { kind: 'danger', attrs: { 'data-demo': 'shake' } })}`)}
      ${sec('出るときの動き', '.k-in（style="--i:n" でずらす）・.k-drop-in・.k-sway', `
        <div id="kdIn" class="kd-row">${[0, 1, 2, 3, 4].map((i) => `<span class="k-in" style="--i:${i}">${tag(`札 ${i + 1}`, i % 2 ? 'ticket' : 'bone')}</span>`).join('')}</div>${btn('もう一度', { kind: 'sub', attrs: { 'data-demo': 'in' } })}`)}
    </div>`;
  document.body.appendChild(el);
  let rollV = 0;
  let flip = false;
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t.dataset.clown) {
      setClown(Number(t.dataset.clown), true);
      el.querySelectorAll('[data-clown]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
    } else if (t.dataset.a11y) {
      const h = document.documentElement;
      applyA11y({ calm: t.dataset.a11y === 'calm' ? !isCalm() : isCalm(), bigText: t.dataset.a11y === 'big' ? !h.classList.contains('big') : h.classList.contains('big'), quality: (h.dataset.q as 'high') ?? 'high' });
    } else if (t.dataset.close) el.remove();
    else if (t.dataset.roll) {
      rollV = rollV * 3 + 1234;
      const n = el.querySelector<HTMLElement>('#kdRoll .k-num');
      if (n) rollNumber(n, rollV, { ms: 900, done: () => { pop(n); burst(n, 8, el); } });
    } else if (t.dataset.wipe) {
      void wipe(t.dataset.wipe as WipeKind, () => { flip = !flip; el.classList.toggle('kd-alt', flip); }, { root: el, text: t.dataset.wipe === 'clap' ? 'TIME UP!' : undefined });
    } else if (t.dataset.beat) {
      void beat(t.dataset.beat as BeatName, { root: el, text: t.dataset.beat === 'launch' ? 'TABLE 1' : undefined, sub: t.dataset.beat === 'launch' ? '40s' : undefined });
      if (t.dataset.beat === 'evolve') {
        const next = Math.min(4, Number(document.documentElement.dataset.clown ?? 0) + 1);
        setClown(next, true);
        el.querySelectorAll('[data-clown]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.clown === String(next))));
      }
    } else if (t.dataset.demo === 'toast') toast({ text: 'ジャグリングの球', sub: 'NEW　レア', tone: 'ticket', root: el });
    else if (t.dataset.demo === 'banner') banner('RAID BOSS', 'サイクロプス', 'blood', el);
    else if (t.dataset.demo === 'modal') openModal({ title: 'データを消す', bodyHtml: 'すべての進み具合が消えます。', tone: 'blood', root: el, buttons: [{ label: 'やめる', act: 'no', kind: 'sub', sfx: 'cancel' }, { label: '消す', act: 'yes', kind: 'danger', sfx: 'deny' }] });
    else if (t.dataset.demo === 'burst') { burst(t, 14, el); pop(t); } else if (t.dataset.demo === 'shake') shake(t);
    else if (t.dataset.demo === 'in') {
      const box = el.querySelector('#kdIn');
      if (box) { const h = box.innerHTML; box.innerHTML = ''; void (box as HTMLElement).offsetWidth; box.innerHTML = h; }
    }
  });
}
