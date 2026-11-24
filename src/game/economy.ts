// 数値の決まり：強化の値段と効き目、ステージごとのエネミーの強さと GUM。
// ゲームの手ざわりを変えたいときはここだけを触る。

import type { Hero } from '../core/catalog';

import { lvOf as lv, type Levels } from './skills';
import type { Elem } from './elements';

export type { Levels };

/** ヒーローの能力値で付くボーナス（PHY→攻撃、INT→GUM、AGI→滑り） */
export function heroBonus(h: Hero): { atk: number; gum: number; power: number } {
  return { atk: 1 + h.phy / 250, gum: 1 + h.int / 350, power: 1 + h.agi / 700 };
}

/** 威力の段の倍率（序盤は大きく、あとは複利で伸びる） */
const powMul = (n: number): number => (1 + 0.3 * n) * 1.07 ** n;

export interface Stats {
  /** 基本の攻撃力（色の威力をかける前） */
  atk: number;
  /** 色ごとの威力の倍率 */
  colorMul: Record<Elem, number>;
  /** 色ごとの弱点の倍率（到達点で上がる） */
  weakMul: Record<Elem, number>;
  /** 傾き（赤）で出る最大の速さ（ユニット/秒）と、その速さへ寄せる強さ（1/秒） */
  tiltSpeed: number;
  tiltGrip: number;
  /** 振り・はじきで出た勢いが、少しずつ落ちていく先の速さ */
  maxSpeed: number;
  /** 赤：SMASH になる速さ・押しつけの間隔・押しつけの強さ・吸い寄せ・怒涛 */
  smashSpeed: number;
  redInterval: number;
  redPress: number;
  homing: number;
  rush: boolean;
  /** 青：振りの速さ・波の半径・体当たりが青の時間・続けて振れる間（ミリ秒）・余震・吹き飛ばし */
  shake: number;
  area: number;
  blueTime: number;
  shakeCooldown: number;
  aftershock: boolean;
  knock: number;
  /** 緑：はじく速さ・貫通の時間・ゆっくり・跳弾・SMASH の倍率・見切り */
  launch: number;
  greenTime: number;
  slowmo: number;
  ricochet: boolean;
  greenSmash: number;
  guide: boolean;
  /** 黄 */
  /** マレットの半径（1 階での大きさ。下の階では floorScale をかける） */
  radius: number;
  magnet: number;
  gumMul: number;
  /** 1 階ごとに増えるエネミーの数 */
  extraEnemies: number;
  mates: number;
  mateAtk: number;
  dropRate: number;
  buffTime: number;
  comboStep: number;
}

