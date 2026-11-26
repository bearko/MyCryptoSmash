// 挑戦のサイクル（ノルマ・入金口・エンブレム・ラストステージ・エンドレス）。数値と判定だけをまとめた純粋なモジュール。
//
// 主人公は古いゲームコーナーの部屋に閉じこめられ、呪われたピンボールで GUM を稼いで「入金口」にノルマを納める。
// - 挑戦のはじめはチュートリアルのノルマ 0（納品額 50・3 プレイ。GAME OVER にはならない。tutorialState）。
// - 本編は 10 ノルマ。納品額は 200 から毎回 4 倍。各ノルマは 3 プレイ以内に納める。
// - 3 プレイ目のあとで手持ちの GUM が足りなければ GAME OVER（挑戦の進みを失い、スキルツリーと設定と図鑑だけが残る）。
// - ノルマ 10 を納めたとき、台に宿るピエロがジョーカーなら、ラストステージ（ボスラッシュ。3 回まで）。
//   突破すると真のエンディング（脱出）。そのあとはエンドレス：ノルマは 4 倍のまま終わりなく続き、ピラミッドが開く。
// - ジョーカーでなければ、通常のエンディング（部屋から出られるが、台は完成していないので話題にはならない）。
//   スキルツリーを持って最初からやり直す（エンドレスは開かない。使い残したエンブレムは持ちこせる）。
// - 通貨は 2 つ：GUM（納品とリロール）・エンブレム（ショップ・マレット・スキルツリー）。
// - マレットのレベル（基礎ポイント）：エンブレムで鍛える。挑戦の間だけ（GAME OVER で 1 に戻る）。全部の球の GUM の基本額に掛かる。
// 画面は main.ts の showResult（入金口）と、ui/home.ts（ショップ）。

import type { Save } from '../core/save';
import { CLOWN_STEPS, TUTORIAL_PARTS, clownTier, toyCount, tutorialAfter, tutorialShop, type ToyId } from './toys';
import { slotsOf, totalsOf } from './mods';
import { dropExt, fitSlots } from './stack';

/** 本編のノルマの数 */
export const QUOTAS = 10;
/** 1 つのノルマに使えるプレイの数 */
export const QUOTA_PLAYS = 3;
/** 1 つ目のノルマの納品額と、ノルマごとの伸び */
export const QUOTA_BASE = 200;
export const QUOTA_GROWTH = 4;
/**
 * チュートリアルのノルマ（ノルマ 0）の納品額（ユーザーの指定）。3 プレイで、1 プレイごとのエンブレムで部品を 1 つずつ買って台を育てる。
 * 3 プレイ目のあとに納める。足りなくても GAME OVER にはせず、ピエロが足りない分をおまけして通す（deliver の gift）
 */
export const TUTORIAL_QUOTA = 50;

/** 挑戦の状態（セーブに持つ） */
export interface Challenge {
  /** いまのノルマ（0 はチュートリアル・1〜10。11 なら全部納めた） */
  n: number;
  /** この挑戦のノルマ 0 は案内つき（はじめての挑戦。3 プレイして③④⑦を 1 つずつ買う流れを守る） */
  guide?: boolean;
  /** 案内つきのチュートリアルを納めたばかり（本当のノルマ 1 の 1 プレイ目を始めるまで。ピエロの「本当のノルマへ」のセリフ） */
  tutJust?: boolean;
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
  /** この挑戦で遊んだプレイの数（エンディングの記録） */
  plays: number;
  /** この挑戦でいちばん大きかった 1 プレイの GUM（エンディングの記録） */
  bestGum: number;
  /** ラストステージに挑んでいる（ノルマの代わりにボスラッシュ） */
  final: boolean;
  /** ラストステージに挑んだ回数（始めた時点で数える。FINAL_TRIES で GAME OVER） */
  finalPlayed: number;
  /** 「あとで選ぶ」で取っておいた Limited の候補（次に納めたときの候補に加わる）と、持ちこした選ぶ権利 */
  saved?: number[];
  later?: number;
  /** いま出ている Limited の候補（閉じて開き直しても同じ札が並ぶ。選ぶ・あとで選ぶで消える） */
  offer?: number[];
  /** Limited で選んだあと、まだ選んでいないヒートの印の数（閉じて開き直したら選ぶ画面を出す） */
  heatLeft?: number;
  /** 次に選ぶ Limited が 2 回発動する（Limited「真・劇作家の羽ペン」） */
  doubleNext?: number;
  /** 壊れものが直った回数（Limited「アテーナー・アイギス」） */
  repaired?: number;
  /** マレットのレベル（1 から。基礎ポイント malletPts。GAME OVER で 1 に戻る） */
  mallet?: number;
}

