// 終極技 (Ultimates): screen-clearing fantasy spells in the spirit of The Tower's ultimate weapons.
// (Ids kept from the first version so saves carry over; names / visuals are the fantasy versions.)
// Unlocked and levelled (1–15) with 💎 crystals; any class can equip up to 3. Ultimate hits can crit.
// Level 10 adds each one's 極限 (limit-break) effect.
import { isBigKind } from './config';
import { value } from './stats';
import { getLang, tr } from '../i18n';
import type { Enemy, Sim } from './sim';

export type UltId = 'deathWave' | 'chainLightning' | 'blackHole' | 'chronoField' | 'orbs' | 'missiles' | 'poisonSwamp' | 'landMines'
  | 'meteorShower' | 'blizzard' | 'holyShield' | 'bats' | 'thunderTotem' | 'vengeance'
  | 'flameBurst' | 'frostTouch' | 'shadowStrike' | 'holySmite';
export const ULT_IDS: UltId[] = ['deathWave', 'chainLightning', 'blackHole', 'chronoField', 'orbs', 'missiles', 'poisonSwamp', 'landMines', 'meteorShower', 'blizzard', 'holyShield', 'bats', 'thunderTotem', 'vengeance', 'flameBurst', 'frostTouch', 'shadowStrike', 'holySmite'];
/** Ultimates that trigger by chance when your attacks hit (like 雷神之怒). */
export const PROC_ULTS: UltId[] = ['chainLightning', 'flameBurst', 'frostTouch', 'shadowStrike', 'holySmite'];
/** Undead hits can trigger the on-hit ultimates too, at this share of the normal chance (there are many of them). */
export const MINION_PROC = 0.35;
export const ULT_MAX_LEVEL = 15;
/** Level that unlocks the 極限 effect. */
export const ULT_LIMIT_LEVEL = 10;
export const ULT_SLOTS = 3;

