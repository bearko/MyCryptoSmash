// 実況：連続ヒット（連鎖）が続くほど派手にほめる。20 連鎖からはずっと最高潮で、ことばも変わる。
// 何を言うかだけを決める（声と文字の出し方は main.ts と ui/callout.ts）。

/** 連鎖の段階ごとのことば（0：2〜4 連鎖、1：5〜9、2：10〜19、3：20〜） */
export const TIERS: readonly (readonly string[])[] = [
  ['Hmm...', 'Nice!', 'Good!', 'Okay!', 'There it is!', 'Wow!'],
  ['Great!', 'Awesome!', 'Look at that!', 'Beautiful!', 'Oh yes!', 'Here we go!', 'What a hit!'],
  ['Fantastic!', 'Gorgeous!', 'Splendid!', 'Brilliant!', 'Sensational!', 'Spectacular!', 'Incredible!', 'Oh my!', 'Boom!', 'Superb!', 'Outstanding!'],
  ['Unbelievable!', 'Amazing!', 'Magic!', 'Unstoppable!', 'Are you kidding me?!', 'Oh my goodness!', 'Absolutely ridiculous!',
    'Out of this world!', 'Phenomenal!', 'Legendary!', 'On fire!', 'Can you believe it?!', 'Pure magic!', 'Insane!',
    'History in the making!', 'Whoa, whoa, whoa!'],
];

/** 区切りの連鎖数で言う（割りこんで言う） */
export const MILESTONES: Record<number, string> = {
  5: 'Five hit combo!',
  10: 'Ten in a row!',
  20: 'Twenty in a row!',
  30: 'Thirty! He just keeps going!',
  50: 'Fifty! Fifty in a row!',
  100: 'One hundred! I have never seen anything like it!',
};

export const EVENTS = {
  smash: 'Smash!',
  weak: 'Right on the weak spot!',
  boss: 'Here comes the boss!',
  bossDown: 'The boss is down!',
  clear: 'Stage clear!',
  runEnd: 'What a run! Give it up!',
  newSkill: 'New skill unlocked!',
  powerUp: 'Power up!',
  allClear: 'History in the making!',
} as const;

/** 20 連鎖からが最高潮 */
export const PEAK = 20;
export const tierOf = (combo: number): number => (combo >= PEAK ? 3 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0);

/** 段階ごとに、ほめことばのあいだに空ける時間（秒）。最高潮はしゃべり終わったらすぐ次 */
const GAP = [1.4, 0.9, 0.45, 0];

export interface Call { text: string; tier: number; kind: 'cheer' | 'milestone' | 'event' }
/** 出せたら true（声で言えた、または声なしで文字を出した） */
export type Out = (call: Call, priority: boolean) => boolean;

export class Announcer {
  private lastAt = -99;
  private recent: string[] = [];
  private weakAt = -99;
  private smashAt = -99;
  constructor(private out: Out, private rand: () => number = Math.random) {}

  private emit(call: Call, priority: boolean, now: number): boolean {
    const ok = this.out(call, priority);
    if (ok) {
      this.lastAt = now;
      this.recent = [call.text, ...this.recent].slice(0, 4);
    }
    return ok;
  }

  /** 同じことばが続かないように選ぶ */
  pick(list: readonly string[]): string {
    const pool = list.filter((t) => !this.recent.includes(t));
    const from = pool.length ? pool : list;
    return from[Math.floor(this.rand() * from.length)];
  }

  /** 当たったとき（combo はいまの連鎖数） */
  hit(now: number, combo: number, weak: boolean, smash: boolean): void {
    const m = MILESTONES[combo];
    if (m) { this.emit({ text: m, tier: tierOf(combo), kind: 'milestone' }, true, now); return; }
    const t = tierOf(combo);
    if (weak && combo < 10 && now - this.weakAt > 8) {
      if (this.emit({ text: EVENTS.weak, tier: Math.max(1, t), kind: 'event' }, false, now)) this.weakAt = now;
      return;
    }
    if (smash && combo < PEAK && now - this.smashAt > 5) {
      if (this.emit({ text: EVENTS.smash, tier: Math.max(1, t), kind: 'event' }, false, now)) this.smashAt = now;
      return;
    }
    if (combo < 2 || now - this.lastAt < GAP[t]) return;
    this.emit({ text: this.pick(TIERS[t]), tier: t, kind: 'cheer' }, false, now);
  }

  /** 連鎖が切れた */
  comboEnd(now: number, n: number): void {
    if (n >= 10) this.emit({ text: EVENTS.runEnd, tier: 2, kind: 'event' }, false, now);
  }

  event(now: number, key: keyof typeof EVENTS, tier: number, priority = true): boolean {
    return this.emit({ text: EVENTS[key], tier, kind: 'event' }, priority, now);
  }
}