export const freshChallenge = (): Challenge => ({ n: 0, played: 0, rerolls: 0, picks: 0, cards: 0, extra: 0, plays: 0, bestGum: 0, final: false, finalPlayed: 0 });

/** ラストステージに挑める回数 */
export const FINAL_TRIES = 3;

/** ノルマ n の納品額：（0 はチュートリアルの 50）200, 800, 3200, …（ノルマ 11 から先も 4 倍で続く） */
export const quotaAmount = (n: number): number => (n <= 0 ? TUTORIAL_QUOTA : QUOTA_BASE * QUOTA_GROWTH ** (n - 1));

/**
 * エンブレム：1 プレイごとに +1、ノルマ n の達成で 8 ＋ 2（n − 1）（ノルマ 1 で 8、ノルマ 10 で 26。チュートリアルは TUTORIAL_REWARD）、余らせたプレイ 1 つにつき +2。
 * 台の部品をエンブレムで買い足すようになったので、部品の値段の合計（およそ 40）に近いぶん、前の 5 ＋ 2（n − 1）から 3 ずつ上げた
 */
export const EMBLEM_PER_PLAY = 1;
export const EMBLEM_PER_QUOTA = 8;
export const EMBLEM_PER_SPARE = 2;
export const EMBLEM_QUOTA_STEP = 2;
/**
 * チュートリアル（ノルマ 0）を納めたときのエンブレム。本当のノルマ 1 の台を、部品とマレットで育てはじめられる数
 * （台は部品を買い足すので、ノルマ 1 の 5 より多い）
 */
export const TUTORIAL_REWARD = 8;
export const quotaReward = (n: number): number => (n <= 0 ? TUTORIAL_REWARD : EMBLEM_PER_QUOTA + EMBLEM_QUOTA_STEP * Math.max(0, n - 1));
export const quotaEmblems = (spare: number, n = 1): number => quotaReward(n) + EMBLEM_PER_SPARE * Math.max(0, spare);

/** リロールの値段（GUM）：10 から 1 回ごとに 2 倍 */
export const rerollCost = (rerolls: number): number => 10 * 2 ** Math.max(0, rerolls);
/** いまのリロールの値段（Limited で変わる：いつも 10・×2）。引き直しができなければ Infinity */
export function rerollPrice(s: Save): number {
  const t = totalsOf([], s.limited ?? []);
  if (t.rerollOff > 0) return Infinity;
  if (t.rerollFixed > 0) return 10;
  return rerollCost(s.quota.rerolls) * 2 ** t.rerollPow;
}

/** ショップのエクステンションの値段（エンブレム）：★1〜★5（stack.ts） */
export { EXT_PRICE, extPrice, extSell } from './stack';

// ------------------------------------------------------------------ マレットのレベル（基礎ポイント）
/** マレットのいちばん高いレベル */
export const MALLET_MAX = 20;
/**
 * 基礎ポイント（レベル 1〜20）：1 回の当たりの GUM の基本額のもと。Lv 1 の 10 を 1 倍として、全部の球（控えもふくむ）の基本額に掛かる。
 * はじめはゆっくり、レベルが上がるほど伸びが大きい（Lv 8 から だいたい ×1.4 ずつ）
 */
