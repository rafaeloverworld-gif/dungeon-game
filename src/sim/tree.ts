// Diablo-4-style skill trees: per class, 5 tiers opened by points spent in the tree.
// Actives (rank 1-5) → 強化 (enhancement) → pick one of two 變化 (modifiers). Passives rank 1-3.
// Points come from class level (1 per level). Up to TREE_EQUIP actives are cast automatically.
import { tr } from '../i18n';
import type { ClassId } from './classes';
import type { StatKey } from './stats';

export const TREE_TIERS = [0, 5, 12, 20, 30]; // points spent in this tree to open tiers 1..5
export const TREE_EQUIP = 4; // active skills cast at once
export const ACTIVE_MAX = 5;
/** Classes that already use the new tree (the rest keep the old skill boards for now). */
export const TREE_CLASSES: ClassId[] = ['warrior'];

export interface TreeMod { name: string; desc: string }
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
  pass?: 'rage' | 'healOnKill' | 'lastStand' | 'thorns' | 'cdr' | 'overlord';
}

/** Rank scaling for active damage: rank 1 = ×1, each rank +20%. */
export const rankMult = (rank: number) => 1 + 0.2 * (Math.max(1, rank) - 1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dmgTxt = (base: number, rank: number) => pct(base * rankMult(rank));

const WARRIOR: TreeSkill[] = [
  // ---------- 基本攻擊 (pick one: it replaces your normal swing) ----------
  { id: 'wb_slash', name: tr('斬擊', 'Slash'), icon: '🗡️', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`普通扇形斬擊，傷害 ${pct(1 + 0.1 * (r - 1))}`, `Normal arc slash, ${pct(1 + 0.1 * (r - 1))} damage`),
    enh: { name: tr('斬擊強化', 'Slash+'), desc: tr('斬擊角度 +30%', '+30% arc') },
    mods: [{ name: tr('迴旋斬', 'Spin Slash'), desc: tr('每第 4 下變成一整圈', 'Every 4th swing hits all around') },
      { name: tr('吸血斬', 'Leech Slash'), desc: tr('每斬中一隻回 0.3% HP（每下最多 2%）', 'Heal 0.3% HP per enemy hit (up to 2% a swing)') }] },
  { id: 'wb_thrust', name: tr('突刺', 'Thrust'), icon: '🔱', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`窄而長嘅直刺（射程 +60%），傷害 ${pct(1.4 * (1 + 0.1 * (r - 1)))}`, `A long, narrow thrust (+60% reach), ${pct(1.4 * (1 + 0.1 * (r - 1)))} damage`),
    enh: { name: tr('突刺強化', 'Thrust+'), desc: tr('再長 30%，傷害 +20%', '30% longer, +20% damage') },
    mods: [{ name: tr('致命突刺', 'Lethal Thrust'), desc: tr('暴擊率 +20%（只限突刺）', '+20% crit chance on thrusts') },
      { name: tr('破綻', 'Opening'), desc: tr('刺中嘅敵人 2 秒受傷 +50%', 'Enemies hit take +50% damage for 2s') }] },
  { id: 'wb_bash', name: tr('猛擊', 'Bash'), icon: '🔨', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`慢啲（攻速 ×0.67）但重好多，傷害 ${pct(2 * (1 + 0.1 * (r - 1)))}`, `Slower (×0.67 attack speed) but much heavier: ${pct(2 * (1 + 0.1 * (r - 1)))} damage`),
    enh: { name: tr('猛擊強化', 'Bash+'), desc: tr('細怪定身 0.5 秒', 'Stuns small enemies for 0.5s') },
    mods: [{ name: tr('震波', 'Shockwave'), desc: tr('每下喺目標位置再爆一圈（60%）', 'Each hit also blasts around the target (60%)') },
      { name: tr('重錘', 'Crusher'), desc: tr('每第 3 下必定暴擊', 'Every 3rd hit is a guaranteed crit') }] },
  { id: 'wb_flurry', name: tr('連斬', 'Flurry'), icon: '⚡', kind: 'basic', tier: 0, max: ACTIVE_MAX,
    desc: (r) => tr(`快好多（攻速 ×1.6）但輕啲，傷害 ${pct(0.6 * (1 + 0.1 * (r - 1)))}`, `Much faster (×1.6 attack speed) but lighter: ${pct(0.6 * (1 + 0.1 * (r - 1)))} damage`),
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

export const TREES: Partial<Record<ClassId, TreeSkill[]>> = { warrior: WARRIOR };
export const treeSkill = (c: ClassId, id: string) => TREES[c]?.find((s) => s.id === id);

/** One class's tree in the save. */
export interface TreeState { ranks: Record<string, number>; enh: string[]; mods: Record<string, 0 | 1>; equip: string[]; basic?: string }
export const emptyTree = (): TreeState => ({ ranks: {}, enh: [], mods: {}, equip: [] });

export function treeSpent(t: TreeState): number {
  return Object.values(t.ranks).reduce((a, b) => a + b, 0) + t.enh.length + Object.keys(t.mods).length;
}
/** Points spent in tiers below this one (opens the tier). */
export const tierOpen = (t: TreeState, tier: number) => tier <= 0 || treeSpent(t) >= TREE_TIERS[tier - 1];

/** What a run gets from the tree. */
export interface TreeActive { id: string; rank: number; enh: boolean; mod: -1 | 0 | 1 }
export interface TreeRun { actives: TreeActive[]; passives: Record<string, number>; basic: TreeActive | null }
export function treeRun(c: ClassId, t: TreeState): TreeRun {
  const passives: Record<string, number> = {};
  for (const s of TREES[c] ?? []) if (s.kind === 'passive' && t.ranks[s.id]) passives[s.id] = t.ranks[s.id];
  const actives = t.equip.filter((id) => (t.ranks[id] ?? 0) > 0).slice(0, TREE_EQUIP).map((id) => ({ id, rank: t.ranks[id], enh: t.enh.includes(id), mod: (t.mods[id] ?? -1) as -1 | 0 | 1 }));
  const b = t.basic && (t.ranks[t.basic] ?? 0) > 0 ? t.basic : null;
  return { actives, passives, basic: b ? { id: b, rank: t.ranks[b], enh: t.enh.includes(b), mod: (t.mods[b] ?? -1) as -1 | 0 | 1 } : null };
}
