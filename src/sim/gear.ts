// Gear: 7 slots, 4 rarities, weapon types, legendary specials, chests, upgrades, rerolls, trades and salvage.
// Pure data + maths, no DOM.
import { ATTACK_NAMES, CLASSES, CLASS_IDS, type AttackKind, type ClassId } from './classes';
import { addBonus, STAT_NAMES, type StatBonus, type StatKey } from './stats';
import { getLang, tr } from '../i18n';

export const SLOTS = ['mainWeapon', 'subWeapon', 'helmet', 'chest', 'waist', 'pants', 'shoes', 'ring', 'amulet'] as const;
export type Slot = (typeof SLOTS)[number];
export type WeaponSlot = 'mainWeapon' | 'subWeapon';
export const ARMOUR_SLOTS = ['helmet', 'chest', 'waist', 'pants', 'shoes'] as const;
export const ACCESSORY_SLOTS = ['ring', 'amulet'] as const;
/** Every non-weapon slot (armour + accessories). */
export type ArmourSlot = (typeof ARMOUR_SLOTS)[number] | (typeof ACCESSORY_SLOTS)[number];
export const isAccessorySlot = (s: Slot) => s === 'ring' || s === 'amulet';
export const isWeaponSlot = (s: Slot | EquipSlot): s is WeaponSlot => s === 'mainWeapon' || s === 'subWeapon';
/** Where things can be worn: every item slot plus a second ring. Items themselves only ever have slot 'ring'. */
export type EquipSlot = Slot | 'ring2';
export const EQUIP_SLOTS: EquipSlot[] = ['mainWeapon', 'subWeapon', 'helmet', 'chest', 'waist', 'pants', 'shoes', 'ring', 'ring2', 'amulet'];
/** The item slot that fits an equip slot. */
export const itemSlotOf = (e: EquipSlot): Slot => (e === 'ring2' ? 'ring' : e);
export const EQUIP_NAMES: Record<EquipSlot, string> = {
  mainWeapon: tr('主武器', 'Main weapon'), subWeapon: tr('副武器', 'Off-hand'), helmet: tr('頭盔', 'Helmet'), chest: tr('胸甲', 'Chest'), waist: tr('腰帶', 'Belt'), pants: tr('褲', 'Pants'), shoes: tr('鞋', 'Boots'),
  ring: tr('戒指 1', 'Ring 1'), ring2: tr('戒指 2', 'Ring 2'), amulet: tr('項鍊', 'Amulet'),
};

export const SLOT_NAMES: Record<Slot, string> = {
  mainWeapon: tr('主武器', 'Main weapon'), subWeapon: tr('副武器', 'Off-hand'), helmet: tr('頭盔', 'Helmet'), chest: tr('胸甲', 'Chest'), waist: tr('腰帶', 'Belt'), pants: tr('褲', 'Pants'), shoes: tr('鞋', 'Boots'),
  ring: tr('戒指', 'Ring'), amulet: tr('項鍊', 'Amulet'),
};
export const SLOT_ICONS: Record<Slot, string> = {
  mainWeapon: '🗡️', subWeapon: '🛡️', helmet: '⛑️', chest: '🥋', waist: '🎗️', pants: '👖', shoes: '👢',
  ring: '💍', amulet: '📿',
};

// ---------- weapon / accessory skills (chance-based procs) ----------
export const PROC_SKILLS = {
  doubleStrike: { name: tr('連擊', 'Double Strike'), icon: '⚡', range: [8, 12], desc: (v: number) => (getLang() === 'en' ? `${v}% chance to attack again at once (100% dmg: extra volley, slash or fireballs)` : `${v}% 機會即刻再攻擊一次（100% 傷害：弓多射一輪、劍多斬一下、法杖多放一輪火球）`) },
  execute: { name: tr('斬殺', 'Execute'), icon: '🪓', range: [20, 35], desc: (v: number) => (getLang() === 'en' ? `+${v}% dmg vs enemies below 30% HP` : `對 HP 低過 30% 嘅敵人傷害 +${v}%`) },
  frenzy: { name: tr('狂風', 'Frenzy'), icon: '🌪️', range: [15, 25], desc: (v: number) => (getLang() === 'en' ? `Each kill: +${v}% Atk Spd for 3s` : `每殺一隻敵人，3 秒內攻速 +${v}%`) },
  lifesteal: { name: tr('吸血', 'Lifesteal'), icon: '🩸', range: [8, 15], desc: (v: number) => (getLang() === 'en' ? `${v}% chance on hit to heal 1% HP` : `命中有 ${v}% 機會回復 1% HP`) },
} as const;
export type ProcId = keyof typeof PROC_SKILLS;
export const PROC_IDS = Object.keys(PROC_SKILLS) as ProcId[];
const PROC_MULT: Record<'common' | 'rare' | 'epic' | 'legendary', number> = { common: 0.7, rare: 1, epic: 1.4, legendary: 1.8 };
/** Chance that a weapon of this rarity rolls a skill (accessories always have one). */
const WEAPON_PROC_CHANCE: Record<'common' | 'rare' | 'epic' | 'legendary', number> = { common: 0, rare: 0.15, epic: 0.3, legendary: 0.5 };
export const procText = (p: { id: ProcId; value: number }) => `${PROC_SKILLS[p.id].icon} ${PROC_SKILLS[p.id].name}${tr('：', ': ')}${PROC_SKILLS[p.id].desc(p.value)}`;

// ---------- weapon types ----------
export const WEAPON_TYPES = ['sword', 'bow', 'staff', 'shield', 'quiver', 'orb', 'spear', 'longbow', 'greatstaff', 'dagger', 'shortbow', 'scythe', 'skull', 'greatscythe'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];
export type Family = 'blade' | 'bow' | 'magic' | 'death';

