// ショップ：人形劇の舞台。額縁（プロセニアム）・左右の幕・4 段の棚に品が並ぶ（リストにしない）。
// - 1 段目：ピンボールのギミック（糸で吊られた人形）。触ると台の見本（toy-preview.ts）が開き、そこで買う
// - 2・3 段目：エクステンション（棚の品物。絵・★・値段・系統の色だけ。重ねられる品は ▲ の印）
// - 4 段目：ヒーローマレットのガチャ（★のカプセル・系統のカプセル。gacha.ts）と、全部の段を入れかえるリロール
// - 舞台の下（客席側の帯）：装備の枠（★のゲージ）・ヒーローの枠（先頭がリーダー）・マレットのレベル・枠を広げる
// 触り方：スマホは 1 回目で選んで吹き出し（名前・★・要点・値段）、同じ品をもう 1 回で買う。
//        PC（マウス）はマウスを重ねると吹き出し、1 クリックで買う。くわしい文は吹き出しの ? だけ。
// リロールでは、いまの品が袖へ引っこみ（奇数段は右・偶数段は左。勢いで傾く）、反対の袖から新しい品が出て、止まるときに揺れて戻る。
// 見た目は様式「呪われたカーニバル」（kit）：値札は破れたチケット、吹き出しは切り絵の紙。ピエロの段階（html[data-clown]）で舞台も直っていく（shop.css）。
// 買えるものは立ち、買えないものは沈む。重ねられる品は「重なった札 +点」の印で、重ねる先の装備の枠にも印が付く。音は sfx（src/core/audio.ts）。
// 計算は src/game/stack.ts（重ね）・mods.ts（品ぞろえ・枠）・toys.ts（ギミック）・gacha.ts（カプセル）・quota.ts（マレット・リロール）。

