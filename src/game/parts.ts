// ピンボール台の部品の一覧（データ）。解説モード（src/ui/guide.ts）と、はじめて触れた部品の名札が読む。
//
// 位置は台のユニット（table.ts と同じ）。r は光らせる丸の大きさ、view はカメラが寄ったときに映す幅。
// demo は解説モードで球を走らせる実演（どこに置いて、どの速さで投げるか。kind で特別な準備をする）。
// その部品に付けられる改造は mods.ts（ショップのエクステンションと Limited の part）から引く。

import * as T from './table';
import type { Stats } from './economy';

export interface PartDemo {
  x: number; y: number; vx: number; vy: number;
  /** 特別な準備：打ち出し・マルチボール・ジャックポット・ブラックホール・星・入口・ボールセーブ・ZONE */
  kind?: 'launch' | 'multi' | 'jackpot' | 'hole' | 'star' | 'gate' | 'save' | 'zone';
}
export interface Part {
  id: string;
  /** この作品での名前 */
  name: string;
  /** ピンボールでのふつうの呼び方 */
  call: string;
  x: number; y: number; r: number;
  /** 名札を立てる場所（ほかの部品と重なるときだけ。なければ x, y） */
  pin?: [number, number];
  view: number;
  what: string;
  /** いまの台での数字（スキルで変わるもの） */
  stat?: (st: Stats) => string;
  demo: PartDemo;
  /** はじめて触れたときに名札を出すか（球が r の中に入ったら） */
  tag?: boolean;
}

const [LX, LY] = T.LOCK;
const [MX, MY] = T.MYSTERY;
const [GX, GY] = T.GATE;
const [PX, PY] = T.PLUNGER;
const B = T.BUMPERS;

