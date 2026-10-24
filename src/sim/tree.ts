// Diablo-4-style skill trees: per class, 5 tiers opened by points spent in the tree.
// Actives (rank 1-5) → 強化 (enhancement) → pick one of two 變化 (modifiers). Passives rank 1-3.
// Points come from class level (1 per level). Up to TREE_EQUIP actives are cast automatically.
import { tr } from '../i18n';
import type { ClassId } from './classes';
import type { StatKey } from './stats';
import type { AutoSkillId, UniqueId } from './skills';
import { UNIQUE_DESC } from './skills';
import { MIX_MECH, mechDesc } from './mixmech';

export const TREE_TIERS = [0, 5, 12, 20, 30]; // points spent in this tree to open tiers 1..5
export const TREE_EQUIP = 4; // active skills cast at once
export const ACTIVE_MAX = 5;
/** Classes that already use the new tree (the rest keep the old skill boards for now). */
export const TREE_CLASSES: ClassId[] = ['warrior', 'archer', 'mage', 'necro'];

/** Shared 變化 effects (archer / mage / necro trees). Warrior's are hand-made in the sim. */
export type ModCode = 'echo' | 'power' | 'heal' | 'shield' | 'cdr' | 'buff' | 'invuln' | 'mark' | 'slow' | 'nova'
  | 'b_crit' | 'b_nth3' | 'b_extra4' | 'b_mark' | 'b_heal' | 'b_move' | 'b_slow';
export interface TreeMod { name: string; desc: string; code?: ModCode }
/** How an active is cast: an old auto skill (scaled through ATK) or a Signature-style skill. */
export type TreeCast = { auto: AutoSkillId } | { sig: string; base?: number } | { autos: [AutoSkillId, AutoSkillId] };
/** A generic basic attack (ranged / summon): attack speed, damage, side shots. */
export interface BasicSpec { speed: number; mult: number; enhMult: number; side?: number; sideMult?: number; enhSide?: number; summon?: boolean; drain?: number; curse?: boolean }
export interface TreeSkill {
  id: string;
  name: string;
  icon: string;
  kind: 'active' | 'passive' | 'basic'; // basic = your normal attack (pick one)
  tier: number; // 0 = basic attacks (always open), 1..5
  max: number; // max rank
  cd?: number; // actives: cooldown (s)
  desc: (rank: number) => string; // what it does at this rank
  enh?: TreeMod; // actives: enhancement (needs max rank)
  mods?: [TreeMod, TreeMod]; // actives: pick one (needs the enhancement)
  // passives: what each rank gives
  stat?: { stat: StatKey; pct?: number; flat?: number };
  pass?: 'rage' | 'healOnKill' | 'lastStand' | 'thorns' | 'cdr' | 'overlord' | 'mixPow';
  pow?: number; // 混合層 奧義: damage per rank
  cast?: TreeCast; // generic actives
  stat2?: { stat: StatKey; pct?: number; flat?: number }; // 混合層 passives: a second stat
  uniq?: UniqueId; // 混合層 passive: a special effect
  bs?: BasicSpec; // generic basics
}

