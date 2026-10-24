// The 4 base classes. Main + sub class = 16 awakened classes (awakening.ts).
import { tr } from '../i18n';

export type ClassId = 'warrior' | 'archer' | 'mage' | 'necro';
export type AttackKind = 'arc' | 'arrow' | 'fireball' | 'shadow' | 'reap' | 'javelin' | 'summon';

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  desc: string;
  attack: AttackKind;
  mainWeapon: string; // weapon name used for gear
  subWeapon: string; // support item before awakening
  base: {
    hp: number; atk: number; def: number;
    attackInterval: number; // seconds between attacks
    range: number; // warrior: reach of the swing; others: targeting range
    moveSpeed: number; crit: number; critDmg: number;
  };
  arcDegrees?: number; // warrior swing width
  blastRadius?: number; // mage explosion radius
  projectileSpeed?: number;
  preferredDistance: number; // autopilot tries to keep this distance from enemies
  healOnKill?: number; // fraction of max HP healed per kill (warrior passive)
  raiseChance?: number; // necromancer: chance a kill raises a skeleton
  dodge?: number; // 弓手 迴避: chance to ignore a hit completely
  bigDmg?: number; // 弓手 弱點射擊: extra damage to mini bosses and bosses
  bossGuard?: number; // ranged classes: take this much less damage while a boss is in the fight
  hitCap?: number; // a single hit can't take more than this share of max HP (ranged classes: no one-shots)
  dmgMult?: number; // class damage multiplier for your own damage (attacks, skills, ultimates, reactions; not undead)
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: tr('戰士', 'Warrior'), icon: '⚔️', desc: tr('近戰扇形斬擊，一次斬晒前面嘅敵人。血厚、防高，每殺一隻敵人回少少血。', 'Melee arc slash hits every enemy in front. High HP and DEF; heals a little per kill.'),
    attack: 'arc', mainWeapon: tr('劍', 'Sword'), subWeapon: tr('盾', 'Shield'),
    base: { hp: 175, atk: 15, def: 20, attackInterval: 0.65, range: 2.8, moveSpeed: 5.8, crit: 0.08, critDmg: 1.6 },
    arcDegrees: 150, preferredDistance: 1.6, healOnKill: 0.008,
  },
  archer: {
    id: 'archer', name: tr('弓手', 'Archer'), icon: '🏹', desc: tr('遠程射擊最近嘅敵人，暴擊率高、速度快。保持距離：有 Boss 喺場時受傷 -30%。弱點射擊：對小 Boss 同 Boss 傷害 +40%。迴避：25% 機會完全無視一下傷害。身法：一下最多只會扣 30% 最大 HP（唔會俾人一擊秒殺）。所有傷害 ×1.3。', 'Shoots the nearest enemy from range. High crit, fast attacks. Keeps their distance: 30% less damage while a boss is in the fight. Weak Spot: +40% damage to Mini-bosses and Bosses. Evasion: 25% chance to ignore a hit completely. Footwork: no single hit takes more than 30% of max HP (no one-shots). All damage ×1.3.'),
    attack: 'arrow', mainWeapon: tr('弓', 'Bow'), subWeapon: tr('箭筒', 'Quiver'),
    base: { hp: 175, atk: 19.5, def: 10, attackInterval: 0.5, range: 10, moveSpeed: 6, crit: 0.12, critDmg: 1.6 },
    projectileSpeed: 20, preferredDistance: 7, bossGuard: 0.3, bigDmg: 0.4, dodge: 0.25, hitCap: 0.3, dmgMult: 1.3,
  },
  mage: {
    id: 'mage', name: tr('魔法師', 'Mage'), icon: '🔮', desc: tr('火球撞到敵人會爆炸，範圍傷害最高，但血最少。有 Boss 喺場時受傷 -35%。法力屏護：一下最多只會扣 30% 最大 HP（唔會俾人一擊秒殺）。元素護盾：每次觸發反應得到最大 HP 3% 護盾（最多 15%）。元素同調：每 2 次施法加多一種元素，兩種元素喺敵人身上會起反應（火+冰=蒸發爆炸、火+雷=超載、冰+雷=超導），法師嘅反應傷害 +50%。', 'Fireballs explode on hit. Best area damage, but lowest HP. 35% less damage while a boss is in the fight. Mana Guard: no single hit takes more than 30% of max HP (no one-shots). Elemental Shield: each reaction you set off gives a 3% max HP shield (up to 15%). Elemental Sync: every 2nd cast adds a second element; two elements on an enemy react (fire+frost = Steam Blast, fire+lightning = Overload, frost+lightning = Superconduct). Mage reactions hit 50% harder.'),
    attack: 'fireball', mainWeapon: tr('法杖', 'Staff'), subWeapon: tr('法球', 'Orb'),
    base: { hp: 130, atk: 20, def: 8, attackInterval: 0.8, range: 8.5, moveSpeed: 5.8, crit: 0.06, critDmg: 1.7 },
    blastRadius: 2.3, projectileSpeed: 15, preferredDistance: 6, bossGuard: 0.35, hitCap: 0.3,
  },
  necro: {
    id: 'necro', name: tr('死靈法師', 'Necromancer'), icon: '💀', desc: tr('射暗影彈；殺死嘅敵人有機會變成亡靈幫你打（同時最多 3 隻，近戰怪變近戰、遠程怪會射）。自己偏脆，靠亡靈擋怪。', 'Fires shadow bolts; kills may rise as Undead that fight for you (max 3; melee foes stay melee, ranged ones shoot). Fragile, so let the Undead tank.'),
    attack: 'shadow', mainWeapon: tr('鐮刀', 'Scythe'), subWeapon: tr('骷髏頭', 'Skull'),
    base: { hp: 155, atk: 20, def: 14, attackInterval: 0.62, range: 8.5, moveSpeed: 5.8, crit: 0.06, critDmg: 1.6 },
    projectileSpeed: 15, preferredDistance: 6, raiseChance: 0.3,
  },
};

