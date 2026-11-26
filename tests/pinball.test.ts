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
  it('本編：G・U・M を全部点けると倍率が上がり、入口は開かず、その場でレーンの大当たり', () => {
    let gates = 0;
    const got: string[] = [];
    const w = make({ gate: () => { gates += 1; }, gum: (_v: number, src: string) => { got.push(src); } });
    for (const l of w.lanes) { put(w, l.x, (T.LANE_Y[0] + T.LANE_Y[1]) / 2); w.step(1 / 120); }
    expect(w.pinMul).toBe(2);
    expect(w.gate.open).toBe(false);
    expect(got).toContain('gumlane');
    put(w, w.gate.x + 40, w.gate.y, 0, 0);
    for (let i = 0; i < 60; i += 1) w.step(1 / 60);
    expect(gates).toBe(0);
  });
  it('エンドレス：G・U・M を全部点けると倍率が上がり、まん中にピラミッドの入口が開く。入ると知らせが来る', () => {
    let gates = 0;
    const w = make({ gate: () => { gates += 1; } });
    w.save.endless = true;
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

  describe('ピンボールのスキル', () => {
    const skilled = (up: Record<string, number>, ev: Partial<Record<string, (...a: never[]) => void>> = {}) => {
      const w = make(ev);
      w.save.up = up;
      w.calcStats();
      return w;
    };
    it('マグナセーブ：傾けていれば、落ちた球を 1 回すくい上げる', () => {
      const texts: string[] = [];
      const w = skilled({ r_magna: 1 }, { pin: (t: string) => { texts.push(t); } });
      w.tilt = [0.4, 0];
      put(w, 360, T.DRAIN_Y + 20, 0, 300);
      w.step(1 / 60);
      expect(texts).toContain('MAGNA SAVE!');
      expect(w.parked).toBe(null);
      // すぐ 2 回目は効かない
      put(w, 360, T.DRAIN_Y + 20, 0, 300);
      w.step(1 / 60);
      expect(w.parked).toBe('plunger');
    });
    it('ゆらしセーブ：フリッパーの下へ落ちかけた球を、振ればはね上げる', () => {
      const w = skilled({ b_save: 1 });
      put(w, 360, 1230, 0, 400);
      w.shake(0, -1, 20, 12);
      expect(w.puck.vy).toBeLessThan(-1500);
    });
    it('バンパー・フレンジー：短い間に 15 回当てると、バンパーの GUM ×3', () => {
      let gum = 0;
      const w = skilled({ r_frenzy: 1 }, { gum: (v: number) => { gum += v; } });
      w.enemies = []; w.bossSpawned = true;
      const b = T.BUMPERS[0];
      for (let i = 0; i < 15; i += 1) { put(w, b.x, b.y - 30, 0, 600); w.step(1 / 60); }
      expect(w.frenzy).toBe(true);
    });
    it('スキルショット：緑の帯の強さで打ち出すと SKILL SHOT、外すと出ない', () => {
      const texts: string[] = [];
      const w = skilled({ g_skill: 1 }, { pin: (t: string) => { texts.push(t); } });
      w.park('plunger');
      const band = w.shotBand!;
      expect(band).not.toBe(null);
      launch(w, 0, ((band[0] + band[1]) / 2) * MAX_PULL);
      expect(texts).toContain('SKILL SHOT!');
      const texts2: string[] = [];
      const w2 = skilled({ g_skill: 1 }, { pin: (t: string) => { texts2.push(t); } });
      w2.park('plunger');
      launch(w2, 0, (w2.shotBand![1] + 0.1) * MAX_PULL);
      expect(texts2).not.toContain('SKILL SHOT!');
    });
    it('貫通フリッパー：打ち返した球が緑になる', () => {
      const w = skilled({ g_pierce: 1 });
      put(w, 300, 1100, 0, 200);
      let green = false;
      for (let i = 0; i < 60; i += 1) { w.step(1 / 60); if (w.puck.vy < -600 && w.attack === 'green') green = true; }
      expect(green).toBe(true);
    });
    it('メガマルチボール：ロック 2 回でマルチボール、球が +2', () => {
      const texts: string[] = [];
      const w = skilled({ y_mega: 1 }, { pin: (t: string) => { texts.push(t); } });
      for (let k = 0; k < 2; k += 1) {
        w.saucer.cool = 0;
        put(w, w.saucer.x, w.saucer.y, 0, 10);
        w.step(1 / 60);
        if (k < 1) for (let i = 0; i < 100; i += 1) w.step(1 / 60);
      }
      expect(texts).toContain('MULTIBALL!');
      expect(w.mates.filter((b) => !b.ghost).length).toBeGreaterThanOrEqual(4);
    });
    it('入口とピラミッドの時間・ボールセーブ・キックバックがスキルでのびる', () => {
      const w = skilled({ y_gate: 2, y_pyramid: 3, y_safe: 2, g_plunger: 2 });
      expect(w.st.gateTime).toBe(24);
      expect(w.st.pyramidTime).toBe(18);
      expect(w.st.ballSave).toBe(8);
      expect(w.st.kickbackTime).toBe(9);
      w.openGate();
      expect(w.gate.t).toBe(24);
    });
  });
  it('通り道のライト：球が通ると灯り、道ぜんぶ灯るとごほうび', () => {
    let gum = 0;
    const w = make({ gum: (v: number) => { gum += v; } });
    const lp = w.lights.find((l) => l.id === 'loopL')!;
    put(w, 32, 790, 0, -2200);
    for (let i = 0; i < 20; i += 1) w.step(1 / 60);
    const litNow = lp.lit.filter((t) => w.time - t < 5).length;
    expect(litNow + (lp.flash > 0 ? lp.pts.length : 0)).toBeGreaterThan(lp.pts.length / 2);
    expect(gum).toBeGreaterThan(0);
  });
  it('打ち出しは右端の細い通路から：強く打つと右の通路を駆け上がって台の上を回る（ループとは数えない）', () => {
    const w = make();
    expect(w.puck.x).toBeGreaterThan(T.SHOOT_X0);
    launch(w, 0, MAX_PULL);
    let top = 9999;
    for (let i = 0; i < 120; i += 1) { w.freeze = 0; w.step(1 / 60); top = Math.min(top, w.puck.y); }
    expect(top).toBeLessThan(80);
    expect(w.loops).toBe(0);
  });
  it('弱く打つと通路を落ちてきて、もう一度打ち出せる', () => {
    const w = make();
    launch(w, 0, MAX_PULL * 0.2);
    let back = false;
    for (let i = 0; i < 180; i += 1) { w.freeze = 0; w.step(1 / 60); if (w.parked === 'plunger') { back = true; break; } }
    expect(back).toBe(true);
    expect(w.drains).toBe(0);
  });
  it('右の通路を下りてきた球は、打ち出しの通路には落ちない（ふたで台の中へ）', () => {
    for (const x of [662, 680, 700, 712]) {
      const w = make();
      put(w, x, 600, 0, 700);
      let inLane = false;
      for (let i = 0; i < 120; i += 1) { w.freeze = 0; w.step(1 / 60); if (w.puck.x > T.SHOOT_X0 && w.puck.y > T.SHOOT_Y0 + 30) inLane = true; }
      expect(inLane).toBe(false);
    }
  });
  it('フリッパーの根元の方へ傾けつづけても、球がはまって止まらない（三角のばねの裏との往復にならない）', () => {
    for (const side of [1, -1]) for (const x of [286, 313, 331]) {
      const w = make();
      w.startRun(10); // ボス台の掟（短いフリッパー）
      w.hole.next = 999; w.star.next = 999;
      put(w, side === 1 ? x : 720 - x, 1150, -150 * side, 0);
      let inBox = 0;
      let worst = 0;
      for (let i = 0; i < 60 * 8; i += 1) {
        w.freeze = 0; w.runLeft = 999; w.tilt = [-0.5 * side, 0];
        w.step(1 / 60);
        if (!w.ballFree) break;
        if (w.puck.y > 1040 && Math.abs(w.puck.x - (side === 1 ? 290 : 430)) < 110) inBox += 1; else inBox = 0;
        worst = Math.max(worst, inBox);
      }
      expect(worst).toBeLessThan(60 * 4);
    }
  });
});
