// ピンボールのモード：手前へ下る坂の台。引っぱって打ち出し、傾けて曲げ、振って揺らす。
// フリッパーは自動。台のギミック（バンパー・スリングショット・レーン・スピナー・ループ・
// キャプチャーホール・ワープ・キックバック・ボールセーブ・マルチボール・ワイヤーのランプ）で GUM と連鎖を稼ぐ。
// 本物の台ではできない仕掛けも入れる：ブラックホール・ゴーストスター（分身球）・ZONE（20 連鎖で重さが軽くなる）。
// エネミーはドロップターゲット（動かない的）。ぜんぶ倒すとボス、ボスを倒すと次の台。
//
// 座標はユニット：台の幅 360・高さ TABLE_H。動き・当たり・ダメージの多くは World のものを使う。

import { heroById, type EnemyArt } from '../core/catalog';
import { blip, buzz, se } from '../core/audio';
import { clamp, pick, rand } from '../core/util';
import { ELEMS, ELEM_COLOR, ELEM_NAME, type Elem } from './elements';
import { FLOORS, bossHp, enemyGum, enemyHp, impactFactor, isRaidFloor } from './economy';
import { World, type Body, type Enemy, type Mate, type WorldEvents } from './world';
import type { Save } from '../core/save';

/** 台の高さ（幅は 360） */
export const TABLE_H = 640;
/** 1 回のランの長さ（秒） */
export const PIN_TIME = 30;
/** 坂の重さ（下向きの加速） */
const GRAVITY = 1150;
/** 傾けたときに球を曲げる力（坂の重さより弱い：少し曲げるだけ） */
const NUDGE = 620;
/** 球の速さの上限 */
const MAX_BALL = 2700;
/** 打ち出したあと、落ちても戻してくれる時間 */
const BALL_SAVE = 4;
/** キックバックがまた点くまでの時間 */
const KICKBACK_TIME = 12;
/** キャプチャーホールで止まっている時間（この間に引っぱれば狙い撃ち） */
const SAUCER_HOLD = 1.3;
/** ループ：入口から出口までこの秒数以内 */
const LOOP_TIME = 2.6;
/** ワイヤーのランプ：右の入口から、台の上を回って左のインレーンへ下りる道（球はこの上を浮いて走る） */
export const RAMP_PATH: [number, number][] = [
  [282, 252], [300, 192], [306, 132], [296, 94], [270, 68], [230, 54], [180, 50], [130, 54], [90, 68],
  [66, 94], [56, 132], [56, 200], [58, 300], [60, 390], [64, 440],
];
const RAMP_SPEED = 1150;
/** ランプを続けて通るとコンボ（この秒数以内） */
const RAMP_COMBO = 5;
/** ブラックホール：出てくる場所・間隔・開いている時間・吸いこむ範囲 */
const HOLE_SPOTS: [number, number][] = [[180, 318], [180, 128]];
const HOLE_EVERY = 13;
const HOLE_OPEN = 7;
export const HOLE_PULL = 96;
/** ゴーストスター：出てくる場所・間隔・分身の数と時間 */
const STAR_SPOTS: [number, number][] = [[100, 262], [260, 262], [180, 412], [72, 172], [288, 172]];
const STAR_EVERY = 10;
const GHOSTS = 3;
const GHOST_TIME = 7;
/** この連鎖から ZONE（坂が軽くなり、GUM ×2） */
export const ZONE_COMBO = 20;

/** 演出（ライトショー）の合図。描画がランプの光り方を決める */
export interface Show { kind: 'radial' | 'chase' | 'strobe' | 'rainbow' | 'fade'; t0: number; x: number; y: number; color: string; dur: number }

export interface Seg { ax: number; ay: number; bx: number; by: number; kick: boolean; flash: number }
export interface Bumper { x: number; y: number; r: number; flash: number }
export interface Flipper {
  px: number; py: number; side: 1 | -1; len: number;
  /** 角度（下向きが正）・角速度・上げている残り時間・つぎに動けるまで */
  a: number; av: number; up: number; cd: number;
}
export interface Lane { x: number; lit: boolean; flash: number }
export interface Hole { x: number; y: number; r: number }

const REST_A = 0.5;
const UP_A = -0.45;
const FLIP_SPEED = 17;
const LANE_LETTERS = ['G', 'U', 'M'];