export const CLASS_IDS: ClassId[] = ['warrior', 'archer', 'mage', 'necro'];

/** How you attack. Set by the weapon in your main hand (the class's own style when the hand is empty). */
export interface AttackStyle {
  kind: AttackKind;
  interval: number; // seconds between attacks
  range: number; // melee: swing reach; ranged: targeting range
  arcDegrees?: number;
  blastRadius?: number;
  projectileSpeed?: number;
  preferredDistance: number;
}
const fromClass = (c: ClassDef): AttackStyle => ({ kind: c.attack, interval: c.base.attackInterval, range: c.base.range, arcDegrees: c.arcDegrees, blastRadius: c.blastRadius, projectileSpeed: c.projectileSpeed, preferredDistance: c.preferredDistance });
export const ATTACK_STYLES: Record<AttackKind, AttackStyle> = {
  arc: fromClass(CLASSES.warrior),
  arrow: fromClass(CLASSES.archer),
  fireball: fromClass(CLASSES.mage),
  shadow: fromClass(CLASSES.necro),
  // scythes: a slower, wider melee sweep of dark energy
  reap: { kind: 'reap', interval: 0.85, range: 3.3, arcDegrees: 220, preferredDistance: 1.8 },
  // archer + spear: throws that pierce every enemy in a line and knock small ones back; a bit slower than a bow;
  // extra arrows (multishot) mean extra spears
  javelin: { kind: 'javelin', interval: 0.68, range: 9.5, projectileSpeed: 22, preferredDistance: 6 },
  // necromancer, summoner style: every attack raises a skeleton (at the cap it renews one instead)
  summon: { kind: 'summon', interval: 1.35, range: 9, preferredDistance: 7 },
};

/** Necromancer main style (staff / no weapon): shoot shadow bolts yourself, or let every attack raise a skeleton. */
export type NecroMode = 'bolt' | 'summon';
export const NECRO_MODES: Record<NecroMode, { name: string; icon: string; desc: string }> = {
  bolt: { name: tr('暗影彈', 'Shadow Bolts'), icon: '🌑', desc: tr('自己射穿透暗影彈；亡靈靠殺敵同技能召喚', 'Fire piercing shadow bolts yourself; Undead come from kills and skills') },
  summon: { name: tr('召喚', 'Summoner'), icon: '💀', desc: tr('每次普通攻擊召喚一隻骷髏（亡靈上限 +2）；到上限就幫最舊嗰隻回血同續命', 'Every basic attack raises a Skeleton (Undead cap +2); at the cap it heals and renews the oldest one') },
};

