// スキルツリー：中心から 4 方向に、色と系統ごとの枝が伸びる。
//
//   上：赤（傾き・連続）  右：青（振り・範囲）  下：緑（引っぱり・貫通）  左：黄（GUM・そのほか）
//
// 親を 1 段でも取ると、その子が見えて取れるようになる。親が見えているだけの子は「？」で出る。
// 値段は GUM。repeat は何段も上げられる（max まで）、perk は 1 回きり、cap は枝の到達点。
//
// icon は素材 DB のエクステンションの番号（scripts/sync-assets.mjs がこのファイルから拾って写す）。

export type Branch = 'red' | 'blue' | 'green' | 'yellow';
export type SkillKind = 'repeat' | 'perk' | 'cap';

export interface Skill {
  id: string;
  branch: Branch;
  parent: string | null; // null = 中心につながる
  depth: number; // 中心からの段
  lane: number; // 横のずれ（-1 左、0、+1 右。枝の向きから見て）
  kind: SkillKind;
  name: string;
  desc: string;
  max: number;
  base: number; // 1 段目の値段
  growth: number; // 1 段ごとの値上がり
  icon: number | 'gum';
}

export const BRANCHES: { id: Branch; name: string; sub: string; color: string; angle: number }[] = [
  { id: 'red', name: '赤', sub: '傾き・連続', color: '#ff4f5e', angle: -90 },
  { id: 'blue', name: '青', sub: '振り・範囲', color: '#3fa9ff', angle: 0 },
  { id: 'green', name: '緑', sub: '引っぱり・貫通', color: '#4fe07a', angle: 90 },
  { id: 'yellow', name: '黄', sub: 'GUM・そのほか', color: '#ffd23f', angle: 180 },
];
export const BRANCH_MAP = Object.fromEntries(BRANCHES.map((b) => [b.id, b])) as Record<Branch, (typeof BRANCHES)[number]>;

const R = (id: string, parent: string | null, depth: number, lane: number, kind: SkillKind, name: string, desc: string, max: number, base: number, growth: number, icon: number | 'gum'): Omit<Skill, 'branch'> =>
  ({ id, parent, depth, lane, kind, name, desc, max, base, growth, icon });

