// Stat rule from the plan: (base + flat) × (1 + all "+%" added together) × (all "×" multiplied together)
import { tr } from '../i18n';

export interface Stat {
  base: number;
  flat: number;
  pct: number;
  mult: number;
}

export const stat = (base: number): Stat => ({ base, flat: 0, pct: 0, mult: 1 });

export const value = (s: Stat): number => (s.base + s.flat) * (1 + s.pct) * s.mult;

/** The 9 stats from the plan, plus pickup range and regen. */
export const STAT_KEYS = ['maxHp', 'atk', 'def', 'atkSpeed', 'moveSpeed', 'crit', 'critDmg', 'range', 'area', 'pickup', 'regen', 'summon', 'summonCd'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_NAMES: Record<StatKey, string> = {
  maxHp: 'HP', atk: tr('攻擊', 'ATK'), def: tr('防禦', 'DEF'), atkSpeed: tr('攻速', 'Attack Speed'), moveSpeed: tr('移速', 'Move Speed'), crit: tr('暴擊率', 'Crit Rate'),
  critDmg: tr('暴擊傷害', 'Crit Damage'), range: tr('射程', 'Range'), area: tr('範圍', 'Area'), pickup: tr('撿取範圍', 'Pickup'), regen: tr('回復', 'Regen'), summon: tr('亡靈強度', 'Undead Power'), summonCd: tr('召喚冷卻', 'Summon Cooldown'),
};

export type PlayerStats = Record<StatKey, Stat> & {
  multishot: number; // archer: arrows, mage: fireballs, warrior: extra swings
  pierce: number;
  minions: number; // extra skeletons you can have at once
};

/** Bonuses from outside a run: character level, shop, gear. */
export interface BonusPart { flat?: number; pct?: number; mult?: number }
export type StatBonus = Partial<Record<StatKey, BonusPart>>;

export function addBonus(into: StatBonus, key: StatKey, b: BonusPart): void {
  const cur = into[key] ?? (into[key] = {});
  if (b.flat) cur.flat = (cur.flat ?? 0) + b.flat;
  if (b.pct) cur.pct = (cur.pct ?? 0) + b.pct;
  if (b.mult) cur.mult = (cur.mult ?? 1) * b.mult;
}

export function mergeBonus(into: StatBonus, from: StatBonus): StatBonus {
  for (const k of STAT_KEYS) if (from[k]) addBonus(into, k, from[k]!);
  return into;
}

export function applyBonus(stats: PlayerStats, bonus: StatBonus): void {
  for (const k of STAT_KEYS) {
    const b = bonus[k];
    if (!b) continue;
    stats[k].flat += b.flat ?? 0;
    stats[k].pct += b.pct ?? 0;
    stats[k].mult *= b.mult ?? 1;
  }
}

/** Damage taken is multiplied by this. 100 DEF = half damage. */
export const defMultiplier = (def: number) => 100 / (100 + Math.max(0, def));