export const MALLET_PTS = [10, 15, 20, 25, 30, 40, 50, 70, 100, 140, 200, 280, 400, 560, 800, 1100, 1600, 2200, 3100, 4400];
export const malletLv = (s: Pick<Save, 'quota'>): number => Math.max(1, Math.min(MALLET_MAX, Math.round(s.quota?.mallet ?? 1)));
/** 基礎ポイント（表示の数）と、GUM の基本額に掛かる倍率（Lv 1 が 1） */
export const malletPoints = (lv: number): number => MALLET_PTS[Math.max(1, Math.min(MALLET_MAX, Math.round(lv))) - 1];
export const malletPts = (lv: number): number => malletPoints(lv) / MALLET_PTS[0];
/** レベル lv から 1 つ上げる値段（エンブレム）：レベルとともに上がる */
export const malletPrice = (lv: number): number => Math.max(1, Math.round(lv));
/** マレットを鍛える（エンブレムが足りて、まだ上げられれば true） */
export function buyMallet(s: Save, discount = 0): boolean {
  const lv = malletLv(s);
  if (lv >= MALLET_MAX) return false;
  const price = Math.max(1, malletPrice(lv) - discount);
  if (s.emblems < price) return false;
  s.emblems -= price;
  s.quota.mallet = lv + 1;
  return true;
}

/** 装備の枠：はじめの数・いちばん多い数・1 つ広げる値段（エンブレム） */
export const EXT_SLOTS_START = 3;
export const HERO_SLOTS_START = 1;
export const SLOTS_MAX = 5;
export const EXT_SLOT_PRICE = 6;
export const HERO_SLOT_PRICE = 8;

export interface QuotaStatus {
  /** ラストステージ（ノルマはなく、left は挑めるのこりの回数） */
  final: boolean;
  /** 納品額 */
  need: number;
  /** 残りのプレイ（ラストステージでは、挑めるのこりの回数） */
  left: number;
  /** 手持ちで納められる */
  canPay: boolean;
  /** もう遊べないので、納めるしかない */
  mustPay: boolean;
  /** 遊べるプレイがなく、足りない：GAME OVER */
  over: boolean;
}
export function quotaStatus(c: Challenge, gum: number): QuotaStatus {
  if (c.final) {
    const left = Math.max(0, FINAL_TRIES - c.finalPlayed);
    return { final: true, need: 0, left, canPay: false, mustPay: false, over: left === 0 };
  }
  const need = quotaAmount(c.n);
  const left = Math.max(0, QUOTA_PLAYS - c.played);
  if (c.n <= 0) {
    // チュートリアル：GAME OVER はない。3 プレイ目のあとは足りなくても納められる（ピエロのおまけ）。
    // 案内つき（はじめての挑戦）は 3 プレイ遊んでから納める。2 回目からは 50 に届けば早く納めてよい
    const canPay = left === 0 || (!c.guide && gum >= need);
    return { final: false, need, left, canPay, mustPay: left === 0, over: false };
  }
  const canPay = gum >= need;
  return { final: false, need, left, canPay, mustPay: canPay && left === 0, over: !canPay && left === 0 };
}

/** 遊べるか（プレイが残っているか。ラストステージなら挑める回数が残っているか） */
export function canPlay(c: Challenge, gum: number): boolean {
  return quotaStatus(c, gum).left > 0;
}

