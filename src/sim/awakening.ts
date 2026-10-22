// Awakened classes: main class + sub class (order matters) = 16 combinations.
// The main class keeps its normal attack; the awakened class adds multipliers and one signature skill.
import type { ClassId } from './classes';
import type { StatBonus } from './stats';
import { tr } from '../i18n';

export type SignatureKind =
  | 'bladeStorm' | 'charge' | 'holyLight'
  | 'markPrey' | 'snipe' | 'arrowStorm'
  | 'spellSlash' | 'field' | 'arcaneBurst'
  | 'soulReap' | 'ghostVolley' | 'deathNova' | 'boneArmy' | 'boneSpear' | 'soulStorm' | 'raiseLegion';

export interface AwakenedDef {
  id: string; // `${main}_${sub}`
  main: ClassId;
  sub: ClassId;
  name: string;
  en: string;
  icon: string;
  bonus: StatBonus; // the "×" multipliers from the class table
  bonusText: string;
  extraMultishot?: number;
  bossDmg?: number; // extra damage vs mini bosses / bosses
  signature: { kind: SignatureKind; name: string; desc: string; cooldown: number; icon: string };
  focusStat: { key: 'atkSpeed' | 'atk' | 'def' | 'crit' | 'critDmg' | 'range' | 'maxHp' | 'area' | 'summon'; flat?: number; pct?: number; label: string };
  // three-class (ascended) only
  sub2?: ClassId;
  base?: string; // the two-class mix it grew from, e.g. 'warrior_mage'
  echo?: { kind: EchoKind; name: string; desc: string; icon: string; power: number };
}
export type EchoKind = 'slash' | 'volley' | 'blast' | 'souls';

const A = (d: AwakenedDef) => d;

