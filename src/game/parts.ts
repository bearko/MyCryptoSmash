// ピンボール台の部品の一覧（データ）。解説モード（src/ui/guide.ts）と、はじめて触れた部品の名札が読む。
//
// 位置は台のユニット（table.ts と同じ）。r は光らせる丸の大きさ、view はカメラが寄ったときに映す幅。
// demo は解説モードで球を走らせる実演（どこに置いて、どの速さで投げるか。kind で特別な準備をする）。
// その部品に付けられる改造は mods.ts（ショップのエクステンションと Limited の part）から引く。

import * as T from './table';
import type { Stats } from './economy';
import { CANNON, CAPTIVE, CASTLE, CRANE, DINO, DISC, FACE, GACHA, HYPER, MAGNET, MINI, MOAI, POPUPS, UFO, type ToyId } from './toys';

export interface PartDemo {
  x: number; y: number; vx: number; vy: number;
  /** 特別な準備：打ち出し・マルチボール・ジャックポット・ブラックホール・星・入口・ボールセーブ・ZONE */
  kind?: 'launch' | 'multi' | 'jackpot' | 'hole' | 'star' | 'gate' | 'save' | 'zone' | 'castle' | 'face' | 'hammer' | 'mega13' | 'popup' | 'moai';
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
  /** 台の大きな仕掛け（切ってあるときは一覧に出さない） */
  toy?: ToyId;
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
    what: 'G・U・M の 3 本。全部点けると GUM の倍率が上がり、まん中で大当たり（G-U-M JACKPOT）。',
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
    what: 'G・U・M を全部点けると、ここで大当たり（本編ではピラミッドの入口は閉じている。クリア後のエンドレスで開く：近くの球を吸い寄せ、入ると 15 秒のピラミッドへ）。',
    stat: (st) => `大当たり ＝ 的 ${12} 体ぶん × GUM の倍率${st.laneJackpot ? `（スキルで +${Math.round(st.laneJackpot * 100)}%）` : ''}`,
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

// 台の大きな仕掛け（toys.ts。ON/OFF できる）
PARTS.push(
  {
    id: 'hyperloop', toy: 'hyperloop', name: '光の輪', call: 'ハイパーループ', x: HYPER.x, y: HYPER.y, r: HYPER.r + 14, view: 380,
    what: '左の上にある光の輪。下の口へ勢いよく入ると、輪を何周も回ってから出てくる。速く入るほど周回が多く、1 周ごとに GUM。',
    demo: { x: HYPER.mouth[0], y: HYPER.mouth[1] + 120, vx: 0, vy: -2200 }, tag: true,
  },
  {
    id: 'cannon', toy: 'cannon', name: '大砲', call: 'キャノン', x: CANNON.x, y: CANNON.y, r: 30, view: 360,
    what: 'ゆっくり入ると止まって、大砲が首を振る。引っぱって離すと、そのときの大砲の向きへ緑の貫通で撃ち出す。3 秒たつと自動で撃つ。',
    demo: { x: CANNON.x, y: CANNON.y + 50, vx: 0, vy: -520 }, tag: true,
  },
  {
    id: 'gacha', toy: 'gacha', name: 'ガチャマシン', call: 'ボールロック（見えるロック）', x: GACHA[0], y: GACHA[1], r: 30, view: 380,
    what: 'ロックの穴に入った球が、カプセルになって中に見える。マルチボールではノブが回って、装備したヒーローの球が出てくる。',
    demo: { x: T.LOCK[0], y: T.LOCK[1] + 150, vx: 0, vy: -650, kind: 'multi' },
  },
  {
    id: 'castle', toy: 'castle', name: 'ボスの城', call: '跳ね橋', x: CASTLE.x, y: CASTLE.bridgeY - 30, r: 60, view: 420,
    what: 'ボスがいる間、上に城が建つ。跳ね橋に 3 回当てると下り、中へ打ちこむと城が崩れてボスに大ダメージ。',
    demo: { x: CASTLE.x + 10, y: CASTLE.bridgeY + 180, vx: 0, vy: -1300, kind: 'castle' },
  },
  {
    id: 'face', toy: 'face', name: 'しゃべる顔（ピエロ）', call: 'トイ（顔）', x: FACE.x, y: FACE.y, r: 44, view: 360,
    what: 'まん中のピエロの顔。目がいつも球を追う。ときどき口が開き、開いている間に入れると大当たり（BIG MOUTH）。',
    demo: { x: FACE.x, y: FACE.mouthY + 110, vx: 0, vy: -900, kind: 'face' }, tag: true,
  },
  {
    id: 'disc', toy: 'disc', name: '回転盤', call: 'スピニングディスク', x: DISC.x, y: DISC.y, r: DISC.r, view: 360,
    what: '下のまん中の回る円盤。乗った球の向きをずらす。ときどき逆回りになる（色が変わる）。',
    demo: { x: DISC.x - 30, y: DISC.y - 90, vx: 60, vy: 100 }, tag: true,
  },
  {
    id: 'mega13', toy: 'mega13', name: '13 球マルチボール', call: 'マルチボール（大祭り）', x: GACHA[0], y: GACHA[1] - 40, r: 50, pin: [GACHA[0] - 40, GACHA[1] - 50], view: 640,
    what: '3 の倍数回目のマルチボールは、球が一気に 13 個になる。足した分は 8 秒だけ。',
    demo: { x: T.LOCK[0], y: T.LOCK[1] + 150, vx: 0, vy: -650, kind: 'mega13' },
  },
  {
    id: 'hammer', toy: 'hammer', name: 'ボスの反撃', call: 'ハンマー', x: 360, y: 700, r: 80, pin: [430, 700], view: 640,
    what: 'ボスがいる間、ときどき赤い輪で知らせて 1 秒後に台を叩く。輪の中の球は大きく跳ね、跳ねた球には大きな GUM（COUNTER BONUS。輪のまん中ほど多い）。',
    demo: { x: 360, y: 640, vx: 0, vy: 0, kind: 'hammer' },
  },
  {
    id: 'crane', toy: 'crane', name: 'つかむ手', call: 'クレーン', x: CRANE.cup[0], y: CRANE.cup[1], r: 30, pin: [CRANE.cup[0] + 40, CRANE.cup[1]], view: 1100,
    what: '下のまん中の受け皿にゆっくり入ると、爪がつかんで上まで運ぶ。傾けた側の賞へ落とす（左＝GUM・まん中＝G-U-M のレーン・右＝ロック）。傾けなければ行き来する。',
    demo: { x: CRANE.cup[0], y: CRANE.cup[1] - 40, vx: 0, vy: 150 }, tag: true,
  },
  {
    id: 'captive', toy: 'captive', name: '捕まった球', call: 'キャプティブボール', x: CAPTIVE.x, y: CAPTIVE.y - 40, r: 50, view: 380,
    what: '左の上のガラスの筒に閉じこめた地球の球。下の口に強く当てると上がり、てっぺんに 3 回届くと大当たりと 6 秒のフレンジー。',
    demo: { x: CAPTIVE.x, y: CAPTIVE.y + 120, vx: 0, vy: -1700 }, tag: true,
  },
  {
    id: 'popup', toy: 'popup', name: '出たり引っこむ的', call: 'ポップアップターゲット', x: POPUPS[2][0], y: POPUPS[2][1], r: 30, view: 380,
    what: '床の 4 つの穴から、カエルがときどき出てきて、しばらくすると引っこむ。出ている間に当てると GUM。4 匹とも倒すと FROG PARTY。',
    demo: { x: POPUPS[2][0], y: POPUPS[2][1] + 90, vx: 0, vy: -700, kind: 'popup' }, tag: true,
  },
  {
    id: 'mini', toy: 'mini', name: '上の小さな台', call: 'アッパープレイフィールド', x: MINI.x, y: MINI.y, r: 30, view: 420,
    what: '右の上の入口（UPPER）に入ると、画面の下に小さな台が出て、自動のフリッパーで 10 秒遊ぶ。観覧車のバンパーを 3 つ点けると MINI JACKPOT。',
    demo: { x: MINI.x, y: MINI.y + 110, vx: 0, vy: -800 }, tag: true,
  },
  {
    id: 'dino', toy: 'dino', name: '食べて吐く怪物', call: 'トイ（怪物）', x: DINO.x, y: DINO.y, r: 44, view: 400,
    what: '左の下の怪物。口に入った球を 3 回かみ（かむたびに GUM）、いちばんの敵へ向けて緑の貫通で吐き出す。',
    demo: { x: DINO.mouth[0] + 60, y: DINO.mouth[1] - 80, vx: -200, vy: 0 }, tag: true,
  },
  {
    id: 'ufo', toy: 'ufo', name: 'ゆれる UFO', call: 'トイ（UFO）', x: UFO.x, y: UFO.y, r: 50, view: 420,
    what: 'まん中でゆれて浮かぶ UFO。3 回当てると開いて、3 秒の間、光線で敵を撃つ（青）。',
    demo: { x: UFO.x, y: UFO.y + 110, vx: 0, vy: -1000 }, tag: true,
  },
  {
    id: 'magnet', toy: 'magnet', name: '磁石', call: 'マグネット', x: MAGNET.x, y: MAGNET.y, r: 40, view: 380,
    what: '右の下の磁石。近くを通った球を止めて、ぐるぐる回してから投げる。開いている入口・UFO・ピエロの口・敵のどれかを狙う。',
    demo: { x: MAGNET.x, y: MAGNET.y + 90, vx: 0, vy: -500 }, tag: true,
  },
  {
    id: 'moai', toy: 'moai', name: '倒れる的の壁', call: 'ドロップターゲット（モアイ）', x: 360, y: MOAI.y, r: 70, view: 420,
    what: '下のまん中に並ぶ 4 体のモアイ。ふれると倒れる。全部倒すと金のモアイが 8 秒出て、当てると大当たりとボールセーブ。',
    demo: { x: 300, y: MOAI.y + 120, vx: 0, vy: -900, kind: 'moai' }, tag: true,
  },
);

export const partById = (id: string): Part | undefined => PARTS.find((p) => p.id === id);
