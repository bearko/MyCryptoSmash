// 1 人のブラウザに保存するセーブ。読めない・書けない環境でもゲームは動く。

import { EXT_SLOTS_START, HERO_SLOTS_START, freshChallenge, type Challenge } from '../game/quota';
import type { ToyId } from '../game/toys';

export interface Settings {
  tiltSens: number; // 傾きの感度（0.4〜2）
  shakeSens: number; // 振りの感度（0.4〜2。大きいほど弱い振りで反応）
  invertShake: boolean;
  invertTilt: boolean;
  mute: boolean;
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
  /** いちばん最近の脱出の記録（プレイヤー名・かかったプレイ数・いちばん大きかった GUM） */
  escapeRecord?: { name: string; plays: number; bestGum: number };
  /** ピンボール：いちばん大きかった GUM の倍率 */
  pinBestMul: number;
  /** 球がはじめて触れた部品（名前の札を 1 回だけ出す） */
  seenParts: string[];
  /** ショップで買ったエクステンション（ID）・装備しているもの・集めた Limited（挑戦の間は外せない） */
  owned: number[];
  equip: number[];
  limited: number[];
  /** ヒーローの装備（先頭がリーダー＝自分のマレット。heroSlots 人まで） */
  party: number[];
  /** この挑戦で買った台の仕掛け（ギミック。GAME OVER で失う） */
  toys: ToyId[];
  /** ギミックの候補（プレイが終わるごとに入れ替わる） */
  toyShop: ToyId[];
  /** ショップの品ぞろえ（プレイが終わるごとに入れ替わる） */
  shop: number[];
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
    v: 1, gum: 0, totalGum: 0, stage: 1, best: 1, kills: 0, up: {}, heroes: [firstHero], hero: firstHero, exts: [], usage: { red: 0, blue: 0, green: 0 }, floorBest: {}, deepest: 1, allClear: false, pinDeepest: 1, pinRecord: 1, emblems: 0, quota: freshChallenge(), extSlots: EXT_SLOTS_START, heroSlots: HERO_SLOTS_START, endless: false, escapes: 0, endlessBest: 0, pinBestMul: 1, seenParts: [], owned: [], equip: [], limited: [], party: [firstHero], shop: [], toys: [], toyShop: [], runs: 0,
    settings: defaultSettings(), lastSeen: Date.now(), name: '',
  };
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
          out.owned = [];
          out.equip = [];
          out.limited = [];
          out.shop = [];
          out.party = [out.hero];
        }
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
