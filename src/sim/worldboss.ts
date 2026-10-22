// World bosses: 3 bosses rotating daily, each guarding 3 named legendaries.
import { makeItem, registerNamed, type ItemKind, type Item, type SpecialId, type StatLine } from './gear';
import { tr } from '../i18n';

export type WorldBossId = 'boneGiant' | 'frostQueen' | 'lavaDragon';
export const WORLD_BOSS_IDS: WorldBossId[] = ['boneGiant', 'frostQueen', 'lavaDragon'];

export interface WorldBossDef {
  id: WorldBossId;
  name: string;
  icon: string;
  desc: string;
  theme: number; // arena look (renderer THEMES index)
  hp: number; // at boss level 1, grows like dungeon tiers
  speed: number;
  touchDmg: number;
  shotDmg: number;
  burst: [number, number, number]; // bullets per ring, by phase
  shotEvery: [number, number, number];
  summon: 'grunt' | 'swarm' | 'shooter';
  summonEvery: [number, number, number];
  color: number;
}

export const WORLD_BOSSES: Record<WorldBossId, WorldBossDef> = {
  boneGiant: {
    id: 'boneGiant', name: tr('骸骨巨人', 'Bone Giant'), icon: '💀', desc: tr('血厚、會召喚大量骷髏兵，第三階段狂暴', 'Tanky, summons hordes of Skeletons, enrages in phase 3'), theme: 0,
    hp: 9000, speed: 1.7, touchDmg: 24, shotDmg: 9, burst: [10, 14, 18], shotEvery: [3, 2.6, 2], summon: 'grunt', summonEvery: [9, 6, 4], color: 0xd8d2c0,
  },
  frostQueen: {
    id: 'frostQueen', name: tr('冰霜女王', 'Frost Queen'), icon: '❄️', desc: tr('彈幕好密，會召喚細隻冰精，第二階段開始螺旋彈幕', 'Dense bullet waves, summons ice sprites, spiral barrage from phase 2'), theme: 3,
    hp: 7500, speed: 1.9, touchDmg: 18, shotDmg: 8, burst: [14, 20, 26], shotEvery: [2.6, 2.1, 1.6], summon: 'swarm', summonEvery: [8, 6, 5], color: 0x9fe3ff,
  },
  lavaDragon: {
    id: 'lavaDragon', name: tr('熔岩魔龍', 'Lava Dragon'), icon: '🐉', desc: tr('攻擊最痛，會召喚火焰射手，第三階段火雨', 'Hardest hitter, summons fire archers, fire rain in phase 3'), theme: 4,
    hp: 8500, speed: 1.6, touchDmg: 30, shotDmg: 11, burst: [12, 16, 22], shotEvery: [2.8, 2.3, 1.8], summon: 'shooter', summonEvery: [10, 7, 5], color: 0xff6a2a,
  },
};

/** Today's boss: rotates every day. */
export function todaysBoss(date = new Date()): WorldBossId {
  const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
  return WORLD_BOSS_IDS[((day % 3) + 3) % 3];
}
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const WB_TICKETS = 3;
export const WB_TIME = 180; // seconds
export const WB_MIN_LEVEL = 5;

// ---------- named legendaries ----------
export interface NamedDef { id: string; name: string; boss: WorldBossId; kind: ItemKind; special: SpecialId; bonus: StatLine; lore: string }