const red: Omit<Skill, 'branch'>[] = [
  R('r_pow', null, 1, 0, 'repeat', '赤の威力', '傾きで当てたときのダメージが上がる', 200, 10, 1.19, 1046),
  R('r_slide', 'r_pow', 2, -1, 'repeat', '滑り', '傾けたときの最高速と、傾きへの反応が上がる', 15, 25, 1.42, 1031),
  R('r_crit', 'r_pow', 2, 0, 'repeat', '重い一撃', '「SMASH!」になる速さが下がる（1 段ごとに 4%）', 10, 60, 1.5, 1034),
  R('r_rapid', 'r_pow', 2, 1, 'repeat', '連打', '押しつけたときに当たる間隔が短くなる（1 段ごとに 12%）', 5, 80, 1.9, 1164),
  R('r_home', 'r_slide', 3, -1, 'repeat', '吸い寄せ', '傾けた向きの先にいる敵へ、マレットが曲がっていく力が強くなる', 5, 120, 1.8, 1192),
  R('r_rush', 'r_crit', 3, 0, 'perk', '怒涛', '連続ヒット 1 回ごとに赤のダメージ +3%（最大 +90%）', 1, 900, 1, 1021),
  R('r_press', 'r_rapid', 3, 1, 'repeat', '押しこみ', '押しつけたときの 1 回のダメージが上がる（1 段ごとに 15%）', 10, 70, 1.45, 1099),
  // ピンボールの枝（青の側へ）
  R('r_nudge', 'r_rapid', 3, 2, 'repeat', '台を傾ける力', 'ピンボール：傾けて球を曲げる力が強くなる（1 段ごとに +6%）', 10, 80, 1.5, 1031),
  R('r_magna', 'r_nudge', 4, 2, 'perk', 'マグナセーブ', 'ピンボール：落ちそうな球を、傾けていれば磁石が 1 回すくい上げる（15 秒でまた使える）', 1, 1500, 1, 1192),
  R('r_frenzy', 'r_magna', 5, 2, 'perk', 'バンパー・フレンジー', 'ピンボール：短い間にバンパーへ 15 回当てると 10 秒間フレンジー。バンパーの GUM ×3、バンパーの間に稲妻が走る', 1, 7000, 1, 1021),
  R('r_cap', 'r_rush', 4, 0, 'cap', '紅蓮', '赤で弱点を突いたときの倍率が 2.5 倍 → 4 倍', 1, 8000, 1, 5528),
];
const blue: Omit<Skill, 'branch'>[] = [
  R('b_pow', null, 1, 0, 'repeat', '青の威力', '振りの波と、振った直後の体当たりのダメージが上がる', 200, 10, 1.19, 1045),
  R('b_shake', 'b_pow', 2, -1, 'repeat', '振りの勢い', '振ったときに飛び出す速さが上がる', 15, 25, 1.4, 1066),
  R('b_area', 'b_pow', 2, 0, 'repeat', '波の広さ', '波の半径が広がる（1 段ごとに 8%）', 10, 50, 1.45, 1071),
  R('b_dash', 'b_pow', 2, 1, 'repeat', '体当たり', '振った後に体当たりが青になる時間がのびる', 5, 60, 1.7, 1023),
  R('b_quick', 'b_shake', 3, -1, 'repeat', '早振り', '続けて振れるまでの間が短くなる', 3, 200, 2.2, 1111),
  R('b_after', 'b_area', 3, 0, 'perk', '余震', '少し遅れて、もう 1 回小さな波が出る', 1, 900, 1, 1067),
  R('b_knock', 'b_dash', 3, 1, 'repeat', '吹き飛ばし', '波で敵が大きく飛ぶ（玉突きが起きやすい）', 5, 120, 1.6, 1153),
  // ピンボールの枝（緑の側へ）
  R('b_rock', 'b_dash', 3, 2, 'repeat', '台ゆらしの勢い', 'ピンボール：振って台を揺らしたときの勢いの上限が上がる（1 段ごとに +8%）', 8, 80, 1.5, 1066),
  R('b_save', 'b_rock', 4, 2, 'perk', 'ゆらしセーブ', 'ピンボール：フリッパーの下へ落ちかけた球を、振れば 1 回はね上げる（12 秒でまた使える）', 1, 1500, 1, 1111),
  R('b_shock', 'b_save', 5, 2, 'perk', '衝撃バンパー', 'ピンボール：バンパーに当たるたび、青い衝撃波が出てまわりの的に当たる', 1, 7000, 1, 1071),
  R('b_cap', 'b_after', 4, 0, 'cap', '大津波', '青で弱点を突いたときの倍率が 2.5 倍 → 4 倍', 1, 8000, 1, 5509),
];
const green: Omit<Skill, 'branch'>[] = [
  R('g_pow', null, 1, 0, 'repeat', '緑の威力', '引っぱって離したときの貫通ダメージが上がる', 200, 10, 1.19, 1041),
  R('g_launch', 'g_pow', 2, -1, 'repeat', 'はじく勢い', '引っぱって離したときの速さが上がる', 15, 25, 1.4, 1013),
  R('g_long', 'g_pow', 2, 0, 'repeat', '貫通の持続', '貫通が続く時間がのびる', 5, 60, 1.7, 1187),
  R('g_focus', 'g_pow', 2, 1, 'repeat', '集中', '引っぱっている間の時間がもっとゆっくりになる', 3, 100, 2, 1102),
  R('g_bounce', 'g_launch', 3, -1, 'perk', '跳弾', '壁で跳ねるたびに、同じ敵をもう一度貫ける', 1, 900, 1, 1188),
  R('g_smash', 'g_long', 3, 0, 'repeat', '会心', '緑の「SMASH!」の倍率が上がる（1 段ごとに +0.15）', 10, 80, 1.45, 1014),
  R('g_guide', 'g_focus', 3, 1, 'perk', '見切り', '狙いの道すじが長くなり、壁で 4 回まで見える', 1, 400, 1, 1035),
  // ピンボールの枝（黄の側へ）
  R('g_plunger', 'g_focus', 3, 2, 'repeat', '打ち出しの強さ', 'ピンボール：打ち出す勢いと、打ち出したあとのボールセーブが増える', 8, 80, 1.5, 1013),
  R('g_skill', 'g_plunger', 4, 2, 'perk', 'スキルショット', 'ピンボール：打ち出すときの強さのメーターに緑の帯が出る。帯の中で離すと SKILL SHOT（GUM がどっさり・レーンがひとつ点く）', 1, 1500, 1, 1035),
  R('g_pierce', 'g_skill', 5, 2, 'perk', '貫通フリッパー', 'ピンボール：フリッパーで打ち返した球が、しばらく緑の貫通になる', 1, 7000, 1, 1188),
  R('g_cap', 'g_smash', 4, 0, 'cap', '一閃', '緑で弱点を突いたときの倍率が 2.5 倍 → 4 倍', 1, 8000, 1, 5506),
];
const yellow: Omit<Skill, 'branch'>[] = [
  R('y_gum', null, 1, 0, 'repeat', 'GUM ボーナス', '手に入る GUM が増える', 200, 40, 1.3, 'gum'),
  R('y_magnet', 'y_gum', 2, -1, 'repeat', '磁石', 'GUM を吸い寄せる範囲が広がる', 20, 15, 1.33, 1156),
  R('y_swarm', 'y_gum', 2, 0, 'repeat', 'エネミーの数', '1 つの階に出るエネミーが増える（GUM も増える）', 8, 60, 1.75, 1109),
  R('y_size', 'y_gum', 2, 1, 'repeat', 'マレットの大きさ', 'マレットが 1 段ごとに 12% 大きくなる。敵をまるごと覆うとつぶせる', 45, 30, 1.36, 1010),
  R('y_aim', 'y_magnet', 3, -2, 'repeat', 'フリッパーの狙い', 'ピンボールで、自動のフリッパーが敵を狙って打ち返すようになる（1 段ごとに正確に）', 8, 60, 1.7, 1035),
  R('y_mates', 'y_magnet', 3, -1, 'repeat', '仲間ヒーロー', '自動で跳ね回って攻撃する仲間が増える', 6, 200, 4.2, 1033),
  R('y_drop', 'y_swarm', 3, 0, 'repeat', '宝の匂い', 'エクステンションを落としやすくなる', 5, 150, 1.8, 1172),
  R('y_buff', 'y_size', 3, 1, 'repeat', '長い効き目', 'エクステンションの強化が長く続く（1 段ごとに +2 秒）', 5, 120, 1.7, 1137),
  R('y_mateAtk', 'y_mates', 4, -1, 'repeat', '仲間の攻撃力', '仲間のダメージが上がる', 200, 80, 1.24, 1095),
  // ピンボールの枝（赤の側へ）
  R('y_safe', 'y_size', 3, 2, 'repeat', 'セーフティ', 'ピンボール：ボールセーブが 1 秒長く、キックバックが早くまた点く', 5, 100, 1.7, 1137),
  R('y_gate', 'y_safe', 4, 2, 'repeat', '大きな入口', 'ピンボール：ピラミッドの入口が 1 段ごとに 3 秒長く開き、吸い寄せる力が強くなる', 5, 300, 1.8, 1010),
  R('y_pyramid', 'y_gate', 5, 2, 'repeat', 'ピラミッドの延長', 'ピラミッドにいられる時間が 1 段ごとに +1 秒', 10, 600, 1.6, 1030),
  R('y_mega', 'y_pyramid', 6, 2, 'perk', 'メガマルチボール', 'ピンボール：ロック 2 回でマルチボール。出てくる球が +2', 1, 15000, 1, 1033),
  R('y_cap', 'y_drop', 4, 0, 'cap', '大富豪', '手に入る GUM が 2 倍', 1, 12000, 1, 5530),
  R('y_combo', 'y_buff', 4, 1, 'repeat', '連続ボーナス', '連続ヒットで増える GUM の上限が上がる', 5, 300, 1.8, 1030),
];

