// 台の上の液晶に出す「打ち出す前の情報」（文は出さない。数字・ゲージ・のこりプレイの玉で見せる）。
// main.ts の readyTick が毎コマ入れ、render-pinball.ts の drawDisplay が読む（打ち出しを待つ台 `wd.waiting` のときだけ）。

export type DmdInfo =
  /** ノルマ：札（QUOTA 3/10・TUTORIAL・ENDLESS n）・手持ち／納品額のゲージ・のこりプレイの玉 */
  | { kind: 'quota'; label: string; have: number; need: number; left: number; of: number; canPay: boolean }
  /** ラストステージ：ボスの数・挑めるのこりの回数 */
  | { kind: 'final'; bosses: number; left: number; of: number }
  /** プレイを使いきった：入金口へ（台に触ると開く） */
  | { kind: 'deposit'; have: number; need: number };

export const dmd: { info: DmdInfo | null } = { info: null };
export function setDmdInfo(info: DmdInfo | null): void { dmd.info = info; }
