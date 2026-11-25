// フィールドの中で起きること：マレット（自分のヒーロー）・エネミー・仲間・落とし物の動きと当たり。
// 座標はユニット（フィールドの幅がいつも 360）。画面の大きさは描画側で合わせる。

import { cat, heroById, type EnemyArt, type Ext, type Hero, type ItemKind } from '../core/catalog';
import { blip, buzz, se } from '../core/audio';
import { clamp, pick, rand } from '../core/util';
import { ELEMS, ELEM_COLOR, ELEM_NAME, WEAK_TO, type Elem } from './elements';
import type { Save } from '../core/save';
import {
  FAST_CLEAR, FLOORS, FLOOR_GROW, RUN_TIME, bossGum, bossHp, enemiesOnFloor, enemyGum, enemyHp, floorScale, heroRarityWeights,
  impactFactor, isRaidFloor, stats, type Stats,
} from './economy';

export const FIELD_W = 360;

export interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number }
export interface Enemy extends Body {
  hp: number; maxHp: number; art: EnemyArt; boss: boolean; tier: number;
  flash: number; hitCd: number; mateCd: number; wander: number; tx: number; ty: number; born: number; dash: number;
  squash: number; face: number;
  /** 敵の色（弱点の攻撃が決まる） */
  elem: Elem;
  /** 最後に貫かれたはじきの番号（1 回のはじきで 1 回だけ当たる） */
  pierced: number;
  /** ボスが色を変えるまでの時間 */
  elemT: number;
}
/** 青の範囲攻撃の波 */
export interface Wave { x: number; y: number; t: number; life: number; r1: number; power: number; hit: Set<Enemy> }
export interface Mate extends Body { hero: Hero; spin: number; /** ピンボールの分身球：この時刻に消える */ ghost?: number }
export interface Drop {
  x: number; y: number; vx: number; vy: number; r: number; age: number;
  kind: 'gum' | 'item' | 'hero'; value: number; ext?: Ext; hero?: Hero; dead?: boolean;
}
export interface Sprite { x: number; y: number; t: number; dur: number; sheet: 'hit' | 'blast' | 'buff'; size: number }
export interface Num { x: number; y: number; t: number; text: string; color: string; size: number }
export interface Spark { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }
export interface Ring { x: number; y: number; t: number; life: number; r0: number; r1: number; color: string }

export interface WorldEvents {
  gum(amount: number): void;
  item(ext: Ext): void;
  hero(hero: Hero, isNew: boolean, bonus: number): void;
  boss(name: string, raid: boolean): void;
  /** その階を突破した（t は突破にかかった秒） */
  clear(floor: number, t: number): void;
  kill(): void;
  /** ランが終わった（時間切れ、または 50 階を突破） */
  runEnd?(reason: 'time' | 'allclear'): void;
  /** 当たった（mate 以外）。combo はいまの連鎖数 */
  hit?(combo: number, weak: boolean, smash: boolean, elem: Elem | undefined): void;
  /** 連鎖が切れた */
  comboEnd?(n: number): void;
  /** ピンボールの知らせ（MULTIBALL・JACKPOT など。tier 0〜3 で派手さ） */
  pin?(text: string, tier: number): void;
  /** ピンボール：球がピラミッドへの入口に入った */
  gate?(): void;
}

/** 落とし物（拾わなくても一定時間で自動で手に入る） */
const AUTO_COLLECT = 9;
/** これ以上引くと最大の強さ（ユニット） */
export const MAX_PULL = 130;
/** これより短い引っぱりは取り消し */
export const MIN_PULL = 10;
/** エネミーどうしがこの速さ以上でぶつかると玉突きダメージ */
const CHAIN_SPEED = 650;

// 攻撃の色ごとの決まり
// （時間・間隔・倍率のうちスキルで変わるものは economy.ts の stats にある）
/** 緑（貫通）は、これより遅くなったら終わる */
const GREEN_MIN_SPEED = 600;
/** 青の波のダメージの倍率 */
const BLUE_MUL = 1.6;
/** 赤の吸い寄せ：傾けた向きから何度以内・どこまでの敵を狙うか */
const HOMING_ANGLE = 40;
const HOMING_RANGE = 260;
/** 傾き：この傾き（sin）で最大の速さ（0.45 ≒ 27 度）と、そこまでの曲線の強さ */
export const TILT_FULL = 0.45;
const TILT_POW = 1.5;
/** ボスが色を変える間隔 */
const BOSS_ELEM_TIME = 7;

type Hit = 'hit' | 'smash' | 'mate' | 'wave' | 'chain' | 'press' | 'area' | 'crush';

export class World {
  w = FIELD_W;
  h = 600;
  time = 0;
  puck: Body = { x: 180, y: 400, vx: 0, vy: 0, r: 24, m: 1 };
  hero: Hero;
  enemies: Enemy[] = [];
  mates: Mate[] = [];
  drops: Drop[] = [];
  sprites: Sprite[] = [];
  nums: Num[] = [];
  sparks: Spark[] = [];
  rings: Ring[] = [];
  trail: { x: number; y: number; t: number }[] = [];
  buffs: Partial<Record<ItemKind, number>> = {};
  /** 画面の揺れ */
  quake = 0;
  tilt: [number, number] = [0, 0];
  /** 引っぱって離す（はじく）：px・py は引いた量（ユニット。マレットから見て指を引いた向き） */
  hold = { active: false, px: 0, py: 0 };
  /** ヒットストップ（当たった瞬間だけ止める） */
  freeze = 0;
  /** 連続ヒット */
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  /** 最後にはじいた時刻（演出用） */
  launchedAt = -9;
  /** 攻撃の色の時間：緑（はじいた後）・青（振った後）。どちらでもなければ赤（傾き） */
  greenUntil = -9;
  blueUntil = -9;
  launchId = 0;
  waves: Wave[] = [];
  /** いまの傾きの強さ（0〜1）と向き */
  tiltCurve = 0;
  tiltDir: [number, number] = [0, 0];
  st: Stats;
  bossAlive = false;
  /** その階のボスをもう出したか */
  bossSpawned = false;
  /** いまの階（1〜50） */
  floor = 1;
  /** ランの状態：始まる前・プレイ中・階の切りかえ（縮む演出）・終わり */
  phase: 'idle' | 'play' | 'zoom' | 'over' = 'idle';
  /** ランの残り時間・いまの階に入ってからの時間・切りかえの経過 */
  runLeft = RUN_TIME;
  floorT = 0;
  /** いまの階に入ってから進んだコマ数（重い端末でも「一瞬」を見分けるため） */
  floorSteps = 0;
  zoomT = 0;
  zoomDur = 0.5;
  /** このランで突破した階（突破タイムつき） */
  cleared: { floor: number; t: number }[] = [];
  runStartFloor = 1;
  runGum = 0;
  protected wallSound = 0;
  /** 1 コマで出せる演出（数字・エフェクト）の残り。範囲攻撃でたくさん当たっても重くならないように */
  protected fxBudget = 10;
  /** 端末が重いときは演出を減らす（main.ts がコマの重さを見て切りかえる） */
  lowFx = false;

