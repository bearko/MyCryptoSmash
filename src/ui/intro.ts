// 導入（はじめて開いたときだけ。名前がまだないとき）。タップで送る短い場面の連なり（ユーザーの指定）：
// ① 道で呼ぶ声 ② 店に入るとコモンのピエロが暗がりに浮かび「お客さん」と語りかける ③ 名前をたずねる（10 文字まで。空なら「お客さん」）
// ④ 暗い部屋に案内され、突然ドアが閉まる（音・画面の揺れ） ⑤ 呪われたピンボールと入金口の説明。
// 絵は CSS とピエロの絵だけ。プレイヤー自身のセリフと性格はない。

import type { Save } from '../core/save';
import { NAME_MAX, cleanName, fillLine } from '../game/clown-lines';
import { clownArt } from '../game/toys';
import { openStory, type Beat } from './story';

/** 場面の背景（CSS で描く） */
export const STORY_SCENES = {
  street: `<i class="sky-stars"></i><i class="moon"></i><div class="town"><i></i><i></i><i></i><i></i></div>
    <div class="shopfront"><div class="sign"><b>G</b><b>A</b><b>M</b><b>E</b></div><div class="door"><i></i></div><span class="door-voice">おーい……</span></div>
    <div class="lamp"><i></i></div><div class="road"></div>`,
  shop: `<div class="cabs"><i></i><i></i><i></i><i></i><i></i></div><i class="dust"></i>
    <div class="float-clown"><img src="${clownArt(0)}" alt=""></div>`,
  room: `<div class="idoor"><i></i></div><div class="machine"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i>`,
  table: `<div class="idoor shut"><i></i></div><div class="machine cursed"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i>
    <div class="float-clown"><img src="${clownArt(0)}" alt=""></div>`,
};

export const INTRO_BEATS: Beat[] = [
  { sc: 'street', text: '帰り道。路地の奥の、古いゲームコーナーの前を通りかかった。' },
  { sc: 'street', who: '？？？', text: '……おーい……そこのお客さん……こっちだよ……', fx: 'voice' },
  { sc: 'shop', who: 'ピエロ', text: 'へへっ……いらっしゃい、お客さん。こんな店に客なんて、何年ぶりだろうねえ。', fx: 'clown' },
  { sc: 'shop', who: 'ピエロ', text: 'ところで、お客さんの名前は？', ask: true },
  { sc: 'shop', who: 'ピエロ', text: '{name}、いい名前だ。……とっておきの台があるんだ。奥へどうぞ。' },
  { sc: 'room', text: '案内されたのは、窓のない暗い部屋。古いピンボール台が一台だけ、ぼんやり光っている。' },
  { sc: 'room', text: '――背後でドアが閉まった。……開かない。', fx: 'slam' },
  { sc: 'table', who: 'ピエロ', text: 'へへっ。ようこそ、呪われた台へ。ここから出たけりゃ、この台で GUM を稼いで「入金口」に納めな。', fx: 'clown' },
  { sc: 'table', who: 'ピエロ', text: 'ノルマは 3 プレイ以内。納められなけりゃ……稼いだものは全部、この台がいただく。' },
  { sc: 'table', who: 'ピエロ', text: '稼いで、仕掛けを足して、台を育ててくれりゃ……出してやってもいいぜ、{name}。' },
];

export function openIntro(root: HTMLElement, save: Save, done: () => void): void {
  openStory(root, {
    cls: 'intro',
    scenes: STORY_SCENES,
    beats: INTRO_BEATS,
    fill: (t) => fillLine(t, { name: save.name }),
    ask(raw) { save.name = cleanName(raw); },
    askMax: NAME_MAX,
    lastLabel: 'はじめる',
    skip: true,
    done() {
      if (!save.name) save.name = cleanName('');
      done();
    },
  });
}
