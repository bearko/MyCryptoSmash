// 入口：画面の部品をつなぎ、センサー・タッチ・キーボードの入力を World に渡し、毎コマ描く。

import '@fontsource/dotgothic16';
import '@fontsource/dela-gothic-one';
import '@fontsource/bangers';
import './styles/main.css';

import { cat, heroById, ITEM_COLOR, ITEM_LABEL, RARITY_COLOR, RARITY_NAME, type Ext, type Hero } from './core/catalog';
import { blip, buzz, chime, pauseBgm, playBgm, roar, se, setMuted, setVibrate, unlockAudio } from './core/audio';
import { loadVoice, say, setVoice, speaking } from './core/voice';
import { Announcer, PEAK, type Call } from './game/announcer';
import { callout, flash, initJoker, jokerCheer, setJokerTier } from './ui/callout';
import { showToyGet } from './ui/gimmick';
import { openIntro } from './ui/intro';
import { clownHush, clownSay, startTalk, talkHtml } from './ui/talk';
import { NAME_MAX, cleanName, clownLine, finalLine, preScene, tutorialLine } from './game/clown-lines';
import { openEnding, openFinalIntro, openNormalEnding } from './ui/ending';
import { FINAL_FLOORS } from './game/final';
import { CLOWN_NAME, clownOf, restockToys, toysUnlocked } from './game/toys';
import { clearSave, loadSave, writeSave, type Save } from './core/save';
import { KeyTilt, Sensors } from './core/sensors';
import { isPc, onPcChange, watchKeyboard } from './ui/device';
import { initHover } from './ui/hover';
import { hideLaunchHint, initHelp, launchHintShown, showLaunchHint } from './ui/ready';
import { initCoach, type CoachSpec } from './ui/coach';
import { clamp, fmt, img, pick } from './core/util';
import { FAST_CLEAR, FLOORS, heroBonus, startFloor } from './game/economy';
import { migrateLevels } from './game/skills';
import { affordableCount, openTree } from './ui/tree';
import { draw, type Rink } from './game/render';
import { drawPinball, guideView, tableAt, type DisplayRect } from './game/render-pinball';
import { openGuide, type Guide } from './ui/guide';
import { fixParty, initHome, quotaTag, restockAll, restockShop } from './ui/home';
import { openHeatLeft, openLimitedPick } from './ui/limited';
import { openOffer } from './ui/offer';
import { ruleOf } from './game/offers';
import { abilityOf, abilityPower } from './game/abilities';
import { PARTS } from './game/parts';
import { World, type WorldEvents } from './game/world';
import { PinballWorld, topSource } from './game/pinball';
import { Tally, settle } from './game/tally';
import { runPayout } from './ui/payout';
import { FINAL_TRIES, QUOTAS, QUOTA_PLAYS, canPlay, clearChallenge, commitFocus, commitPlay, deliver, finalResult, malletLv, malletPoints, playEmblems, quotaBonus, quotaEmblems, quotaStatus, recordPlay, resetChallenge, skipTutorial, startPlay, tutorialState, type TutorialKey } from './game/quota';
import { ELEM_ATTACK, ELEM_COLOR, ELEM_NAME } from './game/elements';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- セーブとデバッグ用の URL
const params = new URLSearchParams(location.search);
const commons = cat.heroes.filter((h) => h.rarity === 1);
let save: Save = loadSave(pick(commons.length ? commons : cat.heroes).id);
if (params.has('reset')) { clearSave(); save = loadSave(save.hero); }
save.up = migrateLevels(save.up);
if (params.has('gum')) save.gum = Number(params.get('gum')) || 0;
// 確認用：名前を決めて導入をとばす
if (params.has('name')) save.name = cleanName(params.get('name') ?? '');
/** 前に途中で閉じたプレイの GUM を受け取る */
const pendingAtStart = save.pendingGum ?? 0;
if (pendingAtStart > 0) {
  save.gum += pendingAtStart;
  save.totalGum += pendingAtStart;
  save.pendingGum = 0;
}
/** 確認用：その階から始める */
const floorOverride = params.has('floor') ? Math.max(1, Math.min(FLOORS, Number(params.get('floor')) || 1)) : 0;
/** 確認用：ピンボールのその台から始める */
const tableOverride = params.has('table') ? Math.max(1, Math.min(FLOORS, Number(params.get('table')) || 1)) : 0;

const sensors = new Sensors();
const ui = {
  cv: $<HTMLCanvasElement>('cv'),
  gumText: $('gumText'), gumRate: $('gumRate'), embText: $('embText'), gumBox: document.querySelector('.gum') as HTMLElement,
  stageText: $('stageText'), stageBar: $('stageBar'), stageBox: document.querySelector('.stage') as HTMLElement,
  buffs: $('buffs'), mode: $('mode'), bubbleDot: $('bubbleDot'),
  shopBadge: $('shopBadge'), sheet: $('sheet'), sheetTitle: $('sheetTitle'), sheetBody: $('sheetBody'),
  banner: $('banner'), toast: $('toast'),
};
$<HTMLImageElement>('gumIcon').src = cat.icons.gum;

// ---------------------------------------------------------------- World
/**
 * このプレイの GUM の集計（プレイ中は財布に入れず、出どころごとにためる。プレイのあとに倍率を掛けて発表：src/ui/payout.ts）。
 * tallyOpen はプレイ中（ピラミッドもふくむ）だけ true
 */
const tally = new Tally();
let tallyOpen = false;
const events: WorldEvents = {
  gum(v, src = 'mods', n = 1) {
    if (guide) return; // 解説モードの実演では入らない
    if (!tallyOpen) {
      save.gum += v;
      save.totalGum += v;
      return;
    }
    tally.add(world === pyramid ? 'pyramid' : src, v, n);
    world.runGum += v;
    gameGum += v;
  },
  item(ext) { itemToast(ext); },
  hero(h, isNew, bonus) { heroToast(h, isNew, bonus); },
  boss(name, raid) {
    if (!raid || arming) return;
    showBanner('RAID BOSS', name, true);
    playBgm('boss');
    announcer.event(nowSec(), 'boss', 2);
  },
  clear(floor, t) {
    // ボス台の掟を破った：次にノルマを納めたときの Limited の候補 +1（Limited はノルマ達成のごほうび）
    if (world === pinball && ruleOf(floor)) save.quota.cards += 1;
    if (floor % 10 === 0) {
      playBgm('field');
      se('win', 0.6, 0);
      announcer.event(nowSec(), 'bossDown', 3, t >= FAST_CLEAR);
    }
    writeSave(save);
  },
  runEnd(reason) {
    // ピラミッドの時間切れ（または 50 階突破）：ピンボールにもどる
    if (world === pyramid) leavePyramid(reason);
    else showResult(reason);
  },
  gate() { enterPyramid(); },
  offer(id) {
    picking = true;
    openOffer($('app'), id, (yes) => {
      if (yes) pinball.acceptOffer(id);
      picking = false;
      last = performance.now();
    });
  },
  kill() { /* 進み具合は毎コマ描きなおす */ },
  hit(combo, weak, smash) {
    // 連鎖の音：1 ヒットごとに半音ずつ上がる
    if (combo > lastChime && combo >= 2) { chime(combo - 2); lastChime = combo; }
    announcer.hit(nowSec(), combo, weak, smash);
    const fever = combo >= PEAK;
    if (fever !== feverOn) { feverOn = fever; $('app').classList.toggle('fever', fever); }
  },
  comboEnd(n) {
    announcer.comboEnd(nowSec(), n);
    lastChime = 0;
    feverOn = false;
    $('app').classList.remove('fever');
  },
  pin(_text, tier) {
    // ピンボールの知らせ（仕掛けの名前など）は上の電光掲示板に出るので、ジョーカーは言わない。
    // 大きな知らせにはジョーカーが身ぶりだけで盛り上がる
    if (tier >= 2) jokerCheer(Math.min(3, tier));
    if (tier >= 3) { se('blast', 0.4, 0, 1.2); flash($('callouts'), ELEM_FLASH[3]); buzz([0, 30, 30, 30]); }
    else if (tier === 2) se('buff', 0.4, 0, 1.3);
    else blip(tier === 0 ? 200 : 760, 0.1, 'square', 0.06, tier === 0 ? 0.5 : 1.4);
  },
};
/** ピラミッド（15 秒・50 階）とピンボール（30 秒・台）。いま遊んでいる方が world */
const pyramid = new World(save, events);
const pinball = new PinballWorld(save, events);
let world: World = pinball;
$('app').classList.add('pin');
const isPin = (): boolean => world instanceof PinballWorld;
function calcAll(): void { pyramid.calcStats(); pinball.calcStats(); }

// ---------------------------------------------------------------- 実況（声と、アメコミ風の文字）
const nowSec = (): number => performance.now() / 1000;
let lastChime = 0;
let feverOn = false;
let textBusyUntil = 0;
const ELEM_FLASH = ['', '', 'rgba(63,169,255,0.9)', 'rgba(255,46,166,0.9)'];
/** 声で言えたら文字も出す。声がないとき（切っている・読みこみ前）は文字だけを、間をあけて出す */
function announce(call: Call, priority: boolean): boolean {
  const voiceOn = settings.voice && !settings.mute;
  let shown = false;
  if (voiceOn) shown = say(call.text, priority) > 0;
  if (!shown && (!voiceOn || !speaking())) {
    const now = nowSec();
    if (priority || now >= textBusyUntil) { shown = true; textBusyUntil = now + 0.9; }
  }
  if (!shown) return false;
  const big = call.kind === 'milestone' || (call.kind === 'event' && priority);
  callout($('callouts'), call.text, call.tier, big);
  // 段階ごとの効果音と演出
  if (call.tier === 0) blip(990, 0.08, 'square', 0.05, 1.3);
  else if (call.tier === 1) se('buff', 0.35, 0, 1.4);
  else {
    se('blast', call.tier === 3 ? 0.45 : 0.3, 0, call.tier === 3 ? 1.15 : 1);
    roar(call.tier === 3 ? 0.9 : 0.35, call.tier === 3 ? 1.6 : 0.9);
    flash($('callouts'), ELEM_FLASH[call.tier]);
    world.quake = Math.max(world.quake, call.tier === 3 ? 10 : 5);
    buzz(call.tier === 3 ? [0, 30, 30, 30] : 20);
  }
  return true;
}
const announcer = new Announcer(announce);

