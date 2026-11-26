import { describe, expect, it } from 'vitest';
import { CLOWN_SCENES, CLOWN_TABLE, DEFAULT_NAME, NAME_MAX, NORMAL_END, cleanName, clownLine, clownLines, fillLine, normalLine, preScene } from '../src/game/clown-lines';
import { CLOWN_NAME } from '../src/game/toys';
import { freshSave } from '../src/core/save';
import { resetChallenge } from '../src/game/quota';
import { cat } from '../src/core/catalog';

describe('ピエロのセリフ', () => {
  it('どの姿・どの場面にもセリフが 3 つ以上ある', () => {
    expect(CLOWN_TABLE.length).toBe(CLOWN_NAME.length);
    for (let t = 0; t < CLOWN_NAME.length; t += 1) {
      for (const sc of CLOWN_SCENES) {
        const list = clownLines(sc, t);
        expect(list.length, `${CLOWN_NAME[t]}・${sc}`).toBeGreaterThanOrEqual(3);
        expect(new Set(list).size).toBe(list.length);
        for (const l of list) expect(l.trim().length).toBeGreaterThan(4);
      }
    }
  });
  it('通常のエンディング：ジョーカーより前の姿（0〜3）ごとに、扉を開けるセリフと「台を完成させれば……」のヒントが 3 つ以上', () => {
    expect(NORMAL_END.length).toBe(CLOWN_NAME.length - 1);
    for (const t of NORMAL_END) for (const sc of ['door', 'hint'] as const) {
      expect(t[sc].length).toBeGreaterThanOrEqual(3);
      expect(new Set(t[sc]).size).toBe(t[sc].length);
    }
    // ヒントは台を完成させる（仕掛け・ジョーカー）ことにふれる
    for (const t of NORMAL_END) for (const l of t.hint) expect(/仕掛け|完成|ジョーカー/.test(l)).toBe(true);
    const line = normalLine('door', 2, { name: 'ベアコ' }, () => 0);
    expect(line).not.toContain('{');
  });
  it('名前・残りプレイ・あと何 GUM を差しこむ（差しこみ残しがない）', () => {
    for (let t = 0; t < CLOWN_NAME.length; t += 1) {
      for (const sc of CLOWN_SCENES) {
        for (const raw of clownLines(sc, t)) {
          const s = fillLine(raw, { name: 'ベアコ', left: 2, rest: '1.2K' });
          expect(s).not.toMatch(/[{}]/);
          if (raw.includes('{name}')) expect(s).toContain('ベアコ');
          if (raw.includes('{left}')) expect(s).toContain('2');
          if (raw.includes('{rest}')) expect(s).toContain('1.2K');
        }
      }
    }
    // コモンのタイトルの決まり文句
    expect(fillLine(clownLines('title', 0)[0], { name: 'ベアコ' })).toBe('へへっ、ベアコ。その腕で納められるのかい？');
  });
  it('名前がまだないときは「お客さん」と呼ぶ', () => {
    expect(fillLine('{name}、こっちだ', {})).toBe(`${DEFAULT_NAME}、こっちだ`);
    expect(clownLine('title', 0, {}, () => 0)).toContain(DEFAULT_NAME);
  });
  it('名前は前後の空白を取って 10 文字まで。空なら「お客さん」', () => {
    expect(cleanName('  ベアコ  ')).toBe('ベアコ');
    expect(cleanName('')).toBe(DEFAULT_NAME);
    expect(cleanName('　 ')).toBe(DEFAULT_NAME);
    expect(Array.from(cleanName('あいうえおかきくけこさしすせそ')).length).toBe(NAME_MAX);
  });
  it('プレイの前の場面：もう納められる・最後の 1 プレイ・ふつう', () => {
    expect(preScene(3, true)).toBe('ready');
    expect(preScene(1, false)).toBe('lastPlay');
    expect(preScene(3, false)).toBe('prePlay');
  });
  it('名前は GAME OVER でも残る', () => {
    const s = freshSave(cat.heroes[0].id);
    expect(s.name).toBe('');
    s.name = 'ベアコ';
    resetChallenge(s);
    expect(s.name).toBe('ベアコ');
  });
});
