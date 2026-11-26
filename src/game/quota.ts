// 挑戦のサイクル（ノルマ・入金口・エンブレム）。数値と判定だけをまとめた純粋なモジュール。
//
// 主人公は古いゲームコーナーの部屋に閉じこめられ、呪われたピンボールで GUM を稼いで「入金口」にノルマを納める。
// - 本編は 10 ノルマ。納品額は 200 から毎回 4 倍。各ノルマは 3 プレイ以内に納める。
// - 3 プレイ目のあとで手持ちの GUM が足りなければ GAME OVER（挑戦の進みを失い、スキルツリーと設定と図鑑だけが残る）。
// - 通貨は 2 つ：GUM（納品とリロール）・エンブレム（ショップとスキルツリー）。
// 画面は main.ts の showResult（入金口）と、ui/home.ts（ショップ）。

import type { Save } from '../core/save';

/** 本編のノルマの数 */
export const QUOTAS = 10;
/** 1 つのノルマに使えるプレイの数 */
export const QUOTA_PLAYS = 3;
/** 1 つ目のノルマの納品額と、ノルマごとの伸び */
export const QUOTA_BASE = 200;
export const QUOTA_GROWTH = 4;

/** 挑戦の状態（セーブに持つ） */
export interface Challenge {
  /** いまのノルマ（1〜10。11 なら全部納めた） */
  n: number;
  /** このノルマで遊んだプレイの数（プレイを始めた時点で数える） */
  played: number;
  /** リロールした回数（ショップと Limited で共有。挑戦が終わるまで戻らない） */
  rerolls: number;
  /** まだ選んでいない Limited の数（ノルマ達成のごほうび） */
  picks: number;
  /** 次の Limited を選ぶときの候補の追加（ボス台の掟を破った・早く納めた） */
  cards: number;
  /** 次に納めたときに、もう 1 つ選べる Limited の数（取引のごほうび） */
  extra: number;
}

export const freshChallenge = (): Challenge => ({ n: 1, played: 0, rerolls: 0, picks: 0, cards: 0, extra: 0 });

/** ノルマ n の納品額：200, 800, 3200, … */
export const quotaAmount = (n: number): number => QUOTA_BASE * QUOTA_GROWTH ** (Math.max(1, Math.min(QUOTAS, n)) - 1);

/** エンブレム：1 プレイごとに +1、ノルマ n の達成で 3 ＋（n − 1）（ノルマ 1 で 3、ノルマ 10 で 12）、余らせたプレイ 1 つにつき +2 */
export const EMBLEM_PER_PLAY = 1;
export const EMBLEM_PER_QUOTA = 3;
export const EMBLEM_PER_SPARE = 2;
export const quotaReward = (n: number): number => EMBLEM_PER_QUOTA + Math.max(0, Math.min(QUOTAS, n) - 1);
export const quotaEmblems = (spare: number, n = 1): number => quotaReward(n) + EMBLEM_PER_SPARE * Math.max(0, spare);

/** リロールの値段（GUM）：10 から 1 回ごとに 2 倍 */
export const rerollCost = (rerolls: number): number => 10 * 2 ** Math.max(0, rerolls);

/** ショップのエクステンションの値段（エンブレム）：★1〜★5 */
export const EXT_PRICE = [3, 4, 5, 6, 8];
export const extPrice = (rarity: number): number => EXT_PRICE[Math.max(1, Math.min(5, rarity)) - 1];
export const extSell = (rarity: number): number => Math.floor(extPrice(rarity) / 2);

/** 装備の枠：はじめの数・いちばん多い数・1 つ広げる値段（エンブレム） */
export const EXT_SLOTS_START = 3;
export const HERO_SLOTS_START = 1;
export const SLOTS_MAX = 5;
export const EXT_SLOT_PRICE = 6;
export const HERO_SLOT_PRICE = 8;

