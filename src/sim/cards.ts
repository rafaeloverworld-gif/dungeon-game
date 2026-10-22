// Level-up cards: temporary upgrades that only last for one dungeon run.
import { tr } from '../i18n';
import type { ClassId } from './classes';
import type { PlayerStats } from './stats';

export interface Card {
  id: string;
  name: string;
  desc: string;
  icon: string;
  max?: number; // max times it can be taken in one run
  classes?: ClassId[]; // only offered to these classes (default: everyone)
  autoPriority: number; // higher = auto-pick prefers it
  apply: (s: PlayerStats, heal: (fraction: number) => void) => void;
}

export const CARDS: Card[] = [
  // everyone
  { id: 'atk', name: tr('攻擊強化', 'ATK Up'), desc: tr('攻擊 +15%', 'ATK +15%'), icon: '⚔️', autoPriority: 8, apply: (s) => { s.atk.pct += 0.15; } },
  { id: 'atkSpeed', name: tr('急速', 'Haste'), desc: tr('攻速 +12%', 'Attack Speed +12%'), icon: '💨', autoPriority: 8, apply: (s) => { s.atkSpeed.pct += 0.12; } },
  { id: 'crit', name: tr('弱點看破', 'Weak Spot'), desc: tr('暴擊率 +8%', 'Crit Rate +8%'), icon: '💥', max: 6, autoPriority: 6, apply: (s) => { s.crit.flat += 0.08; } },
  { id: 'critDmg', name: tr('致命一擊', 'Lethal Blow'), desc: tr('暴擊傷害 +30%', 'Crit Damage +30%'), icon: '🩸', autoPriority: 4, apply: (s) => { s.critDmg.flat += 0.3; } },
  { id: 'maxHp', name: tr('強韌', 'Toughness'), desc: tr('最大 HP +20%，回復 30% HP', 'Max HP +20%, heal 30% HP'), icon: '❤️', autoPriority: 5, apply: (s, heal) => { s.maxHp.pct += 0.2; heal(0.3); } },
  { id: 'def', name: tr('鐵壁', 'Iron Wall'), desc: tr('防禦 +12', 'DEF +12'), icon: '🛡️', max: 5, autoPriority: 4, apply: (s) => { s.def.flat += 12; } },
  { id: 'move', name: tr('疾風步', 'Gale Step'), desc: tr('移速 +8%', 'Move Speed +8%'), icon: '👟', max: 5, autoPriority: 3, apply: (s) => { s.moveSpeed.pct += 0.08; } },
  { id: 'pickup', name: tr('磁石', 'Magnet'), desc: tr('撿取範圍 +35%', 'Pickup +35%'), icon: '🧲', max: 4, autoPriority: 2, apply: (s) => { s.pickup.pct += 0.35; } },
  { id: 'regen', name: tr('再生', 'Regen'), desc: tr('每秒回復 0.8% HP', 'Heal 0.8% HP per sec'), icon: '🌿', max: 4, autoPriority: 4, apply: (s) => { s.regen.flat += 0.008; } },

  // archer
  { id: 'multishot', name: tr('多重射擊', 'Multishot'), desc: tr('每次多射 1 支箭', '+1 arrow per shot'), icon: '🏹', max: 4, classes: ['archer'], autoPriority: 10, apply: (s) => { s.multishot += 1; } },
  { id: 'pierce', name: tr('穿透箭', 'Piercing Arrow'), desc: tr('箭可以多穿 1 個敵人', 'Arrows pierce +1 enemy'), icon: '🎯', max: 3, classes: ['archer'], autoPriority: 7, apply: (s) => { s.pierce += 1; } },
  { id: 'range', name: tr('鷹眼', 'Eagle Eye'), desc: tr('射程 +12%', 'Range +12%'), icon: '👁️', max: 4, classes: ['archer', 'mage', 'necro'], autoPriority: 3, apply: (s) => { s.range.pct += 0.12; } },

  // mage
  { id: 'twinCast', name: tr('雙重詠唱', 'Twin Cast'), desc: tr('每次多放 1 個火球', '+1 fireball per cast'), icon: '☄️', max: 3, classes: ['mage'], autoPriority: 10, apply: (s) => { s.multishot += 1; } },
  { id: 'blast', name: tr('烈焰擴散', 'Flame Spread'), desc: tr('爆炸範圍 +20%', 'Blast Area +20%'), icon: '🔥', max: 5, classes: ['mage'], autoPriority: 7, apply: (s) => { s.area.pct += 0.2; } },

  // necromancer
  { id: 'army', name: tr('骸骨大軍', 'Bone Army'), desc: tr('亡靈上限 +1', 'Max Undead +1'), icon: '☠️', max: 3, classes: ['necro'], autoPriority: 10, apply: (s) => { s.minions += 1; } },
  { id: 'undead', name: tr('亡靈強化', 'Undead Up'), desc: tr('亡靈傷害同 HP +25%', 'Undead damage & HP +25%'), icon: '💀', max: 5, classes: ['necro'], autoPriority: 8, apply: (s) => { s.summon.pct += 0.25; } },
  { id: 'twinBolt', name: tr('雙重暗影', 'Twin Shadow'), desc: tr('每次多射 1 粒暗影彈', '+1 shadow bolt per shot'), icon: '🌑', max: 3, classes: ['necro'], autoPriority: 9, apply: (s) => { s.multishot += 1; } },

  // warrior
  { id: 'combo', name: tr('連斬', 'Combo Slash'), desc: tr('每次多斬一下（60% 傷害）', '+1 extra slash (60% dmg)'), icon: '🗡️', max: 3, classes: ['warrior'], autoPriority: 10, apply: (s) => { s.multishot += 1; } },
  { id: 'sweep', name: tr('橫掃', 'Sweep'), desc: tr('斬擊範圍 +18%', 'Slash Area +18%'), icon: '🌀', max: 5, classes: ['warrior'], autoPriority: 7, apply: (s) => { s.area.pct += 0.18; } },
];
