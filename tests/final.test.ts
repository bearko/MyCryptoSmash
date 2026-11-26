import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { freshSave, loadSave, type Save } from '../src/core/save';
import { FINAL_TRIES, QUOTAS, canPlay, clearChallenge, deliver, finalReady, finalResult, normalEnd, quotaAmount, quotaStatus, recordPlay, resetChallenge, startPlay } from '../src/game/quota';
import { FINAL_FLOORS, FINAL_HP, FINAL_TIME, finalBoss, finalScale } from '../src/game/final';
import { RULES, ruleOf } from '../src/game/offers';
import { CLOWN_STEPS, TOY_UNLOCK, clownOf } from '../src/game/toys';
import { PinballWorld } from '../src/game/pinball';

/** チュートリアルを終えて、ノルマ 1 にいるセーブ */
const fresh = (): Save => { const s = freshSave(cat.heroes[0].id); s.quota.n = 1; s.quota.guide = false; s.tutorialDone = true; return s; };
/** ノルマ n まで納めた状態にする（toys を持たせる） */
function upTo(s: Save, n: number): void {
  while (s.quota.n <= n) {
    startPlay(s);
    s.gum = quotaAmount(s.quota.n);
    deliver(s);
  }
}
const joker = (s: Save): void => { s.toys = TOY_UNLOCK.slice(0, CLOWN_STEPS[4]); };