export const NAMED: NamedDef[] = [
  { id: 'giantBoneSword', name: tr('巨人骨劍', 'Giant Bone Sword'), boss: 'boneGiant', kind: { weapon: 'sword' }, special: 'giantSlayer', bonus: { stat: 'atk', pct: 0.12 }, lore: tr('用巨人自己嘅脊骨磨成', 'Ground from the giant\'s own spine') },
  { id: 'boneWall', name: tr('骸骨之壁', 'Bone Wall'), boss: 'boneGiant', kind: { weapon: 'shield' }, special: 'thorns', bonus: { stat: 'def', flat: 20 }, lore: tr('撞上去嘅人都會後悔', 'All who charge it regret it') },
  { id: 'deadCrown', name: tr('亡者頭冠', 'Crown of the Dead'), boss: 'boneGiant', kind: { armour: 'helmet' }, special: 'secondWind', bonus: { stat: 'maxHp', pct: 0.12 }, lore: tr('戴上佢，死神都要等一等', 'Wear it and even Death must wait') },
  { id: 'frostWhisper', name: tr('霜語長弓', 'Frostwhisper Longbow'), boss: 'frostQueen', kind: { weapon: 'longbow' }, special: 'piercing', bonus: { stat: 'crit', flat: 0.06 }, lore: tr('箭未到，寒氣先到', 'The chill arrives before the arrow') },
  { id: 'queenOrb', name: tr('冰后之心', 'Heart of the Ice Queen'), boss: 'frostQueen', kind: { weapon: 'orb' }, special: 'manaFlow', bonus: { stat: 'area', pct: 0.12 }, lore: tr('女王唯一冇結冰嘅地方', 'The only part of the Queen not frozen') },
  { id: 'snowBoots', name: tr('雪原之靴', 'Snowfield Boots'), boss: 'frostQueen', kind: { armour: 'shoes' }, special: 'frostGuard', bonus: { stat: 'moveSpeed', pct: 0.06 }, lore: tr('行過嘅地方會結霜', 'Frost forms where you walk') },
  { id: 'dragonBreath', name: tr('龍息大法杖', 'Dragonbreath Greatstaff'), boss: 'lavaDragon', kind: { weapon: 'greatstaff' }, special: 'bigBlast', bonus: { stat: 'atk', pct: 0.12 }, lore: tr('入面仲困住一啖龍息', 'A dragon breath is still trapped inside') },
  { id: 'scaleArmour', name: tr('炎鱗胸甲', 'Flamescale Chest'), boss: 'lavaDragon', kind: { armour: 'chest' }, special: 'critBurst', bonus: { stat: 'def', flat: 15 }, lore: tr('每塊鱗都仲係熱嘅', 'Every scale is still warm') },
  { id: 'dragonFang', name: tr('龍牙短刀', 'Dragonfang Dagger'), boss: 'lavaDragon', kind: { weapon: 'dagger' }, special: 'echoStrike', bonus: { stat: 'critDmg', flat: 0.25 }, lore: tr('斬落去會響兩次', 'Every cut rings twice') },
];
export const namedById = (id: string) => NAMED.find((n) => n.id === id);
for (const n of NAMED) registerNamed(n.id, n.name);

export function makeNamed(def: NamedDef, id: string, level: number, rand: () => number = Math.random): Item {
  const it = makeItem(id, def.kind, 'legendary', level, rand);
  it.main = { stat: it.main.stat, flat: it.main.flat !== undefined ? it.main.flat * 1.1 : undefined, pct: it.main.pct !== undefined ? it.main.pct * 1.1 : undefined };
  it.affixes = [def.bonus, ...it.affixes.filter((a) => a.stat !== def.bonus.stat).slice(0, 2)];
  it.special = def.special;
  it.named = def.id;
  return it;
}

// ---------- rewards ----------
export const namedChance = (level: number) => Math.min(0.25, 0.1 + 0.01 * (level - WB_MIN_LEVEL));

export interface WbReward { coins: number; xp: number; souls: number; runes: number; silver: number; gold: number; namedRoll: boolean }

/** Rewards scale with how much of the boss's HP you took, even if it survived. */
export function wbRewards(level: number, dmgFrac: number, killed: boolean): WbReward {
  const f = Math.max(0, Math.min(1, dmgFrac));
  const lv = 1 + 0.2 * (level - 1);
  return {
    coins: Math.round(400 * lv * f + (killed ? 300 * lv : 0)),
    xp: Math.round(500 * (1 + 0.15 * (level - 1)) * f),
    souls: Math.round(120 * (1 + 0.1 * (level - 1)) * f),
    runes: Math.floor(f * 3) + (killed ? 2 : 0),
    silver: f >= 0.66 ? 2 : f >= 0.33 ? 1 : 0,
    gold: killed ? 1 : 0,
    namedRoll: killed,
  };
}
