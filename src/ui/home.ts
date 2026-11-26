// 遊んでいないときの画面：下のフッターで「ショップ」「ピンボール」「ラボ」を切りかえる（左右のスワイプでも）。
// - ショップ：エクステンションを買う・売る。装備 5 枠（台に付く）とヒーロー 5 枠（先頭がリーダー＝自分の球）
// - ピンボール：タイトル（はじめる）。うしろに台が見える
// - ラボ：スキルツリー・台のしくみ・設定・図鑑（Limited・エクステンション・ヒーロー）

import { cat, heroById, RARITY_COLOR, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip } from '../core/audio';
import { EQUIP_SLOTS, SHOP_BASE, limitedById, limitedOf, modOf, modText, priceOf, rollShop, sellOf, totalsOf } from '../game/mods';
import { PARTS } from '../game/parts';
import { abilityPower, resolveAbility } from '../game/abilities';

export const PARTY_SLOTS = 5;
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
  save.shop = rollShop(save.pinDeepest, n, Math.random, save.owned);
}
/** ヒーローの装備を正しく（先頭はリーダー、持っているヒーローだけ、5 人まで） */
export function fixParty(save: Save): void {
  const p = [save.hero, ...save.party.filter((id) => id !== save.hero && save.heroes.includes(id))];
  save.party = [...new Set(p)].slice(0, PARTY_SLOTS);
  save.equip = save.equip.filter((id) => save.owned.includes(id)).slice(0, EQUIP_SLOTS);
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
    tab = Math.max(0, Math.min(2, i));
    track.style.transition = anim ? '' : 'none';
    track.style.transform = `translateX(${-tab * (100 / 3)}%)`;
    navBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === tab)));
    root.dataset.tab = String(tab);
    if (tab === 0) renderShop();
    if (tab === 2) renderLab();
  }

  // ---------------------------------------------------------------- ショップ
  function renderShop(): void {
    fixParty(save);
    restockShop(save);
    const deep = save.pinDeepest;
    const card = (id: number): string => {
      const e = extById(id);
      if (!e) return '';
      const own = save.owned.includes(id);
      const price = priceOf(e, deep);
      const d = modOf(e);
      return `<button class="ext-card${own ? ' owned' : ''}${!own && save.gum < price ? ' poor' : ''}" data-buy="${id}" style="--c:${RARITY_COLOR[e.rarity]}" ${own ? 'disabled' : ''}>
        <img src="${esc(e.img)}" alt=""><span class="rar">${stars(e.rarity)}</span>
        <b>${esc(e.name)}</b><span class="mod">${esc(d.name)}<small>${esc(partName(d.part))}</small></span>
        <span class="mod-text">${esc(modText(e))}</span>
        <em>${own ? '持っている' : `<img src="${cat.icons.gum}" alt="">${fmt(price)}`}</em></button>`;
    };
    const slot = (i: number): string => {
      const e = extById(save.equip[i]);
      if (!e) return `<div class="slot empty"><span>空き</span></div>`;
      return `<button class="slot" data-unequip="${e.id}" style="--c:${RARITY_COLOR[e.rarity]}" aria-label="${esc(e.name)} を外す"><img src="${esc(e.img)}" alt=""><span>${esc(modOf(e).name)}</span></button>`;
    };
    const inv = save.owned.map(extById).filter((e): e is Ext => !!e).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    const hslot = (i: number): string => {
      const id = save.party[i];
      if (id === undefined) return `<div class="slot hero empty"><span>空き</span></div>`;
      const h = heroById(id);
      return `<button class="slot hero${i === 0 ? ' leader' : ''}" data-leader="${id}" style="--c:${RARITY_COLOR[h.rarity]}" aria-label="${esc(h.name)}${i ? ' をリーダーにする' : '（リーダー）'}"><img src="${esc(h.img)}" alt=""><span>${i === 0 ? 'リーダー' : esc(h.name)}</span></button>`;
    };
    const heroes = save.heroes.map(heroById).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    shopEl.innerHTML = `
      <header class="page-head"><h2>ショップ</h2><div class="pg-gum"><img src="${cat.icons.gum}" alt=""><b>${fmt(save.gum)}</b></div></header>
      <p class="page-lead">エクステンションは台の部品の改造。5 つまで装備でき、プレイごとに付け替え・売却できる。品ぞろえはプレイが終わるたびに入れ替わる。</p>
      <h3 class="page-sec">品ぞろえ</h3>
      <div class="shop-grid">${save.shop.map(card).join('')}</div>
      <h3 class="page-sec">装備 <small>${save.equip.length} / ${EQUIP_SLOTS}・触ると外す</small></h3>
      <div class="slot-row">${Array.from({ length: EQUIP_SLOTS }, (_, i) => slot(i)).join('')}</div>
      ${inv.length ? `<h3 class="page-sec">持っているエクステンション</h3>
      <ul class="inv">${inv.map((e) => {
        const on = save.equip.includes(e.id);
        return `<li style="--c:${RARITY_COLOR[e.rarity]}"><img src="${esc(e.img)}" alt=""><div><b>${esc(e.name)} <span class="rar">${stars(e.rarity)}</span></b><small>${esc(modOf(e).name)}：${esc(modText(e))}</small></div>
          <button class="pill${on ? '' : ' main'}" data-${on ? 'unequip' : 'equip'}="${e.id}"${!on && save.equip.length >= EQUIP_SLOTS ? ' disabled' : ''}>${on ? '外す' : '装備'}</button>
          <button class="pill sell" data-sell="${e.id}">売る<small>+${fmt(sellOf(e, deep))}</small></button></li>`;
      }).join('')}</ul>` : ''}
      <h3 class="page-sec">ヒーロー <small>先頭がリーダー（自分の球）。マルチボールでは控えが順に出る</small></h3>
      <div class="slot-row">${Array.from({ length: PARTY_SLOTS }, (_, i) => hslot(i)).join('')}</div>
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
    const deep = save.pinDeepest;
    const d = t.dataset;
    if (d.buy) {
      const e = extById(Number(d.buy));
      if (!e || save.owned.includes(e.id)) return;
      const price = priceOf(e, deep);
      if (save.gum < price) { t.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 220 }); blip(160, 0.12, 'sawtooth', 0.06, 0.8); return; }
      save.gum -= price;
      save.owned.push(e.id);
      if (!save.exts.includes(e.id)) save.exts.push(e.id);
      if (save.equip.length < EQUIP_SLOTS) save.equip.push(e.id);
      blip(880, 0.08, 'square', 0.07, 1.6);
      setTimeout(() => blip(1320, 0.08, 'square', 0.06, 1.4), 70);
    } else if (d.equip) {
      const id = Number(d.equip);
      if (save.equip.length >= EQUIP_SLOTS || save.equip.includes(id)) return;
      save.equip.push(id);
      blip(760, 0.06, 'square', 0.06, 1.4);
    } else if (d.unequip) {
      save.equip = save.equip.filter((x) => x !== Number(d.unequip));
      blip(420, 0.06, 'square', 0.05, 1);
    } else if (d.sell) {
      const e = extById(Number(d.sell));
      if (!e) return;
      if (!t.classList.contains('armed')) { t.classList.add('armed'); t.innerHTML = `本当に<small>売る</small>`; return; }
      save.owned = save.owned.filter((x) => x !== e.id);
      save.equip = save.equip.filter((x) => x !== e.id);
      save.gum += sellOf(e, deep);
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
      else if (save.party.length < PARTY_SLOTS) save.party.push(id);
      else return;
      blip(700, 0.05, 'square', 0.05, 1.3);
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
      <header class="page-head"><h2>ラボ</h2><div class="pg-gum"><img src="${cat.icons.gum}" alt=""><b>${fmt(save.gum)}</b></div></header>
      <div class="lab-cards">
        <button class="lab-card main" data-lab="tree"><b>スキルツリー</b><small>GUM で強くなる</small>${n ? `<span class="badge">${n}</span>` : ''}</button>
        <button class="lab-card" data-lab="guide"><b>台のしくみ</b><small>部品の名前と動き</small></button>
        <button class="lab-card" data-lab="settings"><b>設定</b><small>センサー・音</small></button>
      </div>
      <h3 class="page-sec">Limited <small>${own} / ${lim.length}・台を突破するたびに 1 つ選べる（永続）</small></h3>
      <div class="lim-grid">${lim.map((l) => `<button data-lim="${l.id}" class="${save.limited.includes(l.id) ? 'got' : ''}${l.id === limitedSel ? ' sel' : ''}" aria-label="${save.limited.includes(l.id) ? esc(l.name) : '未入手'}"><img src="${esc(l.img)}" alt=""></button>`).join('')}</div>
      <div class="lim-detail">${sel && selDef ? (save.limited.includes(sel.id)
        ? `<b>${esc(sel.name)}</b><small>${esc(partName(selDef.part))}</small><p>${esc(selDef.text)}</p>`
        : `<b>？？？</b><small>${esc(partName(selDef.part))}</small><p>まだ持っていない Limited</p>`) : '<p>品を触ると、効き目が出ます</p>'}</div>
      <h3 class="page-sec">図鑑</h3>
      <ul class="dex">
        <li><span>エクステンション</span><b>${new Set([...save.exts, ...save.owned]).size} / ${cat.exts.length}</b></li>
        <li><span>ヒーロー</span><b>${save.heroes.length} / ${cat.heroes.length}</b></li>
        <li><span>いちばん先の台</span><b>TABLE ${save.pinDeepest}</b></li>
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
      if (tab === 0) renderShop();
      if (tab === 2) renderLab();
    },
    get visible() { return visible; },
    get tab() { return tab; },
  };
}