/** Rank scaling for active damage: rank 1 = ×1, each rank +20%. */
export const rankMult = (rank: number) => 1 + 0.2 * (Math.max(1, rank) - 1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dmgTxt = (base: number, rank: number) => pct(base * rankMult(rank));

const WARRIOR: TreeSkill[] = [
  // ---------- 基本攻擊 (pick one: it replaces your normal swing) ----------
  { id: 'wb_slash', name: tr('斬擊', 'Slash'), icon: '🗡️', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`普通扇形斬擊，傷害 ${pct(bRank(r))}`, `Normal arc slash, ${pct(bRank(r))} damage`),
    enh: { name: tr('斬擊強化', 'Slash+'), desc: tr('斬擊角度 +30%', '+30% arc') },
    mods: [{ name: tr('迴旋斬', 'Spin Slash'), desc: tr('每第 4 下變成一整圈', 'Every 4th swing hits all around') },
      { name: tr('吸血斬', 'Leech Slash'), desc: tr('每斬中一隻回 0.3% HP（每下最多 2%）', 'Heal 0.3% HP per enemy hit (up to 2% a swing)') }] },
  { id: 'wb_thrust', name: tr('突刺', 'Thrust'), icon: '🔱', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`窄而長嘅直刺（射程 +60%），傷害 ${pct(1.4 * bRank(r))}`, `A long, narrow thrust (+60% reach), ${pct(1.4 * bRank(r))} damage`),
    enh: { name: tr('突刺強化', 'Thrust+'), desc: tr('再長 30%，傷害 +20%', '30% longer, +20% damage') },
    mods: [{ name: tr('致命突刺', 'Lethal Thrust'), desc: tr('暴擊率 +20%（只限突刺）', '+20% crit chance on thrusts') },
      { name: tr('破綻', 'Opening'), desc: tr('刺中嘅敵人 2 秒受傷 +50%', 'Enemies hit take +50% damage for 2s') }] },
  { id: 'wb_bash', name: tr('猛擊', 'Bash'), icon: '🔨', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`慢啲（攻速 ×0.67）但重好多，傷害 ${pct(2 * bRank(r))}`, `Slower (×0.67 attack speed) but much heavier: ${pct(2 * bRank(r))} damage`),
    enh: { name: tr('猛擊強化', 'Bash+'), desc: tr('細怪定身 0.5 秒', 'Stuns small enemies for 0.5s') },
    mods: [{ name: tr('震波', 'Shockwave'), desc: tr('每下喺目標位置再爆一圈（60%）', 'Each hit also blasts around the target (60%)') },
      { name: tr('重錘', 'Crusher'), desc: tr('每第 3 下必定暴擊', 'Every 3rd hit is a guaranteed crit') }] },
  { id: 'wb_flurry', name: tr('連斬', 'Flurry'), icon: '⚡', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`快好多（攻速 ×1.6）但輕啲，傷害 ${pct(0.6 * bRank(r))}`, `Much faster (×1.6 attack speed) but lighter: ${pct(0.6 * bRank(r))} damage`),
    enh: { name: tr('連斬強化', 'Flurry+'), desc: tr('傷害 +20%', '+20% damage') },
    mods: [{ name: tr('終結斬', 'Finisher'), desc: tr('每第 5 下再加一記重斬（150%）', 'Every 5th hit adds a heavy slash (150%)') },
      { name: tr('疾風', 'Swift'), desc: tr('移速 +15%', '+15% move speed') }] },
  // ---------- tier 1 ----------
  { id: 'w_cleave', name: tr('重斬', 'Cleave'), icon: '🪓', kind: 'active', tier: 1, max: ACTIVE_MAX, cd: 3.5,
    desc: (r) => tr(`向前大範圍重斬，傷害 ${dmgTxt(2.2, r)}`, `A wide heavy cleave in front: ${dmgTxt(2.2, r)} damage`),
    enh: { name: tr('重斬強化', 'Cleave+'), desc: tr('傷害 +40%，擊退細怪', '+40% damage, knocks small enemies back') },
    mods: [{ name: tr('嗜血重斬', 'Bloody Cleave'), desc: tr('每斬中一隻敵人回 1% HP（最多 8%）', 'Heal 1% HP per enemy hit (up to 8%)') },
      { name: tr('雙重斬', 'Double Cleave'), desc: tr('隔 0.3 秒再斬多一下（60%）', 'A second cleave 0.3s later (60%)') }] },
  { id: 'w_warcry', name: tr('戰吼', 'War Cry'), icon: '📢', kind: 'active', tier: 1, max: ACTIVE_MAX, cd: 10,
    desc: (r) => tr(`震傷身邊敵人（${dmgTxt(1, r)}）兼減速；之後 5 秒你所有傷害 +${Math.round(15 + 5 * r)}%`, `Shout: ${dmgTxt(1, r)} damage around you and slow; your damage +${Math.round(15 + 5 * r)}% for 5s`),
    enh: { name: tr('戰吼強化', 'War Cry+'), desc: tr('範圍 +30%，加成維持 8 秒', '+30% radius; the buff lasts 8s') },
    mods: [{ name: tr('鼓舞', 'Rally'), desc: tr('同時回復 10% HP', 'Also heals 10% HP') },
      { name: tr('恐嚇', 'Terrify'), desc: tr('範圍內敵人 5 秒受傷 +50%', 'Enemies hit take +50% damage for 5s') }] },
  { id: 'w_str', name: tr('力量', 'Strength'), icon: '💪', kind: 'passive', tier: 1, max: 3, stat: { stat: 'atk', pct: 0.06 },
    desc: (r) => tr(`攻擊 +${6 * r}%`, `ATK +${6 * r}%`) },
  { id: 'w_fort', name: tr('堅毅', 'Fortitude'), icon: '❤️', kind: 'passive', tier: 1, max: 3, stat: { stat: 'maxHp', pct: 0.08 },
    desc: (r) => tr(`最大 HP +${8 * r}%`, `Max HP +${8 * r}%`) },
  // ---------- tier 2 ----------
  { id: 'w_whirl', name: tr('旋風斬', 'Whirlwind'), icon: '🌀', kind: 'active', tier: 2, max: ACTIVE_MAX, cd: 5,
    desc: (r) => tr(`轉身斬一整圈（${dmgTxt(1.8, r)}）`, `Spin and slash all around (${dmgTxt(1.8, r)})`),
    enh: { name: tr('旋風斬強化', 'Whirlwind+'), desc: tr('範圍 +25%，傷害 +30%', '+25% radius, +30% damage') },
    mods: [{ name: tr('旋風之怒', 'Cyclone'), desc: tr('連轉 3 圈（每圈 70%）', 'Spin 3 times (70% each)') },
      { name: tr('吸血旋風', 'Leeching Spin'), desc: tr('每斬中一隻回 0.6% HP（最多 10%）', 'Heal 0.6% HP per enemy hit (up to 10%)') }] },
  { id: 'w_charge', name: tr('衝鋒', 'Charge'), icon: '🔱', kind: 'active', tier: 2, max: ACTIVE_MAX, cd: 7,
    desc: (r) => tr(`向最近敵人衝刺，撞中路上所有敵人（${dmgTxt(2.5, r)}）`, `Dash at the nearest enemy, hitting everything in the path (${dmgTxt(2.5, r)})`),
    enh: { name: tr('衝鋒強化', 'Charge+'), desc: tr('衝得更遠，傷害 +40%', 'Longer dash, +40% damage') },
    mods: [{ name: tr('衝擊波', 'Shockwave'), desc: tr('衝到盡頭爆一圈衝擊波（200%）', 'A shockwave where you stop (200%)') },
      { name: tr('無畏', 'Fearless'), desc: tr('衝鋒時同之後 1.2 秒無敵', 'Invulnerable during and 1.2s after the dash') }] },
  { id: 'w_blood', name: tr('嗜血', 'Bloodlust'), icon: '🩸', kind: 'passive', tier: 2, max: 3, pass: 'healOnKill',
    desc: (r) => tr(`每殺一隻敵人回 ${(0.4 * r).toFixed(1)}% HP`, `Heal ${(0.4 * r).toFixed(1)}% HP per kill`) },
  { id: 'w_armor', name: tr('重甲', 'Heavy Armour'), icon: '🛡️', kind: 'passive', tier: 2, max: 3, stat: { stat: 'def', pct: 0.12 },
    desc: (r) => tr(`防禦 +${12 * r}%`, `DEF +${12 * r}%`) },
  // ---------- tier 3 ----------
  { id: 'w_slam', name: tr('震地', 'Ground Slam'), icon: '💢', kind: 'active', tier: 3, max: ACTIVE_MAX, cd: 8,
    desc: (r) => tr(`重擊地面，大範圍傷害（${dmgTxt(2.4, r)}）兼擊退`, `Smash the ground: big area damage (${dmgTxt(2.4, r)}) and knockback`),
    enh: { name: tr('震地強化', 'Slam+'), desc: tr('範圍 +35%，傷害 +50%', '+35% radius, +50% damage') },
    mods: [{ name: tr('餘震', 'Aftershock'), desc: tr('0.6 秒後再震多一次（60%）', 'A second quake 0.6s later (60%)') },
      { name: tr('震暈', 'Stagger'), desc: tr('細怪定身 1.5 秒', 'Small enemies are stunned for 1.5s') }] },
  { id: 'w_wall', name: tr('鐵壁', 'Iron Wall'), icon: '🧱', kind: 'active', tier: 3, max: ACTIVE_MAX, cd: 14,
    desc: (r) => tr(`即刻得到 ${20 + 3 * r}% 最大 HP 嘅護盾`, `Gain a shield of ${20 + 3 * r}% max HP at once`),
    enh: { name: tr('鐵壁強化', 'Iron Wall+'), desc: tr('護盾 +10% 最大 HP', 'Shield +10% max HP') },
    mods: [{ name: tr('反震', 'Backlash'), desc: tr('開盾時震傷身邊敵人（150%）', 'Blast nearby enemies when cast (150%)') },
      { name: tr('再生', 'Renewal'), desc: tr('同時回復 12% HP', 'Also heals 12% HP') }] },
  { id: 'w_rage', name: tr('狂怒', 'Rage'), icon: '😤', kind: 'passive', tier: 3, max: 3, pass: 'rage',
    desc: (r) => tr(`HP 低過 50% 時傷害 +${12 * r}%`, `+${12 * r}% damage while below 50% HP`) },
  { id: 'w_stand', name: tr('不屈', 'Last Stand'), icon: '🛡️', kind: 'passive', tier: 3, max: 2, pass: 'lastStand',
    desc: (r) => tr(`每張地圖一次：受到致命傷害時唔死，回復 ${r >= 2 ? 60 : 30}% HP`, `Once per map: survive a killing blow and heal ${r >= 2 ? 60 : 30}% HP`) },
  // ---------- tier 4 ----------
  { id: 'w_storm', name: tr('劍刃風暴', 'Blade Storm'), icon: '🌪️', kind: 'active', tier: 4, max: ACTIVE_MAX, cd: 12,
    desc: (r) => tr(`${(2.5 + 0.25 * r).toFixed(1)} 秒內不停旋轉斬擊身邊所有敵人`, `Spin for ${(2.5 + 0.25 * r).toFixed(1)}s, slashing everything around you`),
    enh: { name: tr('劍刃風暴強化', 'Blade Storm+'), desc: tr('多轉 1.5 秒', '1.5s longer') },
    mods: [{ name: tr('鋒刃', 'Razor'), desc: tr('風暴傷害 +60%', 'Storm damage +60%') },
      { name: tr('不動如山', 'Immovable'), desc: tr('旋轉時受到傷害 -60%', 'Take 60% less damage while spinning') }] },
  { id: 'w_thorns', name: tr('荊棘', 'Thorns'), icon: '🌵', kind: 'passive', tier: 4, max: 1, pass: 'thorns',
    desc: () => tr('敵人撞到你會受到反傷', 'Enemies touching you take damage') },
  { id: 'w_focus', name: tr('戰意', 'Battle Focus'), icon: '⏱️', kind: 'passive', tier: 4, max: 3, pass: 'cdr',
    desc: (r) => tr(`技能冷卻 -${6 * r}%`, `Skill cooldowns -${6 * r}%`) },
  // ---------- tier 5 ----------
  { id: 'w_avatar', name: tr('戰神降臨', 'Avatar of War'), icon: '⚔️', kind: 'active', tier: 5, max: ACTIVE_MAX, cd: 25,
    desc: (r) => tr(`${6 + r} 秒內傷害 ×1.5、攻速 ×1.5`, `For ${6 + r}s: damage ×1.5 and attack speed ×1.5`),
    enh: { name: tr('戰神降臨強化', 'Avatar+'), desc: tr('多 3 秒，開始時回 20% HP', '3s longer; heals 20% HP when it starts') },
    mods: [{ name: tr('天神下凡', 'Godlike'), desc: tr('傷害改為 ×1.8', 'Damage ×1.8 instead') },
      { name: tr('不死戰神', 'Undying'), desc: tr('期間 HP 唔會跌到 1 以下', 'HP cannot drop below 1 while it lasts') }] },
  { id: 'w_overlord', name: tr('霸王', 'Overlord'), icon: '👑', kind: 'passive', tier: 5, max: 3, pass: 'overlord',
    desc: (r) => tr(`攻擊 +${10 * r}%、暴擊傷害 +${20 * r}%`, `ATK +${10 * r}%, crit damage +${20 * r}%`) },
];


