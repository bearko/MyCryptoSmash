import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { MAX_BALLS, MAX_REAL, MYSTERIES, PinballWorld, RESERVE_GAP } from '../src/game/pinball';
import * as T from '../src/game/table';
import { TOY_IDS, type ToyId } from '../src/game/toys';

/** 球がはさまらない・外へ出ないことは、仕掛けなしの台と全部ある台の両方で見る */
const BOTH: [string, ToyId[]][] = [['仕掛けなし', []], ['仕掛けあり', [...TOY_IDS]]];

/** toys：台に付ける仕掛け（はじめの台は仕掛けなし） */
function make(ev: Partial<Record<string, (...a: never[]) => void>> = {}, toys: ToyId[] = []): PinballWorld {
  const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
  const s = freshSave(cat.heroes[0].id);
  s.toys = [...toys];
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
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
  it.each(BOTH)('どう打っても台の外へ出ない（落ちる穴を除く。%s）', (_n, toys) => {
    for (let k = 0; k < 16; k += 1) {
      const w = make({}, toys);
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
    const ghosts = w.mates.filter((b) => b.ghost);
    expect(ghosts.length).toBe(3);
    // 取った分身だけを見る（ミステリーのホールの「分身球」で別の分身が出ることがあるので）
    for (let i = 0; i < 60 * 8; i += 1) { w.freeze = 0; w.step(1 / 60); }
    expect(ghosts.filter((b) => w.mates.includes(b)).length).toBe(0);
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
    it('大当たりの増幅・ボールセーブ・キックバックがスキルでのびる（入口とピラミッドの時間はのびない）', () => {
      const w = skilled({ y_gate: 2, y_pyramid: 3, y_safe: 2, g_plunger: 2 });
      expect(w.st.laneJackpot).toBe(1);
      expect(w.st.gateTime).toBe(18);
      expect(w.st.pyramidTime).toBe(15);
      expect(w.st.ballSave).toBe(8);
      expect(w.st.kickbackTime).toBe(9);
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
  it.each(BOTH)('フリッパーの根元の方へ傾けつづけても、球がはまって止まらない（三角のばねの裏との往復にならない。%s）', (_n, toys) => {
    for (const side of [1, -1]) for (const x of [286, 313, 331]) {
      const w = make({}, toys);
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

/** 乱数を決まった並びにする（テストが毎回同じに動くように） */
function seeded(seed = 7): void {
  const rnd = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  onTestFinished(() => rnd.mockRestore());
}
/** ヒーローの枠 slots・編成 party 人（先頭がリーダー）の台 */
function party(n: number, slots = n, ev: Partial<Record<string, (...a: never[]) => void>> = {}, toys: ToyId[] = []): PinballWorld {
  const w = make(ev, toys);
  const ids = cat.heroes.slice(0, Math.max(1, n)).map((h) => h.id);
  w.save.heroes = [...ids];
  w.save.hero = ids[0];
  w.save.party = [...ids];
  w.save.heroSlots = slots;
  w.startRun(1);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}
const steps = (w: PinballWorld, sec: number) => { for (let i = 0; i < Math.round(sec * 60); i += 1) { w.freeze = 0; w.runLeft = 999; w.step(1 / 60); } };
const reserves = (w: PinballWorld) => w.mates.filter((m) => m.reserve);

describe('控えの球（ヒーローの枠が 2 以上）', () => {
  it('リーダーを打ち出すと、控えが右の通路から 1 つずつ続けて自動で出て、台の上まで上がる', () => {
    seeded();
    const texts: string[] = [];
    const w = party(3, 3, { pin: (t: string) => { texts.push(t); } });
    expect(w.reserveHeroes().length).toBe(2);
    steps(w, 1);
    expect(w.mates.length).toBe(0); // 打ち出すまでは出ない
    launch(w, 0, MAX_PULL);
    steps(w, RESERVE_GAP - 0.1);
    expect(reserves(w).length).toBe(0);
    steps(w, 0.15);
    expect(reserves(w).length).toBe(1);
    expect(reserves(w)[0].x).toBeGreaterThan(T.SHOOT_X0); // 打ち出しの通路から
    steps(w, RESERVE_GAP);
    expect(reserves(w).length).toBe(2);
    expect(new Set(reserves(w).map((m) => m.hero.id))).toEqual(new Set(w.reserveHeroes()));
    expect(texts).toContain('PARTY BALL 2 / 3');
    expect(texts).toContain('PARTY BALL 3 / 3');
    // どの控えも通路を駆け上がって台の上へ出る
    let top = 9999;
    for (let i = 0; i < 90; i += 1) { steps(w, 1 / 60); for (const m of reserves(w)) top = Math.min(top, m.y); }
    expect(top).toBeLessThan(120);
    steps(w, 1);
    expect(reserves(w).every((m) => m.shootT === undefined)).toBe(true);
    expect(w.canHold).toBe(false); // 引っぱれるのはリーダーの球だけ（飛んでいる間は引っぱれない）
  });
  it('ヒーローの枠が 1 なら、今と同じ（控えは出ない。編成に何人いても）', () => {
    for (const [n, slots] of [[1, 1], [3, 1], [1, 3]]) {
      const w = party(n, slots);
      expect(w.reserveHeroes().length).toBe(0);
      launch(w, 0, MAX_PULL);
      steps(w, 2);
      expect(w.mates.length).toBe(0);
    }
  });
  it('控えの球が落ちても、その球がなくなるだけでプレイは続く（ボールを落としたことにならない）', () => {
    seeded();
    const w = party(3);
    launch(w, 0, MAX_PULL);
    steps(w, 2);
    w.ballSaveUntil = 0;
    const m = reserves(w)[0];
    m.x = 360; m.y = T.DRAIN_Y + 30; m.vx = 0; m.vy = 300;
    steps(w, 1 / 60);
    expect(reserves(w).length).toBe(1);
    expect(w.drains).toBe(0);
    expect(w.phase).toBe('play');
  });
  it('リーダーの球が落ちても、控えが残っていれば続く（残った球が本物の球を引きつぎ、絵はそのヒーロー）。全部落ちたら打ち出し直しで、控えもまた出る', () => {
    seeded();
    const texts: string[] = [];
    const w = party(3, 3, { pin: (t: string) => { texts.push(t); } });
    launch(w, 0, MAX_PULL);
    steps(w, 2);
    w.ballSaveUntil = 0;
    w.pinMul = 3;
    put(w, 360, T.DRAIN_Y + 20, 0, 300);
    steps(w, 1 / 60);
    expect(w.parked).toBe(null);
    expect(texts).toContain('PLAY ON!');
    expect(w.drains).toBe(0);
    expect(w.pinMul).toBe(3); // 球が全部落ちるまでは倍率も残る
    expect(w.puckAs).not.toBe(null);
    expect(w.ballHero.id).not.toBe(w.save.hero);
    expect(reserves(w).length).toBe(1);
    // のこりも全部落とす
    w.mates = [];
    put(w, 360, T.DRAIN_Y + 20, 0, 300);
    w.parked = null;
    steps(w, 1 / 60);
    expect(w.parked).toBe('plunger');
    expect(w.drains).toBe(1);
    expect(w.pinMul).toBe(1);
    expect(w.ballHero.id).toBe(w.save.hero); // 打ち出しの通路にはリーダー
    launch(w, 0, MAX_PULL);
    steps(w, RESERVE_GAP * 2 + 0.1);
    expect(reserves(w).length).toBe(2);
  });
  it('打ち出したあとのボールセーブの間は、控えの球も戻る', () => {
    seeded();
    const w = party(2);
    launch(w, 0, MAX_PULL);
    steps(w, 1.2);
    w.ballSaveUntil = w.time + 3;
    const m = reserves(w)[0];
    m.shootT = undefined;
    m.x = 360; m.y = T.DRAIN_Y + 30; m.vx = 0; m.vy = 300;
    steps(w, 1 / 60);
    expect(reserves(w).length).toBe(1);
    expect(reserves(w)[0].vy).toBeLessThan(0);
  });
  it('弱く打ち直した（RE-SHOOT）ときは、台に出ていない控えだけが出る（同じヒーローが 2 つにならない）', () => {
    seeded();
    const w = party(3);
    launch(w, 0, MAX_PULL);
    steps(w, 2);
    w.park('plunger');
    launch(w, 0, MAX_PULL);
    steps(w, 2);
    expect(reserves(w).length).toBe(2);
  });
  it('球の数には上限がある（本物の球 MAX_REAL・分身もふくめて MAX_BALLS）。マルチボールを重ねても超えない', () => {
    seeded();
    const w = party(6, 6, {}, [...TOY_IDS]);
    launch(w, 0, MAX_PULL);
    steps(w, 3);
    expect(reserves(w).length).toBe(5);
    for (let k = 0; k < 6; k += 1) {
      w.multiball();
      w.star.on = true; w.star.t = 5; w.star.x = w.puck.x; w.star.y = w.puck.y;
      steps(w, 0.5);
      expect(w.realBalls).toBeLessThanOrEqual(MAX_REAL);
      expect(w.mates.length + 1).toBeLessThanOrEqual(MAX_BALLS);
    }
    expect(w.realBalls).toBeGreaterThan(6); // マルチボールでさらに増える
  });
  it.each(BOTH)('控え 5 人とマルチボールで球が多くても、台の外へ出ず、はさまって止まらない（%s）', (_n, toys) => {
    seeded(11);
    const w = party(6, 6, {}, toys);
    w.star.next = 3;
    w.hole.next = 4;
    launch(w, 0, MAX_PULL);
    const stay = new Map<object, { x: number; y: number; t: number }>();
    let worst = 0;
    for (let i = 0; i < 60 * 25; i += 1) {
      w.freeze = 0; w.runLeft = 999;
      w.tilt = [Math.sin(i / 50) * 0.4, 0];
      if (i % 90 === 0) w.shake(Math.cos(i), Math.sin(i), 20, 12);
      if (i === 60 * 6) w.multiball();
      w.step(1 / 60);
      if (w.parked === 'plunger' && i % 60 === 0) launch(w, 0, MAX_PULL);
      for (const m of w.mates) {
        expect(m.x).toBeGreaterThan(-2);
        expect(m.x).toBeLessThan(T.TW + 2);
        expect(m.y).toBeGreaterThan(-2);
        if (m.ghost !== undefined) continue;
        const s = stay.get(m) ?? { x: m.x, y: m.y, t: 0 };
        if (Math.hypot(m.x - s.x, m.y - s.y) < 50) s.t += 1 / 60; else { s.x = m.x; s.y = m.y; s.t = 0; }
        stay.set(m, s);
        worst = Math.max(worst, s.t);
      }
    }
    expect(worst).toBeLessThan(3.5);
  });
  it.each(BOTH)('フリッパーの根元の方へ傾けつづけても、控えの球がはまって止まらない（%s）', (_n, toys) => {
    seeded(3);
    for (const side of [1, -1]) for (const x of [286, 313, 331]) {
      const w = party(2, 2, {}, toys);
      w.startRun(10); // ボス台の掟（短いフリッパー）
      w.hole.next = 999; w.star.next = 999;
      put(w, 360, 200, 0, 0);
      w.mates.push({ x: side === 1 ? x : 720 - x, y: 1150, vx: -150 * side, vy: 0, r: 11, m: 1, hero: cat.heroes[1], spin: 0, reserve: true });
      const m = w.mates[0];
      let inBox = 0;
      let worst = 0;
      for (let i = 0; i < 60 * 8; i += 1) {
        w.freeze = 0; w.runLeft = 999; w.tilt = [-0.5 * side, 0];
        w.step(1 / 60);
        if (!w.mates.includes(m)) break;
        if (m.y > 1040 && Math.abs(m.x - (side === 1 ? 290 : 430)) < 110) inBox += 1; else inBox = 0;
        worst = Math.max(worst, inBox);
      }
      expect(worst).toBeLessThan(60 * 4);
    }
  });
});