export const WEAPONS: Record<WeaponType, { name: string; icon: string; family: Family; twoHanded?: boolean; stat: (t: number) => StatLine }> = {
  sword: { name: tr('劍', 'Sword'), icon: '🗡️', family: 'blade', stat: (t) => ({ stat: 'atk', flat: 2 + 1.2 * t }) },
  bow: { name: tr('弓', 'Bow'), icon: '🏹', family: 'bow', stat: (t) => ({ stat: 'atk', flat: 2 + 1.2 * t }) },
  staff: { name: tr('法杖', 'Staff'), icon: '🪄', family: 'magic', stat: (t) => ({ stat: 'atk', flat: 2 + 1.2 * t }) },
  shield: { name: tr('盾', 'Shield'), icon: '🛡️', family: 'blade', stat: (t) => ({ stat: 'def', flat: 6 + 2 * t }) },
  quiver: { name: tr('箭筒', 'Quiver'), icon: '🎒', family: 'bow', stat: (t) => ({ stat: 'atkSpeed', pct: Math.min(0.25, 0.05 + 0.01 * t) }) },
  orb: { name: tr('法球', 'Orb'), icon: '🔮', family: 'magic', stat: (t) => ({ stat: 'area', pct: Math.min(0.3, 0.07 + 0.012 * t) }) },
  spear: { name: tr('槍', 'Spear'), icon: '🔱', family: 'blade', twoHanded: true, stat: (t) => ({ stat: 'atk', flat: (2 + 1.2 * t) * 1.65 }) },
  longbow: { name: tr('長弓', 'Longbow'), icon: '🏹', family: 'bow', twoHanded: true, stat: (t) => ({ stat: 'atk', flat: (2 + 1.2 * t) * 1.65 }) },
  greatstaff: { name: tr('大法杖', 'Greatstaff'), icon: '🪄', family: 'magic', twoHanded: true, stat: (t) => ({ stat: 'atk', flat: (2 + 1.2 * t) * 1.65 }) },
  dagger: { name: tr('短刀', 'Dagger'), icon: '🔪', family: 'blade', stat: (t) => ({ stat: 'crit', flat: Math.min(0.08, 0.02 + 0.004 * t) }) },
  shortbow: { name: tr('短弓', 'Shortbow'), icon: '🏹', family: 'bow', stat: (t) => ({ stat: 'atkSpeed', pct: Math.min(0.22, 0.045 + 0.009 * t) }) },
  scythe: { name: tr('鐮刀', 'Scythe'), icon: '🪦', family: 'death', twoHanded: true, stat: (t) => ({ stat: 'atk', flat: (2 + 1.2 * t) * 1.6 }) },
  skull: { name: tr('骷髏頭', 'Skull'), icon: '💀', family: 'death', stat: (t) => ({ stat: 'summon', pct: Math.min(0.5, 0.12 + 0.025 * t) }) },
  greatscythe: { name: tr('巨鐮', 'Great Scythe'), icon: '🪦', family: 'death', twoHanded: true, stat: (t) => ({ stat: 'atk', flat: (2 + 1.2 * t) * 1.85 }) },
};

/** What each class can hold. A character can use the weapons of every class it has (main + second + third).
 *  The main-hand weapon decides how you attack (attackFor). Two-handed weapons leave the off hand empty. */
const CLASS_WEAPONS: Record<ClassId, { main: WeaponType[]; off: WeaponType[] }> = {
  warrior: { main: ['sword', 'spear'], off: ['shield', 'sword', 'dagger'] },
  archer: { main: ['bow', 'longbow', 'shortbow', 'spear'], off: ['quiver', 'dagger'] },
  mage: { main: ['staff', 'greatstaff'], off: ['orb'] },
  necro: { main: ['scythe', 'greatscythe', 'staff'], off: ['skull', 'orb'] },
};
/** Default look when nothing is equipped: [main hand, off hand or null]. */
const BASE_REQ: Record<ClassId, [WeaponType, WeaponType | null]> = {
  warrior: ['sword', 'shield'], archer: ['bow', 'quiver'], mage: ['staff', 'orb'], necro: ['staff', 'skull'],
};
// awakened classes: their signature weapons (always allowed, and the default look)
const AWK_REQ: Record<string, [WeaponType, WeaponType | null]> = {
  warrior_warrior: ['sword', 'sword'], warrior_archer: ['spear', null], warrior_mage: ['sword', 'orb'],
  archer_warrior: ['bow', 'dagger'], archer_archer: ['longbow', null], archer_mage: ['bow', 'orb'],
  mage_warrior: ['staff', 'sword'], mage_archer: ['staff', 'shortbow'], mage_mage: ['greatstaff', null],
  warrior_necro: ['sword', 'skull'], archer_necro: ['bow', 'skull'], mage_necro: ['staff', 'skull'],
  necro_warrior: ['staff', 'shield'], necro_archer: ['staff', 'shortbow'], necro_mage: ['staff', 'orb'], necro_necro: ['greatscythe', null],
};

/** The default weapon look for a class combination (used when a hand is empty). */
export function weaponReq(main: ClassId, sub: ClassId | null): Record<WeaponSlot, WeaponType | null> {
  const [m, s] = sub ? AWK_REQ[`${main}_${sub}`] : BASE_REQ[main];
  return { mainWeapon: m, subWeapon: s };
}

/** The attack a main-hand weapon gives. Staffs cast fireballs, or shadow bolts for a necromancer. */
export function attackFor(w: WeaponType, mainClass: ClassId): AttackKind | null {
  switch (w) {
    case 'sword': case 'dagger': return 'arc';
    case 'spear': return mainClass === 'archer' ? 'javelin' : 'arc'; // an archer throws the spear
    case 'bow': case 'longbow': case 'shortbow': return 'arrow';
    case 'staff': case 'greatstaff': return mainClass === 'necro' ? 'shadow' : 'fireball';
    case 'scythe': case 'greatscythe': return 'reap';
    default: return null;
  }
}

/** Which classes can hold a weapon type, in which hand. (A mixed class can use it if any of its classes can.) */
export function weaponUsers(w: WeaponType): { main: ClassId[]; off: ClassId[] } {
  return { main: CLASS_IDS.filter((c) => CLASS_WEAPONS[c].main.includes(w)), off: CLASS_IDS.filter((c) => CLASS_WEAPONS[c].off.includes(w)) };
}
/** Class icons that can use this weapon (short form for lists). */
export const weaponUserIcons = (w: WeaponType) => { const u = weaponUsers(w); return CLASS_IDS.filter((c) => u.main.includes(c) || u.off.includes(c)).map((c) => CLASSES[c].icon).join(''); };
/** Full text: who can use it, in which hand, and how they attack with it. */
export function weaponUseText(w: WeaponType): string {
  const u = weaponUsers(w);
  const sep = tr('、', ', ');
  const main = u.main.map((c) => { const a = attackFor(w, c); return `${CLASSES[c].icon} ${CLASSES[c].name}${a ? `${tr('（', ' (')}${ATTACK_NAMES[a]}${tr('）', ')')}` : ''}`; }).join(sep);
  const off = u.off.map((c) => `${CLASSES[c].icon} ${CLASSES[c].name}`).join(sep);
  return [main ? `${tr('主手：', 'Main hand: ')}${main}` : '', off ? `${tr('副手：', 'Off hand: ')}${off}` : ''].filter(Boolean).join(tr('；', '; '));
}

/** Every weapon type each hand can take for this character. */
export function weaponOptions(main: ClassId, sub: ClassId | null | undefined, sub2?: ClassId | null): Record<WeaponSlot, WeaponType[]> {
  const mainSet = new Set<WeaponType>();
  const offSet = new Set<WeaponType>();
  for (const c of [main, sub, sub2]) if (c) { for (const w of CLASS_WEAPONS[c].main) mainSet.add(w); for (const w of CLASS_WEAPONS[c].off) offSet.add(w); }
  const awk = sub ? AWK_REQ[`${main}_${sub}`] : null;
  if (awk) { mainSet.add(awk[0]); if (awk[1]) offSet.add(awk[1]); }
  return { mainWeapon: [...mainSet], subWeapon: [...offSet].filter((w) => !WEAPONS[w].twoHanded) };
}

