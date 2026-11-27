// その場で演奏する BGM。先読みのスケジューラ（Conductor）が、楽譜（songs.ts）を 1 ステップずつ WebAudio に置いていく。
// 楽器は鳴らしっぱなしの発音体（オシレーター）に音の高さと大きさを書きこむ形で、音ごとに部品を作らない（軽い）。
// 盛り上がり（連鎖）とピエロの段階で楽器が増え、マルチボール・ZONE で転調し、残り 10 秒で速くなる。

import { buf, buildRig, duck, liveRig, wave, type Rig } from './engine';
import { gateOn, songOf, type SceneName, type Song } from './songs';
import { mtof, type Chord, type Mode } from './theory';

export type HitKind = 'fill' | 'crash' | 'launch' | 'jackpot' | 'drain' | 'timeup' | 'multiball' | 'zone';
export interface KeyInfo { tonic: number; mode: Mode; chord: Chord }

/** ピエロの段階ごとの「古さ」：低い音と高い音の削り・テープのゆれ（セント）・レコードのぷちぷち */
export const AGE = [
  { hp: 380, lp: 2600, wow: 20, crackle: 0.2 },
  { hp: 220, lp: 4200, wow: 11, crackle: 0.11 },
  { hp: 110, lp: 7500, wow: 5, crackle: 0.05 },
  { hp: 50, lp: 12000, wow: 2.5, crackle: 0.015 },
  { hp: 30, lp: 18000, wow: 1, crackle: 0 },
] as const;

interface Env { a: number; r: number; vol: number }

/** 鳴らしっぱなしの単音の発音体 */
class Mono {
  osc: OscillatorNode;
  vca: GainNode;
  filt: BiquadFilterNode | null = null;
  sub: OscillatorNode | null = null;
  constructor(private rig: Rig, dest: AudioNode, type: OscillatorType | string, filter: boolean, sub: boolean, wow: AudioNode) {
    const c = rig.ctx;
    this.osc = c.createOscillator();
    this.setWave(type);
    this.vca = c.createGain();
    this.vca.gain.value = 0;
    let head: AudioNode = this.osc;
    if (filter) {
      this.filt = c.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = 800;
      head = this.osc.connect(this.filt);
    }
    head.connect(this.vca).connect(dest);
    wow.connect(this.osc.detune);
    if (sub) {
      this.sub = c.createOscillator();
      this.sub.type = 'sine';
      const sg = c.createGain();
      sg.gain.value = 0.55;
      this.sub.connect(sg).connect(this.vca);
      this.sub.start();
    }
    this.osc.start();
  }
  setWave(type: string): void {
    if (type === 'sine' || type === 'square' || type === 'sawtooth' || type === 'triangle') this.osc.type = type;
    else this.osc.setPeriodicWave(wave(this.rig, type));
  }
  note(t: number, m: number, dur: number, vel: number, e: Env, scoop = 0): void {
    const f = mtof(m);
    this.osc.frequency.setValueAtTime(f, t);
    this.sub?.frequency.setValueAtTime(f, t);
    if (scoop) {
      // 吹きはじめに下からしゃくる（笛らしさ）
      this.osc.detune.cancelScheduledValues(t);
      this.osc.detune.setValueAtTime(-scoop, t);
      this.osc.detune.setTargetAtTime(0, t, 0.012);
    }
    const g = this.vca.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(vel * e.vol, t, e.a);
    g.setTargetAtTime(0, t + dur, e.r);
  }
  /** フィルターを開いて閉じる（ベースの「ブワッ」・ブラスの立ち上がり） */
  sweep(t: number, peak: number, rest: number, tau: number, q: number): void {
    if (!this.filt) return;
    const p = this.filt.frequency;
    this.filt.Q.setValueAtTime(q, t);
    p.cancelScheduledValues(t);
    p.setTargetAtTime(peak, t, 0.004);
    p.setTargetAtTime(rest, t + 0.02, tau);
  }
  hush(t: number): void {
    this.vca.gain.cancelScheduledValues(t);
    this.vca.gain.setTargetAtTime(0, t, 0.03);
  }
}