export const PARTS: Part[] = [
  {
    id: 'plunger', name: '打ち出し', call: 'プランジャー・シューターレーン', x: PX, y: PY - 80, r: 60, view: 340,
    what: '右端の細い通路の下に球が置かれる。画面を押して引っぱり、離すと球がまっすぐ上へ飛び、右の通路を駆け上がって台の上を回る。弱いと通路を落ちて戻ってくる。緑の帯の強さで打つとスキルショット。',
    stat: (st) => `打ち出しの強さ ×${st.plungerMul.toFixed(2)}`,
    demo: { x: PX, y: PY, vx: 0, vy: 0, kind: 'launch' },
  },
  {
    id: 'flipper', name: 'フリッパー', call: 'フリッパー', x: 360, y: 1212, r: 90, view: 360,
    what: '球が近くに来ると自動で打ち返す。下に 2 本、左右の坂の上に 2 本。先のほうで当たるほど強く飛ぶ。',
    demo: { x: 246, y: 1110, vx: 30, vy: 120 }, tag: true,
  },
  {
    id: 'sling', name: '三角のばね', call: 'スリングショット', x: 290, y: 1110, r: 40, view: 320,
    what: 'フリッパーの上の三角。内側の斜めの辺に当たると、横へ強くはじく。',
    demo: { x: 330, y: 1000, vx: -160, vy: 120 }, tag: true,
  },
  {
    id: 'inlane', name: '内側の通路', call: 'インレーン', x: 248, y: 1172, r: 30, view: 320,
    what: 'フリッパーへ戻ってくる安全な道。通ると光り、続けて通すとごほうび。',
    demo: { x: 236, y: 1112, vx: 20, vy: 60 }, tag: true,
  },
  {
    id: 'outlane', name: '外側の通路', call: 'アウトレーン', x: 195, y: 1180, r: 30, view: 340,
    what: '台のいちばん外の道。ここに入ると球が落ちる。キックバックが点いていれば打ち戻してくれる。',
    demo: { x: 190, y: 1070, vx: 0, vy: 80 }, tag: true,
  },
  {
    id: 'kickback', name: '打ち戻し', call: 'キックバック', x: 195, y: 1240, r: 26, view: 340,
    what: 'アウトレーンに落ちた球を、上へ打ち戻す。使うと消えて、しばらくするとまた点く。',
    stat: (st) => `また点くまで ${st.kickbackTime.toFixed(1)} 秒`,
    demo: { x: 190, y: 1100, vx: 0, vy: 200 },
  },
  {
    id: 'bumper', name: '丸いばね', call: 'バンパー', x: 260, y: 355, r: 70, view: 360,
    what: '当たると強くはじき返す。左右に 3 つずつの群れ。中ではじかれ続けると連鎖が伸びる。',
    demo: { x: 262, y: 240, vx: 10, vy: 200 }, tag: true,
  },
  {
    id: 'spinner', name: '回転板', call: 'スピナー', x: 32, y: 640, r: 26, view: 340,
    what: '左右の通路にある板。球が通るとくるくる回り、回るたびに少し GUM が入る。',
    demo: { x: 32, y: 790, vx: 0, vy: -1700 }, tag: true,
  },
  {
    id: 'loop', name: '左右の通路', call: 'ループ（オービット）', x: 32, y: 480, r: 34, view: 520,
    what: '左の通路を上がると、上の丸い角を回って右から降りてくる一周の道。マルチボール中はジャックポット。',
    demo: { x: 32, y: 790, vx: 0, vy: -2300 },
  },
  {
    id: 'ramp', name: 'ワイヤーの坂', call: 'ランプ', x: 550, y: 820, r: 34, view: 520,
    what: '台の上を通る立体の道。右は台をぐるっと一周してインレーンへ、左は上のレーンへ。続けて通すと倍率が上がる。',
    demo: { x: 548, y: 900, vx: 0, vy: -1500 }, tag: true,
  },
  {
    id: 'lanes', name: '上の 3 本の道', call: 'レーン', x: 360, y: 76, r: 64, view: 360,
    what: 'G・U・M の 3 本。全部点けると GUM の倍率が上がり、まん中にピラミッドの入口が開く。',
    demo: { x: 342, y: 175, vx: 0, vy: -700 }, tag: true,
  },
  {
    id: 'targets', name: '倒れる的', call: 'ドロップターゲット', x: 360, y: 548, r: 120, view: 420,
    what: 'エネミーの的。全部倒すと上の舞台にボスが出て、ボスを倒すと次の台へ。弱点の色で当てると強い。',
    demo: { x: 360, y: 780, vx: 0, vy: -1100 }, tag: true,
  },
  {
    id: 'lock', name: '球をためる穴', call: 'ロック（セーサー）', x: LX, y: LY, r: 26, view: 340,
    what: '入ると球がしばらく止まる。引っぱればねらって撃てる。3 回入るとマルチボール。',
    demo: { x: LX, y: LY + 150, vx: 0, vy: -650 }, tag: true,
  },
  {
    id: 'mystery', name: 'なぞの穴', call: 'ミステリー（スクープ）', x: MX, y: MY, r: 26, view: 340,
    what: '入るとルーレットが回り、GUM の雨・分身・倍率・時間・ブラックホールなどのどれかが当たる。ときどき実況が取引（オファー）を持ちかけてくる。',
    demo: { x: MX, y: MY + 150, vx: 0, vy: -650 }, tag: true,
  },
  {
    id: 'multi', name: '球が増える', call: 'マルチボール', x: LX, y: LY, r: 40, pin: [LX + 40, LY + 56], view: 560,
    what: 'ロックに 3 回入ると、仲間のヒーローが球になって台に出る。本物の球が多いほど稼げる。',
    demo: { x: LX, y: LY + 150, vx: 0, vy: -650, kind: 'multi' },
  },
  {
    id: 'jackpot', name: '大当たり', call: 'ジャックポット', x: 32, y: 480, r: 34, pin: [110, 110], view: 560,
    what: 'マルチボール中にループやランプを通すと出る大きな GUM。右のランプは SUPER JACKPOT。',
    demo: { x: 32, y: 790, vx: 0, vy: -2300, kind: 'jackpot' },
  },
  {
    id: 'save', name: '落ちても戻る', call: 'ボールセーブ', x: 360, y: T.TH - 16, r: 30, view: 340,
    what: '打ち出してしばらくは、球が落ちてもすぐ戻ってくる（下のランプが光っている間）。',
    stat: (st) => `打ち出してから ${st.ballSave.toFixed(1)} 秒`,
    demo: { x: 360, y: 1150, vx: 0, vy: 300, kind: 'save' },
  },
  {
    id: 'warp', name: '瞬間移動', call: 'ワープ', x: T.WARPS[0].in[0], y: T.WARPS[0].in[1], r: 26, view: 480,
    what: '入ると、別の場所から飛び出す（左は上のレーンへ、右は右上の角へ）。',
    demo: { x: T.WARPS[0].in[0], y: T.WARPS[0].in[1] + 140, vx: 0, vy: -600 }, tag: true,
  },
  {
    id: 'booster', name: '緑の矢印', call: 'ブースター', x: T.BOOSTERS[1].x, y: T.BOOSTERS[1].y, r: 30, view: 380,
    what: '通ると矢印の向きへ一気に加速する（本物の台にはない、ゲームならではの仕掛け）。',
    demo: { x: T.BOOSTERS[1].x, y: T.BOOSTERS[1].y + 110, vx: 0, vy: -500 }, tag: true,
  },
  {
    id: 'hole', name: '渦を巻く穴', call: 'ブラックホール', x: T.HOLE_SPOTS[1][0], y: T.HOLE_SPOTS[1][1], r: 40, view: 420,
    what: 'ときどき開く穴。近くの球を吸いこみ、ボスや的へ超高速で撃ち出す（ゲームならでは）。',
    demo: { x: T.HOLE_SPOTS[1][0] + 45, y: T.HOLE_SPOTS[1][1] - 60, vx: -40, vy: 0, kind: 'hole' }, tag: true,
  },
  {
    id: 'star', name: '浮かぶ星', call: 'ゴーストスター', x: T.STAR_SPOTS[2][0], y: T.STAR_SPOTS[2][1], r: 30, view: 420,
    what: 'ときどき浮かぶ星。触ると自分のヒーローの分身球が出て、しばらくあばれて消える（ゲームならでは）。',
    demo: { x: T.STAR_SPOTS[2][0], y: T.STAR_SPOTS[2][1] + 120, vx: 0, vy: -500, kind: 'star' }, tag: true,
  },
  {
    id: 'gate', name: 'ピラミッドの入口', call: 'ゲート', x: GX, y: GY, r: 44, view: 380,
    what: 'G・U・M を全部点けると開く。近くの球を吸い寄せ、入ると 15 秒のピラミッドへ。',
    stat: (st) => `開いている時間 ${st.gateTime.toFixed(0)} 秒・ピラミッド ${(st.pyramidTime ?? 15).toFixed(0)} 秒`,
    demo: { x: GX + 55, y: GY - 70, vx: -50, vy: 0, kind: 'gate' }, tag: true,
  },
  {
    id: 'lights', name: '小さなライト', call: '通り道のライト', x: 32, y: 520, r: 40, pin: [64, 930], view: 460,
    what: '通り道に並んだライト。球が通ると灯り、続けて灯るほど音が高くなる。1 本全部灯るとごほうび。',
    demo: { x: 32, y: 790, vx: 0, vy: -1500 },
  },
  {
    id: 'zone', name: '連鎖の最高潮', call: 'ZONE', x: 360, y: 400, r: 120, pin: [150, 470], view: 640,
    what: '20 連鎖で入る。台じゅうが虹色に光り、坂が軽く、バンパーが強く、GUM が 2 倍になる。',
    demo: { x: B[2].x, y: 250, vx: 0, vy: 200, kind: 'zone' },
  },
];

export const partById = (id: string): Part | undefined => PARTS.find((p) => p.id === id);
