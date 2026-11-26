import { describe, expect, it } from 'vitest';
import { freshSave } from '../src/core/save';
import { cat, type Hero } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld } from '../src/game/pinball';
import { ABILITIES, abilityOf, abilityPower, resolveAbility, type AbilityId } from '../src/game/abilities';
import * as T from '../src/game/table';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
const heroWith = (id: AbilityId): Hero => cat.heroes.find((h) => abilityOf(h).id === id)!;
function make(leader: Hero, ev: Record<string, unknown> = {}): PinballWorld {
  const s = freshSave(leader.id);
  s.heroes = [leader.id];
  s.hero = leader.id;
  s.party = [leader.id];
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}

describe('ヒーローの能力', () => {
  it('どのヒーローにも能力があり、どの能力にも持ち主がいる。強さはレアリティで上がり、リーダーは 1.5 倍', () => {
    for (const a of ABILITIES) expect(cat.heroes.some((h) => abilityOf(h).id === a.id)).toBe(true);
    const h1 = cat.heroes.find((h) => h.rarity === 1)!;
    const h5 = cat.heroes.find((h) => h.rarity === 5)!;
    expect(abilityPower(h5, false)).toBeGreaterThan(abilityPower(h1, false));
    expect(abilityPower(h1, true)).toBeCloseTo(abilityPower(h1, false) * 1.5);
  });
  it('まね：となりのヒーローの能力をまねる', () => {
    const m = heroWith('mimic');
    const f = heroWith('feeder');
    expect(resolveAbility([m, f], 0).id).toBe('feeder');
  });
  it('軽い球はゆっくり落ち、重い球は速く落ちる', () => {
    const fall = (h: Hero) => {
      const w = make(h);
      w.parked = null; w.freeze = 0;
      w.puck.x = 360; w.puck.y = 700; w.puck.vx = 0; w.puck.vy = 0;
      for (let i = 0; i < 15; i += 1) { w.freeze = 0; w.step(1 / 60); }
      return w.puck.vy;
    };
    expect(fall(heroWith('light'))).toBeLessThan(fall(heroWith('feeder')));
    expect(fall(heroWith('heavy'))).toBeGreaterThan(fall(heroWith('feeder')));
  });
  it('跳ね返り：1 プレイに 1 回、落ちかけた球が戻る', () => {
    const texts: string[] = [];
    const w = make(heroWith('bounce'), { pin: (t: string) => { texts.push(t); } });
    for (let k = 0; k < 2; k += 1) {
      w.parked = null; w.ballSaveUntil = 0; w.freeze = 0;
      w.puck.x = 360; w.puck.y = T.DRAIN_Y + 20; w.puck.vy = 300;
      w.step(1 / 60);
    }
    expect(texts.filter((t) => t === 'BOUNCE!').length).toBe(1);
    expect(w.drains).toBe(1);
  });
  it('倍率の供給：リーダーなら、プレイのあとの発表で GUM の倍率が掛かる', () => {
    const a = make(heroWith('feeder'));
    const b = make(heroWith('heavy'));
    const mul = (w: ReturnType<typeof make>) => w.gumBoosts().all.reduce((x, y) => x * y.mul, 1);
    expect(mul(a)).toBeGreaterThan(mul(b));
    expect(a.gumBoosts().all.some((x) => x.sub.includes('倍率の供給'))).toBe(true);
  });
  it('守りの球：打ち出したときのボールセーブが長い', () => {
    const save = (h: Hero) => { const w = make(h); w.holdStart(); w.holdPull(0, MAX_PULL); w.holdEnd(); return w.ballSaveUntil - w.time; };
    expect(save(heroWith('shield'))).toBeGreaterThan(save(heroWith('feeder')));
  });
  it('マルチボールでは、装備した控えのヒーローが順に出る', () => {
    const lead = heroWith('feeder');
    const s = freshSave(lead.id);
    const others = cat.heroes.filter((h) => h.id !== lead.id).slice(0, 2);
    s.heroes = [lead.id, ...others.map((h) => h.id), cat.heroes[10].id];
    s.party = [lead.id, ...others.map((h) => h.id)];
    const w = new PinballWorld(s, noop as never);
    w.startRun(1);
    w.multiball();
    expect(w.mates.slice(0, 2).map((m) => m.hero.id)).toEqual(others.map((h) => h.id));
  });
});
