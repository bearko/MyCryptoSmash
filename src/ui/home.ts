// 遊んでいないときの画面：下のフッターで「ショップ」「ピンボール」「ラボ」を切りかえる（ショップとラボでは左右のスワイプでも）。
// PC（device.ts の isPc）はフッターを出さず、ショップ・ピンボール・ラボを左・中・右に並べて常に見せる（ショップとラボのページを両わきの列へ移す）。
// - ショップ：ギミック（台の大きな仕掛け）をエンブレムで買い足す（買うほど台に宿るピエロの姿が上がる）。
//   エクステンションをエンブレムで買う・売る。持てるのは装備の枠の分だけ（持ち物の一覧はない）。同じシリーズは重ねて★を上げる（stack.ts）。
//   枠がいっぱいなら、入れかえる品を選んで売る。装備の枠（3〜。台に付く）とヒーローの枠（1〜5。先頭がリーダー＝自分の球）。
//   枠はエンブレムで広げられる。マレットを鍛える（基礎ポイント）。品ぞろえは GUM で引き直せる（Limited の引き直しと回数を共有）
// - ピンボール：本物の台がそのまま見える（ボタンは置かない）。打ち出すとプレイが始まる（main.ts）。指の動きは引っぱりなので、ここではスワイプで切りかえない
// - ラボ：スキルツリー・台のしくみ・設定・図鑑（Limited・エクステンション・ヒーロー）

import { cat, heroById, RARITY_COLOR, type Ext } from '../core/catalog';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { blip, se } from '../core/audio';
import { EXT_SLOTS_CAP, LIM_TYPE, SHOP_BASE, SLOTS_CAP, slotsOf, limitedById, limitedOf, priceOf, rollShop, totalsOf } from '../game/mods';
import { FAMILY_INFO, KIND_TAG, extDef, extName, extText } from '../game/exts';
import { PTS_MAX, RARITY_NAME, buyExt, fitSlots, gaugeOf, ptsOf, rarityOfPts, sellExt, sellPrice, seriesOf, stackPreview, type BuyResult } from '../game/stack';
import { showExtEvolve, showMalletUp } from './levelup';
export { KIND_TAG };
import { PARTS } from '../game/parts';
import { abilityPower, resolveAbility } from '../game/abilities';

