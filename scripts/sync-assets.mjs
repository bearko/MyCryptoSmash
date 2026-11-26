#!/usr/bin/env node
// My Crypto Heroes の素材データベース（https://github.com/bearko/mycryptoheroes）から
// ゲームで使うものだけを public/mch/ に写し、src/generated/catalog.json を作る。
//
//   node scripts/sync-assets.mjs
//
// 素材の場所：$MCH_ASSETS_DIR、なければ vendor/mycryptoheroes（Git サブモジュール）。
// サブモジュールが空なら、ここで取得を試みる（ビルド環境でサブモジュールが取られていない場合の保険）。

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.env.MCH_ASSETS_DIR ?? 'vendor/mycryptoheroes');
const outPublic = join(root, 'public', 'mch');
const outCatalog = join(root, 'src', 'generated', 'catalog.json');

if (!existsSync(join(src, 'Data')) && !process.env.MCH_ASSETS_DIR) {
  console.log('[sync-assets] submodule is empty — fetching it');
  try {
    execSync('git submodule update --init --depth 1 vendor/mycryptoheroes', { cwd: root, stdio: 'inherit' });
  } catch {
    /* fall through to the error below */
  }
}
if (!existsSync(join(src, 'Data'))) {
  console.error(`[sync-assets] asset database not found at ${src}`);
  console.error('Run `git submodule update --init` or set MCH_ASSETS_DIR.');
  process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(join(src, p), 'utf8'));
let copied = 0;
/** 素材 DB のファイルを写して、サイトの根からの URL パスを返す。 */
function use(relPath) {
  const from = join(src, relPath);
  if (!existsSync(from)) throw new Error(`missing asset: ${relPath}`);
  const to = join(outPublic, relPath);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
  return `mch/${relPath}`;
}

rmSync(outPublic, { recursive: true, force: true });

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

// ---------------------------------------------------------------- ヒーロー（マレットになる）
const heroes = readJson('Data/Heroes/heroes.json')
  .filter((h) => h.category === 'original' && RARITIES.includes(h.rarity?.name))
  .filter((h) => existsSync(join(src, h.image_file_path)))
  .map((h) => ({
    id: h.id,
    name: h.name.ja,
    rarity: h.rarity.id,
    phy: h.max_level_stats.phy,
    int: h.max_level_stats.int,
    agi: h.max_level_stats.agi,
    img: use(h.image_file_path),
  }));

// ---------------------------------------------------------------- エクステンション（拾うと一時的な強化）
// シリーズごとに効き目を決める
const KIND_SERIES = {
  atk: [1, 6, 11, 14, 15, 28, 34, 48, 51, 56, 73, 82, 97, 99, 100, 152, 161, 164, 171, 183, 2, 13, 29, 35, 49, 74],
  gum: [3, 8, 16, 50, 57, 79, 80, 103, 104, 150, 158, 173, 174, 178],
  magnet: [9, 10, 17, 75, 98, 102, 105, 111, 143, 147, 156],
  rush: [5, 19, 20, 21, 22, 23, 24, 25, 26, 27, 86, 87, 88, 89, 90, 91, 92, 93, 94],
  wave: [30, 32, 37, 39, 40, 41, 42, 43, 44, 45, 46, 55, 58, 64, 65, 66, 67, 68, 69, 70, 71, 72],
  giant: [4, 18, 31, 36, 59, 61, 81, 95, 96, 110, 141, 193],
};
const kindOf = new Map();
for (const [kind, ids] of Object.entries(KIND_SERIES)) for (const id of ids) kindOf.set(id, kind);

const extJson = readJson('Data/Extensions/extensions.json');
const exts = extJson
  .filter((e) => e.id <= 5500 && e.category !== 'replica' && RARITIES.includes(e.rarity?.name) && kindOf.has(e.series?.id))
  .filter((e) => existsSync(join(src, e.image_file_path)))
  .map((e) => ({
    id: e.id,
    name: e.name.ja,
    rarity: e.rarity.id,
    kind: kindOf.get(e.series.id),
    img: use(e.image_file_path),
  }));
// Limited シリーズ（ID 5501 以降。レプリカ ID 11001〜 は使わない）：台を突破するたびに選ぶ、永続の改造
const limited = extJson
  .filter((e) => e.id > 5500 && e.id < 11000 && e.category !== 'replica')
  .filter((e) => existsSync(join(src, e.image_file_path)))
  .map((e) => ({ id: e.id, name: e.name.ja, series: e.series?.name?.ja ?? '', img: use(e.image_file_path) }));

