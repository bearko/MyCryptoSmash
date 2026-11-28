// 導入（はじめて開いたときだけ。名前がまだないとき）。タップで送る短い場面の連なり（ユーザーの指定）：
// ① 道で呼ぶ声 ② 店に入るとコモンのピエロが暗がりに浮かび「お客さん」と語りかける ③ 名前をたずねる（10 文字まで。空なら「お客さん」）
// ④ 暗い部屋に案内される。扉は見ている人の背後にあり、背後から差しこむ光が床に四角く落ち、その中に自分の影が台の方へ伸びている
// ⑤ 突然、扉が閉まる：扉は描かず、四角い光が細くなって消えることで閉まったと分かる（バタンという音とゆれ）。
//    部屋が一瞬まっくらになり、ピンボールの台の光だけが闇の中にぼんやり浮かび上がる（story.ts の slam・main.css の .sc-room）
// ⑥ 呪われたピンボールと入金口の説明（闇のまま、台が赤く光る。場面は暗転のまま重ねて切りかえる：soft）。
// 絵は CSS（と光と影の SVG）とピエロの絵と、はじめの台の写真（table-shot.ts。その場で描く）。プレイヤー自身のセリフと性格はない。

import type { Save } from '../core/save';
import { NAME_MAX, cleanName, fillLine } from '../game/clown-lines';
import { clownArt } from '../game/toys';
import { gapPoints, openStory, type Beat } from './story';
import { paintTableShot } from './table-shot';

/**
 * 背後の扉から差しこむ光（暗い部屋）。床の四角い光（遠くほど細い）と、奥の壁に映る光と、その中に伸びる自分の影。
 * 扉が閉まるときは story.ts が切り抜き（.gap）を右へせばめて、光を細くして消す。座標は 0〜100（床と壁の境は 51.3）
 */
export const BEAM = `<div class="beam" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
  <defs>
    <linearGradient id="stLtFloor" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe7ae" stop-opacity=".78"/><stop offset="1" stop-color="#ffc964" stop-opacity=".36"/></linearGradient>
    <linearGradient id="stLtWall" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd98a" stop-opacity=".3"/><stop offset="1" stop-color="#ffd98a" stop-opacity=".08"/></linearGradient>
    <clipPath id="stGap" clipPathUnits="userSpaceOnUse"><polygon class="gap" points="${gapPoints(0)}"/></clipPath>
    <filter id="stSoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.35"/></filter>
  </defs>
  <g clip-path="url(#stGap)">
    <polygon class="lt-wall" points="26,8 74,8 74,51.3 26,51.3" fill="url(#stLtWall)"/>
    <polygon class="lt-floor" points="26,51.3 74,51.3 96,100 4,100" fill="url(#stLtFloor)"/>
    <g class="me" fill="#0a0610" filter="url(#stSoft)">
      <ellipse cx="50" cy="58.4" rx="2.3" ry="2.2"/>
      <path d="M49.2 60.8 L45.6 63.1 Q44.6 63.6 44.4 65.2 L43.4 76.2 L44.9 76.5 L46 68.1 L46.6 72.8 L46.2 77.4 L43.6 102.3 L49.3 102.3 L49.8 81.5 L50.2 81.5 L50.7 102.3 L56.4 102.3 L53.8 77.4 L53.4 72.8 L54 68.1 L55.1 76.5 L56.6 76.2 L55.6 65.2 Q55.4 63.6 54.4 63.1 L50.8 60.8 Z"/>
    </g>
  </g>
</svg></div>`;

/** 場面の背景（CSS で描く） */
export const STORY_SCENES = {
  street: `<i class="sky-stars"></i><i class="moon"></i><div class="town"><i></i><i></i><i></i><i></i></div>
    <div class="shopfront"><div class="sign"><b>G</b><b>A</b><b>M</b><b>E</b></div><div class="door"><i></i></div><span class="door-voice">おーい……</span></div>
    <div class="lamp"><i></i></div><div class="road"></div>`,
  shop: `<div class="cabs"><i></i><i></i><i></i><i></i><i></i></div><i class="dust"></i>
    <div class="float-clown"><img src="${clownArt(0)}" alt=""></div>`,
  room: `<i class="rm-floor"></i>${BEAM}<i class="rm-halo"></i><div class="machine"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="rm-dark"></i><i class="dust"></i>`,
  table: `<i class="rm-floor"></i><i class="rm-halo cursed"></i><div class="machine cursed"><i class="bb"></i><i class="pf"></i><i class="legs"></i></div><i class="dust"></i>
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
  { sc: 'table', soft: true, who: 'ピエロ', text: 'へへっ。ようこそ、呪われた台へ。ここから出たけりゃ、この台で GUM を稼いで「入金口」に納めな。', fx: 'clown' },
  { sc: 'table', who: 'ピエロ', text: 'ノルマは 3 プレイ以内。納められなけりゃ……稼いだものは全部、この台がいただく。' },
  { sc: 'table', who: 'ピエロ', text: '稼いで、仕掛けを足して、台を育ててくれりゃ……出してやってもいいぜ、{name}。' },
];

export function openIntro(root: HTMLElement, save: Save, done: () => void): void {
  const el = openStory(root, {
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
  // 暗い部屋の台：はじめの台（打ち出しとフリッパーだけ）の写真を貼る（ユーザーの指定：本物の台に見せる）
  paintTableShot(el, save);
}
