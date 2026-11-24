// 数値の決まり：強化の値段と効き目、ステージごとのエネミーの強さと GUM。
// ゲームの手ざわりを変えたいときはここだけを触る。

import type { Hero } from '../core/catalog';

export interface Upgrade {
  key: string;
  name: string;
  desc: string;
  /** 1 段目の値段 */
  base: number;
  /** 1 段ごとの値上がり */
  growth: number;
  max: number;
  icon: 'phy' | 'int' | 'agi' | 'gum' | 'ce';
}

export const UPGRADES: Upgrade[] = [
  { key: 'atk', name: '攻撃力', desc: 'ぶつけたときのダメージ', base: 10, growth: 1.19, max: 999, icon: 'phy' },
  { key: 'power', name: '滑り', desc: '傾けたときの加速と最高速', base: 25, growth: 1.42, max: 15, icon: 'agi' },
  { key: 'shake', name: '振りの勢い', desc: '振ったときに飛び出す速さ', base: 20, growth: 1.38, max: 15, icon: 'agi' },
  { key: 'size', name: 'マレットの大きさ', desc: '当たり判定が大きくなる', base: 40, growth: 1.5, max: 12, icon: 'ce' },
  { key: 'magnet', name: '磁石', desc: 'GUM を吸い寄せる範囲', base: 15, growth: 1.33, max: 20, icon: 'gum' },
  { key: 'gum', name: 'GUM ボーナス', desc: '手に入る GUM が増える', base: 50, growth: 1.3, max: 999, icon: 'gum' },
  { key: 'swarm', name: 'エネミーの数', desc: 'フィールドに出るエネミーが増える', base: 60, growth: 1.75, max: 8, icon: 'int' },
  { key: 'mates', name: '仲間ヒーロー', desc: '自動で跳ね回って攻撃する仲間', base: 200, growth: 4.2, max: 6, icon: 'int' },
  { key: 'mateAtk', name: '仲間の攻撃力', desc: '仲間のダメージ', base: 80, growth: 1.24, max: 999, icon: 'phy' },
];

export const upgradeByKey = (k: string): Upgrade => UPGRADES.find((u) => u.key === k) as Upgrade;

export function cost(u: Upgrade, level: number): number {
  return Math.ceil(u.base * u.growth ** level);
}

export type Levels = Record<string, number>;
const lv = (l: Levels, k: string): number => l[k] ?? 0;

/** ヒーローの能力値で付くボーナス（PHY→攻撃、INT→GUM、AGI→滑り） */
export function heroBonus(h: Hero): { atk: number; gum: number; power: number } {
  return { atk: 1 + h.phy / 250, gum: 1 + h.int / 350, power: 1 + h.agi / 700 };
}

export interface Stats {
  atk: number;
  /** 傾けたときの加速（ユニット/秒²、傾き 1 あたり） */
  accel: number;
  maxSpeed: number;
  shake: number;
  radius: number;
  magnet: number;
  gumMul: number;
  maxEnemies: number;
  mates: number;
  mateAtk: number;
}

export function stats(l: Levels, hero: Hero, extCount: number): Stats {
  const hb = heroBonus(hero);
  const a = lv(l, 'atk');
  const atk = 5 * (1 + 0.3 * a) * 1.07 ** a * hb.atk * (1 + extCount * 0.01);
  const p = lv(l, 'power');
  return {
    atk,
    accel: 1500 * (1 + 0.07 * p) * hb.power,
    maxSpeed: 1900 * (1 + 0.05 * p) * hb.power,
    shake: 900 * (1 + 0.12 * lv(l, 'shake')),
    radius: 24 + 1.8 * lv(l, 'size'),
    magnet: 12 + 14 * lv(l, 'magnet'),
    gumMul: (1 + 0.25 * lv(l, 'gum')) * 1.03 ** lv(l, 'gum') * hb.gum,
    maxEnemies: 4 + lv(l, 'swarm'),
    mates: lv(l, 'mates'),
    mateAtk: atk * 0.35 * (1 + 0.35 * lv(l, 'mateAtk')) * 1.05 ** lv(l, 'mateAtk'),
  };
}

/** 何体倒すとボスが出るか */
export const KILLS_TO_BOSS = 15;

export function enemyHp(stage: number, tier: number): number {
  return 18 * 1.36 ** (stage - 1) * (1 + 0.2 * tier);
}
export function bossHp(stage: number): number {
  return enemyHp(stage, 5) * 12;
}
export function enemyGum(stage: number, tier: number): number {
  return 2 * 1.31 ** (stage - 1) * (1 + 0.15 * tier);
}
export function bossGum(stage: number): number {
  return enemyGum(stage, 5) * 30;
}

/** ぶつかった速さ（ユニット/秒）からダメージの倍率。遅すぎると 0 */
export function impactFactor(speed: number): number {
  if (speed < 90) return 0;
  return Math.min(7, ((speed - 90) / 380) ** 1.1);
}
/** この速さを超えた一撃は「SMASH!」（1.5 倍） */
export const SMASH_SPEED = 1500;

/** ボスが落とすヒーローのレアリティ（ステージが進むほど高いものが出やすい） */
export function heroRarityWeights(stage: number): number[] {
  const s = Math.max(0, stage - 1);
  return [0, 50, 30 + s * 2, 12 + s * 2.5, 4 + s * 2, 1 + s * 1.2];
}