export const AWAKENED: Record<string, AwakenedDef> = {
  warrior_warrior: A({
    id: 'warrior_warrior', main: 'warrior', sub: 'warrior', name: tr('雙刃戰士', 'Dual Blade'), en: 'Dual Blade', icon: '⚔️',
    bonus: { atkSpeed: { mult: 1.3 } }, bonusText: tr('攻速 ×1.3', 'Atk Spd ×1.3'),
    signature: { kind: 'bladeStorm', name: tr('劍刃風暴', 'Blade Storm'), desc: tr('3 秒內不停旋轉，斬晒身邊所有敵人', 'Spin for 3s, slashing all nearby enemies'), cooldown: 12, icon: '🌪️' },
    focusStat: { key: 'atkSpeed', pct: 0.05, label: tr('攻速 +5%', 'Atk Spd +5%') },
  }),
  warrior_archer: A({
    id: 'warrior_archer', main: 'warrior', sub: 'archer', name: tr('槍騎士', 'Lancer'), en: 'Lancer', icon: '🔱',
    bonus: { atk: { mult: 1.15 }, moveSpeed: { mult: 1.1 }, range: { flat: 0.8 } }, bonusText: tr('攻擊 ×1.15、移速 ×1.1、斬擊範圍 +0.8', 'ATK ×1.15, Move ×1.1, Slash range +0.8'),
    signature: { kind: 'charge', name: tr('貫穿突刺', 'Piercing Charge'), desc: tr('向前衝刺，刺穿路上所有敵人（250%）', 'Dash forward, piercing every enemy in the path (250%)'), cooldown: 8, icon: '🔱' },
    focusStat: { key: 'atk', pct: 0.05, label: tr('攻擊 +5%', 'ATK +5%') },
  }),
  warrior_mage: A({
    id: 'warrior_mage', main: 'warrior', sub: 'mage', name: tr('聖騎士', 'Paladin'), en: 'Paladin', icon: '⚜️',
    bonus: { maxHp: { mult: 1.2 }, def: { pct: 0.15 } }, bonusText: tr('HP ×1.2、防禦 +15%、對 Boss 傷害 +20%', 'HP ×1.2, DEF +15%, Boss dmg +20%'), bossDmg: 0.2,
    signature: { kind: 'holyLight', name: tr('聖光', 'Holy Light'), desc: tr('回復 30% HP，無敵 2.5 秒，同時灼燒身邊敵人（200%）', 'Heal 30% HP, invulnerable 2.5s, burn nearby enemies (200%)'), cooldown: 15, icon: '✨' },
    focusStat: { key: 'def', flat: 8, label: tr('防禦 +8', 'DEF +8') },
  }),
  archer_warrior: A({
    id: 'archer_warrior', main: 'archer', sub: 'warrior', name: tr('獵人', 'Hunter'), en: 'Hunter', icon: '🦅',
    bonus: { crit: { flat: 0.15 }, atk: { mult: 1.1 } }, bonusText: tr('暴擊率 +15%、攻擊 ×1.1', 'Crit +15%, ATK ×1.1'),
    signature: { kind: 'markPrey', name: tr('標記獵物', 'Mark Prey'), desc: tr('標記最強嘅敵人 6 秒（受到傷害 +50%），再連射 5 箭', 'Mark the strongest enemy for 6s (+50% dmg taken), then fire 5 arrows'), cooldown: 10, icon: '🎯' },
    focusStat: { key: 'crit', flat: 0.025, label: tr('暴擊率 +2.5%', 'Crit +2.5%') },
  }),
  archer_archer: A({
    id: 'archer_archer', main: 'archer', sub: 'archer', name: tr('神射手', 'Sharpshooter'), en: 'Sharpshooter', icon: '🏹',
    bonus: { crit: { flat: 0.2 }, moveSpeed: { mult: 1.2 } }, bonusText: tr('暴擊率 +20%、移速 ×1.2；散射箭會追蹤（每下 60%）；追蹤箭連穿 6 隻；可以多用一種箭；多重箭袋強化到 +10 變「極·神射」（所有箭種同時用）', 'Crit +20%, Move ×1.2; scatter arrows home in (60% each); homing arrows chain 6; one more arrow type at once; a +10 Arrow Mix item unlocks Max Sharpshooter (every arrow type at once)'),
    signature: { kind: 'snipe', name: tr('狙擊', 'Snipe'), desc: tr('一發超遠距離穿透箭（800%）', 'One long-range piercing shot (800%)'), cooldown: 9, icon: '🎯' },
    focusStat: { key: 'critDmg', flat: 0.15, label: tr('暴擊傷害 +15%', 'Crit Dmg +15%') },
  }),
  archer_mage: A({
    id: 'archer_mage', main: 'archer', sub: 'mage', name: tr('魔法弓手', 'Magick Archer'), en: 'Magick Archer', icon: '🏹',
    bonus: { range: { mult: 1.25 }, atk: { mult: 1.1 } }, bonusText: tr('射程 ×1.25、攻擊 ×1.1', 'Range ×1.25, ATK ×1.1'),
    signature: { kind: 'arrowStorm', name: tr('魔法箭陣', 'Arrow Storm'), desc: tr('向四周射出 16 支魔法箭（每支 150%）', 'Fire 16 magic arrows all around (150% each)'), cooldown: 10, icon: '💫' },
    focusStat: { key: 'range', pct: 0.06, label: tr('射程 +6%', 'Range +6%') },
  }),
  mage_warrior: A({
    id: 'mage_warrior', main: 'mage', sub: 'warrior', name: tr('魔劍士', 'Spellblade'), en: 'Spellblade', icon: '🗡️',
    bonus: { atk: { mult: 1.15 }, maxHp: { mult: 1.1 } }, bonusText: tr('攻擊 ×1.15、HP ×1.1', 'ATK ×1.15, HP ×1.1'),
    signature: { kind: 'spellSlash', name: tr('魔刃斬', 'Spell Slash'), desc: tr('一記大範圍魔法斬擊（350%）', 'A wide magic slash (350%)'), cooldown: 8, icon: '🗡️' },
    focusStat: { key: 'maxHp', pct: 0.06, label: 'HP +6%' },
  }),
  mage_archer: A({
    id: 'mage_archer', main: 'mage', sub: 'archer', name: tr('附魔師', 'Enchanter'), en: 'Enchanter', icon: '🌟',
    bonus: { range: { mult: 1.15 } }, bonusText: tr('射程 ×1.15、每次多放 1 個火球', 'Range ×1.15, +1 fireball per cast'), extraMultishot: 1,
    signature: { kind: 'field', name: tr('附魔領域', 'Enchanted Field'), desc: tr('腳下展開 6 秒魔法陣，入面敵人減速 50% 兼持續受傷', '6s magic circle underfoot: enemies inside slowed 50% and take damage'), cooldown: 16, icon: '🔯' },
    focusStat: { key: 'area', pct: 0.06, label: tr('範圍 +6%', 'Area +6%') },
  }),
  mage_mage: A({
    id: 'mage_mage', main: 'mage', sub: 'mage', name: tr('大法師', 'Archmage'), en: 'Archmage', icon: '🔮',
    bonus: { atk: { mult: 1.3 }, atkSpeed: { mult: 1.2 } }, bonusText: tr('攻擊 ×1.3、攻速 ×1.2', 'ATK ×1.3, Atk Spd ×1.2'),
    signature: { kind: 'arcaneBurst', name: tr('奧術爆發', 'Arcane Burst'), desc: tr('喺附近 5 隻敵人身上同時爆炸（每個 300%）', 'Blast 5 nearby enemies at once (300% each)'), cooldown: 12, icon: '💥' },
    focusStat: { key: 'atk', pct: 0.05, label: tr('攻擊 +5%', 'ATK +5%') },
  }),
  warrior_necro: A({
    id: 'warrior_necro', main: 'warrior', sub: 'necro', name: tr('死亡騎士', 'Death Knight'), en: 'Death Knight', icon: '🗡️',
    bonus: { maxHp: { mult: 1.15 }, atk: { mult: 1.1 } }, bonusText: tr('HP ×1.15、攻擊 ×1.1、殺死嘅敵人有機會變亡靈', 'HP ×1.15, ATK ×1.1, kills may rise as Undead'),
    signature: { kind: 'soulReap', name: tr('靈魂收割', 'Soul Reap'), desc: tr('斬一整圈（300%），每斬中一隻敵人回 2% HP（最多 20%）', 'Full-circle slash (300%), heal 2% HP per enemy hit (max 20%)'), cooldown: 10, icon: '🌪️' },
    focusStat: { key: 'maxHp', pct: 0.06, label: 'HP +6%' },
  }),
  archer_necro: A({
    id: 'archer_necro', main: 'archer', sub: 'necro', name: tr('鬼魂獵人', 'Ghost Hunter'), en: 'Ghost Hunter', icon: '👻',
    bonus: { crit: { flat: 0.1 }, atk: { mult: 1.1 } }, bonusText: tr('暴擊率 +10%、攻擊 ×1.1、殺死嘅敵人有機會變亡靈', 'Crit +10%, ATK ×1.1, kills may rise as Undead'),
    signature: { kind: 'ghostVolley', name: tr('幽魂箭雨', 'Ghost Volley'), desc: tr('向最近 4 隻敵人各射 3 支穿透鬼箭（每支 180%）', 'Fire 3 piercing ghost arrows at each of the 4 nearest enemies (180% each)'), cooldown: 10, icon: '👻' },
    focusStat: { key: 'crit', flat: 0.025, label: tr('暴擊率 +2.5%', 'Crit +2.5%') },
  }),
  mage_necro: A({
    id: 'mage_necro', main: 'mage', sub: 'necro', name: tr('死亡法師', 'Death Mage'), en: 'Death Mage', icon: '☠️',
    bonus: { atk: { mult: 1.15 }, area: { mult: 1.1 } }, bonusText: tr('攻擊 ×1.15、範圍 ×1.1、殺死嘅敵人有機會變亡靈', 'ATK ×1.15, Area ×1.1, kills may rise as Undead'),
    signature: { kind: 'deathNova', name: tr('死亡新星', 'Death Nova'), desc: tr('身邊爆發死亡之力（300%），敵人減速 50%', 'Burst of death around you (300%), slows enemies 50%'), cooldown: 11, icon: '☠️' },
    focusStat: { key: 'atk', pct: 0.05, label: tr('攻擊 +5%', 'ATK +5%') },
  }),
  necro_warrior: A({
    id: 'necro_warrior', main: 'necro', sub: 'warrior', name: tr('骸骨軍閥', 'Bone Warlord'), en: 'Bone Warlord', icon: '💀',
    bonus: { maxHp: { mult: 1.15 }, summon: { mult: 1.25 } }, bonusText: tr('HP ×1.15、亡靈強度 ×1.25', 'HP ×1.15, Undead Power ×1.25'),
    signature: { kind: 'boneArmy', name: tr('骸骨大軍', 'Bone Army'), desc: tr('即刻召喚 4 隻骷髏（可以超過上限），8 秒內骷髏傷害 +50%', 'Summon 4 Skeletons now (can exceed cap); Skeleton dmg +50% for 8s'), cooldown: 14, icon: '💀' },
    focusStat: { key: 'summon', pct: 0.08, label: tr('亡靈強度 +8%', 'Undead Power +8%') },
  }),
  necro_archer: A({
    id: 'necro_archer', main: 'necro', sub: 'archer', name: tr('骸骨狙擊手', 'Bone Sniper'), en: 'Bone Sniper', icon: '🦴',
    bonus: { range: { mult: 1.2 }, crit: { flat: 0.12 } }, bonusText: tr('射程 ×1.2、暴擊率 +12%', 'Range ×1.2, Crit +12%'),
    signature: { kind: 'boneSpear', name: tr('骨矛', 'Bone Spear'), desc: tr('射出一支穿透全場嘅骨矛（700%）', 'Fire a bone spear that pierces the whole field (700%)'), cooldown: 9, icon: '🦴' },
    focusStat: { key: 'critDmg', flat: 0.15, label: tr('暴擊傷害 +15%', 'Crit Dmg +15%') },
  }),
  necro_mage: A({
    id: 'necro_mage', main: 'necro', sub: 'mage', name: tr('巫妖', 'Lich'), en: 'Lich', icon: '🧊',
    bonus: { atk: { mult: 1.2 }, area: { mult: 1.15 } }, bonusText: tr('攻擊 ×1.2、範圍 ×1.15', 'ATK ×1.2, Area ×1.15'),
    signature: { kind: 'soulStorm', name: tr('靈魂風暴', 'Soul Storm'), desc: tr('向四周射出 12 粒暗影彈（每粒 150%），打中嘅敵人減速', 'Fire 12 shadow bolts all around (150% each), slowing enemies hit'), cooldown: 10, icon: '🌀' },
    focusStat: { key: 'area', pct: 0.06, label: tr('範圍 +6%', 'Area +6%') },
  }),
  necro_necro: A({
    id: 'necro_necro', main: 'necro', sub: 'necro', name: tr('骸骨之王', 'Bone King'), en: 'Bone King', icon: '👑',
    bonus: { summon: { mult: 1.4 }, atkSpeed: { mult: 1.1 } }, bonusText: tr('亡靈強度 ×1.4、攻速 ×1.1、亡靈上限 +1', 'Undead Power ×1.4, Atk Spd ×1.1, Undead cap +1'),
    signature: { kind: 'raiseLegion', name: tr('亡者軍團', 'Raise Legion'), desc: tr('召喚 5 隻大骷髏（1.5 倍強，維持 12 秒），全部骷髏回滿血', 'Summon 5 big Skeletons (1.5× strong, 12s); fully heal all Skeletons'), cooldown: 16, icon: '👑' },
    focusStat: { key: 'summon', pct: 0.08, label: tr('亡靈強度 +8%', 'Undead Power +8%') },
  }),
};