/** Spell types (staff fireball attack, not Necromancer): picked on the Gear tab. */
export type SpellType = 'fire' | 'frost' | 'lightning' | 'meteor';
export const SPELL_TYPES: SpellType[] = ['fire', 'frost', 'lightning', 'meteor'];
export const SPELLS: Record<SpellType, { name: string; icon: string; desc: string }> = {
  fire: { name: tr('火球', 'Fireball'), icon: '🔥', desc: tr('撞到敵人爆炸，傷害 +10%', 'Explodes on hit, +10% damage') },
  frost: { name: tr('冰錐', 'Ice Shard'), icon: '❄️', desc: tr('飛得快、穿透 3 隻、減速 50%，傷害 150%（唔爆炸）', 'Fast, pierces 3, slows 50%; 150% damage (no blast)') },
  lightning: { name: tr('連鎖閃電', 'Chain Lightning'), icon: '⚡', desc: tr('即中（150%），再彈去附近 3 隻敵人（每下 100%）', 'Hits instantly (150%), then jumps to 3 nearby enemies (100% each)') },
  meteor: { name: tr('隕石', 'Meteor'), icon: '☄️', desc: tr('大爆炸（範圍 ×1.5、傷害 160%），但攻速 ×0.65', 'Huge blast (area ×1.5, 160% damage), but attack speed ×0.65') },
};

/** Arrow types (any bow): picked on the Gear tab. */
export type ArrowType = 'normal' | 'pierce' | 'blast' | 'frost' | 'spread' | 'homing';
export const ARROW_TYPES: ArrowType[] = ['normal', 'pierce', 'blast', 'frost', 'spread', 'homing'];
export const ARROWS: Record<ArrowType, { name: string; icon: string; desc: string }> = {
  normal: { name: tr('精準箭', 'Precise'), icon: '🎯', desc: tr('傷害 +40%、多穿 1 隻', '+40% damage, pierces 1 more') },
  pierce: { name: tr('穿甲箭', 'Piercing'), icon: '🗡️', desc: tr('多穿 3 隻敵人，無視盾兵同堅硬精英嘅減傷', 'Pierces 3 more enemies; ignores Shieldbearer and Armored elite damage reduction') },
  blast: { name: tr('爆裂箭', 'Explosive'), icon: '💥', desc: tr('打中會爆炸（範圍傷害 80%），唔會穿透', 'Explodes on hit (80% area damage); no piercing') },
  frost: { name: tr('冰霜箭', 'Frost'), icon: '❄️', desc: tr('減速 50% 兩秒、多穿 2 隻', 'Slows 50% for 2s, pierces 2 more') },
  spread: { name: tr('散射箭', 'Scatter'), icon: '🌠', desc: tr('每次多射 2 支箭，每支 80% 傷害。神射手：散射箭會追蹤（同追蹤箭一樣穿透後轉頭再追，最多 4 隻），每下 60%', '2 extra arrows per shot, 80% damage each. Sharpshooter: scatter arrows home in (pierce and turn to the next, up to 4), 60% each') },
  homing: { name: tr('追蹤箭', 'Homing'), icon: '🧭', desc: tr('自動追蹤敵人；穿透之後轉頭追下一隻再穿，最多連穿 4 隻（神射手 6 隻），附近冇其他敵人就轉頭再射 Boss（最多 4 次），每下 75% 傷害（唔會射失）', 'Seeks enemies; after piercing one it turns to chase the next, up to 4 in a row (Sharpshooter: 6); with nothing else near, it turns back to hit a Boss again (up to 4 times); 75% damage each (never misses)') },
};
export const ATTACK_NAMES: Record<AttackKind, string> = {
  javelin: tr('擲槍（直線貫穿、擊退）', 'Spear throw (pierces a line, knocks back)'),
  summon: tr('召喚骷髏', 'Raise Skeletons'),
  arc: tr('近戰斬擊', 'Melee slash'), arrow: tr('射箭', 'Arrows'), fireball: tr('火球（爆炸）', 'Fireballs (explode)'), shadow: tr('暗影彈', 'Shadow bolts'), reap: tr('鐮刀橫掃（大範圍近戰）', 'Scythe sweep (wide melee)'),
};
