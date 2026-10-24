// Permanent progress, stored in this browser only.
import { ACCOUNT, OFFLINE, SHOP, type ShopKey } from './sim/config';
import { ARROW_TYPES, CLASS_IDS, SPELL_TYPES, type ArrowType, type ClassId, type NecroMode, type SpellType } from './sim/classes';
import {
  addItemBonus, canReroll, doubleChance, makeDoubleLegendary, isAccessorySlot, INVENTORY_MAX, isWeaponSlot, MAX_PLUS, openChest, RARITIES, rerollAffix, rerollCost, salvageValue,
  EQUIP_SLOTS, itemSlotOf, type EquipSlot, PROC_IDS, SLOTS, SPECIAL_IDS, TRADE_COUNT, tradeResult, upgradeChance, upgradeCost, WEAPON_TYPES, weaponOptions, WEAPONS,
  type ChestKind, type Item, type ItemKind, type Rarity, type Slot, type SpecialId, type StatLine, type WeaponSlot, type WeaponType,
  setLootClasses,
} from './sim/gear';
import { addBonus, mergeBonus, STAT_KEYS, type StatBonus, type StatKey } from './sim/stats';
import { ASCEND_LEVEL, ASCEND_TIER, AWAKEN_TIER, mixFor } from './sim/awakening';
import { ALL_NODES, MIX_BOARD_NODES, baseId, copyPrefix, BOARD_NODES, boardNodes as boardNodesOf, boardCost, boardEffects, boardKeyOf, canUnlock, MAX_LEVEL, nodeById, resetCost, scaledCost } from './sim/skills';

/** A skill board: a class's board, or "2:<class>" for the second copy a same-class awakening gets. */
export type BoardKey = string;
import type { RunSetup } from './sim/sim';
import { ULT_IDS, ULT_MAX_LEVEL, ULT_SLOTS, ULT_SLOTS_MAX, ULT_SLOT_COSTS, ULT_UNLOCK_COST, ultUpgradeCost, type UltId } from './sim/ultimates';
import { dayKey, makeNamed, NAMED, namedById, namedChance, todaysBoss, WB_MIN_LEVEL, WB_TICKETS, wbRewards, type WbReward } from './sim/worldboss';

export interface SaveData {
  version: 2;
  coins: number;
  level: number;
  xp: number;
  highestCleared: number; // highest dungeon tier cleared (0 = none)
  selectedTier: number;
  shop: Record<ShopKey, number>;
  runs: number;
  autoPickCards: boolean; // pick level-up cards automatically
  classId: ClassId;
  items: Item[]; // everything you own, equipped or not
  stash: Item[]; // 倉庫: kept safe, out of the bag (can't be worn or salvaged from here)
  stashBuys: number; // extra 倉庫 space bought with coins
  stashTabs: StashTab[]; // player-made 倉庫 tabs
  stashTabOf: Record<string, string>; // item id → tab id (missing = 未分類)
  equipped: Record<string, string | null>; // slot key -> item id (weapons are kept per class, see slotKey)
  nextItemId: number;
  lastSeen: number; // ms timestamp, for offline income
  updatedAt: number; // ms timestamp of the last save (cloud sync keeps the newest)
  subClass: Partial<Record<ClassId, ClassId>>; // second class per main class (permanent)
  subClass2: Partial<Record<ClassId, ClassId>>; // third class per main class (昇華)
  arrowType: Partial<Record<ClassId, ArrowType>>; // bows: chosen arrows per class
  arrowMix: Partial<Record<ClassId, ArrowType[]>>;
  endlessBest: number; // 無盡模式: most waves survived in one run
  endlessTier: number; // 無盡模式: highest tier survived (counts for the World Boss max level)
  loadouts: Partial<Record<ClassId, { active: number; sets: (Loadout | null)[] }>>; // 配裝 A/B/C per class
  classXp: Partial<Record<ClassId, number>>; // 職業熟練度: XP earned by playing each class (main 100%, second / third 50%)
  bagBuys: number; // extra bag space bought with coins (+10 each) // 多重箭袋: extra arrow types used at the same time
  spellType: Partial<Record<ClassId, SpellType>>; // staffs: chosen spell per class
  spellMix: Partial<Record<ClassId, SpellType[]>>; // 多重法典: extra spells cast in turn
  necroMode: NecroMode; // necromancer: shadow bolts or summoner
  board: string[]; // unlocked skill-board panels (all three boards, shared by the character)
  souls: number; // 👻 unlock stat panels
  runes: number; // 🔷 unlock skill panels
  boardResets: Partial<Record<BoardKey, number>>;
  boardSpent: Partial<Record<BoardKey, { souls: number; runes: number }>>; // what was really paid per board (refunds)
  autoSalvage: 'off' | 'common' | 'rare' | 'epic'; // salvage chest drops at or below this rarity
  autoRepeat: boolean; // after a clear, start the same tier again by itself
  wbDay: string; // local date the tickets below belong to
  wbUsed: number; // world boss tickets used today
  crystals: number; // 💎 for 終極技
  ults: Partial<Record<UltId, number>>; // unlocked 終極技 -> level 1..10
  ultEquip: UltId[]; // up to ultSlots(s) equipped
  ultSlotBuys: number; // extra 終極技 slots bought with 靈晶
  wbLevel: number; // last chosen world boss level
  collection: Record<string, number>; // named legendary id -> times obtained
  tips: string[]; // one-time tips already shown
  quests: string[]; // starter quests already claimed
  wbFights: number; // world boss fights ever started
}

const KEY = 'website-game-save-v1';

const emptyEquipped = (): Record<string, string | null> => ({});

/** Weapons are remembered per class, so switching class doesn't lose your sword. Armour is shared. */
export const slotKey = (slot: EquipSlot, classId: ClassId) => (slot === 'mainWeapon' || slot === 'subWeapon' ? `${slot}:${classId}` : slot);

export const freshSave = (): SaveData => ({
  version: 2, coins: 0, level: 1, xp: 0, highestCleared: 0, selectedTier: 1,
  shop: { hp: 0, atk: 0, speed: 0 }, runs: 0, autoPickCards: true,
  classId: 'archer', items: [], stash: [], stashBuys: 0, stashTabs: [], stashTabOf: {}, equipped: emptyEquipped(), nextItemId: 1, lastSeen: Date.now(),
  subClass: {}, subClass2: {}, arrowType: {}, arrowMix: {}, loadouts: {}, classXp: {}, bagBuys: 0, endlessBest: 0, endlessTier: 0, spellType: {}, spellMix: {}, necroMode: 'bolt', board: [], souls: 0, runes: 0, boardResets: {}, boardSpent: {}, autoSalvage: 'off', autoRepeat: false, updatedAt: 0,
  wbDay: '', wbUsed: 0, crystals: 0, ults: {}, ultEquip: [], ultSlotBuys: 0, wbLevel: WB_MIN_LEVEL, collection: {}, tips: [], quests: [], wbFights: 0,
});

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function sanitizeLine(raw: unknown): StatLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<StatLine>;
  if (!STAT_KEYS.includes(r.stat as StatKey)) return null;
  const line: StatLine = { stat: r.stat as StatKey };
  if (typeof r.flat === 'number' && Number.isFinite(r.flat)) line.flat = r.flat;
  if (typeof r.pct === 'number' && Number.isFinite(r.pct)) line.pct = r.pct;
  return line.flat === undefined && line.pct === undefined ? null : line;
}

// Beta 1 weapons were tied to a class instead of having a type
const OLD_WEAPON: Record<ClassId, Record<WeaponSlot, WeaponType>> = {
  warrior: { mainWeapon: 'sword', subWeapon: 'shield' }, archer: { mainWeapon: 'bow', subWeapon: 'quiver' }, mage: { mainWeapon: 'staff', subWeapon: 'orb' }, necro: { mainWeapon: 'scythe', subWeapon: 'skull' },
};

function sanitizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Item> & { classId?: ClassId };
  const main = sanitizeLine(r.main);
  if (typeof r.id !== 'string' || !SLOTS.includes(r.slot as Slot) || !RARITIES.includes(r.rarity as Rarity) || !main) return null;
  const slot = r.slot as Slot;
  let weapon: WeaponType | undefined;
  if (isWeaponSlot(slot)) {
    if ((r.weapon as string) === 'javelin') weapon = 'spear'; // javelins (one test version) became spears
    else if (WEAPON_TYPES.includes(r.weapon as WeaponType)) weapon = r.weapon as WeaponType;
    else if (CLASS_IDS.includes(r.classId as ClassId)) weapon = OLD_WEAPON[r.classId as ClassId][slot];
    else return null;
  }
  return {
    id: r.id, slot, weapon, rarity: r.rarity as Rarity,
    tier: Math.max(1, Math.floor(num(r.tier, 1))),
    main, affixes: Array.isArray(r.affixes) ? r.affixes.map(sanitizeLine).filter((l): l is StatLine => !!l) : [],
    special: SPECIAL_IDS.includes(r.special as SpecialId) ? (r.special as SpecialId) : undefined,
    special2: SPECIAL_IDS.includes(r.special2 as SpecialId) ? (r.special2 as SpecialId) : undefined,
    proc: r.proc && PROC_IDS.includes(r.proc.id) && Number.isFinite(r.proc.value) ? { id: r.proc.id, value: Math.max(0, Math.min(90, r.proc.value)) } : undefined,
    plus: Math.min(MAX_PLUS, Math.max(0, Math.floor(num(r.plus, 0)))),
    spent: Math.max(0, num(r.spent, 0)),
    fails: Math.max(0, Math.floor(num(r.fails, 0))),
    rerolls: Math.max(0, Math.floor(num(r.rerolls, 0))),
    locked: r.locked === true,
    named: typeof r.named === 'string' && namedById(r.named) ? r.named : undefined,
  };
}

function sanitize(raw: unknown): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const items = Array.isArray(r.items) ? r.items.map(sanitizeItem).filter((i): i is Item => !!i) : [];
  const stash = Array.isArray(r.stash) ? r.stash.map(sanitizeItem).filter((i): i is Item => !!i).filter((i) => !items.some((o) => o.id === i.id)) : [];
  const equipped = emptyEquipped();
  if (r.equipped && typeof r.equipped === 'object') {
    for (const [key, id] of Object.entries(r.equipped)) {
      const it = typeof id === 'string' ? items.find((i) => i.id === id) ?? stash.find((i) => i.id === id) : undefined;
      const [slot] = key.split(':');
      if (it && (it.weapon ? isWeaponSlot(slot as Slot) : EQUIP_SLOTS.includes(slot as EquipSlot) && it.slot === itemSlotOf(slot as EquipSlot))) equipped[key] = it.id;
    }
  }
  return {
    version: 2,
    coins: Math.max(0, num(r.coins, 0)),
    level: Math.max(1, Math.floor(num(r.level, 1))),
    xp: Math.max(0, num(r.xp, 0)),
    highestCleared: Math.max(0, Math.floor(num(r.highestCleared, 0))),
    selectedTier: Math.max(1, Math.floor(num(r.selectedTier, 1))),
    shop: {
      hp: Math.max(0, Math.floor(num(r.shop?.hp, 0))),
      atk: Math.max(0, Math.floor(num(r.shop?.atk, 0))),
      speed: Math.max(0, Math.floor(num(r.shop?.speed, 0))),
    },
    runs: Math.max(0, Math.floor(num(r.runs, 0))),
    autoPickCards: typeof r.autoPickCards === 'boolean' ? r.autoPickCards : true,
    classId: CLASS_IDS.includes(r.classId as ClassId) ? (r.classId as ClassId) : 'archer',
    items, equipped,
    nextItemId: Math.max(Math.floor(num(r.nextItemId, 1)), items.length + (Array.isArray(r.stash) ? r.stash.length : 0) + 1),
    stash,
    stashBuys: Math.min(STASH_BUYS_MAX, Math.max(0, Math.floor(num(r.stashBuys, 0)))),
    stashTabs: Array.isArray(r.stashTabs) ? r.stashTabs.filter((t: any) => t && typeof t.id === 'string' && typeof t.name === 'string').slice(0, STASH_TABS_MAX).map((t: any) => ({ id: t.id.slice(0, 12), name: t.name.slice(0, STASH_TAB_NAME) })) : [],
    stashTabOf: r.stashTabOf && typeof r.stashTabOf === 'object' ? Object.fromEntries(Object.entries(r.stashTabOf).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')) as Record<string, string> : {},
    lastSeen: num(r.lastSeen, Date.now()),
    updatedAt: num(r.updatedAt, 0),
    ...sanitizeSkills(r),
    autoSalvage: r.autoSalvage === 'common' || r.autoSalvage === 'rare' || r.autoSalvage === 'epic' ? r.autoSalvage : 'off',
    autoRepeat: r.autoRepeat === true,
    necroMode: r.necroMode === 'summon' ? 'summon' : 'bolt',
    spellType: Object.fromEntries(Object.entries(r.spellType ?? {}).filter(([c, a]) => CLASS_IDS.includes(c as ClassId) && SPELL_TYPES.includes(a as SpellType))) as SaveData['spellType'],
    arrowType: Object.fromEntries(Object.entries(r.arrowType ?? {}).filter(([c, a]) => CLASS_IDS.includes(c as ClassId) && ARROW_TYPES.includes(a as ArrowType))) as SaveData['arrowType'],
    arrowMix: Object.fromEntries(Object.entries(r.arrowMix ?? {}).filter(([c, a]) => CLASS_IDS.includes(c as ClassId) && Array.isArray(a)).map(([c, a]) => [c, [...new Set((a as string[]).filter((x) => ARROW_TYPES.includes(x as ArrowType)))]])) as SaveData['arrowMix'],
    endlessBest: Math.max(0, Math.floor(num(r.endlessBest, 0))),
    endlessTier: Math.max(0, Math.floor(num(r.endlessTier, 0))),
    loadouts: sanitizeLoadouts(r.loadouts),
    classXp: Object.fromEntries(Object.entries(r.classXp ?? {}).filter(([c]) => CLASS_IDS.includes(c as ClassId)).map(([c, v]) => [c, Math.max(0, num(v, 0))])) as SaveData['classXp'],
    bagBuys: Math.min(BAG_BUYS_MAX, Math.max(0, Math.floor(num(r.bagBuys, 0)))),
    spellMix: Object.fromEntries(Object.entries(r.spellMix ?? {}).filter(([c, a]) => CLASS_IDS.includes(c as ClassId) && Array.isArray(a)).map(([c, a]) => [c, [...new Set((a as string[]).filter((x) => SPELL_TYPES.includes(x as SpellType)))]])) as SaveData['spellMix'],
    wbDay: typeof r.wbDay === 'string' ? r.wbDay : '',
    wbUsed: Math.max(0, Math.floor(num(r.wbUsed, 0))),
    wbLevel: Math.max(WB_MIN_LEVEL, Math.floor(num(r.wbLevel, WB_MIN_LEVEL))),
    tips: Array.isArray(r.tips) ? r.tips.filter((t): t is string => typeof t === 'string').slice(0, 100) : [],
    quests: Array.isArray(r.quests) ? r.quests.filter((t): t is string => typeof t === 'string').slice(0, 100) : [],
    wbFights: Math.max(0, Math.floor(num(r.wbFights, 0))),
    crystals: Math.max(0, Math.floor(num(r.crystals, 0))),
    ults: Object.fromEntries(ULT_IDS.map((u) => [u, Math.min(ULT_MAX_LEVEL, Math.max(0, Math.floor(num(r.ults?.[u], 0))))]).filter(([, v]) => v)),
    ultEquip: Array.isArray(r.ultEquip) ? [...new Set(r.ultEquip.filter((u): u is UltId => ULT_IDS.includes(u as UltId) && num(r.ults?.[u as UltId], 0) > 0))].slice(0, ULT_SLOTS + Math.min(ULT_SLOT_COSTS.length, Math.max(0, Math.floor(num(r.ultSlotBuys, 0))))) : [],
    ultSlotBuys: Math.min(ULT_SLOT_COSTS.length, Math.max(0, Math.floor(num(r.ultSlotBuys, 0)))),
    collection: Object.fromEntries(NAMED.map((n) => [n.id, Math.max(0, Math.floor(num(r.collection?.[n.id], 0)))]).filter(([, v]) => v)),
  };
}