// ---------- shared pieces for the archer / mage / necro trees ----------
const MODS: Record<ModCode, () => TreeMod> = {
  echo: () => ({ code: 'echo', name: tr('回響', 'Echo'), desc: tr('0.5 秒後再放多一次（60%）', 'Casts again 0.5s later (60%)') }),
  power: () => ({ code: 'power', name: tr('專注', 'Focus'), desc: tr('傷害 +50%', '+50% damage') }),
  heal: () => ({ code: 'heal', name: tr('汲取', 'Siphon'), desc: tr('放嘅時候回 10% HP', 'Heals 10% HP when cast') }),
  shield: () => ({ code: 'shield', name: tr('護體', 'Ward'), desc: tr('放嘅時候得到 15% 最大 HP 護盾', 'Gain a 15% max HP shield when cast') }),
  cdr: () => ({ code: 'cdr', name: tr('迅捷', 'Swift'), desc: tr('冷卻 -30%', '-30% cooldown') }),
  buff: () => ({ code: 'buff', name: tr('激昂', 'Exalt'), desc: tr('之後 5 秒你所有傷害 +25%', 'All your damage +25% for 5s') }),
  invuln: () => ({ code: 'invuln', name: tr('幻步', 'Phase'), desc: tr('放嘅時候無敵 1.2 秒', 'Invulnerable for 1.2s when cast') }),
  mark: () => ({ code: 'mark', name: tr('弱點', 'Expose'), desc: tr('目標附近嘅敵人 4 秒受傷 +50%', 'Enemies near the target take +50% damage for 4s') }),
  slow: () => ({ code: 'slow', name: tr('冰封', 'Chill'), desc: tr('目標附近嘅敵人大幅減速 3 秒', 'Enemies near the target are heavily slowed for 3s') }),
  nova: () => ({ code: 'nova', name: tr('爆發', 'Burst'), desc: tr('同時喺你身邊爆一圈（120%）', 'Also blasts around you (120%)') }),
  b_crit: () => ({ code: 'b_crit', name: tr('精準', 'Precise'), desc: tr('暴擊率 +20%（只限普攻）', '+20% crit chance on basic attacks') }),
  b_nth3: () => ({ code: 'b_nth3', name: tr('致命', 'Lethal'), desc: tr('每第 3 下必定暴擊', 'Every 3rd attack is a guaranteed crit') }),
  b_extra4: () => ({ code: 'b_extra4', name: tr('連發', 'Follow-up'), desc: tr('每第 4 下多放一次', 'Every 4th attack fires twice') }),
  b_mark: () => ({ code: 'b_mark', name: tr('破綻', 'Opening'), desc: tr('目標 2 秒受傷 +50%', 'The target takes +50% damage for 2s') }),
  b_heal: () => ({ code: 'b_heal', name: tr('汲血', 'Leech'), desc: tr('每下回 0.4% HP', 'Heal 0.4% HP per attack') }),
  b_move: () => ({ code: 'b_move', name: tr('疾風', 'Swift'), desc: tr('移速 +15%', '+15% move speed') }),
  b_slow: () => ({ code: 'b_slow', name: tr('凍結', 'Frostbite'), desc: tr('目標減速 1.5 秒', 'Slows the target for 1.5s') }),
};
const bRank = (r: number) => 1 + 0.05 * (r - 1);
/** Generic basic attack. */
const B = (id: string, name: [string, string], icon: string, bs: BasicSpec, what: [string, string], enh: [string, string], m0: ModCode, m1: ModCode): TreeSkill => ({
  id, name: tr(name[0], name[1]), icon, kind: 'basic', tier: 0, max: ACTIVE_MAX, bs,
  desc: (r) => tr(`${what[0]}，傷害 ${pct(bs.mult * bRank(r))}`, `${what[1]}: ${pct(bs.mult * bRank(r))} damage`),
  enh: { name: tr(`${name[0]}強化`, `${name[1]}+`), desc: tr(enh[0], enh[1]) }, mods: [MODS[m0](), MODS[m1]()],
});
/** Generic active: rank +20% power each, 強化 = the upgraded (awakened) version and +30% damage. */
const A = (id: string, name: [string, string], icon: string, tier: number, cd: number, cast: TreeCast, what: [string, string], m0: ModCode, m1: ModCode): TreeSkill => ({
  id, name: tr(name[0], name[1]), icon, kind: 'active', tier, max: ACTIVE_MAX, cd, cast,
  desc: (r) => tr(`${what[0]}（威力 ${pct(rankMult(r))}）`, `${what[1]} (power ${pct(rankMult(r))})`),
  enh: { name: tr(`${name[0]}強化`, `${name[1]}+`), desc: tr('變成強化版（範圍 / 數量更多），傷害 +30%', 'Becomes the upgraded version (bigger / more), +30% damage') },
  mods: [MODS[m0](), MODS[m1]()],
});
const P = (id: string, name: [string, string], icon: string, tier: number, max: number, how: Pick<TreeSkill, 'stat' | 'pass'>, desc: (r: number) => string): TreeSkill =>
  ({ id, name: tr(name[0], name[1]), icon, kind: 'passive', tier, max, ...how, desc });
