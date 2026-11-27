// BGM：マイクリのオリジナルの曲を場面ごとに流す（ユーザーの指定：アップテンポな曲を選ぶ）。
// <audio> を BGM のバス（音量のつまみ・声や大事な効果音でのダッキング・ミュートが効く）へつなぎ、場面が変わると短く重ねて切りかえる。
// 割り当ては下の TRACK の 1 か所（テンポの目安は曲を測った値）。その場で演奏する合成の曲（music.ts）は、曲が使えないときの代わり。
import { cat } from '../core/catalog';
import { liveRig } from './engine';
import type { SceneName } from './songs';

/** 場面 → 曲（cat.bgm の鍵） */
export const TRACK: Record<SceneName, string> = {
  idle: 'pve',            // 打ち出しを待つ台：およそ 145
  play: 'landBattle',     // プレイ中：およそ 164（いちばん速い）
  boss: 'raid',           // ボス・ラストステージ：およそ 160
  shop: 'colosseum',      // ショップ：およそ 155
  lab: 'nine',            // ラボ：およそ 137
  result: 'pveEvent',     // RESULT：およそ 147
  gameover: 'cryptidWars',// GAME OVER：およそ 135
  ending: 'pvp',          // エンディング：およそ 150
};

const FADE = 0.45;
interface Deck { el: HTMLAudioElement; gain: GainNode; key: string }
let decks: Deck[] | null = null;
let cur = -1;
let want = '';
let paused = false;

export function tracksReady(): boolean {
  return typeof Audio !== 'undefined' && !!cat.bgm && Object.keys(cat.bgm).length > 0 && !!liveRig();
}

function ensure(): Deck[] | null {
  if (decks) return decks;
  const r = liveRig();
  if (!r || typeof Audio === 'undefined') return null;
  try {
    decks = [0, 1].map(() => {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      const gain = r.ctx.createGain();
      gain.gain.value = 0;
      (r.ctx as AudioContext).createMediaElementSource(el).connect(gain);
      // 合成の曲より素の音が大きいので、少し下げてバスへ
      const trim = r.ctx.createGain();
      trim.gain.value = 0.5;
      gain.connect(trim).connect(r.musicDuck);
      return { el, gain, key: '' };
    });
  } catch { decks = null; }
  return decks;
}

function tryPlay(d: Deck): void {
  if (paused || !d.key) return;
  if (d.el.paused) void d.el.play().catch(() => undefined);
}

/** いまの場面の曲にする（同じ曲なら何もしない。'' で止める） */
export function playTrack(scene: SceneName | ''): void {
  const key = scene ? TRACK[scene] : '';
  if (key === want) { if (cur >= 0 && decks) tryPlay(decks[cur]); return; }
  const ds = ensure();
  if (!ds) return;
  const r = liveRig();
  if (!r) return;
  want = key;
  const t = r.ctx.currentTime;
  const old = cur >= 0 ? ds[cur] : null;
  if (old) {
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setTargetAtTime(0, t, FADE / 3);
    const el = old.el;
    const k = old.key;
    setTimeout(() => { if (old.key === k && ds[cur] !== old) { el.pause(); } }, FADE * 1000 * 2.5);
  }
  if (!key || !cat.bgm[key]) { cur = -1; return; }
  cur = cur === 0 ? 1 : 0;
  const d = ds[cur];
  d.key = key;
  d.el.src = cat.bgm[key];
  d.el.currentTime = 0;
  d.el.playbackRate = 1;
  d.gain.gain.cancelScheduledValues(t);
  d.gain.gain.setValueAtTime(0, t);
  d.gain.gain.setTargetAtTime(1, t + 0.05, FADE / 3);
  tryPlay(d);
}

/** のこり 10 秒：少し速く */
export function trackHurry(on: boolean): void {
  if (!decks || cur < 0) return;
  const rate = on ? 1.08 : 1;
  if (decks[cur].el.playbackRate !== rate) decks[cur].el.playbackRate = rate;
}

/** 止めの一発のあとなど：いまの曲をすぐ絞る */
export function trackCut(): void {
  const r = liveRig();
  if (!decks || cur < 0 || !r) return;
  decks[cur].gain.gain.setTargetAtTime(0, r.ctx.currentTime, 0.04);
}

/** ページが隠れた・もどった */
export function pauseTracks(p: boolean): void {
  paused = p;
  if (!decks) return;
  for (const d of decks) { if (p) d.el.pause(); }
  if (!p && cur >= 0) tryPlay(decks[cur]);
}

/** タップの中から呼ぶ（スマホはタップの中でしか <audio> を始められないことがある） */
export function kickTracks(): void {
  if (decks && cur >= 0) tryPlay(decks[cur]);
}