/** FM のベル（オルゴール・鉄琴） */
class Bell {
  car: OscillatorNode;
  mod: OscillatorNode;
  idx: GainNode;
  vca: GainNode;
  constructor(rig: Rig, dest: AudioNode, wow: AudioNode) {
    const c = rig.ctx;
    this.car = c.createOscillator();
    this.mod = c.createOscillator();
    this.idx = c.createGain();
    this.idx.gain.value = 0;
    this.vca = c.createGain();
    this.vca.gain.value = 0;
    this.mod.connect(this.idx).connect(this.car.frequency);
    this.car.connect(this.vca).connect(dest);
    wow.connect(this.car.detune);
    this.car.start();
    this.mod.start();
  }
  note(t: number, m: number, dur: number, vel: number, vol: number): void {
    const f = mtof(m);
    this.car.frequency.setValueAtTime(f, t);
    this.mod.frequency.setValueAtTime(f * 3.01, t);
    this.idx.gain.cancelScheduledValues(t);
    this.idx.gain.setTargetAtTime(f * 2.2 * vel, t, 0.002);
    this.idx.gain.setTargetAtTime(f * 0.2, t + 0.01, 0.07);
    const g = this.vca.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(vel * vol, t, 0.003);
    g.setTargetAtTime(0, t + 0.012, Math.max(0.08, dur * 0.9));
  }
  hush(t: number): void {
    this.vca.gain.cancelScheduledValues(t);
    this.vca.gain.setTargetAtTime(0, t, 0.03);
  }
}

interface Band {
  lead: Mono; lead2: Mono; bass: Mono; organ: Mono[]; brass: Mono[]; bell: Bell;
  wowDepth: GainNode; crackle: GainNode; drumBus: Record<string, AudioNode>;
}

const PAN: Record<string, number> = { hat: 0.25, hatO: 0.25, tamb: -0.35, block: -0.2, tri: 0.4, clap: 0.12, rim: -0.15, ghost: 0.1, tom: -0.25, crash: 0.3 };

/** 1 つの曲を演奏する人。rig が本番でも書き出し用でも同じように動く */
export class Conductor {
  song: Song | null = null;
  step = 0;
  nextT = 0;
  /** 置いたステップの数（テストとデバッグ用） */
  placed = 0;
  /** 遅れて飛ばしたステップの数 */
  skipped = 0;
  private stage = 0;
  private heat = 0;
  private heatTo = 0;
  private shift = 0;
  private shiftTo = 0;
  private hurry = false;
  private pending: { name: SceneName | ''; when: 'beat' | 'bar' | 'now' } | null = null;
  private holdUntil = 0;
  private fill = false;
  private flags = new Set<'crash' | 'stab'>();
  private band: Band | null = null;

  constructor(readonly rig: Rig) {}

  get scene(): SceneName | '' { return this.pending ? this.pending.name : this.song?.name ?? ''; }
  get stepDur(): number { return this.song ? 60 / this.song.bpm / this.song.div / (this.hurry ? 1.07 : 1) : 0.125; }

  setScene(name: SceneName | '', when: 'beat' | 'bar' | 'now' = 'beat'): void {
    if (!this.pending && (this.song?.name ?? '') === name) return;
    this.pending = { name, when };
  }
  setStage(n: number): void {
    const s = Math.max(0, Math.min(4, Math.round(n) || 0));
    if (s === this.stage && this.band) return;
    this.stage = s;
    if (this.band) this.applyStage(this.rig.ctx.currentTime);
  }
  setHeat(x: number): void { this.heatTo = Math.max(0, Math.min(1, x)); }
  /** 転調（半音）。次の拍から */
  setShift(n: number): void { this.shiftTo = n; }
  setHurry(on: boolean): void { this.hurry = on; }

  keyInfo(): KeyInfo {
    const s = this.song;
    const bar = s ? Math.floor(this.step / s.perBar) % s.bars : 0;
    const ch = s ? s.chords[bar] : { root: 2, tones: [0, 3, 7] };
    return { tonic: 62 + this.shift, mode: s?.mode ?? 'min', chord: { root: (ch.root + this.shift + 120) % 12, tones: ch.tones } };
  }
  /** 次のステップまでの秒数（大事な SE を拍に寄せる） */
  toGrid(now: number): number { return this.song ? Math.max(0, this.nextT - now) : 0; }

