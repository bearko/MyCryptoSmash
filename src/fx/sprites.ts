// あらかじめ描いておく光の絵（丸いにじみ・光の輪・やわらかい煙）。足し算で重ねて使う（影ぼかしは使わない）。

const cache = new Map<string, HTMLCanvasElement>();

function make(key: string, size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) paint(g, size);
  cache.set(key, c);
  return c;
}

/** 光の輪（ふちだけが明るい） */
export function ringSprite(color: string): HTMLCanvasElement {
  return make(`ring|${color}`, 128, (g, s) => {
    const h = s / 2;
    const gr = g.createRadialGradient(h, h, h * 0.55, h, h, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.62, color);
    gr.addColorStop(0.74, '#ffffff');
    gr.addColorStop(0.86, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

/** やわらかい丸（ほこり・煙。ふつうの重ね方で使う） */
export function softSprite(color: string): HTMLCanvasElement {
  return make(`soft|${color}`, 48, (g, s) => {
    const h = s / 2;
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.8;
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

/** 芯の白い光（火花の頭・電球） */
export function coreSprite(color: string): HTMLCanvasElement {
  return make(`core|${color}`, 48, (g, s) => {
    const h = s / 2;
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.18, '#ffffff');
    gr.addColorStop(0.4, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

/** 斜めの光の帯（ガラスの映りこみ）。横 256・縦 8 の帯を伸ばして使う */
export function sheenSprite(): HTMLCanvasElement {
  return make('sheen', 256, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    gr.addColorStop(0.56, 'rgba(255,255,255,0.06)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}
