import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld, TABLE_H } from '../src/game/pinball';

function make(ev: Partial<Record<string, (...a: never[]) => void>> = {}): PinballWorld {
  const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
  const w = new PinballWorld(freshSave(cat.heroes[0].id), { ...noop, ...ev } as never);
  w.startRun(1);
  return w;
}
const launch = (w: PinballWorld, px: number, py: number) => { w.holdStart(); w.holdPull(px, py); w.holdEnd(); };

describe('ピンボール', () => {
  it('打ち出すまで球は止まっていて、引っぱって離すと飛ぶ', () => {
    const w = make();
    for (let i = 0; i < 30; i += 1) w.step(1 / 60);
    expect(w.parked).toBe('plunger');
    const y0 = w.puck.y;
    launch(w, 0, MAX_PULL);
    expect(w.parked).toBe(null);
    for (let i = 0; i < 3; i += 1) w.step(1 / 60);
    expect(w.puck.y).toBeLessThan(y0 - 50);
  });
  it('飛んでいる間は引っぱれない（打ち出したあとは傾き・振りで干渉する）', () => {
    const w = make();
    launch(w, 0, MAX_PULL);
    w.step(1 / 60);
    expect(w.canHold).toBe(false);
    w.holdStart();
    expect(w.hold.active).toBe(false);
  });
  it('坂なので、球は下へ落ちていく。傾けると少し曲がる', () => {
    const a = make();
    const b = make();
    for (const w of [a, b]) { w.parked = null; w.puck.x = 180; w.puck.y = 400; w.enemies = []; w.bossSpawned = true; }
    b.tilt = [0.45, 0];
    for (let i = 0; i < 20; i += 1) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.puck.vy).toBeGreaterThan(100);
    expect(b.puck.x).toBeGreaterThan(a.puck.x + 5);
    expect(b.puck.vy).toBeGreaterThan(100); // 坂の重さには勝たない
  });
  it('どう打っても台の外へ出ない（落ちる穴を除く）', () => {
    for (let k = 0; k < 24; k += 1) {
      const w = make();
      w.runLeft = 999;
      const ang = (k / 24) * Math.PI * 2;
      launch(w, Math.cos(ang) * MAX_PULL, Math.sin(ang) * MAX_PULL);
      for (let i = 0; i < 60 * 20; i += 1) {
        w.tilt = [Math.sin(i / 50) * 0.4, 0];
        if (i % 90 === 0) w.shake(Math.cos(i), Math.sin(i), 20, 12);
        w.step(1 / 60);
        if (w.parked === 'plunger' && i % 120 === 0) launch(w, Math.cos(ang + i) * MAX_PULL, MAX_PULL);
        const p = w.puck;
        expect(p.x).toBeGreaterThan(-2);
        expect(p.x).toBeLessThan(362);
        expect(p.y).toBeGreaterThan(-2);
        for (const m of w.mates) { expect(m.x).toBeGreaterThan(-2); expect(m.x).toBeLessThan(362); }
      }
    }
  });
  it('自動のフリッパーが、落ちてきた球を打ち返す', () => {
    const w = make();
    w.parked = null;
    w.puck.x = 130;
    w.puck.y = 480;
    w.puck.vx = 0;
    w.puck.vy = 200;
    let minVy = 0;
    for (let i = 0; i < 60; i += 1) { w.step(1 / 60); minVy = Math.min(minVy, w.puck.vy); }
    expect(minVy).toBeLessThan(-600);
  });
  it('真ん中の穴に落ちると打ち出し待ちに戻り、倍率も戻る。打ち出してすぐならボールセーブ', () => {
    const w = make();
    w.pinMul = 3;
    w.parked = null;
    w.puck.x = 180; w.puck.y = TABLE_H + 50; w.puck.vy = 300;
    w.step(1 / 60);
    expect(w.parked).toBe('plunger');
    expect(w.pinMul).toBe(1);
    launch(w, 0, MAX_PULL);
    w.puck.x = 180; w.puck.y = TABLE_H + 50; w.puck.vy = 300;
    w.step(1 / 60);
    expect(w.parked).toBe(null); // 戻された
    expect(w.puck.vy).toBeLessThan(0);
  });
  it('バンパーに当たると強くはじかれ、GUM と連鎖が増える', () => {
    let gum = 0;
    const w = make({ gum: (v: number) => { gum += v; } });
    w.parked = null;
    w.enemies = []; w.bossSpawned = true;
    w.puck.x = 132; w.puck.y = 150; w.puck.vx = 0; w.puck.vy = 300;
    let fastest = 0;
    for (let i = 0; i < 10; i += 1) { w.step(1 / 60); fastest = Math.max(fastest, Math.hypot(w.puck.vx, w.puck.vy)); }
    expect(gum).toBeGreaterThan(0);
    expect(w.combo).toBeGreaterThan(0);
    expect(fastest).toBeGreaterThan(900);
  });
  it('上のレーンを 3 つ通ると GUM の倍率が上がる', () => {
    const w = make();
    w.parked = null;
    for (const l of w.lanes) { w.puck.x = l.x; w.puck.y = 76; w.puck.vx = 0; w.puck.vy = 0; w.step(1 / 120); }
    expect(w.pinMul).toBe(2);
    expect(w.lanes.every((l) => !l.lit)).toBe(true);
  });
  it('ホールに 3 回入るとマルチボール（仲間のヒーローが球になる）', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    for (let k = 0; k < 3; k += 1) {
      w.parked = null;
      w.onRamp = null;
      w.freeze = 0; // 当たった瞬間の止まり（ヒットストップ）をはさまない
      w.saucer.cool = 0;
      w.puck.x = w.saucer.x; w.puck.y = w.saucer.y; w.puck.vx = 0; w.puck.vy = 10;
      w.step(1 / 60);
      if (k < 2) { expect(w.parked).toBe('saucer'); for (let i = 0; i < 100; i += 1) w.step(1 / 60); }
    }
    expect(texts).toContain('MULTIBALL!');
    expect(w.mates.length).toBeGreaterThanOrEqual(2);
    expect(w.parked).toBe(null);
  });
  it('左のアウトレーンに落ちても、キックバックが 1 回打ち返す', () => {
    const w = make();
    w.parked = null;
    w.puck.x = 22; w.puck.y = 600; w.puck.vx = 0; w.puck.vy = 500;
    w.step(1 / 60);
    expect(w.puck.vy).toBeLessThan(-1000);
    expect(w.kickback.lit).toBe(false);
  });
  it('左のループを上がって右から下りてくると LOOP', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    w.parked = null;
    w.puck.x = 22; w.puck.y = 340; w.puck.vx = 0; w.puck.vy = -1900;
    for (let i = 0; i < 90 && !texts.includes('LOOP!'); i += 1) w.step(1 / 60);
    expect(texts).toContain('LOOP!');
  });
  it('的をぜんぶ倒すとボス、ボスを倒すと次の台', () => {
    const w = make();
    for (const e of [...w.enemies]) w.damage(e, 1e12, e.x, e.y, 'hit');
    w.step(1 / 60);
    expect(w.bossAlive).toBe(true);
    const boss = w.enemies.find((e) => e.boss)!;
    w.damage(boss, 1e12, boss.x, boss.y, 'hit');
    expect(w.floor).toBe(2);
    for (let i = 0; i < 80; i += 1) w.step(1 / 60);
    expect(w.phase).toBe('play');
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.save.pinDeepest).toBe(2);
    expect(w.save.floorBest).toEqual({}); // ピラミッドの記録には入らない
  });
  it('30 秒でランが終わる', () => {
    const w = make();
    for (let i = 0; i < 31 * 20; i += 1) w.step(1 / 20);
    expect(w.phase).toBe('over');
  });
  it('ランプの入口に勢いよく入ると、ワイヤーの上を走って左のインレーンへ下りる', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    w.parked = null;
    w.puck.x = 282; w.puck.y = 262; w.puck.vx = 0; w.puck.vy = -1200;
    w.step(1 / 60);
    expect(w.onRamp).not.toBe(null);
    for (let i = 0; i < 120 && w.onRamp; i += 1) w.step(1 / 60);
    expect(w.onRamp).toBe(null);
    expect(texts).toContain('RAMP!');
    expect(w.puck.x).toBeLessThan(100);
    expect(w.puck.y).toBeGreaterThan(400);
  });
  it('ブラックホールが開くと球を吸いこみ、超高速で撃ち出す', () => {
    const w = make();
    w.parked = null;
    w.hole.next = 0;
    w.step(1 / 60);
    expect(w.hole.on).toBe(true);
    w.puck.x = w.hole.x + 30; w.puck.y = w.hole.y; w.puck.vx = 0; w.puck.vy = 0;
    let fastest = 0;
    let green = false;
    for (let i = 0; i < 120; i += 1) {
      w.step(1 / 60);
      const sp = Math.hypot(w.puck.vx, w.puck.vy);
      if (w.ballFree && sp > fastest) { fastest = sp; green = w.attack === 'green'; }
    }
    expect(fastest).toBeGreaterThan(2000);
    expect(green).toBe(true);
  });
  it('ゴーストスターを取ると分身球が出て、しばらくすると消える', () => {
    const w = make();
    w.parked = null;
    w.star.next = 0;
    w.step(1 / 60);
    expect(w.star.on).toBe(true);
    w.puck.x = w.star.x; w.puck.y = w.star.y; w.puck.vx = 0; w.puck.vy = -300;
    w.step(1 / 60);
    expect(w.mates.filter((b) => b.ghost).length).toBe(3);
    for (let i = 0; i < 60 * 8; i += 1) w.step(1 / 60);
    expect(w.mates.filter((b) => b.ghost).length).toBe(0);
  });
  it('20 連鎖で ZONE：坂が軽くなり GUM ×2', () => {
    const w = make();
    const g0 = w.gumMul;
    w.combo = 25;
    w.comboT = w.time + 5;
    w.step(1 / 60);
    expect(w.zone).toBe(true);
    expect(w.gumMul).toBeCloseTo(g0 * 2);
  });
});
