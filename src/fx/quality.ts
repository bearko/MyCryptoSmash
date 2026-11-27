// 演出の重さの段階。設定の画質（html[data-q="high|mid|low"]）・演出ひかえめ（html.calm）・ピエロの段階（html[data-clown]）を読む。
// まだ属性が付いていない間は既定値（画質 高・ひかえめ 切・ピエロは台のギミックの数から）で動く。
// 自動の段階は「中」から始め（前回の結果を覚えていればそこから）、余裕があれば「高」へ上げ、重ければすぐ下げる（設定より上には上げない）。

export type QLevel = 0 | 1 | 2;

/** 前回の結果を覚えておく所（端末ごと。セーブとは別） */
const STORE = 'mycryptosmash.fxq.v1';
/** 重くて下げた段階は、この日数の間は上げ直さない */
const CAP_DAYS = 3;

interface Stored { a: QLevel; cap: QLevel; at: number }
function loadStored(): Stored | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE) : null;
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Stored>;
    const ok = (v: unknown): v is QLevel => v === 0 || v === 1 || v === 2;
    if (!ok(o.a) || !ok(o.cap) || typeof o.at !== 'number') return null;
    return { a: o.a, cap: o.cap, at: o.at };
  } catch { return null; }
}
function store(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORE, JSON.stringify({ a: state.auto, cap: state.cap, at: state.capAt }));
  } catch { /* 覚えられなくても動く */ }
}

const prev = loadStored();
const capLive = !!prev && Date.now() - prev.at < CAP_DAYS * 86400e3;

const state = {
  /** 設定の画質（2 高・1 中・0 低） */
  user: 2 as QLevel,
  /** 自動で決めた段階。はじめは「中」（前回の結果があればそれ）。余裕があれば「高」へ上げる */
  auto: (prev ? Math.min(prev.a, capLive ? prev.cap : 2) : 1) as QLevel,
  /** 重くて下げたことがある段階の 1 つ下（これより上へは、しばらく上げない） */
  cap: (capLive && prev ? prev.cap : 2) as QLevel,
  capAt: prev?.at ?? 0,
  calm: false,
  /** html[data-clown]（なければ -1） */
  clown: -1,
  readAt: -1e9,
  avg: 16.7,
  /** 描くのにかかった時間（ms。CPU の分だけ） */
  cost: 4,
  slowT: 0,
  bad: 0,
  fastT: 0,
  /** 開いた直後と、段階を変えた直後は、数コマ数えない（絵の作り直しでかくつくため） */
  skip: 12,
  /** 自動で下げた回数（上げ下げをくり返さないように、下げるたびに戻りにくくする） */
  drops: 0,
  /** 確認用：自動の上げ下げを止める */
  locked: false,
};

let reduced: MediaQueryList | null = null;

function read(now: number): void {
  if (now - state.readAt < 400) return;
  state.readAt = now;
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const q = el.dataset.q;
  state.user = q === 'low' ? 0 : q === 'mid' ? 1 : 2;
  if (!reduced && typeof matchMedia === 'function') reduced = matchMedia('(prefers-reduced-motion: reduce)');
  state.calm = el.classList.contains('calm') || !!reduced?.matches;
  const c = el.dataset.clown;
  state.clown = c === undefined || c === '' ? -1 : Math.max(0, Math.min(4, Number(c) || 0));
}

/** 毎コマ呼ぶ（raw はコマの間隔 ms）。重ければ段階を下げ、軽ければ戻す。
 *  下げるのは早く（とても重ければ 0.25 秒、重ければ 0.5〜0.9 秒）、上げるのはゆっくり（余裕が数秒続いたとき） */
export function qualityTick(raw: number, now: number): void {
  read(now);
  if (raw > 250 || raw <= 0 || state.locked) return; // タブを離れていた間などは数えない
  if (state.skip > 0) { state.skip -= 1; return; }
  // 1 コマだけの引っかかり（絵の作り直し・読みこみ）で下げないように、1 コマは 50ms までとして数える
  const r = Math.min(raw, 50);
  state.avg += (r - state.avg) * 0.12;
  const dt = r / 1000;
  // 画面の書きかえが速い端末（90・120Hz）でも、60fps を保てていれば軽いとみなす
  if (state.avg > 21.5) { state.slowT += dt; state.fastT = 0; } else if (state.avg < 17.6) { state.fastT += dt; state.slowT = 0; } else { state.slowT = Math.max(0, state.slowT - dt); state.fastT = 0; }
  const wait = state.avg > 34 ? 0.25 : state.avg > 26 ? 0.5 : 0.9;
  const q = Math.min(state.user, state.auto);
  // とても重いコマ（70ms より長い）が 4 コマ続いたら、待たずに下げる
  state.bad = raw > 70 ? state.bad + 1 : 0;
  if ((state.slowT > wait || state.bad >= 4) && q > 0) {
    state.bad = 0;
    // 設定より下からは下げない（設定が低なら、自動はそのまま）
    state.auto = (q - 1) as QLevel;
    state.cap = state.auto;
    state.capAt = Date.now();
    state.drops += 1;
    state.slowT = 0;
    state.avg = 17;
    state.skip = 8;
    store();
  } else if (state.auto < 2 && state.auto < state.cap && state.drops < 3
    && state.fastT > 4 * (1 + state.drops * 3)
    // 描く時間（CPU）にも余裕があるときだけ上げる（1 コマ 16.7ms のうち、中→高は 7ms まで・低→中は 9ms まで）
    && state.cost < (state.auto === 1 ? 7 : 9)) {
    state.auto = (state.auto + 1) as QLevel;
    state.fastT = 0;
    state.skip = 8;
    store();
  }
}
/** 毎コマ、描くのにかかった時間（ms）を知らせる */
export function qualityCost(ms: number): void {
  if (ms >= 0 && ms < 250) state.cost += (ms - state.cost) * 0.08;
}

/** いまの画質（設定と自動の低いほう） */
export const quality = (): QLevel => (Math.min(state.user, state.auto) as QLevel);
/** 演出ひかえめ（点滅・ゆれ・画面全体の光を弱める） */
export const calm = (): boolean => state.calm;
/** ピエロの段階。html に付いていればそれ、なければ fallback（台のギミックの数から） */
export const clownStage = (fallback: number): number => (state.clown >= 0 ? state.clown : fallback);
/** 確認用 */
export const qualityInfo = (): { user: number; auto: number; cap: number; avg: number; cost: number; drops: number; calm: boolean; clown: number } =>
  ({ user: state.user, auto: state.auto, cap: state.cap, avg: Math.round(state.avg * 10) / 10, cost: Math.round(state.cost * 10) / 10, drops: state.drops, calm: state.calm, clown: state.clown });
/** 確認用：自動の段階を決める（テストとスクリーンショット） */
export function forceQuality(q: QLevel): void { state.auto = q; state.locked = true; }
