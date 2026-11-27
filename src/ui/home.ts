// 遊んでいないときの画面：下のフッターで「ショップ」「ピンボール」「ラボ」を切りかえる（ショップとラボでは左右のスワイプでも）。
// PC（device.ts の isPc）はフッターを出さず、ショップ・ピンボール・ラボを左・中・右に並べて常に見せる（ショップとラボのページを両わきの列へ移す）。
// - ショップ：人形劇の舞台（src/ui/shop.ts）。ギミック・エクステンション・ヒーローのガチャ・リロールと、装備・ヒーローの枠・マレット
// - ピンボール：本物の台がそのまま見える（ボタンは置かない）。打ち出すとプレイが始まる（main.ts）。指の動きは引っぱりなので、ここではスワイプで切りかえない
// - ラボ：スキルツリー・台のしくみ・設定・図鑑（Limited・エクステンション・ヒーロー）

import { cat, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { LIM_TYPE, SHOP_BASE, slotsOf, limitedById, limitedOf, rollShop, totalsOf } from '../game/mods';
import { FAMILY_INFO, KIND_TAG, extDef } from '../game/exts';
import { PTS_MAX, RARITY_NAME, fitSlots, gaugeOf, ptsOf, rarityOfPts, stackPreview } from '../game/stack';
export { KIND_TAG };
import { PARTS } from '../game/parts';
import { initShop } from './shop';
import { heroDexCount, restockCapsules } from '../game/gacha';

import { TOY_NAME, restockToys, type ToyId } from '../game/toys';
import { isPc, onPcChange } from './device';
import { QUOTAS } from '../game/quota';
import { help, isCalm, num, ribbon, suits, ticket } from './kit';

/** ノルマの番号の札（本編 n/10・チュートリアル・エンドレス） */
export function quotaTag(save: Save): string {
  const n = save.quota.n;
  if (save.endless) return `ENDLESS <b>${n}</b>`;
  // ノルマ 0：チュートリアル（練習のノルマ）
  if (n <= 0) return '<b>TUTORIAL</b>';
  return `QUOTA <b>${Math.min(n, QUOTAS)}</b>/${QUOTAS}`;
}

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
  /** 見えているページが変わった（切りかえ・出す・隠す・PC の並びの出入り。main.ts が打ち出し待ちの台を用意する） */
  view?(): void;
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
  /** いま選んでいる Limited は、マウスを乗せて選んだ */
  let hovered = false;
  let moveTimer = 0;
  let hideTimer = 0;

  function setTab(i: number, anim = true): void {
    const next = Math.max(0, Math.min(2, i));
    // ページ送りの間、ページが進む向きに少し傾く（切りこむ動き）
    if (anim && next !== tab && !isPc()) {
      track.dataset.move = next > tab ? 'l' : 'r';
      clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => { delete track.dataset.move; }, 260);
    }
    tab = next;
    // PC はページを並べるので、送らない
    track.style.transition = anim ? '' : 'none';
    track.style.transform = isPc() ? 'none' : `translateX(${-tab * (100 / 3)}%)`;
    navBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === tab)));
    root.dataset.tab = String(tab);
    if (tab === 0 || isPc()) renderShop();
    if (tab === 2 || isPc()) renderLab();
    navBadges();
    hooks.view?.();
  }

  /** 右上の財布：GUM（納品とリロール）とエンブレム（買い物） */
  const wallet = (): string => `<div class="pg-wallet"><div class="pg-gum"><img src="${cat.icons.gum}" alt=""><b>${fmt(save.gum)}</b></div><div class="pg-gum pg-emb">${EMB}<b>${fmt(save.emblems)}</b></div></div>`;
  // ---------------------------------------------------------------- ショップ（人形劇の舞台。src/ui/shop.ts）
  const shop = initShop(shopEl, save, { changed: () => hooks.changed(), toyBought: (id, from, to) => hooks.toyBought(id, from, to) });
  function renderShop(): void {
    shop.render();
  }

  // ---------------------------------------------------------------- ラボ
  /** Limited の説明（触った品。PC はマウスを乗せた品）。選ぶまでは何も出さない */
  function limDetail(): string {
    const sel = limitedSel >= 0 ? limitedById(limitedSel) : undefined;
    const selDef = sel ? limitedOf(sel.id) : undefined;
    if (!sel || !selDef) return '';
    return save.limited.includes(sel.id)
      ? ticket(`<b>${esc(sel.name)}</b><p class="lim-good">${esc(selDef.good)}</p>${selDef.bad ? `<p class="lim-bad">${esc(selDef.bad)}</p>` : ''}`, LIM_TYPE[selDef.type].name.slice(0, 2), 'bone')
      : ticket(`<b>？？？</b><p>${esc(partName(selDef.part))}</p>`, '?', 'bone');
  }
  const ICON_TREE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 12h4l-3 5h6v5h2v-5h6l-3-5h4z"/></svg>';
  const ICON_GUIDE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a3 3 0 0 1 3 3v17H4V5a3 3 0 0 1 3-3zm0 3v15h10V5zm5 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 15l3 3H8zm8 0v3h-3z"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.3-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  /** フッターの「ラボ」の札に、取れるスキルの数 */
  function navBadges(): void {
    const n = hooks.affordable();
    const b = navBtns[2]?.querySelector<HTMLElement>('.k-badge');
    if (b) { b.hidden = n === 0 || tab === 2; b.textContent = String(n); }
  }
  // ラボ：文は置かない。入口は絵とラベル（2 語まで）、数は数字、説明は「?」と data-tip の中
  function renderLab(): void {
    const n = hooks.affordable();
    const lim = cat.limited;
    const own = save.limited.length;
    const dex = (label: string, v: string, of: string, tip: string): string => `<li data-tip="${tip}">${label}<b>${v}${of ? `<small>/${of}</small>` : ''}</b></li>`;
    labEl.innerHTML = `
      <header class="page-head">${ribbon('ラボ', 'curse')}${suits()}${wallet()}</header>
      <div class="lab-doors">
        <button class="k-btn lab-door main${n ? ' can k-btn--go' : ''}" data-lab="tree" data-sfx="open" data-tip="4 色の枝のスキルを、エンブレムで取る。GAME OVER でも残る">${ICON_TREE}<span>スキルツリー</span>${n ? `<i class="k-badge">${n}</i>` : ''}</button>
        <button class="k-btn lab-door" data-lab="guide" data-sfx="open" data-tip="台を止めて、部品の名前・何が起きるか・付けられる改造を見る">${ICON_GUIDE}<span>台のしくみ</span></button>
        <button class="k-btn lab-door" data-lab="settings" data-sfx="open" data-tip="プレイヤー名・センサー・感度・音・演出・画質">${ICON_GEAR}<span>設定</span></button>
      </div>
      <div class="lab-sec">${ribbon('Limited', 'curse', 3)}${num(String(own), 's', own ? 'ticket' : 'bone')}<small>/ ${lim.length}</small>${help('ノルマを納めるたびに 1 つ選べる。挑戦の間ずっと効き、外せない', 'Limited')}</div>
      <div class="lab-lim">${lim.map((l) => `<button data-lim="${l.id}" class="${save.limited.includes(l.id) ? 'got' : ''}${l.id === limitedSel ? ' sel' : ''}" aria-label="${save.limited.includes(l.id) ? esc(l.name) : '未入手'}"><img src="${esc(l.img)}" alt="" loading="lazy"></button>`).join('')}</div>
      <div class="lab-limtip" aria-live="polite">${limDetail()}</div>
      <div class="lab-sec" style="margin-top:22px">${ribbon('図鑑', 'blood', 3)}</div>
      <ul class="lab-dex">
        ${dex('EXT', String(new Set([...save.exts, ...save.equip]).size), String(cat.exts.length), 'これまでに手に入れたエクステンションの種類')}
        ${dex('HERO', String(heroDexCount(save)), String(cat.heroes.length), 'これまでに手に入れたヒーロー（ショップのガチャで出る）')}
        ${dex('TABLE', String(Math.max(save.pinRecord, save.pinDeepest)), '', 'いちばん先まで進んだ台')}
        ${save.escapes ? dex('脱出', String(save.escapes), '', '脱出した回数') + dex('ENDLESS', save.endlessBest ? String(save.endlessBest) : '—', '', 'エンドレスでいちばん先まで納めたノルマ') : ''}
      </ul>`;
    navBadges();
  }
  labEl.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') hovered = false; }, true);
  labEl.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.lab === 'tree') hooks.tree();
    else if (t.dataset.lab === 'guide') hooks.guide();
    else if (t.dataset.lab === 'settings') hooks.settings();
    else if (t.dataset.lim) {
      // もう 1 回触ると閉じる
      const id = Number(t.dataset.lim);
      // マウスは乗せた時点で選ばれているので、クリックでは閉じない
      limitedSel = id === limitedSel && !hovered ? -1 : id;
      labEl.querySelectorAll('.lab-lim .sel').forEach((b) => b.classList.remove('sel'));
      if (limitedSel >= 0) t.classList.add('sel');
      const d = labEl.querySelector('.lab-limtip');
      if (d) d.innerHTML = limDetail();
    }
  });
  // PC：Limited の品はマウスを乗せるだけで説明を出す（クリックしなくてよい）
  labEl.addEventListener('pointerover', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-lim]');
    if (!t || Number(t.dataset.lim) === limitedSel) return;
    limitedSel = Number(t.dataset.lim);
    hovered = true;
    labEl.querySelectorAll('.lab-lim .sel').forEach((b) => b.classList.remove('sel'));
    t.classList.add('sel');
    const d = labEl.querySelector('.lab-limtip');
    if (d) d.innerHTML = limDetail();
  });

  // ---------------------------------------------------------------- 切りかえ（フッター・スワイプ）
  navBtns.forEach((b) => b.addEventListener('click', () => {
    setTab(Number(b.dataset.tab));
  }));
  // 左右のスワイプはショップとラボのページだけ（ピンボールのページでは、指の動きは打ち出しの引っぱり）
  let sx = 0;
  let sy = 0;
  let sid: number | null = null;
  const swipeOk = (e: PointerEvent): boolean => !isPc() && tab !== 1 && e.pointerType !== 'mouse' && !!(e.target as HTMLElement).closest?.('.page-shop, .page-lab');
  track.addEventListener('pointerdown', (e) => { if (!swipeOk(e)) { sid = null; return; } sid = e.pointerId; sx = e.clientX; sy = e.clientY; });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== sid) return;
    sid = null;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) setTab(tab + (dx < 0 ? 1 : -1));
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', () => { sid = null; });
  // 横にはスクロールさせない（はみ出した飾りがあっても、ページがずれないように）
  for (const el of [root, track, ...track.querySelectorAll<HTMLElement>('.page')]) {
    el.addEventListener('scroll', () => { if (el.scrollLeft) el.scrollLeft = 0; }, { passive: true });
  }

  // ---------------------------------------------------------------- PC：3 画面を並べる（ショップとラボのページを両わきの列へ移す）
  const pinEl = root.querySelector('#pagePin') as HTMLElement;
  const sideL = document.createElement('aside');
  sideL.className = 'pc-side pc-left';
  sideL.setAttribute('aria-label', 'ショップ');
  const sideR = document.createElement('aside');
  sideR.className = 'pc-side pc-right';
  sideR.setAttribute('aria-label', 'ラボ');
  function arrange(pc: boolean): void {
    if (pc) {
      if (!sideL.isConnected) document.body.append(sideL, sideR);
      sideL.append(shopEl);
      sideR.append(labEl);
    } else {
      track.insertBefore(shopEl, pinEl);
      track.append(labEl);
      sideL.remove();
      sideR.remove();
    }
    setTab(pc ? 1 : tab, false);
  }
  onPcChange(arrange);
  // PC：ショップで買うと、ラボの財布やバッジも描き直す
  shopEl.addEventListener('click', () => { if (isPc() && visible) queueMicrotask(renderLab); });

  if (isPc()) arrange(true);
  else setTab(1, false);
  root.parentElement?.classList.add('homing');
  return {
    show(i) {
      visible = true;
      clearTimeout(hideTimer);
      root.classList.remove('is-leaving');
      root.hidden = false;
      root.parentElement?.classList.add('homing');
      root.classList.remove('leaving');
      setTab(i ?? tab, false);
    },
    hide() {
      visible = false;
      // フッターのチケットが下へ引っこむ（300ms）。その間は触れない
      clearTimeout(hideTimer);
      if (isCalm() || isPc() || root.hidden) root.hidden = true;
      else {
        root.classList.add('is-leaving');
        hideTimer = window.setTimeout(() => { root.hidden = true; root.classList.remove('is-leaving'); }, 300);
      }
      root.parentElement?.classList.remove('homing');
      hooks.view?.();
    },
    refresh() {
      if (!visible) return;
      if (tab === 0 || isPc()) renderShop();
      if (tab === 2 || isPc()) renderLab();
    },
    get visible() { return visible; },
    get tab() { return tab; },
  };
}