export const awakenedFor = (main: ClassId, sub: ClassId | null | undefined): AwakenedDef | null =>
  sub ? AWAKENED[`${main}_${sub}`] ?? null : null;

/** Dungeon tier you must clear before choosing a second class. */
export const AWAKEN_TIER = 5;

/** What the signature's enhanced version (last panel of the awakened board's 控制 path) does. */
export const SIG_UP_DESC: Record<SignatureKind, string> = {
  bladeStorm: tr('旋轉時間由 3 秒變 4.5 秒', 'Spin lasts 4.5s instead of 3s'),
  charge: tr('衝得更遠，傷害 250% → 350%', 'Longer dash, dmg 250% → 350%'),
  holyLight: tr('回復 45% HP，無敵 3.5 秒', 'Heal 45% HP, invulnerable 3.5s'),
  markPrey: tr('標記 8 秒，連射 8 箭', 'Mark for 8s, fire 8 arrows'),
  snipe: tr('傷害 800% → 1200%', 'Dmg 800% → 1200%'),
  arrowStorm: tr('16 支 → 24 支魔法箭', '16 → 24 magic arrows'),
  spellSlash: tr('斬一整圈，傷害 350% → 500%', 'Full-circle slash, dmg 350% → 500%'),
  field: tr('魔法陣維持 9 秒，傷害更高', 'Circle lasts 9s, more dmg'),
  arcaneBurst: tr('同時爆 8 隻敵人', 'Blast 8 enemies at once'),
  soulReap: tr('傷害 300% → 450%，每隻回 3% HP', 'Dmg 300% → 450%, heal 3% HP per hit'),
  ghostVolley: tr('射 6 隻敵人，每隻 4 支', 'Hit 6 enemies, 4 arrows each'),
  deathNova: tr('範圍更大，傷害 300% → 450%', 'Bigger area, dmg 300% → 450%'),
  boneArmy: tr('一次召喚 6 隻，傷害 +80%', 'Summon 6 at once, dmg +80%'),
  boneSpear: tr('傷害 700% → 1100%，矛更粗', 'Dmg 700% → 1100%, thicker spear'),
  soulStorm: tr('12 粒 → 20 粒', '12 → 20 bolts'),
  raiseLegion: tr('一次 7 隻，維持 16 秒', '7 at once, lasts 16s'),
};