  constructor(public save: Save, public ev: WorldEvents) {
    this.hero = heroById(save.hero);
    this.st = this.calcStats();
  }

  calcStats(): Stats {
    this.hero = heroById(this.save.hero);
    this.st = stats(this.save.up, this.hero, this.save.exts.length);
    return this.st;
  }

  resize(h: number): void {
    this.h = Math.max(300, h);
    for (const b of [this.puck, ...this.enemies, ...this.mates]) this.keepIn(b, b.r);
  }

  buffOn(k: ItemKind): boolean { return (this.buffs[k] ?? 0) > this.time; }
  /** その色の攻撃力（威力の段・攻撃の強化・赤の怒涛をふくむ） */
  atkOf(c: Elem): number {
    const rush = c === 'red' && this.st.rush ? 1 + Math.min(this.combo, 30) * 0.03 : 1;
    return this.st.atk * this.st.colorMul[c] * (this.buffOn('atk') ? 2 : 1) * rush;
  }
  /** 色のない攻撃（玉突き・衝撃波）は 3 色の平均 */
  get atkAvg(): number {
    const m = this.st.colorMul;
    return this.st.atk * ((m.red + m.blue + m.green) / 3) * (this.buffOn('atk') ? 2 : 1);
  }
  /** いまの階での大きさの倍率（下の階ほど小さい） */
  get z(): number { return floorScale(this.floor); }
  /** 波・磁石・仲間の大きさ：マレットほどは縮まない（下の階でも使えるように） */
  get zs(): number { return this.z ** 0.3; }
  /** 楕円のフィールド（設定で切りかえ） */
  get oval(): boolean { return this.save.settings.fieldShape === 'oval'; }
  /** 攻撃が届く広さ（体のふちから、敵の大きさに合わせて少し先まで） */
  reachOf(e: Enemy): number { return this.save.settings.wideHit ? Math.max(14, e.r * 0.62) : 0; }
  get radius(): number { return this.st.radius * this.z * (this.buffOn('giant') ? 1.55 : 1); }
  get gumMul(): number { return this.st.gumMul * (this.buffOn('gum') ? 2 : 1); }
  get magnet(): number { return (this.buffOn('magnet') ? Math.max(260, this.st.magnet * 3) : this.st.magnet) * this.zs; }
  /** いま引っぱり始めてよいか（ピンボールでは球が止まっているときだけ） */
  get canHold(): boolean { return this.phase === 'play'; }
  /** 1 回のランの長さ（秒） */
  get runTime(): number { return RUN_TIME; }
  /** エネミーに当たったときの跳ね返り（赤はくっつく） */
  protected restOf(attack: Elem): number { return attack === 'red' ? 0 : 0.9; }
  /** いまの攻撃の色 */
  get attack(): Elem {
    if (this.time < this.greenUntil) return 'green';
    if (this.time < this.blueUntil) return 'blue';
    return 'red';
  }

  // ------------------------------------------------------------------ 操作
  holdStart(): void {
    this.hold.active = true;
    this.hold.px = 0;
    this.hold.py = 0;
  }
  /** 指を置いた所からの引っぱり（ユニット）。どこを触っても同じ */
  holdPull(px: number, py: number): void {
    this.hold.px = px;
    this.hold.py = py;
  }
  /** 引っぱりの強さ 0〜1 */
  get pullPower(): number {
    return Math.min(1, Math.hypot(this.hold.px, this.hold.py) / MAX_PULL);
  }
  /** 離した：引いたのと反対の向きへ飛ばす。ほとんど引いていなければ取り消し */
  holdEnd(): void {
    if (!this.hold.active) return;
    this.hold.active = false;
    const len = Math.hypot(this.hold.px, this.hold.py);
    if (len < MIN_PULL) return;
    const k = this.pullPower;
    const sp = this.st.launch * (0.25 + 0.75 * k ** 0.85) * (this.buffOn('rush') ? 1.3 : 1);
    this.puck.vx = (-this.hold.px / len) * sp;
    this.puck.vy = (-this.hold.py / len) * sp;
    this.launchedAt = this.time;
    this.launchId += 1;
    this.greenUntil = this.time + this.st.greenTime;
    this.blueUntil = 0;
    const c = ELEM_COLOR.green;
    this.rings.push({ x: this.puck.x, y: this.puck.y, t: 0, life: 0.3, r0: this.radius, r1: this.radius * (2 + k * 2), color: c });
    for (let i = 0; i < 6 + k * 10; i += 1) this.spark(this.puck.x, this.puck.y, c, 300 + k * 400, 2);
    blip(160 + k * 120, 0.16, 'sawtooth', 0.09, 3.2);
    this.quake = Math.max(this.quake, 3 + k * 5);
    buzz(10 + Math.round(k * 20));
  }
  /** 振り：向き（単位ベクトル）と強さ（m/s²）。押している間は使わない */
  shake(x: number, y: number, power: number, threshold: number): void {
    if (this.hold.active) return;
    const k = clamp(power / threshold, 1, 2.2);
    const v = this.st.shake * (0.75 + 0.25 * k) * (this.buffOn('rush') ? 1.3 : 1);
    const p = this.puck;
    // 振った向きへの速さに入れかえる（向きと逆に動いていても、すぐ振った向きへ飛ぶ）
    const along = p.vx * x + p.vy * y;
    const keep = 0.25;
    p.vx = (p.vx - along * x) * keep + x * (Math.max(0, along) + v);
    p.vy = (p.vy - along * y) * keep + y * (Math.max(0, along) + v);
    this.launchedAt = this.time;
    this.greenUntil = 0;
    this.blueUntil = this.time + this.st.blueTime;
    // 青：広がる波で、範囲の中の敵全員に当たる
    this.waves.push({ x: p.x, y: p.y, t: 0, life: 0.42, r1: this.st.area * this.zs * (0.85 + 0.15 * k), power: 0.85 + 0.15 * k, hit: new Set() });
    // 余震：少し遅れてもう 1 回、小さな波
    if (this.st.aftershock) this.waves.push({ x: p.x, y: p.y, t: -0.3, life: 0.36, r1: this.st.area * this.zs * 0.7, power: 0.6, hit: new Set() });
    for (let i = 0; i < 14; i += 1) this.spark(p.x, p.y, ELEM_COLOR.blue, 600, 2);
    blip(140, 0.18, 'sawtooth', 0.09, 3);
    this.quake = Math.max(this.quake, 5);
    buzz(15);
  }