const settings = save.settings;
function applySettings(): void {
  sensors.invertTilt = settings.invertTilt;
  sensors.invertShake = settings.invertShake;
  sensors.shakeThreshold = 12 / settings.shakeSens;
  setMuted(settings.mute);
  setVibrate(settings.vibrate);
  setVoice(settings.voice);
}
applySettings();

let lastShake = 0;
sensors.onShake = (s) => {
  if ((!running && !guide) || world.hold.active || pinball.waiting) return;
  world.shake(s.x, s.y, s.power, sensors.shakeThreshold);
  lastShake = performance.now();
};

// ---------------------------------------------------------------- 画面の大きさ
let dpr = 1;
let cw = 0;
let ch = 0;
const rink: Rink = { x: 0, y: 0, w: 0, h: 0 };
/** ピンボールの上の液晶ディスプレイ */
const disp: DisplayRect = { x: 0, y: 0, w: 0, h: 0 };
const ctx = ui.cv.getContext('2d') as CanvasRenderingContext2D;
function layout(): void {
  const app = $('app').getBoundingClientRect();
  // ピンボールは描くものが多いので、細かさを少しだけ抑える（2 倍まで）
  dpr = Math.min(isPin() ? 2 : 2.5, window.devicePixelRatio || 1);
  cw = app.width;
  ch = app.height;
  ui.cv.width = Math.round(cw * dpr);
  ui.cv.height = Math.round(ch * dpr);
  // 解説モードの間は、その見出しと説明のカードの間に台を映す
  const topEl = (guide?.el.querySelector('.guide-head') ?? document.querySelector('.top')) as HTMLElement;
  const bottomEl = (guide?.el.querySelector('.guide-card') ?? document.querySelector('.bottom')) as HTMLElement;
  const top = topEl.getBoundingClientRect().bottom - app.top;
  const bottom = bottomEl.getBoundingClientRect().top - app.top;
  const availH = Math.max(200, bottom - 6 - (top + 4));
  // 実況のジョーカーとことばは、台を映す窓の右上に置く
  queueMicrotask(() => $('callouts').style.setProperty('--rink-top', `${rink.y}px`));
  if (isPin()) {
    // ピンボール：上に液晶ディスプレイ、その下は台を映す窓（台は広いので、カメラが球を追う）
    const dh = Math.round(clamp(availH * 0.075, 40, 56));
    disp.x = 12;
    disp.w = cw - 24;
    disp.h = dh;
    disp.y = top + 6;
    rink.x = 8;
    rink.w = cw - 16;
    rink.y = disp.y + dh + 8;
    rink.h = Math.max(200, bottom - 6 - rink.y);
    return;
  }
  rink.x = 8;
  rink.y = top + 4;
  rink.w = cw - 16;
  rink.h = availH;
  world.resize((rink.h / rink.w) * world.w);
}
window.addEventListener('resize', layout);
screen.orientation?.addEventListener?.('change', () => setTimeout(layout, 150));

// ---------------------------------------------------------------- タッチ：押して引っぱって離す（はじく）
// 画面のどこを押してもよい。引いた向きと反対へ、引いた長さに応じた速さで飛ぶ。
// 押している間はマレットにブレーキがかかり、時間がゆっくりになる（傾き・振りは使わない）。
let pointerId: number | null = null;
let sx = 0;
let sy = 0;
ui.cv.addEventListener('pointerdown', (e) => {
  if (guide) {
    const a = $('app').getBoundingClientRect();
    const [x, y] = tableAt(e.clientX - a.left, e.clientY - a.top, rink);
    guide.tap(x, y);
    return;
  }
  // 打ち出しを待つ台：プレイを使いきっていたら入金口（または GAME OVER）へ
  if (readyOn && !canPlay(save.quota, save.gum)) { checkQuota(); return; }
  if (!running || pointerId !== null || !world.canHold) return;
  unlockAudio();
  pointerId = e.pointerId;
  try { ui.cv.setPointerCapture(e.pointerId); } catch { /* noop */ }
  sx = e.clientX;
  sy = e.clientY;
  world.holdStart();
  blip(300, 0.05, 'sine', 0.05, 1.3);
  if (ui.sheet.hidden === false) closeSheet();
});
let lastPullStep = 0;
ui.cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  // 画面の px → ユニット（ピンボールはカメラのふつうの広さで数える）
  const k = (isPin() ? 420 : world.w) / rink.w;
  // 打ち出しの通路の球は、下へ引いた分だけ（横へのスワイプでうっかり打ち出さないように、横の動きの分は差し引く）。打ち出す向きはいつも上
  const dx = (e.clientX - sx) * k;
  const dy = (e.clientY - sy) * k;
  if (world === pinball && pinball.parked === 'plunger') world.holdPull(0, Math.max(0, dy - Math.abs(dx) * 0.6));
  else world.holdPull(dx, dy);
  // 引くほど音が上がる（10 段）
  const step = Math.floor(world.pullPower * 10);
  if (step !== lastPullStep) {
    lastPullStep = step;
    if (step > 0) blip(220 + step * 40, 0.03, 'triangle', 0.04, 1.05);
    if (step === 10) buzz(8);
  }
});
const release = (e: PointerEvent): void => {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  lastPullStep = 0;
  const wasWaiting = world === pinball && pinball.waiting;
  // iPhone ではじめての打ち出し：先にセンサーの許可をたずねる（許可の画面の裏でプレイの時間が進まないように、この 1 回は打ち出さない）
  if (wasWaiting && needsPermission() && !sensorAsked && sensors.state === 'idle') {
    world.hold.active = false;
    toast(null, '傾きセンサーを使います', '許可したら、もう一度引っぱって打ち出そう', '#3fd0ff');
    return;
  }
  // 打ち出しの GUM・スキルショットもこのプレイの集計に入るよう、離す前に集計を開く（打ち出さなかったら閉じる）
  if (wasWaiting) { tally.clear(); tallyOpen = true; }
  world.holdEnd();
  // 打ち出しの通路から球が出た瞬間に、プレイが始まる
  if (wasWaiting && pinball.parked !== 'plunger') launched();
  else if (wasWaiting) { tallyOpen = false; tally.clear(); }
};
ui.cv.addEventListener('pointerup', release);
ui.cv.addEventListener('pointercancel', release);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- キーボード（PC：W・A・S・D と矢印で傾き、スペースで振り）
// 傾きは押している間その向きへなめらかに傾き、離すと戻る（sensors.ts の KeyTilt）。振りは 1 回押すと 1 回。
// マウスで引っぱっている間・打ち出す前は、どちらも使わない。入力欄に打っているときは受けない
const keyTilt = new KeyTilt();
const typing = (e: KeyboardEvent): boolean => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
window.addEventListener('keydown', (e) => {
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (keyTilt.key(e.code, true)) { if (running && !home.visible) e.preventDefault(); return; }
  if (e.code !== 'Space') return;
  // スペースでボタンを押したり、画面が流れたりしないように
  e.preventDefault();
  if (e.repeat || !running || tree || picking || world.hold.active || pinball.waiting || world.phase !== 'play') return;
  const aim = keyTilt.aim;
  const a = Math.random() * Math.PI * 2;
  world.shake(aim ? aim[0] : Math.cos(a), aim ? aim[1] : Math.sin(a), 20, 12);
  lastShake = performance.now();
});
window.addEventListener('keyup', (e) => {
  if (keyTilt.key(e.code, false)) return;
  if (e.code === 'Space' && !typing(e)) e.preventDefault();
});
window.addEventListener('blur', () => keyTilt.clear());

// ---------------------------------------------------------------- 水平リセット
$('btnLevel').addEventListener('click', () => {
  unlockAudio();
  sensors.calibrate();
  const b = $('btnLevel');
  b.classList.remove('flash');
  void b.offsetWidth;
  b.classList.add('flash');
  blip(520, 0.1, 'sine', 0.1, 1.5);
  buzz(15);
  toast(null, '水平をリセットしました', 'いまの角度が傾き 0 になりました', '#3fd0ff');
});

// ---------------------------------------------------------------- 知らせ
let bannerTimer = 0;
function showBanner(text: string, sub: string, boss: boolean): void {
  ui.banner.hidden = false;
  ui.banner.className = 'banner' + (boss ? ' boss' : '');
  ui.banner.innerHTML = `${esc(text)}<small>${esc(sub)}</small>`;
  void ui.banner.offsetWidth;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { ui.banner.hidden = true; }, 1800);
}
let toastTimer = 0;
function toast(icon: string | null, text: string, sub: string, color: string): void {
  ui.toast.hidden = false;
  ui.toast.style.setProperty('--c', color);
  ui.toast.innerHTML = `${icon ? `<img src="${esc(icon)}" alt="">` : ''}<div>${esc(text)}<small>${esc(sub)}</small></div>`;
  ui.toast.style.animation = 'none';
  void ui.toast.offsetWidth;
  ui.toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 2600);
}
function itemToast(ext: Ext): void {
  const time = ext.kind === 'wave' ? 'フィールド全体に攻撃' : '12 秒';
  toast(ext.img, `${ext.name}`, `${ITEM_LABEL[ext.kind]}　${time}`, ITEM_COLOR[ext.kind]);
}
function heroToast(h: Hero, isNew: boolean, bonus: number): void {
  toast(h.img, isNew ? `ヒーロー獲得！ ${h.name}` : `${h.name}（所持済み）`,
    isNew ? `${RARITY_NAME[h.rarity]}　「ヒーロー」でマレットにできます` : `かわりに ${fmt(bonus)} GUM`, RARITY_COLOR[h.rarity]);
  if (isNew) refreshSheet();
}