export const SKILLS: Skill[] = [
  ...red.map((s) => ({ ...s, branch: 'red' as const })),
  ...blue.map((s) => ({ ...s, branch: 'blue' as const })),
  ...green.map((s) => ({ ...s, branch: 'green' as const })),
  ...yellow.map((s) => ({ ...s, branch: 'yellow' as const })),
];
export const SKILL_MAP: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export type Levels = Record<string, number>;
export const lvOf = (l: Levels, id: string): number => l[id] ?? 0;

export function skillCost(sk: Skill, level: number): number {
  return Math.ceil(sk.base * sk.growth ** level);
}

/** 取れる（親を持っている、または中心につながる） */
export function isOpen(l: Levels, sk: Skill): boolean {
  return !sk.parent || lvOf(l, sk.parent) > 0 || lvOf(l, sk.id) > 0;
}
/** 「？」で見せる（親が見えているが、まだ取れない） */
export function isTeaser(l: Levels, sk: Skill): boolean {
  if (isOpen(l, sk)) return false;
  const p = sk.parent ? SKILL_MAP[sk.parent] : null;
  return !!p && isOpen(l, p);
}

/** ツリーの上の位置（マス。中心が 0,0） */
export function nodePos(sk: Skill): { x: number; y: number } {
  const a = (BRANCH_MAP[sk.branch].angle * Math.PI) / 180;
  const r = 1.55 + (sk.depth - 1) * 1.25;
  const px = -Math.sin(a);
  const py = Math.cos(a);
  return { x: Math.cos(a) * r + px * sk.lane * 1.05, y: Math.sin(a) * r + py * sk.lane * 1.05 };
}