  // ------------------------------------------------------------------ 1 コマ
  step(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this.fxBudget = this.lowFx ? 4 : 10;
    if (this.phase === 'zoom') {
      // 階の切りかえ：いまのフィールドが縮んで、外に新しい階が広がる。この間は時間が止まる
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
    // ヒットストップ：演出だけ進めて、動きは止める
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
    const rush = this.buffOn('rush') ? 1.35 : 1;
    const maxSp = this.st.maxSpeed * rush;

    this.tiltCurve = 0;
    if (this.hold.active) {
      // 引いている間はマレットにブレーキ（狙いやすく）
      const k = Math.exp(-7 * dt);
      p.vx *= k;
      p.vy *= k;
    } else {
      const [tx, ty] = this.tilt;
      const m = Math.hypot(tx, ty);
      // 傾きの強さ：少し傾けたときはゆっくり、約 27 度で最大（ゆるやかな曲線）
      const curve = m > 0 ? Math.min(1, m / TILT_FULL) ** TILT_POW : 0;
      this.tiltCurve = curve;
      let ax = 0;
      let ay = 0;
      if (m > 0) {
        const ux = tx / m;
        const uy = ty / m;
        this.tiltDir = [ux, uy];
        ax = ux;
        ay = uy;
        // 吸い寄せ：傾けた向きの先にいる敵へ、向きを少し曲げる
        const t = this.homingTarget(ux, uy);
        if (t) {
          const tl = Math.hypot(t.x - p.x, t.y - p.y) || 1;
          const h = this.st.homing;
          ax = ux * (1 - h) + ((t.x - p.x) / tl) * h;
          ay = uy * (1 - h) + ((t.y - p.y) / tl) * h;
          const al = Math.hypot(ax, ay) || 1;
          ax /= al;
          ay /= al;
        }
      }
      if (this.attack === 'red') {
        // 赤（傾き）：傾けた角度で速さが決まる。傾けている間ずっと加速し続けないので、
        // 少し傾ければゆっくり動き、水平に戻せば止まる（画面のまん中で敵を追いかけられる）
        const vt = this.st.tiltSpeed * rush * curve;
        const k = 1 - Math.exp(-this.st.tiltGrip * dt);
        p.vx += (ax * vt - p.vx) * k;
        p.vy += (ay * vt - p.vy) * k;
      } else {
        // 振り・はじきの勢いがある間は、傾きで少しだけ向きを足す
        p.vx += ax * curve * this.st.tiltSpeed * 1.5 * dt;
        p.vy += ay * curve * this.st.tiltSpeed * 1.5 * dt;
        const fr = Math.exp(-0.35 * dt);
        p.vx *= fr;
        p.vy *= fr;
      }
      // 最高速を超えた分（振り・はじき）は少しずつ落とす
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > maxSp) {
        const over = (sp - maxSp) * Math.exp(-1.6 * dt);
        const ns = maxSp + over;
        p.vx *= ns / sp;
        p.vy *= ns / sp;
      }
    }

    // 緑（貫通）ははじいた勢いがあるうちだけ
    if (this.time < this.greenUntil && Math.hypot(p.vx, p.vy) < GREEN_MIN_SPEED) this.greenUntil = 0;

    this.syncMates();
    this.ai(dt);
    this.stepWaves(dt);

    // 速いものほど細かく刻んで、すり抜けを防ぐ
    // （マレットがとても小さいときは、いちばん小さい相手の大きさで刻めば足りる）
    let fastest = Math.hypot(p.vx, p.vy) / Math.max(p.r, 8);
    for (const m of this.mates) fastest = Math.max(fastest, Math.hypot(m.vx, m.vy) / m.r);
    const n = clamp(Math.ceil((fastest * dt) / 0.45), 1, 12);
    const h = dt / n;
    for (let i = 0; i < n; i += 1) this.substep(h);

    this.stepDrops(dt);
    // ふつうのエネミーをぜんぶ倒したらボス
    if (!this.bossSpawned && this.phase === 'play' && !this.enemies.some((e) => !e.boss)) this.spawnBoss();
    this.stepFx(dt);

    this.trail.push({ x: p.x, y: p.y, t: this.time });
    while (this.trail.length && this.time - this.trail[0].t > 0.22) this.trail.shift();
    this.quake = Math.max(0, this.quake - dt * 30);
    this.wallSound = Math.max(0, this.wallSound - dt);
  }

