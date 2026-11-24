// スキルツリーの画面。中心から上・右・下・左に 4 色の枝が伸びる。
// ドラッグで動かし、ピンチ（PC はホイール）で拡大縮小。スキルをタップすると下に詳しく出て、そこで強化する。

import { cat, heroById } from '../core/catalog';
import { blip, buzz, chime, roar, se } from '../core/audio';
import { fmt } from '../core/util';
import type { Save } from '../core/save';
import { stats, type Stats } from '../game/economy';
import {
  BRANCHES, BRANCH_MAP, SKILLS, SKILL_MAP, autoPlan, autoShares, isOpen, lvOf, nodePos, pathCost, pathTo, skillCost,
  type AutoMode, type Skill, type Step,
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
    case 'r_slide': return `傾きの最高速 ${Math.round(st.tiltSpeed)}・ききの強さ ${st.tiltGrip.toFixed(1)}`;
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
    case 'y_swarm': return `1 階に +${st.extraEnemies} 体`;
    case 'y_size': return `大きさ ×${(st.radius / 24).toFixed(2)}`;
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
  /** 実況に言わせる（新しいスキルを取ったか） */
  cheer(newSkill: boolean): void;
}

/** 強化の前後で見せる能力（変わったものだけ「前 → 後」で出す） */
const DELTAS: { label: string; color: string; get: (s: Stats) => number; f: (v: number) => string }[] = [
  { label: '赤の威力', color: '#ff4f5e', get: (s) => s.colorMul.red, f: (v) => `×${v.toFixed(2)}` },
  { label: '青の威力', color: '#3fa9ff', get: (s) => s.colorMul.blue, f: (v) => `×${v.toFixed(2)}` },
  { label: '緑の威力', color: '#4fe07a', get: (s) => s.colorMul.green, f: (v) => `×${v.toFixed(2)}` },
  { label: '傾きの速さ', color: '#ff4f5e', get: (s) => s.tiltSpeed, f: (v) => `${Math.round(v)}` },
  { label: 'SMASH の速さ', color: '#ff4f5e', get: (s) => s.smashSpeed, f: (v) => `${Math.round(v)}` },
  { label: '連打の間隔', color: '#ff4f5e', get: (s) => s.redInterval, f: (v) => `${v.toFixed(3)}秒` },
  { label: '押しこみ', color: '#ff4f5e', get: (s) => s.redPress, f: (v) => `×${v.toFixed(2)}` },
  { label: '吸い寄せ', color: '#ff4f5e', get: (s) => s.homing, f: (v) => `${Math.round(v * 100)}%` },
  { label: '振りの速さ', color: '#3fa9ff', get: (s) => s.shake, f: (v) => `${Math.round(v)}` },
  { label: '波の半径', color: '#3fa9ff', get: (s) => s.area, f: (v) => `${Math.round(v)}` },
  { label: '体当たり', color: '#3fa9ff', get: (s) => s.blueTime, f: (v) => `${v.toFixed(2)}秒` },
  { label: '早振り', color: '#3fa9ff', get: (s) => s.shakeCooldown, f: (v) => `${v}ms` },
  { label: '吹き飛ばし', color: '#3fa9ff', get: (s) => s.knock, f: (v) => `${Math.round(v)}` },
  { label: 'はじく速さ', color: '#4fe07a', get: (s) => s.launch, f: (v) => `${Math.round(v)}` },
  { label: '貫通の時間', color: '#4fe07a', get: (s) => s.greenTime, f: (v) => `${v.toFixed(1)}秒` },
  { label: 'スロー', color: '#4fe07a', get: (s) => s.slowmo, f: (v) => `×${v.toFixed(2)}` },
  { label: '緑の SMASH', color: '#4fe07a', get: (s) => s.greenSmash, f: (v) => `×${v.toFixed(2)}` },
  { label: 'GUM', color: '#ffd23f', get: (s) => s.gumMul, f: (v) => `×${v.toFixed(2)}` },
  { label: '磁石', color: '#ffd23f', get: (s) => s.magnet, f: (v) => `${Math.round(v)}` },
  { label: 'エネミーの数', color: '#ffd23f', get: (s) => s.extraEnemies, f: (v) => `+${v}体` },
  { label: 'マレットの大きさ', color: '#ffd23f', get: (s) => s.radius / 24, f: (v) => `×${v.toFixed(2)}` },
  { label: '仲間', color: '#ffd23f', get: (s) => s.mates, f: (v) => `${v}人` },
  { label: '仲間の攻撃', color: '#ffd23f', get: (s) => s.mateAtk, f: (v) => fmt(v) },
  { label: 'ドロップ率', color: '#ffd23f', get: (s) => s.dropRate, f: (v) => `${Math.round(v * 100)}%` },
  { label: '強化の時間', color: '#ffd23f', get: (s) => s.buffTime, f: (v) => `${v}秒` },
  { label: '連続ボーナス', color: '#ffd23f', get: (s) => s.comboStep, f: (v) => `+${Math.round(v * 100)}%` },
  { label: '赤の弱点', color: '#ff4f5e', get: (s) => s.weakMul.red, f: (v) => `×${v}` },
  { label: '青の弱点', color: '#3fa9ff', get: (s) => s.weakMul.blue, f: (v) => `×${v}` },
  { label: '緑の弱点', color: '#4fe07a', get: (s) => s.weakMul.green, f: (v) => `×${v}` },
];
const PERKS: { label: string; get: (s: Stats) => boolean }[] = [
  { label: '怒涛', get: (s) => s.rush }, { label: '余震', get: (s) => s.aftershock },
  { label: '跳弾', get: (s) => s.ricochet }, { label: '見切り', get: (s) => s.guide },
];