/** Numbers for one ultimate at a level (1..10). */
export const ULT = {
  deathWave: { name: tr('天罰聖環', 'Judgement Ring'), icon: '🔔', cd: (l: number) => Math.max(10, 24 - l * 0.9), dmg: (l: number) => 8 + 2.4 * l, radius: 15 },
  chainLightning: { name: tr('雷神之怒', "Thor's Wrath"), icon: '⚡', chance: (l: number) => Math.min(0.4, 0.12 + 0.018 * l), jumps: (l: number) => 4 + Math.floor(l / 2), dmg: (l: number) => 2.2 + 0.3 * l },
  blackHole: { name: tr('深淵漩渦', 'Abyssal Vortex'), icon: '🌀', cd: (l: number) => Math.max(9, 20 - l * 0.8), dur: (l: number) => 4 + 0.2 * l, radius: (l: number) => 5.5 + 0.25 * l, dmg: (l: number) => 0.55 + 0.1 * l },
  chronoField: { name: tr('時之結界', 'Time Ward'), icon: '⏳', radius: (l: number) => 5.5 + 0.35 * l, slow: (l: number) => Math.min(0.7, 0.35 + 0.03 * l), dmgTaken: (l: number) => 0.1 + 0.02 * l },
  orbs: { name: tr('守護精靈', 'Guardian Spirits'), icon: '🧚', count: (l: number) => 3 + Math.floor(l / 3), dmg: (l: number) => 1.8 + 0.3 * l, radius: 3.2 },
  missiles: { name: tr('御劍術', 'Flying Swords'), icon: '🗡️', cd: (l: number) => Math.max(2.5, 6 - 0.28 * l), count: (l: number) => 3 + Math.floor(l / 3), hits: (l: number) => 3 + Math.floor(l / 4), dmg: (l: number) => 2 + 0.3 * l },
  poisonSwamp: { name: tr('瘟疫沼澤', 'Plague Mire'), icon: '🐍', cd: (l: number) => Math.max(5, 11 - 0.4 * l), dur: (l: number) => 7 + 0.3 * l, radius: (l: number) => 3.2 + 0.15 * l, dmg: (l: number) => 0.5 + 0.1 * l },
  meteorShower: { name: tr('隕石雨', 'Meteor Shower'), icon: '☄️', cd: (l: number) => Math.max(6, 14 - 0.5 * l), count: (l: number) => 4 + Math.floor(l / 3), dmg: (l: number) => 5 + 0.8 * l, radius: 2.6 },
  blizzard: { name: tr('冰封風暴', 'Blizzard'), icon: '❄️', cd: (l: number) => Math.max(7, 16 - 0.6 * l), radius: (l: number) => 6 + 0.3 * l, dmg: (l: number) => 3 + 0.55 * l, freeze: (l: number) => 1 + 0.08 * l },
  holyShield: { name: tr('聖光壁壘', 'Holy Bulwark'), icon: '🛡️', cd: (l: number) => Math.max(8, 18 - 0.6 * l), shield: (l: number) => 0.15 + 0.02 * l, dmg: (l: number) => 3 + 0.4 * l, radius: 4.5 },
  bats: { name: tr('吸血蝙蝠', 'Vampire Bats'), icon: '🦇', cd: (l: number) => Math.max(3, 7 - 0.25 * l), count: (l: number) => 4 + Math.floor(l / 2), dmg: (l: number) => 1.7 + 0.28 * l, heal: 0.004 },
  thunderTotem: { name: tr('雷霆圖騰', 'Thunder Totem'), icon: '🗿', cd: (l: number) => Math.max(6, 12 - 0.4 * l), dur: 8, targets: (l: number) => 3 + Math.floor(l / 4), dmg: (l: number) => 1.4 + 0.25 * l, range: 7 },
  vengeance: { name: tr('復仇之魂', 'Vengeful Spirit'), icon: '👻', cd: (l: number) => Math.max(1, 3 - 0.12 * l), radius: (l: number) => 4.5 + 0.15 * l, dmg: (l: number) => 4 + 0.65 * l },
  flameBurst: { name: tr('烈焰爆裂', 'Flame Burst'), icon: '🔥', chance: (l: number) => Math.min(0.35, 0.1 + 0.017 * l), dmg: (l: number) => 1.8 + 0.25 * l, radius: (l: number) => 2.4 + 0.08 * l },
  frostTouch: { name: tr('寒冰之觸', 'Frost Touch'), icon: '🧊', chance: (l: number) => Math.min(0.35, 0.1 + 0.017 * l), dmg: (l: number) => 1.4 + 0.2 * l, radius: (l: number) => 2.6 + 0.08 * l, freeze: (l: number) => 0.8 + 0.06 * l },
  shadowStrike: { name: tr('影襲', 'Shadow Strike'), icon: '🗡️', chance: (l: number) => Math.min(0.35, 0.12 + 0.017 * l), hits: (l: number) => 2 + Math.floor(l / 3), dmg: (l: number) => 1.2 + 0.18 * l },
  holySmite: { name: tr('聖光審判', 'Holy Smite'), icon: '⚜️', chance: (l: number) => Math.min(0.25, 0.06 + 0.012 * l), dmg: (l: number) => 5 + 0.8 * l },
  landMines: { name: tr('符文陷阱', 'Rune Traps'), icon: '🔯', every: (l: number) => Math.max(0.5, 1.4 - 0.06 * l), max: (l: number) => 8 + l, dmg: (l: number) => 4 + 0.55 * l, radius: 2.6 },
} as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The 極限 effect each ultimate gains at level 10. */
export const ULT_LIMIT: Record<UltId, string> = {
  deathWave: tr('極限：每次敲鐘多一個聖環（隔 1 秒）', 'Limit: each toll sends a second ring 1s later'),
  chainLightning: tr('極限：每次落雷有 50% 機會再劈多一輪', 'Limit: each strike has a 50% chance to strike again'),
  blackHole: tr('極限：Boss 都會被慢慢捲入；深淵關閉時大爆炸（300%）', 'Limit: Bosses get pulled slowly too; the abyss implodes when it closes (300%)'),
  chronoField: tr('極限：範圍內敵人嘅攻擊同子彈都慢埋', 'Limit: enemy shots inside are slowed too'),
  orbs: tr('極限：精靈會擋住撞到嘅敵人子彈', 'Limit: spirits destroy enemy shots they touch'),
  missiles: tr('極限：每下飛劍斬擊都會爆開（範圍 60%）', 'Limit: every sword strike bursts (60% area)'),
  poisonSwamp: tr('極限：喺沼澤死嘅敵人會爆毒（範圍 80%）', 'Limit: enemies that die in the mire burst with poison (80% area)'),
  landMines: tr('極限：符文爆完會重新刻一次（每個爆兩次）', 'Limit: each rune re-arms once after exploding (two blasts each)'),
  meteorShower: tr('極限：隕石落地留低火海 3 秒', 'Limit: meteors leave burning ground for 3s'),
  blizzard: tr('極限：冰封時間 ×1.5，Boss 都會減速 50%', 'Limit: freeze lasts 1.5× longer; Bosses are slowed 50% too'),
  holyShield: tr('極限：壁壘破裂時回復 15% HP', 'Limit: heal 15% HP when the bulwark breaks'),
  bats: tr('極限：多 2 隻蝙蝠，吸血 ×2', 'Limit: 2 more bats, double healing'),
  thunderTotem: tr('極限：同時插兩支圖騰', 'Limit: plant two totems at once'),
  vengeance: tr('極限：爆發後 1 秒無敵', 'Limit: 1s invulnerable after each burst'),
  flameBurst: tr('極限：爆炸會點燃地面 2 秒', 'Limit: the blast sets the ground on fire for 2s'),
  frostTouch: tr('極限：被冰封嘅敵人受傷 +25%', 'Limit: frozen enemies take +25% damage'),
  shadowStrike: tr('極限：每下影襲都會暴擊', 'Limit: every shadow strike crits'),
  holySmite: tr('極限：對小 Boss / Boss 傷害 ×2', 'Limit: double damage to Mini-bosses and Bosses'),
};
/** 元素: the element an ultimate leaves on enemies (reacts with other elements). */
export const ULT_ELEM: Partial<Record<UltId, 'fire' | 'frost' | 'shock' | 'poison'>> = {
  chainLightning: 'shock', thunderTotem: 'shock', flameBurst: 'fire', meteorShower: 'fire', frostTouch: 'frost', blizzard: 'frost', poisonSwamp: 'poison',
};
const ELEM_NAME = { fire: ['🔥 火', '🔥 Fire'], frost: ['❄️ 冰', '❄️ Frost'], shock: ['⚡ 雷', '⚡ Lightning'], poison: ['🧪 毒', '🧪 Poison'] } as const;
/** Description at a level (shown in the 終極 tab), with its element. */
export function ultDesc(id: UltId, l: number): string {
  const el = ULT_ELEM[id];
  const d = ultDescRaw(id, l);
  return el ? `${d}${tr(`。元素：${ELEM_NAME[el][0]}`, `. Element: ${ELEM_NAME[el][1]}`)}` : d;
}
function ultDescRaw(id: UltId, l: number): string {
  if (getLang() === 'en') {
    switch (id) {
      case 'deathWave': return `Every ${ULT.deathWave.cd(l).toFixed(1)}s ring the bell of judgement: a golden ring spreads from you and sweeps the whole screen (${pct(ULT.deathWave.dmg(l))})`;
      case 'chainLightning': return `Attacks have a ${pct(ULT.chainLightning.chance(l))} chance to call down lightning that jumps between enemies ${ULT.chainLightning.jumps(l)} times (${pct(ULT.chainLightning.dmg(l))} each)`;
      case 'blackHole': return `Every ${ULT.blackHole.cd(l)}s tear open an abyss in the thickest crowd for ${ULT.blackHole.dur(l).toFixed(1)}s, pulling enemies in (${pct(ULT.blackHole.dmg(l))} every 0.5s; Bosses aren't pulled)`;
      case 'chronoField': return `A time ward under your feet slows enemies within ${ULT.chronoField.radius(l).toFixed(1)} by ${pct(ULT.chronoField.slow(l))}; they take +${pct(ULT.chronoField.dmgTaken(l))} damage`;
      case 'orbs': return `${ULT.orbs.count(l)} guardian spirits circle you, striking enemies they touch (${pct(ULT.orbs.dmg(l))})`;
      case 'missiles': return `Every ${ULT.missiles.cd(l).toFixed(1)}s release ${ULT.missiles.count(l)} flying swords; each seeks out enemies and strikes ${ULT.missiles.hits(l)} times (${pct(ULT.missiles.dmg(l))} per hit)`;
      case 'poisonSwamp': return `Every ${ULT.poisonSwamp.cd(l).toFixed(1)}s summon a plague mire in the crowd for ${ULT.poisonSwamp.dur(l).toFixed(1)}s (${pct(ULT.poisonSwamp.dmg(l))} every 0.5s, slow)`;
      case 'meteorShower': return `Every ${ULT.meteorShower.cd(l).toFixed(1)}s call ${ULT.meteorShower.count(l)} meteors onto the enemies (${pct(ULT.meteorShower.dmg(l))} area each)`;
      case 'blizzard': return `Every ${ULT.blizzard.cd(l).toFixed(1)}s a blizzard bursts around you (radius ${ULT.blizzard.radius(l).toFixed(1)}, ${pct(ULT.blizzard.dmg(l))}) and freezes small enemies for ${ULT.blizzard.freeze(l).toFixed(1)}s`;
      case 'holyShield': return `Every ${ULT.holyShield.cd(l).toFixed(1)}s gain a shield of ${pct(ULT.holyShield.shield(l))} max HP; when it breaks it blasts nearby enemies (${pct(ULT.holyShield.dmg(l))})`;
      case 'bats': return `Every ${ULT.bats.cd(l).toFixed(1)}s release ${ULT.bats.count(l)} bats; each bites 2 enemies (${pct(ULT.bats.dmg(l))}) and heals you 0.4% HP per bite`;
      case 'thunderTotem': return `Every ${ULT.thunderTotem.cd(l).toFixed(1)}s plant a totem for 8s that zaps ${ULT.thunderTotem.targets(l)} enemies nearby every 0.6s (${pct(ULT.thunderTotem.dmg(l))})`;
      case 'vengeance': return `When you're hit, a vengeful spirit bursts out (radius ${ULT.vengeance.radius(l).toFixed(1)}, ${pct(ULT.vengeance.dmg(l))}); at most every ${ULT.vengeance.cd(l).toFixed(1)}s`;
      case 'flameBurst': return `Hits have a ${pct(ULT.flameBurst.chance(l))} chance to explode in flames on the target (radius ${ULT.flameBurst.radius(l).toFixed(1)}, ${pct(ULT.flameBurst.dmg(l))})`;
      case 'frostTouch': return `Hits have a ${pct(ULT.frostTouch.chance(l))} chance to burst with frost (${pct(ULT.frostTouch.dmg(l))}), freezing small enemies nearby for ${ULT.frostTouch.freeze(l).toFixed(1)}s`;
      case 'shadowStrike': return `Hits have a ${pct(ULT.shadowStrike.chance(l))} chance to send a shadow that strikes ${ULT.shadowStrike.hits(l)} other enemies (${pct(ULT.shadowStrike.dmg(l))} each)`;
      case 'holySmite': return `Hits have a ${pct(ULT.holySmite.chance(l))} chance to call a pillar of holy light on the target (${pct(ULT.holySmite.dmg(l))})`;
      case 'landMines': return `Every ${ULT.landMines.every(l).toFixed(2)}s carve a rune at your feet (max ${ULT.landMines.max(l)}); it explodes when an enemy steps on it (${pct(ULT.landMines.dmg(l))})`;
    }
  }
  switch (id) {
    case 'deathWave': return `每 ${ULT.deathWave.cd(l).toFixed(1)} 秒敲響天罰之鐘，金色聖環由你身上擴散，掃晒成個畫面（${pct(ULT.deathWave.dmg(l))}）`;
    case 'chainLightning': return `攻擊有 ${pct(ULT.chainLightning.chance(l))} 機會召來落雷，喺怪之間彈 ${ULT.chainLightning.jumps(l)} 次（每次 ${pct(ULT.chainLightning.dmg(l))}）`;
    case 'blackHole': return `每 ${ULT.blackHole.cd(l)} 秒喺怪最多嘅地方撕開深淵 ${ULT.blackHole.dur(l).toFixed(1)} 秒，將附近嘅怪捲入去（每 0.5 秒 ${pct(ULT.blackHole.dmg(l))}，Boss 唔會被捲）`;
    case 'chronoField': return `腳下展開時之結界，${ULT.chronoField.radius(l).toFixed(1)} 範圍內嘅怪一直減速 ${pct(ULT.chronoField.slow(l))}，受到傷害 +${pct(ULT.chronoField.dmgTaken(l))}`;
    case 'orbs': return `${ULT.orbs.count(l)} 隻守護精靈圍住你飛，撞到怪就打（${pct(ULT.orbs.dmg(l))}）`;
    case 'missiles': return `每 ${ULT.missiles.cd(l).toFixed(1)} 秒放出 ${ULT.missiles.count(l)} 把飛劍，每把會自己搵怪連斬 ${ULT.missiles.hits(l)} 下（每下 ${pct(ULT.missiles.dmg(l))}）`;
    case 'poisonSwamp': return `每 ${ULT.poisonSwamp.cd(l).toFixed(1)} 秒喺怪堆召喚瘟疫沼澤 ${ULT.poisonSwamp.dur(l).toFixed(1)} 秒（每 0.5 秒 ${pct(ULT.poisonSwamp.dmg(l))}，減速）`;
    case 'meteorShower': return `每 ${ULT.meteorShower.cd(l).toFixed(1)} 秒召喚 ${ULT.meteorShower.count(l)} 粒隕石砸落敵人度（每粒範圍 ${pct(ULT.meteorShower.dmg(l))}）`;
    case 'blizzard': return `每 ${ULT.blizzard.cd(l).toFixed(1)} 秒喺身邊爆發冰封風暴（範圍 ${ULT.blizzard.radius(l).toFixed(1)}，${pct(ULT.blizzard.dmg(l))}），細怪冰封 ${ULT.blizzard.freeze(l).toFixed(1)} 秒`;
    case 'holyShield': return `每 ${ULT.holyShield.cd(l).toFixed(1)} 秒得到 ${pct(ULT.holyShield.shield(l))} 最大 HP 嘅護盾，破裂時炸開身邊敵人（${pct(ULT.holyShield.dmg(l))}）`;
    case 'bats': return `每 ${ULT.bats.cd(l).toFixed(1)} 秒放出 ${ULT.bats.count(l)} 隻蝙蝠，每隻咬 2 隻敵人（${pct(ULT.bats.dmg(l))}），每咬一下回 0.4% HP`;
    case 'thunderTotem': return `每 ${ULT.thunderTotem.cd(l).toFixed(1)} 秒插一支雷霆圖騰（維持 8 秒），每 0.6 秒電附近 ${ULT.thunderTotem.targets(l)} 隻敵人（${pct(ULT.thunderTotem.dmg(l))}）`;
    case 'vengeance': return `你被打中時放出復仇之魂（範圍 ${ULT.vengeance.radius(l).toFixed(1)}，${pct(ULT.vengeance.dmg(l))}），最多每 ${ULT.vengeance.cd(l).toFixed(1)} 秒一次`;
    case 'flameBurst': return `攻擊命中有 ${pct(ULT.flameBurst.chance(l))} 機會喺目標身上烈焰爆炸（範圍 ${ULT.flameBurst.radius(l).toFixed(1)}，${pct(ULT.flameBurst.dmg(l))}）`;
    case 'frostTouch': return `攻擊命中有 ${pct(ULT.frostTouch.chance(l))} 機會爆出寒冰（${pct(ULT.frostTouch.dmg(l))}），附近細怪冰封 ${ULT.frostTouch.freeze(l).toFixed(1)} 秒`;
    case 'shadowStrike': return `攻擊命中有 ${pct(ULT.shadowStrike.chance(l))} 機會放出影子，襲擊另外 ${ULT.shadowStrike.hits(l)} 隻敵人（每下 ${pct(ULT.shadowStrike.dmg(l))}）`;
    case 'holySmite': return `攻擊命中有 ${pct(ULT.holySmite.chance(l))} 機會喺目標身上降下聖光柱（${pct(ULT.holySmite.dmg(l))}）`;
    case 'landMines': return `每 ${ULT.landMines.every(l).toFixed(2)} 秒喺腳下刻一個符文（最多 ${ULT.landMines.max(l)} 個），怪踩到就引爆（${pct(ULT.landMines.dmg(l))}）`;
  }
}

