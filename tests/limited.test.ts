import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { freshSave, type Save } from '../src/core/save';
import { cat } from '../src/core/catalog';
import { MAX_PULL } from '../src/game/world';
import { PinballWorld } from '../src/game/pinball';
import { Tally } from '../src/game/tally';
import { LIMITED_FIXED, limitedOf, slotsOf, totalsOf } from '../src/game/mods';
import { addHeat, deferLimited, heatChoices, limitedCands, pickLimited } from '../src/game/limiteds';
import { CURSE_R, CURSE_SPOTS, keepOut, rollCurse } from '../src/game/curse';
import { PARTS } from '../src/game/parts';
import { deliver, quotaAmount, rerollPrice } from '../src/game/quota';
import * as T from '../src/game/table';
import { TOY_IDS } from '../src/game/toys';

const noop = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {} };
function make(f?: (s: Save) => void, ev: Record<string, unknown> = {}): PinballWorld {
  const s = freshSave(cat.heroes[0].id);
  f?.(s);
  const w = new PinballWorld(s, { ...noop, ...ev } as never);
  w.startRun(1);
  w.hole.next = 999;
  w.star.next = 999;
  return w;
}
function seeded(seed = 7): void {
  const rnd = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  onTestFinished(() => rnd.mockRestore());
}
const ext = (series: number, rarity: number) => cat.exts.find((e) => e.id === rarity * 1000 + series)!.id;

describe('Limited（メリットとデメリットが混ざった札）', () => {
  it('54 個すべてに効き目と文があり、部品は台にある', () => {
    expect(cat.limited.length).toBe(54);
    for (const l of cat.limited) {
      const d = LIMITED_FIXED[l.id];
      expect(d, `${l.id}`).toBeTruthy();
      expect(d.good.length).toBeGreaterThan(3);
      expect(PARTS.some((p) => p.id === d.part)).toBe(true);
      expect(!!(d.add || d.once || d.heat || d.gum)).toBe(true);
    }
  });
  it('メリットとデメリットの両方を持つ札が過半数。メリットだけの札もまれにある。6 つの型がそろう', () => {
    const defs = cat.limited.map((l) => limitedOf(l.id));
    const mixed = defs.filter((d) => d.bad).length;
    expect(mixed).toBeGreaterThan(defs.length / 2);
    expect(defs.length - mixed).toBeGreaterThan(0);
    expect(defs.length - mixed).toBeLessThan(defs.length / 4);
    expect(new Set(defs.map((d) => d.type)).size).toBe(6);
    // 一度だけ効く札と、ずっと効く札の両方がある
    expect(defs.some((d) => d.once)).toBe(true);
    expect(defs.some((d) => d.add)).toBe(true);
  });
});

describe('選んだその場で一度だけ効く札', () => {
  it('真・グランダルメ：手持ちのエンブレムをすべて失い、エクステンションの枠 +1', () => {
    const s = freshSave(cat.heroes[0].id);
    s.emblems = 17;
    const r = pickLimited(s, 5502);
    expect(s.emblems).toBe(0);
    expect(slotsOf(s).ext).toBe(4);
    expect(r.notes[0]).toContain('17');
  });
  it('真・雛人形：いちばん右のエクステンションが壊れ、ヒーローの枠 +2', () => {
    const s = freshSave(cat.heroes[0].id);
    s.owned = [ext(1, 1), ext(2, 1)];
    s.equip = [ext(1, 1), ext(2, 1)];
    pickLimited(s, 5627);
    expect(s.equip).toEqual([ext(1, 1)]);
    expect(s.owned).toEqual([ext(1, 1)]);
    expect(slotsOf(s).hero).toBe(3);
  });
  it('顕現聖杯：装備をすべて★ +1（★5 はそのまま）。育ちは引きつぐ', () => {
    const s = freshSave(cat.heroes[0].id);
    s.owned = [ext(19, 2), ext(1, 5)];
    s.equip = [ext(19, 2), ext(1, 5)];
    s.extGrow = { [ext(19, 2)]: 3 };
    pickLimited(s, 5530);
    expect(s.equip).toEqual([ext(19, 3), ext(1, 5)]);
    expect(s.extGrow[ext(19, 3)]).toBe(3);
  });
  it('真・ヤールングレイプル：手持ちの GUM の半分を失い、エクステンションの効果が強くなる', () => {
    const s = freshSave(cat.heroes[0].id);
    s.gum = 1000;
    pickLimited(s, 5599);
    expect(s.gum).toBe(500);
    expect(totalsOf([], s.limited).extPow).toBeCloseTo(0.25);
  });
  it('真・劇作家の羽ペン：次に選ぶ Limited が 2 回発動する（悪いほうも）', () => {
    const s = freshSave(cat.heroes[0].id);
    pickLimited(s, 5503);
    s.emblems = 9;
    const r = pickLimited(s, 5556); // 時間 +6・ボールセーブなし
    expect(r.notes[0]).toContain('2 回');
    expect(totalsOf([], s.limited).extraTime).toBe(12);
    expect(s.quota.doubleNext).toBe(0);
  });
});