// ---------- 昇華：三職業混合 (main + second + third, order matters = 64) ----------
/** Account level and dungeon tier needed to pick a third class. */
export const ASCEND_LEVEL = 40;
export const ASCEND_TIER = 25;

interface Essence {
  prefix: string; bonus: StatBonus; bonusText: string;
  echo: { kind: EchoKind; name: string; desc: string; icon: string };
}
/** What the third class adds: a name prefix, a bonus, and an "echo" that follows every Signature cast. */
const ESSENCE: Record<ClassId, Essence> = {
  warrior: {
    prefix: tr('鐵血', 'Ironblood '), bonus: { maxHp: { mult: 1.15 }, def: { pct: 0.1 } }, bonusText: tr('HP ×1.15、防禦 +10%', 'HP ×1.15, DEF +10%'),
    echo: { kind: 'slash', name: tr('劍氣', 'Sword Wave'), icon: '🗡️', desc: tr('招牌技之後放一圈劍氣，斬晒身邊敵人（200%）', 'After your Signature, a sword wave hits everything around you (200%)') },
  },
  archer: {
    prefix: tr('疾風', 'Gale '), bonus: { atkSpeed: { mult: 1.12 }, crit: { flat: 0.08 } }, bonusText: tr('攻速 ×1.12、暴擊率 +8%', 'Atk Spd ×1.12, Crit +8%'),
    echo: { kind: 'volley', name: tr('箭雨', 'Arrow Rain'), icon: '🏹', desc: tr('招牌技之後向四周射 10 支穿透箭（每支 120%）', 'After your Signature, fire 10 piercing arrows all around (120% each)') },
  },
  mage: {
    prefix: tr('奧術', 'Arcane '), bonus: { atk: { mult: 1.12 }, area: { mult: 1.1 } }, bonusText: tr('攻擊 ×1.12、範圍 ×1.1', 'ATK ×1.12, Area ×1.1'),
    echo: { kind: 'blast', name: tr('魔爆', 'Arcane Blast'), icon: '💥', desc: tr('招牌技之後喺最近 4 隻敵人身上爆炸（每個 200%）', 'After your Signature, blast the 4 nearest enemies (200% each)') },
  },
  necro: {
    prefix: tr('冥府', 'Abyssal '), bonus: { summon: { mult: 1.2 }, maxHp: { mult: 1.05 } }, bonusText: tr('亡靈強度 ×1.2、HP ×1.05、殺死嘅敵人有機會變亡靈', 'Undead Power ×1.2, HP ×1.05, kills may rise as Undead'),
    echo: { kind: 'souls', name: tr('亡魂', 'Restless Souls'), icon: '💀', desc: tr('招牌技之後召喚 2 隻骷髏（可以超過上限，維持 12 秒）', 'After your Signature, raise 2 Skeletons (can exceed cap, 12s)') },
  },
};

