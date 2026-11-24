// 1 人のブラウザに保存するセーブ。読めない・書けない環境でもゲームは動く。

export interface Settings {
  tiltSens: number; // 傾きの感度（0.4〜2）
  shakeSens: number; // 振りの感度（0.4〜2。大きいほど弱い振りで反応）
  invertShake: boolean;
  invertTilt: boolean;
  mute: boolean;
  vibrate: boolean;
  /** 実況の声 */
  voice: boolean;
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
  runs: number;
  settings: Settings;
  lastSeen: number;
}

const KEY = 'mycryptosmash.save.v1';

export const defaultSettings = (): Settings => ({
  tiltSens: 1, shakeSens: 1, invertShake: false, invertTilt: false, mute: false, vibrate: true, voice: true,
});

export function freshSave(firstHero: number): Save {
  return {
    v: 1, gum: 0, totalGum: 0, stage: 1, best: 1, kills: 0, up: {}, heroes: [firstHero], hero: firstHero, exts: [], usage: { red: 0, blue: 0, green: 0 }, floorBest: {}, deepest: 1, allClear: false, runs: 0,
    settings: defaultSettings(), lastSeen: Date.now(),
  };
}

export function loadSave(firstHero: number): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Save>;
      if (s && s.v === 1) {
        const base = freshSave(firstHero);
        return { ...base, ...s, settings: { ...base.settings, ...(s.settings ?? {}) }, up: { ...(s.up ?? {}) }, usage: { ...base.usage, ...(s.usage ?? {}) }, floorBest: { ...(s.floorBest ?? {}) } } as Save;
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
