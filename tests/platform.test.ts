import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshSave, type Save } from '../src/core/save';
import { deliver, skipTutorial, startPlay } from '../src/game/quota';

type Sent = [number, string];
const g = globalThis as unknown as { window?: unknown };

/** 名前を決めたばかりの、はじめての挑戦のセーブ（ノルマ 0・案内つき） */
function fresh(): Save {
  const s = freshSave(1);
  s.name = 'テスト';
  return s;
}

async function load(sdk: 'ok' | 'none' | 'broken'): Promise<{ p: typeof import('../src/ui/platform'); sent: Sent[]; inits: Record<string, unknown>[]; shown: boolean[] }> {
  vi.resetModules();
  const sent: Sent[] = [];
  const inits: Record<string, unknown>[] = [];
  const shown: boolean[] = [];
  const api = {
    init: (o: Record<string, unknown>) => { inits.push(o); return Promise.resolve({ ok: true }); },
    tutorialStep: (step: number, id: string) => { if (sdk === 'broken') throw new Error('down'); sent.push([step, id]); return Promise.resolve({ ok: true }); },
    unlockTrophy: () => Promise.reject(new Error('not registered')),
    submitScore: () => Promise.resolve({ ok: false }),
    rta: { start: () => Promise.resolve({}), checkpoint: () => Promise.resolve({}), abort: () => undefined },
    chat: { open: () => { if (sdk === 'broken') throw new Error('down'); }, setVisible: (on: boolean) => { if (sdk === 'broken') throw new Error('down'); shown.push(on); } },
  };
  g.window = { addEventListener: () => undefined, ...(sdk === 'none' ? {} : { BearkoGames: api }) };
  const p = await import('../src/ui/platform');
  p.startPlatform();
  return { p, sent, inits, shown };
}

describe('共通基盤への窓口', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('このタイトルとして SDK を始める。チャットはゲームが自分で開く窓。来訪の数は止めない', async () => {
    const { inits, p } = await load('ok');
    expect(inits.length).toBe(1);
    expect(inits[0]!.game).toBe('smash');
    expect(typeof inits[0]!.version).toBe('string');
    expect(inits[0]!.chat).toEqual({ layout: 'float', button: false });
    expect(inits[0]!.presence).toBeUndefined();
    expect(p.platformOn()).toBe(true);
  });

  it('プレイ中はチャットを隠し、終わると戻す（変わったときだけ）', async () => {
    const { p, shown } = await load('ok');
    p.setPlaying(true);
    p.setPlaying(true);
    p.setPlaying(false);
    expect(shown).toEqual([false, true]);
  });

  it('案内つきのチュートリアルの段を、順に 1 回ずつ送る。最後は本当のノルマ 1 の打ち出しで done', async () => {
    const { p, sent } = await load('ok');
    const s = fresh();
    p.trackTutorial(s);
    expect(s.tutTrack).toBe(true);
    startPlay(s); p.trackTutorial(s);
    s.toys.push('sling'); p.trackTutorial(s);
    startPlay(s); p.trackTutorial(s);
    s.toys.push('inlane'); p.trackTutorial(s);
    startPlay(s); p.trackTutorial(s);
    p.trackTutorial(s);
    expect(deliver(s)?.tutorial).toBe(true);
    p.trackTutorial(s);
    s.toys.push('bumper'); p.trackTutorial(s);
    expect(sent.map((x) => x[1]).includes('done')).toBe(false);
    startPlay(s); p.trackTutorial(s);
    p.trackTutorial(s);
    const ids = sent.map((x) => x[1]);
    expect(ids).toEqual(Object.keys(p.STEPS));
    // 番号は段とともに増え、0〜99。最後は done。id は英小文字・数字・_・- の 40 文字まで
    const nums = Object.values(p.STEPS);
    expect(sent.map((x) => x[0])).toEqual(nums);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    expect(nums[0]).toBe(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(99);
    expect(Object.keys(p.STEPS).pop()).toBe('done');
    for (const id of Object.keys(p.STEPS)) expect(/^[a-z0-9_-]{1,40}$/.test(id)).toBe(true);
    // ノルマ 2 から先は何も送らない
    s.quota.n = 2;
    expect(p.tutorialSteps(s)).toEqual([]);
  });

  it('「案内をとばす」で、その場で done', async () => {
    const { p, sent } = await load('ok');
    const s = fresh();
    p.trackTutorial(s);
    startPlay(s); p.trackTutorial(s);
    skipTutorial(s); p.trackTutorial(s);
    expect(sent.map((x) => x[1])).toEqual(['start', 'launch_1', 'done']);
  });

  it('名前を決める前・遊んだことのある古いセーブ・2 回目からの挑戦では送らない', async () => {
    const { p, sent } = await load('ok');
    const noName = freshSave(1);
    p.trackTutorial(noName);
    const old = fresh();
    old.quota.guide = false;
    old.tutorialDone = true;
    p.trackTutorial(old);
    const later = fresh();
    later.quota.n = 4;
    p.trackTutorial(later);
    expect(sent).toEqual([]);
    expect(noName.tutTrack).toBeUndefined();
    expect(old.tutTrack).toBeUndefined();
  });

  it('セーブするたびに段を送る（writeSave のあとで）', async () => {
    const { sent } = await load('ok');
    const s = fresh();
    // 窓口が読んだのと同じセーブのモジュール（resetModules のあと）
    (await import('../src/core/save')).writeSave(s);
    expect(sent.map((x) => x[1])).toEqual(['start']);
  });

  it('SDK が無い・呼び出しが失敗しても、ゲームは続く', async () => {
    for (const sdk of ['none', 'broken'] as const) {
      const { p } = await load(sdk);
      const { writeSave } = await import('../src/core/save');
      const s = fresh();
      expect(() => {
        p.trackTutorial(s);
        p.unlockTrophy('x');
        p.submitScore({ a: 1 });
        p.rta.start('r');
        p.rta.checkpoint('c', 1);
        p.rta.abort();
        p.openChat();
        p.setPlaying(true);
        p.setPlaying(false);
        writeSave(s);
      }).not.toThrow();
      expect(p.platformOn()).toBe(sdk === 'broken');
    }
    // window がまったくない（テスト・道具）
    vi.resetModules();
    delete g.window;
    const p = await import('../src/ui/platform');
    expect(() => {
      p.startPlatform();
      p.trackTutorial(fresh());
    }).not.toThrow();
  });
});
