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
import { KILLS_TO_BOSS, heroBonus } from './game/economy';
import { migrateLevels } from './game/skills';
import { affordableCount, openTree } from './ui/tree';
import { draw, type Rink } from './game/render';
import { World } from './game/world';
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
if (params.has('stage')) save.stage = Math.max(1, Number(params.get('stage')) || 1);

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
const world = new World(save, {
  gum(v) {
    save.gum += v;
    save.totalGum += v;
    gumLog.push({ t: performance.now(), v });
    ui.gumBox.classList.remove('bump');
    void ui.gumBox.offsetWidth;
    ui.gumBox.classList.add('bump');
  },
  item(ext) { itemToast(ext); },
  hero(h, isNew, bonus) { heroToast(h, isNew, bonus); },
  boss(name) {
    showBanner('BOSS 出現', name, true);
    playBgm('boss');
    announcer.event(nowSec(), 'boss', 2);
  },
  clear(stage) {
    showBanner('STAGE CLEAR', `つぎは STAGE ${stage}`, false);
    se('win', 0.7, 0);
    playBgm('field');
    writeSave(save);
    // 「ボスを倒した！」→ しゃべり終わったら「ステージクリア！」
    announcer.event(nowSec(), 'bossDown', 3);
    window.setTimeout(() => announcer.event(nowSec(), 'clear', 2), 1900);
  },
  kill() { /* 進み具合は毎コマ描きなおす */ },
  hit(combo, weak, smash) {
    // 連鎖の音：1 ヒットごとに半音ずつ上がる
    if (combo > lastChime && combo >= 2) { chime(combo - 2); lastChime = combo; }
    announcer.hit(nowSec(), combo, weak, smash);
    $('app').classList.toggle('fever', combo >= PEAK);
  },
  comboEnd(n) {
    announcer.comboEnd(nowSec(), n);
    lastChime = 0;
    $('app').classList.remove('fever');
  },
});

// ---------------------------------------------------------------- 実況（声と、アメコミ風の文字）
const nowSec = (): number => performance.now() / 1000;
let lastChime = 0;
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
  if (!running || world.hold.active) return;
  world.shake(s.x, s.y, s.power, sensors.shakeThreshold);
  lastShake = performance.now();
};

// ---------------------------------------------------------------- 画面の大きさ
let dpr = 1;
let cw = 0;
let ch = 0;
const rink: Rink = { x: 0, y: 0, w: 0, h: 0 };
const ctx = ui.cv.getContext('2d') as CanvasRenderingContext2D;
function layout(): void {
  const app = $('app').getBoundingClientRect();
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cw = app.width;
  ch = app.height;
  ui.cv.width = Math.round(cw * dpr);
  ui.cv.height = Math.round(ch * dpr);
  const top = (document.querySelector('.top') as HTMLElement).getBoundingClientRect().bottom - app.top;
  const bottom = (document.querySelector('.bottom') as HTMLElement).getBoundingClientRect().top - app.top;
  rink.x = 8;
  rink.y = top + 4;
  rink.w = cw - 16;
  rink.h = Math.max(200, bottom - 6 - rink.y);
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
  if (!running || pointerId !== null) return;
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
  const k = world.w / rink.w; // 画面の px → ユニット
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
    changed() { world.calcStats(); applyStats(); writeSave(save); },
    close() { tree = null; last = performance.now(); },
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
    world.calcStats();
    writeSave(save);
    blip(900, 0.08, 'square', 0.06, 1.4);
    renderHeroes();
    return;
  }
  if (t.dataset.toggle) {
    const k = t.dataset.toggle as 'invertTilt' | 'invertShake' | 'mute' | 'vibrate' | 'voice';
    settings[k] = !settings[k];
    applySettings();
    writeSave(save);
    renderSettings();
    return;
  }
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
      攻撃 <b>×${b.atk.toFixed(2)}</b>　GUM <b>×${b.gum.toFixed(2)}</b>　滑り <b>×${b.power.toFixed(2)}</b></p></div></div>
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
    ${tg('mute', settings.mute, '音を消す', 'BGM と効果音')}
    ${tg('voice', settings.voice, '実況の声', '連鎖をほめる英語の実況（声：ElevenLabs）')}
    ${tg('vibrate', settings.vibrate, '振動', '対応している端末だけ')}
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

$('btnStart').addEventListener('click', () => {
  unlockAudio();
  void loadVoice();
  // 許可の確認はタップの中で（iOS）。待たずにゲームは始める
  void startSensors().then(() => {
    if (sensors.state === 'denied' || sensors.state === 'none') setTimeout(() => toast(null, 'センサーなしで遊んでいます', '長押し→スワイプ→離す で動かせます', '#ff4f5e'), 600);
  });
  void keepAwake();
  ui.title.hidden = true;
  running = true;
  playBgm(world.bossAlive ? 'boss' : 'field');
  showBanner(`STAGE ${save.stage}`, 'エネミーをはじき飛ばせ！', false);
  layout();
});

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

// ---------------------------------------------------------------- 毎コマ
let last = performance.now();
let hudT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
  if (running && !tree) world.step(world.hold.active ? dt * world.st.slowmo : dt);
  draw(ctx, world, rink, cw, ch, cat.bgs[(save.stage - 1) % cat.bgs.length], dpr);

  // 水平器：いまの傾き（押している間も見せる）
  const [bx, by] = sensors.tilt();
  const bl = Math.hypot(bx, by);
  const bk = bl > 0.5 ? 0.5 / bl : 1;
  ui.bubbleDot.style.transform = `translate(${bx * bk * 26}px, ${by * bk * 26}px)`;

  hudT -= dt;
  if (hudT <= 0) { hudT = 0.1; hud(now); }
  requestAnimationFrame(frame);
}

function hud(now: number): void {
  ui.gumText.textContent = fmt(save.gum);
  while (gumLog.length && now - gumLog[0].t > 10000) gumLog.shift();
  const rate = gumLog.reduce((a, b) => a + b.v, 0) / 10;
  ui.gumRate.textContent = `${rate < 10 ? rate.toFixed(1) : fmt(rate)} / 秒`;
  ui.stageText.textContent = world.bossAlive ? `STAGE ${save.stage}　BOSS` : `STAGE ${save.stage}　${Math.min(save.kills, KILLS_TO_BOSS)} / ${KILLS_TO_BOSS}`;
  ui.stageBox.classList.toggle('boss', world.bossAlive);
  const boss = world.enemies.find((e) => e.boss);
  ui.stageBar.style.width = `${(boss ? boss.hp / boss.maxHp : Math.min(1, save.kills / KILLS_TO_BOSS)) * 100}%`;

  // 入力の状態といまの攻撃の色
  let mode = '';
  let cls = 'mode';
  const atk = world.hold.active ? 'green' : world.attack;
  if (world.hold.active) { mode = '引っぱり中'; cls += ' touch'; }
  else if (now - lastShake < 500) { mode = '振り！'; cls += ' shake'; }
  else if (sensors.state === 'ok') mode = '傾き操作';
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

world.calcStats();
applyStats();
world.resetField();
layout();
requestAnimationFrame((t) => { last = t; frame(t); });
// フォントが届いたら測りなおす
void document.fonts?.ready.then(layout);
// 画像を先に読んでおく
for (const u of [...cat.bgs.slice(0, 2), cat.icons.gum, cat.fx.hit, cat.fx.blast, heroById(save.hero).img]) img(u);
// 確認用（コンソールから見る）
(window as unknown as { __smash: unknown }).__smash = { world, sensors, save };
