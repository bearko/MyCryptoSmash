import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld } from '../src/game/pinball';
import { CANNON, CAPTIVE, CASTLE, CRANE, DINO, DISC, FACE, HYPER, MAGNET, MINI, MOAI, POPUPS, TOY_ART, TOY_IDS, UFO, tierArt } from '../src/game/toys';
import { existsSync } from 'node:fs';

function make(ev: Record<string, unknown> = {}, off: string[] = []): PinballWorld {
  const s = freshSave(cat.heroes[0].id);
  s.settings.toysOff = off;
  const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999; w.star.next = 999;
  w.face.t = 999; w.hammer.next = 999;
  return w;
}
const put = (w: PinballWorld, x: number, y: number, vx = 0, vy = 0) => {
  w.parked = null; w.onRamp = null; w.freeze = 0;
  w.puck.x = x; w.puck.y = y; w.puck.vx = vx; w.puck.vy = vy;
};
const run = (w: PinballWorld, frames: number) => { for (let i = 0; i < frames; i += 1) { w.freeze = 0; w.runLeft = 999; w.step(1 / 60); } };
const bossUp = (w: PinballWorld) => { w.enemies = []; w.spawnBoss(); };

describe('台の大きな仕掛け', () => {
  it('ハイパーループ：口に勢いよく入ると輪を何周も回り、出てくる', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    put(w, HYPER.mouth[0], HYPER.mouth[1] + 30, 0, -2400);
    run(w, 3);
    expect(w.hyper.ride).not.toBe(null);
    run(w, 120);
    expect(w.hyper.ride).toBe(null);
    expect(texts.some((t) => t.startsWith('HYPERLOOP ×'))).toBe(true);
  });
  it('大砲：入ると止まり、離すと大砲の向きへ撃ち出す', () => {
    const w = make();
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).toBe('cannon');
    run(w, 20);
    w.holdStart();
    w.holdPull(0, MAX_PULL);
    const a = w.cannon.a;
    w.holdEnd();
    expect(w.parked).toBe(null);
    expect(Math.atan2(w.puck.vy, w.puck.vx)).toBeCloseTo(a, 3);
  });
  it('大砲：3 秒たつと自動で撃つ', () => {
    const w = make();
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).toBe('cannon');
    run(w, 60 * 2.8);
    expect(w.parked).toBe('cannon');
    run(w, 60 * 0.4);
    expect(w.parked).not.toBe('cannon');
  });
  it('ボスの城：跳ね橋に 3 回当てると下り、中へ入るとボスに大ダメージ', () => {
    const w = make();
    bossUp(w);
    const boss = w.enemies.find((e) => e.boss)!;
    for (let k = 0; k < 3; k += 1) {
      w.castle.cd = 0;
      put(w, CASTLE.x, CASTLE.bridgeY + 10, 0, -900);
      run(w, 2);
    }
    expect(w.castle.open).toBe(true);
    const hp = boss.hp;
    w.castle.cd = 0;
    put(w, CASTLE.x, CASTLE.bridgeY + 10, 0, -900);
    run(w, 2);
    expect(boss.hp).toBeLessThan(hp - boss.maxHp * 0.3);
  });
  it('しゃべる顔：口が開いているときに入れると BIG MOUTH', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    w.face.open = true; w.face.t = 4;
    put(w, FACE.x, FACE.mouthY + 30, 0, -700);
    run(w, 6);
    expect(texts).toContain('BIG MOUTH!');
  });
  it('回転盤：乗った球の向きがずれる', () => {
    const w = make();
    put(w, DISC.x, DISC.y - 30, 0, 0);
    run(w, 6);
    expect(Math.abs(w.puck.vx)).toBeGreaterThan(5);
  });
  it('ボスの反撃：知らせのあと台を叩き、近くの球が跳ねる', () => {
    const w = make();
    bossUp(w);
    put(w, 360, 700, 0, 0);
    w.hammer.next = 0;
    run(w, 2);
    expect(w.hammer.warn).toBeGreaterThan(0);
    while (w.hammer.warn > 0.03) { w.freeze = 0; w.runLeft = 999; w.step(1 / 60); }
    put(w, w.hammer.x, w.hammer.y, 0, 0);
    let up = false;
    for (let i = 0; i < 4; i += 1) { w.freeze = 0; w.runLeft = 999; w.step(1 / 60); if (w.puck.vy < -500) up = true; }
    expect(up).toBe(true);
  });
  it('13 球マルチボール：3 回目のマルチボールで球が 13 個', () => {
    const w = make();
    w.multiballs = 2;
    w.multiball();
    expect(w.mates.length + 1).toBeGreaterThanOrEqual(13);
  });
  it('つかむ手：受け皿に入るとつかんで運び、傾けた側の賞へ落とす', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    put(w, CRANE.cup[0], CRANE.cup[1] - 20, 0, 200);
    run(w, 3);
    expect(w.carry?.kind).toBe('crane');
    for (let i = 0; i < 60 * 4 && w.carry; i += 1) { w.tilt = [-0.4, 0]; run(w, 1); }
    expect(w.carry).toBe(null);
    expect(texts).toContain('PRIZE: GUM!');
    expect(w.ballFree).toBe(true);
  });
  it('捕まった球：下の口に 3 回強く当てると大当たり', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    for (let k = 0; k < 3; k += 1) {
      put(w, CAPTIVE.x, CAPTIVE.y + 40, 0, -1600);
      run(w, 60);
    }
    expect(texts).toContain('EARTH JACKPOT!');
  });
  it('出たり引っこむ的：出ている的に当てると引っこむ', () => {
    const w = make();
    const [x, y] = POPUPS[2];
    w.pops[2].up = true; w.pops[2].t = 3; w.pops[2].h = 1;
    put(w, x, y + 40, 0, -600);
    run(w, 6);
    expect(w.pops[2].up).toBe(false);
  });
  it('上の小さな台：入口に入ると小さな台で遊び、時間か球が落ちると戻ってくる', () => {
    let gum = 0;
    const w = make({ gum: (v: number) => { gum += v; } });
    put(w, MINI.x, MINI.y + 20, 0, -500);
    run(w, 3);
    expect(w.carry?.kind).toBe('mini');
    let n = 0;
    while (w.carry?.kind === 'mini' && n < 60 * (MINI.time + 1)) { run(w, 1); n += 1; }
    expect(w.carry).toBe(null);
    expect(w.ballFree).toBe(true);
    expect(w.puck.y).toBeGreaterThan(MINI.y);
    expect(gum).toBeGreaterThan(0);
  });
  it('食べて吐く怪物：口に入るとかんで、敵へ向けて吐き出す（緑の貫通）', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    put(w, DINO.mouth[0], DINO.mouth[1] - 10, 0, 100);
    run(w, 3);
    expect(w.carry?.kind).toBe('dino');
    let sp = 0;
    for (let i = 0; i < 120 && w.carry; i += 1) { run(w, 1); sp = Math.hypot(w.puck.vx, w.puck.vy); }
    expect(w.carry).toBe(null);
    expect(texts).toContain('SPIT!');
    expect(sp).toBeGreaterThan(1000);
    expect(w.time < w.greenUntil).toBe(true);
  });
  it('磁石：近くを通った球を回してから投げる', () => {
    const w = make();
    put(w, MAGNET.x, MAGNET.y + 20, 0, -300);
    run(w, 3);
    expect(w.carry?.kind).toBe('magnet');
    run(w, 90);
    expect(w.carry).toBe(null);
    expect(Math.hypot(w.puck.vx, w.puck.vy)).toBeGreaterThan(1200);
  });
  it('ゆれる UFO：3 回当てると開いて、光線で敵にダメージ', () => {
    const w = make();
    for (let k = 0; k < 3; k += 1) {
      w.ufo.cd = 0;
      put(w, w.ufo.x, w.ufo.y + 50, 0, -900);
      run(w, 4);
    }
    expect(w.ufo.open).toBeGreaterThan(0);
    const before = w.enemies.reduce((a, e) => a + e.hp, 0);
    run(w, 60);
    expect(w.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0)).toBeLessThan(before);
  });
  it('倒れる的の壁：4 体のモアイを倒すと金のモアイ、当てると大当たり', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    for (const x of MOAI.xs) { put(w, x, MOAI.y + 40, 0, -700); run(w, 4); }
    expect(w.moai.gold).toBeGreaterThan(0);
    put(w, 360, MOAI.y + 40, 0, -800);
    run(w, 4);
    expect(texts).toContain('MOAI JACKPOT!');
  });
  it('仕掛けの絵（マイクリの絵）がそろっている', () => {
    for (const ids of Object.values(TOY_ART)) for (const id of ids) expect(existsSync(`public/mch/Image/Extensions/${id}.png`)).toBe(true);
    expect(tierArt(TOY_ART.face, 1)).toBe(1063);
    expect(tierArt(TOY_ART.face, 50)).toBe(5063);
  });
  it('新しい仕掛けのまわりでも、球がはまって止まらない・台の外へ出ない', () => {
    let nudges = 0;
    const w = make({ pin: (t: string) => { if (t === 'NUDGE!') nudges += 1; } });
    let out = 0;
    const spots: [number, number][] = [[CAPTIVE.x, CAPTIVE.y + 30], [UFO.x, UFO.y - 40], [360, MOAI.y - 30], ...POPUPS.map(([x, y]) => [x, y - 25] as [number, number])];
    for (const [x, y] of spots) for (const vx of [-300, 0, 300]) {
      put(w, x, y, vx, 0);
      for (let i = 0; i < 60 * 4; i += 1) {
        w.tilt = [Math.sin(i / 30) * 0.3, 0];
        run(w, 1);
        if (w.ballFree && (w.puck.x < -5 || w.puck.x > 725 || w.puck.y < -5)) out += 1;
        if (w.parked === 'plunger') break;
      }
    }
    expect(out).toBe(0);
    expect(nudges).toBeLessThan(3);
  });
  it('どの仕掛けも切れる（切ると動かない）', () => {
    const w = make({}, [...TOY_IDS]);
    expect(Object.values(w.toys).every((v) => !v)).toBe(true);
    put(w, HYPER.mouth[0], HYPER.mouth[1] + 30, 0, -2400);
    run(w, 3);
    expect(w.hyper.ride).toBe(null);
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).not.toBe('cannon');
    put(w, CRANE.cup[0], CRANE.cup[1] - 20, 0, 200);
    run(w, 3);
    expect(w.carry).toBe(null);
    put(w, DINO.mouth[0], DINO.mouth[1] - 10, 0, 100);
    run(w, 3);
    expect(w.carry).toBe(null);
    w.multiballs = 2;
    w.multiball();
    expect(w.mates.length).toBeLessThan(12);
  });
});
