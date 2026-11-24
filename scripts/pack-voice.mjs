#!/usr/bin/env node
// 実況の声（かけら）を 1 つのファイル public/voice-en.bin にまとめ、どのことばがどこにあるかの表
// src/core/voice-pieces.ts を作る。声を素材として 1 つずつ配らないよう、バイトはかき混ぜてある
// （src/core/voice.ts が言うときに戻す）。
//
//   node scripts/pack-voice.mjs <manifest.tsv>
//
// manifest.tsv は 1 行に 1 つ：ことば、タブ、mp3 のパス（manifest からの相対）。mp3 は短く切ったモノラル。
// 声は ElevenLabs で作る（声「My Crypto Football Announcer (EN)」= bhqY06WE9Tbaa1bTxttc、モデル eleven_v4。
// ことばの前に [excited]・[shouting] などの指示を付けて、1 つずつ生成）。作業フォルダはリポジトリの外に置く。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const manifest = process.argv[2];
if (!manifest) {
  console.error('usage: node scripts/pack-voice.mjs <manifest.tsv>');
  process.exit(1);
}
const base = dirname(resolve(manifest));
const rows = readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));

/** src/core/voice.ts の scramble と同じ（2 回かけると元に戻る） */
const scramble = (bytes, at) => {
  for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= ((at + i) * 131 + 71) & 255;
  return bytes;
};

const parts = [];
const table = [];
let at = 0;
for (const [text, file] of rows) {
  const bytes = new Uint8Array(readFileSync(join(base, file)));
  table.push([text, at, bytes.length]);
  parts.push(scramble(bytes, at));
  at += bytes.length;
}
const out = new Uint8Array(at);
let p = 0;
for (const b of parts) {
  out.set(b, p);
  p += b.length;
}
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
writeFileSync(join(root, 'public/voice-en.bin'), out);
writeFileSync(join(root, 'src/core/voice-pieces.ts'), [
  '// scripts/pack-voice.mjs が作る。手で直さない。',
  '// 実況の声のかけら：ことばと、public/voice-en.bin の中の位置（はじまり・長さ）。',
  '',
  `export const VOICE_BYTES = ${at};`,
  '',
  'export const PIECES: readonly (readonly [text: string, offset: number, length: number])[] = [',
  ...table.map(([t, o, n]) => `  [${JSON.stringify(t)}, ${o}, ${n}],`),
  '];',
  '',
].join('\n'));
console.log(`${table.length} pieces, ${at} bytes`);