/** 前の版の強化（9 種）を、ツリーの段に読みかえる */
const OLD: Record<string, string[]> = {
  atk: ['r_pow', 'b_pow', 'g_pow'], power: ['r_slide'], shake: ['b_shake', 'g_launch'], size: ['y_size'],
  magnet: ['y_magnet'], gum: ['y_gum'], swarm: ['y_swarm'], mates: ['y_mates'], mateAtk: ['y_mateAtk'],
};
export function migrateLevels(up: Levels): Levels {
  if (!Object.keys(up).some((k) => k in OLD)) return up;
  const out: Levels = {};
  for (const [k, v] of Object.entries(up)) {
    if (SKILL_MAP[k]) out[k] = Math.max(out[k] ?? 0, v);
    for (const id of OLD[k] ?? []) out[id] = Math.min(SKILL_MAP[id].max, Math.max(out[id] ?? 0, v));
  }
  // 途中の段だけ持っていても、親を 1 段ずつ持たせて枝がつながるように
  for (const id of Object.keys(out)) {
    let p = SKILL_MAP[id]?.parent;
    while (p) { out[p] = Math.max(out[p] ?? 0, 1); p = SKILL_MAP[p].parent; }
  }
  return out;
}

// ------------------------------------------------------------------ まとめて開放・おまかせ

/** 1 回の強化（id を n 段） */
export interface Step { id: string; n: number }

/** そのスキルまで、まだ持っていない手前のスキルを中心側から順に（自分を含む）。持っていれば空 */
export function pathTo(l: Levels, id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur && lvOf(l, cur) === 0) {
    out.unshift(cur);
    cur = SKILL_MAP[cur].parent;
  }
  return out;
}

/** 手前から 1 段ずつ開けていく値段の合計 */
export function pathCost(l: Levels, id: string): number {
  return pathTo(l, id).reduce((a, s) => a + skillCost(SKILL_MAP[s], 0), 0);
}

/** その枝にこれまで使った GUM */
function spentOn(l: Levels, branch: Branch): number {
  let sum = 0;
  for (const sk of SKILLS) {
    if (sk.branch !== branch) continue;
    for (let i = 0; i < lvOf(l, sk.id); i += 1) sum += skillCost(sk, i);
  }
  return sum;
}

export type AutoMode = 'balance' | 'usage';

/** 枝ごとに GUM をどれだけの割合で使うか。usage：よく当てている色を多めに（黄はいつも 1/4） */
export function autoShares(mode: AutoMode, usage: { red: number; blue: number; green: number }): Record<Branch, number> {
  if (mode === 'balance') return { red: 0.25, blue: 0.25, green: 0.25, yellow: 0.25 };
  const total = usage.red + usage.blue + usage.green;
  const part = (n: number) => (total > 0 ? Math.max(0.06, n / total) : 1 / 3);
  const r = part(usage.red);
  const b = part(usage.blue);
  const g = part(usage.green);
  const k = 0.75 / (r + b + g);
  return { red: r * k, blue: b * k, green: g * k, yellow: 0.25 };
}

/**
 * おまかせ：持っている GUM で、割合が足りていない枝から順に、いちばん安い取れるスキルを上げていく。
 * 返すのは強化の順番（同じスキルが続くところはまとめる）と、使う GUM の合計。
 */
export function autoPlan(levels: Levels, gum: number, mode: AutoMode, usage: { red: number; blue: number; green: number }, maxSteps = 400): { steps: Step[]; cost: number } {
  const l: Levels = { ...levels };
  const shares = autoShares(mode, usage);
  const spent = Object.fromEntries(BRANCHES.map((b) => [b.id, spentOn(l, b.id)])) as Record<Branch, number>;
  const steps: Step[] = [];
  let left = gum;
  for (let i = 0; i < maxSteps; i += 1) {
    let best: { sk: Skill; c: number; score: number } | null = null;
    for (const b of BRANCHES) {
      let cheap: { sk: Skill; c: number } | null = null;
      for (const sk of SKILLS) {
        if (sk.branch !== b.id || !isOpen(l, sk) || lvOf(l, sk.id) >= sk.max) continue;
        const c = skillCost(sk, lvOf(l, sk.id));
        if (c <= left && (!cheap || c < cheap.c)) cheap = { sk, c };
      }
      if (!cheap) continue;
      const score = (spent[b.id] + cheap.c) / shares[b.id];
      if (!best || score < best.score) best = { ...cheap, score };
    }
    if (!best) break;
    left -= best.c;
    spent[best.sk.branch] += best.c;
    l[best.sk.id] = lvOf(l, best.sk.id) + 1;
    const last = steps[steps.length - 1];
    if (last && last.id === best.sk.id) last.n += 1;
    else steps.push({ id: best.sk.id, n: 1 });
  }
  return { steps, cost: gum - left };
}