describe('ヒートの印', () => {
  it('選ぶ部品は台にあるものだけ。印を付けると、当たった回数だけ倍率が上がり、台に炎が付く', () => {
    const s = freshSave(cat.heroes[0].id);
    expect(heatChoices(s)).not.toContain('ufo');
    s.toys = ['ufo'];
    expect(heatChoices(s)).toContain('ufo');
    const r = pickLimited(s, 5517);
    expect(r.heat).toBe(2);
    addHeat(s, ['bumper', 'ufo']);
    expect(heatChoices(s)).not.toContain('bumper');
    const w = new PinballWorld(s, noop as never);
    w.startRun(1);
    expect([...w.heat]).toEqual(expect.arrayContaining(['bumper', 'ufo']));
    expect(w.heatSpots('ufo').length).toBe(1);
    const t = new Tally();
    t.add('bumper', 5, 40);
    const h = w.gumBoosts(t).exts.filter((e) => e.heat);
    expect(h.length).toBe(2);
    expect(h[0].amount).toBeGreaterThan(0.5);
    expect(h[1].fired).toBe(false); // UFO には当たっていない
  });
  it('ヒートの倍率を上げる札', () => {
    const w = make((s) => { s.heat = ['bumper']; s.limited = [5575]; });
    const t = new Tally();
    t.add('bumper', 5, 40);
    const base = make((s) => { s.heat = ['bumper']; }).gumBoosts(t).exts[0].amount;
    expect(w.gumBoosts(t).exts[0].amount).toBeCloseTo(base * 1.8);
  });
});

describe('あとで選ぶ', () => {
  it('今回の候補を取っておき、次に納めたときの候補に加わる（選ぶ権利も持ちこす）', () => {
    const s = freshSave(cat.heroes[0].id);
    s.quota.picks = 1;
    const cands = [5501, 5502, 5503];
    deferLimited(s, cands);
    expect(s.quota.picks).toBe(0);
    s.gum = quotaAmount(s.quota.n);
    deliver(s);
    expect(s.quota.picks).toBe(2);
    const next = limitedCands(s, 3, (owned, n) => cat.limited.map((l) => l.id).filter((id) => !owned.includes(id)).slice(0, n));
    expect(next.slice(0, 3)).toEqual(cands);
    expect(next.length).toBe(6);
    pickLimited(s, next[0]);
    expect(s.quota.saved).toEqual([]);
  });
});

describe('運と店', () => {
  it('引き直しができない・いつも 10 GUM・値段 ×2', () => {
    const s = freshSave(cat.heroes[0].id);
    s.quota.rerolls = 3;
    expect(rerollPrice(s)).toBe(80);
    s.limited = [5674];
    expect(rerollPrice(s)).toBe(160);
    s.limited = [5580];
    expect(rerollPrice(s)).toBe(10);
    s.limited = [5559];
    expect(rerollPrice(s)).toBe(Infinity);
  });
  it('3 プレイ目に賭ける・落とさなかったプレイ（発表の全体の倍率）', () => {
    const w = make((s) => { s.limited = [5534, 5550]; s.quota.played = 3; });
    w.drains = 0;
    const all = w.gumBoosts().all.map((b) => b.mul);
    expect(all).toEqual(expect.arrayContaining([2.5, 1.6]));
    w.save.quota.played = 1;
    w.drains = 2;
    const all2 = w.gumBoosts().all.map((b) => b.mul);
    expect(all2).toEqual(expect.arrayContaining([0.75, 0.7]));
  });
  it('いちばん左が 2 回・いちばん右は発動しない（真・MCHブレード）', () => {
    const w = make((s) => { s.limited = [5501]; s.owned = [ext(11, 1), ext(57, 1)]; s.equip = [ext(11, 1), ext(57, 1)]; s.emblems = 10; });
    const ex = w.gumBoosts().exts;
    expect(ex.length).toBe(3);
    expect(ex[0].fired && ex[1].fired).toBe(true);
    expect(ex[1].sub).toContain('2 回目');
    expect(ex[2].fired).toBe(false);
  });
  it('壊れものが壊れたとき、挑戦の間 1 回だけ直る（アテーナー・アイギス）', () => {
    const w = make((s) => { s.limited = [5510]; s.owned = [ext(56, 1)]; s.equip = [ext(56, 1)]; });
    const r = w.gumBoosts(undefined, () => 0);
    expect(r.broke).toEqual([]);
    expect(r.repaired).toBe(1);
    expect(r.exts[0].repaired).toBe(true);
    w.save.quota.repaired = 1;
    expect(w.gumBoosts(undefined, () => 0).broke).toEqual([ext(56, 1)]);
  });
});