export function openTree(root: HTMLElement, save: Save, hooks: TreeHooks): { refresh(): void; close(): void } {
  let selected: string | null = null;
  let buyMode: 1 | 10 | 0 = 1; // 0 = 買えるだけ
  let autoMenu = false;
  let busy = false; // 順番に開けている間は操作を受けない
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
      <button class="tree-auto" data-act="auto">おまかせ</button>
      <div class="tree-gum"><img src="${cat.icons.gum}" alt=""><b data-f="gum"></b></div>
    </header>
    <nav class="tree-branches">${BRANCHES.map((b) => `<button data-branch="${b.id}" style="--c:${b.color}"><b>${b.name}</b><span>${b.sub}</span><small data-count="${b.id}"></small></button>`).join('')}</nav>
    <div class="tree-view"><div class="tree-world"><svg class="tree-links"></svg><div class="tree-nodes"></div></div>
      <div class="tree-delta" data-f="delta" hidden></div></div>
    <footer class="tree-info" data-f="info"></footer>`;
  root.append(el);

  const viewEl = el.querySelector('.tree-view') as HTMLElement;
  const worldEl = el.querySelector('.tree-world') as HTMLElement;
  const linksEl = el.querySelector('.tree-links') as SVGSVGElement;
  const nodesEl = el.querySelector('.tree-nodes') as HTMLElement;
  const infoEl = el.querySelector('[data-f="info"]') as HTMLElement;
  const deltaEl = el.querySelector('[data-f="delta"]') as HTMLElement;

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
  const statsNow = (): Stats => stats(save.up, heroById(save.hero), save.exts.length);

  // ------------------------------------------------------------------ 描く
  /** fresh：いま開いたスキル（線を光らせながら伸ばす） */
  function render(fresh: string[] = []): void {
    const l = save.up;
    (el.querySelector('[data-f="gum"]') as HTMLElement).textContent = fmt(save.gum);
    for (const b of BRANCHES) {
      const list = SKILLS.filter((s) => s.branch === b.id);
      const own = list.filter((s) => lvOf(l, s.id) > 0).length;
      (el.querySelector(`[data-count="${b.id}"]`) as HTMLElement).textContent = `${own}/${list.length}`;
    }
    // 線（先の先までぜんぶ見せる。持っているところは光る）
    let paths = '';
    for (const sk of SKILLS) {
      const a = sk.parent ? px(nodePos(SKILL_MAP[sk.parent])) : center;
      const b = px(nodePos(sk));
      const col = BRANCH_MAP[sk.branch].color;
      const lit = lvOf(l, sk.id) > 0;
      const mx = (a.x + b.x) / 2 + (center.x - (a.x + b.x) / 2) * -0.08;
      const my = (a.y + b.y) / 2 + (center.y - (a.y + b.y) / 2) * -0.08;
      const cls = lit ? `lit${fresh.includes(sk.id) ? ' fresh' : ''}` : isOpen(l, sk) ? 'open' : 'dim';
      paths += `<path d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}" stroke="${col}" class="${cls}" pathLength="100"/>`;
    }
    linksEl.innerHTML = paths;

    const hero = heroById(save.hero);
    let html = `<div class="tn-root" style="left:${center.x}px;top:${center.y}px"><img src="${esc(hero.img)}" alt=""></div>`;
    for (const sk of SKILLS) {
      const open = isOpen(l, sk);
      const p = px(nodePos(sk));
      const lv = lvOf(l, sk.id);
      const col = BRANCH_MAP[sk.branch].color;
      const maxed = lv >= sk.max;
      // 取れる：すぐ取れるもの、または手前からまとめて開ける GUM があるもの
      const can = !maxed && (open ? skillCost(sk, lv) <= save.gum : pathCost(l, sk.id) <= save.gum);
      const cls = ['tn', sk.kind, lv > 0 ? 'own' : '', open ? '' : 'far', can ? 'can' : '', maxed ? 'max' : '', selected === sk.id ? 'sel' : '',
        fresh.includes(sk.id) ? 'pop' : ''].join(' ');
      const badge = sk.kind === 'repeat' ? `${lv}${sk.max < 200 ? `/${sk.max}` : ''}` : `${lv}/1`;
      html += `<button class="${cls}" data-id="${sk.id}" style="left:${p.x}px;top:${p.y}px;--c:${col}" aria-label="${esc(sk.name)}">
          <img src="${esc(iconUrl(sk))}" alt=""><em>${badge}</em><span>${esc(sk.name)}</span></button>`;
    }
    nodesEl.innerHTML = html;
    for (const id of fresh) sparks(id);
    renderInfo();
  }

  /** 開いたスキルから火花が飛ぶ */
  function sparks(id: string): void {
    const sk = SKILL_MAP[id];
    const p = px(nodePos(sk));
    const col = BRANCH_MAP[sk.branch].color;
    for (let i = 0; i < 14; i += 1) {
      const d = document.createElement('i');
      d.className = 'tn-spark';
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const r = 50 + Math.random() * 50;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;background:${i % 3 ? col : '#fff'}`;
      nodesEl.append(d);
      setTimeout(() => d.remove(), 700);
    }
    const ring = document.createElement('i');
    ring.className = 'tn-ring';
    ring.style.cssText = `left:${p.x}px;top:${p.y}px;border-color:${col}`;
    nodesEl.append(ring);
    setTimeout(() => ring.remove(), 600);
  }

  /** n 段まとめて上げるときの値段と段数（持っているスキルの段上げ） */
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
    if (autoMenu) { renderAuto(); return; }
    const sk = selected ? SKILL_MAP[selected] : null;
    if (!sk) {
      infoEl.innerHTML = '<p class="tree-hint">スキルをタップすると、効き目と値段が出ます。先のスキルも、そこまでの GUM があれば手前からまとめて開けられます。「おまかせ」で自動で割りふることもできます。</p>';
      return;
    }
    const b = BRANCH_MAP[sk.branch];
    const lv = lvOf(save.up, sk.id);
    const hero = heroById(save.hero);
    const now = stats(save.up, hero, save.exts.length);
    const maxed = lv >= sk.max;
    const kind = sk.kind === 'cap' ? '到達点' : sk.kind === 'perk' ? '1 回きり' : `Lv ${lv}${sk.max < 200 ? ` / ${sk.max}` : ''}`;
    const head = `
      <div class="ti-row">
        <div class="ti-icon" style="--c:${b.color}"><img src="${esc(iconUrl(sk))}" alt=""></div>
        <div><h3>${esc(sk.name)}<small style="color:${b.color}">${b.name}・${kind}</small></h3>
        <p>${esc(sk.desc)}</p>`;
    if (!isOpen(save.up, sk)) {
      // 先のスキル：手前からまとめて開ける
      const path = pathTo(save.up, sk.id);
      const cost = pathCost(save.up, sk.id);
      const next = stats({ ...save.up, ...Object.fromEntries(path.map((id) => [id, 1])) }, hero, save.exts.length);
      const ok = cost <= save.gum;
      infoEl.innerHTML = `${head}
        <p class="ti-fx">${esc(effect(sk, now))} → <em>${esc(effect(sk, next))}</em></p>
        <p class="ti-path">${path.map((id) => `<b style="color:${BRANCH_MAP[SKILL_MAP[id].branch].color}">${esc(SKILL_MAP[id].name)}</b>`).join(' → ')}</p></div></div>
        <button class="buy" data-act="path" ${ok ? '' : 'disabled'}><img src="${cat.icons.gum}" alt="">${fmt(cost)}　${ok ? `手前から ${path.length} 枚まとめて開ける` : `あと ${fmt(cost - save.gum)} 足りません`}</button>`;
      return;
    }
    const { n, price } = plan(sk);
    const next = maxed ? null : stats({ ...save.up, [sk.id]: lv + n }, hero, save.exts.length);
    const ok = !maxed && n > 0 && price <= save.gum;
    const seg = sk.kind === 'repeat' && !maxed
      ? `<div class="seg">${([1, 10, 0] as const).map((m) => `<button data-mode="${m}" aria-pressed="${buyMode === m}">${m === 0 ? '買えるだけ' : `×${m}`}</button>`).join('')}</div>`
      : '';
    infoEl.innerHTML = `${head}
        <p class="ti-fx">${esc(effect(sk, now))}${next ? ` → <em>${esc(effect(sk, next))}</em>` : ''}</p></div>
      </div>
      ${seg}
      <button class="buy" data-act="buy" ${ok ? '' : 'disabled'}>${maxed ? 'これ以上は上げられません' : `<img src="${cat.icons.gum}" alt="">${fmt(price)}　${n > 1 ? `${n} 段強化する` : lv === 0 ? '習得する' : '強化する'}`}</button>`;
  }

  /** おまかせの選びかた */
  function renderAuto(): void {
    const u = save.usage;
    const total = u.red + u.blue + u.green;
    const sh = autoShares('usage', u);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const pb = autoPlan(save.up, save.gum, 'balance', u);
    const pu = autoPlan(save.up, save.gum, 'usage', u);
    const count = (p: { steps: Step[] }) => p.steps.reduce((a, s) => a + s.n, 0);
    infoEl.innerHTML = `
      <h3 class="ti-auto-h">おまかせで強化する<small>持っている GUM をぜんぶ使って、手前から順に上げます</small></h3>
      <div class="ti-auto">
        <button data-auto="usage" ${count(pu) ? '' : 'disabled'}><b>よく使う操作を中心に<i>おすすめ</i></b>
          <span>${total ? `<em class="c-red">赤 ${pct(sh.red)}</em> <em class="c-blue">青 ${pct(sh.blue)}</em> <em class="c-green">緑 ${pct(sh.green)}</em> <em class="c-yellow">黄 25%</em>` : 'まだ当てた記録がないので 4 色に均等'}</span>
          <small>${count(pu)} 段・${fmt(pu.cost)} GUM</small></button>
        <button data-auto="balance" ${count(pb) ? '' : 'disabled'}><b>バランスよく</b>
          <span>赤・青・緑・黄に 25% ずつ</span><small>${count(pb)} 段・${fmt(pb.cost)} GUM</small></button>
      </div>
      <button class="ti-cancel" data-act="autoCancel">やめる</button>`;
  }

  // ------------------------------------------------------------------ 強化の流れ（順番に開く演出つき）
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function runSteps(steps: Step[], pace: number): Promise<void> {
    if (busy || !steps.length) return;
    busy = true;
    el.classList.add('busy');
    const before = statsNow();
    const beforeOwned = new Set(SKILLS.filter((s) => lvOf(save.up, s.id) > 0).map((s) => s.id));
    let newSkill = false;
    let i = 0;
    for (const st of steps) {
      const sk = SKILL_MAP[st.id];
      for (let k = 0; k < st.n; k += 1) {
        const c = skillCost(sk, lvOf(save.up, sk.id));
        if (c > save.gum) break;
        save.gum -= c;
        save.up[sk.id] = lvOf(save.up, sk.id) + 1;
      }
      if (!beforeOwned.has(sk.id)) newSkill = true;
      hooks.changed();
      // 開いたスキルへ寄っていき、光らせる
      if (steps.length > 1 && pace >= 120) centerOn(px(nodePos(sk)), true);
      render([sk.id]);
      chime(Math.min(i, 30));
      if (i % 3 === 0) buzz(8);
      i += 1;
      await wait(pace);
    }
    // しめ
    se('buff', 0.6, 0, newSkill ? 1 : 1.25);
    if (steps.length > 2) { roar(0.5, 1.1); se('win', 0.5, 0); }
    buzz([0, 25, 30, 25]);
    showDelta(before, statsNow(), steps.length);
    hooks.cheer(newSkill);
    busy = false;
    el.classList.remove('busy');
    render();
  }

  /** 左上に「前 → 後」を大きく出す */
  let deltaTimer = 0;
  function showDelta(a: Stats, b: Stats, n: number): void {
    const lines = DELTAS.filter((d) => Math.abs(d.get(b) - d.get(a)) > 1e-9)
      .map((d) => `<li style="--c:${d.color}"><span>${d.label}</span><s>${esc(d.f(d.get(a)))}</s><b>${esc(d.f(d.get(b)))}</b></li>`);
    for (const p of PERKS) if (p.get(b) && !p.get(a)) lines.push(`<li style="--c:#fff"><span>${p.label}</span><b>習得！</b></li>`);
    if (!lines.length) return;
    deltaEl.hidden = false;
    deltaEl.innerHTML = `<h4>${n > 1 ? `${n} 枚強化！` : 'パワーアップ！'}</h4><ul>${lines.slice(0, 6).join('')}${lines.length > 6 ? `<li class="more">ほか ${lines.length - 6} 件</li>` : ''}</ul>`;
    deltaEl.classList.remove('show');
    void deltaEl.offsetWidth;
    deltaEl.classList.add('show');
    clearTimeout(deltaTimer);
    deltaTimer = window.setTimeout(() => { deltaEl.hidden = true; }, 4200);
  }

  // ------------------------------------------------------------------ 操作
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t || moved) return;
    if (t.dataset.act === 'close') { close(); return; }
    if (busy) return;
    if (t.dataset.act === 'auto') {
      autoMenu = !autoMenu;
      selected = null;
      blip(700, 0.05, 'square', 0.05, 1.2);
      render();
      return;
    }
    if (t.dataset.act === 'autoCancel') { autoMenu = false; renderInfo(); return; }
    if (t.dataset.auto) {
      const mode = t.dataset.auto as AutoMode;
      const { steps } = autoPlan(save.up, save.gum, mode, save.usage);
      autoMenu = false;
      // 全部で 3 秒くらいに収まる速さで、手前から順に
      void runSteps(steps, Math.max(25, Math.min(260, 3200 / Math.max(1, steps.length))));
      return;
    }
    if (t.dataset.branch) {
      autoMenu = false;
      const first = SKILLS.find((s) => s.branch === t.dataset.branch && !s.parent);
      if (first) {
        selected = first.id;
        render();
        centerOn(px(nodePos(SKILLS.filter((s) => s.branch === t.dataset.branch).find((s) => s.depth === 2) ?? first)), true);
      }
      return;
    }
    if (t.dataset.id) {
      autoMenu = false;
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
      void runSteps([{ id: sk.id, n }], 0);
      return;
    }
    if (t.dataset.act === 'path' && selected) {
      const path = pathTo(save.up, selected);
      if (pathCost(save.up, selected) > save.gum) return;
      // 手前から 1 枚ずつ、間をおいて開ける
      void runSteps(path.map((id) => ({ id, n: 1 })), 280);
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
