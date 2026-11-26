// 入口：画面の部品をつなぎ、センサー・タッチ・キーボードの入力を World に渡し、毎コマ描く。

import '@fontsource/dotgothic16';
import '@fontsource/dela-gothic-one';
import '@fontsource/bangers';
import './styles/main.css';

import { cat, heroById, ITEM_COLOR, ITEM_LABEL, RARITY_COLOR, RARITY_NAME, type Ext, type Hero } from './core/catalog';
import { blip, buzz, chime, pauseBgm, playBgm, roar, se, setMuted, setVibrate, unlockAudio } from './core/audio';
import { loadVoice, say, setVoice, speaking } from './core/voice';
import { Announcer, PEAK, type Call } from './game/announcer';
import { callout, flash } from './ui/callout';
import { clearSave, loadSave, writeSave, type Save } from './core/save';
import { Sensors } from './core/sensors';
import { clamp, fmt, img, pick } from './core/util';
import { FAST_CLEAR, FLOORS, RUN_TIME, heroBonus, startFloor } from './game/economy';
import { migrateLevels } from './game/skills';
import { affordableCount, openTree } from './ui/tree';
import { draw, type Rink } from './game/render';
import { drawPinball, guideView, tableAt, type DisplayRect } from './game/render-pinball';
import { openGuide, type Guide } from './ui/guide';
import { fixParty, initHome, restockShop } from './ui/home';
import { openLimitedPick } from './ui/limited';
import { abilityOf, abilityPower } from './game/abilities';
import { PARTS } from './game/parts';
import { World, type WorldEvents } from './game/world';
import { PinballWorld } from './game/pinball';
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
/** 確認用：その階から始める */
const floorOverride = params.has('floor') ? Math.max(1, Math.min(FLOORS, Number(params.get('floor')) || 1)) : 0;
/** 確認用：ピンボールのその台から始める */
const tableOverride = params.has('table') ? Math.max(1, Math.min(FLOORS, Number(params.get('table')) || 1)) : 0;

const sensors = new Sensors();
const ui = {
  cv: $<HTMLCanvasElement>('cv'),
  gumText: $('gumText'), gumRate: $('gumRate'), gumBox: document.querySelector('.gum') as HTMLElement,
  stageText: $('stageText'), stageBar: $('stageBar'), stageBox: document.querySelector('.stage') as HTMLElement,
  buffs: $('buffs'), mode: $('mode'), bubbleDot: $('bubbleDot'),
  shopBadge: $('shopBadge'), sheet: $('sheet'), sheetTitle: $('sheetTitle'), sheetBody: $('sheetBody'),
  banner: $('banner'), toast: $('toast'), title: $('title'), titleWarn: $('titleWarn'),
};
$<HTMLImageElement>('gumIcon').src = cat.icons.gum;
$<HTMLImageElement>('titleHero').src = heroById(save.hero).img;

