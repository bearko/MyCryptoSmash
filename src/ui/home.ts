// 遊んでいないときの画面：下のフッターで「ショップ」「ピンボール」「ラボ」を切りかえる（左右のスワイプでも）。
// - ショップ：ギミック（台の大きな仕掛け）をエンブレムで買い足す（買うほど台に宿るピエロの姿が上がる）。
//   エクステンションをエンブレムで買う・売る。装備の枠（3〜5。台に付く）とヒーローの枠（1〜5。先頭がリーダー＝自分の球）。
//   枠はエンブレムで広げられる。品ぞろえは GUM で引き直せる（Limited の引き直しと回数を共有）
// - ピンボール：タイトル（はじめる）。うしろに台が見える
// - ラボ：スキルツリー・台のしくみ・設定・図鑑（Limited・エクステンション・ヒーロー）

import { cat, heroById, RARITY_COLOR, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, se } from '../core/audio';
import { SHOP_BASE, SLOTS_CAP, slotsOf, limitedById, limitedOf, modName, modOf, modText, priceOf, rollShop, scoreOf, sellOf, totalsOf, type ScoreKind } from '../game/mods';

/** スコアの効果の種類の札（+基本額・+倍率・×倍率） */
export const KIND_TAG: Record<ScoreKind, string> = { chips: '+基本額', mult: '+倍率', xmult: '×倍率', again: 'もう 1 回', copy: 'コピー' };
import { PARTS } from '../game/parts';
import { abilityPower, resolveAbility } from '../game/abilities';

import { TOY_NAME, TOY_PRICE, TOY_SHORT, TOY_UNLOCK, buyToy, clownOf, restockToys, toysUnlocked, type ToyId } from '../game/toys';
import { clownPanel, toyCardArt } from './gimmick';
import { clownLine, finalLine } from '../game/clown-lines';
import { FINAL_FLOORS, FINAL_TIME } from '../game/final';
import { startTalk } from './talk';
import { EXT_SLOT_PRICE, FINAL_TRIES, HERO_SLOT_PRICE, QUOTAS, QUOTA_PLAYS, SLOTS_MAX, buySlot, payReroll, quotaStatus, rerollCost } from '../game/quota';

/** ノルマの番号の札（本編 n/10・延長・エンドレス） */
export function quotaTag(save: Save): string {
  const n = save.quota.n;
  if (save.endless) return `ENDLESS <b>${n}</b>`;
  return n > QUOTAS ? `QUOTA <b>${n}</b> <small>延長</small>` : `QUOTA <b>${n}</b>/${QUOTAS}`;
}

/** ヒーローの枠のいちばん多い数 */
export const PARTY_SLOTS = SLOTS_MAX;
/** エンブレムの印（CSS の .emb） */
export const EMB = '<i class="emb"></i>';
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const extById = (id: number): Ext | undefined => cat.exts.find((e) => e.id === id);
const stars = (r: number): string => '★'.repeat(r);
const partName = (id: string): string => PARTS.find((p) => p.id === id)?.name ?? '';

export interface HomeHooks {
  tree(): void;
  guide(): void;
  settings(): void;
  /** 装備・ヒーロー・GUM が変わった（強さを計算しなおしてセーブ） */
  changed(): void;
  /** スキルツリーで強化できる数 */
  affordable(): number;
  /** ギミックを買った（台に足された演出と、ピエロの進化。from → to はピエロの段階） */
  toyBought(id: ToyId, from: number, to: number): void;
}
export interface Home {
  show(tab?: number): void;
  hide(): void;
  refresh(): void;
  readonly visible: boolean;
  readonly tab: number;
}

/** 品ぞろえを決める（足りなければ・プレイが終わったら） */
export function restockShop(save: Save, force = false): void {
  const n = SHOP_BASE + totalsOf(save.equip, save.limited).shopSlots;
  if (!force && save.shop.length >= n) return;
  save.shop = rollShop(save.pinDeepest, n, Math.random, save.owned, save.quota.n);
}
/** ショップの品ぞろえとギミックの候補を、両方引き直す（プレイが終わるたび） */
export function restockAll(save: Save): void {
  restockShop(save, true);
  restockToys(save, true);
}
/** ヒーローの装備を正しく（先頭はリーダー、持っているヒーローだけ、5 人まで） */
export function fixParty(save: Save): void {
  const p = [save.hero, ...save.party.filter((id) => id !== save.hero && save.heroes.includes(id))];
  const sl = slotsOf(save);
  save.party = [...new Set(p)].slice(0, Math.max(1, sl.hero));
  save.equip = save.equip.filter((id) => save.owned.includes(id)).slice(0, sl.ext);
}

