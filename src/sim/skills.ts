// Skill boards (White Cat Project style). A character uses its own class board; once awakened it also
// gets the second class's board (a second copy for same-class awakening) and its awakened-class board. Each board has three branches from a centre star:
//   輸出 (DPS) · 坦克 (Tank) · 控制 (Control)
// Panels are unlocked with souls (stat panels) and runes (skill panels), next to an unlocked panel.
// No skill points: panels cost souls / runes, and every panel you own makes the next ones dearer, so the 180 panels of a fully awakened character can't all be bought.
// Sections: 1 is open, 2 needs dungeon tier 5 cleared, 3 needs tier 10.
import type { ClassId } from './classes';
import { AWAKENED, ascendedFor, SIG_UP_DESC } from './awakening';
import { CLASS_IDS } from './classes';
import { PROC_SKILLS, SPECIALS, type ProcId, type SpecialId } from './gear';
import { addBonus, type StatBonus, type StatKey } from './stats';
import { getLang, tr } from '../i18n';

export const MAX_LEVEL = 100;
export const SECTION_TIER = [0, 5, 10, 15, 20]; // dungeon tier needed for sections 1–5

export type AutoSkillId =
  | 'whirlwind' | 'slam' | 'lastStand' | 'warCry'
  | 'arrowRain' | 'arrowFan' | 'snare' | 'barrier'
  | 'frostNova' | 'meteor' | 'resonance' | 'timeWarp'
  | 'raiseDead' | 'corpseBlast' | 'boneArmor' | 'curse';

export interface AutoSkillDef { name: string; icon: string; cooldown: number[] } // [normal, enhanced]
export const AUTO_SKILLS: Record<AutoSkillId, AutoSkillDef> = {
  whirlwind: { name: tr('旋風斬', 'Whirlwind'), icon: '🌀', cooldown: [5, 4.5] },
  slam: { name: tr('震地', 'Ground Slam'), icon: '💢', cooldown: [8, 7] },
  lastStand: { name: tr('不屈', 'Last Stand'), icon: '🛡️', cooldown: [0, 0] },
  warCry: { name: tr('戰吼', 'War Cry'), icon: '📢', cooldown: [10, 9] },
  arrowRain: { name: tr('箭雨', 'Arrow Rain'), icon: '🌧️', cooldown: [6, 5] },
  arrowFan: { name: tr('疾風箭', 'Gale Arrows'), icon: '🪶', cooldown: [5, 4] },
  snare: { name: tr('束縛陷阱', 'Snare Trap'), icon: '🪤', cooldown: [8, 7] },
  barrier: { name: tr('護盾術', 'Barrier'), icon: '🔰', cooldown: [12, 10] },
  frostNova: { name: tr('冰霜新星', 'Frost Nova'), icon: '❄️', cooldown: [7, 6] },
  meteor: { name: tr('隕石', 'Meteor'), icon: '☄️', cooldown: [9, 8] },
  resonance: { name: tr('元素共鳴', 'Resonance'), icon: '🔥', cooldown: [0, 0] },
  timeWarp: { name: tr('時間扭曲', 'Time Warp'), icon: '⏳', cooldown: [14, 12] },
  raiseDead: { name: tr('召喚骷髏', 'Raise Skeletons'), icon: '💀', cooldown: [8, 7] },
  corpseBlast: { name: tr('屍爆', 'Corpse Blast'), icon: '💥', cooldown: [6, 5] },
  boneArmor: { name: tr('骨甲術', 'Bone Armor'), icon: '🦴', cooldown: [10, 9] },
  curse: { name: tr('詛咒', 'Curse'), icon: '🕸️', cooldown: [9, 8] },
};

export type Branch = 'dps' | 'tank' | 'ctrl';
export const BRANCH_NAMES: Record<Branch, string> = { dps: tr('輸出', 'DPS'), tank: tr('坦克', 'Tank'), ctrl: tr('控制', 'Control') };
export const BRANCH_COLORS: Record<Branch, string> = { dps: '#ff6b5a', tank: '#5aa9ff', ctrl: '#b77cff' };

type Special = 'healOnKill' | 'multishot' | 'pierce' | 'sigDmg' | 'sigCd' | 'cdr' | 'dodge' | 'thorns' | 'frostArmor' | 'minions';

/** Awakened-board passives (the last panel of the 輸出 and 坦克 paths). */
export type UniqueId = 'sigOnKill' | 'sigGuard' | 'berserk' | 'bossGuard' | 'chainCrit' | 'killBlast' | 'markHits' | 'sigField' | 'guardRegen';
export const UNIQUE_DESC: Record<UniqueId, string> = {
  sigOnKill: tr('每殺一隻敵人，招牌技冷卻快 0.25 秒', 'Each kill cuts 0.25s off the Signature skill cooldown'),
  sigGuard: tr('放招牌技時無敵 1.5 秒兼回復 8% HP', 'Casting the Signature skill grants 1.5s invincibility and heals 8% HP'),
  berserk: tr('HP 低過 50% 時傷害 +30%', '+30% damage while below 50% HP'),
  bossGuard: tr('有 Boss 喺場時受到傷害 -25%', '-25% damage taken while a Boss is present'),
  chainCrit: tr('暴擊時傷害會彈去附近另一隻敵人（50%）', 'Crits bounce to another nearby enemy (50%)'),
  killBlast: tr('殺死嘅敵人會爆炸，傷害身邊敵人（40%）', 'Slain enemies explode, damaging those nearby (40%)'),
  markHits: tr('第一次打中嘅敵人會被標記 2 秒（受到傷害 +50%）', 'Enemies you hit first are marked for 2s (+50% damage taken)'),
  sigField: tr('放招牌技後喺腳下留低魔法陣 4 秒（減速兼持續傷害）', 'Casting the Signature skill leaves a magic circle for 4s (slow and damage over time)'),
  guardRegen: tr('HP 低過 50% 時每秒回復 2% HP', 'Regen 2% HP per second while below 50% HP'),
};

/** What one panel does. */
type Effect =
  | { stat: StatKey; flat?: number; pct?: number }
  | { skill: AutoSkillId }
  | { upgrade: AutoSkillId }
  | { special: Special; value: number }
  | { proc: ProcId; value: number } // same as a weapon skill
  | { gear: SpecialId } // same as a legendary special
  | { unique: UniqueId }
  | { sigUp: true } // signature skill enhanced version
  | { echoUp: true }; // three-class echo +50%

interface Spec { name: string; icon: string; fx: Effect }

export interface BoardNode {
  id: string;
  board: string; // board key: a class id, or an awakened id like "warrior_mage"
  branch: Branch;
  step: number; // 1..15 along the branch
  side: boolean; // fork panel next to steps 3, 6, 9, 12, 15
  section: number; // 1..5
  gate: number; // dungeon tier that must be cleared to open this panel's section
  parent: string; // the panel that must be unlocked first ('' = the centre star)
  x: number; y: number; // layout position (board units, centre = 0,0)
  name: string;
  icon: string;
  fx: Effect;
  kind: 'stat' | 'skill';
  cost: { souls: number; runes: number };
}

