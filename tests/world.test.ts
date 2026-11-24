import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL, World } from '../src/game/world';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(): World {
  const w = new World(freshSave(cat.heroes[0].id), noop);
  w.resize(640);
  w.enemies = [];
  w.puck.x = 180;
  w.puck.y = 320;
  return w;
}
const speed = (w: World) => Math.hypot(w.puck.vx, w.puck.vy);

describe('操作', () => {
  it('押している間に指をぐるぐる動かしても、マレットは動かない', () => {
    const w = make();
    w.puck.vx = 800;
    w.holdStart();
    for (let i = 0; i < 120; i += 1) {
      w.holdPull(Math.cos(i) * 200, Math.sin(i) * 200);
      w.step(1 / 60);
    }
    expect(speed(w)).toBeLessThan(10);
  });
  it('引っぱって離すと、引いた向きと反対へ全力で飛ぶ', () => {
    const w = make();
    w.holdStart();
    w.holdPull(0, MAX_PULL * 1.5); // 下へ引く
    w.holdEnd();
    expect(w.puck.vy).toBeLessThan(-w.st.launch * 0.95); // 上へ
    expect(Math.abs(w.puck.vx)).toBeLessThan(1);
  });
  it('ほとんど引かずに離すと取り消し', () => {
    const w = make();
    w.holdStart();
    w.holdPull(3, 2);
    w.holdEnd();
    expect(speed(w)).toBe(0);
  });
  it('10 度ほど傾けると、0.3 秒でかなりの速さになる', () => {
    const w = make();
    w.puck.y = 60;
    w.tilt = [0, 0.17];
    for (let i = 0; i < 18; i += 1) w.step(1 / 60);
    expect(speed(w)).toBeGreaterThan(900);
  });
  it('逆へ傾けると、すぐに切りかえす', () => {
    const w = make();
    w.puck.vx = 1500;
    w.tilt = [-0.3, 0];
    for (let i = 0; i < 15; i += 1) w.step(1 / 60);
    expect(w.puck.vx).toBeLessThan(0);
  });
  it('振ると、逆向きに動いていても振った向きへ飛ぶ', () => {
    const w = make();
    w.puck.vx = -1200;
    w.shake(1, 0, 15, 12);
    expect(w.puck.vx).toBeGreaterThan(w.st.shake * 0.7);
  });
});

describe('攻撃の色', () => {
  it('3 すくみ：赤い敵は青、青い敵は緑、緑の敵は赤に弱い', async () => {
    const { affinity } = await import('../src/game/elements');
    expect(affinity('blue', 'red')).toBeGreaterThan(1);
    expect(affinity('green', 'blue')).toBeGreaterThan(1);
    expect(affinity('red', 'green')).toBeGreaterThan(1);
    expect(affinity('red', 'red')).toBeLessThan(1);
    expect(affinity('green', 'red')).toBe(1);
  });
  function withEnemies(w: World, pts: [number, number][], elem: 'red' | 'blue' | 'green') {
    w.enemies = [];
    for (const [x, y] of pts) {
      w.enemies.push({
        x, y, vx: 0, vy: 0, r: 22, m: 0.9, hp: 1e6, maxHp: 1e6, art: cat.enemySets[0][0], boss: false, tier: 0,
        flash: 0, hitCd: 0, mateCd: 0, wander: 99, tx: x, ty: y, born: -9, dash: 0, squash: 0, face: 1, elem, pierced: 0, elemT: 9,
      });
    }
  }
  it('緑：はじくと、線の上の敵を突き抜けて全員に当たる', () => {
    const w = make();
    w.puck.y = 600;
    withEnemies(w, [[180, 450], [180, 300], [180, 150]], 'blue');
    w.holdStart();
    w.holdPull(0, MAX_PULL);
    w.holdEnd();
    for (let i = 0; i < 20; i += 1) w.step(1 / 60);
    expect(w.enemies.every((e) => e.hp < 1e6)).toBe(true);
  });
  it('青：振ると、周りの敵全員に当たる', () => {
    const w = make();
    withEnemies(w, [[100, 320], [260, 320], [180, 220], [180, 420]], 'red');
    w.shake(1, 0, 15, 12);
    for (let i = 0; i < 30; i += 1) w.step(1 / 60);
    expect(w.enemies.every((e) => e.hp < 1e6)).toBe(true);
  });
  it('赤：敵の向きへ傾けて押しつけると、連続で当たる', () => {
    const w = make();
    withEnemies(w, [[180, 200]], 'green');
    w.enemies[0].m = 1e9; // 動かない的
    w.puck.y = 250;
    w.tilt = [0, -0.4];
    let hits = 0;
    let last = 1e6;
    for (let i = 0; i < 90; i += 1) {
      w.step(1 / 60);
      if (w.enemies[0].hp < last) { hits += 1; last = w.enemies[0].hp; }
    }
    expect(hits).toBeGreaterThan(6);
  });
});