// ---------- rarity ----------
export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_NAMES: Record<Rarity, string> = { common: tr('普通', 'Common'), rare: tr('稀有', 'Rare'), epic: tr('史詩', 'Epic'), legendary: tr('傳說', 'Legendary') };
export const RARITY_COLORS: Record<Rarity, string> = { common: '#c9ced8', rare: '#5aa9ff', epic: '#b77cff', legendary: '#ffb02e' };
const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.25, epic: 1.55, legendary: 1.9 };
const AFFIX_COUNT: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const SALVAGE_BASE: Record<Rarity, number> = { common: 8, rare: 25, epic: 70, legendary: 180 };
const REROLL_BASE: Record<Rarity, number> = { common: 0, rare: 120, epic: 350, legendary: 900 };

// ---------- legendary specials ----------
export const SPECIALS = {
  // blade weapons
  echoStrike: { family: 'blade', name: tr('回響', 'Echo'), desc: tr('攻擊有 25% 機會即刻再打多一次（60% 傷害）', '25% chance to strike again at once (60% dmg)') },
  bloodEdge: { family: 'blade', name: tr('飲血', 'Bloodthirst'), desc: tr('每殺一隻敵人回復 1% HP', 'Heal 1% HP per kill') },
  giantSlayer: { family: 'blade', name: tr('屠巨', 'Giantslayer'), desc: tr('對小 Boss 同 Boss 傷害 +30%', '+30% dmg vs mini bosses and bosses') },
  // bows
  extraArrow: { family: 'bow', name: tr('分裂', 'Split'), desc: tr('每次攻擊多一下（多一支箭 / 多一個火球 / 多斬一下）', '+1 hit per attack (extra arrow / fireball / slash)') },
  multiArrow: { family: 'bow', name: tr('多重箭袋', 'Arrow Mix'), desc: tr('每裝一件有呢個特效嘅裝備，就可以多揀一種箭同時用（效果疊埋；每多一種，全部箭傷害 ×0.75）。箭種用晒之後，多出嚟嘅每件令懲罰減 3%（最好 ×0.94）', 'Each item you wear with this lets you use one more arrow type at once (effects combine; each extra type: all arrow damage ×0.75). Once every type is in use, each spare item cuts the penalty by 3% (best ×0.94)') },
  piercing: { family: 'bow', name: tr('貫穿', 'Piercing'), desc: tr('箭可以多穿 2 個敵人', 'Arrows pierce 2 more enemies') },
  critBurst: { family: 'bow', name: tr('爆裂', 'Burst'), desc: tr('暴擊時喺敵人身上引發小爆炸（80%）', 'Crits cause a small explosion (80%)') },
  // magic
  multiSpell: { family: 'magic', name: tr('多重法典', 'Spell Mix'), desc: tr('每裝一件有呢個特效嘅裝備，就可以多揀一種法術，每次施法全部一齊放（每多一種，全部傷害 ×0.75），一個人都觸發到元素反應。法術用晒之後，多出嚟嘅每件令懲罰減 3%（最好 ×0.94）', 'Each item you wear with this lets you pick one more spell; every cast fires all of them (each extra one: all damage ×0.75), so you can set off reactions alone. Once every spell is in use, each spare item cuts the penalty by 3% (best ×0.94)') },
  bigBlast: { family: 'magic', name: tr('浩瀚', 'Vast'), desc: tr('範圍 ×1.3（爆炸、斬擊、技能）', 'Area ×1.3 (blasts, slashes, skills)') },
  manaFlow: { family: 'magic', name: tr('湧流', 'Flow'), desc: tr('技能同招牌技冷卻 -20%', 'Skill and Signature skill cooldown -20%') },
  arcaneEcho: { family: 'magic', name: tr('共振', 'Resonance'), desc: tr('攻擊命中有 25% 機會引發小爆炸', 'Hits have 25% chance to cause a small explosion') },
  // armour (any class)
  frostGuard: { family: 'armour', name: tr('霜護', 'Frostguard'), desc: tr('受傷時 15% 機會放冰霜新星（150%，減速）', 'When hit, 15% chance to cast Frost Nova (150%, slow)') },
  thorns: { family: 'armour', name: tr('荊棘', 'Thorns'), desc: tr('敵人撞到你時受到 150% 攻擊力反傷', 'Enemies touching you take 150% ATK as damage') },
  secondWind: { family: 'armour', name: tr('再起', 'Second Wind'), desc: tr('每張地圖一次：HP 跌到 30% 以下即刻回復 40%', 'Once per map: heal 40% when HP drops below 30%') },
  // main-hand weapons of any class: a different way to play
  oneShot: { family: 'heavy', name: tr('蓄力', 'Heavy Blow'), desc: tr('一擊流：攻速 ×0.5、每下傷害 ×2.5、暴擊傷害加成 ×2；只得一枝箭（揀幾種箭種，效果都疊落呢一枝，多重箭懲罰照計）/ 一種法術 / 一下（多出嚟嘅變傷害）；唔觸發任何命中效果（終極技、連擊、回響、爆裂…），改為將你裝住嘅命中型終極技平均傷害直接加落每一下；打死敵人之後剩低嘅傷害彈去附近（最多 3 次）', 'One-shot: attack speed ×0.5, every hit ×2.5, crit bonus ×2; one arrow (every arrow type you pick goes onto it; the mix penalty still applies) / one spell / one hit (extras turn into damage); nothing triggers on hit (ultimates, Double Strike, Echo, Burst…) — instead the average damage of your on-hit ultimates goes straight into every hit; overkill damage jumps to an enemy nearby (up to 3 times)') },
  // class gear: armour and accessories, only work for that class (main or awakened class); each copy stacks (up to 4)
  ironHide: { family: 'classGear', name: tr('鋼骨', 'Ironhide'), desc: tr('戰士專屬：受到傷害 -8%（每件疊，最多 4 件）', 'Warrior only: take 8% less damage (stacks per item, up to 4)') },
  berserkRage: { family: 'classGear', name: tr('狂怒', 'Rage'), desc: tr('戰士專屬：HP 低過 50% 時傷害 +15%（每件疊，最多 4 件）', 'Warrior only: +15% damage while below 50% HP (stacks per item, up to 4)') },
  wideSwing: { family: 'classGear', name: tr('橫掃', 'Sweep'), desc: tr('戰士專屬：範圍 +12%、攻擊 +4%（每件疊，最多 4 件）', 'Warrior only: +12% area and +4% ATK (stacks per item, up to 4)') },
  eagleEye: { family: 'classGear', name: tr('鷹眼', 'Eagle Eye'), desc: tr('弓手專屬：暴擊率 +4%、暴擊傷害 +15%（每件疊，最多 4 件）', 'Archer only: +4% crit chance and +15% crit damage (stacks per item, up to 4)') },
  galeStep: { family: 'classGear', name: tr('疾風', 'Gale'), desc: tr('弓手專屬：攻速 +6%、移速 +4%（每件疊，最多 4 件）', 'Archer only: +6% attack speed and +4% move speed (stacks per item, up to 4)') },
  firstShot: { family: 'classGear', name: tr('先發制人', 'First Strike'), desc: tr('弓手專屬：對 HP 高過 70% 嘅敵人傷害 +15%（每件疊，最多 4 件）', 'Archer only: +15% damage to enemies above 70% HP (stacks per item, up to 4)') },
  elemAmp: { family: 'classGear', name: tr('元素增幅', 'Amplify'), desc: tr('法師專屬：元素反應傷害 +20%（每件疊，最多 4 件）', 'Mage only: +20% elemental reaction damage (stacks per item, up to 4)') },
  elemLinger: { family: 'classGear', name: tr('元素延續', 'Linger'), desc: tr('法師專屬：元素喺敵人身上留耐 30%，反應更易觸發（每件疊，最多 4 件）', 'Mage only: elements stay on enemies 30% longer, so reactions happen more (stacks per item, up to 4)') },
  manaWard: { family: 'classGear', name: tr('法力屏障', 'Mana Ward'), desc: tr('法師專屬：受到傷害 -5%，元素護盾上限 +5% HP（每件疊，最多 4 件）', 'Mage only: take 5% less damage and +5% HP Elemental Shield cap (stacks per item, up to 4)') },
  // rings (legendary rings: 50% chance)
  // necromancer weapons, armour (30% of legendary armour), rings and amulets: undead traits — they stack into combos
  utTank: { family: 'death', name: tr('骨甲', 'Ironbone'), desc: tr('亡靈特性：亡靈 HP ×2，敵人會優先打佢（可以同其他特性疊）', 'Undead trait: Undead HP ×2 and enemies go for them first (stacks with other traits)') },
  utRanged: { family: 'death', name: tr('骨弓', 'Bonebow'), desc: tr('亡靈特性：亡靈改為遠距離射骨箭（可以同其他特性疊）', 'Undead trait: Undead shoot bone arrows from range (stacks with other traits)') },
  utCaster: { family: 'death', name: tr('骨法', 'Bonecaster'), desc: tr('亡靈特性：亡靈變成骷髏法師，喺遠處射會爆炸嘅暗影彈（同骨弓疊：爆炸範圍大 40%）', 'Undead trait: Undead become skeleton mages that cast exploding shadow bolts from range (with Bone Archer: 40% bigger blasts)') },
  utWraith: { family: 'death', name: tr('怨靈', 'Wraith'), desc: tr('亡靈特性：亡靈行快 60%，打中會令敵人減速（可以同其他特性疊）', 'Undead trait: Undead move 60% faster and slow what they hit (stacks with other traits)') },
  // armour-friendly undead traits (don't change how the class plays)
  utFrenzy: { family: 'death', name: tr('狂骨', 'Frenzied Bones'), desc: tr('亡靈特性：亡靈攻速 +30%（可以同其他特性疊）', 'Undead trait: Undead attack 30% faster (stacks with other traits)') },
  utLasting: { family: 'death', name: tr('不朽骨', 'Undying Bones'), desc: tr('亡靈特性：亡靈存在時間 +50%、亡靈上限 +1（可以同其他特性疊）', 'Undead trait: Undead last 50% longer and +1 Undead at once (stacks with other traits)') },
  utEdge: { family: 'death', name: tr('骨刃', 'Bone Edge'), desc: tr('亡靈特性：亡靈暴擊傷害 ×1.5（可以同其他特性疊）', 'Undead trait: Undead critical hits deal ×1.5 damage (stacks with other traits)') },
  utLeech: { family: 'death', name: tr('噬魂', 'Soul Leech'), desc: tr('亡靈特性：亡靈打中敵人會幫你回 0.4% HP（每秒最多 5 次）', 'Undead trait: Undead hits heal you 0.4% HP (up to 5 times a second)') },
  utShield: { family: 'death', name: tr('骨盾', 'Bone Shield'), desc: tr('亡靈特性：亡靈幫你擋子彈（擋子彈範圍大好多，子彈傷害減半）', 'Undead trait: Undead block bullets for you (much wider block area, bullet damage halved)') },
  utPoison: { family: 'death', name: tr('屍毒', 'Corpse Poison'), desc: tr('亡靈特性：亡靈攻擊會留低毒池（3 秒，每隻亡靈 3 秒一次）。毒係元素：遇到火、冰、雷會起反應（組隊時隊友嘅元素都得）', 'Undead trait: Undead attacks leave a poison pool (3 s; each Undead every 3 s). Poison is an element: it reacts with fire, frost and lightning (a teammate\'s too)') },
  utCrown: { family: 'death', name: tr('骨王冠', 'Bone Crown'), desc: tr('亡靈特性：最大嗰隻亡靈戴上王冠：傷害 ×2，受到傷害減半', 'Undead trait: Your biggest Undead wears a crown: ×2 damage, takes half damage') },
  // rings and necromancer weapons: it changes how the class plays
  boneBurst: { family: 'ring', name: tr('骨爆', 'Bone Burst'), desc: tr('你嘅亡靈會直接衝去敵人度自爆，大範圍傷害 = 亡靈最大 HP × 150% × 亡靈強度（骨甲令佢更痛；自爆唔會觸發終極技）', 'Your Undead rush enemies and explode: area damage = the Undead\'s max HP × 150% × Undead Power (Ironbone makes it hurt more; blasts don\'t trigger Ultimates)') },
} as const;
export type SpecialId = keyof typeof SPECIALS;
export const UNDEAD_TRAITS = ['utTank', 'utRanged', 'utCaster', 'utWraith', 'utFrenzy', 'utLasting', 'utEdge', 'utLeech', 'utShield', 'utPoison', 'utCrown'] as const satisfies readonly SpecialId[];
/** Undead traits that can roll on armour: not 骨弓 / 骨法 (they change how the class plays: weapons and accessories only). */
export const ARMOUR_TRAITS = ['utTank', 'utWraith', 'utFrenzy', 'utLasting', 'utEdge', 'utLeech', 'utShield', 'utPoison', 'utCrown'] as const satisfies readonly SpecialId[];

