import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { partsSave } from './fixtures';
import { cat } from '../src/core/catalog';
import { PinballWorld } from '../src/game/pinball';
import { Tally, payout } from '../src/game/tally';

describe('GUM の集計（プレイのあとに発表）', () => {
  it('出どころごとに回数と基本額がたまり、少ない順に並ぶ', () => {
    const t = new Tally();
    t.add('bumper', 1);
    t.add('bumper', 2);
    t.add('enemy', 0, 1);
    t.add('enemy', 10, 0);
    t.add('lane', 0.5);
    expect(t.base).toBeCloseTo(13.5);
    expect(t.list().map((r) => r.src)).toEqual(['lane', 'bumper', 'enemy']);
    expect(t.list().find((r) => r.src === 'enemy')?.n).toBe(1);
    expect(t.list().find((r) => r.src === 'bumper')?.n).toBe(2);
  });
  it('倍率は順に掛かる（倍々）', () => {
    expect(payout(100, [{ name: 'a', sub: '', mul: 2, color: '' }, { name: 'b', sub: '', mul: 1.5, color: '' }])).toBeCloseTo(300);
  });
  it('プレイ中のバンパーは出どころ「バンパー」として届く', () => {
    const got: string[] = [];
    const s = partsSave(cat.heroes[0].id);
    const noop = { gum(_v: number, src?: string) { if (src) got.push(src); }, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
    const w = new PinballWorld(s, noop as never);
    w.startRun(1);
    w.parked = null; w.freeze = 0;
    const b = w.bumpers[0];
    w.puck.x = b.x; w.puck.y = b.y - b.r - w.puck.r - 1; w.puck.vx = 0; w.puck.vy = 400;
    for (let i = 0; i < 6; i += 1) { w.freeze = 0; w.step(1 / 120); }
    expect(got).toContain('bumper');
  });
  it('スキルの GUM の倍率は、プレイ中ではなくプレイのあとに掛かる', () => {
    const s = partsSave(cat.heroes[0].id);
    s.up = { y_gum: 10 };
    const w = new PinballWorld(s, { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} } as never);
    w.startRun(1);
    expect(w.st.gumMul).toBeGreaterThan(1);
    expect(w.gumMul).toBeCloseTo(1);
    expect(w.gumBoosts().all[0].name).toBe('スキルツリー');
  });
});
