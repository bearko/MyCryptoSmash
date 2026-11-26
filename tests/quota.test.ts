import { describe, expect, it } from 'vitest';
import { cat } from '../src/core/catalog';
import { RARITY_PTS } from '../src/game/stack';
import { freshSave, loadSave, migrateParts, type Save } from '../src/core/save';
import { PART_TOYS, TUTORIAL_PARTS, buyToy, clownOf, restockToys, rollToyShop, toysUnlocked } from '../src/game/toys';
import {
  EXT_SLOTS_START, HERO_SLOTS_START, QUOTAS, QUOTA_PLAYS, SLOTS_MAX, buySlot, canPlay, deliver, extPrice, extSell, limitedCards,
  TUTORIAL_QUOTA, payReroll, skipTutorial, quotaAmount, quotaEmblems, quotaReward, quotaStatus, rerollCost, resetChallenge, startPlay, tutorialState,
} from '../src/game/quota';

/** チュートリアル（ノルマ 0）を終えて、ノルマ 1 にいるセーブ */
const fresh = (): Save => { const s = freshSave(cat.heroes[0].id); s.quota.n = 1; s.quota.guide = false; s.tutorialDone = true; return s; };

describe('挑戦のサイクル（ノルマ）', () => {
  it('本編は 10 ノルマ。納品額は 200 から毎回 4 倍', () => {
    expect(QUOTAS).toBe(10);
    expect(quotaAmount(1)).toBe(200);
    expect(quotaAmount(2)).toBe(800);
    expect(quotaAmount(3)).toBe(3200);
    expect(quotaAmount(10)).toBe(200 * 4 ** 9);
  });
  it('新しいセーブ：チュートリアルのノルマ 0（案内つき）・3 プレイ・エンブレム 0・台は打ち出しとフリッパーだけ・枠はエクステンション 3 とヒーロー 1', () => {
    const s = freshSave(cat.heroes[0].id);
    expect(s.quota.n).toBe(0);
    expect(s.quota.guide).toBe(true);
    expect(s.toys).toEqual([]);
    expect(quotaStatus(s.quota, s.gum).left).toBe(QUOTA_PLAYS);
    expect(s.emblems).toBe(0);
    expect(s.extSlots).toBe(EXT_SLOTS_START);
    expect(s.heroSlots).toBe(HERO_SLOTS_START);
    expect(EXT_SLOTS_START).toBe(3);
    expect(HERO_SLOTS_START).toBe(1);
    expect(s.endless).toBe(false);
  });
  it('1 プレイごとにエンブレム +1 で、プレイを 1 つ使う', () => {
    const s = fresh();
    startPlay(s);
    expect(s.emblems).toBe(1);
    expect(s.quota.played).toBe(1);
  });
  it('足りなければ残りプレイを遊ぶ。3 プレイ目のあとで足りなければ GAME OVER', () => {
    const s = fresh();
    for (let i = 0; i < 2; i += 1) startPlay(s);
    s.gum = 150;
    let st = quotaStatus(s.quota, s.gum);
    expect(st.canPay).toBe(false);
    expect(st.left).toBe(1);
    expect(st.over).toBe(false);
    expect(canPlay(s.quota, s.gum)).toBe(true);
    startPlay(s);
    st = quotaStatus(s.quota, s.gum);
    expect(st.over).toBe(true);
    expect(canPlay(s.quota, s.gum)).toBe(false);
    expect(deliver(s)).toBe(null);
  });
  it('3 プレイ目のあと足りていれば、納品するしかない（遊べない）', () => {
    const s = fresh();
    for (let i = 0; i < 3; i += 1) startPlay(s);
    s.gum = 200;
    const st = quotaStatus(s.quota, s.gum);
    expect(st.mustPay).toBe(true);
    expect(canPlay(s.quota, s.gum)).toBe(false);
  });
  it('納品：手持ちからノルマ額を引き、次のノルマへ。達成 +8、余らせたプレイ 1 つにつき +2 のエンブレム', () => {
    const s = fresh();
    startPlay(s);
    s.gum = 500;
    const r = deliver(s);
    expect(r).toEqual({ emblems: 8 + 2 * 2, spare: 2, need: 200, final: false, ending: false, tutorial: false, gift: 0 });
    expect(s.gum).toBe(300);
    expect(s.emblems).toBe(1 + 12);
    expect(s.quota.n).toBe(2);
    expect(s.quota.played).toBe(0);
    expect(s.quota.picks).toBe(1);
    // 納品の報酬は 8 ＋ 2 ×（ノルマ番号 − 1）（部品を買い足すようになったぶん、前の 5 から上げた）。チュートリアルは 8
    expect(quotaEmblems(0, 1)).toBe(8);
    expect(quotaReward(0)).toBe(8);
    expect(quotaReward(1)).toBe(8);
    expect(quotaReward(5)).toBe(16);
    expect(quotaReward(10)).toBe(26);
    expect(quotaEmblems(1, 4)).toBe(14 + 2);
    const t = fresh();
    t.quota.n = 10;
    t.quota.played = 3;
    t.gum = quotaAmount(10);
    expect(deliver(t)?.emblems).toBe(26);
    // 早く納めると Limited の候補も増える
    expect(limitedCards(s.quota)).toBe(3 + 2);
  });
  it('足りているのに納めず、残りのプレイを遊んでもよい', () => {
    const s = fresh();
    startPlay(s);
    s.gum = 1000;
    const st = quotaStatus(s.quota, s.gum);
    expect(st.canPay).toBe(true);
    expect(st.mustPay).toBe(false);
    expect(canPlay(s.quota, s.gum)).toBe(true);
  });
  it('取引の「もう 1 つ」は、次に納めたときの Limited に足される', () => {
    const s = fresh();
    s.quota.extra = 1;
    startPlay(s);
    s.gum = 200;
    deliver(s);
    expect(s.quota.picks).toBe(2);
    expect(s.quota.extra).toBe(0);
  });
  it('ノルマ 10 を納めたとき、ピエロがジョーカーでなければ通常のエンディング。エンドレスではノルマが 4 倍で続く', () => {
    const s = fresh();
    for (let n = 1; n <= QUOTAS; n += 1) {
      startPlay(s);
      s.gum = quotaAmount(n);
      const r = deliver(s);
      expect(r?.final).toBe(false);
      expect(r?.ending).toBe(n === QUOTAS);
    }
    expect(s.pendingNormal).toBe(true);
    const e = fresh();
    e.endless = true;
    e.escapes = 1;
    for (let n = 1; n <= QUOTAS + 1; n += 1) {
      startPlay(e);
      e.gum = quotaAmount(n);
      expect(deliver(e)?.ending).toBe(false);
    }
    const st = quotaStatus(e.quota, e.gum);
    expect(st.final).toBe(false);
    expect(e.quota.n).toBe(QUOTAS + 2);
    expect(st.need).toBe(200 * 4 ** 11);
    expect(quotaReward(11)).toBe(28);
    expect(canPlay(e.quota, e.gum)).toBe(true);
  });
  it('リロールは GUM で 10 から 2 倍ずつ。回数は挑戦が終わるまで戻らない（ショップと Limited で共有）', () => {
    expect([0, 1, 2, 3].map(rerollCost)).toEqual([10, 20, 40, 80]);
    const s = fresh();
    s.gum = 35;
    expect(payReroll(s)).toBe(true);
    expect(payReroll(s)).toBe(true);
    expect(s.gum).toBe(5);
    expect(payReroll(s)).toBe(false);
    expect(s.quota.rerolls).toBe(2);
    // ノルマをまたいでも戻らない
    s.gum = 200;
    startPlay(s);
    deliver(s);
    expect(s.quota.rerolls).toBe(2);
  });
  it('エクステンションはエンブレムで ★1〜★5 ＝ 3・7・12・22・50（点あたりの値段がレアリティとともに上がる）。売値は半分（切り捨て）', () => {
    expect([1, 2, 3, 4, 5].map(extPrice)).toEqual([3, 7, 12, 22, 50]);
    expect([1, 2, 3, 4, 5].map(extSell)).toEqual([1, 3, 6, 11, 25]);
    const per = [1, 2, 3, 4, 5].map((r) => extPrice(r) / RARITY_PTS[r - 1]);
    for (let i = 1; i < 5; i += 1) expect(per[i]).toBeGreaterThan(per[i - 1]);
  });
  it('枠はエンブレムで広げる（エクステンション 6・ヒーロー 8。どちらも 5 まで）', () => {
    const s = fresh();
    s.emblems = 5;
    expect(buySlot(s, 'ext')).toBe(false);
    s.emblems = 100;
    expect(buySlot(s, 'ext')).toBe(true);
    expect(s.emblems).toBe(94);
    expect(buySlot(s, 'hero')).toBe(true);
    expect(s.emblems).toBe(86);
    while (buySlot(s, 'ext')) { /* 上限まで */ }
    while (buySlot(s, 'hero')) { /* 上限まで */ }
    expect(s.extSlots).toBe(SLOTS_MAX);
    expect(s.heroSlots).toBe(SLOTS_MAX);
  });
  it('GAME OVER：挑戦の進みを失い、スキルツリー・設定・図鑑の記録は残る', () => {
    const s = fresh();
    s.gum = 999;
    s.emblems = 12;
    s.equip = [cat.exts[0].id];
    s.stack = { [cat.exts[0].id % 1000]: { p: 1, paid: 3 } };
    s.quota.mallet = 6;
    s.exts = [cat.exts[0].id];
    s.limited = [5501];
    s.extSlots = 5;
    s.heroSlots = 3;
    s.shop = [cat.exts[1].id];
    s.pinDeepest = 7;
    s.pinRecord = 7;
    s.quota.n = 4;
    s.quota.rerolls = 5;
    s.up = { r_pow: 3 };
    s.settings.mute = true;
    resetChallenge(s);
    expect(s.gum).toBe(0);
    expect(s.emblems).toBe(0);
    expect(s.equip).toEqual([]);
    expect(s.stack).toEqual({});
    expect(s.quota.mallet ?? 1).toBe(1);
    expect(s.limited).toEqual([]);
    expect(s.extSlots).toBe(3);
    expect(s.heroSlots).toBe(1);
    expect(s.shop).toEqual([]);
    expect(s.pinDeepest).toBe(1);
    // 挑戦はチュートリアルのノルマ 0 から（2 回目からは案内なし）
    expect(s.quota.n).toBe(0);
    expect(s.quota.guide).toBe(false);
    expect(s.quota.rerolls).toBe(0);
    // 残るもの
    expect(s.up).toEqual({ r_pow: 3 });
    expect(s.settings.mute).toBe(true);
    expect(s.exts).toEqual([cat.exts[0].id]);
    expect(s.pinRecord).toBe(7);
  });
  it('ノルマをまたぐだけなら何も消えない', () => {
    const s = fresh();
    s.equip = [cat.exts[0].id];
    s.quota.mallet = 3;
    s.limited = [5501];
    s.extSlots = 4;
    startPlay(s);
    s.gum = 200;
    deliver(s);
    expect(s.equip).toEqual([cat.exts[0].id]);
    expect(s.quota.mallet).toBe(3);
    expect(s.limited).toEqual([5501]);
    expect(s.extSlots).toBe(4);
  });
});

