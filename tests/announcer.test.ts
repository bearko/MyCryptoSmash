import { describe, expect, it } from 'vitest';
import { Announcer, EVENTS, MILESTONES, PEAK, TIERS, tierOf, type Call } from '../src/game/announcer';
import { hasLine } from '../src/core/voice';

describe('実況', () => {
  it('言うことばは、すべて声がある', () => {
    for (const t of [...TIERS.flat(), ...Object.values(MILESTONES), ...Object.values(EVENTS)]) expect(hasLine(t), t).toBe(true);
  });
  it('連鎖が進むほど段階が上がり、20 連鎖からは最高潮', () => {
    expect(tierOf(3)).toBe(0);
    expect(tierOf(7)).toBe(1);
    expect(tierOf(15)).toBe(2);
    expect(tierOf(PEAK)).toBe(3);
    expect(tierOf(80)).toBe(3);
  });
  it('区切りの連鎖数では、しゃべっていても割りこんで言う', () => {
    const calls: [Call, boolean][] = [];
    const a = new Announcer((c, p) => { calls.push([c, p]); return true; });
    a.hit(0, 10, false, false);
    expect(calls[0][0].text).toBe(MILESTONES[10]);
    expect(calls[0][1]).toBe(true);
  });
  it('最高潮では、しゃべり終わるたびに最高潮のことばを続ける', () => {
    const said: Call[] = [];
    const a = new Announcer((c) => { said.push(c); return true; });
    for (let i = 0; i < 10; i += 1) a.hit(i * 0.1, 21 + i, false, false);
    expect(said.length).toBe(10);
    for (const c of said) expect([...TIERS[3], MILESTONES[30]]).toContain(c.text);
    // 同じことばがすぐには続かない
    for (let i = 1; i < said.length; i += 1) expect(said[i].text).not.toBe(said[i - 1].text);
  });
  it('序盤は間をあけて、ときどきほめる', () => {
    const said: Call[] = [];
    const a = new Announcer((c) => { said.push(c); return true; });
    for (let i = 0; i < 4; i += 1) a.hit(i * 0.2, 2 + (i % 2), false, false);
    expect(said.length).toBe(1);
  });
});
