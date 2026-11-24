import { describe, expect, it } from 'vitest';
import { deviceToScreen, relativeTo, tiltOnScreen, upFromOrientation, type V3 } from '../src/core/sensors';

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
