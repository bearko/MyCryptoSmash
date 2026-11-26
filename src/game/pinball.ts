// ピンボール（ゲームの本体）：手前へ下る坂の大きな台（形は table.ts）。引っぱって打ち出し、傾けて曲げ、振って揺らす。
// フリッパーは自動（下の 2 本と、左右の坂の上の 2 本）。カメラが球を追う（描画の側）。
// 台のギミック：バンパー・スリングショット・レーン・スピナー・ループ・ロックのホール（マルチボール）・
// ミステリーのホール・ワープ・キックバック・ボールセーブ・2 本のワイヤーのランプ。
// 本物の台ではできない仕掛け：ブラックホール・ゴーストスター（分身球）・ブースター・ZONE（20 連鎖で重さが軽くなる）・
// ピラミッドへの入口（エンドレスだけ。G-U-M を全部点けると台のまん中に開き、入ると 15 秒のピラミッドへ。時間切れで戻ってくる。
// 本編では閉じていて、G-U-M を全部点けるとレーンの大当たり）。
// エネミーはドロップターゲット（動かない的）。ぜんぶ倒すとボス、ボスを倒すと次の台。
//
// 座標はユニット：台の幅 TW（720）・高さ TH（1280）。動き・当たり・ダメージの多くは World のものを使う。

import { cat, heroById, type EnemyArt } from '../core/catalog';
import type { ExtEffect, GumBoost, GumSrc, Tally } from './tally';
import { blip, buzz, se } from '../core/audio';
import { clamp, pick, rand } from '../core/util';
import { ELEMS, ELEM_COLOR, ELEM_NAME, WEAK_TO, type Elem } from './elements';
import { EQUIP_SLOTS, emptyTotals, scoreOf, scoreVal, totalsOf, type ModTotals, type RunStats } from './mods';
import { abilityById, abilityOf, abilityPower, resolveAbility, type AbilityId } from './abilities';
import { OFFERS, OFFER_CHANCE, OFFER_MAX, ruleOf, type OfferId, type RuleDef } from './offers';
import {
  CANNON, CAPTIVE, CASTLE, CRANE, CRANE_PRIZE, DINO, DISC, FACE, GACHA, HAMMER, HYPER, MAGNET, MEGA13, MINI, MINI_BUMPERS, MOAI, POPUP, POPUPS, TOY_IDS, UFO,
  toysOf, type ToyId,
} from './toys';
import type { Hero } from '../core/catalog';
import { FLOORS, bossGum, bossHp, enemyGum, enemyHp, impactFactor, isRaidFloor, type Stats } from './economy';
import { World, type Body, type Enemy, type Hit, type Mate, type WorldEvents } from './world';
import type { Save } from '../core/save';
import * as T from './table';

export const TABLE_W = T.TW;
/** G・U・M を全部点けたときの大当たり（本編。的 1 体ぶんの GUM の何倍か） */
export const LANE_JACKPOT = 12;
export const TABLE_H = T.TH;
/** 1 回のプレイの長さ（秒）。ピラミッドに入っている間は止まる */
export const PIN_TIME = 40;
/** 坂の重さ（下向きの加速） */
const GRAVITY = 1150;
/** 傾けたときに球を曲げる力（坂の重さより弱い：少し曲げるだけ） */
const NUDGE = 620;
/** 球の速さの上限 */
const MAX_BALL = 2800;
/** ホールで止まっている時間（ロックのホールでは、この間に引っぱれば狙い撃ち） */
const SAUCER_HOLD = 1.3;
const MYSTERY_HOLD = 1.1;
/** ループ：入口から出口までこの秒数以内 */
const LOOP_TIME = 3.2;
const RAMP_SPEED = 1300;
/** ランプを続けて通るとコンボ（この秒数以内） */
const RAMP_COMBO = 6;
/** ブラックホール：間隔・開いている時間・吸いこむ範囲 */
const HOLE_EVERY = 13;
const HOLE_OPEN = 7;
export const HOLE_PULL = 110;
/** ピラミッドへの入口：吸い寄せる範囲（開いている時間はスキルで変わる：stats.gateTime） */
export const GATE_PULL = 105;
/** ゴーストスター：間隔・分身の数と時間 */
const STAR_EVERY = 10;
const GHOSTS = 3;
const GHOST_TIME = 7;
/** ブースターで出る速さ */
const BOOST_SPEED = 2100;
/** この連鎖から ZONE（坂が軽くなり、GUM ×2） */
export const ZONE_COMBO = 20;

const FLIP_SPEED = 20;
const LANE_LETTERS = ['G', 'U', 'M'];

/** ミステリーのホールで起きること */
export const MYSTERIES = [
  { id: 'gum', text: 'GUM RAIN!', sub: 'GUM がどっさり' },
  { id: 'ghost', text: 'GHOST BALL!', sub: '分身球が出る' },
  { id: 'lock', text: 'LOCK LIT!', sub: 'ロックがひとつ進む' },
  { id: 'mul', text: 'MULTIPLIER UP!', sub: 'GUM の倍率 +1' },
  { id: 'save', text: 'BALL SAVE 10s', sub: '10 秒間、落ちても戻る' },
  { id: 'time', text: 'EXTRA TIME +3s', sub: 'のこり時間が増える' },
  { id: 'hole', text: 'BLACK HOLE!', sub: 'ブラックホールが開く' },
  { id: 'kick', text: 'KICKBACKS LIT!', sub: '左右のキックバックが点く' },
] as const;

/** 演出（ライトショー）の合図。描画がランプの光り方を決める */
export interface Show { kind: 'radial' | 'chase' | 'strobe' | 'rainbow' | 'fade'; t0: number; x: number; y: number; color: string; dur: number }

export interface Seg { ax: number; ay: number; bx: number; by: number; kick: boolean; outer: boolean; oneWay: boolean; flash: number }
export interface Bumper { x: number; y: number; r: number; flash: number }
export interface Flipper {
  px: number; py: number; side: 1 | -1; len: number; rest: number; upA: number;
  /** 角度（下向きが正）・角速度・上げている残り時間・つぎに動けるまで */
  a: number; av: number; up: number; cd: number;
}
export interface Lane { x: number; lit: boolean; flash: number }
export interface Ramp { id: 'R' | 'L'; path: T.P[]; len: number; color: string; flash: number }

export function flipperTip(f: Flipper): [number, number] {
  return [f.px + f.side * Math.cos(f.a) * f.len, f.py + Math.sin(f.a) * f.len];
}

function pathLen(path: T.P[]): number {
  return path.slice(1).reduce((a, [x, y], i) => a + Math.hypot(x - path[i][0], y - path[i][1]), 0);
}

export class PinballWorld extends World {
  segs: Seg[] = T.SEGS.map((s) => ({ ax: s.a[0], ay: s.a[1], bx: s.b[0], by: s.b[1], kick: !!s.kick, outer: !!s.outer, oneWay: !!s.oneWay, flash: 0 }));
  bumpers: Bumper[] = T.BUMPERS.map((b) => ({ ...b, flash: 0 }));
  flippers: Flipper[] = T.FLIPPERS.map((f) => ({ px: f.px, py: f.py, side: f.side, len: f.len, rest: f.rest, upA: f.up, a: f.rest, av: 0, up: 0, cd: 0 }));
  lanes: Lane[] = T.LANES.map((x) => ({ x, lit: false, flash: 0 }));
  ramps: Ramp[] = T.RAMPS.map((r) => ({ ...r, len: pathLen(r.path), flash: 0 }));
  spinners = T.SPINNERS.map(([x, y]) => ({ x, y, angle: 0, speed: 0 }));
  /** ロックのホール（3 回でマルチボール） */
  saucer = { x: T.LOCK[0], y: T.LOCK[1], r: 13, locks: 0, cool: 0, flash: 0 };
  /** ミステリーのホール */
  mystery = { x: T.MYSTERY[0], y: T.MYSTERY[1], r: 13, cool: 0, flash: 0, pick: -1 };
  warps = T.WARPS.map((w) => ({ x: w.in[0], y: w.in[1], r: 13, out: w.out, v: w.v, cool: 0 }));
  kickbacks = T.KICKBACKS.map((k) => ({ ...k, lit: true, t: 0, flash: 0 }));
  boosters = T.BOOSTERS.map((b) => ({ ...b, cool: 0, flash: 0 }));
  /** ピラミッドへの入口（G-U-M で開く）。entering は吸いこまれている間の秒 */
  gate = { x: T.GATE[0], y: T.GATE[1], open: false, t: 0, spin: 0, entering: -1 };
  /** 球が止まっている：打ち出し待ち・ロックのホール・ミステリーのホール */
  parked: 'plunger' | 'saucer' | 'mystery' | 'cannon' | null = 'plunger';
  parkT = 0;
  ballSaveUntil = -9;
  /** GUM の倍率（レーンを全部点けると上がる。落ちると 1 に戻る） */
  pinMul = 1;
  /** ループの入口を通った側と時刻 */
  loopFrom: { side: -1 | 1; t: number } | null = null;
  private prevY = 0;
  drains = 0;
  loops = 0;
  multiballs = 0;
  rampsDone = 0;
  /** このプレイでピラミッドに入った回数 */
  pyramids = 0;
  /** ワイヤーのランプの上を走っている（どのランプか・道の上の距離） */
  onRamp: { i: number; s: number } | null = null;
  rampLastT = -9;
  rampCombo = 0;
  /** ブラックホール：開いている間 on。吸いこんだ球は held 秒後に撃ち出す */
  hole = { x: 360, y: 240, on: false, t: 0, next: 8, held: -1, spin: 0 };
  /** ゴーストスター */
  star = { x: 0, y: 0, on: false, t: 0, next: 6 };
  /** ZONE（20 連鎖から） */
  zone = false;
  /** 上の画面（液晶）に出すこと */
  display = { text: 'READY', sub: '引っぱって打ち出す', tier: 0, t: 0 };
  /** ライトショーの合図 */
  shows: Show[] = [];
  /** 画面を一瞬寄せる（ジャックポットなど） */
  punch = 0;
  /** インレーンの星（通ると光る）：左・右の光る残り時間 */
  inlane = [0, 0];
  /** このプレイが始まった時刻（カメラの最初の見せ方に使う） */
  runStartT = 0;
  /** 通り道のライト：灯った時刻（-9 は消えている）・道ぜんぶが灯ったときの光 */
  lights = T.LIGHT_PATHS.map((lp) => ({ ...lp, lit: lp.pts.map(() => -9), flash: 0, minX: Math.min(...lp.pts.map((q) => q[0])) - 30, maxX: Math.max(...lp.pts.map((q) => q[0])) + 30, minY: Math.min(...lp.pts.map((q) => q[1])) - 30, maxY: Math.max(...lp.pts.map((q) => q[1])) + 30 }));
  /** ワイヤーのランプの LED：灯った時刻 */
  rampLeds = this.ramps.map((r) => Array.from({ length: Math.floor(r.len / T.RAMP_LED_STEP) + 1 }, () => -9));
  /** ピピピの音：続けて灯った数と、最後に灯った時刻 */
  private pipRun = 0;
  private pipT = -9;
  /** スキルの仕掛け：マグナセーブ・ゆらしセーブがまた使える時刻・フレンジーの終わり・スキルショット */
  magnaReady = 0;
  shakeSaveReady = 0;
  frenzyUntil = -9;
  private bumperHits: number[] = [];
  private shockReady = 0;
  skillShot: { lane: number; until: number } | null = null;
  /** スキルショットの強さの帯（打ち出し待ちの間だけ。0〜1） */
  shotBand: [number, number] | null = null;
  /** 打ち出した時刻（打ち出しで右の通路を上がったのをループと数えない） */
  plungeT = -9;
  /** 台の改造（装備したエクステンションと Limited）の効き目 */
  mods: ModTotals = emptyTotals();
  /** ヒーローの能力：リーダー（自分の球）と、ヒーローごと（控え・持っているヒーロー） */
  lead: { id: AbilityId; k: number } = { id: 'feeder', k: 0 };
  private abCache = new Map<number, { id: AbilityId; k: number }>();
  /** 能力の記録：分裂のバンパー回数・跳ね返り・風・再充填 */
  private splitHits = new Map<Body, number>();
  private bounced = new Set<Body>();
  private windUntil = new Map<Body, number>();
  private rechargeReady = 0;
  /** Limited の記録：台で最初の的・柵（1 回）・レーザーの時刻 */
  private firstDone = false;
  private fenceOnceUsed = false;
  private laserT = 0;
  /** 球が止まりかけていないか（同じ場所にいる時間） */
  private stall = { x: 0, y: 0, t: 0 };
  /** レーザーの光（描画用：x, 的の y, 撃った時刻） */
  beams: { x: number; y: number; t: number }[] = [];
  /** いま当たっている球（仲間の球の能力を、当たりの計算で使う） */
  private hitter: Body | null = null;
  /** このプレイで的に当てた攻撃の色・ZONE に入った回数（スコアの効果の条件） */
  runColors = new Set<Elem>();
  zones = 0;
  /** 台の大きな仕掛け（toys.ts）：あるかどうかと、それぞれの動き */
  toys: Record<ToyId, boolean> = Object.fromEntries(TOY_IDS.map((id) => [id, true])) as Record<ToyId, boolean>;
  hyper = { ride: null as null | { a: number; trav: number; laps: number; done: number }, cool: 0, flash: 0 };
  cannon = { a: -Math.PI / 2, cool: 0, flash: 0, fired: -9 };
  castle = { hits: 0, open: false, crumble: 0, flash: 0, cd: 0 };
  face = { open: false, t: FACE.every, flash: 0 };
  disc = { a: 0, dir: 1, t: DISC.flip };
  hammer = { next: HAMMER.every, warn: -1, x: 360, y: 700, slamT: -9 };
  /** ガチャマシンからカプセルが出た時刻（描画用） */
  gachaPop = -9;
  /** 球を運ぶ仕掛けの中（つかむ手・怪物の口・磁石・上の小さな台）。この間、球は台のものに当たらない */
  carry: null | { kind: 'crane' | 'dino' | 'magnet' | 'mini'; t: number; sel: number; x: number; a: number; n: number } = null;
  crane = { cool: 0, prize: -1, prizeT: -9 };
  captive = { off: 0, v: 0, hits: 0, flash: 0, cd: 0 };
  pops = POPUPS.map(() => ({ up: false, t: rand(1, 4), h: 0, flash: 0 }));
  private popDone = new Set<number>();
  dino = { cool: 0, chomp: -9 };
  ufo = { x: UFO.x, y: UFO.y, hits: 0, open: 0, flash: 0, cd: 0, zap: 0 };
  /** UFO の光線（描画用：的の位置と撃った時刻） */
  zaps: { x: number; y: number; t: number }[] = [];
  magToy = { cool: 0 };
  moai = { up: MOAI.xs.map(() => true), fall: MOAI.xs.map(() => 0), gold: 0, rise: 0, flash: 0 };
  /** 上の小さな台の中の球（台の大きさ MINI.w × MINI.h の座標） */
  mini = { x: 0, y: 0, vx: 0, vy: 0, lit: [false, false, false], flash: [0, 0, 0], flip: 0, cool: 0, shown: 0, jackpots: 0 };
  /** 受けたオファー（このプレイの間）・来た回数・つぎの突破で余分に選べる Limited の数・外れた装備 */
  offers = new Set<OfferId>();
  offerCount = 0;
  extraPicks = 0;
  offExt = -1;
  /** いまの台の掟（レイドボスの台だけ） */
  rule: RuleDef | null = null;
  /** 予備のセーブののこり回数・ループで上がったその台の GUM 倍率・柵の待ち時間 */
  private spareLeft = 0;
  private tableBonus = 0;
  private fenceCd = 0;
  /** 打ち出した球が、まだ右の通路の中にいる（弱いと通路へ落ちて戻る） */
  inShooter = false;
  /** マルチボールに必要なロックの数 */
  get locksNeeded(): number { return Math.max(1, (this.st.megaMulti ? 2 : 3) - (this.mods?.lockLess ?? 0)); }
  get frenzy(): boolean { return this.time < this.frenzyUntil; }

  constructor(save: Save, ev: WorldEvents) {
    super(save, ev);
    this.w = T.TW;
    this.h = T.TH;
  }

