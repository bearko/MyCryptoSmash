import { describe, expect, it } from 'vitest';
import { HARMONICS, KIT, stats } from '../src/audio/dsp';
import { buildRig, MAX_SOUNDS, claim, sfxOut, sfxSend } from '../src/audio/engine';
import { AGE, AHEAD, AHEAD_BRACE, AHEAD_MAX, Conductor, LATE_OK, Lookahead, TICK } from '../src/audio/music';
import { SFX_NAMES, placeSfx } from '../src/audio/sfx';
import { SCENES, gateOn, songOf } from '../src/audio/songs';
import { PENTA, chimeStep, chordOf, degree, ftom, mtof, noteNum, snap, toGrid, voicing } from '../src/audio/theory';

// ---------------------------------------------------------------- にせの AudioContext（作った部品と、鳴らす時刻を数える）
interface Log { made: Record<string, number>; starts: { kind: string; t: number; buf?: string }[]; params: number; bad: string[] }
function fakeCtx(): { ctx: BaseAudioContext; log: Log; clock: { t: number } } {
  const log: Log = { made: {}, starts: [], params: 0, bad: [] };
  const clock = { t: 0 };
  const param = (name: string): unknown => {
    const check = (v: number, t: number, what: string): void => {
      log.params += 1;
      if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) log.bad.push(`${name}.${what}(${v}, ${t})`);
    };
    const p: Record<string, unknown> = {
      value: 0,
      setValueAtTime: (v: number, t: number) => { check(v, t, 'set'); return p; },
      setTargetAtTime: (v: number, t: number, k: number) => { check(v, t, 'target'); if (!(k > 0)) log.bad.push(`${name}: 時定数 ${k}`); return p; },
      exponentialRampToValueAtTime: (v: number, t: number) => { check(v, t, 'exp'); if (!(v > 0)) log.bad.push(`${name}: exp → ${v}`); return p; },
      linearRampToValueAtTime: (v: number, t: number) => { check(v, t, 'lin'); return p; },
      cancelScheduledValues: () => p,
    };
    return p;
  };
  const node = (kind: string): unknown => {
    log.made[kind] = (log.made[kind] ?? 0) + 1;
    const props: Record<string, unknown> = {};
    const n: unknown = new Proxy(props, {
      get(t, k: string) {
        if (k === 'connect') return (to: unknown) => to;
        if (k === 'disconnect' || k === 'setPeriodicWave' || k === 'stop') return () => undefined;
        if (k === 'start') return (at = 0) => { log.starts.push({ kind, t: at, buf: (t.buffer as { name?: string } | undefined)?.name }); };
        if (k === 'buffer' || k === 'type' || k === 'loop' || k === 'curve') return t[k];
        if (!(k in t)) t[k] = param(`${kind}.${k}`);
        return t[k];
      },
      set(t, k: string, v) { t[k] = v; return true; },
    });
    return n;
  };
  const ctx = new Proxy({}, {
    get(_t, k: string) {
      if (k === 'currentTime') return clock.t;
      if (k === 'sampleRate') return 8000;
      if (k === 'destination') return {};
      if (k === 'state') return 'running';
      if (k === 'createBuffer') return (_ch: number, len: number) => { const d = new Float32Array(len); return { length: len, duration: len / 8000, getChannelData: () => d }; };
      if (k === 'createPeriodicWave') return () => ({});
      if (k.startsWith('create')) return () => node(k.slice(6));
      return undefined;
    },
  }) as unknown as BaseAudioContext;
  return { ctx, log, clock };
}

describe('音の計算', () => {
  it('音名とコードが読める', () => {
    expect(noteNum('A4')).toBe(69);
    expect(noteNum('C#5')).toBe(73);
    expect(noteNum('Bb3')).toBe(58);
    expect(mtof(69)).toBeCloseTo(440);
    expect(ftom(880)).toBeCloseTo(81);
    expect(chordOf('Bb7')).toEqual({ root: 10, tones: [0, 4, 7, 10] });
    expect(chordOf('Dm').tones).toEqual([0, 3, 7]);
  });
  it('和音は真ん中の高さのまわりに集まる', () => {
    for (const name of ['Dm', 'Bb7', 'A7', 'Gm', 'F', 'BbM7']) {
      const v = voicing(chordOf(name), 65);
      expect(v).toHaveLength(3);
      for (const m of v) expect(Math.abs(m - 65)).toBeLessThanOrEqual(6);
    }
  });
  it('効果音の高さは、曲の音階に寄る', () => {
    for (let f = 100; f < 3000; f *= 1.07) {
      const m = snap(ftom(f), 62, PENTA.min);
      expect(PENTA.min).toContain(((m - 62) % 12 + 12) % 12);
      expect(Math.abs(m - ftom(f))).toBeLessThanOrEqual(1.5);
    }
  });
  it('続けて当たるほど音階を上り、高くなりすぎない', () => {
    let prev = -1;
    for (let s = 0; s <= 14; s += 1) { const m = degree(62, 'min', chimeStep(s)); expect(m).toBeGreaterThan(prev); prev = m; }
    for (let s = 0; s < 200; s += 1) expect(mtof(degree(74, 'min', chimeStep(s)))).toBeLessThan(5000);
  });
  it('次の拍までの時間', () => {
    expect(toGrid(1.01, 0, 0.125)).toBeCloseTo(0.115);
    expect(toGrid(1.0, 0, 0.125)).toBeCloseTo(0);
  });
});

