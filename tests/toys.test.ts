import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld } from '../src/game/pinball';
import {
  BIG_TOYS, CANNON, CAPTIVE, CASTLE, CLOWN_STEPS, CRANE, DINO, DISC, FACE, HYPER, MAGNET, MINI, MOAI, PART_TOYS, POPUPS, TOY_ART, TOY_IDS, TOY_NEEDS, TOY_OFFERS,
  TOY_PRICE, TOY_UNLOCK, TOY_UNLOCK_AT, TUTORIAL_PARTS, UFO,
  buyToy, clownArt, clownNext, clownOf, clownTier, restockToys, rollToyShop, tierArt, toysOf, toysUnlocked, type ToyId,
} from '../src/game/toys';
import { deliver, resetChallenge, startPlay } from '../src/game/quota';
import { existsSync } from 'node:fs';

/** 仕掛けを全部持たせた台（own を渡すとその仕掛けだけ） */
function make(ev: Record<string, unknown> = {}, off: string[] = [], own: ToyId[] = [...TOY_IDS]): PinballWorld {
  const s = freshSave(cat.heroes[0].id);
  s.toys = [...own];
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
    // 小さな台のフリッパーはたまに打ちそこねるので、乱数を決まった並びにして毎回同じに動かす
    let seed = 7;
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
    onTestFinished(() => rnd.mockRestore());
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
    expect(tierArt(TOY_ART.dino, 1)).toBe(1088);
    expect(tierArt(TOY_ART.dino, 50)).toBe(5088);
    expect(clownArt(0)).toContain('1063.png');
    expect(clownArt(4)).toContain('5063.png');
  });
  it.each([['仕掛けあり', [...TOY_IDS]], ['仕掛けなし', []]] as [string, ToyId[]][])('新しい仕掛けのまわりでも、球がはまって止まらない・台の外へ出ない（%s）', (_n, own) => {
    let nudges = 0;
    const w = make({ pin: (t: string) => { if (t === 'NUDGE!') nudges += 1; } }, [], own);
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

/** 決まった並びの乱数（毎回同じに動かす） */
const seq = (k = 0.37) => { let x = k; return () => { x = (x * 9301 + 49297) % 233280 / 233280; return x; }; };

describe('ギミック（仕掛けを買い足す）', () => {
  /** チュートリアルを終えて、ノルマ 1 にいるセーブ（ギミックはまだない） */
  const fresh = () => { const s = freshSave(cat.heroes[0].id); s.quota.n = 1; s.quota.guide = false; s.tutorialDone = true; return s; };
  it('挑戦のはじめは仕掛けが 1 つもない（台にも解説モードにも出ない）', () => {
    const s = fresh();
    expect(s.toys).toEqual([]);
    expect(Object.values(toysOf(s)).some((v) => v)).toBe(false);
    const w = make({}, [], []);
    expect(Object.values(w.toys).some((v) => v)).toBe(false);
    expect(w.clown).toBe(0);
    // 仕掛けなしの台：大砲の場所へ入っても止まらない
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).not.toBe('cannon');
  });
  it('買うと台に出る（ほかのギミックは出ない）', () => {
    const s = fresh();
    s.emblems = 100;
    rollToyShop(s, seq());
    const id = s.toyShop[0];
    expect(buyToy(s, id)).toBe(true);
    expect(s.emblems).toBe(100 - TOY_PRICE[id]);
    expect(s.toys).toEqual([id]);
    const on = toysOf(s);
    expect(on[id]).toBe(true);
    expect(TOY_IDS.filter((t) => on[t])).toEqual([id]);
    // 同じものは 2 回買えない・エンブレムが足りなければ買えない
    expect(buyToy(s, id)).toBe(false);
    s.emblems = 0;
    expect(buyToy(s, s.toyShop[1])).toBe(false);
    // 大砲を持った台では、大砲に入ると止まる
    const w = make({}, [], ['cannon']);
    expect(w.toys.cannon).toBe(true);
    expect(w.toys.ufo).toBe(false);
    put(w, CANNON.x, CANNON.y + 20, 0, -300);
    run(w, 4);
    expect(w.parked).toBe('cannon');
  });
  it('解放の順番：チュートリアルの 3 つ → ノルマを納めるたびに入荷。基本の部品が先・派手な仕掛けが後。先に要るギミックは必ず前', () => {
    expect(TOY_UNLOCK.length).toBe(TOY_IDS.length);
    expect(new Set(TOY_UNLOCK).size).toBe(TOY_IDS.length);
    expect(TOY_IDS.length).toBe(PART_TOYS.length + BIG_TOYS.length);
    expect(toysUnlocked(0)).toEqual(TUTORIAL_PARTS);
    expect(TUTORIAL_PARTS).toEqual(['sling', 'inlane', 'bumper']);
    for (let n = 1; n < TOY_UNLOCK_AT.length; n += 1) expect(toysUnlocked(n).length).toBeGreaterThan(toysUnlocked(n - 1).length);
    expect(toysUnlocked(8)).toHaveLength(TOY_IDS.length);
    expect(toysUnlocked(11)).toHaveLength(TOY_IDS.length);
    expect(TOY_UNLOCK.slice(-3)).toEqual(['castle', 'mini', 'mega13']);
    // 値段：チュートリアルの部品は 1、基本の部品は 1〜5、大きな仕掛けは 6〜15（ユーザーの指定）
    for (const id of TUTORIAL_PARTS) expect(TOY_PRICE[id]).toBe(1);
    for (const id of PART_TOYS) { expect(TOY_PRICE[id]).toBeGreaterThanOrEqual(1); expect(TOY_PRICE[id]).toBeLessThanOrEqual(5); }
    for (const id of BIG_TOYS) { expect(TOY_PRICE[id]).toBeGreaterThanOrEqual(6); expect(TOY_PRICE[id]).toBeLessThanOrEqual(15); }
    // 先に要るギミックは、解放の順番でいつも前にある（買えない組み合わせが出ない）
    for (const [id, needs] of Object.entries(TOY_NEEDS)) for (const nd of needs ?? []) expect(TOY_UNLOCK.indexOf(nd), `${id} ← ${nd}`).toBeLessThan(TOY_UNLOCK.indexOf(id as ToyId));
    // 打ち出し・フリッパー・ピラミッドの入口は売らない
    for (const id of ['plunger', 'flipper', 'gate']) expect(TOY_IDS).not.toContain(id);
    // まだ解放されていないギミックは、候補にも出ず、買えない
    const s = fresh();
    s.emblems = 100;
    for (let k = 0; k < 20; k += 1) { rollToyShop(s, seq(k / 20)); expect(s.toyShop.every((id) => toysUnlocked(1).includes(id))).toBe(true); }
    s.toyShop = ['mega13'];
    expect(buyToy(s, 'mega13')).toBe(false);
    // 納めると増える
    startPlay(s);
    s.gum = 200;
    deliver(s);
    restockToys(s, true, seq());
    expect(s.toyShop.length).toBe(TOY_OFFERS);
    expect(s.toyShop.every((id) => toysUnlocked(2).includes(id))).toBe(true);
  });
  it('先に要るギミックをそろえていないと、候補に出ず、買えない', () => {
    const s = fresh();
    s.quota.n = 9;
    s.emblems = 999;
    s.toys = [...TOY_UNLOCK].filter((id) => id !== 'lock' && id !== 'multi' && id !== 'jackpot' && id !== 'gacha' && id !== 'mega13');
    for (let k = 0; k < 20; k += 1) { rollToyShop(s, seq(k / 20)); expect(s.toyShop).toEqual(['lock']); }
    s.toyShop = ['multi', 'lock'];
    expect(buyToy(s, 'multi')).toBe(false);
    expect(buyToy(s, 'lock')).toBe(true);
    rollToyShop(s, seq());
    expect(s.toyShop.sort()).toEqual(['gacha', 'multi']);
  });
  it('候補は解放ずみでまだ持っていないギミックから TOY_OFFERS まで', () => {
    expect(TOY_OFFERS).toBeGreaterThanOrEqual(3);
    expect(TOY_OFFERS).toBeLessThanOrEqual(4);
    const s = fresh();
    s.toys = toysUnlocked(1).slice(0, -1);
    rollToyShop(s, seq());
    expect(s.toyShop).toEqual(toysUnlocked(1).slice(-1));
    s.toys = toysUnlocked(1);
    rollToyShop(s, seq());
    expect(s.toyShop).toEqual([]);
    // 買ったあとの札は残り（台に付いた）、候補がまだあるうちは引き直さない
    const t = fresh();
    t.emblems = 50;
    rollToyShop(t, seq());
    const before = [...t.toyShop];
    buyToy(t, before[0]);
    restockToys(t, false, seq(0.9));
    expect(t.toyShop).toEqual(before);
  });
  it('ピエロの段階：基本の部品もふくめたギミックの数で上がる（チュートリアルの 3 つはコモンのまま）', () => {
    expect(CLOWN_STEPS[0]).toBe(0);
    expect(CLOWN_STEPS[1]).toBeGreaterThan(TUTORIAL_PARTS.length);
    expect(CLOWN_STEPS[4]).toBeLessThanOrEqual(TOY_IDS.length);
    // ジョーカーには、部品を全部そろえても大きな仕掛けが要る
    expect(CLOWN_STEPS[4]).toBeGreaterThan(PART_TOYS.length);
    expect(clownTier(0)).toBe(0);
    expect(clownTier(CLOWN_STEPS[1] - 1)).toBe(0);
    expect(clownTier(CLOWN_STEPS[1])).toBe(1);
    expect(clownTier(CLOWN_STEPS[4])).toBe(4);
    expect(clownNext(0)).toBe(CLOWN_STEPS[1]);
    expect(clownNext(CLOWN_STEPS[4])).toBe(null);
    const s = fresh();
    s.toys = TOY_UNLOCK.slice(0, CLOWN_STEPS[2]);
    expect(clownOf(s)).toBe(2);
    const w = make({}, [], s.toys);
    expect(w.clown).toBe(2);
  });
  it('GAME OVER で買った仕掛けをすべて失い、ピエロはコモンに戻る', () => {
    const s = fresh();
    s.toys = [...TOY_IDS];
    s.toyShop = ['mini'];
    expect(clownOf(s)).toBe(4);
    resetChallenge(s);
    expect(s.toys).toEqual([]);
    expect(s.toyShop).toEqual([]);
    expect(clownOf(s)).toBe(0);
  });
});