// ---------------------------------------------------------------- UI の動き（増えた GUM・触った所の光・画面の切りかえ）
let popCount = 0;
function gumPop(v: number): void {
  if (popCount > 3 || fmt(v) === '0') return;
  const b = ui.gumBox.getBoundingClientRect();
  const a = $('app').getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'gum-pop';
  el.textContent = `+${fmt(v)}`;
  el.style.left = `${b.right - a.left - 18 + Math.random() * 16}px`;
  el.style.top = `${b.bottom - a.top - 6}px`;
  $('app').appendChild(el);
  popCount += 1;
  setTimeout(() => { el.remove(); popCount -= 1; }, 700);
}
// ボタンを触ると、触った所から光が広がる
document.addEventListener('pointerdown', (e) => {
  const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('.pill, .level, .start, .res-tree, .icon, .seg button');
  if (!t || t.querySelector('.badge')) return;
  const r = t.getBoundingClientRect();
  if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
  t.style.overflow = 'hidden';
  const el = document.createElement('i');
  el.className = 'ripple';
  el.style.left = `${e.clientX - r.left}px`;
  el.style.top = `${e.clientY - r.top}px`;
  t.appendChild(el);
  setTimeout(() => el.remove(), 520);
}, { passive: true });
/** 画面の切りかえ：斜めの帯が横切る（650ms）。まん中で文字が出る */
function wipe(c1: string, c2: string, text = ''): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('div');
  el.className = 'wipe';
  el.style.setProperty('--c1', c1);
  el.style.setProperty('--c2', c2);
  el.innerHTML = `<i></i><i></i><i></i>${text ? `<b>${text}</b>` : ''}`;
  $('app').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// ---------------------------------------------------------------- シート（強化・ヒーロー・設定）
type SheetKind = 'hero' | 'settings' | '';
let sheetKind: SheetKind = '';
function openSheet(k: SheetKind): void {
  unlockAudio();
  if (sheetKind === k && !ui.sheet.hidden) { closeSheet(); return; }
  sheetKind = k;
  ui.sheet.hidden = false;
  ui.sheetTitle.textContent = k === 'hero' ? 'ヒーロー' : '設定';
  renderSheet();
  blip(700, 0.05, 'square', 0.05, 1.2);
}
function closeSheet(): void {
  ui.sheet.hidden = true;
  sheetKind = '';
}
function refreshSheet(): void { if (!ui.sheet.hidden) renderSheet(); }
// スキルツリー（開いている間はゲームを止める）
let tree: { refresh(): void; close(): void } | null = null;
$('btnShop').addEventListener('click', () => {
  unlockAudio();
  if (tree) return;
  closeSheet();
  blip(700, 0.05, 'square', 0.05, 1.2);
  tree = openTree($('app'), save, {
    changed() { calcAll(); applyStats(); writeSave(save); rearm(); },
    close() { tree = null; last = performance.now(); home.refresh(); },
    cheer(newSkill) { announcer.event(nowSec(), newSkill ? 'newSkill' : 'powerUp', newSkill ? 2 : 1); },
  });
});
/** スキルで変わる、センサーの側の値 */
function applyStats(): void {
  sensors.cooldownMs = world.st.shakeCooldown;
}
$('btnHero').addEventListener('click', () => openSheet('hero'));
$('btnSettings').addEventListener('click', () => openSheet('settings'));
$('sheetClose').addEventListener('click', closeSheet);

function renderSheet(): void {
  if (sheetKind === 'hero') renderHeroes();
  else if (sheetKind === 'settings') renderSettings();
}

ui.sheetBody.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button');
  if (!t) return;
  if (t.dataset.hero) {
    save.hero = Number(t.dataset.hero);
    fixParty(save);
    calcAll();
    writeSave(save);
    rearm();
    blip(900, 0.08, 'square', 0.06, 1.4);
    renderHeroes();
    return;
  }
  if (t.dataset.toggle) {
    if (t.dataset.toggle === 'oval') {
      settings.fieldShape = settings.fieldShape === 'oval' ? 'rect' : 'oval';
      world.resize(world.h); // いる場所をフィールドの中へ
      writeSave(save);
      renderSettings();
      return;
    }
    const k = t.dataset.toggle as 'invertTilt' | 'invertShake' | 'mute' | 'vibrate' | 'voice' | 'wideHit' | 'partTags';
    settings[k] = !settings[k];
    applySettings();
    writeSave(save);
    renderSettings();
    return;
  }
  if (t.id === 'btnGuideSet') { startGuide(); return; }
  if (t.id === 'btnPerm') {
    void startSensors().then(renderSettings);
    return;
  }
  if (t.id === 'btnWipe') {
    if (!t.classList.contains('armed')) {
      t.classList.add('armed');
      t.textContent = 'もう一度押すと、すべての進み具合を消します';
      return;
    }
    clearSave();
    location.reload();
  }
});
ui.sheetBody.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.dataset.name) return;
  save.name = cleanName(t.value);
  t.value = save.name;
  writeSave(save);
  home.refresh();
  blip(880, 0.08, 'square', 0.07, 1.6);
});
ui.sheetBody.addEventListener('keydown', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset?.name && e.key === 'Enter') t.blur();
});
ui.sheetBody.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.name) return;
  if (t.dataset.range === 'tilt') settings.tiltSens = Number(t.value);
  if (t.dataset.range === 'shake') settings.shakeSens = Number(t.value);
  applySettings();
  writeSave(save);
});

function renderHeroes(): void {
  const h = heroById(save.hero);
  const b = heroBonus(h);
  const owned = save.heroes.map(heroById).sort((x, y) => y.rarity - x.rarity || x.id - y.id);
  ui.sheetBody.innerHTML = `
    <div class="hero-now"><img src="${esc(h.img)}" alt="" style="box-shadow:0 0 0 3px ${RARITY_COLOR[h.rarity]}">
      <div><h3>${esc(h.name)}</h3><p>${RARITY_NAME[h.rarity]}　PHY ${h.phy}・INT ${h.int}・AGI ${h.agi}<br>
      攻撃 <b>×${b.atk.toFixed(2)}</b>　GUM <b>×${b.gum.toFixed(2)}</b>　滑り <b>×${b.power.toFixed(2)}</b><br>
      能力 <b>${esc(abilityOf(h).name)}</b>：${esc(abilityOf(h).text(abilityPower(h, true)))}</p></div></div>
    <div class="heroes">${owned.map((o) => `<button data-hero="${o.id}" aria-pressed="${o.id === save.hero}" style="--c:${RARITY_COLOR[o.rarity]}" aria-label="${esc(o.name)}"><img src="${esc(o.img)}" alt=""></button>`).join('')}</div>
    <p class="hint">${owned.length} / ${cat.heroes.length} 人。ボスを倒すとヒーローが手に入ります（ステージが進むほど高いレアリティが出やすい）。PHY が攻撃力、INT が GUM、AGI が滑りやすさを上げます。持っているヒーローは仲間としても出てきます。</p>`;
}

function sensorText(): { text: string; bad: boolean } {
  switch (sensors.state) {
    case 'ok': return { text: `<b>動作中</b>（${sensors.source === 'motion' ? '加速度センサー' : '傾きセンサー'}）`, bad: false };
    case 'waiting': return { text: '<b>センサーの値を待っています</b>　しばらくしても変わらない場合、この端末やブラウザではセンサーが使えないかもしれません。', bad: true };
    case 'denied': return { text: '<b>センサーの使用が許可されていません</b>　下のボタンで許可するか、ブラウザの設定で「モーションと画面の向き」を許可してください。タッチ操作では遊べます。', bad: true };
    case 'none': return { text: '<b>センサーがありません</b>　タッチ操作（PC では W・A・S・D で傾き、スペースで揺らす、マウスで引っぱり）で遊べます。', bad: true };
    default: return { text: '<b>まだ始まっていません</b>', bad: true };
  }
}

function renderSettings(): void {
  const st = sensorText();
  const tg = (k: string, on: boolean, label: string, sub: string) =>
    `<div class="set"><label>${label}<small>${sub}</small></label><button class="toggle" data-toggle="${k}" aria-pressed="${on}" aria-label="${label}" data-tip="${sub}"></button></div>`;
  ui.sheetBody.innerHTML = `
    <div class="set"><label for="inName">プレイヤー名<small>ピエロが呼ぶ名前（${NAME_MAX} 文字まで。空なら「お客さん」）</small></label>
      <input id="inName" class="name-in" type="text" maxlength="${NAME_MAX + 2}" enterkeyhint="done" autocomplete="off" spellcheck="false" value="${esc(save.name)}" data-name="1"></div>
    ${isPc() && sensors.state !== 'ok'
    ? '<div class="status">操作：<b>W・A・S・D</b>（矢印キー）で傾き、<b>スペース</b>で揺らす、<b>マウス</b>で引っぱって離す</div>'
    : `<div class="status${st.bad ? ' bad' : ''}">センサー：${st.text}</div>
    ${sensors.state !== 'ok' ? '<button id="btnPerm" class="buy" style="width:100%">センサーを使う</button>' : ''}`}
    <div class="set"><label for="rgTilt">傾きの感度<small>大きいほど少し傾けただけで滑る</small></label>
      <input id="rgTilt" type="range" min="0.4" max="2.2" step="0.1" value="${settings.tiltSens}" data-range="tilt"></div>
    <div class="set"><label for="rgShake">振りの感度<small>大きいほど弱い振りで飛び出す</small></label>
      <input id="rgShake" type="range" min="0.4" max="2.2" step="0.1" value="${settings.shakeSens}" data-range="shake"></div>
    ${tg('invertTilt', settings.invertTilt, '傾きの向きを反対にする', '傾けた向きと逆に滑るときに')}
    ${tg('invertShake', settings.invertShake, '振りの向きを反対にする', '振った向きと逆に飛ぶときに')}
    ${tg('oval', settings.fieldShape === 'oval', 'フィールドを楕円にする', '角がなくなり、角の敵に当てやすくなる（ためし）')}
    ${tg('wideHit', settings.wideHit, '攻撃の届く範囲を広く', 'マレットのふちより少し先の敵にも当たる（ためし）')}
    ${tg('mute', settings.mute, '音を消す', 'BGM と効果音')}
    ${tg('voice', settings.voice, '実況の声', '連鎖をほめる英語の実況（声：ElevenLabs）')}
    ${tg('vibrate', settings.vibrate, '振動', '対応している端末だけ')}
    ${tg('partTags', settings.partTags, 'はじめての部品に名前を出す', '球がはじめて触れた部品の上に、名前の札が出る')}
    <button id="btnGuideSet" class="buy" style="width:100%;margin-top:10px">台のしくみを見る</button>
    <p class="hint">最高 STAGE ${save.best}・これまでに集めた GUM ${fmt(save.totalGum)}</p>
    <button id="btnWipe" class="danger">データを消して最初から</button>`;
}