  protected substep(h: number): void {
    const p = this.puck;
    p.x += p.vx * h;
    p.y += p.vy * h;
    // 傾き（赤）で動いている間は壁でもほとんど跳ねない（壁ぎわの敵を追いやすく）
    const hitWall = this.wall(p, this.attack === 'red' ? 0.3 : 0.86, true);
    // 跳弾：緑のまま壁で跳ねたら、同じ敵をもう一度貫ける
    if (hitWall > 0 && this.st.ricochet && this.attack === 'green') this.launchId += 1;
    for (const e of this.enemies) {
      e.x += e.vx * h;
      e.y += e.vy * h;
      this.wall(e, 0.7, false);
    }
    for (const m of this.mates) {
      m.x += m.vx * h;
      m.y += m.vy * h;
      this.wall(m, 1, false);
    }
    // マレットとエネミー
    for (const e of this.enemies) this.collidePuck(e);
    // エネミーどうしは押し合うだけ
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) this.separate(this.enemies[i], this.enemies[j]);
    }
    for (const m of this.mates) for (const e of this.enemies) this.collideMate(m, e);
    this.reap();
  }

  /** 壁に当たった速さを返す（当たっていなければ 0） */
  protected wall(b: Body, e: number, loud: boolean): number {
    let hit = 0;
    if (this.oval) hit = this.ovalWall(b, e);
    else {
      // フィールドより大きいときは、まん中に置く（画面をおおいつくす）
      if (b.r * 2 >= this.w) { b.x = this.w / 2; b.vx = 0; } else {
        if (b.x < b.r) { b.x = b.r; if (b.vx < 0) { hit = Math.max(hit, -b.vx); b.vx = -b.vx * e; } }
        if (b.x > this.w - b.r) { b.x = this.w - b.r; if (b.vx > 0) { hit = Math.max(hit, b.vx); b.vx = -b.vx * e; } }
      }
      if (b.r * 2 >= this.h) { b.y = this.h / 2; b.vy = 0; } else {
        if (b.y < b.r) { b.y = b.r; if (b.vy < 0) { hit = Math.max(hit, -b.vy); b.vy = -b.vy * e; } }
        if (b.y > this.h - b.r) { b.y = this.h - b.r; if (b.vy > 0) { hit = Math.max(hit, b.vy); b.vy = -b.vy * e; } }
      }
    }
    if (loud && hit > 260 && this.wallSound <= 0) {
      this.wallSound = 0.06;
      blip(90 + Math.min(200, hit / 10), 0.07, 'triangle', clamp(hit / 9000, 0.03, 0.18), 0.6);
      if (hit > 900) { this.quake = Math.max(this.quake, 3); buzz(8); }
      for (let i = 0; i < Math.min(8, hit / 200); i += 1) this.spark(b.x, b.y, '#bfefff', 120, 2);
    }
    return hit;
  }

  /** 楕円のふち：外に出たら内側へもどし、ふちの向きに合わせて跳ね返す。当たった速さを返す */
  protected ovalWall(b: Body, e: number): number {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const a = this.w / 2 - b.r;
    const c = this.h / 2 - b.r;
    // フィールドの幅より大きいとき（巨大化など）は、横はまん中に置き、縦にだけ動ける（四角のときと同じ）
    if (a <= 1 || c <= 1) {
      let hit = 0;
      if (a <= 1) { b.x = cx; b.vx = 0; } else hit = Math.max(hit, this.slide1(b, 'x', cx, a, e));
      if (c <= 1) { b.y = cy; b.vy = 0; } else hit = Math.max(hit, this.slide1(b, 'y', cy, c, e));
      return hit;
    }
    const dx = b.x - cx;
    const dy = b.y - cy;
    const q = (dx / a) ** 2 + (dy / c) ** 2;
    if (q <= 1) return 0;
    const k = 1 / Math.sqrt(q);
    b.x = cx + dx * k;
    b.y = cy + dy * k;
    // ふちの外向き（楕円の法線）
    let nx = (dx * k) / (a * a);
    let ny = (dy * k) / (c * c);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const vn = b.vx * nx + b.vy * ny;
    if (vn <= 0) return 0;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    return vn;
  }

  /** 1 つの向きだけで、まん中から ±half の中に収めて跳ね返す */
  protected slide1(b: Body, axis: 'x' | 'y', mid: number, half: number, e: number): number {
    const v = axis === 'x' ? 'vx' : 'vy';
    if (b[axis] < mid - half) { b[axis] = mid - half; if (b[v] < 0) { const hit = -b[v]; b[v] = -b[v] * e; return hit; } }
    if (b[axis] > mid + half) { b[axis] = mid + half; if (b[v] > 0) { const hit = b[v]; b[v] = -b[v] * e; return hit; } }
    return 0;
  }

  /** フィールドの中に収める（跳ね返りなし） */
  keepIn(o: { x: number; y: number }, r: number): void {
    if (this.oval) {
      const cx = this.w / 2;
      const cy = this.h / 2;
      const a = this.w / 2 - r;
      const c = this.h / 2 - r;
      if (a <= 1 || c <= 1) {
        o.x = a <= 1 ? cx : clamp(o.x, cx - a, cx + a);
        o.y = c <= 1 ? cy : clamp(o.y, cy - c, cy + c);
        return;
      }
      const q = ((o.x - cx) / a) ** 2 + ((o.y - cy) / c) ** 2;
      if (q > 1) { const k = 1 / Math.sqrt(q); o.x = cx + (o.x - cx) * k; o.y = cy + (o.y - cy) * k; }
      return;
    }
    o.x = clamp(o.x, Math.min(r, this.w / 2), Math.max(this.w - r, this.w / 2));
    o.y = clamp(o.y, Math.min(r, this.h / 2), Math.max(this.h - r, this.h / 2));
  }

  /** フィールドの中のでたらめな場所 */
  randomPoint(r: number): [number, number] {
    for (let i = 0; i < 20; i += 1) {
      const x = rand(r, this.w - r);
      const y = rand(r, this.h - r);
      if (!this.oval) return [x, y];
      const q = ((x - this.w / 2) / (this.w / 2 - r)) ** 2 + ((y - this.h / 2) / (this.h / 2 - r)) ** 2;
      if (q <= 1) return [x, y];
    }
    return [this.w / 2, this.h / 2];
  }

  /** 傾けた向き（ux, uy）から HOMING_ANGLE 度以内・HOMING_RANGE 以内でいちばん近い敵 */
  protected homingTarget(ux: number, uy: number): Enemy | null {
    const p = this.puck;
    const cos = Math.cos((HOMING_ANGLE * Math.PI) / 180);
    let best: Enemy | null = null;
    let bestD = HOMING_RANGE;
    for (const e of this.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 1 || d > bestD) continue;
      if ((dx * ux + dy * uy) / d < cos) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  protected collidePuck(e: Enemy): void {
    const p = this.puck;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    // つぶす：敵がまるごとマレットの下に入ったら、一撃で倒れる
    if (e.hp > 0 && d + e.r * 0.8 <= p.r) {
      this.bump();
      this.damage(e, e.hp + 1, e.x, e.y, 'crush', this.attack);
      return;
    }
    const min = p.r + e.r * 0.82;
    // 攻撃は体のふちより少し先まで届く（丸いマレットでも、角にいる敵に当てられるように）
    const reach = this.reachOf(e);
    if (d >= min + reach || d === 0) return;
    const contact = d < min;
    const nx = dx / d;
    const ny = dy / d;
    const attack = this.attack;

    if (attack === 'green') {
      // 緑：はじき返されずに突き抜ける。1 回のはじきで 1 体に 1 回だけ
      if (e.pierced === this.launchId) return;
      e.pierced = this.launchId;
      const speed = Math.hypot(p.vx, p.vy);
      // 敵は線の横へはじき飛ぶ
      const sp = speed || 1;
      const side = (-p.vy / sp) * -nx + (p.vx / sp) * -ny >= 0 ? 1 : -1;
      e.vx += (-p.vy / sp) * side * 520 + (p.vx / sp) * 180;
      e.vy += (p.vx / sp) * side * 520 + (p.vy / sp) * 180;
      const f = impactFactor(speed);
      if (f <= 0) return;
      const smash = speed >= this.st.smashSpeed;
      this.bump();
      this.freeze = Math.max(this.freeze, smash ? 0.045 : 0.02);
      this.damage(e, this.atkOf('green') * f * (smash ? this.st.greenSmash : 1), e.x, e.y, smash ? 'smash' : 'hit', 'green');
      return;
    }

    const vrel = (p.vx - e.vx) * nx + (p.vy - e.vy) * ny;
    if (!contact) {
      // 届く範囲だけ：ぶつからない。近づいているときと、赤で押しつけているときだけ当たる
      if (vrel >= 0 && attack !== 'red') return;
    } else {
      const over = min - d;
      const pm = p.m;
      const tot = pm + e.m;
      p.x += nx * over * (e.m / tot);
      p.y += ny * over * (e.m / tot);
      e.x -= nx * over * (pm / tot);
      e.y -= ny * over * (pm / tot);
    }
    const pm = p.m;
    if (contact && vrel < 0) {
      // 赤は跳ね返らない（くっついて押しこむ）。敵を追いかけながら連続で当てやすく
      const rest = this.restOf(attack);
      const j = (-(1 + rest) * vrel) / (1 / pm + 1 / e.m);
      p.vx += (j / pm) * nx;
      p.vy += (j / pm) * ny;
      e.vx -= (j / e.m) * nx;
      e.vy -= (j / e.m) * ny;
    }
    if (e.hitCd > this.time) return;
    const speed = Math.max(0, -vrel);
    let f = impactFactor(speed);
    let pressing = false;
    if (attack === 'red') {
      // 敵の向きへ傾けて押しつけていれば、遅くても連続で当たる
      const toward = this.tiltDir[0] * -nx + this.tiltDir[1] * -ny;
      const press = toward > 0.3 ? this.st.redPress * this.tiltCurve : 0;
      if (press > f) { f = press; pressing = true; }
    }
    if (f <= 0) return;
    e.hitCd = this.time + (attack === 'red' ? this.st.redInterval : 0.09);
    if (!contact && !pressing) {
      // 離れて当てたときも、敵ははじかれる
      const kick = Math.min(420, speed * 0.35);
      e.vx -= nx * kick;
      e.vy -= ny * kick;
    }
    const smash = speed >= this.st.smashSpeed;
    this.bump();
    if (!pressing) this.freeze = Math.max(this.freeze, smash ? 0.07 : 0.03);
    this.damage(e, this.atkOf(attack) * f * (smash ? 1.5 : 1), p.x - nx * p.r, p.y - ny * p.r, smash ? 'smash' : pressing ? 'press' : 'hit', attack);
  }

  /** 青の波：広がりながら、ふちに触れた敵に 1 回ずつ当たる */
  protected stepWaves(dt: number): void {
    for (const w of this.waves) {
      w.t += dt;
      if (w.t < 0) continue; // 余震の待ち
      const k = Math.min(1, w.t / w.life);
      const r = w.r1 * (1 - (1 - k) ** 3);
      for (const e of this.enemies) {
        if (e.hp <= 0 || w.hit.has(e)) continue;
        const dx = e.x - w.x;
        const dy = e.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d - e.r > r) continue;
        w.hit.add(e);
        e.vx += (dx / d) * this.st.knock;
        e.vy += (dy / d) * this.st.knock;
        this.bump();
        this.damage(e, this.atkOf('blue') * BLUE_MUL * w.power, e.x, e.y, 'area', 'blue');
      }
    }
    this.waves = this.waves.filter((w) => w.t < w.life);
    this.reap();
  }

  protected collideMate(m: Mate, e: Enemy): void {
    const dx = m.x - e.x;
    const dy = m.y - e.y;
    const d = Math.hypot(dx, dy);
    const min = m.r + e.r * 0.8;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    m.x = e.x + nx * min;
    m.y = e.y + ny * min;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= 2 * vn * nx;
      m.vy -= 2 * vn * ny;
      e.vx -= nx * 60;
      e.vy -= ny * 60;
    }
    if (e.mateCd > this.time) return;
    e.mateCd = this.time + 0.22;
    this.damage(e, this.st.mateAtk * (this.buffOn('atk') ? 2 : 1), e.x + nx * e.r * 0.7, e.y + ny * e.r * 0.7, 'mate');
  }

  protected separate(a: Enemy, b: Enemy): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = (a.r + b.r) * 0.78;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const over = (min - d) / 2;
    a.x -= nx * over; a.y -= ny * over;
    b.x += nx * over; b.y += ny * over;
    const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel < 0) {
      const j = (-1.8 * vrel) / (1 / a.m + 1 / b.m);
      a.vx -= (j / a.m) * nx; a.vy -= (j / a.m) * ny;
      b.vx += (j / b.m) * nx; b.vy += (j / b.m) * ny;
      // 飛ばしたエネミーが別のエネミーに当たると、両方にダメージ（玉突き）
      const sp = -vrel;
      if (sp > CHAIN_SPEED && a.hitCd < this.time && b.hitCd < this.time) {
        a.hitCd = b.hitCd = this.time + 0.12;
        const dmg = this.atkAvg * impactFactor(sp) * 0.6;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.bump();
        this.damage(a, dmg, cx, cy, 'chain');
        this.damage(b, dmg, cx, cy, 'chain');
      }
    }
  }

  /** 連続ヒットを数える（1.4 秒あくと切れる） */
  protected bump(): void {
    this.combo += 1;
    this.comboT = this.time + 1.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
  }
  /** 連続ヒット中の GUM の倍率（50 連続で 2 倍まで） */
  get comboMul(): number {
    return 1 + Math.min(this.combo, 50) * this.st.comboStep;
  }

  // ------------------------------------------------------------------ ダメージと撃破
  damage(e: Enemy, dmg: number, x: number, y: number, how: Hit, elem?: Elem): void {
    if (e.hp <= 0) return;
    const mul = elem && WEAK_TO[e.elem] === elem ? this.st.weakMul[elem] : 1;
    dmg *= mul;
    e.hp -= dmg;
    e.flash = 0.12;
    e.squash = how === 'mate' ? 0.15 : 0.35;
    const big = how === 'smash';
    const soft = how === 'mate' || how === 'press';
    const weak = mul > 1;
    if (elem) this.save.usage[elem] = (this.save.usage[elem] ?? 0) + 1;
    if (how !== 'mate') this.ev.hit?.(this.combo, weak, how === 'smash', elem);
    // 演出は 1 コマの上限まで（ダメージそのものはいつも入る）
    const fx = this.fxBudget > 0 || (big && this.fxBudget > -4);
    this.fxBudget -= 1;
    if (fx) {
      const base = big ? '#ffe14d' : how === 'mate' ? '#9fe8ff' : how === 'wave' ? '#6dffb0' : how === 'chain' ? '#ff9a3d' : '#ffffff';
      this.nums.push({
        x: x + rand(-6, 6), y: y - 6, t: 0,
        text: how === 'crush' ? 'CRUSH!' : (weak ? '弱点! ' : '') + (big ? 'SMASH! ' : '') + fmtDmg(dmg),
        color: how === 'crush' ? '#ffd23f' : elem && (weak || how !== 'press') ? ELEM_COLOR[elem] : base,
        size: how === 'crush' ? 20 : (big ? 22 : how === 'mate' || how === 'press' ? 12 : 16) + (weak ? 5 : 0),
      });
      const sparks = this.lowFx ? 0.4 : 1;
      if (weak) {
        for (let i = 0; i < 10 * sparks; i += 1) this.spark(x, y, ELEM_COLOR[elem as Elem], 380, 3);
        blip(1200, 0.07, 'square', 0.05, 1.4);
      }
      if (!soft) {
        this.sprites.push({ x, y, t: 0, dur: 0.42, sheet: 'hit', size: big ? 110 : 76 });
        for (let i = 0; i < (big ? 14 : 6) * sparks; i += 1) this.spark(x, y, big ? '#ffe14d' : '#ffffff', big ? 420 : 240, big ? 3 : 2);
      } else {
        blip(how === 'press' ? 520 : 660, 0.05, 'square', 0.04, 1.3);
        if (how === 'press') this.spark(x, y, ELEM_COLOR.red, 200, 2);
      }
    }
    if (!soft) {
      se('hit', big ? 0.75 : 0.45, 45, big ? 0.85 : rand(0.95, 1.15));
      buzz(big ? [0, 25] : 10);
      this.quake = Math.max(this.quake, big ? 9 : 4);
    }
    if (e.hp <= 0) this.kill(e);
  }

  protected kill(e: Enemy): void {
    const floor = this.floor;
    const total = (e.boss ? bossGum(floor) : enemyGum(floor, e.tier)) * this.gumMul * this.comboMul;
    // 落ちている GUM が多いときは枚数をへらす（合計はおなじ）
    const coins = this.drops.length > 120 ? 1 : e.boss ? 16 : this.drops.length > 50 ? 1 : 3;
    for (let i = 0; i < coins; i += 1) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, e.boss ? 520 : 260);
      this.drops.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 9, age: 0, kind: 'gum', value: total / coins });
    }
    if (e.boss || Math.random() < this.st.dropRate) {
      const ext = pickExt(floor);
      if (ext) this.drops.push({ x: e.x, y: e.y, vx: rand(-90, 90), vy: rand(-160, -60), r: 15, age: 0, kind: 'item', value: 0, ext });
    }
    this.sprites.push({ x: e.x, y: e.y, t: 0, dur: 0.6, sheet: 'blast', size: e.boss ? 260 : 120 });
    se(e.boss ? 'blast' : 'hit', e.boss ? 0.9 : 0.5, 30, e.boss ? 1 : 0.7);
    for (let i = 0; i < (e.boss ? 60 : 16); i += 1) this.spark(e.x, e.y, pick(['#ffd23f', '#ff8f2e', '#ffffff']), e.boss ? 600 : 320, 3);
    this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.4, r0: e.r * 0.5, r1: e.r * 2.2, color: '#ffd23f' });

    if (e.boss) {
      this.quake = 18;
      this.freeze = this.floorT < FAST_CLEAR ? 0 : 0.18;
      buzz([0, 60, 40, 60]);
      // ヒーローはレイドボスなら必ず、ほかのボスはときどき
      if (isRaidFloor(floor) || Math.random() < 0.2) {
        const hero = pickHero(floor);
        this.drops.push({ x: e.x, y: e.y, vx: 0, vy: -40, r: 22, age: 0, kind: 'hero', value: bossGum(floor) * 0.5 * this.gumMul, hero });
      }
      for (const o of this.enemies) if (o !== e && o.hp > 0) { o.hp = 0; this.kill(o); }
      this.bossAlive = false;
      this.floorClear();
    } else {
      this.ev.kill();
    }
  }

  // ------------------------------------------------------------------ ラン（15 秒）と階
  /** ランを始める（start 階から） */
  startRun(start: number): void {
    this.floor = Math.max(1, Math.min(FLOORS, start));
    this.runStartFloor = this.floor;
    this.runLeft = RUN_TIME;
    this.cleared = [];
    this.runGum = 0;
    this.drops = [];
    this.waves = [];
    this.combo = 0;
    this.buffs = {};
    this.puck.x = this.w / 2;
    this.puck.y = this.h * 0.72;
    this.puck.vx = 0;
    this.puck.vy = 0;
    this.save.runs += 1;
    this.phase = 'play';
    this.beginFloor();
  }

  /** 階に入った：エネミーをまとめて出す */
  beginFloor(): void {
    this.floorT = 0;
    this.floorSteps = 0;
    this.freeze = 0;
    this.enemies = [];
    this.bossAlive = false;
    this.bossSpawned = false;
    this.save.deepest = Math.max(this.save.deepest, this.floor);
    const { set, lo, hi } = this.floorArt();
    const n = enemiesOnFloor(this.floor, this.st.extraEnemies);
    // エネミーは縮まない（下の階ほど、マレット以外がみんな大きく見える）
    for (let i = 0; i < n; i += 1) {
      const tier = lo + Math.floor(Math.random() * (hi - lo + 1));
      const e = this.addEnemy(set[tier], enemyHp(this.floor, tier), 21 + tier * 1.2, 0.9 + tier * 0.05, false, tier);
      e.born = this.time - i * 0.02; // 少しずつずらして出てくる
    }
  }

  /** ボスを倒した：次の階へ（いまのフィールドが縮み、まわりに新しい階が広がる） */
  protected floorClear(): void {
    // 3 コマ以内の突破は「一瞬」：端末が重くてコマが長くても、60 コマ/秒として数える
    const t = this.floorSteps <= 3 ? Math.min(this.floorT, this.floorSteps / 60) : this.floorT;
    this.cleared.push({ floor: this.floor, t });
    const best = this.save.floorBest[this.floor];
    if (best === undefined || t < best) this.save.floorBest[this.floor] = t;
    this.ev.clear(this.floor, t);
    if (this.floor >= FLOORS) {
      this.save.allClear = true;
      this.endRun('allclear');
      return;
    }
    // いまの階のものは、新しい階のまん中に一回り小さく収まる
    const cx = this.w / 2;
    const cy = this.h / 2;
    const k = 1 / FLOOR_GROW;
    const shrink = (o: { x: number; y: number }) => { o.x = cx + (o.x - cx) * k; o.y = cy + (o.y - cy) * k; };
    shrink(this.puck);
    for (const m of this.mates) shrink(m);
    for (const d of this.drops) shrink(d);
    for (const f of this.sprites) shrink(f);
    for (const n of this.nums) shrink(n);
    this.floor += 1;
    this.phase = 'zoom';
    this.zoomT = 0;
    // 一瞬で突破した階は、切りかえもすばやく（つぎつぎに縮んでいく）
    this.zoomDur = t < FAST_CLEAR ? 0.16 : 0.5;
  }

  /** ランを終える：落ちている GUM や品はぜんぶ手に入る */
  endRun(reason: 'time' | 'allclear'): void {
    if (this.phase === 'over') return;
    for (const d of this.drops) this.collect(d);
    this.drops = [];
    this.phase = 'over';
    this.hold.active = false;
    this.ev.runEnd?.(reason);
  }

  protected reap(): void {
    if (this.enemies.some((e) => e.hp <= 0)) this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  // ------------------------------------------------------------------ エネミーの動き・出現
  protected ai(dt: number): void {
    const p = this.puck;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.squash = Math.max(0, e.squash - dt * 2.5);
      const fr = Math.exp(-(e.boss ? 1.8 : 1.5) * dt);
      e.vx *= fr;
      e.vy *= fr;
      e.wander -= dt;
      if (e.wander <= 0) {
        e.wander = rand(1.5, 3.5);
        [e.tx, e.ty] = this.randomPoint(e.r);
      }
      const dx = e.tx - e.x;
      const dy = e.ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const acc = e.boss ? 70 : 90;
      e.vx += (dx / d) * acc * dt;
      e.vy += (dy / d) * acc * dt;
      if (Math.abs(e.vx) > 4) e.face = e.vx > 0 ? -1 : 1;
      if (e.boss) {
        // ボスはときどき色を変える（効く攻撃が変わる）
        e.elemT -= dt;
        if (e.elemT <= 0) {
          e.elemT = BOSS_ELEM_TIME;
          e.elem = ELEMS[(ELEMS.indexOf(e.elem) + 1) % ELEMS.length];
          this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.6, r0: e.r * 2.4, r1: e.r * 0.8, color: ELEM_COLOR[e.elem] });
          this.nums.push({ x: e.x, y: e.y - e.r * 1.4, t: 0, text: `${ELEM_NAME[e.elem]}に変わった`, color: ELEM_COLOR[e.elem], size: 15 });
        }
        e.dash -= dt;
        if (e.dash <= 0) {
          e.dash = rand(3, 5);
          const ax = p.x - e.x;
          const ay = p.y - e.y;
          const al = Math.hypot(ax, ay) || 1;
          e.vx += (ax / al) * 520;
          e.vy += (ay / al) * 520;
          this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.5, r0: e.r, r1: e.r * 1.8, color: '#ff4f5e' });
        }
      }
    }
  }

  protected floorArt(): { set: EnemyArt[]; lo: number; hi: number } {
    const s = this.floor - 1;
    const set = cat.enemySets[s % cat.enemySets.length];
    const loop = Math.floor(s / cat.enemySets.length);
    const lo = Math.min(set.length - 1, loop);
    return { set, lo, hi: Math.min(set.length - 1, lo + 1 + (s % cat.enemySets.length >= 5 ? 1 : 0)) };
  }

  /** 10 階ごとはレイドボス、ほかはシャドーヒーロー */
  bossArt(floor = this.floor): EnemyArt {
    if (isRaidFloor(floor)) return cat.raids[Math.min(cat.raids.length - 1, floor / 10 - 1)];
    return cat.shadows[(floor - 1) % cat.shadows.length];
  }

  spawnBoss(): void {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    this.bossAlive = true;
    const raid = isRaidFloor(this.floor);
    const art = this.bossArt();
    const e = this.addEnemy(art, bossHp(this.floor), raid ? 60 : 46, raid ? 8 : 5, true, 5);
    e.dash = 2.5;
    if (this.floorT > FAST_CLEAR) this.quake = 10;
    this.ev.boss(art.name, raid);
  }

  protected addEnemy(art: EnemyArt, hp: number, r: number, m: number, boss: boolean, tier: number): Enemy {
    const p = this.puck;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 12; i += 1) {
      [x, y] = this.randomPoint(r);
      if (Math.hypot(x - p.x, y - p.y) > 130 + r) break;
    }
    const e: Enemy = {
      x, y, vx: 0, vy: 0, r, m, hp, maxHp: hp, art, boss, tier,
      flash: 0, hitCd: 0, mateCd: 0, wander: rand(0.3, 1.5), tx: x, ty: y, born: this.time, dash: 0, squash: 0, face: 1,
      elem: pick(ELEMS), pierced: 0, elemT: BOSS_ELEM_TIME,
    };
    this.enemies.push(e);
    this.rings.push({ x, y, t: 0, life: 0.45, r0: r * 2, r1: r * 0.6, color: boss ? '#ff4f5e' : '#c08bff' });
    return e;
  }

  // ------------------------------------------------------------------ 仲間
  protected syncMates(): void {
    const want = this.st.mates;
    while (this.mates.length < want) {
      const owned = this.save.heroes.filter((id) => id !== this.save.hero);
      const hero = heroById(owned.length ? pick(owned) : pick(cat.heroes.filter((h) => h.rarity === 1)).id);
      const a = rand(0, Math.PI * 2);
      const [mx, my] = this.randomPoint(30);
      this.mates.push({ x: mx, y: my, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 14, m: 1, hero, spin: 0 });
    }
    if (this.mates.length > want) this.mates.length = want;
    for (const m of this.mates) {
      m.r = 14 * this.zs;
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const target = 300;
      m.vx *= target / sp;
      m.vy *= target / sp;
    }
  }

  // ------------------------------------------------------------------ 落とし物
  protected stepDrops(dt: number): void {
    const p = this.puck;
    const mag = this.magnet;
    for (const d of this.drops) {
      d.age += dt;
      const fr = Math.exp(-3 * dt);
      d.vx *= fr;
      d.vy *= fr;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = p.r + d.r;
      const auto = d.age > AUTO_COLLECT;
      if (d.age > 0.35 && (dist < reach + mag || auto)) {
        const pull = auto ? 2400 : 1600 + 3000 * (1 - Math.min(1, dist / (reach + mag)));
        d.vx += (dx / dist) * pull * dt;
        d.vy += (dy / dist) * pull * dt;
      }
      // 仲間も GUM を拾う
      if (d.kind === 'gum' && d.age > 0.35) {
        for (const m of this.mates) if (Math.hypot(m.x - d.x, m.y - d.y) < m.r + d.r) this.collect(d);
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      this.keepIn(d, d.r);
      if (d.age > 0.25 && dist < reach) this.collect(d);
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  protected collect(d: Drop): void {
    if (d.dead) return;
    d.dead = true;
    if (d.kind === 'gum') {
      this.ev.gum(d.value);
      blip(880 + Math.random() * 240, 0.06, 'square', 0.05, 1.5);
      this.spark(d.x, d.y, '#ffd23f', 90, 2);
    } else if (d.kind === 'item' && d.ext) {
      this.useItem(d.ext, d.x, d.y);
    } else if (d.kind === 'hero' && d.hero) {
      const isNew = !this.save.heroes.includes(d.hero.id);
      if (isNew) this.save.heroes.push(d.hero.id);
      const bonus = isNew ? 0 : d.value;
      if (bonus) this.ev.gum(bonus);
      se('chest', 0.7, 0);
      this.ev.hero(d.hero, isNew, bonus);
    }
  }

  protected useItem(ext: Ext, x: number, y: number): void {
    if (!this.save.exts.includes(ext.id)) {
      this.save.exts.push(ext.id);
      this.calcStats();
    }
    se('buff', 0.6, 0);
    this.sprites.push({ x, y, t: 0, dur: 0.6, sheet: 'buff', size: 120 });
    if (ext.kind === 'wave') {
      this.rings.push({ x, y, t: 0, life: 0.6, r0: 10, r1: 420, color: '#6dffb0' });
      this.quake = 12;
      for (const e of [...this.enemies]) this.damage(e, this.atkAvg * 4, e.x, e.y, 'wave');
      this.reap();
    } else {
      this.buffs[ext.kind] = this.time + this.st.buffTime;
    }
    this.ev.item(ext);
  }

  // ------------------------------------------------------------------ 演出
  spark(x: number, y: number, color: string, speed: number, size: number): void {
    if (this.sparks.length > (this.lowFx ? 80 : 220)) return;
    const a = rand(0, Math.PI * 2);
    const s = rand(speed * 0.3, speed);
    this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.25, 0.6), color, size });
  }

  protected stepFx(dt: number): void {
    for (const s of this.sprites) s.t += dt;
    this.sprites = this.sprites.filter((s) => s.t < s.dur);
    if (this.sprites.length > 24) this.sprites.splice(0, this.sprites.length - 24);
    for (const n of this.nums) { n.t += dt; n.y -= dt * 40; }
    this.nums = this.nums.filter((n) => n.t < 0.9);
    if (this.nums.length > 30) this.nums.splice(0, this.nums.length - 30);
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fr = Math.exp(-4 * dt);
      s.vx *= fr;
      s.vy *= fr;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    if (this.rings.length > 30) this.rings.splice(0, this.rings.length - 30);
    if (this.waves.length > 6) this.waves.splice(0, this.waves.length - 6);
  }

}

function fmtDmg(n: number): string {
  if (n < 1000) return String(Math.max(1, Math.round(n)));
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}

/** ステージが進むほど高いレアリティのエクステンションが出やすい */
function pickExt(floor: number): Ext | undefined {
  const maxR = clamp(1 + Math.floor(floor / 8), 1, 5);
  const pool = cat.exts.filter((e) => e.rarity <= maxR);
  return pool.length ? pick(pool) : undefined;
}

export function pickHero(floor: number): Hero {
  const w = heroRarityWeights(Math.ceil(floor / 2));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let rarity = 1;
  for (let i = 1; i < w.length; i += 1) {
    r -= w[i];
    if (r <= 0) { rarity = i; break; }
  }
  const pool = cat.heroes.filter((h) => h.rarity === rarity);
  return pick(pool.length ? pool : cat.heroes);
}
