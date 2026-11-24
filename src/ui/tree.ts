// スキルツリーの画面。中心から上・右・下・左に 4 色の枝が伸びる。
// ドラッグで動かし、ピンチ（PC はホイール）で拡大縮小。スキルをタップすると下に詳しく出て、そこで強化する。

import { cat, heroById } from '../core/catalog';
import { blip, buzz, se } from '../core/audio';
import { fmt } from '../core/util';
import type { Save } from '../core/save';
import { stats, type Stats } from '../game/economy';
import {
  BRANCHES, BRANCH_MAP, SKILLS, SKILL_MAP, isOpen, isTeaser, lvOf, nodePos, skillCost, type Skill,
} from '../game/skills';

const UNIT = 92; // 1 マスの px
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const iconUrl = (sk: Skill): string => (sk.icon === 'gum' ? cat.icons.gum : `mch/Image/Extensions/${sk.icon}.png`);

/** 効き目を 1 行で（いまの段と、次の段をくらべて見せる） */
function effect(sk: Skill, st: Stats): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  switch (sk.id) {
    case 'r_pow': return `赤 ×${st.colorMul.red.toFixed(2)}`;
    case 'b_pow': return `青 ×${st.colorMul.blue.toFixed(2)}`;
    case 'g_pow': return `緑 ×${st.colorMul.green.toFixed(2)}`;
    case 'r_slide': return `加速 ${Math.round(st.accel)}・最高速 ${Math.round(st.maxSpeed)}`;
    case 'r_crit': return `SMASH の速さ ${Math.round(st.smashSpeed)}`;
    case 'r_rapid': return `${st.redInterval.toFixed(3)} 秒ごと`;
    case 'r_home': return `曲がる強さ ${pct(st.homing)}`;
    case 'r_press': return `押しつけ ×${st.redPress.toFixed(2)}`;
    case 'r_rush': return st.rush ? '習得ずみ' : '未習得';
    case 'r_cap': return `弱点 ×${st.weakMul.red}`;
    case 'b_shake': return `振りの速さ ${Math.round(st.shake)}`;
    case 'b_area': return `波の半径 ${Math.round(st.area)}`;
    case 'b_dash': return `${st.blueTime.toFixed(2)} 秒`;
    case 'b_quick': return `${st.shakeCooldown} ミリ秒`;
    case 'b_after': return st.aftershock ? '習得ずみ' : '未習得';
    case 'b_knock': return `飛ぶ強さ ${Math.round(st.knock)}`;
    case 'b_cap': return `弱点 ×${st.weakMul.blue}`;
    case 'g_launch': return `はじく速さ ${Math.round(st.launch)}`;
    case 'g_long': return `${st.greenTime.toFixed(1)} 秒`;
    case 'g_focus': return `時間 ×${st.slowmo.toFixed(2)}`;
    case 'g_bounce': return st.ricochet ? '習得ずみ' : '未習得';
    case 'g_smash': return `SMASH ×${st.greenSmash.toFixed(2)}`;
    case 'g_guide': return st.guide ? '習得ずみ' : '未習得';
    case 'g_cap': return `弱点 ×${st.weakMul.green}`;
    case 'y_gum': return `GUM ×${st.gumMul.toFixed(2)}`;
    case 'y_magnet': return `範囲 ${Math.round(st.magnet)}`;
    case 'y_swarm': return `${st.maxEnemies} 体`;
    case 'y_size': return `半径 ${st.radius.toFixed(0)}`;
    case 'y_mates': return `${st.mates} 人`;
    case 'y_drop': return `落とす確率 ${pct(st.dropRate)}`;
    case 'y_buff': return `${st.buffTime} 秒`;
    case 'y_mateAtk': return `仲間 ${fmt(st.mateAtk)}`;
    case 'y_cap': return `GUM ×${st.gumMul.toFixed(2)}`;
    case 'y_combo': return `1 ヒットごと +${pct(st.comboStep)}（50 連続で ×${(1 + 50 * st.comboStep).toFixed(1)}）`;
    default: return '';
  }
}