// Beta 2/3 skill trees were point-based. Points spent there come back as souls and runes.
interface OldAlloc { main?: Record<string, number>; sub?: Record<string, number>; awk?: Record<string, number> }

function sanitizeSkills(r: Partial<SaveData> & { skills?: Partial<Record<ClassId, OldAlloc>> }): Pick<SaveData, 'subClass' | 'subClass2' | 'board' | 'souls' | 'runes' | 'boardResets' | 'boardSpent'> {
  const subClass: SaveData['subClass'] = {};
  for (const c of CLASS_IDS) {
    const sub = r.subClass?.[c];
    if (CLASS_IDS.includes(sub as ClassId)) subClass[c] = sub as ClassId;
  }
  const subClass2: SaveData['subClass2'] = {};
  for (const c of CLASS_IDS) {
    const s2 = (r as Partial<SaveData>).subClass2?.[c];
    if (subClass[c] && CLASS_IDS.includes(s2 as ClassId)) subClass2[c] = s2 as ClassId;
  }
  let souls = Math.max(0, num(r.souls, 0));
  let runes = Math.max(0, num(r.runes, 0));
  // migrate old skill points
  if (r.skills && typeof r.skills === 'object' && !Array.isArray(r.board)) {
    let points = 0;
    for (const a of Object.values(r.skills)) for (const t of [a?.main, a?.sub, a?.awk]) for (const v of Object.values(t ?? {})) points += Math.max(0, num(v, 0));
    souls += points * 40;
    runes += Math.ceil(points / 2);
  }
  // keep only real panels whose parent chain is intact
  const want = new Set(Array.isArray(r.board) ? r.board.filter((id): id is string => typeof id === 'string' && !!nodeById(id)) : []);
  const board: string[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const pre of ['', '2:', '3:']) for (const n of ALL_NODES) {
      const id = pre + n.id;
      if (want.has(id) && !board.includes(id) && (n.parent === '' || board.includes(pre + n.parent))) { board.push(id); added = true; }
    }
  }
  const boardResets: SaveData['boardResets'] = {};
  for (const k of [...CLASS_IDS, ...CLASS_IDS.map((c) => `2:${c}`), ...CLASS_IDS.map((c) => `3:${c}`), ...Object.keys(MIX_BOARD_NODES)]) {
    const v = Math.max(0, Math.floor(num(r.boardResets?.[k], 0)));
    if (v) boardResets[k] = v;
  }
  // what was paid per board: keep saved numbers, fall back to list prices for older saves
  const boardSpent: SaveData['boardSpent'] = {};
  for (const k of new Set(board.map(boardKeyOf))) {
    const v = (r as Partial<SaveData>).boardSpent?.[k];
    const base = boardCost(board.filter((id) => boardKeyOf(id) === k));
    boardSpent[k] = v && typeof v === 'object' ? { souls: Math.max(0, num(v.souls, base.souls)), runes: Math.max(0, num(v.runes, base.runes)) } : base;
  }
  return { subClass, subClass2, board, souls, runes, boardResets, boardSpent };
}

export function loadSave(): SaveData {
  try {
    const txt = localStorage.getItem(KEY);
    return txt ? sanitize(JSON.parse(txt)) : freshSave();
  } catch {
    return freshSave();
  }
}

let onWrite: ((json: string, s: SaveData) => void) | null = null;
/** Called after every save (used for the cloud copy). */
export const setSaveHook = (fn: (json: string, s: SaveData) => void) => { onWrite = fn; };

export function writeSave(s: SaveData): void {
  s.updatedAt = Date.now();
  const json = JSON.stringify(s);
  try { localStorage.setItem(KEY, json); } catch { /* storage blocked */ }
  onWrite?.(json, s);
}