const statP = (id: string, name: [string, string], icon: string, tier: number, stat: StatKey, step: number, label: [string, string], flat = false): TreeSkill =>
  P(id, name, icon, tier, 3, { stat: flat ? { stat, flat: step } : { stat, pct: step } }, (r) => tr(`${label[0]} +${Math.round(step * 100 * r)}%`, `${label[1]} +${Math.round(step * 100 * r)}%`));
const healP = (id: string, name: [string, string], tier: number) => P(id, name, '🩸', tier, 3, { pass: 'healOnKill' }, (r) => tr(`每殺一隻敵人回 ${(0.4 * r).toFixed(1)}% HP`, `Heal ${(0.4 * r).toFixed(1)}% HP per kill`));
const cdrP = (id: string, tier: number) => P(id, ['專注', 'Focus'], '⏱️', tier, 3, { pass: 'cdr' }, (r) => tr(`技能冷卻 -${6 * r}%`, `Skill cooldowns -${6 * r}%`));
const standP = (id: string, tier: number) => P(id, ['不屈', 'Last Stand'], '🛡️', tier, 2, { pass: 'lastStand' }, (r) => tr(`每張地圖一次：受到致命傷害時唔死，回復 ${r >= 2 ? 60 : 30}% HP`, `Once per map: survive a killing blow and heal ${r >= 2 ? 60 : 30}% HP`));
const lordP = (id: string, name: [string, string], icon: string) => P(id, name, icon, 5, 3, { pass: 'overlord' }, (r) => tr(`攻擊 +${10 * r}%、暴擊傷害 +${20 * r}%`, `ATK +${10 * r}%, crit damage +${20 * r}%`));

const ARCHER: TreeSkill[] = [
  B('ab_shot', ['射擊', 'Shot'], '🏹', { speed: 1, mult: 1, enhMult: 1.15 }, ['普通射擊', 'A normal shot'], ['傷害 +15%', '+15% damage'], 'b_crit', 'b_extra4'),
  B('ab_power', ['強力射擊', 'Power Shot'], '🎯', { speed: 0.7, mult: 1.8, enhMult: 1.15 }, ['慢啲（攻速 ×0.7）但重好多', 'Slower (×0.7 attack speed) but much heavier'], ['傷害 +15%', '+15% damage'], 'b_nth3', 'b_mark'),
  B('ab_rapid', ['速射', 'Rapid Fire'], '⚡', { speed: 1.5, mult: 0.65, enhMult: 1.1 }, ['快好多（攻速 ×1.5）但輕啲', 'Much faster (×1.5 attack speed) but lighter'], ['傷害 +10%', '+10% damage'], 'b_extra4', 'b_move'),
  B('ab_split', ['分裂箭', 'Split Arrow'], '🪶', { speed: 1, mult: 0.75, enhMult: 1, side: 2, sideMult: 0.5, enhSide: 2 }, ['中間一枝再加左右各一枝（50%）', 'One arrow plus one on each side (50%)'], ['多 2 枝側箭', '2 more side arrows'], 'b_crit', 'b_slow'),
  A('a_rain', ['箭雨', 'Arrow Rain'], '🌧️', 1, 6, { auto: 'arrowRain' }, ['喺目標位置落一場箭雨，減速', 'Arrows rain on the target area and slow'], 'echo', 'slow'),
  A('a_fan', ['疾風箭', 'Gale Arrows'], '🪶', 1, 5, { auto: 'arrowFan' }, ['向前扇形射出一排穿透箭', 'A fan of piercing arrows'], 'power', 'cdr'),
  statP('a_agi', ['敏捷', 'Agility'], '💨', 1, 'atkSpeed', 0.05, ['攻速', 'Attack speed']),
  statP('a_eye', ['銳眼', 'Keen Eye'], '👁️', 1, 'crit', 0.03, ['暴擊率', 'Crit rate'], true),
  A('a_snare', ['束縛陷阱', 'Snare Trap'], '🪤', 2, 8, { auto: 'snare' }, ['喺目標位置放陷阱，定住敵人', 'A trap that roots enemies at the target'], 'mark', 'echo'),
  A('a_markp', ['獵殺標記', 'Mark Prey'], '🎯', 2, 18, { sig: 'markPrey' }, ['標記最強嘅敵人（受傷增加）並向佢連射', 'Mark the strongest enemy (takes more damage) and fire a burst at it'], 'buff', 'power'),
  healP('a_hunt', ['獵人本能', 'Hunter'], 2),
  statP('a_swift', ['輕身', 'Fleet'], '👟', 2, 'moveSpeed', 0.06, ['移速', 'Move speed']),
  A('a_snipe', ['狙擊', 'Snipe'], '🔭', 3, 10, { sig: 'snipe' }, ['一枝超重穿透箭射向最強敵人', 'One huge piercing arrow at the strongest enemy'], 'power', 'mark'),
  A('a_barrier', ['護盾術', 'Barrier'], '🔰', 3, 12, { auto: 'barrier' }, ['短暫無敵兼回少少 HP', 'Brief invulnerability and a small heal'], 'shield', 'nova'),
  statP('a_deadly', ['致命', 'Deadly'], '💥', 3, 'critDmg', 0.1, ['暴擊傷害', 'Crit damage'], true),
  cdrP('a_focus', 3),
  A('a_storm', ['箭暴', 'Arrow Storm'], '🌪️', 4, 12, { sig: 'arrowStorm' }, ['向四周射出一整圈箭', 'Arrows in every direction'], 'echo', 'buff'),
  statP('a_range', ['遠望', 'Far Sight'], '🔭', 4, 'range', 0.08, ['射程', 'Range']),
  standP('a_stand', 4),
  A('a_sky', ['天墜', 'Skyfall'], '☄️', 5, 18, { sig: 'skyfall' }, ['大量箭矢從天而降，覆蓋目標四周', 'A storm of arrows falls all around the target'], 'power', 'cdr'),
  lordP('a_lord', ['鷹王', 'Eagle Lord'], '🦅'),
];