// ---------------------------------------------------------------- センサー
/** 遊べる状態（世界を毎コマ進める）。打ち出す前の台も、打ち出しを待ちながら演出だけ動く */
const running = true;
/** iPhone・iPad のように、センサーの許可の画面が出る端末か（ほかのブラウザにも requestPermission はあるが、画面は出ない） */
const needsPermission = (): boolean => (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  && typeof (window as unknown as { DeviceMotionEvent?: { requestPermission?: unknown } }).DeviceMotionEvent?.requestPermission === 'function';
let sensorAsked = false;
async function startSensors(): Promise<void> {
  sensorAsked = true;
  const ok = await sensors.start();
  if (!ok) {
    toast(null, sensors.state === 'denied' ? 'センサーが許可されませんでした' : 'センサーなしで遊んでいます',
      sensors.state === 'denied' ? 'タッチで遊べます（設定からもう一度許可できます）' : isPc() ? 'W・A・S・D で傾き、スペースで揺らす' : '引っぱって離す で動かせます', '#ff4f5e');
  }
}
// はじめて触ったとき（タップの中で）センサーを始める。iPhone はここで許可をたずねる
const firstGesture = (): void => {
  if (sensorAsked || sensors.state !== 'idle') return;
  unlockAudio();
  void startSensors().then(() => { if (sheetKind === 'settings') renderSettings(); });
};
document.addEventListener('click', firstGesture, true);
document.addEventListener('touchend', firstGesture, true);

let wakeLock: { release(): Promise<void> } | null = null;
async function keepAwake(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && document.visibilityState === 'visible') wakeLock = await nav.wakeLock.request('screen');
  } catch { wakeLock = null; }
}

initJoker($('callouts'), clownOf(save));
if (pendingAtStart > 0) setTimeout(() => toast(cat.icons.gum, `前のプレイの GUM +${fmt(pendingAtStart)}`, 'プレイの途中で閉じた分を受け取りました', '#ffd23f'), 900);
/** Limited を選んでいる間（時間を止める） */
let picking = false;

// ---------------------------------------------------------------- 遊んでいないときの画面（ショップ・ピンボール・ラボ）
fixParty(save);
restockShop(save);
/** 画面の部品がそろった（これより前は、打ち出しの台を組まない） */
let booted = false;
const home = initHome($('home'), save, {
  tree() { $('btnShop').click(); },
  guide() { startGuide(); },
  settings() { openSheet('settings'); },
  changed() { calcAll(); applyStats(); writeSave(save); rearm(); },
  affordable() { return affordableCount(save); },
  toyBought(id, from, to) {
    // 台に仕掛けが足された演出 → ピエロの姿が上がったら進化の演出。実況のピエロもその姿になる
    showToyGet($('app'), id, from, to, save.name, () => { setJokerTier(clownOf(save)); home.refresh(); });
  },
  view() { if (booted) syncReady(); },
});

// はじめて開いたとき（名前がまだない）：導入の場面
if (!save.name) openIntro($('app'), save, () => { writeSave(save); home.show(1); });

// 前に閉じたとき：エンディングを見ていない・ヒートの印を選び残していた・ノルマのプレイを使いきっていた・納められるのに納めていない
function resume(): void {
  if (save.pendingEnding) {
    openEnding($('app'), save, () => { save.pendingEnding = false; restockAll(save); writeSave(save); home.show(1); });
    return;
  }
  if (save.pendingNormal) { normalEnding(); return; }
  if ((save.quota.heatLeft ?? 0) > 0 && openHeatLeft($('app'), save, () => { calcAll(); applyStats(); writeSave(save); resume(); })) return;
  const st = quotaStatus(save.quota, save.gum);
  if (st.over || st.mustPay) checkQuota();
  // 選んでいない Limited は、開き直しても自動では開かない（左上の「Limited Offer!」から）
  else if (st.canPay) checkQuota(true);
}
setTimeout(() => { if (save.name) resume(); }, 700);

// ---------------------------------------------------------------- 解説モード（台のしくみ）
let guide: Guide | null = null;
function startGuide(startId?: string): void {
  if (guide) return;
  unlockAudio();
  closeSheet();
  const prev = world;
  const fromTitle = home.visible;
  const resultOpen = !$('result').hidden;
  home.hide();
  $('result').hidden = true;
  pointerId = null;
  prev.hold.active = false;
  $('app').classList.add('guiding');
  guide = openGuide($('app'), save, {
    close() {
      guide = null;
      world = prev;
      $('app').classList.remove('guiding');
      $('app').classList.toggle('pin', isPin());
      if (fromTitle) home.show();
      if (resultOpen) $('result').hidden = false;
      layout();
      last = performance.now();
    },
    layout,
  }, startId);
  world = guide.world;
  $('app').classList.add('pin');
  layout();
}

/** はじめて球が触れた部品に、名前の札を出す（1 つの部品に 1 回だけ） */
let tagAt = 0;
function partTags(): void {
  if (!settings.partTags || world !== pinball || pinball.phase !== 'play' || !pinball.ballFree) return;
  const now = performance.now() / 1000;
  if (now - tagAt < 1.2) return;
  const b = pinball.puck;
  for (const p of PARTS) {
    if (!p.tag || save.seenParts.includes(p.id) || (p.toy && !pinball.toys[p.toy])) continue;
    if (Math.hypot(b.x - p.x, b.y - p.y) > p.r + b.r) continue;
    save.seenParts.push(p.id);
    guideView.tags.push({ x: p.x, y: p.y - p.r * 0.3, text: `${p.name}（${p.call}）`, t0: now });
    tagAt = now;
    return;
  }
}

// ---------------------------------------------------------------- 打ち出しを待つ台（ピンボールのページ）
// ピンボールのページを開くと、本物の台がそのまま見え、球（リーダー）が右の打ち出しの通路で待っている。
// 引っぱって離して打ち出した瞬間にプレイ（40 秒）が始まる（launched）。打ち出す前は、傾け・振りでは何も起きない。
// ノルマの情報は台の上の液晶に出す（ボタンや大きなパネルは出さない）。
/** 打ち出しを待つ台を見せている（スマホはピンボールのページ、PC は遊んでいない間ずっと） */
let readyOn = false;
/** 台を組み直している間（ボスの知らせなどを出さない） */
let arming = false;
/** 遊び方の ? と、はじめての人への案内 */
initHelp($('btnHelp'), $('app'));
/** 液晶に順に出す（打ち出す前） */
let dmdI = 0;
let dmdT = 0;
/** 台を組んだ時刻（しばらく打ち出さなければ、案内の絵を出す） */
let armedAt = 0;
/** ピエロが次にしゃべるまで（打ち出す前） */
let chatT = 16;
/** 上に重なっていて、打ち出しの台を見せない画面（導入・Limited の選択・GAME OVER など） */
function blocking(): boolean {
  return !$('result').hidden || overOpen || !!document.querySelector('#app > .story, #app > .limpick, #app > .gameover, #app > .offer, #app > .guide');
}
function wantReady(): boolean {
  return booted && home.visible && (isPc() || home.tab === 1) && !guide && !tallyOpen && !blocking();
}
/** 見えている画面に合わせて、打ち出しを待つ台を出す・しまう（切りかえのたびと、毎コマの見回りで呼ぶ） */
function syncReady(): void {
  const on = wantReady();
  if (on !== readyOn) {
    readyOn = on;
    $('app').classList.toggle('ready', on);
    if (on) arm(true);
    else hideLaunchHint();
  }
  // PC：プレイ中や、重なる画面が出ている間は、左右の列をグレーにして触れないように
  document.documentElement.classList.toggle('pc-busy', isPc() && (!home.visible || blocking() || !!guide));
}

/** 台を組んで、球を打ち出しの通路に置く（まだプレイは始めない。プレイの数もエンブレムも動かない） */
function arm(talk = false): void {
  if (world !== pinball && !guide) world = pinball;
  pointerId = null;
  pinball.hold.active = false;
  setJokerTier(clownOf(save)); // 実況のピエロはいまの姿で
  const pre = quotaStatus(save.quota, save.gum);
  if (!canPlay(save.quota, save.gum)) {
    // プレイを使いきっている：台はそのまま（演出だけ動かす）。台に触ると入金口（または GAME OVER）へ
    pinball.waiting = true;
    dmdT = 0;
    return;
  }
  arming = true;
  pinball.waiting = false;
  if (pre.final) pinball.startFinal();
  else pinball.startRun(tableOverride || save.pinDeepest);
  save.runs -= 1; // 打ち出すまではプレイに数えない（launched で数える）
  pinball.waiting = true;
  arming = false;
  dmdI = 0;
  dmdT = pinball.rule ? 2.6 : 0; // ボス台の掟の知らせを先に見せる
  armedAt = performance.now();
  $('app').classList.add('pin');
  layout();
  if (!talk) return;
  // チュートリアルの案内つき：ピエロのひとことと打ち出しの手の動きは、案内（tutorialTick）にまかせる
  if (tutorialState(save).guided) return;
  // 台に宿るピエロが、残りのプレイとノルマにひとこと（右上のピエロの吹き出し）
  const tier = clownOf(save);
  const line = pre.final
    ? finalLine('pre', { name: save.name, tries: pre.left })
    : clownLine(preScene(pre.left, pre.canPay), tier, { name: save.name, left: pre.left, rest: fmt(Math.max(0, Math.ceil(pre.need - save.gum))) });
  setTimeout(() => { if (readyOn) clownSay($('callouts'), line, 4200); }, 500);
  // はじめての人には、すぐに「引っぱって離す」の手の動きを見せる
  if (save.runs === 0) setTimeout(() => { if (readyOn && pinball.waiting) showLaunchHint($('app')); }, 900);
}

/** ショップで買った・ヒーローを変えた：打ち出しを待つ台を組み直す（引っぱっている間はそのまま） */
function rearm(): void {
  if (readyOn && pinball.waiting && !pinball.hold.active) arm(false);
}