/** Load a save that came from elsewhere (cloud) without bumping its timestamp. */
export function parseSave(json: string): SaveData { return sanitize(JSON.parse(json)); }
export function writeSaveLocalOnly(s: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

export function exportSave(s: SaveData): string { return JSON.stringify(s, null, 2); }
export function importSave(text: string): SaveData { return sanitize(JSON.parse(text)); }

// ---------- 職業熟練度 (class levels) ----------
/** Total class XP to reach class level L (Lv 5 ≈ half an hour of play, Lv 15 ≈ 2 h, Lv 25 ≈ 4 h, Lv 50 = the long game). */
export const classXpTotal = (L: number) => 50 * (L - 1) * (L - 1) + 1300 * (L - 1);
export const CLASS_MAX_LEVEL = 60;
export function classLevel(s: SaveData, c: ClassId): number {
  const xp = s.classXp[c] ?? 0;
  let L = 1;
  while (L < CLASS_MAX_LEVEL && xp >= classXpTotal(L + 1)) L++;
  return L;
}
/** Progress inside the current class level (0–1). */
export function classProgress(s: SaveData, c: ClassId): number {
  const L = classLevel(s, c);
  if (L >= CLASS_MAX_LEVEL) return 1;
  return ((s.classXp[c] ?? 0) - classXpTotal(L)) / (classXpTotal(L + 1) - classXpTotal(L));
}
/** Class level needed to pick a class as the second / third class. */
export const SUB_LEVEL = 5, SUB2_LEVEL = 15;
/** 專精 (staying a single class): abilities at these class levels. */
export const MASTERY_LEVELS = [10, 25, 50] as const;
/** After a run: the main class gets all the XP, the second and third classes half. */
export function addClassXp(s: SaveData, xp: number): void {
  const c = s.classId, sub = subOf(s), sub2 = sub2Of(s);
  s.classXp[c] = (s.classXp[c] ?? 0) + xp;
  for (const o of new Set([sub, sub2])) if (o && o !== c) s.classXp[o] = (s.classXp[o] ?? 0) + xp * 0.5;
}
/** 專精 counts while you stay one class: no second class, or the same class picked again. */
export const isPure = (s: SaveData) => !subOf(s);
/** 專精: board numbers ×2 while you have no second class, ×2.5 once you could have ascended (Tier 25 + Lv 40). */
export const pureBoardScale = (s: SaveData) => (!isPure(s) ? 1 : (s.highestCleared >= ASCEND_TIER && s.level >= ASCEND_LEVEL ? 2.5 : 2) + (s.classId === 'warrior' ? 0.5 : 0)); // 戰士 +0.5 (its own board is the weakest)
/** Run XP goes to the character and to the classes in use. */
export function addRunXp(s: SaveData, xp: number): number { addClassXp(s, xp); return addAccountXp(s, xp); }
/** Can this class be picked as the second (or third) class? */
export const canPickSub = (s: SaveData, c: ClassId, third = false) => classLevel(s, c) >= (third ? SUB2_LEVEL : SUB_LEVEL);

export function addAccountXp(s: SaveData, xp: number): number {
  let gained = 0;
  if (s.level >= MAX_LEVEL) { s.xp = 0; return 0; }
  s.xp += xp;
  while (s.level < MAX_LEVEL && s.xp >= ACCOUNT.xpFor(s.level)) {
    s.xp -= ACCOUNT.xpFor(s.level);
    s.level++;
    gained++;
  }
  return gained;
}

export const shopCost = (s: SaveData, k: ShopKey) => Math.round(SHOP[k].base * Math.pow(SHOP[k].growth, s.shop[k]));

// ---------- gear ----------
/** Looks in the bag first, then the 倉庫 (gear in a 配裝 can be worn straight from the 倉庫). */
export const itemById = (s: SaveData, id: string | null | undefined) => (id ? s.items.find((i) => i.id === id) ?? s.stash.find((i) => i.id === id) : undefined);
export const inStash = (s: SaveData, it: Item) => s.stash.includes(it);
/** Gear taken off (swapped out) that was being worn from the 倉庫 drops into the bag (stays in the 倉庫 if the bag is full). */
function bounceToBag(s: SaveData, id: string | null | undefined): void {
  if (!id || Object.values(s.equipped).includes(id)) return;
  const it = s.stash.find((i) => i.id === id);
  if (!it || s.items.length >= bagMax(s)) return;
  s.stash = s.stash.filter((i) => i !== it);
  delete s.stashTabOf[it.id];
  s.items.push(it);
}
const optsOf = (s: SaveData) => weaponOptions(s.classId, subOf(s), sub2Of(s));

/** Can the current character put this item in this slot? */
export function fits(s: SaveData, it: Item, slot: EquipSlot): boolean {
  if (!isWeaponSlot(slot)) return !it.weapon && it.slot === itemSlotOf(slot);
  return !!it.weapon && optsOf(s)[slot].includes(it.weapon);
}
/** Is the main hand holding a two-handed weapon (so the off hand is unusable)? */
export const offHandBlocked = (s: SaveData) => { const m = equippedIn(s, 'mainWeapon'); return !!m?.weapon && !!WEAPONS[m.weapon].twoHanded; };
/** Slots this item can go in for the current character (dual wield = both weapon slots). */
export const slotsFor = (s: SaveData, it: Item): EquipSlot[] =>
  it.weapon ? (['mainWeapon', 'subWeapon'] as EquipSlot[]).filter((sl) => fits(s, it, sl)) : it.slot === 'ring' ? ['ring', 'ring2'] : [it.slot];
export const usableNow = (s: SaveData, it: Item) => slotsFor(s, it).length > 0;

/** What the current character has in this slot (ignores items that no longer fit, e.g. a shield after awakening). */
export function equippedIn(s: SaveData, slot: EquipSlot): Item | undefined {
  const it = itemById(s, s.equipped[slotKey(slot, s.classId)]);
  if (slot === 'subWeapon' && offHandBlocked(s)) return undefined;
  return it && fits(s, it, slot) ? it : undefined;
}
/** Worn by the current character. */
export const isEquipped = (s: SaveData, it: Item) => EQUIP_SLOTS.some((slot) => equippedIn(s, slot) === it);
/** Worn by any class (protects it from salvage and trades). */
export const isEquippedAny = (s: SaveData, it: Item) => Object.values(s.equipped).includes(it.id);
export const isProtected = (s: SaveData, it: Item) => it.locked || isEquippedAny(s, it) || inLoadout(s, it);
/** Kept in a saved 配裝 (A/B/C) of any class: protected too. */
export const inLoadout = (s: SaveData, it: Item) => Object.values(s.loadouts).some((l) => l?.sets.some((st) => st && Object.values(st.equipped).includes(it.id)));

export function equippedItems(s: SaveData): Item[] {
  return EQUIP_SLOTS.map((slot) => equippedIn(s, slot)).filter((i): i is Item => !!i);
}

export function equip(s: SaveData, it: Item, slot?: EquipSlot): void {
  const options = slotsFor(s, it);
  const target = slot ?? options.find((sl) => !equippedIn(s, sl)) ?? options[0]; // prefer an empty slot (second ring)
  if (!target || !fits(s, it, target)) return;
  const before = EQUIP_SLOTS.map((sl) => s.equipped[slotKey(sl, s.classId)]);
  // the same item can't be in both hands
  for (const sl of EQUIP_SLOTS) if (s.equipped[slotKey(sl, s.classId)] === it.id) s.equipped[slotKey(sl, s.classId)] = null;
  s.equipped[slotKey(target, s.classId)] = it.id;
  // a two-handed weapon empties the off hand; an off-hand weapon takes the place of a two-handed one
  if (target === 'mainWeapon' && it.weapon && WEAPONS[it.weapon].twoHanded) s.equipped[slotKey('subWeapon', s.classId)] = null;
  if (target === 'subWeapon') { const m = itemById(s, s.equipped[slotKey('mainWeapon', s.classId)]); if (m?.weapon && WEAPONS[m.weapon].twoHanded) s.equipped[slotKey('mainWeapon', s.classId)] = null; }
  before.forEach((id) => bounceToBag(s, id));
}
export function unequip(s: SaveData, slot: EquipSlot): void { const id = s.equipped[slotKey(slot, s.classId)]; s.equipped[slotKey(slot, s.classId)] = null; bounceToBag(s, id); }

export function salvage(s: SaveData, ids: string[]): number {
  let total = 0;
  const set = new Set(ids);
  s.items = s.items.filter((it) => {
    if (!set.has(it.id) || isProtected(s, it)) return true;
    total += salvageValue(it);
    return false;
  });
  s.coins += total;
  return total;
}

/** Try to upgrade. +7 and above can fail; a failure only costs the coins and adds +10% to the next try. */
export function upgrade(s: SaveData, it: Item): 'ok' | 'fail' | 'no' {
  const cost = upgradeCost(it);
  if (it.plus >= MAX_PLUS || s.coins < cost) return 'no';
  s.coins -= cost;
  it.spent += cost;
  if (Math.random() < upgradeChance(it)) { it.plus++; it.fails = 0; return 'ok'; }
  it.fails++;
  return 'fail';
}

export function reroll(s: SaveData, it: Item, index: number): boolean {
  const cost = rerollCost(it);
  if (!canReroll(it) || !it.affixes[index] || s.coins < cost) return false;
  s.coins -= cost;
  rerollAffix(it, index);
  return true;
}

/** Trade 5 unprotected items of the same category (weapons or armour) for 1 item of the kind you choose. */
export type TradeCat = 'weapon' | 'armour' | 'accessory';
export const tradeCat = (it: Item): TradeCat => (it.weapon ? 'weapon' : isAccessorySlot(it.slot) ? 'accessory' : 'armour');
const kindCat = (k: ItemKind): TradeCat => ('weapon' in k ? 'weapon' : isAccessorySlot(k.armour) ? 'accessory' : 'armour');

/** Loot leans towards the classes this character plays (main + awakened classes). */
function lootFor(s: SaveData): void { setLootClasses([s.classId, subOf(s), sub2Of(s)].filter((c): c is ClassId => !!c)); }
export function trade(s: SaveData, ids: string[], target: ItemKind): Item | null {
  const inputs = ids.map((id) => itemById(s, id)).filter((i): i is Item => !!i && !isProtected(s, i));
  if (inputs.length !== TRADE_COUNT || inputs.some((i) => tradeCat(i) !== kindCat(target))) return null;
  lootFor(s);
  const out = tradeResult(inputs, target, `i${s.nextItemId++}`);
  const set = new Set(inputs.map((i) => i.id));
  s.items = s.items.filter((i) => !set.has(i.id));
  s.items.push(out);
  return out;
}

const AUTO_SALVAGE_MAX: Record<SaveData['autoSalvage'], number> = { off: -1, common: 0, rare: 1, epic: 2 };

/** Open chests won in a run. Auto-salvage setting and a full bag turn drops into coins. */
export function openChests(s: SaveData, chests: Record<ChestKind, number>, tier: number): { items: Item[]; autoSalvaged: number; kept: Item[] } {
  const items: Item[] = [];
  const nextId = () => `i${s.nextItemId++}`;
  lootFor(s);
  for (const kind of ['gold', 'silver'] as ChestKind[]) {
    for (let i = 0; i < chests[kind]; i++) items.push(...openChest(kind, tier, nextId));
  }
  s.runes += chests.silver + chests.gold * 2; // every chest also holds runes
  let autoSalvaged = 0;
  const kept: Item[] = [];
  for (const it of items) {
    const tooLow = RARITIES.indexOf(it.rarity) <= AUTO_SALVAGE_MAX[s.autoSalvage];
    if (!tooLow && s.items.length < bagMax(s)) { s.items.push(it); kept.push(it); }
    else { const v = salvageValue(it); s.coins += v; autoSalvaged += v; }
  }
  // fill empty slots automatically so new players feel the upgrade
  for (const it of kept) for (const slot of slotsFor(s, it)) if (!equippedIn(s, slot)) { equip(s, it, slot); break; }
  return { items, autoSalvaged, kept };
}

// ---------- everything that feeds into a run ----------
export const levelBonus = (level: number) => 0.01 * (Math.min(level, MAX_LEVEL) - 1);

export function bonuses(s: SaveData): StatBonus {
  const b: StatBonus = {};
  addBonus(b, 'maxHp', { pct: s.shop.hp * SHOP.hp.pct });
  addBonus(b, 'atk', { pct: s.shop.atk * SHOP.atk.pct });
  addBonus(b, 'moveSpeed', { pct: s.shop.speed * SHOP.speed.pct });
  // character level: +1% HP and attack per level above 1 (Lv 100 = +99%)
  addBonus(b, 'maxHp', { pct: levelBonus(s.level) });
  addBonus(b, 'atk', { pct: levelBonus(s.level) });
  for (const it of equippedItems(s)) addItemBonus(b, it);
  return b;
}

// ---------- offline income ----------
export function offlineIncome(s: SaveData, now = Date.now()): { minutes: number; coins: number; xp: number; souls: number } {
  const minutes = Math.min(OFFLINE.maxHours * 60, Math.max(0, (now - s.lastSeen) / 60000));
  if (s.highestCleared < 1 || minutes < OFFLINE.minMinutes) return { minutes: 0, coins: 0, xp: 0, souls: 0 };
  const t = s.highestCleared;
  return {
    minutes,
    coins: Math.floor(minutes * OFFLINE.coinsPerMinute * (1 + 0.2 * (t - 1))),
    xp: Math.floor(minutes * OFFLINE.xpPerMinute * (1 + 0.15 * (t - 1))),
    souls: Math.floor(minutes * OFFLINE.soulsPerMinute * (1 + 0.1 * (t - 1))),
  };
}

// ---------- skills & awakening ----------
export const subOf = (s: SaveData) => s.subClass[s.classId] ?? null;
export const sub2Of = (s: SaveData) => (subOf(s) ? s.subClass2[s.classId] ?? null : null);
export const canAwaken = (s: SaveData) => !subOf(s) && s.highestCleared >= AWAKEN_TIER;
/** 昇華: pick a third class (needs account level and a dungeon clear). */
export const canAscend = (s: SaveData) => !!subOf(s) && !sub2Of(s) && s.level >= ASCEND_LEVEL && s.highestCleared >= ASCEND_TIER;
/** The mix this character is (two or three classes), or null. */
export const mixOf = (s: SaveData) => mixFor(s.classId, subOf(s), sub2Of(s));
/** The boards this character uses: one per class (a class picked again gets copy ② / ③), plus the mixed-class board. */
export function activeBoards(s: SaveData): BoardKey[] {
  const sub = subOf(s), sub2 = sub2Of(s);
  if (!sub) return [s.classId];
  const classes = [s.classId, sub, ...(sub2 ? [sub2] : [])];
  const keys = classes.map((c, i) => { const n = classes.slice(0, i).filter((x) => x === c).length; return n ? `${n + 1}:${c}` : c; });
  return [...keys, sub2 ? `${s.classId}_${sub}_${sub2}` : `${s.classId}_${sub}`];
}
/** Unlocked panels that count for this character (other boards stay saved but switched off). */
export const activeBoard = (s: SaveData) => { const a: string[] = activeBoards(s); return s.board.filter((id) => a.includes(boardKeyOf(id))); };
/** Unlocked panels on one board, as plain panel ids. */
export const boardOwned = (s: SaveData, k: BoardKey) => new Set(s.board.filter((id) => boardKeyOf(id) === k).map(baseId));
/** What a panel costs right now (every panel you own on your active boards makes the next ones dearer). */
export const panelCost = (s: SaveData, id: string) => scaledCost(nodeById(id)!, activeBoard(s).length);
/** How many panels on this character's boards can be unlocked right now (materials and path OK). */
export const unlockableNow = (s: SaveData) => activeBoards(s).reduce((a, k) => a + boardNodesOf(k).filter((n) => unlockCheck(s, copyPrefix(k + '.') + n.id) === 'ok').length, 0);

export function awaken(s: SaveData, sub: ClassId): void {
  if (!canAwaken(s) || !canPickSub(s, sub)) return;
  s.subClass[s.classId] = sub;
}

/** Clear boards and refund exactly what was paid for them. */
function refundBoards(s: SaveData, keys: string[]): { souls: number; runes: number } {
  const refund = { souls: 0, runes: 0 };
  for (const k of keys) {
    const ids = s.board.filter((id) => boardKeyOf(id) === k);
    if (!ids.length) continue;
    const r = s.boardSpent[k] ?? boardCost(ids);
    refund.souls += r.souls; refund.runes += r.runes;
    delete s.boardSpent[k];
  }
  s.souls += refund.souls;
  s.runes += refund.runes;
  s.board = s.board.filter((id) => !keys.includes(boardKeyOf(id)));
  return refund;
}

/** 昇華: add a third class. The old two-class board is cleared and every soul and rune on it comes back. */
export function ascend(s: SaveData, sub2: ClassId): { souls: number; runes: number } | null {
  if (!canAscend(s) || !canPickSub(s, sub2, true)) return null;
  const refund = refundBoards(s, [`${s.classId}_${subOf(s)}`]);
  s.subClass2[s.classId] = sub2;
  return refund;
}

/** Test-only: undo the third class (its class board copy and the three-class board are refunded; the two-class board starts empty). */
export function resetAscension(s: SaveData): { souls: number; runes: number } {
  if (!sub2Of(s)) return { souls: 0, runes: 0 };
  const boards = activeBoards(s);
  const drop = [boards[2], boards[3]];
  for (const k of Object.keys(MIX_BOARD_NODES)) if (k.startsWith(`${s.classId}_${subOf(s)}_`) && !drop.includes(k)) drop.push(k);
  const r = refundBoards(s, drop);
  delete s.subClass2[s.classId];
  return r;
}

export type UnlockCheck = 'ok' | 'locked' | 'section' | 'souls' | 'runes' | 'owned';
export function unlockCheck(s: SaveData, id: string): UnlockCheck {
  const n = nodeById(id);
  if (!n) return 'locked';
  if (s.board.includes(id)) return 'owned';
  const key = boardKeyOf(id) as BoardKey;
  if (!(activeBoards(s) as string[]).includes(key)) return 'locked';
  const set = boardOwned(s, key);
  if (!canUnlock(n, set, s.highestCleared)) return s.highestCleared < n.gate ? 'section' : 'locked';
  const c = panelCost(s, id);
  if (s.souls < c.souls) return 'souls';
  if (s.runes < c.runes) return 'runes';
  return 'ok';
}

export function unlockNode(s: SaveData, id: string): boolean {
  if (unlockCheck(s, id) !== 'ok') return false;
  const c = panelCost(s, id);
  const k = boardKeyOf(id);
  s.souls -= c.souls;
  s.runes -= c.runes;
  const sp = s.boardSpent[k] ?? { souls: 0, runes: 0 };
  s.boardSpent[k] = { souls: sp.souls + c.souls, runes: sp.runes + c.runes };
  s.board.push(id);
  return true;
}

/** Every locked panel from the nearest unlocked one up to this panel (in unlock order), and what they cost together. */
export function pathPlan(s: SaveData, id: string): { ids: string[]; souls: number; runes: number; gate: number; ok: boolean } | null {
  const n = nodeById(id);
  if (!n || s.board.includes(id)) return null;
  const key = boardKeyOf(id) as BoardKey;
  if (!(activeBoards(s) as string[]).includes(key)) return null;
  const pre = copyPrefix(id);
  const owned = boardOwned(s, key);
  const chain: string[] = [];
  let cur: typeof n | undefined = n;
  while (cur && !owned.has(cur.id)) {
    chain.unshift(pre + cur.id);
    cur = cur.parent ? nodeById(cur.parent) : undefined;
  }
  let souls = 0, runes = 0, gate = 0;
  const base = activeBoard(s).length;
  chain.forEach((pid, i) => {
    const c = scaledCost(nodeById(pid)!, base + i);
    souls += c.souls; runes += c.runes;
    gate = Math.max(gate, nodeById(pid)!.gate);
  });
  return { ids: chain, souls, runes, gate, ok: s.highestCleared >= gate && s.souls >= souls && s.runes >= runes };
}
/** Unlock the whole path up to a panel at once (only if all of it is affordable). */
export function unlockPath(s: SaveData, id: string): number {
  const plan = pathPlan(s, id);
  if (!plan || !plan.ok) return 0;
  let n = 0;
  for (const pid of plan.ids) { if (!unlockNode(s, pid)) break; n++; }
  return n;
}

export const boardCount = (s: SaveData, c: BoardKey) => s.board.filter((id) => boardKeyOf(id) === c).length;
export const boardResetCost = (s: SaveData, c: BoardKey) => resetCost(boardCount(s, c), s.boardResets[c] ?? 0);

/** Clear one class board and refund every soul and rune spent on it. First reset is free, then it costs coins. */
export function resetBoard(s: SaveData, c: BoardKey): boolean {
  const ids = s.board.filter((id) => boardKeyOf(id) === c);
  const cost = boardResetCost(s, c);
  if (!ids.length || s.coins < cost) return false;
  const refund = s.boardSpent[c] ?? boardCost(ids);
  s.coins -= cost;
  s.souls += refund.souls;
  s.runes += refund.runes;
  s.board = s.board.filter((id) => boardKeyOf(id) !== c);
  delete s.boardSpent[c];
  s.boardResets[c] = (s.boardResets[c] ?? 0) + 1;
  return true;
}

/** Test-only: undo the second class for the current main class. */
export function resetAwakening(s: SaveData): { souls: number; runes: number } {
  // the second-class board and the awakened board are cleared and fully refunded (free); the main class board stays
  const drop = activeBoards(s).slice(1);
  // also clear mixed boards of this main class left over from earlier picks
  for (const k of Object.keys(MIX_BOARD_NODES)) if (k.startsWith(`${s.classId}_`) && !drop.includes(k)) drop.push(k);
  const refund = refundBoards(s, drop);
  delete s.subClass[s.classId];
  delete s.subClass2[s.classId];
  return refund;
}

export { BOARD_NODES };

// ---------- 配裝 A/B/C (per class) ----------
export const LOADOUT_COUNT = 3;
export const LOADOUT_NAMES = ['A', 'B', 'C'];
/** A saved build: gear, ultimates, arrows / spells / necro mode, and the skill boards (each set invests its own souls and runes). */
export interface Loadout {
  equipped: Record<string, string | null>;
  ultEquip: UltId[];
  arrowType?: ArrowType; arrowMix: ArrowType[];
  spellType?: SpellType; spellMix: SpellType[];
  necroMode: NecroMode;
  board: string[];
  boardSpent: SaveData['boardSpent'];
  boardResets: SaveData['boardResets'];
}
function sanitizeLoadouts(raw: unknown): SaveData['loadouts'] {
  const out: SaveData['loadouts'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [c, v] of Object.entries(raw as Record<string, { active?: number; sets?: unknown[] }>)) {
    if (!CLASS_IDS.includes(c as ClassId) || !v || !Array.isArray(v.sets)) continue;
    const sets = Array.from({ length: LOADOUT_COUNT }, (_, i) => {
      const st = v.sets![i] as Partial<Loadout> | null | undefined;
      if (!st || typeof st !== 'object') return null;
      return {
        equipped: Object.fromEntries(Object.entries(st.equipped ?? {}).filter(([, id]) => id === null || typeof id === 'string')) as Loadout['equipped'],
        ultEquip: Array.isArray(st.ultEquip) ? st.ultEquip.filter((u) => ULT_IDS.includes(u)).slice(0, ULT_SLOTS_MAX) : [],
        arrowType: ARROW_TYPES.includes(st.arrowType as ArrowType) ? st.arrowType : undefined,
        arrowMix: Array.isArray(st.arrowMix) ? st.arrowMix.filter((a) => ARROW_TYPES.includes(a)) : [],
        spellType: SPELL_TYPES.includes(st.spellType as SpellType) ? st.spellType : undefined,
        spellMix: Array.isArray(st.spellMix) ? st.spellMix.filter((a) => SPELL_TYPES.includes(a)) : [],
        necroMode: st.necroMode === 'summon' ? 'summon' : 'bolt',
        board: Array.isArray(st.board) ? st.board.filter((id) => typeof id === 'string' && !!nodeById(id)) : [],
        boardSpent: st.boardSpent && typeof st.boardSpent === 'object' ? st.boardSpent : {},
        boardResets: st.boardResets && typeof st.boardResets === 'object' ? st.boardResets : {},
      } as Loadout;
    });
    out[c as ClassId] = { active: Math.max(0, Math.min(LOADOUT_COUNT - 1, Math.floor(num(v.active, 0)))), sets };
  }
  return out;
}
/** The current build of this class, as a 配裝. */
function snapshotLoadout(s: SaveData): Loadout {
  const c = s.classId, keys: string[] = activeBoards(s);
  const pick = <T,>(o: Partial<Record<BoardKey, T>>) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k))) as Partial<Record<BoardKey, T>>;
  return {
    equipped: Object.fromEntries(EQUIP_SLOTS.map((sl) => [slotKey(sl, c), s.equipped[slotKey(sl, c)] ?? null])),
    ultEquip: [...s.ultEquip], arrowType: s.arrowType[c], arrowMix: [...(s.arrowMix[c] ?? [])], spellType: s.spellType[c], spellMix: [...(s.spellMix[c] ?? [])],
    necroMode: s.necroMode, board: s.board.filter((id) => keys.includes(boardKeyOf(id))), boardSpent: pick(s.boardSpent), boardResets: pick(s.boardResets),
  };
}
export const activeLoadout = (s: SaveData) => s.loadouts[s.classId]?.active ?? 0;
export const loadoutUsed = (s: SaveData, i: number) => i === activeLoadout(s) || !!s.loadouts[s.classId]?.sets[i];
/** Switch this class to 配裝 i. The current build is saved into its set first. An empty set starts with the same
 *  gear, ultimates and arrows, but an empty skill board (each set pays for its own panels). */
