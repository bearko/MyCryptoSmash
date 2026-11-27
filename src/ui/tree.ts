// スキルツリーの画面：上から見たサーカスのテント。まん中の柱（ヒーロー）から 4 方向へ電球の線が伸び、スキルの切り絵がぶら下がる。
// - 枝は色だけでなく形でも分ける：赤＝●（傾き）・青＝◇（振り）・緑＝▲（引っぱり）・黄＝★（そのほか）
// - 取れるスキルは灯って呼吸し、値札（エンブレムの数）が付く。取れないものは沈む。取ると、柱からそのスキルまで電球が順に灯り、音階が上る
// - 説明の文の枠は置かない。スマホ：1 回目のタップで小さな吹き出し（名前・いまの段 → 次の段の数字・値段）、同じスキルをもう 1 回（か吹き出しの値札）で取る
//   PC（マウス）：乗せると吹き出し、1 クリックで取る（先のスキルは手前からまとめて）
// - ドラッグで動かし、ピンチ（PC はホイール）で拡大縮小。「おまかせ」は右上の杖のアイコン

import { cat, heroById } from '../core/catalog';
import './tree.css';
import { buzz, sfx } from '../core/audio';
import { fmt } from '../core/util';
import type { Save } from '../core/save';
import { stats, type Stats } from '../game/economy';
import { canHover } from './device';
import { isCalm } from './kit';
import { STACK_WEIGHT, STACK_WEIGHT_PER } from '../game/mods';
import {
  BRANCHES, SKILLS, SKILL_MAP, autoPlan, autoShares, isOpen, lvOf, nodePos, pathCost, pathTo, skillCost,
  type AutoMode, type Branch, type Skill, type Step,
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
    case 'y_stock': return `重ねられる品の出やすさ ×${(STACK_WEIGHT + STACK_WEIGHT_PER * st.stock).toFixed(1)}`;
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

/** 取れるのに取っていない（エンブレムが足りる）スキルの数。強化ボタンの赤丸に使う */
export function affordableCount(save: Save): number {
  return SKILLS.filter((sk) => isOpen(save.up, sk) && lvOf(save.up, sk.id) < sk.max && skillCost(sk, lvOf(save.up, sk.id)) <= save.emblems).length;
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
  { label: 'フリッパーの狙い', color: '#ffd23f', get: (s) => s.aim, f: (v) => `${Math.round((v * 180) / Math.PI)}度` },
  { label: '台を傾ける力', color: '#ff4f5e', get: (s) => s.nudgeMul, f: (v) => `×${v.toFixed(2)}` },
  { label: '台ゆらしの勢い', color: '#3fa9ff', get: (s) => s.rockMax, f: (v) => `${Math.round(v)}` },
  { label: '打ち出しの強さ', color: '#4fe07a', get: (s) => s.plungerMul, f: (v) => `×${v.toFixed(2)}` },
  { label: 'ボールセーブ', color: '#ffd23f', get: (s) => s.ballSave, f: (v) => `${v.toFixed(1)}秒` },
  { label: 'キックバック', color: '#ffd23f', get: (s) => s.kickbackTime, f: (v) => `${v.toFixed(1)}秒で点く` },
  { label: '大当たりの増幅', color: '#ffd23f', get: (s) => s.laneJackpot, f: (v) => `+${Math.round(v * 100)}%` },
  { label: '赤の弱点', color: '#ff4f5e', get: (s) => s.weakMul.red, f: (v) => `×${v}` },
  { label: '青の弱点', color: '#3fa9ff', get: (s) => s.weakMul.blue, f: (v) => `×${v}` },
  { label: '緑の弱点', color: '#4fe07a', get: (s) => s.weakMul.green, f: (v) => `×${v}` },
];
const PERKS: { label: string; get: (s: Stats) => boolean }[] = [
  { label: '怒涛', get: (s) => s.rush }, { label: '余震', get: (s) => s.aftershock },
  { label: '跳弾', get: (s) => s.ricochet }, { label: '見切り', get: (s) => s.guide },
  { label: 'マグナセーブ', get: (s) => s.magna }, { label: 'バンパー・フレンジー', get: (s) => s.frenzy },
  { label: 'ゆらしセーブ', get: (s) => s.shakeSave }, { label: '衝撃バンパー', get: (s) => s.shockBumper },
  { label: 'スキルショット', get: (s) => s.skillShot }, { label: '貫通フリッパー', get: (s) => s.pierceFlip },
  { label: 'メガマルチボール', get: (s) => s.megaMulti },
];

/** 枝の形（色だけで区別しない）。viewBox は −44〜44 */
const SHAPE: Record<Branch, string> = {
  red: '<circle r="31"/>',
  blue: '<path d="M0-38 38 0 0 38-38 0z"/>',
  green: '<path d="M0-37 39 28H-39z"/>',
  yellow: '<path d="M0-40 11.2-15.4 38-12.4 18.1 5.9 23.5 32.4 0 19-23.5 32.4-18.1 5.9-38-12.4-11.2-15.4z"/>',
};
/** 小さな形の印（タブ・吹き出し・おまかせ） */
const glyph = (b: Branch): string => `<svg class="sk-gl" data-b="${b}" viewBox="-44 -44 88 88" aria-hidden="true">${SHAPE[b]}</svg>`;
const WAND = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M3.5 18.4 14 7.9l2.1 2.1L5.6 20.5zM15.2 6.7l1.4-1.4 2.1 2.1-1.4 1.4zM18 1l.8 2.2L21 4l-2.2.8L18 7l-.8-2.2L15 4l2.2-.8zM8 2l.6 1.6L10.2 4.2 8.6 4.8 8 6.4 7.4 4.8 5.8 4.2l1.6-.6zM21 11l.6 1.6 1.6.6-1.6.6L21 15.4l-.6-1.6-1.6-.6 1.6-.6z"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';

export function openTree(root: HTMLElement, save: Save, hooks: TreeHooks): { refresh(): void; close(): void } {
  let selected: string | null = null;
  let buyMode: 1 | 10 | 0 = 1; // 0 = 買えるだけ
  let autoMenu = false;
  let busy = false; // 順番に開けている間は操作を受けない
  /** PC：マウスを乗せているスキル（吹き出しに出す） */
  let hovered: string | null = null;
  /** いまの操作がマウスか（マウスなら 1 クリックで取る） */
  let mouse = false;
  /** 吹き出しの中の「?」を開いているか（スマホ） */
  let more = false;
  const view = { x: 0, y: 0, s: Math.min(1, root.clientWidth / 470) };

  const el = document.createElement('div');
  el.className = 'tree sk';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'スキルツリー');
  el.dataset.sfxIn = 'page';
  el.innerHTML = `
    <div class="sk-view"><div class="sk-world"><i class="sk-tent"></i><svg class="sk-links"></svg><div class="sk-nodes"></div></div></div>
    <header class="sk-head">
      <button class="k-btn k-btn--icon" data-act="close" data-sfx="close" aria-label="戻る">${BACK}</button>
      <nav class="sk-tabs">${BRANCHES.map((b) => `<button data-branch="${b.id}" data-b="${b.id}" data-sfx="tab" aria-label="${b.name}：${b.sub}" data-tip="${b.sub}" data-tip-title="${b.name}">${glyph(b.id)}<b data-count="${b.id}"></b></button>`).join('')}</nav>
      <button class="k-btn k-btn--icon sk-auto" data-act="auto" data-sfx="open" aria-label="おまかせ" data-tip="持っているエンブレムをぜんぶ使って、手前から順に上げる" data-tip-title="おまかせ">${WAND}</button>
      <div class="sk-wallet" aria-label="エンブレム"><i class="emb"></i><b class="k-num" data-f="gum"></b></div>
    </header>
    <div class="sk-delta" data-f="delta" hidden></div>
    <div class="k-seg sk-mode" role="group" aria-label="まとめて上げる数" data-tip="何段も上がるスキルを、1 回でまとめて上げる数">${([1, 10, 0] as const).map((m) => `<button data-mode="${m}" data-sfx="tab" aria-pressed="${m === 1}">${m === 0 ? 'MAX' : `×${m}`}</button>`).join('')}</div>
    <div class="sk-pop" data-f="pop" hidden></div>
    <div class="sk-automenu" data-f="auto" hidden></div>`;
  root.append(el);

  const viewEl = el.querySelector('.sk-view') as HTMLElement;
  const worldEl = el.querySelector('.sk-world') as HTMLElement;
  const linksEl = el.querySelector('.sk-links') as SVGSVGElement;
  const nodesEl = el.querySelector('.sk-nodes') as HTMLElement;
  const popEl = el.querySelector('[data-f="pop"]') as HTMLElement;
  const autoEl = el.querySelector('[data-f="auto"]') as HTMLElement;
  const deltaEl = el.querySelector('[data-f="delta"]') as HTMLElement;
  const gumEl = el.querySelector('[data-f="gum"]') as HTMLElement;

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

  /** 電球の並ぶ場所（親からそのスキルまでのゆるい弧の上に 15px おき。両はしの切り絵の下には置かない） */
  const BULBS: Record<string, { d: string; pts: [number, number][] }> = {};
  for (const sk of SKILLS) {
    const a = sk.parent ? px(nodePos(SKILL_MAP[sk.parent])) : center;
    const b = px(nodePos(sk));
    const mx = (a.x + b.x) / 2 + (center.x - (a.x + b.x) / 2) * -0.08;
    const my = (a.y + b.y) / 2 + (center.y - (a.y + b.y) / 2) * -0.08;
    const at = (t: number): [number, number] => [(1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x, (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y];
    const N = 40;
    const cum: number[] = [0];
    let prev = at(0);
    for (let i = 1; i <= N; i += 1) { const q = at(i / N); cum.push(cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
    const len = cum[N];
    const from = sk.parent ? 40 : 52;
    const to = len - 40;
    const n = Math.max(1, Math.round((to - from) / 15));
    const list: [number, number][] = [];
    for (let k = 0; k <= n; k += 1) {
      const dist = from + ((to - from) * k) / n;
      let i = 1;
      while (i < N && cum[i] < dist) i += 1;
      const f = (dist - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const q = at((i - 1 + f) / N);
      list.push([Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
    }
    BULBS[sk.id] = { d: `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`, pts: list };
  }
  /** 柱からそのスキルまでの道（手前から） */
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let s: Skill | undefined = SKILL_MAP[id]; s; s = s.parent ? SKILL_MAP[s.parent] : undefined) out.unshift(s.id);
    return out;
  };

  const apply = () => { worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; placePop(); };
  const centerOn = (p: { x: number; y: number }, glide = false) => {
    const r = viewEl.getBoundingClientRect();
    view.x = r.width / 2 - p.x * view.s;
    view.y = r.height / 2 - p.y * view.s;
    worldEl.classList.toggle('glide', glide);
    apply();
    if (glide) setTimeout(() => { worldEl.classList.remove('glide'); placePop(); }, 420);
  };
  const statsNow = (): Stats => stats(save.up, heroById(save.hero), save.exts.length);

  // ------------------------------------------------------------------ 描く
  /** fresh：いま開いたスキル（柱からそこまで電球が順に灯る） */
  function render(fresh: string[] = []): void {
    const l = save.up;
    gumEl.textContent = fmt(save.emblems);
    for (const b of BRANCHES) {
      const list = SKILLS.filter((s) => s.branch === b.id);
      const own = list.filter((s) => lvOf(l, s.id) > 0).length;
      (el.querySelector(`[data-count="${b.id}"]`) as HTMLElement).textContent = `${own}/${list.length}`;
      (el.querySelector(`.sk-tabs [data-branch="${b.id}"]`) as HTMLElement).style.setProperty('--v', (own / list.length).toFixed(3));
    }
    // 走る光：柱から新しいスキルまで、電球を順に点ける
    const run = new Map<string, number>();
    for (const id of fresh) {
      let k = 0;
      for (const c of chain(id)) { if (!run.has(c)) run.set(c, k); k += BULBS[c].pts.length; }
    }
    let links = `<defs>${BRANCHES.map((b) => `<g id="sksh-${b.id}">${SHAPE[b.id]}</g>`).join('')}</defs>`;
    for (const sk of SKILLS) {
      const lit = lvOf(l, sk.id) > 0;
      const cls = lit ? 'is-lit' : isOpen(l, sk) ? 'is-open' : 'is-dim';
      const base = run.get(sk.id);
      const bulbs = BULBS[sk.id].pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.2"${base !== undefined ? ` class="run" style="animation-delay:${(base + i) * 26}ms"` : ` style="--i:${i % 5}"`}/>`).join('');
      links += `<g class="skl ${cls}" data-b="${sk.branch}"><path d="${BULBS[sk.id].d}"/>${bulbs}</g>`;
    }
    linksEl.innerHTML = links;

    const hero = heroById(save.hero);
    let html = `<div class="sk-pole" style="left:${center.x}px;top:${center.y}px"><i class="sk-rays"></i><img src="${esc(hero.img)}" alt=""></div>`;
    for (const sk of SKILLS) {
      const open = isOpen(l, sk);
      const p = px(nodePos(sk));
      const lv = lvOf(l, sk.id);
      const maxed = lv >= sk.max;
      // 取れる：すぐ取れるもの、または手前からまとめて開けるエンブレムがあるもの
      const cost = open ? skillCost(sk, lv) : pathCost(l, sk.id);
      const can = !maxed && cost <= save.emblems;
      const cls = ['skn', lv > 0 ? 'is-own' : '', open ? '' : 'is-far', can ? 'is-can' : '', maxed ? 'is-max' : '', selected === sk.id ? 'is-sel' : '',
        fresh.includes(sk.id) ? 'is-pop' : ''].filter(Boolean).join(' ');
      const badge = lv <= 0 ? '' : maxed ? '<em class="skn-lv">MAX</em>' : sk.kind === 'repeat' ? `<em class="skn-lv">${lv}</em>` : '';
      const state = maxed ? '最大' : lv > 0 ? `Lv ${lv}` : open ? '未習得' : '先のスキル';
      html += `<button class="${cls}" data-id="${sk.id}" data-b="${sk.branch}" data-kind="${sk.kind}" data-sfx="none" style="left:${p.x}px;top:${p.y}px" aria-label="${esc(sk.name)}（${state}${maxed ? '' : `・エンブレム ${cost}`}）">
          <svg class="skn-sh" viewBox="-44 -44 88 88" aria-hidden="true"><use href="#sksh-${sk.branch}" class="h"/><use href="#sksh-${sk.branch}" class="s"/><use href="#sksh-${sk.branch}" class="f"/></svg>
          <img src="${esc(iconUrl(sk))}" alt="">${badge}${can && open ? `<i class="skn-price"><i class="emb"></i>${cost}</i>` : ''}${open ? `<span>${esc(sk.name)}</span>` : ''}</button>`;
    }
    nodesEl.innerHTML = html;
    for (const id of fresh) sparks(id);
    renderPop();
  }

  /** 開いたスキルから、その枝の形の紙吹雪が飛ぶ */
  function sparks(id: string): void {
    if (isCalm()) return;
    const sk = SKILL_MAP[id];
    const p = px(nodePos(sk));
    for (let i = 0; i < 12; i += 1) {
      const d = document.createElement('i');
      d.className = 'skn-spark';
      d.dataset.b = i % 3 ? sk.branch : 'bone';
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const r = 54 + Math.random() * 46;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--r:${Math.round(Math.random() * 360)}deg`;
      nodesEl.append(d);
      setTimeout(() => d.remove(), 700);
    }
  }

  /** n 段まとめて上げるときの値段と段数（持っているスキルの段上げ） */
  function plan(sk: Skill): { n: number; price: number } {
    const lv = lvOf(save.up, sk.id);
    const want = sk.kind !== 'repeat' ? 1 : buyMode === 0 ? 1e9 : buyMode;
    let n = 0;
    let price = 0;
    while (n < want && lv + n < sk.max) {
      const c = skillCost(sk, lv + n);
      if (buyMode === 0 && n > 0 && price + c > save.emblems) break;
      price += c;
      n += 1;
    }
    return { n, price };
  }

  // ------------------------------------------------------------------ 吹き出し（名前・いまの段 → 次の段の数字・値段）
  function renderPop(): void {
    const id = hovered ?? selected;
    const sk = id && !autoMenu ? SKILL_MAP[id] : null;
    if (!sk) { popEl.hidden = true; return; }
    const lv = lvOf(save.up, sk.id);
    const hero = heroById(save.hero);
    const now = stats(save.up, hero, save.exts.length);
    const maxed = lv >= sk.max;
    const far = !isOpen(save.up, sk);
    const path = far ? pathTo(save.up, sk.id) : [];
    const { n, price: p1 } = far ? { n: 1, price: pathCost(save.up, sk.id) } : plan(sk);
    const price = p1;
    const next = maxed ? null : far
      ? stats({ ...save.up, ...Object.fromEntries(path.map((x) => [x, 1])) }, hero, save.exts.length)
      : stats({ ...save.up, [sk.id]: lv + n }, hero, save.exts.length);
    const ok = !maxed && n > 0 && price <= save.emblems;
    const fxNow = effect(sk, now);
    const fxNext = next ? effect(sk, next) : '';
    const numbers = !!fxNow && sk.kind === 'repeat';
    const lvTag = maxed ? 'MAX' : sk.kind === 'repeat' ? `Lv ${lv} → ${lv + n}` : sk.kind === 'cap' ? '到達点' : '';
    const hoverOnly = hovered !== null;
    const showDesc = !numbers || hoverOnly || more;
    popEl.dataset.b = sk.branch;
    popEl.classList.toggle('is-hover', hoverOnly);
    popEl.innerHTML = `
      <div class="sk-pop-h">${glyph(sk.branch)}<b>${esc(sk.name)}</b>${lvTag ? `<span class="k-tag k-tag--en" data-tone="ink">${lvTag}</span>` : ''}</div>
      ${numbers ? `<p class="sk-pop-fx">${esc(fxNow)}${fxNext && fxNext !== fxNow ? `<i></i><b>${esc(fxNext)}</b>` : ''}</p>` : ''}
      ${showDesc ? `<p class="sk-pop-d">${esc(sk.desc)}</p>` : ''}
      ${maxed ? '' : `<div class="sk-pop-f">
        ${numbers && !hoverOnly ? `<button type="button" class="k-help" data-act="more" data-sfx="select" aria-label="説明" aria-expanded="${more}">?</button>` : ''}
        ${far ? `<span class="sk-pop-path" aria-label="手前から ${path.length} 枚">${path.map((x) => glyph(SKILL_MAP[x].branch)).join('')}</span>` : n > 1 ? `<span class="k-tag k-tag--en" data-tone="bone">×${n}</span>` : ''}
        <button type="button" class="k-btn ${ok ? 'k-btn--go' : 'is-off'} sk-pop-buy" data-act="buy" data-sfx="none" aria-label="エンブレム ${price} で${lv > 0 ? '強化する' : '習得する'}"><i class="emb"></i><span>${fmt(price)}</span></button>
      </div>`}`;
    popEl.hidden = false;
    placePop(true);
  }
  /** 吹き出しを、そのスキルの切り絵のそば（上。入らなければ下）に置く */
  function placePop(fresh = false): void {
    const id = hovered ?? selected;
    if (popEl.hidden || !id) return;
    const node = nodesEl.querySelector<HTMLElement>(`.skn[data-id="${id}"]`);
    if (!node) return;
    const base = el.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const w = popEl.offsetWidth;
    const h = popEl.offsetHeight;
    const cx = r.left + r.width / 2 - base.left;
    const x = Math.max(8, Math.min(base.width - w - 8, cx - w / 2));
    const top = (el.querySelector('.sk-head') as HTMLElement).offsetHeight + 4;
    let y = r.top - base.top - h - 12;
    const below = y < top;
    if (below) y = r.bottom - base.top + 22;
    y = Math.max(top, Math.min(base.height - h - 8, y));
    popEl.classList.toggle('is-below', below);
    popEl.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, cx - x))}px`);
    popEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (fresh) { popEl.style.animation = 'none'; void popEl.offsetWidth; popEl.style.animation = ''; }
  }

  /** おまかせの選びかた（杖のアイコンの下に 2 枚の札） */
  function renderAuto(): void {
    autoEl.hidden = !autoMenu;
    (el.querySelector('.sk-auto') as HTMLElement).setAttribute('aria-expanded', String(autoMenu));
    if (!autoMenu) return;
    const u = save.usage;
    const total = u.red + u.blue + u.green;
    const sh = autoShares('usage', u);
    const even = autoShares('balance', u);
    const pb = autoPlan(save.up, save.emblems, 'balance', u);
    const pu = autoPlan(save.up, save.emblems, 'usage', u);
    const count = (p: { steps: Step[] }) => p.steps.reduce((a, s) => a + s.n, 0);
    const bars = (s: Record<Branch, number>): string => `<span class="sk-share">${BRANCHES.map((b) => `<i data-b="${b.id}" style="flex:${Math.max(0.04, s[b.id]).toFixed(3)}">${glyph(b.id)}</i>`).join('')}</span>`;
    const row = (mode: AutoMode, label: string, s: Record<Branch, number>, p: { steps: Step[]; cost: number }, go: boolean, tip: string): string =>
      `<button type="button" class="k-btn ${go ? 'k-btn--go' : 'k-btn--sub'} k-btn--wide k-in" data-auto="${mode}" data-sfx="none" ${count(p) ? '' : 'disabled'} data-tip="${tip}" style="--i:${go ? 0 : 1}">
        <span>${label}${bars(s)}</span><em>+${count(p)}</em><i class="emb"></i><b>${fmt(p.cost)}</b></button>`;
    autoEl.innerHTML = row('usage', 'よく使う', total ? sh : even, pu, true, total ? 'よく当てている操作の枝を厚めに上げる' : 'まだ当てた記録がないので 4 つの枝に均等')
      + row('balance', 'バランス', even, pb, false, '4 つの枝に同じだけ');
  }

  // ------------------------------------------------------------------ 強化の流れ（順番に開く演出つき）
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function runSteps(steps: Step[], pace: number): Promise<void> {
    if (busy || !steps.length) return;
    busy = true;
    el.classList.add('is-busy');
    const before = statsNow();
    const beforeOwned = new Set(SKILLS.filter((s) => lvOf(save.up, s.id) > 0).map((s) => s.id));
    let newSkill = false;
    let i = 0;
    for (const st of steps) {
      const sk = SKILL_MAP[st.id];
      for (let k = 0; k < st.n; k += 1) {
        const c = skillCost(sk, lvOf(save.up, sk.id));
        if (c > save.emblems) break;
        save.emblems -= c;
        save.up[sk.id] = lvOf(save.up, sk.id) + 1;
      }
      if (!beforeOwned.has(sk.id)) newSkill = true;
      hooks.changed();
      // 開いたスキルへ寄っていき、柱からそこまで光を走らせる。音階は 1 つずつ上る
      if (steps.length > 1 && pace >= 120) centerOn(px(nodePos(sk)), true);
      render([sk.id]);
      sfx('mult', { step: Math.min(i, 14), x: Math.max(-1, Math.min(1, nodePos(sk).x / 6)) });
      if (i % 3 === 0) buzz(8);
      i += 1;
      await wait(pace);
    }
    // しめ
    if (steps.length > 2) sfx('fanfare');
    else sfx(newSkill ? 'levelup' : 'buy');
    buzz([0, 25, 30, 25]);
    gumEl.classList.remove('is-boing');
    void gumEl.offsetWidth;
    gumEl.classList.add('is-boing');
    showDelta(before, statsNow(), steps.length);
    hooks.cheer(newSkill);
    busy = false;
    el.classList.remove('is-busy');
    render();
  }

  /** 左上に「前 → 後」をチケットで出す（数字だけ） */
  let deltaTimer = 0;
  function showDelta(a: Stats, b: Stats, n: number): void {
    const lines = DELTAS.filter((d) => Math.abs(d.get(b) - d.get(a)) > 1e-9)
      .map((d) => `<li style="--c:${d.color}"><span>${d.label}</span><s>${esc(d.f(d.get(a)))}</s><b>${esc(d.f(d.get(b)))}</b></li>`);
    for (const p of PERKS) if (p.get(b) && !p.get(a)) lines.push(`<li style="--c:var(--k-ticket-0)"><span>${p.label}</span><b>NEW</b></li>`);
    if (!lines.length) return;
    deltaEl.hidden = false;
    deltaEl.innerHTML = `<h4>${n > 1 ? `POWER UP ×${n}` : 'POWER UP!'}</h4><ul>${lines.slice(0, 4).join('')}</ul>${lines.length > 4 ? `<em>+${lines.length - 4}</em>` : ''}`;
    deltaEl.classList.remove('show');
    void deltaEl.offsetWidth;
    deltaEl.classList.add('show');
    clearTimeout(deltaTimer);
    deltaTimer = window.setTimeout(() => { deltaEl.hidden = true; }, 3600);
  }

  /** 取れないとき：切り絵と吹き出しが震える */
  function deny(id: string): void {
    sfx('deny');
    buzz(20);
    for (const t of [nodesEl.querySelector<HTMLElement>(`.skn[data-id="${id}"]`), popEl.hidden ? null : popEl.querySelector<HTMLElement>('.sk-pop-buy')]) {
      if (!t) continue;
      t.classList.remove('is-no');
      void t.offsetWidth;
      t.classList.add('is-no');
    }
  }

  // ------------------------------------------------------------------ 操作
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (moved) return;
    if (!t) {
      // 何もない所を触ったら、吹き出しとおまかせを閉じる
      if (busy) return;
      if (autoMenu || selected) { autoMenu = false; selected = null; more = false; render(); renderAuto(); }
      return;
    }
    if (t.dataset.act === 'close') { close(); return; }
    if (busy) return;
    if (t.dataset.act === 'auto') {
      autoMenu = !autoMenu;
      selected = null;
      hovered = null;
      render();
      renderAuto();
      return;
    }
    if (t.dataset.auto) {
      const mode = t.dataset.auto as AutoMode;
      const { steps } = autoPlan(save.up, save.emblems, mode, save.usage);
      autoMenu = false;
      renderAuto();
      // 全部で 3 秒くらいに収まる速さで、手前から順に
      void runSteps(steps, Math.max(25, Math.min(260, 3200 / Math.max(1, steps.length))));
      return;
    }
    if (t.dataset.branch) {
      autoMenu = false;
      renderAuto();
      const list = SKILLS.filter((s) => s.branch === t.dataset.branch);
      const first = list.find((s) => !s.parent);
      if (first) centerOn(px(nodePos(list.find((s) => s.depth === 2 && s.lane === 0) ?? first)), true);
      return;
    }
    if (t.dataset.mode !== undefined) {
      buyMode = Number(t.dataset.mode) as 1 | 10 | 0;
      el.querySelectorAll<HTMLElement>('.sk-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
      renderPop();
      return;
    }
    if (t.dataset.act === 'more') { more = !more; renderPop(); return; }
    if (t.dataset.act === 'buy' && selected) { if (!quickBuy(selected)) deny(selected); return; }
    if (t.dataset.id) {
      const id = t.dataset.id;
      if (autoMenu) { autoMenu = false; renderAuto(); }
      // PC：1 クリックで取る。スマホ：1 回目は吹き出し、同じスキルをもう 1 回で取る（取れないときは震える）
      const again = selected === id;
      if ((mouse && canHover()) || again) {
        selected = id;
        if (quickBuy(id)) return;
        if (lvOf(save.up, id) < SKILL_MAP[id].max) { render(); deny(id); return; }
      }
      if (!again) more = false;
      selected = id;
      sfx('select', { step: SKILL_MAP[id].depth + (SKILL_MAP[id].lane + 1) });
      render();
    }
  });

  /** 取れるなら取って true（先のスキルは手前からまとめて開ける） */
  function quickBuy(id: string): boolean {
    const sk = SKILL_MAP[id];
    if (!isOpen(save.up, sk)) {
      const path = pathTo(save.up, id);
      if (!path.length || pathCost(save.up, id) > save.emblems) return false;
      // 手前から 1 枚ずつ、間をおいて開ける
      void runSteps(path.map((p) => ({ id: p, n: 1 })), 300);
      return true;
    }
    const { n, price } = plan(sk);
    if (n <= 0 || price > save.emblems) return false;
    void runSteps([{ id, n }], 0);
    return true;
  }
  el.addEventListener('pointerdown', (e) => { mouse = e.pointerType === 'mouse'; }, true);
  // PC：マウスを乗せたスキルの吹き出しを出す（クリックしなくてよい）
  nodesEl.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || busy || autoMenu) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('.skn[data-id]');
    const id = t?.dataset.id ?? null;
    if (!id || id === hovered) return;
    hovered = id;
    renderPop();
  });
  nodesEl.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse' || !hovered) return;
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('.skn[data-id]') as HTMLElement | null;
    if (to?.dataset.id === hovered) return;
    hovered = null;
    if (!busy && !autoMenu) renderPop();
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
        el.classList.add('is-drag');
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
    el.classList.remove('is-drag');
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
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    window.removeEventListener('keydown', onKey);
    // 閉じるときも、紙がめくれるように引っこむ（0.5 秒）
    el.classList.add('is-leaving');
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), isCalm() ? 0 : 480);
    hooks.close();
  }

  render();
  requestAnimationFrame(() => centerOn(center));
  return { refresh: () => { gumEl.textContent = fmt(save.emblems); }, close };
}