import { TOY_NAME, TOY_PRICE, TOY_SHORT, TOY_UNLOCK, buyToy, clownOf, restockToys, toysUnlocked, type ToyId } from '../game/toys';
import { clownPanel, toyCardArt } from './gimmick';
import { FINAL_FLOORS, FINAL_TIME } from '../game/final';
import { isPc, onPcChange } from './device';
import { EXT_SLOT_PRICE, FINAL_TRIES, HERO_SLOT_PRICE, MALLET_MAX, QUOTAS, QUOTA_PLAYS, SLOTS_MAX, buyMallet, buySlot, malletLv, malletPoints, malletPrice, malletPts, payReroll, quotaStatus, rerollPrice } from '../game/quota';

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
const extById = (id: number): Ext | undefined => cat.exts.find((e) => e.id === id);
const stars = (r: number): string => '★'.repeat(r);
/** 倍率の数字（小数 1 けたまで） */
const kfmt = (k: number): string => (k < 10 ? (Math.round(k * 10) / 10).toString() : fmt(Math.round(k)));
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
    tab = next;
    // PC はページを並べるので、送らない
    track.style.transition = anim ? '' : 'none';
    track.style.transform = isPc() ? 'none' : `translateX(${-tab * (100 / 3)}%)`;
    navBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === tab)));
    root.dataset.tab = String(tab);
    if (tab === 0 || isPc()) renderShop();
    if (tab === 2 || isPc()) renderLab();
    hooks.view?.();
  }

  /** 右上の財布：GUM（納品とリロール）とエンブレム（買い物） */
  const wallet = (): string => `<div class="pg-wallet"><div class="pg-gum"><img src="${cat.icons.gum}" alt=""><b>${fmt(save.gum)}</b></div><div class="pg-gum pg-emb">${EMB}<b>${fmt(save.emblems)}</b></div></div>`;
  /** いまのノルマ（入金口） */
  const quotaLine = (): string => {
    const st = quotaStatus(save.quota, save.gum);
    if (st.final) return `<div class="quota-line final"><span>LAST STAGE</span><span>ボス <b>${FINAL_FLOORS.length}</b> 体・<b>${FINAL_TIME}</b> 秒</span><span>のこり <b>${st.left}</b>/${FINAL_TRIES} 回</span></div>`;
    return `<div class="quota-line${st.canPay ? ' ok' : ''}${save.endless ? ' endless' : ''}"><span>${quotaTag(save)}</span><span>納品 <b>${fmt(st.need)}</b> GUM</span><span>のこり <b>${st.left}</b>/${QUOTA_PLAYS} プレイ</span></div>`;
  };

  // ---------------------------------------------------------------- ショップ
  /** 並べかえる・売る装備（選んでいる枠）と、入れかえて買う札（枠がいっぱいのとき） */
  let selSlot = -1;
  let swapFor = -1;
  let sellArmed = false;
  function renderShop(): void {
    fixParty(save);
    restockShop(save);
    const sl = slotsOf(save);
    const extSlots = sl.ext;
    const heroSlots = sl.hero;
    if (swapFor >= 0 && (!save.shop.includes(swapFor) || stackPreview(save, swapFor) || save.equip.length < extSlots)) swapFor = -1;
    // 枠を広げる札：ショップで広げた数（Limited と枠を広げる品の枠はその先に足される）
    const extBuyAt = extSlots;
    const heroBuyAt = heroSlots;
    const extRow = Math.max(SLOTS_MAX, Math.min(EXT_SLOTS_CAP, extSlots + (save.extSlots < SLOTS_MAX ? 1 : 0)));
    const heroRow = Math.max(SLOTS_MAX, Math.min(SLOTS_CAP, heroSlots));
    const disc = discountOf(save);
    const full = save.equip.length >= extSlots;
    const sellFull = totalsOf([], save.limited).sellFull > 0;
    const card = (id: number, i: number): string => {
      // 買った札は「売り切れ」で残す（品ぞろえは次のプレイまで入れ替わらない）
      if (id < 0) {
        const g = extById(-id);
        return g ? `<button class="ext-card sold" style="--c:${RARITY_COLOR[g.rarity]};--d:${i * 0.05}s" disabled><img src="${esc(g.img)}" alt=""><b>${esc(g.name)}</b><em>SOLD</em></button>` : '';
      }
      const e = extById(id);
      if (!e) return '';
      const price = priceOf(e, disc);
      const d = extDef(e);
      const need = !!d?.toy && !save.toys.includes(d.toy);
      const st = stackPreview(save, id);
      const swap = !st && full;
      return `<button class="ext-card${save.emblems < price ? ' poor' : ''}${need ? ' need' : ''}${st ? ' stack' : ''}${st?.evolve ? ' evolve' : ''}${id === swapFor ? ' swapping' : ''}" data-buy="${id}" style="--c:${RARITY_COLOR[e.rarity]};--f:${d ? FAMILY_INFO[d.fam].color : '#fff'};--d:${i * 0.05}s">
        <img src="${esc(e.img)}" alt=""><span class="rar">${stars(e.rarity)}<small>${RARITY_NAME[e.rarity - 1]}</small></span>
        <b>${esc(e.name)}</b><span class="mod">${esc(extName(e))}</span>
        <span class="tags">${extTags(e, save)}</span>
        ${st ? stackTag(save, id) : ''}
        <span class="mod-text">${esc(extText(e))}</span>
        <em>${EMB}${fmt(price)}${st ? '<small>重ねる</small>' : swap ? '<small>入れかえ</small>' : ''}</em></button>`;
    };
    /** 入れかえでこの品を売ると、枠が減って右からはみ出す品の数（枠を広げる品） */
    const swapSpill = (id: number): number => Math.max(0, save.equip.length - slotsOf({ ...save, equip: save.equip.map((x) => (x === id ? swapFor : x)) }).ext);
    const slot = (i: number): string => {
      const e = extById(save.equip[i]);
      if (i >= extSlots) {
        const can = i === extBuyAt && save.extSlots < SLOTS_MAX;
        return `<button class="slot locked" data-slotbuy="ext"${!can || save.emblems < EXT_SLOT_PRICE ? ' disabled' : ''} aria-label="枠を広げる"><span>${can ? `枠 +1<small>${EMB}${EXT_SLOT_PRICE}</small>` : 'LOCK'}</span></button>`;
      }
      if (!e) return `<div class="slot empty"><span>空き</span></div>`;
      const d = extDef(e);
      const g = save.extGrow?.[e.id] ?? 0;
      const need = !!d?.toy && !save.toys.includes(d.toy);
      const swapping = swapFor >= 0;
      return `<button class="slot${i === selSlot && !swapping ? ' sel' : ''}${need ? ' need' : ''}${swapping ? ' swap' : ''}" data-slot="${i}" style="--c:${RARITY_COLOR[e.rarity]};--f:${d ? FAMILY_INFO[d.fam].color : '#fff'}" aria-label="${esc(e.name)}（${i + 1} 番目）"><i class="slot-no">${i + 1}</i><img src="${esc(e.img)}" alt="">${d ? `<small class="sk ${d.kind}">${KIND_TAG[d.kind]}</small>` : ''}${d?.fragile ? '<i class="slot-frag" aria-label="壊れもの"></i>' : ''}${g ? `<i class="slot-grow">${g}</i>` : ''}<span>${esc(extName(e))}</span>${gaugeHtml(save, e.id)}${swapping ? `<i class="slot-sell${swapSpill(e.id) ? ' spill' : ''}">売る +${sellPrice(save, e.id, sellFull)}${swapSpill(e.id) ? `・枠 −${swapSpill(e.id)}` : ''}</i>` : ''}<i class="slot-fam"></i></button>`;
    };
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
    const rr = rerollPrice(save);
    const rrOk = Number.isFinite(rr);
    const rrText = rrOk ? `<img src="${cat.icons.gum}" alt="">${fmt(rr)} GUM` : '引き直しできない';
    restockToys(save);
    const unlocked = toysUnlocked(save.quota.n);
    const toyCard = (id: ToyId, i: number): string => {
      const own = save.toys.includes(id);
      const price = Math.max(1, TOY_PRICE[id] - discountOf(save));
      return `<button class="toy-card${own ? ' owned' : ''}${!own && save.emblems < price ? ' poor' : ''}" data-toy="${id}" style="--d:${i * 0.06}s" ${own ? 'disabled' : ''}>
        <img src="${esc(toyCardArt(id))}" alt=""><b>${esc(TOY_NAME[id])}</b>
        <span class="mod-text">${esc(TOY_SHORT[id])}</span>
        <em>${own ? '台に付いた' : `${EMB}${fmt(price)}`}</em></button>`;
    };
    const left = TOY_UNLOCK.length - unlocked.length;
    const toyCands = save.toyShop.filter((id) => unlocked.includes(id));
    // マレット（基礎ポイント）
    const lv = malletLv(save);
    const mp = Math.max(1, malletPrice(lv) - disc);
    const maxed = lv >= MALLET_MAX;
    const lead = heroById(save.hero);
    const malletBox = `<div class="mallet" style="--c:${RARITY_COLOR[lead.rarity]}">
        <div class="mallet-art"><img src="${esc(lead.img)}" alt=""><i>Lv</i><b>${lv}</b></div>
        <div class="mallet-txt"><small>マレットのレベル（全部の球）</small><b>基礎ポイント <em>${fmt(malletPoints(lv))}</em>${maxed ? '' : ` <span>→ ${fmt(malletPoints(lv + 1))}</span>`}</b><span>GUM の基本額 ×${kfmt(malletPts(lv))}${maxed ? '' : ` → ×${kfmt(malletPts(lv + 1))}`}（全部の球。GAME OVER で Lv 1 に戻る）</span></div>
        <button class="pill main mallet-up${!maxed && save.emblems < mp ? ' poor' : ''}" data-mallet="1"${maxed ? ' disabled' : ''}>${maxed ? 'MAX' : `鍛える<small>${EMB}${mp}</small>`}</button>
      </div>`;
    const swapCard = swapFor >= 0 ? extById(swapFor) : undefined;
    const sel = selSlot >= 0 ? save.equip[selSlot] : undefined;
    // 売ると枠が減ってはみ出す品の数（枠を広げる品）
    const spill = sel === undefined ? 0 : Math.max(0, save.equip.length - 1 - slotsOf({ ...save, equip: save.equip.filter((x) => x !== sel) }).ext);
    shopEl.innerHTML = `
      <header class="page-head"><h2>ショップ</h2>${wallet()}</header>
      ${quotaLine()}
      <h3 class="page-sec">ギミック <small>台の仕掛け ${save.toys.length} / ${TOY_UNLOCK.length}・買うほど台がにぎやかに</small></h3>
      ${clownPanel(save.toys.length)}
      ${toyCands.length ? `<div class="toy-grid">${toyCands.map(toyCard).join('')}</div>
      <div class="shop-reroll"><button class="pill" data-toyreroll="1"${save.gum < rr ? ' disabled' : ''}>候補を引き直す<small>${rrText}</small></button><span>買える仕掛け ${unlocked.length} 種${left ? `・ノルマを納めるたびに 2 種ずつ入荷（あと ${left} 種）` : '（全部入荷ずみ）'}。引き直しは品ぞろえ・Limited と共有</span></div>`
        : `<p class="page-note">${unlocked.every((id) => save.toys.includes(id)) && !left ? 'すべての仕掛けを台に取り付けた！' : 'いま買える仕掛けはすべて台に付いた。次のノルマを納めると入荷する'}</p>`}
      <h3 class="page-sec">マレット</h3>
      ${malletBox}
      <h3 class="page-sec">エクステンション</h3>
      <p class="page-lead">エクステンションは<b>エンブレム</b>で買う、スコアの効果。持てるのは<b>装備の枠の分だけ</b>（買うと装備に付く）。<b>同じシリーズを買うと重なって点が合計され</b>、点でレアリティが上がる（コモン 1・アンコモン 2・レア 3・エピック 5・レジェンダリー 10 点）。エピックから効き目が大きく跳ねる。</p>
      <h3 class="page-sec">品ぞろえ</h3>
      <div class="shop-grid">${save.shop.map(card).join('')}</div>
      <div class="shop-reroll"><button class="pill" data-reroll="1"${save.gum < rr ? ' disabled' : ''}>品ぞろえを引き直す<small>${rrText}</small></button><span>引き直すたびに 2 倍（Limited と共有・挑戦が終わるまで戻らない）</span></div>
      <h3 class="page-sec">装備 <small>${save.equip.length} / ${extSlots}・触ると並べかえ・売る</small></h3>
      ${swapCard ? `<div class="swap-bar"><span><b>${esc(swapCard.name)}</b>（${EMB}${fmt(priceOf(swapCard, disc))}）を買う：入れかえる品を、下の装備から選ぶ（その品を売って入れかわる）</span><button class="pill" data-swapcancel="1">やめる</button></div>` : ''}
      <div class="slot-row${extRow > 6 ? ' two' : ''}" style="--n:${extRow}">${Array.from({ length: extRow }, (_, i) => slot(i)).join('')}</div>
      ${sel !== undefined && swapFor < 0 ? `<div class="slot-ctl">
        <button class="pill" data-move="-1"${selSlot === 0 ? ' disabled' : ''}>◀ 左へ</button>
        <button class="pill" data-move="1"${selSlot >= save.equip.length - 1 ? ' disabled' : ''}>右へ ▶</button>
        <button class="pill sell${sellArmed ? ' armed' : ''}" data-sell="${sel}">${sellArmed ? `本当に売る${spill ? `<small>はみ出す ${spill} 品も売る</small>` : ''}` : `売る<small>+${EMB}${fmt(sellPrice(save, sel, sellFull))}</small>`}</button></div>
        <p class="slot-info">${esc(extById(sel)?.name ?? '')}：${esc(extText(extById(sel)!))}</p>` : ''}
      <p class="page-note">効果（+基本額・行 ×・+倍率・×倍率）は、プレイのあとの発表で <b>左から順に</b> 掛かる。+倍率 → ×倍率 の順に並べると大きい。装備を触ると並べかえ・売却（売値は買値の半分）。</p>
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

  /** 買ったあと：重ねてレアリティが上がったら進化の演出 */
  function afterBuy(r: BuyResult): void {
    if (!r.ok) return;
    if (r.kind === 'stack' && r.stack.evolve) {
      const from = extById(r.stack.from);
      const to = extById(r.stack.to);
      if (from && to) showExtEvolve(document.getElementById('app') ?? document.body, from, to, ptsOf(save, to.id), () => renderShop());
    }
  }

  shopEl.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button');
    if (!t) return;
    const d = t.dataset;
    const nope = (): void => { t.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 220 }); blip(160, 0.12, 'sawtooth', 0.06, 0.8); };
    const fullSell = totalsOf([], save.limited).sellFull > 0;
    if (!d.sell) sellArmed = false;
    if (d.buy) {
      const e = extById(Number(d.buy));
      if (!e) return;
      const price = priceOf(e, discountOf(save));
      const slots = slotsOf(save).ext;
      // 枠がいっぱいで重ねられない：入れかえる品を選ぶ
      if (!stackPreview(save, e.id) && save.equip.length >= slots) {
        swapFor = swapFor === e.id ? -1 : e.id;
        selSlot = -1;
        blip(swapFor >= 0 ? 760 : 420, 0.06, 'square', 0.05, 1.3);
        renderShop();
        // 装備の枠が見えるところまで（縦だけ）スクロールする
        const row = shopEl.querySelector<HTMLElement>('.swap-bar');
        if (swapFor >= 0 && row) shopEl.scrollTo({ top: shopEl.scrollTop + row.getBoundingClientRect().top - shopEl.getBoundingClientRect().top - shopEl.clientHeight * 0.3, behavior: 'smooth' });
        return;
      }
      const r = buyExt(save, e.id, { price, slots });
      if (!r.ok) { nope(); return; }
      save.shop = save.shop.map((x) => (x === e.id ? -x : x));
      swapFor = -1;
      blip(880, 0.08, 'square', 0.07, 1.6);
      setTimeout(() => blip(1320, 0.08, 'square', 0.06, 1.4), 70);
      if (r.kind === 'stack') setTimeout(() => blip(1760, 0.1, 'square', 0.06, 1.6), 140);
      fixParty(save);
      hooks.changed();
      renderShop();
      afterBuy(r);
      return;
    } else if (d.swapcancel) {
      swapFor = -1;
      blip(420, 0.06, 'square', 0.05, 1);
    } else if (d.slot) {
      const i = Number(d.slot);
      if (swapFor >= 0) {
        // 入れかえ：選んだ品を売って、札の品をその場所に
        const e = extById(swapFor);
        const old = save.equip[i];
        if (!e || old === undefined) return;
        const r = buyExt(save, e.id, { price: priceOf(e, discountOf(save)), slots: slotsOf(save).ext, replace: old, full: fullSell });
        if (!r.ok) { nope(); return; }
        save.shop = save.shop.map((x) => (x === e.id ? -x : x));
        swapFor = -1;
        se('buff', 0.4, 0, 1.2);
        blip(600, 0.08, 'triangle', 0.06, 1.2);
        setTimeout(() => blip(1100, 0.08, 'square', 0.06, 1.5), 80);
      } else {
        selSlot = selSlot === i ? -1 : i;
        blip(700, 0.05, 'square', 0.05, 1.3);
      }
    } else if (d.move) {
      const j = selSlot + Number(d.move);
      if (selSlot < 0 || j < 0 || j >= save.equip.length) return;
      [save.equip[selSlot], save.equip[j]] = [save.equip[j], save.equip[selSlot]];
      selSlot = j;
      blip(820, 0.05, 'square', 0.05, 1.4);
    } else if (d.sell) {
      const id = Number(d.sell);
      if (!sellArmed) { sellArmed = true; blip(500, 0.05, 'square', 0.05, 1); renderShop(); return; }
      sellArmed = false;
      sellExt(save, id, fullSell);
      selSlot = -1;
      blip(600, 0.08, 'triangle', 0.06, 1.2);
    } else if (d.mallet) {
      const from = malletLv(save);
      if (!buyMallet(save, discountOf(save))) { nope(); return; }
      hooks.changed();
      renderShop();
      showMalletUp(document.getElementById('app') ?? document.body, heroById(save.hero).img, from, malletLv(save), () => renderShop());
      return;
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
      swapFor = -1;
      restockShop(save, true);
      blip(500, 0.1, 'sawtooth', 0.06, 2);
    } else if (d.toyreroll) {
      if (!payReroll(save)) { nope(); return; }
      restockToys(save, true);
      blip(500, 0.1, 'sawtooth', 0.06, 2);
    } else if (d.toy) {
      const id = d.toy as ToyId;
      const from = clownOf(save);
      if (!buyToy(save, id, discountOf(save))) { nope(); return; }
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
  /** Limited の説明（触った品。PC はマウスを乗せた品） */
  function limDetail(): string {
    const sel = limitedSel >= 0 ? limitedById(limitedSel) : undefined;
    const selDef = sel ? limitedOf(sel.id) : undefined;
    if (!sel || !selDef) return `<p>${isPc() ? '品にマウスを乗せると' : '品を触ると'}、効き目が出ます</p>`;
    return save.limited.includes(sel.id)
      ? `<b>${esc(sel.name)}</b><small style="color:${LIM_TYPE[selDef.type].color}">${esc(LIM_TYPE[selDef.type].name)}</small><p class="lim-good">${esc(selDef.good)}</p>${selDef.bad ? `<p class="lim-bad">${esc(selDef.bad)}</p>` : ''}`
      : `<b>？？？</b><small>${esc(partName(selDef.part))}</small><p>まだ持っていない Limited</p>`;
  }
  function renderLab(): void {
    const n = hooks.affordable();
    const lim = cat.limited;
    const own = save.limited.length;
    labEl.innerHTML = `
      <header class="page-head"><h2>ラボ</h2>${wallet()}</header>
      <div class="lab-cards">
        <button class="lab-card main" data-lab="tree" data-tip="4 色の枝のスキルを、エンブレムで取る。GAME OVER でも残る${n ? `\\nいま取れるスキル ${n} 個` : ''}"><b>スキルツリー</b><small>エンブレムで強くなる（GAME OVER でも残る）</small>${n ? `<span class="badge">${n}</span>` : ''}</button>
        <button class="lab-card" data-lab="guide" data-tip="台を止めて、部品の名前・何が起きるか・付けられる改造を見る"><b>台のしくみ</b><small>部品の名前と動き</small></button>
        <button class="lab-card" data-lab="settings" data-tip="プレイヤー名・センサー・感度・音・振動"><b>設定</b><small>センサー・音</small></button>
      </div>
      <h3 class="page-sec">Limited <small>${own} / ${lim.length}・ノルマを納めるたびに 1 つ選べる（挑戦の間ずっと）</small></h3>
      <div class="lim-grid">${lim.map((l) => `<button data-lim="${l.id}" class="${save.limited.includes(l.id) ? 'got' : ''}${l.id === limitedSel ? ' sel' : ''}" aria-label="${save.limited.includes(l.id) ? esc(l.name) : '未入手'}"><img src="${esc(l.img)}" alt=""></button>`).join('')}</div>
      <div class="lim-detail">${limDetail()}</div>
      <h3 class="page-sec">図鑑</h3>
      <ul class="dex">
        <li data-tip="これまでに手に入れたエクステンションの種類"><span>エクステンション</span><b>${new Set([...save.exts, ...save.equip]).size} / ${cat.exts.length}</b></li>
        <li data-tip="ボスを倒すと手に入る。持っているヒーローはショップでリーダーや控えにできる"><span>ヒーロー</span><b>${save.heroes.length} / ${cat.heroes.length}</b></li>
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
  // PC：Limited の品はマウスを乗せるだけで説明を出す（クリックしなくてよい）
  labEl.addEventListener('pointerover', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-lim]');
    if (!t || Number(t.dataset.lim) === limitedSel) return;
    limitedSel = Number(t.dataset.lim);
    labEl.querySelectorAll('.lim-grid .sel').forEach((b) => b.classList.remove('sel'));
    t.classList.add('sel');
    const d = labEl.querySelector('.lim-detail');
    if (d) d.innerHTML = limDetail();
  });

  // ---------------------------------------------------------------- 切りかえ（フッター・スワイプ）
  navBtns.forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.tab);
    if (i !== tab) blip(560 + i * 120, 0.05, 'square', 0.05, 1.3);
    setTab(i);
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
      root.hidden = false;
      root.parentElement?.classList.add('homing');
      root.classList.remove('leaving');
      setTab(i ?? tab, false);
    },
    hide() {
      visible = false;
      root.hidden = true;
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