/** プレイを始めた：プレイを 1 つ使い（ラストステージなら挑んだ回数を 1 つ）、エンブレム +1 */
export function startPlay(s: Save): void {
  s.quota.tutJust = false;
  if (s.quota.final) s.quota.finalPlayed += 1;
  else s.quota.played += 1;
  s.quota.plays += 1;
  s.emblems += playEmblems(s);
}
/** 1 プレイのエンブレム：1 ＋ Limited（時は金なり） */
export const playEmblems = (s: Save): number => Math.max(0, EMBLEM_PER_PLAY + totalsOf([], s.limited ?? []).emblemPlay);
/** スキル「納品のごほうび」：1 段ごとの納品のエンブレムと、いちばん多い段 */
export const QUOTA_SKILL_PER = 3;
export const QUOTA_SKILL_MAX = 5;
/** 納品のエンブレムのおまけ：Limited（金魚すくいのおまけ）＋ スキル「納品のごほうび」（1 段ごとに +3） */
export const quotaBonus = (s: Save): number => totalsOf([], s.limited ?? []).emblemQuota + QUOTA_SKILL_PER * Math.min(QUOTA_SKILL_MAX, s.up?.y_pyramid ?? 0);
/** いちばん稼いだ出どころが同じプレイの続き（エクステンション「育つ卵」）。プレイのあとに呼ぶ */
export function commitFocus(s: Save, src: string | null | undefined): void {
  if (!src) return;
  s.focus = s.focus?.src === src ? { src, n: s.focus.n + 1 } : { src, n: 1 };
}
/**
 * プレイのあとの発表が決まった：育つエクステンションの育ちを残し、壊れた品を装備から消し、生んだエンブレムを足す。
 * 壊れた品の数を返す
 */
export function commitPlay(s: Save, r: { grow: Record<number, number>; broke: number[]; emblems: number; repaired?: number }): number {
  s.extGrow ??= {};
  for (const [id, g] of Object.entries(r.grow)) s.extGrow[id] = g;
  if (r.repaired) s.quota.repaired = (s.quota.repaired ?? 0) + r.repaired;
  // Limited「真・雨夜手拍子」：壊れるたびにエンブレム
  s.emblems += r.broke.length * totalsOf([], s.limited ?? []).fragileEmblem;
  for (const id of r.broke) dropExt(s, id);
  // 枠を広げる品が壊れて枠が減ったら、はみ出した品を右から売る
  if (r.broke.length) fitSlots(s, slotsOf(s).ext, totalsOf([], s.limited ?? []).sellFull > 0);
  s.emblems += Math.max(0, Math.round(r.emblems));
  return r.broke.length;
}
export { dropExt } from './stack';
/** プレイの GUM を記録する（いちばん大きかった GUM） */
export function recordPlay(s: Save, gum: number): void {
  s.quota.bestGum = Math.max(s.quota.bestGum ?? 0, gum);
}

/** ジョーカー（ピエロのいちばん上の姿） */
export const JOKER_TIER = CLOWN_STEPS.length - 1;
/** ラストステージが始まるか：本編で、ノルマ 10 を納めたときに、ピエロがジョーカーなら */
export const finalReady = (delivered: number, tier: number, endless: boolean): boolean => !endless && delivered >= QUOTAS && tier >= JOKER_TIER;
/** 通常のエンディングか：本編で、ノルマ 10 を納めたときに、ピエロがジョーカーでなければ */
export const normalEnd = (delivered: number, tier: number, endless: boolean): boolean => !endless && delivered >= QUOTAS && tier < JOKER_TIER;

/**
 * 入金口へ納める。納めたら結果を返す（エンブレムと Limited を選ぶ権利が増え、次のノルマへ）。
 * ノルマ 10 のとき：ジョーカーならラストステージ（final）、そうでなければ通常のエンディング（ending。Limited は選ばない）
 */