// ---------- 💎 crystals ----------
export const ULT_UNLOCK_COST = 15;
/** Crystals to go from level l to l + 1. */
export const ultUpgradeCost = (l: number) => 5 * l;

// ---------- run state ----------
export interface UltRun {
  levels: Partial<Record<UltId, number>>;
  timers: Partial<Record<UltId, number>>;
  waves: { x: number; z: number; r: number; hit: Set<number>; dmg: number }[];
  holes: { x: number; z: number; timer: number; tick: number; r: number }[];
  orbAngle: number;
  orbHit: Map<number, number>; // enemy id -> next time an orb may hit it
  missiles: { x: number; z: number; vx: number; vz: number; target: number; life: number; dmg: number; hits: number; done: number[] }[]; // 御劍術 flying swords
  mines: { x: number; z: number; arm: number; again?: boolean }[];
  echoWaves: { x: number; z: number; delay: number; dmg: number }[]; // 極限: second ring
  meteors: { x: number; z: number; delay: number; dmg: number }[]; // 隕石雨 (falling)
  shield: number; // 聖光壁壘: HP left on the shield
  shieldTime: number;
  bats: { x: number; z: number; vx: number; vz: number; target: number; life: number; dmg: number; hits: number; done: number[] }[];
  totems: { x: number; z: number; life: number; tick: number }[];
  vengeanceCd: number;
}

