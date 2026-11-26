// 呪いの穴（Limited のデメリット）：台のどこかに開く赤い骸骨の穴。本物の球が入ると、落ちたのと同じ扱いになる。
// プレイごとに場所が変わる。置き場所の候補は、壁・部品・仕掛け・通り道のライト・ランプの入口から離れた所だけ（ふさがない・はさまらない）。
// 穴は壁ではなく「入ると吸いこまれる場所」なので、球が引っかかることはない。

import * as T from './table';
import { CANNON, CAPTIVE, CASTLE, CRANE, DINO, DISC, FACE, GACHA, HYPER, MAGNET, MINI, MOAI, POPUPS, UFO } from './toys';

/** 穴の半径（球の中心がこの中に入ると吸いこまれる） */
export const CURSE_R = 15;
/** 部品・仕掛けとのあいだ・壁とのあいだ・ライトとのあいだ・候補どうしのあいだ */
const KEEP = 58;
const WALL = 36;
const LIGHT = 30;
const SPREAD = 64;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
function inside(x: number, y: number): boolean {
  let c = false;
  const o = T.OUTER;
  for (let i = 0, j = o.length - 1; i < o.length; j = i, i += 1) {
    const [xi, yi] = o[i];
    const [xj, yj] = o[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** 離れていないといけない点（部品・仕掛け） */
export function keepOut(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const add = (p: readonly [number, number] | number[], r = KEEP): void => { pts.push([p[0], p[1], r]); };
  for (const b of T.BUMPERS) add([b.x, b.y], b.r + KEEP);
  for (const p of T.TARGET_SLOTS) add(p);
  for (const p of [T.LOCK, T.MYSTERY, T.GATE, ...T.HOLE_SPOTS, ...T.STAR_SPOTS, ...T.SPINNERS]) add(p);
  for (const w of T.WARPS) { add(w.in); add(w.out); }
  for (const b of T.BOOSTERS) add([b.x, b.y]);
  for (const f of T.FLIPPERS) add([f.px, f.py], f.len + KEEP);
  for (const l of T.INLANES) add(l.lamp);
  for (const r of T.RAMPS) add(r.path[0], 70);
  add([HYPER.x, HYPER.y], HYPER.r + KEEP);
  add(HYPER.mouth);
  add([CANNON.x, CANNON.y], 70);
  add([CASTLE.x, CASTLE.bridgeY], 80);
  add([FACE.x, FACE.y], 80);
  add([DISC.x, DISC.y], DISC.r + KEEP);
  add(CRANE.cup, 70);
  add([CAPTIVE.x, CAPTIVE.y], 70);
  for (const p of POPUPS) add(p);
  add([MINI.x, MINI.y], 70);
  add([DINO.x, DINO.y], 80);
  add(DINO.mouth, 70);
  for (const dx of [-UFO.sway, 0, UFO.sway]) add([UFO.x + dx, UFO.y], UFO.r + KEEP);
  add([MAGNET.x, MAGNET.y], MAGNET.r + KEEP);
  for (const x of MOAI.xs) add([x, MOAI.y], 60);
  add(GACHA, 60);
  return pts;
}
/** 置き場所の候補（決まった並び。プレイごとにこの中から選ぶ） */
export const CURSE_SPOTS: [number, number][] = (() => {
  const keep = keepOut();
  const lights = T.LIGHT_PATHS.flatMap((lp) => lp.pts);
  const ramps = T.RAMPS.flatMap((r) => r.path.slice(0, 3));
  const out: [number, number][] = [];
  for (let y = 520; y <= 1040; y += 20) {
    for (let x = 100; x <= 620; x += 20) {
      if (!inside(x, y) || x >= T.SHOOT_X0 - WALL) continue;
      if (T.SEGS.some((s) => segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]) < WALL)) continue;
      if (keep.some(([kx, ky, r]) => Math.hypot(x - kx, y - ky) < r)) continue;
      if (lights.some(([lx, ly]) => Math.hypot(x - lx, y - ly) < LIGHT)) continue;
      if (ramps.some(([rx, ry]) => Math.hypot(x - rx, y - ry) < 50)) continue;
      if (out.some(([ox, oy]) => Math.hypot(x - ox, y - oy) < SPREAD)) continue;
      out.push([x, y]);
    }
  }
  return out;
})();
/** このプレイの穴の場所：候補から n 個（離れたものを） */
export function rollCurse(n: number, rnd: () => number = Math.random): [number, number][] {
  const pool = [...CURSE_SPOTS];
  const out: [number, number][] = [];
  while (out.length < n && pool.length) {
    const p = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (out.every(([x, y]) => Math.hypot(p[0] - x, p[1] - y) > 140) || pool.length === 0) out.push(p);
  }
  return out;
}
