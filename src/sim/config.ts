// All tunable numbers live here. Change these to balance the game.
import { tr } from '../i18n';

export const SIM_DT = 1 / 60;

export const ARENA_HALF = 22; // each map is a square from -22 to +22

export const DUNGEON = {
  maps: 3,
  killQuota: [70, 90, 110], // kills needed on each map before its boss appears
  tierGrowth: 1.2, // enemy HP / damage multiplier per dungeon tier
  // extra enemy strength that builds up over the first tiers (hardcore curve): ×(1 + ramp × (tier − 1)), capped
  ramp: 0.8, rampCap: 8,
  gateEvery: 5, // every 5th tier is a 守關 (gate) dungeon: bosses much tougher, a wall to farm for
  gateBossHp: 2.5, gateBossDmg: 1.3,
  mapGrowth: 1.08, // extra multiplier per map inside one dungeon
  spawnBase: 0.75, // enemies per second at the start of a map
  spawnRamp: 0.025, // extra enemies per second for every second on the map
  spawnMax: 4.5,
  maxAlive: 140,
  timeLimit: 600, // 10 minutes max per dungeon
};

// Class-specific numbers (HP, attack, range...) live in classes.ts
export const PLAYER = {
  pickup: 2.6,
  radius: 0.5,
  autopilotSpeedFactor: 0.85, // autopilot is a bit less efficient than manual play
  takeoverSeconds: 2, // after you let go, autopilot comes back after this long
  hurtInvuln: 0.5,
};

export const CHESTS = {
  minibossSilverChance: 0.3,
};

/** Skill-board materials. Souls: every kill. Runes: bosses, chests (+1 silver, +2 gold) and world bosses. */
export const DROPS = {
  soulPerKill: 1, // x (1 + 10% per dungeon tier)
  soulsMiniboss: 8, runesMiniboss: 2,
  soulsBoss: 25, runesBoss: 3,
};

export type EnemyKind = 'grunt' | 'shooter' | 'swarm' | 'bomber' | 'shield' | 'healer' | 'miniboss' | 'boss' | 'worldboss';
/** Ordinary enemies (drawn with instanced meshes). */
export const SMALL_KINDS = ['grunt', 'shooter', 'swarm', 'bomber', 'shield', 'healer'] as const;
export type SmallKind = (typeof SMALL_KINDS)[number];
export const isBigKind = (k: EnemyKind) => k === 'boss' || k === 'miniboss' || k === 'worldboss';

export interface EnemyDef {
  hp: number;
  speed: number;
  touchDmg: number;
  radius: number;
  xp: number;
  coins: number;
  shotDmg?: number;
  shotEvery?: number;
  keepDistance?: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { hp: 22, speed: 2.7, touchDmg: 6, radius: 0.5, xp: 2, coins: 1 },
  shooter: { hp: 15, speed: 2.3, touchDmg: 4, radius: 0.45, xp: 3, coins: 1, shotDmg: 5, shotEvery: 2.4, keepDistance: 7 },
  swarm: { hp: 6, speed: 4.1, touchDmg: 3, radius: 0.3, xp: 1, coins: 1 },
  // tier 3+: rushes in, lights a short fuse, then blows up (hurts you and your undead)
  bomber: { hp: 10, speed: 3.7, touchDmg: 4, radius: 0.42, xp: 2, coins: 1 },
  // tier 5+: slow and tough, takes 25% less damage
  shield: { hp: 32, speed: 2.0, touchDmg: 6, radius: 0.62, xp: 4, coins: 2 },
  // tier 7+: stays back and heals nearby enemies every 4 s
  healer: { hp: 18, speed: 2.2, touchDmg: 3, radius: 0.45, xp: 4, coins: 2, keepDistance: 8 },
  miniboss: { hp: 480, speed: 2.1, touchDmg: 12, radius: 1.2, xp: 25, coins: 25, shotDmg: 7, shotEvery: 3 },
  boss: { hp: 1800, speed: 1.9, touchDmg: 16, radius: 1.7, xp: 80, coins: 80, shotDmg: 10, shotEvery: 2.4 },
  // world boss numbers come from worldboss.ts; these are only fallbacks
  worldboss: { hp: 9000, speed: 1.7, touchDmg: 24, radius: 2.4, xp: 150, coins: 0, shotDmg: 9, shotEvery: 3 },
};

/** Dungeon biomes change every 5 tiers (renderer theme index + name). */
export const BIOMES = [
  { theme: 0, name: tr('地下墓穴', 'Catacombs'), icon: '🪦' },
  { theme: 1, name: tr('幽暗森林', 'Gloomwood'), icon: '🌲' },
  { theme: 3, name: tr('冰封洞窟', 'Frozen Caverns'), icon: '❄️' },
  { theme: 4, name: tr('熔岩深淵', 'Molten Depths'), icon: '🌋' },
  { theme: 2, name: tr('血之神殿', 'Blood Temple'), icon: '🩸' },
  { theme: 5, name: tr('虛空迴廊', 'Void Halls'), icon: '🌌' },
];
export const biomeFor = (tier: number) => BIOMES[Math.floor((Math.max(1, tier) - 1) / 5) % BIOMES.length];

/** When each new enemy starts showing up, and how often (share of spawns). */
export const ENEMY_UNLOCKS = { bomber: { tier: 3, weight: 0.12 }, shield: { tier: 5, weight: 0.07 }, healer: { tier: 7, weight: 0.05 } };

/** Elite enemies (gold, bigger, one random trait): from tier 4, +1% chance per tier, max 10%. */
export const ELITES = { fromTier: 4, perTier: 0.01, max: 0.1, hp: 3, rewards: 4 };
export type EliteTrait = 'swift' | 'armored' | 'enraged' | 'regen';
export const ELITE_TRAITS: EliteTrait[] = ['swift', 'armored', 'enraged', 'regen'];

export const LEVEL = {
  xpFor: (lv: number) => 8 + lv * 7, // XP needed to go from lv to lv+1 inside a run
};

export const ACCOUNT = {
  xpFor: (lv: number) => 60 + lv * 50, // permanent character level
};

export const SHOP = {
  hp: { label: tr('永久 HP +5%', 'Permanent HP +5%'), base: 80, growth: 1.4, pct: 0.05 },
  atk: { label: tr('永久攻擊 +5%', 'Permanent ATK +5%'), base: 80, growth: 1.4, pct: 0.05 },
  speed: { label: tr('永久移速 +3%', 'Permanent Move Speed +3%'), base: 100, growth: 1.5, pct: 0.03 },
};
export type ShopKey = keyof typeof SHOP;

export const OFFLINE = {
  maxHours: 8,
  minMinutes: 5, // shorter breaks give nothing
  coinsPerMinute: 3, // at dungeon tier 1, +20% per tier cleared
  xpPerMinute: 4, // at dungeon tier 1, +15% per tier cleared
  soulsPerMinute: 1, // at dungeon tier 1, +10% per tier cleared
};
