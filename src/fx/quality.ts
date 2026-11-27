// 演出の重さの段階。設定の画質（html[data-q="high|mid|low"]）・演出ひかえめ（html.calm）・ピエロの段階（html[data-clown]）を読む。
// まだ属性が付いていない間は既定値（画質 高・ひかえめ 切・ピエロは台のギミックの数から）で動く。
// コマが重いときは自動で段階を下げ、軽くなったら戻す（設定より上には上げない）。

export type QLevel = 0 | 1 | 2;

const state = {
  /** 設定の画質（2 高・1 中・0 低） */
  user: 2 as QLevel,
  /** 自動で下げた上限 */
  auto: 2 as QLevel,
  calm: false,
  /** html[data-clown]（なければ -1） */
  clown: -1,
  readAt: -1e9,
  avg: 16.7,
  slowT: 0,
  fastT: 0,
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

/** 毎コマ呼ぶ（raw はコマの間隔 ms）。重ければ段階を下げ、軽ければ戻す */
export function qualityTick(raw: number, now: number): void {
  read(now);
  if (raw > 250 || raw <= 0 || state.locked) return; // タブを離れていた間などは数えない
  state.avg += (raw - state.avg) * 0.06;
  const dt = raw / 1000;
  if (state.avg > 21.5) { state.slowT += dt; state.fastT = 0; } else if (state.avg < 17.6) { state.fastT += dt; state.slowT = 0; } else { state.slowT = Math.max(0, state.slowT - dt); state.fastT = 0; }
  if (state.slowT > 1.6 && state.auto > 0) {
    state.auto = (state.auto - 1) as QLevel;
    state.drops += 1;
    state.slowT = 0;
    state.avg = 17;
  } else if (state.fastT > 8 * (1 + state.drops * 2) && state.auto < 2 && state.drops < 4) {
    state.auto = (state.auto + 1) as QLevel;
    state.fastT = 0;
  }
}

/** いまの画質（設定と自動の低いほう） */
export const quality = (): QLevel => (Math.min(state.user, state.auto) as QLevel);
/** 演出ひかえめ（点滅・ゆれ・画面全体の光を弱める） */
export const calm = (): boolean => state.calm;
/** ピエロの段階。html に付いていればそれ、なければ fallback（台のギミックの数から） */
export const clownStage = (fallback: number): number => (state.clown >= 0 ? state.clown : fallback);
/** 確認用 */
export const qualityInfo = (): { user: number; auto: number; avg: number; calm: boolean; clown: number } =>
  ({ user: state.user, auto: state.auto, avg: Math.round(state.avg * 10) / 10, calm: state.calm, clown: state.clown });
/** 確認用：自動の段階を決める（テストとスクリーンショット） */
export function forceQuality(q: QLevel): void { state.auto = q; state.locked = true; }
