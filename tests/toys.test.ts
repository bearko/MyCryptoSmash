import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld } from '../src/game/pinball';
import { CANNON, CASTLE, DISC, FACE, HYPER, TOY_IDS } from '../src/game/toys';

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
  it('どの仕掛けも切れる（切ると動かない）', () => {
    const w = make({}, [...TOY_IDS]);
    expect(Object.values(w.toys).every((v) => !v)).toBe(true);
    put(w, HYPER.mouth[0], HYPER.mouth[1] + 30, 0, -2400);
    run(w, 3);
    expect(w.hyper.ride).toBe(null);
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).not.toBe('cannon');
    w.multiballs = 2;
    w.multiball();
    expect(w.mates.length).toBeLessThan(12);
  });
});
