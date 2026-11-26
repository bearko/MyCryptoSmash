import { describe, expect, it, vi } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { PinballWorld } from '../src/game/pinball';
import { ruleOf } from '../src/game/offers';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(ev: Record<string, unknown> = {}, floor = 1): PinballWorld {
  const w = new PinballWorld(freshSave(cat.heroes[0].id), { ...noop, ...ev } as never);
  w.startRun(floor);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}

describe('オファーとボス台の掟', () => {
  it('ミステリーのホールで、ときどきオファーが来る（1 プレイ 2 回まで）', () => {
    const got: string[] = [];
    const w = make({ offer: (id: string) => { got.push(id); } });
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    for (let k = 0; k < 4; k += 1) {
      w.mystery.cool = 0;
      w.parked = null; w.freeze = 0;
      w.puck.x = w.mystery.x; w.puck.y = w.mystery.y; w.puck.vx = 0; w.puck.vy = 10;
      w.step(1 / 60);
      w.parked = null;
    }
    spy.mockRestore();
    expect(got.length).toBe(2);
  });
  it('GUM ×2 を受けると、プレイのあとの発表で ×2 が掛かり、キックバックが消える', () => {
    const w = make();
    expect(w.gumBoosts().all.some((b) => b.name === '取引')).toBe(false);
    w.acceptOffer('gum2');
    expect(w.gumBoosts().all.find((b) => b.name === '取引')?.mul).toBe(2);
    expect(w.kickbacks.every((k) => !k.lit)).toBe(true);
  });
  it('次に納めたとき Limited をもう 1 つ選べる：のこり時間が 5 秒へる', () => {
    const w = make();
    const t = w.runLeft;
    w.acceptOffer('limited2');
    expect(w.extraPicks).toBe(1);
    expect(w.runLeft).toBeCloseTo(t - 5);
  });
  it('ボス台（10 台ごと）には掟がある。坂が急だと速く落ちる', () => {
    expect(ruleOf(9)).toBe(null);
    expect(ruleOf(10)).not.toBe(null);
    const fall = (floor: number) => {
      const w = make({}, floor);
      w.parked = null; w.freeze = 0;
      w.puck.x = 300; w.puck.y = 620; w.puck.vx = 0; w.puck.vy = 0;
      for (let i = 0; i < 15; i += 1) { w.freeze = 0; w.step(1 / 60); }
      return { vy: w.puck.vy, rule: w.rule?.id };
    };
    const steepFloor = [10, 20, 30, 40].find((f) => ruleOf(f)?.id === 'steep')!;
    expect(fall(steepFloor).rule).toBe('steep');
    expect(fall(steepFloor).vy).toBeGreaterThan(fall(11).vy);
  });
});
