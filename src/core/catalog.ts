import raw from '../generated/catalog.json';

export type ItemKind = 'atk' | 'gum' | 'magnet' | 'rush' | 'wave' | 'giant';
export interface Hero { id: number; name: string; rarity: number; phy: number; int: number; agi: number; img: string }
export interface Ext { id: number; name: string; rarity: number; kind: ItemKind; img: string }
export interface EnemyArt { id: number; name: string; img: string }

export const cat = raw as unknown as {
  heroes: Hero[];
  exts: Ext[];
  enemySets: EnemyArt[][];
  raids: EnemyArt[];
  shadows: EnemyArt[];
  bgs: string[];
  fx: Record<'hit' | 'blast' | 'buff', string>;
  icons: Record<'gum' | 'ce' | 'phy' | 'int' | 'agi', string>;
  bgm: Record<'field' | 'boss', string>;
  se: Record<string, string>;
};

export const RARITY_NAME = ['', 'コモン', 'アンコモン', 'レア', 'エピック', 'レジェンダリー'];
export const RARITY_COLOR = ['#ffffff', '#5aa9ff', '#4fd67a', '#ffd23f', '#ff8f2e', '#ff4f5e'];

export const ITEM_LABEL: Record<ItemKind, string> = {
  atk: '攻撃力 ×2',
  gum: 'GUM ×2',
  magnet: '強力磁石',
  rush: '加速',
  wave: '衝撃波',
  giant: '巨大化',
};
export const ITEM_COLOR: Record<ItemKind, string> = {
  atk: '#ff5f4f', gum: '#ffd23f', magnet: '#c08bff', rush: '#3fd0ff', wave: '#6dffb0', giant: '#ff9a3d',
};

export const heroById = (id: number): Hero => cat.heroes.find((h) => h.id === id) ?? cat.heroes[0];
