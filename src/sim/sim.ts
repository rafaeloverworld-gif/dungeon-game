// Game simulation. Pure logic: no Three.js, no DOM.
// The renderer only reads this state, so later a "host" phone can run it for co-op.
import type { UniqueId } from './skills';
import { ARENA_HALF, biomeFor, tierPower, CHESTS, DROPS, DUNGEON, ELITE_TRAITS, ELITES, ENEMIES, ENEMY_UNLOCKS, isBigKind, LEVEL, PLAYER, SIM_DT, type EliteTrait, type EnemyKind } from './config';
import { CARDS, type Card } from './cards';
import { applyBonus, defMultiplier, stat, value, type PlayerStats, type StatBonus } from './stats';
import { ATTACK_STYLES, CLASSES, type ArrowType, type AttackStyle, type NecroMode, type SpellType, type ClassDef, type ClassId } from './classes';
import { tr } from '../i18n';
import { autopilotDirection } from './autopilot';
import { mixFor, type AwakenedDef } from './awakening';
import { AUTO_SKILLS, type AutoSkillId, type SkillEffects } from './skills';
import { mergeBonus } from './stats';
import { updateAbilities } from './abilities';
import { ultOnHit, newUltRun, ULT, ultOnHurt, updateUltimates, MINION_PROC, PROC_ULTS, type UltId, type UltRun } from './ultimates';
import { activeCombos, COMBO_EXTRA, isMax, MAX_POWER, MAX_STACK, attackFor, type BoneCombo, type ProcId, type SpecialId, type WeaponType } from './gear';
import { WB_TIME, WORLD_BOSSES, type WorldBossDef, type WorldBossId } from './worldboss';

export interface Vec2 { x: number; z: number }

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; z: number;
  hp: number; maxHp: number;
  speed: number; touchDmg: number; shotDmg: number;
  radius: number;
  shotTimer: number;
  summonTimer: number;
  burstToggle: boolean;
  hitFlash: number;
  strafe: number;
  slowTimer: number;
  slowMult: number; // speed multiplier while slowed
  markTimer: number; // 獵人標記: takes extra damage
  tagged?: boolean; // already hit once (獵人本能)
  elite?: EliteTrait; // elite enemy (gold, bigger)
  fuse?: number; // bomber: seconds until it explodes (set once it's close)
  healTimer?: number; // healer
  patternTimer?: number; // bosses: time to the next telegraphed attack
  chrono?: number; // inside 時之結界 (takes more damage)
  dashT?: number; dashWind?: number; dashVx?: number; dashVz?: number; // mini boss charge (wind-up, then dash)
  elem?: Elem; elemT?: number; // 元素: the element on it (a different one makes a reaction)
  reactCd?: number; // short wait between reactions on the same enemy
  vulnT?: number; // 超導: takes +40% damage while > 0
}

/** 元素: fire, frost and lightning stick to enemies; a second, different element sets off a reaction. */
export type Elem = 'fire' | 'frost' | 'shock' | 'poison';
export const ELEM_TIME = 4;
export const VULN = 0.4;
/** 無盡模式: seconds per wave. */
export const ENDLESS_WAVE = 30;
/** 多重箭袋: every extra arrow type used at once multiplies arrow damage by this. */
export const MIX_PENALTY = 0.75;
/** 專精: HP and ATK per class level while you stay a single class. */
export const MASTERY_STAT = 0.015;
/** 極·神射: each extra arrow type only costs this. */
export const MIX_PENALTY_MAX = 0.88;

/** A telegraphed attack: a red warning on the floor that hits when the timer runs out. */
export interface Warning { x: number; z: number; r: number; timer: number; max: number; dmg: number; line?: { x2: number; z2: number; w: number } }

export interface Projectile {
  x: number; z: number; vx: number; vz: number;
  dmg: number; crit: boolean;
  fromPlayer: boolean;
  life: number; pierce: number; radius: number;
  hit: number[];
  blast?: number; // fireball: explodes with this radius
  shadow?: boolean; // necromancer bolt (drawn purple)
  minion?: boolean; // fired by an undead ally (no weapon procs)
  slow?: number; // slows what it hits (speed multiplier for 2 s)
  fx?: FxKind; // blast colour (default fire)
  ap?: boolean; // armour piercing: ignores shield / armored reduction
  knock?: number; // pushes small enemies back along its flight
  javelin?: boolean; // drawn as a javelin
  meteor?: boolean; // drawn as a big meteor (explodes like a fireball)
  shard?: boolean; // ice shard
  owner?: Sim; // co-op: the hero who fired it (damage, procs and kills are theirs)
  elem?: Elem; // leaves this element on what it hits
  hitBlast?: number; // 多重箭袋 with 爆裂箭: a small blast on every hit (the arrow keeps piercing)
  src?: DmgSrc; // counted as this source (default: your attack)
  homing?: boolean; // 追蹤箭: steers towards an enemy; after piercing one, turns to the next
  seek?: number; // id of the enemy it is chasing
  rehits?: number; // 追蹤箭: times it turned back to hit a Boss again
  reArm?: { id: number; t: number }; // 追蹤箭: can hit this Boss again after t seconds
}

/** Necromancer allies: skeletons from skills, or slain enemies raised as undead (they keep their kind:
 *  grunts hit hard, swarms are fast, shooters fire shadow bolts). Enemies that touch them wear them down. */
export type MinionKind = 'skeleton' | 'grunt' | 'shooter' | 'swarm';
const MINION_KINDS: Record<MinionKind, { hp: number; dmg: number; speed: number; every: number; ranged?: boolean }> = {
  skeleton: { hp: 1, dmg: 1, speed: 5.2, every: 0.9 },
  grunt: { hp: 1.4, dmg: 1.1, speed: 4.6, every: 1.0 },
  swarm: { hp: 0.6, dmg: 0.7, speed: 7, every: 0.6 },
  shooter: { hp: 0.8, dmg: 0.9, speed: 4.8, every: 1.3, ranged: true },
};
export interface Minion {
  id: number; x: number; z: number;
  kind: MinionKind;
  hp: number; maxHp: number;
  life: number; // seconds left
  atkTimer: number;
  power: number; // damage multiplier (big skeletons, 骸骨大軍 buff)
  big: boolean;
  hurtCd: number; // like the player: a short grace after each hit
  hpMult: number; // max HP = your max HP × this (follows your HP during the run)
  poisonCd?: number; // 屍毒: seconds until this one can leave another pool
}

export interface Coin { x: number; z: number; value: number; magnet: boolean; spin: number }
export interface Pillar { x: number; z: number; r: number }

export type FxKind = 'fire' | 'frost' | 'holy' | 'arcane' | 'physical' | 'shadow' | 'heal';

export interface Zone { x: number; z: number; r: number; timer: number; tick: number; dmg: number; kind?: 'poison' | 'fire'; slow?: number; burst?: number; src?: DmgSrc }

/** Where damage came from (the solo DPS meter breaks it down). */
export type DmgSrc = 'attack' | 'undead' | 'poison' | 'ult' | 'react' | 'skill' | 'thorns';

export type Phase = 'playing' | 'levelup' | 'transition' | 'won' | 'dead';

export type SimEvent =
  | { type: 'hit'; x: number; z: number; dmg: number; crit: boolean }
  | { type: 'kill'; x: number; z: number; kind: EnemyKind }
  | { type: 'coin' }
  | { type: 'warn' }
  | { type: 'hurt' }
  | { type: 'swing'; x: number; z: number; angle: number; reach: number; arc: number; fx?: FxKind }
  | { type: 'explode'; x: number; z: number; r: number; fx?: FxKind }
  | { type: 'dash'; x1: number; z1: number; x2: number; z2: number }
  | { type: 'skill'; name: string; icon: string; signature: boolean }
  | { type: 'lastStand' }
  | { type: 'wave'; x: number; z: number; r: number }
  | { type: 'lightning'; pts: number[] }
  | { type: 'react'; x: number; z: number; name: string; fx: FxKind }
  | { type: 'chest'; kind: 'silver' | 'gold' }
  | { type: 'levelup' }
  | { type: 'autoCard'; name: string; icon: string }
  | { type: 'boss'; kind: EnemyKind }
  | { type: 'endlessWave'; wave: number }
  | { type: 'mapClear'; map: number }
  | { type: 'newMap'; map: number }
  | { type: 'won' }
  | { type: 'dead' }
  | { type: 'down'; pid: number } // co-op: a hero fell (a teammate can revive them)
  | { type: 'revive'; pid: number };

export interface RunSetup {
  tier: number;
  classId: ClassId;
  bonus: StatBonus; // from character level, shop and gear
  seed: number;
  autoPickCards: boolean;
  subClassId?: ClassId | null; // second class (awakening)
  subClass2Id?: ClassId | null; // third class (昇華)
  weapons?: { main: WeaponType | null; sub: WeaponType | null; blocked: boolean }; // what is equipped (for the look)
  arrowType?: ArrowType; // bows: which arrows (Gear tab)
  arrowTypes?: ArrowType[]; // 多重箭袋: several arrow types at once (the first is arrowType)
  arrowMax?: boolean; // 極·神射: extra arrow types cost less
  mastery?: number; // 專精: class level when you stay a single class (0 = mixed class)
  spellType?: SpellType; // staffs (fireball attack): which spell (Gear tab)
  spellTypes?: SpellType[]; // 多重法典: spells cast in turn
  spellMax?: boolean; // 極·大魔導: reactions chain to nearby enemies
  necroMode?: NecroMode; // necromancer with a staff / no weapon: shadow bolts or summoner
  skills?: SkillEffects | null; // from the skill trees
  specials?: SpecialId[]; // legendary special affixes on worn gear
  procs?: { id: ProcId; value: number }[]; // weapon / accessory skills on worn gear
  worldBoss?: WorldBossId; // world boss fight instead of a dungeon (tier = boss level)
  endless?: boolean; // 無盡模式: after each floor's final Boss the next floor starts one tier higher, until you fall
  ults?: { id: UltId; level: number }[]; // equipped 終極技
  world?: World; // co-op: join this hero to an existing party's dungeon
}

export interface Input { x: number; z: number; manual: boolean }

/** Everything the heroes of one dungeon share. Solo play is a party of one. */
export interface World {
  heroes: Sim[];
  phase: Phase;
  time: number; // total time in this dungeon
  mapTime: number;
  map: number;
  kills: number;
  bossSpawned: boolean;
  boss: Enemy | null;
  transitionTimer: number;
  deathReason: string;
  enemies: Enemy[];
  projectiles: Projectile[]; // everyone's shots and the enemies' shots
  coins: Coin[];
  pillars: Pillar[];
  warnings: Warning[];
  nextId: number;
  spawnAcc: number;
}
const newWorld = (): World => ({
  heroes: [], phase: 'playing', time: 0, mapTime: 0, map: 0, kills: 0, bossSpawned: false, boss: null, transitionTimer: 0, deathReason: '',
  enemies: [], projectiles: [], coins: [], pillars: [], warnings: [], nextId: 1, spawnAcc: 0,
});
/** Co-op: enemies get this much more HP per extra hero. */
export const COOP_HP_PER_HERO = 0.7;
/** Co-op: seconds a hero has to pick a level-up card before one is picked for them (the game doesn't pause). */
export const COOP_CARD_TIME = 10;
/** Co-op: seconds a teammate must stand next to a fallen hero to revive them, and the HP they come back with. */
export const COOP_REVIVE = { time: 2.5, range: 2.2, hp: 0.3 };

/** Starting stats for a run: class base stats plus level / shop / gear bonuses. */
export function buildStats(classId: ClassId, bonus: StatBonus): PlayerStats {
  const b = CLASSES[classId].base;
  const stats: PlayerStats = {
    maxHp: stat(b.hp), atk: stat(b.atk), def: stat(b.def), atkSpeed: stat(1), moveSpeed: stat(b.moveSpeed),
    crit: stat(b.crit), critDmg: stat(b.critDmg), range: stat(b.range), area: stat(1), pickup: stat(PLAYER.pickup),
    regen: stat(0), summon: stat(1), summonCd: stat(0), multishot: 1, pierce: 0, minions: 0,
  };
  applyBonus(stats, bonus);
  return stats;
}