describe('チュートリアル（ノルマ 0）', () => {
  /** n プレイ目を遊んで gum だけ稼いだ */
  const play = (s: Save, gum: number): void => { startPlay(s); s.gum += gum; restockToys(s, true); };
  it('納品額は 50・3 プレイ。1 プレイごとにエンブレム +1', () => {
    expect(TUTORIAL_QUOTA).toBe(50);
    expect(quotaAmount(0)).toBe(50);
    const s = freshSave(cat.heroes[0].id);
    expect(quotaStatus(s.quota, s.gum)).toMatchObject({ need: 50, left: 3, canPay: false, over: false });
    startPlay(s);
    expect(s.emblems).toBe(1);
  });
  it('はじめての挑戦：1 プレイ目のあとは③三角のばねだけ、2 プレイ目のあとは④内側の通路だけが並び（各 1 エンブレム）、3 プレイ目のあとに納め、ごほうびで⑦丸いばねを買う', () => {
    const s = freshSave(cat.heroes[0].id);
    restockToys(s);
    expect(s.toyShop).toEqual([]);
    expect(tutorialState(s)).toMatchObject({ active: true, guided: true, step: 0, next: null, key: 'launch', shopLocked: false });
    for (let k = 0; k < 2; k += 1) {
      play(s, 20);
      const st = tutorialState(s);
      expect(st.next).toBe(TUTORIAL_PARTS[k]);
      expect(st.key).toBe(TUTORIAL_PARTS[k]);
      expect(st.shopLocked).toBe(true);
      expect(s.toyShop).toEqual([TUTORIAL_PARTS[k]]);
      expect(s.emblems).toBe(1);
      expect(buyToy(s, TUTORIAL_PARTS[k])).toBe(true);
      expect(s.emblems).toBe(0);
      expect(s.toyShop).toEqual([]);
      expect(tutorialState(s).key).toBe('again');
    }
    expect(s.toys).toEqual(['sling', 'inlane']);
    // 3 プレイ目のあと：⑦はまだ並ばず、入金口へ
    play(s, 20);
    expect(s.toyShop).toEqual([]);
    expect(tutorialState(s)).toMatchObject({ key: 'deposit', next: null, shopLocked: false });
    const st = quotaStatus(s.quota, s.gum);
    expect(st).toMatchObject({ canPay: true, mustPay: true, over: false });
    // 納める（余った GUM を持って本当のノルマ 1 へ。ノルマの報酬のエンブレム。Limited は選ばない）
    const r = deliver(s)!;
    expect(r).toMatchObject({ tutorial: true, gift: 0, need: 50, emblems: quotaReward(0), final: false, ending: false });
    expect(quotaReward(0)).toBe(8);
    expect(s.gum).toBe(10);
    expect(s.emblems).toBe(1 + 8);
    expect(s.quota.n).toBe(1);
    expect(s.quota.played).toBe(0);
    expect(s.quota.picks).toBe(0);
    expect(s.tutorialDone).toBe(true);
    // ごほうびのエンブレムで⑦丸いばね（ショップの最上段にかならず並ぶ。ほかの買い物は止める）
    restockToys(s, true);
    expect(s.toyShop[0]).toBe('bumper');
    expect(tutorialState(s)).toMatchObject({ active: true, guided: true, next: 'bumper', key: 'bumper', shopLocked: true });
    expect(buyToy(s, 'bumper')).toBe(true);
    expect(s.toys).toEqual(['sling', 'inlane', 'bumper']);
    expect(tutorialState(s)).toMatchObject({ active: true, key: 'start', shopLocked: false });
    startPlay(s);
    expect(tutorialState(s)).toMatchObject({ active: false, key: null });
    restockToys(s, true);
    expect(s.toyShop).not.toContain('bumper');
    // ノルマ 1 で入荷する
    expect(toysUnlocked(1).length).toBeGreaterThan(3);
  });
  it('案内をとばす：ふつうのノルマ 0 になり、チュートリアルの部品がまとめて並ぶ', () => {
    const s = freshSave(cat.heroes[0].id);
    play(s, 20);
    skipTutorial(s);
    restockToys(s);
    expect(s.toyShop).toEqual(TUTORIAL_PARTS);
    expect(tutorialState(s)).toMatchObject({ guided: false, key: null, shopLocked: false });
  });
  it('はじめての挑戦：50 GUM に届いていても 3 プレイ遊ぶまでは納められない。部品を買わずに遊んでも、前の部品が先に並ぶ', () => {
    const s = freshSave(cat.heroes[0].id);
    play(s, 60);
    expect(quotaStatus(s.quota, s.gum).canPay).toBe(false);
    play(s, 0);
    expect(s.toyShop).toEqual(['sling']);
    expect(s.emblems).toBe(2);
    expect(buyToy(s, 'inlane')).toBe(false);
    expect(buyToy(s, 'sling')).toBe(true);
    expect(s.toyShop).toEqual(['inlane']);
    expect(buyToy(s, 'inlane')).toBe(true);
    // ⑦は納める前には並ばない
    expect(s.toyShop).toEqual([]);
  });
  it('3 プレイで 50 に届かなくても GAME OVER にはならず、ピエロが足りない分をおまけして通す', () => {
    const s = freshSave(cat.heroes[0].id);
    for (let k = 0; k < 3; k += 1) play(s, 10);
    const st = quotaStatus(s.quota, s.gum);
    expect(st.over).toBe(false);
    expect(st.canPay).toBe(true);
    const r = deliver(s)!;
    expect(r.gift).toBe(20);
    expect(s.gum).toBe(0);
    expect(s.quota.n).toBe(1);
  });
  it('2 回目からの挑戦：案内はなく、チュートリアルの部品がまとめて並び、50 に届けば早く納めてよい（早いほどエンブレムが多い）', () => {
    const s = freshSave(cat.heroes[0].id);
    s.tutorialDone = true;
    resetChallenge(s);
    expect(s.quota.n).toBe(0);
    expect(s.quota.guide).toBe(false);
    rollToyShop(s);
    expect(s.toyShop).toEqual(TUTORIAL_PARTS);
    expect(tutorialState(s)).toMatchObject({ active: true, guided: false, key: null, shopLocked: false });
    play(s, 70);
    const st = quotaStatus(s.quota, s.gum);
    expect(st.canPay).toBe(true);
    expect(st.mustPay).toBe(false);
    const r = deliver(s)!;
    expect(r.emblems).toBe(quotaEmblems(2, 0));
    expect(s.gum).toBe(20);
    expect(tutorialState(s).key).toBe(null);
  });
  it('前の版の挑戦の途中のセーブ：前の台にあった部品を 1 回だけ足す（台がいきなり空にならない）', () => {
    const s = freshSave(cat.heroes[0].id);
    s.partsV = 0;
    s.quota.n = 3;
    s.runs = 12;
    s.toys = ['popup'];
    migrateParts(s);
    expect(s.toys).toEqual(expect.arrayContaining([...PART_TOYS, 'popup']));
    expect(s.tutorialDone).toBe(true);
    expect(clownOf(s)).toBeGreaterThan(0);
    const n = s.toys.length;
    migrateParts(s);
    expect(s.toys.length).toBe(n);
    // まだ遊んでいない前の版のセーブは、チュートリアルから
    const t = freshSave(cat.heroes[0].id);
    t.partsV = 0;
    t.quota.n = 1;
    migrateParts(t);
    expect(t.quota.n).toBe(0);
    expect(t.quota.guide).toBe(true);
    expect(t.toys).toEqual([]);
    expect(typeof loadSave).toBe('function');
  });
});