export function newUltRun(ults: { id: UltId; level: number }[]): UltRun {
  const levels: UltRun['levels'] = {};
  const timers: UltRun['timers'] = {};
  for (const u of ults.slice(0, ULT_SLOTS)) { levels[u.id] = Math.max(1, Math.min(ULT_MAX_LEVEL, u.level)); timers[u.id] = 3; }
  return { levels, timers, waves: [], holes: [], orbAngle: 0, orbHit: new Map(), missiles: [], mines: [], echoWaves: [], meteors: [], shield: 0, shieldTime: 0, bats: [], totems: [], vengeanceCd: 0 };
}

const atk = (sim: Sim) => value(sim.stats.atk);
/** Ultimate hits roll crits like your attacks. */
function ultHit(sim: Sim, e: Enemy, dmg: number): void {
  const crit = sim.rand() < value(sim.stats.crit);
  sim.damageEnemy(e, dmg * (crit ? value(sim.stats.critDmg) : 1), crit, true);
}
const limit = (l: number | undefined) => (l ?? 0) >= ULT_LIMIT_LEVEL;
const areaMul = (sim: Sim) => Math.sqrt(value(sim.stats.area));

/** Where the enemies are thickest (enemy with the most neighbours within r). */
function densest(sim: Sim, r: number, near = 13): Enemy | null {
  const p = sim.player;
  let best: Enemy | null = null, bestN = -1;
  for (const e of sim.enemies) {
    if (Math.hypot(e.x - p.x, e.z - p.z) > near) continue;
    let n = 0;
    for (const o of sim.enemies) if (Math.hypot(o.x - e.x, o.z - e.z) < r) n++;
    if (n > bestN) { bestN = n; best = e; }
  }
  return best;
}