const MAGE: TreeSkill[] = [
  B('mb_bolt', ['法彈', 'Spell'], '🔥', { speed: 1, mult: 1, enhMult: 1.15 }, ['普通施法', 'A normal cast'], ['傷害 +15%', '+15% damage'], 'b_crit', 'b_slow'),
  B('mb_charged', ['蓄能', 'Charged'], '🔮', { speed: 0.6, mult: 2, enhMult: 1.15 }, ['慢好多（攻速 ×0.6）但重好多', 'Much slower (×0.6 attack speed) but much heavier'], ['傷害 +15%', '+15% damage'], 'b_nth3', 'b_mark'),
  B('mb_rapid', ['速唱', 'Quickcast'], '⚡', { speed: 1.6, mult: 0.6, enhMult: 1.1 }, ['快好多（攻速 ×1.6）但輕啲', 'Much faster (×1.6 attack speed) but lighter'], ['傷害 +10%', '+10% damage'], 'b_extra4', 'b_heal'),
  B('mb_split', ['分裂法彈', 'Split Spell'], '✨', { speed: 1, mult: 0.75, enhMult: 1, side: 2, sideMult: 0.5, enhSide: 2 }, ['中間一發再加左右各一發（50%）', 'One spell plus one on each side (50%)'], ['多 2 發側彈', '2 more side spells'], 'b_crit', 'b_slow'),
  A('m_nova', ['冰霜新星', 'Frost Nova'], '❄️', 1, 7, { auto: 'frostNova' }, ['身邊爆出冰環，減速', 'A ring of frost around you that slows'], 'shield', 'echo'),
  A('m_meteor', ['隕石', 'Meteor'], '☄️', 1, 9, { auto: 'meteor' }, ['一粒隕石砸向目標', 'A meteor crashes on the target'], 'power', 'echo'),
  statP('m_int', ['智力', 'Intellect'], '🧠', 1, 'atk', 0.1, ['攻擊', 'ATK']),
  statP('m_area', ['擴散', 'Expanse'], '🌀', 1, 'area', 0.2, ['範圍', 'Area']),
  A('m_warp', ['時間扭曲', 'Time Warp'], '⏳', 2, 14, { auto: 'timeWarp' }, ['大範圍減慢敵人', 'Slows enemies in a huge area'], 'mark', 'cdr'),
  A('m_barrier', ['護盾術', 'Barrier'], '🔰', 2, 12, { auto: 'barrier' }, ['短暫無敵兼回少少 HP', 'Brief invulnerability and a small heal'], 'shield', 'nova'),
  healP('m_siphon', ['魔力汲取', 'Mana Siphon'], 2),
  statP('m_fort', ['魔障', 'Arcane Skin'], '❤️', 2, 'maxHp', 0.12, ['最大 HP', 'Max HP']),
  A('m_burst', ['奧術爆發', 'Arcane Burst'], '💫', 3, 12, { sig: 'arcaneBurst' }, ['喺附近最強嘅幾隻敵人身上爆炸', 'Explosions on the strongest enemies nearby'], 'power', 'echo'),
  A('m_field', ['元素領域', 'Elemental Field'], '🔥', 3, 14, { sig: 'field' }, ['喺腳下放一個持續傷害嘅領域', 'A damaging field under you'], 'buff', 'shield'),
  statP('m_crit', ['奧術精通', 'Arcane Mastery'], '💥', 3, 'critDmg', 0.25, ['暴擊傷害', 'Crit damage'], true),
  cdrP('m_focus', 3),
  A('m_slash', ['魔刃', 'Spell Blade'], '🗡️', 4, 10, { sig: 'spellSlash' }, ['揮出一道巨大魔法刃', 'A huge arcane blade sweep'], 'invuln', 'power'),
  statP('m_eye', ['預知', 'Foresight'], '👁️', 4, 'crit', 0.05, ['暴擊率', 'Crit rate'], true),
  standP('m_stand', 4),
  A('m_call', ['隕石召喚', 'Meteor Call'], '🌠', 5, 18, { sig: 'meteorCall' }, ['隕石砸向附近最強嘅幾隻敵人', 'Meteors on the strongest enemies nearby'], 'power', 'cdr'),
  lordP('m_lord', ['大魔導', 'Archmage'], '🧙'),
];

