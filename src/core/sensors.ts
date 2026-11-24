// スマホの傾き（重力の向き）と振り（瞬間的な加速度）を、画面の向きのベクトルにして渡す。
//
// - 傾き：重力の向きを「基準の姿勢」からの回転として測る。基準は calibrate() で
//   「いま持っている角度」に置きかえられる（水平リセット）。寝かせても立てても同じように効く。
// - 振り：重力を除いた加速度が一定を超えた瞬間の向きを 1 回の「振り」として通知する。
// - 端末によって加速度の符号が逆のものがあるので、傾きセンサー（deviceorientation）と
//   見くらべて自動で合わせる。

export type V3 = [number, number, number];

const DEG = Math.PI / 180;

export function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** deviceorientation の beta・gamma から、端末の座標で見た「上」の向き（重力の逆） */
export function upFromOrientation(betaDeg: number, gammaDeg: number): V3 {
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  return [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(b) * Math.cos(g)];
}

/** base を真上 (0,0,1) に重ねる最短の回転を v にかける（ロドリゲスの回転公式） */
export function relativeTo(v: V3, base: V3): V3 {
  const b = norm(base);
  const z: V3 = [0, 0, 1];
  const c = dot(b, z);
  if (c > 0.999999) return v;
  let axis = cross(b, z);
  const s = Math.hypot(axis[0], axis[1], axis[2]);
  if (s < 1e-6) return [v[0], -v[1], -v[2]]; // 真下向き：x 軸で半回転
  axis = [axis[0] / s, axis[1] / s, axis[2] / s];
  const k = axis;
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

/** 端末の xy（x 右・y 上）を、画面の xy（x 右・y 下）に。angle は画面の回転（screen.orientation.angle） */
export function deviceToScreen(dx: number, dy: number, angleDeg: number): [number, number] {
  const a = angleDeg * DEG;
  const mx = dx * Math.cos(a) - dy * Math.sin(a);
  const my = dx * Math.sin(a) + dy * Math.cos(a);
  return [mx, -my];
}

/**
 * いまの「上」と基準の「上」から、画面上で球が転がっていく向きと強さ（0〜1、傾きの sin）を返す。
 * 基準のとおりに持っていれば (0,0)。
 */
export function tiltOnScreen(up: V3, base: V3, angleDeg: number): [number, number] {
  const u = relativeTo(norm(up), base);
  // 下り坂の向き = 「上」の xy 成分の逆
  return deviceToScreen(-u[0], -u[1], angleDeg);
}

export type SensorState = 'idle' | 'waiting' | 'ok' | 'denied' | 'none';

export interface Shake { x: number; y: number; power: number }

type Perm = { requestPermission?: () => Promise<'granted' | 'denied'> };

export class Sensors {
  state: SensorState = 'idle';
  /** 傾きに使っている情報源 */
  source: 'motion' | 'orientation' | '' = '';
  /** 基準の「上」（水平リセットで更新） */
  base: V3 = [0, 0, 1];
  /** いまの「上」（なめらかにしたもの） */
  up: V3 = [0, 0, 1];
  invertTilt = false;
  invertShake = false;
  /** 振りのしきい値（m/s²）。小さいほど弱い振りで反応 */
  shakeThreshold = 12;
  /** 振りのあと、次の振りを受け付けるまで（ミリ秒） */
  cooldownMs = 320;
  onShake: (s: Shake) => void = () => undefined;

  private grav: V3 | null = null;
  private orientUp: V3 | null = null;
  private sign = 1;
  private votes = 0;
  private voteCount = 0;
  private lastMotion = 0;
  private lastOrient = 0;
  private lastT = 0;
  private cooldown = 0;
  private hasCalibrated = false;
  /** 最後にセンサーの値が来た時刻 */
  lastEvent = 0;

  private screenAngle(): number {
    const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
    if (so && typeof so.angle === 'number') return so.angle;
    const w = window as unknown as { orientation?: number };
    return typeof w.orientation === 'number' ? w.orientation : 0;
  }

  /** タップの中で呼ぶ（iOS は許可ダイアログが要る）。許可されたら true */
  async start(): Promise<boolean> {
    if (this.state === 'ok' || this.state === 'waiting') return true;
    const DM = (window as unknown as { DeviceMotionEvent?: Perm }).DeviceMotionEvent;
    const DO = (window as unknown as { DeviceOrientationEvent?: Perm }).DeviceOrientationEvent;
    if (!DM && !DO) {
      this.state = 'none';
      return false;
    }
    // 2 つの許可は同じタップの中で同時に頼む（await をはさむとタップ扱いが切れる端末がある）
    const asks: Promise<string>[] = [];
    if (DM && typeof DM.requestPermission === 'function') asks.push(DM.requestPermission().catch(() => 'denied'));
    if (DO && typeof DO.requestPermission === 'function') asks.push(DO.requestPermission().catch(() => 'denied'));
    if (asks.length) {
      const res = await Promise.all(asks);
      if (!res.some((r) => r === 'granted')) {
        this.state = 'denied';
        return false;
      }
    }
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('deviceorientation', this.onOrientation);
    this.state = 'waiting';
    return true;
  }

  /** いま持っている角度を傾き 0 にする */
  calibrate(): void {
    this.base = [...this.up] as V3;
    this.hasCalibrated = true;
  }

  /** 画面の向きの傾き（x 右・y 下、大きさ 0〜1） */
  tilt(): [number, number] {
    if (this.state !== 'ok') return [0, 0];
    const [x, y] = tiltOnScreen(this.up, this.base, this.screenAngle());
    return this.invertTilt ? [-x, -y] : [x, y];
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta == null || e.gamma == null || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    const now = performance.now();
    this.lastOrient = now;
    this.lastEvent = now;
    this.orientUp = upFromOrientation(e.beta, e.gamma);
    // 加速度が来ない端末は、傾きセンサーだけで傾きを出す
    if (now - this.lastMotion > 400) {
      this.source = 'orientation';
      this.smoothUp(this.orientUp, now);
      this.ready();
    }
  };

  private onMotion = (e: DeviceMotionEvent): void => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null || g.z == null) return;
    if (!Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.z)) return;
    const now = performance.now();
    const dt = this.lastMotion ? Math.min(0.1, (now - this.lastMotion) / 1000) : 1 / 60;
    this.lastMotion = now;
    this.lastEvent = now;
    const raw: V3 = [g.x, g.y, g.z];
    const mag = Math.hypot(raw[0], raw[1], raw[2]);
    // 符号合わせ：静かに持っているときだけ、傾きセンサーの「上」と比べて多数決
    if (this.orientUp && now - this.lastOrient < 200 && this.voteCount < 30 && Math.abs(mag - 9.8) < 1.5) {
      this.votes += dot(norm(raw), this.orientUp) >= 0 ? 1 : -1;
      this.voteCount += 1;
      if (this.voteCount === 30) {
        const s = this.votes >= 0 ? 1 : -1;
        if (s !== this.sign) {
          this.sign = s;
          this.grav = null;
          this.lastT = 0; // 次の値にそのまま合わせる
          this.hasCalibrated = false;
        }
      }
    }
    const sg = this.sign;
    const r: V3 = [raw[0] * sg, raw[1] * sg, raw[2] * sg];
    // 重力：ゆっくり追いかける（振りの影響を減らす）
    const a = 1 - Math.exp(-dt / 0.03);
    if (!this.grav) this.grav = [...r] as V3;
    else for (let i = 0; i < 3; i += 1) this.grav[i] += (r[i] - this.grav[i]) * a;
    this.source = 'motion';
    this.smoothUp(norm(this.grav), now);
    this.ready();

    // 振り：重力を除いた加速度
    let lin: V3;
    const ac = e.acceleration;
    if (ac && ac.x != null && ac.y != null && ac.z != null && Number.isFinite(ac.x + ac.y + ac.z)) lin = [ac.x * sg, ac.y * sg, ac.z * sg];
    else lin = [r[0] - this.grav[0], r[1] - this.grav[1], r[2] - this.grav[2]];
    const [sx, sy] = deviceToScreen(lin[0], lin[1], this.screenAngle());
    const p = Math.hypot(sx, sy);
    if (p > this.shakeThreshold && now > this.cooldown) {
      // 振り始めの向き。止めるときの逆向きの加速を拾わないよう、しばらく受け付けない
      this.cooldown = now + this.cooldownMs;
      const k = this.invertShake ? -1 : 1;
      this.onShake({ x: (sx / p) * k, y: (sy / p) * k, power: p });
    }
  };

  private smoothUp(v: V3, now: number): void {
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    if (!dt) this.up = [...v] as V3;
    else {
      const a = 1 - Math.exp(-dt / 0.02);
      this.up = norm([this.up[0] + (v[0] - this.up[0]) * a, this.up[1] + (v[1] - this.up[1]) * a, this.up[2] + (v[2] - this.up[2]) * a]);
    }
  }

  private ready(): void {
    if (this.state !== 'ok') this.state = 'ok';
    if (!this.hasCalibrated) this.calibrate();
  }

  /** 傾きを手で入れる（PC でのテスト用。矢印キー） */
  fake(up: V3): void {
    this.up = norm(up);
    this.state = 'ok';
    this.source = this.source || 'orientation';
    if (!this.hasCalibrated) this.calibrate();
  }
}