export function updateUltimates(sim: Sim, dt: number): void {
  const u = sim.ult;
  const L = u.levels;
  const p = sim.player;
  const cdm = sim.sp.cdMult;
  const tick = (id: UltId) => { u.timers[id] = (u.timers[id] ?? 0) - dt; return (u.timers[id] ?? 0) <= 0; };

  // 死亡波
  if (L.deathWave && tick('deathWave')) {
    const l = L.deathWave;
    u.timers.deathWave = ULT.deathWave.cd(l) * cdm;
    if (sim.enemies.length) {
      u.waves.push({ x: p.x, z: p.z, r: 0, hit: new Set(), dmg: atk(sim) * ULT.deathWave.dmg(l) });
      sim.events.push({ type: 'wave', x: p.x, z: p.z, r: ULT.deathWave.radius });
      if (limit(l)) u.echoWaves.push({ x: p.x, z: p.z, delay: 1, dmg: atk(sim) * ULT.deathWave.dmg(l) });
    } else u.timers.deathWave = 0.5;
  }
  u.echoWaves = u.echoWaves.filter((w) => {
    w.delay -= dt;
    if (w.delay > 0) return true;
    u.waves.push({ x: p.x, z: p.z, r: 0, hit: new Set(), dmg: w.dmg });
    sim.events.push({ type: 'wave', x: p.x, z: p.z, r: ULT.deathWave.radius });
    return false;
  });
  u.waves = u.waves.filter((w) => {
    w.r += 13 * dt;
    for (const e of sim.enemies) {
      if (e.hp <= 0 || w.hit.has(e.id)) continue;
      if (Math.hypot(e.x - w.x, e.z - w.z) - e.radius <= w.r) { w.hit.add(e.id); ultHit(sim, e, w.dmg); }
    }
    return w.r < ULT.deathWave.radius;
  });

  // 黑洞
  if (L.blackHole && tick('blackHole')) {
    const l = L.blackHole;
    const c = densest(sim, 4);
    if (c) {
      u.timers.blackHole = ULT.blackHole.cd(l) * cdm;
      u.holes.push({ x: c.x, z: c.z, timer: ULT.blackHole.dur(l), tick: 0, r: ULT.blackHole.radius(l) * areaMul(sim) });
    } else u.timers.blackHole = 0.5;
  }
  u.holes = u.holes.filter((h) => {
    h.timer -= dt;
    h.tick -= dt;
    const hit = h.tick <= 0;
    if (hit) h.tick = 0.5;
    for (const e of sim.enemies) {
      const dx = h.x - e.x, dz = h.z - e.z, d = Math.hypot(dx, dz);
      if (d > h.r + e.radius) continue;
      const big = isBigKind(e.kind);
      if ((!big || limit(L.blackHole)) && d > 0.3) { const pull = Math.min(d, (big ? 1.5 : 7) * dt); e.x += (dx / d) * pull; e.z += (dz / d) * pull; }
      if (hit) ultHit(sim, e, atk(sim) * ULT.blackHole.dmg(L.blackHole ?? 1));
    }
    if (h.timer <= 0 && limit(L.blackHole)) {
      const crit = sim.rand() < value(sim.stats.crit);
      sim.explode(h.x, h.z, h.r, atk(sim) * 3 * (crit ? value(sim.stats.critDmg) : 1), crit, 'shadow', { noProc: true });
    }
    return h.timer > 0;
  });

  // 時間力場
  if (L.chronoField) {
    const r = ULT.chronoField.radius(L.chronoField) * areaMul(sim);
    const slow = 1 - ULT.chronoField.slow(L.chronoField);
    for (const e of sim.enemies) {
      if (Math.hypot(e.x - p.x, e.z - p.z) > r + e.radius) continue;
      e.slowTimer = Math.max(e.slowTimer, 0.15);
      e.slowMult = Math.min(e.slowMult, isBigKind(e.kind) ? Math.max(slow, 0.7) : slow);
      e.chrono = 0.2;
    }
    if (limit(L.chronoField)) for (const pr of sim.projectiles) {
      if (pr.fromPlayer || Math.hypot(pr.x - p.x, pr.z - p.z) > r) continue;
      pr.x -= pr.vx * dt * 0.5; pr.z -= pr.vz * dt * 0.5; pr.life += dt * 0.5; // half speed inside
    }
  }

  // 環繞光球
  if (L.orbs) {
    const l = L.orbs;
    const n = ULT.orbs.count(l);
    u.orbAngle += dt * 3.2;
    const r = ULT.orbs.radius * areaMul(sim);
    for (let i = 0; i < n; i++) {
      const a = u.orbAngle + (i / n) * Math.PI * 2;
      const ox = p.x + Math.sin(a) * r, oz = p.z + Math.cos(a) * r;
      for (const e of sim.enemies) {
        if (e.hp <= 0 || Math.hypot(e.x - ox, e.z - oz) > e.radius + 0.55) continue;
        if ((u.orbHit.get(e.id) ?? 0) > sim.clock) continue;
        u.orbHit.set(e.id, sim.clock + 0.5);
        ultHit(sim, e, atk(sim) * ULT.orbs.dmg(l));
      }
      if (limit(l)) for (const pr of sim.projectiles) if (!pr.fromPlayer && Math.hypot(pr.x - ox, pr.z - oz) < 0.7) pr.life = 0;
    }
  }

  // 追蹤飛彈
  if (L.missiles && tick('missiles')) {
    const l = L.missiles;
    const pool = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 16);
    if (pool.length) {
      u.timers.missiles = ULT.missiles.cd(l) * cdm;
      const n = ULT.missiles.count(l);
      for (let i = 0; i < n; i++) {
        const t = pool[Math.floor(sim.rand() * pool.length)];
        const a = (i / n) * Math.PI * 2;
        u.missiles.push({ x: p.x, z: p.z, vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, target: t.id, life: 4, dmg: atk(sim) * ULT.missiles.dmg(l), hits: ULT.missiles.hits(l), done: [] });
      }
    } else u.timers.missiles = 0.5;
  }
  u.missiles = u.missiles.filter((m) => {
    m.life -= dt;
    let t = sim.enemies.find((e) => e.id === m.target && e.hp > 0);
    if (!t) {
      // next target: the nearest enemy this sword hasn't cut yet
      let best: Enemy | null = null, bd = 12;
      for (const e of sim.enemies) { if (e.hp <= 0 || m.done.includes(e.id)) continue; const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < bd) { bd = d; best = e; } }
      t = best ?? undefined;
      if (t) m.target = t.id;
    }
    if (t) {
      const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz) || 1;
      m.vx += (dx / d) * 80 * dt; m.vz += (dz / d) * 80 * dt;
      const sp = Math.hypot(m.vx, m.vz), max = 18;
      if (sp > max) { m.vx = (m.vx / sp) * max; m.vz = (m.vz / sp) * max; }
      if (d < t.radius + 0.4) {
        ultHit(sim, t, m.dmg);
        if (limit(L.missiles)) sim.explode(t.x, t.z, 1.7 * areaMul(sim), m.dmg * 0.6, false, 'frost', { noProc: true });
        sim.events.push({ type: 'swing', x: t.x, z: t.z, angle: Math.atan2(m.vx, m.vz), reach: 1.2, arc: 1.2, fx: 'frost' });
        m.done.push(t.id);
        m.target = -1;
        if (--m.hits <= 0) return false;
      }
    } else if (m.life < 3.5) return false;
    m.x += m.vx * dt; m.z += m.vz * dt;
    return m.life > 0;
  });

  // 毒沼
  if (L.poisonSwamp && tick('poisonSwamp')) {
    const l = L.poisonSwamp;
    const c = densest(sim, 3);
    if (c) {
      u.timers.poisonSwamp = ULT.poisonSwamp.cd(l) * cdm;
      sim.zones.push({ x: c.x, z: c.z, r: ULT.poisonSwamp.radius(l) * areaMul(sim), timer: ULT.poisonSwamp.dur(l), tick: 0, dmg: atk(sim) * ULT.poisonSwamp.dmg(l), kind: 'poison', slow: 0.8, burst: limit(l) ? atk(sim) * 0.8 : undefined });
    } else u.timers.poisonSwamp = 0.5;
  }

  // 地雷
  if (L.landMines) {
    const l = L.landMines;
    if (tick('landMines')) {
      u.timers.landMines = ULT.landMines.every(l);
      if (!u.mines.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 1.2)) {
        u.mines.push({ x: p.x, z: p.z, arm: 0.4 });
        if (u.mines.length > ULT.landMines.max(l)) u.mines.shift();
      }
    }
    u.mines = u.mines.filter((m) => {
      m.arm -= dt;
      if (m.arm > 0) return true;
      const e = sim.enemies.find((en) => en.hp > 0 && Math.hypot(en.x - m.x, en.z - m.z) < en.radius + 0.9);
      if (!e) return true;
      const crit = sim.rand() < value(sim.stats.crit);
      sim.explode(m.x, m.z, ULT.landMines.radius * areaMul(sim), atk(sim) * ULT.landMines.dmg(l) * (crit ? value(sim.stats.critDmg) : 1), crit, 'arcane', { noProc: true, knock: 1.5 });
      if (limit(l) && !m.again) { m.again = true; m.arm = 1.2; return true; }
      return false;
    });
  }

  // 隕石雨
  if (L.meteorShower && tick('meteorShower')) {
    const l = L.meteorShower;
    const pool = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 15);
    if (pool.length) {
      u.timers.meteorShower = ULT.meteorShower.cd(l) * cdm;
      for (let i = 0; i < ULT.meteorShower.count(l); i++) {
        const t = pool[Math.floor(sim.rand() * pool.length)];
        u.meteors.push({ x: t.x + (sim.rand() - 0.5) * 1.5, z: t.z + (sim.rand() - 0.5) * 1.5, delay: 0.7 + i * 0.15, dmg: atk(sim) * ULT.meteorShower.dmg(l) });
      }
    } else u.timers.meteorShower = 0.5;
  }
  u.meteors = u.meteors.filter((m) => {
    m.delay -= dt;
    if (m.delay > 0) return true;
    const r = ULT.meteorShower.radius * areaMul(sim);
    const crit = sim.rand() < value(sim.stats.crit);
    sim.explode(m.x, m.z, r, m.dmg * (crit ? value(sim.stats.critDmg) : 1), crit, 'fire', { noProc: true, knock: 1, elem: 'fire' });
    if (limit(L.meteorShower)) sim.zones.push({ x: m.x, z: m.z, r, timer: 3, tick: 0, dmg: m.dmg * 0.12, kind: 'fire', slow: 1 });
    return false;
  });

  // 冰封風暴
  if (L.blizzard && tick('blizzard')) {
    const l = L.blizzard;
    const r = ULT.blizzard.radius(l) * areaMul(sim);
    if (sim.enemies.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < r)) {
      u.timers.blizzard = ULT.blizzard.cd(l) * cdm;
      const freeze = ULT.blizzard.freeze(l) * (limit(l) ? 1.5 : 1);
      for (const e of sim.enemies) {
        if (Math.hypot(e.x - p.x, e.z - p.z) > r + e.radius) continue;
        ultHit(sim, e, atk(sim) * ULT.blizzard.dmg(l));
        if (e.hp > 0) sim.applyElem(e, 'frost');
        const big = isBigKind(e.kind);
        if (big && !limit(l)) continue;
        e.slowTimer = Math.max(e.slowTimer, freeze);
        e.slowMult = Math.min(e.slowMult, big ? 0.5 : 0.05);
      }
      sim.events.push({ type: 'explode', x: p.x, z: p.z, r, fx: 'frost' });
    } else u.timers.blizzard = 0.5;
  }

  // 聖光壁壘
  if (L.holyShield) {
    const l = L.holyShield;
    if (u.shield <= 0 && tick('holyShield')) {
      u.timers.holyShield = ULT.holyShield.cd(l) * cdm;
      u.shield = sim.maxHp * ULT.holyShield.shield(l);
      u.shieldTime = 10;
    }
    if (u.shield > 0) { u.shieldTime -= dt; if (u.shieldTime <= 0) breakShield(sim); }
  }

  // 吸血蝙蝠
  if (L.bats && tick('bats')) {
    const l = L.bats;
    const pool = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14);
    if (pool.length) {
      u.timers.bats = ULT.bats.cd(l) * cdm;
      const n = ULT.bats.count(l) + (limit(l) ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const t = pool[Math.floor(sim.rand() * pool.length)];
        const a = (i / n) * Math.PI * 2;
        u.bats.push({ x: p.x, z: p.z, vx: Math.sin(a) * 8, vz: Math.cos(a) * 8, target: t.id, life: 4, dmg: atk(sim) * ULT.bats.dmg(l), hits: 2, done: [] });
      }
    } else u.timers.bats = 0.5;
  }
  u.bats = u.bats.filter((b) => {
    b.life -= dt;
    let t = sim.enemies.find((e) => e.id === b.target && e.hp > 0);
    if (!t) {
      let best: Enemy | null = null, bd = 10;
      for (const e of sim.enemies) { if (e.hp <= 0 || b.done.includes(e.id)) continue; const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < bd) { bd = d; best = e; } }
      t = best ?? undefined;
      if (t) b.target = t.id;
    }
    if (!t) return b.life > 3.4;
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
    // bats flutter: steer towards the target with a little wobble
    b.vx += ((dx / d) * 60 + Math.sin(sim.clock * 20 + b.target) * 25) * dt; b.vz += ((dz / d) * 60 + Math.cos(sim.clock * 20 + b.target) * 25) * dt;
    const sp = Math.hypot(b.vx, b.vz), max = 14;
    if (sp > max) { b.vx = (b.vx / sp) * max; b.vz = (b.vz / sp) * max; }
    if (d < t.radius + 0.4) {
      ultHit(sim, t, b.dmg);
      p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * ULT.bats.heal * (limit(L.bats) ? 2 : 1));
      b.done.push(t.id); b.target = -1;
      if (--b.hits <= 0) return false;
    }
    b.x += b.vx * dt; b.z += b.vz * dt;
    return b.life > 0;
  });

  // 雷霆圖騰
  if (L.thunderTotem && tick('thunderTotem')) {
    const l = L.thunderTotem;
    if (sim.enemies.length) {
      u.timers.thunderTotem = ULT.thunderTotem.cd(l) * cdm;
      const n = limit(l) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = sim.rand() * Math.PI * 2;
        u.totems.push({ x: p.x + Math.sin(a) * 1.8, z: p.z + Math.cos(a) * 1.8, life: ULT.thunderTotem.dur, tick: 0.3 });
      }
    } else u.timers.thunderTotem = 0.5;
  }
  u.totems = u.totems.filter((tt) => {
    tt.life -= dt; tt.tick -= dt;
    if (tt.tick <= 0) {
      tt.tick = 0.6;
      const l = L.thunderTotem ?? 1;
      const range = ULT.thunderTotem.range * areaMul(sim);
      const near = sim.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - tt.x, e.z - tt.z) < range).sort((a, b) => Math.hypot(a.x - tt.x, a.z - tt.z) - Math.hypot(b.x - tt.x, b.z - tt.z)).slice(0, ULT.thunderTotem.targets(l));
      for (const e of near) { ultHit(sim, e, atk(sim) * ULT.thunderTotem.dmg(l)); if (e.hp > 0) sim.applyElem(e, 'shock'); sim.events.push({ type: 'lightning', pts: [tt.x, tt.z, e.x, e.z] }); }
    }
    return tt.life > 0;
  });

  u.vengeanceCd = Math.max(0, u.vengeanceCd - dt);

  sim.enemies = sim.enemies.filter((e) => e.hp > 0);
}