describe('計算で作る音（ドラムと効果音のからだ）', () => {
  it('どれも無音でなく、割れず、短い', () => {
    for (const [name, make] of Object.entries(KIT)) {
      const s = stats(make(22050), 22050);
      expect(s.peak, name).toBeLessThanOrEqual(1);
      expect(s.peak, name).toBeGreaterThan(0.3);
      expect(s.rms, name).toBeGreaterThan(0.01);
      expect(s.sec, name).toBeLessThanOrEqual(2.01);
      expect(Number.isFinite(s.rms), name).toBe(true);
    }
  });
  it('終わりで音が切れない（最後はほぼ 0）', () => {
    for (const [name, make] of Object.entries(KIT)) {
      if (name === 'noise') continue;
      const w = make(22050);
      expect(Math.abs(w[w.length - 1]), name).toBeLessThan(0.02);
    }
  });
  it('倍音の並びは基音がいちばん強い', () => {
    for (const [name, h] of Object.entries(HARMONICS)) { expect(h[0], name).toBe(0); expect(h[1], name).toBe(1); expect(Math.max(...h), name).toBe(1); }
  });
});

describe('曲の楽譜', () => {
  it('8 曲がそろい、割りが合っている', () => {
    expect(SCENES).toEqual(['idle', 'play', 'boss', 'shop', 'lab', 'result', 'gameover', 'ending']);
    for (const n of SCENES) {
      const s = songOf(n);
      expect(s.steps).toBe(s.bars * s.beats * s.div);
      expect(s.lines.lead ?? s.lines.bell, n).toBeTruthy();
      for (const l of Object.values(s.lines)) expect(l.ev).toHaveLength(s.steps);
      for (const d of s.drums) expect(d.hits).toHaveLength(s.steps);
    }
  });
  it('メロディと和音は、その小節のコードか音階の音（外れた音は経過音だけ＝短い）', () => {
    for (const n of SCENES) {
      const s = songOf(n);
      const scale = s.mode === 'min' ? [0, 2, 3, 5, 7, 8, 9, 10, 11, 1, 6] : [0, 2, 4, 5, 7, 9, 11];
      for (const st of Object.values(s.stabs)) {
        st.ev.forEach((e, i) => {
          if (!e) return;
          const ch = s.chords[Math.floor(i / s.perBar)];
          for (const m of e.notes) expect(ch.tones.map((t) => (ch.root + t) % 12), `${n} ${i}`).toContain(m % 12);
        });
      }
      for (const key of ['lead', 'lead2'] as const) {
        s.lines[key]?.ev.forEach((e, i) => {
          if (!e) return;
          const ch = s.chords[Math.floor(i / s.perBar)];
          const pc = ((e.m - 62) % 12 + 12) % 12;
          const inChord = ch.tones.some((t) => (ch.root + t) % 12 === e.m % 12);
          // コードの外の長い音（2 拍以上）は置かない
          if (!inChord) expect(e.len, `${n} ${key} ${i}`).toBeLessThan(s.div * 2);
          expect(inChord || scale.includes(pc), `${n} ${key} ${i}: ${e.m}`).toBe(true);
        });
      }
    }
  });
  it('ピエロの段階が上がるほど・盛り上がるほど、鳴る楽器が増える', () => {
    const count = (stage: number, heat: number): number => {
      const s = songOf('play');
      const parts = [...Object.values(s.lines), ...Object.values(s.stabs)].filter((g) => gateOn(g, stage, heat)).length;
      return parts * 10 + new Set(s.drums.filter((d) => gateOn(d, stage, heat)).map((d) => d.kit)).size;
    };
    for (let st = 1; st <= 4; st += 1) expect(count(st, 0.5)).toBeGreaterThan(count(st - 1, 0.5));
    expect(count(0, 0)).toBeLessThan(13); // 段階 0：リード 1 本と木魚だけ
    expect(count(4, 1)).toBeGreaterThan(count(4, 0));
    expect(count(4, 1)).toBeGreaterThanOrEqual(60 + 6); // ジョーカーの最高潮：全員
    // 20 連鎖（1）から先は同じ（ずっと最高潮）
    expect(AGE[0].lp).toBeLessThan(AGE[4].lp);
    expect(AGE[0].wow).toBeGreaterThan(AGE[4].wow);
  });
});