/** 骨 combos: wearing these traits together turns your undead into something new (with an extra effect). */
export interface BoneCombo { id: 'archmage' | 'lichKing' | 'bulwark' | 'plague' | 'frenzyEdge' | 'endless' | 'soulKing' | 'boneVolley' | 'grandLich' | 'boneGiant' | 'chainBurst' | 'boneStorm' | 'boneReaper' | 'boneCourt' | 'plagueLord' | 'eternal'; needs: SpecialId[]; name: string; desc: string; power?: number }
export const BONE_COMBOS: BoneCombo[] = [
  // the same trait three times: a pure form (like 三刀流 for three warriors)
  { id: 'boneVolley', power: 2.0, needs: ['utRanged', 'utRanged', 'utRanged'], name: tr('萬箭骨兵', 'Bone Volley'), desc: tr('每隻亡靈每次射 3 支骨箭（扇形）', 'Every Undead fires 3 bone arrows at once (a fan)') },
  { id: 'grandLich', power: 2.5, needs: ['utCaster', 'utCaster', 'utCaster'], name: tr('骸骨大法師', 'Grand Lich'), desc: tr('骨法爆炸再大 25%，傷害 +40%', 'Bone-mage blasts another 25% bigger and +40% damage') },
  { id: 'boneGiant', power: 3.0, needs: ['utTank', 'utTank', 'utTank'], name: tr('不死骨巨人', 'Bone Giants'), desc: tr('亡靈受傷 -40%，傷害 +30%', 'Undead take 40% less damage and deal +30%') },
  { id: 'boneStorm', power: 2.5, needs: ['utFrenzy', 'utFrenzy', 'utFrenzy'], name: tr('骨嵐', 'Bone Storm'), desc: tr('亡靈攻速再 ×1.5', 'Undead attack speed ×1.5 more') },
  { id: 'boneReaper', power: 2.5, needs: ['utEdge', 'utEdge', 'utEdge'], name: tr('骸骨死神', 'Bone Reaper'), desc: tr('亡靈暴擊率 +30%', 'Undead +30% crit chance') },
  { id: 'boneCourt', power: 2.5, needs: ['utCrown', 'utCrown', 'utCrown'], name: tr('骸骨王庭', 'Bone Court'), desc: tr('三隻王冠亡靈傷害 ×3（本來 ×2）', 'The three crowned Undead deal ×3 (instead of ×2)') },
  { id: 'plagueLord', power: 2.5, needs: ['utPoison', 'utPoison', 'utPoison'], name: tr('瘟疫之主', 'Plague Lord'), desc: tr('毒池大 50%', 'Poison pools 50% bigger') },
  { id: 'eternal', power: 2, needs: ['utLasting', 'utLasting', 'utLasting'], name: tr('永生骨軍', 'Eternal Legion'), desc: tr('亡靈上限再 +3', '+3 more Undead at once') },
  { id: 'chainBurst', needs: ['boneBurst', 'boneBurst', 'boneBurst'], name: tr('骸骨連爆', 'Chain Burst'), desc: tr('自爆範圍大 50%', 'Undead blasts 50% wider') },
  { id: 'lichKing', power: 1.6, needs: ['utRanged', 'utCaster', 'utCrown'], name: tr('骸骨魔導王', 'Lich King'), desc: tr('戴王冠嗰隻每次射 5 粒爆炸彈（扇形）；所有骨法亡靈爆炸再大 20%', 'The crowned one fires 5 exploding bolts at once (a fan); all bone-mage blasts 20% bigger') },
  { id: 'archmage', power: 1.3, needs: ['utRanged', 'utCaster'], name: tr('骨魔導師', 'Bone Archmage'), desc: tr('爆炸範圍大 40%', 'Blasts 40% bigger') },
  { id: 'bulwark', power: 3.5, needs: ['utTank', 'utShield'], name: tr('骨堡壘', 'Bone Bulwark'), desc: tr('亡靈受到嘅傷害 -30%', 'Undead take 30% less damage') },
  { id: 'plague', power: 3, needs: ['utWraith', 'utPoison'], name: tr('瘟疫幽魂', 'Plague Wraiths'), desc: tr('毒池大 50%、傷害 ×2，入面敵人減速 40%', 'Poison pools 50% bigger, ×2 damage, and slow enemies 40%') },
  { id: 'frenzyEdge', power: 3, needs: ['utFrenzy', 'utEdge'], name: tr('骨刃狂潮', 'Bone Frenzy'), desc: tr('亡靈暴擊率 +15%', 'Undead crit chance +15%') },
  { id: 'endless', needs: ['boneBurst', 'utLasting'], name: tr('不滅骨爆', 'Endless Burst'), desc: tr('亡靈自爆之後 30% 機會原地再起一隻骷髏', 'After an Undead explodes, 30% chance a Skeleton rises in its place') },
  { id: 'soulKing', power: 3.5, needs: ['utLeech', 'utCrown'], name: tr('魂王', 'Soul King'), desc: tr('戴王冠嗰隻攻速 +50%，每下打中幫你回 1% HP；其他亡靈打中都幫你回 0.3%（每秒最多 10 次）', 'The crowned one attacks 50% faster and every hit heals you 1% HP; other Undead hits heal 0.3% (up to 10 a second)') },
];
/** Combos active for a set of worn specials (a bigger combo still lets its smaller ones work too). */
export const activeCombos = (sp: Iterable<SpecialId>): BoneCombo[] => {
  const have: Partial<Record<SpecialId, number>> = {};
  for (const s of sp) have[s] = (have[s] ?? 0) + 1;
  return BONE_COMBOS.filter((c) => { const need: Partial<Record<SpecialId, number>> = {}; for (const n of c.needs) need[n] = (need[n] ?? 0) + 1; return Object.entries(need).every(([k, v]) => (have[k as SpecialId] ?? 0) >= v!); });
};
/** Copies of one bone trait that count (more than 4 do nothing). */
export const MAX_STACK = 4;
/** A pure form (三件一樣) worn ×4 becomes its 極 form: undead damage ×1.5 more. */
export const isPure = (c: BoneCombo) => new Set(c.needs).size === 1;
export const isMax = (c: BoneCombo, sp: Iterable<SpecialId>) => isPure(c) && [...sp].filter((s) => s === c.needs[0]).length >= MAX_STACK;
export const MAX_POWER = 1.5;
/** Several bone combos at once: only the strongest one's undead damage counts; each other one adds this much. */
export const COMBO_EXTRA = 0.2;
/** The same bone trait worn more than once is stronger: what each extra copy does. */
export const STACK_TEXT: Partial<Record<SpecialId, string>> = {
  utTank: tr('每件 +100% HP', '+100% HP per copy'), utRanged: tr('2 件：骨箭穿透 1 隻', '2 copies: bone arrows pierce 1'), utCaster: tr('每多 1 件爆炸 +20%', '+20% blast size per extra copy'),
  utWraith: tr('每件行快 60%、減速更強', '+60% speed and stronger slow per copy'), utFrenzy: tr('每件攻速 +30%', '+30% attack speed per copy'), utLasting: tr('每件存在時間 +50%、亡靈上限 +1', '+50% lifetime and +1 Undead at once per copy'),
  utEdge: tr('每件暴擊傷害 +50%', '+50% crit damage per copy'), utLeech: tr('每件回 0.4%', '0.4% heal per copy'), utShield: tr('每件擋得更闊、子彈傷害再減', 'Wider block and less bullet damage per copy'),
  utPoison: tr('每件毒池傷害 +100%', '+100% pool damage per copy'), utCrown: tr('每件多一隻亡靈戴王冠', 'One more crowned Undead per copy'), boneBurst: tr('每多 1 件自爆傷害 +50% 最大 HP', '+50% max HP blast damage per extra copy'),
};
export type UndeadTrait = (typeof UNDEAD_TRAITS)[number];