const NECRO: TreeSkill[] = [
  B('nb_bolt', ['暗影彈', 'Shadow Bolt'], '🌑', { speed: 1, mult: 1, enhMult: 1.15 }, ['用武器 / 暗影彈攻擊', 'Attack with your weapon / shadow bolts'], ['傷害 +15%', '+15% damage'], 'b_crit', 'b_extra4'),
  B('nb_drain', ['吸魂', 'Soul Drain'], '🩸', { speed: 1, mult: 0.85, enhMult: 1.1, drain: 0.004 }, ['每下回 0.4% HP', 'Heals 0.4% HP per attack'], ['傷害 +10%，回血加倍', '+10% damage, double healing'], 'b_slow', 'b_move'),
  B('nb_curse', ['詛咒彈', 'Cursed Bolt'], '🕸️', { speed: 0.8, mult: 1.3, enhMult: 1.15, curse: true }, ['慢啲（攻速 ×0.8），目標 2 秒受傷 +50%', 'Slower (×0.8), the target takes +50% damage for 2s'], ['傷害 +15%', '+15% damage'], 'b_nth3', 'b_slow'),
  B('nb_summon', ['召喚骷髏', 'Raise Skeleton'], '💀', { speed: 1, mult: 1, enhMult: 1.15, summon: true }, ['普攻改為召喚骷髏（無論用咩武器）', 'Your attack raises skeletons instead (any weapon)'], ['骷髏傷害 +15%', '+15% skeleton damage'], 'b_extra4', 'b_heal'),
  A('n_raise', ['召喚骷髏', 'Raise Skeletons'], '💀', 1, 8, { auto: 'raiseDead' }, ['召喚 2 隻骷髏（滿咗就補血）', 'Raise 2 skeletons (heals them at the cap)'], 'shield', 'cdr'),
  A('n_blast', ['屍爆', 'Corpse Blast'], '💥', 1, 6, { auto: 'corpseBlast' }, ['喺目標位置爆炸', 'An explosion on the target'], 'power', 'echo'),
  statP('n_dark', ['黑暗', 'Darkness'], '🌑', 1, 'atk', 0.06, ['攻擊', 'ATK']),
  statP('n_bond', ['亡靈契約', 'Dark Pact'], '🦴', 1, 'summon', 0.08, ['亡靈強度', 'Undead power']),
  A('n_armor', ['骨甲術', 'Bone Armor'], '🦴', 2, 10, { auto: 'boneArmor' }, ['每隻骷髏幫你回血', 'Heals you for each skeleton'], 'shield', 'nova'),
  A('n_curse', ['詛咒', 'Curse'], '🕸️', 2, 9, { auto: 'curse' }, ['詛咒身邊敵人：受傷增加兼減速', 'Curse nearby enemies: more damage taken and slowed'], 'buff', 'echo'),
  healP('n_feast', ['噬魂', 'Soul Feast'], 2),
  statP('n_fort', ['不朽', 'Undying'], '❤️', 2, 'maxHp', 0.08, ['最大 HP', 'Max HP']),
  A('n_spear', ['骨矛', 'Bone Spear'], '🦴', 3, 10, { sig: 'boneSpear' }, ['一枝穿透骨矛射向最強敵人', 'A piercing bone spear at the strongest enemy'], 'power', 'mark'),
  A('n_storm', ['靈魂風暴', 'Soul Storm'], '👻', 3, 12, { sig: 'soulStorm' }, ['向四周射出靈魂，減速', 'Souls fly out in every direction and slow'], 'echo', 'heal'),
  statP('n_crit', ['死亡精通', 'Death Mastery'], '💥', 3, 'critDmg', 0.1, ['暴擊傷害', 'Crit damage'], true),
  cdrP('n_focus', 3),
  A('n_nova', ['死亡新星', 'Death Nova'], '☠️', 4, 12, { sig: 'deathNova' }, ['身邊大爆炸，減速', 'A big blast around you that slows'], 'power', 'shield'),
  standP('n_stand', 4),
  P('n_thorns', ['骨刺', 'Bone Spikes'], '🌵', 4, 1, { pass: 'thorns' }, () => tr('敵人撞到你會受到反傷', 'Enemies touching you take damage')),
  A('n_legion', ['亡者軍團', 'Raise Legion'], '⚰️', 5, 20, { sig: 'raiseLegion' }, ['召喚一隊大骷髏', 'Raise a squad of big skeletons'], 'buff', 'cdr'),
  lordP('n_lord', ['死亡君主', 'Lord of Death'], '👑'),
];

