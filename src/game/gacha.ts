// ヒーローマレットのガチャ（ショップの 4 段目のカプセル）。純粋な計算だけ（画面は src/ui/gacha.ts と src/ui/shop.ts）。
// - レアリティのカプセル：★が決まっている（★1〜★5）。中身はその★のまだ持っていないヒーローからランダム。★が高いほど高い。
// - 系統のカプセル：ヒーローのスキル系統（体力・知力・素早さ。abilities.ts の abilityOf(h).family）が決まっている。★はランダム（★1 が多く、★5 はまれ）。
// - すでに持っているヒーローは出ない（その★・系統で全部持っていたら、そのカプセルは並べない）。
// - エンブレムで回す。出たヒーローは挑戦の間だけ（GAME OVER で最初のヒーローに戻る）。図鑑の記録（save.heroDex）には残る。
// - 並ぶカプセルの組み合わせは、品ぞろえを引き直すたび（リロール・プレイのあと）に入れかわる（save.capsules）。

import { cat, type Hero } from '../core/catalog';
import type { Save } from '../core/save';
import { abilityOf, type AbilityDef } from './abilities';
import { slotsOf } from './mods';

export type HeroFamily = AbilityDef['family'];
export const FAMILIES: HeroFamily[] = ['phy', 'int', 'agi'];
export const FAMILY_NAME: Record<HeroFamily, string> = { phy: '体力', int: '知力', agi: '素早さ' };
export const FAMILY_COLOR: Record<HeroFamily, string> = { phy: '#ff6b45', int: '#8b7bff', agi: '#3fe0c8' };

/** 並んでいるカプセル（sold は買ったあと。棚には空のカプセル台が残る） */
export type Capsule = ({ kind: 'rar'; r: number } | { kind: 'fam'; fam: HeroFamily }) & { sold?: boolean };

/**
 * 値段（エンブレム）。エクステンション（★1〜★5 ＝ 3・7・12・22・50）より少し高め：
 * ヒーローは控えの球（ヒーローの枠が要る）とリーダーの能力として効き、1 人で枠を 1 つ使うため。
 */
export const CAPSULE_RAR_PRICE = [3, 7, 12, 22, 50];
/** 系統のカプセルの値段（★の重みでならした見こみ ≒ 10.6 より少し下） */
export const CAPSULE_FAM_PRICE = 7;
/** 系統のカプセルの★の重み（★1〜★5） */
export const FAM_WEIGHTS = [50, 26, 15, 6.5, 2.5];
/** 並べるレアリティのカプセルの★の重み（★1〜★5） */
export const RAR_OFFER_WEIGHTS = [26, 28, 24, 14, 8];
/** 並べる数：レアリティ 2 つ＋系統 1〜2 つ */
export const CAPSULE_RAR_OFFERS = 2;

export const capsulePrice = (c: Capsule, discount = 0): number =>
  Math.max(1, (c.kind === 'rar' ? CAPSULE_RAR_PRICE[Math.max(1, Math.min(5, c.r)) - 1] : CAPSULE_FAM_PRICE) - discount);

/** ヒーローの系統（いちばん高い能力値で決まる） */
export const familyOf = (h: Hero): HeroFamily => abilityOf(h).family;

/** カプセルから出られるヒーロー（まだ持っていないもの） */
export function capsulePool(save: Pick<Save, 'heroes'>, c: Capsule, heroes: Hero[] = cat.heroes): Hero[] {
  const own = new Set(save.heroes);
  return heroes.filter((h) => !own.has(h.id) && (c.kind === 'rar' ? h.rarity === c.r : familyOf(h) === c.fam));
}

function weighted(ws: number[], rnd: () => number): number {
  const sum = ws.reduce((a, b) => a + b, 0);
  let x = rnd() * sum;
  for (let i = 0; i < ws.length; i += 1) {
    x -= ws[i];
    if (x < 0) return i;
  }
  return ws.length - 1;
}

/** 系統のカプセルの★の確率（その系統で持っていない★は除いて割りなおす。並べない★は 0） */
export function famOdds(save: Pick<Save, 'heroes'>, fam: HeroFamily, heroes: Hero[] = cat.heroes): number[] {
  const pool = capsulePool(save, { kind: 'fam', fam }, heroes);
  const ws = FAM_WEIGHTS.map((w, i) => (pool.some((h) => h.rarity === i + 1) ? w : 0));
  const sum = ws.reduce((a, b) => a + b, 0);
  return sum ? ws.map((w) => w / sum) : ws;
}

