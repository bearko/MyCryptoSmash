import { describe, expect, it } from 'vitest';
import { KEY_TILT, KeyTilt, deviceToScreen, keyTiltStep, keyTiltTarget, relativeTo, tiltOnScreen, upFromOrientation, type V3 } from '../src/core/sensors';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('傾き', () => {
  it('平らに置くと上は画面の手前（z）', () => {
    const u = upFromOrientation(0, 0);
    close(u[0], 0); close(u[1], 0); close(u[2], 1);
  });
  it('縦に立てると上は端末の上（y）', () => {
    const u = upFromOrientation(90, 0);
    close(u[1], 1);
  });
  it('基準どおりに持っていれば傾き 0', () => {
    const base: V3 = upFromOrientation(40, 10);
    const [x, y] = tiltOnScreen(base, base, 0);
    close(x, 0); close(y, 0);
  });
  it('基準を真上に回す', () => {
    const base: V3 = upFromOrientation(50, -20);
    const r = relativeTo(base, base);
    close(r[2], 1);
  });
  it('平らな基準から上側を持ち上げると、画面の下へ転がる', () => {
    const [x, y] = tiltOnScreen(upFromOrientation(20, 0), [0, 0, 1], 0);
    close(x, 0);
    expect(y).toBeGreaterThan(0.3);
  });
  it('右側を下げると、画面の右へ転がる', () => {
    const [x, y] = tiltOnScreen(upFromOrientation(0, 20), [0, 0, 1], 0);
    expect(x).toBeGreaterThan(0.3);
    close(y, 0);
  });
  it('45 度に構えた基準から手前に起こすと、画面の下へ転がる', () => {
    const base = upFromOrientation(45, 0);
    const [x, y] = tiltOnScreen(upFromOrientation(60, 0), base, 0);
    close(x, 0);
    expect(y).toBeGreaterThan(0.2);
  });
  it('45 度に構えた基準から右を下げると、画面の右へ転がる', () => {
    const base = upFromOrientation(45, 0);
    const [x] = tiltOnScreen(upFromOrientation(45, 20), base, 0);
    expect(x).toBeGreaterThan(0.2);
  });
  it('画面が 90 度回っていても向きを合わせる', () => {
    const [x, y] = deviceToScreen(1, 0, 90);
    close(x, 0); close(y, -1);
  });
});

describe('キーボードの傾き（PC）', () => {
  const none = { up: false, down: false, left: false, right: false };
  it('押していなければ 0', () => {
    expect(keyTiltTarget(none)).toEqual([0, 0]);
  });
  it('D で右、W で上（画面の y は下が正）', () => {
    const [x, y] = keyTiltTarget({ ...none, right: true });
    close(x, KEY_TILT); close(y, 0);
    const [x2, y2] = keyTiltTarget({ ...none, up: true });
    close(x2, 0); close(y2, -KEY_TILT);
  });
  it('斜めは 2 つを合わせ、大きさは同じ', () => {
    const [x, y] = keyTiltTarget({ ...none, down: true, left: true });
    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
    close(Math.hypot(x, y), KEY_TILT);
  });
  it('反対どうしは打ち消す', () => {
    expect(keyTiltTarget({ up: true, down: true, left: false, right: false })).toEqual([0, 0]);
  });
  it('押している間になめらかに近づき、行きすぎない', () => {
    let v: [number, number] = [0, 0];
    const target: [number, number] = [KEY_TILT, 0];
    const seen: number[] = [];
    for (let i = 0; i < 60; i += 1) { v = keyTiltStep(v, target, 1 / 60); seen.push(v[0]); }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(KEY_TILT * 0.5);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBeLessThanOrEqual(KEY_TILT);
    expect(seen[seen.length - 1]).toBeGreaterThan(KEY_TILT * 0.99);
  });
  it('離すと 0 に戻る', () => {
    const k = new KeyTilt();
    k.key('KeyD', true);
    for (let i = 0; i < 30; i += 1) k.step(1 / 60);
    expect(k.value[0]).toBeGreaterThan(0.3);
    k.key('KeyD', false);
    for (let i = 0; i < 120; i += 1) k.step(1 / 60);
    expect(k.value).toEqual([0, 0]);
  });
  it('矢印キーも同じ。ほかのキーは受けない', () => {
    const k = new KeyTilt();
    expect(k.key('ArrowLeft', true)).toBe(true);
    expect(k.dirs.left).toBe(true);
    expect(k.key('Space', true)).toBe(false);
    expect(k.aim).toEqual([-1, 0]);
    k.clear();
    expect(k.aim).toBeNull();
  });
});