/** Name of your undead for a set of traits, e.g. 骨甲 + 骨法 = 鐵甲骨術士. */
export function undeadName(t: { tank?: boolean; ranged?: boolean; caster?: boolean; wraith?: boolean; burst?: boolean }, specials?: Iterable<SpecialId>): string {
  // a combo names your undead (the biggest one wins)
  const combo = specials ? activeCombos(specials).sort((a, b) => b.needs.length - a.needs.length)[0] : undefined;
  if (combo) return (specials && isMax(combo, specials) ? tr('極·', 'Max ') : '') + combo.name;
  const noun = t.caster && t.ranged ? tr('骨魔導師', 'Bone Archmage') : t.caster ? tr('骨法師', 'Bone Mage') : t.ranged ? tr('骨弓手', 'Bone Archer') : tr('骷髏', 'Skeleton');
  const pre = [t.burst ? tr('爆裂', 'Volatile ') : '', t.wraith ? tr('幽影', 'Phantom ') : '', t.tank ? tr('鐵甲', 'Ironclad ') : ''].join('');
  return pre + noun;
}
export const SPECIAL_IDS = Object.keys(SPECIALS) as SpecialId[];

// ---------- class gear and class-weighted loot ----------
/** Armour / accessory lines that belong to one class (they only work for that class). */
export const CLASS_GEAR: Record<'warrior' | 'archer' | 'mage', SpecialId[]> = {
  warrior: ['ironHide', 'berserkRage', 'wideSwing'],
  archer: ['eagleEye', 'galeStep', 'firstShot'],
  mage: ['elemAmp', 'elemLinger', 'manaWard'],
};
const ALL_CLASS_GEAR: SpecialId[] = [...CLASS_GEAR.warrior, ...CLASS_GEAR.archer, ...CLASS_GEAR.mage];
const GENERIC_ARMOUR: SpecialId[] = ['frostGuard', 'thorns', 'secondWind'];
/** Which class a legendary line is for (undefined = any class). */
export function specialClass(sp: SpecialId): ClassId | undefined {
  for (const c of ['warrior', 'archer', 'mage'] as const) if (CLASS_GEAR[c].includes(sp)) return c;
  const f = SPECIALS[sp].family;
  if (f === 'death' || f === 'ring') return 'necro';
  if (f === 'blade') return 'warrior';
  if (f === 'bow' || sp === 'multiArrow') return 'archer';
  if (f === 'magic' || sp === 'multiSpell') return 'mage';
  return undefined;
}
/** Loot leans towards the classes you are playing: half the legendary lines (and weapon types) come from them. */
export const LOOT_FAVOUR = 0.5;
let lootPref: ClassId[] | null = null;
/** Set the classes loot should favour (null = fully random). */
export function setLootClasses(c: ClassId[] | null): void { lootPref = c && c.length ? [...new Set(c)] : null; }
/** The lines one class can find on an armour piece / accessory. */
function classLines(c: ClassId, slot: Slot): SpecialId[] {
  const acc = isAccessorySlot(slot);
  if (c === 'necro') return acc ? [...UNDEAD_TRAITS, ...(slot === 'ring' ? (['boneBurst'] as SpecialId[]) : [])] : [...ARMOUR_TRAITS];
  return [...CLASS_GEAR[c], ...(acc ? [c === 'archer' ? 'multiArrow' : c === 'mage' ? 'multiSpell' : null].filter((x): x is SpecialId => !!x) : [])];
}
/** A weapon type one of your classes can hold. */
function favouredWeapon(rand: () => number): WeaponType | null {
  if (!lootPref) return null;
  const ok = WEAPON_TYPES.filter((w) => { const u = weaponUsers(w); return lootPref!.some((c) => u.main.includes(c) || u.off.includes(c)); });
  return ok.length ? ok[Math.floor(rand() * ok.length)] : null;
}