export function deliver(s: Save): { emblems: number; spare: number; need: number; final: boolean; ending: boolean; tutorial: boolean; gift: number } | null {
  const st = quotaStatus(s.quota, s.gum);
  if (st.final || !st.canPay) return null;
  const spare = st.left;
  const n = s.quota.n;
  const emblems = quotaEmblems(spare, n) + quotaBonus(s);
  if (n <= 0) {
    // チュートリアル：手持ちから納め、足りない分はピエロのおまけ。Limited は選ばない。余った GUM を持って本当のノルマ 1 へ
    const paid = Math.min(Math.max(0, s.gum), st.need);
    s.gum -= paid;
    s.emblems += emblems;
    s.quota.tutJust = !!s.quota.guide;
    s.quota.guide = false;
    s.quota.n = 1;
    s.quota.played = 0;
    s.tutorialDone = true;
    return { emblems, spare, need: st.need, final: false, ending: false, tutorial: true, gift: st.need - paid };
  }
  s.gum -= st.need;
  s.emblems += emblems;
  s.quota.n += 1;
  s.quota.played = 0;
  s.quota.picks += 1 + s.quota.extra + (s.quota.later ?? 0);
  s.quota.extra = 0;
  s.quota.later = 0;
  s.quota.cards += spare;
  if (s.endless) s.endlessBest = Math.max(s.endlessBest ?? 0, n);
  const tier = clownTier(toyCount(s.toys));
  const final = finalReady(n, tier, s.endless);
  if (final) { s.quota.final = true; s.quota.finalPlayed = 0; }
  const ending = normalEnd(n, tier, s.endless);
  if (ending) {
    // 部屋から出る：Limited は選ばない。記録を残し、エンディングを見たら最初から（clearChallenge）
    s.quota.picks = 0;
    s.pendingNormal = true;
    s.clearRecord = { name: s.name, plays: s.quota.plays, bestGum: s.quota.bestGum, tier };
  }
  return { emblems, spare, need: st.need, final, ending, tutorial: false, gift: 0 };
}

/**
 * 通常のエンディングを見終えた：スキルツリーを持って最初からやり直す（エンドレスは開かない）。
 * 使い残したエンブレムは持ちこせる（ラボのスキルツリーやショップで使える）。持ちこしたエンブレムを返す
 */
export function clearChallenge(s: Save): number {
  const keep = Math.max(0, s.emblems);
  s.clears = (s.clears ?? 0) + 1;
  s.pendingNormal = false;
  resetChallenge(s, false);
  s.emblems = keep;
  return keep;
}

/**
 * ラストステージの結果。突破すれば脱出（記録を残し、エンドレスが開く。ノルマは続きから 4 倍で続く）。
 * 失敗して挑める回数が残っていなければ 'over'（GAME OVER）。
 */
export function finalResult(s: Save, won: boolean): 'escape' | 'retry' | 'over' {
  const c = s.quota;
  if (!c.final) return 'retry';
  if (won) {
    c.final = false;
    c.finalPlayed = 0;
    c.played = 0;
    s.escapes = (s.escapes ?? 0) + 1;
    s.endless = true;
    s.escapeRecord = { name: s.name, plays: c.plays, bestGum: c.bestGum };
    return 'escape';
  }
  return c.finalPlayed >= FINAL_TRIES ? 'over' : 'retry';
}

/** Limited の候補の数（3 枚に、早く納めた・掟を破った分を足す） */
export const limitedCards = (c: Challenge): number => 3 + c.cards;

/**
 * GAME OVER：挑戦の進みを失う。GUM・エンブレム・買ったエクステンションと装備・買った仕掛け（ギミック）・Limited・広げた枠・ショップの品ぞろえ。
 * ヒーローは、はじめのヒーロー（starter）だけに戻る（ガチャで出たヒーローは挑戦の間だけ）。
 * 残るのはスキルツリー（up）・設定・図鑑の記録（exts・heroDex など）・プレイヤー名・脱出の記録。
 * endless：エンドレスを最初から（脱出したことがあるときだけ選べる。ピラミッドが開き、ラストステージはない）
 */
export function resetChallenge(s: Save, endless = false): void {
  s.endless = endless && (s.escapes ?? 0) > 0;
  s.gum = 0;
  s.emblems = 0;
  s.equip = [];
  s.stack = {};
  s.limited = [];
  s.extSlots = EXT_SLOTS_START;
  s.heroSlots = HERO_SLOTS_START;
  // ガチャで出たヒーローは挑戦の間だけ：はじめのヒーローだけに戻す（図鑑 heroDex には残る）
  const first = s.starter ?? s.heroes[0] ?? s.hero;
  s.heroDex = [...new Set([...(s.heroDex ?? []), ...s.heroes])];
  s.heroes = [first];
  s.hero = first;
  s.party = [first];
  s.shop = [];
  s.capsules = [];
  s.toys = [];
  s.toyShop = [];
  s.extGrow = {};
  s.heat = [];
  s.focus = undefined;
  s.pendingGum = 0;
  s.pinDeepest = 1;
  s.quota = freshChallenge();
  // ノルマ 0（チュートリアル）は毎回の挑戦の最初にある。案内のセリフと手順は、はじめての挑戦だけ
  s.quota.guide = !s.tutorialDone;
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
  const price = rerollPrice(s);
  if (!Number.isFinite(price) || s.gum < price) return false;
  s.gum -= price;
  s.quota.rerolls += 1;
  return true;
}