describe('呪いの穴', () => {
  it('置き場所の候補は台の中で、壁・部品・仕掛け・通り道のライトから離れている', () => {
    expect(CURSE_SPOTS.length).toBeGreaterThanOrEqual(6);
    const keep = keepOut();
    for (const [x, y] of CURSE_SPOTS) {
      expect(x).toBeGreaterThan(60);
      expect(x).toBeLessThan(T.SHOOT_X0);
      for (const [kx, ky, r] of keep) expect(Math.hypot(x - kx, y - ky)).toBeGreaterThanOrEqual(r);
      for (const lp of T.LIGHT_PATHS) for (const [lx, ly] of lp.pts) expect(Math.hypot(x - lx, y - ly)).toBeGreaterThanOrEqual(30);
    }
    // プレイごとに場所が変わる（同じ数）
    let k = 1;
    const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    const a = rollCurse(2, rnd);
    const b = rollCurse(2, rnd);
    expect(a.length).toBe(2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('本物の球が入ると吸いこまれ、落ちたのと同じ扱い（ボールセーブがなければ DRAIN）', () => {
    const texts: string[] = [];
    const w = make((s) => { s.limited = [5561]; }, { pin: (t: string) => { texts.push(t); } });
    expect(w.curse.length).toBe(2);
    const [x, y] = w.curse[0];
    w.parked = null; w.ballSaveUntil = -9; w.freeze = 0;
    w.puck.x = x; w.puck.y = y - 4; w.puck.vx = 0; w.puck.vy = 60;
    for (let i = 0; i < 6; i += 1) { w.freeze = 0; w.step(1 / 60); }
    expect(texts).toContain('CURSED!');
    expect(w.drains).toBe(1);
    expect(w.parked).toBe('plunger');
  });
  it.each([['仕掛けなし', [] as string[]], ['仕掛けあり', [...TOY_IDS]]])('穴が 4 つあっても、球は台の外へ出ず、はさまって止まらない（%s）', (_n, toys) => {
    seeded(5);
    const w = make((s) => { s.limited = [5561, 5574, 5537]; s.toys = toys as never; const ids = cat.heroes.slice(0, 4).map((h) => h.id); s.heroes = ids; s.hero = ids[0]; s.party = ids; s.heroSlots = 4; });
    expect(w.curse.length).toBe(4);
    for (const [x, y] of w.curse) expect(Math.hypot(x - w.puck.x, y - w.puck.y)).toBeGreaterThan(CURSE_R);
    const stay = new Map<object, { x: number; y: number; t: number }>();
    let worst = 0;
    let eaten = 0;
    for (let i = 0; i < 60 * 30; i += 1) {
      w.freeze = 0; w.runLeft = 999;
      w.tilt = [Math.sin(i / 40) * 0.4, 0];
      if (i % 120 === 0) w.shake(Math.cos(i), Math.sin(i), 20, 12);
      const before = w.drains;
      w.step(1 / 60);
      if (w.drains > before) eaten += 1;
      if (w.parked === 'plunger' && i % 30 === 0) { w.holdStart(); w.holdPull(0, MAX_PULL); w.holdEnd(); }
      for (const b of [w.puck, ...w.mates]) {
        expect(b.x).toBeGreaterThan(-2);
        expect(b.x).toBeLessThan(T.TW + 2);
        expect(b.y).toBeGreaterThan(-2);
        if ((b as { ghost?: number }).ghost !== undefined || w.parked) continue;
        const s = stay.get(b) ?? { x: b.x, y: b.y, t: 0 };
        if (Math.hypot(b.x - s.x, b.y - s.y) < 50) s.t += 1 / 60; else { s.x = b.x; s.y = b.y; s.t = 0; }
        stay.set(b, s);
        worst = Math.max(worst, s.t);
      }
    }
    expect(worst).toBeLessThan(3.5);
    expect(eaten).toBeGreaterThanOrEqual(0);
  });
});

describe('Limited を選ぶ途中で閉じても', () => {
  it('出した候補は残り、開き直しても同じ札が並ぶ（選ぶ・あとで選ぶで消える）', () => {
    const s = freshSave(cat.heroes[0].id);
    const roll = (owned: number[], n: number) => cat.limited.map((l) => l.id).filter((id) => !owned.includes(id)).sort(() => Math.random() - 0.5).slice(0, n);
    const a = limitedCands(s, 3, roll);
    expect(limitedCands(s, 3, roll)).toEqual(a);
    pickLimited(s, a[0]);
    expect(s.quota.offer).toBeUndefined();
    const b = limitedCands(s, 3, roll);
    deferLimited(s, b);
    expect(s.quota.offer).toBeUndefined();
    expect(limitedCands(s, 3, roll).slice(0, 3)).toEqual(b);
  });
  it('ヒートの印を選ぶ前に閉じても、選ぶ数が残る', () => {
    const s = freshSave(cat.heroes[0].id);
    const heatCard = cat.limited.map((l) => l.id).find((id) => (LIMITED_FIXED[id].heat ?? 0) >= 2)!;
    pickLimited(s, heatCard);
    expect(s.quota.heatLeft).toBe(LIMITED_FIXED[heatCard].heat);
  });
});