// ---------------------------------------------------------------- World
const gumLog: { t: number; v: number }[] = [];
let gumBumpAt = 0;
const events: WorldEvents = {
  gum(v) {
    save.gum += v;
    save.totalGum += v;
    world.runGum += v;
    gameGum += v;
    const now = performance.now();
    // 同じコマにまとめて入るので、記録はまとめ、ぴょこっと動かすのも 0.12 秒に 1 回（毎回やると画面の計算が止まる）
    const lastLog = gumLog[gumLog.length - 1];
    if (lastLog && now - lastLog.t < 50) lastLog.v += v;
    else gumLog.push({ t: now, v });
    if (now - gumBumpAt > 120) {
      gumBumpAt = now;
      ui.gumBox.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      gumPop(lastLog && now - lastLog.t < 50 ? lastLog.v : v);
    }
  },
  item(ext) { itemToast(ext); },
  hero(h, isNew, bonus) { heroToast(h, isNew, bonus); },
  boss(name, raid) {
    if (!raid) return;
    showBanner('RAID BOSS', name, true);
    playBgm('boss');
    announcer.event(nowSec(), 'boss', 2);
  },
  clear(floor, t) {
    // ピンボールの台を突破：Limited を 1 つ選ぶ（選んでいる間は時間が止まる）
    if (world === pinball && floor < FLOORS) {
      const el = openLimitedPick($('app'), save, floor, t, {
        done() { picking = false; calcAll(); applyStats(); writeSave(save); last = performance.now(); },
        changed() { writeSave(save); },
      });
      picking = !!el;
    }
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
  pin(text, tier) {
    // ピンボールの知らせは文字と音だけ（声はない）
    callout($('callouts'), text, Math.max(0, Math.min(3, tier)) as 0 | 1 | 2 | 3, tier >= 3);
    if (tier >= 3) { se('blast', 0.4, 0, 1.2); flash($('callouts'), ELEM_FLASH[3]); buzz([0, 30, 30, 30]); }
    else if (tier === 2) se('buff', 0.4, 0, 1.3);
    else blip(tier === 0 ? 200 : 760, 0.1, 'square', 0.06, tier === 0 ? 0.5 : 1.4);
  },
};
/** ピラミッド（15 秒・50 階）とピンボール（30 秒・台）。いま遊んでいる方が world */
const pyramid = new World(save, events);
const pinball = new PinballWorld(save, events);
let world: World = pyramid;
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
  if ((!running && !guide) || world.hold.active) return;
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
  world.holdPull((e.clientX - sx) * k, (e.clientY - sy) * k);
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
  world.holdEnd();
};
ui.cv.addEventListener('pointerup', release);
ui.cv.addEventListener('pointercancel', release);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- キーボード（PC での確認用：矢印で傾き、スペースで振り）
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === ' ' && running) {
    const [x, y] = keyTilt();
    const l = Math.hypot(x, y);
    const a = Math.random() * Math.PI * 2;
    world.shake(l ? x / l : Math.cos(a), l ? y / l : Math.sin(a), 20, 12);
    lastShake = performance.now();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
function keyTilt(): [number, number] {
  let x = 0;
  let y = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) x += 1;
  if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) y += 1;
  return [x * 0.35, y * 0.35];
}

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
    changed() { calcAll(); applyStats(); writeSave(save); },
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
ui.sheetBody.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
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
    case 'none': return { text: '<b>センサーがありません</b>　タッチ操作（PC では矢印キーとスペース）で遊べます。', bad: true };
    default: return { text: '<b>まだ始まっていません</b>', bad: true };
  }
}