export interface QuotaStatus {
  /** すべて納めた */
  cleared: boolean;
  /** 納品額 */
  need: number;
  /** 残りのプレイ */
  left: number;
  /** 手持ちで納められる */
  canPay: boolean;
  /** もう遊べないので、納めるしかない */
  mustPay: boolean;
  /** 遊べるプレイがなく、足りない：GAME OVER */
  over: boolean;
}
export function quotaStatus(c: Challenge, gum: number): QuotaStatus {
  if (c.n > QUOTAS) return { cleared: true, need: 0, left: QUOTA_PLAYS, canPay: false, mustPay: false, over: false };
  const need = quotaAmount(c.n);
  const left = Math.max(0, QUOTA_PLAYS - c.played);
  const canPay = gum >= need;
  return { cleared: false, need, left, canPay, mustPay: canPay && left === 0, over: !canPay && left === 0 };
}

/** 遊べるか（ノルマが残っていて、プレイが残っているか、すべて納めたあと） */
export function canPlay(c: Challenge, gum: number): boolean {
  const s = quotaStatus(c, gum);
  return s.cleared || s.left > 0;
}

/** プレイを始めた：プレイを 1 つ使い、エンブレム +1 */
export function startPlay(s: Save): void {
  if (s.quota.n <= QUOTAS) s.quota.played += 1;
  s.emblems += EMBLEM_PER_PLAY;
}

/** 入金口へ納める。納めたら true（エンブレムと Limited を選ぶ権利が増え、次のノルマへ） */
export function deliver(s: Save): { emblems: number; spare: number; need: number } | null {
  const st = quotaStatus(s.quota, s.gum);
  if (st.cleared || !st.canPay) return null;
  const spare = st.left;
  const emblems = quotaEmblems(spare, s.quota.n);
  s.gum -= st.need;
  s.emblems += emblems;
  s.quota.n += 1;
  s.quota.played = 0;
  s.quota.picks += 1 + s.quota.extra;
  s.quota.extra = 0;
  s.quota.cards += spare;
  return { emblems, spare, need: st.need };
}

/** Limited の候補の数（3 枚に、早く納めた・掟を破った分を足す） */
export const limitedCards = (c: Challenge): number => 3 + c.cards;

/**
 * GAME OVER：挑戦の進みを失う。GUM・エンブレム・買ったエクステンションと装備・買った仕掛け（ギミック）・Limited・広げた枠・ショップの品ぞろえ。
 * 残るのはスキルツリー（up）・設定・図鑑の記録（exts・heroes など）。
 */
export function resetChallenge(s: Save): void {
  s.gum = 0;
  s.emblems = 0;
  s.owned = [];
  s.equip = [];
  s.limited = [];
  s.extSlots = EXT_SLOTS_START;
  s.heroSlots = HERO_SLOTS_START;
  s.party = [s.hero];
  s.shop = [];
  s.toys = [];
  s.toyShop = [];
  s.extRuns = {};
  s.pendingGum = 0;
  s.pinDeepest = 1;
  s.quota = freshChallenge();
}

/** 枠を 1 つ広げる（エンブレムが足りて、まだ広げられれば true） */
export function buySlot(s: Save, kind: 'ext' | 'hero'): boolean {
  const price = kind === 'ext' ? EXT_SLOT_PRICE : HERO_SLOT_PRICE;
  const cur = kind === 'ext' ? s.extSlots : s.heroSlots;
  if (cur >= SLOTS_MAX || s.emblems < price) return false;
  s.emblems -= price;
  if (kind === 'ext') s.extSlots += 1;
  else s.heroSlots += 1;
  return true;
}

/** リロールを払う（GUM が足りれば true。回数は挑戦の間ずっと増える） */
export function payReroll(s: Save): boolean {
  const price = rerollCost(s.quota.rerolls);
  if (s.gum < price) return false;
  s.gum -= price;
  s.quota.rerolls += 1;
  return true;
}