export function initHome(root: HTMLElement, save: Save, hooks: HomeHooks): Home {
  const track = root.querySelector('#homeTrack') as HTMLElement;
  const shopEl = root.querySelector('#pageShop') as HTMLElement;
  const labEl = root.querySelector('#pageLab') as HTMLElement;
  const navBtns = [...root.querySelectorAll<HTMLButtonElement>('.home-nav button')];
  let tab = 1;
  let visible = true;
  let limitedSel = -1;

  function setTab(i: number, anim = true): void {
    const next = Math.max(0, Math.min(2, i));
    if (next === 1 && tab !== 1) titleSay = '';
    tab = next;
    track.style.transition = anim ? '' : 'none';
    track.style.transform = `translateX(${-tab * (100 / 3)}%)`;
    navBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === tab)));
    root.dataset.tab = String(tab);
    titleBits();
    if (tab === 0) renderShop();
    if (tab === 2) renderLab();
  }

  /** 右上の財布：GUM（納品とリロール）とエンブレム（買い物） */
  const wallet = (): string => `<div class="pg-wallet"><div class="pg-gum"><img src="${cat.icons.gum}" alt=""><b>${fmt(save.gum)}</b></div><div class="pg-gum pg-emb">${EMB}<b>${fmt(save.emblems)}</b></div></div>`;
  /** いまのノルマ（入金口） */
  const quotaLine = (): string => {
    const st = quotaStatus(save.quota, save.gum);
    if (st.final) return `<div class="quota-line final"><span>LAST STAGE</span><span>ボス <b>${FINAL_FLOORS.length}</b> 体・<b>${FINAL_TIME}</b> 秒</span><span>のこり <b>${st.left}</b>/${FINAL_TRIES} 回</span></div>`;
    return `<div class="quota-line${st.canPay ? ' ok' : ''}${save.endless ? ' endless' : ''}"><span>${quotaTag(save)}</span><span>納品 <b>${fmt(st.need)}</b> GUM</span><span>のこり <b>${st.left}</b>/${QUOTA_PLAYS} プレイ</span></div>`;
  };

  /** タイトルでピエロが言うこと（タイトルを開き直すたびに選び直す） */
  let titleSay = '';
  let titleSayTier = -1;
  /** タイトルのノルマの 1 行と、台に宿るピエロ（吹き出しでしゃべる） */
  function titleBits(): void {
    const tq = root.querySelector('#titleQuota');
    if (tq) tq.outerHTML = quotaLine().replace('class="quota-line', 'id="titleQuota" class="quota-line');
    const tc = root.querySelector<HTMLElement>('#titleClown');
    if (!tc) return;
    const tier = clownOf(save);
    const fresh = !titleSay || tier !== titleSayTier;
    const final = save.quota.final;
    if (fresh) { titleSay = final ? finalLine('title', { name: save.name }) : clownLine('title', tier, { name: save.name }); titleSayTier = tier; }
    const start = root.querySelector<HTMLElement>('#btnStart');
    const label = final ? 'ラストステージへ' : 'はじめる';
    if (start && start.textContent !== label) { start.textContent = label; start.classList.toggle('final', final); }
    tc.innerHTML = clownPanel(save.toys.length, 'small', titleSay);
    const b = tc.querySelector<HTMLElement>('.talk-b');
    if (b && !fresh) { b.textContent = b.dataset.say ?? ''; b.removeAttribute('data-say'); } else startTalk(tc, 400);
  }

  // ---------------------------------------------------------------- ショップ
  /** 並べかえる装備（選んでいる枠） */
  let selSlot = -1;
  function renderShop(): void {
    fixParty(save);
    restockShop(save);
    const sl = slotsOf(save);
    const extSlots = sl.ext;
    const heroSlots = sl.hero;
    // 枠を広げる札：ショップで広げた数（Limited の枠はその先に足される）
    const extBuyAt = extSlots;
    const heroBuyAt = heroSlots;
    const extRow = Math.max(SLOTS_MAX, Math.min(SLOTS_CAP, extSlots));
    const heroRow = Math.max(SLOTS_MAX, Math.min(SLOTS_CAP, heroSlots));
    const card = (id: number): string => {
      const e = extById(id);
      if (!e) return '';
      const own = save.owned.includes(id);
      const price = priceOf(e);
      const d = modOf(e);
      const sc = scoreOf(e);
      return `<button class="ext-card${own ? ' owned' : ''}${!own && save.emblems < price ? ' poor' : ''}${sc ? ' score' : ''}" data-buy="${id}" style="--c:${RARITY_COLOR[e.rarity]}" ${own ? 'disabled' : ''}>
        <img src="${esc(e.img)}" alt=""><span class="rar">${stars(e.rarity)}</span>
        <b>${esc(e.name)}</b><span class="mod">${esc(modName(e))}${sc ? `<small class="sk ${sc.kind}">${KIND_TAG[sc.kind]}</small>` : `<small>${esc(partName(d?.part ?? ''))}</small>`}</span>
        <span class="mod-text">${esc(modText(e))}</span>
        <em>${own ? '持っている' : `${EMB}${fmt(price)}`}</em></button>`;
    };
    const slot = (i: number): string => {
      const e = extById(save.equip[i]);
      if (i >= extSlots) {
        const can = i === extBuyAt && save.extSlots < SLOTS_MAX;
        return `<button class="slot locked" data-slotbuy="ext"${!can || save.emblems < EXT_SLOT_PRICE ? ' disabled' : ''} aria-label="枠を広げる"><span>${can ? `枠 +1<small>${EMB}${EXT_SLOT_PRICE}</small>` : 'LOCK'}</span></button>`;
      }
      if (!e) return `<div class="slot empty"><span>空き</span></div>`;
      const sc = scoreOf(e);
      return `<button class="slot${i === selSlot ? ' sel' : ''}" data-slot="${i}" style="--c:${RARITY_COLOR[e.rarity]}" aria-label="${esc(e.name)}（${i + 1} 番目）"><i class="slot-no">${i + 1}</i><img src="${esc(e.img)}" alt="">${sc ? `<small class="sk ${sc.kind}">${KIND_TAG[sc.kind]}</small>` : ''}<span>${esc(modName(e))}</span></button>`;
    };
    const inv = save.owned.map(extById).filter((e): e is Ext => !!e).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    const hslot = (i: number): string => {
      const id = save.party[i];
      if (i >= heroSlots) {
        const can = i === heroBuyAt && save.heroSlots < SLOTS_MAX;
        return `<button class="slot hero locked" data-slotbuy="hero"${!can || save.emblems < HERO_SLOT_PRICE ? ' disabled' : ''} aria-label="ヒーローの枠を広げる"><span>${can ? `枠 +1<small>${EMB}${HERO_SLOT_PRICE}</small>` : 'LOCK'}</span></button>`;
      }
      if (id === undefined) return `<div class="slot hero empty"><span>空き</span></div>`;
      const h = heroById(id);
      return `<button class="slot hero${i === 0 ? ' leader' : ''}" data-leader="${id}" style="--c:${RARITY_COLOR[h.rarity]}" aria-label="${esc(h.name)}${i ? ' をリーダーにする' : '（リーダー）'}"><img src="${esc(h.img)}" alt=""><span>${i === 0 ? 'リーダー' : esc(h.name)}</span></button>`;
    };
    const heroes = save.heroes.map(heroById).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    const rr = rerollCost(save.quota.rerolls);
    restockToys(save);
    const unlocked = toysUnlocked(save.quota.n);
    const toyCard = (id: ToyId, i: number): string => {
      const own = save.toys.includes(id);
      const price = TOY_PRICE[id];
      return `<button class="toy-card${own ? ' owned' : ''}${!own && save.emblems < price ? ' poor' : ''}" data-toy="${id}" style="--d:${i * 0.06}s" ${own ? 'disabled' : ''}>
        <img src="${esc(toyCardArt(id))}" alt=""><b>${esc(TOY_NAME[id])}</b>
        <span class="mod-text">${esc(TOY_SHORT[id])}</span>
        <em>${own ? '台に付いた' : `${EMB}${fmt(price)}`}</em></button>`;
    };
    const left = TOY_UNLOCK.length - unlocked.length;
    const toyCands = save.toyShop.filter((id) => unlocked.includes(id));
    shopEl.innerHTML = `
      <header class="page-head"><h2>ショップ</h2>${wallet()}</header>
      ${quotaLine()}
      <h3 class="page-sec">ギミック <small>台の仕掛け ${save.toys.length} / ${TOY_UNLOCK.length}・買うほど台がにぎやかに</small></h3>
      ${clownPanel(save.toys.length)}
      ${toyCands.length ? `<div class="toy-grid">${toyCands.map(toyCard).join('')}</div>
      <div class="shop-reroll"><button class="pill" data-toyreroll="1"${save.gum < rr ? ' disabled' : ''}>候補を引き直す<small><img src="${cat.icons.gum}" alt="">${fmt(rr)} GUM</small></button><span>買える仕掛け ${unlocked.length} 種${left ? `・ノルマを納めるたびに 2 種ずつ入荷（あと ${left} 種）` : '（全部入荷ずみ）'}。引き直しは品ぞろえ・Limited と共有</span></div>`
        : `<p class="page-note">${unlocked.every((id) => save.toys.includes(id)) && !left ? 'すべての仕掛けを台に取り付けた！' : 'いま買える仕掛けはすべて台に付いた。次のノルマを納めると入荷する'}</p>`}
      <h3 class="page-sec">エクステンション</h3>
      <p class="page-lead">エクステンションは<b>エンブレム</b>で買う台の部品の改造（GUM の種類はスコアの効果）。枠の数まで装備でき、プレイごとに付け替え・売却（半額）できる。品ぞろえはプレイが終わるたびに入れ替わる。</p>
      <h3 class="page-sec">品ぞろえ</h3>
      <div class="shop-grid">${save.shop.map(card).join('')}</div>
      <div class="shop-reroll"><button class="pill" data-reroll="1"${save.gum < rr ? ' disabled' : ''}>品ぞろえを引き直す<small><img src="${cat.icons.gum}" alt="">${fmt(rr)} GUM</small></button><span>引き直すたびに 2 倍（Limited と共有・挑戦が終わるまで戻らない）</span></div>
      <h3 class="page-sec">装備 <small>${save.equip.length} / ${extSlots}・触ると並べかえ・外す</small></h3>
      <div class="slot-row" style="--n:${extRow}">${Array.from({ length: extRow }, (_, i) => slot(i)).join('')}</div>
      ${selSlot >= 0 && save.equip[selSlot] !== undefined ? `<div class="slot-ctl">
        <button class="pill" data-move="-1"${selSlot === 0 ? ' disabled' : ''}>◀ 左へ</button>
        <button class="pill" data-move="1"${selSlot >= save.equip.length - 1 ? ' disabled' : ''}>右へ ▶</button>
        <button class="pill" data-unequip="${save.equip[selSlot]}">外す</button></div>` : ''}
      <p class="page-note">スコアの効果（+基本額・+倍率・×倍率）は、プレイのあとの発表で <b>左から順に</b> 掛かる。装備を触ると並べかえられる。</p>
      ${inv.length ? `<h3 class="page-sec">持っているエクステンション</h3>
      <ul class="inv">${inv.map((e) => {
        const on = save.equip.includes(e.id);
        return `<li style="--c:${RARITY_COLOR[e.rarity]}"><img src="${esc(e.img)}" alt=""><div><b>${esc(e.name)} <span class="rar">${stars(e.rarity)}</span></b><small>${esc(modName(e))}：${esc(modText(e))}</small></div>
          <button class="pill${on ? '' : ' main'}" data-${on ? 'unequip' : 'equip'}="${e.id}"${!on && save.equip.length >= extSlots ? ' disabled' : ''}>${on ? '外す' : '装備'}</button>
          <button class="pill sell" data-sell="${e.id}">売る<small>+${EMB}${fmt(sellOf(e))}</small></button></li>`;
      }).join('')}</ul>` : ''}
      <h3 class="page-sec">ヒーロー <small>${save.party.length} / ${heroSlots}・先頭がリーダー（自分の球）。控えはリーダーに続いて自動で打ち出され、はじめから一緒に台に出る</small></h3>
      <div class="slot-row" style="--n:${heroRow}">${Array.from({ length: heroRow }, (_, i) => hslot(i)).join('')}</div>
      <ul class="abil">${save.party.map((id, i) => {
        const h = heroById(id);
        const a = resolveAbility(save.party.map(heroById), i);
        return `<li style="--c:${RARITY_COLOR[h.rarity]}"><img src="${esc(h.img)}" alt=""><div><b>${esc(h.name)}${i === 0 ? '<em>リーダー</em>' : ''}</b><small><span>${esc(a.name)}</span>${esc(a.text(abilityPower(h, i === 0)))}${i === 0 ? '' : '（台に出ている間）'}</small></div></li>`;
      }).join('')}</ul>
      <p class="page-note">控えを触るとリーダーと入れかわる。下の一覧を触ると、控えに入れる・外す。</p>
      <div class="hero-grid">${heroes.map((h) => `<button data-party="${h.id}" aria-pressed="${save.party.includes(h.id)}" style="--c:${RARITY_COLOR[h.rarity]}" aria-label="${esc(h.name)}"><img src="${esc(h.img)}" alt=""></button>`).join('')}</div>`;
  }

  shopEl.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    const d = t.dataset;
    const nope = (): void => { t.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 220 }); blip(160, 0.12, 'sawtooth', 0.06, 0.8); };
    if (d.buy) {
      const e = extById(Number(d.buy));
      if (!e || save.owned.includes(e.id)) return;
      const price = priceOf(e);
      if (save.emblems < price) { t.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 220 }); blip(160, 0.12, 'sawtooth', 0.06, 0.8); return; }
      save.emblems -= price;
      save.owned.push(e.id);
      if (!save.exts.includes(e.id)) save.exts.push(e.id);
      if (save.equip.length < slotsOf(save).ext) save.equip.push(e.id);
      blip(880, 0.08, 'square', 0.07, 1.6);
      setTimeout(() => blip(1320, 0.08, 'square', 0.06, 1.4), 70);
    } else if (d.equip) {
      const id = Number(d.equip);
      if (save.equip.length >= slotsOf(save).ext || save.equip.includes(id)) return;
      save.equip.push(id);
      blip(760, 0.06, 'square', 0.06, 1.4);
    } else if (d.slot) {
      const i = Number(d.slot);
      selSlot = selSlot === i ? -1 : i;
      blip(700, 0.05, 'square', 0.05, 1.3);
    } else if (d.move) {
      const j = selSlot + Number(d.move);
      if (selSlot < 0 || j < 0 || j >= save.equip.length) return;
      [save.equip[selSlot], save.equip[j]] = [save.equip[j], save.equip[selSlot]];
      selSlot = j;
      blip(820, 0.05, 'square', 0.05, 1.4);
    } else if (d.unequip) {
      save.equip = save.equip.filter((x) => x !== Number(d.unequip));
      selSlot = -1;
      blip(420, 0.06, 'square', 0.05, 1);
    } else if (d.sell) {
      const e = extById(Number(d.sell));
      if (!e) return;
      if (!t.classList.contains('armed')) { t.classList.add('armed'); t.innerHTML = `本当に<small>売る</small>`; return; }
      save.owned = save.owned.filter((x) => x !== e.id);
      save.equip = save.equip.filter((x) => x !== e.id);
      save.emblems += sellOf(e);
      blip(600, 0.08, 'triangle', 0.06, 1.2);
    } else if (d.leader) {
      const id = Number(d.leader);
      if (id === save.hero) return;
      save.party = [id, ...save.party.filter((x) => x !== id)];
      save.hero = id;
      blip(900, 0.08, 'square', 0.06, 1.4);
    } else if (d.party) {
      const id = Number(d.party);
      if (id === save.hero) return;
      if (save.party.includes(id)) save.party = save.party.filter((x) => x !== id);
      else if (save.party.length < slotsOf(save).hero) save.party.push(id);
      else return;
      blip(700, 0.05, 'square', 0.05, 1.3);
    } else if (d.slotbuy) {
      if (!buySlot(save, d.slotbuy as 'ext' | 'hero')) { nope(); return; }
      se('buff', 0.5, 0, 1.3);
      blip(990, 0.1, 'square', 0.07, 1.6);
    } else if (d.reroll) {
      if (!payReroll(save)) { nope(); return; }
      restockShop(save, true);
      blip(500, 0.1, 'sawtooth', 0.06, 2);
    } else if (d.toyreroll) {
      if (!payReroll(save)) { nope(); return; }
      restockToys(save, true);
      blip(500, 0.1, 'sawtooth', 0.06, 2);
    } else if (d.toy) {
      const id = d.toy as ToyId;
      const from = clownOf(save);
      if (!buyToy(save, id)) { nope(); return; }
      fixParty(save);
      hooks.changed();
      renderShop();
      hooks.toyBought(id, from, clownOf(save));
      return;
    } else return;
    fixParty(save);
    hooks.changed();
    renderShop();
  });

  // ---------------------------------------------------------------- ラボ
  function renderLab(): void {
    const n = hooks.affordable();
    const lim = cat.limited;
    const own = save.limited.length;
    const sel = limitedSel >= 0 ? limitedById(limitedSel) : undefined;
    const selDef = sel ? limitedOf(sel.id) : undefined;
    labEl.innerHTML = `
      <header class="page-head"><h2>ラボ</h2>${wallet()}</header>
      <div class="lab-cards">
        <button class="lab-card main" data-lab="tree"><b>スキルツリー</b><small>エンブレムで強くなる（GAME OVER でも残る）</small>${n ? `<span class="badge">${n}</span>` : ''}</button>
        <button class="lab-card" data-lab="guide"><b>台のしくみ</b><small>部品の名前と動き</small></button>
        <button class="lab-card" data-lab="settings"><b>設定</b><small>センサー・音</small></button>
      </div>
      <h3 class="page-sec">Limited <small>${own} / ${lim.length}・ノルマを納めるたびに 1 つ選べる（挑戦の間ずっと）</small></h3>
      <div class="lim-grid">${lim.map((l) => `<button data-lim="${l.id}" class="${save.limited.includes(l.id) ? 'got' : ''}${l.id === limitedSel ? ' sel' : ''}" aria-label="${save.limited.includes(l.id) ? esc(l.name) : '未入手'}"><img src="${esc(l.img)}" alt=""></button>`).join('')}</div>
      <div class="lim-detail">${sel && selDef ? (save.limited.includes(sel.id)
        ? `<b>${esc(sel.name)}</b><small>${esc(partName(selDef.part))}</small><p>${esc(selDef.text)}</p>`
        : `<b>？？？</b><small>${esc(partName(selDef.part))}</small><p>まだ持っていない Limited</p>`) : '<p>品を触ると、効き目が出ます</p>'}</div>
      <h3 class="page-sec">図鑑</h3>
      <ul class="dex">
        <li><span>エクステンション</span><b>${new Set([...save.exts, ...save.owned]).size} / ${cat.exts.length}</b></li>
        <li><span>ヒーロー</span><b>${save.heroes.length} / ${cat.heroes.length}</b></li>
        <li><span>いちばん先の台</span><b>TABLE ${Math.max(save.pinRecord, save.pinDeepest)}</b></li>
        ${save.escapes ? `<li><span>脱出した回数</span><b>${save.escapes} 回</b></li><li><span>エンドレスの記録</span><b>${save.endlessBest ? `QUOTA ${save.endlessBest}` : '—'}</b></li>` : ''}
      </ul>`;
  }
  labEl.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.lab === 'tree') hooks.tree();
    else if (t.dataset.lab === 'guide') hooks.guide();
    else if (t.dataset.lab === 'settings') hooks.settings();
    else if (t.dataset.lim) { limitedSel = Number(t.dataset.lim); blip(700, 0.04, 'square', 0.04, 1.2); renderLab(); }
  });

  // ---------------------------------------------------------------- 切りかえ（フッター・スワイプ）
  navBtns.forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.tab);
    if (i !== tab) blip(560 + i * 120, 0.05, 'square', 0.05, 1.3);
    setTab(i);
  }));
  let sx = 0;
  let sy = 0;
  let sid: number | null = null;
  track.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== sid) return;
    sid = null;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) setTab(tab + (dx < 0 ? 1 : -1));
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', () => { sid = null; });

  setTab(1, false);
  root.parentElement?.classList.add('homing');
  return {
    show(i) {
      titleSay = '';
      visible = true;
      root.hidden = false;
      root.parentElement?.classList.add('homing');
      root.classList.remove('leaving');
      setTab(i ?? tab, false);
    },
    hide() {
      visible = false;
      root.hidden = true;
      root.parentElement?.classList.remove('homing');
    },
    refresh() {
      if (!visible) return;
      titleBits();
      if (tab === 0) renderShop();
      if (tab === 2) renderLab();
    },
    get visible() { return visible; },
    get tab() { return tab; },
  };
}