/** Pure triples get their own name and a stronger echo. */
const PURE: Record<ClassId, { name: string; icon: string; echoDesc: string; extra: StatBonus; extraText: string }> = {
  warrior: { name: tr('三刀流劍聖', 'Three-Sword Saint'), icon: '⚔️', echoDesc: tr('三刀流：招牌技之後連放三圈劍氣（每圈 200%）', 'Three swords: after your Signature, three sword waves (200% each)'), extra: { atk: { mult: 1.1 } }, extraText: tr('、攻擊 ×1.1', ', ATK ×1.1') },
  archer: { name: tr('神弓', 'Divine Bow'), icon: '🌠', echoDesc: tr('招牌技之後向四周射 20 支穿透箭（每支 120%）', 'After your Signature, fire 20 piercing arrows all around (120% each)'), extra: { critDmg: { flat: 0.3 } }, extraText: tr('、暴擊傷害 +30%', ', Crit Dmg +30%') },
  mage: { name: tr('大賢者', 'Grand Sage'), icon: '📜', echoDesc: tr('招牌技之後喺最近 8 隻敵人身上爆炸（每個 200%）', 'After your Signature, blast the 8 nearest enemies (200% each)'), extra: { atkSpeed: { mult: 1.1 } }, extraText: tr('、攻速 ×1.1', ', Atk Spd ×1.1') },
  necro: { name: tr('死神', 'Death Lord'), icon: '☠️', echoDesc: tr('招牌技之後召喚 4 隻大骷髏（1.5 倍強，可以超過上限）', 'After your Signature, raise 4 big Skeletons (1.5× strong, can exceed cap)'), extra: { summon: { mult: 1.15 } }, extraText: tr('、亡靈強度 ×1.15', ', Undead Power ×1.15') },
};