const S = (name: string, icon: string, stat: StatKey, v: number, pct = true): Spec => ({ name, icon, fx: pct ? { stat, pct: v } : { stat, flat: v } });
const K = (name: string, icon: string, skill: AutoSkillId): Spec => ({ name, icon, fx: { skill } });
const U = (skill: AutoSkillId): Spec => ({ name: getLang() === 'en' ? `${AUTO_SKILLS[skill].name}+` : `${AUTO_SKILLS[skill].name}強化`, icon: AUTO_SKILLS[skill].icon, fx: { upgrade: skill } });
const P = (name: string, icon: string, special: Special, value: number): Spec => ({ name, icon, fx: { special, value } });

// Each branch: 9 panels along the path, then 3 fork panels (attached to steps 3, 6 and 9).
type BranchSpec = [Spec, Spec, Spec, Spec, Spec, Spec, Spec, Spec, Spec, Spec, Spec, Spec];

const BOARDS = {
  warrior: {
    dps: [
      S(tr('力量', 'Strength'), '💪', 'atk', 0.04), S(tr('力量', 'Strength'), '💪', 'atk', 0.04), S(tr('重擊', 'Heavy Blow'), '🔨', 'critDmg', 0.12, false),
      S(tr('狂戰', 'Frenzy'), '😤', 'atkSpeed', 0.05), S(tr('力量', 'Strength'), '💪', 'atk', 0.05), S(tr('重擊', 'Heavy Blow'), '🔨', 'critDmg', 0.15, false),
      S(tr('狂戰', 'Frenzy'), '😤', 'atkSpeed', 0.06), S(tr('霸者', 'Overlord'), '👑', 'atk', 0.06), S(tr('看破', 'Insight'), '💥', 'crit', 0.04, false),
      K(tr('旋風斬', 'Whirlwind'), '🌀', 'whirlwind'), P(tr('連斬', 'Combo Slash'), '🗡️', 'multishot', 1), U('whirlwind'),
    ],
    tank: [
      S(tr('堅毅', 'Fortitude'), '❤️', 'maxHp', 0.05), S(tr('盾牆', 'Shield Wall'), '🛡️', 'def', 6, false), P(tr('嗜血', 'Bloodlust'), '🩸', 'healOnKill', 0.004),
      S(tr('堅毅', 'Fortitude'), '❤️', 'maxHp', 0.06), S(tr('盾牆', 'Shield Wall'), '🛡️', 'def', 8, false), S(tr('再生', 'Regen'), '🌿', 'regen', 0.003, false),
      S(tr('堅毅', 'Fortitude'), '❤️', 'maxHp', 0.07), S(tr('盾牆', 'Shield Wall'), '🛡️', 'def', 10, false), P(tr('嗜血', 'Bloodlust'), '🩸', 'healOnKill', 0.005),
      K(tr('不屈', 'Last Stand'), '🛡️', 'lastStand'), P(tr('荊棘', 'Thorns'), '🌵', 'thorns', 1), U('lastStand'),
    ],
    ctrl: [
      S(tr('橫掃', 'Sweep'), '🌀', 'area', 0.06), S(tr('疾步', 'Swiftness'), '👟', 'moveSpeed', 0.03), S(tr('威懾', 'Intimidate'), '🌀', 'area', 0.06),
      P(tr('迅捷', 'Haste'), '⏱️', 'cdr', 0.05), S(tr('橫掃', 'Sweep'), '🌀', 'area', 0.07), K(tr('戰吼', 'War Cry'), '📢', 'warCry'),
      P(tr('迅捷', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('疾步', 'Swiftness'), '👟', 'moveSpeed', 0.04), S(tr('威懾', 'Intimidate'), '🌀', 'area', 0.08),
      K(tr('震地', 'Ground Slam'), '💢', 'slam'), S(tr('疾步', 'Swiftness'), '👟', 'moveSpeed', 0.05), U('slam'),
    ],
  },
  archer: {
    dps: [
      S(tr('精準', 'Precision'), '🎯', 'atk', 0.04), S(tr('鷹眼', 'Hawk Eye'), '👁️', 'crit', 0.025, false), S(tr('致命', 'Lethality'), '🩸', 'critDmg', 0.12, false),
      S(tr('連射', 'Rapid Fire'), '💨', 'atkSpeed', 0.05), S(tr('精準', 'Precision'), '🎯', 'atk', 0.05), S(tr('鷹眼', 'Hawk Eye'), '👁️', 'crit', 0.03, false),
      S(tr('連射', 'Rapid Fire'), '💨', 'atkSpeed', 0.06), S(tr('致命', 'Lethality'), '🩸', 'critDmg', 0.15, false), S(tr('精準', 'Precision'), '🎯', 'atk', 0.06),
      K(tr('疾風箭', 'Gale Arrows'), '🪶', 'arrowFan'), P(tr('分裂攻擊', 'Split Shot'), '🔱', 'multishot', 1), U('arrowFan'),
    ],
    tank: [
      S(tr('敏捷', 'Agility'), '👟', 'moveSpeed', 0.03), S(tr('堅韌', 'Toughness'), '❤️', 'maxHp', 0.05), P(tr('閃避', 'Evasion'), '💨', 'dodge', 0.04),
      S(tr('敏捷', 'Agility'), '👟', 'moveSpeed', 0.03), S(tr('堅韌', 'Toughness'), '❤️', 'maxHp', 0.06), P(tr('閃避', 'Evasion'), '💨', 'dodge', 0.05),
      S(tr('堅韌', 'Toughness'), '❤️', 'maxHp', 0.07), S(tr('敏捷', 'Agility'), '👟', 'moveSpeed', 0.04), P(tr('閃避', 'Evasion'), '💨', 'dodge', 0.05),
      K(tr('煙幕', 'Smoke Screen'), '🔰', 'barrier'), P(tr('獵食', 'Predator'), '🩸', 'healOnKill', 0.004), U('barrier'),
    ],
    ctrl: [
      S(tr('遠眺', 'Far Sight'), '🧭', 'range', 0.06), P(tr('穿透', 'Pierce'), '🎯', 'pierce', 1), S(tr('遠眺', 'Far Sight'), '🧭', 'range', 0.06),
      P(tr('冷靜', 'Haste'), '⏱️', 'cdr', 0.05), P(tr('穿透', 'Pierce'), '🎯', 'pierce', 1), K(tr('束縛陷阱', 'Snare Trap'), '🪤', 'snare'),
      P(tr('冷靜', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('遠眺', 'Far Sight'), '🧭', 'range', 0.07), S(tr('遠眺', 'Far Sight'), '🧭', 'range', 0.08),
      K(tr('箭雨', 'Arrow Rain'), '🌧️', 'arrowRain'), P(tr('冷靜', 'Haste'), '⏱️', 'cdr', 0.06), U('arrowRain'),
    ],
  },
  mage: {
    dps: [
      S(tr('奧術', 'Arcane'), '🔮', 'atk', 0.04), S(tr('元素精通', 'Elemental Mastery'), '🌋', 'critDmg', 0.12, false), S(tr('法力湧動', 'Mana Surge'), '⚡', 'crit', 0.025, false),
      S(tr('急速詠唱', 'Quick Cast'), '⏩', 'atkSpeed', 0.05), S(tr('奧術', 'Arcane'), '🔮', 'atk', 0.05), S(tr('元素精通', 'Elemental Mastery'), '🌋', 'critDmg', 0.15, false),
      S(tr('急速詠唱', 'Quick Cast'), '⏩', 'atkSpeed', 0.06), S(tr('奧術', 'Arcane'), '🔮', 'atk', 0.06), P(tr('雙重詠唱', 'Double Cast'), '☄️', 'multishot', 1),
      K(tr('元素共鳴', 'Resonance'), '🔥', 'resonance'), K(tr('隕石', 'Meteor'), '☄️', 'meteor'), U('meteor'),
    ],
    tank: [
      S(tr('魔力護盾', 'Mana Shield'), '💠', 'maxHp', 0.05), S(tr('結界', 'Ward'), '🛡️', 'def', 6, false), S(tr('魔力護盾', 'Mana Shield'), '💠', 'maxHp', 0.06),
      S(tr('再生', 'Regen'), '🌿', 'regen', 0.003, false), S(tr('結界', 'Ward'), '🛡️', 'def', 8, false), S(tr('魔力護盾', 'Mana Shield'), '💠', 'maxHp', 0.07),
      S(tr('結界', 'Ward'), '🛡️', 'def', 10, false), S(tr('再生', 'Regen'), '🌿', 'regen', 0.004, false), S(tr('魔力護盾', 'Mana Shield'), '💠', 'maxHp', 0.08),
      K(tr('護盾術', 'Barrier'), '🔰', 'barrier'), P(tr('冰甲', 'Frost Armor'), '🧊', 'frostArmor', 1), U('barrier'),
    ],
    ctrl: [
      S(tr('擴散', 'Spread'), '🔥', 'area', 0.06), P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.05), S(tr('擴散', 'Spread'), '🔥', 'area', 0.06),
      P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('擴散', 'Spread'), '🔥', 'area', 0.07), K(tr('時間扭曲', 'Time Warp'), '⏳', 'timeWarp'),
      P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('擴散', 'Spread'), '🔥', 'area', 0.07), S(tr('擴散', 'Spread'), '🔥', 'area', 0.08),
      K(tr('冰霜新星', 'Frost Nova'), '❄️', 'frostNova'), S(tr('奧術', 'Arcane'), '🔮', 'atk', 0.05), U('frostNova'),
    ],
  },
} as Record<ClassId, Record<Branch, BranchSpec>>;

