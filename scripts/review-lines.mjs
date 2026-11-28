#!/usr/bin/env node
// ピエロのセリフの見直し：セリフと、それを言う場面のスクリーンショットを 1 枚のページにまとめる。
// チュートリアルの流れ（場面・ピエロの案内・スクリーンショット・目安の秒数）もいっしょに出す。
//
// 使い方：
//   npm run build
//   node scripts/review-lines.mjs                 … review-out/lines.html を作る（ブラウザで開く）
//   node scripts/review-lines.mjs --only tutorial … 一部だけ（intro・tutorial・table・gimmick・deposit・over・final・story）
//   CHROME=/path/to/chrome node scripts/review-lines.mjs … playwright のブラウザでなく、手もとの Chrome を使う
// 要るもの：playwright（npm i -D playwright && npx playwright install chromium）。
// しくみ：dist を vite preview で開き、?review=1 の画面（main.ts の __review）で場面を作って撮る。
//   セリフの表はゲームのもの（src/ui/review-data.ts）。写したスクリーンショットには MCH の絵が入るので、出力（review-out/）は Git に入れない。

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('--out', 'review-out/lines.html'));
const ONLY = opt('--only', '');
const PORT = Number(opt('--port', '4318'));
const W = 390;
const H = 844;
const want = (k) => !ONLY || ONLY.split(',').includes(k);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // 全体に入れた playwright（NODE_PATH）も探す
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* なし */ }
}
if (!chromium) {
  console.error('playwright が見つかりません。npm i -D playwright && npx playwright install chromium を実行してください。');
  process.exit(1);
}

// ------------------------------------------------------------------ サーバー
// npx を通すと、止めたときに vite が残ることがあるので、vite を直に動かす
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
const stop = () => { try { server.kill(); } catch { /* もう止まっている */ } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i += 1) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ */ }
  await sleep(250);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const cdp = await ctx.newCDPSession(page);