export function switchLoadout(s: SaveData, i: number): void {
  const c = s.classId;
  const lo = (s.loadouts[c] ??= { active: 0, sets: new Array<Loadout | null>(LOADOUT_COUNT).fill(null) });
  if (i === lo.active || i < 0 || i >= LOADOUT_COUNT) return;
  const keys: string[] = activeBoards(s);
  lo.sets[lo.active] = snapshotLoadout(s);
  const next: Loadout | null = lo.sets[i] ?? null;
  // take this class's boards off; the next set brings its own
  s.board = s.board.filter((id) => !keys.includes(boardKeyOf(id)));
  for (const k of keys) { delete s.boardSpent[k as BoardKey]; delete s.boardResets[k as BoardKey]; }
  if (next) {
    for (const [k, id] of Object.entries(next.equipped)) s.equipped[k] = id && itemById(s, id) ? id : null;
    s.ultEquip = next.ultEquip.filter((u) => (s.ults[u] ?? 0) > 0);
    if (next.arrowType) s.arrowType[c] = next.arrowType;
    s.arrowMix[c] = [...next.arrowMix];
    if (next.spellType) s.spellType[c] = next.spellType;
    s.spellMix[c] = [...next.spellMix];
    s.necroMode = next.necroMode;
    s.board.push(...next.board.filter((id) => !s.board.includes(id)));
    Object.assign(s.boardSpent, next.boardSpent);
    Object.assign(s.boardResets, next.boardResets);
  }
  lo.active = i;
}