  hit(kind: HitKind, at = this.rig.ctx.currentTime): void {
    const r = this.rig;
    if (kind === 'fill') this.fill = true;
    else if (kind === 'crash' || kind === 'launch') this.flags.add('crash');
    else if (kind === 'jackpot') { this.flags.add('crash'); this.flags.add('stab'); }
    else if (kind === 'multiball' || kind === 'zone') { this.fill = true; this.flags.add('crash'); }
    else if (kind === 'drain') {
      // 落ちた：音がこもって、もどる
      const p = r.ageLp.frequency;
      p.cancelScheduledValues(at);
      p.setTargetAtTime(420, at, 0.05);
      p.setTargetAtTime(AGE[this.stage].lp, at + 0.5, 0.25);
    } else if (kind === 'timeup') this.stinger(at);
  }

  /** TIME UP：止めの一発を鳴らして、しばらく黙る */
  private stinger(t: number): void {
    const b = this.ensure();
    const k = this.keyInfo();
    const root = k.tonic;
    for (const v of [b.lead, b.lead2, b.bass, ...b.organ, ...b.brass]) v.hush(t);
    b.bell.hush(t);
    if (this.stage >= 2) {
      const third = k.mode === 'maj' ? 4 : 3;
      [root, root + third, root + 7].forEach((m, i) => { b.brass[i].sweep(t, 4200, 1500, 0.12, 1); b.brass[i].note(t, m, 0.42, 1.2, BRASS); });
      this.drum('kick', t, 1);
      this.drum('crash', t, 0.6);
      this.drum('snare', t, 0.9);
    } else {
      this.drum('tom', t, 0.8);
      this.drum('block', t, 0.6);
    }
    b.bass.sweep(t, 1800, 300, 0.2, 4);
    b.bass.note(t, root - 24, 0.5, 1.1, BASS);
    b.lead.note(t, root, 0.45, 1, LEAD);
    this.holdUntil = t + 1.5;
    this.fill = false;
    this.flags.clear();
  }

  // ------------------------------------------------------------ 楽器を組む
  private ensure(): Band {
    if (this.band) return this.band;
    const r = this.rig;
    const c = r.ctx;
    // テープのゆれ：ゆっくりのゆれ＋細かいふるえ → 全部の発音体の高さへ
    const wowDepth = c.createGain();
    wowDepth.gain.value = 1;
    const slow = c.createOscillator();
    slow.frequency.value = 0.47;
    const fast = c.createOscillator();
    fast.frequency.value = 6.3;
    const fg = c.createGain();
    fg.gain.value = 0.22;
    slow.connect(wowDepth);
    fast.connect(fg).connect(wowDepth);
    slow.start();
    fast.start();
    // リードのビブラート
    const vib = c.createGain();
    vib.gain.value = 7;
    const vo = c.createOscillator();
    vo.frequency.value = 5.4;
    vo.connect(vib);
    vo.start();
    const leadWow = c.createGain();
    wowDepth.connect(leadWow);
    vib.connect(leadWow);

    const track = (pan: number, rev: number, del: number): GainNode => {
      const g = c.createGain();
      let tail: AudioNode = g;
      if (pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        tail = g.connect(p);
      }
      tail.connect(r.music);
      if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(r.reverb); }
      if (del) { const s = c.createGain(); s.gain.value = del; g.connect(s).connect(r.delay); }
      return g;
    };
    const leadT = track(0, 0.28, 0.14);
    const organT = track(-0.3, 0.2, 0);
    // オルガンのトレモロ
    const trem = c.createOscillator();
    trem.frequency.value = 6.1;
    const tg = c.createGain();
    tg.gain.value = 0.14;
    trem.connect(tg).connect(organT.gain);
    trem.start();
    const brassT = track(0.3, 0.3, 0.06);
    const bellT = track(0.4, 0.3, 0.4);
    const bassT = track(0, 0, 0);
    const drumBus: Record<string, AudioNode> = {};
    for (const [k, p] of Object.entries(PAN)) drumBus[k] = track(p, k === 'clap' || k === 'tri' || k === 'crash' ? 0.25 : 0.06, 0);
    drumBus.kick = track(0, 0, 0);
    drumBus.snare = track(0, 0.16, 0);

