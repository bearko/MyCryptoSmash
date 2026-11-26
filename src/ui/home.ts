// 遊んでいないときの画面：下のフッターで「ショップ」「ピンボール」「ラボ」を切りかえる（左右のスワイプでも）。
// - ショップ：人形劇の舞台（src/ui/shop.ts）。ギミック・エクステンション・ヒーローのガチャ・リロールと、装備・ヒーローの枠・マレット
// - ピンボール：タイトル（はじめる）。うしろに台が見える
// - ラボ：スキルツリー・台のしくみ・設定・図鑑（Limited・エクステンション・ヒーロー）

import { cat, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip } from '../core/audio';
import { LIM_TYPE, SHOP_BASE, slotsOf, limitedById, limitedOf, rollShop, totalsOf } from '../game/mods';
import { FAMILY_INFO, KIND_TAG, extDef } from '../game/exts';
import { PTS_MAX, RARITY_NAME, fitSlots, gaugeOf, ptsOf, rarityOfPts, stackPreview } from '../game/stack';
export { KIND_TAG };
import { PARTS } from '../game/parts';
import { initShop } from './shop';
import { heroDexCount, restockCapsules } from '../game/gacha';

import { TOY_NAME, clownOf, restockToys, type ToyId } from '../game/toys';
import { clownPanel } from './gimmick';
import { clownLine, finalLine } from '../game/clown-lines';
import { FINAL_FLOORS, FINAL_TIME } from '../game/final';
import { startTalk } from './talk';
import { FINAL_TRIES, QUOTAS, QUOTA_PLAYS, SLOTS_MAX, quotaStatus } from '../game/quota';

/** ノルマの番号の札（本編 n/10・エンドレス） */
export function quotaTag(save: Save): string {
  const n = save.quota.n;
  if (save.endless) return `ENDLESS <b>${n}</b>`;
  return `QUOTA <b>${Math.min(n, QUOTAS)}</b>/${QUOTAS}`;
}

/** ヒーローの枠のいちばん多い数 */
export const PARTY_SLOTS = SLOTS_MAX;
/** エンブレムの印（CSS の .emb） */
export const EMB = '<i class="emb"></i>';
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const partName = (id: string): string => PARTS.find((p) => p.id === id)?.name ?? '';
/** いまの値引き（エクステンションとギミック。「値切りの巻物」） */
export const discountOf = (save: Save): number => totalsOf(save.equip ?? [], save.limited ?? []).shopDiscount;
/** エクステンションの札の頭：系統の札・種類の札・壊れもの・育ち・要る仕掛け */
export function extTags(e: Ext, save: Save, small = false): string {
  const d = extDef(e);
  if (!d) return '';
  const fam = FAMILY_INFO[d.fam];
  const g = save.extGrow?.[e.id] ?? 0;
  const tags = [
    `<small class="fam" style="--f:${fam.color}">${esc(fam.name)}</small>`,
    small ? '' : `<small class="sk ${d.kind}">${KIND_TAG[d.kind]}</small>`,
    d.fragile ? `<small class="tg frag">壊れもの ${Math.round(d.fragile * 100)}%</small>` : '',
    d.grow || d.series === 92 ? `<small class="tg grow">育つ${g ? ` ${g}` : ''}</small>` : '',
    d.toy && !save.toys.includes(d.toy) ? `<small class="tg need">${small ? '要' : 'この仕掛けが要る：'}${esc(TOY_NAME[d.toy])}</small>` : '',
  ];
  return tags.filter(Boolean).join('');
}
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