/** カプセルを開ける（中身を決めるだけ。セーブは変えない）。出せるヒーローがいなければ null */
export function drawCapsule(save: Pick<Save, 'heroes'>, c: Capsule, rnd: () => number = Math.random, heroes: Hero[] = cat.heroes): Hero | null {
  const pool = capsulePool(save, c, heroes);
  if (!pool.length) return null;
  let list = pool;
  if (c.kind === 'fam') {
    const odds = famOdds(save, c.fam, heroes);
    const r = weighted(odds, rnd) + 1;
    list = pool.filter((h) => h.rarity === r);
    if (!list.length) list = pool;
  }
  return list[Math.floor(rnd() * list.length) % list.length];
}

/** 4 段目に並べるカプセルを引く（レアリティ 2 つ＋系統 1〜2 つ。出せるヒーローがいないカプセルは並べない） */
export function rollCapsules(save: Pick<Save, 'heroes'>, rnd: () => number = Math.random, heroes: Hero[] = cat.heroes): Capsule[] {
  const out: Capsule[] = [];
  const rs = [1, 2, 3, 4, 5].filter((r) => capsulePool(save, { kind: 'rar', r }, heroes).length > 0);
  const ws = rs.map((r) => RAR_OFFER_WEIGHTS[r - 1]);
  while (out.length < CAPSULE_RAR_OFFERS && rs.length) {
    const i = weighted(ws, rnd);
    out.push({ kind: 'rar', r: rs[i] });
    rs.splice(i, 1);
    ws.splice(i, 1);
  }
  out.sort((a, b) => (a.kind === 'rar' && b.kind === 'rar' ? a.r - b.r : 0));
  const fams = FAMILIES.filter((f) => capsulePool(save, { kind: 'fam', fam: f }, heroes).length > 0);
  const nf = Math.min(fams.length, rnd() < 0.5 ? 1 : 2);
  for (let k = 0; k < nf; k += 1) out.push({ kind: 'fam', fam: fams.splice(Math.floor(rnd() * fams.length) % fams.length, 1)[0] });
  return out;
}

/** カプセルが並んでいなければ引く（force なら引き直す）。持っているヒーローが増えて出せなくなったカプセルは外す */
export function restockCapsules(save: Save, force = false, rnd: () => number = Math.random): void {
  const ok = (c: Capsule): boolean => !!c && (c.sold || capsulePool(save, c).length > 0);
  if (force || !Array.isArray(save.capsules) || !save.capsules.length) save.capsules = rollCapsules(save, rnd);
  else save.capsules = save.capsules.filter(ok);
}

export type GachaResult =
  | { ok: true; hero: Hero; price: number; party: boolean }
  | { ok: false; why: 'gone' | 'poor' | 'empty' };

/**
 * カプセルを買って開ける：エンブレムを払い、ヒーローを持ち物（save.heroes）と図鑑（save.heroDex）に入れる。
 * ヒーローの枠に空きがあれば編成（save.party）の後ろに入れる。カプセルは「買った」になる。
 */
export function buyCapsule(save: Save, index: number, discount = 0, rnd: () => number = Math.random): GachaResult {
  const c = save.capsules?.[index];
  if (!c || c.sold) return { ok: false, why: 'gone' };
  const price = capsulePrice(c, discount);
  if (save.emblems < price) return { ok: false, why: 'poor' };
  const hero = drawCapsule(save, c, rnd);
  if (!hero) return { ok: false, why: 'empty' };
  save.emblems -= price;
  save.heroes.push(hero.id);
  save.heroDex = [...new Set([...(save.heroDex ?? []), ...save.heroes])];
  const room = save.party.length < slotsOf(save).hero;
  if (room) save.party.push(hero.id);
  save.capsules = (save.capsules ?? []).map((x, i) => (i === index ? { ...x, sold: true } : x));
  return { ok: true, hero, price, party: room };
}

/** 図鑑のヒーローの数（いつか手に入れたヒーロー。いま持っているヒーローもふくむ） */
export const heroDexCount = (save: Pick<Save, 'heroes' | 'heroDex'>): number => new Set([...(save.heroDex ?? []), ...save.heroes]).size;
