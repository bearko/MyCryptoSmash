// 1 人のブラウザに保存するセーブ。読めない・書けない環境でもゲームは動く。

import { EXT_SLOTS_START, HERO_SLOTS_START, QUOTAS, freshChallenge, type Challenge } from '../game/quota';
import { PART_TOYS, type ToyId } from '../game/toys';
import { migrateInventory, type StackEntry } from '../game/stack';
import type { Capsule } from '../game/gacha';

export interface Settings {
  tiltSens: number; // 傾きの感度（0.4〜2）
  shakeSens: number; // 振りの感度（0.4〜2。大きいほど弱い振りで反応）
  invertShake: boolean;
  invertTilt: boolean;
  mute: boolean;
  /** BGM と効果音の大きさ（0〜1。ないときは 1） */
  bgmVol?: number;
  seVol?: number;
  vibrate: boolean;
  /** 実況の声 */
  voice: boolean;
  /** フィールドの形（四角／楕円） */
  fieldShape: 'rect' | 'oval';
  /** 攻撃の届く範囲を広めにとる（角の敵に当てやすく） */
  wideHit: boolean;
  /** はじめて球が触れた部品に名前の札を出す */
  partTags: boolean;
  /** 切ってある台の仕掛け（toys.ts の ToyId。持っている仕掛けを切るためだけ） */
  toysOff?: string[];
}
export interface Save {
  v: 1;
  gum: number;
  totalGum: number;
  stage: number;
  best: number;
  kills: number;
  up: Record<string, number>;
  heroes: number[];
  hero: number;
  exts: number[];
  /** 色ごとに当てた回数（スキルツリーの「よく使う操作を中心に」で使う） */
  usage: { red: number; blue: number; green: number };
  /** 階ごとのいちばん速い突破タイム（秒） */
  floorBest: Record<string, number>;
  /** いちばん深く進んだ階 */
  deepest: number;
  /** 50 階を突破した */
  allClear: boolean;
  /** ピンボール：この挑戦でいちばん先まで進んだ台（次はここから。GAME OVER で 1 に戻る） */
  pinDeepest: number;
  /** ピンボール：これまでにいちばん先まで進んだ台（図鑑の記録。GAME OVER でも残る） */
  pinRecord: number;
  /** エンブレム（ショップとスキルツリーで使う。GAME OVER で失う） */
  emblems: number;
  /** 挑戦（ノルマ）の状態 */
  quota: Challenge;
  /** 装備の枠の数（エクステンション 3〜5・ヒーロー 1〜5。ショップでエンブレムを払って広げる） */
  extSlots: number;
  heroSlots: number;
  /** エンドレスモード（脱出したあと。ピラミッドが開き、ノルマは終わりなく続く。本編では false） */
  endless: boolean;
  /** 脱出した回数（エンディングを見た。1 回でもあれば GAME OVER のあと「エンドレスを最初から」を選べる） */
  escapes: number;
  /** エンドレスでいちばん先まで納めたノルマ */
  endlessBest: number;
  /** ラストステージを突破したが、まだエンディングを見ていない（途中で閉じたら、次に開いたときに見せる） */
  pendingEnding?: boolean;
  /** ジョーカーでないままノルマ 10 を納めた（通常のエンディング）が、まだ見ていない。見たら最初からやり直す */
  pendingNormal?: boolean;
  /** 通常のエンディングで部屋を出た回数と、いちばん最近の記録 */
  clears?: number;
  clearRecord?: { name: string; plays: number; bestGum: number; tier: number };
  /** いちばん最近の脱出の記録（プレイヤー名・かかったプレイ数・いちばん大きかった GUM） */
  escapeRecord?: { name: string; plays: number; bestGum: number };
  /** ピンボール：いちばん大きかった GUM の倍率 */
  pinBestMul: number;
  /** 球がはじめて触れた部品（名前の札を 1 回だけ出す） */
  seenParts: string[];
  /** 装備しているエクステンション（ID。左から。持てるのは装備の枠の分だけ）・集めた Limited（挑戦の間は外せない） */
  equip: number[];
  limited: number[];
  /** 装備のエクステンションの点と払ったエンブレム（シリーズごと。重ねると点が合計される。stack.ts） */
  stack?: Record<string, StackEntry>;
  /** ヒーローの装備（先頭がリーダー＝自分のマレット。heroSlots 人まで） */
  party: number[];
  /** この挑戦で買った台のギミック（基本の部品と大きな仕掛け。はじめの台は打ち出しとフリッパーだけ。GAME OVER で失う） */
  toys: ToyId[];
  /** チュートリアル（ノルマ 0）を一度納めた（2 回目の挑戦からは案内を出さない） */
  tutorialDone?: boolean;
  /** 台の部品を買い足すしくみに移った印（前の版の挑戦の途中のセーブに、前の台の部品を 1 回だけ足した） */
  partsV?: number;
  /** ギミックの候補（プレイが終わるごとに入れ替わる） */
  toyShop: ToyId[];
  /** ショップの品ぞろえ（プレイが終わるごとに入れ替わる） */
  shop: number[];
  /** ショップの 4 段目に並ぶヒーローのガチャのカプセル（品ぞろえと一緒に入れ替わる。gacha.ts） */
  capsules?: Capsule[];
  /** はじめのヒーロー（GAME OVER でこのヒーローだけに戻る。古いセーブでは heroes の先頭） */
  starter?: number;
  /** 図鑑：いつか手に入れたヒーロー（GAME OVER でも残る） */
  heroDex?: number[];
  runs: number;
  /** 途中で閉じたプレイの GUM（倍率まで掛けた見込み）。次に開いたときに財布へ入れる */
  pendingGum?: number;
  /** 育つエクステンションの育ち（品の ID ごと。売る・壊れる・GAME OVER で消える） */
  extGrow?: Record<string, number>;
  /** ヒートの印の付いた部品（出どころ。Limited で付ける。GAME OVER で消える） */
  heat?: string[];
  /** いちばん稼いだ出どころが同じプレイが続いた数（エクステンション「育つ卵」に使う。GAME OVER で消える） */
  focus?: { src: string; n: number };
  settings: Settings;
  lastSeen: number;
  /** プレイヤー名（ピエロが呼ぶ名前。空ならまだ導入を見ていない。GAME OVER でも残り、設定から変えられる） */
  name: string;
}