/** 品ぞろえを決める（足りなければ・プレイが終わったら）。装備と同じシリーズ（重ねられる品）は並びやすい */
export function restockShop(save: Save, force = false, rnd: () => number = Math.random): void {
  const t = totalsOf(save.equip, save.limited);
  const n = Math.max(3, SHOP_BASE + t.shopSlots);
  if (!force && save.shop.length >= n) return;
  save.shop = rollShop(save.pinDeepest, n, rnd, {
    quota: save.quota.n, toys: save.toys, ahead: t.shopAhead, equip: save.equip,
    maxed: save.equip.filter((id) => ptsOf(save, id) >= PTS_MAX), stock: save.up?.y_stock ?? 0,
  });
}
/** ショップの品ぞろえ・ギミックの候補・ガチャのカプセルを、全部引き直す（プレイが終わるたび） */
export function restockAll(save: Save): void {
  restockShop(save, true);
  restockToys(save, true);
  restockCapsules(save, true);
}
/** ヒーローの装備を正しく（先頭はリーダー、持っているヒーローだけ、5 人まで） */
export function fixParty(save: Save): void {
  const p = [save.hero, ...save.party.filter((id) => id !== save.hero && save.heroes.includes(id))];
  const sl = slotsOf(save);
  save.party = [...new Set(p)].slice(0, Math.max(1, sl.hero));
  // 枠が減ってはみ出した装備は、右から売る（持ち物の一覧はない）
  if (save.equip.length > sl.ext) fitSlots(save, sl.ext, totalsOf([], save.limited ?? []).sellFull > 0);
}
/** 札の重ねの見こみ：「重ねると ○○ に（＋点）」・ゲージ・あふれ */
export function stackTag(save: Save, id: number): string {
  const st = stackPreview(save, id);
  if (!st) return '';
  const r = rarityOfPts(st.pts);
  if (st.overflow > 0 && st.add === st.overflow) return `<span class="stack-tag max">レジェンダリー済み：重ねると エンブレム +${st.overflow}</span>`;
  const g = gaugeOf(st.pts);
  const rest = g.hi === null ? '' : `・${RARITY_NAME[r]}まで あと ${g.need}`;
  return st.evolve
    ? `<span class="stack-tag up">重ねると <b>${RARITY_NAME[r - 1]}</b> に（+${st.add} 点${st.overflow ? `・あふれ +${st.overflow}${EMB}` : ''}）</span>`
    : `<span class="stack-tag">重ねると +${st.add} 点（${RARITY_NAME[r - 1]} ${st.pts}/${g.hi ?? PTS_MAX}${rest}）</span>`;
}
/** ★のゲージ（装備の枠の札・ショップ） */
export function gaugeHtml(save: Save, id: number): string {
  const p = ptsOf(save, id);
  const g = gaugeOf(p);
  return `<i class="slot-gauge${g.hi === null ? ' max' : ''}" style="--g:${g.frac.toFixed(3)}" title="${RARITY_NAME[g.r - 1]} ${p} 点"><b></b><span>${g.hi === null ? 'MAX' : `${p}/${g.hi}`}</span></i>`;
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

  // ---------------------------------------------------------------- ショップ（人形劇の舞台。src/ui/shop.ts）
  const shop = initShop(shopEl, save, { changed: () => hooks.changed(), toyBought: (id, from, to) => hooks.toyBought(id, from, to) });
  function renderShop(): void {
    shop.render();
  }

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
        ? `<b>${esc(sel.name)}</b><small style="color:${LIM_TYPE[selDef.type].color}">${esc(LIM_TYPE[selDef.type].name)}</small><p class="lim-good">${esc(selDef.good)}</p>${selDef.bad ? `<p class="lim-bad">${esc(selDef.bad)}</p>` : ''}`
        : `<b>？？？</b><small>${esc(partName(selDef.part))}</small><p>まだ持っていない Limited</p>`) : '<p>品を触ると、効き目が出ます</p>'}</div>
      <h3 class="page-sec">図鑑</h3>
      <ul class="dex">
        <li><span>エクステンション</span><b>${new Set([...save.exts, ...save.equip]).size} / ${cat.exts.length}</b></li>
        <li><span>ヒーロー</span><b>${heroDexCount(save)} / ${cat.heroes.length}</b></li>
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