export class Sim {
  tier: number; // 無盡模式 raises it every floor
  readonly endless: boolean;
  floors = 0; // 無盡模式: waves survived
  wave = 1; // 無盡模式: current wave
  readonly cls: ClassDef;
  readonly awk: AwakenedDef | null;
  readonly weapons: RunSetup['weapons'] | null;
  /** How the player attacks (from the main-hand weapon). */
  readonly attack: AttackStyle;
  readonly arrowType: ArrowType;
  readonly arrowTypes: ArrowType[];
  readonly arrowMax: boolean;
  /** 專精 (single class): class level; abilities at 10 / 25 / 50. */
  readonly mastery: number;
  private unyieldUsed = false; // 戰士 不屈: once per map
  private swingHealT = -9; // 戰士 不屈: last heal from a swing
  private volleyCount = 0; // 弓手 連射
  private masteryT = 0; // 千箭 / 天災 timer
  readonly spellType: SpellType;
  readonly spellTypes: SpellType[];
  readonly spellMax: boolean;
  private chainDepth = 0;
  /** 元素護盾 (Mage): each reaction you set off adds a shield of 3% max HP (up to 15%). */
  elemShield = 0;
  readonly wb: WorldBossDef | null;
  wbDamage = 0; // damage dealt to the world boss
  reactions = 0; // 元素反應 this run
  private arrowRot = 0; // 魔法弓手: next element for an arrow
  /** 魔法弓手: arrows without an element take turns carrying fire, frost and lightning. */
  private magicArrow(el: Elem | undefined): Elem | undefined {
    if (el || !(this.awk?.id === 'archer_mage' || this.awk?.base === 'archer_mage')) return el;
    return (['fire', 'frost', 'shock'] as const)[this.arrowRot++ % 3];
  }
  private spellCasts = 0; // 元素同調: every 2nd staff cast adds a second element
  /** What is dealing damage right now, and the run's damage by source. */
  src: DmgSrc = 'attack';
  dmgBy: Partial<Record<DmgSrc, number>> = {};
  /** Run fn with damage counted as src. */
  withSrc(src: DmgSrc, fn: () => void): void { const prev = this.src; this.src = src; try { fn(); } finally { this.src = prev; } }
  dmgDealt = 0; // all damage this hero (and their undead / ultimates) dealt this run, for the DPS meter
  get timeLimit(): number { return this.wb ? WB_TIME : this.endless ? Infinity : DUNGEON.timeLimit; } // 無盡模式: no time limit, survive as long as you can
  /** 守關 dungeon (every 5th tier): its bosses are much tougher. */
  get isGate(): boolean { return !this.wb && DUNGEON.gateBossHp > 1 && this.tier % DUNGEON.gateEvery === 0; }
  get theme(): number { return this.wb ? this.wb.theme : biomeFor(this.tier).theme; }
  get wbPhase(): number { return !this.boss || !this.wb ? 0 : this.boss.hp > this.boss.maxHp * 0.66 ? 0 : this.boss.hp > this.boss.maxHp * 0.33 ? 1 : 2; }
  /** Shared dungeon state (the same object for every hero in a co-op party). */
  readonly w: World;
  /** This hero's slot in the party (0 = the host / solo player). */
  readonly pid: number;
  get phase(): Phase { return this.w.phase; } set phase(v: Phase) { this.w.phase = v; }
  get time(): number { return this.w.time; } set time(v: number) { this.w.time = v; }
  get mapTime(): number { return this.w.mapTime; } set mapTime(v: number) { this.w.mapTime = v; }
  get map(): number { return this.w.map; } set map(v: number) { this.w.map = v; }
  get kills(): number { return this.w.kills; } set kills(v: number) { this.w.kills = v; }
  get bossSpawned(): boolean { return this.w.bossSpawned; } set bossSpawned(v: boolean) { this.w.bossSpawned = v; }
  get boss(): Enemy | null { return this.w.boss; } set boss(v: Enemy | null) { this.w.boss = v; }
  get transitionTimer(): number { return this.w.transitionTimer; } set transitionTimer(v: number) { this.w.transitionTimer = v; }
  get deathReason(): string { return this.w.deathReason; } set deathReason(v: string) { this.w.deathReason = v; }
  get enemies(): Enemy[] { return this.w.enemies; } set enemies(v: Enemy[]) { this.w.enemies = v; }
  get projectiles(): Projectile[] { return this.w.projectiles; } set projectiles(v: Projectile[]) { this.w.projectiles = v; }
  get coins(): Coin[] { return this.w.coins; } set coins(v: Coin[]) { this.w.coins = v; }
  get pillars(): Pillar[] { return this.w.pillars; } set pillars(v: Pillar[]) { this.w.pillars = v; }
  get warnings(): Warning[] { return this.w.warnings; } set warnings(v: Warning[]) { this.w.warnings = v; }
  private get nextId(): number { return this.w.nextId; } private set nextId(v: number) { this.w.nextId = v; }
  private get spawnAcc(): number { return this.w.spawnAcc; } private set spawnAcc(v: number) { this.w.spawnAcc = v; }
  /** More than one hero in this dungeon. */
  get coop(): boolean { return this.w.heroes.length > 1; }
  /** Has an on-hit ultimate equipped (undead hits can trigger it). */
  get ultProcs(): boolean { return PROC_ULTS.some((u) => this.ult.levels[u]); }
  get heroes(): Sim[] { return this.w.heroes; }
  // co-op only: fallen (waiting for a revive), revive progress, and the level-up card timer
  down = false;
  reviveT = 0;
  picking = false;
  cardTimer = 0;
  /** Damage taken in the last 5 seconds (shown when you die). */
  recentHits: { t: number; src: string; dmg: number }[] = [];

  player = { x: 0, z: 0, hp: 0, facing: 0, attackTimer: 0, invuln: 0, level: 1, xp: 0, autopilot: true, moveX: 0, moveZ: 0 };
  stats: PlayerStats;
  cardsTaken: Record<string, number> = {};
  offeredCards: Card[] = [];
  pendingLevelUps = 0;
  offerId = 0; // changes every time new cards are offered
  autoPickCards: boolean; // player setting: pick level-up cards automatically without pausing
  lastManual = -999;
  clock = 0; // keeps ticking during level-up menus too, used for the takeover timer


  // skills
  autoSkills: { id: AutoSkillId; level: 1 | 2; timer: number }[] = [];
  signature: { cooldown: number; timer: number; dmgMult: number; level: 1 | 2; echo: number } | null = null;
  /** Awakened-board passives. */
  uq: Partial<Record<UniqueId, boolean>> = {};
  private blastDepth = 0;
  sigRequested = false;
  spinTimer = 0; // 劍刃風暴 time left
  spinTick = 0;
  zones: Zone[] = [];
  minions: Minion[] = [];
  minionBuff = 0; // seconds of +50% skeleton damage (骸骨大軍)
  minionBuffMult = 1.5;
  private minionId = 1;
  lastStand: { level: 1 | 2; used: boolean } | null = null;
  healOnKill = 0;
  dodge = 0; // chance to ignore a hit
  resonance = 0; // chance that a hit causes a small explosion
  // legendary specials
  // weapon / accessory skills (values are summed when several items have the same one)
  proc = { double: 0, execute: 0, frenzy: 0, lifesteal: 0, frenzyTimer: 0, lifestealCd: 0 };
  sp = { echo: 0, bossDmg: 0, critBurst: false, frostGuard: false, thorns: false, secondWind: false, secondWindUsed: false, cdMult: 1, boneBurst: false };
  /** Undead traits from gear (stack into combos, e.g. 鐵甲骨法師). */
  ut = { tank: false, ranged: false, caster: false, wraith: false, frenzy: false, lasting: false, edge: false, leech: false, shield: false, poison: false, crown: false };
  /** 骨 combos from worn traits (e.g. 骨弓 + 骨法 = 骨魔導師). */
  combo = new Set<BoneCombo['id']>();
  /** 骨王冠: id of the main crowned undead (0 = none); with more crowns, the next biggest get one too. */
  crownId = 0;
  crownIds = new Set<number>();
  /** Bone combos: extra damage for your undead (all active combos multiply). */
  comboPower = 1;
  /** How many copies of each bone trait you wear (the same trait twice or three times is stronger, like the class system). */
  utn: Partial<Record<SpecialId, number>> = {};
  private leechCd = 0; // 噬魂: at most 5 heals a second
  private soulCd = 0; // 魂王: the uncrowned undead heal at most 10 times a second

  chests = { silver: 0, gold: 0 }; // held until the dungeon is cleared; lost on death
  runCoins = 0; // collected this run
  runSouls = 0; // skill-board materials collected this run (kept even if you die)
  runRunes = 0;
  runCrystals = 0; // 💎 for 終極技
  ult: UltRun;
  runXp = 0; // total XP earned this run (goes to the permanent character)
  events: SimEvent[] = [];

  private rngState: number;

  constructor(setup: RunSetup) {
    this.w = setup.world ?? newWorld();
    this.w.heroes.push(this);
    this.pid = this.w.heroes.length - 1;
    this.tier = setup.tier;
    this.endless = !!setup.endless && !setup.worldBoss;
    this.cls = CLASSES[setup.classId];
    this.awk = mixFor(setup.classId, setup.subClassId, setup.subClass2Id);
    this.weapons = setup.weapons ?? null;
    const wk = this.weapons?.main ? attackFor(this.weapons.main, setup.classId) : null;
    const kind0 = wk ?? this.cls.attack;
    this.attack = ATTACK_STYLES[kind0 === 'shadow' && setup.necroMode === 'summon' ? 'summon' : kind0];
    this.arrowType = setup.arrowType ?? 'normal';
    this.arrowTypes = setup.arrowTypes?.length ? setup.arrowTypes : [this.arrowType];
    this.arrowMax = !!setup.arrowMax;
    this.mastery = !setup.subClassId ? setup.mastery ?? 0 : 0; // 專精: only while you have no second class
    this.spellType = setup.spellType ?? 'fire';
    this.spellTypes = setup.spellTypes?.length ? setup.spellTypes : [this.spellType];
    this.spellMax = !!setup.spellMax;
    this.wb = setup.worldBoss ? WORLD_BOSSES[setup.worldBoss] : null;
    this.autoPickCards = setup.autoPickCards;
    this.ult = newUltRun(setup.ults ?? []);
    this.rngState = setup.seed >>> 0 || 1;
    const fx = setup.skills;
    const bonus = mergeBonus(mergeBonus({}, setup.bonus), fx?.bonus ?? {});
    if (this.awk) mergeBonus(bonus, this.awk.bonus);
    let extraMulti = 0, extraPierce = 0;
    for (const pr of setup.procs ?? []) {
      if (pr.id === 'doubleStrike') this.proc.double = Math.min(0.6, this.proc.double + pr.value / 100);
      else if (pr.id === 'execute') this.proc.execute += pr.value / 100;
      else if (pr.id === 'frenzy') this.proc.frenzy += pr.value / 100;
      else if (pr.id === 'lifesteal') this.proc.lifesteal = Math.min(0.6, this.proc.lifesteal + pr.value / 100);
    }
    for (const sp of setup.specials ?? []) {
      if (sp === 'echoStrike') this.sp.echo = Math.min(0.6, this.sp.echo + 0.25);
      else if (sp === 'bloodEdge') this.healOnKill += 0.01;
      else if (sp === 'giantSlayer') this.sp.bossDmg += 0.3;
      else if (sp === 'extraArrow') extraMulti++;
      else if (sp === 'piercing') extraPierce += 2;
      else if (sp === 'critBurst') this.sp.critBurst = true;
      else if (sp === 'bigBlast') mergeBonus(bonus, { area: { mult: 1.3 } });
      else if (sp === 'manaFlow') this.sp.cdMult *= 0.8;
      else if (sp === 'arcaneEcho') this.resonance += 0.25;
      else if (sp === 'frostGuard') this.sp.frostGuard = true;
      else if (sp === 'thorns') this.sp.thorns = true;
      else if (sp === 'secondWind') this.sp.secondWind = true;
      else if (sp === 'boneBurst') this.sp.boneBurst = true;
      else if (sp === 'utTank') this.ut.tank = true;
      else if (sp === 'utRanged') this.ut.ranged = true;
      else if (sp === 'utCaster') this.ut.caster = true;
      else if (sp === 'utWraith') this.ut.wraith = true;
      else if (sp === 'utFrenzy') this.ut.frenzy = true;
      else if (sp === 'utLasting') this.ut.lasting = true;
      else if (sp === 'utEdge') this.ut.edge = true;
      else if (sp === 'utLeech') this.ut.leech = true;
      else if (sp === 'utShield') this.ut.shield = true;
      else if (sp === 'utPoison') this.ut.poison = true;
      else if (sp === 'utCrown') this.ut.crown = true;
    }
    for (const sp of setup.specials ?? []) this.utn[sp] = Math.min(MAX_STACK, (this.utn[sp] ?? 0) + 1); // at most 4 copies count
    // combos: the strongest one's undead damage counts, each other combo adds +20% (they don't multiply); ×4 = 極 form
    const powers = activeCombos(setup.specials ?? []).map((c) => { this.combo.add(c.id); return (c.power ?? 1) * (isMax(c, setup.specials ?? []) ? MAX_POWER : 1); }).sort((a, b) => b - a);
    if (powers.length) this.comboPower = powers[0] * (1 + COMBO_EXTRA * (powers.length - 1));
    this.stats = buildStats(setup.classId, bonus);
    this.stats.range.base = this.attack.range;
    if (this.mastery > 0) { const k = 1 + MASTERY_STAT * Math.min(50, this.mastery); this.stats.maxHp.base *= k; this.stats.atk.base *= k; } // 專精: HP and ATK +1.5% per class level (up to Lv 50)
    if (this.cls.id === 'archer' && this.mastery >= 10) { this.stats.range.base *= 1.3; this.stats.critDmg.base += 0.3; } // 弓手 鷹眼
    if (this.cls.id === 'necro' && this.mastery >= 50) { this.stats.maxHp.base *= 1.5; this.stats.summon.base *= 1.15; } // 死靈 死亡君主
    if (this.cls.id === 'warrior' && this.mastery >= 10) this.stats.def.base *= 1.3; // 戰士 不屈 also: DEF +30%
    this.stats.multishot += (fx?.multishot ?? 0) + (this.awk?.extraMultishot ?? 0) + extraMulti;
    this.stats.pierce += extraPierce + (fx?.pierce ?? 0);
    this.stats.minions += fx?.minions ?? 0;
    if (fx?.cdr) this.sp.cdMult *= 1 - fx.cdr;
    if (fx?.thorns) this.sp.thorns = true;
    if (fx?.frostArmor) this.sp.frostGuard = true;
    this.dodge = 1 - (1 - (fx?.dodge ?? 0)) * (1 - (this.cls.dodge ?? 0)); // gear / skills and the class's own 迴避 (弓手)
    for (const u of fx?.uniques ?? []) this.uq[u] = true;
    this.healOnKill += (this.cls.healOnKill ?? 0) + (fx?.healOnKill ?? 0);
    for (const sk of fx?.autoSkills ?? []) {
      if (sk.id === 'lastStand') this.lastStand = { level: sk.level, used: false };
      else if (sk.id === 'resonance') this.resonance += sk.level === 2 ? 0.35 : 0.2;
      else this.autoSkills.push({ id: sk.id, level: sk.level, timer: AUTO_SKILLS[sk.id].cooldown[sk.level - 1] * 0.5 * this.sp.cdMult });
    }
    if (this.awk) {
      const summonSig = this.awk.signature.kind === 'boneArmy' || this.awk.signature.kind === 'raiseLegion';
      const cd = this.awk.signature.cooldown * Math.max(0.5, 1 - (fx?.sigCd ?? 0)) * this.sp.cdMult * (summonSig ? this.summonCdMult : 1);
      this.signature = { cooldown: cd, timer: cd * 0.4, dmgMult: 1 + (fx?.sigDmg ?? 0), level: fx?.sigUp ? 2 : 1, echo: (this.awk.echo?.power ?? 0) * (fx?.echoUp ? 1.5 : 1) };
    }
    this.player.hp = value(this.stats.maxHp);
    if (this.pid === 0) {
      this.buildMap();
      if (this.wb) this.spawnWorldBoss();
    } else {
      // co-op partner: start next to the host, and enemies already out get tougher
      this.player.x = this.pid * 2;
      for (const e of this.enemies) { e.hp *= this.coopHpStep; e.maxHp *= this.coopHpStep; }
    }
  }

