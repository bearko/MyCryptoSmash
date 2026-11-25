import { describe, expect, it } from 'vitest';
import { PinballWorld } from '../src/game/pinball';
import type { WorldEvents } from '../src/game/world';
import { PARTS } from '../src/game/parts';
import { runDemo } from '../src/ui/guide';
import { freshSave } from '../src/core/save';
import * as T from '../src/game/table';

const quiet = new Proxy({}, { get: () => () => undefined }) as unknown as WorldEvents;
function make(): PinballWorld {
  const w = new PinballWorld(freshSave(1001), quiet);
  w.calcStats();
  w.startRun(1);
  w.phase = 'play';
  w.hole.next = 9999;
  w.star.next = 9999;
  w.freeze = 0;
  return w;
}

describe('台の部品（解説モード）', () => {
  it('部品は台の中にあり、名前と説明がある', () => {
    const ids = new Set<string>();
    for (const p of PARTS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(T.TW);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(T.TH);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.what.length).toBeGreaterThan(10);
    }
  });
  // 実演の球が、ちゃんとその部品のそばを通る（打ち出しは時間差なので除く）
  for (const p of PARTS.filter((q) => q.demo.kind !== 'launch')) {
    it(`実演：${p.name}`, () => {
      const w = make();
      runDemo(w, p);
      let near = Infinity;
      for (let i = 0; i < 60 * 3; i += 1) {
        w.freeze = 0;
        w.step(1 / 60);
        w.runLeft = 9999;
        const bs = [w.puck, ...w.mates];
        for (const b of bs) near = Math.min(near, Math.hypot(b.x - p.x, b.y - p.y));
        if (w.onRamp && p.id === 'ramp') near = 0;
      }
      expect(near).toBeLessThan(p.r + 30);
    });
  }
});