/** 聖光壁壘 breaks (used up or timed out): holy blast around you. */
function breakShield(sim: Sim): void {
  const u = sim.ult, l = u.levels.holyShield ?? 1, p = sim.player;
  u.shield = 0;
  const crit = sim.rand() < value(sim.stats.crit);
  sim.explode(p.x, p.z, ULT.holyShield.radius * areaMul(sim), atk(sim) * ULT.holyShield.dmg(l) * (crit ? value(sim.stats.critDmg) : 1), crit, 'holy', { noProc: true, knock: 2 });
  if (limit(l)) p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * 0.15);
}

/** Called when the player takes damage (after defence): the shield soaks it, 復仇之魂 strikes back. Returns damage left. */
export function ultOnHurt(sim: Sim, dmg: number): number {
  const u = sim.ult, p = sim.player;
  if (u.levels.vengeance && u.vengeanceCd <= 0) {
    const l = u.levels.vengeance;
    u.vengeanceCd = ULT.vengeance.cd(l);
    const crit = sim.rand() < value(sim.stats.crit);
    sim.explode(p.x, p.z, ULT.vengeance.radius(l) * areaMul(sim), atk(sim) * ULT.vengeance.dmg(l) * (crit ? value(sim.stats.critDmg) : 1), crit, 'shadow', { noProc: true, knock: 1.5 });
    if (limit(l)) p.invuln = Math.max(p.invuln, 1);
  }
  if (u.shield > 0) {
    const soak = Math.min(u.shield, dmg);
    u.shield -= soak;
    dmg -= soak;
    if (u.shield <= 0) breakShield(sim);
  }
  return dmg;
}