export function stats(l: Levels, hero: Hero, extCount: number): Stats {
  const hb = heroBonus(hero);
  const atk = 5 * hb.atk * (1 + extCount * 0.01);
  const colorMul = { red: powMul(lv(l, 'r_pow')), blue: powMul(lv(l, 'b_pow')), green: powMul(lv(l, 'g_pow')) };
  const p = lv(l, 'r_slide');
  const g = lv(l, 'y_gum');
  return {
    atk,
    colorMul,
    weakMul: { red: lv(l, 'r_cap') ? 4 : 2.5, blue: lv(l, 'b_cap') ? 4 : 2.5, green: lv(l, 'g_cap') ? 4 : 2.5 },
    tiltSpeed: 1300 * (1 + 0.05 * p) * hb.power,
    tiltGrip: 7 * (1 + 0.05 * p),
    maxSpeed: 2100 * (1 + 0.05 * p) * hb.power,
    smashSpeed: 2400 * 0.96 ** lv(l, 'r_crit'),
    redInterval: 0.09 * 0.88 ** lv(l, 'r_rapid'),
    redPress: 0.55 * (1 + 0.15 * lv(l, 'r_press')),
    homing: 0.28 + 0.1 * lv(l, 'r_home'),
    rush: lv(l, 'r_rush') > 0,
    shake: 2300 * (1 + 0.1 * lv(l, 'b_shake')),
    area: 110 * (1 + 0.08 * lv(l, 'b_area')),
    blueTime: 0.4 + 0.15 * lv(l, 'b_dash'),
    shakeCooldown: 320 - 50 * lv(l, 'b_quick'),
    aftershock: lv(l, 'b_after') > 0,
    knock: 380 * (1 + 0.3 * lv(l, 'b_knock')),
    launch: 3600 * (1 + 0.08 * lv(l, 'g_launch')),
    greenTime: 1.6 + 0.3 * lv(l, 'g_long'),
    slowmo: Math.max(0.14, 0.35 - 0.07 * lv(l, 'g_focus')),
    ricochet: lv(l, 'g_bounce') > 0,
    greenSmash: 1.5 + 0.15 * lv(l, 'g_smash'),
    guide: lv(l, 'g_guide') > 0,
    radius: 24 * 1.12 ** lv(l, 'y_size'),
    magnet: 12 + 14 * lv(l, 'y_magnet'),
    gumMul: (1 + 0.25 * g) * 1.03 ** g * hb.gum * (lv(l, 'y_cap') ? 2 : 1),
    extraEnemies: lv(l, 'y_swarm'),
    mates: lv(l, 'y_mates'),
    mateAtk: atk * 0.35 * powMul(lv(l, 'y_mateAtk')),
    dropRate: 0.07 + 0.02 * lv(l, 'y_drop'),
    buffTime: 12 + 2 * lv(l, 'y_buff'),
    comboStep: 0.02 + 0.01 * lv(l, 'y_combo'),
  };
}

// ------------------------------------------------------------------ 15 秒のラン・50 階のピラミッド

/** 1 回のプレイの長さ（秒） */
export const RUN_TIME = 15;
/** 階の数（50 階を突破したら全クリ） */
export const FLOORS = 50;
/** 1 階下りるごとに、フィールドが広くなる割合（マレットはそのぶん小さく見える） */
export const FLOOR_GROW = 1.06;
/** これより速く突破した階は、次のランから免除（とばす） */
export const FAST_CLEAR = 0.1;

/** その階でのものの大きさ（1 階が 1。下の階ほど小さい） */
export const floorScale = (floor: number): number => FLOOR_GROW ** -(floor - 1);
/** 10 階ごとはレイドボス */
export const isRaidFloor = (floor: number): boolean => floor % 10 === 0;
/** その階で最初に出るエネミーの数 */
export const enemiesOnFloor = (floor: number, extra: number): number => 3 + Math.floor(floor / 4) + extra;

/** 次のランを始める階：1 階から続けて「0.1 秒未満」で突破できている階はとばす */
export function startFloor(best: Record<string, number>): number {
  let f = 1;
  while (f < FLOORS && (best[f] ?? Infinity) < FAST_CLEAR) f += 1;
  return f;
}

export function enemyHp(floor: number, tier: number): number {
  return 30 * 1.27 ** (floor - 1) * (1 + 0.2 * tier);
}
export function bossHp(floor: number): number {
  return enemyHp(floor, 5) * (isRaidFloor(floor) ? 20 : 8);
}
export function enemyGum(floor: number, tier: number): number {
  return 2 * 1.24 ** (floor - 1) * (1 + 0.15 * tier);
}
export function bossGum(floor: number): number {
  return enemyGum(floor, 5) * (isRaidFloor(floor) ? 40 : 15);
}

/** ぶつかった速さ（ユニット/秒）からダメージの倍率。遅すぎると 0 */
export function impactFactor(speed: number): number {
  if (speed < 120) return 0;
  return Math.min(12, ((speed - 120) / 380) ** 1.1);
}

/** ボスが落とすヒーローのレアリティ（ステージが進むほど高いものが出やすい） */
export function heroRarityWeights(stage: number): number[] {
  const s = Math.max(0, stage - 1);
  return [0, 50, 30 + s * 2, 12 + s * 2.5, 4 + s * 2, 1 + s * 1.2];
}