    // レコードのぷちぷち（古さのフィルターは通さない）
    const crackle = c.createGain();
    crackle.gain.value = 0;
    const cb = buf(r, 'crackle');
    if (cb) {
      const src = c.createBufferSource();
      src.buffer = cb;
      src.loop = true;
      src.connect(crackle).connect(r.musicDuck);
      src.start();
    }
    this.band = {
      lead: new Mono(r, leadT, 'calliope', false, false, leadWow),
      lead2: new Mono(r, track(0.2, 0.3, 0.2), 'calliope', false, false, leadWow),
      bass: new Mono(r, bassT, 'sawtooth', true, true, wowDepth),
      organ: [0, 1, 2].map(() => new Mono(r, organT, 'organ', false, false, wowDepth)),
      brass: [0, 1, 2].map(() => new Mono(r, brassT, 'brass', true, false, wowDepth)),
      bell: new Bell(r, bellT, wowDepth),
      wowDepth, crackle, drumBus,
    };
    this.applyStage(c.currentTime);
    return this.band;
  }

  private applyStage(t: number): void {
    const b = this.band;
    if (!b) return;
    const a = AGE[this.stage];
    this.rig.ageHp.frequency.setTargetAtTime(a.hp, t, 0.3);
    this.rig.ageLp.frequency.setTargetAtTime(a.lp, t, 0.3);
    b.wowDepth.gain.setTargetAtTime(a.wow, t, 0.3);
    b.crackle.gain.setTargetAtTime(this.song ? a.crackle : 0, t, 0.3);
    b.lead.setWave(this.stage === 0 ? 'dusty' : this.song?.leadWave ?? 'calliope');
  }

  private drum(kit: string, t: number, vel: number): void {
    const b = this.ensure();
    const ab = buf(this.rig, kit);
    if (!ab || vel <= 0) return;
    const c = this.rig.ctx;
    const src = c.createBufferSource();
    src.buffer = ab;
    const g = c.createGain();
    g.gain.value = vel;
    src.connect(g).connect(b.drumBus[kit] ?? this.rig.music);
    src.start(t);
  }

  private start(name: SceneName | '', t: number): void {
    const b = this.ensure();
    this.pending = null;
    for (const v of [b.lead, b.lead2, b.bass, ...b.organ, ...b.brass]) v.hush(t);
    if (!name) {
      this.song = null;
      b.crackle.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const s = songOf(name);
    this.song = s;
    this.step = 0;
    this.nextT = t;
    this.fill = false;
    this.rig.delayNode.delayTime.setTargetAtTime(Math.min(1.4, (60 / s.bpm) * 0.75), t, 0.05);
    this.applyStage(t);
    if (this.stage >= 2 && (name === 'play' || name === 'boss')) this.flags.add('crash');
  }

  /** until（秒）までのステップを置く。本番は 30ms ごとに少し先まで、書き出しは終わりまで一度に */
  pump(until: number): void {
    const now = this.rig.ctx.currentTime;
    if (!this.song) {
      if (!this.pending || !this.pending.name) { this.pending = null; return; }
      this.start(this.pending.name, Math.max(now + 0.04, this.holdUntil));
    }
    // タイマーが遅れた：過ぎたステップは飛ばし、拍の位置はずらさない
    if (this.song && this.nextT < now + 0.005) {
      const sd = this.stepDur;
      const n = Math.ceil((now + 0.005 - this.nextT) / sd);
      this.step = (this.step + n) % this.song.steps;
      this.nextT += n * sd;
      this.skipped += n;
    }
    while (this.song && this.nextT < until) {
      const s: Song = this.song;
      const t = this.nextT;
      if (this.pending) {
        const p = this.pending;
        const edge = p.when === 'now' || (p.when === 'beat' ? this.step % s.div === 0 : this.step % s.perBar === 0);
        if (edge) {
          this.start(p.name, Math.max(t, this.holdUntil));
          continue;
        }
      }
      if (this.step % s.div === 0 && this.shift !== this.shiftTo) this.shift = this.shiftTo;
      if (t >= this.holdUntil) this.place(s, this.step, t);
      this.heat += (this.heatTo - this.heat) * (this.heatTo > this.heat ? 0.5 : 0.05);
      this.nextT = t + this.stepDur;
      this.step = (this.step + 1) % s.steps;
    }
  }

  private place(s: Song, st: number, t0: number): void {
    const b = this.ensure();
    const sd = this.stepDur;
    const t = t0 + (st % 2 ? s.swing * sd : 0);
    const stage = this.stage;
    const heat = this.heat;
    const inBar = st % s.perBar;
    const lastBeat = inBar >= s.perBar - s.div;
    const loopEnd = st >= s.steps - s.div;
    this.placed += 1;

    // ---- ドラム。小節の終わりのフィル（曲のひと回りの終わりと、頼まれたとき）
    const rolling = lastBeat && stage >= 2 && (this.fill || (loopEnd && heat >= 0.4 && (s.name === 'play' || s.name === 'boss')));
    if (rolling) {
      const k = (inBar - (s.perBar - s.div) + 1) / s.div;
      this.drum(k > 0.5 && stage >= 3 ? 'tom' : 'snare', t, 0.45 + 0.5 * k);
      if (inBar === s.perBar - 1) this.fill = false;
    }
    for (const d of s.drums) {
      const v = d.hits[st];
      if (!v || !gateOn(d, stage, heat)) continue;
      if (rolling && (d.kit === 'snare' || d.kit === 'ghost' || d.kit === 'clap')) continue;
      this.drum(d.kit, t, v * d.vol * (d.kit === 'kick' || d.kit === 'snare' ? 0.85 + 0.15 * heat : 1));
    }
    if (inBar === 0 && this.fill && stage < 2) this.fill = false;
    // 残り 10 秒：16 分のハットと拍の木魚で急かす
    if (this.hurry) {
      this.drum('hat', t, st % 2 ? 0.2 : 0.34);
      if (st % s.div === 0) this.drum('block', t, 0.5);
    }
    if (this.flags.has('crash')) {
      this.flags.delete('crash');
      this.drum(stage >= 2 ? 'crash' : 'tri', t, stage >= 2 ? 0.5 : 0.4);
      if (stage >= 1) this.drum('kick', t, 0.9);
    }

    // ---- 楽器
    const sh = this.shift;
    const L = s.lines;
    if (L.lead) {
      const e = L.lead.ev[st];
      if (e && gateOn(L.lead, stage, heat)) b.lead.note(t, e.m + sh, e.len * sd, (0.78 + 0.22 * heat) * L.lead.vol, stage === 0 ? LEAD_DUSTY : LEAD, 45);
    }
    if (L.lead2) {
      const e = L.lead2.ev[st];
      if (e && gateOn(L.lead2, stage, heat)) b.lead2.note(t, e.m + sh, e.len * sd, L.lead2.vol, LEAD, 30);
    }
    if (L.bass) {
      const e = L.bass.ev[st];
      if (e && gateOn(L.bass, stage, heat)) {
        if (s.bassStyle === 'funk') b.bass.sweep(t, 520 + 1700 * heat + 260 * stage, 190, 0.07, 5);
        else if (s.bassStyle === 'pizz') b.bass.sweep(t, 900, 150, 0.05, 1);
        else b.bass.sweep(t, 260, 220, 0.2, 0.7);
        b.bass.note(t, e.m + sh, e.len * sd, L.bass.vol, s.bassStyle === 'sub' ? BASS_SUB : s.bassStyle === 'pizz' ? BASS_PIZZ : BASS);
      }
    }
    if (L.bell) {
      const e = L.bell.ev[st];
      if (e && gateOn(L.bell, stage, heat)) b.bell.note(t, e.m + sh, e.len * sd, 1, 0.15 * L.bell.vol);
    }
    const O = s.stabs.organ;
    if (O) {
      const e = O.ev[st];
      if (e && gateOn(O, stage, heat)) e.notes.forEach((m, i) => b.organ[i]?.note(t, m + sh, e.len * sd, e.vel * O.vol, ORGAN));
    }
    const B = s.stabs.brass;
    const be = B?.ev[st];
    if (B && be && gateOn(B, stage, heat)) {
      be.notes.forEach((m, i) => { b.brass[i]?.sweep(t, 900 + 3000 * be.vel, 1500, 0.1, 1); b.brass[i]?.note(t, m + sh, be.len * sd, be.vel * B.vol, BRASS); });
    } else if (this.flags.has('stab') && stage >= 2) {
      // 大当たり：いまのコードをブラスで一発
      const ch = s.chords[Math.floor(st / s.perBar)];
      [0, 1, 2].forEach((i) => {
        const m = 60 + ((ch.root + ch.tones[i % ch.tones.length] + sh) % 12 + 12) % 12 + (i === 2 ? 12 : 0);
        b.brass[i].sweep(t, 4400, 1700, 0.12, 1);
        b.brass[i].note(t, m, sd * s.div * 0.9, 1.1, BRASS);
      });
    }
    this.flags.delete('stab');
  }
}