import './shop.css';
import { cat, heroById, RARITY_COLOR, RARITY_NAME, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { sfx } from '../core/audio';
import { burst, isCalm, pop, rollText, shake } from './kit';
import { SLOTS_CAP, slotsOf, priceOf, totalsOf } from '../game/mods';
import { FAMILY_INFO, KIND_TAG, extDef, extName, extText } from '../game/exts';
import { RARITY_NAME as STACK_RARITY, buyExt, gaugeOf, ptsOf, rarityOfPts, sellExt, sellPrice, stackPreview, type BuyResult } from '../game/stack';
import { abilityPower, resolveAbility } from '../game/abilities';
import { TOY_ART, TOY_NAME, TOY_PRICE, buyToy, clownArt, clownOf, restockToys, toysUnlocked, type ToyId } from '../game/toys';
import { EXT_SLOT_PRICE, HERO_SLOT_PRICE, MALLET_MAX, QUOTA_PLAYS, SLOTS_MAX, buyMallet, buySlot, malletLv, malletPoints, malletPts, malletPrice, payReroll, quotaStatus, rerollPrice, tutorialState } from '../game/quota';
import { FINAL_FLOORS } from '../game/final';
import { FAMILY_NAME, buyCapsule, capsulePool, capsulePrice, famOdds, restockCapsules, type Capsule } from '../game/gacha';
import { showExtEvolve, showMalletUp } from './levelup';
import { toyCardArt } from './gimmick';
/** 仕掛けの札の絵（絵のない仕掛けは空の文字） */
const toyImg = (id: ToyId): string => ((TOY_ART as Partial<Record<string, number[]>>)[id]?.length ? toyCardArt(id) : '');
import { openToyPreview } from './toy-preview';
import { capsuleHtml, showGacha } from './gacha';
import { discountOf, extTags, fixParty, gaugeHtml, quotaTag, restockShop, stackTag } from './home';

export interface ShopHooks {
  /** 装備・ヒーロー・GUM が変わった（強さを計算しなおしてセーブ） */
  changed(): void;
  /** ギミックを買った（台に足された演出と、ピエロの進化） */
  toyBought(id: ToyId, from: number, to: number): void;
}
export interface Shop {
  render(): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const extById = (id: number): Ext | undefined => cat.exts.find((e) => e.id === id);
const EMBI = '<i class="emb"></i>';
const kfmt = (k: number): string => (k < 10 ? (Math.round(k * 10) / 10).toString() : fmt(Math.round(k)));
/** マウスで触っている（吹き出しはマウスを重ねて、1 クリックで買う） */
const fine = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = (): boolean => isCalm() || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const SUITS = ['spade', 'heart', 'club', 'diamond'];

/** 段ごとの ? の文（必要なときだけ出す） */
const HELP: Record<string, string> = {
  gimmick: '台に足す仕掛け。触ると動きを見られる。ノルマを納めるたびに入荷する。',
  ext: 'スコアの効果。買うと装備の枠に付く。同じシリーズを買うと重なって★が上がる（重なった札の印。重ねる先の装備に ◆）。効果は装備の左から順に掛かる。',
  gacha: 'ヒーローが出るカプセル。★のカプセルはその★のヒーロー、体力・知力・素早さのカプセルは★がランダム。持っているヒーローは出ない。出たヒーローは挑戦の間だけ。',
  hand: '装備は左から順に効く。ヒーローは先頭がリーダー（自分の球）で、控えも一緒に打ち出される。',
};

export function initShop(page: HTMLElement, save: Save, hooks: ShopHooks): Shop {
  /** スマホで 1 回目に選んだもの（もう 1 回で実行）。PC では装備の枠を押して吹き出しを留めたときだけ */
  let armed: string | null = null;
  /** 枠がいっぱいで、入れかえて買う品（ショップの札の ID） */
  let swapFor = -1;
  let sellArmed = false;
  let detail = false;
  let benchOpen = false;
  /** マウスを重ねている品（PC） */
  let hoverKey: string | null = null;
  let hideT = 0;
  let previewOpen = false;
  /** いま売れたばかりの札（SOLD の判を 1 回だけ押す）。data-k */
  let justSold = '';
  /** 前に出した財布の数（変わったら数字が転がる） */
  let shownGum = save.gum;
  let shownEmb = save.emblems;

  const root = document.createElement('div');
  root.className = 'sh';
  page.replaceChildren(root);

  // ---------------------------------------------------------------- 描く
  function bar(): string {
    const st = quotaStatus(save.quota, save.gum);
    const frac = st.final ? 1 : Math.min(1, save.gum / Math.max(1, st.need));
    const plays = st.final ? '' : Array.from({ length: QUOTA_PLAYS }, (_, i) => `<i class="${i < st.left ? 'on' : ''}"></i>`).join('');
    const q = st.final
      ? `<span class="sh-q final">LAST STAGE<small>×${FINAL_FLOORS.length}</small></span>`
      : `<button class="sh-q${st.canPay ? ' ok' : ''}" data-k="help:quota"><span class="sh-qn">${quotaTag(save)}</span><i class="sh-qbar" style="--q:${frac.toFixed(3)}"></i><i class="sh-plays">${plays}</i></button>`;
    return `<header class="sh-bar">${q}
      <span class="sh-wal gum"><img src="${esc(cat.icons.gum)}" alt=""><b data-w="gum">${fmt(save.gum)}</b></span>
      <span class="sh-wal em">${EMBI}<b data-w="emb">${fmt(save.emblems)}</b></span></header>`;
  }

  const sold = (cls: string, k = ''): string => `<span class="sh-item ${cls} sold${k && k === justSold ? ' just' : ''}" aria-hidden="true"><i class="sold-sign">SOLD</i></span>`;

  function toyItem(id: ToyId, i: number): string {
    const own = save.toys.includes(id);
    if (own) return sold('toy');
    const price = Math.max(1, TOY_PRICE[id] - discountOf(save));
    return `<button class="sh-item toy${save.emblems < price ? ' poor' : ''}${lockNext === id ? ' tut-next' : ''}" data-k="t:${id}" data-toy="${id}" style="--i:${i}" aria-label="${esc(TOY_NAME[id])}">
      <i class="str"></i><span class="art">${toyImg(id) ? `<img src="${esc(toyImg(id))}" alt="">` : `<b class="noart">${esc((TOY_NAME[id] ?? id).slice(0, 2))}</b>`}</span><em class="tag">${EMBI}${fmt(price)}</em></button>`;
  }

  function extItem(id: number, i: number): string {
    if (id < 0) return sold('ext', `e:${i}`);
    const e = extById(id);
    if (!e) return sold('ext');
    const d = extDef(e);
    const price = priceOf(e, discountOf(save));
    const st = stackPreview(save, id);
    const need = !!d?.toy && !save.toys.includes(d.toy);
    const max = st && st.overflow > 0 && st.add === st.overflow;
    // 重ねられる品の印：重なった札と足す点。★が上がるなら次の★（その色）。もうレジェンダリーなら、あふれてもらえるエンブレム
    const nr = st ? rarityOfPts(st.pts) : 0;
    const up = st ? `<i class="sh-up${st.evolve ? ' evo' : ''}${max ? ' max' : ''}" style="--uc:${RARITY_COLOR[nr]}">${max ? `${EMBI}+${st.overflow}` : st.evolve ? `<i class="lay"></i>★${nr}` : `<i class="lay"></i>+${st.add}`}</i>` : '';
    return `<button class="sh-item ext${save.emblems < price ? ' poor' : ''}${st ? ' stack' : ''}${need ? ' need' : ''}${id === swapFor ? ' swapping' : ''}" data-k="e:${i}" style="--i:${i};--rc:${RARITY_COLOR[e.rarity]};--fc:${d ? FAMILY_INFO[d.fam].color : '#fff'}" aria-label="${esc(e.name)}">
      <span class="art"><img src="${esc(e.img)}" alt="">${up}${need ? '<i class="lock" aria-hidden="true"></i>' : ''}</span>
      <span class="pips">${'★'.repeat(e.rarity)}</span><em class="tag">${EMBI}${fmt(price)}</em></button>`;
  }

  function capItem(c: Capsule, i: number): string {
    if (c.sold) return sold('capsule', `c:${i}`);
    const price = capsulePrice(c, discountOf(save));
    return `<button class="sh-item capsule${save.emblems < price ? ' poor' : ''}" data-k="c:${i}" style="--i:${i}" aria-label="${c.kind === 'rar' ? `★${c.r} のカプセル` : `${FAMILY_NAME[c.fam]}のカプセル`}">
      <span class="art">${capsuleHtml(c)}</span><em class="tag">${EMBI}${fmt(price)}</em></button>`;
  }

  function hand(): string {
    const sl = slotsOf(save);
    const sellFull = totalsOf([], save.limited).sellFull > 0;
    const canExt = save.extSlots < SLOTS_MAX && sl.ext < 8;
    const slots: string[] = [];
    // 店に重ねられる品が並んでいる装備（重ねる先）
    const pairs = new Set<number>();
    for (const id of save.shop) { const st = id > 0 ? stackPreview(save, id) : null; if (st) pairs.add(st.from); }
    for (let i = 0; i < sl.ext; i += 1) {
      const e = extById(save.equip[i]);
      if (!e) { slots.push(`<span class="sh-slot empty"><i class="k-suit" data-suit="${SUITS[i % 4]}"></i></span>`); continue; }
      const d = extDef(e);
      const need = !!d?.toy && !save.toys.includes(d.toy);
      const k = `s:${i}`;
      slots.push(`<button class="sh-slot${armed === k ? ' sel' : ''}${swapFor >= 0 ? ' swap' : ''}${need ? ' need' : ''}${pairs.has(e.id) && swapFor < 0 ? ' pair' : ''}" data-eq="${e.id}" data-k="${k}" style="--c:${RARITY_COLOR[e.rarity]};--f:${d ? FAMILY_INFO[d.fam].color : '#fff'}" aria-label="${esc(e.name)}">
        <img src="${esc(e.img)}" alt=""><i class="no">${i + 1}</i>${gaugeHtml(save, e.id)}${swapFor >= 0 ? `<i class="sell">+${sellPrice(save, e.id, sellFull)}</i>` : ''}</button>`);
    }
    if (canExt) slots.push(`<button class="sh-slot add${save.emblems < EXT_SLOT_PRICE ? ' poor' : ''}" data-k="xs" aria-label="装備の枠を広げる"><b>+</b><em>${EMBI}${EXT_SLOT_PRICE}</em></button>`);
    const hs: string[] = [];
    for (let i = 0; i < sl.hero; i += 1) {
      const id = save.party[i];
      if (id === undefined) { hs.push('<span class="sh-slot hero empty"></span>'); continue; }
      const h = heroById(id);
      const k = `h:${i}`;
      hs.push(`<button class="sh-slot hero${i === 0 ? ' leader' : ''}${armed === k ? ' sel' : ''}" data-k="${k}" style="--c:${RARITY_COLOR[h.rarity]}" aria-label="${esc(h.name)}"><img src="${esc(h.img)}" alt="">${i === 0 ? '<i class="crown" aria-hidden="true"></i>' : ''}<i class="k-suit" data-suit="${SUITS[(i + 1) % 4]}" aria-hidden="true"></i></button>`);
    }
    if (save.heroSlots < SLOTS_MAX && sl.hero < SLOTS_CAP) hs.push(`<button class="sh-slot hero add${save.emblems < HERO_SLOT_PRICE ? ' poor' : ''}" data-k="hs" aria-label="ヒーローの枠を広げる"><b>+</b><em>${EMBI}${HERO_SLOT_PRICE}</em></button>`);
    const bench = save.heroes.filter((id) => !save.party.includes(id)).length;
    const lv = malletLv(save);
    const maxed = lv >= MALLET_MAX;
    const mp = Math.max(1, malletPrice(lv) - discountOf(save));
    const lead = heroById(save.hero);
    return `<div class="sh-hand">
      <button class="sh-help hand" data-k="help:hand" aria-label="説明"></button>
      <div class="sh-row sh-exts" style="--n:${Math.max(4, slots.length)}">${slots.join('')}</div>
      <div class="sh-row sh-heroes">
        <div class="sh-hslots" style="--n:${Math.max(3, hs.length)}">${hs.join('')}</div>
        ${save.heroes.length > 1 ? `<button class="sh-benchbtn${benchOpen ? ' on' : ''}" data-k="bench" aria-label="控え室"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.5 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6zm15.5 0c0-2-.8-3.8-2.1-5.1.4-.1.7-.1 1.1-.1 3 0 5.5 2.3 5.5 5.2z"/></svg><b>${bench}</b></button>` : ''}
        <button class="sh-mallet${!maxed && save.emblems < mp ? ' poor' : ''}${maxed ? ' maxed' : ''}" data-k="m" style="--c:${RARITY_COLOR[lead.rarity]}" aria-label="マレットを鍛える">
          <span class="ma-art"><img src="${esc(lead.img)}" alt=""></span><span class="ma-lv"><small>Lv</small>${lv}</span><em>${maxed ? 'MAX' : `▲${EMBI}${mp}`}</em></button>
      </div>
      ${benchOpen ? benchHtml() : ''}
    </div>`;
  }

  function benchHtml(): string {
    const hs = save.heroes.map(heroById).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    return `<div class="sh-bench">${hs.map((h) => `<button data-act="bh:${h.id}" aria-pressed="${save.party.includes(h.id)}" style="--c:${RARITY_COLOR[h.rarity]}" aria-label="${esc(h.name)}"${h.id === save.hero ? ' disabled' : ''}><img src="${esc(h.img)}" alt=""></button>`).join('')}</div>`;
  }

  /** チュートリアルの案内つきで、次の部品を買うまでほかの買い物を止める（その部品の id。止めないときは null） */
  let lockNext: ToyId | null = null;
  /** 止めている間に触ってよいもの（次の部品と ?） */
  const lockedOut = (k: string): boolean => !!lockNext && k !== `t:${lockNext}` && !k.startsWith('help:');

  function render(): void {
    const tut = tutorialState(save);
    lockNext = tut.shopLocked ? tut.next : null;
    fixParty(save);
    restockShop(save);
    restockToys(save);
    restockCapsules(save);
    const sl = slotsOf(save);
    if (swapFor >= 0 && (!save.shop.includes(swapFor) || stackPreview(save, swapFor) || save.equip.length < sl.ext)) swapFor = -1;
    const unlocked = toysUnlocked(save.quota.n);
    const toys = save.toyShop.filter((id) => unlocked.includes(id));
    const half = Math.ceil(save.shop.length / 2);
    const rowA = save.shop.slice(0, half);
    const rowB = save.shop.slice(half);
    const caps = save.capsules ?? [];
    const rr = rerollPrice(save);
    const rrOk = Number.isFinite(rr);
    root.innerHTML = `${bar()}
      <div class="sh-stage">
        <div class="sh-pros">
          <div class="sh-back"><i class="sh-rays"></i><i class="sh-web"></i></div>
          <div class="sh-tiers">
            <section class="sh-tier hang" data-tier="gimmick" data-row="1" style="--row:1;--n:${Math.max(3, toys.length)}">
              <div class="sh-goods">${toys.length ? toys.map(toyItem).join('') : '<span class="sh-empty">SOLD OUT</span>'}</div>
              <button class="sh-help" data-k="help:gimmick" aria-label="説明"></button>
            </section>
            <section class="sh-tier" data-tier="ext" data-row="2" style="--row:2;--n:${Math.max(3, rowA.length)}">
              <div class="sh-goods">${rowA.map((id, i) => extItem(id, i)).join('')}</div>
              <button class="sh-help" data-k="help:ext" aria-label="説明"></button>
            </section>
            <section class="sh-tier" data-tier="ext" data-row="3" style="--row:3;--n:${Math.max(3, rowB.length)}">
              <div class="sh-goods">${rowB.map((id, i) => extItem(id, i + half)).join('')}</div>
            </section>
            <section class="sh-tier caps" data-tier="gacha" data-row="4" style="--row:4;--n:${Math.max(3, caps.length) + 1}">
              <div class="sh-goods">${caps.map(capItem).join('')}</div>
              <button class="sh-reroll${!rrOk || save.gum < rr ? ' poor' : ''}" data-k="rr" aria-label="全部を入れかえる"${rrOk ? '' : ' disabled'}>
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4L15 9h2.2A5.9 5.9 0 0 0 6.1 11H4a8 8 0 0 1 8-7zm-7.4 11H2l3.5-4L9 15H6.8a5.9 5.9 0 0 0 11.1-2H20a8 8 0 0 1-15.4 2z"/></svg>
                <em><img src="${esc(cat.icons.gum)}" alt="">${rrOk ? fmt(rr) : '—'}</em></button>
              <button class="sh-help" data-k="help:gacha" aria-label="説明"></button>
            </section>
          </div>
          <div class="sh-curtain l" aria-hidden="true"></div><div class="sh-curtain r" aria-hidden="true"></div>
          <div class="sh-drape l" aria-hidden="true"></div><div class="sh-drape r" aria-hidden="true"></div>
          <div class="sh-valance" aria-hidden="true"><i class="k-bulbs"></i></div>
          <div class="sh-clown" aria-hidden="true"><i class="bar"></i><img src="${esc(clownArt(clownOf(save)))}" alt=""></div>
          <div class="sh-foot" aria-hidden="true"><i class="k-bulbs"></i></div>
        </div>
      </div>
      ${hand()}
      <div class="sh-tip" hidden></div>`;
    root.classList.toggle('swapping', swapFor >= 0);
    root.classList.toggle('tut-lock', !!lockNext);
    justSold = '';
    // 音は自分で鳴らす（document の「押す」音と二重にしない）
    root.querySelectorAll<HTMLElement>('button').forEach((b) => { b.dataset.sfx = 'none'; });
    // 財布：変わった数字だけ転がる。減ったときは札が震える
    const walGum = root.querySelector<HTMLElement>('[data-w="gum"]');
    const walEmb = root.querySelector<HTMLElement>('[data-w="emb"]');
    if (walGum && save.gum !== shownGum) { walGum.textContent = fmt(shownGum); rollText(walGum, fmt(save.gum)); }
    if (walEmb && save.emblems !== shownEmb) { walEmb.textContent = fmt(shownEmb); rollText(walEmb, fmt(save.emblems)); if (walEmb.parentElement) pop(walEmb.parentElement); }
    shownGum = save.gum;
    shownEmb = save.emblems;
    const k = armed ?? hoverKey;
    if (k) { const el = keyEl(k); if (el) showTip(k, el); else { armed = null; hoverKey = null; } }
  }

  const keyEl = (k: string): HTMLElement | null => root.querySelector<HTMLElement>(`[data-k="${k}"]`);

  // ---------------------------------------------------------------- 吹き出し
  function tipHtml(k: string): string {
    const [kind, arg] = k.split(':');
    const touch = !fine();
    // 「もう 1 回で実行」は文にしない：することの名前だけの黄の札が打つ（スマホだけ）
    const go = (s: string, sub = false): string => (touch ? `<span class="tip-go${sub ? ' sub' : ''}">${s}</span>` : '');
    const det = (body: string): string => (body ? `<button class="tip-q${detail ? ' on' : ''}" data-act="detail" aria-label="くわしく">?</button>${detail ? `<div class="tip-detail">${body}</div>` : ''}` : '');
    const disc = discountOf(save);
    if (kind === 'help') {
      if (arg === 'quota') {
        const st = quotaStatus(save.quota, save.gum);
        return `<p class="tip-help"><img src="${esc(cat.icons.gum)}" alt="GUM" width="16" height="16"> <b>${fmt(Math.min(save.gum, st.need))}</b> / <b>${fmt(st.need)}</b>　のこり <b>${st.left}</b> プレイ</p>`;
      }
      return `<p class="tip-help">${esc(HELP[arg] ?? '')}</p>`;
    }
    if (kind === 't') {
      const id = arg as ToyId;
      return `<div class="tip-h"><b>${esc(TOY_NAME[id])}</b></div><div class="tip-foot"><em>${EMBI}${fmt(Math.max(1, TOY_PRICE[id] - disc))}</em>${go('見る', true)}</div>`;
    }
    if (kind === 'e') {
      const id = save.shop[Number(arg)];
      const e = id === undefined ? undefined : extById(id);
      if (!e) return '';
      const d = extDef(e);
      const st = stackPreview(save, id);
      const full = save.equip.length >= slotsOf(save).ext;
      if (swapFor === id) return `<div class="tip-h"><img src="${esc(e.img)}" alt=""><div><b>${esc(e.name)}</b></div></div><div class="tip-foot"><button class="tip-btn" data-act="swapcancel">やめる</button><span class="tip-go">▼ 入れかえ</span></div>`;
      return `<div class="tip-h"><img src="${esc(e.img)}" alt=""><div><b>${esc(e.name)}</b><span class="tip-st" style="color:${RARITY_COLOR[e.rarity]}">${'★'.repeat(e.rarity)}<small>${RARITY_NAME[e.rarity]}</small></span></div></div>
        <div class="tip-tags">${d ? `<small class="fam" style="--f:${FAMILY_INFO[d.fam].color}">${esc(FAMILY_INFO[d.fam].name)}</small><small class="kind">${KIND_TAG[d.kind]}</small>` : ''}<span class="tip-eff">${esc(extName(e))}</span></div>
        ${st ? stackTag(save, id) : ''}
        <div class="tip-foot"><em>${EMBI}${fmt(priceOf(e, disc))}</em>${det(`<p>${esc(extText(e))}</p><div class="tip-tags">${extTags(e, save)}</div>${d ? `<p class="dim">${esc(FAMILY_INFO[d.fam].text)}</p>` : ''}`)}${go(st ? '重ねる' : full ? '入れかえ' : '買う')}</div>`;
    }
    if (kind === 'c') {
      const c = save.capsules?.[Number(arg)];
      if (!c || c.sold) return '';
      const pool = capsulePool(save, c);
      const odds = c.kind === 'fam' ? famOdds(save, c.fam) : [];
      const name = c.kind === 'rar' ? `<span style="color:${RARITY_COLOR[c.r]}">${'★'.repeat(c.r)}</span> のカプセル` : `${FAMILY_NAME[c.fam]}のカプセル`;
      const sub = c.kind === 'rar' ? `${RARITY_NAME[c.r]}のヒーロー` : '★はランダム';
      const body = c.kind === 'rar'
        ? `<p>まだ持っていない ${RARITY_NAME[c.r]} のヒーロー ${pool.length} 人から 1 人</p>`
        : `<p class="tip-odds">${odds.map((o, i) => (o > 0 ? `<span style="color:${RARITY_COLOR[i + 1]}">★${i + 1} ${o >= 0.1 ? Math.round(o * 100) : (o * 100).toFixed(1)}%</span>` : '')).join('')}</p>`;
      return `<div class="tip-h"><b>${name}</b></div><p class="tip-eff">${sub}</p><div class="tip-foot"><em>${EMBI}${fmt(capsulePrice(c, disc))}</em>${det(body)}${go('回す')}</div>`;
    }
    if (k === 'rr') {
      const rr = rerollPrice(save);
      return `<div class="tip-h"><b>全部 入れかえ</b></div><div class="tip-foot"><em><img src="${esc(cat.icons.gum)}" alt="">${Number.isFinite(rr) ? fmt(rr) : '—'}</em>${det('<p>GUM で払う。使うたびに 2 倍（Limited の引き直しと共有・挑戦が終わるまで戻らない）</p>')}${go('入れかえ')}</div>`;
    }
    if (kind === 's') {
      const i = Number(arg);
      const id = save.equip[i];
      const e = id === undefined ? undefined : extById(id);
      if (!e) return '';
      const p = ptsOf(save, id);
      const g = gaugeOf(p);
      const sellFull = totalsOf([], save.limited).sellFull > 0;
      const spill = Math.max(0, save.equip.length - 1 - slotsOf({ ...save, equip: save.equip.filter((x) => x !== id) }).ext);
      return `<div class="tip-h"><img src="${esc(e.img)}" alt=""><div><b>${esc(e.name)}</b><span class="tip-st" style="color:${RARITY_COLOR[e.rarity]}">${'★'.repeat(e.rarity)}<small>${STACK_RARITY[g.r - 1]} ${p}${g.hi === null ? '' : `/${g.hi}`}</small></span></div></div>
        <p class="tip-eff">${esc(extName(e))}</p>
        <div class="tip-foot tip-ctl">
          <button class="tip-btn" data-act="mv:-1"${i === 0 ? ' disabled' : ''} aria-label="左へ">◀</button>
          <button class="tip-btn" data-act="mv:1"${i >= save.equip.length - 1 ? ' disabled' : ''} aria-label="右へ">▶</button>
          <button class="tip-btn sell${sellArmed ? ' armed' : ''}" data-act="sell">${sellArmed ? `売る？${spill ? `<small>+${spill} 品</small>` : ''}` : `売る +${EMBI}${fmt(sellPrice(save, id, sellFull))}`}</button>
          ${det(`<p>${esc(extText(e))}</p><div class="tip-tags">${extTags(e, save)}</div>`)}
        </div>`;
    }
    if (kind === 'h') {
      const i = Number(arg);
      const id = save.party[i];
      if (id === undefined) return '';
      const h = heroById(id);
      const a = resolveAbility(save.party.map(heroById), i);
      return `<div class="tip-h"><img src="${esc(h.img)}" alt=""><div><b>${esc(h.name)}</b><span class="tip-st" style="color:${RARITY_COLOR[h.rarity]}">${'★'.repeat(h.rarity)}<small>${i === 0 ? 'リーダー' : '控え'}</small></span></div></div>
        <p class="tip-eff">${esc(a.name)}</p><p class="tip-sub">${esc(a.text(abilityPower(h, i === 0)))}</p>
        ${i === 0 ? '' : `<div class="tip-foot">${touch ? go('リーダーに') : '<span class="tip-go">リーダーに</span>'}</div>`}`;
    }
    if (k === 'xs' || k === 'hs') {
      const ext = k === 'xs';
      return `<div class="tip-h"><b>${ext ? '装備の枠' : 'ヒーローの枠'} +1</b></div><div class="tip-foot"><em>${EMBI}${ext ? EXT_SLOT_PRICE : HERO_SLOT_PRICE}</em>${go('広げる')}</div>`;
    }
    if (k === 'm') {
      const lv = malletLv(save);
      const maxed = lv >= MALLET_MAX;
      return `<div class="tip-h"><b>マレット Lv ${lv}${maxed ? '' : ` → ${lv + 1}`}</b></div>
        <p class="tip-eff">基礎 ${fmt(malletPoints(lv))}${maxed ? '' : ` → <b>${fmt(malletPoints(lv + 1))}</b>`}</p>
        <div class="tip-foot">${maxed ? '' : `<em>${EMBI}${fmt(Math.max(1, malletPrice(lv) - disc))}</em>`}${det(`<p>全部の球の GUM の基本額 ×${kfmt(malletPts(lv))}${maxed ? '' : ` → ×${kfmt(malletPts(lv + 1))}`}。GAME OVER で Lv 1 に戻る。</p>`)}${maxed ? '' : go('鍛える')}</div>`;
    }
    if (k === 'bench') return '';
    return '';
  }

  function showTip(k: string, target: HTMLElement): void {
    const tip = root.querySelector<HTMLElement>('.sh-tip');
    if (!tip) return;
    const html = tipHtml(k);
    if (!html) { tip.hidden = true; return; }
    window.clearTimeout(hideT);
    tip.innerHTML = html;
    tip.hidden = false;
    tip.dataset.k = k;
    tip.querySelectorAll<HTMLElement>('button').forEach((b) => { b.dataset.sfx = 'none'; });
    // 重ねられる品：重ねる先の装備の枠が跳ねる（どこに重なるかを絵で）
    root.querySelectorAll('.pair-hot').forEach((x) => x.classList.remove('pair-hot'));
    if (k.startsWith('e:') && swapFor < 0) {
      const id = save.shop[Number(k.slice(2))];
      const st = id > 0 ? stackPreview(save, id) : null;
      if (st) root.querySelector(`.sh-slot[data-eq="${st.from}"]`)?.classList.add('pair-hot');
    }
    // 品の上に（入らなければ下に）。横は root の中に収める
    const rr = root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const w = Math.min(rr.width - 12, 260);
    tip.style.width = `${w}px`;
    const th = tip.offsetHeight;
    const cx = tr.left + tr.width / 2 - rr.left;
    const x = Math.max(6, Math.min(rr.width - w - 6, cx - w / 2));
    let y = tr.top - rr.top - th - 10;
    let below = false;
    if (y < 4) { y = tr.bottom - rr.top + 10; below = true; }
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.setProperty('--ax', `${Math.max(14, Math.min(w - 14, cx - x))}px`);
    tip.classList.toggle('below', below);
  }
  function hideTip(): void {
    const tip = root.querySelector<HTMLElement>('.sh-tip');
    if (tip) tip.hidden = true;
    root.querySelectorAll('.pair-hot').forEach((x) => x.classList.remove('pair-hot'));
  }

  // PC：マウスを重ねると吹き出し（品から吹き出しへ移る間は少し待つ）
  root.addEventListener('pointerover', (ev) => {
    if (!fine() || ev.pointerType !== 'mouse') return;
    const t = ev.target as HTMLElement;
    if (t.closest('.sh-tip')) { window.clearTimeout(hideT); return; }
    const el = t.closest<HTMLElement>('[data-k]');
    if (el && !armed) {
      const k = el.dataset.k as string;
      if (k !== hoverKey) { hoverKey = k; detail = false; sellArmed = false; sfx('hover'); }
      showTip(k, el);
      return;
    }
    if (!el && !armed) {
      window.clearTimeout(hideT);
      hideT = window.setTimeout(() => { hoverKey = null; hideTip(); }, 220);
    }
  });
  root.addEventListener('pointerleave', () => { if (!armed && fine()) { hoverKey = null; hideTip(); } });

  // ---------------------------------------------------------------- 触る
  /** できない：その品が震え、足りない財布（エンブレムか GUM）も震えて赤くなる */
  const nope = (el?: Element | null): void => {
    const h = el as HTMLElement | null;
    sfx('deny');
    if (!h) return;
    shake(h);
    const wal = root.querySelector<HTMLElement>(h.dataset.k === 'rr' ? '.sh-wal.gum' : '.sh-wal.em');
    if (h.classList.contains('poor') && wal) {
      shake(wal);
      for (const x of [wal, h]) { x.classList.add('is-short'); window.setTimeout(() => x.classList.remove('is-short'), 520); }
    }
  };
  const arm = (k: string, el: HTMLElement): void => {
    if (armed !== k) { detail = false; sellArmed = false; }
    armed = k;
    sfx('select');
    root.querySelectorAll('.armed-k').forEach((x) => x.classList.remove('armed-k'));
    el.classList.add('armed-k');
    showTip(k, el);
  };
  const disarm = (): void => {
    armed = null;
    sellArmed = false;
    detail = false;
    root.querySelectorAll('.armed-k').forEach((x) => x.classList.remove('armed-k'));
  };
  /** 実行してよいか：PC はいつも、スマホは同じものを 2 回目 */
  const ready = (k: string, el: HTMLElement): boolean => {
    if (fine() || armed === k) return true;
    arm(k, el);
    return false;
  };
  const commit = (): void => { root.classList.remove('is-enter'); fixParty(save); hooks.changed(); render(); };

  root.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const b = target.closest('button');
    if (!b) {
      if (target.closest('.sh-tip')) return;
      // 何もないところ：選んでいたものをやめる
      if (armed || swapFor >= 0 || benchOpen) {
        disarm();
        swapFor = -1;
        benchOpen = false;
        hideTip();
        render();
      }
      return;
    }
    const act = b.dataset.act;
    if (act) { onAct(act, b); return; }
    const k = b.dataset.k;
    if (!k) return;
    onKey(k, b);
  });

  function onAct(act: string, b: HTMLElement): void {
    if (lockNext && act !== 'detail') { nope(b); return; }
    const sellFull = totalsOf([], save.limited).sellFull > 0;
    const sel = armed ?? hoverKey;
    if (act === 'detail') {
      detail = !detail;
      sfx('toggle');
      const k = sel;
      const el = k ? keyEl(k) : null;
      if (k && el) showTip(k, el);
      return;
    }
    if (act === 'swapcancel') { swapFor = -1; disarm(); hideTip(); sfx('cancel'); render(); return; }
    if (act.startsWith('bh:')) {
      const id = Number(act.slice(3));
      if (id === save.hero) return;
      if (save.party.includes(id)) save.party = save.party.filter((x) => x !== id);
      else if (save.party.length < slotsOf(save).hero) save.party.push(id);
      else { nope(b); return; }
      sfx('select');
      commit();
      return;
    }
    if (!sel?.startsWith('s:')) return;
    const i = Number(sel.slice(2));
    if (act.startsWith('mv:')) {
      const j = i + Number(act.slice(3));
      if (j < 0 || j >= save.equip.length) return;
      [save.equip[i], save.equip[j]] = [save.equip[j], save.equip[i]];
      if (armed) armed = `s:${j}`;
      if (hoverKey) hoverKey = `s:${j}`;
      sfx('tab');
      commit();
      const moved = keyEl(`s:${j}`);
      if (moved) pop(moved);
    } else if (act === 'sell') {
      const id = save.equip[i];
      if (id === undefined) return;
      if (!sellArmed) { sellArmed = true; sfx('select'); const el = keyEl(sel); if (el) showTip(sel, el); return; }
      sellExt(save, id, sellFull);
      sfx('coin');
      disarm();
      hoverKey = null;
      hideTip();
      commit();
    }
  }

  function onKey(k: string, b: HTMLElement): void {
    const [kind, arg] = k.split(':');
    if (lockedOut(k)) { nope(b); return; }
    if (kind === 'help') {
      if (armed === k) { disarm(); hideTip(); return; }
      arm(k, b);
      return;
    }
    if (kind === 't') { openPreview(arg as ToyId); return; }
    if (k === 'bench') { benchOpen = !benchOpen; disarm(); hideTip(); sfx(benchOpen ? 'open' : 'close'); render(); return; }
    if (kind === 'e') {
      const id = save.shop[Number(arg)];
      const e = id === undefined ? undefined : extById(id);
      if (!e) return;
      if (swapFor === id) { swapFor = -1; disarm(); hideTip(); render(); return; }
      if (!ready(k, b)) return;
      const slots = slotsOf(save).ext;
      // 枠がいっぱいで重ねられない：入れかえる装備を選ぶ
      if (!stackPreview(save, id) && save.equip.length >= slots) {
        swapFor = id;
        armed = k;
        sfx('select');
        render();
        return;
      }
      buyExtFrom(b, id);
      return;
    }
    if (kind === 's') {
      const i = Number(arg);
      if (swapFor >= 0) { swapInto(i); return; }
      if (armed === k) { disarm(); hideTip(); render(); return; }
      arm(k, b);
      root.querySelectorAll('.sh-slot.sel').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      return;
    }
    if (kind === 'c') {
      if (!ready(k, b)) return;
      gacha(Number(arg), b);
      return;
    }
    if (k === 'rr') {
      if (!ready(k, b)) return;
      reroll(b);
      return;
    }
    if (kind === 'h') {
      const i = Number(arg);
      const id = save.party[i];
      if (id === undefined) return;
      if (i === 0) { if (armed === k) { disarm(); hideTip(); } else arm(k, b); return; }
      if (!ready(k, b)) return;
      save.party = [id, ...save.party.filter((x) => x !== id)];
      save.hero = id;
      disarm();
      hoverKey = null;
      hideTip();
      sfx('confirm');
      commit();
      const lead = keyEl('h:0');
      if (lead) { pop(lead); burst(lead, 6); }
      return;
    }
    if (k === 'xs' || k === 'hs') {
      if (!ready(k, b)) return;
      if (!buySlot(save, k === 'xs' ? 'ext' : 'hero')) { nope(b); return; }
      sfx('buy');
      disarm();
      hoverKey = null;
      hideTip();
      commit();
      // 新しい枠が弾んで出る
      const fresh = [...root.querySelectorAll<HTMLElement>(k === 'xs' ? '.sh-exts .sh-slot.empty' : '.sh-hslots .sh-slot.empty')].pop();
      if (fresh) { fresh.classList.add('landed'); burst(fresh, 8); }
      return;
    }
    if (k === 'm') {
      if (malletLv(save) >= MALLET_MAX) { arm(k, b); return; }
      if (!ready(k, b)) return;
      const from = malletLv(save);
      if (!buyMallet(save, discountOf(save))) { nope(b); return; }
      sfx('buy');
      disarm();
      hoverKey = null;
      commit();
      showMalletUp(appRoot(), heroById(save.hero).img, from, malletLv(save), () => render());
    }
  }

  const appRoot = (): HTMLElement => document.getElementById('app') ?? document.body;

  // ---------------------------------------------------------------- 買う
  function buyExtFrom(src: HTMLElement, id: number, replace?: number): void {
    const e = extById(id);
    if (!e) return;
    const from = (src.querySelector('img') ?? src).getBoundingClientRect();
    const sellFull = totalsOf([], save.limited).sellFull > 0;
    const r = buyExt(save, id, { price: priceOf(e, discountOf(save)), slots: slotsOf(save).ext, replace, full: sellFull });
    if (!r.ok) { nope(src); return; }
    justSold = `e:${save.shop.indexOf(id)}`;
    save.shop = save.shop.map((x) => (x === id ? -x : x));
    swapFor = -1;
    disarm();
    hoverKey = null;
    hideTip();
    sfx('buy');
    if (replace !== undefined) setTimeout(() => sfx('coin'), 90);
    commit();
    const to = r.kind === 'stack' ? r.stack.to : r.id;
    const stacked = r.kind === 'stack';
    fly(e.img, from, save.equip.indexOf(to), stacked, () => afterBuy(r));
  }
  function swapInto(i: number): void {
    const old = save.equip[i];
    const src = root.querySelector<HTMLElement>('.sh-item.swapping');
    if (old === undefined || swapFor < 0 || !src) return;
    buyExtFrom(src, swapFor, old);
  }
  /** 買った品が装備の枠へ飛んでいく */
  function fly(img: string, from: DOMRect, slot: number, stacked: boolean, done: () => void): void {
    const dst = root.querySelectorAll<HTMLElement>('.sh-exts .sh-slot')[slot];
    const land = (): void => {
      if (!dst) return;
      dst.classList.add('landed');
      // 枠に着いた：判を押す音。重ねたときはゲージが伸びる音も
      sfx('stamp', { vol: 0.7 });
      if (stacked) sfx('count', { p: Number(dst.querySelector<HTMLElement>('.slot-gauge')?.style.getPropertyValue('--g') ?? 0.5) });
      burst(dst, stacked ? 10 : 6);
    };
    if (!dst || reduced()) { land(); done(); return; }
    const to = (dst.querySelector('img') ?? dst).getBoundingClientRect();
    const ghost = document.createElement('img');
    ghost.src = img;
    ghost.className = 'sh-fly';
    ghost.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const s = Math.max(0.3, to.width / Math.max(1, from.width));
    const dImg = dst.querySelector('img');
    if (dImg) dImg.style.opacity = '0';
    ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', offset: 0 },
      { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 80}px) scale(1.35) rotate(-16deg)`, offset: 0.42 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(8deg)`, offset: 1 },
    ], { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.35, 1)' }).onfinish = () => {
      ghost.remove();
      if (dImg) dImg.style.opacity = '';
      land();
      done();
    };
  }
  /** 重ねてレアリティが上がったら進化の演出 */
  function afterBuy(r: BuyResult): void {
    if (!r.ok || r.kind !== 'stack' || !r.stack.evolve) return;
    const from = extById(r.stack.from);
    const to = extById(r.stack.to);
    if (from && to) showExtEvolve(appRoot(), from, to, ptsOf(save, to.id), () => render());
  }

  function gacha(i: number, b: HTMLElement): void {
    const c = save.capsules?.[i];
    if (!c) return;
    const r = buyCapsule(save, i, discountOf(save));
    if (!r.ok) { nope(b); return; }
    disarm();
    hoverKey = null;
    hideTip();
    justSold = `c:${i}`;
    sfx('buy');
    commit();
    showGacha(appRoot(), c, r.hero, { tier: clownOf(save), party: r.party, done: () => render() });
  }

  // ---------------------------------------------------------------- ギミックの見本
  function openPreview(id: ToyId): void {
    if (previewOpen) return;
    previewOpen = true;
    disarm();
    hoverKey = null;
    hideTip();
    const price = Math.max(1, TOY_PRICE[id] - discountOf(save));
    openToyPreview(root, save, id, {
      price,
      owned: save.toys.includes(id),
      buy: () => {
        const from = clownOf(save);
        if (!buyToy(save, id, discountOf(save))) return null;
        // 見本の上に判が押されてから：強さの計算とセーブ（台を組みなおすので重い。判の動きを止めないよう、あとで）・棚の描きなおし・取り付けの演出へ
        return () => { commit(); hooks.toyBought(id, from, clownOf(save)); };
      },
      closed: () => { previewOpen = false; },
    });
  }

  // ---------------------------------------------------------------- リロール（全部の段が袖へ引っこみ、反対の袖から出てくる）
  function reroll(b: HTMLElement): void {
    if (!payReroll(save)) { nope(b); return; }
    swapFor = -1;
    disarm();
    hoverKey = null;
    hideTip();
    // いまの棚の品を写しておく（段ごと）
    const olds = [...root.querySelectorAll<HTMLElement>('.sh-tier .sh-goods')].map((g) => g.cloneNode(true) as HTMLElement);
    restockShop(save, true);
    restockToys(save, true);
    restockCapsules(save, true);
    // 音：GUM を払う → 品が袖へ走る → 新しい品が止まる
    sfx('coin');
    setTimeout(() => sfx('wipe', { vol: 0.7 }), 90);
    setTimeout(() => sfx('page'), 560);
    commit();
    // 操り手のピエロが糸をぐいと引く
    root.querySelector('.sh-clown')?.classList.add('is-tug');
    if (reduced()) return;
    const tiers = [...root.querySelectorAll<HTMLElement>('.sh-tier')];
    tiers.forEach((tier, ti) => {
      const row = Number(tier.dataset.row);
      const dir = row % 2 === 1 ? 1 : -1; // 奇数段は右へ、偶数段は左へ引っこむ
      const hang = tier.classList.contains('hang');
      // 吊られた人形は上が支点（下が遅れて振れる）、棚の品は下が支点（上が遅れて傾く）
      const lag = hang ? 1 : -1;
      const W = tier.clientWidth;
      const old = olds[ti];
      const goods = tier.querySelector<HTMLElement>('.sh-goods');
      if (old) {
        old.classList.add('out');
        tier.insertBefore(old, goods);
        const items = [...old.children] as HTMLElement[];
        items.forEach((it, i) => {
          it.animate([
            { transform: 'none' },
            { transform: `rotate(${lag * dir * 10}deg)`, offset: 0.25 },
            { transform: `translateX(${dir * W}px) rotate(${lag * dir * 16}deg)` },
          ], { duration: 380, delay: ti * 50 + i * 20, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' });
        });
        setTimeout(() => old.remove(), 380 + ti * 50 + items.length * 20 + 40);
      }
      if (goods) {
        [...goods.children].forEach((it, i) => {
          (it as HTMLElement).animate([
            { transform: `translateX(${-dir * W}px) rotate(${lag * dir * 9}deg)`, offset: 0 },
            { transform: `translateX(${dir * 4}px) rotate(${lag * dir * 5}deg)`, offset: 0.52 },
            { transform: `translateX(0) rotate(${-lag * dir * 11}deg)`, offset: 0.66 },
            { transform: `rotate(${lag * dir * 5}deg)`, offset: 0.82 },
            { transform: `rotate(${-lag * dir * 2}deg)`, offset: 0.93 },
            { transform: 'none', offset: 1 },
          ], { duration: 520, delay: 180 + ti * 50 + i * 22, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'backwards' });
        });
      }
    });
    // 幕が引っぱられて揺れる
    root.querySelectorAll<HTMLElement>('.sh-curtain').forEach((c, i) => {
      const f = i ? -1 : 1;
      c.animate([
        { transform: `scaleX(${f})` }, { transform: `scaleX(${f * 1.3}) skewY(4deg)`, offset: 0.3 }, { transform: `scaleX(${f * 0.94}) skewY(-2deg)`, offset: 0.65 }, { transform: `scaleX(${f})` },
      ], { duration: 700, easing: 'ease-in-out' });
    });
  }

  render();
  // 店に入ったとき（ページが見えたとき）：幕が左右に引かれ、棚の品が段ごとに降りてくる
  let seen = false;
  const enter = (): void => {
    if (reduced()) return;
    root.classList.remove('is-enter');
    void root.offsetWidth;
    root.classList.add('is-enter');
    window.setTimeout(() => root.classList.remove('is-enter'), 1100);
  };
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver((list) => {
      const on = list.some((e) => e.intersectionRatio >= 0.6);
      if (on && !seen) enter();
      if (on || list.every((e) => e.intersectionRatio < 0.2)) seen = on;
    }, { threshold: [0, 0.2, 0.6] }).observe(root);
  }
  return { render };
}