// ---------------------------------------------------------------- エネミー
const enemyNames = new Map();
for (const e of readJson('Data/Enemies/enemies.json')) {
  const file = e.raw?.image;
  if (file && !enemyNames.has(file)) enemyNames.set(file, e.name.ja);
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** ステージごとの群れ（色ちがいが 6 段階で強くなる） */
const ENEMY_SETS = [
  range(386, 391),
  range(408, 413),
  range(161, 166),
  range(131, 136),
  range(101, 106),
  range(111, 116),
  range(375, 380),
  range(181, 186),
  range(397, 402),
  range(121, 126),
];
/** 10 階ごとのレイドボス（50 階は最後のもの） */
const RAIDS = [372, 373, 1183, 1189, 1190];
/** ほかの階のボス：シャドーヒーロー（ゴースト化した英雄） */
const SHADOWS = [421, 422, 423, 425, 427, 429, 433, 436, 437, 441, 444, 445, 448, 450, 451, 453, 461, 463, 468, 476,
  486, 490, 504, 505, 519, 424, 426, 428, 430, 431, 434, 435, 438, 440, 442, 443, 452, 459, 460, 462, 464, 466, 473, 475, 478];
const enemyOf = (id) => ({ id, name: enemyNames.get(`${id}.png`) ?? 'エネミー', img: use(`Image/Enemies/${id}.png`) });
const enemySets = ENEMY_SETS.map((ids) => ids.map(enemyOf));
/** 名前のないレイドボスに付ける呼び名 */
const RAID_NAMES = { 1189: '謎のレイドボス' };
const raids = RAIDS.map(enemyOf).map((e) => ({ ...e, name: RAID_NAMES[e.id] ?? e.name }));
const shadows = SHADOWS.filter((id) => existsSync(join(src, `Image/Enemies/${id}.png`))).map(enemyOf);

// ---------------------------------------------------------------- スキルツリーのアイコン（src/game/skills.ts の icon: 番号）
const treeIcons = [...readFileSync(join(root, 'src', 'game', 'skills.ts'), 'utf8').matchAll(/,\s*(\d{4})\),?\s*$/gm)].map((m) => m[1]);
for (const id of new Set(treeIcons)) use(`Image/Extensions/${id}.png`);

// ---------------------------------------------------------------- 台の仕掛けの絵（src/game/toys.ts の TOY_ART の番号）
const toySrc = readFileSync(join(root, 'src', 'game', 'toys.ts'), 'utf8');
const toyBlock = toySrc.match(/export const TOY_ART[^=]*= \{([\s\S]*?)\n\};/)?.[1] ?? '';
for (const m of new Set([...toyBlock.matchAll(/\b(\d{4})\b/g)].map((x) => x[1]))) {
  if (existsSync(join(src, `Image/Extensions/${m}.png`))) use(`Image/Extensions/${m}.png`);
}

// ---------------------------------------------------------------- 背景（縦長 1000×1500）
const BGS = ['1056', '1041', '1003', '1030', '1050', '1010', '1004', '1051', '1060', '2805', '2605', '2905', '2405', '2105'];

const catalog = {
  heroes,
  exts,
  limited,
  enemySets,
  raids,
  shadows,
  bgs: BGS.map((id) => use(`Image/Backgrounds/${id}.png`)),
  fx: {
    hit: use('Image/Effects/Battle/01_single_damage.png'),
    blast: use('Image/Effects/Battle/07_effect_07.png'),
    buff: use('Image/Effects/Battle/04_buff.png'),
  },
  icons: {
    gum: use('Image/Icons/gum.png'),
    ce: use('Image/Icons/ce.png'),
    phy: use('Image/BattleIcons/Buffs/buf_phy.png'),
    int: use('Image/BattleIcons/Buffs/buf_int.png'),
    agi: use('Image/BattleIcons/Buffs/buf_agi.png'),
  },
  bgm: {
    field: use('Audio/BGM/land.mp3'),
    boss: use('Audio/BGM/raid.mp3'),
  },
  se: {
    hit: use('Audio/SE/Battle/1_single_damage.mp3'),
    blast: use('Audio/SE/Battle/2_area_damage.mp3'),
    buff: use('Audio/SE/Battle/4_buff.mp3'),
    chest: use('Audio/SE/Actions/open_treasure.mp3'),
    win: use('Audio/SE/Jingles/win.mp3'),
    clear: use('Audio/SE/clear.wav'),
  },
};

mkdirSync(dirname(outCatalog), { recursive: true });
writeFileSync(outCatalog, JSON.stringify(catalog));
console.log(
  `[sync-assets] ${heroes.length} heroes, ${exts.length} extensions, ${limited.length} limited, ` +
    `${enemySets.flat().length + raids.length + shadows.length} enemies, ${copied} files copied`,
);