/** 液晶の文字（打ち出す前）：ノルマ・台・手持ち・ボス台の掟を順に。毎コマ呼ぶ */
function readyTick(dt: number): void {
  if (!readyOn || !pinball.waiting || world !== pinball) return;
  dmdT -= dt;
  // 液晶は「時刻 0 の知らせ」を出さないので、台の時間が進んでから
  if (dmdT <= 0 && pinball.time > 0) {
    dmdT = 2.6;
    const st = quotaStatus(save.quota, save.gum);
    const lines: [string, string][] = st.left <= 0 ? [['DEPOSIT', '台に触ると入金口へ']] : st.final
      ? [['LAST STAGE', `ボス ${FINAL_FLOORS.length} 体・${pinball.runTime} 秒・のこり ${st.left}/${FINAL_TRIES} 回`], ['READY', '引っぱって離すとボスラッシュ開始']]
      : [
        save.quota.n <= 0 && !save.endless
          ? ['TUTORIAL', `練習のノルマ ${fmt(st.need)} GUM・のこり ${st.left}/${QUOTA_PLAYS} プレイ`]
          : [`${save.endless ? 'ENDLESS' : 'QUOTA'} ${save.endless ? save.quota.n : `${Math.min(save.quota.n, QUOTAS)}/${QUOTAS}`}`, `納品 ${fmt(st.need)} GUM・のこり ${st.left}/${QUOTA_PLAYS} プレイ`],
        [`TABLE ${pinball.floor}`, `引っぱって離すと ${pinball.runTime} 秒のプレイ開始`],
        st.canPay ? ['DEPOSIT OK', `手持ち ${fmt(save.gum)} GUM・納品できる（遊んでからでもよい）`]
          : save.gum >= st.need ? [`GUM ${fmt(save.gum)}`, `${QUOTA_PLAYS} プレイ遊んだら入金口へ`]
          : [`GUM ${fmt(save.gum)}`, `納品まで あと ${fmt(Math.ceil(st.need - save.gum))} GUM`],
      ];
    if (pinball.rule) lines.push([pinball.rule.name, `ボス台の掟：${pinball.rule.text}`]);
    const [text, sub] = lines[dmdI % lines.length];
    dmdI += 1;
    pinball.say(text, 0, sub);
  }
  // しばらく打ち出さなければ、案内の絵を出す。ピエロもときどきしゃべる（止まった画面にしない）
  const idle = performance.now() - armedAt;
  if (!launchHintShown() && !world.hold.active && idle > 12000 && canPlay(save.quota, save.gum) && !tutorialState(save).next) showLaunchHint($('app'));
  chatT -= dt;
  if (chatT <= 0 && !tutorialState(save).guided) {
    chatT = 16 + Math.random() * 8;
    if (idle > 6000 && !world.hold.active) clownSay($('callouts'), clownLine('title', clownOf(save), { name: save.name }), 4200);
  }
}

// ---------------------------------------------------------------- チュートリアルの案内（はじめての挑戦だけ。src/ui/coach.ts）
// 流れ（quota.ts の tutorialState）：打ち出す → ③三角のばねを買う → 打ち出す → ④内側の通路を買う → 打ち出す → 入金口に 50 GUM →
// ごほうびのエンブレムで⑦丸いばねを買う → 本当のノルマ 1。いまの画面に合わせて、ピエロの吹き出しと光る枠・指で次に触る所を見せる。
// 状態はセーブから決まるので、閉じて開き直しても続きの手順から出る
const coach = initCoach({
  skip() {
    skipTutorial(save);
    restockToys(save, true);
    writeSave(save);
    coach.set(null);
    home.refresh();
    toast(null, '案内をとばしました', 'ショップの最上段の部品で台を育てよう', '#ff6ad5');
  },
});
/** 場面ごとに選んだセリフ（同じ場面のあいだは同じ文。again は 2 回あるので、遊んだプレイの数も鍵に入れる） */
const coachText = new Map<string, string>();
/** 上に重なっていて、案内を出さない画面（演出・選択・解説など） */
const COACH_BLOCK = '#app > .story, #app > .toyget, #app > .limpick, #app > .gameover, #app > .offer, #app > .guide, .gx, .res-splash';
const navBtn = (i: number): HTMLElement | null => document.querySelector<HTMLElement>(`.home-nav button[data-tab="${i}"]`);
function coachSpec(): CoachSpec | null {
  if (!booted || !save.name) return null;
  const ts = tutorialState(save);
  if (!ts.guided || !ts.key) return null;
  if (guide || tallyOpen || tree || picking || overOpen || !ui.sheet.hidden || document.querySelector(COACH_BLOCK)) return null;
  const key: TutorialKey = ts.key;
  const step = `${key}:${save.quota.n}:${save.quota.played}`;
  let text = coachText.get(step);
  if (!text) {
    const st = quotaStatus(save.quota, save.gum);
    text = tutorialLine(key, { name: save.name, left: st.left, rest: fmt(Math.max(0, Math.ceil(st.need - save.gum))) });
    coachText.set(step, text);
  }
  const resultOpen = !$('result').hidden;
  // RESULT は、入金口のパネルが出てから
  if (resultOpen && !document.querySelector('#result .quota')) return null;
  const tier = clownOf(save);
  const pc = isPc();
  const mobileTab = (): number => (home.visible && !pc ? home.tab : -1);
  let target: (() => HTMLElement | null) | null = null;
  if (ts.next) {
    const id = ts.next;
    const shopShown = (): boolean => home.visible && (pc || home.tab === 0);
    target = () => {
      if (!$('result').hidden) return pc ? $('btnResAgain') : $('btnResShop');
      const buy = document.querySelector<HTMLElement>(`.tp[data-toy="${id}"] .tp-buy`);
      if (buy) return buy;
      if (shopShown()) return document.querySelector<HTMLElement>(`#pageShop [data-tier="gimmick"] [data-toy="${id}"]`);
      return mobileTab() >= 0 ? navBtn(0) : null;
    };
  } else if (key === 'deposit') {
    target = () => (!$('result').hidden ? document.querySelector<HTMLElement>('#result .quota .deposit') : mobileTab() === 0 || mobileTab() === 2 ? navBtn(1) : null);
  } else if (key === 'start' && !readyOn) {
    // 本当のノルマのはじめ：ショップやラボでは自由に買い物できるよう、何も出さない（台を見せたときにひとこと）
    return null;
  } else {
    // launch・again・start：台へ（打ち出しの手の動きは arm が出す）
    target = () => (!$('result').hidden ? $('btnResAgain') : mobileTab() === 0 || mobileTab() === 2 ? navBtn(1) : null);
  }
  return { key: step, text, tier, target, place: resultOpen ? 'top' : 'auto' };
}
/** 毎コマの見回りで呼ぶ */
function tutorialTick(): void {
  const spec = coachSpec();
  coach.set(spec);
  const ts = tutorialState(save);
  // PC：次の部品を買う間は、ショップの列を光らせる
  const glow = !!spec && !!ts.next && $('result').hidden && isPc();
  document.querySelector('.pc-left')?.classList.toggle('tut-glow', glow);
  // 案内つきで台を見せている間は、打ち出しの手の動きを出しておく（部品を買う番には出さない）
  if (spec && ts.next && launchHintShown()) hideLaunchHint();
  if (spec && readyOn && pinball.waiting && !pinball.hold.active && canPlay(save.quota, save.gum) && !launchHintShown()
    && performance.now() - armedAt > 700 && (ts.key === 'launch' || ts.key === 'again' || ts.key === 'start')) showLaunchHint($('app'));
}

/** 打ち出した瞬間：ここからプレイ（ノルマのプレイを 1 つ使い、エンブレム +1。閉じても戻らないように、始めた時点で数える） */
function launched(): void {
  pinball.waiting = false;
  save.runs += 1;
  hideLaunchHint();
  clownHush();
  gameGum = tally.base;
  gamePyramidBest = 0;
  tallyOpen = true;
  startPlay(save);
  closeSheet();
  $('result').hidden = true;
  home.hide();
  readyOn = false;
  $('app').classList.remove('ready');
  syncReady();
  unlockAudio();
  void loadVoice();
  void keepAwake();
  if (!sensorAsked) void startSensors();
  lastTick = 0;
  const final = !!pinball.final;
  playBgm(final ? 'boss' : 'field');
  if (final) showBanner('LAST STAGE', `ボス ${FINAL_FLOORS.length} 体・${pinball.runTime} 秒のボスラッシュ！`, true);
  else showBanner(`TABLE ${pinball.floor}`, `${pinball.runTime} 秒のピンボール！`, false);
  blip(660, 0.12, 'square', 0.08, 1.5);
  writeSave(save);
  layout();
}

// ---------------------------------------------------------------- プレイ（ピンボール）と、ピラミッドへの寄り道
let lastTick = 0;
/** このプレイで手に入れた GUM（ピラミッドの分もふくむ）・ピラミッドでいちばん深く進んだ階 */
let gameGum = 0;
let gamePyramidBest = 0;

/** 球がピラミッドへの入口に入った：15 秒のピラミッドへ（ピンボールの時間は止まる） */
function enterPyramid(): void {
  world = pyramid;
  pyramid.bonusTime = pinball.mods.pyramidTime;
  $('app').classList.remove('pin');
  pyramid.hold.active = false;
  layout();
  const start = floorOverride || startFloor(save.floorBest);
  pyramid.startRun(start);
  pyramid.runGum = 0;
  lastTick = 0;
  flash($('callouts'), 'rgba(255,210,63,0.9)');
  wipe('#ffd23f', '#ff8f1f', 'PYRAMID!');
  roar(0.8, 1.4);
  showBanner(`PYRAMID FLOOR ${pyramid.floor}`, `${start > 1 ? `${start - 1} 階を免除！ ` : ''}${pyramid.runTime} 秒で行けるところまで！`, false);
}

/** ピラミッドの時間切れ：ピンボールにもどる */
function leavePyramid(reason: 'time' | 'allclear'): void {
  const reached = reason === 'allclear' ? FLOORS : pyramid.floor;
  gamePyramidBest = Math.max(gamePyramidBest, reached);
  writeSave(save);
  world = pinball;
  $('app').classList.add('pin');
  pinball.hold.active = false;
  layout();
  pinball.returnFromPyramid();
  wipe('#3fd0ff', '#c08bff', 'BACK TO TABLE');
  lastTick = 0;
  playBgm('field');
  toast(cat.icons.gum, `PYRAMID FLOOR ${reached} まで`, `${pyramid.cleared.length} 階を突破・GUM はプレイのあとで発表`, '#ffd23f');
  if (reason === 'allclear') { se('win', 0.8, 0); announcer.event(nowSec(), 'allClear', 3); }
}