/** 連鎖閃電: called when one of your own hits lands (not from procs). */
export function chainLightning(sim: Sim, from: Enemy, again = false, scale = 1): void {
  const l = sim.ult.levels.chainLightning;
  if (!l || (!again && sim.rand() >= ULT.chainLightning.chance(l) * scale)) return;
  const hit = new Set<number>([from.id]);
  const pts: number[] = [from.x, from.z];
  let cur = from;
  const dmg = atk(sim) * ULT.chainLightning.dmg(l);
  for (let j = 0; j < ULT.chainLightning.jumps(l); j++) {
    let next: Enemy | null = null, bd = 6;
    for (const e of sim.enemies) {
      if (e.hp <= 0 || hit.has(e.id)) continue;
      const d = Math.hypot(e.x - cur.x, e.z - cur.z);
      if (d < bd) { bd = d; next = e; }
    }
    if (!next) break;
    hit.add(next.id);
    pts.push(next.x, next.z);
    ultHit(sim, next, dmg);
    if (next.hp > 0) sim.applyElem(next, 'shock');
    cur = next;
  }
  if (pts.length > 2) sim.events.push({ type: 'lightning', pts });
  if (limit(l) && !again && sim.rand() < 0.5) strikeAgain(sim, cur);
}

function strikeAgain(sim: Sim, from: Enemy): void { chainLightning(sim, from, true); }