/** 台の形（ずっと同じ）。左右対称のものは鏡に写して作る */
function tableShape(): { segs: Seg[]; bumpers: Bumper[]; flippers: Flipper[]; lanes: Lane[] } {
  const segs: Seg[] = [];
  const wall = (ax: number, ay: number, bx: number, by: number, kick = false) => segs.push({ ax, ay, bx, by, kick, flash: 0 });
  const both = (ax: number, ay: number, bx: number, by: number, kick = false) => {
    wall(ax, ay, bx, by, kick);
    wall(360 - ax, ay, 360 - bx, by, kick);
  };
  // 外の壁（上の角は丸い：ループの道になる）
  both(0, 90, 0, TABLE_H + 80);
  wall(90, 0, 270, 0);
  const arc = 10;
  for (let i = 0; i < arc; i += 1) {
    const a0 = Math.PI + (i / arc) * (Math.PI / 2);
    const a1 = Math.PI + ((i + 1) / arc) * (Math.PI / 2);
    both(90 + Math.cos(a0) * 90, 90 + Math.sin(a0) * 90, 90 + Math.cos(a1) * 90, 90 + Math.sin(a1) * 90);
  }
  // ループの内側の壁
  both(44, 380, 44, 150);
  // 上のロールオーバーレーンの仕切り
  for (const x of [126, 162, 198, 234]) wall(x, 56, x, 94);
  // インレーンの案内（外側がアウトレーン）。球がはさまらない幅をあける
  both(40, 465, 94, 563);
  // スリングショット（内向きの斜めの辺が、当たると強くはじく）
  const [a, b, c] = SLING;
  both(a[0], a[1], b[0], b[1]);
  both(b[0], b[1], c[0], c[1]);
  both(a[0], a[1], c[0], c[1], true);
  const bumpers: Bumper[] = [
    { x: 132, y: 200, r: 22, flash: 0 },
    { x: 228, y: 200, r: 22, flash: 0 },
    { x: 180, y: 268, r: 22, flash: 0 },
  ];
  const flippers: Flipper[] = [
    { px: 98, py: 572, side: 1, len: 64, a: REST_A, av: 0, up: 0, cd: 0 },
    { px: 262, py: 572, side: -1, len: 64, a: REST_A, av: 0, up: 0, cd: 0 },
  ];
  const lanes: Lane[] = [144, 180, 216].map((x) => ({ x, lit: false, flash: 0 }));
  return { segs, bumpers, flippers, lanes };
}

/** 左のスリングショットの三角（右は鏡写し）：上・左下・右下 */
export const SLING: [number, number][] = [[94, 436], [94, 482], [124, 502]];

/** ドロップターゲット（エネミー）を置く場所。前の 4 つが中央の列、あとは台が進むと増える */
export const TARGET_SLOTS: [number, number][] = [
  [110, 345], [150, 352], [210, 352], [250, 345],
  [95, 160], [265, 160], [180, 172], [75, 228], [130, 118],
];

export function flipperTip(f: Flipper): [number, number] {
  return [f.px + f.side * Math.cos(f.a) * f.len, f.py + Math.sin(f.a) * f.len];
}

export class PinballWorld extends World {
  segs: Seg[];
  bumpers: Bumper[];
  flippers: Flipper[];
  lanes: Lane[];
  /** スピナー（左のループの入口）：回る角度と速さ */
  spinner = { x: 22, y: 300, angle: 0, speed: 0 };
  saucer: Hole & { locks: number; cool: number; flash: number } = { x: 298, y: 345, r: 13, locks: 0, cool: 0, flash: 0 };
  warpIn: Hole & { cool: number } = { x: 88, y: 296, r: 13, cool: 0 };
  warpOut = { x: 180, y: 34 };
  kickback = { lit: true, t: 0, flash: 0 };
  /** 球が止まっている：打ち出し待ち（plunger）・キャプチャーホールの中（saucer） */
  parked: 'plunger' | 'saucer' | null = 'plunger';
  parkT = 0;
  ballSaveUntil = -9;
  /** GUM の倍率（レーンを全部点けると上がる。落ちると 1 に戻る） */
  pinMul = 1;
  /** ループの入口を通った側と時刻 */
  private loopFrom: { side: -1 | 1; t: number } | null = null;
  /** 直前のコマの球の位置（線を横切ったかを見る） */
  private prevY = 0;
  private prevX = 0;
  drains = 0;
  loops = 0;
  multiballs = 0;
  ramps = 0;
  /** ワイヤーのランプの上を走っている（s は道の上の距離） */
  onRamp: { s: number } | null = null;
  rampLastT = -9;
  rampCombo = 0;
  /** ブラックホール：開いている間 on。吸いこんだ球は held 秒後に撃ち出す */
  hole = { x: 180, y: 318, on: false, t: 0, next: 8, held: -1, spin: 0 };
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