const LEAD: Env = { a: 0.012, r: 0.05, vol: 0.2 };
const LEAD_DUSTY: Env = { a: 0.02, r: 0.07, vol: 0.2 };
const BASS: Env = { a: 0.004, r: 0.04, vol: 0.2 };
const BASS_PIZZ: Env = { a: 0.003, r: 0.09, vol: 0.24 };
const BASS_SUB: Env = { a: 0.03, r: 0.2, vol: 0.2 };
const ORGAN: Env = { a: 0.006, r: 0.04, vol: 0.1 };
const BRASS: Env = { a: 0.018, r: 0.06, vol: 0.11 };

// ---------------------------------------------------------------- 本番の演奏（1 つだけ）
let live: Conductor | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let paused = false;
const overrides: SceneName[] = [];
let base: SceneName | '' = '';
/** 先読みの長さ（秒）とタイマーの間隔（ミリ秒） */
export const AHEAD = 0.2;
export const TICK = 30;

function cond(): Conductor | null {
  if (live) return live;
  const r = liveRig();
  if (!r) return null;
  live = new Conductor(r);
  timer = setInterval(tick, TICK);
  return live;
}
/** タイマーが詰まって音が抜けたら、しばらく先読みを長くする（端末が重いとき） */
let ahead = AHEAD;
let seenSkips = 0;
function tick(): void {
  if (!live || paused) return;
  const c = live.rig.ctx;
  if (c.state !== 'running') return;
  live.pump(c.currentTime + ahead);
  if (live.skipped > seenSkips) { seenSkips = live.skipped; ahead = Math.min(0.5, ahead + 0.1); }
  else if (ahead > AHEAD) ahead = Math.max(AHEAD, ahead - 0.0002);
}
function applyScene(when: 'beat' | 'bar' | 'now'): void {
  cond()?.setScene(overrides.length ? overrides[overrides.length - 1] : base, when);
}