describe('ラストステージ', () => {
  it('始まる条件：ノルマ 10 を納めたときにピエロがジョーカーなら始まる', () => {
    const s = fresh();
    joker(s);
    expect(clownOf(s)).toBe(4);
    upTo(s, QUOTAS - 1);
    expect(s.quota.final).toBe(false); // ジョーカーでもノルマ 10 までは本編
    startPlay(s);
    s.gum = quotaAmount(QUOTAS);
    expect(deliver(s)?.final).toBe(true);
    const st = quotaStatus(s.quota, s.gum);
    expect(st.final).toBe(true);
    expect(st.left).toBe(FINAL_TRIES);
    expect(deliver(s)).toBe(null); // ラストステージの間はノルマがない
  });
  it('ジョーカーでなければ、ノルマ 10 を納めると通常のエンディング（Limited は選ばず、最初からやり直す）', () => {
    const s = fresh();
    s.toys = TOY_UNLOCK.slice(0, CLOWN_STEPS[3]);
    s.up = { y_gum: 4 };
    upTo(s, QUOTAS - 1);
    expect(s.quota.n).toBe(QUOTAS);
    startPlay(s);
    s.gum = quotaAmount(QUOTAS);
    s.emblems = 0;
    const r = deliver(s);
    expect(r?.final).toBe(false);
    expect(r?.ending).toBe(true);
    expect(s.pendingNormal).toBe(true);
    expect(s.quota.picks).toBe(0); // Limited は選ばない
    expect(s.clearRecord?.tier).toBe(3);
    expect(s.clearRecord?.plays).toBe(s.quota.plays);
    const keep = s.emblems;
    expect(keep).toBeGreaterThan(0);
    // エンディングを見終えた：最初から（スキルツリーと使い残したエンブレムは残る。エンドレスは開かない）
    expect(clearChallenge(s)).toBe(keep);
    expect(s.quota.n).toBe(0); // 次の挑戦もチュートリアルのノルマ 0 から（案内はなし）
    expect(s.quota.guide).toBe(false);
    expect(s.toys).toEqual([]);
    expect(s.emblems).toBe(keep);
    expect(s.up).toEqual({ y_gum: 4 });
    expect(s.endless).toBe(false);
    expect(s.escapes).toBe(0);
    expect(s.clears).toBe(1);
    expect(s.pendingNormal).toBe(false);
    expect(finalReady(9, 4, false)).toBe(false);
    expect(finalReady(10, 3, false)).toBe(false);
    expect(finalReady(10, 4, true)).toBe(false); // エンドレスにはない
    expect(normalEnd(10, 3, false)).toBe(true);
    expect(normalEnd(10, 4, false)).toBe(false);
    expect(normalEnd(12, 2, true)).toBe(false); // エンドレスはずっと続く
  });
  it('延長が続いていた古いセーブ（ノルマ 11 以降・ジョーカーでない）は、開いたときに通常のエンディングへ', () => {
    const mem = new Map<string, string>();
    const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    const g = globalThis as unknown as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = ls;
    const s = fresh();
    s.quota.n = 12;
    s.name = 'ベアコ';
    localStorage.setItem('mycryptosmash.save.v1', JSON.stringify(s));
    const l = loadSave(cat.heroes[0].id);
    expect(l.pendingNormal).toBe(true);
    localStorage.removeItem('mycryptosmash.save.v1');
    g.localStorage = prev;
  });
  it('ボスはレイドボス 5 体（10・20・30・40・50 台目）が順に出て、そのボスの台の掟がかかる', () => {
    expect(FINAL_FLOORS).toEqual([10, 20, 30, 40, 50]);
    expect(FINAL_TIME).toBe(90);
    const rules = FINAL_FLOORS.map((_f, i) => finalBoss(i).rule.id);
    expect(new Set(rules).size).toBe(5); // 5 つとも違う掟
    expect(rules).toEqual(FINAL_FLOORS.map((f) => ruleOf(f)!.id));
    expect(RULES.length).toBe(5);
    for (let i = 1; i < 5; i += 1) expect(finalBoss(i).hp).toBeGreaterThan(finalBoss(i - 1).hp);
    // 攻撃力が上がると体力も上がる（平方根で）
    expect(finalScale(6)).toBe(1);
    expect(finalScale(24)).toBeCloseTo(2);
    expect(finalBoss(0, 24).hp).toBeCloseTo(FINAL_HP[0] * 2);
  });
  it('台の上：ボスを倒すと次のボスと掟へ。5 体倒すと脱出（ESCAPE）', () => {
    const s = fresh();
    let ended = '';
    const ev = { gum() {}, item() {}, hero() {}, boss() {}, clear() {}, kill() {}, runEnd(r: string) { ended = r; } };
    const w = new PinballWorld(s, ev as never);
    w.startFinal();
    expect(w.runTime).toBe(FINAL_TIME);
    expect(w.enemies.filter((e) => !e.boss).length).toBe(0); // 的は出ない
    const seen: string[] = [];
    const arts: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const boss = w.enemies.find((e) => e.boss)!;
      expect(boss).toBeTruthy();
      expect(w.final!.i).toBe(i);
      seen.push(w.rule!.id);
      arts.push(boss.art.id);
      w.damage(boss, boss.maxHp * 10, boss.x, boss.y, 'smash');
      for (let k = 0; k < 90 && w.phase !== 'play' && w.phase !== 'over'; k += 1) w.step(1 / 60);
      for (let k = 0; k < 15 && w.phase === 'play' && !w.enemies.some((e) => e.boss && e.hp > 0); k += 1) w.step(1 / 60);
    }
    expect(seen).toEqual(FINAL_FLOORS.map((f) => ruleOf(f)!.id));
    expect(arts).toEqual(FINAL_FLOORS.map((f) => w.bossArt(f).id));
    expect(w.final!.won).toBe(true);
    expect(ended).toBe('allclear');
  });
  it('3 回まで挑める。3 回とも失敗で GAME OVER', () => {
    const s = fresh();
    joker(s);
    upTo(s, QUOTAS);
    expect(s.quota.final).toBe(true);
    const n = s.quota.n;
    startPlay(s);
    expect(s.quota.n).toBe(n); // ノルマのプレイは使わない
    expect(finalResult(s, false)).toBe('retry');
    startPlay(s);
    expect(finalResult(s, false)).toBe('retry');
    expect(quotaStatus(s.quota, s.gum).left).toBe(1);
    startPlay(s);
    expect(finalResult(s, false)).toBe('over');
    expect(canPlay(s.quota, s.gum)).toBe(false);
    expect(quotaStatus(s.quota, s.gum).over).toBe(true);
  });
  it('突破すると脱出：記録が残り、エンドレスが開く（ノルマは続きから 4 倍で続く）', () => {
    const s = fresh();
    s.name = 'ベアコ';
    joker(s);
    upTo(s, QUOTAS);
    recordPlay(s, 12345);
    recordPlay(s, 99);
    startPlay(s);
    expect(finalResult(s, true)).toBe('escape');
    expect(s.endless).toBe(true);
    expect(s.escapes).toBe(1);
    expect(s.escapeRecord).toEqual({ name: 'ベアコ', plays: s.quota.plays, bestGum: 12345 });
    expect(s.escapeRecord!.plays).toBe(QUOTAS + 1);
    const st = quotaStatus(s.quota, s.gum);
    expect(st.final).toBe(false);
    expect(st.need).toBe(quotaAmount(QUOTAS + 1));
    // エンドレスではラストステージは来ず、どこまで納めたかを記録する
    upTo(s, QUOTAS + 3);
    expect(s.quota.final).toBe(false);
    expect(s.endlessBest).toBe(QUOTAS + 3);
  });
  it('GAME OVER のあと：脱出したことがあれば「エンドレスを最初から」を選べる', () => {
    const s = fresh();
    resetChallenge(s, true);
    expect(s.endless).toBe(false); // 脱出していなければ選べない
    s.escapes = 1;
    s.endlessBest = 14;
    resetChallenge(s, true);
    expect(s.endless).toBe(true);
    expect(s.quota.n).toBe(0); // エンドレスもチュートリアルのノルマ 0 から
    expect(s.endlessBest).toBe(14); // 記録は残る
    resetChallenge(s, false);
    expect(s.endless).toBe(false);
    expect(s.escapes).toBe(1);
  });
});