  constructor(save: Save, ev: WorldEvents) {
    super(save, ev);
    const t = tableShape();
    this.segs = t.segs;
    this.bumpers = t.bumpers;
    this.flippers = t.flippers;
    this.lanes = t.lanes;
    this.h = TABLE_H;
  }

  override resize(): void { this.h = TABLE_H; }
  override get runTime(): number { return PIN_TIME; }
  override get canHold(): boolean { return this.phase === 'play' && this.parked !== null; }
  /** 球の大きさ：マレットの大きさのスキルで少しだけ大きくなる（台に収まる大きさまで） */
  override get radius(): number {
    return clamp(this.st.radius * 0.45, 10, 13) * (this.buffOn('giant') ? 1.2 : 1);
  }
  override get gumMul(): number { return super.gumMul * this.pinMul * (this.zone ? 2 : 1); }
  /** 台の上では、離れた的には当てない（球がぶつかって跳ねるのがピンボール） */
  override reachOf(): number { return 0; }
  /** ピンボールではどの色でも的で跳ね返る */
  protected override restOf(attack: Elem): number { return attack === 'green' ? 0.9 : 0.75; }
  override get oval(): boolean { return false; }
  /** 打ち出す場所 */
  get plungerSpot(): [number, number] { return [180, 470]; }
  /** 道の長さ */
  static readonly RAMP_LEN = RAMP_PATH.slice(1).reduce((a, [x, y], i) => a + Math.hypot(x - RAMP_PATH[i][0], y - RAMP_PATH[i][1]), 0);