// ---------- items ----------
export interface StatLine { stat: StatKey; flat?: number; pct?: number }

export interface Item {
  id: string;
  slot: Slot; // armour slot, or 'mainWeapon' / 'subWeapon' for weapons (which slot it goes in depends on your class)
  weapon?: WeaponType;
  rarity: Rarity;
  tier: number; // dungeon tier it dropped from
  main: StatLine;
  affixes: StatLine[];
  special?: SpecialId; // legendary only
  special2?: SpecialId; // 雙傳說 (World Boss level 100+): a second legendary line
  proc?: { id: ProcId; value: number }; // weapon skill (some weapons) or accessory skill (always)
  named?: string; // named legendary id (world boss drop)
  plus: number; // upgrade level 0..MAX_PLUS
  spent: number; // coins spent upgrading (half comes back on salvage)
  fails: number; // failed upgrades since the last success (each adds +10% to the next try)
  rerolls: number;
  locked: boolean;
}

export const MAX_PLUS = 10;
/** Legendary armour: chance its special is an undead trait instead of an armour special. */
export const ARMOUR_TRAIT_CHANCE = 0.15;
export const INVENTORY_MAX = 60;
export const TRADE_COUNT = 5;

const AFFIX_POOL: { stat: StatKey; kind: 'flat' | 'pct'; min: number; max: number; necroOnly?: boolean }[] = [
  // 召喚冷卻: on necromancer weapons, armour and accessories (never on other classes' weapons)
  { stat: 'summonCd', kind: 'flat', min: 0.05, max: 0.1, necroOnly: true },
  { stat: 'atk', kind: 'pct', min: 0.03, max: 0.07 },
  { stat: 'maxHp', kind: 'pct', min: 0.04, max: 0.08 },
  { stat: 'def', kind: 'flat', min: 3, max: 7 },
  { stat: 'atkSpeed', kind: 'pct', min: 0.03, max: 0.06 },
  { stat: 'crit', kind: 'flat', min: 0.015, max: 0.035 },
  { stat: 'critDmg', kind: 'flat', min: 0.08, max: 0.18 },
  { stat: 'moveSpeed', kind: 'pct', min: 0.02, max: 0.04 },
  { stat: 'regen', kind: 'flat', min: 0.0015, max: 0.003 },
  { stat: 'pickup', kind: 'pct', min: 0.1, max: 0.2 },
];

const scale = (l: StatLine, m: number): StatLine => ({ stat: l.stat, flat: l.flat !== undefined ? l.flat * m : undefined, pct: l.pct !== undefined ? l.pct * m : undefined });