BOARDS.necro = {
  dps: [
    S(tr('暗影', 'Shadow'), '🌑', 'atk', 0.04), S(tr('亡靈之力', 'Undead Power'), '💀', 'summon', 0.1), S(tr('暗影', 'Shadow'), '🌑', 'atk', 0.04),
    S(tr('急咒', 'Quick Hex'), '⏩', 'atkSpeed', 0.05), S(tr('亡靈之力', 'Undead Power'), '💀', 'summon', 0.12), S(tr('致命詛咒', 'Deadly Curse'), '🩸', 'critDmg', 0.12, false),
    S(tr('暗影', 'Shadow'), '🌑', 'atk', 0.05), S(tr('亡靈之力', 'Undead Power'), '💀', 'summon', 0.15), P(tr('骸骨大軍', 'Bone Legion'), '☠️', 'minions', 1),
    K(tr('屍爆', 'Corpse Blast'), '💥', 'corpseBlast'), P(tr('雙重暗影', 'Twin Shadow'), '🌑', 'multishot', 1), U('corpseBlast'),
  ],
  tank: [
    S(tr('骨之軀', 'Bone Body'), '🦴', 'maxHp', 0.05), S(tr('骨甲', 'Bone Plate'), '🛡️', 'def', 6, false), S(tr('骨之軀', 'Bone Body'), '🦴', 'maxHp', 0.06),
    S(tr('再生', 'Regen'), '🌿', 'regen', 0.003, false), S(tr('骨甲', 'Bone Plate'), '🛡️', 'def', 8, false), P(tr('吸魂', 'Soul Drain'), '👻', 'healOnKill', 0.004),
    S(tr('骨之軀', 'Bone Body'), '🦴', 'maxHp', 0.07), S(tr('骨甲', 'Bone Plate'), '🛡️', 'def', 10, false), P(tr('骸骨大軍', 'Bone Legion'), '☠️', 'minions', 1),
    K(tr('骨甲術', 'Bone Armor'), '🦴', 'boneArmor'), P(tr('荊棘', 'Thorns'), '🌵', 'thorns', 1), U('boneArmor'),
  ],
  ctrl: [
    S(tr('擴散', 'Spread'), '🌀', 'area', 0.06), P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.05), S(tr('擴散', 'Spread'), '🌀', 'area', 0.06),
    P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('亡靈之力', 'Undead Power'), '💀', 'summon', 0.1), K(tr('詛咒', 'Curse'), '🕸️', 'curse'),
    P(tr('冷卻', 'Haste'), '⏱️', 'cdr', 0.06), S(tr('擴散', 'Spread'), '🌀', 'area', 0.07), S(tr('擴散', 'Spread'), '🌀', 'area', 0.08),
    K(tr('召喚骷髏', 'Raise Skeletons'), '💀', 'raiseDead'), U('curse'), U('raiseDead'),
  ],
};

const ANGLES: Record<Branch, number> = { dps: -90, tank: 150, ctrl: 30 }; // degrees: up, lower-left, lower-right
const SOULS = [40, 120, 300, 600, 1000];
const RUNES = [2, 5, 10, 15, 20];
const AWK_SOULS = [120, 300, 600, 1000, 1600];
const AWK_RUNES = [3, 6, 12, 18, 24];
const TRI_SOULS = [300, 700, 1200, 2000, 3000];
const TRI_RUNES = [5, 10, 16, 24, 32];
/** Dungeon tier needed for sections 1–5 of a three-class board (you ascend at tier 25). */
export const TRI_SECTION_TIER = [25, 30, 35, 40, 45];
type BoardTier = 'base' | 'awk' | 'tri';
const COSTS: Record<BoardTier, { souls: number[]; runes: number[]; gate: number[] }> = {
  base: { souls: SOULS, runes: RUNES, gate: [] }, awk: { souls: AWK_SOULS, runes: AWK_RUNES, gate: [] }, tri: { souls: TRI_SOULS, runes: TRI_RUNES, gate: TRI_SECTION_TIER },
};
/** Dungeon tier needed for sections 1–5 of an awakened board (you awaken at tier 5). */
export const AWK_SECTION_TIER = [5, 10, 15, 20, 25];
/** Path length of each branch (forks hang off every 3rd step). */
export const BRANCH_STEPS = 15;
/** Every panel you own makes every further panel this much dearer (so nobody fills every board). */
export const COST_GROWTH = 0.03;

