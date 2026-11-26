// 端末に合わせる小さな部品：PC の 3 画面（ショップ・ピンボール・ラボを並べる）かどうかと、スマホのキーボードの高さ。
//
// - PC：マウスで操作でき（hover と細かいポインター）、幅が十分なとき。<html> に class="pc" が付く。
//   確認用に URL の ?pc=1（いつも PC）・?pc=0（いつもスマホの並び）で決められる。
// - キーボード：入力欄でキーボードが出ると、見えている高さ（visualViewport）が縮む。
//   隠れた高さを CSS の --kb に入れ、<html> に class="kb" を付ける（入力の箱をその分だけ上へ動かす）。

const PC_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1100px)';
const hasDom = typeof document !== 'undefined' && typeof location !== 'undefined';
const force = hasDom ? new URLSearchParams(location.search).get('pc') : null;
const mq = typeof matchMedia === 'function' ? matchMedia(PC_QUERY) : null;

/** いま PC の 3 画面の並びか */
export function isPc(): boolean {
  if (force === '1') return true;
  if (force === '0') return false;
  return !!mq?.matches;
}

const listeners: ((pc: boolean) => void)[] = [];
/** PC の並びに入った・出たとき（窓の幅を変えたときなど） */
export function onPcChange(fn: (pc: boolean) => void): void { listeners.push(fn); }

function applyPc(): void {
  if (!hasDom) return;
  const pc = isPc();
  document.documentElement.classList.toggle('pc', pc);
  for (const f of listeners) f(pc);
}
mq?.addEventListener?.('change', applyPc);
if (hasDom) document.documentElement.classList.toggle('pc', isPc());

/** マウスがある端末か（マウスオーバーで説明を出す） */
export const canHover = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * キーボードの高さを見張る。Android の Chrome は見えている高さだけが縮み、iPhone の Safari は画面ごと上へずれるので、
 * どちらも「レイアウトの下端 − 見えている下端」を隠れた高さとして測る
 */
export function watchKeyboard(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = (): void => {
    const hidden = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
    // 100px より小さい差は、アドレスバーの出し入れなどとみなす
    const kb = hidden > 100 ? hidden : 0;
    root.style.setProperty('--kb', `${kb}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    root.classList.toggle('kb', kb > 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  // 入力欄から離れたとき、iPhone でずれたままの画面を戻す
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('input, textarea')) window.scrollTo(0, 0); update(); }, 60));
  update();
}

export { applyPc as refreshPc };