  /** Enemy HP multiplier for this party's size. */
  get coopHp(): number { return 1 + COOP_HP_PER_HERO * (this.w.heroes.length - 1); }
  /** What existing enemies are multiplied by when this hero joins. */
  private get coopHpStep(): number { return this.coopHp / (1 + COOP_HP_PER_HERO * (this.w.heroes.length - 2)); }

  private spawnWorldBoss(): void {
    const wb = this.wb!;
    const m = tierPower(this.tier);
    const e = this.addEnemy('worldboss', 0, 9);
    e.hp = e.maxHp = wb.hp * m * this.coopHp;
    e.speed = wb.speed;
    e.touchDmg = wb.touchDmg * m;
    e.shotDmg = wb.shotDmg * m;
    e.shotTimer = 2;
    e.summonTimer = wb.summonEvery[0];
    this.boss = e;
    this.bossSpawned = true;
    this.events.push({ type: 'boss', kind: 'worldboss' });
  }

  // ---------- helpers ----------
  rand(): number {
    // mulberry32: same seed = same run, which matters for co-op later
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get maxHp(): number { return value(this.stats.maxHp); }
  get quota(): number { return DUNGEON.killQuota[this.map]; }
  get xpToNext(): number { return LEVEL.xpFor(this.player.level); }
  private get diff(): number {
    const ramp = this.wb ? 1 : Math.min(DUNGEON.rampCap, 1 + DUNGEON.ramp * (this.tier - 1));
    return tierPower(this.tier) * Math.pow(DUNGEON.mapGrowth, this.map) * ramp;
  }
  private get coinValue(): number { return 1 + 0.2 * (this.tier - 1); }

  private buildMap(): void {
    this.pillars = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = (this.rand() * 2 - 1) * (ARENA_HALF - 4);
        const z = (this.rand() * 2 - 1) * (ARENA_HALF - 4);
        const r = 0.6 + this.rand() * 0.5;
        if (Math.hypot(x, z) < 6) continue;
        if (this.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 3)) continue;
        this.pillars.push({ x, z, r });
        break;
      }
    }
  }

  // ---------- main loop ----------
  step(input: Input): void { this.stepParty([input]); }

  /** Advance the whole dungeon one tick. Call it on the first hero; inputs[i] drives hero i. */
  stepParty(inputs: Input[]): void {
    const H = this.w.heroes;
    const dt = SIM_DT;
    const idle: Input = { x: 0, z: 0, manual: false };
    for (let i = 0; i < H.length; i++) {
      const h = H[i], input = inputs[i] ?? idle;
      h.events.length = 0;
      if (this.phase !== 'won' && this.phase !== 'dead') h.clock += dt;
      if (input.manual) h.lastManual = h.clock;
      h.player.autopilot = h.clock - h.lastManual > PLAYER.takeoverSeconds;
    }

    if (this.phase === 'levelup') return; // waiting for the player to pick a card (solo only)
    if (this.phase === 'transition') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this.startNextMap();
      return;
    }
    if (this.phase !== 'playing') return;

    this.time += dt;
    this.mapTime += dt;
    if (this.endless) this.endlessTick();
    if (this.time >= this.timeLimit) {
      this.die('時間到');
      return;
    }

    for (let i = 0; i < H.length; i++) {
      if (H[i].down) continue;
      H[i].updatePlayer(inputs[i] ?? idle, dt);
      if (H.length > 1) H[i].claimShots();
    }
    this.spawn(dt);
    this.updateEnemies(dt);
    this.updateWarnings(dt);
    this.updateProjectiles(dt);
    for (const h of H) if (!h.down) h.updateCoins(dt);

    for (const h of H) {
      if (h.down || h.player.hp > 0) continue;
      if (h.lastStand && !h.lastStand.used) {
        h.lastStand.used = true;
        h.player.hp = h.maxHp * (h.lastStand.level === 2 ? 0.6 : 0.3);
        h.player.invuln = 1.5;
        h.events.push({ type: 'lastStand' });
      } else if (H.length > 1) h.fall();
      else this.die('陣亡');
    }
    if (H.length > 1 && this.phase === 'playing') this.updateCoop(dt);
  }

  /** Co-op: shots fired this tick belong to this hero. */
  private claimShots(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.owner) break; // older shots are already claimed
      if (pr.fromPlayer) pr.owner = this;
    }
  }

  /** Co-op: this hero falls; a teammate standing next to them brings them back. */
  private fall(): void {
    this.down = true;
    this.reviveT = 0;
    this.player.hp = 0;
    this.picking = false;
    for (const h of this.heroes) h.events.push({ type: 'down', pid: this.pid });
  }

  /** Co-op upkeep: level-up card timers, revives, and the party wipe. */
  private updateCoop(dt: number): void {
    const H = this.heroes;
    for (const h of H) {
      if (h.picking) { h.cardTimer -= dt; if (h.cardTimer <= 0) h.chooseCard(h.autoPickIndex()); }
      if (!h.down) continue;
      const helped = H.some((o) => !o.down && Math.hypot(o.player.x - h.player.x, o.player.z - h.player.z) < COOP_REVIVE.range);
      h.reviveT = helped ? h.reviveT + dt : Math.max(0, h.reviveT - dt * 0.5);
      if (h.reviveT >= COOP_REVIVE.time) {
        h.down = false;
        h.reviveT = 0;
        h.player.hp = h.maxHp * COOP_REVIVE.hp;
        h.player.invuln = 1.5;
        for (const o of H) o.events.push({ type: 'revive', pid: h.pid });
      }
    }
    if (H.every((h) => h.down)) this.die('陣亡');
  }

  /** The closest hero still standing (enemies go for them). */
  nearestHero(x: number, z: number): Sim {
    const H = this.heroes;
    if (H.length === 1) return H[0];
    let best = H[0], bd = Infinity;
    for (const h of H) {
      if (h.down) continue;
      const d = Math.hypot(h.player.x - x, h.player.z - z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // ---------- player ----------
  private updatePlayer(input: Input, dt: number): void {
    const p = this.player;

    let dx = 0, dz = 0;
    let speed = value(this.stats.moveSpeed);
    if (p.autopilot) {
      const d = autopilotDirection(this);
      dx = d.x; dz = d.z;
      speed *= PLAYER.autopilotSpeedFactor;
    } else {
      dx = input.x; dz = input.z;
    }
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    p.moveX = dx; p.moveZ = dz;
    p.x += dx * speed * dt;
    p.z += dz * speed * dt;
    this.collideWorld(p, PLAYER.radius);
    if (len > 0.1) p.facing = Math.atan2(dx, dz);

    p.invuln = Math.max(0, p.invuln - dt);
    this.proc.frenzyTimer = Math.max(0, this.proc.frenzyTimer - dt);
    this.proc.lifestealCd = Math.max(0, this.proc.lifestealCd - dt);
    p.hp = Math.min(this.maxHp, p.hp + value(this.stats.regen) * this.maxHp * dt);
    if (this.uq.guardRegen && p.hp < this.maxHp * 0.5) p.hp += this.maxHp * 0.02 * dt; // 神恩

    // auto attack nearest enemy in range
    p.attackTimer -= dt;
    if (p.attackTimer <= 0) {
      const melee = this.attack.kind === 'arc' || this.attack.kind === 'reap';
      const reach = melee ? value(this.stats.range) * Math.sqrt(value(this.stats.area)) : value(this.stats.range);
      const target = this.nearestEnemy(p.x, p.z, reach);
      if (target) {
        const frenzy = this.proc.frenzyTimer > 0 ? 1 + this.proc.frenzy : 1; // 狂風
        p.attackTimer = this.attack.interval / (this.attack.kind === 'fireball' && this.spellType === 'meteor' && this.spellTypes.length === 1 ? 0.65 : 1) / (value(this.stats.atkSpeed) * frenzy * (this.warGod ? 1.5 : 1));
        const base = Math.atan2(target.x - p.x, target.z - p.z);
        p.facing = base;
        const once = (mult: number) => (melee ? this.swing(base, reach, mult) : this.attack.kind === 'summon' ? this.summonAttack(base, mult) : this.shoot(base, mult));
        once(1);
        if (this.cls.id === 'archer' && this.mastery >= 25 && !melee && ++this.volleyCount % 3 === 0) once(1); // 弓手 連射: every 3rd attack fires twice
        if (this.proc.double && this.rand() < this.proc.double) once(1); // 連擊
        if (this.sp.echo && this.rand() < this.sp.echo) once(0.6); // 回響
      } else {
        p.attackTimer = 0.05;
      }
    }
    this.withSrc('skill', () => updateAbilities(this, dt));
    if (this.mastery >= 50) this.withSrc('skill', () => this.masteryTick(dt));
    this.withSrc('undead', () => this.updateMinions(dt));
    this.withSrc('ult', () => updateUltimates(this, dt));
  }

  // ---------- skeletons ----------
  /** 召喚冷卻 (gear affix): shortens summon cooldowns, max -50%. */
  get summonCdMult(): number { return 1 - Math.min(0.5, value(this.stats.summonCd)); }

  /** How many skeletons you can have at once (more can exist briefly from 骸骨大軍 / 亡者軍團). */
  get minionCap(): number {
    const base = this.cls.id === 'necro' || this.awk?.sub === 'necro' || this.awk?.sub2 === 'necro' || this.autoSkills.some((a) => a.id === 'raiseDead') ? 3 : 0;
    return base + (this.attack.kind === 'summon' ? 2 : 0) + this.stats.minions + ((this.awk?.base ?? this.awk?.id) === 'necro_necro' ? 1 : 0) + (this.awk?.id === 'necro_necro_necro' ? 1 : 0) + this.n('utLasting') + (this.combo.has('eternal') ? 3 : 0) + (this.cls.id === 'necro' && this.mastery >= 10 ? 3 : 0); // 專精 屍潮 +3; 不朽骨: +1 Undead per copy (永生骨軍 +3 more)
  }

  /** How much of a hit an undead takes (骨堡壘 -30%, crowned -50%). */
  minionTaken(m: Minion): number { return (this.combo.has('bulwark') ? 0.7 : 1) * (this.crownIds.has(m.id) ? 0.5 : 1) * (this.combo.has('boneGiant') ? 0.6 : 1); }
  /** 屍毒 pools: a new pool on top of an old one just refreshes it, and each hero keeps at most 8
   *  (dozens of overlapping see-through circles made phones lag in long 無盡模式 runs). */
  private addPoisonZone(z: Zone): void {
    const old = this.zones.find((o) => o.kind === 'poison' && o.src === 'poison' && Math.hypot(o.x - z.x, o.z - z.z) < Math.max(o.r, z.r) * 0.7);
    if (old) { old.timer = Math.max(old.timer, z.timer); old.dmg = Math.max(old.dmg, z.dmg); old.r = Math.max(old.r, z.r); return; }
    const mine = this.zones.filter((o) => o.src === 'poison');
    if (mine.length >= 8) { const oldest = mine.reduce((a, b) => (a.timer < b.timer ? a : b)); this.zones.splice(this.zones.indexOf(oldest), 1); }
    this.zones.push(z);
  }
  /** Copies of a bone trait worn (0 if none). */
  private n(t: SpecialId): number { return this.utn[t] ?? 0; }

  /** Raise a skeleton at (x, z). Returns false when at the cap (unless force). */
  summon(x: number, z: number, o: { force?: boolean; power?: number; life?: number; big?: boolean; kind?: MinionKind } = {}): boolean {
    if (!o.force && this.minions.length >= this.minionCap) return false;
    if (this.minions.length >= this.minionCap + 8) return false; // even skills that go past the cap stop here (keeps phones smooth)
    const kind = o.kind ?? 'skeleton';
    const sm = value(this.stats.summon);
    const hpMult = 0.45 * sm * (o.big ? 1.5 : 1) * MINION_KINDS[kind].hp * (1 + this.n('utTank')); // 骨甲: ×2 HP per copy
    const hp = this.maxHp * hpMult;
    this.minions.push({ id: this.minionId++, x, z, kind, hp, maxHp: hp, life: (o.life ?? 25) * (1 + 0.5 * this.n('utLasting')), atkTimer: 0.3, power: o.power ?? 1, big: !!o.big, hurtCd: 0, hpMult });
    this.events.push({ type: 'explode', x, z, r: 0.9, fx: 'shadow' });
    return true;
  }

  private updateMinions(dt: number): void {
    if (!this.minions.length) return;
    const p = this.player;
    const atk = value(this.stats.atk) * value(this.stats.summon);
    const armour = defMultiplier(value(this.stats.def));
    // undead share your stats: HP, attack, attack speed, move speed, armour, thorns, and every in-run bonus
    const atkSpd = value(this.stats.atkSpeed) * (this.proc.frenzyTimer > 0 ? 1 + this.proc.frenzy : 1) * (1 + 0.3 * this.n('utFrenzy')) * (this.combo.has('boneStorm') ? 1.5 : 1); // 狂骨: +30% per copy (骨嵐 ×1.5 more)
    const moveMul = value(this.stats.moveSpeed) / this.cls.base.moveSpeed;
    this.minionBuff = Math.max(0, this.minionBuff - dt);
    this.leechCd = Math.max(0, this.leechCd - dt);
    this.soulCd = Math.max(0, this.soulCd - dt);
    // 骨王冠: the biggest undead (then the oldest) wears the crown
    this.crownId = 0; this.crownIds.clear();
    if (this.ut.crown) {
      // one crown per copy of 骨王冠: the biggest undead (then the oldest) wear them
      const top = this.minions.filter((m) => m.hp > 0).sort((a, b) => b.maxHp - a.maxHp || a.id - b.id).slice(0, this.n('utCrown'));
      for (const m of top) this.crownIds.add(m.id);
      this.crownId = top[0]?.id ?? 0;
    }
    for (const m of this.minions) {
      const crowned = this.crownIds.has(m.id);
      const newMax = this.maxHp * m.hpMult;
      if (Math.abs(newMax - m.maxHp) > 0.5) { m.hp *= newMax / m.maxHp; m.maxHp = newMax; }
      m.life -= dt;
      m.atkTimer -= dt;
      if (m.poisonCd) m.poisonCd -= dt;
      // pick the nearest enemy close to the player (skeletons don't wander off)
      let target: Enemy | null = null, best = 1e9;
      for (const e of this.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - p.x, e.z - p.z) > 11) continue;
        const d = Math.hypot(e.x - m.x, e.z - m.z);
        if (d < best) { best = d; target = e; }
      }
      const def = MINION_KINDS[m.kind];
      const burst = this.sp.boneBurst; // 骨爆戒指: rush in and explode
      const ranged = (def.ranged || this.ut.ranged || this.ut.caster) && !burst; // 骨法: undead become bone mages and cast from range
      const speed = def.speed * moveMul * (burst ? 1.6 : 1) * (1 + 0.6 * this.n('utWraith')) * (this.ut.tank ? 0.85 : 1);
      let tx = p.x + Math.sin(m.id * 2.4) * 1.6, tz = p.z + Math.cos(m.id * 2.4) * 1.6;
      if (target) { tx = target.x; tz = target.z; }
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      const reach = target ? (ranged ? 5 : target.radius + 0.75) : 0.3;
      if (d > reach) { m.x += (dx / d) * Math.min(d - reach, speed * dt); m.z += (dz / d) * Math.min(d - reach, speed * dt); }
      if (burst && target && d <= reach + 0.15) {
        const buff = this.minionBuff > 0 ? this.minionBuffMult : 1;
        const r = (m.big ? 3.8 : 3) * Math.sqrt(value(this.stats.area));
        m.hp = 0;
        if (this.combo.has('endless') && this.rand() < 0.3) this.summon(m.x, m.z, { force: true, life: 12 }); // 不滅骨爆
        // 骨爆: the blast is as big as the undead's max HP (tanky undead hit harder)
        this.explode(m.x, m.z, r * (this.combo.has('chainBurst') ? 1.5 : 1), m.maxHp * (1 + 0.5 * this.n('boneBurst')) * m.power * buff * value(this.stats.summon), false, 'shadow', { noProc: true }); // no ultimate procs, so the blast itself is big
        continue;
      }
      if (target && d <= reach + 0.15 && m.atkTimer <= 0) {
        m.atkTimer = def.every / atkSpd / (crowned && this.combo.has('soulKing') ? 1.5 : 1); // 魂王: the crowned one attacks 50% faster
        const crit = this.rand() < value(this.stats.crit) + (this.combo.has('frenzyEdge') ? 0.15 : 0) + (this.combo.has('boneReaper') ? 0.3 : 0); // 骨刃狂潮 / 骸骨死神
        const buff = this.minionBuff > 0 ? this.minionBuffMult : 1;
        const dmg = atk * 0.45 * def.dmg * def.every / 0.9 * m.power * buff * (m.big ? 1.5 : 1) * (crit ? value(this.stats.critDmg) * (1 + 0.5 * this.n('utEdge')) : 1) * (crowned ? (this.combo.has('boneCourt') ? 3 : 2) : 1) * (this.combo.has('boneGiant') ? 1.3 : 1) * (this.combo.has('grandLich') ? 1.4 : 1) * this.comboPower; // 骨刃 / 骨王冠 / 不死骨巨人 / 骸骨大法師
        if (this.ut.leech && this.leechCd <= 0) { this.leechCd = 0.2; p.hp = Math.min(this.maxHp, p.hp + this.maxHp * 0.004 * this.n('utLeech')); } // 噬魂: 0.4% per copy
        if (this.combo.has('soulKing')) { // 魂王: the crowned one heals 1% every hit; the rest 0.3% (up to 10 a second)
          if (crowned) p.hp = Math.min(this.maxHp, p.hp + this.maxHp * 0.01);
          else if (this.soulCd <= 0) { this.soulCd = 0.1; p.hp = Math.min(this.maxHp, p.hp + this.maxHp * 0.003); }
        }
        if (this.ut.poison && (m.poisonCd ?? 0) <= 0) { // 屍毒 (瘟疫幽魂: bigger, slowing)
          m.poisonCd = 3;
          const plague = this.combo.has('plague');
          this.addPoisonZone({ x: target.x, z: target.z, r: 1.6 * Math.sqrt(value(this.stats.area)) * (plague ? 1.5 : 1) * (this.combo.has('plagueLord') ? 1.5 : 1), timer: 3, tick: 0, dmg: atk * 0.15 * this.n('utPoison') * (plague ? 2 : 1) * this.comboPower, kind: 'poison', slow: plague ? 0.6 : 0.9, src: 'poison' });
        }
        const blast = this.ut.caster ? 1.7 * (this.combo.has('archmage') ? 1.4 : 1) * (this.combo.has('lichKing') ? 1.2 : 1) * (1 + 0.2 * (this.n('utCaster') - 1)) * (this.combo.has('grandLich') ? 1.25 : 1) * Math.sqrt(value(this.stats.area)) : undefined; // 骨法 (骨魔導師 / 骸骨魔導王: bigger blasts)
        const slow = this.ut.wraith ? Math.max(0.3, 0.8 - 0.15 * this.n('utWraith')) : undefined; // 怨靈: stronger slow per copy
        if (ranged) {
          const a0 = Math.atan2(target.x - m.x, target.z - m.z), sp = 14;
          const fan = crowned && this.combo.has('lichKing') ? [-0.4, -0.2, 0, 0.2, 0.4] : this.combo.has('boneVolley') ? [-0.18, 0, 0.18] : [0]; // 骸骨魔導王: the crowned one fires 5; 萬箭骨兵: everyone fires 3
          for (const off of fan) { const a = a0 + off; this.projectiles.push({ x: m.x, z: m.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg, crit, fromPlayer: true, life: 8 / sp, pierce: this.n('utRanged') >= 2 ? 1 : 0, radius: 0.3, hit: [], shadow: true, minion: true, blast, slow }); }
        } else if (blast) {
          this.explode(target.x, target.z, blast, dmg, crit, 'shadow', { noProc: true, slow: slow, slowTime: slow ? 1.5 : undefined });
          if (this.ultProcs && target.hp > 0) ultOnHit(this, target, MINION_PROC);
        } else {
          this.damageEnemy(target, dmg, crit, true);
          if (slow) { target.slowTimer = 1.5; target.slowMult = Math.min(target.slowMult, slow); }
          if (this.ultProcs && target.hp > 0) ultOnHit(this, target, MINION_PROC); // undead can trigger your on-hit ultimates
        }
      }
      // enemies touching an undead hurt it (one hit per 0.5 s, like the player)
      m.hurtCd -= dt;
      if (m.hurtCd <= 0) {
        for (const e of this.enemies) {
          if (e.hp > 0 && Math.hypot(e.x - m.x, e.z - m.z) < e.radius + (m.big ? 0.6 : 0.4)) {
            m.hp -= e.touchDmg * armour * this.minionTaken(m); m.hurtCd = PLAYER.hurtInvuln;
            if (this.sp.thorns) this.withSrc('thorns', () => this.damageEnemy(e, value(this.stats.atk) * 0.4, false, true)); // 荊棘 works for your undead too (weaker: there are many of them)
            break;
          }
        }
      }
    }
    if (this.cls.id === 'necro' && this.mastery >= 25) { // 死靈 不死: a destroyed undead (not one that ran out of time) gets back up 40% of the time
      for (const m of this.minions) if (m.hp <= 0 && m.life > 0 && !this.sp.boneBurst && this.rand() < 0.25) { m.hp = m.maxHp * 0.5; this.events.push({ type: 'explode', x: m.x, z: m.z, r: 0.9, fx: 'shadow' }); }
    }
    this.minions = this.minions.filter((m) => m.hp > 0 && m.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Ask for the signature skill (HUD button). It fires on the next step if it's ready. */
  requestSignature(): void { this.sigRequested = true; }

  rollDamage(): { dmg: number; crit: boolean } {
    const crit = this.rand() < value(this.stats.crit);
    return { dmg: value(this.stats.atk) * (crit ? value(this.stats.critDmg) : 1), crit };
  }

  /** Warrior: hit every enemy inside a cone in front. Extra swings from 連斬 add 60% each. */
  private swing(angle: number, reach: number, mult = 1): void {
    const arc = Math.min(Math.PI * 2, ((this.attack.arcDegrees ?? 140) * Math.PI) / 180 * Math.min(1.6, Math.sqrt(value(this.stats.area))));
    const comboMult = 1 + 0.6 * (this.stats.multishot - 1);
    this.arcHit(angle, reach, arc, comboMult * mult, this.attack.kind === 'reap' ? 'shadow' : undefined);
    if (this.cls.id === 'warrior' && this.mastery >= 50) { // 戰士 劍氣 (專精 Lv 50): every swing also sends a piercing sword wave
      const p = this.player, sp = 16, { dmg, crit } = this.rollDamage();
      this.projectiles.push({ x: p.x, z: p.z, vx: Math.sin(angle) * sp, vz: Math.cos(angle) * sp, dmg: dmg * mult * 1.0, crit, fromPlayer: true, life: 0.55, pierce: 99, radius: 0.7, hit: [], javelin: true, src: 'skill' });
    }
  }

  /** 戰士 戰神 (專精 Lv 25): below half HP, attacks and attack speed ×1.5. */
  get warGod(): boolean { return this.cls.id === 'warrior' && this.mastery >= 25 && this.player.hp < this.maxHp * 0.5; } // 專精 Lv 25

  /** 專精 Lv 50 abilities on a timer: 弓手 千箭 (every 8 s, 24 arrows all around), 法師 天災 (every 10 s, 6 meteors). */
  private masteryTick(dt: number): void {
    this.masteryT -= dt;
    if (this.masteryT > 0) return;
    const p = this.player;
    if (this.cls.id === 'archer') {
      this.masteryT = 8;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, sp = 20, { dmg, crit } = this.rollDamage();
        this.projectiles.push({ x: p.x, z: p.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg: dmg * 1.5, crit, fromPlayer: true, life: value(this.stats.range) / sp + 0.2, pierce: 3, radius: 0.3, hit: [], src: 'skill' });
      }
      this.events.push({ type: 'skill', name: tr('千箭', 'Thousand Arrows'), icon: '🏹', signature: false });
    } else if (this.cls.id === 'mage') {
      this.masteryT = 10;
      const targets = this.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 14).sort(() => this.rand() - 0.5).slice(0, 6);
      for (const e of targets) this.explode(e.x, e.z, 2.6 * Math.sqrt(value(this.stats.area)), value(this.stats.atk) * 4, false, 'fire', { noProc: true, elem: 'fire' });
      if (targets.length) this.events.push({ type: 'skill', name: tr('天災', 'Cataclysm'), icon: '☄️', signature: false });
    } else this.masteryT = 999;
  }

  /** Hit every enemy inside a cone (arc = 2π for a full circle). */
  arcHit(angle: number, reach: number, arc: number, mult: number, fx?: FxKind): void {
    const p = this.player;
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > reach) continue;
      let diff = Math.atan2(dx, dz) - angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (d > e.radius + 0.6 && Math.abs(diff) > arc / 2) continue;
      const { dmg, crit } = this.rollDamage();
      this.damageEnemy(e, dmg * mult, crit);
      hitAny = true;
    }
    // 戰士 不屈 (專精 Lv 10): a swing that connects heals 1% max HP (at most 3 times a second)
    if (hitAny && this.cls.id === 'warrior' && this.mastery >= 10 && this.time - this.swingHealT >= 0.33) { this.swingHealT = this.time; p.hp = Math.min(this.maxHp, p.hp + this.maxHp * 0.01); }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.events.push({ type: 'swing', x: p.x, z: p.z, angle, reach, arc, fx });
  }

  /** Archer arrows and mage fireballs. */
  private shoot(base: number, mult = 1): void {
    const p = this.player;
    const n = this.stats.multishot;
    const isFire = this.attack.kind === 'fireball';
    const isShadow = this.attack.kind === 'shadow';
    if (this.attack.kind === 'javelin') { this.throwJavelins(base, mult); return; }
    const arrow = this.attack.kind === 'arrow' ? this.arrowType : null;
    if (arrow && this.arrowTypes.length > 1) { this.shootMixedArrows(base, mult, this.arrowTypes); return; }
    if (arrow) { this.shootArrows(base, mult, arrow); return; }
    if (isFire && this.spellTypes.length > 1) { // 多重法典: every chosen spell at once, each extra one costs ×0.75 (極·大魔導 ×0.88)
      const pen = (this.spellMax ? 0.88 : 0.75) ** (this.spellTypes.length - 1);
      for (const t of this.spellTypes) { if (t === 'fire') this.castFireballs(base, mult * pen); else this.castSpells(base, mult * pen, t); }
      return;
    }
    if (isFire && this.spellType !== 'fire') { this.castSpells(base, mult, this.spellType); this.echoCast(base, mult); return; }
    const spread = isFire ? 0.3 : isShadow ? 0.22 : 0.14;
    const speed = this.attack.projectileSpeed ?? 18;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      const { dmg: raw, crit } = this.rollDamage();
      const dmg = raw * mult * (isFire ? 1.1 : isShadow ? 1.1 : 1);
      this.projectiles.push({
        x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        dmg, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15,
        pierce: isFire ? 0 : this.stats.pierce + (isShadow ? 1 : 0), radius: isFire ? 0.4 : isShadow ? 0.35 : 0.3, hit: [], shadow: isShadow || undefined,
        blast: isFire ? (this.attack.blastRadius ?? 2) * Math.sqrt(value(this.stats.area)) : undefined, elem: isFire ? 'fire' : undefined,
      });
    }
    if (isFire && this.spellTypes.length === 1) this.echoCast(base, mult);
  }

  /** Plain fireballs (used by 多重法典 when fire is one of the spells). */
  private castFireballs(base: number, mult: number): void {
    const p = this.player, n = this.stats.multishot, speed = this.attack.projectileSpeed ?? 15;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.3;
      const { dmg, crit } = this.rollDamage();
      this.projectiles.push({ x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, dmg: dmg * mult * 1.1, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15, pierce: 0, radius: 0.4, hit: [], blast: (this.attack.blastRadius ?? 2) * Math.sqrt(value(this.stats.area)), elem: 'fire' });
    }
  }

  /** 元素同調 (staffs): every 2nd cast also throws the next element at half power, so the two react on the enemies. */
  private echoCast(base: number, mult: number): void {
    if (++this.spellCasts % 2) return;
    const next: Record<SpellType, SpellType> = { fire: 'frost', frost: 'lightning', lightning: 'fire', meteor: 'frost' };
    const t = next[this.spellType];
    if (t !== 'fire') { this.castSpells(base, mult * 0.5, t); return; }
    const p = this.player, n = this.stats.multishot, speed = this.attack.projectileSpeed ?? 15;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.3;
      const { dmg, crit } = this.rollDamage();
      this.projectiles.push({ x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, dmg: dmg * mult * 0.55, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15, pierce: 0, radius: 0.35, hit: [], blast: (this.attack.blastRadius ?? 2) * 0.8 * Math.sqrt(value(this.stats.area)), elem: 'fire' });
    }
  }

  /** Leave an element on an enemy. A different element already on it reacts:
   *  fire + frost = 蒸發爆炸 (big blast), fire + lightning = 超載 (blast that knocks back),
   *  frost + lightning = 超導 (enemies nearby take +40% damage for 5 s). Mages' reactions hit 50% harder. */
  applyElem(e: Enemy, el: Elem): void {
    if (e.hp <= 0) return;
    if (!e.elem || e.elem === el || !e.elemT) { e.elem = el; e.elemT = ELEM_TIME; return; }
    if (e.reactCd) return;
    const a = e.elem;
    const arch = this.awk?.id === 'mage_mage' || this.awk?.base === 'mage_mage'; // 大法師
    e.elem = undefined; e.elemT = 0; e.reactCd = arch ? 0.2 : 0.4;
    if (this.cls.id === 'mage') { const big = this.mastery >= 25; this.elemShield = Math.min(this.maxHp * (big ? 0.4 : 0.15), this.elemShield + this.maxHp * (big ? 0.05 : 0.03)); } // 元素護盾 (專精 法力護盾: up to 40%)
    if (this.spellMax && this.chainDepth < 2) { // 極·大魔導: the reaction spreads the new element to 3 enemies nearby (they can react too)
      this.chainDepth++;
      const near = this.enemies.filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < 3.5).slice(0, 3);
      for (const o of near) this.applyElem(o, el);
      this.chainDepth--;
    }
    const has = (x: Elem) => a === x || el === x;
    const k = value(this.stats.atk) * (arch ? 3 : this.cls.id === 'mage' ? 1.5 : this.awk?.sub === 'mage' || this.awk?.sub2 === 'mage' ? 1.2 : 1); // 大法師 reactions ×2 more
    const area = Math.sqrt(value(this.stats.area));
    this.reactions++;
    const prevSrc = this.src; this.src = 'react';
    if (has('poison')) {
      const other = a === 'poison' ? el : a;
      const r = 2.8 * area;
      if (other === 'fire') { // 毒爆: the poison catches fire
        this.explode(e.x, e.z, r, k * 2.6, false, 'heal', { noProc: true });
        this.zones.push({ x: e.x, z: e.z, r: r * 0.8, timer: 2, tick: 0, dmg: k * 0.3, kind: 'fire', slow: 1, src: 'react' });
        this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('毒爆', 'Toxic Blaze'), fx: 'heal' });
      } else if (other === 'frost') { // 冰蝕: freezes small enemies around
        for (const o of this.enemies) if (o.hp > 0 && !isBigKind(o.kind) && Math.hypot(o.x - e.x, o.z - e.z) < r + o.radius) { o.slowTimer = Math.max(o.slowTimer, 1.5); o.slowMult = Math.min(o.slowMult, 0.05); }
        this.explode(e.x, e.z, r, k * 1.6, false, 'frost', { noProc: true });
        this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('冰蝕', 'Frostrot'), fx: 'frost' });
      } else { // 麻痺毒: jumps to 5 enemies nearby and stuns them briefly
        const near = this.enemies.filter((o) => o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < 6).sort((p1, p2) => Math.hypot(p1.x - e.x, p1.z - e.z) - Math.hypot(p2.x - e.x, p2.z - e.z)).slice(0, 6);
        const pts = [e.x, e.z];
        for (const o of near) { pts.push(o.x, o.z); this.damageEnemy(o, k * 1.4, false, true); if (!isBigKind(o.kind)) { o.slowTimer = Math.max(o.slowTimer, 0.6); o.slowMult = 0.05; } }
        this.events.push({ type: 'lightning', pts });
        this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('麻痺毒', 'Neurotoxin'), fx: 'arcane' });
      }
      this.src = prevSrc;
      return;
    }
    if (has('fire') && has('frost')) {
      this.explode(e.x, e.z, 2.6 * area, k * 3, false, 'fire', { noProc: true });
      this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('蒸發爆炸', 'Steam Blast'), fx: 'fire' });
    } else if (has('fire') && has('shock')) {
      this.explode(e.x, e.z, 3 * area, k * 2.2, false, 'arcane', { noProc: true, knock: 1.4 });
      this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('超載', 'Overload'), fx: 'arcane' });
    } else {
      const r = 2.8 * area;
      for (const o of this.enemies) if (o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < r + o.radius) o.vulnT = 5;
      this.explode(e.x, e.z, r, k * 1.2, false, 'frost', { noProc: true, slow: 0.5, slowTime: 2 });
      this.events.push({ type: 'react', x: e.x, z: e.z, name: tr('超導', 'Superconduct'), fx: 'frost' });
    }
    this.src = prevSrc;
  }

  /** Bows: the arrow type changes damage, piercing, blasts, slows or adds arrows. */
  private shootArrows(base: number, mult: number, type: ArrowType): void {
    const p = this.player;
    const n = this.stats.multishot + (type === 'spread' ? 2 : 0);
    const spread = type === 'spread' ? 0.2 : 0.14;
    const speed = this.attack.projectileSpeed ?? 18;
    const sharp = this.awk?.id === 'archer_archer' || this.awk?.base === 'archer_archer'; // 神射手
    const seekSpread = sharp && type === 'spread'; // 神射手: scatter arrows home in too (60% each)
    const dm = type === 'normal' ? 1.4 : type === 'blast' ? 0.8 : type === 'frost' ? 1 : seekSpread ? 0.6 : type === 'spread' ? 0.8 : type === 'homing' ? 0.75 : 1;
    const homing = type === 'homing' || seekSpread;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      const { dmg: raw, crit } = this.rollDamage();
      this.projectiles.push({
        x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        dmg: raw * mult * dm * 1.15, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15,
        pierce: type === 'blast' ? 0 : seekSpread ? this.stats.pierce + 3 : homing ? this.stats.pierce + (sharp ? 5 : 3) : this.stats.pierce + 1 + (type === 'pierce' ? 3 : type === 'frost' ? 2 : type === 'normal' ? 1 : 0), homing: homing || undefined,
        radius: 0.3, hit: [],
        blast: type === 'blast' ? 1.5 * Math.sqrt(value(this.stats.area)) : undefined, fx: type === 'blast' ? 'fire' : undefined,
        slow: type === 'frost' ? 0.5 : undefined, ap: type === 'pierce' || undefined, elem: this.magicArrow(type === 'frost' ? 'frost' : type === 'blast' ? 'fire' : undefined),
      });
    }
  }

  /** 多重箭袋: several arrow types at once, their effects combined on every arrow.
   *  Damage multiplies (精準 ×1.4, 散射 ×0.8, 追蹤 ×0.75, 爆裂 ×0.8) and each extra type costs ×0.85;
   *  pierces add up; 爆裂 becomes a small blast on the first hit (60%, no fire element) so the arrow can keep piercing. */
  private shootMixedArrows(base: number, mult: number, types: ArrowType[]): void {
    const p = this.player, t = new Set(types);
    const sharp = this.awk?.id === 'archer_archer' || this.awk?.base === 'archer_archer';
    const homing = t.has('homing') || (sharp && t.has('spread'));
    const n = this.stats.multishot + (t.has('spread') ? 2 : 0);
    const spread = t.has('spread') ? 0.2 : 0.14;
    const speed = this.attack.projectileSpeed ?? 18;
    let dm = 1.15 * (this.arrowMax ? MIX_PENALTY_MAX : MIX_PENALTY) ** (types.length - 1);
    if (t.has('normal')) dm *= 1.4;
    if (t.has('spread')) dm *= 0.8;
    if (t.has('homing')) dm *= 0.75;
    if (t.has('blast')) dm *= 0.8;
    const pierce = this.stats.pierce + 1 + (t.has('normal') ? 1 : 0) + (t.has('pierce') ? 3 : 0) + (t.has('frost') ? 2 : 0) + (t.has('homing') ? (sharp ? 4 : 2) : 0);
    const blast = t.has('blast') ? 1.5 * Math.sqrt(value(this.stats.area)) : undefined;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      const { dmg: raw, crit } = this.rollDamage();
      this.projectiles.push({
        x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        dmg: raw * mult * dm, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15,
        pierce, radius: 0.3, hit: [], hitBlast: blast, fx: blast ? 'fire' : undefined,
        slow: t.has('frost') ? 0.5 : undefined, ap: t.has('pierce') || undefined,
        elem: this.magicArrow(t.has('frost') ? 'frost' : undefined), homing: homing || undefined,
      });
    }
  }

  /** 追蹤箭: turn towards the enemy it chases (picks the nearest one it hasn't hit, ahead of it first). */
  private steer(pr: Projectile, dt: number): void {
    let t = pr.seek !== undefined ? this.enemies.find((e) => e.id === pr.seek && e.hp > 0) : undefined;
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    if (!t) {
      let bd = 9;
      for (const e of this.enemies) {
        if (e.hp <= 0 || pr.hit.includes(e.id)) continue;
        const dx = e.x - pr.x, dz = e.z - pr.z, d = Math.hypot(dx, dz);
        const score = d + (1 - (dx * pr.vx + dz * pr.vz) / (sp * (d || 1))) * 2; // prefer ones in front
        if (score < bd) { bd = score; t = e; }
      }
      // nothing new to chase: turn back to a (mini) Boss it already went through, up to 4 times
      if (!t && (pr.rehits ?? 0) < 4) {
        let bd2 = 9;
        for (const e of this.enemies) { if (e.hp <= 0 || !isBigKind(e.kind)) continue; const d = Math.hypot(e.x - pr.x, e.z - pr.z); if (d < bd2) { bd2 = d; t = e; } }
        if (t) { pr.rehits = (pr.rehits ?? 0) + 1; pr.reArm = { id: t.id, t: 0.25 }; pr.life = Math.max(pr.life, 1); }
      }
      pr.seek = t?.id;
    }
    if (!t) return;
    const dx = t.x - pr.x, dz = t.z - pr.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, 9 * dt);
    pr.vx += ((dx / d) * sp - pr.vx) * k; pr.vz += ((dz / d) * sp - pr.vz) * k;
    const s2 = Math.hypot(pr.vx, pr.vz) || 1;
    pr.vx *= sp / s2; pr.vz *= sp / s2;
  }

  /** Summoner necromancer: a basic attack raises skeletons towards the target (renews the oldest at the cap). */
  private summonAttack(base: number, mult: number): void {
    const p = this.player;
    for (let i = 0; i < this.stats.multishot; i++) {
      const a = base + (i - (this.stats.multishot - 1) / 2) * 0.6;
      const x = p.x + Math.sin(a) * 1.8, z = p.z + Math.cos(a) * 1.8;
      if (this.summon(x, z, { life: 18, power: 1.1 * mult })) continue;
      // at the cap: renew the one with the least time left
      const old = this.minions.reduce<Minion | null>((m, n) => (!m || n.life < m.life ? n : m), null);
      if (!old) continue;
      old.life = Math.max(old.life, 18 * (1 + 0.5 * this.n('utLasting')));
      old.hp = Math.min(old.maxHp, old.hp + old.maxHp * 0.3);
      old.power = Math.max(old.power, 1.1 * mult);
      this.events.push({ type: 'explode', x: old.x, z: old.z, r: 0.9, fx: 'shadow' });
    }
  }

  /** Staff spells other than the plain fireball. */
  private castSpells(base: number, mult: number, type: SpellType): void {
    const p = this.player;
    const n = this.stats.multishot;
    const area = Math.sqrt(value(this.stats.area));
    if (type === 'lightning') {
      // instant: strike the nearest enemies in the aim cone, each bolt then jumps 3 times
      const range = value(this.stats.range);
      const used = new Set<number>();
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.35;
        let first: Enemy | null = null, bd = Infinity;
        for (const e of this.enemies) {
          if (e.hp <= 0 || used.has(e.id)) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d > range + e.radius) continue;
          let diff = Math.atan2(e.x - p.x, e.z - p.z) - a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const score = d + Math.abs(diff) * 4;
          if (score < bd) { bd = score; first = e; }
        }
        if (!first) continue;
        const pts = [p.x, p.z];
        let cur: Enemy = first;
        for (let j = 0; j < 4; j++) {
          used.add(cur.id);
          pts.push(cur.x, cur.z);
          const { dmg, crit } = this.rollDamage();
          this.damageEnemy(cur, dmg * mult * (j === 0 ? 1.5 : 1), crit);
          if (cur.hp > 0) this.applyElem(cur, 'shock');
          let next: Enemy | null = null, nd = 4.5 * area;
          for (const e of this.enemies) {
            if (e.hp <= 0 || used.has(e.id)) continue;
            const d = Math.hypot(e.x - cur.x, e.z - cur.z);
            if (d < nd) { nd = d; next = e; }
          }
          if (!next) break;
          cur = next;
        }
        this.events.push({ type: 'lightning', pts });
      }
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      return;
    }
    const speed = (this.attack.projectileSpeed ?? 13) * (type === 'frost' ? 1.7 : 0.85);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.3;
      const { dmg: raw, crit } = this.rollDamage();
      this.projectiles.push({
        x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        dmg: raw * mult * (type === 'frost' ? 1.5 : 1.6), crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.15,
        pierce: type === 'frost' ? 3 + this.stats.pierce : 0, radius: type === 'meteor' ? 0.55 : 0.32, hit: [],
        blast: type === 'meteor' ? (this.attack.blastRadius ?? 2) * 1.5 * area : undefined,
        fx: type === 'frost' ? 'frost' : undefined, slow: type === 'frost' ? 0.5 : undefined,
        meteor: type === 'meteor' || undefined, shard: type === 'frost' || undefined, elem: type === 'frost' ? 'frost' : 'fire',
      });
    }
  }

  /** Javelins: one heavy throw per multishot, pierces everything in a line and knocks small enemies back. */
  private throwJavelins(base: number, mult: number): void {
    const p = this.player;
    const n = this.stats.multishot;
    const speed = this.attack.projectileSpeed ?? 22;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.18;
      const { dmg: raw, crit } = this.rollDamage();
      this.projectiles.push({
        x: p.x, z: p.z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed,
        dmg: raw * mult * 1.3, crit, fromPlayer: true, life: value(this.stats.range) / speed + 0.2,
        pierce: 99, radius: 0.45, hit: [], knock: 1.1, javelin: true,
      });
    }
  }

  explode(x: number, z: number, r: number, dmg: number, crit: boolean, fx: FxKind = 'fire', opts: { slow?: number; slowTime?: number; knock?: number; noProc?: boolean; elem?: Elem } = {}): void {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d >= r + e.radius) continue;
      if (opts.slow) {
        // bosses resist slows a bit
        const slow = isBigKind(e.kind) ? Math.max(opts.slow, 0.6) : opts.slow;
        e.slowTimer = Math.max(e.slowTimer, opts.slowTime ?? 2);
        e.slowMult = Math.min(e.slowMult, slow);
      }
      if (opts.knock && !isBigKind(e.kind) && d > 0.01) {
        e.x += ((e.x - x) / d) * opts.knock;
        e.z += ((e.z - z) / d) * opts.knock;
      }
      if (dmg > 0) this.damageEnemy(e, dmg, crit, opts.noProc);
      if (opts.elem && e.hp > 0) this.applyElem(e, opts.elem);
    }
    this.events.push({ type: 'explode', x, z, r, fx });
  }

  private collideWorld(o: { x: number; z: number }, r: number): void {
    const lim = ARENA_HALF - r;
    o.x = Math.max(-lim, Math.min(lim, o.x));
    o.z = Math.max(-lim, Math.min(lim, o.z));
    for (const pl of this.pillars) {
      const dx = o.x - pl.x, dz = o.z - pl.z;
      const d = Math.hypot(dx, dz);
      const min = pl.r + r;
      if (d < min && d > 0.0001) {
        o.x = pl.x + (dx / d) * min;
        o.z = pl.z + (dz / d) * min;
      }
    }
  }

  nearestEnemy(x: number, z: number, maxDist: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.z - z) - e.radius;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  dmgLog: Record<string, number> = {}; // damage taken by source, handy for balancing
  private hurtPlayer(dmg: number, src = '?'): boolean {
    const p = this.player;
    if (p.invuln > 0 || this.down) return false;
    if (this.dodge && this.rand() < this.dodge) { p.invuln = 0.15; return false; } // 閃避
    dmg *= defMultiplier(value(this.stats.def));
    if (this.uq.bossGuard && this.boss) dmg *= 0.75; // 騎士之盾
    if (this.cls.bossGuard && this.boss) dmg *= 1 - this.cls.bossGuard; // 弓手 / 法師: keep their distance from bosses
    if (this.cls.id === 'warrior' && this.mastery >= 10 && this.boss) dmg *= 0.65; // 戰士 不屈: 35% less while a boss is in the fight (melee has to stand next to it)
    if (this.cls.id === 'warrior' && this.mastery >= 10 && src !== 'boss' && src !== 'miniboss' && src !== 'slam' && src !== 'charge') dmg *= 0.8; // 戰士 不屈: small enemies hit 20% softer
    dmg = ultOnHurt(this, dmg); // 聖光壁壘 / 復仇之魂
    if (dmg <= 0) { p.invuln = PLAYER.hurtInvuln * 0.5; return false; }
    if (this.elemShield > 0) { // 元素護盾 takes the hit first
      const a = Math.min(this.elemShield, dmg); this.elemShield -= a; dmg -= a;
      if (dmg <= 0) { p.invuln = PLAYER.hurtInvuln * 0.5; return false; }
    }
    this.dmgLog[src] = (this.dmgLog[src] ?? 0) + dmg;
    this.recentHits.push({ t: this.time, src, dmg });
    while (this.recentHits.length && this.recentHits[0].t < this.time - 5) this.recentHits.shift();
    p.hp -= dmg;
    p.invuln = PLAYER.hurtInvuln;
    if (p.hp <= 0 && this.cls.id === 'warrior' && this.mastery >= 10 && !this.unyieldUsed) { // 戰士 不屈: once per map, a killing blow leaves 1 HP
      this.unyieldUsed = true; p.hp = 1; p.invuln = 1.5;
      this.events.push({ type: 'skill', name: tr('不屈', 'Unyielding'), icon: '🛡️', signature: false });
    }
    this.events.push({ type: 'hurt' });
    if (this.sp.frostGuard && this.rand() < 0.15) {
      this.explode(p.x, p.z, 3.5 * Math.sqrt(value(this.stats.area)), value(this.stats.atk) * 1.5, false, 'frost', { slow: 0.6, noProc: true });
    }
    if (this.sp.secondWind && !this.sp.secondWindUsed && p.hp > 0 && p.hp < this.maxHp * 0.3) {
      this.sp.secondWindUsed = true;
      p.hp = Math.min(this.maxHp, p.hp + this.maxHp * 0.4);
      this.events.push({ type: 'skill', name: tr('再起', 'Second Wind'), icon: '💚', signature: false });
    }
    return true;
  }

  // ---------- spawning ----------
  private spawn(dt: number): void {
    const minions = this.enemies.length - (this.boss ? 1 : 0);
    let rate = Math.min(DUNGEON.spawnMax, DUNGEON.spawnBase + DUNGEON.spawnRamp * this.mapTime);
    if (this.bossSpawned) rate *= 0.5;
    if (this.endless) rate = Math.min(14, 1.5 + 0.25 * this.wave); // 無盡模式: more and more at once
    if (this.wb) rate = 0.6; // world boss: a light trickle so you still level up
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (minions >= (this.endless ? 170 : DUNGEON.maxAlive)) continue;
      let r = this.rand();
      const pick = (w: number) => { if (r < w) return true; r -= w; return false; };
      const shooterW = this.map === 0 ? 0.12 : 0.2;
      const unl = (k: keyof typeof ENEMY_UNLOCKS) => (!this.wb && this.tier >= ENEMY_UNLOCKS[k].tier ? ENEMY_UNLOCKS[k].weight : 0);
      if (pick(shooterW)) this.spawnAround('shooter', 1);
      else if (pick(0.2)) this.spawnAround('swarm', 3 + Math.floor(this.rand() * 2));
      else if (pick(unl('bomber'))) this.spawnAround('bomber', 1 + Math.floor(this.rand() * 2));
      else if (pick(unl('shield'))) this.spawnAround('shield', 1);
      else if (pick(unl('healer'))) this.spawnAround('healer', 1);
      else this.spawnAround('grunt', 1);
    }
  }

  private spawnPoint(minDist: number, maxDist: number): Vec2 {
    const standing = this.heroes.filter((h) => !h.down);
    const p = standing.length > 1 ? standing[Math.floor(this.rand() * standing.length)].player : (standing[0] ?? this).player;
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rand() * Math.PI * 2;
      const d = minDist + this.rand() * (maxDist - minDist);
      const x = Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, p.x + Math.sin(a) * d));
      const z = Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, p.z + Math.cos(a) * d));
      if (Math.hypot(x - p.x, z - p.z) >= minDist * 0.75) return { x, z };
    }
    return { x: -Math.sign(p.x || 1) * (ARENA_HALF - 2), z: -Math.sign(p.z || 1) * (ARENA_HALF - 2) };
  }

  private spawnAround(kind: EnemyKind, count: number): void {
    const c = this.spawnPoint(14, 19);
    for (let i = 0; i < count; i++) {
      this.addEnemy(kind, c.x + (this.rand() - 0.5) * 2, c.z + (this.rand() - 0.5) * 2);
    }
  }

  private addEnemy(kind: EnemyKind, x: number, z: number): Enemy {
    const def = ENEMIES[kind];
    const m = this.diff;
    const e: Enemy = {
      id: this.nextId++, kind, x, z,
      hp: def.hp * m * this.coopHp, maxHp: def.hp * m * this.coopHp,
      speed: def.speed, touchDmg: def.touchDmg * m, shotDmg: (def.shotDmg ?? 0) * m,
      radius: def.radius, shotTimer: (def.shotEvery ?? 0) * (0.5 + this.rand() * 0.5), summonTimer: 6,
      burstToggle: false, hitFlash: 0, strafe: this.rand() < 0.5 ? 1 : -1,
      slowTimer: 0, slowMult: 1, markTimer: 0,
    };
    // elites: gold, bigger, tougher, with one trait
    const eliteChance = this.wb || this.tier < ELITES.fromTier ? 0 : Math.min(ELITES.max, ELITES.perTier * (this.tier - ELITES.fromTier + 1));
    if ((kind === 'grunt' || kind === 'shooter' || kind === 'shield') && this.rand() < eliteChance) {
      e.elite = ELITE_TRAITS[Math.floor(this.rand() * ELITE_TRAITS.length)];
      e.hp = e.maxHp = e.hp * ELITES.hp;
      e.radius *= 1.3;
      if (e.elite === 'swift') e.speed *= 1.5;
      if (e.elite === 'enraged') { e.touchDmg *= 1.6; e.shotDmg *= 1.6; }
    }
    if (kind === 'healer') e.healTimer = 2;
    if (kind === 'miniboss' || kind === 'boss') {
      e.patternTimer = 4;
      if (this.isGate) { e.hp = e.maxHp = e.hp * DUNGEON.gateBossHp; e.touchDmg *= DUNGEON.gateBossDmg; e.shotDmg *= DUNGEON.gateBossDmg; }
    }
    this.collideWorld(e, e.radius);
    this.enemies.push(e);
    return e;
  }

  /** 無盡模式: a new wave every 30 s — more enemies at once, one tier stronger every 2 waves; a mini boss every 3rd wave, a Boss every 5th. */
  private endlessTick(): void {
    const wave = 1 + Math.floor(this.time / ENDLESS_WAVE);
    if (wave <= this.wave) return;
    for (const h of this.heroes) { h.wave = wave; h.floors = wave - 1; if (wave % 2 === 1) h.tier++; h.events.push({ type: 'endlessWave', wave }); } // one tier stronger every 2 waves
    if (wave % 5 === 0) {
      const pt = this.spawnPoint(10, 13);
      const b = this.addEnemy('boss', pt.x, pt.z);
      if (!this.boss) this.boss = b;
      this.events.push({ type: 'boss', kind: 'boss' });
    } else if (wave % 3 === 0) {
      const pt = this.spawnPoint(10, 13);
      const b = this.addEnemy('miniboss', pt.x, pt.z);
      if (!this.boss) this.boss = b;
      this.events.push({ type: 'boss', kind: 'miniboss' });
    }
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const kind: EnemyKind = this.map === DUNGEON.maps - 1 ? 'boss' : 'miniboss';
    const pt = this.spawnPoint(10, 13);
    this.boss = this.addEnemy(kind, pt.x, pt.z);
    this.events.push({ type: 'boss', kind });
  }

  // ---------- enemies ----------
  private updateEnemies(dt: number): void {
    const H = this.heroes;
    for (const e of this.enemies) {
      const hero = this.nearestHero(e.x, e.z);
      const p = hero.player;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.markTimer = Math.max(0, e.markTimer - dt);
      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowMult = 1; }
      if (e.elemT) { e.elemT -= dt; if (e.elemT <= 0) { e.elemT = 0; e.elem = undefined; } }
      if (e.reactCd) e.reactCd = Math.max(0, e.reactCd - dt);
      if (e.vulnT) e.vulnT = Math.max(0, e.vulnT - dt);
      if (e.chrono) e.chrono = Math.max(0, e.chrono - dt);
      const spd = e.speed * e.slowMult;
      const dPlayer = Math.hypot(p.x - e.x, p.z - e.z);
      // melee minions (not shooters or bosses) go for whichever is closer: you or one of your undead
      let tx = p.x, tz = p.z;
      if (!isBigKind(e.kind) && e.kind !== 'shooter') {
        let best = dPlayer;
        for (const h of H) {
          if (!h.minions.length) continue;
          const taunt = h.ut.tank ? 0.5 : 1; // 骨甲: enemies go for your undead first
          for (const m of h.minions) {
            const dm = Math.hypot(m.x - e.x, m.z - e.z) * taunt;
            if (dm < best && dm < 8) { best = dm; tx = m.x; tz = m.z; }
          }
        }
      }
      const dx = tx - e.x, dz = tz - e.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      const nx = dx / d, nz = dz / d;
      const def = ENEMIES[e.kind];

      let mx = nx, mz = nz;
      if (e.kind === 'bomber') {
        if (e.fuse === undefined && d < 1.7) e.fuse = 0.8;
        if (e.fuse !== undefined) {
          mx = 0; mz = 0;
          e.fuse -= dt;
          e.hitFlash = Math.sin(e.fuse * 30) > 0 ? 0.05 : 0;
          if (e.fuse <= 0) { this.bomberBlast(e); continue; }
        }
      }
      if ((e.kind === 'miniboss' || e.kind === 'boss') && !this.wb) this.bossPattern(e, dt, tx, tz, hero);
      if (e.dashWind !== undefined) { mx = 0; mz = 0; } // winding up
      if (e.dashT !== undefined && e.dashT > 0) { e.dashT -= dt; mx = 0; mz = 0; e.x += (e.dashVx ?? 0) * dt; e.z += (e.dashVz ?? 0) * dt; }
      if (e.elite === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * dt);
      if (e.kind === 'healer') {
        e.healTimer = (e.healTimer ?? 3) - dt;
        if (e.healTimer <= 0) {
          e.healTimer = 4;
          for (const o of this.enemies) {
            if (o === e || o.hp <= 0 || Math.hypot(o.x - e.x, o.z - e.z) > 4.5) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (isBigKind(o.kind) ? 0.02 : 0.1));
          }
          this.events.push({ type: 'explode', x: e.x, z: e.z, r: 4.5, fx: 'heal' });
        }
      }
      if (e.kind === 'shooter' || e.kind === 'healer') {
        const keep = def.keepDistance ?? 7;
        if (d < keep - 1) { mx = -nx; mz = -nz; }
        else if (d < keep + 1) { mx = -nz * e.strafe * 0.6; mz = nx * e.strafe * 0.6; }
      }
      e.x += mx * spd * dt;
      e.z += mz * spd * dt;

      // shooting
      if (def.shotEvery && e.kind !== 'worldboss') {
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && d < 13) {
          e.shotTimer = def.shotEvery;
          if (e.kind === 'shooter') this.enemyShot(e, Math.atan2(nx, nz), 9);
          else if (e.kind === 'miniboss') this.radialBurst(e, 10, 7);
          else if (e.kind === 'boss') {
            e.burstToggle = !e.burstToggle;
            if (e.burstToggle) this.radialBurst(e, 16, 7.5);
            else for (const off of [-0.25, 0, 0.25]) this.enemyShot(e, Math.atan2(nx, nz) + off, 10);
          }
        }
      }
      if (e.kind === 'worldboss' && this.wb) this.worldBossAct(e, nx, nz, dt, hero);
      if (e.kind === 'boss') {
        e.summonTimer -= dt;
        if (e.summonTimer <= 0) {
          e.summonTimer = 7;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.addEnemy('swarm', e.x + Math.sin(a) * 2.5, e.z + Math.cos(a) * 2.5);
          }
        }
      }

      // touch damage
      for (const h of H) {
        if (h.down) continue;
        const dh = h === hero ? dPlayer : Math.hypot(h.player.x - e.x, h.player.z - e.z);
        if (dh < e.radius + PLAYER.radius && h.hurtPlayer(e.touchDmg, e.kind) && h.sp.thorns) {
          h.withSrc('thorns', () => h.damageEnemy(e, value(h.stats.atk) * 1.5, false, true)); // 荊棘
        }
      }
    }

    // keep enemies from stacking on top of each other
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.radius + b.radius;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2;
          const ux = dx / d, uz = dz / d;
          const wa = isBigKind(a.kind) ? 0.1 : 1;
          const wb = isBigKind(b.kind) ? 0.1 : 1;
          a.x -= ux * push * wa; a.z -= uz * push * wa;
          b.x += ux * push * wb; b.z += uz * push * wb;
        }
      }
    }
    for (const e of list) this.collideWorld(e, e.radius);
  }

  private worldBossAct(e: Enemy, nx: number, nz: number, dt: number, hero: Sim): void {
    const wb = this.wb!;
    const ph = this.wbPhase;
    if (ph === 2) e.speed = wb.speed * 1.35; // enraged
    e.shotTimer -= dt;
    if (e.shotTimer <= 0) {
      e.shotTimer = wb.shotEvery[ph];
      e.burstToggle = !e.burstToggle;
      if (e.burstToggle || ph === 0) this.radialBurst(e, wb.burst[ph], 7 + ph);
      else {
        // aimed fan, wider in later phases
        const n = 3 + ph * 2;
        for (let i = 0; i < n; i++) this.enemyShot(e, Math.atan2(nx, nz) + (i - (n - 1) / 2) * 0.18, 10);
      }
      if (ph >= 1 && wb.id === 'frostQueen') {
        // spiral
        for (let i = 0; i < 8; i++) this.enemyShot(e, this.clock * 2 + (i / 8) * Math.PI * 2, 6);
      }
      if (ph === 2 && wb.id === 'lavaDragon') {
        // fire rain: bullets falling from all sides towards the player
        for (let i = 0; i < 6; i++) {
          const a = this.rand() * Math.PI * 2;
          const tp = hero.player;
          const sx = tp.x + Math.sin(a) * 9, sz = tp.z + Math.cos(a) * 9;
          const ang = Math.atan2(tp.x - sx, tp.z - sz);
          this.projectiles.push({ x: sx, z: sz, vx: Math.sin(ang) * 7, vz: Math.cos(ang) * 7, dmg: e.shotDmg, crit: false, fromPlayer: false, life: 2.5, pierce: 0, radius: 0.35, hit: [] });
        }
      }
    }
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      e.summonTimer = wb.summonEvery[ph];
      const n = wb.summon === 'swarm' ? 6 : wb.summon === 'grunt' ? 4 + ph * 2 : 2 + ph;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.addEnemy(wb.summon, e.x + Math.sin(a) * 3, e.z + Math.cos(a) * 3);
      }
    }
  }

  private enemyShot(e: Enemy, angle: number, speed: number): void {
    this.projectiles.push({
      x: e.x, z: e.z, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed,
      dmg: e.shotDmg, crit: false, fromPlayer: false, life: 3, pierce: 0, radius: 0.35, hit: [],
    });
  }

  private radialBurst(e: Enemy, n: number, speed: number): void {
    const off = this.rand() * Math.PI;
    for (let i = 0; i < n; i++) this.enemyShot(e, off + (i / n) * Math.PI * 2, speed);
  }

  // ---------- projectiles ----------
  private updateProjectiles(dt: number): void {
    const H = this.heroes;
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      if (pr.reArm) { pr.reArm.t -= dt; if (pr.reArm.t <= 0) { const id = pr.reArm.id; pr.hit = pr.hit.filter((x) => x !== id); pr.reArm = undefined; } }
      if (pr.homing) this.steer(pr, dt);
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.life -= dt;
      let alive = pr.life > 0 && Math.abs(pr.x) < ARENA_HALF && Math.abs(pr.z) < ARENA_HALF;
      if (alive && this.pillars.some((pl) => Math.hypot(pr.x - pl.x, pr.z - pl.z) < pl.r)) alive = false;

      let exploded = false;
      if (alive && pr.fromPlayer) {
        const o = pr.owner ?? this; // whose shot: their damage bonuses, procs and kill effects
        const prevSrc = o.src; o.src = pr.minion ? 'undead' : pr.src ?? 'attack';
        for (const e of this.enemies) {
          if (e.hp <= 0 || pr.hit.includes(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + pr.radius) {
            if (pr.blast) {
              if (pr.minion && o.ultProcs) ultOnHit(o, e, MINION_PROC);
              o.explode(pr.x, pr.z, pr.blast, pr.dmg, pr.crit, pr.fx ?? (pr.minion ? 'shadow' : 'fire'), { noProc: pr.minion, slow: pr.slow, slowTime: pr.slow ? 1.5 : undefined, elem: pr.elem });
              exploded = true;
              alive = false;
              break;
            }
            pr.hit.push(e.id);
            o.damageEnemy(e, pr.dmg, pr.crit, pr.minion, pr.ap);
            if (pr.elem && e.hp > 0) o.applyElem(e, pr.elem);
            if (pr.hitBlast) { o.explode(pr.x, pr.z, pr.hitBlast, pr.dmg * 0.6, pr.crit, 'fire', { noProc: true }); pr.hitBlast = undefined; } // only the first hit blasts
            if (pr.minion && o.ultProcs && e.hp > 0) ultOnHit(o, e, MINION_PROC); // an undead archer's bolt
            if (pr.knock && !isBigKind(e.kind)) {
              const v = Math.hypot(pr.vx, pr.vz) || 1;
              e.x += (pr.vx / v) * pr.knock; e.z += (pr.vz / v) * pr.knock;
            }
            if (pr.slow) { e.slowTimer = 2; e.slowMult = Math.min(e.slowMult, pr.slow); }
            if (pr.pierce > 0) { pr.pierce--; if (pr.homing) { pr.seek = undefined; pr.life = Math.max(pr.life, 0.9); this.steer(pr, 1); } } // 追蹤箭: turn to the next enemy
            else { alive = false; break; }
          }
        }
        // a fireball that reaches the end of its flight still explodes
        if (!alive && pr.blast && !exploded) o.explode(pr.x, pr.z, pr.blast, pr.dmg, pr.crit, pr.fx ?? (pr.minion ? 'shadow' : 'fire'), { noProc: pr.minion, elem: pr.elem });
        o.src = prevSrc;
      } else if (alive && !pr.fromPlayer) {
        const hit = H.find((h) => !h.down && Math.hypot(h.player.x - pr.x, h.player.z - pr.z) < PLAYER.radius + pr.radius);
        if (hit) {
          hit.hurtPlayer(pr.dmg, 'shot');
          alive = false;
        } else {
          // enemy shots also hit your undead
          for (const h of H) {
            // 骨盾: undead catch bullets in a much wider area and take half from them
            const m = h.minions.find((mn) => mn.hp > 0 && Math.hypot(mn.x - pr.x, mn.z - pr.z) < (mn.big ? 0.6 : 0.4) * (h.ut.shield ? 1.75 + 0.75 * h.utn.utShield! : 1) + pr.radius);
            if (m) { m.hp -= pr.dmg * defMultiplier(value(h.stats.def)) * h.minionTaken(m) * (h.ut.shield ? 0.5 / h.utn.utShield! : 1); alive = false; break; }
          }
        }
      }
      if (alive) keep.push(pr);
    }
    this.projectiles = keep;
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Bosses' telegraphed attacks: the mini boss charges (tier 2+), the boss slams circles under you; both get more from tier 6 / 11. */
  private bossPattern(e: Enemy, dt: number, tx: number, tz: number, hero: Sim): void {
    e.patternTimer = (e.patternTimer ?? 4) - dt;
    if (e.patternTimer > 0) return;
    for (const h of this.heroes) h.events.push({ type: 'warn' });
    const p = hero.player;
    const hard = this.tier >= 11 ? 2 : this.tier >= 6 ? 1 : 0;
    if (e.kind === 'miniboss') {
      e.patternTimer = 6 - hard;
      if (this.tier >= 2) {
        const a = Math.atan2(tx - e.x, tz - e.z), wind = 0.8;
        const len = Math.max(3, Math.min(9, Math.hypot(tx - e.x, tz - e.z) + 1.5)); // charge to just past you, not into the far wall
        const x2 = e.x + Math.sin(a) * len, z2 = e.z + Math.cos(a) * len;
        this.warnings.push({ x: e.x, z: e.z, r: 0, timer: wind, max: wind, dmg: e.touchDmg * 1.5, line: { x2, z2, w: 1.6 } });
        e.dashWind = wind; // the dash starts when the warning ends
        e.dashVx = Math.sin(a) * (len / 0.45); e.dashVz = Math.cos(a) * (len / 0.45);
      }
      if (hard >= 2) this.warnings.push({ x: p.x, z: p.z, r: 2.4, timer: 1.1, max: 1.1, dmg: e.touchDmg * 2 });
    } else {
      e.patternTimer = 5 - hard * 0.8;
      const n = 3 + hard * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.rand();
        const off = i === 0 ? 0 : 2.5 + this.rand() * 3;
        this.warnings.push({ x: p.x + Math.sin(a) * off, z: p.z + Math.cos(a) * off, r: 2.6, timer: 1.1, max: 1.1, dmg: e.touchDmg * 1.5 });
      }
    }
  }

  private updateWarnings(dt: number): void {
    for (const e of this.enemies) {
      if (e.dashWind === undefined) continue;
      e.dashWind -= dt;
      if (e.dashWind <= 0) { e.dashWind = undefined; e.dashT = 0.45; }
    }
    if (!this.warnings.length) return;
    const H = this.heroes;
    this.warnings = this.warnings.filter((w) => {
      w.timer -= dt;
      if (w.timer > 0) return true;
      if (w.line) {
        // distance from the player to the charge line
        const dx = w.line.x2 - w.x, dz = w.line.z2 - w.z, L2 = dx * dx + dz * dz || 1;
        for (const h of H) {
          const p = h.player;
          const t = Math.max(0, Math.min(1, ((p.x - w.x) * dx + (p.z - w.z) * dz) / L2));
          if (Math.hypot(p.x - (w.x + dx * t), p.z - (w.z + dz * t)) < w.line.w / 2 + PLAYER.radius) h.hurtPlayer(w.dmg, 'charge');
        }
      } else {
        this.events.push({ type: 'explode', x: w.x, z: w.z, r: w.r, fx: 'fire' });
        for (const h of H) if (Math.hypot(h.player.x - w.x, h.player.z - w.z) < w.r + PLAYER.radius) h.hurtPlayer(w.dmg, 'slam');
        for (const h of H) for (const m of h.minions) if (Math.hypot(m.x - w.x, m.z - w.z) < w.r) m.hp -= w.dmg * h.minionTaken(m);
      }
      return false;
    });
  }

  /** Bomber's fuse ran out: it explodes, hurting you and any undead nearby. */
  private bomberBlast(e: Enemy): void {
    const r = 2.4;
    e.hp = 0;
    this.events.push({ type: 'explode', x: e.x, z: e.z, r, fx: 'fire' });
    for (const h of this.heroes) if (Math.hypot(h.player.x - e.x, h.player.z - e.z) < r + PLAYER.radius) h.hurtPlayer(e.touchDmg * 2, 'bomber');
    for (const h of this.heroes) for (const m of h.minions) if (Math.hypot(m.x - e.x, m.z - e.z) < r) m.hp -= e.touchDmg * 3 * h.minionTaken(m);
  }

  damageEnemy(e: Enemy, dmg: number, crit: boolean, noProc = false, armourPierce = false): void {
    if (e.hp <= 0) return;
    if (e.kind === 'shield' && !armourPierce) dmg *= 0.75; // 盾兵
    if (e.elite === 'armored' && !armourPierce) dmg *= 0.6;
    if (e.markTimer > 0) dmg *= 1.5;
    if (this.cls.bigDmg && isBigKind(e.kind)) dmg *= 1 + this.cls.bigDmg; // 弓手: 弱點射擊
    if ((e.vulnT ?? 0) > 0) dmg *= 1 + VULN; // 超導
    if (e.chrono) dmg *= 1 + Math.max(this.ult.levels.chronoField ? ULT.chronoField.dmgTaken(this.ult.levels.chronoField) : 0, this.ult.levels.frostTouch ? 0.25 : 0); // 時之結界 / 寒冰之觸 極限
    if (!noProc) this.withSrc('ult', () => ultOnHit(this, e)); // on-hit ultimates (雷神之怒, 烈焰爆裂, 寒冰之觸, 影襲, 聖光審判)
    const bossDmg = (this.awk?.bossDmg ?? 0) + this.sp.bossDmg;
    if (bossDmg && isBigKind(e.kind)) dmg *= 1 + bossDmg;
    if (this.proc.execute && e.hp < e.maxHp * 0.3) dmg *= 1 + this.proc.execute; // 斬殺
    if (this.uq.berserk && this.player.hp < this.maxHp * 0.5) dmg *= 1.3; // 狂戰之魂
    if (this.warGod) dmg *= 1.5; // 戰神
    if (this.proc.lifesteal && this.proc.lifestealCd <= 0 && this.rand() < this.proc.lifesteal) {
      this.proc.lifestealCd = 0.2; // at most 5 heals a second
      this.player.hp = Math.min(this.maxHp, this.player.hp + this.maxHp * 0.01);
    }
    const dealt = Math.min(dmg, Math.max(0, e.hp));
    this.dmgDealt += dealt;
    this.dmgBy[this.src] = (this.dmgBy[this.src] ?? 0) + dealt;
    if (e.kind === 'worldboss') { const d = Math.min(dmg, e.hp); for (const h of this.heroes) h.wbDamage += d; } // co-op: the party's damage counts for everyone
    e.hp -= dmg;
    e.hitFlash = 0.08;
    this.events.push({ type: 'hit', x: e.x, z: e.z, dmg, crit });
    if (this.uq.markHits && !e.tagged) { e.tagged = true; e.markTimer = Math.max(e.markTimer, 2); } // 獵人本能
    if (e.hp <= 0) this.killEnemy(e);
    if (!noProc && crit && this.uq.chainCrit) { // 貫穿連鎖: bounce to a nearby enemy
      let best: Enemy | null = null, bd = 4;
      for (const o of this.enemies) { if (o === e || o.hp <= 0) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd) { bd = d; best = o; } }
      if (best) this.damageEnemy(best, dmg * 0.5, true, true);
    }
    if (!noProc && crit && this.sp.critBurst) {
      this.explode(e.x, e.z, 1.8 * Math.sqrt(value(this.stats.area)), value(this.stats.atk) * 0.8, false, 'fire', { noProc: true });
    }
    if (!noProc && this.resonance && this.rand() < this.resonance) {
      this.explode(e.x, e.z, 1.6 * Math.sqrt(value(this.stats.area)), value(this.stats.atk) * 0.6, false, 'fire', { noProc: true });
    }
  }

  private killEnemy(e: Enemy): void {
    const def = ENEMIES[e.kind];
    this.events.push({ type: 'kill', x: e.x, z: e.z, kind: e.kind });
    if (this.proc.frenzy) this.proc.frenzyTimer = 3;
    // 瘟疫沼澤 極限: dying inside the mire bursts with poison
    const mire = this.zones.find((z) => z.burst && Math.hypot(e.x - z.x, e.z - z.z) < z.r + e.radius);
    if (mire) this.explode(e.x, e.z, 2.2, mire.burst!, false, 'heal', { noProc: true });
    // 死靈: kills can raise a skeleton (main class 25%, necro as second class 15%)
    // 召喚冷卻 also makes kills rise more often (−20% cooldown = ×1.25 chance)
    const raise = (this.cls.raiseChance ?? (this.awk?.sub === 'necro' ? 0.15 : this.awk?.sub2 === 'necro' ? 0.1 : 0)) / this.summonCdMult;
    // the slain enemy itself rises as undead (keeps its kind; a mini boss rises as a big brute)
    if (raise && e.kind !== 'worldboss' && e.kind !== 'boss' && this.rand() < raise) {
      const kind: MinionKind = e.kind === 'grunt' || e.kind === 'shooter' || e.kind === 'swarm' ? e.kind : 'grunt';
      this.summon(e.x, e.z, { kind, big: e.kind === 'miniboss' });
    }
    if (this.uq.sigOnKill && this.signature) this.signature.timer = Math.max(0, this.signature.timer - 0.25); // 劍舞不息
    if (this.uq.killBlast && this.blastDepth < 2) { // 魔爆箭: a dead enemy explodes (chains at most twice)
      this.blastDepth++;
      this.explode(e.x, e.z, 2.2 * Math.sqrt(value(this.stats.area)), value(this.stats.atk) * 0.4, false, 'arcane', { noProc: true });
      this.blastDepth--;
    }
    const soulMult = 1 + 0.1 * (this.tier - 1);
    // 💎 crystals: mini boss 1, boss 3 (gate dungeons double), elites 10% for 1
    // co-op: every hero gets the full reward for every kill
    const gate = this.isGate ? 2 : 1;
    const crystalRoll = e.elite ? this.rand() < 0.1 : false;
    for (const h of this.heroes) {
      if (e.kind === 'miniboss') { h.runSouls += DROPS.soulsMiniboss * soulMult; h.runRunes += DROPS.runesMiniboss; h.runCrystals += 1 * gate; }
      else if (e.kind === 'boss') { h.runSouls += DROPS.soulsBoss * soulMult; h.runRunes += DROPS.runesBoss; h.runCrystals += 3 * gate; }
      else if (e.kind !== 'worldboss') h.runSouls += DROPS.soulPerKill * soulMult;
      if (crystalRoll) h.runCrystals += 1;
      if (e.elite) h.runSouls += 3 * soulMult;
    }
    if (this.healOnKill) this.player.hp = Math.min(this.maxHp, this.player.hp + this.maxHp * this.healOnKill);
    const isBoss = isBigKind(e.kind);
    const eliteMul = e.elite ? ELITES.rewards : 1;
    const total = def.coins * this.coinValue * eliteMul;
    const pieces = isBoss ? 12 : 1;
    for (let i = 0; i < pieces; i++) {
      const a = this.rand() * Math.PI * 2, r = isBoss ? 0.5 + this.rand() * 2.5 : 0;
      this.coins.push({ x: e.x + Math.sin(a) * r, z: e.z + Math.cos(a) * r, value: total / pieces, magnet: false, spin: this.rand() * 6 });
    }
    if (e.kind === 'worldboss') {
      // world boss: rewards are worked out from wbDamage after the fight
      this.boss = null;
      this.vacuumCoins();
      this.phase = 'won';
      for (const h of this.heroes) h.events.push({ type: 'won' });
      for (const h of this.heroes) h.gainXp(def.xp);
      return;
    }
    if (isBoss) {
      if (this.boss === e || !this.endless) this.boss = null;
      if (this.endless && !this.boss) this.boss = this.enemies.find((o) => o !== e && o.hp > 0 && isBigKind(o.kind)) ?? null; // the next big one shows in the bar
      if (e.kind === 'boss') { for (const h of this.heroes) { h.chests.gold++; h.events.push({ type: 'chest', kind: 'gold' }); } }
      else if (this.rand() < CHESTS.minibossSilverChance) { for (const h of this.heroes) { h.chests.silver++; h.events.push({ type: 'chest', kind: 'silver' }); } }
      this.onBossDead();
      for (const h of this.heroes) h.gainXp(def.xp); // level-ups wait until the next map starts
    } else {
      for (const h of this.heroes) h.gainXp(def.xp);
      this.kills++;
      if (!this.wb && !this.endless && !this.bossSpawned && this.kills >= this.quota) this.spawnBoss();
    }
  }

  private onBossDead(): void {
    // every coin left on the map gets pulled in
    for (const c of this.coins) c.magnet = true;
    if (this.endless) return; // 無盡模式: no maps to clear, the waves just keep coming
    if (this.map >= DUNGEON.maps - 1) {
      this.vacuumCoins();
      for (const h of this.heroes) h.runCoins += Math.round(10 * this.tier); // clear bonus
      this.phase = 'won';
      for (const h of this.heroes) h.events.push({ type: 'won' });
    } else {
      for (const h of this.heroes) h.events.push({ type: 'mapClear', map: this.map });
      this.phase = 'transition';
      this.transitionTimer = 2.2;
    }
  }

  private startNextMap(): void {
    this.vacuumCoins();
    this.map++;
    this.mapTime = 0;
    this.kills = 0;
    this.bossSpawned = false;
    this.boss = null;
    this.enemies = [];
    this.projectiles = [];
    this.warnings = [];
    const H = this.heroes;
    for (const h of H) {
      h.player.x = H.length > 1 ? (h.pid - (H.length - 1) / 2) * 2 : 0; h.player.z = 0;
      h.zones = [];
      h.ult.waves = []; h.ult.holes = []; h.ult.missiles = []; h.ult.mines = [];
      h.spinTimer = 0;
      if (h.lastStand) h.lastStand.used = false;
      h.sp.secondWindUsed = false;
      h.unyieldUsed = false;
      if (h.down) { h.down = false; h.reviveT = 0; h.player.hp = h.maxHp * 0.25; } // a fallen co-op hero is back for the next map
      else h.player.hp = Math.min(h.maxHp, h.player.hp + h.maxHp * 0.25);
    }
    this.buildMap();
    for (const h of H) for (const m of h.minions) { m.x = h.player.x + (this.rand() - 0.5) * 2; m.z = h.player.z + (this.rand() - 0.5) * 2; }
    this.phase = 'playing';
    for (const h of H) h.events.push({ type: 'newMap', map: this.map });
    for (const h of H) if (h.pendingLevelUps > 0 && !h.picking && this.phase === 'playing') h.openLevelUp();
  }

  private vacuumCoins(): void {
    for (const c of this.coins) for (const h of this.heroes) h.runCoins += c.value;
    this.coins = [];
  }

  // ---------- coins, XP, level-ups ----------
  private updateCoins(dt: number): void {
    const p = this.player;
    const reach = value(this.stats.pickup);
    const keep: Coin[] = [];
    for (const c of this.coins) {
      c.spin += dt * 5;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < reach) c.magnet = true;
      if (c.magnet) {
        const s = Math.max(12, 30 - d) * dt;
        c.x += (dx / (d || 1)) * Math.min(s, d);
        c.z += (dz / (d || 1)) * Math.min(s, d);
      }
      if (d < 0.6) { for (const h of this.heroes) h.runCoins += c.value; this.events.push({ type: 'coin' }); }
      else keep.push(c);
    }
    this.coins = keep;
  }

  private gainXp(xp: number): void {
    const p = this.player;
    this.runXp += xp;
    p.xp += xp;
    while (p.xp >= this.xpToNext) {
      p.xp -= this.xpToNext;
      p.level++;
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.phase === 'playing' && !this.picking) this.openLevelUp();
  }

  private openLevelUp(): void {
    const pool = CARDS.filter((c) => (this.cardsTaken[c.id] ?? 0) < (c.max ?? 99) && (!c.classes || c.classes.includes(this.cls.id)));
    const picks: Card[] = [];
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(this.rand() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    this.offeredCards = picks;
    this.offerId++;
    if (this.coop) {
      // co-op: the dungeon keeps going; pick within a few seconds or a card is picked for you
      this.picking = true;
      this.cardTimer = COOP_CARD_TIME;
    } else this.phase = 'levelup';
    if (this.autoPickCards) {
      this.chooseCard(this.autoPickIndex());
      return;
    }
    this.events.push({ type: 'levelup' });
  }

  /** Turn the auto-pick setting on or off mid-run. Turning it on resolves any open card choice. */
  setAutoPick(on: boolean): void {
    this.autoPickCards = on;
    if (on && (this.phase === 'levelup' || this.picking)) this.chooseCard(this.autoPickIndex());
  }

  autoPickIndex(): number {
    let best = 0;
    this.offeredCards.forEach((c, i) => { if (c.autoPriority > this.offeredCards[best].autoPriority) best = i; });
    return best;
  }

  chooseCard(index: number): void {
    if (this.phase !== 'levelup' && !this.picking) return;
    const card = this.offeredCards[index];
    if (!card) return;
    card.apply(this.stats, (f) => { this.player.hp = Math.min(this.maxHp, this.player.hp + this.maxHp * f); });
    this.cardsTaken[card.id] = (this.cardsTaken[card.id] ?? 0) + 1;
    if (this.autoPickCards) this.events.push({ type: 'autoCard', name: card.name, icon: card.icon });
    this.pendingLevelUps--;
    this.offeredCards = [];
    if (this.picking) this.picking = false;
    else this.phase = 'playing';
    if (this.pendingLevelUps > 0) this.openLevelUp();
  }

  private die(reason: string): void {
    this.deathReason = reason;
    this.phase = 'dead';
    this.coins = []; // coins still on the floor are lost
    for (const h of this.heroes) {
      h.player.hp = Math.max(0, h.player.hp);
      h.picking = false;
      if (!this.endless) h.chests = { silver: 0, gold: 0 }; // chests are only yours once the dungeon is cleared (無盡模式 keeps them)
      h.events.push({ type: 'dead' });
    }
  }
}
