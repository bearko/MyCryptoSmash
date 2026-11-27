// ラストステージの始まり（ジョーカーの口上）とエンディング（ユーザーの指定）。タップで送る場面（src/ui/story.ts）。
// 真のエンディング：ジョーカーがプレイヤーを認めてドアを開ける → 台の過去を明かす → 豪華になった台はまた注目を集め、
// 古いゲームコーナーはレトロゲームの名所として人々に遊ばれる → 記録（プレイヤー名・かかったプレイ数・いちばん大きかった GUM）。
// 通常のエンディング（ジョーカーでないままノルマ 10 を納めた）：扉は開くが、台は古ぼけたままで話題にはならない。
// 短い場面のあと、記録と「台を完成させれば……」のヒント。スキルツリーを持って最初からやり直す。

import { music } from '../core/audio';
import type { Save } from '../core/save';
import { fmt } from '../core/util';
import { fillLine, normalLine } from '../game/clown-lines';
import { FINAL_FLOORS, FINAL_TIME } from '../game/final';
import { FINAL_TRIES } from '../game/quota';
import { CLOWN_NAME, clownArt } from '../game/toys';
import { STORY_SCENES } from './intro';
import { tag } from './kit';
import { openStory, type Beat } from './story';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** 記録の 1 ます（jp＝名前など和文の値） */
const cell = (k: string, v: string, i: number, jp = false): string => `<div style="--i:${i}"><dt>${k}</dt><dd${jp ? ' class="is-jp"' : ''}>${v}</dd></div>`;
const joker = `<div class="float-clown joker-form"><img src="${clownArt(4)}" alt=""></div>`;
/** ラストステージとエンディングの場面（CSS で描く） */
const SCENES: Record<string, string> = {
  ...STORY_SCENES,
  jtable: `<div class="idoor shut"><i></i></div><div class="machine golden"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i>${joker}`,
  past: `<div class="cabs"><i></i><i></i><i></i></div><div class="machine golden"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div>
    <div class="crowd kids"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p class="sc-cap">むかし</p>`,
  empty: `<div class="cabs"><i></i><i></i><i></i></div><div class="machine cursed"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i><i class="web"></i><p class="sc-cap">それから</p>`,
  later: `<i class="sky-stars"></i><div class="shopfront lit"><div class="sign"><b>G</b><b>A</b><b>M</b><b>E</b></div><div class="door open"><i></i></div></div>
    <div class="crowd"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="road"></div>`,
  record: `<i class="rays"></i>${joker}`,
  // 通常のエンディング：開いた扉と古ぼけた台（夜の路地は導入の street を暗くして使う）
  ndoor: `<div class="idoor"><i></i></div><div class="machine"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i>`,
};
const clownAt = (tier: number): string => `<div class="float-clown"><img src="${clownArt(tier)}" alt=""></div>`;

/** ラストステージの始まり：ジョーカーが最後のショーを告げる */
export function openFinalIntro(root: HTMLElement, save: Save, done: () => void): void {
  const beats: Beat[] = [
    { sc: 'jtable', who: 'ジョーカー', text: '……{name}。よくぞここまで、この台を育ててくれた。', fx: 'clown' },
    { sc: 'jtable', who: 'ジョーカー', text: `最後のショーを始めよう。この台に巣くったボスども――${FINAL_FLOORS.length} 体が、順に出てくる。` },
    { sc: 'jtable', who: 'ジョーカー', text: `${FINAL_TIME} 秒で全部倒せば、扉を開けてやる。挑めるのは ${FINAL_TRIES} 回まで。ボスが替わるたびに、そのボスの掟がかかるぞ。` },
    { sc: 'jtable', who: 'ジョーカー', text: '……おまえとなら勝てる。いくぞ、相棒。' },
  ];
  openStory(root, { cls: 'finale', scenes: SCENES, beats, fill: (t) => fillLine(t, { name: save.name }), lastLabel: 'ラストステージへ', done });
}