function armourStat(slot: ArmourSlot, tier: number): StatLine {
  switch (slot) {
    case 'helmet': return { stat: 'maxHp', flat: 12 + 5 * tier };
    case 'chest': return { stat: 'def', flat: 5 + 2 * tier };
    case 'waist': return { stat: 'maxHp', flat: 8 + 4 * tier };
    case 'pants': return { stat: 'def', flat: 3 + 1.5 * tier };
    case 'shoes': return { stat: 'moveSpeed', pct: Math.min(0.15, 0.035 + 0.004 * tier) };
    case 'ring': return { stat: 'atk', pct: Math.min(0.12, 0.03 + 0.004 * tier) };
    case 'amulet': return { stat: 'maxHp', pct: Math.min(0.15, 0.04 + 0.005 * tier) };
  }
}

/** Items that can roll necromancer-only affixes: necromancer weapons, and every armour piece and accessory. */
const allowsNecroAffix = (it: { weapon?: WeaponType; slot: Slot }) =>
  it.weapon ? ['scythe', 'skull', 'greatscythe'].includes(it.weapon) : true;

function rollAffix(exclude: StatKey[], tier: number, rand: () => number, necro = false): StatLine | null {
  const pool = AFFIX_POOL.filter((a) => !exclude.includes(a.stat) && (necro || !a.necroOnly));
  if (!pool.length) return null;
  const a = pool[Math.floor(rand() * pool.length)];
  const v = (a.min + rand() * (a.max - a.min)) * (1 + 0.05 * (tier - 1));
  return a.kind === 'flat' ? { stat: a.stat, flat: v } : { stat: a.stat, pct: v };
}

export type ItemKind = { weapon: WeaponType } | { armour: ArmourSlot };

export function makeItem(id: string, kind: ItemKind, rarity: Rarity, tier: number, rand: () => number = Math.random): Item {
  const mult = RARITY_MULT[rarity];
  const weapon = 'weapon' in kind ? kind.weapon : undefined;
  const slot: Slot = weapon ? (['shield', 'quiver', 'orb', 'dagger', 'shortbow', 'skull'].includes(weapon) ? 'subWeapon' : 'mainWeapon') : (kind as { armour: ArmourSlot }).armour;
  const main = scale(weapon ? WEAPONS[weapon].stat(tier) : armourStat(slot as ArmourSlot, tier), mult);
  const affixes: StatLine[] = [];
  for (let i = 0; i < AFFIX_COUNT[rarity]; i++) {
    const a = rollAffix([main.stat, ...affixes.map((x) => x.stat)], tier, rand, allowsNecroAffix({ weapon, slot }));
    if (a) affixes.push(a);
  }
  let special: SpecialId | undefined;
  const accessory = !weapon && isAccessorySlot(slot);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  if (rarity === 'legendary') {
    if (weapon) {
      // a weapon can carry anything of its family, including the ones that change how the class plays;
      // necromancer weapons can also roll 骨爆 (otherwise a ring special)
      const family = WEAPONS[weapon].family;
      special = pick(SPECIAL_IDS.filter((s) => SPECIALS[s].family === family || (family === 'death' && s === 'boneBurst') || (s === 'oneShot' && slot === 'mainWeapon')));
    } else if (lootPref && rand() < LOOT_FAVOUR) {
      // half the time: a line for one of the classes you play (each class equally likely)
      special = pick(classLines(pick(lootPref), slot));
    } else if (accessory) {
      // rings: 20% 骨爆, 15% an undead trait, 10% 多重箭袋, 10% 多重法典, 35% a class line; amulets: 25% trait, 10% / 10%, 45% class line
      const r = rand();
      special = slot === 'ring'
        ? (r < 0.2 ? 'boneBurst' : r < 0.35 ? pick(UNDEAD_TRAITS) : r < 0.45 ? 'multiArrow' : r < 0.55 ? 'multiSpell' : r < 0.9 ? pick(ALL_CLASS_GEAR) : undefined)
        : (r < 0.25 ? pick(UNDEAD_TRAITS) : r < 0.35 ? 'multiArrow' : r < 0.45 ? 'multiSpell' : r < 0.9 ? pick(ALL_CLASS_GEAR) : undefined);
    } else {
      // armour: 15% an undead trait (not the ones that change how the class plays), otherwise any-class lines or a class line
      special = rand() < ARMOUR_TRAIT_CHANCE ? pick(ARMOUR_TRAITS) : pick([...GENERIC_ARMOUR, ...ALL_CLASS_GEAR]);
    }
  }
  let proc: Item['proc'];
  if (accessory || (weapon && rand() < WEAPON_PROC_CHANCE[rarity])) {
    const id = PROC_IDS[Math.floor(rand() * PROC_IDS.length)];
    const [lo, hi] = PROC_SKILLS[id].range;
    proc = { id, value: Math.round((lo + rand() * (hi - lo)) * PROC_MULT[rarity]) };
  }
  return { id, slot, weapon, rarity, tier, main, affixes, special, proc, plus: 0, spent: 0, fails: 0, rerolls: 0, locked: false };
}

/** Main stat after upgrades: +10% per upgrade level. */
export const upgradedMain = (it: Item): StatLine => scale(it.main, 1 + 0.1 * it.plus);

export const upgradeCost = (it: Item) => Math.round(15 * it.tier * RARITY_MULT[it.rarity] * Math.pow(1.35, it.plus));
const BASE_SUCCESS: Record<number, number> = { 7: 0.8, 8: 0.65, 9: 0.5, 10: 0.35 };
/** Chance that the next upgrade works. Every failure since the last success adds +10%. */
export const upgradeChance = (it: Item) => Math.min(1, (BASE_SUCCESS[it.plus + 1] ?? 1) + 0.1 * it.fails);

export const salvageValue = (it: Item) => Math.round(SALVAGE_BASE[it.rarity] * (1 + 0.3 * (it.tier - 1)) + it.spent * 0.5);
export const canReroll = (it: Item) => it.rarity !== 'common' && it.affixes.length > 0;
export const rerollCost = (it: Item) => Math.round(REROLL_BASE[it.rarity] * (1 + 0.3 * (it.tier - 1)) * Math.pow(1.5, it.rerolls));

/** Replace one affix with a new random one (a different stat from the item's other lines). */
export function rerollAffix(it: Item, index: number, rand: () => number = Math.random): void {
  const others = it.affixes.filter((_, i) => i !== index).map((a) => a.stat);
  const a = rollAffix([it.main.stat, ...others], it.tier, rand, allowsNecroAffix(it));
  if (a) it.affixes[index] = a;
  it.rerolls++;
}

export function baseName(it: Item): string { return it.weapon ? WEAPONS[it.weapon].name : SLOT_NAMES[it.slot]; }
export function itemIcon(it: Item): string { return it.weapon ? WEAPONS[it.weapon].icon : SLOT_ICONS[it.slot]; }