const KEY = 'mycryptosmash.save.v1';

export const defaultSettings = (): Settings => ({
  tiltSens: 1, shakeSens: 1, invertShake: false, invertTilt: false, mute: false, vibrate: true, voice: true,
  fieldShape: 'rect', wideHit: true, partTags: true,
});

export function freshSave(firstHero: number): Save {
  return {
    v: 1, gum: 0, totalGum: 0, stage: 1, best: 1, kills: 0, up: {}, heroes: [firstHero], hero: firstHero, exts: [], usage: { red: 0, blue: 0, green: 0 }, floorBest: {}, deepest: 1, allClear: false, pinDeepest: 1, pinRecord: 1, emblems: 0, quota: { ...freshChallenge(), guide: true }, extSlots: EXT_SLOTS_START, heroSlots: HERO_SLOTS_START, endless: false, escapes: 0, endlessBest: 0, pinBestMul: 1, seenParts: [], equip: [], limited: [], party: [firstHero], shop: [], capsules: [], starter: firstHero, heroDex: [firstHero], toys: [], toyShop: [], runs: 0,
    settings: defaultSettings(), lastSeen: Date.now(), name: '', partsV: 1,
  };
}

/**
 * 前の版のセーブを、台の部品を買い足すしくみへ移す（1 回だけ。印は partsV）。
 * 前の台にははじめから部品が全部あったので、挑戦の途中（ノルマ 1 から先）のセーブは、部品を全部 save.toys に足して台がいきなり空にならないようにする
 * （そのぶんピエロの姿が上がってもよい）。遊んだことのあるセーブは、次の挑戦のチュートリアルの案内をとばす
 */
export function migrateParts(s: Save): void {
  if ((s.partsV ?? 0) >= 1) return;
  s.partsV = 1;
  const played = (s.runs ?? 0) > 0 || (s.quota?.n ?? 0) > 1 || (s.quota?.played ?? 0) > 0 || !!s.quota?.final;
  if (played) s.tutorialDone = true;
  if (played && (s.quota?.n ?? 0) >= 1) s.toys = [...new Set([...(s.toys ?? []), ...PART_TOYS])];
  else if (s.quota) {
    // まだ遊んでいない挑戦は、チュートリアル（ノルマ 0）から
    if (!played && s.quota.n === 1) s.quota.n = 0;
    s.quota.guide = !s.tutorialDone;
  }
}

export function loadSave(firstHero: number): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Save>;
      if (s && s.v === 1) {
        const base = freshSave(firstHero);
        const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings ?? {}) }, up: { ...(s.up ?? {}) }, usage: { ...base.usage, ...(s.usage ?? {}) }, floorBest: { ...(s.floorBest ?? {}) }, quota: { ...base.quota, ...(s.quota ?? {}) } } as Save;
        // 挑戦のサイクルより前のセーブ：スキルツリーと図鑑の記録は引きつぎ、挑戦は 1 から
        if (!s.quota) {
          out.pinRecord = Math.max(out.pinRecord, s.pinDeepest ?? 1);
          out.pinDeepest = 1;
          out.gum = 0;
          out.equip = [];
          out.limited = [];
          out.shop = [];
          out.party = [out.hero];
        }
        // 持ち物の一覧があったころのセーブ：装備していない品は売値ぶんのエンブレムで返し、同じシリーズは重ねる
        if ('owned' in s) migrateInventory(out as Save & { owned?: number[] });
        // ガチャより前のセーブ：はじめのヒーローは持ち物の先頭、図鑑はいま持っているヒーロー
        out.starter ??= out.heroes[0] ?? out.hero;
        out.heroDex = [...new Set([...(out.heroDex ?? []), ...out.heroes])];
        // ジョーカーでないままノルマ 11 以降へ進んでいたセーブ（前は延長が続いた）：通常のエンディングへ
        if (!out.endless && !out.quota.final && out.quota.n > QUOTAS && !out.pendingEnding) out.pendingNormal = true;
        // 台の部品を買い足すしくみより前のセーブ
        if (!('partsV' in s)) { out.partsV = 0; migrateParts(out); }
        return out;
      }
    }
  } catch {
    /* 読めなければ新しく始める */
  }
  return freshSave(firstHero);
}

export function writeSave(s: Save): void {
  try {
    s.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できない環境ではそのまま遊ぶ */
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