/** プレイ中に閉じても GUM が消えないよう、倍率まで掛けた見込みをセーブに残す */
function stashPending(): void {
  if (!tallyOpen) return;
  const b = pinball.gumBoosts(tally);
  save.pendingGum = settle(tally.list(), b.rows, b.exts, b.all).total;
}

/** このプレイで手に入れたエンブレム（プレイの +1 のほか。RESULT に出す） */
let runEmb = 0;
function showResult(reason: 'time' | 'allclear'): void {
  runEmb = 0;
  tallyOpen = false;
  // 取引の「次に納めたとき Limited をもう 1 つ」
  save.quota.extra += pinball.extraPicks;
  pinball.extraPicks = 0;
  $('result').querySelector('.result-card')?.classList.remove('locked');
  const fin = pinball.final ? { ...pinball.final } : null;
  const won = !!fin?.won;
  const all = reason === 'allclear';
  if (all) { se('win', 0.8, 0); roar(1, 2.4); }
  const row = (k: string, v: string, hi = false) => `<div class="res-row${hi ? ' hi' : ''}"><span>${k}</span><b>${v}</b></div>`;
  // まず TIME UP!（全クリは ALL CLEAR!!）を大きく出し、そのあと結果のカード（RESULT）で GUM を発表する
  $('resTitle').textContent = 'RESULT';
  $('resTitle').classList.toggle('all', all);
  const card = $('result').querySelector('.result-card') as HTMLElement;
  card.style.display = 'none';
  $('resBody').innerHTML = '';
  document.querySelectorAll('.res-splash').forEach((e) => e.remove());
  const splash = document.createElement('div');
  splash.className = `res-splash${all ? ' all' : ''}`;
  splash.innerHTML = `<span>${won ? 'ESCAPE!!' : all ? 'ALL CLEAR!!' : 'TIME UP!'}</span>`;
  $('result').appendChild(splash);
  se('blast', 0.6, 0, 0.8);
  roar(0.7, 1.2);
  for (let i = 0; i < 3; i += 1) setTimeout(() => blip(880, i === 2 ? 0.5 : 0.12, 'square', 0.07, 1), i * 220);
  // ヒーローを結果の文字やカードと重ねて置く（向きと位置は毎回少し変える）
  document.querySelectorAll('.res-hero').forEach((e) => e.remove());
  const hero = document.createElement('img');
  hero.className = `res-hero p${Math.floor(Math.random() * 3)}`;
  hero.src = heroById(save.hero).img;
  hero.alt = '';
  card.appendChild(hero);
  // GUM の発表：出どころごとの回数と基本額 → 装備の改造 → 全体の倍率 → 最後の額
  // 壊れものが壊れるかは、ここで 1 回だけ決める（発表と同じ結果をセーブへ）
  const boosts = pinball.gumBoosts(tally, Math.random);
  // 発表の途中で閉じても、このプレイの GUM をそのまま受け取れるように（5 秒ごとの見込みではなく、決まった額を残す）
  save.pendingGum = settle(tally.list(), boosts.rows, boosts.exts, boosts.all).total;
  // ラストステージの結果も先に決めて残す（発表の途中で閉じても、突破が消えない・エンディングを見られる）
  const finRes = fin ? finalResult(save, won) : null;
  if (finRes === 'escape') save.pendingEnding = true;
  const stats = fin ? [
    row('倒したボス', `${fin.i}<small> / ${FINAL_FLOORS.length}</small>`, won),
    row('最長の連鎖', `${pinball.bestCombo}`),
    row('マルチボール', `${pinball.multiballs} 回`),
  ].join('') : [
    row('到達した台', `TABLE ${all ? FLOORS : pinball.floor}<small> / ${FLOORS}</small>`),
    row('最長の連鎖', `${pinball.bestCombo}`),
    save.endless ? row('ピラミッド', pinball.pyramids ? `${pinball.pyramids} 回<small>（FLOOR ${gamePyramidBest}）</small>` : '0 回') : row('G-U-M の大当たり', `${tally.rows.get('gumlane')?.n ?? 0} 回`),
    row('ランプ・ループ・マルチ', `${pinball.rampsDone}・${pinball.loops}・${pinball.multiballs}`),
    row('マレット', `Lv ${malletLv(save)}<small>（基礎ポイント ${fmt(malletPoints(malletLv(save)))}）</small>`),
    row('次のスタート', save.endless ? `TABLE ${save.pinDeepest}・FLOOR ${startFloor(save.floorBest)}` : `TABLE ${save.pinDeepest}`),
  ].join('');
  const rows = tally.list();
  setTimeout(() => {
    splash.remove();
    card.style.display = '';
    startPayout();
  }, 1450);
  const startPayout = (): void => runPayout($('resBody'), card, { rows, rowBoosts: boosts.rows, exts: boosts.exts, all: boosts.all }, {
    final(total) {
      save.gum += total;
      save.totalGum += total;
      save.pendingGum = 0;
      gameGum = total;
      recordPlay(save, total);
      commitFocus(save, topSource(tally)?.src);
      // Limited「黄金の足あと」：大当たりで手に入れたエンブレム
      runEmb = pinball.runEmblems;
      save.emblems += runEmb;
      pinball.runEmblems = 0;
      // エクステンション：育ちを残し、壊れた品を消し、生んだエンブレムを足す
      commitPlay(save, boosts);
      runEmb += Math.round(boosts.emblems);
      if (boosts.broke.length) calcAll();
      writeSave(save);
      ui.gumBox.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(0.3,1.8,0.4,1)' });
      gumPop(total);
      announcer.event(nowSec(), all ? 'allClear' : 'runEnd', all ? 3 : 2);
    },
    done() {
      const st = document.createElement('div');
      st.className = 'res-stats';
      st.innerHTML = stats;
      $('resBody').appendChild(st);
      // ラストステージの結果か、入金口（ノルマの進み具合）
      if (finRes) renderFinal(card, finRes);
      else renderQuota(card, true);
    },
  });
  // ショップの品ぞろえとギミックの候補は、プレイが終わるたびに入れ替わる
  restockAll(save);
  writeSave(save);
  $('result').hidden = false;
}
// RESULT のあとは、また球が打ち出しの通路で待つ台へ
$('btnResAgain').addEventListener('click', () => { unlockAudio(); $('result').hidden = true; home.show(1); });

// ---------------------------------------------------------------- 入金口（ノルマ）と GAME OVER
/**
 * RESULT のカードの下に、ノルマの進み具合を出す（ノルマ額・手持ちの GUM・残りプレイ・エンブレム）。
 * 手持ちで足りれば「入金口へ納品する」。3 プレイ目のあとは、足りていれば必ず納品・足りなければ GAME OVER
 */
