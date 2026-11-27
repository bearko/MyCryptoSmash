// WebGL の後がけ。2D の canvas（台を描いたもの）を 1 枚のテクスチャとして受け取り、もう 1 枚の canvas に
//   ブルーム（明るい所のにじみ）・衝撃波のゆがみ・色ずれ・ビネット・古い台らしい質感（弱い走査線とざらつき）
// を掛けて出す。出す canvas は 2D の canvas の真上に重ね、入力（タッチ）は下の 2D の canvas がそのまま受ける。
//
// WebGL が無い・ソフトウェア描画・コンテキストが失われた・画質が低のときは何もしない（2D のまま見える）。
// 解像度は画面より下げる（高は約 160 万画素・中は約 90 万画素まで。ブルームはその 1/4 の大きさ）。
// はじめの数コマのあとに 1 回だけ、出た絵がまっ黒でないかを確かめ、おかしければ 2D に戻る。
// 確認用の URL：?post=1（ソフトウェア描画でも使う）・?post=0（使わない）。

import { calm, quality } from './quality';
import { postState } from '../game/render-pinball';

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 明るい所だけを取り出す（1/4 の大きさへ）
const FS_BRIGHT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uPx;
void main() {
  vec3 c = texture2D(uTex, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(uTex, vUv + uPx * vec2(1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(uTex, vUv + uPx * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float m = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(0.62, 1.0, m), 1.0);
}`;

// ぼかし（1 方向・9 点）
const FS_BLUR = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227;
  c += (texture2D(uTex, vUv + uDir * 1.385).rgb + texture2D(uTex, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(uTex, vUv + uDir * 3.231).rgb + texture2D(uTex, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

// まとめ：ゆがみ・色ずれ・にじみ・ビネット・走査線・ざらつき・色あせ
const FS_MIX = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uBloom;
uniform vec4 uRink;
uniform vec4 uShock[4];
uniform float uAspect;
uniform float uChroma;
uniform float uBloomK;
uniform float uScan;
uniform float uGrain;
uniform float uVig;
uniform float uFade;
uniform float uTime;
void main() {
  vec2 uv = vUv;
  vec2 rc = uRink.xy + uRink.zw * 0.5;
  // 窓のふちでは、ゆがみを弱める（窓の外の UI をゆらさない）
  vec2 q0 = abs((uv - rc) / uRink.zw);
  float hold = smoothstep(0.5, 0.42, max(q0.x, q0.y));
  // 衝撃波：輪が広がりながら、通った所の絵を外へ押す
  for (int i = 0; i < 4; i++) {
    vec4 s = uShock[i];
    if (s.w > 0.001) {
      vec2 dir = uv - s.xy;
      dir.y *= uAspect;
      float dist = length(dir) + 0.0001;
      float r = s.z * 0.75;
      float k = exp(-pow((dist - r) / 0.045, 2.0)) * s.w * max(0.0, 1.0 - s.z / 0.7);
      vec2 n = dir / dist;
      n.y /= uAspect;
      uv -= n * k * 0.018 * hold;
    }
  }
  vec2 q = (uv - rc) / uRink.zw;
  float inR = step(abs(q.x), 0.5) * step(abs(q.y), 0.5);
  // 色ずれ：窓のまん中から外へ向かって、赤と青がずれる
  vec2 off = (uv - rc) * (0.0009 + uChroma * 0.006) * inR;
  vec3 col;
  col.r = texture2D(uTex, uv + off).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - off).b;
  col += texture2D(uBloom, uv).rgb * uBloomK;
  // ビネット（台を映す窓の中だけ）
  float v = smoothstep(0.78, 0.28, length(q * vec2(1.0, 1.05)));
  col *= mix(1.0, mix(1.0 - uVig, 1.0, v), inR);
  // 走査線（弱く）とざらつき
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(gl_FragCoord.y * 2.0944)) * inR;
  float nz = fract(sin(dot(gl_FragCoord.xy + vec2(uTime * 61.0, uTime * 37.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += (nz - 0.5) * uGrain * inR;
  // 色あせ（TIME UP）
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l) * 0.85, uFade * 0.75 * inR);
  gl_FragColor = vec4(col, 1.0);
}`;

interface Prog { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }
interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export interface Post {
  /** src を読んで、後がけを掛けた絵を出す。使っていないときは false（2D のまま見える） */
  render(src: HTMLCanvasElement): boolean;
  /** いま動いているか */
  readonly on: boolean;
  /** 確認用 */
  info(): string;
}

function compile(gl: WebGLRenderingContext, vs: string, fs: string, names: string[]): Prog | null {
  const mk = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const v = mk(gl.VERTEX_SHADER, vs);
  const f = mk(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!v || !f || !p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  const u: Prog['u'] = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

/** 後がけを用意する。src の真上に、同じ大きさの canvas を重ねる。使えなければ null */
export function createPost(src: HTMLCanvasElement): Post | null {
  if (typeof document === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const force = params.get('post');
  if (force === '0') return null;
  const cv = document.createElement('canvas');
  cv.id = 'cvfx';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none;';
  const opts: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: force !== '1' };
  let gl: WebGLRenderingContext | null = null;
  try { gl = cv.getContext('webgl', opts) as WebGLRenderingContext | null; } catch { gl = null; }
  if (!gl) return null;
  const g = gl;
  const bright = compile(g, VS, FS_BRIGHT, ['uTex', 'uPx']);
  const blur = compile(g, VS, FS_BLUR, ['uTex', 'uDir']);
  const mix = compile(g, VS, FS_MIX, ['uTex', 'uBloom', 'uRink', 'uShock', 'uAspect', 'uChroma', 'uBloomK', 'uScan', 'uGrain', 'uVig', 'uFade', 'uTime']);
  if (!bright || !blur || !mix) return null;
  const quad = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, quad);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  g.disable(g.DEPTH_TEST);
  g.disable(g.BLEND);

  const mkTex = (): WebGLTexture => {
    const t = g.createTexture() as WebGLTexture;
    g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    return t;
  };
  const srcTex = mkTex();
  const targets: Target[] = [];
  const target = (i: number, w: number, h: number): Target => {
    let t = targets[i];
    if (!t) {
      t = { tex: mkTex(), fb: g.createFramebuffer() as WebGLFramebuffer, w: 0, h: 0 };
      targets[i] = t;
    }
    if (t.w !== w || t.h !== h) {
      t.w = w; t.h = h;
      g.bindTexture(g.TEXTURE_2D, t.tex);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
      g.bindFramebuffer(g.FRAMEBUFFER, t.fb);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t.tex, 0);
    }
    return t;
  };

  let lost = false;
  let shown = false;
  let attached = false;
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; cv.style.display = 'none'; shown = false; });
  const shockBuf = new Float32Array(16);
  // 出す画素の上限：高は約 160 万、中は約 90 万（画面より粗く出して、ブラウザに引きのばしてもらう）
  const MAX_PX = [0, 900_000, 1_600_000];
  let frames = 0;
  let checked = false;
  const t0 = performance.now();

  /** 後がけの絵と元の絵を数点くらべる。元が明るいのに後がけがまっ黒なら、おかしい */
  const sane = (src: HTMLCanvasElement, w: number, h: number): boolean => {
    try {
      const s2 = src.getContext('2d');
      if (!s2) return true;
      const px = new Uint8Array(4);
      let srcLit = 0;
      let outLit = 0;
      for (const [u, v] of [[0.5, 0.5], [0.3, 0.35], [0.7, 0.65], [0.5, 0.12], [0.25, 0.8]]) {
        const d = s2.getImageData(Math.floor(src.width * u), Math.floor(src.height * v), 1, 1).data;
        if (d[0] + d[1] + d[2] > 40) srcLit += 1;
        g.readPixels(Math.floor(w * u), Math.floor(h * (1 - v)), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
        if (px[0] + px[1] + px[2] > 12) outLit += 1;
      }
      return !(srcLit >= 2 && outLit === 0);
    } catch { return true; }
  };

  const show = (v: boolean): void => {
    if (v === shown) return;
    shown = v;
    cv.style.display = v ? 'block' : 'none';
  };

  return {
    get on() { return shown; },
    info() { return `${cv.width}x${cv.height} shown=${shown} lost=${lost}`; },
    render(src) {
      const q = quality();
      if (lost || q === 0 || src.width < 8 || src.height < 8) { show(false); return false; }
      if (!attached) { src.insertAdjacentElement('afterend', cv); attached = true; }
      // 出す大きさ（上限つき）
      const sc = Math.min(1, Math.sqrt(MAX_PX[q] / (src.width * src.height)));
      const w = Math.max(8, Math.round(src.width * sc));
      const h = Math.max(8, Math.round(src.height * sc));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const cm = calm();
      const live = performance.now() - postState.at < 250;
      const stage = live ? postState.stage : 2;

      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, srcTex);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, 1);
      try {
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
      } catch { lost = true; show(false); return false; }
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, 0);

      // 明るい所 → 1/4 の大きさ → ぼかし（高では 2 回、広く）
      const bw = Math.max(4, w >> 2);
      const bh = Math.max(4, h >> 2);
      const A = target(0, bw, bh);
      const B = target(1, bw, bh);
      g.viewport(0, 0, bw, bh);
      g.useProgram(bright.p);
      g.bindFramebuffer(g.FRAMEBUFFER, A.fb);
      g.bindTexture(g.TEXTURE_2D, srcTex);
      g.uniform1i(bright.u.uTex, 0);
      g.uniform2f(bright.u.uPx, 1 / w, 1 / h);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.useProgram(blur.p);
      g.uniform1i(blur.u.uTex, 0);
      const passes = q === 2 ? 2 : 1;
      for (let i = 0; i < passes; i += 1) {
        const k = 1 + i * 1.6;
        g.bindFramebuffer(g.FRAMEBUFFER, B.fb);
        g.bindTexture(g.TEXTURE_2D, A.tex);
        g.uniform2f(blur.u.uDir, k / bw, 0);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        g.bindFramebuffer(g.FRAMEBUFFER, A.fb);
        g.bindTexture(g.TEXTURE_2D, B.tex);
        g.uniform2f(blur.u.uDir, 0, k / bh);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      }

      // まとめ
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, w, h);
      g.useProgram(mix.p);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, A.tex);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, srcTex);
      g.uniform1i(mix.u.uTex, 0);
      g.uniform1i(mix.u.uBloom, 1);
      // 窓（上が 0 の座標 → 下が 0 の座標）
      const r = postState.rink;
      if (live) g.uniform4f(mix.u.uRink, r.x, 1 - r.y - r.h, r.w, r.h);
      else g.uniform4f(mix.u.uRink, 0, 0, 1, 1);
      shockBuf.fill(0);
      if (live) {
        postState.shocks.forEach((s, i) => {
          if (i >= 4) return;
          shockBuf[i * 4] = s.u;
          shockBuf[i * 4 + 1] = 1 - s.v;
          shockBuf[i * 4 + 2] = s.age;
          shockBuf[i * 4 + 3] = s.p * (cm ? 0.25 : 1);
        });
      }
      g.uniform4fv(mix.u.uShock, shockBuf);
      g.uniform1f(mix.u.uAspect, h / w);
      g.uniform1f(mix.u.uChroma, live && !cm && q === 2 ? postState.chroma : 0);
      g.uniform1f(mix.u.uBloomK, 0.34 + stage * 0.07);
      g.uniform1f(mix.u.uScan, live ? Math.max(0.02, 0.1 - stage * 0.02) : 0);
      g.uniform1f(mix.u.uGrain, live && q === 2 ? Math.max(0.012, 0.06 - stage * 0.012) : 0);
      g.uniform1f(mix.u.uVig, live ? 0.42 - stage * 0.05 : 0);
      g.uniform1f(mix.u.uFade, live ? postState.fade : 0);
      g.uniform1f(mix.u.uTime, ((performance.now() - t0) / 1000) % 60);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      // 1 回だけ：出た絵がまっ黒でないかを確かめる（端末によっては後がけが正しく出ないことがある。そのときは 2D のまま見せる）
      frames += 1;
      if (!checked && frames >= 4) {
        checked = true;
        if (!sane(src, w, h)) { lost = true; show(false); return false; }
      }
      show(true);
      return true;
    },
  };
}