// ------------------------------------------------------------------ チュートリアル（ノルマ 0）
/**
 * チュートリアルの場面（ピエロのセリフの鍵。clown-lines.ts の TUTORIAL_LINES）。案内つき（はじめての挑戦）の流れ：
 * launch（1 プレイ目の前）→ 1 プレイ → sling（③を買う）→ again → 2 プレイ → inlane（④を買う）→ again → 3 プレイ →
 * deposit（入金口に 50 GUM を納める。足りなければピエロのおまけ）→ ノルマ 1 へ → bumper（ごほうびのエンブレムで⑦を買う）→
 * start（本当のノルマのはじめ。1 プレイ目を打ち出すと案内はおしまい）
 */
export type TutorialKey = 'launch' | 'sling' | 'inlane' | 'bumper' | 'again' | 'deposit' | 'start';
export interface TutorialState {
  /** いまチュートリアル（ノルマ 0）か。納めた直後（bumper・start）は、ノルマ 1 でも true */
  active: boolean;
  /** 案内つき（はじめての挑戦）。false ならセリフも光らせる案内も出さない */
  guided: boolean;
  /** 遊んだプレイの数（0〜3） */
  step: number;
  /** 次に買う部品（ショップで光らせる。なければ null） */
  next: ToyId | null;
  /** ピエロのセリフの鍵（案内つきでなければ null） */
  key: TutorialKey | null;
  /** 納品額と手持ちの GUM */
  need: number;
  gum: number;
  /** 案内つきで、まだ次の部品を買っていない：ほかの買い物（エクステンション・マレットなど）を止める */
  shopLocked: boolean;
}
/** チュートリアルの状態（画面の案内に使う。純粋） */
export function tutorialState(s: Save): TutorialState {
  const c = s.quota;
  const guided = !!c.guide;
  const base = { step: Math.min(QUOTA_PLAYS, c.played), need: TUTORIAL_QUOTA, gum: s.gum };
  if (c.n !== 0 || c.final) {
    // 案内つきのチュートリアルを納めた直後：ごほうびのエンブレムで⑦を買い、本当のノルマ 1 へ
    const just = !!c.tutJust && c.n === 1 && c.played === 0 && !c.final;
    const next = just ? tutorialAfter(s)[0] ?? null : null;
    const key: TutorialKey | null = just ? (next ? next as TutorialKey : 'start') : null;
    return { ...base, step: just ? QUOTA_PLAYS : base.step, active: just, guided: just, next, key, shopLocked: just && !!next };
  }
  const next = tutorialShop(s)[0] ?? null;
  let key: TutorialKey;
  if (next) key = next as TutorialKey;
  else if (c.played >= QUOTA_PLAYS) key = 'deposit';
  else if (c.played === 0) key = 'launch';
  else key = 'again';
  return { ...base, active: true, guided, next, key: guided ? key : null, shopLocked: guided && !!next };
}
/** 案内をとばす（はじめての挑戦でも、ふつうのチュートリアルのノルマ 0 として遊ぶ。納めた直後なら、そのままノルマ 1） */
export function skipTutorial(s: Save): void {
  s.quota.guide = false;
  s.quota.tutJust = false;
}
/** チュートリアルの部品をすべて持っているか */
export const tutorialPartsDone = (s: Pick<Save, 'toys'>): boolean => TUTORIAL_PARTS.every((id) => s.toys.includes(id));