function renderQuota(card: HTMLElement, afterPlay: boolean): void {
  card.querySelector('.quota')?.remove();
  const st = quotaStatus(save.quota, save.gum);
  const el = document.createElement('div');
  el.className = 'quota';
  const plays = Array.from({ length: QUOTA_PLAYS }, (_, i) => `<i class="${i < QUOTA_PLAYS - st.left ? 'used' : ''}"></i>`).join('');
  const embLine = `<span class="q-emb">${afterPlay ? `<em>プレイ +${fmt(playEmblems(save) + runEmb)}</em>` : ''}<i class="emb"></i><b>${fmt(save.emblems)}</b></span>`;
  if (st.final) {
    el.innerHTML = `<div class="q-head"><span>扉</span><b>LAST STAGE</b>${embLine}</div>
      <p class="q-msg ok">ラストステージ：ボス ${FINAL_FLOORS.length} 体を倒せば脱出。のこり ${st.left} / ${FINAL_TRIES} 回</p>`;
    card.querySelector('.res-body')?.appendChild(el);
    card.classList.remove('locked');
    if (st.over) setTimeout(gameOver, 1400);
    return;
  }
  const pct = Math.min(100, (save.gum / st.need) * 100);
  const bonus = quotaEmblems(st.left, save.quota.n) + quotaBonus(save);
  const short = Math.max(0, Math.ceil(st.need - save.gum));
  const tut = save.quota.n <= 0;
  /** 納める額（チュートリアルで足りないときは手持ちの全部。残りはピエロのおまけ） */
  const pay = tut ? Math.min(Math.max(0, save.gum), st.need) : st.need;
  let msg = '';
  if (st.over) msg = `<p class="q-msg bad">あと ${fmt(short)} GUM 足りない…… プレイが残っていない</p>`;
  else if (st.mustPay && tut && short > 0) msg = `<p class="q-msg ok">${QUOTA_PLAYS} プレイおしまい。あと ${fmt(st.need - save.gum)} GUM は……ピエロのおまけ？</p>`;
  else if (st.mustPay) msg = `<p class="q-msg ok">${QUOTA_PLAYS} プレイを遊びきった。入金口へ納めよう</p>`;
  else if (st.canPay) msg = `<p class="q-msg ok">納められる！ いま納めると <i class="emb"></i>+${bonus}（早いほど多い）。遊んでから納めてもよい</p>`;
  else if (short <= 0) msg = `<p class="q-msg ok">${fmt(st.need)} GUM 達成！ のこり <b>${st.left}</b> プレイ遊んでから納めよう</p>`;
  else msg = `<p class="q-msg">あと <b>${fmt(short)}</b> GUM。のこり <b>${st.left}</b> プレイ</p>`;
  el.innerHTML = `
    <div class="q-head"><span>入金口</span><b>${quotaTag(save).replace(/<\/?b>/g, '')}</b>${embLine}</div>
    <div class="q-bar${st.canPay ? ' full' : ''}"><i style="width:${pct}%"></i></div>
    <div class="q-nums"><span>手持ち <b>${fmt(save.gum)}</b></span><span class="q-plays" aria-label="のこり ${st.left} プレイ">${plays}</span><span>納品 <b>${fmt(st.need)}</b> GUM</span></div>
    ${msg}
    ${st.canPay ? `<button class="deposit" data-act="deposit"><b>入金口へ納品する</b><small>−${fmt(pay)} GUM ・ <i class="emb"></i>+${bonus}</small></button>` : ''}`;
  card.querySelector('.res-body')?.appendChild(el);
  // 3 プレイ目のあと：納品するか GAME OVER しかない
  card.classList.toggle('locked', st.mustPay || st.over);
  el.querySelector('[data-act="deposit"]')?.addEventListener('click', () => doDeposit(card, el));
  if (st.over) setTimeout(gameOver, 1400);
  else if (st.canPay) { se('buff', 0.5, 0, 1.4); el.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(0.3,1.8,0.4,1)' }); }
}

/** 入金口へ納める：GUM が吸いこまれ、QUOTA CLEAR!、エンブレム。そのあと Limited を選ぶ */
function doDeposit(card: HTMLElement, panel: HTMLElement): void {
  const n = save.quota.n;
  const before = toysUnlocked(n).length;
  const r = deliver(save);
  if (!r) return;
  const newToys = toysUnlocked(save.quota.n).length - before;
  // 新しく入荷した仕掛けも候補に並ぶよう、ギミックの候補を引き直す（無料）
  if (newToys > 0) restockToys(save, true);
  writeSave(save);
  unlockAudio();
  panel.classList.add('paid');
  card.classList.add('locked'); // 納めている間はほかのボタンを出さない
  (panel.querySelector('.deposit') as HTMLButtonElement | null)?.setAttribute('disabled', '');
  // GUM が入金口へ吸いこまれる
  const box = panel.getBoundingClientRect();
  const a = $('app').getBoundingClientRect();
  for (let i = 0; i < 22; i += 1) {
    const c = document.createElement('i');
    c.className = 'q-coin';
    c.style.left = `${box.left - a.left + Math.random() * box.width}px`;
    c.style.top = `${box.top - a.top + box.height * 0.4}px`;
    c.style.setProperty('--d', `${i * 0.03}s`);
    $('app').appendChild(c);
    setTimeout(() => c.remove(), 1400);
  }
  for (let i = 0; i < 6; i += 1) setTimeout(() => blip(500 + i * 120, 0.06, 'square', 0.06, 1.4), i * 70);
  setTimeout(() => {
    const sp = document.createElement('div');
    sp.className = 'res-splash quota-splash';
    const tier = clownOf(save);
    const paid = r.need - r.gift;
    const say = r.gift > 0 ? tutorialLine('gift', { name: save.name }) : clownLine('deposit', tier, { name: save.name });
    sp.innerHTML = `<span>${r.tutorial ? 'TUTORIAL CLEAR!' : `QUOTA ${n} CLEAR!`}</span><small>入金口に ${fmt(paid)} GUM を納めた${r.gift > 0 ? `（おまけ ${fmt(r.gift)} GUM）` : ''}<br><i class="emb"></i> +${r.emblems}${r.spare ? `（余らせたプレイ ${r.spare}）` : ''}${newToys > 0 ? `<br><em class="q-new">ショップにギミックが ${newToys} 種 入荷！</em>` : ''}${r.final ? '<br><em class="q-new">ラストステージへの扉が開いた！</em>' : ''}${r.ending ? '<br><em class="q-new">ノルマを全部納めた！ 部屋の扉が開く……</em>' : ''}</small>
      ${talkHtml(tier, say)}`;
    $('result').appendChild(sp);
    startTalk(sp, 350);
    se('win', 0.8, 0);
    roar(1, 2.2);
    flash($('callouts'), 'rgba(255,210,63,0.9)');
    buzz([0, 40, 40, 40]);
    announcer.event(nowSec(), 'bossDown', 3, true);
    // 触ると早く進む（セリフを読む時間は少し長めに）
    let gone = false;
    const next = (): void => {
      if (gone) return;
      gone = true;
      sp.remove();
      // ジョーカーでないままノルマ 10 を納めた：通常のエンディング（Limited は選ばない）
      if (r.ending) { normalEnding(); return; }
      openPicks(() => {
        if (!r.final) { renderQuota(card, false); home.refresh(); return; }
        // ラストステージの始まり：ジョーカーの口上のあと、タイトルへ
        openFinalIntro($('app'), save, () => {
          $('result').hidden = true;
          card.classList.remove('locked');
          home.show(1);
        });
      });
    };
    sp.addEventListener('click', next);
    setTimeout(next, 3400);
  }, 650);
}

/** 通常のエンディング：扉が開くが台は古ぼけたまま。見終えたら、スキルツリーを持って最初からやり直す */
function normalEnding(): void {
  openNormalEnding($('app'), save, () => {
    clearChallenge(save);
    fixParty(save);
    restockAll(save);
    setJokerTier(clownOf(save));
    calcAll();
    applyStats();
    writeSave(save);
    $('result').hidden = true;
    $('result').querySelector('.result-card')?.classList.remove('locked');
    home.show(1);
  });
}

/**
 * ノルマ達成のごほうびの Limited を選ぶ画面を開く（納めた直後と、左上の「Limited Offer!」から）。
 * まだ選べる数だけ続けて選べる。× で閉じても候補と選ぶ権利は残り、「Limited Offer!」から開き直せる
 */
function openPicks(after: () => void = () => undefined): void {
  if (save.quota.picks <= 0 || document.querySelector('#app > .limpick')) { after(); return; }
  const el = openLimitedPick($('app'), save, {
    picked() { calcAll(); applyStats(); writeSave(save); home.refresh(); },
    changed() { writeSave(save); home.refresh(); },
    closed() { writeSave(save); after(); syncOffer(); },
  });
  if (!el) { writeSave(save); after(); }
  syncOffer();
}

// ---------------------------------------------------------------- 「Limited Offer!」（選んでいない Limited があるとき、遊んでいない画面の左上）
// スマホは #app に重ね、見ているページ（data-tab）で置き場所を変える（上の GUM やエンブレムと重ならない所）。
// PC はショップの列（.pc-left）の左上。プレイ中は出さない。PC で列がグレーの間（html.pc-busy）は押せない。
const offerBtn = document.createElement('button');
offerBtn.className = 'lim-offer';
offerBtn.hidden = true;
offerBtn.setAttribute('aria-label', 'Limited Offer');
offerBtn.addEventListener('click', () => {
  unlockAudio();
  blip(880, 0.08, 'square', 0.06, 1.6);
  openPicks();
});
let offerKey = '';
function syncOffer(): void {
  const pc = isPc();
  const host = pc ? document.querySelector('.pc-left') : $('app');
  if (host && offerBtn.parentElement !== host) host.append(offerBtn);
  const n = save.quota.picks;
  const on = n > 0 && booted && home.visible && !guide && !tallyOpen && !save.pendingNormal && !save.pendingEnding
    && !document.querySelector('#app > .limpick') && (pc || (!blocking() && !document.querySelector(`.tp, ${COACH_BLOCK}`)));
  const key = `${on}|${n}|${pc ? 'pc' : home.tab}`;
  if (key === offerKey) return;
  offerKey = key;
  offerBtn.hidden = !on;
  offerBtn.dataset.tab = pc ? 'pc' : String(home.tab);
  offerBtn.innerHTML = `<b>Limited</b><b>Offer!</b>${n > 1 ? `<i>×${n}</i>` : ''}`;
}

/** 遊べないとき（3 プレイを使いきった）：入金口だけを出すか、GAME OVER */
function checkQuota(soft = false): void {
  const st = quotaStatus(save.quota, save.gum);
  if (st.over) { gameOver(); return; }
  // soft：開き直したとき、納められるのに納めていなければ入金口を出す（遊びつづけてもよい）
  if (!st.mustPay && !(soft && st.canPay && !st.final)) return;
  home.hide();
  world = pinball;
  $('app').classList.add('pin');
  layout();
  const card = $('result').querySelector('.result-card') as HTMLElement;
  card.style.display = '';
  card.classList.remove('paying');
  $('resTitle').textContent = 'DEPOSIT';
  $('resTitle').classList.remove('all');
  $('resBody').innerHTML = '';
  $('result').hidden = false;
  renderQuota(card, false);
}

/** GAME OVER：挑戦の進みを失う（残るのはスキルツリー・設定・図鑑の記録） */
let overOpen = false;
function gameOver(): void {
  if (overOpen) return;
  overOpen = true;
  const n = save.quota.n;
  const final = save.quota.final;
  const need = quotaStatus(save.quota, save.gum).need;
  const canEndless = save.escapes > 0;
  const el = document.createElement('div');
  el.className = 'gameover';
  el.innerHTML = `
    <div class="go-in">
      <h2>GAME OVER</h2>
      <p class="go-sub">${final ? `ラストステージを ${FINAL_TRIES} 回とも突破できなかった……` : `${save.endless ? 'ENDLESS ' : 'QUOTA '}${n} の ${fmt(need)} GUM を納められなかった……`}<br>呪われた台が、すべてを吸いこんでいく</p>
      ${talkHtml(clownOf(save), clownLine('gameOver', clownOf(save), { name: save.name }))}
      <div class="go-lists">
        <div class="go-lost"><b>失ったもの</b><ul>
          <li>GUM <em>${fmt(save.gum)}</em></li><li>エンブレム <em>${fmt(save.emblems)}</em></li>
          <li>エクステンション <em>${save.equip.length} 個</em></li><li>マレット <em>Lv ${malletLv(save)}</em></li><li>Limited <em>${save.limited.length} 個</em></li>
          <li>ギミック <em>${save.toys.length} 個</em></li><li>ピエロの姿 <em>${CLOWN_NAME[clownOf(save)]}</em></li>
          ${save.heroes.length > 1 ? `<li>ガチャのヒーロー <em>${save.heroes.length - 1} 人</em></li>` : ''}
          <li>広げた枠・ショップの品ぞろえ</li><li>挑戦の進み <em>QUOTA ${n}・TABLE ${save.pinDeepest}</em></li></ul></div>
        <div class="go-kept"><b>残ったもの</b><ul><li>スキルツリー</li><li>設定</li><li>図鑑の記録</li></ul></div>
      </div>
      ${canEndless ? `<div class="go-modes"><button class="start" data-act="retry">本編を最初から<small>10 ノルマとラストステージ</small></button><button class="start endless" data-act="endless">エンドレスを最初から<small>ノルマが終わりなく続く・ピラミッドが開く</small></button></div>` : '<button class="start" data-act="retry">もう一度挑む</button>'}
    </div>`;
  $('app').appendChild(el);
  startTalk(el, 1200);
  se('blast', 0.8, 0, 0.6);
  roar(1, 0.6);
  flash($('callouts'), 'rgba(255,46,46,0.9)');
  buzz([0, 80, 60, 120]);
  const restart = (endless: boolean): void => {
    resetChallenge(save, endless);
    fixParty(save);
    restockAll(save);
    setJokerTier(clownOf(save));
    calcAll();
    applyStats();
    writeSave(save);
    overOpen = false;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 450);
    $('result').hidden = true;
    $('result').querySelector('.result-card')?.classList.remove('locked');
    home.show(1);
    blip(660, 0.12, 'square', 0.08, 1.5);
  };
  el.querySelector('[data-act="retry"]')?.addEventListener('click', () => restart(false));
  el.querySelector('[data-act="endless"]')?.addEventListener('click', () => restart(true));
}