// ---------- 無盡模式 ----------
export const ENDLESS_UNLOCK = 50; // clear tier 50 first
/** 無盡模式 starts 10 tiers below your best clear (never below 40), so the first minutes are a warm-up. */
export const endlessStart = (s: SaveData) => Math.max(40, s.highestCleared - 10);

// ---------- 倉庫 (storage) ----------
export interface StashTab { id: string; name: string }
export const STASH_TABS_MAX = 10, STASH_TAB_NAME = 10;
/** Which player tab an item in the 倉庫 sits in (null = 未分類). */
export const stashTabOfItem = (s: SaveData, id: string) => { const t = s.stashTabOf[id]; return t && s.stashTabs.some((x) => x.id === t) ? t : null; };
export function addStashTab(s: SaveData, name: string): string | null {
  const n = name.trim().slice(0, STASH_TAB_NAME);
  if (!n || s.stashTabs.length >= STASH_TABS_MAX) return null;
  let k = 1; while (s.stashTabs.some((t) => t.id === 't' + k)) k++;
  s.stashTabs.push({ id: 't' + k, name: n });
  return 't' + k;
}
export function renameStashTab(s: SaveData, id: string, name: string): void {
  const t = s.stashTabs.find((x) => x.id === id), n = name.trim().slice(0, STASH_TAB_NAME);
  if (t && n) t.name = n;
}
/** Removing a tab keeps its items (they go back to 未分類). */
export function deleteStashTab(s: SaveData, id: string): void {
  s.stashTabs = s.stashTabs.filter((t) => t.id !== id);
  for (const k of Object.keys(s.stashTabOf)) if (s.stashTabOf[k] === id) delete s.stashTabOf[k];
}
export function setStashTab(s: SaveData, itemId: string, tab: string | null): void {
  if (tab && s.stashTabs.some((t) => t.id === tab)) s.stashTabOf[itemId] = tab; else delete s.stashTabOf[itemId];
}
export const STASH_BASE = 50, STASH_STEP = 25, STASH_BUYS_MAX = 8;
export const stashMax = (s: SaveData) => STASH_BASE + STASH_STEP * s.stashBuys;
export const stashCost = (s: SaveData): number | null => (s.stashBuys >= STASH_BUYS_MAX ? null : Math.round(3000 * Math.pow(1.6, s.stashBuys)));
export function buyStash(s: SaveData): boolean {
  const c = stashCost(s);
  if (c === null || s.coins < c) return false;
  s.coins -= c; s.stashBuys++;
  return true;
}
/** Can this item go into the 倉庫? Anything but what this character is wearing right now: gear of other 配裝 / classes
 *  can wait in the 倉庫 and is worn straight from there when that set is used. */