  /** 知らせ：上の画面に出し、文字と音でも知らせる */
  say(text: string, tier: number, sub = ''): void {
    this.display = { text, sub, tier, t: this.time };
    this.ev.pin?.(text, tier);
    if (tier >= 3) this.punch = Math.max(this.punch, 1);
  }
  /** ライトショーを始める */
  show(kind: Show['kind'], dur: number, color = '#ffffff', x = 180, y = 320): void {
    this.shows.push({ kind, t0: this.time, x, y, color, dur });
    if (this.shows.length > 12) this.shows.shift();
  }
  /** ランプの道の上の位置と向き */
  rampAt(s: number): { x: number; y: number; dx: number; dy: number } {
    let left = s;
    for (let i = 1; i < RAMP_PATH.length; i += 1) {
      const [ax, ay] = RAMP_PATH[i - 1];
      const [bx, by] = RAMP_PATH[i];
      const l = Math.hypot(bx - ax, by - ay);
      if (left <= l || i === RAMP_PATH.length - 1) {
        const k = clamp(left / l, 0, 1);
        return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, dx: (bx - ax) / l, dy: (by - ay) / l };
      }
      left -= l;
    }
    const [x, y] = RAMP_PATH[RAMP_PATH.length - 1];
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
    const k = Math.min(MAX_BALL * 0.95, sp * 0.62) / sp;
    p.vx *= k;
    p.vy *= k;
    if (this.parked === 'plunger') this.ballSaveUntil = this.time + BALL_SAVE;
    if (this.parked === 'saucer') this.saucer.cool = 1;
    this.parked = null;
  }
  override shake(x: number, y: number, power: number, threshold: number): void {
    if (this.hold.active) return;
    const p = this.puck;
    const keep = this.parked ? { vx: p.vx, vy: p.vy } : null;
    super.shake(x, y, power, threshold);
    if (keep) { p.vx = keep.vx; p.vy = keep.vy; return; }
    // 台を揺らす：強すぎないように
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 1800) { p.vx *= 1800 / sp; p.vy *= 1800 / sp; }
  }

  // ------------------------------------------------------------------ ラン・台
  override startRun(start: number): void {
    this.floor = Math.max(1, Math.min(FLOORS, start));
    this.runStartFloor = this.floor;
    this.runLeft = PIN_TIME;
    this.cleared = [];
    this.runGum = 0;
    this.drops = [];
    this.waves = [];
    this.mates = [];
    this.combo = 0;
    this.buffs = {};
    this.pinMul = 1;
    this.drains = 0;
    this.loops = 0;
    this.multiballs = 0;
    this.saucer.locks = 0;
    this.ramps = 0;
    this.onRamp = null;
    this.rampCombo = 0;
    this.hole.on = false;
    this.hole.held = -1;
    this.hole.next = 8;
    this.star.on = false;
    this.star.next = 6;
    this.zone = false;
    this.shows = [];
    this.display = { text: 'READY', sub: '引っぱって打ち出す', tier: 0, t: 0 };
    this.kickback.lit = true;
    for (const l of this.lanes) l.lit = false;
    this.park('plunger');
    this.save.runs += 1;
    this.phase = 'play';
    this.beginFloor();
  }

  override beginFloor(): void {
    this.floorT = 0;
    this.floorSteps = 0;
    this.freeze = 0;
    this.enemies = [];
    this.bossAlive = false;
    this.bossSpawned = false;
    this.save.pinDeepest = Math.max(this.save.pinDeepest, this.floor);
    const { set, lo, hi } = this.floorArt();
    const n = clamp(4 + Math.floor((this.floor - 1) / 2) + this.st.extraEnemies, 4, TARGET_SLOTS.length);
    for (let i = 0; i < n; i += 1) {
      const tier = lo + Math.floor(Math.random() * (hi - lo + 1));
      const [x, y] = TARGET_SLOTS[i];
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
    this.target(art, bossHp(this.floor), 180, 132, raid ? 36 : 30, true, 5);
    this.quake = 10;
    this.ev.boss(art.name, raid);
    this.say('BOSS!', 2, art.name);
    this.show('strobe', 0.8, '#ff4f5e');
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
    this.phase = 'zoom';
    this.zoomT = 0;
    this.zoomDur = 0.9;
  }

  /** 球を止めて置く */
  park(where: 'plunger' | 'saucer'): void {
    const p = this.puck;
    this.parked = where;
    this.parkT = 0;
    if (where === 'plunger') [p.x, p.y] = this.plungerSpot;
    else { p.x = this.saucer.x; p.y = this.saucer.y; }
    p.vx = 0;
    p.vy = 0;
    this.greenUntil = 0;
    this.blueUntil = 0;
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
    this.runLeft -= dt;
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
    if (zone && !this.zone) { this.say('ZONE!', 3, '坂が軽くなり GUM ×2'); this.show('rainbow', 1.5); }
    this.zone = zone;
    const g = GRAVITY * (zone ? 0.6 : 1);
    const ax = m > 0 ? (tx / m) * curve * NUDGE : 0;
    const ay = (m > 0 ? (ty / m) * curve * NUDGE : 0) + g;

    if (this.onRamp) {
      // ワイヤーのランプの上：道にそって走る（台のものには当たらない）
      this.onRamp.s += RAMP_SPEED * dt;
      const at = this.rampAt(this.onRamp.s);
      p.x = at.x;
      p.y = at.y;
      p.vx = at.dx * RAMP_SPEED;
      p.vy = at.dy * RAMP_SPEED;
      if (this.onRamp.s >= PinballWorld.RAMP_LEN) this.rampDone();
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
      if (this.parked === 'plunger') [p.x, p.y] = this.plungerSpot;
      p.vx = 0;
      p.vy = 0;
      // キャプチャーホール：引っぱらなければ、少し待って自動で狙い撃ち
      if (this.parked === 'saucer' && this.parkT >= SAUCER_HOLD && !this.hold.active) this.ejectSaucer();
    } else {
      p.vx += ax * dt;
      p.vy += ay * dt;
      capSpeed(p, MAX_BALL);
    }
    for (const b of this.mates) {
      b.vy += (b.ghost ? g * 0.5 : g) * dt;
      b.vx += ax * dt * 0.5;
      capSpeed(b, MAX_BALL);
    }
    this.stepHole(dt);
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
    this.prevX = p.x;
    this.prevY = p.y;
    for (let i = 0; i < n; i += 1) this.substepTable(h);

    this.sensors(dt);
    this.stepDrops(dt);
    if (!this.bossSpawned && this.phase === 'play' && !this.enemies.some((e) => !e.boss)) this.spawnBoss();
    this.stepLights(dt);
    this.stepFx(dt);
    this.trail.push({ x: p.x, y: p.y, t: this.time });
    while (this.trail.length && this.time - this.trail[0].t > 0.18) this.trail.shift();
    this.quake = Math.max(0, this.quake - dt * 30);
  }

  /** 本物の球が台の上を自由に動いている（止まっていない・ランプやブラックホールの中でもない） */
  get ballFree(): boolean { return !this.parked && !this.onRamp && this.hole.held < 0; }

  /** 自動のフリッパー：球が上に来たら打つ */
  private autoFlip(dt: number): void {
    const balls: Body[] = this.ballFree ? [this.puck, ...this.mates] : [...this.mates];
    for (const f of this.flippers) {
      f.cd -= dt;
      if (f.up > 0) { f.up -= dt; continue; }
      if (f.cd > 0) continue;
      const near = balls.some((b) => {
        if (b.y < f.py - 64 || b.y > f.py + 26 || b.vy < -260) return false;
        const lo = f.side === 1 ? f.px - 12 : f.px - f.len - 14;
        const hi = f.side === 1 ? f.px + f.len + 14 : f.px + 12;
        if (b.x < lo || b.x > hi) return false;
        return segDist(b.x, b.y, f.px, f.py, ...flipperTip(f)).d < b.r + 26;
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
      const target = f.up > 0 ? UP_A : REST_A;
      const d = target - f.a;
      const stepA = FLIP_SPEED * h;
      if (Math.abs(d) <= stepA) { f.av = 0; f.a = target; } else { f.av = Math.sign(d) * FLIP_SPEED; f.a += f.av * h; }
    }
    const p = this.puck;
    if (this.ballFree) {
      p.x += p.vx * h;
      p.y += p.vy * h;
      this.tableHit(p, true);
      for (const e of this.enemies) this.collidePuck(e);
      this.reap();
    }
    for (const b of this.mates) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      this.tableHit(b, false);
      for (const e of this.enemies) this.mateHit(b, e);
      this.reap();
    }
    // 球どうし（マルチボール）
    const all: Body[] = this.ballFree ? [p, ...this.mates] : [...this.mates];
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) ballBall(all[i], all[j]);
  }

  /** 台のもの（壁・スリングショット・バンパー・フリッパー）との当たり */
  private tableHit(b: Body, main: boolean): void {
    for (const s of this.segs) {
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
      const out = Math.max(this.zone ? 1250 : 980, -vn * 0.7);
      b.vx += (out - vn) * nx;
      b.vy += (out - vn) * ny;
      bp.flash = 0.16;
      this.show('radial', 0.35, '#ff6ad5', bp.x, bp.y);
      this.gimmick(main, bp.x + nx * bp.r, bp.y + ny * bp.r, 0.08, 'bumper');
    }
    for (const f of this.flippers) this.flipperHit(b, f, main);
  }

  private flipperHit(b: Body, f: Flipper, main: boolean): void {
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
      // 打ち返した：狙いのスキルの分だけ、敵の方へ向きを曲げる
      this.aimBall(b);
      if (main) {
        se('hit', 0.35, 40, 1.6);
        buzz(8);
      }
    }
  }

  /** 打ち返した球の向きを、いちばん近い上の敵の方へ少し曲げる */
  private aimBall(b: Body): void {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.y > b.y - 30) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y) - (e.boss ? 200 : 0);
      if (d < bestD) { bestD = d; best = e; }
    }
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

  /** ギミックに当たった：少しの GUM と連鎖 */
  private gimmick(main: boolean, x: number, y: number, share: number, kind: 'bumper' | 'sling' | 'spin' | 'lane'): void {
    const v = enemyGum(this.floor, 0) * share * this.gumMul;
    this.ev.gum(v);
    if (kind !== 'spin') {
      this.bump();
      this.ev.hit?.(this.combo, false, false, undefined);
    }
    if (this.fxBudget-- > 0) {
      this.nums.push({ x, y: y - 8, t: 0, text: `+${fmtSmall(v)}`, color: '#ffd23f', size: kind === 'spin' ? 11 : 14 });
      const col = kind === 'bumper' ? '#ff6ad5' : kind === 'sling' ? '#6dffb0' : '#ffd23f';
      for (let i = 0; i < (kind === 'spin' ? 1 : 6); i += 1) this.spark(x, y, col, 320, 2);
    }
    if (kind === 'bumper') { blip(520 + Math.min(this.combo, 24) * 30, 0.07, 'square', 0.06, 1.6); this.quake = Math.max(this.quake, main ? 3 : 1); }
    else if (kind === 'sling') blip(300, 0.06, 'sawtooth', 0.05, 1.8);
    else if (kind === 'spin') blip(1400 + rand(-60, 60), 0.02, 'square', 0.025, 1);
  }

  /** 台の決まった場所を通ったか（レーン・スピナー・ループ・ホール・ワープ・アウトレーン・落ちた） */
  private sensors(dt: number): void {
    const p = this.puck;
    this.saucer.cool -= dt;
    this.warpIn.cool -= dt;
    if (!this.kickback.lit) {
      this.kickback.t -= dt;
      if (this.kickback.t <= 0) { this.kickback.lit = true; this.kickback.flash = 0.6; }
    }
    for (const b of [...(this.ballFree ? [p] : []), ...this.mates]) {
      const main = b === p;
      // ワイヤーのランプの入口（本物の球が勢いよく上がってきたら乗る）
      if (main && Math.abs(b.x - RAMP_PATH[0][0]) < 20 && Math.abs(b.y - RAMP_PATH[0][1]) < 14 && b.vy < -350) {
        this.onRamp = { s: 0 };
        se('buff', 0.35, 0, 1.8);
        this.show('chase', 0.9, '#ffd23f', b.x, b.y);
        continue;
      }
      // ゴーストスター：触ると分身球
      if (this.star.on && Math.hypot(b.x - this.star.x, b.y - this.star.y) < b.r + 14) this.takeStar(b);
      // インレーンの星
      if (b.y > 500 && b.y < 560) {
        if (b.x > 44 && b.x < 92 && this.inlane[0] <= 0) { this.inlane[0] = 0.6; this.gimmick(main, b.x, b.y, 0.05, 'lane'); }
        if (b.x > 268 && b.x < 316 && this.inlane[1] <= 0) { this.inlane[1] = 0.6; this.gimmick(main, b.x, b.y, 0.05, 'lane'); }
      }
      // ロールオーバーレーン
      for (const l of this.lanes) {
        if (!l.lit && Math.abs(b.x - l.x) < 14 && b.y > 58 && b.y < 94) {
          l.lit = true;
          l.flash = 0.4;
          this.gimmick(main, l.x, 76, 0.2, 'lane');
          if (this.lanes.every((x) => x.lit)) this.lanesDone();
        }
      }
      // ワープ：入ると上から出てくる
      if (this.warpIn.cool <= 0 && Math.hypot(b.x - this.warpIn.x, b.y - this.warpIn.y) < this.warpIn.r) {
        this.warpIn.cool = 0.8;
        this.rings.push({ x: this.warpIn.x, y: this.warpIn.y, t: 0, life: 0.4, r0: 40, r1: 4, color: '#c08bff' });
        b.x = this.warpOut.x + rand(-20, 20);
        b.y = this.warpOut.y;
        b.vx = rand(-180, 180);
        b.vy = 260;
        this.rings.push({ x: b.x, y: b.y, t: 0, life: 0.4, r0: 4, r1: 40, color: '#c08bff' });
        blip(900, 0.18, 'sine', 0.07, 0.4);
        if (main) this.say('WARP!', 1);
      }
      // キャプチャーホール（本物の球だけ）
      if (main && this.saucer.cool <= 0 && Math.hypot(b.x - this.saucer.x, b.y - this.saucer.y) < this.saucer.r && Math.hypot(b.vx, b.vy) < 1400) {
        this.captureSaucer();
      }
      // アウトレーン（左）：キックバックが点いていれば打ち返す
      if (b.x < 40 && b.y > 590 && b.vy > 0 && this.kickback.lit) {
        b.vy = -1750;
        b.vx = 60;
        this.kickback.lit = false;
        this.kickback.t = KICKBACK_TIME;
        this.kickback.flash = 0.5;
        se('blast', 0.4, 0, 1.5);
        this.quake = Math.max(this.quake, 6);
        if (main) this.say('KICKBACK!', 1);
      }
    }
    // スピナー・ループ（本物の球が左右のループの線 y=300 を横切ったか）
    this.inlane = this.inlane.map((v) => Math.max(0, v - dt));
    if (this.ballFree) {
      const crossed = (this.prevY - this.spinner.y) * (p.y - this.spinner.y) <= 0 && this.prevY !== p.y;
      if (crossed && p.x < 44) {
        this.spinner.speed += Math.abs(p.vy) / 40;
        this.loopEnter(-1, p.vy < 0);
      }
      if (crossed && p.x > 316) this.loopEnter(1, p.vy < 0);
    }
    // スピナーが回っている間、少しずつ GUM
    if (this.spinner.speed > 0.5) {
      const before = Math.floor(this.spinner.angle / Math.PI);
      this.spinner.angle += this.spinner.speed * dt;
      this.spinner.speed *= Math.exp(-1.6 * dt);
      if (Math.floor(this.spinner.angle / Math.PI) !== before) this.gimmick(true, this.spinner.x, this.spinner.y, 0.02, 'spin');
    }
    // 落ちた
    for (const b of [...this.mates]) {
      const gone = b.y > TABLE_H + 40 || (b.ghost !== undefined && this.time > b.ghost);
      if (!gone) continue;
      if (b.ghost !== undefined && b.y < TABLE_H) for (let i = 0; i < 8; i += 1) this.spark(b.x, b.y, '#bfe9ff', 200, 2);
      this.mates.splice(this.mates.indexOf(b as Mate), 1);
    }
    if (this.ballFree && p.y > TABLE_H + 30) this.drain();
  }

  private loopEnter(side: -1 | 1, up: boolean): void {
    if (up) { this.loopFrom = { side, t: this.time }; return; }
    // 反対側から下りてきた：ループ成功
    const from = this.loopFrom;
    if (from && from.side !== side && this.time - from.t < LOOP_TIME) {
      this.loopFrom = null;
      this.loops += 1;
      const jackpot = this.mates.some((b) => b.ghost === undefined);
      const p = this.puck;
      this.gimmick(true, p.x, p.y, jackpot ? 6 : 1.2, 'lane');
      this.say(jackpot ? 'JACKPOT!' : 'LOOP!', jackpot ? 3 : 2, jackpot ? 'マルチボール中のループ' : '左右の道をひと回り');
      this.show(jackpot ? 'strobe' : 'chase', jackpot ? 1.2 : 0.8, '#3fd0ff', p.x, p.y);
      se('buff', 0.6, 0, 1.3);
    }
  }

  private lanesDone(): void {
    this.pinMul = Math.min(8, this.pinMul + 1);
    this.save.pinBestMul = Math.max(this.save.pinBestMul, this.pinMul);
    for (const l of this.lanes) { l.lit = false; l.flash = 0.8; }
    this.say(`GUM ×${this.pinMul}`, this.pinMul >= 4 ? 3 : 2, 'G・U・M を全部点けた');
    this.show('chase', 1, '#ffd23f');
    se('win', 0.4, 0, 1.2);
  }

  private captureSaucer(): void {
    this.park('saucer');
    this.saucer.flash = 0.5;
    this.saucer.locks += 1;
    blip(240, 0.2, 'sine', 0.08, 0.5);
    if (this.saucer.locks >= 3) {
      this.saucer.locks = 0;
      this.multiball();
    } else {
      this.say(`LOCK ${this.saucer.locks}`, 1, `あと ${3 - this.saucer.locks} 回でマルチボール`);
      this.show('radial', 0.6, '#ff8f2e', this.saucer.x, this.saucer.y);
    }
  }

  /** 自動で狙い撃ち：いちばん HP の多い的（ボスがいればボス）へ */
  private ejectSaucer(): void {
    const p = this.puck;
    const alive = this.enemies.filter((e) => e.hp > 0);
    const t = alive.find((e) => e.boss) ?? alive.sort((a, b) => b.hp - a.hp)[0];
    const [dx, dy] = t ? [t.x - p.x, t.y - p.y] : [-0.4, -1];
    const l = Math.hypot(dx, dy) || 1;
    p.vx = (dx / l) * 1700;
    p.vy = (dy / l) * 1700;
    this.parked = null;
    this.saucer.cool = 1;
    this.launchId += 1;
    this.greenUntil = this.time + this.st.greenTime;
    this.rings.push({ x: p.x, y: p.y, t: 0, life: 0.3, r0: p.r, r1: p.r * 4, color: ELEM_COLOR.green });
    se('blast', 0.35, 0, 1.6);
  }

  /** マルチボール：仲間のヒーローが球になって出てくる */
  private multiball(): void {
    this.multiballs += 1;
    const n = Math.min(6, 2 + this.st.mates);
    const owned = this.save.heroes.filter((id) => id !== this.save.hero);
    for (let i = 0; i < n; i += 1) {
      const hero = heroById(owned.length ? pick(owned) : this.save.hero);
      const a = -Math.PI / 2 + rand(-0.9, 0.9);
      this.mates.push({ x: this.saucer.x, y: this.saucer.y, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500, r: clamp(this.radius * 0.85, 9, 14), m: 1, hero, spin: 0 });
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
    if (this.time < this.ballSaveUntil) {
      // ボールセーブ：下から打ち上げて戻す
      this.ballSaveUntil = 0;
      p.x = 180;
      p.y = TABLE_H - 40;
      p.vx = rand(-120, 120);
      p.vy = -1900;
      this.say('BALL SAVE!', 1);
      se('buff', 0.5, 0, 1.4);
      return;
    }
    const idx = this.mates.findIndex((b) => b.ghost === undefined);
    const mate = idx >= 0 ? this.mates.splice(idx, 1)[0] : undefined;
    if (mate) {
      // マルチボール中は、残っている球を本物にする
      p.x = mate.x; p.y = mate.y; p.vx = mate.vx; p.vy = mate.vy;
      return;
    }
    this.drains += 1;
    this.pinMul = 1;
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
      const w = 0.7;
      e.x = 180 + Math.sin(this.time * w) * 70;
      e.vx = Math.cos(this.time * w) * 70 * w;
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
    const at = this.rampAt(PinballWorld.RAMP_LEN);
    this.onRamp = null;
    p.x = at.x;
    p.y = at.y;
    p.vx = 0;
    p.vy = 320;
    this.ramps += 1;
    this.rampCombo = this.time - this.rampLastT < RAMP_COMBO ? this.rampCombo + 1 : 1;
    this.rampLastT = this.time;
    const jackpot = this.mates.some((b) => b.ghost === undefined);
    const share = jackpot ? 8 : 1 + this.rampCombo * 0.5;
    this.gimmick(true, p.x, p.y, share, 'lane');
    if (jackpot) this.say('SUPER JACKPOT!', 3, 'マルチボール中のランプ');
    else if (this.rampCombo >= 2) this.say(`RAMP ×${this.rampCombo}`, this.rampCombo >= 3 ? 3 : 2, '続けて通すほど GUM');
    else this.say('RAMP!', 1, 'ワイヤーをひと回り');
    this.show(jackpot ? 'strobe' : 'chase', 1, '#ffd23f', p.x, p.y);
    se('blast', 0.3, 0, 1.7);
  }

  /** ブラックホール：ときどき開いて、近くの球を吸いこみ、ものすごい速さで撃ち出す */
  private stepHole(dt: number): void {
    const h = this.hole;
    h.spin += dt * (h.on ? 5 : 1);
    if (!h.on) {
      h.next -= dt;
      if (h.next <= 0 && this.phase === 'play') {
        const spots = HOLE_SPOTS.filter(([, y]) => !(this.bossAlive && y < 200));
        [h.x, h.y] = pick(spots.length ? spots : HOLE_SPOTS);
        h.on = true;
        h.t = HOLE_OPEN;
        this.say('BLACK HOLE!', 2, '吸いこまれると超高速で撃ち出される');
        this.show('radial', 0.8, '#c08bff', h.x, h.y);
        blip(80, 0.6, 'sawtooth', 0.08, 0.5);
      }
      return;
    }
    if (h.held < 0) h.t -= dt;
    if (h.t <= 0 && h.held < 0) { h.on = false; h.next = HOLE_EVERY; return; }
    // 吸いこむ（分身・仲間の球も）
    const pull = (b: Body, main: boolean) => {
      const dx = h.x - b.x;
      const dy = h.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > HOLE_PULL) return;
      const k = 2600 * (1 - d / HOLE_PULL);
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
    const p = this.puck;
    const h = this.hole;
    h.held = -1;
    h.on = false;
    h.next = HOLE_EVERY;
    const alive = this.enemies.filter((e) => e.hp > 0);
    const t = alive.find((e) => e.boss) ?? pick(alive.length ? alive : [null]);
    const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : -Math.PI / 2 + rand(-0.6, 0.6);
    p.vx = Math.cos(a) * 2500;
    p.vy = Math.sin(a) * 2500;
    this.launchId += 1;
    this.greenUntil = this.time + this.st.greenTime + 0.6;
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
      if (st.t <= 0) { st.on = false; st.next = STAR_EVERY; }
      return;
    }
    st.next -= dt;
    if (st.next <= 0 && this.phase === 'play') {
      [st.x, st.y] = pick(STAR_SPOTS);
      st.on = true;
      st.t = 8;
      this.rings.push({ x: st.x, y: st.y, t: 0, life: 0.5, r0: 40, r1: 6, color: '#bfe9ff' });
    }
  }

  private takeStar(b: Body): void {
    const st = this.star;
    st.on = false;
    st.next = STAR_EVERY;
    const sp = Math.max(1200, Math.hypot(b.vx, b.vy));
    const base = Math.atan2(b.vy, b.vx);
    for (let i = 0; i < GHOSTS; i += 1) {
      const a = base + (i - (GHOSTS - 1) / 2) * 0.7;
      this.mates.push({ x: st.x, y: st.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: clamp(this.radius * 0.9, 9, 13), m: 1, hero: this.hero, spin: 0, ghost: this.time + GHOST_TIME });
    }
    this.say('GHOST BALL!', 2, `分身が ${GHOST_TIME} 秒あばれる`);
    this.show('radial', 0.7, '#bfe9ff', st.x, st.y);
    se('buff', 0.5, 0, 1.6);
  }

  private stepLights(dt: number): void {
    for (const s of this.segs) s.flash = Math.max(0, s.flash - dt);
    for (const b of this.bumpers) b.flash = Math.max(0, b.flash - dt);
    for (const l of this.lanes) l.flash = Math.max(0, l.flash - dt);
    this.saucer.flash = Math.max(0, this.saucer.flash - dt);
    this.kickback.flash = Math.max(0, this.kickback.flash - dt);
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