// ---------- 混合層: each two-class pair has its own 2 actives + 2 passives ----------
type MixSpec = { pow: number; a1: [[string, string], string, AutoSkillId, AutoSkillId, [string, string]]; a2: [[string, string], string, string, number, [string, string]]; p: [[string, string], string, StatKey, number, boolean, StatKey, number, boolean]; u: [[string, string], string, UniqueId] };
const MIX_SPECS: Record<string, MixSpec> = {
  warrior_warrior: { pow: 0.15, a1: [['雙刃亂舞', 'Twin Frenzy'], '⚔️', 'whirlwind', 'slam', ['旋風斬同震地一齊出', 'Whirlwind and Ground Slam at once']], a2: [['裂地三重', 'Triple Quake'], '💢', 'quake', 14, ['三圈衝擊波', 'Three shockwaves']], p: [['雙刃', 'Twin Blades'], '🗡️', 'atkSpeed', 0.04, false, 'atk', 0.03, false], u: [['狂戰之魂', 'Berserker Soul'], '😤', 'berserk'] },
  warrior_archer: { pow: 0.1, a1: [['旋槍', 'Spear Spin'], '🔱', 'whirlwind', 'arrowFan', ['轉一圈再射出一排箭', 'Spin, then a fan of arrows']], a2: [['槍雨', 'Spear Rain'], '☄️', 'skyfall', 16, ['長槍從天而降', 'Spears rain from the sky']], p: [['騎兵', 'Cavalry'], '🐎', 'atk', 0.04, false, 'moveSpeed', 0.04, false], u: [['破甲', 'Armour Break'], '🎯', 'markHits'] },
  warrior_mage: { pow: 0.2, a1: [['聖光震擊', 'Holy Smite'], '⚜️', 'slam', 'frostNova', ['震地加冰霜新星', 'Ground Slam plus Frost Nova']], a2: [['聖劍', 'Holy Blade'], '🗡️', 'spellSlash', 10, ['一記大範圍聖光斬', 'A wide holy slash']], p: [['聖盾', 'Holy Shield'], '🛡️', 'maxHp', 0.06, false, 'def', 0.08, false], u: [['神恩', 'Grace'], '✨', 'guardRegen'] },
  warrior_necro: { pow: 0.25, a1: [['死亡旋風', 'Death Spin'], '💀', 'whirlwind', 'corpseBlast', ['旋風斬再引爆屍體', 'Whirlwind, then a corpse blast']], a2: [['死亡新星', 'Death Nova'], '☠️', 'deathNova', 12, ['身邊大爆炸', 'A big blast around you']], p: [['死亡騎士', 'Death Knight'], '🩸', 'atk', 0.04, false, 'maxHp', 0.05, false], u: [['屍爆', 'Corpse Burst'], '💥', 'killBlast'] },
  archer_warrior: { pow: 0.05, a1: [['戰吼箭', 'War Volley'], '🪶', 'arrowFan', 'warCry', ['一排箭加戰吼', 'A fan of arrows and a war cry']], a2: [['衝鋒射擊', 'Charge Shot'], '🔱', 'charge', 9, ['衝刺穿過敵人', 'Dash through enemies']], p: [['獵手', 'Huntsman'], '🎯', 'crit', 0.02, true, 'atk', 0.03, false], u: [['貫穿連鎖', 'Chain Crit'], '⚡', 'chainCrit'] },
  archer_archer: { pow: 0.2, a1: [['箭幕', 'Arrow Curtain'], '🌧️', 'arrowRain', 'arrowFan', ['箭雨加疾風箭', 'Arrow Rain plus Gale Arrows']], a2: [['箭暴', 'Arrow Storm'], '🌪️', 'arrowStorm', 11, ['向四周射出一整圈箭', 'Arrows in every direction']], p: [['鷹眼', 'Hawkeye'], '👁️', 'critDmg', 0.15, true, 'crit', 0.03, true], u: [['連珠', 'Streak'], '⏱️', 'sigOnKill'] },
  archer_mage: { pow: 0.15, a1: [['流星箭雨', 'Meteor Arrows'], '💫', 'arrowRain', 'meteor', ['箭雨加隕石', 'Arrow Rain plus a Meteor']], a2: [['隕石召喚', 'Meteor Call'], '🌠', 'meteorCall', 16, ['隕石砸向最強嘅幾隻敵人', 'Meteors on the strongest enemies']], p: [['魔箭', 'Magic Arrows'], '🔮', 'atk', 0.04, false, 'area', 0.06, false], u: [['魔爆箭', 'Blast Arrows'], '💥', 'killBlast'] },
  archer_necro: { pow: 0.15, a1: [['詛咒箭', 'Cursed Arrows'], '🕸️', 'arrowFan', 'curse', ['一排箭加詛咒', 'A fan of arrows and a curse']], a2: [['幽魂風暴', 'Ghost Storm'], '👻', 'soulStorm', 12, ['向四周射出靈魂', 'Souls fly out all around']], p: [['幽魂獵手', 'Ghost Hunter'], '🌑', 'crit', 0.02, true, 'summon', 0.06, false], u: [['獵人本能', 'Hunter Instinct'], '🎯', 'markHits'] },
  mage_warrior: { pow: 0.35, a1: [['元素斬', 'Elemental Slash'], '🗡️', 'frostNova', 'whirlwind', ['冰霜新星加旋風斬', 'Frost Nova plus Whirlwind']], a2: [['法刃衝鋒', 'Spellblade Charge'], '🔱', 'charge', 9, ['衝刺穿過敵人', 'Dash through enemies']], p: [['魔力護體', 'Mana Armour'], '🛡️', 'atk', 0.08, false, 'critDmg', 0.15, true], u: [['騎士之盾', 'Knight Guard'], '🛡️', 'bossGuard'] },
  mage_archer: { pow: 0.25, a1: [['星落', 'Starfall'], '☄️', 'meteor', 'arrowRain', ['隕石加箭雨', 'Meteor plus Arrow Rain']], a2: [['天墜', 'Skyfall'], '🌠', 'skyfall', 16, ['大量魔法彈從天而降', 'Magic bolts rain all around the target']], p: [['遠詠', 'Far Chant'], '🌀', 'crit', 0.04, true, 'critDmg', 0.15, true], u: [['貫穿連鎖', 'Chain Crit'], '⚡', 'chainCrit'] },
  mage_mage: { pow: 0.1, a1: [['冰火交融', 'Fire and Ice'], '🔥', 'meteor', 'frostNova', ['隕石加冰霜新星', 'Meteor plus Frost Nova']], a2: [['隕石召喚', 'Meteor Call'], '🌠', 'meteorCall', 14, ['隕石砸向最強嘅幾隻敵人', 'Meteors on the strongest enemies']], p: [['大法師', 'High Mage'], '💥', 'critDmg', 0.08, true, 'area', 0.06, false], u: [['法陣', 'Rune Circle'], '🔯', 'sigField'] },
  mage_necro: { pow: 0.3, a1: [['冥冰', 'Death Frost'], '❄️', 'frostNova', 'corpseBlast', ['冰霜新星再引爆屍體', 'Frost Nova, then a corpse blast']], a2: [['靈魂風暴', 'Soul Storm'], '👻', 'soulStorm', 12, ['向四周射出靈魂，減速', 'Souls fly out and slow']], p: [['死靈法典', 'Necronomicon'], '📕', 'atk', 0.08, false, 'crit', 0.04, true], u: [['屍爆', 'Corpse Burst'], '💥', 'killBlast'] },
  necro_warrior: { pow: 0.03, a1: [['骸骨戰吼', 'Bone Cry'], '💀', 'raiseDead', 'warCry', ['召喚骷髏加戰吼', 'Raise skeletons and a war cry']], a2: [['裂地三重', 'Triple Quake'], '💢', 'quake', 14, ['三圈衝擊波', 'Three shockwaves']], p: [['骨將', 'Bone General'], '🦴', 'summon', 0.06, false, 'maxHp', 0.05, false], u: [['狂戰之魂', 'Berserker Soul'], '😤', 'berserk'] },
  necro_archer: { pow: 0.2, a1: [['屍爆箭雨', 'Corpse Rain'], '🌧️', 'corpseBlast', 'arrowRain', ['屍爆加箭雨', 'Corpse Blast plus Arrow Rain']], a2: [['幽魂箭雨', 'Ghost Volley'], '👻', 'ghostVolley', 11, ['向附近敵人射出幽魂箭', 'Ghost arrows at nearby enemies']], p: [['骨弓', 'Bone Bow'], '🏹', 'summon', 0.12, false, 'crit', 0.04, true], u: [['獵人本能', 'Hunter Instinct'], '🎯', 'markHits'] },
  necro_mage: { pow: 0.1, a1: [['咒火', 'Hexfire'], '🕸️', 'curse', 'meteor', ['詛咒加隕石', 'Curse plus a Meteor']], a2: [['死亡新星', 'Death Nova'], '☠️', 'deathNova', 12, ['身邊大爆炸', 'A big blast around you']], p: [['冥火', 'Netherfire'], '🔥', 'summon', 0.06, false, 'area', 0.06, false], u: [['法陣', 'Rune Circle'], '🔯', 'sigField'] },
  necro_necro: { pow: 0.03, a1: [['亡者狂歡', 'Dead Revel'], '💀', 'raiseDead', 'corpseBlast', ['召喚骷髏再引爆屍體', 'Raise skeletons, then a corpse blast']], a2: [['白骨墳場', 'Bone Grave'], '⚰️', 'boneGrave', 14, ['骷髏喺敵人腳下爬出嚟', 'Skeletons rise under the enemies']], p: [['冥王', 'Underlord'], '👑', 'summon', 0.06, false, 'atk', 0.04, false], u: [['神恩', 'Grace'], '✨', 'guardRegen'] },
};
const pctOrFlat = (v: number, r: number) => `${Math.round(v * 100 * r)}%`;
function mixLayer(key: string): TreeSkill[] {
  const m = MIX_SPECS[key];
  if (!m) return [];
  const [n1, i1, au1, au2, w1] = m.a1, [n2, i2, sig, cd2, w2] = m.a2, [pn, pi, s1, v1, f1, s2, v2, f2] = m.p, [un, ui, uq] = m.u;
  return [
    A(`x_${key}_1`, n1, i1, 1, 9, { autos: [au1, au2] }, w1, 'power', 'cdr'),
    { id: `x_${key}_2`, name: tr(pn[0], pn[1]), icon: pi, kind: 'passive', tier: 1, max: 3, stat: f1 ? { stat: s1, flat: v1 } : { stat: s1, pct: v1 }, stat2: f2 ? { stat: s2, flat: v2 } : { stat: s2, pct: v2 },
      desc: (r) => tr(`${STAT_LABEL[s1][0]} +${pctOrFlat(v1, r)}、${STAT_LABEL[s2][0]} +${pctOrFlat(v2, r)}`, `${STAT_LABEL[s1][1]} +${pctOrFlat(v1, r)}, ${STAT_LABEL[s2][1]} +${pctOrFlat(v2, r)}`) },
    A(`x_${key}_3`, n2, i2, 3, cd2, { sig }, w2, 'echo', 'buff'),
    { id: `x_${key}_4`, name: tr(un[0], un[1]), icon: ui, kind: 'passive', tier: 3, max: 1, uniq: uq, desc: () => UNIQUE_DESC[uq] },
    { id: `x_${key}_5`, name: tr(`奧義・${MIX_MECH[key].name[0]}`, `Secret Art: ${MIX_MECH[key].name[1]}`), icon: '🌟', kind: 'passive', tier: 5, max: 3, pass: 'mixPow', pow: m.pow,
      desc: (r) => `${mechDesc(key, r)}${tr(`；所有傷害（包括亡靈）+${Math.round(m.pow * 100 * r)}%`, `; all your damage (undead too) +${Math.round(m.pow * 100 * r)}%`)}` },
  ];
}
const STAT_LABEL: Record<string, [string, string]> = {
  atk: ['攻擊', 'ATK'], maxHp: ['HP', 'HP'], def: ['防禦', 'DEF'], atkSpeed: ['攻速', 'Attack speed'], moveSpeed: ['移速', 'Move speed'], crit: ['暴擊率', 'Crit rate'],
  critDmg: ['暴擊傷害', 'Crit damage'], range: ['射程', 'Range'], area: ['範圍', 'Area'], summon: ['亡靈強度', 'Undead power'],
};
const MIX_LAYER_CACHE: Record<string, TreeSkill[]> = {};
export const mixLayerOf = (key: string) => (MIX_LAYER_CACHE[key] ??= mixLayer(key));
export const MIX_LAYER_KEYS = Object.keys(MIX_SPECS);