/** Called when one of your own attacks lands (not from procs): every on-hit ultimate rolls its chance. */
/** On-hit ultimates. scale < 1 for hits that aren't yours (your undead). */
export function ultOnHit(sim: Sim, e: Enemy, scale = 1): void {
  const L = sim.ult.levels;
  if (L.chainLightning) chainLightning(sim, e, false, scale);
  const roll = (c: number) => sim.rand() < c * scale;
  const critMul = () => { const c = sim.rand() < value(sim.stats.crit); return { c, m: c ? value(sim.stats.critDmg) : 1 }; };
  if (L.flameBurst && roll(ULT.flameBurst.chance(L.flameBurst))) {
    const l = L.flameBurst, r = ULT.flameBurst.radius(l) * areaMul(sim), { c, m } = critMul();
    sim.explode(e.x, e.z, r, atk(sim) * ULT.flameBurst.dmg(l) * m, c, 'fire', { noProc: true, elem: 'fire' });
    if (limit(l)) sim.zones.push({ x: e.x, z: e.z, r, timer: 2, tick: 0, dmg: atk(sim) * 0.3, kind: 'fire', slow: 1 });
  }
  if (L.frostTouch && roll(ULT.frostTouch.chance(L.frostTouch))) {
    const l = L.frostTouch, r = ULT.frostTouch.radius(l) * areaMul(sim), { c, m } = critMul();
    const freeze = ULT.frostTouch.freeze(l);
    for (const o of sim.enemies) {
      if (o.hp <= 0 || Math.hypot(o.x - e.x, o.z - e.z) > r + o.radius || isBigKind(o.kind)) continue;
      o.slowTimer = Math.max(o.slowTimer, freeze); o.slowMult = Math.min(o.slowMult, 0.05);
      if (limit(l)) o.chrono = Math.max(o.chrono ?? 0, freeze); // frozen = takes more damage
    }
    sim.explode(e.x, e.z, r, atk(sim) * ULT.frostTouch.dmg(l) * m, c, 'frost', { noProc: true, elem: 'frost' });
  }
  if (L.shadowStrike && roll(ULT.shadowStrike.chance(L.shadowStrike))) {
    const l = L.shadowStrike;
    const pool = sim.enemies.filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.z - e.z) < 9).sort(() => sim.rand() - 0.5).slice(0, ULT.shadowStrike.hits(l));
    for (const o of pool) {
      const c = limit(l) || sim.rand() < value(sim.stats.crit);
      sim.damageEnemy(o, atk(sim) * ULT.shadowStrike.dmg(l) * (c ? value(sim.stats.critDmg) : 1), c, true);
      sim.events.push({ type: 'swing', x: o.x, z: o.z, angle: sim.rand() * Math.PI * 2, reach: 1.1, arc: 1.4, fx: 'shadow' });
    }
  }
  if (L.holySmite && roll(ULT.holySmite.chance(L.holySmite)) && e.hp > 0) {
    const l = L.holySmite, { c, m } = critMul();
    const boss = limit(l) && isBigKind(e.kind) ? 2 : 1;
    sim.damageEnemy(e, atk(sim) * ULT.holySmite.dmg(l) * m * boss, c, true);
    sim.events.push({ type: 'explode', x: e.x, z: e.z, r: 1.3, fx: 'holy' });
  }
}