describe('スケジューラ', () => {
  it('タイマーがばらついても、拍は格子からずれず、過去に音を置かない', () => {
    const { ctx, log, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setStage(4);
    c.setHeat(1);
    c.setScene('play', 'now');
    let seed = 7;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let late = 0;
    const from = log.starts.length;
    while (clock.t < 30) {
      const before = log.starts.length;
      c.pump(clock.t + AHEAD);
      for (const s of log.starts.slice(before)) if (s.t < clock.t - 1e-6) late += 1;
      // ふつうは 30ms、ときどき 80ms つまる（先読みの中）
      clock.t += (rnd() < 0.1 ? 80 : TICK * (0.7 + rnd() * 0.6)) / 1000;
    }
    expect(late).toBe(0);
    expect(c.skipped).toBe(0);
    const song = songOf('play');
    const sd = 60 / song.bpm / song.div;
    const t0 = c.nextT - c.placed * sd;
    // キックなどの時刻は、はじめの音から数えてステップの格子（はねる分をのぞく）に乗る
    let worst = 0;
    for (const s of log.starts.slice(from)) {
      if (s.kind !== 'BufferSource' || s.t === 0) continue;
      const k = (s.t - t0) / sd;
      const off = Math.min(Math.abs(k - Math.round(k)), Math.abs(k - song.swing - Math.floor(k)));
      worst = Math.max(worst, off * sd);
    }
    expect(worst).toBeLessThan(0.0005);
    expect(c.placed).toBeGreaterThan(30 / sd - 4);
    expect(log.bad).toEqual([]);
  });
  it('タイマーが長く止まったら、過ぎた分は飛ばして拍の位置を保つ', () => {
    const { ctx, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setScene('play', 'now');
    c.pump(0.2);
    const sd = c.stepDur;
    const origin = c.nextT - c.placed * sd;
    clock.t = 3.33;
    c.pump(clock.t + AHEAD);
    expect(c.skipped).toBeGreaterThan(10);
    expect(c.nextT).toBeGreaterThan(clock.t);
    const k = (c.nextT - origin) / sd;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
  });
  it('音ごとに作る部品は少ない（発音体は鳴らしっぱなし）', () => {
    const { ctx, log, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setStage(4);
    c.setHeat(1);
    c.setScene('boss', 'now');
    c.pump(0.5);
    const osc0 = log.made.Oscillator;
    const src0 = log.made.BufferSource;
    for (clock.t = 0.5; clock.t < 20; clock.t += 0.03) c.pump(clock.t + AHEAD);
    expect(log.made.Oscillator).toBe(osc0); // 曲の間、オシレーターは増えない
    expect(osc0).toBeLessThanOrEqual(20);
    // ドラム 1 発につき、再生 1 ＋ 音量 1 だけ。1 秒あたり 40 発まで
    expect((log.made.BufferSource - src0) / 19.5).toBeLessThan(40);
  });
  it('曲は拍の頭で切りかわり、TIME UP のあとはしばらく黙る', () => {
    const { ctx, log, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setStage(3);
    c.setScene('play', 'now');
    for (; clock.t < 2; clock.t += 0.03) c.pump(clock.t + AHEAD);
    const beat = 60 / songOf('play').bpm;
    const origin = c.nextT - c.placed * c.stepDur;
    c.setScene('shop');
    for (; clock.t < 3; clock.t += 0.03) { c.pump(clock.t + AHEAD); if (c.song?.name === 'shop') break; }
    expect(c.song?.name).toBe('shop');
    const sw = (c.nextT - c.step * c.stepDur - origin) / beat;
    expect(Math.abs(sw - Math.round(sw))).toBeLessThan(1e-6);
    // 止めの一発
    c.hit('timeup', clock.t);
    const at = clock.t;
    c.setScene('result');
    const n = log.starts.length;
    for (; clock.t < at + 4; clock.t += 0.03) c.pump(clock.t + AHEAD);
    const after = log.starts.slice(n).filter((s) => s.t > at + 0.2);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after.map((s) => s.t))).toBeGreaterThanOrEqual(at + 1.5 - 1e-6);
    expect(c.song?.name).toBe('result');
  });
  it('転調すると、効果音の調も一緒に上がる', () => {
    const { ctx, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setScene('play', 'now');
    c.pump(0.3);
    expect(c.keyInfo().tonic).toBe(62);
    c.setShift(2);
    for (clock.t = 0.3; clock.t < 1.5; clock.t += 0.03) c.pump(clock.t + AHEAD);
    expect(c.keyInfo().tonic).toBe(64);
    expect(c.keyInfo().mode).toBe('min');
  });
});

describe('効果音', () => {
  it('どの音も、おかしな値を書かず、部品が多すぎない', () => {
    const key = { tonic: 62, mode: 'min' as const, chord: chordOf('A7') };
    for (const name of SFX_NAMES) {
      for (const o of [{}, { x: -1, power: 0, step: 0, p: 0.5 }, { x: 1, power: 1, step: 40, p: 2 }]) {
        const { ctx, log } = fakeCtx();
        const rig = buildRig(ctx);
        const base = Object.values(log.made).reduce((a, b) => a + b, 0);
        const sec = placeSfx(rig, key, name, o, 1);
        const made = Object.values(log.made).reduce((a, b) => a + b, 0) - base;
        expect(log.bad, name).toEqual([]);
        expect(sec, name).toBeGreaterThan(0);
        expect(sec, name).toBeLessThanOrEqual(3);
        expect(made, name).toBeGreaterThan(0);
        expect(made, name).toBeLessThanOrEqual(110);
        // よく鳴る音は軽く
        if (['pip', 'spin', 'count', 'hover', 'tap', 'wall', 'flipper'].includes(name)) expect(made, name).toBeLessThanOrEqual(12);
      }
    }
  });
  it('F1 と約束した名前がある', () => {
    for (const n of ['confirm', 'cancel', 'tab', 'open', 'close', 'buy', 'deny', 'wipe', 'tap', 'hover', 'page', 'count', 'mult', 'evolve', 'levelup']) expect(SFX_NAMES).toContain(n);
  });
  it('同時に鳴る数に上限があり、重なるほど小さくなる', () => {
    const vols: number[] = [];
    for (let i = 0; i < MAX_SOUNDS + 10; i += 1) vols.push(claim(0.05));
    expect(vols.filter((v) => v > 0)).toHaveLength(MAX_SOUNDS);
    expect(vols[0]).toBe(1);
    expect(vols[MAX_SOUNDS - 1]).toBeLessThan(0.5);
    expect(claim(0.05, true)).toBeGreaterThan(0); // 大事な音は上限をこえても鳴る
  });
});

// ---------------------------------------------------------------- 音の抜け（メインスレッドが詰まったとき）
/** 重い端末のまね：ふつうは 1 コマ gapMs、everySec ごとに stallMs つまる。sec 秒まわして、飛ばした数・遅れて鳴らした数・過去に置いた数を返す */
function jam(aheadOf: (now: number) => number, o: { sec: number; gapMs: number; stallMs: number; everySec: number; brace?: (at: number) => void }): { skipped: number; late: number; past: number; placed: number } {
  const { ctx, log, clock } = fakeCtx();
  const c = new Conductor(buildRig(ctx));
  c.setScene('play', 'now');
  c.setStage(4);
  c.setHeat(1);
  let past = 0;
  let nextStall = o.everySec;
  while (clock.t < o.sec) {
    const before = log.starts.length;
    c.pump(clock.t + aheadOf(clock.t));
    for (const s of log.starts.slice(before)) if (s.t < clock.t - 1e-6) past += 1;
    if (clock.t >= nextStall) { nextStall += o.everySec; clock.t += o.stallMs / 1000; } else clock.t += o.gapMs / 1000;
  }
  return { skipped: c.skipped, late: c.late, past, placed: c.placed };
}

describe('音の抜け', () => {
  it('先読みは、詰まった長さを覚えて長くなり、時間がたつと戻る', () => {
    const la = new Lookahead();
    expect(la.next(0)).toBe(AHEAD);
    expect(la.next(0.03)).toBe(AHEAD);
    // 0.26 秒つまった → 次からは、その長さより先まで置く
    expect(la.next(0.29)).toBeGreaterThan(0.26 + 0.1);
    expect(la.ahead).toBeLessThanOrEqual(AHEAD_MAX);
    // しばらく軽ければ戻る
    let t = 0.29;
    for (let i = 0; i < 2000; i += 1) { t += 0.03; la.next(t); }
    expect(la.ahead).toBe(AHEAD);
    // タブを離れていた間（2 秒より長い）は、詰まりに数えない
    la.next(t + 30);
    expect(la.ahead).toBe(AHEAD);
    // 重い場面にそなえる
    la.brace(t + 30, 3);
    expect(la.next(t + 30.03)).toBe(AHEAD_BRACE);
    expect(la.next(t + 34)).toBeLessThan(AHEAD_BRACE);
  });
  it('0.26 秒の詰まりが 1.5 秒ごとに来ても、はじめの 1 回のほかは音が抜けない（前は何度も抜けた）', () => {
    const o = { sec: 30, gapMs: 33, stallMs: 260, everySec: 1.5 };
    // 前のやり方：先読みは 0.2 秒のまま（抜けたあとで 0.1 秒ずつ足すだけ）
    const before = jam(() => AHEAD, o);
    const la = new Lookahead();
    const after = jam((now) => la.next(now), o);
    // 先読みが 0.2 秒のままだと、詰まるたびに抜けるか遅れることが多い
    expect(before.skipped + before.late).toBeGreaterThanOrEqual(8);
    expect(before.skipped).toBeGreaterThanOrEqual(5);
    expect(after.late).toBeLessThanOrEqual(1);
    expect(after.skipped).toBeLessThanOrEqual(1);
    expect(after.past).toBe(0);
    expect(after.placed).toBeGreaterThan(before.placed);
  });
  it('重いコマ（120ms）が続き、0.2 秒をわずかにこえる詰まりがときどき来ても抜けない', () => {
    const la = new Lookahead();
    const r = jam((now) => la.next(now), { sec: 30, gapMs: 120, stallMs: 230, everySec: 2.2 });
    expect(r.skipped).toBeLessThanOrEqual(1);
    expect(r.past).toBe(0);
  });
  it('わずかな遅れ（LATE_OK まで）は、飛ばさずにいますぐ鳴らす', () => {
    const { ctx, log, clock } = fakeCtx();
    const c = new Conductor(buildRig(ctx));
    c.setScene('play', 'now');
    c.pump(0.2);
    // 次のステップの時刻を、LATE_OK の半分だけ過ぎてから置きに来る
    clock.t = c.nextT + LATE_OK / 2;
    const before = log.starts.length;
    c.pump(clock.t + AHEAD);
    expect(c.skipped).toBe(0);
    expect(c.late).toBe(1);
    for (const s of log.starts.slice(before)) expect(s.t).toBeGreaterThanOrEqual(clock.t);
    // 大きく遅れたら飛ばす（拍の位置は保つ）
    const sd = c.stepDur;
    const origin = c.nextT;
    clock.t = c.nextT + sd * 3 + LATE_OK * 2;
    c.pump(clock.t + AHEAD);
    expect(c.skipped).toBeGreaterThanOrEqual(3);
    const k = (c.nextT - origin) / sd;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
  });
  it('効果音の出口（左右・響き）は使い回す：同じ音を 200 回鳴らしても増えない', () => {
    const { ctx, log } = fakeCtx();
    const rig = buildRig(ctx);
    const key = { tonic: 62, mode: 'min' as const, chord: chordOf('A7') };
    placeSfx(rig, key, 'bumper', { x: 0.5, power: 0.8, step: 3 }, 1);
    const pan0 = log.made.StereoPanner ?? 0;
    const all0 = Object.values(log.made).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 200; i += 1) placeSfx(rig, key, 'bumper', { x: 0.5, power: 0.8, step: i }, 1 + i * 0.05);
    expect(log.made.StereoPanner ?? 0).toBe(pan0);
    const per = (Object.values(log.made).reduce((a, b) => a + b, 0) - all0) / 200;
    // 丸いばね：ドン・カチッ（音源 + 音量）× 2 と、ベル（発振 2 + 音量 2）だけ
    expect(per).toBeLessThanOrEqual(8);
    expect(sfxOut(rig, 0)).toBe(rig.sfx);
    expect(sfxOut(rig, 0.5)).toBe(sfxOut(rig, 0.52));
    expect(sfxSend(rig, 0.25)).toBe(sfxSend(rig, 0.25));
    // 左右の出口は多くても 8 つ
    for (let x = -1; x <= 1; x += 0.01) sfxOut(rig, x);
    expect(rig.pans.size).toBeLessThanOrEqual(8);
  });
});