export const canStash = (s: SaveData, it: Item) => s.items.includes(it) && !EQUIP_SLOTS.some((sl) => s.equipped[slotKey(sl, s.classId)] === it.id);
export function toStash(s: SaveData, id: string, tab: string | null = null): 'ok' | 'full' | 'worn' {
  const it = s.items.find((i) => i.id === id);
  if (!it) return 'worn';
  if (!canStash(s, it)) return 'worn';
  if (s.stash.length >= stashMax(s)) return 'full';
  s.items = s.items.filter((i) => i !== it);
  s.stash.push(it);
  setStashTab(s, it.id, tab);
  return 'ok';
}
export function fromStash(s: SaveData, id: string): 'ok' | 'full' {
  const it = s.stash.find((i) => i.id === id);
  if (!it) return 'ok';
  if (s.items.length >= bagMax(s)) return 'full';
  s.stash = s.stash.filter((i) => i !== it);
  delete s.stashTabOf[it.id];
  s.items.push(it);
  return 'ok';
}

// ---------- bag space (bought with coins) ----------
export const BAG_STEP = 10;
export const BAG_BUYS_MAX = 10;
export const bagMax = (s: SaveData) => INVENTORY_MAX + BAG_STEP * s.bagBuys;
/** Coins for the next +10 bag slots (null when maxed). */
export const bagCost = (s: SaveData): number | null => (s.bagBuys >= BAG_BUYS_MAX ? null : Math.round(2000 * Math.pow(1.6, s.bagBuys)));
export function buyBag(s: SaveData): boolean {
  const c = bagCost(s);
  if (c === null || s.coins < c) return false;
  s.coins -= c; s.bagBuys++;
  return true;
}

/** 多重箭袋: how many arrow types you can use at once (1 + every +1 on items with it, up to all of them). */
export function arrowSlots(s: SaveData): number {
  if (arrowMaxForm(s)) return ARROW_TYPES.length;
  const extra = equippedItems(s).filter((i) => i.special === 'multiArrow' || i.special2 === 'multiArrow').length; // one more arrow type per item worn with it
  return Math.min(ARROW_TYPES.length, 1 + extra + (isSharpshooter(s) ? 1 : 0)); // 神射手: one more arrow type
}
/** 神射手 (archer + archer, or a three-class mix grown from it). */
export const isSharpshooter = (s: SaveData) => { const m = mixOf(s); return m?.id === 'archer_archer' || m?.base === 'archer_archer'; };
/** 極·神射: a Sharpshooter with a 多重箭袋 item at max upgrade — every arrow type at once, and extra types cost less. */
export const arrowMaxForm = (s: SaveData) => isSharpshooter(s) && equippedItems(s).some((i) => (i.special === 'multiArrow' || i.special2 === 'multiArrow') && i.plus >= MAX_PLUS);
/** The arrow types in use: the main one first, then the extra ones (as many as 多重箭袋 allows). */
export function arrowsInUse(s: SaveData): ArrowType[] {
  const main = s.arrowType[s.classId] ?? 'normal';
  return [main, ...(s.arrowMix[s.classId] ?? []).filter((a) => a !== main)].slice(0, arrowSlots(s));
}

/** 大法師 (mage + mage, or a three-class mix grown from it). */
export const isArchmage = (s: SaveData) => { const m = mixOf(s); return m?.id === 'mage_mage' || m?.base === 'mage_mage'; };
const hasSpecial = (i: Item, sp: SpecialId) => i.special === sp || i.special2 === sp;
/** 極·大魔導: an Archmage with a 多重法典 item at max upgrade — every spell, and reactions chain. */
export const spellMaxForm = (s: SaveData) => isArchmage(s) && equippedItems(s).some((i) => hasSpecial(i, 'multiSpell') && i.plus >= MAX_PLUS);
/** 多重法典: how many spells you cast in turn (1 + every +1 on items with it, +1 for 大法師). */
export function spellSlots(s: SaveData): number {
  if (spellMaxForm(s)) return SPELL_TYPES.length;
  const extra = equippedItems(s).filter((i) => hasSpecial(i, 'multiSpell')).length; // one more spell per item worn with it
  const pure = isPure(s) && s.classId === 'mage' && classLevel(s, 'mage') >= 10; // 專精 元素大師
  return Math.min(SPELL_TYPES.length, 1 + extra + (isArchmage(s) ? 1 : 0) + (pure ? 1 : 0));
}
/** 多重法典 items beyond what it takes to cast every spell: each makes mixing cheaper (see MIX_OVER in the sim). */
export function spellOver(s: SaveData): number {
  const n = equippedItems(s).filter((i) => hasSpecial(i, 'multiSpell')).length;
  if (spellMaxForm(s)) return Math.max(0, n - 1); // the +10 one opens 極; the rest are extra
  const pure = isPure(s) && s.classId === 'mage' && classLevel(s, 'mage') >= 10;
  return Math.max(0, n - (SPELL_TYPES.length - 1 - (isArchmage(s) ? 1 : 0) - (pure ? 1 : 0)));
}
/** 多重箭袋 items beyond what it takes to use every arrow type. */
export function arrowOver(s: SaveData): number {
  const n = equippedItems(s).filter((i) => hasSpecial(i, 'multiArrow')).length;
  if (arrowMaxForm(s)) return Math.max(0, n - 1);
  return Math.max(0, n - (ARROW_TYPES.length - 1 - (isSharpshooter(s) ? 1 : 0)));
}
export function spellsInUse(s: SaveData): SpellType[] {
  const main = s.spellType[s.classId] ?? 'fire';
  return [main, ...(s.spellMix[s.classId] ?? []).filter((a) => a !== main)].slice(0, spellSlots(s));
}

