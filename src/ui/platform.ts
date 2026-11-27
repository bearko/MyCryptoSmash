/**
 * bearko.games の共通基盤（共通ログイン・アチーブメント・総合スコア・RTA・全体チャット・来訪の数）への、ただ 1 つの窓口。
 * ほかのファイルは `window.BearkoGames` を触らず、ここの関数だけを呼ぶ。
 *
 * SDK が読めない（オフライン・広告ブロック）・呼び出しが失敗する（共通基盤にまだ登録されていない）ときも、ゲームは最後まで遊べる。
 * 呼び出しは全部 try/catch で包み、失敗は console.warn だけ。ゲームは Cookie を触らない（ログインは共通基盤が持つ）。
 * くわしくは docs/PLATFORM.md。
 */
import { version } from '../../package.json';
import { onCommit, type Save } from '../core/save';
import { tutorialState } from '../game/quota';

/** 共通基盤でのタイトル ID（ホストは smash.bearko.games） */
export const GAME = 'smash';

/** ここで使う SDK の部分（bearko.games/sdk/v1.js） */
interface Sdk {
  init(opts: Record<string, unknown>): Promise<unknown>;
  tutorialStep(step: number, id: string): unknown;
  unlockTrophy(id: string): Promise<unknown>;
  submitScore(metrics: Record<string, unknown>, opts?: { quiet?: boolean }): Promise<unknown>;
  rta: { start(opts: Record<string, unknown>): Promise<unknown>; checkpoint(id: string, opts?: { igtMs?: number }): Promise<unknown>; abort(): void };
  chat: { open(): void; setVisible(on: boolean): void };
}

const found = (): Sdk | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { BearkoGames?: Sdk }).BearkoGames);
let ready = false;

function guard<T>(what: string, run: (api: Sdk) => T): T | undefined {
  try {
    const api = ready ? found() : undefined;
    if (!api) return undefined;
    const out = run(api);
    if (out instanceof Promise) out.catch((err: unknown) => console.warn(`[platform] ${what}`, err));
    return out;
  } catch (err) {
    console.warn(`[platform] ${what}`, err);
    return undefined;
  }
}

/** 起動のときに 1 回だけ呼ぶ。SDK は defer の script なので、まだ無ければページを読み終えたときにもう一度見る */
export function startPlatform(): void {
  const begin = (): void => {
    if (ready || !found()) return;
    ready = true;
    // チャット：台が画面いっぱいなので、PC の右のドックも右下の 💬 も出さない。ホーム画面と設定の「チャット」から開く。
    // 知らせ（アチーブメントなど）は上に出す（下は打ち出しの手元とフッター）。来訪の数（presence）は止めない
    guard('init', (api) => api.init({ game: GAME, version, chat: { layout: 'float', button: false }, toast: 'top', toastOffset: 8 }));
    for (const [step, id] of waiting) guard('tutorialStep', (api) => api.tutorialStep(step, id));
    waiting.length = 0;
    if (playing) guard('chat.setVisible', (api) => api.chat.setVisible(false));
  };
  try {
    begin();
    if (!ready && typeof window !== 'undefined') window.addEventListener('load', begin, { once: true });
    // チュートリアルの段は、セーブするたびにセーブの中身から判定して送る
    onCommit(trackTutorial);
  } catch (err) {
    console.warn('[platform] start', err);
  }
}

/** SDK が読めた（チャットのボタンを出してよい） */
export const platformOn = (): boolean => ready;

export function openChat(): void {
  guard('chat.open', (api) => api.chat.open());
}

let playing = false;
/** プレイ中はチャットを隠し、遊んでいないときに戻す（変わったときだけ SDK を呼ぶ） */
export function setPlaying(on: boolean): void {
  if (on === playing) return;
  playing = on;
  guard('chat.setVisible', (api) => api.chat.setVisible(!on));
}

// ---------------------------------------------------------------- チュートリアルの段（はじめての挑戦のノルマ 0 の案内）