const namedNames: Record<string, string> = {};
/** worldboss.ts registers named item names here (avoids an import cycle). */
export const registerNamed = (id: string, name: string) => { namedNames[id] = name; };

export function itemName(it: Item): string {
  if (it.named && namedNames[it.named]) return `${namedNames[it.named]}${it.plus ? ` +${it.plus}` : ''}`;
  const plus = it.plus ? ` +${it.plus}` : '';
  if (getLang() === 'en') return `${it.special2 ? 'Twin ' : ''}${RARITY_NAMES[it.rarity]}${it.special ? ` ${SPECIALS[it.special].name}` : ''}${it.special2 ? ` & ${SPECIALS[it.special2].name}` : ''} ${baseName(it)}${plus}`;
  const sp = it.special ? `${SPECIALS[it.special].name}${it.special2 ? `・${SPECIALS[it.special2].name}` : ''}之` : '';
  return `${it.special2 ? '雙' : ''}${RARITY_NAMES[it.rarity]}${sp}${baseName(it)}${plus}`;
}

export function lineText(l: StatLine): string {
  const name = STAT_NAMES[l.stat];
  if (l.pct !== undefined) return `${name} +${(l.pct * 100).toFixed(1).replace(/\.0$/, '')}%`;
  const v = l.flat ?? 0;
  if (l.stat === 'crit') return `${name} +${(v * 100).toFixed(1).replace(/\.0$/, '')}%`;
  if (l.stat === 'critDmg') return `${name} +${Math.round(v * 100)}%`;
  if (l.stat === 'regen') return getLang() === 'en' ? `Regen ${(v * 100).toFixed(2)}% HP/s` : `每秒回復 ${(v * 100).toFixed(2)}% HP`;
  if (l.stat === 'summonCd') return getLang() === 'en' ? `Summon Cooldown -${Math.round(v * 100)}% (more Undead)` : `召喚冷卻 -${Math.round(v * 100)}%（亡靈出得更密）`;
  return `${name} +${Math.round(v)}`;
}

export function addItemBonus(into: StatBonus, it: Item): void {
  for (const l of [upgradedMain(it), ...it.affixes]) addBonus(into, l.stat, { flat: l.flat, pct: l.pct });
}

/** Rough "how good is it" number, used for sorting and the ▲▼ compare arrows. */
export function itemScore(it: Item): number {
  const w: Record<StatKey, number> = { maxHp: 0.25, atk: 3, def: 1, atkSpeed: 120, moveSpeed: 80, crit: 150, critDmg: 25, range: 30, area: 60, pickup: 10, regen: 4000, summon: 60, summonCd: 150 };
  let s = 0;
  for (const l of [upgradedMain(it), ...it.affixes]) {
    if (l.pct !== undefined) s += l.pct * (l.stat === 'atk' || l.stat === 'maxHp' ? 100 : w[l.stat]);
    else s += (l.flat ?? 0) * w[l.stat];
  }
  if (it.special) s += 15;
  if (it.special2) s += 15;
  if (it.proc) s += it.proc.value * 0.6;
  return Math.round(s * 10) / 10;
}

// ---------- chests ----------
export type ChestKind = 'silver' | 'gold';
export const CHEST_NAMES: Record<ChestKind, string> = { silver: tr('銀箱', 'Silver Chest'), gold: tr('金箱', 'Gold Chest') };

function pickWeighted(weights: Record<Rarity, number>, rand: () => number): Rarity {
  const total = RARITIES.reduce((a, r) => a + Math.max(0, weights[r]), 0);
  let x = rand() * total;
  for (const r of RARITIES) { x -= Math.max(0, weights[r]); if (x <= 0) return r; }
  return 'rare';
}

export function rollRarity(kind: ChestKind, tier: number, rand: () => number = Math.random): Rarity {
  const t = tier - 1;
  return pickWeighted(kind === 'silver'
    ? { common: Math.max(20, 55 - 2 * t), rare: 38, epic: 7 + 1.2 * t, legendary: 0.5 * t }
    : { common: 0, rare: Math.max(30, 60 - 2.5 * t), epic: 32 + 1.5 * t, legendary: 8 + t }, rand);
}

/** Chest drops: any slot, any weapon type (unusable weapons can be traded 5-for-1). */
export function openChest(kind: ChestKind, tier: number, nextId: () => string, rand: () => number = Math.random): Item[] {
  const n = kind === 'silver' ? 2 : 3;
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[Math.floor(rand() * SLOTS.length)];
    let k: ItemKind;
    if (isWeaponSlot(slot)) k = { weapon: (rand() < LOOT_FAVOUR ? favouredWeapon(rand) : null) ?? WEAPON_TYPES[Math.floor(rand() * WEAPON_TYPES.length)] };
    else k = { armour: slot };
    out.push(makeItem(nextId(), k, rollRarity(kind, tier, rand), tier, rand));
  }
  return out;
}

// ---------- 雙傳說: World Boss level 100+ ----------
/** Chance of a double-legendary item after a World Boss fight: 1% per level above 100 (max 50%). */
export const doubleChance = (level: number) => Math.min(0.5, Math.max(0, level - 100) * 0.01);
/** A legendary with two different legendary lines (both follow that slot's rules). */
export function makeDoubleLegendary(id: string, tier: number, rand: () => number = Math.random): Item {
  for (let guard = 0; guard < 200; guard++) {
    const slot = SLOTS[Math.floor(rand() * SLOTS.length)];
    const k: ItemKind = isWeaponSlot(slot) ? { weapon: (rand() < LOOT_FAVOUR ? favouredWeapon(rand) : null) ?? WEAPON_TYPES[Math.floor(rand() * WEAPON_TYPES.length)] } : { armour: slot };
    const it = makeItem(id, k, 'legendary', tier, rand);
    if (!it.special) continue;
    for (let j = 0; j < 60; j++) {
      const other = makeItem(id, k, 'legendary', tier, rand).special;
      if (other && other !== it.special) { it.special2 = other; return it; }
    }
  }
  return makeItem(id, { armour: 'chest' }, 'legendary', tier, rand);
}

// ---------- trading: 5 unwanted items -> 1 item of the type you pick ----------
export function tradeRarityWeights(inputs: Item[]): Record<Rarity, number> {
  const avg = inputs.reduce((a, it) => a + RARITIES.indexOf(it.rarity), 0) / Math.max(1, inputs.length);
  return { common: Math.max(0, 40 - 25 * avg), rare: 40, epic: 15 + 15 * avg, legendary: 3 + 6 * avg };
}

export function tradeResult(inputs: Item[], target: ItemKind, id: string, rand: () => number = Math.random): Item {
  const tier = Math.max(1, Math.round(inputs.reduce((a, it) => a + it.tier, 0) / inputs.length));
  return makeItem(id, target, pickWeighted(tradeRarityWeights(inputs), rand), tier, rand);
}