function renderSettings(): void {
  const st = sensorText();
  const tg = (k: string, on: boolean, label: string, sub: string) =>
    `<div class="set"><label>${label}<small>${sub}</small></label><button class="toggle" data-toggle="${k}" aria-pressed="${on}" aria-label="${label}"></button></div>`;
  ui.sheetBody.innerHTML = `
    <div class="status${st.bad ? ' bad' : ''}">センサー：${st.text}</div>
    ${sensors.state !== 'ok' ? '<button id="btnPerm" class="buy" style="width:100%">センサーを使う</button>' : ''}
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

// ---------------------------------------------------------------- はじめる
let running = false;
async function startSensors(): Promise<void> {
  const ok = await sensors.start();
  if (!ok) {
    ui.titleWarn.hidden = false;
    ui.titleWarn.textContent = sensors.state === 'denied'
      ? 'センサーの使用が許可されませんでした。タッチ操作で遊べます（設定からもう一度許可できます）。'
      : 'この端末ではセンサーが使えません。タッチ操作（PC では矢印キーとスペース）で遊べます。';
  }
}

let wakeLock: { release(): Promise<void> } | null = null;
async function keepAwake(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && document.visibilityState === 'visible') wakeLock = await nav.wakeLock.request('screen');
  } catch { wakeLock = null; }
}

function startGame(): void {
  world = pinball;
  $('app').classList.add('pin');
  unlockAudio();
  void loadVoice();
  // 許可の確認はタップの中で（iOS）。待たずにゲームは始める
  void startSensors().then(() => {
    if (sensors.state === 'denied' || sensors.state === 'none') setTimeout(() => toast(null, 'センサーなしで遊んでいます', '長押し→スワイプ→離す で動かせます', '#ff4f5e'), 600);
  });
  void keepAwake();
  home.hide();
  running = true;
  layout();
  beginRun();
}
$('btnStart').addEventListener('click', startGame);
/** Limited を選んでいる間（時間を止める） */
let picking = false;

// ---------------------------------------------------------------- 遊んでいないときの画面（ショップ・ピンボール・ラボ）
fixParty(save);
restockShop(save);
const home = initHome($('home'), save, {
  tree() { $('btnShop').click(); },
  guide() { startGuide(); },
  settings() { openSheet('settings'); },
  changed() { calcAll(); applyStats(); writeSave(save); },
  affordable() { return affordableCount(save); },
});

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
    if (!p.tag || save.seenParts.includes(p.id)) continue;
    if (Math.hypot(b.x - p.x, b.y - p.y) > p.r + b.r) continue;
    save.seenParts.push(p.id);
    guideView.tags.push({ x: p.x, y: p.y - p.r * 0.3, text: `${p.name}（${p.call}）`, t0: now });
    tagAt = now;
    return;
  }
}

// ---------------------------------------------------------------- プレイ（ピンボール）と、ピラミッドへの寄り道
let lastTick = 0;
/** このプレイで手に入れた GUM（ピラミッドの分もふくむ）・ピラミッドでいちばん深く進んだ階 */
let gameGum = 0;
let gamePyramidBest = 0;
function beginRun(): void {
  $('result').hidden = true;
  home.hide();
  world = pinball;
  $('app').classList.add('pin');
  layout();
  gameGum = 0;
  gamePyramidBest = 0;
  pinball.startRun(tableOverride || save.pinDeepest);
  lastTick = 0;
  playBgm('field');
  showBanner(`TABLE ${pinball.floor}`, `${pinball.runTime} 秒のピンボール！ 引っぱって打ち出そう`, false);
  blip(660, 0.12, 'square', 0.08, 1.5);
}

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
  toast(cat.icons.gum, `PYRAMID FLOOR ${reached} まで`, `${pyramid.cleared.length} 階を突破・GUM +${fmt(pyramid.runGum)}`, '#ffd23f');
  if (reason === 'allclear') { se('win', 0.8, 0); announcer.event(nowSec(), 'allClear', 3); }
}

function showResult(reason: 'time' | 'allclear'): void {
  writeSave(save);
  const all = reason === 'allclear';
  announcer.event(nowSec(), all ? 'allClear' : 'runEnd', all ? 3 : 2);
  if (all) { se('win', 0.8, 0); roar(1, 2.4); }
  const row = (k: string, v: string, hi = false) => `<div class="res-row${hi ? ' hi' : ''}"><span>${k}</span><b>${v}</b></div>`;
  $('resTitle').textContent = all ? 'ALL CLEAR!!' : 'TIME UP!';
  $('resTitle').classList.toggle('all', all);
  $('resBody').innerHTML = [
    row('到達した台', `TABLE ${all ? FLOORS : pinball.floor}<small> / ${FLOORS}</small>`),
    row('手に入れた GUM', fmt(gameGum), true),
    row('いちばん長い連鎖', `${pinball.bestCombo}`),
    row('ピラミッド', pinball.pyramids ? `${pinball.pyramids} 回<small>（FLOOR ${gamePyramidBest}）</small>` : '0 回'),
    row('ランプ・ループ・マルチボール', `${pinball.rampsDone}・${pinball.loops}・${pinball.multiballs}`),
    row('次のスタート', `TABLE ${save.pinDeepest}・FLOOR ${startFloor(save.floorBest)}`),
  ].join('');
  // ヒーローを結果の文字やカードと重ねて置く（向きと位置は毎回少し変える）
  document.querySelectorAll('.res-hero').forEach((e) => e.remove());
  const hero = document.createElement('img');
  hero.className = `res-hero p${Math.floor(Math.random() * 3)}`;
  hero.src = heroById(save.hero).img;
  hero.alt = '';
  ($('result').querySelector('.result-card') as HTMLElement).appendChild(hero);
  // 手に入れた GUM は数字が回って止まる
  const gumB = $('resBody').querySelector('.res-row.hi b') as HTMLElement | null;
  if (gumB) {
    const goal = gameGum;
    const t0 = performance.now() + 350;
    const roll = (n: number): void => {
      const k = Math.min(1, Math.max(0, (n - t0) / 700));
      gumB.textContent = fmt(goal * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(roll);
      else gumB.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(0.3,1.8,0.4,1)' });
    };
    gumB.textContent = '0';
    requestAnimationFrame(roll);
  }
  // ショップの品ぞろえはプレイが終わるたびに入れ替わる
  restockShop(save, true);
  writeSave(save);
  $('result').hidden = false;
}
$('btnResAgain').addEventListener('click', () => { unlockAudio(); beginRun(); });
$('btnResShop').addEventListener('click', () => { $('result').hidden = true; home.show(0); });
$('btnResLab').addEventListener('click', () => { $('result').hidden = true; home.show(2); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    writeSave(save);
    pauseBgm(true);
  } else {
    pauseBgm(false);
    if (running) void keepAwake();
    last = performance.now();
  }
});
window.addEventListener('pagehide', () => writeSave(save));
setInterval(() => { if (running) writeSave(save); }, 5000);
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
  if (!world.hold.active) {
    const [sx, sy] = sensors.tilt();
    const [kx, ky] = keyTilt();
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
  if (running && !guide) partTags();
  if (world instanceof PinballWorld) drawPinball(ctx, world, rink, disp, cw, ch, bgOf(world.floor), dpr);
  else draw(ctx, world, rink, cw, ch, bgOf(world.floor), bgOf(world.floor - 1), dpr);

  // 水平器：いまの傾き（押している間も見せる）
  const [bx, by] = sensors.tilt();
  const bl = Math.hypot(bx, by);
  const bk = bl > 0.5 ? 0.5 / bl : 1;
  ui.bubbleDot.style.transform = `translate(${bx * bk * 26}px, ${by * bk * 26}px)`;

  hudT -= dt;
  if (hudT <= 0) { hudT = 0.06; hud(now); }
  requestAnimationFrame(frame);
}

/** 表示の GUM は本当の値を追いかけて回る（いきなり変わらず、数字が回って増える） */
let shownGum = -1;
function hud(now: number): void {
  if (shownGum < 0 || save.gum < shownGum) shownGum = save.gum;
  else shownGum += Math.max((save.gum - shownGum) * 0.35, Math.min(save.gum - shownGum, 1));
  ui.gumText.textContent = fmt(shownGum);
  ui.gumText.classList.toggle('rolling', save.gum - shownGum > save.gum * 0.001 + 0.5);
  while (gumLog.length && now - gumLog[0].t > 10000) gumLog.shift();
  const rate = gumLog.reduce((a, b) => a + b.v, 0) / 10;
  ui.gumRate.textContent = `${rate < 10 ? rate.toFixed(1) : fmt(rate)} / 秒`;
  const ft = `${isPin() ? 'TABLE' : 'FLOOR'} ${world.floor}<small>/${FLOORS}</small>`;
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
requestAnimationFrame((t) => { last = t; frame(t); });
// フォントが届いたら測りなおす
void document.fonts?.ready.then(layout);
// 画像を先に読んでおく
for (const u of [...cat.bgs.slice(0, 2), cat.icons.gum, cat.fx.hit, cat.fx.blast, heroById(save.hero).img]) img(u);
// 確認用（コンソールから見る）
(window as unknown as { __smash: unknown }).__smash = { get world() { return world; }, pyramid, pinball, sensors, save };