function mergeB(a: StatBonus, b: StatBonus): StatBonus {
  const out: StatBonus = JSON.parse(JSON.stringify(a));
  for (const [k, v] of Object.entries(b) as [keyof StatBonus, NonNullable<StatBonus[keyof StatBonus]>][]) {
    const o = (out[k] ??= {});
    if (v.flat) o.flat = (o.flat ?? 0) + v.flat;
    if (v.pct) o.pct = (o.pct ?? 0) + v.pct;
    if (v.mult) o.mult = (o.mult ?? 1) * v.mult;
  }
  return out;
}

const triCache = new Map<string, AwakenedDef>();
/** The three-class mix: the two-class mix it grew from, plus the third class's essence and echo. */
export function ascendedFor(main: ClassId, sub: ClassId, sub2: ClassId): AwakenedDef {
  const id = `${main}_${sub}_${sub2}`;
  const hit = triCache.get(id);
  if (hit) return hit;
  const base = AWAKENED[`${main}_${sub}`];
  const e = ESSENCE[sub2];
  const pure = main === sub && sub === sub2 ? PURE[main] : null;
  const def: AwakenedDef = {
    ...base,
    id, sub2, base: base.id,
    name: pure ? pure.name : `${e.prefix}${base.name}`,
    en: pure ? pure.name : `${e.prefix}${base.en}`,
    icon: pure ? pure.icon : base.icon,
    bonus: mergeB(mergeB(base.bonus, e.bonus), pure?.extra ?? {}),
    bonusText: `${base.bonusText}${tr('；', '; ')}${e.bonusText}${pure?.extraText ?? ''}`,
    echo: { ...e.echo, desc: pure ? pure.echoDesc : e.echo.desc, power: pure ? 2 : 1 },
  };
  triCache.set(id, def);
  return def;
}

/** Whatever mix this character is: 3 classes, 2 classes, or none. */
export function mixFor(main: ClassId, sub: ClassId | null | undefined, sub2: ClassId | null | undefined): AwakenedDef | null {
  if (!sub) return null;
  return sub2 ? ascendedFor(main, sub, sub2) : awakenedFor(main, sub);
}
export const ESSENCE_INFO = ESSENCE;