// ---------- 專精層 (single class only): stats bought with souls ----------
export type PureStat = 'atk' | 'maxHp' | 'critDmg' | 'crit' | 'atkSpeed' | 'area' | 'summon';
export const PURE_STATS: { id: PureStat; step: number; flat: boolean; icon: string }[] = [
  { id: 'atk', step: 0.04, flat: false, icon: '⚔️' }, { id: 'maxHp', step: 0.05, flat: false, icon: '❤️' }, { id: 'critDmg', step: 0.12, flat: true, icon: '💥' },
  { id: 'crit', step: 0.01, flat: true, icon: '🎯' }, { id: 'atkSpeed', step: 0.025, flat: false, icon: '💨' }, { id: 'area', step: 0.08, flat: false, icon: '🌀' }, { id: 'summon', step: 0.05, flat: false, icon: '🦴' },
];
export const PURE_MAX = 20;
export const pureStatName = (id: PureStat) => tr(STAT_LABEL[id][0], STAT_LABEL[id][1]);
/** Souls for the next rank (rank = ranks owned now). */
export const pureCost = (rank: number) => Math.round(800 * 1.22 ** rank);

export const TREES: Partial<Record<ClassId, TreeSkill[]>> = { warrior: WARRIOR, archer: ARCHER, mage: MAGE, necro: NECRO };
export const treeSkill = (c: ClassId, id: string) => TREES[c]?.find((s) => s.id === id);
let BY_ID: Map<string, TreeSkill> | null = null;
/** Any class's tree skill by id (ids are unique across trees: w_ / a_ / m_ / n_). */
export const treeSkillAny = (id: string) => (BY_ID ??= new Map([...Object.values(TREES).flat(), ...MIX_LAYER_KEYS.flatMap(mixLayerOf)].map((x) => [x.id, x]))).get(id);
/** 混合層: a second class lends its tiers 1–3 (actives + passives), a third class its tiers 1–2. */
export const LAYER_TIERS = { sub: 3, sub2: 2 };
export function layerSkills(c: ClassId, sub: ClassId | null, sub2: ClassId | null): { cls: ClassId; skills: TreeSkill[]; mix?: boolean }[] {
  const out: { cls: ClassId; skills: TreeSkill[]; mix?: boolean }[] = [];
  if (sub) out.push({ cls: sub, skills: mixLayerOf(`${c}_${sub}`), mix: true }); // the pair's own layer
  if (sub2 && sub2 !== c && sub2 !== sub) out.push({ cls: sub2, skills: (TREES[sub2] ?? []).filter((k) => k.kind !== 'basic' && k.tier <= LAYER_TIERS.sub2) });
  return out;
}
/** Skill ids that count for this character: the main tree plus the 混合層. */
export function treeAllow(c: ClassId, sub: ClassId | null = null, sub2: ClassId | null = null): Set<string> {
  return new Set([...(TREES[c] ?? []), ...layerSkills(c, sub, sub2).flatMap((l) => l.skills)].map((k) => k.id));
}

/** One class's tree in the save. */
export interface TreeState { ranks: Record<string, number>; enh: string[]; mods: Record<string, 0 | 1>; equip: string[]; basic?: string }
export const emptyTree = (): TreeState => ({ ranks: {}, enh: [], mods: {}, equip: [] });

/** Points spent (only skills in `allow` count: a 混合層 of another second class is kept but sleeps, free). */
export function treeSpent(t: TreeState, allow?: Set<string>): number {
  const ok = (id: string) => !allow || allow.has(id);
  return Object.entries(t.ranks).reduce((a, [id, b]) => a + (ok(id) ? b : 0), 0) + t.enh.filter(ok).length + Object.keys(t.mods).filter(ok).length;
}
/** Points spent in tiers below this one (opens the tier). */
export const tierOpen = (t: TreeState, tier: number, allow?: Set<string>) => tier <= 0 || treeSpent(t, allow) >= TREE_TIERS[tier - 1];

/** What a run gets from the tree. */
export interface TreeActive { id: string; rank: number; enh: boolean; mod: -1 | 0 | 1 }
export interface TreeRun { actives: TreeActive[]; passives: Record<string, number>; basic: TreeActive | null; scale?: number /* 專精: stat passives ×2 / ×2.5 */ }
export function treeRun(c: ClassId, t: TreeState, allow: Set<string> = treeAllow(c)): TreeRun {
  const passives: Record<string, number> = {};
  for (const id of allow) { const s = treeSkillAny(id); if (s?.kind === 'passive' && t.ranks[id]) passives[id] = t.ranks[id]; }
  const actives = t.equip.filter((id) => allow.has(id) && (t.ranks[id] ?? 0) > 0).slice(0, TREE_EQUIP).map((id) => ({ id, rank: t.ranks[id], enh: t.enh.includes(id), mod: (t.mods[id] ?? -1) as -1 | 0 | 1 }));
  const b = t.basic && (t.ranks[t.basic] ?? 0) > 0 ? t.basic : null;
  return { actives, passives, basic: b ? { id: b, rank: t.ranks[b], enh: t.enh.includes(b), mod: (t.mods[b] ?? -1) as -1 | 0 | 1 } : null };
}