  override resize(): void { this.w = T.TW; this.h = T.TH; }
  override get runTime(): number { return PIN_TIME + this.mods.extraTime; }
  override calcStats(): Stats {
    const st = super.calcStats();
    this.mods = totalsOf((this.save.equip ?? []).filter((id) => id !== this.offExt), this.save.limited ?? []);
    this.comboGrace = this.mods.comboCore;
    this.toys = toysOf(this.save);
    // 能力：先頭がリーダー。控えは「まね」を、編成のとなりで解く
    const party: Hero[] = (this.save.party?.length ? this.save.party : [this.save.hero]).map((id) => heroById(id));
    if (!party.length || party[0].id !== this.save.hero) party.unshift(heroById(this.save.hero));
    this.abCache = new Map();
    const ap = 1 + this.mods.abilityPct;
    party.forEach((h, i) => this.abCache?.set(h.id, { id: resolveAbility(party, i).id, k: abilityPower(h, false) * ap }));
    this.lead = { id: resolveAbility(party, 0).id, k: abilityPower(party[0], true) * ap };
    this.flippers?.forEach((f, i) => { f.len = T.FLIPPERS[i].len * (i < 2 ? (1 + this.mods.flipperLen) * (this.rule?.id === 'shortFlip' ? 0.8 : 1) : 1 + this.mods.upperFlipLen); });
    return st;
  }
  /** 当たった的を塗る（改造）：いまの攻撃の色の弱点に */
  override damage(e: Enemy, dmg: number, x: number, y: number, how: Hit, elem?: Elem): void {
    const by = this.hitter ?? (how === 'hit' || how === 'smash' || how === 'press' ? this.puck : null);
    const ab = this.abOf(by);
    const paint = this.mods.paint + (ab?.id === 'paint' ? Math.min(1, 0.3 * ab.k) : 0);
    const color = elem ?? (by === this.puck ? this.attack : undefined);
    if (color && !e.boss && e.hp > 0 && paint > 0 && WEAK_TO[e.elem] !== color && Math.random() < paint) {
      e.elem = (Object.keys(WEAK_TO) as Elem[]).find((k) => WEAK_TO[k] === color) ?? e.elem;
      e.elemT = 7;
      this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.4, r0: e.r * 2.2, r1: e.r, color: ELEM_COLOR[e.elem] });
      if (this.fxBudget-- > 0) this.nums.push({ x: e.x, y: e.y - e.r * 1.5, t: 0, text: 'PAINT!', color: ELEM_COLOR[e.elem], size: 13 });
    }
    const alive = e.hp > 0;
    if (color && alive) this.runColors.add(color);
    const weak = !!elem && WEAK_TO[e.elem] === elem;
    let mul = (1 + this.mods.atkPct) * this.hitMul(by) * (this.offers.has('atk') ? 1.5 : 1);
    if (e.boss) mul *= 1 + this.mods.bossAtk;
    if (color === 'green') mul *= 1 + this.mods.greenAtk;
    if (by && by !== this.puck) mul *= 1 + this.mods.mateAtk;
    if (by && this.mods.crit > 0 && alive && Math.random() < this.mods.crit) {
      mul *= 3;
      if (this.fxBudget-- > 0) this.nums.push({ x: e.x, y: e.y - e.r * 2.4, t: 0, text: 'CRITICAL!', color: '#ff8f2e', size: 15 });
    }
    super.damage(e, dmg * mul, x, y, how, elem);
    if (!alive || e.hp > 0) return;
    this.onKillMods(e);
    // 倒した：色で還元・再充填（台に出ている球の能力）
    const cash = this.abSum('cashback');
    if (weak && cash > 0) {
      const v = enemyGum(this.floor, e.tier) * 0.3 * cash * this.gumMul;
      this.ev.gum(v, 'mods');
      if (this.fxBudget-- > 0) this.nums.push({ x: e.x, y: e.y - e.r * 2, t: 0, text: 'CASHBACK!', color: '#ffd23f', size: 12 });
    }
    if (elem === 'green' && this.abSum('recharge') > 0 && this.time >= this.rechargeReady) {
      this.rechargeReady = this.time + 6;
      for (const k of this.kickbacks) { k.lit = true; k.flash = 0.6; }
      this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + 2);
      this.say('RECHARGE!', 1, 'キックバックが点き直し、ボールセーブがのびた');
    }
  }
  override get canHold(): boolean { return this.phase === 'play' && (this.parked === 'plunger' || this.parked === 'saucer' || this.parked === 'cannon'); }
  /** 球の大きさ：マレットの大きさのスキルで少しだけ大きくなる（台に収まる大きさまで） */
  override get radius(): number {
    return clamp(this.st.radius * 0.45, 10, 13) * (this.buffOn('giant') ? 1.2 : 1);
  }
  override get gumMul(): number {
    // 控えの球の「倍率の供給・貯金箱」は台に出ている間だけ（リーダーの分はプレイのあとに掛ける：gumBoosts）
    const lead = this.lead?.id === 'feeder' || this.lead?.id === 'piggy' ? this.lead : null;
    const feed = (this.abSum('feeder') - (lead?.id === 'feeder' ? lead.k : 0)) * 0.1 + (this.abSum('piggy') - (lead?.id === 'piggy' ? lead.k : 0)) * 0.02 * this.gumDigits;
    return super.gumMul * this.pinMul * (this.zone ? 2 : 1) * (this.floorT < 8 ? 1 + (this.mods?.dawnGum ?? 0) : 1) * (1 + this.mods.colorGum[this.attack] + this.tableBonus + feed);
  }
  private get gumDigits(): number { return Math.max(1, Math.floor(Math.log10(Math.max(1, this.save.gum))) + 1); }
  /**
   * プレイのあとに掛ける倍率（発表する順）。rows は出どころ 1 つだけに掛かるもの（装備の改造）、
   * all は全体に掛かるもの（スキル・Limited・リーダーの能力・取引）。
   */
  /** このプレイの記録（スコアの効果の条件）。tally は main の集計（的・ボス・ライト・ジャックポットの回数） */
  runStats(tally?: Tally, id = 0): RunStats {
    const n = (src: GumSrc): number => tally?.rows.get(src)?.n ?? 0;
    const equip = (this.save.equip ?? []).filter((x) => x !== this.offExt);
    return {
      kills: n('enemy') + n('pyramid'), loopsRamps: this.loops + this.rampsDone, lightsAll: n('light'), bestCombo: this.bestCombo,
      tables: Math.max(0, this.floor - this.runStartFloor) + (this.phase === 'over' && this.floor >= FLOORS ? 1 : 0),
      drains: this.drains, bosses: n('boss'), colors: this.runColors.size, zones: this.zones, jackpots: n('jackpot'),
      multiballs: this.multiballs, emptySlots: Math.max(0, (this.save.extSlots ?? EQUIP_SLOTS) - equip.length), runsWith: this.save.extRuns?.[id] ?? 0,
    };
  }
  /**
   * プレイのあとに掛ける効果（発表する順）。
   * rows：出どころ 1 つだけに掛かる倍率（Limited）。exts：装備のエクステンションのスコアの効果（装備の並び順）。
   * all：全体の倍率（スキル・Limited・リーダーの能力・取引）。
   */
  gumBoosts(tally?: Tally): { rows: (GumBoost & { src: GumSrc })[]; exts: ExtEffect[]; all: GumBoost[] } {
    const rows: (GumBoost & { src: GumSrc })[] = [];
    const all: GumBoost[] = [];
    const exts: ExtEffect[] = [];
    const equip = (this.save.equip ?? []).filter((id) => id !== this.offExt);
    const lim = this.save.limited ?? [];
    // 出どころごと（同じ出どころの改造は足し合わせて 1 行）
    const ROW: { key: 'bumperGum' | 'slingGum' | 'spinGum' | 'lightPay'; src: GumSrc; label: string }[] = [
      { key: 'bumperGum', src: 'bumper', label: 'バンパー' },
      { key: 'slingGum', src: 'sling', label: '三角のばね' },
      { key: 'spinGum', src: 'spin', label: 'スピナー' },
      { key: 'lightPay', src: 'light', label: '通り道のライト' },
    ];
    for (const r of ROW) {
      const items: { name: string; img: string }[] = [];
      let add = 0;
      for (const id of lim) {
        const v = totalsOf([], [id])[r.key];
        const l = cat.limited.find((x) => x.id === id);
        if (v > 0 && l) { add += v; items.push({ name: l.name, img: l.img }); }
      }
      if (add > 0) rows.push({ src: r.src, name: items.map((x) => x.name).join('・'), sub: `${r.label}の GUM`, mul: 1 + add, img: items[0].img, color: '#ff6ad5' });
    }
    // 装備のエクステンション（左から順に）
    const unit = enemyGum(this.floor, 0);
    for (const id of equip) {
      const e = cat.exts.find((x) => x.id === id);
      const d = e && scoreOf(e);
      if (!e || !d) continue;
      const r = d.eval(this.runStats(tally, id), scoreVal(e, d));
      const amount = d.kind === 'chips' ? r.amount * unit : r.amount;
      const fired = d.kind === 'xmult' ? r.amount > 1.0001 : r.amount > 0;
      exts.push({ id, name: e.name, sub: `${d.name}：${r.note}`, kind: d.kind, amount, fired, img: e.img });
    }
    // 全体：スキル → Limited → リーダーの能力 → 取引
    if (this.st.gumMul > 1.0001) all.push({ name: 'スキルツリー', sub: 'GUM の枝・ヒーローのボーナス', mul: this.st.gumMul, img: cat.icons.gum, color: '#ffd23f' });
    for (const id of lim) {
      const t = totalsOf([], [id]);
      const l = cat.limited.find((x) => x.id === id);
      if (!l) continue;
      if (t.gumPct > 0) all.push({ name: l.name, sub: 'Limited', mul: 1 + t.gumPct, img: l.img, color: '#ff8f2e' });
      if (t.souvenir > 0) all.push({ name: l.name, sub: 'Limited：おみやげ', mul: 1 + t.souvenir, img: l.img, color: '#ff8f2e' });
    }
    const lead = this.lead;
    if (lead.id === 'feeder' || lead.id === 'piggy') {
      const h = heroById(this.save.hero);
      const mul = 1 + (lead.id === 'feeder' ? 0.1 * lead.k : 0.02 * lead.k * this.gumDigits);
      all.push({ name: h.name, sub: `リーダーの能力：${abilityById(lead.id).name}`, mul, img: h.img, color: '#3fd0ff' });
    }
    if (this.offers.has('gum2')) all.push({ name: '取引', sub: 'このプレイの GUM ×2', mul: 2, img: cat.icons.gum, color: '#c08bff' });
    return { rows, exts, all };
  }
  /** この球の能力（自分の球はリーダーの能力。分身はリーダーと同じ） */
  abOf(b: Body | null): { id: AbilityId; k: number } | null {
    if (!b) return null;
    if (b === this.puck) return this.lead;
    const m = b as Mate;
    if (!m.hero) return null;
    if (m.ghost !== undefined) return { id: this.lead.id, k: this.lead.k / 1.5 };
    let a = this.abCache.get(m.hero.id);
    if (!a) { a = { id: abilityOf(m.hero).id, k: abilityPower(m.hero, false) }; this.abCache.set(m.hero.id, a); }
    return a;
  }
  /** 台に出ている球（自分の球と本物の仲間）のうち、この能力の強さの合計 */
  abSum(id: AbilityId): number {
    let k = this.lead?.id === id ? this.lead.k : 0;
    for (const b of this.mates ?? []) {
      if (b.ghost !== undefined) continue;
      const a = this.abOf(b);
      if (a?.id === id) k += a.k;
    }
    return k;
  }
  /** ボスの城が崩れた：ボスに大ダメージ */
  private storm(): void {
    const c = this.castle;
    c.open = false;
    c.hits = 0;
    c.crumble = 1;
    const boss = this.enemies.find((e) => e.boss && e.hp > 0);
    if (boss) this.damage(boss, boss.maxHp * 0.35, boss.x, boss.y, 'smash');
    this.say('CASTLE DESTROYED!', 3, '城が崩れ、ボスに大ダメージ');
    this.show('strobe', 1.2, '#ffd23f', CASTLE.x, CASTLE.y);
    this.quake = Math.max(this.quake, 20);
    this.punch = 1;
    se('blast', 0.8, 0, 0.7);
  }
  /** 仕掛けの時間：顔の口・回転盤・ボスの反撃・跳ね橋 */
  private stepToys(dt: number): void {
    this.stepToys2(dt);
    this.hyper.cool = Math.max(0, this.hyper.cool - dt);
    this.hyper.flash = Math.max(0, this.hyper.flash - dt);
    this.cannon.cool = Math.max(0, this.cannon.cool - dt);
    this.cannon.flash = Math.max(0, this.cannon.flash - dt);
    const c = this.castle;
    c.cd = Math.max(0, c.cd - dt);
    c.flash = Math.max(0, c.flash - dt);
    c.crumble = Math.max(0, c.crumble - dt * 0.5);
    if (!this.bossAlive) { c.hits = 0; c.open = false; }
    // しゃべる顔：口がときどき開く
    if (this.toys.face) {
      this.face.flash = Math.max(0, this.face.flash - dt);
      this.face.t -= dt;
      if (this.face.t <= 0) {
        this.face.open = !this.face.open;
        this.face.t = this.face.open ? FACE.open : FACE.every;
        if (this.face.open) this.say('OPEN WIDE!', 1, 'しゃべる顔の口が開いた');
      }
    }
    // 回転盤：ときどき逆回り
    if (this.toys.disc) {
      this.disc.a += this.disc.dir * 2.4 * dt;
      this.disc.t -= dt;
      if (this.disc.t <= 0) { this.disc.t = DISC.flip; this.disc.dir *= -1; }
    }
    // ボスの反撃：光で知らせて 1 秒後、台を叩く
    const h = this.hammer;
    if (!this.toys.hammer || !this.bossAlive) { h.next = HAMMER.every; h.warn = -1; return; }
    if (h.warn >= 0) {
      h.warn -= dt;
      if (h.warn < 0) this.slam();
      return;
    }
    h.next -= dt;
    if (h.next <= 0) {
      h.warn = HAMMER.warn;
      const p = this.puck;
      h.x = clamp(p.x, 120, 600);
      h.y = clamp(p.y, 300, 1000);
      this.say('BOSS SMASH!', 2, 'ボスがハンマーで台を叩く');
      blip(120, 0.6, 'sawtooth', 0.07, 0.5);
    }
  }
  private slam(): void {
    const h = this.hammer;
    h.slamT = this.time;
    h.next = HAMMER.every * rand(0.8, 1.2);
    this.quake = Math.max(this.quake, 18);
    this.show('strobe', 0.5, '#ff4f5e', h.x, h.y);
    se('blast', 0.7, 0, 0.6);
    buzz(60);
    const balls: Body[] = [...(this.ballFree ? [this.puck] : []), ...this.mates];
    for (const b of balls) {
      const d = Math.hypot(b.x - h.x, b.y - h.y);
      const k = d < HAMMER.reach ? 1 - d / HAMMER.reach : 0.15;
      b.vy -= 300 + 900 * k;
      b.vx += rand(-400, 400) * k;
    }
  }
  /** 新しいプレイの仕掛けの初期化 */
  private resetToys(): void {
    this.carry = null;
    this.crane = { cool: 0, prize: -1, prizeT: -9 };
    this.captive = { off: 0, v: 0, hits: 0, flash: 0, cd: 0 };
    this.pops = POPUPS.map(() => ({ up: false, t: rand(1, 4), h: 0, flash: 0 }));
    this.popDone = new Set();
    this.dino = { cool: 0, chomp: -9 };
    this.ufo = { x: UFO.x, y: UFO.y, hits: 0, open: 0, flash: 0, cd: 0, zap: 0 };
    this.zaps = [];
    this.magToy = { cool: 0 };
    this.moai = { up: MOAI.xs.map(() => true), fall: MOAI.xs.map(() => 0), gold: 0, rise: 0, flash: 0 };
    this.mini = { x: 0, y: 0, vx: 0, vy: 0, lit: [false, false, false], flash: [0, 0, 0], flip: 0, cool: 0, shown: 0, jackpots: 0 };
  }
  /** 台の上の球すべて（いま自由に動いているもの） */
  private freeBalls(): Body[] {
    return [...(this.ballFree ? [this.puck] : []), ...this.mates];
  }
  /** 当たると止まらずはね返す丸（捕まった球の口・出ている的・UFO・モアイ） */
  private diskHit(b: Body, x: number, y: number, r: number, out: number): { nx: number; ny: number; vn: number } | null {
    const dx = b.x - x;
    const dy = b.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const min = b.r + r;
    if (d >= min) return null;
    const nx = dx / d;
    const ny = dy / d;
    b.x = x + nx * min;
    b.y = y + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const o = Math.max(out, -vn * 0.6);
      b.vx += (o - vn) * nx;
      b.vy += (o - vn) * ny;
    } else {
      b.vx += nx * out * 0.5;
      b.vy += ny * out * 0.5;
    }
    return { nx, ny, vn };
  }
  /** 台の上の丸い仕掛けとの当たり */
  private toyDisks(b: Body, main: boolean): void {
    const on = this.toys;
    if (on.captive) {
      const h = this.diskHit(b, CAPTIVE.x, CAPTIVE.y, CAPTIVE.r, 300);
      // 下から当てると、筒の中の球が上がる
      if (h && h.ny > 0.2 && this.captive.off < 6 && -h.vn > 200) {
        this.captive.v = Math.min(1500, -h.vn * 1.15);
        this.captive.flash = 0.2;
        blip(330, 0.08, 'square', 0.06, 2);
      }
    }
    if (on.popup) {
      this.pops.forEach((pp, i) => {
        if (!pp.up || pp.h < 0.5) return;
        const [x, y] = POPUPS[i];
        if (!this.diskHit(b, x, y, POPUP.r, 700)) return;
        pp.up = false;
        pp.t = rand(3, 6);
        pp.flash = 0.4;
        this.gimmick(main, x, y, 0.4, 'lane', 'popup');
        this.popDone.add(i);
        if (this.popDone.size >= POPUP.all) {
          this.popDone.clear();
          this.gimmick(main, x, y - 30, 5, 'lane', 'popup');
          this.say('FROG PARTY!', 3, '出てきた的を全部倒した');
          this.show('chase', 0.9, '#4fe07a', x, y);
        } else this.say(`FROG ${this.popDone.size} / ${POPUP.all}`, 1, '出ている的に当てた');
        se('hit', 0.3, 40, 2);
      });
    }
    if (on.ufo) {
      const u = this.ufo;
      const h = this.diskHit(b, u.x, u.y, UFO.r, 760);
      if (h && u.cd <= 0 && u.open <= 0) {
        u.cd = 0.3;
        u.flash = 0.3;
        u.hits += 1;
        this.gimmick(main, u.x, u.y, 0.3, 'lane', 'ufo');
        if (u.hits >= UFO.hits) {
          u.hits = 0;
          u.open = 3;
          u.zap = 0;
          this.say('ABDUCTION!', 3, 'UFO が開いて、光線で敵を撃つ');
          this.show('strobe', 0.8, '#6dffb0', u.x, u.y);
          se('blast', 0.5, 0, 1.3);
        } else {
          this.say(`UFO ${u.hits} / ${UFO.hits}`, 1, 'ゆれる UFO に当てる');
          blip(900, 0.12, 'sine', 0.06, 0.6);
        }
      }
    }
    if (on.moai) {
      const m = this.moai;
      MOAI.xs.forEach((x, i) => {
        if (!m.up[i] || m.rise > 0) return;
        // ふれたら倒れる（上に乗って止まらないように、どこから当てても倒れる）
        if (!this.diskHit(b, x, MOAI.y, MOAI.r, 420)) return;
        m.up[i] = false;
        m.fall[i] = 1;
        this.gimmick(main, x, MOAI.y, 0.3, 'lane', 'moai');
        blip(180, 0.15, 'square', 0.07, 0.5);
        if (m.up.every((u) => !u)) {
          m.gold = MOAI.gold;
          this.say('GOLDEN MOAI!', 3, '金のモアイが出た。当てると大当たり');
          this.show('chase', 0.9, '#ffd23f', 360, MOAI.y);
        }
      });
      if (m.gold > 0 && this.diskHit(b, 360, MOAI.y, 18, 900)) {
        m.gold = 0;
        m.rise = 1;
        m.flash = 0.8;
        this.gimmick(main, 360, MOAI.y, 12, 'lane', 'moai');
        this.ballSaveUntil = Math.max(this.ballSaveUntil, this.time + 3);
        this.say('MOAI JACKPOT!', 3, '金のモアイに当てた・ボールセーブ');
        this.show('strobe', 1, '#ffd23f', 360, MOAI.y);
        this.punch = 1;
        se('blast', 0.6, 0, 1);
      }
    }
  }
  /** 球をつかむ・食べる・止める仕掛け（本物の球だけ）。つかんだら true */
  private toyCatch(b: Body): boolean {
    const on = this.toys;
    const sp = Math.hypot(b.vx, b.vy);
    const near = (x: number, y: number, r: number) => Math.hypot(b.x - x, b.y - y) < r;
    const grab = (kind: 'crane' | 'dino' | 'magnet' | 'mini', x: number, a = 0) => {
      this.carry = { kind, t: 0, sel: 1, x, a, n: 0 };
      b.vx = 0;
      b.vy = 0;
    };
    if (on.crane && this.crane.cool <= 0 && sp < 1300 && near(CRANE.cup[0], CRANE.cup[1], CRANE.r + 4)) {
      grab('crane', CRANE.cup[0]);
      [b.x, b.y] = CRANE.cup;
      this.say('GRAB!', 2, 'つかむ手：傾けた側の賞へ運ぶ');
      blip(260, 0.2, 'square', 0.06, 1.5);
      return true;
    }
    if (on.dino && this.dino.cool <= 0 && near(DINO.mouth[0], DINO.mouth[1], DINO.r)) {
      grab('dino', DINO.mouth[0]);
      [b.x, b.y] = DINO.mouth;
      this.dino.chomp = this.time;
      this.say('GULP!', 2, '怪物が球を食べた');
      se('hit', 0.5, 0, 0.6);
      return true;
    }
    if (on.magnet && this.magToy.cool <= 0 && sp < 1700 && near(MAGNET.x, MAGNET.y, MAGNET.r)) {
      grab('magnet', MAGNET.x, Math.atan2(b.y - MAGNET.y, b.x - MAGNET.x));
      this.say('MAGNET!', 2, '磁石が球を止めた');
      blip(140, 0.3, 'sawtooth', 0.05, 3);
      return true;
    }
    if (on.mini && this.mini.cool <= 0 && near(MINI.x, MINI.y, MINI.r + 4)) {
      grab('mini', MINI.x);
      [b.x, b.y] = [MINI.x, MINI.y];
      const m = this.mini;
      m.x = MINI.w / 2;
      m.y = 40;
      m.vx = rand(-200, 200);
      m.vy = 300;
      this.say('UPPER PLAYFIELD!', 3, `上の小さな台で ${MINI.time} 秒`);
      this.show('chase', 0.7, '#c08bff', MINI.x, MINI.y);
      blip(600, 0.3, 'sine', 0.07, 2);
      return true;
    }
    return false;
  }
  /** 運ばれている球 */
  private stepCarry(dt: number): void {
    const c = this.carry;
    if (!c) return;
    const p = this.puck;
    c.t += dt;
    p.vx = 0;
    p.vy = 0;
    if (c.kind === 'crane') {
      const [cx, cy] = CRANE.cup;
      if (c.t < CRANE.down) { p.x = cx; p.y = cy; return; }
      // 上へ持ち上げる → 3 つの賞の上を動く（傾けた側を選ぶ。傾けていなければ行き来する）
      const up = clamp((c.t - CRANE.down) / CRANE.lift, 0, 1);
      const e = up * up * (3 - 2 * up);
      p.y = cy + (CRANE.railY - cy) * e;
      if (up >= 1) {
        const tx = this.hold.active ? 0 : this.tilt[0];
        if (Math.abs(tx) > 0.12) c.sel = tx < 0 ? 0 : 2;
        else {
          const ph = Math.floor((c.t - CRANE.down - CRANE.lift) * 1.6) % 4;
          c.sel = [1, 2, 1, 0][ph];
        }
        const want = CRANE.drops[c.sel];
        c.x += clamp(want - c.x, -520 * dt, 520 * dt);
      }
      p.x = c.x;
      if (c.t >= CRANE.end) {
        this.carry = null;
        let best = 0;
        CRANE.drops.forEach((x, i) => { if (Math.abs(x - c.x) < Math.abs(CRANE.drops[best] - c.x)) best = i; });
        p.y = CRANE.railY + 24;
        p.vx = rand(-80, 80);
        p.vy = 200;
        this.crane.cool = 2.5;
        this.crane.prize = best;
        this.cranePrize(best);
      }
      return;
    }
    if (c.kind === 'dino') {
      [p.x, p.y] = DINO.mouth;
      // かむたびに GUM。3 回かんだら、敵へ向けて吐き出す（緑の貫通）
      const n = Math.floor(c.t / 0.33);
      if (n > c.n && c.n < DINO.chew) {
        c.n = n;
        this.dino.chomp = this.time;
        this.gimmick(true, DINO.x, DINO.y - 30, 0.4 * n, 'lane', 'dino');
        this.say(`CHOMP ×${n}`, 1, '怪物がかんでいる');
        this.quake = Math.max(this.quake, 4);
        blip(150 + n * 40, 0.1, 'square', 0.07, 0.6);
      }
      if (c.t >= DINO.chew * 0.33 + 0.25) {
        this.carry = null;
        this.dino.cool = 2.5;
        p.x = DINO.mouth[0] + 26;
        p.y = DINO.mouth[1] - 20;
        this.shootAt(this.bestTarget() ?? { x: 360, y: 300 }, 1800);
        this.say('SPIT!', 2, '怪物が吐き出した：緑の貫通');
        this.show('radial', 0.5, '#4fe07a', p.x, p.y);
        se('blast', 0.4, 0, 1.5);
      }
      return;
    }
    if (c.kind === 'magnet') {
      // ぐるぐる回して（だんだん速く）、狙いへ投げる
      const w = 8 + 16 * clamp(c.t / MAGNET.spin, 0, 1);
      c.a += w * dt;
      const rr = 30;
      p.x = MAGNET.x + Math.cos(c.a) * rr;
      p.y = MAGNET.y + Math.sin(c.a) * rr;
      if (Math.floor((c.a / (Math.PI * 2))) > c.n) { c.n += 1; blip(400 + c.n * 120, 0.05, 'square', 0.04, 1.5); }
      if (c.t >= MAGNET.spin) {
        this.carry = null;
        this.magToy.cool = 3;
        const tg = this.toys.ufo && this.ufo.open <= 0 ? this.ufo
          : this.gate.open ? this.gate
            : this.toys.face && this.face.open ? { x: FACE.x, y: FACE.mouthY }
              : this.bestTarget() ?? { x: 360, y: 300 };
        const a = Math.atan2(tg.y - MAGNET.y, tg.x - MAGNET.x);
        p.x = MAGNET.x + Math.cos(a) * (rr + 4);
        p.y = MAGNET.y + Math.sin(a) * (rr + 4);
        p.vx = Math.cos(a) * 2000;
        p.vy = Math.sin(a) * 2000;
        this.launchId += 1;
        this.say('THROW!', 2, '磁石が投げた');
        this.show('radial', 0.4, '#c08bff', MAGNET.x, MAGNET.y);
      }
      return;
    }
    // 上の小さな台
    p.x = MINI.x;
    p.y = MINI.y;
    if (this.stepMini(dt) || c.t >= MINI.time) {
      this.carry = null;
      this.mini.cool = 3;
      p.y = MINI.y + MINI.r + p.r + 4;
      p.vx = rand(-150, 150);
      p.vy = 450;
      this.say(c.t >= MINI.time ? 'UPPER TIME UP' : 'BACK DOWN', 1, '上の小さな台から戻った');
      this.show('radial', 0.4, '#c08bff', MINI.x, MINI.y);
    }
  }
  /** つかむ手の賞：左＝GUM・まん中＝レーンが 1 つ点く・右＝ロックが 1 つ増える */
  private cranePrize(i: number): void {
    const x = CRANE.drops[i];
    this.crane.prizeT = this.time;
    this.show('radial', 0.6, '#ffd23f', x, CRANE.railY);
    if (CRANE_PRIZE[i] === 'GUM') {
      this.gimmick(true, x, CRANE.railY, 6, 'lane', 'crane');
      this.say('PRIZE: GUM!', 3, 'つかむ手の賞');
    } else if (CRANE_PRIZE[i] === 'LANE') {
      this.gimmick(true, x, CRANE.railY, 1.5, 'lane', 'crane');
      this.lightNextLane();
      this.say('PRIZE: LANE!', 3, 'G-U-M のレーンがひとつ点く');
    } else {
      this.gimmick(true, x, CRANE.railY, 1.5, 'lane', 'crane');
      this.saucer.locks += 1;
      if (this.saucer.locks >= this.locksNeeded) { this.saucer.locks = 0; this.multiball(); }
      else this.say('PRIZE: LOCK!', 3, `あと ${this.locksNeeded - this.saucer.locks} 回でマルチボール`);
    }
    se('chest', 0.5);
  }
  /** 上の小さな台の中の動き。球が下へ落ちたら true */
  private stepMini(dt: number): boolean {
    const m = this.mini;
    for (let i = 0; i < 3; i += 1) m.flash[i] = Math.max(0, m.flash[i] - dt);
    m.flip = Math.max(0, m.flip - dt);
    const [tx, ty] = this.hold.active ? [0, 0] : this.tilt;
    const steps = 3;
    const h = dt / steps;
    const W = MINI.w;
    const H = MINI.h;
    const R = MINI.br;
    for (let k = 0; k < steps; k += 1) {
      m.vx += tx * 900 * h;
      m.vy += (1300 + ty * 300) * h;
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > 1500) { m.vx *= 1500 / sp; m.vy *= 1500 / sp; }
      m.x += m.vx * h;
      m.y += m.vy * h;
      if (m.x < R) { m.x = R; m.vx = Math.abs(m.vx) * 0.8; }
      if (m.x > W - R) { m.x = W - R; m.vx = -Math.abs(m.vx) * 0.8; }
      if (m.y < R) { m.y = R; m.vy = Math.abs(m.vy) * 0.8; }
      // 下の左右の坂（まん中へ集める）
      for (const [ax, ay, bx, by] of [[0, H - 90, W / 2 - 38, H - 34], [W, H - 90, W / 2 + 38, H - 34]]) {
        const c = segDist(m.x, m.y, ax, ay, bx, by);
        if (c.d >= R + 1) continue;
        const nx = c.d ? (m.x - c.qx) / c.d : 0;
        const ny = c.d ? (m.y - c.qy) / c.d : -1;
        m.x = c.qx + nx * (R + 1);
        m.y = c.qy + ny * (R + 1);
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) { m.vx -= 1.5 * vn * nx; m.vy -= 1.5 * vn * ny; }
      }
      // バンパー（観覧車）：当てると点く。3 つ点くと大当たり
      MINI_BUMPERS.forEach((bp, i) => {
        const dx = m.x - bp.x;
        const dy = m.y - bp.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= R + bp.r) return;
        const nx = dx / d;
        const ny = dy / d;
        m.x = bp.x + nx * (R + bp.r);
        m.y = bp.y + ny * (R + bp.r);
        const vn = m.vx * nx + m.vy * ny;
        const out = Math.max(820, -vn * 0.7);
        m.vx += (out - vn) * nx;
        m.vy += (out - vn) * ny;
        if (m.flash[i] > 0.1) return;
        m.flash[i] = 0.25;
        m.lit[i] = true;
        this.gimmick(true, MINI.x, MINI.y - 20, 0.3, 'bumper', 'mini');
        if (m.lit.every(Boolean)) {
          m.lit = [false, false, false];
          m.jackpots += 1;
          this.gimmick(true, MINI.x, MINI.y - 40, 6, 'lane', 'mini');
          this.say('MINI JACKPOT!', 3, '上の台のバンパーを全部点けた');
          this.show('strobe', 0.6, '#c08bff', MINI.x, MINI.y);
        }
      });
      // 下のまん中：自動のフリッパー（たまに打ちそこねて、球が下の台へ戻る）
      if (m.y > H - 40 && m.vy > 0 && Math.abs(m.x - W / 2) < 44) {
        if (m.flip <= 0 && Math.random() < 0.86) {
          m.flip = 0.18;
          m.vy = -rand(1050, 1400);
          m.vx = (m.x - W / 2) * 6 + rand(-260, 260);
          blip(300, 0.05, 'sawtooth', 0.05, 1.8);
        } else if (m.flip <= 0) m.flip = 0.5;
      }
      if (m.y > H + R) return true;
    }
    return false;
  }
  /** 新しい仕掛けの時間：捕まった球・出たり引っこむ的・UFO・モアイ */
  private stepToys2(dt: number): void {
    this.crane.cool = Math.max(0, this.crane.cool - dt);
    this.dino.cool = Math.max(0, this.dino.cool - dt);
    this.magToy.cool = Math.max(0, this.magToy.cool - dt);
    this.mini.cool = Math.max(0, this.mini.cool - dt);
    this.mini.shown = clamp(this.mini.shown + (this.carry?.kind === 'mini' ? dt : -dt) / 0.5, 0, 1);
    // 捕まった球：筒の中を上がって、てっぺんに届くと 1 回
    const cp = this.captive;
    cp.flash = Math.max(0, cp.flash - dt);
    cp.cd = Math.max(0, cp.cd - dt);
    if (cp.v !== 0 || cp.off > 0) {
      cp.off += cp.v * dt;
      cp.v -= 2600 * dt;
      if (cp.off >= CAPTIVE.len) {
        cp.off = CAPTIVE.len;
        cp.v = -Math.abs(cp.v) * 0.25;
        if (cp.cd <= 0) {
          cp.cd = 0.5;
          cp.hits += 1;
          cp.flash = 0.5;
          this.gimmick(true, CAPTIVE.x, CAPTIVE.y - CAPTIVE.len, 0.8, 'lane', 'captive');
          if (cp.hits >= CAPTIVE.hits) {
            cp.hits = 0;
            this.gimmick(true, CAPTIVE.x, CAPTIVE.y - CAPTIVE.len, 10, 'lane', 'captive');
            this.frenzyUntil = Math.max(this.frenzyUntil, this.time + 6);
            this.say('EARTH JACKPOT!', 3, '捕まった球を 3 回てっぺんへ・6 秒フレンジー');
            this.show('strobe', 1, '#3fd0ff', CAPTIVE.x, CAPTIVE.y);
            se('blast', 0.5, 0, 1.2);
          } else this.say(`CAPTIVE ${cp.hits} / ${CAPTIVE.hits}`, 2, '捕まった球がてっぺんに届いた');
        }
      }
      if (cp.off <= 0) { cp.off = 0; cp.v = 0; }
    }
    // 出たり引っこむ的：ときどき 1 つずつ出る。出るときに上の球は押し上げる
    if (this.toys.popup) {
      this.pops.forEach((pp, i) => {
        pp.flash = Math.max(0, pp.flash - dt);
        pp.t -= dt;
        pp.h = clamp(pp.h + (pp.up ? dt : -dt) * 6, 0, 1);
        if (pp.up && pp.t <= 0) { pp.up = false; pp.t = rand(POPUP.every, POPUP.every * 2.5); }
        else if (!pp.up && pp.t <= 0) {
          pp.up = true;
          pp.t = POPUP.up;
          const [x, y] = POPUPS[i];
          for (const b of this.freeBalls()) {
            if (Math.hypot(b.x - x, b.y - y) < b.r + POPUP.r + 2) { b.vy = -900; b.vx += (b.x - x) * 10; }
          }
          blip(700, 0.06, 'square', 0.04, 1.4);
        }
      });
    }
    // UFO：ゆれて浮かぶ。開いている間は 0.5 秒ごとに光線で敵を撃つ
    const u = this.ufo;
    u.flash = Math.max(0, u.flash - dt);
    u.cd = Math.max(0, u.cd - dt);
    u.x = UFO.x + Math.sin(this.time * 0.8) * UFO.sway;
    u.y = UFO.y + Math.sin(this.time * 2.1) * 5;
    this.zaps = this.zaps.filter((z) => this.time - z.t < 0.4);
    if (u.open > 0) {
      u.open -= dt;
      u.zap -= dt;
      if (u.zap <= 0) {
        u.zap = 0.5;
        const alive = this.enemies.filter((e) => e.hp > 0);
        const e = alive.filter((x) => !x.boss).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0] ?? alive[0];
        if (e) {
          this.zaps.push({ x: e.x, y: e.y, t: this.time });
          this.damage(e, e.maxHp * (e.boss ? 0.06 : 0.6), e.x, e.y, 'smash', 'blue');
          blip(1200, 0.12, 'sine', 0.06, 0.3);
        }
      }
    }
    // モアイ：倒れる動き・金のモアイの時間・起き上がり
    const m = this.moai;
    m.flash = Math.max(0, m.flash - dt);
    for (let i = 0; i < m.fall.length; i += 1) m.fall[i] = Math.max(0, m.fall[i] - dt * 3);
    if (m.gold > 0) {
      m.gold -= dt;
      if (m.gold <= 0) { m.gold = 0; m.rise = 1; }
    }
    if (m.rise > 0) {
      m.rise -= dt;
      if (m.rise <= 0) {
        m.rise = 0;
        m.up = MOAI.xs.map(() => true);
        // 起き上がるときに上にいる球は押し出す
        for (const b of this.freeBalls()) {
          for (const x of MOAI.xs) {
            if (Math.hypot(b.x - x, b.y - MOAI.y) < b.r + MOAI.r + 2) { b.vy = -800; b.vx += (b.x - x) * 8; }
          }
        }
      }
    }
  }
  /** マルチボール中のレーザー（Limited）：2 秒ごとに上から的を撃つ */
  private stepLaser(dt: number): void {
    this.beams = this.beams.filter((b) => this.time - b.t < 0.35);
    if (!this.mods.laser || !this.multi) return;
    this.laserT -= dt;
    if (this.laserT > 0) return;
    this.laserT = 2;
    const alive = this.enemies.filter((e) => e.hp > 0);
    if (!alive.length) return;
    const e = alive[Math.floor(Math.random() * alive.length)];
    this.beams.push({ x: e.x, y: e.y, t: this.time });
    this.damage(e, this.atkAvg * 3, e.x, e.y, 'wave');
    this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.35, r0: 4, r1: e.r * 3, color: '#ff4f5e' });
    blip(1600, 0.12, 'sawtooth', 0.05, 0.4);
  }
  /** 連鎖が 10 の倍数に届いた（Limited：十の戒め） */
  protected override bump(): void {
    super.bump();
    if (!this.mods.comboTen || this.combo % 10 !== 0) return;
    const v = enemyGum(this.floor, 0) * 2 * this.mods.comboTen * this.gumMul;
    this.ev.gum(v, 'mods');
    if (this.fxBudget-- > 0) this.nums.push({ x: this.puck.x, y: this.puck.y - 40, t: 0, text: `${this.combo} COMBO BONUS!`, color: '#ffe14d', size: 15 });
  }
  /** プレイの終わり（Limited：おみやげ） */
  override endRun(reason: 'time' | 'allclear'): void {
    super.endRun(reason);
  }
  /** 的を倒したときの Limited：衝撃波・ボスの GUM・台で最初の的 */
  private onKillMods(e: Enemy): void {
    if (this.mods.killWave) this.waves.push({ x: e.x, y: e.y, t: 0, life: 0.32, r1: 85, power: 0.5, hit: new Set() });
    if (e.boss && this.mods.bossGum > 0) this.ev.gum(bossGum(this.floor) * this.mods.bossGum * this.gumMul, 'mods');
    if (!e.boss && this.mods.firstKill && !this.firstDone) {
      this.firstDone = true;
      const v = enemyGum(this.floor, e.tier) * 4 * this.gumMul;
      this.ev.gum(v, 'mods');
      this.say('FIRST STRIKE!', 2, '先陣：台で最初の的は GUM ×5');
    }
  }
  /** 坂の重さの倍率（重い球・軽い球） */
  private gravMul(b: Body): number {
    const a = this.abOf(b);
    if (a?.id === 'heavy') return 1.06;
    if (a?.id === 'light') return 1 - Math.min(0.3, 0.1 * a.k);
    return 1;
  }
  /** この球が当てたときの攻撃の倍率（重い球・大当たり狙い・風の球） */
  private hitMul(b: Body | null): number {
    const a = this.abOf(b);
    if (!a || !b) return 1;
    if (a.id === 'heavy') return 1 + 0.5 * a.k;
    if (a.id === 'gambler') return this.time - this.rampLastT < 3 ? 1 + 1.5 * a.k : 0.85;
    if (a.id === 'wind') return this.time < (this.windUntil.get(b) ?? 0) ? 1 + 0.5 * a.k : 1;
    return 1;
  }
  /** 台の上では、離れた的には当てない（球がぶつかって跳ねるのがピンボール） */
  override reachOf(): number { return 0; }
  /** ピンボールではどの色でも的で跳ね返る */
  protected override restOf(attack: Elem): number { return attack === 'green' ? 0.9 : 0.75; }
  override get oval(): boolean { return false; }
  get plungerSpot(): [number, number] { return [T.PLUNGER[0], T.PLUNGER[1]]; }
  /** マルチボール中（本物の仲間の球がいる） */
  get multi(): boolean { return this.mates.some((b) => b.ghost === undefined); }
  /** 本物の球が台の上を自由に動いている（止まっていない・ランプやブラックホールや入口の中でもない） */
  get ballFree(): boolean { return !this.parked && !this.onRamp && !this.hyper.ride && !this.carry && this.hole.held < 0 && this.gate.entering < 0; }

  /** 知らせ：上の画面に出し、文字と音でも知らせる */
  say(text: string, tier: number, sub = ''): void {
    this.display = { text, sub, tier, t: this.time };
    this.ev.pin?.(text, tier);
    if (tier >= 3) this.punch = Math.max(this.punch, 1);
  }
  /** ライトショーを始める */
  show(kind: Show['kind'], dur: number, color = '#ffffff', x = T.TW / 2, y = T.TH / 2): void {
    this.shows.push({ kind, t0: this.time, x, y, color, dur });
    if (this.shows.length > 12) this.shows.shift();
  }
  /** ランプの道の上の位置と向き */
  rampAt(i: number, s: number): { x: number; y: number; dx: number; dy: number } {
    const path = this.ramps[i].path;
    let left = s;
    for (let k = 1; k < path.length; k += 1) {
      const [ax, ay] = path[k - 1];
      const [bx, by] = path[k];
      const l = Math.hypot(bx - ax, by - ay);
      if (left <= l || k === path.length - 1) {
        const f = clamp(left / l, 0, 1);
        return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, dx: (bx - ax) / l, dy: (by - ay) / l };
      }
      left -= l;
    }
    const [x, y] = path[path.length - 1];
    return { x, y, dx: 0, dy: 1 };
  }

  // ------------------------------------------------------------------ 操作
  override holdStart(): void {
    if (!this.canHold) return;
    super.holdStart();
  }
  override holdEnd(): void {
    if (!this.hold.active) return;
    const id = this.launchId;
    super.holdEnd();
    if (this.launchId === id) return; // ほとんど引かずに離した：取り消し
    const p = this.puck;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const k = Math.min(MAX_BALL * 0.95, sp * this.st.plungerMul) / sp;
    p.vx *= k;
    p.vy *= k;
    if (this.parked === 'plunger') {
      // 打ち出しの通路から、まっすぐ上へ
      const v = Math.hypot(p.vx, p.vy);
      p.vx = 0;
      p.vy = -v;
      p.x = T.PLUNGER[0];
      this.plungeT = this.time;
      this.inShooter = true;
      this.ballSaveUntil = this.time + this.st.ballSave + this.mods.saveSec + (this.lead.id === 'shield' ? 1.5 * this.lead.k : 0);
      // スキルショット：ちょうどいい強さ（緑の帯）で打ち出すと大当たり
      const band = this.shotBand;
      const pw = this.pullPower;
      if (band && pw >= band[0] && pw <= band[1]) this.skillShotHit();
      this.shotBand = null;
    }
    if (this.parked === 'saucer') this.saucer.cool = 1;
    if (this.parked === 'cannon') { this.fireCannon(Math.max(1500, Math.hypot(p.vx, p.vy))); return; }
    this.parked = null;
  }
  /** 大砲から撃ち出す（いまの向きへ・緑の貫通） */
  private fireCannon(speed: number): void {
    const p = this.puck;
    const a = this.cannon.a;
    this.parked = null;
    p.x = CANNON.x + Math.cos(a) * 24;
    p.y = CANNON.y + Math.sin(a) * 24;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    this.launchId += 1;
    this.greenUntil = this.time + 1;
    this.cannon.cool = 4;
    this.cannon.fired = this.time;
    this.cannon.flash = 0.4;
    this.quake = Math.max(this.quake, 10);
    this.say('FIRE!', 2, '大砲：引いた向きではなく、大砲の向きへ');
    this.show('radial', 0.5, '#ff8f2e', CANNON.x, CANNON.y);
    se('blast', 0.6, 0, 0.9);
  }
  override shake(x: number, y: number, power: number, threshold: number): void {
    if (this.hold.active) return;
    const p = this.puck;
    const keep = !this.ballFree ? { vx: p.vx, vy: p.vy } : null;
    const nw = this.waves.length;
    super.shake(x, y, power, threshold);
    if (this.mods.waveMul) for (let i = nw; i < this.waves.length; i += 1) this.waves[i].r1 *= 1 + this.mods.waveMul;
    if (keep) { p.vx = keep.vx; p.vy = keep.vy; return; }
    // ゆらしセーブ：フリッパーの下へ落ちかけた球を、振ればはね上げる
    if (this.st.shakeSave && this.time >= this.shakeSaveReady && p.y > 1170 && p.x < T.SHOOT_X0 && p.vy > -200) {
      this.shakeSaveReady = this.time + 12;
      p.vx = (T.TW / 2 - p.x) * 2;
      p.vy = -1900;
      this.say('SHAKE SAVE!', 2, '振ってはね上げた');
      this.show('radial', 0.6, '#3fa9ff', p.x, p.y);
      return;
    }
    // 台を揺らす：強すぎないように
    const sp = Math.hypot(p.vx, p.vy);
    const max = this.st.rockMax * (1 + this.mods.rockMul);
    if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
  }

  // ------------------------------------------------------------------ プレイ・台
  override startRun(start: number): void {
    this.floor = Math.max(1, Math.min(FLOORS, start));
    this.runStartFloor = this.floor;
    this.calcStats();
    this.runLeft = this.runTime;
    this.spareLeft = this.mods.spareSave;
    this.bounced = new Set();
    this.offers = new Set();
    this.hyper.ride = null;
    this.hyper.cool = 0;
    this.cannon.cool = 0;
    this.castle = { hits: 0, open: false, crumble: 0, flash: 0, cd: 0 };
    this.face = { open: false, t: FACE.every, flash: 0 };
    this.hammer = { next: HAMMER.every, warn: -1, x: 360, y: 700, slamT: -9 };
    this.resetToys();
    this.runColors = new Set();
    this.zones = 0;
    this.offerCount = 0;
    this.extraPicks = 0;
    if (this.offExt >= 0) { this.offExt = -1; this.calcStats(); }
    this.splitHits = new Map();
    this.windUntil = new Map();
    this.rechargeReady = 0;
    this.fenceOnceUsed = false;
    this.laserT = 0;
    this.tableBonus = 0;
    this.cleared = [];
    this.runGum = 0;
    this.drops = [];
    this.waves = [];
    this.mates = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.buffs = {};
    this.pinMul = 1;
    this.drains = 0;
    this.loops = 0;
    this.multiballs = 0;
    this.pyramids = 0;
    this.saucer.locks = 0;
    this.rampsDone = 0;
    this.onRamp = null;
    this.rampCombo = 0;
    this.hole.on = false;
    this.hole.held = -1;
    this.hole.next = 8;
    this.gate.open = false;
    this.gate.entering = -1;
    this.star.on = false;
    this.star.next = 6;
    this.zone = false;
    this.shows = [];
    for (const lp of this.lights) { lp.lit.fill(-9); lp.flash = 0; }
    for (const leds of this.rampLeds) leds.fill(-9);
    this.magnaReady = 0;
    this.shakeSaveReady = 0;
    this.frenzyUntil = -9;
    this.bumperHits = [];
    this.skillShot = null;
    this.display = { text: 'READY', sub: '引っぱって打ち出す', tier: 0, t: 0 };
    for (const k of this.kickbacks) k.lit = true;
    for (const l of this.lanes) l.lit = false;
    this.park('plunger');
    this.save.runs += 1;
    this.phase = 'play';
    this.runStartT = this.time;
    this.beginFloor();
  }

  override beginFloor(): void {
    this.tableBonus = 0;
    this.firstDone = false;
    const rule = ruleOf(this.floor);
    if (rule !== this.rule) { this.rule = rule; this.calcStats(); }
    if (rule) this.say(rule.name, 3, `ボス台の掟：${rule.text}`);
    if (this.mods.startLane && !this.lanes.some((l) => l.lit)) { this.lanes[0].lit = true; this.lanes[0].flash = 0.6; }
    this.floorT = 0;
    this.floorSteps = 0;
    this.freeze = 0;
    this.enemies = [];
    this.bossAlive = false;
    this.bossSpawned = false;
    this.save.pinDeepest = Math.max(this.save.pinDeepest, this.floor);
    this.save.pinRecord = Math.max(this.save.pinRecord ?? 1, this.floor);
    const { set, lo, hi } = this.floorArt();
    const n = clamp(5 + Math.floor((this.floor - 1) / 2) + this.st.extraEnemies, 5, T.TARGET_SLOTS.length);
    for (let i = 0; i < n; i += 1) {
      const tier = lo + Math.floor(Math.random() * (hi - lo + 1));
      const [x, y] = T.TARGET_SLOTS[i];
      const e = this.target(set[tier], enemyHp(this.floor, tier), x, y, 15 + tier * 0.5, false, tier);
      e.born = this.time - i * 0.04;
    }
  }

  private target(art: EnemyArt, hp: number, x: number, y: number, r: number, boss: boolean, tier: number): Enemy {
    const e: Enemy = {
      x, y, vx: 0, vy: 0, r, m: 1e6, hp, maxHp: hp, art, boss, tier,
      flash: 0, hitCd: 0, mateCd: 0, wander: 1e9, tx: x, ty: y, born: this.time, dash: 0, squash: 0, face: 1,
      elem: pick(ELEMS), pierced: 0, elemT: 7,
    };
    this.enemies.push(e);
    this.rings.push({ x, y, t: 0, life: 0.45, r0: r * 2, r1: r * 0.6, color: boss ? '#ff4f5e' : '#c08bff' });
    return e;
  }

  override spawnBoss(): void {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    this.bossAlive = true;
    const raid = isRaidFloor(this.floor);
    const art = this.bossArt();
    this.target(art, bossHp(this.floor) * (1 - this.mods.bossHp), T.BOSS_HOME[0], T.BOSS_HOME[1], raid ? 38 : 32, true, 5);
    this.quake = 10;
    this.ev.boss(art.name, raid);
    this.say('BOSS!', 2, art.name);
    this.show('strobe', 0.8, '#ff4f5e', T.BOSS_HOME[0], T.BOSS_HOME[1]);
  }

  /** ボスを倒した：次の台へ */
  protected override floorClear(): void {
    const t = this.floorT;
    this.cleared.push({ floor: this.floor, t });
    this.ev.clear(this.floor, t);
    this.say('TABLE CLEAR!', 3, `TABLE ${this.floor + 1} へ`);
    this.show('rainbow', 1.8);
    if (this.floor >= FLOORS) {
      this.endRun('allclear');
      return;
    }
    this.floor += 1;
    this.save.pinDeepest = Math.max(this.save.pinDeepest, this.floor);
    this.save.pinRecord = Math.max(this.save.pinRecord ?? 1, this.floor);
    this.phase = 'zoom';
    this.zoomT = 0;
    this.zoomDur = 1.2;
  }

  /** 球を止めて置く */
  park(where: 'plunger' | 'saucer' | 'mystery' | 'cannon'): void {
    this.parked = where;
    this.carry = null;
    this.parkT = 0;
    // スキルショットの帯（強さ 0.4〜0.85 のどこかに、幅 0.14）
    if (where === 'plunger' && this.st.skillShot) {
      const c = 0.47 + Math.random() * 0.31;
      this.shotBand = [c - 0.07, c + 0.07];
    }
    this.parkPos();
    this.greenUntil = 0;
    this.blueUntil = 0;
  }
  private parkPos(): void {
    const p = this.puck;
    const w = this.parked;
    const [x, y] = w === 'saucer' ? [this.saucer.x, this.saucer.y] : w === 'mystery' ? [this.mystery.x, this.mystery.y] : w === 'cannon' ? [CANNON.x, CANNON.y] : T.PLUNGER;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
  }

  /** ピラミッドから戻ってきた：入口から球が飛び出す */
  returnFromPyramid(): void {
    const p = this.puck;
    const g = this.gate;
    g.open = false;
    g.entering = -1;
    p.x = g.x;
    p.y = g.y;
    const a = -Math.PI / 2 + rand(-0.5, 0.5);
    p.vx = Math.cos(a) * 1800;
    p.vy = Math.sin(a) * 1800;
    this.launchId += 1;
    this.greenUntil = this.time + this.st.greenTime;
    this.ballSaveUntil = this.time + 4;
    this.say('WELCOME BACK!', 2, 'ピンボールにもどった');
    this.show('rainbow', 1.2, '#ffd23f', g.x, g.y);
    this.rings.push({ x: g.x, y: g.y, t: 0, life: 0.5, r0: 10, r1: 140, color: '#ffd23f' });
  }

  // ------------------------------------------------------------------ 1 コマ
  override step(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this.fxBudget = this.lowFx ? 4 : 10;
    if (this.phase === 'zoom') {
      this.zoomT += dt;
      this.stepFx(dt);
      this.stepDrops(dt);
      if (this.zoomT >= this.zoomDur) {
        this.phase = 'play';
        this.beginFloor();
      }
      return;
    }
    if (this.phase !== 'play') {
      this.stepFx(dt);
      return;
    }
    this.runLeft -= dt * (this.zone ? 1 - this.mods.zoneSlow : 1);
    this.floorT += dt;
    this.floorSteps += 1;
    if (this.runLeft <= 0) {
      this.runLeft = 0;
      this.endRun('time');
      return;
    }
    if (this.freeze > 0) {
      this.freeze -= dt;
      this.stepFx(dt * 0.3);
      this.quake = Math.max(0, this.quake - dt * 30);
      return;
    }
    this.time += dt;
    if (this.combo && this.time > this.comboT) {
      this.ev.comboEnd?.(this.combo);
      this.combo = 0;
    }
    const p = this.puck;
    p.r = this.radius;

    // 傾き：球を少し曲げる（坂の重さより弱い）
    const [tx, ty] = this.hold.active ? [0, 0] : this.tilt;
    const m = Math.hypot(tx, ty);
    const curve = m > 0 ? Math.min(1, m / 0.45) ** 1.3 : 0;
    this.tiltCurve = curve;
    if (m > 0) this.tiltDir = [tx / m, ty / m];
    // ZONE：20 連鎖から坂が軽くなり、GUM ×2（連鎖が切れると戻る）
    const zone = this.combo >= ZONE_COMBO;
    if (zone && !this.zone) { this.zones += 1; this.say('ZONE!', 3, '坂が軽くなり GUM ×2'); this.show('rainbow', 1.5); }
    this.zone = zone;
    const g = GRAVITY * (zone ? 0.6 : 1) * (this.offers.has('atk') ? 1.15 : 1) * (this.rule?.id === 'steep' ? 1.18 : 1);
    const nudge = NUDGE * this.st.nudgeMul * (this.rule?.id === 'reverse' ? -1 : 1);
    const ax = m > 0 ? (tx / m) * curve * nudge : 0;
    const ay = (m > 0 ? (ty / m) * curve * nudge : 0) + g;

    if (this.onRamp) {
      // ワイヤーのランプの上：道にそって走る（台のものには当たらない）
      const rp = this.ramps[this.onRamp.i];
      this.onRamp.s += RAMP_SPEED * dt;
      const at = this.rampAt(this.onRamp.i, this.onRamp.s);
      p.x = at.x;
      p.y = at.y;
      p.vx = at.dx * RAMP_SPEED;
      p.vy = at.dy * RAMP_SPEED;
      const leds = this.rampLeds[this.onRamp.i];
      const li = Math.min(leds.length - 1, Math.floor(this.onRamp.s / T.RAMP_LED_STEP));
      if (this.time - leds[li] > 1) { leds[li] = this.time; this.pip(); }
      if (this.onRamp.s >= rp.len) this.rampDone();
    } else if (this.gate.entering >= 0) {
      // ピラミッドへの入口に吸いこまれていく
      this.gate.entering += dt;
      p.x += (this.gate.x - p.x) * Math.min(1, dt * 10);
      p.y += (this.gate.y - p.y) * Math.min(1, dt * 10);
      p.vx = 0;
      p.vy = 0;
      if (this.gate.entering >= 0.8) {
        this.gate.entering = -1;
        this.gate.open = false;
        this.pyramids += 1;
        this.ev.gate?.();
        return;
      }
    } else if (this.hyper.ride) {
      // ハイパーループ：光の輪を何周も回る（台のものには当たらない）
      const rd = this.hyper.ride;
      const da = (HYPER.lapSpeed / HYPER.r) * dt;
      rd.a -= da;
      rd.trav += da;
      p.x = HYPER.x + Math.cos(rd.a) * HYPER.r;
      p.y = HYPER.y + Math.sin(rd.a) * HYPER.r;
      p.vx = -Math.sin(rd.a) * -HYPER.lapSpeed;
      p.vy = Math.cos(rd.a) * -HYPER.lapSpeed;
      if (Math.floor(rd.trav / (Math.PI * 2)) > rd.done) {
        rd.done += 1;
        this.hyper.flash = 0.3;
        this.gimmick(true, p.x, p.y, 0.5 * (1 + rd.done * 0.4), 'lane', 'hyperloop');
        this.say(`HYPERLOOP ×${rd.done}`, rd.done >= 3 ? 3 : 2, '光の輪を回るほど GUM');
        blip(700 + rd.done * 140, 0.1, 'square', 0.06, 1.6);
      }
      if (rd.done >= rd.laps) {
        this.hyper.ride = null;
        this.hyper.cool = 1.2;
        [p.x, p.y] = HYPER.mouth;
        p.y += 6;
        p.vx = rand(-160, 160);
        p.vy = 650;
        this.show('chase', 0.7, '#3fd0ff', p.x, p.y);
      }
    } else if (this.carry) {
      this.stepCarry(dt);
    } else if (this.hole.held >= 0) {
      // ブラックホールの中
      this.hole.held += dt;
      p.x = this.hole.x;
      p.y = this.hole.y;
      p.vx = 0;
      p.vy = 0;
      if (this.hole.held >= 0.7) this.holeEject();
    } else if (this.parked) {
      this.parkT += dt;
      this.parkPos();
      if (this.parked === 'cannon') {
        // 大砲：首を振る（引っぱっている間は止まる）。3 秒たつと自動で撃つ
        if (!this.hold.active) this.cannon.a = -Math.PI / 2 + Math.sin(this.parkT * 1.7) * 1.15;
        if (this.parkT >= CANNON.auto) {
          // 3 秒たったら自動で撃つ（引っぱっていれば、その強さで）
          const sp = this.hold.active ? Math.max(1500, 1500 + 1300 * this.pullPower) : 1900;
          this.hold.active = false;
          this.fireCannon(sp);
        }
      }
      if (this.parked === 'saucer' && this.parkT >= SAUCER_HOLD && !this.hold.active) this.ejectSaucer();
      else if (this.parked === 'mystery' && this.parkT >= MYSTERY_HOLD) this.ejectMystery();
    } else {
      // 下のフリッパーのあたりでは、傾けても曲がりにくい（傾きで球を根元に押しつけて止められないように）
      const low = p.y > 1120 ? 0.25 : 1;
      p.vx += ax * low * dt;
      p.vy += ((ay - g) * low + g * this.gravMul(p)) * dt;
      capSpeed(p, MAX_BALL);
    }
    for (const b of this.mates) {
      b.vy += (b.ghost ? g * 0.5 : g * this.gravMul(b)) * dt;
      b.vx += ax * dt * 0.5;
      capSpeed(b, MAX_BALL);
    }
    this.stepLaser(dt);
    this.stepToys(dt);
    this.stepHole(dt);
    this.stepGate(dt);
    this.stepStar(dt);
    this.punch = Math.max(0, this.punch - dt * 3);
    this.shows = this.shows.filter((x) => this.time - x.t0 < x.dur);
    // 緑（貫通）ははじいた勢いがあるうちだけ
    if (this.time < this.greenUntil && Math.hypot(p.vx, p.vy) < 600) this.greenUntil = 0;

    this.autoFlip(dt);
    this.aiTable(dt);
    this.stepWaves(dt);

    // 細かく刻んで、すり抜けを防ぐ
    let fastest = this.ballFree ? Math.hypot(p.vx, p.vy) : 0;
    for (const b of this.mates) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    const n = clamp(Math.ceil((fastest * dt) / 5), 2, 16);
    const h = dt / n;
    this.prevY = p.y;
    for (let i = 0; i < n; i += 1) this.substepTable(h);

    // 念のため：速すぎて壁を抜けても、台の外には出さない
    for (const b of [p, ...this.mates]) {
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > T.TW - b.r) { b.x = T.TW - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
    }
    this.sensors(dt);
    this.stepDrops(dt);
    if (!this.bossSpawned && this.phase === 'play' && !this.enemies.some((e) => !e.boss)) this.spawnBoss();
    this.stepLights(dt);
    this.stepFx(dt);
    this.trail.push({ x: p.x, y: p.y, t: this.time });
    while (this.trail.length && this.time - this.trail[0].t > 0.18) this.trail.shift();
    this.quake = Math.max(0, this.quake - dt * 30);
  }

  /** 自動のフリッパー：球が上に来たら打つ */
  private autoFlip(dt: number): void {
    const balls: Body[] = this.ballFree ? [this.puck, ...this.mates] : [...this.mates];
    for (const f of this.flippers) {
      f.cd -= dt;
      if (f.up > 0) { f.up -= dt; continue; }
      if (f.cd > 0) continue;
      const [tx, ty] = flipperTip(f);
      const near = balls.some((b) => {
        if (b.vy < -260) return false;
        if (Math.abs(b.x - f.px) > f.len + 40 || Math.abs(b.y - f.py) > f.len + 40) return false;
        const c = segDist(b.x, b.y, f.px, f.py, tx, ty);
        // 根元では打っても弱いので、先のほうに来てから打つ
        return c.d < b.r + 26 && b.y < c.qy + 4 && c.t > 0.3;
      });
      if (near) {
        f.up = 0.17;
        f.cd = 0.3;
        blip(180, 0.05, 'square', 0.05, 2.2);
      }
    }
  }

  private substepTable(h: number): void {
    // フリッパーを動かす
    for (const f of this.flippers) {
      const target = f.up > 0 ? f.upA : f.rest;
      const d = target - f.a;
      const stepA = FLIP_SPEED * h;
      if (Math.abs(d) <= stepA) { f.av = 0; f.a = target; } else { f.av = Math.sign(d) * FLIP_SPEED; f.a += f.av * h; }
    }
    const p = this.puck;
    if (this.ballFree) {
      p.x += p.vx * h;
      p.y += p.vy * h;
      this.tableHit(p, true);
      this.hitter = null;
      for (const e of this.enemies) this.collidePuck(e);
      this.reap();
    }
    for (const b of this.mates) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      this.tableHit(b, false);
      for (const e of this.enemies) this.mateHit(b, e);
      this.hitter = null;
      this.reap();
    }
    // 球どうし（マルチボール）
    const all: Body[] = this.ballFree ? [p, ...this.mates] : [...this.mates];
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) ballBall(all[i], all[j]);
  }

  /** 台のもの（壁・スリングショット・バンパー・フリッパー）との当たり */
  private tableHit(b: Body, main: boolean): void {
    for (const s of this.segs) {
      // 遠い壁は見ない（台が広いので）
      if (b.x + b.r + 4 < Math.min(s.ax, s.bx) || b.x - b.r - 4 > Math.max(s.ax, s.bx)) continue;
      if (b.y + b.r + 4 < Math.min(s.ay, s.by) || b.y - b.r - 4 > Math.max(s.ay, s.by)) continue;
      // 片側だけの壁（打ち出しの通路のふた）：上の側にいる球だけを止める
      if (s.oneWay && (main && this.inShooter || (s.bx - s.ax) * (b.y - s.ay) - (s.by - s.ay) * (b.x - s.ax) > 0)) continue;
      const c = segDist(b.x, b.y, s.ax, s.ay, s.bx, s.by);
      const min = b.r + 2;
      if (c.d >= min) continue;
      const nx = c.d ? (b.x - c.qx) / c.d : 0;
      const ny = c.d ? (b.y - c.qy) / c.d : -1;
      b.x = c.qx + nx * min;
      b.y = c.qy + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn >= 0) continue;
      b.vx -= 1.45 * vn * nx;
      b.vy -= 1.45 * vn * ny;
      if (s.kick && -vn > 120) {
        // スリングショット：強くはじく
        b.vx += nx * 820;
        b.vy += ny * 820;
        s.flash = 0.18;
        this.show('radial', 0.3, '#6dffb0', c.qx, c.qy);
        this.gimmick(main, c.qx, c.qy, 0.06, 'sling');
      } else if (main && -vn > 500) {
        blip(110 + Math.min(160, -vn / 12), 0.05, 'triangle', 0.06, 0.7);
      }
    }
    for (const bp of this.bumpers) {
      const dx = b.x - bp.x;
      const dy = b.y - bp.y;
      const d = Math.hypot(dx, dy) || 1;
      const min = b.r + bp.r;
      if (d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x = bp.x + nx * min;
      b.y = bp.y + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      // バンパー：当たると外へ強くはじく
      const out = Math.max(this.zone ? 1250 : 1000, -vn * 0.7) * (1 + this.mods.bumperPower);
      b.vx += (out - vn) * nx;
      b.vy += (out - vn) * ny;
      bp.flash = 0.16;
      this.show('radial', 0.35, this.frenzy ? '#9fe8ff' : '#ff6ad5', bp.x, bp.y);
      this.gimmick(main, bp.x + nx * bp.r, bp.y + ny * bp.r, 0.08 * (this.frenzy ? 3 : 1), 'bumper');
      this.bumperHit(bp);
      this.bumperAbility(b, bp);
    }
    this.toyDisks(b, main);
    for (const f of this.flippers) this.flipperHit(b, f, main);
  }

  private flipperHit(b: Body, f: Flipper, main: boolean): void {
    if (Math.abs(b.x - f.px) > f.len + 30 || Math.abs(b.y - f.py) > f.len + 30) return;
    const [tx, ty] = flipperTip(f);
    const c = segDist(b.x, b.y, f.px, f.py, tx, ty);
    const rf = 7 - 2 * c.t; // 根元が太い
    const min = b.r + rf;
    if (c.d >= min) return;
    const nx = c.d ? (b.x - c.qx) / c.d : 0;
    const ny = c.d ? (b.y - c.qy) / c.d : -1;
    b.x = c.qx + nx * min;
    b.y = c.qy + ny * min;
    // フリッパーのその点の速さ
    const s = c.t * f.len;
    const fvx = s * f.av * -f.side * Math.sin(f.a);
    const fvy = s * f.av * Math.cos(f.a);
    const rvx = b.vx - fvx;
    const rvy = b.vy - fvy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = 0.3;
    b.vx = rvx - (1 + e) * vn * nx + fvx;
    b.vy = rvy - (1 + e) * vn * ny + fvy;
    if (f.av < 0 && b.vy < -300) {
      if (this.mods.flipPower) { b.vx *= 1 + this.mods.flipPower; b.vy *= 1 + this.mods.flipPower; }
      // 打ち返した：狙いのスキルの分だけ、敵の方へ向きを曲げる
      this.aimBall(b);
      if (main && this.st.pierceFlip) {
        // 貫通フリッパー（スキル）：打ち返した球がしばらく緑の貫通
        this.launchId += 1;
        this.greenUntil = this.time + 0.9;
      }
      if (main) {
        se('hit', 0.35, 40, 1.6);
        buzz(8);
      }
    }
  }

  /** 打ち返した球の向きを、いちばん近い上の敵の方へ少し曲げる（ピラミッドへの入口が開いていれば、そちらも狙う） */
  private aimBall(b: Body): void {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.y > b.y - 30) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y) - (e.boss ? 300 : 0);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (this.gate.open && Math.hypot(this.gate.x - b.x, this.gate.y - b.y) - 250 < bestD) best = this.gate;
    if (!best) return;
    const cur = Math.atan2(b.vy, b.vx);
    const want = Math.atan2(best.y - b.y, best.x - b.x);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const a = cur + clamp(diff, -this.st.aim, this.st.aim);
    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
  }

  /** マルチボールの球（仲間のヒーロー）と的 */
  private mateHit(b: Body, e: Enemy): void {
    this.hitter = b;
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    const d = Math.hypot(dx, dy);
    const min = b.r + e.r * 0.82;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = e.x + nx * min;
    b.y = e.y + ny * min;
    const vn = (b.vx - e.vx) * nx + (b.vy - e.vy) * ny;
    if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; }
    if (e.mateCd > this.time) return;
    const f = impactFactor(-vn);
    if (f <= 0) return;
    e.mateCd = this.time + 0.12;
    this.bump();
    this.damage(e, this.atkAvg * f * 0.6 + this.st.mateAtk, b.x - nx * b.r, b.y - ny * b.r, 'hit');
  }

  /** バンパーに当たった球の能力：雷の球・分裂 */
  private bumperAbility(b: Body, bp: Bumper): void {
    const a = this.abOf(b);
    if (!a) return;
    if (a.id === 'thunder' && this.time >= this.shockReady) {
      this.shockReady = this.time + 0.3;
      this.waves.push({ x: bp.x, y: bp.y, t: 0, life: 0.35, r1: 110, power: 0.4 * a.k, hit: new Set() });
      this.rings.push({ x: bp.x, y: bp.y, t: 0, life: 0.3, r0: 10, r1: 110, color: '#9fe8ff' });
    }
    if (a.id === 'split' && (b === this.puck || (b as Mate).ghost === undefined)) {
      const n = (this.splitHits.get(b) ?? 0) + 1;
      this.splitHits.set(b, n);
      if (n % 10 === 0) {
        this.spawnGhosts(b.x, b.y, Math.atan2(b.vy, b.vx), 1300);
        this.say('SPLIT!', 2, '分裂：自分の分身が出た');
      }
    }
  }

  /** バンパーに当たった：フレンジー（スキル）と衝撃バンパー（スキル） */
  private bumperHit(bp: Bumper): void {
    if ((this.st.shockBumper || (this.zone && this.mods.zoneShock)) && this.time >= this.shockReady) {
      this.shockReady = this.time + 0.25;
      this.waves.push({ x: bp.x, y: bp.y, t: 0, life: 0.35, r1: 95, power: 0.5, hit: new Set() });
    }
    if (!this.st.frenzy || this.frenzy) return;
    this.bumperHits.push(this.time);
    this.bumperHits = this.bumperHits.filter((t) => this.time - t < 6);
    if (this.bumperHits.length >= 15) {
      this.bumperHits = [];
      this.frenzyUntil = this.time + 10;
      this.say('FRENZY!', 3, '10 秒間バンパーの GUM ×3');
      this.show('strobe', 1, '#9fe8ff', bp.x, bp.y);
      se('blast', 0.5, 0, 1.4);
    }
  }

  /** ギミックに当たった：少しの GUM と連鎖 */
  private gimmick(main: boolean, x: number, y: number, share: number, kind: 'bumper' | 'sling' | 'spin' | 'lane', src: GumSrc = kind): void {
    if (kind === 'bumper') {
      if (this.offers.has('bumper3')) share *= main && this.attack !== 'red' ? 0 : 3;
      if (share <= 0) return;
    }
    const v = enemyGum(this.floor, 0) * share * this.gumMul;
    this.ev.gum(v, src);
    if (kind !== 'spin') {
      this.bump();
      this.ev.hit?.(this.combo, false, false, undefined);
    }
    if (this.fxBudget-- > 0) {
      const col = kind === 'bumper' ? '#ff6ad5' : kind === 'sling' ? '#6dffb0' : '#ffd23f';
      for (let i = 0; i < (kind === 'spin' ? 1 : 6); i += 1) this.spark(x, y, col, 320, 2);
    }
    if (kind === 'bumper') { blip(520 + Math.min(this.combo, 24) * 30, 0.07, 'square', 0.06, 1.6); this.quake = Math.max(this.quake, main ? 3 : 1); }
    else if (kind === 'sling') blip(300, 0.06, 'sawtooth', 0.05, 1.8);
    else if (kind === 'spin') blip(1400 + rand(-60, 60), 0.02, 'square', 0.025, 1);
  }

  /** 台の決まった場所を通ったか */
  private sensors(dt: number): void {
    const p = this.puck;
    this.saucer.cool -= dt;
    this.mystery.cool -= dt;
    for (const w of this.warps) w.cool -= dt;
    for (const b of this.boosters) { b.cool -= dt; b.flash = Math.max(0, b.flash - dt); }
    for (const k of this.kickbacks) {
      k.flash = Math.max(0, k.flash - dt);
      if (!k.lit) {
        k.t -= dt;
        if (k.t <= 0) { k.lit = true; k.flash = 0.6; }
      }
    }
    for (const b of [...(this.ballFree ? [p] : []), ...this.mates]) {
      const main = b === p;
      if (main) {
        // ワイヤーのランプの入口（勢いよく上がってきたら乗る）
        const ri = this.ramps.findIndex((r) => Math.abs(b.x - r.path[0][0]) < 22 && Math.abs(b.y - r.path[0][1]) < 16);
        if (ri >= 0 && b.vy < -350) {
          this.onRamp = { i: ri, s: 0 };
          se('buff', 0.35, 0, 1.8);
          this.show('chase', 0.9, this.ramps[ri].color, b.x, b.y);
          continue;
        }
        // ピラミッドへの入口
        if (this.gate.open && Math.hypot(b.x - this.gate.x, b.y - this.gate.y) < 20) {
          this.gate.entering = 0;
          this.say('PYRAMID!', 3, '15 秒のピラミッドへ');
          this.show('rainbow', 1, '#ffd23f', this.gate.x, this.gate.y);
          se('blast', 0.6, 0, 0.7);
          buzz([0, 40, 30, 60]);
          this.quake = 12;
          continue;
        }
      }
      // ブースター：矢印の向きへ一気に加速
      for (const bo of this.boosters) {
        if (bo.cool > 0 || Math.hypot(b.x - bo.x, b.y - bo.y) > 18) continue;
        bo.cool = 0.6;
        bo.flash = 0.5;
        const wind = this.abOf(b)?.id === 'wind';
        b.vx = Math.cos(bo.a) * BOOST_SPEED * (1 + this.mods.boosterMul) * (wind ? 1.15 : 1);
        b.vy = Math.sin(bo.a) * BOOST_SPEED * (1 + this.mods.boosterMul) * (wind ? 1.15 : 1);
        if (wind) this.windUntil.set(b, this.time + 2);
        if (main) {
          this.launchId += 1;
          this.greenUntil = this.time + 0.6;
          blip(500, 0.18, 'sawtooth', 0.07, 3.2);
          this.show('chase', 0.6, '#4fe07a', bo.x, bo.y);
          buzz(12);
        }
      }
      // ゴーストスター：触ると分身球
      if (this.star.on && Math.hypot(b.x - this.star.x, b.y - this.star.y) < b.r + 14) this.takeStar(b);
      // インレーンの星
      T.INLANES.forEach((z, i) => {
        if (b.x > z.x0 && b.x < z.x1 && b.y > z.y0 && b.y < z.y1 && this.inlane[i] <= 0) {
          this.inlane[i] = 0.6;
          this.gimmick(main, b.x, b.y, 0.05 * (1 + 2 * this.mods.inlaneGum), 'lane');
        }
      });
      // ロールオーバーレーン
      for (const l of this.lanes) {
        const inLane = Math.abs(b.x - l.x) < 14 && b.y > T.LANE_Y[0] + 2 && b.y < T.LANE_Y[1] - 2;
        if (main && inLane && this.skillShot && this.lanes.indexOf(l) === this.skillShot.lane) {
          // スキルショット：光っていたレーンを通した
          this.skillShot = null;
          this.gimmick(true, l.x, (T.LANE_Y[0] + T.LANE_Y[1]) / 2, 8, 'lane', 'skill');
          this.say('SKILL SHOT!', 3, '光ったレーンを通した');
          this.show('strobe', 0.9, '#4fe07a', l.x, T.LANE_Y[1]);
        }
        if (!l.lit && inLane) {
          l.lit = true;
          l.flash = 0.4;
          this.gimmick(main, l.x, (T.LANE_Y[0] + T.LANE_Y[1]) / 2, 0.2, 'lane');
          if (this.lanes.every((x) => x.lit)) this.lanesDone();
        }
      }
      // ボスの城：跳ね橋に 3 回当てると下り、中へ入ると城が崩れてボスに大ダメージ
      if (this.toys.castle && this.bossAlive && Math.abs(b.x - CASTLE.x) < CASTLE.halfW && Math.abs(b.y - CASTLE.bridgeY) < 14 && b.vy < 0) {
        const c = this.castle;
        if (!c.open && c.cd <= 0) {
          c.hits += 1;
          c.cd = 0.35;
          c.flash = 0.3;
          b.vy = Math.abs(b.vy) * 0.55;
          this.gimmick(main, b.x, b.y, 0.3, 'lane', 'castle');
          if (c.hits >= CASTLE.hits) { c.open = true; this.say('DRAWBRIDGE DOWN!', 3, '城の中へ打ちこめ'); this.show('chase', 0.8, '#ffd23f', CASTLE.x, CASTLE.y); }
          else this.say(`GATE ${c.hits} / ${CASTLE.hits}`, 1, '跳ね橋に当てる');
        } else if (c.open) {
          this.storm();
          b.y = CASTLE.bridgeY + 20;
          b.vy = 750;
          b.vx = rand(-250, 250);
        }
      }
      // 回転盤：乗った球の向きをずらす（ときどき逆回り）
      if (this.toys.disc) {
        const dx = b.x - DISC.x;
        const dy = b.y - DISC.y;
        const d = Math.hypot(dx, dy);
        if (d < DISC.r && d > 1) {
          const k = DISC.accel * this.disc.dir * (1 - d / DISC.r) * dt;
          b.vx += (-dy / d) * k;
          b.vy += (dx / d) * k;
        }
      }
      // ワープ：入ると別の場所から出てくる
      for (const w of this.warps) {
        if (w.cool > 0 || Math.hypot(b.x - w.x, b.y - w.y) > w.r) continue;
        w.cool = 0.8;
        this.rings.push({ x: w.x, y: w.y, t: 0, life: 0.4, r0: 40, r1: 4, color: '#c08bff' });
        b.x = w.out[0] + rand(-12, 12);
        b.y = w.out[1];
        b.vx = (w.v[0] + rand(-120, 120)) * (1 + this.mods.warpSpeed);
        b.vy = w.v[1] * (1 + this.mods.warpSpeed);
        if (main && this.mods.warpGum) this.gimmick(true, b.x, b.y, 1.5 * this.mods.warpGum, 'lane', 'warp');
        this.rings.push({ x: b.x, y: b.y, t: 0, life: 0.4, r0: 4, r1: 40, color: '#c08bff' });
        blip(900, 0.18, 'sine', 0.07, 0.4);
        if (main) this.say('WARP!', 1);
      }
      if (main) {
        // ハイパーループの口：下から勢いよく入ると輪を回る
        if (this.toys.hyperloop && this.hyper.cool <= 0 && b.vy < -700 && Math.hypot(b.x - HYPER.mouth[0], b.y - HYPER.mouth[1]) < 26) {
          const laps = clamp(Math.floor(Math.hypot(b.vx, b.vy) / 650), 1, 5);
          this.hyper.ride = { a: Math.PI / 2, trav: 0, laps, done: 0 };
          this.say('HYPERLOOP!', 2, `${laps} 周`);
          blip(400, 0.3, 'sawtooth', 0.06, 3);
          continue;
        }
        // 大砲：ゆっくり入ると止まって、首を振る
        if (this.toys.cannon && this.cannon.cool <= 0 && Math.hypot(b.vx, b.vy) < 1500 && Math.hypot(b.x - CANNON.x, b.y - CANNON.y) < CANNON.r + 4) {
          this.park('cannon');
          this.say('CANNON!', 2, '引っぱって離すと、大砲の向きへ撃ち出す');
          blip(220, 0.25, 'square', 0.07, 0.6);
          continue;
        }
        // しゃべる顔：口が開いているときに入れると大当たり
        if (this.toys.face && this.face.open && Math.hypot(b.x - FACE.x, b.y - FACE.mouthY) < FACE.mouthR + b.r * 0.5) {
          this.face.open = false;
          this.face.t = FACE.every;
          this.face.flash = 0.6;
          this.gimmick(true, b.x, b.y, 6, 'lane', 'face');
          this.say('BIG MOUTH!', 3, 'しゃべる顔の口に入った');
          this.show('strobe', 0.8, '#ff6ad5', FACE.x, FACE.y);
          b.x = FACE.x; b.y = FACE.mouthY + 26;
          b.vx = rand(-300, 300);
          b.vy = 900;
          continue;
        }
        // つかむ手・怪物の口・磁石・上の小さな台の入口
        if (this.toyCatch(b)) continue;
        // ロックのホール・ミステリーのホール（本物の球だけ）
        const slow = Math.hypot(b.vx, b.vy) < 1400;
        if (this.saucer.cool <= 0 && slow && Math.hypot(b.x - this.saucer.x, b.y - this.saucer.y) < this.saucer.r) this.captureSaucer();
        else if (this.mystery.cool <= 0 && slow && Math.hypot(b.x - this.mystery.x, b.y - this.mystery.y) < this.mystery.r) this.captureMystery();
        if (this.parked) continue;
      }
      // アウトレーン：キックバックが点いていれば打ち返す
      for (const k of this.kickbacks) {
        const out = k.side === -1 ? b.x < k.x : b.x > k.x;
        if (!out || b.y < T.KICK_Y || b.vy <= 0 || !k.lit) continue;
        b.vy = -1900 * (this.mods.kickGreen && main ? 1.15 : 1);
        b.vx = -k.side * 40;
        if (this.mods.kickGreen && main) { this.launchId += 1; this.greenUntil = this.time + 0.9; }
        k.lit = false;
        k.t = this.offers.has('gum2') ? 1e9 : this.st.kickbackTime * (1 - this.mods.kickRelit);
        k.flash = 0.5;
        se('blast', 0.4, 0, 1.5);
        this.quake = Math.max(this.quake, 6);
        if (main) this.say('KICKBACK!', 1);
      }
    }
    this.stepLightPaths(dt);
    // スピナー・ループ（本物の球が左右の通路の線を横切ったか）
    this.inlane = this.inlane.map((v) => Math.max(0, v - dt));
    if (this.skillShot && this.time > this.skillShot.until) this.skillShot = null;
    if (this.ballFree) {
      const crossed = (this.prevY - T.LOOP_LINE) * (p.y - T.LOOP_LINE) <= 0 && this.prevY !== p.y;
      if (crossed && p.x < T.LOOP_X[0]) {
        this.spinners[0].speed += Math.abs(p.vy) / 40;
        this.loopEnter(-1, p.vy < 0);
      }
      if (crossed && p.x > T.LOOP_X[1]) {
        this.spinners[1].speed += Math.abs(p.vy) / 40;
        this.loopEnter(1, p.vy < 0);
      }
    }
    // スピナーが回っている間、少しずつ GUM
    for (const sp of this.spinners) {
      if (sp.speed <= 0.5) continue;
      const before = Math.floor(sp.angle / Math.PI);
      sp.angle += sp.speed * dt;
      sp.speed *= Math.exp(-1.6 * dt);
      if (Math.floor(sp.angle / Math.PI) !== before) this.gimmick(true, sp.x, sp.y, 0.02, 'spin');
    }
    // 落ちた
    for (const b of [...this.mates]) {
      const gone = b.y > T.DRAIN_Y + 10 || (b.ghost !== undefined && this.time > b.ghost);
      if (!gone) continue;
      if (b.ghost === undefined && b.y > T.DRAIN_Y && this.abOf(b)?.id === 'bounce' && !this.bounced.has(b)) {
        this.bounced.add(b);
        [b.x, b.y] = T.SAVE_SPOT;
        b.vx = rand(-160, 160);
        b.vy = -2000;
        continue;
      }
      if (b.ghost !== undefined && b.y < T.TH) for (let i = 0; i < 8; i += 1) this.spark(b.x, b.y, '#bfe9ff', 200, 2);
      this.mates.splice(this.mates.indexOf(b as Mate), 1);
    }
    if (this.ballFree && p.y > T.DRAIN_Y) this.drain();
    // アウトレーンの柵（改造）：落ちかけた球を、ときどきはじき返す
    this.fenceCd = Math.max(0, this.fenceCd - dt);
    if ((this.mods.fence > 0 || (this.mods.fenceOnce && !this.fenceOnceUsed)) && this.ballFree && this.fenceCd <= 0 && p.vy > 100 && p.y > 1090 && p.y < 1170) {
      const side = p.x > 175 && p.x < 222 ? -1 : p.x > 498 && p.x < 545 ? 1 : 0;
      if (side) {
        this.fenceCd = 1;
        const sure = this.mods.fenceOnce > 0 && !this.fenceOnceUsed;
        if (sure || Math.random() < this.mods.fence) {
          if (sure) this.fenceOnceUsed = true;
          p.vy = -1150;
          p.vx = -side * 160;
          this.say('FENCE!', 1, 'アウトレーンの柵がはじき返した');
          this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.35, r0: p.r, r1: p.r * 3, color: '#ffd23f' });
          blip(700, 0.08, 'square', 0.06, 1.8);
        }
      }
    }
    // 磁石ポスト（改造）とゆるい誘導（能力）：近くの的へ少し寄る
    const homing = (b: Body, power: number): void => {
      if (power <= 0) return;
      let best: Enemy | null = null;
      let bd = 280;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return;
      const k = 140 * power * (1 - bd / 280) * dt;
      b.vx += ((best.x - b.x) / bd) * k;
      b.vy += ((best.y - b.y) / bd) * k;
    };
    if (this.ballFree && !this.onRamp && !this.inShooter) homing(p, this.mods.magnet + (this.lead.id === 'homing' ? 0.6 * this.lead.k : 0));
    for (const b of this.mates) { const a = this.abOf(b); if (a?.id === 'homing') homing(b, 0.6 * a.k); }
    // 止まりかけの見張り：同じ場所に 2.5 秒いたら、台をゆらしてはじき出す（はまって時間切れにならないように）
    if (this.ballFree && !this.onRamp && !this.inShooter && this.hole.held < 0 && this.gate.entering < 0) {
      const st = this.stall;
      if (Math.hypot(p.x - st.x, p.y - st.y) < 50) st.t += dt; else { st.x = p.x; st.y = p.y; st.t = 0; }
      if (st.t > 2.5) {
        st.t = 0;
        p.vx = clamp((T.TW / 2 - p.x) * 3, -600, 600);
        p.vy = -1300;
        this.quake = Math.max(this.quake, 8);
        this.say('NUDGE!', 0, '球が止まりかけたので、台をゆらした');
        blip(140, 0.18, 'sawtooth', 0.07, 1.4);
      }
    } else this.stall.t = 0;
    // 打ち出した球が右の通路を出た（台の上まで上がった・台の中へ入った）
    if (this.inShooter && (!this.ballFree || p.y < 420 || p.x < 650)) this.inShooter = false;
    // 通路の中では、まっすぐ上下する（壁にこすれて止まらないように）
    if (this.inShooter && this.ballFree && p.y > T.SHOOT_Y0 - 60) { p.x = T.PLUNGER[0]; p.vx = 0; }
    // 弱く打ち出して、通路を落ちて戻ってきた：もう一度打ち出せる
    if (this.ballFree && p.x > T.SHOOT_X0 && p.y > T.PLUNGER[1] - 24 && Math.abs(p.vy) < 500 && this.time - this.plungeT > 0.3) {
      this.park('plunger');
      this.say('RE-SHOOT', 0, 'もう一度引っぱって打ち出す');
    }
  }

  /** 通り道のライト：球が通ったところが灯る。続けて灯るほどピピピの音が高くなる。全部灯るとごほうび */
  private stepLightPaths(dt: number): void {
    if (this.rule?.id === 'dark') return;
    const balls: Body[] = [...(this.ballFree ? [this.puck] : []), ...this.mates];
    const LIT = 5; // 灯っている秒
    for (const lp of this.lights) {
      lp.flash = Math.max(0, lp.flash - dt);
      for (const b of balls) {
        if (b.x < lp.minX || b.x > lp.maxX || b.y < lp.minY || b.y > lp.maxY) continue;
        lp.pts.forEach(([x, y], i) => {
          if (this.time - lp.lit[i] < LIT) return;
          if (Math.abs(b.x - x) > b.r + 10 || Math.abs(b.y - y) > b.r + 10) return;
          lp.lit[i] = this.time;
          this.pip();
        });
      }
      // 道ぜんぶが灯った
      if (lp.flash <= 0 && lp.lit.every((t) => this.time - t < LIT)) {
        lp.flash = 0.8;
        for (let i = 0; i < lp.lit.length; i += 1) lp.lit[i] = -9;
        const [x, y] = lp.pts[Math.floor(lp.pts.length / 2)];
        this.ev.gum(enemyGum(this.floor, 0) * 0.3 * this.gumMul, 'light');
        if (this.fxBudget-- > 0) this.nums.push({ x, y: y - 10, t: 0, text: 'LIGHTS!', color: lp.color, size: 13 });
        this.show('chase', 0.5, lp.color, x, y);
        for (let k = 0; k < 4; k += 1) setTimeout(() => blip(1320 * 2 ** (k / 4), 0.06, 'square', 0.04, 1), k * 55);
      }
    }
  }

  /** ピッ：続けて鳴るほど半音ずつ高くなる（2 オクターブまで） */
  private pip(): void {
    this.pipRun = this.time - this.pipT < 0.4 ? Math.min(24, this.pipRun + 1) : 0;
    this.pipT = this.time;
    blip(880 * 2 ** (this.pipRun / 12), 0.035, 'square', 0.03, 1);
    if (this.mods.pipGum) this.ev.gum(enemyGum(this.floor, 0) * 0.02 * this.mods.pipGum * this.gumMul, 'mods', 0);
  }

  private loopEnter(side: -1 | 1, up: boolean): void {
    if (up && side === 1 && this.time - this.plungeT < 2.5) return;
    if (up) { this.loopFrom = { side, t: this.time }; return; }
    // 反対側から下りてきた：ループ成功
    const from = this.loopFrom;
    if (from && from.side !== side && this.time - from.t < LOOP_TIME) {
      this.loopFrom = null;
      this.loops += 1;
      this.tableBonus += this.mods.loopAmp;
      const jackpot = this.multi;
      const p = this.puck;
      this.gimmick(true, p.x, p.y, (jackpot ? 6 : 1.2) * (1 + 0.5 * this.abSum('jackpot')), 'lane', jackpot ? 'jackpot' : 'loop');
      if (this.lead.id === 'wind') { this.windUntil.set(p, this.time + 2); p.vx *= 1.15; p.vy *= 1.15; }
      this.say(jackpot ? 'JACKPOT!' : 'LOOP!', jackpot ? 3 : 2, jackpot ? 'マルチボール中のループ' : '左右の道をひと回り・レーンがひとつ点く');
      this.lightNextLane();
      this.show(jackpot ? 'strobe' : 'chase', jackpot ? 1.2 : 0.8, '#3fd0ff', p.x, p.y);
      se('buff', 0.6, 0, 1.3);
    }
  }

  /** スキルショット：ちょうどいい強さで打ち出した */
  private skillShotHit(): void {
    const [x, y] = T.PLUNGER;
    this.gimmick(true, x, y - 40, 8, 'lane', 'skill');
    this.say('SKILL SHOT!', 3, 'ちょうどいい強さで打ち出した・レーンがひとつ点く');
    this.show('strobe', 0.9, '#4fe07a', x, y);
    this.lightNextLane();
  }

  /** 次の消えている G-U-M のレーンを点ける（左のランプ・ループのごほうび） */
  private lightNextLane(): void {
    const l = this.lanes.find((x) => !x.lit);
    if (!l) return;
    l.lit = true;
    l.flash = 0.6;
    if (this.lanes.every((x) => x.lit)) this.lanesDone();
  }

  /**
   * G-U-M を全部点けた：GUM の倍率が上がる。
   * 本編ではピラミッドの入口は閉じていて、かわりにその場で大きめの GUM（レーンの大当たり）。
   * クリア後のエンドレス（save.endless）ではピラミッドへの入口が開く
   */
  private lanesDone(): void {
    this.pinMul = Math.min(8, this.pinMul + 1 + this.mods.laneMul);
    this.save.pinBestMul = Math.max(this.save.pinBestMul, this.pinMul);
    for (const l of this.lanes) { l.lit = false; l.flash = 0.8; }
    if (this.save.endless) {
      this.openGate();
      this.say('PYRAMID GATE OPEN!', 3, `GUM ×${this.pinMul}・まん中の入口に入るとピラミッドへ`);
    } else {
      this.gimmick(true, this.gate.x, this.gate.y, LANE_JACKPOT, 'lane', 'gumlane');
      this.rings.push({ x: this.gate.x, y: this.gate.y, t: 0, life: 0.7, r0: 20, r1: 160, color: '#ffd23f' });
      this.say('G-U-M JACKPOT!', 3, `GUM ×${this.pinMul}・レーンの大当たり`);
    }
    this.show('chase', 1, '#ffd23f');
    se('win', 0.4, 0, 1.2);
  }
  openGate(): void {
    this.gate.open = true;
    this.gate.t = this.st.gateTime;
    this.rings.push({ x: this.gate.x, y: this.gate.y, t: 0, life: 0.6, r0: 120, r1: 10, color: '#ffd23f' });
  }

  /** ピラミッドへの入口：開いている間、近くの球を少しだけ吸い寄せる */
  private stepGate(dt: number): void {
    const g = this.gate;
    g.spin += dt * (g.open ? 3 : 0.5);
    if (!g.open || g.entering >= 0) return;
    g.t -= dt;
    if (g.t <= 0) { g.open = false; this.say('GATE CLOSED', 0, 'G・U・M をまた点けよう'); return; }
    if (!this.ballFree) return;
    const p = this.puck;
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const ga = this.abOf(p);
    const R = GATE_PULL * this.st.gatePull * (1 + this.mods.gatePull) * (ga?.id === 'gate' ? 1 + 0.3 * ga.k : 1);
    if (d > R) return;
    const near = 1 - d / R;
    const k = 3600 * near;
    p.vx += (dx / d) * k * dt;
    p.vy += (dy / d) * k * dt;
    // 近いほど勢いを吸いとって、穴へ落ちやすく
    const damp = Math.exp(-6 * near * dt);
    p.vx *= damp;
    p.vy *= damp;
  }

  private captureSaucer(): void {
    this.park('saucer');
    this.saucer.flash = 0.5;
    this.saucer.locks += 1;
    blip(240, 0.2, 'sine', 0.08, 0.5);
    if (this.saucer.locks >= this.locksNeeded) {
      this.saucer.locks = 0;
      this.multiball();
    } else {
      this.say(`LOCK ${this.saucer.locks}`, 1, `あと ${this.locksNeeded - this.saucer.locks} 回でマルチボール`);
      this.show('radial', 0.6, '#ff8f2e', this.saucer.x, this.saucer.y);
    }
  }

  /** 自動で狙い撃ち：ボス・HP のいちばん多い的へ */
  private ejectSaucer(): void {
    const p = this.puck;
    this.parked = null;
    this.saucer.cool = 1;
    this.shootAt(this.bestTarget(), 1900);
    this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.3, r0: p.r, r1: p.r * 4, color: ELEM_COLOR.green });
    se('blast', 0.35, 0, 1.6);
  }

  private bestTarget(): { x: number; y: number } | undefined {
    if (this.gate.open) return this.gate;
    const alive = this.enemies.filter((e) => e.hp > 0);
    return alive.find((e) => e.boss) ?? alive.sort((a, b) => b.hp - a.hp)[0];
  }
  /** 球を的へ向けて撃ち出す（緑の貫通） */
  private shootAt(t: { x: number; y: number } | undefined, speed: number): void {
    const p = this.puck;
    const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : -Math.PI / 2 + rand(-0.5, 0.5);
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    this.launchId += 1;
    this.greenUntil = this.time + this.st.greenTime;
  }

  /** ミステリーのホール：ルーレットのあと、何かが起きる */
  private captureMystery(): void {
    this.park('mystery');
    // ときどきオファー（実況が取引を持ちかける）。選んでいる間は時間が止まる
    if (this.ev.offer && this.offerCount < OFFER_MAX && Math.random() < OFFER_CHANCE) {
      const left = OFFERS.filter((o) => !this.offers.has(o.id) && !(o.id === 'time8' && !(this.save.equip ?? []).length));
      if (left.length) {
        this.offerCount += 1;
        this.mystery.pick = -1;
        this.say('OFFER!', 3, '取引を持ちかけられた');
        this.ev.offer(left[Math.floor(Math.random() * left.length)].id);
        return;
      }
    }
    this.mystery.flash = 0.6;
    this.mystery.pick = Math.random() < this.mods.mysteryLuck ? Math.max(0, MYSTERIES.findIndex((x) => x.id === 'gum')) : Math.floor(Math.random() * MYSTERIES.length);
    this.say('MYSTERY...', 1, '何が起きるかな');
    blip(700, 0.4, 'square', 0.05, 2.5);
  }

  /** オファーを受けた */
  acceptOffer(id: OfferId): void {
    this.offers.add(id);
    const p = this.puck;
    switch (id) {
      case 'gum2': for (const k of this.kickbacks) k.lit = false; break;
      case 'limited2': this.extraPicks += 1; this.runLeft = Math.max(1, this.runLeft - 5); break;
      case 'multi': this.ballSaveUntil = 0; this.multiball(); break;
      case 'time8': {
        const eq = this.save.equip ?? [];
        this.offExt = eq[Math.floor(Math.random() * eq.length)] ?? -1;
        this.calcStats();
        this.runLeft += 8;
        break;
      }
      default: break;
    }
    this.say('DEAL!', 3, '取引成立');
    this.show('strobe', 0.8, '#ffd23f', p.x, p.y);
  }

  private ejectMystery(): void {
    if (this.mystery.pick < 0) {
      // オファーのあと：そのまま撃ち出す
      this.parked = null;
      this.mystery.cool = 1.5;
      const p = this.puck;
      p.vx = 200;
      p.vy = 700;
      return;
    }
    const m = MYSTERIES[this.mystery.pick] ?? MYSTERIES[0];
    this.parked = null;
    this.mystery.cool = 1.5;
    const p = this.puck;
    switch (m.id) {
      case 'gum': this.gimmick(true, p.x, p.y, 10, 'lane', 'mystery'); break;
      case 'ghost': this.spawnGhosts(p.x, p.y, -Math.PI / 3); break;
      case 'lock': this.saucer.locks = Math.min(this.locksNeeded - 1, this.saucer.locks + 1); break;
      case 'mul': this.pinMul = Math.min(8, this.pinMul + 1); this.save.pinBestMul = Math.max(this.save.pinBestMul, this.pinMul); break;
      case 'save': this.ballSaveUntil = this.time + 10; break;
      case 'time': this.runLeft += 3; break;
      case 'hole': this.hole.next = 0; break;
      case 'kick': for (const k of this.kickbacks) { k.lit = true; k.flash = 0.6; } break;
    }
    this.say(m.text, 2, m.sub);
    this.show('radial', 0.8, '#ffd23f', this.mystery.x, this.mystery.y);
    se('buff', 0.5, 0, 1.2);
    // 右上へ撃ち出す
    const a = -Math.PI / 2 + 0.55;
    p.vx = Math.cos(a) * 1500;
    p.vy = Math.sin(a) * 1500;
  }

  /** マルチボール：仲間のヒーローが球になって出てくる */
  /** マルチボールを始める（解説モードの実演からも呼ぶ） */
  multiball(): void {
    this.multiballs += 1;
    const n = Math.min(8, 2 + this.st.mates + (this.st.megaMulti ? 2 : 0));
    // 出るのは装備した控えのヒーロー（順番に）。いなければ持っているヒーローから
    const owned = this.save.heroes.filter((id) => id !== this.save.hero);
    const party = (this.save.party ?? []).filter((id) => id !== this.save.hero && this.save.heroes.includes(id));
    for (let i = 0; i < n; i += 1) {
      const hero = heroById(party.length ? party[i % party.length] : owned.length ? pick(owned) : this.save.hero);
      const a = -Math.PI / 2 + rand(-0.9, 0.9);
      this.mates.push({ x: this.saucer.x, y: this.saucer.y, vx: Math.cos(a) * 1600, vy: Math.sin(a) * 1600, r: clamp(this.radius * 0.85, 9, 14), m: 1, hero, spin: 0 });
    }
    if (this.toys.gacha) this.gachaPop = this.time;
    // 13 球マルチボール：3 の倍数回目のマルチボールは、球が 13 個（足した分は短い間だけ）
    if (this.toys.mega13 && this.multiballs % MEGA13.every === 0) {
      const party = (this.save.party?.length ? this.save.party : [this.save.hero]).map((id) => heroById(id));
      const [gx, gy] = this.toys.gacha ? GACHA : [this.saucer.x, this.saucer.y];
      for (let i = this.mates.length + 1; i < MEGA13.balls; i += 1) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2);
        const sp = rand(1200, 1900);
        this.mates.push({ x: gx, y: gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: clamp(this.radius * 0.85, 9, 13), m: 1, hero: party[i % party.length], spin: 0, ghost: this.time + MEGA13.time });
      }
      this.say('13-BALL MULTIBALL!', 3, `球が ${MEGA13.balls} 個！ ${MEGA13.time} 秒の大祭り`);
      this.show('rainbow', 3);
      this.quake = 20;
      se('win', 0.6, 0);
      this.ejectSaucer();
      return;
    }
    this.say('MULTIBALL!', 3, '仲間のヒーローが球になる');
    this.show('rainbow', 2.5);
    this.quake = 14;
    buzz([0, 40, 30, 40]);
    // 本物の球もすぐ撃ち出す
    this.ejectSaucer();
  }

  /** 球が落ちた */
  private drain(): void {
    const p = this.puck;
    if (this.time < this.ballSaveUntil && !this.offers.has('multi')) {
      // ボールセーブ：下から打ち上げて戻す
      this.ballSaveUntil = 0;
      [p.x, p.y] = T.SAVE_SPOT;
      p.vx = rand(-120, 120);
      p.vy = -2100;
      this.say('BALL SAVE!', 1);
      se('buff', 0.5, 0, 1.4);
      return;
    }
    // 予備のセーブ（改造）：1 プレイに決まった回数だけ、もう一度ボールセーブ
    if (this.spareLeft > 0) {
      this.spareLeft -= 1;
      [p.x, p.y] = T.SAVE_SPOT;
      p.vx = rand(-120, 120);
      p.vy = -2100;
      this.say('SPARE SAVE!', 2, `予備のセーブ・のこり ${this.spareLeft} 回`);
      se('buff', 0.5, 0, 1.2);
      return;
    }
    // マグナセーブ（スキル）：傾けていれば、磁石がすくい上げる
    if (this.st.magna && this.time >= this.magnaReady && this.tiltCurve > 0.15) {
      this.magnaReady = this.time + 15;
      [p.x, p.y] = T.SAVE_SPOT;
      p.vx = this.tiltDir[0] * 600;
      p.vy = -2000;
      this.say('MAGNA SAVE!', 2, '傾けて磁石ですくい上げた');
      this.show('radial', 0.7, '#ff4f5e', p.x, p.y);
      se('buff', 0.5, 0, 0.9);
      return;
    }
    const idx = this.mates.findIndex((b) => b.ghost === undefined);
    const mate = idx >= 0 ? this.mates.splice(idx, 1)[0] : undefined;
    if (mate) {
      // マルチボール中は、残っている球を本物にする
      p.x = mate.x; p.y = mate.y; p.vx = mate.vx; p.vy = mate.vy;
      return;
    }
    // 跳ね返り（能力）：1 プレイに 1 回、落ちかけたら跳ね戻る
    if (this.lead.id === 'bounce' && !this.bounced.has(p)) {
      this.bounced.add(p);
      [p.x, p.y] = T.SAVE_SPOT;
      p.vx = rand(-160, 160);
      p.vy = -2000;
      this.say('BOUNCE!', 2, '跳ね返り：1 プレイに 1 回');
      this.show('radial', 0.6, '#ffd23f', p.x, p.y);
      return;
    }
    this.drains += 1;
    this.pinMul = 1;
    // 落下保険（改造）：このプレイで稼いだ GUM の一部が戻る
    if (this.mods.insurance > 0 && this.runGum > 0) {
      const back = this.runGum * this.mods.insurance;
      this.ev.gum(back, 'mods');
      if (this.fxBudget-- > 0) this.nums.push({ x: p.x, y: T.DRAIN_Y - 60, t: 0, text: 'INSURANCE!', color: '#ffd23f', size: 14 });
    }
    if (this.combo) { this.ev.comboEnd?.(this.combo); this.combo = 0; }
    this.say('DRAIN', 0, '引っぱって打ち直す');
    this.show('fade', 0.8, '#ff4f5e');
    blip(160, 0.4, 'sawtooth', 0.08, 0.3);
    buzz(40);
    this.park('plunger');
  }

  /** 的とボスの動き（的は動かない。ボスは左右に行き来して色を変える） */
  private aiTable(dt: number): void {
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.squash = Math.max(0, e.squash - dt * 2.5);
      e.vx = 0;
      e.vy = 0;
      if (!e.boss) { e.x = e.tx; e.y = e.ty; continue; }
      const w = 0.6 * (1 - this.mods.bossSlow);
      e.x = T.BOSS_HOME[0] + Math.sin(this.time * w) * T.BOSS_SWAY;
      e.vx = Math.cos(this.time * w) * T.BOSS_SWAY * w;
      e.face = e.vx > 0 ? -1 : 1;
      e.elemT -= dt;
      if (e.elemT <= 0) {
        e.elemT = 7;
        e.elem = ELEMS[(ELEMS.indexOf(e.elem) + 1) % ELEMS.length];
        this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.6, r0: e.r * 2.4, r1: e.r * 0.8, color: ELEM_COLOR[e.elem] });
        this.nums.push({ x: e.x, y: e.y - e.r * 1.4, t: 0, text: `${ELEM_NAME[e.elem]}に変わった`, color: ELEM_COLOR[e.elem], size: 15 });
      }
    }
  }

  /** ランプを下りきった */
  private rampDone(): void {
    const p = this.puck;
    const i = this.onRamp?.i ?? 0;
    const rp = this.ramps[i];
    const at = this.rampAt(i, rp.len);
    this.onRamp = null;
    p.x = at.x;
    p.y = at.y;
    p.vx = at.dx * 300;
    p.vy = Math.max(200, at.dy * 300);
    rp.flash = 0.6;
    this.rampsDone += 1;
    this.rampCombo = this.time - this.rampLastT < RAMP_COMBO ? this.rampCombo + 1 : 1;
    this.rampLastT = this.time;
    const jackpot = this.multi;
    const share = jackpot ? 8 : 1 + this.rampCombo * 0.5 * (1 + this.mods.rampAmp);
    this.gimmick(true, p.x, p.y, share * (1 + 0.5 * this.abSum('jackpot')), 'lane', jackpot ? 'jackpot' : 'ramp');
    if (jackpot) this.say('SUPER JACKPOT!', 3, 'マルチボール中のランプ');
    else if (this.rampCombo >= 2) this.say(`RAMP ×${this.rampCombo}`, this.rampCombo >= 3 ? 3 : 2, '続けて通すほど GUM');
    else this.say('RAMP!', 1, rp.id === 'R' ? '台をぐるっと一周' : '上のレーンへ・レーンがひとつ点く');
    if (rp.id === 'L') this.lightNextLane();
    this.show(jackpot ? 'strobe' : 'chase', 1, rp.color, p.x, p.y);
    se('blast', 0.3, 0, 1.7);
  }

  /** ブラックホール：ときどき開いて、近くの球を吸いこみ、ものすごい速さで撃ち出す */
  private stepHole(dt: number): void {
    const h = this.hole;
    h.spin += dt * (h.on ? 5 : 1);
    if (!h.on) {
      h.next -= dt;
      if (h.next <= 0 && this.phase === 'play') {
        const spots = T.HOLE_SPOTS.filter(([, y]) => !(this.bossAlive && y < 300));
        [h.x, h.y] = pick(spots.length ? spots : T.HOLE_SPOTS);
        h.on = true;
        h.t = HOLE_OPEN;
        this.say('BLACK HOLE!', 2, '吸いこまれると超高速で撃ち出される');
        this.show('radial', 0.8, '#c08bff', h.x, h.y);
        blip(80, 0.6, 'sawtooth', 0.08, 0.5);
      }
      return;
    }
    if (h.held < 0) h.t -= dt;
    if (h.t <= 0 && h.held < 0) { h.on = false; h.next = HOLE_EVERY * (1 - this.mods.holeEvery); return; }
    // 吸いこむ（分身・仲間の球も）
    const pull = (b: Body, main: boolean) => {
      const dx = h.x - b.x;
      const dy = h.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const ha = this.abOf(b);
      const R = HOLE_PULL * (ha?.id === 'gate' ? 1 + 0.3 * ha.k : 1);
      if (d > R) return;
      const k = 2600 * (1 - d / R);
      b.vx += (dx / d) * k * dt;
      b.vy += (dy / d) * k * dt;
      // 渦を巻く
      b.vx += (-dy / d) * k * 0.35 * dt;
      b.vy += (dx / d) * k * 0.35 * dt;
      if (main && d < 12 && h.held < 0) {
        h.held = 0;
        this.say('SWALLOWED!', 1);
        this.quake = Math.max(this.quake, 6);
        buzz([0, 30, 20, 30]);
      }
    };
    if (this.ballFree) pull(this.puck, true);
    for (const b of this.mates) pull(b, false);
  }

  private holeEject(): void {
    const h = this.hole;
    h.held = -1;
    h.on = false;
    h.next = HOLE_EVERY * (1 - this.mods.holeEvery);
    const alive = this.enemies.filter((e) => e.hp > 0);
    this.shootAt(alive.find((e) => e.boss) ?? (alive.length ? pick(alive) : undefined), 2600);
    this.greenUntil += 0.6;
    this.say('HYPERDRIVE!', 3, '緑の貫通で撃ち出す');
    this.show('strobe', 0.7, '#c08bff', h.x, h.y);
    this.rings.push({ x: h.x, y: h.y, t: 0, life: 0.5, r0: 10, r1: 120, color: '#c08bff' });
    se('blast', 0.6, 0, 0.8);
    this.quake = 14;
  }

  /** ゴーストスター：ときどき出てきて、触ると分身球が出る */
  private stepStar(dt: number): void {
    const st = this.star;
    if (st.on) {
      st.t -= dt;
      if (st.t <= 0) { st.on = false; st.next = STAR_EVERY * (1 - this.mods.starEvery); }
      return;
    }
    st.next -= dt;
    if (st.next <= 0 && this.phase === 'play') {
      [st.x, st.y] = pick(T.STAR_SPOTS);
      st.on = true;
      st.t = 8;
      this.rings.push({ x: st.x, y: st.y, t: 0, life: 0.5, r0: 40, r1: 6, color: '#bfe9ff' });
    }
  }

  private takeStar(b: Body): void {
    const st = this.star;
    st.on = false;
    st.next = STAR_EVERY * (1 - this.mods.starEvery);
    this.spawnGhosts(st.x, st.y, Math.atan2(b.vy, b.vx), Math.max(1200, Math.hypot(b.vx, b.vy)));
    this.say('GHOST BALL!', 2, `分身が ${GHOST_TIME} 秒あばれる`);
    this.show('radial', 0.7, '#bfe9ff', st.x, st.y);
    se('buff', 0.5, 0, 1.6);
  }
  private spawnGhosts(x: number, y: number, base: number, sp = 1400): void {
    const n = GHOSTS + (this.mods.starEvery > 0 ? 1 : 0);
    for (let i = 0; i < n; i += 1) {
      const a = base + (i - (n - 1) / 2) * 0.7;
      this.mates.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: clamp(this.radius * 0.9, 9, 13), m: 1, hero: this.hero, spin: 0, ghost: this.time + GHOST_TIME });
    }
  }

  private stepLights(dt: number): void {
    for (const s of this.segs) s.flash = Math.max(0, s.flash - dt);
    for (const b of this.bumpers) b.flash = Math.max(0, b.flash - dt);
    for (const l of this.lanes) l.flash = Math.max(0, l.flash - dt);
    for (const r of this.ramps) r.flash = Math.max(0, r.flash - dt);
    this.saucer.flash = Math.max(0, this.saucer.flash - dt);
    this.mystery.flash = Math.max(0, this.mystery.flash - dt);
  }

  /** 落とし物はすぐ手に入る（台の上に散らからないように） */
  protected override stepDrops(dt: number): void {
    for (const d of this.drops) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-4 * dt);
      d.vy *= Math.exp(-4 * dt);
      if (d.age > 0.45) this.collect(d);
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  /** レーンの文字（描画用） */
  static readonly LETTERS = LANE_LETTERS;
}

// ------------------------------------------------------------------ 計算のための小さな関数
/** 点から線分までのいちばん近い点と距離（t は線分の上の位置 0〜1） */
export function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): { d: number; qx: number; qy: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return { d: Math.hypot(x - qx, y - qy), qx, qy, t };
}

function capSpeed(b: Body, max: number): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
}

function ballBall(a: Body, b: Body): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  const over = (min - d) / 2;
  a.x -= nx * over; a.y -= ny * over;
  b.x += nx * over; b.y += ny * over;
  const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vrel < 0) {
    a.vx += vrel * nx; a.vy += vrel * ny;
    b.vx -= vrel * nx; b.vy -= vrel * ny;
  }
}

function fmtSmall(n: number): string {
  if (n < 10) return n.toFixed(1);
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return (n / 1e3).toFixed(1) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}