/**
 * チュートリアルの段（docs/PLATFORM.md に表）。公開したあとは、番号と id を変えない（足すときは空いている番号に）。
 * 流れ：打ち出す → ③三角のばねを買う → 打ち出す → ④内側の通路を買う → 打ち出す → 入金口に納める → ⑦丸いばねを買う → 本当のノルマ 1 を打ち出す
 */
export const STEPS = {
  start: 0,
  launch_1: 10,
  buy_sling: 20,
  launch_2: 30,
  buy_inlane: 40,
  launch_3: 50,
  deposit: 60,
  buy_bumper: 70,
  done: 90,
} as const;
export type TutorialStep = keyof typeof STEPS;

/**
 * いまのセーブで着いている段（純粋。印 tutTrack のないセーブ・名前のないセーブ・ノルマ 2 から先・ラストステージ・エンドレスでは空）。
 * - 案内をとばした（「案内をとばす」）・本当のノルマ 1 の 1 プレイ目を打ち出した：done
 * - とばしたあとも遊びつづければ、着いた段は数える（ノルマ 0 の打ち出しと、部品を買った段）
 */
export function tutorialSteps(s: Save): TutorialStep[] {
  const out: TutorialStep[] = [];
  const c = s.quota;
  if (!s.tutTrack || !s.name || !c || c.final || s.endless || c.n > 1) return out;
  out.push('start');
  const has = (id: string): boolean => (s.toys ?? []).includes(id as never);
  if (c.n === 0) {
    if (c.played >= 1) out.push('launch_1');
    if (has('sling')) out.push('buy_sling');
    if (c.played >= 2) out.push('launch_2');
    if (has('inlane')) out.push('buy_inlane');
    if (c.played >= 3) out.push('launch_3');
  } else {
    // ノルマ 1：チュートリアルを納めた（印のあるセーブは、ノルマ 0 から始めている）
    if (has('sling')) out.push('buy_sling');
    if (has('inlane')) out.push('buy_inlane');
    out.push('deposit');
  }
  if (has('bumper')) out.push('buy_bumper');
  if (!tutorialState(s).guided) out.push('done');
  return out;
}

/** 案内つきのチュートリアルを始めたセーブに印を付ける（はじめての挑戦のノルマ 0。名前を決めたあと） */
function mark(s: Save): void {
  if (s.tutTrack || !s.name || !s.quota) return;
  if (s.quota.n === 0 && s.quota.guide && !s.tutorialDone && !s.quota.final && !s.endless) s.tutTrack = true;
}

const sent = new Set<string>();
const waiting: [number, string][] = [];

function send(id: TutorialStep): void {
  if (sent.has(id)) return;
  sent.add(id);
  if (!ready) waiting.push([STEPS[id], id]);
  else guard('tutorialStep', (api) => api.tutorialStep(STEPS[id], id));
}

/** セーブするたびに呼ばれる：印を付け、着いた段を送る（同じ段は 1 回だけ） */
export function trackTutorial(s: Save): void {
  try {
    mark(s);
    for (const id of tutorialSteps(s)) send(id);
  } catch (err) {
    console.warn('[platform] trackTutorial', err);
  }
}

// ---------------------------------------------------------------- アチーブメント・総合スコア・RTA
// （口だけ。何を送るかは共通基盤の側で決めてから。docs/PLATFORM.md の案）

export function unlockTrophy(name: string): void {
  guard('unlockTrophy', (api) => api.unlockTrophy(`${GAME}.${name}`));
}

export function submitScore(metrics: Record<string, unknown>, quiet = false): void {
  guard('submitScore', (api) => api.submitScore(metrics, { quiet }));
}

export const rta = {
  start: (regulation: string): void => void guard('rta.start', (api) => api.rta.start({ regulation })),
  checkpoint: (id: string, igtMs?: number): void => void guard('rta.checkpoint', (api) => api.rta.checkpoint(id, { igtMs })),
  abort: (): void => void guard('rta.abort', (api) => api.rta.abort()),
};
