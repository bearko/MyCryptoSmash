import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { MYSTERIES, PinballWorld } from '../src/game/pinball';
import * as T from '../src/game/table';

function make(ev: Partial<Record<string, (...a: never[]) => void>> = {}): PinballWorld {
  const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
  const w = new PinballWorld(freshSave(cat.heroes[0].id), { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999; // 勝手に開かないように
  w.star.next = 999;
  return w;
}
const launch = (w: PinballWorld, px: number, py: number) => { w.holdStart(); w.holdPull(px, py); w.holdEnd(); };
/** 球を置いて動かす（止まり・ランプ・入口などをはずす） */
const put = (w: PinballWorld, x: number, y: number, vx = 0, vy = 0) => {
  w.parked = null;
  w.onRamp = null;
  w.freeze = 0;
  w.puck.x = x; w.puck.y = y; w.puck.vx = vx; w.puck.vy = vy;
};

describe('ピンボール', () => {
  it('台は 4 倍の広さ（幅 2 倍・高さ 2 倍）', () => {
    expect(T.TW).toBe(720);
    expect(T.TH).toBe(1280);
  });
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
    for (const w of [a, b]) { put(w, 360, 980); w.enemies = []; w.bossSpawned = true; }
    b.tilt = [0.45, 0];
    for (let i = 0; i < 20; i += 1) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.puck.vy).toBeGreaterThan(100);
    expect(b.puck.x).toBeGreaterThan(a.puck.x + 5);
    expect(b.puck.vy).toBeGreaterThan(100); // 坂の重さには勝たない
  });
  it('どう打っても台の外へ出ない（落ちる穴を除く）', () => {
    for (let k = 0; k < 16; k += 1) {
      const w = make();
      w.runLeft = 999;
      w.hole.next = 3;
      w.star.next = 2;
      const ang = (k / 16) * Math.PI * 2;
      launch(w, Math.cos(ang) * MAX_PULL, Math.sin(ang) * MAX_PULL);
      for (let i = 0; i < 60 * 20; i += 1) {
        w.tilt = [Math.sin(i / 50) * 0.4, 0];
        if (i % 90 === 0) w.shake(Math.cos(i), Math.sin(i), 20, 12);
        w.step(1 / 60);
        if (w.parked === 'plunger' && i % 120 === 0) launch(w, Math.cos(ang + i) * MAX_PULL, MAX_PULL);
        const p = w.puck;
        expect(p.x).toBeGreaterThan(-2);
        expect(p.x).toBeLessThan(T.TW + 2);
        expect(p.y).toBeGreaterThan(-2);
        for (const m of w.mates) { expect(m.x).toBeGreaterThan(-2); expect(m.x).toBeLessThan(T.TW + 2); }
      }
    }
  });
  it('自動のフリッパーが、落ちてきた球を打ち返す（下と、坂の上のフリッパー）', () => {
    for (const [x, y] of [[300, 1100], [50, 860]]) {
      const w = make();
      put(w, x, y, 0, 200);
      let minVy = 0;
      for (let i = 0; i < 60; i += 1) { w.step(1 / 60); minVy = Math.min(minVy, w.puck.vy); }
      expect(minVy).toBeLessThan(-600);
    }
  });
  it('真ん中の穴に落ちると打ち出し待ちに戻り、倍率も戻る。打ち出してすぐならボールセーブ', () => {
    const w = make();
    w.pinMul = 3;
    put(w, 360, T.DRAIN_Y + 20, 0, 300);
    w.step(1 / 60);
    expect(w.parked).toBe('plunger');
    expect(w.pinMul).toBe(1);
    launch(w, 0, MAX_PULL);
    put(w, 360, T.DRAIN_Y + 20, 0, 300);
    w.ballSaveUntil = w.time + 3;
    w.step(1 / 60);
    expect(w.parked).toBe(null); // 戻された
    expect(w.puck.vy).toBeLessThan(0);
  });
  it('バンパーに当たると強くはじかれ、GUM と連鎖が増える', () => {
    let gum = 0;
    const w = make({ gum: (v: number) => { gum += v; } });
    w.enemies = []; w.bossSpawned = true;
    const b = T.BUMPERS[0];
    put(w, b.x, b.y - 50, 0, 300);
    let fastest = 0;
    for (let i = 0; i < 10; i += 1) { w.step(1 / 60); fastest = Math.max(fastest, Math.hypot(w.puck.vx, w.puck.vy)); }
    expect(gum).toBeGreaterThan(0);
    expect(w.combo).toBeGreaterThan(0);
    expect(fastest).toBeGreaterThan(900);
  });
  it('G・U・M を全部点けると倍率が上がり、まん中にピラミッドの入口が開く。入ると知らせが来る', () => {
    let gates = 0;
    const w = make({ gate: () => { gates += 1; } });
    for (const l of w.lanes) { put(w, l.x, (T.LANE_Y[0] + T.LANE_Y[1]) / 2); w.step(1 / 120); }
    expect(w.pinMul).toBe(2);
    expect(w.gate.open).toBe(true);
    put(w, w.gate.x + 40, w.gate.y, 0, 0);
    for (let i = 0; i < 120 && !gates; i += 1) w.step(1 / 60);
    expect(gates).toBe(1);
    expect(w.pyramids).toBe(1);
    // もどってくると、入口から球が飛び出す
    w.returnFromPyramid();
    expect(w.gate.open).toBe(false);
    expect(w.ballFree).toBe(true);
    expect(w.puck.vy).toBeLessThan(0);
  });
  it('入口が閉じているときは、入口の上を通っても何も起きない', () => {
    let gates = 0;
    const w = make({ gate: () => { gates += 1; } });
    put(w, w.gate.x, w.gate.y);
    for (let i = 0; i < 30; i += 1) w.step(1 / 60);
    expect(gates).toBe(0);
  });
  it('ロックのホールに 3 回入るとマルチボール（仲間のヒーローが球になる）', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    for (let k = 0; k < 3; k += 1) {
      w.saucer.cool = 0;
      put(w, w.saucer.x, w.saucer.y, 0, 10);
      w.step(1 / 60);
      if (k < 2) { expect(w.parked).toBe('saucer'); for (let i = 0; i < 100; i += 1) w.step(1 / 60); }
    }
    expect(texts).toContain('MULTIBALL!');
    expect(w.mates.length).toBeGreaterThanOrEqual(2);
  });
  it('ミステリーのホールに入ると、少し止まってから何かが起きる', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    put(w, w.mystery.x, w.mystery.y, 0, 10);
    w.step(1 / 60);
    expect(w.parked).toBe('mystery');
    for (let i = 0; i < 90; i += 1) w.step(1 / 60);
    expect(w.parked).toBe(null);
    expect(texts[0]).toBe('MYSTERY...');
    expect(texts[1]).toBe(MYSTERIES[w.mystery.pick].text); // ルーレットで決まったことが起きる
  });
  it('アウトレーンに落ちても、キックバックが左右で 1 回ずつ打ち返す', () => {
    for (const [i, x] of [[0, 195], [1, 525]] as const) {
      const w = make();
      put(w, x, T.KICK_Y + 20, 0, 500);
      w.step(1 / 60);
      expect(w.puck.vy).toBeLessThan(-1000);
      expect(w.kickbacks[i].lit).toBe(false);
    }
  });
  it('左のループを上がって右から下りてくると LOOP', () => {
    const texts: string[] = [];
    const w = make({ pin: (t: string) => { texts.push(t); } });
    put(w, 32, 700, 0, -2400);
    for (let i = 0; i < 150 && !texts.includes('LOOP!'); i += 1) w.step(1 / 60);
    expect(texts).toContain('LOOP!');
  });
  it('ランプの入口に勢いよく入ると、ワイヤーの上を走って下りてくる', () => {
    for (const [ri, endX] of [[0, 260], [1, 360]] as const) {
      const texts: string[] = [];
      const w = make({ pin: (t: string) => { texts.push(t); } });
      const [x, y] = T.RAMPS[ri].path[0];
      put(w, x, y + 10, 0, -1200);
      w.step(1 / 60);
      expect(w.onRamp?.i).toBe(ri);
      for (let i = 0; i < 200 && w.onRamp; i += 1) w.step(1 / 60);
      expect(w.onRamp).toBe(null);
      expect(texts).toContain('RAMP!');
      expect(w.puck.x).toBeLessThan(endX);
    }
  });
  it('ブースターを通ると一気に加速する', () => {
    const w = make();
    const b = T.BOOSTERS[1];
    put(w, b.x, b.y + 4, 0, 50);
    w.step(1 / 60);
    expect(Math.hypot(w.puck.vx, w.puck.vy)).toBeGreaterThan(1800);
  });
  it('ブラックホールが開くと球を吸いこみ、超高速で撃ち出す', () => {
    const w = make();
    w.hole.next = 0;
    put(w, 360, 1000);
    w.step(1 / 60);
    expect(w.hole.on).toBe(true);
    put(w, w.hole.x + 30, w.hole.y);
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
    w.star.next = 0;
    put(w, 360, 1000);
    w.step(1 / 60);
    expect(w.star.on).toBe(true);
    put(w, w.star.x, w.star.y, 0, -300);
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
  it('的をぜんぶ倒すとボス、ボスを倒すと次の台', () => {
    const w = make();
    for (const e of [...w.enemies]) w.damage(e, 1e12, e.x, e.y, 'hit');
    w.step(1 / 60);
    expect(w.bossAlive).toBe(true);
    const boss = w.enemies.find((e) => e.boss)!;
    w.damage(boss, 1e12, boss.x, boss.y, 'hit');
    expect(w.floor).toBe(2);
    for (let i = 0; i < 90; i += 1) w.step(1 / 60);
    expect(w.phase).toBe('play');
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.save.pinDeepest).toBe(2);
    expect(w.save.floorBest).toEqual({}); // ピラミッドの記録には入らない
  });
  it('40 秒でプレイが終わる', () => {
    const w = make();
    for (let i = 0; i < 41 * 20; i += 1) w.step(1 / 20);
    expect(w.phase).toBe('over');
  });
});