// ------------------------------------------------------------------ 道具
const ev = (fn, arg) => page.evaluate(fn, arg);
async function shot() {
  // 画面の大きさそのまま（CSS の画素）で撮る：ページが重くならないように
  const b = await page.screenshot({ type: 'jpeg', quality: 60, scale: 'css' });
  return `data:image/jpeg;base64,${b.toString('base64')}`;
}
async function touch(type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
}
async function tapAt(x, y) { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd', 0, 0); }
async function tapSel(sel) {
  const r = await ev((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  if (!r) return false;
  await page.mouse.click(r[0], r[1]);
  return true;
}
/** 打ち出す（右の通路を下へ引っぱって離す） */
async function launch() {
  await touch('touchStart', W - 20, H * 0.7);
  for (let i = 0; i < 12; i += 1) { await touch('touchMove', W - 20, H * 0.7 + i * 14); await sleep(30); }
  await touch('touchEnd', 0, 0);
}
/** 新しく始める（名前つき・ホームをとばす）。setup はセーブを書きかえる関数の本体（s がセーブ） */
async function fresh(setup = '') {
  await page.goto(`${BASE}/?reset=1&name=${encodeURIComponent('ベアコ')}&go=1&review=1`);
  await sleep(1500);
  if (setup) {
    await ev(`(() => { const s = __smash.save; ${setup}; localStorage.setItem('mycryptosmash.save.v1', JSON.stringify(s)); })()`);
    await page.goto(`${BASE}/?go=1&review=1`);
    await sleep(1800);
  }
  await page.waitForFunction(() => !!window.__review, null, { timeout: 10000 });
}
/** 名前などを差しこむ（ゲームと同じ形） */
const fill = (t, c = {}) => t.replace(/\{name\}/g, 'ベアコ').replace(/\{left\}/g, String(c.left ?? 2)).replace(/\{rest\}/g, c.rest ?? '120').replace(/\{tries\}/g, String(c.tries ?? 3));
const quotaSetup = (o) => `s.quota = Object.assign(s.quota, { n: ${o.n ?? 1}, guide: false, played: ${o.played ?? 0}, final: ${!!o.final} }); s.gum = ${o.gum ?? 0}; s.emblems = 3;`;
/** 吹き出しの文字を決めたセリフに差しかえる（文字送りが終わってから） */
async function setText(sel, text) {
  await sleep(900);
  await ev(([s, t]) => document.querySelectorAll(s).forEach((e) => { e.textContent = t; e.classList.remove('typing'); }), [sel, text]);
  await sleep(120);
}

const data = await (async () => { await fresh(); return ev(() => window.__review.data); })();
const report = { intro: [], tutorial: [], scenes: [], stories: [] };

// ------------------------------------------------------------------ 導入
if (want('intro')) {
  console.log('導入…');
  await page.goto(`${BASE}/?reset=1&go=1&review=1`);
  await sleep(2500);
  for (let i = 0; i < 40; i += 1) {
    if (!(await page.$('.story'))) break;
    if (await page.$('.st-ask input')) {
      await page.fill('.st-ask input', 'ベアコ');
      await sleep(300);
      report.intro.push({ who: 'ピエロ', text: '（名前を入れる）', img: await shot() });
      await tapSel('.st-ask button');
      await sleep(1200);
      continue;
    }
    await page.mouse.click(W / 2, H * 0.85); // 文字を最後まで
    await sleep(1300);
    const who = await ev(() => document.querySelector('.st-who')?.textContent ?? '');
    const text = await ev(() => document.querySelector('.st-text')?.textContent ?? '');
    const last = report.intro[report.intro.length - 1];
    if (!last || last.text !== text) report.intro.push({ who, text, img: await shot() });
    await page.mouse.click(W / 2, H * 0.85);
    await sleep(1100);
  }
}

// ------------------------------------------------------------------ チュートリアル（案内つき。操作はすぐ行い、プレイは早送り）
if (want('tutorial')) {
  console.log('チュートリアル…');
  await fresh();
  const t0 = Date.now();
  let lastKey = '';
  let plays = 0;
  const add = async (kind, extra = {}) => {
    // 同じ場面・同じセリフは 1 回だけ
    const prevStep = report.tutorial[report.tutorial.length - 1];
    // ピエロの言っていること：案内の吹き出し・演出の中の吹き出し・右上のひとこと
    const coach = await ev(() => {
      const b = document.querySelector('.coach');
      if (b && !b.hidden) return b.querySelector('.co-t')?.textContent ?? '';
      const t = [...document.querySelectorAll('.toyget .talk-b, .dp-clear .talk-b, .jk-say')].pop();
      return t?.textContent ?? '';
    });
    if (prevStep && prevStep.coach === coach && (prevStep.kind === kind || kind.startsWith('案内（吹き出し'))) return;
    report.tutorial.push({ kind, coach, at: (Date.now() - t0) / 1000, img: await shot(), ...extra });
  };
  for (let step = 0; step < 90; step += 1) {
    const st = await ev(() => {
      const s = __smash.save;
      const pb = __smash.pinball;
      const ring = document.querySelector('.coach-ring');
      const rr = ring && !ring.hidden ? ring.getBoundingClientRect() : null;
      return {
        n: s.quota.n, played: s.quota.played, guide: !!s.quota.guide,
        toyget: !!document.querySelector('.toyget'), closable: !!document.querySelector('.toyget.closable'),
        preview: !!document.querySelector('.tp:not(.leaving)'), result: !document.getElementById('result').hidden,
        quota: !!document.querySelector('#result .quota'), splash: !!document.querySelector('.dp-clear'),
        waiting: !!pb.waiting, playing: !pb.waiting && pb.phase === 'play' && document.getElementById('app').classList.contains('playing'),
        ready: document.getElementById('app').classList.contains('ready'),
        ring: rr ? [rr.left + rr.width / 2, rr.top + rr.height / 2] : null,
        coach: (() => { const b = document.querySelector('.coach'); return b && !b.hidden ? b.querySelector('.co-t')?.textContent ?? '' : ''; })(),
      };
    });
    if (st.n >= 1 && st.played >= 1) { await sleep(1500); await add('本当のノルマ 1 の 1 プレイ目（チュートリアルのおわり）'); break; }
    if (st.toyget) {
      if (!st.closable) { await sleep(1300); await add('NEW GIMMICK!'); await sleep(1400); }
      await page.mouse.click(W / 2, H / 2);
      await sleep(900);
      continue;
    }
    if (st.preview) {
      await sleep(1600);
      await add('ギミックの見本（部品と球だけの実演）');
      await tapSel('.tp-buy');
      await sleep(900);
      continue;
    }
    if (st.splash) {
      await sleep(2600);
      await add('入金口に納めた（CLEAR）');
      await page.mouse.click(W / 2, H / 2);
      await sleep(1200);
      continue;
    }
    if (st.result && !st.quota) { await sleep(500); continue; } // GUM の発表を見せる（早送りしない）
    if (st.ring) {
      const key = `${st.coach}|${st.result}`;
      if (key !== lastKey) { lastKey = key; await sleep(1200); await add(st.result ? 'RESULT（入金口のパネル）' : '案内'); }
      await tapAt(st.ring[0], st.ring[1]);
      await sleep(1400);
      continue;
    }
    if (st.ready && st.waiting) {
      const key = `${st.coach}|table|${plays}`;
      if (key !== lastKey) { lastKey = key; await sleep(1800); await add('台（打ち出しを待つ）'); }
      if (st.n >= 1) {
        // 本当のノルマ 1 の打ち出しで、チュートリアルはおしまい
        await launch();
        await sleep(1500);
        await add('本当のノルマ 1 の 1 プレイ目（チュートリアルのおわり）');
        break;
      }
      {
        await launch();
        await sleep(1500);
        plays += 1;
        await add('プレイ中（40 秒。ここでは早送り）', { play: true });
        await ev(() => { __smash.pinball.runLeft = 0.3; });
        await sleep(2500);
        continue;
      }
    }
    if (st.coach && !st.ring) {
      // 吹き出しだけ：触って閉じる
      const key = `${st.coach}|bubble`;
      if (key !== lastKey) { lastKey = key; await sleep(1200); await add('案内（吹き出しだけ）'); }
    }
    // することがない（ショップなどで案内が出ない）：台へ
    if (!st.ready && !st.result) await tapSel('.home-nav button:nth-child(2)');
    await sleep(600);
  }
}

// ------------------------------------------------------------------ 台の前のピエロ（姿ごと）
const clownScene = (id) => data.clown.find((c) => c.id === id);
async function tierTable(tier, setup = quotaSetup({})) {
  await fresh(setup);
  await ev((t) => window.__review.tier(t), tier);
  await sleep(1600);
}
if (want('table')) {
  console.log('台の前…');
  for (let tier = 0; tier < 5; tier += 1) {
    await tierTable(tier);
    for (const id of ['prePlay', 'lastPlay', 'ready', 'title']) {
      const sc = clownScene(id);
      const line = sc.tiers[tier][0];
      if (id === 'lastPlay') await ev(() => { __smash.save.quota.played = 2; });
      if (id === 'ready') await ev(() => { __smash.save.gum = 260; });
      if (id === 'title') await ev(() => { __smash.save.quota.played = 0; __smash.save.gum = 0; });
      await ev((t) => window.__review.say(t), fill(line, { left: id === 'lastPlay' ? 1 : 3, rest: '200' }));
      await sleep(2600);
      report.scenes.push({ group: id, tier, img: await shot() });
    }
  }
}

// ------------------------------------------------------------------ ギミックを買った・姿が上がった
if (want('gimmick')) {
  console.log('ギミック…');
  for (let tier = 0; tier < 5; tier += 1) {
    await tierTable(tier);
    await ev((t) => window.__review.toyGet('bumper', t, t), tier);
    await sleep(1400);
    await setText('.toyget .talk-b', fill(clownScene('gimmick').tiers[tier][0]));
    report.scenes.push({ group: 'gimmick', tier, img: await shot() });
    await page.mouse.click(W / 2, H / 2);
    await sleep(800);
    if (tier > 0) {
      await ev((t) => window.__review.toyGet('spinner', t - 1, t), tier);
      await sleep(4200);
      await setText('.toyget .talk-b', fill(clownScene('evolve').tiers[tier][0]));
      report.scenes.push({ group: 'evolve', tier, img: await shot() });
    }
  }
}

// ------------------------------------------------------------------ 入金口に納めた（姿ごと。本当にプレイして納める）
if (want('deposit')) {
  console.log('入金口…');
  for (let tier = 0; tier < 5; tier += 1) {
    await tierTable(tier, quotaSetup({ played: 1, gum: 400 }));
    await launch();
    await sleep(1500);
    await ev(() => { __smash.pinball.runLeft = 0.3; });
    await page.waitForSelector('#result .quota .deposit', { timeout: 30000 }).catch(() => null);
    await sleep(800);
    await tapSel('#result .quota .deposit');
    await sleep(2600);
    await setText('.dp-clear .talk-b', fill(clownScene('deposit').tiers[tier][0]));
    report.scenes.push({ group: 'deposit', tier, img: await shot() });
  }
}

// ------------------------------------------------------------------ GAME OVER（姿ごと）
if (want('over')) {
  console.log('GAME OVER…');
  for (let tier = 0; tier < 5; tier += 1) {
    await tierTable(tier, quotaSetup({ played: 3, gum: 0 }));
    await ev(() => window.__review.gameOver());
    await sleep(5200);
    await setText('.talk-b', fill(clownScene('gameOver').tiers[tier][0]));
    report.scenes.push({ group: 'gameOver', tier, img: await shot() });
  }
}

// ------------------------------------------------------------------ ラストステージの前
if (want('final')) {
  console.log('ラストステージ…');
  await tierTable(4, quotaSetup({ n: 11, final: true }));
  await ev((t) => window.__review.say(t), fill(data.final[0].lines[0], { tries: 3 }));
  await sleep(2600);
  report.scenes.push({ group: 'final:pre', tier: 4, img: await shot() });
}

// ------------------------------------------------------------------ 場面の連なり（ラストステージの口上・真のエンディング・通常のエンディング）
async function story(kind, tier, label) {
  await tierTable(tier);
  await ev((k) => window.__review.story(k), kind);
  await sleep(1800);
  const beats = [];
  for (let i = 0; i < 20; i += 1) {
    if (!(await page.$('.story'))) break;
    await page.mouse.click(W / 2, H * 0.85);
    await sleep(1300);
    const who = await ev(() => document.querySelector('.story .st-who')?.textContent ?? '');
    const text = await ev(() => document.querySelector('.story .st-text')?.textContent ?? '');
    if (!beats.length || beats[beats.length - 1].text !== text) beats.push({ who, text, img: await shot() });
    if (await page.$('.story .st-box .k-btn--go, .story .st-last')) break;
    await page.mouse.click(W / 2, H * 0.85);
    await sleep(1100);
  }
  report.stories.push({ label, tier, beats });
}
if (want('story')) {
  console.log('場面の連なり…');
  await story('final', 4, 'ラストステージの口上（ジョーカー）');
  await story('ending', 4, '真のエンディング（ジョーカー）');
  for (let tier = 0; tier < 4; tier += 1) await story('normal', tier, `通常のエンディング（姿 ${tier}：${data.tiers[tier].name}）`);
}

await browser.close();
stop();

// ------------------------------------------------------------------ ページを書く
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const len = (s) => Array.from(s).length;
/** 目安の秒数：読む時間（1 秒 6 文字、最低 1.5 秒）＋操作 */
const readSec = (s) => Math.max(1.5, len(s) / 6);
const lineRow = (t, i) => `<li><span class="no">${i + 1}</span><span class="tx">${esc(t)}</span><span class="ln${len(fill(t)) > 44 ? ' long' : ''}">${len(fill(t))}字</span></li>`;
const tierName = (t) => `${t}：${esc(data.tiers[t].name)}（ギミック ${data.tiers[t].toys} 個〜）`;

let html = '';
// 目次
const toc = [];
const sec = (id, title, body) => { toc.push(`<a href="#${id}">${esc(title)}</a>`); html += `<section id="${id}"><h2>${esc(title)}</h2>${body}</section>`; };

if (report.tutorial.length) {
  let total = 0;
  const rows = report.tutorial.map((s, i) => {
    const prev = i ? report.tutorial[i - 1].at : 0;
    const real = Math.max(0, s.at - prev);
    // 読む時間は、前の場面と違うセリフのときだけ
    const fresh = s.coach && (!i || report.tutorial[i - 1].coach !== s.coach);
    const est = (s.play ? 40 : 0) + (fresh ? readSec(s.coach) : 0) + Math.min(real, 6);
    total += est;
    return `<tr><td class="c">${i + 1}</td><td><b>${esc(s.kind)}</b>${s.coach ? `<p class="say${fresh ? '' : ' same'}">${esc(s.coach)}</p>` : ''}</td><td class="c">${est.toFixed(0)} 秒</td><td><img loading="lazy" src="${s.img}" alt=""></td></tr>`;
  }).join('');
  sec('tutorial', 'チュートリアルの流れ', `<p class="note">場面 ${report.tutorial.length}・目安の合計 <b>約 ${Math.round(total / 60)} 分 ${Math.round(total % 60)} 秒</b>（導入をのぞく）。目安＝読む時間（1 秒 6 文字。前と同じセリフはうすく、数えない）＋操作と演出（実測、6 秒まで）＋プレイ 40 秒。ここでは球を打たずに早送りしたので、3 プレイで 50 GUM に届かず「おまけ」の流れになっている。</p>
    <table class="flow"><thead><tr><th>#</th><th>場面・ピエロの案内</th><th>目安</th><th>画面</th></tr></thead><tbody>${rows}</tbody></table>`);
}
if (report.intro.length) {
  const rows = report.intro.map((b, i) => `<div class="beat"><img loading="lazy" src="${b.img}" alt=""><div><span class="no">${i + 1}</span>${b.who ? `<b class="who">${esc(b.who)}</b>` : '<b class="who na">ト書き</b>'}<p>${esc(b.text)}</p><span class="ln">${len(b.text)}字・目安 ${readSec(b.text).toFixed(0)} 秒</span></div></div>`).join('');
  const sum = report.intro.reduce((a, b) => a + readSec(b.text) + 1, 0);
  sec('intro', '導入（はじめて開いたとき）', `<p class="note">場面 ${report.intro.length}・目安 約 ${Math.round(sum)} 秒</p><div class="beats">${rows}</div>`);
}
// 場面ごとのセリフ
const sceneBlock = (group, title, when, tiers, tierList = [0, 1, 2, 3, 4]) => {
  const shots = report.scenes.filter((s) => s.group === group);
  const cols = tierList.map((t) => {
    const sh = shots.find((s) => s.tier === t);
    const lines = tiers[t] ?? [];
    return `<div class="tier"><h4>${tierName(t)}</h4>${sh ? `<img loading="lazy" src="${sh.img}" alt="">` : '<div class="noimg">スクリーンショットなし</div>'}<ol>${lines.map(lineRow).join('')}</ol></div>`;
  }).join('');
  return `<article class="scene"><h3>${esc(title)}</h3><p class="when">${esc(when)}</p><div class="tiers">${cols}</div></article>`;
};
if (report.scenes.length || data.clown) {
  let body = '';
  for (const c of data.clown) {
    const list = c.id === 'evolve' ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
    body += sceneBlock(c.id, c.title, c.when, c.tiers, list);
  }
  sec('clown', 'ピエロのセリフ（場面 × 姿）', `<p class="note">姿はギミックの数で上がる：${data.tiers.map((t, i) => `${i} ${esc(t.name)}（${t.toys}〜）`).join('・')}。スクリーンショットは各場面の 1 つ目のセリフ。{name} はベアコ、{rest}・{left} は例の数字。44 字をこえるものは赤。</p>${body}`);
}
{
  let body = '';
  for (const t of data.tutorial) body += `<article class="scene"><h3>${esc(t.title)}</h3><p class="when">${esc(t.when)}</p><ol>${t.lines.map(lineRow).join('')}</ol></article>`;
  sec('tutlines', 'チュートリアルのセリフ（全部）', `<p class="note">画面は「チュートリアルの流れ」を見る。口調はコモンのピエロ。</p>${body}`);
}
{
  const pre = report.scenes.find((s) => s.group === 'final:pre');
  let body = '';
  for (const f of data.final) body += `<article class="scene"><h3>${esc(f.title)}</h3><p class="when">${esc(f.when)}</p>${f.id === 'pre' && pre ? `<img class="one" loading="lazy" src="${pre.img}" alt="">` : ''}<ol>${f.lines.map(lineRow).join('')}</ol></article>`;
  for (const n of data.normal) body += sceneBlock(`normal:${n.id}`, n.title, n.when, n.tiers, [0, 1, 2, 3]);
  sec('final', 'ラストステージ・通常のエンディングのセリフ', body);
}
if (report.stories.length) {
  let body = '';
  for (const s of report.stories) {
    body += `<article class="scene"><h3>${esc(s.label)}</h3><div class="beats">${s.beats.map((b, i) => `<div class="beat"><img loading="lazy" src="${b.img}" alt=""><div><span class="no">${i + 1}</span>${b.who ? `<b class="who">${esc(b.who)}</b>` : '<b class="who na">ト書き</b>'}<p>${esc(b.text)}</p><span class="ln">${len(b.text)}字</span></div></div>`).join('')}</div></article>`;
  }
  sec('stories', '場面の連なり（口上・エンディング）', body);
}

const page_ = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>My Crypto Smash ピエロのセリフ見直し</title>
<style>
:root{--ink:#0b0a10;--bone:#f4efe4;--blood:#e5163a;--ticket:#ffd21f;--curse:#7b2cff;--emb:#22e5c0}
*{box-sizing:border-box}body{margin:0;background:#15111b;color:var(--bone);font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
header{padding:20px 16px 8px;background:repeating-linear-gradient(135deg,#2a0d18 0 14px,#1a0a12 14px 28px);border-bottom:4px solid var(--ink)}
h1{margin:0;font-size:22px;color:var(--ticket)}header p{margin:4px 0 0;opacity:.8;font-size:13px}
nav{position:sticky;top:0;z-index:5;display:flex;gap:6px;overflow-x:auto;padding:8px 12px;background:#0b0a10ee;border-bottom:2px solid #2a2430}
nav a{flex:none;padding:6px 10px;color:var(--ink);background:var(--bone);text-decoration:none;font-size:13px;transform:skewX(-8deg)}
section{padding:12px 12px 28px;max-width:1280px;margin:0 auto}h2{margin:18px 0 6px;font-size:20px;color:var(--ticket);border-left:6px solid var(--blood);padding-left:8px}
h3{margin:0 0 2px;font-size:17px}.note,.when{margin:2px 0 10px;font-size:13px;opacity:.82}
.scene{margin:14px 0;padding:12px;background:#1e1826;border:2px solid var(--ink);box-shadow:4px 5px 0 #000}
.tiers{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.tier h4{margin:0 0 6px;font-size:13px;color:var(--emb)}
img{display:block;width:100%;max-width:260px;height:auto;border:2px solid var(--ink);background:#000}
img.one{max-width:220px;margin:6px 0}
.noimg{display:grid;place-items:center;aspect-ratio:390/844;max-width:260px;border:2px dashed #3a3242;font-size:12px;opacity:.6}
ol{list-style:none;margin:8px 0 0;padding:0}li{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:baseline;padding:6px 0;border-bottom:1px dashed #3a3242}
.no{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 4px;color:var(--ink);background:var(--ticket);font-size:12px;font-weight:700}
.ln{font-size:11px;opacity:.6;white-space:nowrap}.ln.long{color:#ff6b7e;opacity:1}
table.flow{width:100%;border-collapse:collapse}table.flow th{font-size:12px;text-align:left;padding:6px;background:#0b0a10}
table.flow td{padding:8px 6px;border-bottom:1px solid #2e2836;vertical-align:top}table.flow td.c{text-align:center;white-space:nowrap}
table.flow img{max-width:170px}.say.same{opacity:.45}.say{margin:4px 0 0;padding:6px 8px;color:var(--ink);background:var(--bone);font-size:14px}
.beats{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.beat{display:grid;grid-template-columns:120px 1fr;gap:10px;padding:8px;background:#1e1826;border:2px solid var(--ink)}
.beat img{max-width:120px}.beat p{margin:4px 0}.who{display:inline-block;margin-left:6px;padding:0 6px;color:#fff;background:var(--blood);font-size:12px}.who.na{background:#3a3242}
.errs{color:#ff6b7e;font-size:12px}
</style></head><body>
<header><h1>ピエロのセリフ見直し</h1><p>${new Date().toLocaleString('ja-JP')} に撮影（${W}×${H}）。スクリーンショットはゲームの画面そのもの。</p>${errors.length ? `<p class="errs">画面のエラー：${esc(errors.slice(0, 5).join(' / '))}</p>` : ''}</header>
<nav>${toc.join('')}</nav>${html}</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page_);
process.exitCode = 0;
console.log(`書いた：${OUT}（${(page_.length / 1e6).toFixed(1)} MB）${errors.length ? `／画面のエラー ${errors.length}` : ''}`);