/**
 * ラストステージの結果（RESULT のカードの下）。突破なら扉へ（エンディング）。
 * 失敗：挑める回数が残っていればもう一度、なければ GAME OVER
 */
function renderFinal(card: HTMLElement, res: 'escape' | 'retry' | 'over'): void {
  card.querySelector('.quota')?.remove();
  writeSave(save);
  const el = document.createElement('div');
  el.className = 'quota final-panel';
  const left = Math.max(0, FINAL_TRIES - save.quota.finalPlayed);
  if (res === 'escape') {
    el.innerHTML = `<div class="q-head"><span>扉</span><b>ESCAPE!</b></div>
      <p class="q-msg ok">ボスをすべて倒した！ 閉ざされていた扉の向こうから、光がもれてくる……</p>
      <button class="deposit" data-act="door"><b>扉へ</b><small>呪われた台から脱出する</small></button>`;
    card.classList.add('locked');
    el.querySelector('[data-act="door"]')?.addEventListener('click', () => {
      unlockAudio();
      openEnding($('app'), save, () => {
        save.pendingEnding = false;
        $('result').hidden = true;
        card.classList.remove('locked');
        restockAll(save);
        writeSave(save);
        home.show(1);
      });
    });
    se('win', 0.8, 0);
  } else {
    el.innerHTML = `<div class="q-head"><span>扉</span><b>LAST STAGE</b></div>
      <p class="q-msg ${res === 'over' ? 'bad' : ''}">${res === 'over' ? `ボスを倒しきれなかった……（${FINAL_TRIES} 回とも）` : `ボスを倒しきれなかった。のこり <b>${left}</b> / ${FINAL_TRIES} 回`}</p>
      ${res === 'retry' ? talkHtml(4, finalLine('fail', { name: save.name, tries: left })) : ''}`;
    card.classList.toggle('locked', res === 'over');
    if (res === 'over') setTimeout(gameOver, 1400);
  }
  card.querySelector('.res-body')?.appendChild(el);
  startTalk(el, 300);
}
$('btnResShop').addEventListener('click', () => { $('result').hidden = true; home.show(0); });
$('btnResLab').addEventListener('click', () => { $('result').hidden = true; home.show(2); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stashPending();
    writeSave(save);
    pauseBgm(true);
  } else {
    pauseBgm(false);
    if (running) void keepAwake();
    last = performance.now();
  }
});
window.addEventListener('pagehide', () => { stashPending(); writeSave(save); });
setInterval(() => { if (running) { stashPending(); writeSave(save); } }, 5000);
void wakeLock;

/** 階ごとの背景 */
const bgOf = (floor: number): string => cat.bgs[(Math.max(1, floor) - 1) % cat.bgs.length];

// ---------------------------------------------------------------- 毎コマ
let last = performance.now();
let hudT = 0;
let slowAvg = 16;
function frame(now: number): void {
  const raw = now - last;
  const dt = Math.min(0.05, raw / 1000);
  last = now;
  // コマが重くなってきたら演出を減らし、軽くなったら戻す
  if (raw < 200) slowAvg += (raw - slowAvg) * 0.05;
  world.lowFx = slowAvg > (world.lowFx ? 19 : 24);
  // 傾き：押している間は使わない
  let tx = 0;
  let ty = 0;
  const [kx, ky] = keyTilt.step(dt);
  // 打ち出す前は傾けても何も起きない
  if (!world.hold.active && !(world === pinball && pinball.waiting)) {
    const [sx, sy] = sensors.tilt();
    tx = sx + kx;
    ty = sy + ky;
    const m = Math.hypot(tx, ty);
    const dz = 0.012; // 遊び（手ぶれで勝手に滑らないように。約 0.7 度）
    const k = m < dz ? 0 : ((m - dz) / m) * settings.tiltSens;
    tx *= k;
    ty *= k;
  }
  world.tilt = [clamp(tx, -1.5, 1.5), clamp(ty, -1.5, 1.5)];
  // 引いている間はスローモーション。スキルツリーを開いている間は止める
  if ((running || guide) && !tree && !picking) world.step(world.hold.active ? dt * world.st.slowmo : dt);
  guide?.tick(dt);
  readyTick(dt);
  if (running && !guide) partTags();
  if (world instanceof PinballWorld) drawPinball(ctx, world, rink, disp, cw, ch, bgOf(world.floor), dpr);
  else draw(ctx, world, rink, cw, ch, bgOf(world.floor), bgOf(world.floor - 1), dpr);

  // 水平器：いまの傾き（押している間も見せる）
  const [bx, by] = sensors.tilt();
  const bl = Math.hypot(bx, by);
  const bk = bl > 0.5 ? 0.5 / bl : 1;
  ui.bubbleDot.style.transform = `translate(${bx * bk * 26}px, ${by * bk * 26}px)`;

  hudT -= dt;
  if (hudT <= 0) { hudT = 0.06; hud(now); syncReady(); syncOffer(); tutorialTick(); }
  requestAnimationFrame(frame);
}

/** 表示の GUM は本当の値を追いかけて回る（いきなり変わらず、数字が回って増える） */
let shownGum = -1;
function hud(now: number): void {
  if (shownGum < 0 || save.gum < shownGum) shownGum = save.gum;
  else shownGum += Math.max((save.gum - shownGum) * 0.35, Math.min(save.gum - shownGum, 1));
  ui.gumText.textContent = fmt(shownGum);
  const embT = fmt(save.emblems);
  if (ui.embText.textContent !== embT) ui.embText.textContent = embT;
  ui.gumText.classList.toggle('rolling', save.gum - shownGum > save.gum * 0.001 + 0.5);
  const rateText = tallyOpen ? 'あとで発表' : '';
  if (ui.gumRate.textContent !== rateText) ui.gumRate.textContent = rateText;
  const fin = isPin() && pinball.final && pinball.phase !== 'over' ? pinball.final : null;
  const ft = fin ? `BOSS ${Math.min(FINAL_FLOORS.length, fin.i + 1)}<small>/${FINAL_FLOORS.length}</small>` : `${isPin() ? 'TABLE' : 'FLOOR'} ${world.floor}<small>/${FLOORS}</small>`;
  if (ui.stageText.innerHTML !== ft) ui.stageText.innerHTML = ft;
  ui.stageBox.classList.toggle('boss', world.bossAlive);
  const left = world.runLeft;
  $('timer').textContent = world.phase === 'idle' ? world.runTime.toFixed(1) : left.toFixed(1);
  const hurry = world.phase === 'play' && left <= 3;
  ui.stageBox.classList.toggle('hurry', hurry);
  // 残り 3 秒からは 1 秒ごとに音
  if (hurry && Math.ceil(left) !== lastTick) { lastTick = Math.ceil(left); blip(880, 0.07, 'square', 0.07, 1); }
  ui.stageBar.style.width = `${(world.phase === 'idle' ? 1 : left / world.runTime) * 100}%`;

  // 入力の状態といまの攻撃の色
  let mode = '';
  let cls = 'mode';
  const atk = world.hold.active ? 'green' : world.attack;
  if (world.hold.active) { mode = '引っぱり中'; cls += ' touch'; }
  else if (now - lastShake < 500) { mode = '振り！'; cls += ' shake'; }
  else if (world instanceof PinballWorld && world.parked) { mode = world.parked === 'plunger' ? '引いて打つ' : 'ねらい撃ち'; cls += ' touch'; }
  else if (sensors.state === 'ok') mode = isPin() ? '傾けて曲げる' : '傾き操作';
  else if (isPc()) mode = isPin() ? 'WASD で曲げる・スペースで揺らす' : 'WASD で傾き・スペースで振り';
  else if (sensors.state === 'waiting') mode = 'センサー待ち';
  else { mode = 'センサーなし'; cls += ' off'; }
  const html = `<b style="color:${ELEM_COLOR[atk]}">${ELEM_NAME[atk]}${ELEM_ATTACK[atk]}</b><br>${mode}`;
  if (ui.mode.innerHTML !== html) ui.mode.innerHTML = html;
  ui.mode.className = cls;

  // 強化できる数
  const n = affordableCount(save);
  ui.shopBadge.hidden = n === 0;
  ui.shopBadge.textContent = String(n);
  tree?.refresh();

  // 効いている強化
  const buffHtml = (Object.keys(world.buffs) as (keyof typeof world.buffs)[])
    .filter((k) => world.buffOn(k))
    .map((k) => `<div class="buff" style="color:${ITEM_COLOR[k]}"><span>${ITEM_LABEL[k]}</span><b>${Math.ceil((world.buffs[k] ?? 0) - world.time)}</b></div>`)
    .join('');
  if (ui.buffs.innerHTML !== buffHtml) ui.buffs.innerHTML = buffHtml;
}

calcAll();
applyStats();
layout();
watchKeyboard();
initHover();
onPcChange(() => { layout(); syncReady(); setTimeout(layout, 50); });
booted = true;
syncReady();
requestAnimationFrame((t) => { last = t; frame(t); });
// フォントが届いたら測りなおす
void document.fonts?.ready.then(layout);
// 画像を先に読んでおく
for (const u of [...cat.bgs.slice(0, 2), cat.icons.gum, cat.fx.hit, cat.fx.blast, heroById(save.hero).img]) img(u);
// 確認用（コンソールから見る）
(window as unknown as { __smash: unknown }).__smash = { get world() { return world; }, pyramid, pinball, sensors, save };