/** Everything the simulation needs to start a run with the current character. */
export function runSetup(s: SaveData): Omit<RunSetup, 'tier' | 'seed' | 'autoPickCards'> {
  const sub = subOf(s);
  const worn = equippedItems(s);
  const specials = worn.flatMap((i) => [i.special, i.special2]).filter((x): x is SpecialId => !!x);
  const procs = worn.map((i) => i.proc).filter((p): p is NonNullable<Item['proc']> => !!p);
  const skills = boardEffects(activeBoard(s), pureBoardScale(s));
  // awakened-board panels that work like gear skills / legendary specials
  const ults = s.ultEquip.filter((u) => s.ults[u]).map((id) => ({ id, level: s.ults[id]! }));
  const weapons = { main: equippedIn(s, 'mainWeapon')?.weapon ?? null, sub: equippedIn(s, 'subWeapon')?.weapon ?? null, blocked: offHandBlocked(s) };
  return { classId: s.classId, subClassId: sub, subClass2Id: sub2Of(s), weapons, arrowType: s.arrowType[s.classId] ?? 'normal', arrowTypes: arrowsInUse(s), arrowMax: arrowMaxForm(s), arrowOver: arrowOver(s), mastery: isPure(s) ? classLevel(s, s.classId) : 0, spellType: s.spellType[s.classId] ?? 'fire', spellTypes: spellsInUse(s), spellMax: spellMaxForm(s), spellOver: spellOver(s), necroMode: s.necroMode, skills, bonus: bonuses(s), specials: [...specials, ...skills.specials], procs: [...procs, ...skills.procs], ults };
}

/** Stats preview including skills and awakening (for the home screen). */
export function previewBonus(s: SaveData): StatBonus {
  const r = runSetup(s);
  const b = mergeBonus(mergeBonus({}, r.bonus), r.skills?.bonus ?? {});
  const awk = mixFor(s.classId, r.subClassId, r.subClass2Id);
  return awk ? mergeBonus(b, awk.bonus) : b;
}

// ---------- world boss ----------
export const wbUnlocked = (s: SaveData) => s.highestCleared >= WB_MIN_LEVEL;
export function wbTicketsLeft(s: SaveData): number {
  if (s.wbDay !== dayKey()) return WB_TICKETS;
  return Math.max(0, WB_TICKETS - s.wbUsed);
}
export function useWbTicket(s: SaveData): boolean {
  if (!wbUnlocked(s) || wbTicketsLeft(s) <= 0) return false;
  if (s.wbDay !== dayKey()) { s.wbDay = dayKey(); s.wbUsed = 0; }
  s.wbUsed++;
  s.wbFights++;
  return true;
}
/** World Boss max level: the highest tier cleared, in the dungeon or survived in 無盡模式. */
export const wbMaxLevel = (s: SaveData) => Math.max(WB_MIN_LEVEL, s.highestCleared, s.endlessTier);

export interface WbResult { reward: WbReward; named: Item | null; twin: Item | null; chestItems: Item[]; autoSalvaged: number; kept: Item[] }

/** Pay out a world boss fight. Chest items follow the usual auto-salvage / full-bag rules. */
export function claimWorldBoss(s: SaveData, bossId: ReturnType<typeof todaysBoss>, level: number, dmgFrac: number, killed: boolean): WbResult {
  const reward = wbRewards(level, dmgFrac, killed);
  s.coins += reward.coins;
  s.souls += reward.souls;
  s.runes += reward.runes;
  addRunXp(s, reward.xp);
  const loot = openChests(s, { silver: reward.silver, gold: reward.gold }, level);
  let named: Item | null = null;
  if (reward.namedRoll && Math.random() < namedChance(level)) {
    const pool = NAMED.filter((n) => n.boss === bossId);
    const def = pool[Math.floor(Math.random() * pool.length)];
    named = makeNamed(def, `i${s.nextItemId++}`, level);
    s.items.push(named); // named items always go in, even if the bag is full
    s.collection[def.id] = (s.collection[def.id] ?? 0) + 1;
  }
  // 雙傳說: from level 101, +1% chance per level for an item with two legendary lines
  let twin: Item | null = null;
  if (Math.random() < doubleChance(level)) { twin = makeDoubleLegendary(`i${s.nextItemId++}`, level); s.items.push(twin); }
  return { reward, named, twin, chestItems: loot.items, autoSalvaged: loot.autoSalvaged, kept: loot.kept };
}

// ---------- 終極技 ----------
/** Unlock (level 0 -> 1) or level up an ultimate with crystals. */
export function ultCost(s: SaveData, id: UltId): number | null {
  const l = s.ults[id] ?? 0;
  if (l >= ULT_MAX_LEVEL) return null;
  return l === 0 ? ULT_UNLOCK_COST : ultUpgradeCost(l);
}
/** 終極技 slots: 3, plus the ones bought with 靈晶 (up to 5). */
export const ultSlots = (s: SaveData) => ULT_SLOTS + s.ultSlotBuys;
export const ultSlotCost = (s: SaveData): number | null => ULT_SLOT_COSTS[s.ultSlotBuys] ?? null;
export function buyUltSlot(s: SaveData): boolean {
  const c = ultSlotCost(s);
  if (c === null || s.crystals < c) return false;
  s.crystals -= c; s.ultSlotBuys++;
  return true;
}
export function ultBuy(s: SaveData, id: UltId): boolean {
  const c = ultCost(s, id);
  if (c === null || s.crystals < c) return false;
  s.crystals -= c;
  const first = !s.ults[id];
  s.ults[id] = (s.ults[id] ?? 0) + 1;
  if (first && s.ultEquip.length < ultSlots(s)) s.ultEquip.push(id); // equip right away if there's room
  return true;
}
/** Put an ultimate in slot i (null = empty it). An ultimate already in another slot swaps places. */
export function ultSetSlot(s: SaveData, i: number, id: UltId | null): boolean {
  const cur = [...s.ultEquip];
  if (id === null) { if (i < cur.length) cur.splice(i, 1); s.ultEquip = cur; return true; }
  if (!s.ults[id]) return false;
  const j = cur.indexOf(id);
  if (j >= 0) { if (i < cur.length && i !== j) [cur[i], cur[j]] = [cur[j], cur[i]]; }
  else if (i < cur.length) cur[i] = id;
  else cur.push(id);
  s.ultEquip = cur.slice(0, ultSlots(s));
  return true;
}

export function ultToggle(s: SaveData, id: UltId): boolean {
  if (!s.ults[id]) return false;
  if (s.ultEquip.includes(id)) { s.ultEquip = s.ultEquip.filter((u) => u !== id); return true; }
  if (s.ultEquip.length >= ultSlots(s)) return false;
  s.ultEquip.push(id);
  return true;
}