/** 画面のいまの様子（main.ts が毎コマ近く渡す）。ここから曲・盛り上がり・転調を決める */
export interface Snapshot {
  /** プレイ中（打ち出してから TIME UP まで） */
  playing: boolean;
  /** ボス・ラストステージ */
  boss: boolean;
  /** RESULT が出ている */
  result: boolean;
  over: boolean;
  /** ホーム（遊んでいないとき）の見えているページ：0 ショップ・1 ピンボール・2 ラボ。出ていなければ -1 */
  tab: number;
  combo: number;
  /** このプレイでマルチボールが始まった回数（増えた瞬間から、しばらく転調する） */
  multiballs: number;
  zone: boolean;
  /** のこり秒 */
  left: number;
  clown: number;
}

export const music = {
  /** 曲を変える（拍に合わせて切りかわる）。'' で止める */
  scene(name: SceneName | '', when: 'beat' | 'bar' | 'now' = 'beat'): void {
    base = name;
    applyScene(when);
  },
  /** いちばん上に重ねる曲（エンディングなど）。返ってきた関数で外す */
  override(name: SceneName): () => void {
    overrides.push(name);
    applyScene('beat');
    return () => {
      const i = overrides.lastIndexOf(name);
      if (i >= 0) overrides.splice(i, 1);
      applyScene('beat');
    };
  },
  /** 盛り上がり 0〜1（連鎖 20 で 1） */
  intensity(x: number): void { cond()?.setHeat(x); },
  /** 曲に合いの手を入れる */
  hit(kind: HitKind): void {
    const c = cond();
    if (!c || c.rig.ctx.state !== 'running') return;
    c.hit(kind);
    if (kind === 'jackpot') duck(c.rig, 0.7, 0.3);
  },
  stage(n: number): void { cond()?.setStage(n); },
  shift(n: number): void { cond()?.setShift(n); },
  hurry(on: boolean): void { cond()?.setHurry(on); },
  key(): KeyInfo { return live ? live.keyInfo() : { tonic: 62, mode: 'min', chord: { root: 2, tones: [0, 3, 7] } }; },
  toGrid(): number { return live ? live.toGrid(live.rig.ctx.currentTime) : 0; },
  pause(p: boolean): void { paused = p; },
  get now(): SceneName | '' { return live?.scene ?? ''; },
  get conductor(): Conductor | null { return live; },
  stop(): void { if (timer) clearInterval(timer); timer = null; live = null; },

  /** main.ts から：いまの画面に合う曲と盛り上がりにする */
  direct(s: Snapshot): void {
    const c = cond();
    if (!c) return;
    const ds = typeof document !== 'undefined' ? document.documentElement.dataset.clown : undefined;
    c.setStage(ds !== undefined && ds !== '' ? Number(ds) : s.clown);
    let sc: SceneName;
    if (s.over) sc = 'gameover';
    else if (s.result) sc = 'result';
    else if (s.playing) sc = s.boss || bossOn ? 'boss' : 'play';
    else sc = s.tab === 0 ? 'shop' : s.tab === 2 ? 'lab' : 'idle';
    if (sc !== base) { base = sc; applyScene(sc === 'gameover' ? 'now' : 'beat'); }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!s.playing) { multiUntil = 0; bossOn = false; }
    else if (s.multiballs > lastMulti) multiUntil = nowMs + MULTI_MS;
    lastMulti = s.multiballs;
    const multi = s.playing && nowMs < multiUntil;
    c.setHeat(s.playing ? Math.min(1, s.combo / 20 + (multi ? 0.25 : 0) + (s.zone ? 0.3 : 0)) : 0);
    // マルチボールで全音上へ、ZONE でさらに短 3 度上へ
    const sh = s.playing ? (multi ? 2 : 0) + (s.zone ? 3 : 0) : 0;
    if (sh !== lastShift) { lastShift = sh; c.setShift(sh); if (sh) c.hit(s.zone ? 'zone' : 'multiball'); }
    c.setHurry(s.playing && s.left <= 10 && s.left > 0);
    // 画面のコマからも先読みを進める（タイマーだけに頼らない）
    tick();
  },
};
let lastShift = 0;
let lastMulti = 0;
let multiUntil = 0;
/** マルチボールの転調が続く長さ */
const MULTI_MS = 12000;
/** レイドボスが出ている（main.ts のむかしの playBgm('boss') が立てる） */
let bossOn = false;
export function setBoss(on: boolean): void { bossOn = on; }

/** 書き出し（確かめ用）：曲を sec 秒ぶん、決めた段階と盛り上がりで鳴らした波を返す */
export async function renderScene(name: SceneName, sec: number, stage: number, heat: number, script?: (c: Conductor, pumpTo: (t: number) => void) => void): Promise<AudioBuffer> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * sec), sr);
  const c = new Conductor(buildRig(ctx));
  c.setStage(stage);
  c.setHeat(heat);
  for (let i = 0; i < 40; i += 1) c.setHeat(heat);
  c.setScene(name, 'now');
  if (script) script(c, (t) => c.pump(t));
  c.pump(sec);
  return ctx.startRendering();
}