/** 取れるのに取っていない（GUM が足りる）スキルの数。強化ボタンの赤丸に使う */
export function affordableCount(save: Save): number {
  return SKILLS.filter((sk) => isOpen(save.up, sk) && lvOf(save.up, sk.id) < sk.max && skillCost(sk, lvOf(save.up, sk.id)) <= save.gum).length;
}

export interface TreeHooks {
  /** スキルが上がった（world の能力値を計算しなおす） */
  changed(): void;
  close(): void;
}

export function openTree(root: HTMLElement, save: Save, hooks: TreeHooks): { refresh(): void; close(): void } {
  let selected: string | null = null;
  let buyMode: 1 | 10 | 0 = 1; // 0 = 買えるだけ
  const view = { x: 0, y: 0, s: Math.min(1, root.clientWidth / 460) };

  const el = document.createElement('div');
  el.className = 'tree';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'スキルツリー');
  el.innerHTML = `
    <header class="tree-head">
      <button class="icon" data-act="close" aria-label="戻る">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>
      </button>
      <h2>スキルツリー</h2>
      <div class="tree-gum"><img src="${cat.icons.gum}" alt=""><b data-f="gum"></b></div>
    </header>
    <nav class="tree-branches">${BRANCHES.map((b) => `<button data-branch="${b.id}" style="--c:${b.color}"><b>${b.name}</b><span>${b.sub}</span><small data-count="${b.id}"></small></button>`).join('')}</nav>
    <div class="tree-view"><div class="tree-world"><svg class="tree-links"></svg><div class="tree-nodes"></div></div></div>
    <footer class="tree-info" data-f="info"></footer>`;
  root.append(el);

  const viewEl = el.querySelector('.tree-view') as HTMLElement;
  const worldEl = el.querySelector('.tree-world') as HTMLElement;
  const linksEl = el.querySelector('.tree-links') as SVGSVGElement;
  const nodesEl = el.querySelector('.tree-nodes') as HTMLElement;
  const infoEl = el.querySelector('[data-f="info"]') as HTMLElement;

  // 世界の広さ
  const pts = SKILLS.map(nodePos);
  const ext = Math.max(...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) + 1.3;
  const size = ext * 2 * UNIT;
  worldEl.style.width = `${size}px`;
  worldEl.style.height = `${size}px`;
  linksEl.setAttribute('width', String(size));
  linksEl.setAttribute('height', String(size));
  linksEl.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const px = (p: { x: number; y: number }) => ({ x: (p.x + ext) * UNIT, y: (p.y + ext) * UNIT });
  const center = px({ x: 0, y: 0 });

  const apply = () => { worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; };
  const centerOn = (p: { x: number; y: number }, glide = false) => {
    const r = viewEl.getBoundingClientRect();
    view.x = r.width / 2 - p.x * view.s;
    view.y = r.height / 2 - p.y * view.s;
    worldEl.classList.toggle('glide', glide);
    apply();
    if (glide) setTimeout(() => worldEl.classList.remove('glide'), 400);
  };

  // ------------------------------------------------------------------ 描く
  function render(): void {
    const l = save.up;
    (el.querySelector('[data-f="gum"]') as HTMLElement).textContent = fmt(save.gum);
    for (const b of BRANCHES) {
      const list = SKILLS.filter((s) => s.branch === b.id);
      const own = list.filter((s) => lvOf(l, s.id) > 0).length;
      (el.querySelector(`[data-count="${b.id}"]`) as HTMLElement).textContent = `${own}/${list.length}`;
    }
    // 線
    let paths = '';
    for (const sk of SKILLS) {
      if (!isOpen(l, sk) && !isTeaser(l, sk)) continue;
      const a = sk.parent ? px(nodePos(SKILL_MAP[sk.parent])) : center;
      const b = px(nodePos(sk));
      const col = BRANCH_MAP[sk.branch].color;
      const lit = lvOf(l, sk.id) > 0;
      // 中心から外へ、ゆるく曲げる
      const mx = (a.x + b.x) / 2 + (center.x - (a.x + b.x) / 2) * -0.08;
      const my = (a.y + b.y) / 2 + (center.y - (a.y + b.y) / 2) * -0.08;
      paths += `<path d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}" stroke="${col}" class="${lit ? 'lit' : isOpen(l, sk) ? 'open' : 'dim'}"/>`;
    }
    linksEl.innerHTML = paths;

    // 中心とスキル
    const hero = heroById(save.hero);
    let html = `<div class="tn-root" style="left:${center.x}px;top:${center.y}px"><img src="${esc(hero.img)}" alt=""></div>`;
    for (const sk of SKILLS) {
      const open = isOpen(l, sk);
      const teaser = isTeaser(l, sk);
      if (!open && !teaser) continue;
      const p = px(nodePos(sk));
      const lv = lvOf(l, sk.id);
      const col = BRANCH_MAP[sk.branch].color;
      const maxed = lv >= sk.max;
      const can = open && !maxed && skillCost(sk, lv) <= save.gum;
      const cls = ['tn', sk.kind, lv > 0 ? 'own' : '', teaser ? 'teaser' : '', can ? 'can' : '', maxed ? 'max' : '', selected === sk.id ? 'sel' : ''].join(' ');
      const badge = sk.kind === 'repeat' ? `${lv}${sk.max < 200 ? `/${sk.max}` : ''}` : `${lv}/1`;
      html += teaser
        ? `<button class="${cls}" data-id="${sk.id}" style="left:${p.x}px;top:${p.y}px;--c:${col}" aria-label="まだ見えないスキル"><i>？</i></button>`
        : `<button class="${cls}" data-id="${sk.id}" style="left:${p.x}px;top:${p.y}px;--c:${col}" aria-label="${esc(sk.name)}">
            <img src="${esc(iconUrl(sk))}" alt=""><em>${badge}</em><span>${esc(sk.name)}</span></button>`;
    }
    nodesEl.innerHTML = html;
    renderInfo();
  }

  /** n 段まとめて上げるときの値段と段数 */
  function plan(sk: Skill): { n: number; price: number } {
    const lv = lvOf(save.up, sk.id);
    const want = sk.kind !== 'repeat' ? 1 : buyMode === 0 ? 1e9 : buyMode;
    let n = 0;
    let price = 0;
    while (n < want && lv + n < sk.max) {
      const c = skillCost(sk, lv + n);
      if (buyMode === 0 && n > 0 && price + c > save.gum) break;
      price += c;
      n += 1;
    }
    return { n, price };
  }

  function renderInfo(): void {
    const sk = selected ? SKILL_MAP[selected] : null;
    if (!sk) {
      infoEl.innerHTML = '<p class="tree-hint">スキルをタップすると、くわしい効き目と値段が出ます。上は<b class="c-red">赤（傾き）</b>、右は<b class="c-blue">青（振り）</b>、下は<b class="c-green">緑（引っぱり）</b>、左は<b class="c-yellow">黄（GUM・そのほか）</b>。</p>';
      return;
    }
    const b = BRANCH_MAP[sk.branch];
    if (isTeaser(save.up, sk)) {
      const p = sk.parent ? SKILL_MAP[sk.parent] : null;
      infoEl.innerHTML = `<div class="ti-row"><div class="ti-icon teaser" style="--c:${b.color}">？</div><div><h3>まだ見えないスキル</h3><p>「${esc(p?.name ?? '')}」を取ると見えるようになります。</p></div></div>`;
      return;
    }
    const lv = lvOf(save.up, sk.id);
    const hero = heroById(save.hero);
    const now = stats(save.up, hero, save.exts.length);
    const maxed = lv >= sk.max;
    const { n, price } = plan(sk);
    const next = maxed ? null : stats({ ...save.up, [sk.id]: lv + n }, hero, save.exts.length);
    const ok = !maxed && n > 0 && price <= save.gum;
    const kind = sk.kind === 'cap' ? '到達点' : sk.kind === 'perk' ? '1 回きり' : `Lv ${lv}${sk.max < 200 ? ` / ${sk.max}` : ''}`;
    const seg = sk.kind === 'repeat' && !maxed
      ? `<div class="seg">${([1, 10, 0] as const).map((m) => `<button data-mode="${m}" aria-pressed="${buyMode === m}">${m === 0 ? '買えるだけ' : `×${m}`}</button>`).join('')}</div>`
      : '';
    infoEl.innerHTML = `
      <div class="ti-row">
        <div class="ti-icon" style="--c:${b.color}"><img src="${esc(iconUrl(sk))}" alt=""></div>
        <div><h3>${esc(sk.name)}<small style="color:${b.color}">${b.name}・${kind}</small></h3>
        <p>${esc(sk.desc)}</p>
        <p class="ti-fx">${esc(effect(sk, now))}${next ? ` → <em>${esc(effect(sk, next))}</em>` : ''}</p></div>
      </div>
      ${seg}
      <button class="buy" data-act="buy" ${ok ? '' : 'disabled'}>${maxed ? 'これ以上は上げられません' : `<img src="${cat.icons.gum}" alt="">${fmt(price)}　${n > 1 ? `${n} 段強化する` : lv === 0 ? '習得する' : '強化する'}`}</button>`;
  }

  // ------------------------------------------------------------------ 操作
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t || moved) return;
    if (t.dataset.act === 'close') { close(); return; }
    if (t.dataset.branch) {
      const first = SKILLS.find((s) => s.branch === t.dataset.branch && !s.parent);
      if (first) {
        selected = first.id;
        render();
        centerOn(px(nodePos(SKILLS.filter((s) => s.branch === t.dataset.branch).find((s) => s.depth === 2) ?? first)), true);
      }
      return;
    }
    if (t.dataset.id) {
      selected = t.dataset.id;
      blip(760, 0.04, 'square', 0.04, 1.2);
      render();
      return;
    }
    if (t.dataset.mode !== undefined) {
      buyMode = Number(t.dataset.mode) as 1 | 10 | 0;
      renderInfo();
      return;
    }
    if (t.dataset.act === 'buy' && selected) {
      const sk = SKILL_MAP[selected];
      const { n, price } = plan(sk);
      if (n <= 0 || price > save.gum) return;
      const first = lvOf(save.up, sk.id) === 0;
      save.gum -= price;
      save.up[sk.id] = lvOf(save.up, sk.id) + n;
      hooks.changed();
      se('buff', 0.55, 0, first ? 1 : 1.25);
      buzz(first ? [0, 20] : 10);
      render();
      const node = nodesEl.querySelector(`[data-id="${sk.id}"]`);
      node?.classList.add('pop');
    }
  });

  // ドラッグ・ピンチ・ホイール
  const ptrs = new Map<number, { x: number; y: number }>();
  let moved = false;
  let startX = 0;
  let startY = 0;
  let pinch = 0;
  viewEl.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = false; startX = e.clientX; startY = e.clientY; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  viewEl.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 1) {
      if (!moved && Math.hypot(cur.x - startX, cur.y - startY) > 8) {
        moved = true;
        try { viewEl.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }
      if (moved) { view.x += cur.x - prev.x; view.y += cur.y - prev.y; apply(); }
    } else if (ptrs.size === 2) {
      moved = true;
      ptrs.set(e.pointerId, cur);
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = viewEl.getBoundingClientRect();
      zoomAt(d / (pinch || d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch = d;
      return;
    }
    ptrs.set(e.pointerId, cur);
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    // ドラッグのあとの click を 1 回だけ無視する
    if (moved && ptrs.size === 0) setTimeout(() => { moved = false; }, 0);
  };
  viewEl.addEventListener('pointerup', up);
  viewEl.addEventListener('pointercancel', up);
  viewEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewEl.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  function zoomAt(k: number, cx: number, cy: number): void {
    const ns = Math.min(1.6, Math.max(0.35, view.s * k));
    const f = ns / view.s;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.s = ns;
    apply();
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);

  function close(): void {
    if (!el.isConnected) return;
    window.removeEventListener('keydown', onKey);
    el.remove();
    hooks.close();
  }

  render();
  requestAnimationFrame(() => centerOn(center));
  return { refresh: () => { (el.querySelector('[data-f="gum"]') as HTMLElement).textContent = fmt(save.gum); }, close };
}
