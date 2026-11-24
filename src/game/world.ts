// フィールドの中で起きること：マレット（自分のヒーロー）・エネミー・仲間・落とし物の動きと当たり。
// 座標はユニット（フィールドの幅がいつも 360）。画面の大きさは描画側で合わせる。

import { cat, heroById, type EnemyArt, type Ext, type Hero, type ItemKind } from '../core/catalog';
import { blip, buzz, se } from '../core/audio';
import { clamp, pick, rand } from '../core/util';
import type { Save } from '../core/save';
import {
  KILLS_TO_BOSS, SMASH_SPEED, bossGum, bossHp, enemyGum, enemyHp, heroRarityWeights, impactFactor, stats, type Stats,
} from './economy';

export const FIELD_W = 360;

export interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number }
export interface Enemy extends Body {
  hp: number; maxHp: number; art: EnemyArt; boss: boolean; tier: number;
  flash: number; hitCd: number; mateCd: number; wander: number; tx: number; ty: number; born: number; dash: number;
  squash: number; face: number;
}
export interface Mate extends Body { hero: Hero; spin: number }
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
  boss(name: string): void;
  clear(stage: number): void;
  kill(): void;
}

/** 落とし物（拾わなくても一定時間で自動で手に入る） */
const AUTO_COLLECT = 9;
const BUFF_TIME = 12;

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
  hold = { active: false, vx: 0, vy: 0, last: 0, x: 0, y: 0 };
  st: Stats;
  bossAlive = false;
  private spawnT = 0;
  private wallSound = 0;

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
    for (const b of [this.puck, ...this.enemies, ...this.mates]) {
      b.x = clamp(b.x, b.r, this.w - b.r);
      b.y = clamp(b.y, b.r, this.h - b.r);
    }
  }

  buffOn(k: ItemKind): boolean { return (this.buffs[k] ?? 0) > this.time; }
  get atk(): number { return this.st.atk * (this.buffOn('atk') ? 2 : 1); }
  get radius(): number { return this.st.radius * (this.buffOn('giant') ? 1.55 : 1); }
  get gumMul(): number { return this.st.gumMul * (this.buffOn('gum') ? 2 : 1); }
  get magnet(): number { return this.buffOn('magnet') ? Math.max(260, this.st.magnet * 3) : this.st.magnet; }

  // ------------------------------------------------------------------ 操作
  holdStart(): void {
    this.hold.active = true;
    this.hold.vx = 0;
    this.hold.vy = 0;
    this.hold.last = this.time;
  }
  /** 指が動いた量（ユニット）と時間（秒） */
  holdMove(dx: number, dy: number, dt: number): void {
    const d = Math.max(0.004, dt);
    const a = 1 - Math.exp(-d / 0.035);
    this.hold.vx += (dx / d - this.hold.vx) * a;
    this.hold.vy += (dy / d - this.hold.vy) * a;
    this.hold.last = this.time;
  }
  holdEnd(): void {
    if (!this.hold.active) return;
    this.hold.active = false;
    this.puck.vx = this.hold.vx * 1.15;
    this.puck.vy = this.hold.vy * 1.15;
    const sp = Math.hypot(this.puck.vx, this.puck.vy);
    const cap = this.st.maxSpeed * 1.8;
    if (sp > cap) { this.puck.vx *= cap / sp; this.puck.vy *= cap / sp; }
    if (sp > 500) { blip(180, 0.12, 'sawtooth', 0.06, 2.4); }
  }
  /** 振り：向き（単位ベクトル）と強さ（m/s²） */
  shake(x: number, y: number, power: number, threshold: number): void {
    if (this.hold.active) return;
    const k = clamp(power / threshold, 1, 2.2);
    const v = this.st.shake * k * (this.buffOn('rush') ? 1.4 : 1);
    this.puck.vx += x * v;
    this.puck.vy += y * v;
    this.rings.push({ x: this.puck.x, y: this.puck.y, t: 0, life: 0.35, r0: this.radius, r1: this.radius * 3, color: '#9fe8ff' });
    blip(140, 0.18, 'sawtooth', 0.08, 3);
    buzz(12);
  }

  // ------------------------------------------------------------------ 1 コマ
  step(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const p = this.puck;
    p.r = this.radius;
    const rush = this.buffOn('rush') ? 1.5 : 1;
    const maxSp = this.st.maxSpeed * rush;

    if (this.hold.active) {
      if (this.time - this.hold.last > 0.05) {
        const k = Math.exp(-dt / 0.03);
        this.hold.vx *= k;
        this.hold.vy *= k;
      }
      let vx = this.hold.vx;
      let vy = this.hold.vy;
      const sp = Math.hypot(vx, vy);
      const cap = maxSp * 1.8;
      if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
      p.vx = vx;
      p.vy = vy;
    } else {
      p.vx += this.tilt[0] * this.st.accel * rush * dt;
      p.vy += this.tilt[1] * this.st.accel * rush * dt;
      const fr = Math.exp(-0.45 * dt);
      p.vx *= fr;
      p.vy *= fr;
      // 最高速を超えた分（振り・はじき）は少しずつ落とす
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > maxSp) {
        const over = (sp - maxSp) * Math.exp(-2.5 * dt);
        const ns = maxSp + over;
        p.vx *= ns / sp;
        p.vy *= ns / sp;
      }
    }

    this.syncMates();
    this.ai(dt);

    // 速いものほど細かく刻んで、すり抜けを防ぐ
    let fastest = Math.hypot(p.vx, p.vy) / p.r;
    for (const m of this.mates) fastest = Math.max(fastest, Math.hypot(m.vx, m.vy) / m.r);
    const n = clamp(Math.ceil((fastest * dt) / 0.45), 1, 12);
    const h = dt / n;
    for (let i = 0; i < n; i += 1) this.substep(h);

    this.stepDrops(dt);
    this.spawn(dt);
    this.stepFx(dt);

    this.trail.push({ x: p.x, y: p.y, t: this.time });
    while (this.trail.length && this.time - this.trail[0].t > 0.22) this.trail.shift();
    this.quake = Math.max(0, this.quake - dt * 30);
    this.wallSound = Math.max(0, this.wallSound - dt);
  }

  private substep(h: number): void {
    const p = this.puck;
    p.x += p.vx * h;
    p.y += p.vy * h;
    this.wall(p, 0.86, true);
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

  private wall(b: Body, e: number, loud: boolean): void {
    let hit = 0;
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) { hit = Math.max(hit, -b.vx); b.vx = -b.vx * e; } }
    if (b.x > this.w - b.r) { b.x = this.w - b.r; if (b.vx > 0) { hit = Math.max(hit, b.vx); b.vx = -b.vx * e; } }
    if (b.y < b.r) { b.y = b.r; if (b.vy < 0) { hit = Math.max(hit, -b.vy); b.vy = -b.vy * e; } }
    if (b.y > this.h - b.r) { b.y = this.h - b.r; if (b.vy > 0) { hit = Math.max(hit, b.vy); b.vy = -b.vy * e; } }
    if (loud && hit > 260 && this.wallSound <= 0) {
      this.wallSound = 0.06;
      blip(90 + Math.min(200, hit / 10), 0.07, 'triangle', clamp(hit / 9000, 0.03, 0.18), 0.6);
      if (hit > 900) { this.quake = Math.max(this.quake, 3); buzz(8); }
      for (let i = 0; i < Math.min(8, hit / 200); i += 1) this.spark(b.x, b.y, '#bfefff', 120, 2);
    }
  }

  private collidePuck(e: Enemy): void {
    const p = this.puck;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const min = p.r + e.r * 0.82;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const over = min - d;
    const pm = this.hold.active ? 6 : p.m; // つかんでいる間は手で押さえている分だけ重い
    const tot = pm + e.m;
    p.x += nx * over * (e.m / tot);
    p.y += ny * over * (e.m / tot);
    e.x -= nx * over * (pm / tot);
    e.y -= ny * over * (pm / tot);
    const vrel = (p.vx - e.vx) * nx + (p.vy - e.vy) * ny;
    if (vrel >= 0) return;
    const j = (-(1 + 0.9) * vrel) / (1 / pm + 1 / e.m);
    p.vx += (j / pm) * nx;
    p.vy += (j / pm) * ny;
    e.vx -= (j / e.m) * nx;
    e.vy -= (j / e.m) * ny;
    const speed = -vrel;
    if (e.hitCd > this.time) return;
    const f = impactFactor(speed);
    if (f <= 0) return;
    e.hitCd = this.time + 0.09;
    const smash = speed >= SMASH_SPEED;
    const dmg = this.atk * f * (smash ? 1.5 : 1);
    this.damage(e, dmg, p.x - nx * p.r, p.y - ny * p.r, smash ? 'smash' : 'hit');
  }

  private collideMate(m: Mate, e: Enemy): void {
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

  private separate(a: Enemy, b: Enemy): void {
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
      const j = (-1.6 * vrel) / (1 / a.m + 1 / b.m);
      a.vx -= (j / a.m) * nx; a.vy -= (j / a.m) * ny;
      b.vx += (j / b.m) * nx; b.vy += (j / b.m) * ny;
    }
  }

  // ------------------------------------------------------------------ ダメージと撃破
  damage(e: Enemy, dmg: number, x: number, y: number, how: 'hit' | 'smash' | 'mate' | 'wave'): void {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 0.12;
    e.squash = how === 'mate' ? 0.15 : 0.35;
    const big = how === 'smash';
    this.nums.push({
      x: x + rand(-6, 6), y: y - 6, t: 0,
      text: (big ? 'SMASH! ' : '') + fmtDmg(dmg),
      color: big ? '#ffe14d' : how === 'mate' ? '#9fe8ff' : how === 'wave' ? '#6dffb0' : '#ffffff',
      size: big ? 22 : how === 'mate' ? 12 : 16,
    });
    if (how !== 'mate') {
      this.sprites.push({ x, y, t: 0, dur: 0.42, sheet: 'hit', size: big ? 110 : 76 });
      se('hit', big ? 0.75 : 0.45, 45, big ? 0.85 : rand(0.95, 1.15));
      buzz(big ? [0, 25] : 10);
      this.quake = Math.max(this.quake, big ? 9 : 4);
      for (let i = 0; i < (big ? 14 : 6); i += 1) this.spark(x, y, big ? '#ffe14d' : '#ffffff', big ? 420 : 240, big ? 3 : 2);
    } else {
      blip(660, 0.05, 'square', 0.04, 1.3);
    }
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy): void {
    const stage = this.save.stage;
    const total = (e.boss ? bossGum(stage) : enemyGum(stage, e.tier)) * this.gumMul;
    const coins = e.boss ? 24 : 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < coins; i += 1) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, e.boss ? 520 : 260);
      this.drops.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 9, age: 0, kind: 'gum', value: total / coins });
    }
    if (e.boss || Math.random() < 0.07) {
      const ext = pickExt(stage);
      if (ext) this.drops.push({ x: e.x, y: e.y, vx: rand(-90, 90), vy: rand(-160, -60), r: 15, age: 0, kind: 'item', value: 0, ext });
    }
    this.sprites.push({ x: e.x, y: e.y, t: 0, dur: 0.6, sheet: 'blast', size: e.boss ? 260 : 120 });
    se(e.boss ? 'blast' : 'hit', e.boss ? 0.9 : 0.5, 30, e.boss ? 1 : 0.7);
    for (let i = 0; i < (e.boss ? 60 : 16); i += 1) this.spark(e.x, e.y, pick(['#ffd23f', '#ff8f2e', '#ffffff']), e.boss ? 600 : 320, 3);
    this.rings.push({ x: e.x, y: e.y, t: 0, life: 0.4, r0: e.r * 0.5, r1: e.r * 2.2, color: '#ffd23f' });

    if (e.boss) {
      this.quake = 18;
      buzz([0, 60, 40, 60]);
      const hero = pickHero(stage);
      this.drops.push({ x: e.x, y: e.y, vx: 0, vy: -40, r: 22, age: 0, kind: 'hero', value: bossGum(stage) * 0.5 * this.gumMul, hero });
      // 残りのエネミーもまとめて倒れる（bossAlive が true のあいだなので、次のボスは呼ばれない）
      for (const o of this.enemies) if (o !== e && o.hp > 0) { o.hp = 0; this.kill(o); }
      this.bossAlive = false;
      this.save.stage += 1;
      this.save.best = Math.max(this.save.best, this.save.stage);
      this.save.kills = 0;
      this.ev.clear(this.save.stage);
    } else {
      this.save.kills += 1;
      this.ev.kill();
      if (!this.bossAlive && this.save.kills >= KILLS_TO_BOSS) this.spawnBoss();
    }
  }

  private reap(): void {
    if (this.enemies.some((e) => e.hp <= 0)) this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  // ------------------------------------------------------------------ エネミーの動き・出現
  private ai(dt: number): void {
    const p = this.puck;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.squash = Math.max(0, e.squash - dt * 2.5);
      const fr = Math.exp(-(e.boss ? 1.6 : 2.2) * dt);
      e.vx *= fr;
      e.vy *= fr;
      e.wander -= dt;
      if (e.wander <= 0) {
        e.wander = rand(1.5, 3.5);
        e.tx = rand(e.r, this.w - e.r);
        e.ty = rand(e.r, this.h - e.r);
      }
      const dx = e.tx - e.x;
      const dy = e.ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const acc = e.boss ? 70 : 90;
      e.vx += (dx / d) * acc * dt;
      e.vy += (dy / d) * acc * dt;
      if (Math.abs(e.vx) > 4) e.face = e.vx > 0 ? -1 : 1;
      if (e.boss) {
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

  private stageArt(): { set: EnemyArt[]; lo: number; hi: number } {
    const s = this.save.stage - 1;
    const set = cat.enemySets[s % cat.enemySets.length];
    const loop = Math.floor(s / cat.enemySets.length);
    const lo = Math.min(set.length - 1, loop);
    return { set, lo, hi: Math.min(set.length - 1, lo + 1 + (s % cat.enemySets.length >= 5 ? 1 : 0)) };
  }

  private spawn(dt: number): void {
    const max = this.bossAlive ? Math.ceil(this.st.maxEnemies / 2) : this.st.maxEnemies;
    const normals = this.enemies.filter((e) => !e.boss).length;
    if (normals >= max) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = this.enemies.length < 2 ? 0.25 : 0.7;
    const { set, lo, hi } = this.stageArt();
    const tier = lo + Math.floor(Math.random() * (hi - lo + 1));
    const hp = enemyHp(this.save.stage, tier);
    this.addEnemy(set[tier], hp, 21 + tier * 1.2, 1.5 + tier * 0.1, false, tier);
  }

  spawnBoss(): void {
    if (this.bossAlive) return;
    this.bossAlive = true;
    const art = cat.bosses[(this.save.stage - 1) % cat.bosses.length];
    const e = this.addEnemy(art, bossHp(this.save.stage), 54, 9, true, 5);
    e.dash = 2.5;
    this.quake = 10;
    this.ev.boss(art.name);
  }

  private addEnemy(art: EnemyArt, hp: number, r: number, m: number, boss: boolean, tier: number): Enemy {
    const p = this.puck;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 12; i += 1) {
      x = rand(r, this.w - r);
      y = rand(r, this.h - r);
      if (Math.hypot(x - p.x, y - p.y) > 130 + r) break;
    }
    const e: Enemy = {
      x, y, vx: 0, vy: 0, r, m, hp, maxHp: hp, art, boss, tier,
      flash: 0, hitCd: 0, mateCd: 0, wander: rand(0.3, 1.5), tx: x, ty: y, born: this.time, dash: 0, squash: 0, face: 1,
    };
    this.enemies.push(e);
    this.rings.push({ x, y, t: 0, life: 0.45, r0: r * 2, r1: r * 0.6, color: boss ? '#ff4f5e' : '#c08bff' });
    return e;
  }

  // ------------------------------------------------------------------ 仲間
  private syncMates(): void {
    const want = this.st.mates;
    while (this.mates.length < want) {
      const owned = this.save.heroes.filter((id) => id !== this.save.hero);
      const hero = heroById(owned.length ? pick(owned) : pick(cat.heroes.filter((h) => h.rarity === 1)).id);
      const a = rand(0, Math.PI * 2);
      this.mates.push({ x: rand(30, this.w - 30), y: rand(30, this.h - 30), vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, r: 14, m: 1, hero, spin: 0 });
    }
    if (this.mates.length > want) this.mates.length = want;
    for (const m of this.mates) {
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const target = 300;
      m.vx *= target / sp;
      m.vy *= target / sp;
    }
  }

  // ------------------------------------------------------------------ 落とし物
  private stepDrops(dt: number): void {
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
      d.x = clamp(d.x + d.vx * dt, d.r, this.w - d.r);
      d.y = clamp(d.y + d.vy * dt, d.r, this.h - d.r);
      if (d.age > 0.25 && dist < reach) this.collect(d);
    }
    this.drops = this.drops.filter((d) => !d.dead);
  }

  private collect(d: Drop): void {
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

  private useItem(ext: Ext, x: number, y: number): void {
    if (!this.save.exts.includes(ext.id)) {
      this.save.exts.push(ext.id);
      this.calcStats();
    }
    se('buff', 0.6, 0);
    this.sprites.push({ x, y, t: 0, dur: 0.6, sheet: 'buff', size: 120 });
    if (ext.kind === 'wave') {
      this.rings.push({ x, y, t: 0, life: 0.6, r0: 10, r1: 420, color: '#6dffb0' });
      this.quake = 12;
      for (const e of [...this.enemies]) this.damage(e, this.atk * 4, e.x, e.y, 'wave');
      this.reap();
    } else {
      this.buffs[ext.kind] = this.time + BUFF_TIME;
    }
    this.ev.item(ext);
  }

  // ------------------------------------------------------------------ 演出
  spark(x: number, y: number, color: string, speed: number, size: number): void {
    if (this.sparks.length > 400) return;
    const a = rand(0, Math.PI * 2);
    const s = rand(speed * 0.3, speed);
    this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.25, 0.6), color, size });
  }

  private stepFx(dt: number): void {
    for (const s of this.sprites) s.t += dt;
    this.sprites = this.sprites.filter((s) => s.t < s.dur);
    for (const n of this.nums) { n.t += dt; n.y -= dt * 40; }
    this.nums = this.nums.filter((n) => n.t < 0.9);
    if (this.nums.length > 40) this.nums.splice(0, this.nums.length - 40);
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
  }

  /** ステージ開始時（クリア後・読み込み時）に場を作り直す */
  resetField(): void {
    this.enemies = [];
    this.bossAlive = false;
    this.spawnT = 0.4;
    if (this.save.kills >= KILLS_TO_BOSS) this.spawnBoss();
  }
}

function fmtDmg(n: number): string {
  if (n < 1000) return String(Math.max(1, Math.round(n)));
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}

/** ステージが進むほど高いレアリティのエクステンションが出やすい */
function pickExt(stage: number): Ext | undefined {
  const maxR = clamp(1 + Math.floor(stage / 4), 1, 5);
  const pool = cat.exts.filter((e) => e.rarity <= maxR);
  return pool.length ? pick(pool) : undefined;
}

export function pickHero(stage: number): Hero {
  const w = heroRarityWeights(stage);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let rarity = 1;
  for (let i = 1; i < w.length; i += 1) {
    r -= w[i];
    if (r <= 0) { rarity = i; break; }
  }
  const pool = cat.heroes.filter((h) => h.rarity === rarity);
  return pick(pool.length ? pool : cat.heroes);
}