/** 真のエンディング：扉が開き、過去が明かされ、台はまた人々に遊ばれる。最後に記録 */
export function openEnding(root: HTMLElement, save: Save, done: () => void): void {
  const offMusic = music.override('ending');
  const r = save.escapeRecord ?? { name: save.name, plays: save.quota.plays, bestGum: save.quota.bestGum };
  // 記録：数字の半券（文は置かない）。エンドレスが開いたことは札で
  const record = `<div class="ending-rec">
      <b class="er-title">ESCAPED!</b><small class="er-sub">TRUE END</small>
      <dl>${cell('NAME', esc(r.name), 0, true)}${cell('PLAYS', fmt(r.plays), 1)}${cell('BEST GUM', fmt(r.bestGum), 2)}${save.escapes > 1 ? cell('ESCAPES', `×${save.escapes}`, 3) : ''}</dl>
      <div class="er-tags">${tag('ENDLESS OPEN', 'curse', true)}</div>
    </div>`;
  const beats: Beat[] = [
    { sc: 'jtable', who: 'ジョーカー', text: '……見事だ、{name}。おまえの勝ちだ。', fx: 'clown' },
    { sc: 'jtable', who: 'ジョーカー', text: '約束どおり、扉を開けよう。', fx: 'open' },
    { sc: 'past', who: 'ジョーカー', text: 'この台はな、昔は町いちばんの人気者だった。小銭をにぎった子どもらが、毎日行列を作ったもんさ。' },
    { sc: 'past', who: 'ジョーカー', text: '俺はこの台に宿る道化。みんなの歓声を浴びて、ジョーカーとして光っていた。' },
    { sc: 'empty', who: 'ジョーカー', text: 'やがて新しい遊びが増えて、だれも来なくなった。仕掛けは一つずつ外され、俺もただのピエロまで落ちぶれた。' },
    { sc: 'jtable', who: 'ジョーカー', text: '閉じこめて悪かったな。……台を育ててくれる遊び手を、ずっと待ってたんだ。' },
    { sc: 'later', text: 'それから――。豪華になった台のうわさは町じゅうに広がり、古いゲームコーナーはレトロゲームの名所として、また大勢の人でにぎわうようになった。', fx: 'cheer' },
    { sc: 'later', who: 'ジョーカー', text: 'また遊びに来いよ、{name}。……いつでも待ってるぜ、相棒。' },
    { sc: 'record', text: '', extra: record },
  ];
  openStory(root, { cls: 'finale ending', scenes: SCENES, beats, fill: (t) => fillLine(t, { name: save.name }), lastLabel: 'エンドレスへ', done: () => { offMusic(); done(); } });
}

/**
 * 通常のエンディング：扉は開くが、台は古ぼけたまま。記録と、台を完成させれば……のヒント。
 * done のあと、スキルツリーを持って最初からやり直す（main.ts。使い残したエンブレムは持ちこせる）
 */
export function openNormalEnding(root: HTMLElement, save: Save, done: () => void): void {
  const offMusic = music.override('ending');
  const r = save.clearRecord ?? { name: save.name, plays: save.quota.plays, bestGum: save.quota.bestGum, tier: 0 };
  const tier = Math.max(0, Math.min(3, r.tier));
  const who = CLOWN_NAME[tier];
  // 記録：数字の半券。持っていけるもの（スキルツリー・使い残したエンブレム）は札で。ヒントはピエロのセリフが言う
  const record = `<div class="ending-rec normal">
      <b class="er-title">ESCAPED</b><small class="er-sub">NORMAL END</small>
      <dl>${cell('NAME', esc(r.name), 0, true)}${cell('PLAYS', fmt(r.plays), 1)}${cell('BEST GUM', fmt(r.bestGum), 2)}${cell('CLOWN', esc(who), 3, true)}${(save.clears ?? 0) > 0 ? cell('CLEARS', `×${(save.clears ?? 0) + 1}`, 4) : ''}</dl>
      <div class="er-tags">${tag('SKILL TREE', 'emb', true)}<span class="k-tag k-tag--en" data-tone="emb"><i class="emb"></i>${fmt(save.emblems)}</span>${tag('KEEP', 'ink', true)}</div>
    </div>`;
  const scenes = { ...SCENES, ndoor: SCENES.ndoor + clownAt(tier), nrecord: `<i class="rays"></i>${clownAt(tier)}` };
  const beats: Beat[] = [
    { sc: 'ndoor', who, text: normalLine('door', tier, { name: save.name }), fx: 'open' },
    { sc: 'street', text: '扉の外は、いつもの夜の路地だった。振り返ると、古いゲームコーナーは暗いまま。だれも気にとめない。' },
    { sc: 'ndoor', who, text: normalLine('hint', tier, { name: save.name }), fx: 'clown' },
    { sc: 'nrecord', text: '', extra: record },
  ];
  openStory(root, { cls: 'finale ending normal', scenes, beats, fill: (t) => fillLine(t, { name: save.name }), lastLabel: '最初から挑む', done: () => { offMusic(); done(); } });
}