/** Steps 10–15 and forks 12 / 15: stronger copies of the branch's stat panels. */
function extend(specs: Spec[]): { path: Spec[]; sides: Spec[] } {
  const stats = specs.slice(0, 9).filter((sp) => 'stat' in sp.fx);
  const pool = stats.length ? stats : [S(tr('強化', 'Power'), '💪', 'atk', 0.04)];
  const mul = (sp: Spec, m: number): Spec => {
    const fx = sp.fx as { stat: StatKey; flat?: number; pct?: number };
    const r = (v?: number) => (v === undefined ? undefined : Math.round(v * m * 10000) / 10000);
    return { name: sp.name, icon: sp.icon, fx: { stat: fx.stat, flat: r(fx.flat), pct: r(fx.pct) } };
  };
  const path = [10, 11, 12, 13, 14, 15].map((st, i) => mul(pool[i % pool.length], st <= 12 ? 1.6 : 2));
  const sides = [mul(pool[0], 3), mul(pool[1 % pool.length], 4)].map((sp) => ({ ...sp, name: getLang() === 'en' ? `${sp.name}+` : `${sp.name}精通` }));
  return { path, sides };
}

const isSkillPanel = (fx: Effect) => !('stat' in fx || 'special' in fx);

function layout(board: string, specs: Record<Branch, BranchSpec>, tier: BoardTier): BoardNode[] {
  const C = COSTS[tier];
  const gates = tier === 'base' ? SECTION_TIER : tier === 'awk' ? AWK_SECTION_TIER : TRI_SECTION_TIER;
  const out: BoardNode[] = [];
  for (const branch of ['dps', 'tank', 'ctrl'] as Branch[]) {
    const a = (ANGLES[branch] * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = -uy, py = ux; // sideways
    const given = specs[branch];
    const ext = extend(given);
    const panels: { step: number; side: boolean; spec: Spec }[] = [
      ...given.slice(0, 9).map((spec, i) => ({ step: i + 1, side: false, spec })),
      ...ext.path.map((spec, i) => ({ step: i + 10, side: false, spec })),
      ...given.slice(9).map((spec, i) => ({ step: (i + 1) * 3, side: true, spec })),
      ...ext.sides.map((spec, i) => ({ step: (i + 4) * 3, side: true, spec })),
    ];
    for (const { step, side, spec } of panels) {
      const section = Math.ceil(step / 3);
      const kind = isSkillPanel(spec.fx) ? 'skill' : 'stat';
      const within = ((step - 1) % 3) + 1;
      const souls = Math.round(C.souls[section - 1] * (1 + 0.15 * within) * (side ? 1.2 : 1));
      const runes = kind === 'skill' ? C.runes[section - 1] + ('upgrade' in spec.fx || 'sigUp' in spec.fx || 'echoUp' in spec.fx ? 4 : 0) : 0;
      const r = step * 1.2 + 0.7;
      const sideOff = side ? 1.2 : 0;
      out.push({
        id: `${board}.${branch}.${side ? `s${step}` : step}`,
        board, branch, step, side, section,
        gate: gates[section - 1],
        parent: side ? `${board}.${branch}.${step}` : step === 1 ? '' : `${board}.${branch}.${step - 1}`,
        x: ux * r + px * sideOff, y: uy * r + py * sideOff,
        name: spec.name, icon: spec.icon, fx: spec.fx, kind,
        cost: { souls, runes },
      });
    }
  }
  return out;
}

// ---------- awakened-class boards ----------
interface AwkTheme {
  f1: [string, string, StatKey, number, boolean]; // name, icon, stat, base value, is pct
  f2: [string, string, StatKey, number, boolean];
  proc: [ProcId, number];
  gear: SpecialId;
  dps: [string, string, UniqueId];
  tank: [string, string, UniqueId];
}
const AWK_THEMES: Record<string, AwkTheme> = {
  warrior_warrior: { f1: [tr('疾風', 'Gale'), '💨', 'atkSpeed', 0.05, true], f2: [tr('雙刃', 'Twin Blades'), '⚔️', 'atk', 0.04, true], proc: ['doubleStrike', 10], gear: 'echoStrike', dps: [tr('劍舞不息', 'Endless Blades'), '🌪️', 'sigOnKill'], tank: [tr('狂戰之魂', 'Berserker Soul'), '😤', 'berserk'] },
  warrior_archer: { f1: [tr('突刺', 'Thrust'), '🔱', 'atk', 0.05, true], f2: [tr('貫通', 'Penetrate'), '💥', 'critDmg', 0.12, false], proc: ['execute', 25], gear: 'giantSlayer', dps: [tr('貫穿連鎖', 'Pierce Chain'), '⚡', 'chainCrit'], tank: [tr('騎士之盾', 'Knight\'s Shield'), '🛡️', 'bossGuard'] },
  warrior_mage: { f1: [tr('聖劍', 'Holy Blade'), '⚜️', 'atk', 0.04, true], f2: [tr('信仰', 'Faith'), '💛', 'maxHp', 0.05, true], proc: ['lifesteal', 10], gear: 'giantSlayer', dps: [tr('聖域', 'Sanctuary'), '🔆', 'sigField'], tank: [tr('神恩', 'Divine Grace'), '🌿', 'guardRegen'] },
  archer_warrior: { f1: [tr('獵眼', 'Hunter\'s Eye'), '👁️', 'crit', 0.025, false], f2: [tr('獵殺', 'Hunt'), '🏹', 'atk', 0.04, true], proc: ['execute', 25], gear: 'critBurst', dps: [tr('獵人本能', 'Hunter Instinct'), '🎯', 'markHits'], tank: [tr('野性直覺', 'Wild Instinct'), '🐺', 'sigGuard'] },
  archer_archer: { f1: [tr('致命一擊', 'Deadly Strike'), '🩸', 'critDmg', 0.15, false], f2: [tr('鷹眼', 'Hawk Eye'), '🦅', 'crit', 0.025, false], proc: ['doubleStrike', 10], gear: 'critBurst', dps: [tr('絕境狙擊', 'Desperate Shot'), '🎯', 'berserk'], tank: [tr('隱匿', 'Stealth'), '🌫️', 'guardRegen'] },
  archer_mage: { f1: [tr('魔力之弦', 'Mana String'), '💫', 'range', 0.06, true], f2: [tr('魔箭', 'Magic Arrow'), '🏹', 'atk', 0.04, true], proc: ['doubleStrike', 10], gear: 'piercing', dps: [tr('魔爆箭', 'Blast Arrow'), '💥', 'killBlast'], tank: [tr('魔法屏障', 'Magic Barrier'), '🔰', 'bossGuard'] },
  mage_warrior: { f1: [tr('魔刃', 'Spellblade'), '🗡️', 'atk', 0.05, true], f2: [tr('鬥氣', 'Battle Aura'), '❤️', 'maxHp', 0.05, true], proc: ['lifesteal', 10], gear: 'echoStrike', dps: [tr('魔刃連鎖', 'Blade Chain'), '⚡', 'chainCrit'], tank: [tr('魔劍護體', 'Blade Guard'), '🛡️', 'sigGuard'] },
  mage_archer: { f1: [tr('附魔擴散', 'Wide Enchant'), '🔯', 'area', 0.06, true], f2: [tr('急速附魔', 'Quick Enchant'), '⏩', 'atkSpeed', 0.05, true], proc: ['frenzy', 20], gear: 'bigBlast', dps: [tr('附魔延續', 'Lasting Enchant'), '🔯', 'sigField'], tank: [tr('生命附魔', 'Life Enchant'), '🌿', 'guardRegen'] },
  mage_mage: { f1: [tr('奧義', 'Arcana'), '🔮', 'atk', 0.05, true], f2: [tr('詠唱', 'Chant'), '⏩', 'atkSpeed', 0.05, true], proc: ['frenzy', 20], gear: 'arcaneEcho', dps: [tr('連鎖爆炸', 'Chain Blast'), '💥', 'killBlast'], tank: [tr('法力回流', 'Mana Flow'), '♻️', 'sigOnKill'] },
  warrior_necro: { f1: [tr('死亡之刃', 'Death Blade'), '⚔️', 'atk', 0.05, true], f2: [tr('不死之軀', 'Undying Body'), '🦴', 'maxHp', 0.05, true], proc: ['lifesteal', 10], gear: 'bloodEdge', dps: [tr('收割', 'Reap'), '🌪️', 'sigOnKill'], tank: [tr('亡者意志', 'Will of the Dead'), '😤', 'berserk'] },
  archer_necro: { f1: [tr('幽魂箭', 'Ghost Arrow'), '👻', 'atk', 0.04, true], f2: [tr('獵魂', 'Soul Hunt'), '👁️', 'crit', 0.025, false], proc: ['execute', 25], gear: 'piercing', dps: [tr('靈魂標記', 'Soul Mark'), '🎯', 'markHits'], tank: [tr('幽影', 'Shade'), '🌫️', 'guardRegen'] },
  mage_necro: { f1: [tr('死亡魔力', 'Death Magic'), '🌑', 'atk', 0.05, true], f2: [tr('瘟疫擴散', 'Plague Spread'), '🌀', 'area', 0.06, true], proc: ['frenzy', 20], gear: 'arcaneEcho', dps: [tr('瘟疫爆發', 'Plague Burst'), '💥', 'killBlast'], tank: [tr('死亡護罩', 'Death Ward'), '🔰', 'bossGuard'] },
  necro_warrior: { f1: [tr('軍閥之力', 'Warlord Might'), '💀', 'summon', 0.12, true], f2: [tr('戰意', 'Fighting Spirit'), '⚔️', 'atk', 0.04, true], proc: ['lifesteal', 10], gear: 'giantSlayer', dps: [tr('骸骨衝鋒', 'Bone Charge'), '⚡', 'chainCrit'], tank: [tr('軍閥之盾', 'Warlord Shield'), '🛡️', 'bossGuard'] },
  necro_archer: { f1: [tr('骨矛', 'Bone Spear'), '🦴', 'atk', 0.05, true], f2: [tr('死亡瞄準', 'Death Aim'), '👁️', 'critDmg', 0.12, false], proc: ['doubleStrike', 10], gear: 'critBurst', dps: [tr('獵殺標記', 'Kill Mark'), '🎯', 'markHits'], tank: [tr('骨之護符', 'Bone Charm'), '🛡️', 'sigGuard'] },
  necro_mage: { f1: [tr('巫妖之力', 'Lich Might'), '❄️', 'atk', 0.05, true], f2: [tr('亡靈法術', 'Necromancy'), '💀', 'summon', 0.12, true], proc: ['frenzy', 20], gear: 'bigBlast', dps: [tr('靈魂風暴', 'Soul Storm'), '🌀', 'sigField'], tank: [tr('命匣', 'Phylactery'), '♻️', 'sigGuard'] },
  necro_necro: { f1: [tr('王者軍團', 'Royal Legion'), '💀', 'summon', 0.15, true], f2: [tr('死亡之觸', 'Death Touch'), '🌑', 'atk', 0.04, true], proc: ['lifesteal', 10], gear: 'echoStrike', dps: [tr('亡者爆裂', 'Corpse Burst'), '💥', 'killBlast'], tank: [tr('不朽', 'Undying'), '🌿', 'guardRegen'] },
};

function awkSpecs(id: string): Record<Branch, BranchSpec> {
  const t = AWK_THEMES[id];
  const sig = AWAKENED[id].signature;
  const F = (f: AwkTheme['f1'], sec: number) => S(f[0], f[1], f[2], Math.round(f[3] * [1, 1.25, 1.5][sec - 1] * 1000) / 1000, f[4]);
  const pr: Spec = { name: PROC_SKILLS[t.proc[0]].name, icon: PROC_SKILLS[t.proc[0]].icon, fx: { proc: t.proc[0], value: t.proc[1] } };
  const gear: Spec = { name: SPECIALS[t.gear].name, icon: '✨', fx: { gear: t.gear } };
  const uq = (u: AwkTheme['dps']): Spec => ({ name: u[0], icon: u[1], fx: { unique: u[2] } });
  // 骸骨之王 fights through its undead, so its Spread panels speed up summoning instead
  const spread = (v: number): Spec => id === 'necro_necro' ? S(tr('亡者召喚', 'Swift Summons'), '⌛', 'summonCd', Math.round(v * 0.35 * 1000) / 1000, false) : S(tr('擴散', 'Spread'), '🌀', 'area', v);
  return {
    dps: [
      F(t.f1, 1), F(t.f2, 1), F(t.f1, 1),
      F(t.f2, 2), F(t.f1, 2), pr,
      F(t.f2, 3), F(t.f1, 3), F(t.f2, 3),
      P(tr('招牌強化', 'Signature Power'), '✨', 'sigDmg', 0.1), gear, uq(t.dps),
    ],
    tank: [
      S(tr('覺醒之軀', 'Awakened Body'), '❤️', 'maxHp', 0.05), S(tr('覺醒之盾', 'Awakened Shield'), '🛡️', 'def', 6, false), S(tr('覺醒之軀', 'Awakened Body'), '❤️', 'maxHp', 0.06),
      S(tr('再生', 'Regen'), '🌿', 'regen', 0.003, false), S(tr('覺醒之盾', 'Awakened Shield'), '🛡️', 'def', 8, false), S(tr('覺醒之軀', 'Awakened Body'), '❤️', 'maxHp', 0.07),
      S(tr('覺醒之盾', 'Awakened Shield'), '🛡️', 'def', 10, false), S(tr('覺醒之軀', 'Awakened Body'), '❤️', 'maxHp', 0.08), P(tr('嗜血', 'Bloodlust'), '🩸', 'healOnKill', 0.004),
      P(tr('閃避', 'Evasion'), '💨', 'dodge', 0.04), P(tr('嗜血', 'Bloodlust'), '🩸', 'healOnKill', 0.005), uq(t.tank),
    ],
    ctrl: [
      P(tr('招牌冷卻', 'Signature Haste'), '⌛', 'sigCd', 0.05), spread(0.05), P(tr('招牌強化', 'Signature Power'), '✨', 'sigDmg', 0.1),
      P(tr('招牌冷卻', 'Signature Haste'), '⌛', 'sigCd', 0.06), P(tr('迅捷', 'Haste'), '⏱️', 'cdr', 0.04), P(tr('招牌強化', 'Signature Power'), '✨', 'sigDmg', 0.12),
      P(tr('招牌冷卻', 'Signature Haste'), '⌛', 'sigCd', 0.07), P(tr('迅捷', 'Haste'), '⏱️', 'cdr', 0.04), P(tr('招牌強化', 'Signature Power'), '✨', 'sigDmg', 0.15),
      S(tr('疾步', 'Swiftness'), '👟', 'moveSpeed', 0.04), spread(0.08), { name: getLang() === 'en' ? `${sig.name}+` : `${sig.name}強化`, icon: sig.icon, fx: { sigUp: true } },
    ],
  };
}

// ---------- three-class boards: the two-class board's shape, stronger, flavoured by the third class ----------
const ESS_STAT: Record<ClassId, [string, string, StatKey, number, boolean]> = {
  warrior: [tr('鐵血', 'Ironblood'), '❤️', 'maxHp', 0.06, true],
  archer: [tr('疾風', 'Gale'), '👁️', 'crit', 0.03, false],
  mage: [tr('奧術', 'Arcana'), '🔮', 'atk', 0.05, true],
  necro: [tr('冥府', 'Abyss'), '💀', 'summon', 0.14, true],
};
function triSpecs(main: ClassId, sub: ClassId, sub2: ClassId): Record<Branch, BranchSpec> {
  const base = awkSpecs(`${main}_${sub}`);
  const e = ESS_STAT[sub2];
  const echo = ascendedFor(main, sub, sub2).echo!;
  const rename = (sp: Spec): Spec => ({ ...sp, name: sp.name.replace('覺醒', '昇華').replace('Awakened', 'Ascended') });
  const boost = (sp: Spec): Spec => {
    if (!('stat' in sp.fx)) return rename(sp);
    const fx = sp.fx;
    const r = (v?: number) => (v === undefined ? undefined : Math.round(v * 1.3 * 10000) / 10000);
    return rename({ ...sp, fx: { stat: fx.stat, flat: r(fx.flat), pct: r(fx.pct) } });
  };
  const ess = (sec: number) => S(e[0], e[1], e[2], Math.round(e[3] * [1, 1.25, 1.5][sec - 1] * 1000) / 1000, e[4]);
  const dps = base.dps.map(boost);
  // the third class replaces the second stat line of the damage path
  dps[1] = ess(1); dps[3] = ess(2); dps[6] = ess(3); dps[8] = ess(3);
  const ctrl = base.ctrl.map(boost);
  ctrl[9] = { name: getLang() === 'en' ? `${echo.name}+` : `${echo.name}強化`, icon: echo.icon, fx: { echoUp: true } };
  return { dps, tank: base.tank.map(boost), ctrl } as Record<Branch, BranchSpec>;
}

export const BOARD_NODES = Object.fromEntries((['warrior', 'archer', 'mage', 'necro'] as ClassId[]).map((c) => [c, layout(c, BOARDS[c], 'base')])) as Record<ClassId, BoardNode[]>;
export const AWK_BOARD_NODES: Record<string, BoardNode[]> = Object.fromEntries(Object.keys(AWAKENED).map((id) => [id, layout(id, awkSpecs(id), 'awk')]));
export const TRI_BOARD_NODES: Record<string, BoardNode[]> = {};
for (const a of CLASS_IDS) for (const b of CLASS_IDS) for (const c of CLASS_IDS) TRI_BOARD_NODES[`${a}_${b}_${c}`] = layout(`${a}_${b}_${c}`, triSpecs(a, b, c), 'tri');
/** Awakened (two-class) and ascended (three-class) boards. */
export const MIX_BOARD_NODES: Record<string, BoardNode[]> = { ...AWK_BOARD_NODES, ...TRI_BOARD_NODES };
export const ALL_NODES: BoardNode[] = [...Object.values(BOARD_NODES).flat(), ...Object.values(MIX_BOARD_NODES).flat()];
const NODE_MAP = new Map(ALL_NODES.map((n) => [n.id, n]));
/** Extra copies of a class board (same class picked twice / three times) start with "2:" / "3:" (e.g. "2:warrior.dps.1"). */
export const copyPrefix = (id: string) => (/^[23]:/.test(id) ? id.slice(0, 2) : '');
export const baseId = (id: string) => id.slice(copyPrefix(id).length);
/** Which board a panel id is on: "warrior", "2:warrior" (second copy) or an awakened id like "warrior_mage". */
export const boardKeyOf = (id: string) => id.slice(0, id.indexOf('.'));
export const nodeById = (id: string) => NODE_MAP.get(baseId(id));
/** The panels and section tiers of a board key. */
export function boardNodes(key: string): BoardNode[] {
  const b = baseId(`${key}.`).slice(0, -1);
  return (BOARD_NODES as Record<string, BoardNode[]>)[b] ?? MIX_BOARD_NODES[b] ?? [];
}
export const sectionTiers = (key: string) => (TRI_BOARD_NODES[key] ? TRI_SECTION_TIER : AWK_BOARD_NODES[key] ? AWK_SECTION_TIER : SECTION_TIER);

export function effectText(fx: Effect, board?: string): string {
  if ('stat' in fx) {
    const names: Partial<Record<StatKey, string>> = { atk: tr('攻擊', 'ATK'), maxHp: 'HP', def: tr('防禦', 'DEF'), atkSpeed: tr('攻速', 'Attack Speed'), moveSpeed: tr('移速', 'Move Speed'), crit: tr('暴擊率', 'Crit Rate'), critDmg: tr('暴擊傷害', 'Crit Damage'), range: tr('射程 / 攻擊距離', 'Range'), area: tr('範圍', 'Area'), regen: tr('每秒回復', 'Regen'), summon: tr('亡靈傷害同 HP', 'Undead damage & HP'), summonCd: tr('召喚冷卻', 'Summon cooldown') };
    const n = names[fx.stat] ?? fx.stat;
    if (fx.stat === 'regen') return getLang() === 'en' ? `${n} ${((fx.flat ?? 0) * 100).toFixed(1)}% HP/s` : `${n} ${((fx.flat ?? 0) * 100).toFixed(1)}% HP`;
    if (fx.stat === 'crit' || fx.stat === 'critDmg') return `${n} +${Math.round((fx.flat ?? 0) * 1000) / 10}%`;
    if (fx.stat === 'summonCd') return getLang() === 'en' ? `${n} -${Math.round((fx.flat ?? 0) * 100)}% (Raise Skeletons, summoning signatures; kills rise more often)` : `${n} -${Math.round((fx.flat ?? 0) * 100)}%（召喚骷髏、召喚型招牌技；殺敵更易變亡靈）`;
    return fx.pct !== undefined ? `${n} +${Math.round(fx.pct * 100)}%` : `${n} +${fx.flat}`;
  }
  if ('skill' in fx) return SKILL_DESC[fx.skill][0];
  if ('upgrade' in fx) return getLang() === 'en' ? `Enhances "${AUTO_SKILLS[fx.upgrade].name}": ${SKILL_DESC[fx.upgrade][1]}` : `強化「${AUTO_SKILLS[fx.upgrade].name}」：${SKILL_DESC[fx.upgrade][1]}`;
  if ('proc' in fx) return `${PROC_SKILLS[fx.proc].name}${tr('：', ': ')}${PROC_SKILLS[fx.proc].desc(fx.value)}`;
  if ('gear' in fx) return `${SPECIALS[fx.gear].name}${tr('：', ': ')}${SPECIALS[fx.gear].desc}`;
  if ('unique' in fx) return `${tr('專屬被動：', 'Unique passive: ')}${UNIQUE_DESC[fx.unique]}`;
  if ('echoUp' in fx) {
    const [m, a, b] = (board ?? '').split('_') as ClassId[];
    const echo = m && a && b ? ascendedFor(m, a, b).echo : undefined;
    return echo ? (getLang() === 'en' ? `"${echo.name}" is 50% stronger` : `「${echo.name}」強 50%`) : tr('三職業追擊強 50%', 'Echo 50% stronger');
  }
  if ('sigUp' in fx) {
    const parts = (board ?? '').split('_');
    const a = board ? AWAKENED[parts.slice(0, 2).join('_')] : undefined;
    if (!a) return tr('招牌技變強化版', 'Signature skill becomes its enhanced version');
    return getLang() === 'en' ? `Enhanced "${a.signature.name}": ${SIG_UP_DESC[a.signature.kind]}` : `「${a.signature.name}」強化版：${SIG_UP_DESC[a.signature.kind]}`;
  }
  const v = fx.value;
  switch (fx.special) {
    case 'healOnKill': return getLang() === 'en' ? `Heal ${(v * 100).toFixed(1)}% HP per kill` : `每殺一隻敵人回 ${(v * 100).toFixed(1)}% HP`;
    case 'multishot': return tr('每次攻擊多一下（弓多一支箭、法師多一個火球、戰士多斬一下）', 'One extra hit per attack (an extra arrow, fireball or sword swing)');
    case 'pierce': return tr('箭可以多穿 1 個敵人', 'Arrows pierce 1 more enemy');
    case 'sigDmg': {
      // summoning signatures: the bonus goes to the skeletons they raise
      const a = board ? AWAKENED[(board.replace(/^[23]:/, '').split('_').slice(0, 2).join('_'))] : undefined;
      if (a && (a.signature.kind === 'raiseLegion' || a.signature.kind === 'boneArmy')) return getLang() === 'en' ? `Signature +${Math.round(v * 100)}%: the Skeletons "${a.signature.name}" raises deal +${Math.round(v * 100)}% damage` : `招牌技 +${Math.round(v * 100)}%：「${a.signature.name}」召喚嘅骷髏傷害 +${Math.round(v * 100)}%`;
      return `${tr('招牌技傷害', 'Signature skill damage')} +${Math.round(v * 100)}%`;
    }
    case 'sigCd': return `${tr('招牌技冷卻', 'Signature skill cooldown')} -${Math.round(v * 100)}%`;
    case 'cdr': return `${tr('所有技能冷卻', 'All skill cooldowns')} -${Math.round(v * 100)}%`;
    case 'dodge': return `${Math.round(v * 100)}% ${tr('機會完全避開一次傷害', 'chance to fully dodge a hit')}`;
    case 'thorns': return tr('敵人撞到你時受到 150% 攻擊力反傷', 'Enemies that touch you take 150% ATK as thorns damage');
    case 'frostArmor': return tr('受傷時 15% 機會放冰霜新星（減速）', '15% chance to cast Frost Nova when hit (slow)');
    case 'minions': return tr('亡靈上限 +1', 'Undead cap +1');
  }
}

export const SKILL_DESC: Record<AutoSkillId, [string, string]> = {
  whirlwind: [tr('每 5 秒自動旋轉一圈，斬身邊敵人（150%）', 'Every 5s spin and slash nearby enemies (150%)'), tr('每 4.5 秒、範圍更大、250%', 'Every 4.5s, bigger area, 250%')],
  slam: [tr('每 8 秒重擊地面，震傷大範圍敵人（200%）兼推開', 'Every 8s slam the ground, hitting a wide area (200%) and knocking back'), tr('每 7 秒、範圍更大、300%', 'Every 7s, bigger area, 300%')],
  lastStand: [tr('每張地圖一次：受到致命傷害時留返 30% HP', 'Once per map: survive a fatal blow with 30% HP'), tr('留返 60% HP', 'Survive with 60% HP')],
  warCry: [tr('每 10 秒大叫，身邊敵人減速 50% 3 秒兼受傷（100%）', 'Every 10s shout: nearby enemies slowed 50% for 3s and damaged (100%)'), tr('每 9 秒、範圍更大、減速 4 秒', 'Every 9s, bigger area, 4s slow')],
  arrowRain: [tr('每 6 秒喺最近敵人位置落箭雨（120%），減速 30%', 'Every 6s rain arrows on the nearest enemy (120%), slow 30%'), tr('每 5 秒、範圍更大、200%', 'Every 5s, bigger area, 200%')],
  arrowFan: [tr('每 5 秒向前射扇形 5 支穿透箭（100%）', 'Every 5s fire a fan of 5 piercing arrows (100%)'), tr('每 4 秒、8 支', 'Every 4s, 8 arrows')],
  snare: [tr('每 8 秒喺最近敵人位置放陷阱，定住敵人 2 秒（減速 85%）兼受傷（80%）', 'Every 8s set a trap at the nearest enemy: root 2s (85% slow) and damage (80%)'), tr('每 7 秒、範圍更大、定 3 秒', 'Every 7s, bigger area, 3s root')],
  barrier: [tr('每 12 秒無敵 1.2 秒兼回復 6% HP', 'Every 12s become invincible for 1.2s and heal 6% HP'), tr('每 10 秒、無敵 1.8 秒、回復 10%', 'Every 10s, 1.8s invincible, heal 10%')],
  frostNova: [tr('每 7 秒喺身邊爆發冰霜（150%），敵人減速 40%', 'Every 7s burst frost around you (150%), slow 40%'), tr('每 6 秒、範圍更大、250%', 'Every 6s, bigger area, 250%')],
  meteor: [tr('每 9 秒召喚隕石砸落敵人（400%）', 'Every 9s call a meteor down on enemies (400%)'), tr('每 8 秒、一次 2 粒', 'Every 8s, 2 meteors')],
  resonance: [tr('攻擊命中有 20% 機會引發小爆炸（60%）', 'Hits have a 20% chance to cause a small explosion (60%)'), tr('35% 機會', '35% chance')],
  timeWarp: [tr('每 14 秒令身邊大範圍敵人減速 50% 4 秒', 'Every 14s slow enemies in a wide area by 50% for 4s'), tr('每 12 秒、減速 60% 5 秒兼受傷（120%）', 'Every 12s, 60% slow for 5s plus damage (120%)')],
  raiseDead: [tr('每 8 秒喺身邊召喚 2 隻骷髏（任何職業都用得）', 'Every 8s summon 2 Skeletons (any class)'), tr('每 7 秒、一次 3 隻', 'Every 7s, 3 Skeletons')],
  corpseBlast: [tr('每 6 秒喺最近敵人位置引爆屍體（180%）', 'Every 6s detonate a corpse at the nearest enemy (180%)'), tr('每 5 秒、範圍更大、280%', 'Every 5s, bigger area, 280%')],
  boneArmor: [tr('每 10 秒，每隻骷髏幫你回復 2% HP（冇骷髏都回 2%）', 'Every 10s heal 2% HP per Skeleton (2% even with none)'), tr('每 9 秒、每隻 3%', 'Every 9s, 3% each')],
  curse: [tr('每 9 秒詛咒身邊敵人 3 秒：受到傷害 +50%、減速 40%', 'Every 9s curse nearby enemies for 3s: +50% damage taken, 40% slow'), tr('每 8 秒、範圍更大、4 秒兼受傷（80%）', 'Every 8s, bigger area, 4s plus damage (80%)')],
};

// ---------- what a set of unlocked panels does ----------
export interface SkillEffects {
  bonus: StatBonus;
  autoSkills: { id: AutoSkillId; level: 1 | 2 }[];
  multishot: number;
  pierce: number;
  healOnKill: number;
  sigDmg: number;
  sigCd: number;
  cdr: number; // fraction off every auto skill and signature cooldown
  dodge: number;
  thorns: boolean;
  frostArmor: boolean;
  minions: number;
  procs: { id: ProcId; value: number }[];
  specials: SpecialId[];
  uniques: UniqueId[];
  sigUp: boolean;
  echoUp: boolean;
}

/** scale: 專精 (no second class) makes every number on the board stronger (on / off nodes stay the same). */
export function boardEffects(unlocked: Iterable<string>, scale = 1): SkillEffects {
  const fx: SkillEffects = { bonus: {}, autoSkills: [], multishot: 0, pierce: 0, healOnKill: 0, sigDmg: 0, sigCd: 0, cdr: 0, dodge: 0, thorns: false, frostArmor: false, minions: 0, procs: [], specials: [], uniques: [], sigUp: false, echoUp: false };
  const skills = new Map<AutoSkillId, 1 | 2>();
  const upgrades = new Set<AutoSkillId>();
  const skillCount = new Map<AutoSkillId, number>();
  for (const id of unlocked) {
    const n = nodeById(id);
    if (!n) continue;
    const e = n.fx;
    if ('stat' in e) addBonus(fx.bonus, e.stat, { flat: e.flat === undefined ? undefined : e.flat * scale, pct: e.pct === undefined ? undefined : e.pct * scale });
    else if ('skill' in e) { skills.set(e.skill, 1); skillCount.set(e.skill, (skillCount.get(e.skill) ?? 0) + 1); }
    else if ('upgrade' in e) upgrades.add(e.upgrade);
    else if ('proc' in e) fx.procs.push({ id: e.proc, value: e.value * scale });
    else if ('gear' in e) fx.specials.push(e.gear);
    else if ('unique' in e) { if (!fx.uniques.includes(e.unique)) fx.uniques.push(e.unique); }
    else if ('sigUp' in e) fx.sigUp = true;
    else if ('echoUp' in e) fx.echoUp = true;
    else {
      switch (e.special) {
        case 'healOnKill': fx.healOnKill += e.value * scale; break;
        case 'multishot': fx.multishot += e.value; break;
        case 'pierce': fx.pierce += e.value; break;
        case 'sigDmg': fx.sigDmg += e.value * scale; break;
        case 'sigCd': fx.sigCd += e.value * Math.min(scale, 1.5); break;
        case 'cdr': fx.cdr += e.value * Math.min(scale, 1.5); break;
        case 'dodge': fx.dodge += e.value * Math.min(scale, 1.5); break;
        case 'thorns': fx.thorns = true; break;
        case 'frostArmor': fx.frostArmor = true; break;
        case 'minions': fx.minions += e.value; break;
      }
    }
  }
  for (const u of upgrades) if (skills.has(u)) skills.set(u, 2);
  // same skill unlocked on both copies of a board (same-class awakening) = enhanced version
  for (const [id, c] of skillCount) if (c >= 2) skills.set(id, 2);
  for (const [id, level] of skills) fx.autoSkills.push({ id, level });
  fx.cdr = Math.min(0.4, fx.cdr);
  fx.dodge = Math.min(0.35, fx.dodge);
  return fx;
}

/** Is this panel open to unlock right now (ignoring cost)? */
export function canUnlock(n: BoardNode, unlocked: Set<string>, highestCleared: number): boolean {
  if (unlocked.has(n.id)) return false;
  if (highestCleared < n.gate) return false;
  return n.parent === '' || unlocked.has(n.parent);
}

/** Total souls / runes spent on a set of panels (for refunds). */
export function boardCost(ids: Iterable<string>): { souls: number; runes: number } {
  let souls = 0, runes = 0;
  for (const id of ids) { const n = nodeById(id); if (n) { souls += n.cost.souls; runes += n.cost.runes; } }
  return { souls, runes };
}

/** Cost of a panel when you already own `owned` panels on your active boards. */
export const scaledCost = (n: BoardNode, owned: number) => ({ souls: Math.round(n.cost.souls * (1 + COST_GROWTH * owned)), runes: Math.round(n.cost.runes * (1 + COST_GROWTH * owned)) });
export const resetCost = (count: number, resets: number) => (resets === 0 ? 0 : Math.round(count * 30 * (1 + 0.25 * (resets - 1))));
