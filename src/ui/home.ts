import { prefs as fxPrefs, setPref } from '../audio';
// Home screen: 出發 (class + dungeon), 裝備 (gear), 強化 (shop), 設定 (settings + save).
import { ACCOUNT, DUNGEON, SHOP, type ShopKey, biomeFor, ENEMY_UNLOCKS, ELITES, tierPower } from '../sim/config';
import { ARROW_TYPES, ARROWS, ATTACK_NAMES, CLASSES, CLASS_IDS, SPELL_TYPES, SPELLS, NECRO_MODES, type ArrowType, type ClassId, type NecroMode, type SpellType } from '../sim/classes';
import {
  ACCESSORY_SLOTS, ARMOUR_SLOTS, canReroll, procText, PROC_SKILLS, INVENTORY_MAX, isWeaponSlot, itemIcon, itemName, itemScore, lineText, MAX_PLUS, RARITIES, RARITY_COLORS,
  RARITY_NAMES, rerollCost, salvageValue, SLOT_ICONS, SLOT_NAMES, EQUIP_SLOTS, EQUIP_NAMES, itemSlotOf, type EquipSlot, SPECIALS, TRADE_COUNT, undeadName, UNDEAD_TRAITS, activeCombos, BONE_COMBOS, STACK_TEXT, isMax, MAX_STACK, MAX_POWER, type SpecialId, tradeRarityWeights, upgradeChance,
  upgradeCost, upgradedMain, WEAPON_TYPES, WEAPONS, weaponOptions, attackFor, weaponUseText, weaponUserIcons, type Item, type ItemKind, type Rarity, type Slot,
} from '../sim/gear';
import { buildStats } from '../sim/sim';
import { value } from '../sim/stats';
import { ASCEND_LEVEL, ASCEND_TIER, AWAKEN_TIER, AWAKENED, awakenedFor, ascendedFor, ESSENCE_INFO } from '../sim/awakening';
import { ULT, ULT_IDS, ULT_LIMIT, ULT_LIMIT_LEVEL, ULT_MAX_LEVEL, ULT_SLOTS, ultDesc, type UltId } from '../sim/ultimates';
import { AUTO_SKILLS, MIX_BOARD_NODES, copyPrefix, COST_GROWTH, boardEffects, boardNodes, sectionTiers, BRANCH_COLORS, BRANCH_NAMES, canUnlock, effectText, MAX_LEVEL, nodeById, type Branch } from '../sim/skills';
import {
  activeBoard, activeBoards, boardOwned, type BoardKey, awaken, boardCount, boardResetCost, canAwaken, equip, equippedIn, exportSave, importSave, isEquipped, isProtected, itemById,
  previewBonus, pathPlan, unlockPath, reroll, resetAwakening, resetAscension, ascend, canAscend, mixOf, sub2Of, offHandBlocked, resetBoard, salvage, levelBonus, panelCost, ultBuy, ultCost, ultSetSlot, ultToggle, runSetup, unlockableNow, unlockCheck, unlockNode, type UnlockCheck, shopCost, slotsFor, subOf, trade, tradeCat, unequip, upgrade, usableNow, type TradeCat,
  wbMaxLevel, wbTicketsLeft, wbUnlocked, writeSave, freshSave, type SaveData,
} from '../save';
import { NAMED, namedChance, todaysBoss, WB_MIN_LEVEL, WB_TICKETS, WB_TIME, WORLD_BOSS_IDS, WORLD_BOSSES } from '../sim/worldboss';
import { esc, fmt, h } from './dom';
import { cloudDownload, cloudReady } from '../cloud';
import { modelsError, modelsReady } from '../render/models';
import { claimQuest, markTip, questCard, tipCard, type TipId } from './onboarding';
import { clearLang, getLang, setLang, tr } from '../i18n';
import { ico, icoG } from './icons';
import { coopBotOn, setCoopBot } from '../coopbot';
import { buildLabel } from '../build';
import { createAccount, fetchBoard, ID_RULE, login, logout, onlinePush, onlineState, onlineSupported, PASSWORD_MIN, type AccountError, type Board, type BoardKind } from '../online';
import { mixFor } from '../sim/awakening';

const EN = getLang() === 'en'; // language is fixed per page load

export type Tab = 'go' | 'skills' | 'ult' | 'gear' | 'shop' | 'settings';

export interface HomeCtx {
  ui: HTMLElement;
  getSave: () => SaveData;
  setSave: (s: SaveData) => void;
  startRun: () => void;
  startWorldBoss: (level: number) => void;
  openCoop: () => void;
  teamCode: () => string | null;
  coopAvailable: () => boolean;
  autoPickToggle: () => string;
  wireToggles: (root: HTMLElement) => void;
  banner: (text: string, icon?: string) => void;
}

let tab: Tab = 'go';

const tabScroll: Partial<Record<Tab, number>> = {};

export function showHome(ctx: HomeCtx, toTab?: Tab): void {
  // re-drawing the same tab (picking a level, a panel, an item…) keeps the page where it was;
  // switching to another tab starts at the top
  const prev = ctx.ui.querySelector('.tabbody') as HTMLElement | null;
  if (prev) tabScroll[tab] = prev.scrollTop;
  if (toTab && toTab !== tab) tabScroll[toTab] = 0;
  if (toTab) tab = toTab;
  const save = ctx.getSave();
  ctx.ui.innerHTML = '';
  const xpNeed = ACCOUNT.xpFor(save.level);
  const canUnlockN = unlockableNow(save);
  const el = h(`
    <div class="home">
      <div class="topbar">
        <div class="lvbox"><b>Lv ${save.level}</b><div class="bar xp"><i style="width:${save.level >= MAX_LEVEL ? 100 : (save.xp / xpNeed) * 100}%"></i></div>${canUnlockN > 0 ? `<span class="pts">${EN ? `${canUnlockN} to unlock` : `可解鎖 ${canUnlockN} 格`}</span>` : ''}</div>
        <div class="coins">🪙 ${fmt(save.coins)}</div>
      </div>
      <div class="tabbody"></div>
      <nav class="tabs">
        ${([['go', '🏰', tr('出發', 'Play')], ['skills', '🌳', tr('技能', 'Skills')], ['ult', '⚡', tr('終極', 'Ultimates')], ['gear', '🎒', tr('裝備', 'Gear')], ['shop', '💪', tr('強化', 'Boosts')], ['settings', '⚙️', tr('設定', 'Settings')]] as const)
          .map(([k, i, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"><span>${i}</span>${n}${k === 'skills' && canUnlockN > 0 ? '<em class="dot"></em>' : k === 'go' && canAwaken(save) ? '<em class="dot"></em>' : k === 'ult' && ultAffordable(save) ? '<em class="dot"></em>' : ''}</button>`).join('')}
      </nav>
    </div>`);
  const body = el.querySelector('.tabbody') as HTMLElement;
  if (tab === 'go') renderGo(ctx, body);
  else if (tab === 'skills') renderSkills(ctx, body);
  else if (tab === 'ult') renderUlt(ctx, body);
  else if (tab === 'gear') renderGear(ctx, body);
  else if (tab === 'shop') renderShop(ctx, body);
  else renderSettings(ctx, body);
  // "知道喇" on any tip card
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-tipok]');
    if (!b) return;
    ev.stopPropagation();
    markTip(save, b.dataset.tipok as TipId);
    b.closest('.tipcard')?.remove();
  }, true);
  el.querySelector('.tabs')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.tab) showHome(ctx, b.dataset.tab as Tab);
  });
  ctx.ui.appendChild(el);
  const keep = tabScroll[tab] ?? 0;
  body.scrollTop = keep;
  requestAnimationFrame(() => { body.scrollTop = keep; });
}

function statSummary(save: SaveData): string {
  const st = buildStats(save.classId, previewBonus(save));
  const rows: [string, string][] = [
    ['HP', fmt(value(st.maxHp))],
    [tr('攻擊', 'ATK'), value(st.atk).toFixed(1)],
    [tr('防禦', 'DEF'), fmt(value(st.def))],
    [tr('攻速', 'Speed'), `${Math.round(value(st.atkSpeed) * 100)}%`],
    [tr('暴擊', 'Crit'), `${Math.round(value(st.crit) * 100)}%`],
    [tr('移速', 'Move'), value(st.moveSpeed).toFixed(1)],
  ];
  return `<div class="stats">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
}

// ---------- 出發 ----------
function renderGo(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  const maxTier = save.highestCleared + 1;
  save.selectedTier = Math.min(Math.max(1, save.selectedTier), maxTier);
  const c = CLASSES[save.classId];
  body.appendChild(h(`
    <div class="col">
      <h1>${tr('地城 Beta 4', 'Dungeon Beta 4')} <small class="buildtag">${buildLabel()}</small></h1>
      ${questCard(save)}
      <div class="card">
        <h3>${tr('職業', 'Class')}</h3>
        <div class="classes">
          ${CLASS_IDS.map((id) => `<button data-class="${id}" class="${id === save.classId ? 'on' : ''}"><span>${CLASSES[id].icon}</span>${CLASSES[id].name}</button>`).join('')}
        </div>
        <p class="desc">${c.desc}</p>
        ${awakeningBlock(save)}
        ${statSummary(save)}
        <p class="note" style="text-align:left;margin:8px 0 0">${tr('試玩版可以隨時轉職業。武器要啱你職業用嘅類型先用得（用唔著嘅可以交換），防具同飾品全部職業通用。', 'Beta: switch class any time. Weapons must match your class (Trade the rest); armour and accessories fit every class.')}</p>
      </div>
      <div class="card">
        <h3>${tr('地城等級', 'Dungeon Tier')}</h3>
        <div class="tier">
          <button data-act="tier-" ${save.selectedTier <= 1 ? 'disabled' : ''}>◀</button>
          <div style="text-align:center"><div class="val">${EN ? `Tier ${save.selectedTier}` : `第 ${save.selectedTier} 級`}</div><small style="display:block;color:var(--text)">${biomeFor(save.selectedTier).icon} ${biomeFor(save.selectedTier).name}${newFoe(save.selectedTier)}</small><small style="color:var(--muted)">${tr('敵人強度', 'Enemy power')} ×${tierPower(save.selectedTier).toFixed(2)} · ${tr('最高通關：', 'Best clear: ')}${save.highestCleared || tr('未有', 'none')}</small></div>
          <button data-act="tier+" ${save.selectedTier >= maxTier ? 'disabled' : ''}>▶</button>
        </div>
      </div>
      <button class="primary start" data-act="start">${tr('開始挑戰', 'Start')}</button>
      ${worldBossCard(save)}
      ${onlineSupported() || ctx.coopAvailable() ? `<button class="card boardcard" data-act="coop"><div class="statline"><h3 style="margin:0">🤝 ${tr('合作模式（2 人）', 'Co-op (2 players)')}</h3><small>${ctx.teamCode() ? `${tr('隊伍', 'Team')} ${ctx.teamCode()}` : ctx.coopAvailable() ? tr('開房 / 入房', 'Open / join a room') : tr('要網上帳號', 'Needs an online account')}</small></div><small>${tr('同朋友一齊打同一個地城，每人都攞足獎勵', 'Clear a dungeon together with a friend; everyone gets full rewards')}</small></button>` : ''}
      ${onlineSupported() ? `<button class="card boardcard" data-act="board"><div class="statline"><h3 style="margin:0">🏆 ${tr('排行榜', 'Leaderboards')}</h3><small>${onlineState().playerId ? `👤 ${esc(onlineState().playerId!)}` : tr('開帳號先上榜', 'Make an account to join')}</small></div><small>${tr('最高通關、同職業排名、今日世界 Boss 傷害', 'Best tier, your class, today\'s World Boss damage')}</small></button>` : ''}
      <div class="note">${tr('唔掂螢幕 = 自動駕駛。掂住螢幕拖動（或 WASD）= 自己操控，放手 2 秒變返自動。<br>打低小 Boss 有機會得銀箱，最終 Boss 一定有金箱，<b>通關先入袋</b>。', 'Hands off = Autopilot. Drag (or WASD) to steer; let go for 2s to return to auto.<br>Mini-bosses may drop a Silver Chest; the final Boss always drops a Gold Chest. <b>Loot is kept only on a clear.</b>')}</div>
    </div>`));
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.class) { save.classId = b.dataset.class as ClassId; writeSave(save); showHome(ctx); }
    else if (b.dataset.act === 'awaken') showAwaken(ctx);
    else if (b.dataset.act === 'ascend') showAscend(ctx);
    else if (b.dataset.act === 'worldboss') showWorldBoss(ctx);
    else if (b.dataset.act === 'board') showBoard(ctx);
    else if (b.dataset.act === 'coop') { if (ctx.coopAvailable()) ctx.openCoop(); else { ctx.banner(tr('先去「設定 → 網上帳號」開個帳號', 'Make an account first: Settings → Online account')); showHome(ctx, 'settings'); } }
    else if (b.dataset.act === 'claim') { const got = claimQuest(save); if (got) { showHome(ctx); ctx.banner(`${tr('任務完成！', 'Quest done! ')}🪙 +${got}`); } }
    else if (b.dataset.act === 'tier-') { save.selectedTier--; writeSave(save); showHome(ctx); }
    else if (b.dataset.act === 'tier+') { save.selectedTier++; writeSave(save); showHome(ctx); }
    else if (b.dataset.act === 'start') ctx.startRun();
  });
}

// ---------- 排行榜 ----------
/** World Boss board score → "Lv 12 · 64%" (or a kill). */
function wbScore(v: number): string {
  const lv = Math.floor(v), f = v - lv;
  return `Lv ${lv} · ${f >= 0.995 ? tr('擊殺', 'Kill') : `${Math.round((f / 0.99) * 100)}%`}`;
}

function showBoard(ctx: HomeCtx): void {
  const save = ctx.getSave();
  let kind: BoardKind = 'all';
  let board: Board | null | 'loading' = 'loading';
  const el = h(`<div class="screen dim modal"></div>`);
  const mixName = (id: string | null, cls: ClassId | null): string => {
    if (id) { const [a, b, c] = id.split('_') as ClassId[]; const m = CLASSES[a] && mixFor(a, b, c ?? null); if (m) return `${m.icon} ${m.name}`; }
    return cls && CLASSES[cls] ? `${CLASSES[cls].icon} ${CLASSES[cls].name}` : '';
  };
  const row = (r: Board['rows'][number]) => `<div class="brow ${r.me ? 'me' : ''}"><b class="brank">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</b>
    <span class="bname"><b>${esc(r.playerId)}</b><small>${mixName(r.mixId, r.classId)} · Lv ${r.level}</small></span>
    <b class="bval">${kind === 'wb' ? wbScore(r.wbDamage) : EN ? `Tier ${r.bestTier}` : `第 ${r.bestTier} 級`}</b></div>`;
  const draw = () => {
    const signedIn = !!onlineState().playerId;
    const list = board === 'loading' ? `<p class="note">${tr('載入緊…', 'Loading…')}</p>`
      : !board ? `<p class="note">${tr('連唔到伺服器，遲啲再試', "Can't reach the server, try again later")}</p>`
      : !board.rows.length ? `<p class="note">${kind === 'wb' ? tr('今日仲未有人打世界 Boss', 'Nobody has fought today\'s World Boss yet') : tr('仲未有人上榜', 'No one on this board yet')}</p>`
      : board.rows.map(row).join('');
    const mine = board && board !== 'loading' && board.me && !board.rows.some((r) => r.me) ? `<div class="bsep">…</div>${row(board.me)}` : '';
    el.innerHTML = `<div class="card boardmodal">
      <h2 style="margin:0 0 8px">🏆 ${tr('排行榜', 'Leaderboards')}</h2>
      <div class="seg boardtabs">${([['all', tr('總榜', 'All')], ['class', `${CLASSES[save.classId].icon} ${CLASSES[save.classId].name}`], ['wb', tr('今日世界 Boss', "Today's World Boss")]] as const).map(([k, n]) => `<button data-kind="${k}" class="${kind === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${kind === 'wb' ? `<p class="note" style="text-align:left;margin:0 0 8px">${tr('排法：Boss 等級高先贏，同級再比打咗 Boss 幾多 % 血。', 'Ranked by Boss level first, then by how much of its HP you took.')}</p>` : ''}
      <div class="blist">${list}${mine}</div>
      ${signedIn ? '' : `<p class="note" style="text-align:left">${tr('你仲未上榜：去「設定 → 網上帳號」開個帳號，成績就會自動上傳。', "You're not on the boards yet: make an account in Settings → Online account and your results upload automatically.")}</p><button data-act="tosettings" style="width:100%;margin-bottom:8px">${tr('去開帳號', 'Make an account')}</button>`}
      <button class="ghost" data-act="close" style="width:100%">${tr('關閉', 'Close')}</button></div>`;
  };
  const load = async () => { board = 'loading'; draw(); board = await fetchBoard(kind, save.classId); draw(); };
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.kind) { kind = b.dataset.kind as BoardKind; void load(); return; }
    if (b.dataset.act === 'close') el.remove();
    if (b.dataset.act === 'tosettings') { el.remove(); showHome(ctx, 'settings'); }
  });
  ctx.ui.appendChild(el);
  void load();
}

// ---------- 世界 Boss ----------
function worldBossCard(save: SaveData): string {
  const wb = WORLD_BOSSES[todaysBoss()];
  if (!wbUnlocked(save)) {
    return `<div class="card wbcard locked"><h3>🌍 ${tr('世界 Boss', 'World Boss')}</h3><p class="note" style="text-align:left;margin:0">🔒 ${EN ? `Clear a Tier ${WB_MIN_LEVEL} dungeon to unlock. World Bosses can drop Named Legendaries.` : `通關第 ${WB_MIN_LEVEL} 級地城先開放。打低世界 Boss 有機會攞有名傳說。`}</p></div>`;
  }
  const left = wbTicketsLeft(save);
  const got = NAMED.filter((n) => save.collection[n.id]).length;
  return `<button class="card wbcard" data-act="worldboss">
    <div class="statline"><h3 style="margin:0">🌍 ${tr('今日世界 Boss', "Today's World Boss")}</h3><span class="tickets">${'🎟️'.repeat(left)}${'▫️'.repeat(WB_TICKETS - left)} ${left}/${WB_TICKETS}</span></div>
    <div class="wbname">${wb.icon} ${wb.name}</div>
    <small>${wb.desc} · ${tr('收藏', 'Collection')} ${got}/${NAMED.length}</small>
  </button>`;
}

function showWorldBoss(ctx: HomeCtx): void {
  const save = ctx.getSave();
  const bossId = todaysBoss();
  const wb = WORLD_BOSSES[bossId];
  const maxLv = wbMaxLevel(save);
  let level = Math.min(Math.max(WB_MIN_LEVEL, save.wbLevel), maxLv);
  const el = h(`<div class="screen dim modal"></div>`);
  const draw = () => {
    const keepWbY = el.scrollTop;
    const left = wbTicketsLeft(save);
    const next = WORLD_BOSS_IDS[(WORLD_BOSS_IDS.indexOf(bossId) + 1) % 3];
    el.innerHTML = `
      <div class="card wbmodal">
        <h2 style="margin:0">${wb.icon} ${wb.name}</h2>
        <p class="sub" style="margin:4px 0 10px">${wb.desc}${EN ? `. ${WB_TIME / 60} min limit; the Boss has 3 phases.` : `。限時 ${WB_TIME / 60} 分鐘，Boss 有三個階段。`}</p>
        <div class="tier">
          <button data-lv="-1" ${level <= WB_MIN_LEVEL ? 'disabled' : ''}>◀</button>
          <div style="text-align:center"><div class="val">Lv ${level}</div><small style="color:var(--muted)">${tr('最高', 'Max')} Lv ${maxLv} · ${tr('打死跌有名傳說機會', 'Named Legendary on kill')} ${Math.round(namedChance(level) * 100)}%</small></div>
          <button data-lv="1" ${level >= maxLv ? 'disabled' : ''}>▶</button>
        </div>
        ${tipCard(save, 'worldboss')}
        <p class="note" style="text-align:left">${tr('獎勵跟你打咗幾多血：33% 有銀箱、66% 有兩個銀箱、打死有金箱同機會跌有名傳說。', 'Rewards scale with damage: 33% = Silver Chest, 66% = 2 Silver Chests, kill = Gold Chest + a chance at a Named Legendary.')}</p>
        <h3 style="margin:10px 0 6px">${tr('收藏簿', 'Collection')}</h3>
        <div class="collection">
          ${WORLD_BOSS_IDS.map((b) => `<div class="colrow ${b === bossId ? 'today' : ''}"><span>${WORLD_BOSSES[b].icon}</span>${NAMED.filter((n) => n.boss === b).map((n) => {
            const c = save.collection[n.id] ?? 0;
            return `<div class="colitem ${c ? 'got' : ''}" title="${esc(n.lore)}"><b>${c ? esc(n.name) : tr('？？？', '???')}</b><small>${c ? `${SPECIALS[n.special].name} · ×${c}` : SPECIALS[n.special].name}</small></div>`;
          }).join('')}</div>`).join('')}
        </div>
        <p class="note" style="margin:6px 0 0">${tr('聽日：', 'Tomorrow: ')}${WORLD_BOSSES[next].icon} ${WORLD_BOSSES[next].name}</p>
        <div class="col" style="margin-top:10px">
          <button class="primary" data-act="fight" ${left ? '' : 'disabled'}>${left ? (EN ? `Fight (ticket used on reward, ${left} left)` : `挑戰（領獎勵先扣券，剩 ${left} 張）`) : tr('今日用晒，聽日再嚟', 'No tickets left, back tomorrow')}</button>
          <button class="ghost" data-act="close">${tr('關閉', 'Close')}</button>
        </div>
      </div>`;
    el.scrollTop = keepWbY;
  };
  draw();
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.tipok) { markTip(save, b.dataset.tipok as TipId); draw(); return; }
    if (b.dataset.lv) { level = Math.min(maxLv, Math.max(WB_MIN_LEVEL, level + Number(b.dataset.lv))); draw(); return; }
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.act === 'fight') { el.remove(); ctx.startWorldBoss(level); }
  });
  ctx.ui.appendChild(el);
}

// ---------- 覺醒 ----------
function awakeningBlock(save: SaveData): string {
  const sub = subOf(save), sub2 = sub2Of(save);
  const awk = mixOf(save);
  if (awk) {
    const lock = sub2 ? '' : canAscend(save)
      ? `<button class="primary awaken" data-act="ascend" style="margin-top:8px">🌟 ${tr('可以昇華！揀第三職業', 'Ascend! Pick a third class')}</button>`
      : `<small class="line" style="display:block;margin-top:6px">🔒 ${EN ? `Ascension (third class): account Lv ${ASCEND_LEVEL} and clear Tier ${ASCEND_TIER}. Now Lv ${save.level}, best ${save.highestCleared}.` : `昇華（第三職業）：帳號 Lv ${ASCEND_LEVEL} + 通關第 ${ASCEND_TIER} 級。而家 Lv ${save.level}、最高通關 ${save.highestCleared}。`}</small>`;
    return `<div class="awk"><b>${awk.icon} ${awk.name}</b> <small>${EN ? '' : `${awk.en} · `}${CLASSES[save.classId].name} + ${CLASSES[sub!].name}${sub2 ? ` + ${CLASSES[sub2].name}` : ''}</small>
      <div class="sig">${ico(awk.signature.icon)} <b>${awk.signature.name}</b>${tr('：', ': ')}${awk.signature.desc}${EN ? ` (${awk.signature.cooldown}s cooldown)` : `（冷卻 ${awk.signature.cooldown} 秒）`}</div>
      ${awk.echo ? `<div class="sig">${ico(awk.echo.icon)} <b>${awk.echo.name}</b>${tr('：', ': ')}${awk.echo.desc}</div>` : ''}
      <small>${awk.bonusText}</small>${lock}</div>${!sub2 ? tipCard(save, 'ascend') : ''}`;
  }
  if (canAwaken(save)) return `<button class="primary awaken" data-act="awaken">✨ ${tr('可以覺醒！揀第二職業', 'Awaken! Pick a second class')}</button>`;
  return `<p class="note" style="text-align:left;margin:0 0 10px">🔒 ${EN ? `Clear a Tier ${AWAKEN_TIER} dungeon to pick a second class (Awaken). Best clear: ` : `通關第 ${AWAKEN_TIER} 級地城就可以揀第二職業（覺醒）。而家最高通關：`}${save.highestCleared || tr('未有', 'none')}</p>`;
}

function showAwaken(ctx: HomeCtx): void {
  const save = ctx.getSave();
  const main = save.classId;
  let chosen: ClassId | null = null;
  const el = h(`<div class="screen dim modal"></div>`);
  const draw = () => {
    el.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 4px">✨ ${tr('覺醒：揀第二職業', 'Awaken: pick a second class')}</h2>
        <p class="sub" style="margin:0 0 12px">${tr('主職業：', 'Main class: ')}${CLASSES[main].icon} ${CLASSES[main].name}${tr('。主職業決定點打，第二職業決定加咩。<b>揀咗就唔可以改。</b>', '. Your main class sets how you fight; the second class sets your bonuses. <b>This choice is final.</b>')}</p>
        <div class="col">
          ${CLASS_IDS.map((sub) => {
            const a = awakenedFor(main, sub)!;
            return `<button class="awkopt ${chosen === sub ? 'on' : ''}" data-sub="${sub}">
              <span class="ic">${a.icon}</span>
              <span><b>${a.name}</b> <small>${EN ? '' : `${a.en} · `}${tr('副職業：', 'Second: ')}${CLASSES[sub].name}</small>
              <small class="line">${a.bonusText}</small>
              <small class="line">${ico(a.signature.icon)} ${a.signature.name}${tr('：', ': ')}${a.signature.desc}</small>
              <small class="line">🌟 ${EN ? `Unlocks the ${a.name} Board: Signature skill upgrades + unique passives` : `會開一塊「${a.name}板」：招牌技強化 + 專屬被動`}</small></span>
            </button>`;
          }).join('')}
          <div class="awkfoot">
            <button class="primary" data-act="confirm" ${chosen ? '' : 'disabled'}>${chosen ? (EN ? `Awaken as ${awakenedFor(main, chosen)!.name}` : `確定覺醒做「${awakenedFor(main, chosen)!.name}」`) : tr('揀一個先', 'Pick one first')}</button>
            <button class="ghost" data-act="close">${tr('遲啲先', 'Later')}</button>
          </div>
        </div>
      </div>`;
  };
  draw();
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.sub) { const y = el.scrollTop; chosen = b.dataset.sub as ClassId; draw(); el.scrollTop = y; return; }
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.act === 'confirm' && chosen) {
      awaken(save, chosen);
      writeSave(save);
      el.remove();
      showHome(ctx, 'skills');
      ctx.banner(`${tr('覺醒：', 'Awakened: ')}${awakenedFor(main, chosen)!.name}${tr('！', '!')}`);
    }
  });
  ctx.ui.appendChild(el);
}

function showAscend(ctx: HomeCtx): void {
  const save = ctx.getSave();
  const main = save.classId, sub = subOf(save)!;
  const old = awakenedFor(main, sub)!;
  let chosen: ClassId | null = null;
  const el = h(`<div class="screen dim modal"></div>`);
  const draw = () => {
    const spent = save.boardSpent[`${main}_${sub}`];
    el.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 4px">🌟 ${tr('昇華：揀第三職業', 'Ascend: pick a third class')}</h2>
        <p class="sub" style="margin:0 0 12px">${EN
          ? `${old.icon} ${old.name} becomes a three-class mix. The third class adds a bonus and an Echo after every Signature. <b>This choice is final.</b> The ${old.name} Board is cleared and everything on it comes back${spent ? ` (👻 ${fmt(spent.souls)} · 🔷 ${spent.runes})` : ''}; you get a new, bigger mixed board instead.`
          : `${old.icon} ${old.name}會變成三職業混合。第三職業會加數值，仲有每次招牌技之後嘅追擊。<b>揀咗就唔可以改。</b>「${old.name}板」會清空，用咗嘅材料全數退返${spent ? `（👻 ${fmt(spent.souls)} · 🔷 ${spent.runes}）` : ''}，換一塊新嘅三職業板。`}</p>
        <div class="col">
          ${CLASS_IDS.map((c) => {
            const a = ascendedFor(main, sub, c);
            return `<button class="awkopt ${chosen === c ? 'on' : ''}" data-sub2="${c}">
              <span class="ic">${a.icon}</span>
              <span><b>${a.name}</b> <small>${tr('第三職業：', 'Third: ')}${CLASSES[c].name}</small>
              <small class="line">+ ${ESSENCE_INFO[c].bonusText}</small>
              <small class="line">${ico(a.echo!.icon)} ${a.echo!.name}${tr('：', ': ')}${a.echo!.desc}</small></span>
            </button>`;
          }).join('')}
          <div class="awkfoot">
            <button class="primary" data-act="confirm" ${chosen ? '' : 'disabled'}>${chosen ? (EN ? `Ascend as ${ascendedFor(main, sub, chosen).name}` : `確定昇華做「${ascendedFor(main, sub, chosen).name}」`) : tr('揀一個先', 'Pick one first')}</button>
            <button class="ghost" data-act="close">${tr('遲啲先', 'Later')}</button>
          </div>
        </div>
      </div>`;
  };
  draw();
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.sub2) { const y = el.scrollTop; chosen = b.dataset.sub2 as ClassId; draw(); el.scrollTop = y; return; }
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.act === 'confirm' && chosen) {
      const r = ascend(save, chosen);
      if (!r) return;
      writeSave(save);
      el.remove();
      boardTab = null;
      showHome(ctx, 'skills');
      ctx.banner(`${tr('昇華：', 'Ascended: ')}${ascendedFor(main, sub, chosen).name}${r.souls || r.runes ? `${tr('，退返', ', refunded')} 👻 ${fmt(r.souls)} · 🔷 ${r.runes}` : ''}`);
    }
  });
  ctx.ui.appendChild(el);
}

// ---------- 技能（技能板） ----------
let boardTab: BoardKey | null = null;
let selNode: string | null = null;

const UNLOCK_MSG: Record<UnlockCheck, string> = {
  ok: '', owned: tr('已解鎖', 'Unlocked'), locked: tr('要先解鎖相連嘅格', 'Unlock a linked panel first'), section: '',
  souls: tr('靈魂唔夠', 'Not enough Souls'), runes: tr('符文唔夠', 'Not enough Runes'),
};

function renderSkills(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  const boards = activeBoards(save);
  const board: BoardKey = boardTab && boards.includes(boardTab) ? boardTab : save.classId;
  const pre = copyPrefix(`${board}.`);
  const classOf = (k: BoardKey) => k.slice(copyPrefix(`${k}.`).length) as ClassId;
  // a class picked more than once gets copies of its board: ① ② ③
  const copiesOf = (c: ClassId) => boards.filter((k) => !MIX_BOARD_NODES[k] && classOf(k) === c);
  const twin = boards.some((k) => !MIX_BOARD_NODES[k] && copiesOf(classOf(k)).length > 1);
  const mixDef = (k: BoardKey) => { const [m, a, b] = k.split('_') as ClassId[]; return b ? ascendedFor(m, a, b) : AWAKENED[k]; };
  const bicon = (k: BoardKey) => (MIX_BOARD_NODES[k] ? mixDef(k).icon : CLASSES[classOf(k)].icon);
  const bname = (k: BoardKey) => {
    if (MIX_BOARD_NODES[k]) return `${mixDef(k).name}${tr('板', ' Board')}`;
    const n = copiesOf(classOf(k)).length;
    return `${CLASSES[classOf(k)].name}${tr('板', ' Board')}${n > 1 ? ` ${['①', '②', '③'][copiesOf(classOf(k)).indexOf(k)]}` : ''}`;
  };
  const awk = mixOf(save);
  const hidden = save.board.length - activeBoard(save).length;
  const tiers = sectionTiers(board);
  const nodes = boardNodes(board);
  const owned = boardOwned(save, board);
  const selId = selNode && selNode.startsWith(`${board}.`) ? selNode : null;
  const sel = selId ? nodeById(selId) : null;
  const others = MIX_BOARD_NODES[board] ? [] : copiesOf(classOf(board)).filter((k) => k !== board);
  const otherHas = (id: string) => others.some((k) => boardOwned(save, k).has(id));
  const unit = 32; // px per board unit
  const R = 20.2;
  const size = R * 2 * unit;
  const P = (v: number) => ((v + R) * unit).toFixed(1);

  const links = nodes.map((n) => {
    const p = n.parent ? nodeById(n.parent)! : null;
    const on = owned.has(n.id);
    const next = !on && canUnlock(n, owned, save.highestCleared);
    return `<line x1="${P(p ? p.x : 0)}" y1="${P(p ? p.y : 0)}" x2="${P(n.x)}" y2="${P(n.y)}" class="lk ${on ? 'on' : next ? 'next' : ''}" style="--bc:${BRANCH_COLORS[n.branch]}"/>`;
  }).join('');
  const rings = [1, 2, 3, 4].map((sec) => {
    const r = (sec * 3 + 0.5) * 1.2 + 0.7;
    const lockedSec = save.highestCleared < tiers[sec];
    return `<circle cx="${P(0)}" cy="${P(0)}" r="${(r * unit).toFixed(1)}" class="ring ${lockedSec ? 'locked' : ''}"/>
      ${lockedSec ? `<text x="${P(0)}" y="${P(r + 0.45)}" class="ringlbl">🔒 ${EN ? `Section ${sec + 1}: clear Tier ${tiers[sec]}` : `第 ${sec + 1} 段：通關第 ${tiers[sec]} 級地城`}</text>` : ''}`;
  }).join('');
  const dots = nodes.map((n) => {
    const on = owned.has(n.id);
    const check = unlockCheck(save, pre + n.id);
    const open = !on && canUnlock(n, owned, save.highestCleared);
    const cls = on ? 'on' : open ? (check === 'ok' ? 'open afford' : 'open') : 'dim';
    return `<g class="nd ${cls} ${n.kind} ${sel?.id === n.id ? 'sel' : ''}" data-node="${pre}${n.id}" style="--bc:${BRANCH_COLORS[n.branch]}" transform="translate(${P(n.x)},${P(n.y)})">
      <circle r="${(n.kind === 'skill' ? 0.56 : 0.46) * unit}"/>
      ${icoG(n.icon, (n.kind === 'skill' ? 0.74 : 0.6) * unit) ?? `<text dy="0.36em">${n.icon}</text>`}${on ? `<text class="ok" x="${(n.kind === 'skill' ? 0.42 : 0.34) * unit}" y="${-(n.kind === 'skill' ? 0.34 : 0.26) * unit}">✅</text>` : ''}</g>`;
  }).join('');

  let detail = `<p class="note" style="margin:0">${tr('撳板上面嘅格睇效果同解鎖（遠啲嘅格可以一次過解鎖成條路）。', 'Tap a panel to see its effect and unlock it (far panels can unlock the whole path at once).')}</p>`;
  let plan: ReturnType<typeof pathPlan> = null;
  if (sel) {
    const check = unlockCheck(save, selId!);
    const par = sel.parent ? nodeById(sel.parent) : null;
    plan = pathPlan(save, selId!);
    const msg = check === 'section' ? (EN ? `Clear Tier ${sel.gate} to open Section ${sel.section}` : `要通關第 ${sel.gate} 級地城先開第 ${sel.section} 段`)
      : check === 'locked' && par ? (EN ? `Unlock the panel before it first: ${ico(par.icon)} ${par.name} (${BRANCH_NAMES[par.branch]} #${par.step})` : `要先解鎖佢前面嗰格：${ico(par.icon)} ${par.name}（${BRANCH_NAMES[par.branch]}第 ${par.step} 格）`) : UNLOCK_MSG[check];
    detail = `<div class="statline"><b class="nname">${ico(sel.icon)} ${sel.name}</b><span class="tagb" style="--bc:${BRANCH_COLORS[sel.branch]}">${BRANCH_NAMES[sel.branch]} · ${EN ? `Section ${sel.section}` : `第 ${sel.section} 段`}</span></div>
      <p class="neff">${effectText(sel.fx, sel.board)}</p>
      ${others.length && 'skill' in sel.fx ? `<small class="cmp ${otherHas(sel.id) ? 'up' : ''}" style="display:block;margin:-2px 0 6px">${otherHas(sel.id) ? tr('✨ 另一塊板都有呢個技能：兩塊都解 = 強化版', '✨ Also unlocked on the other board: upgraded version active') : tr('另一塊板都解埋呢個技能，就會變強化版', 'Unlock it on the other board too for an upgraded version')}</small>` : ''}
      <div class="statline"><span class="cost">${owned.has(sel.id) ? `✅ ${tr('已解鎖', 'Unlocked')}` : (() => { const c = panelCost(save, selId!); return `👻 ${fmt(c.souls)}${c.runes ? ` · 🔷 ${c.runes}` : ''}`; })()}</span>
      ${owned.has(sel.id) ? '' : `<button class="primary" data-act="unlock" ${check === 'ok' ? '' : 'disabled'}>${tr('解鎖', 'Unlock')}</button>`}</div>
      ${plan && plan.ids.length > 1 ? `<div class="pathplan">
        <small>${EN ? `To reach this panel: ${plan.ids.length} panels, total 👻 ${fmt(plan.souls)}${plan.runes ? ` · 🔷 ${plan.runes}` : ''}` : `升到呢格：要解 ${plan.ids.length} 格，合共 👻 ${fmt(plan.souls)}${plan.runes ? ` · 🔷 ${plan.runes}` : ''}`}
        ${save.highestCleared < plan.gate ? `<br><span class="down">${EN ? `Needs a Tier ${plan.gate} clear` : `要先通關第 ${plan.gate} 級`}</span>` : save.souls < plan.souls || save.runes < plan.runes ? `<br><span class="down">${EN ? `Short by 👻 ${fmt(Math.max(0, plan.souls - save.souls))}${plan.runes > save.runes ? ` · 🔷 ${plan.runes - save.runes}` : ''}` : `仲差 👻 ${fmt(Math.max(0, plan.souls - save.souls))}${plan.runes > save.runes ? ` · 🔷 ${plan.runes - save.runes}` : ''}`}</span>` : ''}</small>
        <button class="primary" data-act="unlock-path" ${plan.ok ? '' : 'disabled'}>${EN ? `Unlock all ${plan.ids.length}` : `一次過解鎖 ${plan.ids.length} 格`}</button></div>` : ''}
      ${msg && check !== 'owned' ? `<small class="cmp down" style="display:block;margin-top:6px">${msg}</small>` : ''}`;
  }

  const fx = boardEffects(activeBoard(save));
  const skillList = fx.autoSkills.map((s) => `${ico(AUTO_SKILLS[s.id].icon)}${AUTO_SKILLS[s.id].name}${s.level === 2 ? '+' : ''}`).join(tr('、', ', '));
  const resetCostNow = boardResetCost(save, board);

  body.appendChild(h(`
    <div class="col">
      ${tipCard(save, 'skills')}
      <div class="card mats">
        <div><small>${tr('靈魂', 'Souls')}</small><b style="color:var(--soul)">👻 ${fmt(save.souls)}</b></div>
        <div><small>${tr('符文', 'Runes')}</small><b style="color:var(--rune)">🔷 ${fmt(save.runes)}</b></div>
        <div><small>${tr('已解鎖', 'Unlocked')}</small><b>${activeBoard(save).length} <small style="display:inline">/ ${boards.reduce((a, k) => a + boardNodes(k).length, 0)}</small></b></div>
      </div>
      <div class="boardhead">${awk
        ? `<b>${awk.icon} ${awk.name}</b><small>${boards.map(bname).join(' + ')}${twin ? `<br>${tr('同一職業有幾塊板：數值疊加，同一技能兩塊都解 = 強化版', 'Copies of the same class board: stats stack; a skill unlocked on two copies = upgraded version')}` : ''}</small>`
        : `<b>${CLASSES[save.classId].icon} ${CLASSES[save.classId].name}${tr('板', ' Board')}</b><small>${tr('覺醒之後會多一塊第二職業嘅板', 'Awakening adds a board for your second class')}</small>`}</div>
      ${boards.length > 1 ? `<div class="treetabs n${boards.length}">${boards.map((c) => `<button data-board="${c}" class="${board === c ? 'on' : ''} ${MIX_BOARD_NODES[c] ? 'awk' : ''}">${bicon(c)} ${bname(c)} <small>${boardCount(save, c)}</small></button>`).join('')}</div>` : ''}
      <div class="legend">${(['dps', 'tank', 'ctrl'] as Branch[]).map((b) => `<span style="--bc:${BRANCH_COLORS[b]}">● ${BRANCH_NAMES[b]}</span>`).join('')}<span>${tr('大格 = 技能', 'Big panel = skill')}</span></div>
      <div class="boardwrap"><svg class="board" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${rings}${links}
        <g class="nd star" transform="translate(${P(0)},${P(0)})"><circle r="${0.6 * unit}"/><text dy="0.36em">★</text></g>
        ${dots}
      </svg></div>
      ${skillList ? `<p class="note" style="text-align:left;margin:0">${tr('已有技能：', 'Skills: ')}${skillList}</p>` : ''}
      <button data-act="reset-board" ${boardCount(save, board) && save.coins >= resetCostNow ? '' : 'disabled'}>${EN ? `Reset ${bname(board)}, refund all Souls & Runes (${resetCostNow ? `🪙 ${fmt(resetCostNow)}` : 'first one free'})` : `重置${bname(board)}，退返全部靈魂同符文（${resetCostNow ? `🪙 ${fmt(resetCostNow)}` : '第一次免費'}）`}</button>
      <p class="note">${EN
        ? `No skill points: panels cost materials. Each unlock makes every later panel ${Math.round(COST_GROWTH * 100)}% pricier (now ×${(1 + COST_GROWTH * activeBoard(save).length).toFixed(2)}), so you can't fill all ${boards.reduce((a, k) => a + boardNodes(k).length, 0)} panels on your ${boards.length} boards. Pick your build.${hidden ? `<br>${hidden} panels unlocked on other class boards are inactive; switch back to that class to use them.` : ''}`
        : `冇技能點，淨係用材料解。每解 1 格，之後所有格貴 ${Math.round(COST_GROWTH * 100)}%（而家 ×${(1 + COST_GROWTH * activeBoard(save).length).toFixed(2)}），所以你 ${boards.length} 塊板 ${boards.reduce((a, k) => a + boardNodes(k).length, 0)} 格點唔晒，要揀你鍾意嘅 build。${hidden ? `<br>其他職業板仲有 ${hidden} 格已解鎖，而家冇效；轉返嗰個職業就會再生效。` : ''}`}</p>
      <div class="card ndetail sheet">${detail}</div>
    </div>`));


  // centre the board the first time it is shown
  const wrap = body.querySelector('.boardwrap') as HTMLElement;
  requestAnimationFrame(() => {
    if (boardScroll[board]) { wrap.scrollLeft = boardScroll[board]![0]; wrap.scrollTop = boardScroll[board]![1]; }
    else { wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; wrap.scrollTop = (wrap.scrollHeight - wrap.clientHeight) / 2 - 60; }
  });
  wrap.addEventListener('scroll', () => { boardScroll[board] = [wrap.scrollLeft, wrap.scrollTop]; });

  body.addEventListener('click', (ev) => {
    const t = ev.target as Element;
    const nd = t.closest('[data-node]') as HTMLElement | null;
    if (nd) { selNode = nd.dataset.node!; showHome(ctx); return; }
    const b = t.closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.board) { boardTab = b.dataset.board as BoardKey; selNode = null; showHome(ctx); return; }
    if (b.dataset.act === 'unlock' && sel && selId && unlockNode(save, selId)) {
      writeSave(save);
      showHome(ctx);
      ctx.banner(`${tr('解鎖：', 'Unlocked: ')}${sel.name}`, sel.icon);
      return;
    }
    if (b.dataset.act === 'unlock-path' && sel && selId) {
      const n = unlockPath(save, selId);
      if (n) { writeSave(save); showHome(ctx); ctx.banner(EN ? `Unlocked ${n} panels up to ${sel.name}` : `解鎖咗 ${n} 格，去到 ${sel.name}`, sel.icon); }
      return;
    }
    if (b.dataset.act === 'reset-board') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = EN ? `Tap again to reset ${bname(board)}` : `再撳一次確認重置${bname(board)}`; return; }
      if (resetBoard(save, board)) { writeSave(save); selNode = null; showHome(ctx); ctx.banner(EN ? `${bname(board)} reset, materials refunded` : `${bname(board)}已重置，材料已退返`); }
    }
  });
}
const boardScroll: Partial<Record<BoardKey, [number, number]>> = {};

/** A note when a tier brings in a new enemy type or elites. */
function newFoe(t: number): string {
  const n: string[] = [];
  if (t === ENEMY_UNLOCKS.bomber.tier) n.push(tr('新敵人：自爆怪', 'New: Bombers'));
  if (t === ENEMY_UNLOCKS.shield.tier) n.push(tr('新敵人：盾兵', 'New: Shieldbearers'));
  if (t === ENEMY_UNLOCKS.healer.tier) n.push(tr('新敵人：治療師', 'New: Healers'));
  if (t === ELITES.fromTier) n.push(tr('精英怪出現', 'Elites appear'));
  if (DUNGEON.gateBossHp > 1 && t % DUNGEON.gateEvery === 0) n.push(tr('守關地城：Boss 特別強', 'Gate dungeon: tougher bosses'));
  return n.length ? ` · ⚠️ ${n.join(' · ')}` : '';
}

/** Gear tab: what your undead are, from the traits on your worn gear (only if you have any undead). */
/** 骨弓 + 骨弓 + 骨弓 → 骨弓 ×3 */
const needText = (needs: SpecialId[]) => [...new Set(needs)].map((n) => { const k = needs.filter((x) => x === n).length; return SPECIALS[n].name + (k > 1 ? ` ×${k}` : ''); }).join(' + ');
function undeadLine(save: SaveData): string {
  const r = runSetup(save);
  const sp = new Set(r.specials ?? []);
  const hasUndead = save.classId === 'necro' || subOf(save) === 'necro' || r.skills?.autoSkills.some((a) => a.id === 'raiseDead');
  const traits = ([...UNDEAD_TRAITS, 'boneBurst'] as const).filter((t) => sp.has(t));
  if (!hasUndead && !traits.length) return '';
  const all = r.specials ?? []; // keeps repeats: the same trait twice or three times stacks
  const cnt = (t: SpecialId) => all.filter((x) => x === t).length;
  const name = undeadName({ tank: sp.has('utTank'), ranged: sp.has('utRanged'), caster: sp.has('utCaster'), wraith: sp.has('utWraith'), burst: sp.has('boneBurst') }, all);
  const combos = activeCombos(all);
  return `<div class="undeadline">💀 ${tr('你嘅亡靈：', 'Your Undead: ')}<b>${name}</b><small>${tr('跟你嘅 HP、攻擊、攻速、移速、防禦、荊棘同關卡入面嘅加成一齊變強', 'They share your HP, ATK, attack speed, move speed, DEF, Thorns and in-run bonuses')}</small>${traits.length ? `<small>${traits.map((t) => cnt(t) > 1 ? `${SPECIALS[t].name} ×${cnt(t)}（${STACK_TEXT[t] ?? ''}${cnt(t) > MAX_STACK ? tr(`；最多計 ${MAX_STACK} 件`, `; only ${MAX_STACK} count`) : ''}）` : SPECIALS[t].name).join(' + ')}</small>` : `<small>${tr('傳說裝備嘅骨特性可以改變亡靈（可以疊；某啲組合會變成新嘅亡靈）', 'Bone traits on legendary gear change your Undead (they stack; some combos create new Undead)')}</small>`}${combos.map((c) => `<small class="combo">✨ <b>${isMax(c, all) ? tr('極·', 'Max ') : ''}${c.name}</b>（${needText(c.needs)}）：${c.desc}${c.power ? tr(`，亡靈傷害 ×${c.power}`, `, Undead damage ×${c.power}`) : ''}</small>`).join('')}<details class="combolist"><summary>${tr('所有骨組合', 'All bone combos')}</summary><small>${tr(`同一種骨特性最多計 ${MAX_STACK} 件。三件一樣係純組合；裝夠 ${MAX_STACK} 件變「極」，亡靈傷害再 ×${MAX_POWER}`, `Up to ${MAX_STACK} copies of one bone trait count. Three of a kind make a pure form; ${MAX_STACK} make its Max form (Undead damage ×${MAX_POWER} more)`)}</small>${BONE_COMBOS.map((c) => `<small>${combos.includes(c) ? '✅' : '▫️'} <b>${c.name}</b>：${needText(c.needs)} → ${c.desc}${c.power ? tr(`，亡靈傷害 ×${c.power}`, `, Undead damage ×${c.power}`) : ''}</small>`).join('')}</details></div>`;
}

// ---------- 終極技 ----------
const ultAffordable = (save: SaveData) => ULT_IDS.some((u) => { const c = ultCost(save, u); return c !== null && save.crystals >= c && (!save.ults[u] || save.ultEquip.includes(u)); });

function renderUlt(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  const slots = Array.from({ length: ULT_SLOTS }, (_, i) => save.ultEquip[i]);
  body.appendChild(h(`
    <div class="col">
      <div class="card ulthead">
        <div><small>${tr('靈晶', 'Crystals')}</small><b style="color:var(--crystal)">💎 ${fmt(save.crystals)}</b></div>
        <div class="ultslots">${slots.map((u, i) => `<button class="uslot ${u ? 'on' : ''}" data-uslot="${i}" aria-label="${u ? ULT[u].name : tr('空格', 'Empty slot')}">${u ? ico(ULT[u].icon) : '＋'}</button>`).join('')}</div>
      </div>
      ${tipCard(save, 'ult')}
      <p class="note" style="margin:0;text-align:left">${EN ? `Screen-clearing skills for any class; equip up to ${ULT_SLOTS}. Ultimate hits can crit; Lv ${ULT_LIMIT_LEVEL} unlocks a Limit effect, max Lv ${ULT_MAX_LEVEL}. 💎 Crystals: Mini-bosses 1, Bosses 3 (double in gate dungeons), elites sometimes 1, first clear of a tier +3 (gate tiers +15), and World Bosses. Your Undead can trigger on-hit Ultimates too, at 35% of your chance.` : `全場清怪技能，任何職業都用得，最多同時裝 ${ULT_SLOTS} 個。終極技傷害會暴擊；Lv ${ULT_LIMIT_LEVEL} 解鎖「極限」效果，最高 Lv ${ULT_MAX_LEVEL}。💎 靈晶：小 Boss 1、Boss 3（守關地城雙倍）、精英怪有機會跌 1、首次通關每級 +3（守關級 +15），仲有世界 Boss。亡靈打中敵人都可以觸發攻擊型終極技，機率係你自己嘅 35%。`}</p>
      ${ULT_IDS.map((id) => {
        const lv = save.ults[id] ?? 0;
        const cost = ultCost(save, id);
        const on = save.ultEquip.includes(id);
        const full = !on && save.ultEquip.length >= ULT_SLOTS;
        return `<div class="card ultcard ${on ? 'on' : ''} ${lv ? '' : 'locked'}">
          <div class="statline"><b class="uname">${ico(ULT[id].icon)} ${ULT[id].name}</b><span class="ulv">${lv ? `Lv ${lv}/${ULT_MAX_LEVEL}` : tr('未解鎖', 'Locked')}</span></div>
          <p class="udesc">${ultDesc(id, Math.max(1, lv))}</p>
          ${lv && lv < ULT_MAX_LEVEL ? `<small class="unext">${tr('下一級：', 'Next: ')}${ultDesc(id, lv + 1)}</small>` : ''}
          <small class="unext" style="${lv >= ULT_LIMIT_LEVEL ? 'color:var(--gold)' : 'opacity:.7'}">${lv >= ULT_LIMIT_LEVEL ? '✨ ' : `🔒 Lv ${ULT_LIMIT_LEVEL} · `}${ULT_LIMIT[id]}</small>
          <div class="ubtns">
            ${cost !== null ? `<button class="primary" data-ult-buy="${id}" ${save.crystals >= cost ? '' : 'disabled'}>${lv ? tr('升級', 'Level up') : tr('解鎖', 'Unlock')} 💎 ${cost}</button>` : `<span class="note" style="margin:0">${tr('已經滿級', 'Max level')}</span>`}
            ${lv ? `<button data-ult-eq="${id}" ${full ? 'disabled' : ''}>${on ? tr('卸下', 'Unequip') : full ? tr('格滿咗', 'Slots full') : tr('裝備', 'Equip')}</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`));
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.ultBuy) {
      const id = b.dataset.ultBuy as UltId;
      const first = !save.ults[id];
      if (ultBuy(save, id)) { writeSave(save); showHome(ctx); ctx.banner(`${ULT[id].name} ${first ? tr('解鎖咗', 'unlocked') : `${tr('升到', 'now')} Lv ${save.ults[id]}`}`, ULT[id].icon); }
    }
    if (b.dataset.ultEq && ultToggle(save, b.dataset.ultEq as UltId)) { writeSave(save); showHome(ctx); }
    if (b.dataset.uslot) showUltSlot(ctx, Number(b.dataset.uslot));
  });
}

/** Tap a slot at the top of the Ultimates tab: pick what goes in it. */
function showUltSlot(ctx: HomeCtx, i: number): void {
  const save = ctx.getSave();
  const cur = save.ultEquip[i] ?? null;
  const owned = ULT_IDS.filter((id) => save.ults[id]);
  const el = h(`<div class="screen dim modal"><div class="card coopmodal">
    <h2 style="margin:0 0 4px">${tr(`第 ${i + 1} 格`, `Slot ${i + 1}`)}</h2>
    <p class="sub" style="margin:0 0 10px">${owned.length ? tr('揀一個終極技放入呢格。已經裝咗喺第二格嘅會同呢格對調。', 'Pick an Ultimate for this slot. One already in another slot swaps places.') : tr('你仲未解鎖任何終極技：喺下面用 💎 靈晶解鎖。', 'No Ultimates unlocked yet: unlock one below with 💎 Crystals.')}</p>
    <div class="blist">${owned.map((id) => {
      const where = save.ultEquip.indexOf(id);
      return `<button class="brow ${id === cur ? 'me' : ''}" data-pick="${id}"><b class="brank">${ico(ULT[id].icon)}</b><span class="bname"><b>${ULT[id].name}</b><small>Lv ${save.ults[id]}${where >= 0 && id !== cur ? ` · ${tr(`而家喺第 ${where + 1} 格`, `now in slot ${where + 1}`)}` : ''}</small></span>${id === cur ? '<b class="bval">✓</b>' : ''}</button>`;
    }).join('')}</div>
    ${cur ? `<button data-pick="" style="width:100%;margin-bottom:8px">${tr('清空呢格', 'Empty this slot')}</button>` : ''}
    <button class="ghost" data-act="close" style="width:100%">${tr('關閉', 'Close')}</button></div></div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.pick !== undefined) {
      if (ultSetSlot(save, i, (b.dataset.pick || null) as UltId | null)) { writeSave(save); el.remove(); showHome(ctx); }
    }
  });
  ctx.ui.appendChild(el);
}

// ---------- 裝備 ----------
function itemRow(save: SaveData, it: Item, opts: { showSlot?: boolean; selectable?: boolean; selected?: boolean } = {}): string {
  const usable = usableNow(save, it);
  const eq = isEquipped(save, it);
  const kind = it.weapon ? (WEAPONS[it.weapon].twoHanded ? tr('雙手武器', '2H weapon') : tr('武器', 'Weapon')) : SLOT_NAMES[it.slot];
  return `<button class="item ${usable || opts.selectable ? '' : 'unusable'} ${opts.selected ? 'sel' : ''}" data-item="${esc(it.id)}" style="--rc:${RARITY_COLORS[it.rarity]}">
    ${opts.selectable ? `<span class="chk">${opts.selected ? '☑' : '☐'}</span>` : ''}
    <span class="ic">${itemIcon(it)}</span>
    <span class="nm"><b>${it.locked ? '🔒 ' : ''}${esc(itemName(it))}</b><small>${opts.showSlot ? `${kind} · ` : ''}${lineText(upgradedMain(it))}${it.special ? ` · ✨${SPECIALS[it.special].name}` : ''}${it.proc ? ` · ${PROC_SKILLS[it.proc.id].icon}${PROC_SKILLS[it.proc.id].name} ${it.proc.value}%` : ''}${it.affixes.length ? ` · ${tr('詞綴', 'Affixes')} ${it.affixes.length}` : ''}${it.weapon ? ` · ${weaponUserIcons(it.weapon)}` : ''}${!usable && !opts.selectable ? ` · ${tr('而家用唔到', "Can't use now")}` : ''}</small></span>
    ${eq ? `<span class="tag">${tr('已裝備', 'Equipped')}</span>` : `<span class="lv">Lv${it.tier}</span>`}
  </button>`;
}

function slotLabel(save: SaveData, slot: Slot): string {
  if (!isWeaponSlot(slot)) return SLOT_NAMES[slot];
  const ts = weaponOptions(save.classId, subOf(save), sub2Of(save))[slot];
  return ts.length ? ts.map((t) => `${WEAPONS[t].name}${WEAPONS[t].twoHanded ? tr('（雙手）', ' (2H)') : ''}`).join(' / ') : '—';
}

const salvSel = new Set<Rarity>(['common']);

function renderGear(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  // the bag lists what the current character is NOT wearing
  const bag = save.items.filter((i) => !isEquipped(save, i)).sort((a, b) =>
    Number(usableNow(save, b)) - Number(usableNow(save, a))
    || RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity)
    || itemScore(b) - itemScore(a));
  const toSell = save.items.filter((i) => salvSel.has(i.rarity) && !isProtected(save, i));
  const sellValue = toSell.reduce((a, i) => a + salvageValue(i), 0);
  const awk = mixOf(save);
  const mainNow = equippedIn(save, 'mainWeapon');
  const atkKind = (mainNow?.weapon ? attackFor(mainNow.weapon, save.classId) : null) ?? CLASSES[save.classId].attack;
  const arrowNow = save.arrowType[save.classId] ?? 'normal';
  const spellNow = save.spellType[save.classId] ?? 'fire';
  body.appendChild(h(`
    <div class="col">
      ${tipCard(save, 'gear')}
      ${atkKind === 'arrow' || atkKind === 'shadow' || atkKind === 'fireball' ? tipCard(save, 'attack') : ''}
      <div class="card">
        <h3>${awk ? `${awk.icon} ${awk.name}` : `${CLASSES[save.classId].icon} ${CLASSES[save.classId].name}`} · ${tr('裝備', 'Gear')}</h3>
        ${statSummary(save)}
        <div class="undeadline">⚔️ ${tr('攻擊方式：', 'Attack: ')}<b>${ATTACK_NAMES[atkKind === 'shadow' && save.necroMode === 'summon' ? 'summon' : atkKind]}</b><small>${tr('由主武器決定（劍 / 槍 = 斬擊（弓手揸槍 = 擲槍）、弓 = 射箭、法杖 = 火球（死靈 = 暗影彈）、鐮刀 = 橫掃）', 'Set by your main-hand weapon (sword / spear = slash (an Archer throws the spear), bow = arrows, staff = fireballs (shadow bolts for a Necromancer), scythe = sweep)')}</small>
          ${atkKind === 'arrow' ? `<div class="arrowpick">${ARROW_TYPES.map((a) => `<button data-arrow="${a}" class="${arrowNow === a ? 'on' : ''}">${ARROWS[a].icon} ${ARROWS[a].name}</button>`).join('')}</div><small>${ARROWS[arrowNow].icon} <b>${ARROWS[arrowNow].name}</b>${tr('：', ': ')}${ARROWS[arrowNow].desc}</small>` : ''}
          ${atkKind === 'shadow' ? `<div class="arrowpick">${(['bolt', 'summon'] as NecroMode[]).map((a) => `<button data-necro="${a}" class="${save.necroMode === a ? 'on' : ''}">${NECRO_MODES[a].icon} ${NECRO_MODES[a].name}</button>`).join('')}</div><small>${NECRO_MODES[save.necroMode].icon} <b>${NECRO_MODES[save.necroMode].name}</b>${tr('：', ': ')}${NECRO_MODES[save.necroMode].desc}</small>` : ''}
          ${atkKind === 'fireball' ? `<div class="arrowpick">${SPELL_TYPES.map((a) => `<button data-spell="${a}" class="${spellNow === a ? 'on' : ''}">${SPELLS[a].icon} ${SPELLS[a].name}</button>`).join('')}</div><small>${SPELLS[spellNow].icon} <b>${SPELLS[spellNow].name}</b>${tr('：', ': ')}${SPELLS[spellNow].desc}</small>` : ''}</div>
        ${undeadLine(save)}
        <div class="slots">
          ${EQUIP_SLOTS.map((slot) => {
            const it = equippedIn(save, slot);
            if (it) return itemRow(save, it);
            if (slot === 'subWeapon' && offHandBlocked(save)) return `<div class="item empty"><span class="ic">🔒</span><span class="nm"><b>${tr('副武器', 'Off-hand weapon')}</b><small>${EN ? `Used by 2H weapon (${WEAPONS[mainNow!.weapon!].name})` : `雙手武器佔用（${WEAPONS[mainNow!.weapon!].name}）`}</small></span></div>`;
            return `<div class="item empty"><span class="ic">${SLOT_ICONS[itemSlotOf(slot)]}</span><span class="nm"><b>${EQUIP_NAMES[slot]}</b><small>${EN ? `Empty (${slot === 'ring' || slot === 'ring2' ? 'Ring' : slotLabel(save, slot)})` : `未裝備（${slot === 'ring' || slot === 'ring2' ? '戒指' : slotLabel(save, slot)}）`}</small></span></div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="statline"><h3 style="margin:0">${tr('背包', 'Bag')} ${save.items.length}/${INVENTORY_MAX}</h3>
          <button data-act="trade" style="font-size:13px;padding:6px 10px">🔁 ${tr('交換', 'Trade')}</button></div>
        <div class="sellrow">
          <span>${tr('分解：', 'Salvage:')}</span>
          ${RARITIES.map((r) => `<button data-sell="${r}" class="${salvSel.has(r) ? 'on' : ''}" style="--rc:${RARITY_COLORS[r]}">${RARITY_NAMES[r]}</button>`).join('')}
        </div>
        <button data-act="salvage-sel" class="${salvSel.has('epic') || salvSel.has('legendary') ? 'danger' : ''}" ${toSell.length ? '' : 'disabled'} style="font-size:13px;padding:8px 10px;width:100%;margin-top:6px">${toSell.length ? (EN ? `Salvage ${toSell.length} selected (🪙 ${fmt(sellValue)})` : `分解所選 ${toSell.length} 件（🪙 ${fmt(sellValue)}）`) : tr('揀咗嘅稀有度冇嘢可以分解', 'Nothing to salvage at these rarities')}</button>
        <small class="note" style="display:block;margin-top:4px">${tr('鎖定同已裝備嘅唔會分解', 'Locked and equipped items are kept')}</small>
        <div class="bag">${bag.length ? bag.map((it) => itemRow(save, it, { showSlot: true })).join('') : `<p class="note">${tr('背包係空嘅。通關地城開寶箱就有裝備。', 'Bag is empty. Clear dungeons and open chests for gear.')}</p>`}</div>
      </div>
    </div>`));
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.item) { const it = itemById(save, b.dataset.item); if (it) showItem(ctx, it); }
    else if (b.dataset.act === 'trade') showTrade(ctx);
    else if (b.dataset.necro) { save.necroMode = b.dataset.necro as NecroMode; writeSave(save); showHome(ctx); }
    else if (b.dataset.spell) { save.spellType[save.classId] = b.dataset.spell as SpellType; writeSave(save); showHome(ctx); }
    else if (b.dataset.arrow) { save.arrowType[save.classId] = b.dataset.arrow as ArrowType; writeSave(save); showHome(ctx); }
    else if (b.dataset.sell) {
      const r = b.dataset.sell as Rarity;
      if (salvSel.has(r)) salvSel.delete(r); else salvSel.add(r);
      showHome(ctx);
    } else if (b.dataset.act === 'salvage-sel') {
      if ((salvSel.has('epic') || salvSel.has('legendary')) && b.dataset.confirm !== '1') {
        b.dataset.confirm = '1';
        b.textContent = EN ? `Includes Epic / Legendary. Tap again to salvage ${toSell.length}` : `包括史詩 / 傳說，再撳一次確認分解 ${toSell.length} 件`;
        return;
      }
      const got = salvage(save, toSell.map((i) => i.id));
      writeSave(save);
      showHome(ctx);
      ctx.banner(EN ? `Salvaged ${toSell.length} for 🪙 ${fmt(got)}` : `分解咗 ${toSell.length} 件，得到 🪙 ${fmt(got)}`);
    }
  });
}

function showItem(ctx: HomeCtx, it: Item, note = ''): void {
  const save = ctx.getSave();
  const slots = slotsFor(save, it);
  const eqSlot = EQUIP_SLOTS.find((sl) => equippedIn(save, sl) === it);
  let compare = '';
  if (!eqSlot && slots.length) {
    // compare with an empty slot if there is one, otherwise the weakest of the slots it can go in (two rings)
    const worn = slots.map((sl) => equippedIn(save, sl));
    const current = worn.some((w) => !w) ? undefined : worn.reduce((a, b) => (itemScore(b!) < itemScore(a!) ? b : a));
    const cmpSlot = current ? slots[worn.indexOf(current)] : slots[0];
    if (current) {
      const d = Math.round((itemScore(it) - itemScore(current)) * 10) / 10;
      compare = `<p class="cmp ${d >= 0 ? 'up' : 'down'}">${EN ? `vs current ${EQUIP_NAMES[cmpSlot]} (${esc(itemName(current))}): ` : `對比而家${EQUIP_NAMES[cmpSlot]}（${esc(itemName(current))}）：`}${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}${tr(' 分', ' pts')}</p>`;
    } else compare = `<p class="cmp up">${tr('呢個位而家冇裝備', 'Slot is empty')}</p>`;
  }
  const cost = upgradeCost(it);
  const chance = upgradeChance(it);
  const rcost = rerollCost(it);
  const kind = it.weapon ? (EN ? `${WEAPONS[it.weapon].twoHanded ? '2H ' : ''}Weapon` : `${WEAPONS[it.weapon].twoHanded ? '雙手' : ''}武器`) : SLOT_NAMES[it.slot];
  const el = h(`
    <div class="screen dim modal">
      <div class="card itemcard" style="--rc:${RARITY_COLORS[it.rarity]}">
        <div class="statline"><b class="iname">${itemIcon(it)} ${esc(itemName(it))}</b><span class="lv">Lv${it.tier}</span></div>
        <small style="color:var(--muted)">${RARITY_NAMES[it.rarity]} · ${kind} · ${tr('評分', 'Score')} ${itemScore(it)}${it.locked ? ` · 🔒 ${tr('已鎖定', 'Locked')}` : ''}</small>
        <ul class="lines">
          <li class="main">${lineText(upgradedMain(it))}${it.plus ? ` <small>${EN ? `(+${it.plus} upgrade)` : `（+${it.plus} 強化）`}</small>` : ''}</li>
          ${it.affixes.map((a, i) => `<li>${lineText(a)}${canReroll(it) ? ` <button class="mini" data-reroll="${i}" ${save.coins < rcost ? 'disabled' : ''}>🎲 🪙${fmt(rcost)}</button>` : ''}</li>`).join('')}
          ${it.proc ? `<li class="proc">${procText(it.proc)}</li>` : ''}
          ${it.special ? `<li class="special">✨ ${SPECIALS[it.special].name}${tr('：', ': ')}${SPECIALS[it.special].desc}</li>` : ''}
        </ul>
        ${it.weapon ? `<p class="note" style="text-align:left;margin:6px 0">🧭 ${tr('邊個用得：', 'Who can use it: ')}${weaponUseText(it.weapon)}${WEAPONS[it.weapon].twoHanded ? tr('（雙手，會佔用副手）', ' (two-handed: takes the off hand)') : ''}<br><small>${tr('混合職業：入面任何一個職業用得就用得；攻擊方式跟主職業計', 'Mixed classes: usable if any of your classes can use it; the attack follows your main class')}</small></p>` : ''}
        ${note ? `<p class="cmp ${note.startsWith('✅') ? 'up' : 'down'}">${note}</p>` : ''}
        ${compare}
        ${!slots.length ? `<p class="cmp down">${tr('而家嘅職業用唔到呢件，可以拎去交換', "Your class can't use this. Trade it away.")}</p>` : ''}
        <div class="col">
          ${eqSlot ? `<button data-act="unequip">${tr('卸下', 'Unequip')}</button>` : slots.map((sl) => `<button class="primary" data-equip="${sl}">${tr('裝備', 'Equip')}${slots.length > 1 ? (EN ? ` (${EQUIP_NAMES[sl]}${equippedIn(save, sl) ? ' · swap' : ''})` : `（${EQUIP_NAMES[sl]}${equippedIn(save, sl) ? ' · 換走' : ''}）`) : ''}</button>`).join('')}
          <button data-act="upgrade" ${it.plus >= MAX_PLUS || save.coins < cost ? 'disabled' : ''}>${it.plus >= MAX_PLUS ? tr('已經強化到最高', 'Max upgrade') : (EN ? `Upgrade +${it.plus + 1} (🪙 ${fmt(cost)}${chance < 1 ? ` · ${Math.round(chance * 100)}% chance` : ''})` : `強化 +${it.plus + 1}（🪙 ${fmt(cost)}${chance < 1 ? ` · 成功率 ${Math.round(chance * 100)}%` : ''}）`)}</button>
          ${it.fails ? `<small class="note" style="margin:-4px 0 0">${EN ? `Failed ${it.fails} in a row: next try +${it.fails * 10}% chance` : `已連續失敗 ${it.fails} 次，下次成功率 +${it.fails * 10}%`}</small>` : ''}
          <button data-act="lock">${it.locked ? `🔓 ${tr('解除鎖定', 'Unlock')}` : `🔒 ${tr('鎖定（唔會俾分解 / 交換）', 'Lock (no Salvage / Trade)')}`}</button>
          ${isProtected(save, it) ? '' : `<button data-act="salvage" class="danger">${EN ? `Salvage (🪙 ${fmt(salvageValue(it))})` : `分解（得 🪙 ${fmt(salvageValue(it))}）`}</button>`}
          <button data-act="close" class="ghost">${tr('關閉', 'Close')}</button>
        </div>
      </div>
    </div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) { if (ev.target === el) el.remove(); return; }
    const act = b.dataset.act;
    if (act === 'close') { el.remove(); return; }
    let reopen = false;
    let msg = '';
    if (b.dataset.equip) equip(save, it, b.dataset.equip as EquipSlot);
    if (act === 'unequip' && eqSlot) unequip(save, eqSlot);
    if (act === 'lock') { it.locked = !it.locked; reopen = true; }
    if (act === 'upgrade') {
      const r = upgrade(save, it);
      reopen = true;
      msg = r === 'ok' ? `✅ ${tr('強化成功！', 'Upgraded! ')}+${it.plus}` : r === 'fail' ? (EN ? `❌ Upgrade failed. Next try +${it.fails * 10}% chance` : `❌ 強化失敗，下次成功率 +${it.fails * 10}%`) : '';
    }
    if (b.dataset.reroll !== undefined) { reroll(save, it, Number(b.dataset.reroll)); reopen = true; msg = `✅ ${tr('詞綴已重抽', 'Affix rerolled')}`; }
    if (act === 'salvage') salvage(save, [it.id]);
    writeSave(save);
    el.remove();
    showHome(ctx);
    if (reopen && save.items.includes(it)) showItem(ctx, it, msg);
  });
  ctx.ui.appendChild(el);
}

// ---------- 交換 ----------
const CAT_NAMES: Record<TradeCat, string> = { weapon: tr('武器', 'Weapons'), armour: tr('防具', 'Armour'), accessory: tr('飾品', 'Accessories') };
function showTrade(ctx: HomeCtx): void {
  const save = ctx.getSave();
  let cat: TradeCat = 'weapon';
  const picked = new Set<string>();
  let target: ItemKind | null = null;
  const el = h(`<div class="screen dim modal"></div>`);
  const draw = () => {
    const pool = save.items.filter((i) => !isProtected(save, i) && tradeCat(i) === cat)
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.tier - b.tier);
    const inputs = pool.filter((i) => picked.has(i.id));
    const w = inputs.length ? tradeRarityWeights(inputs) : null;
    const total = w ? RARITIES.reduce((a, r) => a + Math.max(0, w[r]), 0) : 1;
    const targets: [string, string, ItemKind][] = cat === 'weapon'
      ? WEAPON_TYPES.map((t) => [t, `${WEAPONS[t].icon} ${WEAPONS[t].name} <small>${weaponUserIcons(t)}</small>`, { weapon: t }])
      : (cat === 'armour' ? ARMOUR_SLOTS : ACCESSORY_SLOTS).map((s) => [s, `${SLOT_ICONS[s]} ${SLOT_NAMES[s]}`, { armour: s }]);
    const opts = weaponOptions(save.classId, subOf(save), sub2Of(save));
    const tKey = (k: ItemKind) => ('weapon' in k ? k.weapon : k.armour);
    // picking an item re-draws the popup: keep both the popup and the item list where they were
    const keepY = el.scrollTop, keepBag = (el.querySelector('.tradebag') as HTMLElement | null)?.scrollTop ?? 0, sameCat = el.dataset.cat === cat;
    el.dataset.cat = cat;
    el.innerHTML = `
      <div class="card trade">
        <h2 style="margin:0 0 4px">🔁 ${tr('交換', 'Trade')}</h2>
        <p class="sub" style="margin:0 0 10px">${EN ? `Trade ${TRADE_COUNT} unwanted ${CAT_NAMES[cat].toLowerCase()} for 1 of your choice. Higher rarity in = better odds out. Locked and equipped items are hidden.` : `揀 ${TRADE_COUNT} 件唔要嘅${CAT_NAMES[cat]}，換 1 件你指定嘅。放入去嘅稀有度愈高，出好嘢機會愈大。鎖定同已裝備嘅唔會出現。`}</p>
        <div class="treetabs">${(['weapon', 'armour', 'accessory'] as TradeCat[]).map((c) => `<button data-cat="${c}" class="${cat === c ? 'on' : ''}">${CAT_NAMES[c]}</button>`).join('')}</div>
        <h3 style="margin:12px 0 6px">${EN ? `1. Pick ${TRADE_COUNT} (${inputs.length}/${TRADE_COUNT})` : `1. 揀 ${TRADE_COUNT} 件（${inputs.length}/${TRADE_COUNT}）`}</h3>
        <div class="bag tradebag">${pool.length ? pool.map((it) => itemRow(save, it, { showSlot: true, selectable: true, selected: picked.has(it.id) })).join('') : `<p class="note">${tr('冇可以交換嘅裝備', 'No gear to trade')}</p>`}</div>
        <h3 style="margin:12px 0 6px">${tr('2. 想要咩', '2. Pick what you want')}</h3>
        <div class="targets">${targets.map(([k, label, kind]) => {
          const mine = 'weapon' in kind && (opts.mainWeapon.includes(kind.weapon) || opts.subWeapon.includes(kind.weapon));
          return `<button data-target="${k}" class="${target && tKey(target) === k ? 'on' : ''} ${mine ? 'mine' : ''}">${label}</button>`;
        }).join('')}</div>
        ${cat === 'weapon' ? `<p class="note" style="margin:6px 0 0">${tr('金邊 = 你而家用得著嘅武器', 'Gold border = usable by your class')}</p>` : ''}
        ${w ? `<p class="odds">${tr('出貨機率：', 'Odds: ')}${RARITIES.map((r) => `<span style="color:${RARITY_COLORS[r]}">${RARITY_NAMES[r]} ${Math.round((Math.max(0, w[r]) / total) * 100)}%</span>`).join(' · ')}</p>` : ''}
        <div class="col" style="margin-top:10px">
          <button class="primary" data-act="go" ${inputs.length === TRADE_COUNT && target ? '' : 'disabled'}>${tr('交換', 'Trade')}</button>
          <button class="ghost" data-act="close">${tr('關閉', 'Close')}</button>
        </div>
      </div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-target]').forEach((b) => { b.onclick = () => { target = targets.find((t) => t[0] === b.dataset.target)![2]; draw(); }; });
    el.scrollTop = keepY;
    if (sameCat) { const bag = el.querySelector('.tradebag') as HTMLElement | null; if (bag) bag.scrollTop = keepBag; }
  };
  draw();
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.cat) { cat = b.dataset.cat as TradeCat; picked.clear(); target = null; draw(); return; }
    if (b.dataset.item) {
      const id = b.dataset.item;
      if (picked.has(id)) picked.delete(id); else if (picked.size < TRADE_COUNT) picked.add(id);
      draw();
      return;
    }
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.act === 'go' && target) {
      const out = trade(save, [...picked], target);
      if (!out) return;
      writeSave(save);
      el.remove();
      showHome(ctx);
      showItem(ctx, out, `✅ ${tr('交換得到：', 'Traded for: ')}${itemName(out)}`);
    }
  });
  ctx.ui.appendChild(el);
}

// ---------- 強化 ----------
function renderShop(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  body.appendChild(h(`
    <div class="col">
      <div class="card">
        <h3>${tr('永久強化', 'Permanent Boosts')}</h3>
        ${(Object.keys(SHOP) as ShopKey[]).map((k) => {
          const cost = shopCost(save, k);
          return `<div class="shoprow"><div>${SHOP[k].label}<small>${EN ? `Bought ${save.shop[k]}×` : `已升 ${save.shop[k]} 次`}</small></div>
            <button data-act="buy" data-key="${k}" ${save.coins < cost ? 'disabled' : ''}>🪙 ${fmt(cost)}</button></div>`;
        }).join('')}
      </div>
      <div class="note">${EN
        ? `Each character level gives +1% HP and ATK (now +${Math.round(levelBonus(save.level) * 100)}%, max Lv ${MAX_LEVEL}).<br>Skill Board panels cost 👻 Souls and 🔷 Runes; each unlock makes the next one pricier.<br>Gear can also be upgraded with Coins in the Gear tab.`
        : `角色每升 1 級，HP 同攻擊各 +1%（而家 +${Math.round(levelBonus(save.level) * 100)}%，最高 Lv ${MAX_LEVEL}）。<br>技能板用 👻 靈魂同 🔷 符文解鎖，解得愈多，之後每格愈貴。<br>裝備亦可以喺「裝備」頁用金幣強化。`}</div>
    </div>`));
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.act !== 'buy') return;
    const k = b.dataset.key as ShopKey;
    const cost = shopCost(save, k);
    if (save.coins >= cost) { save.coins -= cost; save.shop[k]++; writeSave(save); showHome(ctx); }
  });
}

// ---------- 設定 ----------
function renderSettings(ctx: HomeCtx, body: HTMLElement): void {
  const save = ctx.getSave();
  body.appendChild(h(`
    <div class="col">
      <div class="card"><h3>語言 / Language</h3>
        <div class="saverow">${([['zh', '廣東話（中文）'], ['en', 'English']] as const).map(([k, n]) => `<button data-lang="${k}" class="${getLang() === k ? 'primary' : ''}">${n}</button>`).join('')}</div>
      </div>
      <div class="card"><h3>${tr('聲音同畫面', 'Sound & display')}</h3>
        <div class="seg fxprefs">${([['sfx', tr('🔊 音效', '🔊 SFX')], ['music', tr('🎵 音樂', '🎵 Music')], ['numbers', tr('💥 傷害數字', '💥 Damage numbers')]] as const).map(([k, n]) => `<button data-fx="${k}" class="${fxPrefs[k] ? 'on' : ''}">${n}</button>`).join('')}</div>
      </div>
      <div class="card"><h3>${tr('遊戲', 'Game')}</h3>${ctx.autoPickToggle()}
        <div class="setrow"><div><b>${tr('開寶箱自動分解', 'Auto-salvage chest loot')}</b><small>${tr('鎖定咗嘅唔受影響', 'Locked items are safe')}</small></div>
          <div class="seg">${([['off', tr('關', 'Off')], ['common', tr('普通', 'Common')], ['rare', tr('稀有或以下', 'Rare & below')]] as const).map(([k, n]) => `<button data-salv="${k}" class="${save.autoSalvage === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      </div>
      <div class="card">
        <h3>${tr('存檔', 'Save')}${cloudReady() ? tr('（☁️ 雲端同步：電腦同手機用同一個存檔）', ' (☁️ Cloud sync: same save on PC and phone)') : tr('（只存喺呢個瀏覽器）', ' (this browser only)')}</h3>
        <div class="saverow"><button data-act="export">${tr('匯出存檔', 'Export')}</button><button data-act="import">${tr('匯入存檔', 'Import')}</button></div>
        <p class="note" style="margin:10px 0 0">${EN ? `Dungeon runs: ${save.runs}` : `已玩 ${save.runs} 次地城`}</p>
      </div>
      ${onlineSupported() ? onlineCard() : ''}
      <div class="card">
        <h3>${tr('重置帳號', 'Reset account')}</h3>
        <button data-act="reset-all" class="danger" style="width:100%">${tr('🗑️ 重置所有進度', '🗑️ Reset all progress')}</button>
        <p class="note" style="margin:8px 0 0;text-align:left">${tr('等級、金幣、裝備、技能板、終極技、覺醒、地城紀錄全部清零，由頭開始。音效設定唔郁，重置後會再問你揀語言。', 'Level, coins, gear, skill boards, ultimates, Awakening and dungeon records all go back to zero. Sound settings stay; you will be asked to pick a language again.')}${cloudReady() ? tr('雲端存檔都會一齊重置（電腦同手機）。', ' The cloud save is reset too (PC and phone).') : ''}</p>
        ${hasResetBackup() ? `<button data-act="undo-reset" style="width:100%;margin-top:10px">${tr('↩️ 復原上次重置前嘅存檔', '↩️ Restore the save from before the last reset')}</button>` : ''}
      </div>
      <div class="card">
        <h3>${tr('新手引導', 'Tutorial')}</h3>
        <button data-act="reset-tips" style="width:100%">${tr('重新顯示所有提示', 'Show all tips again')}</button>
      </div>
      <div class="card">
        <h3>${tr('測試用', 'Testing')}</h3>
        <div class="setrow" style="margin-bottom:10px"><div><b>${tr('🤝 AI 隊友（雙人合作測試）', '🤝 AI teammate (2-player co-op test)')}</b><small>${tr('地城入面多一個同你一樣嘅角色自動打。敵人血量 ×1.7，升級唔會暫停（10 秒內揀卡）；倒低咗企喺隊友身邊 2.5 秒可以救返。', 'A copy of your character joins your dungeon runs and fights on autopilot. Enemy HP ×1.7, level-ups don\'t pause (pick a card within 10s); stand next to a fallen teammate for 2.5s to revive them.')}</small></div>
          <div class="seg"><button data-coopbot="1" class="${coopBotOn() ? 'on' : ''}">${tr('開', 'On')}</button><button data-coopbot="0" class="${coopBotOn() ? '' : 'on'}">${tr('關', 'Off')}</button></div></div>
        ${sub2Of(save) ? `<button data-act="reset-ascend" class="danger" style="width:100%;margin-bottom:8px">${EN ? `Reset ${CLASSES[save.classId].name}'s third class` : `重置${CLASSES[save.classId].name}嘅第三職業`}</button>` : ''}
        <button data-act="reset-awaken" class="danger" ${subOf(save) ? '' : 'disabled'} style="width:100%">${EN ? `Reset ${CLASSES[save.classId].name}'s second class` : `重置${CLASSES[save.classId].name}嘅第二職業`}</button>
        <p class="note" style="margin:8px 0 0;text-align:left">${tr('正式版第二職業揀咗就唔可以改。呢個掣只係方便試玩唔同覺醒職業：第二職業板同覺醒板會清空，用咗嘅靈魂同符文全數退返，免費；主職業板唔郁。', 'In the full game the second class is final. This is for trying Awakenings: the second-class and Awakening boards are cleared and all Souls and Runes refunded, free. Your main board is untouched.')}</p>
      </div>
      <div class="note">${modelsReady && !modelsError ? tr('3D 模型：✅ 已載入', '3D models: ✅ loaded') : modelsError ? `${tr('3D 模型：❌ 載入失敗', '3D models: ❌ failed')} (${modelsError})` : tr('3D 模型：⏳ 載入中', '3D models: ⏳ loading')}</div>
      <div class="note">${tr('版本', 'Version')} <b>${buildLabel()}</b>${tr('（GitHub 更新咗大約 10 分鐘內會見到新版本；見唔到就閂咗個分頁再開）', ' (a new update shows up within about 10 minutes; if not, close the tab and open it again)')}</div>
      <div class="note">${tr('地城 Beta 4 · 職業、技能板、覺醒、裝備、交換、世界 Boss、離線收益。', 'Dungeon Beta 4 · Classes, Skill Boards, Awakening, Gear, Trade, World Boss, offline rewards.')}</div>
    </div>`));
  ctx.wireToggles(body);
  body.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.fx) { const k = b.dataset.fx as 'sfx' | 'music' | 'numbers'; setPref(k, !fxPrefs[k]); showHome(ctx); return; }
    if (b?.dataset.lang) { if (b.dataset.lang !== getLang()) setLang(b.dataset.lang as 'zh' | 'en'); return; }
    if (b?.dataset.act?.startsWith('ol-')) { void onlineAction(ctx, body, b.dataset.act); return; }
    if (b?.dataset.coopbot) { setCoopBot(b.dataset.coopbot === '1'); showHome(ctx); return; }
    if (b?.dataset.salv) { save.autoSalvage = b.dataset.salv as SaveData['autoSalvage']; writeSave(save); showHome(ctx); return; }
    if (b?.dataset.act === 'export') void doExport(save);
    if (b?.dataset.act === 'reset-tips') { save.tips = []; writeSave(save); ctx.banner(tr('提示已重設', 'Tips reset')); showHome(ctx); return; }
    if (b?.dataset.act === 'reset-ascend') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = tr('再撳一次確認（第三職業板同三職業板清空，材料退返）', 'Tap again to confirm (boards cleared, materials refunded)'); return; }
      const r = resetAscension(save); writeSave(save); showHome(ctx);
      ctx.banner(`${tr('第三職業已重置', 'Third class reset')}${r.souls || r.runes ? `${tr('，退返', ', refunded')} 👻 ${fmt(r.souls)} · 🔷 ${r.runes}` : ''}`);
      return;
    }
    if (b?.dataset.act === 'reset-awaken') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = tr('再撳一次確認（第二職業板同覺醒板會清空，材料全數退返）', 'Tap again to confirm (boards cleared, materials refunded)'); return; }
      const r = resetAwakening(save); writeSave(save); showHome(ctx);
      ctx.banner(`${tr('第二職業已重置', 'Second class reset')}${r.souls || r.runes ? `${tr('，退返', ', refunded')} 👻 ${fmt(r.souls)} · 🔷 ${r.runes}` : ''}`);
    }
    if (b?.dataset.act === 'import') doImport(ctx);
    if (b?.dataset.act === 'reset-all') {
      const step = Number(b.dataset.confirm ?? 0);
      if (step < 2) {
        b.dataset.confirm = String(step + 1);
        b.textContent = step === 0 ? tr('⚠️ 真係要重置？再撳一次', '⚠️ Really reset? Tap again') : tr('⚠️ 最後確認：全部進度清零', '⚠️ Final confirm: wipe all progress');
        return;
      }
      backupBeforeReset(save);
      const fresh = freshSave();
      ctx.setSave(fresh);
      writeSave(fresh);
      // a fresh start asks for the language again (reloading shows the picker)
      clearLang();
      location.reload();
      return;
    }
    if (b?.dataset.act === 'undo-reset') {
      const old = takeResetBackup();
      if (!old) return;
      ctx.setSave(old);
      writeSave(old);
      showHome(ctx);
      ctx.banner(tr('已復原重置前嘅存檔', 'Save restored'));
    }
  });
}

// ---------- online account (Settings) ----------
const ACCOUNT_ERRORS: Record<AccountError, string> = {
  badId: tr('玩家 ID 要 3–16 個字：英文、數字、中文、_ 或 -', 'Player ID: 3–16 letters, digits, Chinese characters, _ or -'),
  taken: tr('呢個玩家 ID 已經有人用咗', 'That Player ID is taken'),
  badPassword: tr(`密碼最少 ${PASSWORD_MIN} 個字`, `Password needs at least ${PASSWORD_MIN} characters`),
  network: tr('連唔到伺服器，檢查吓網絡再試', "Can't reach the server; check your connection and try again"),
  wrongLogin: tr('玩家 ID 或者密碼唔啱', 'Wrong Player ID or password'),
  noAccount: tr('冇呢個玩家 ID', 'No account with that Player ID'),
  unknown: tr('出咗問題，再試一次', 'Something went wrong, please try again'),
};

function onlineCard(): string {
  const st = onlineState();
  if (st.signedIn && st.playerId && st.hasPassword) {
    const when = st.lastSync ? new Date(st.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    return `<div class="card"><h3>${tr('網上帳號', 'Online account')}</h3>
      <div class="statline"><b>👤 ${esc(st.playerId)}</b><small>${st.status === 'error' ? tr('⚠️ 未同步到', '⚠️ Not synced') : when ? `${tr('☁️ 已同步', '☁️ Synced')} ${when}` : tr('☁️ 自動同步', '☁️ Auto-sync on')}</small></div>
      <p class="note" style="margin:6px 0 10px;text-align:left">${tr('存檔會自動上雲。換機：喺另一部機用同一個玩家 ID 同密碼登入。', 'Your save goes to the cloud automatically. New device? Log in there with the same Player ID and password.')}</p>
      <div class="saverow"><button data-act="ol-sync">${tr('立即同步', 'Sync now')}</button><button data-act="ol-logout">${tr('登出', 'Log out')}</button></div></div>`;
  }
  return `<div class="card"><h3>${tr('網上帳號', 'Online account')}</h3>
    <p class="note" style="margin:0 0 10px;text-align:left">${tr('開個帳號：存檔自動上雲，換機都唔會冇，之後仲有排行榜同合作模式。密碼冇得補發，記得記低。', 'Make an account: your save goes to the cloud so a new device keeps your progress, and it unlocks leaderboards and co-op later. Passwords can\'t be recovered, so note it down.')}</p>
    <input id="ol-id" class="olin" maxlength="16" autocomplete="username" placeholder="${tr('玩家 ID（3–16 字）', 'Player ID (3–16)')}" value="${esc(st.playerId ?? '')}">
    <input id="ol-pw" class="olin" type="password" autocomplete="current-password" placeholder="${tr(`密碼（最少 ${PASSWORD_MIN} 字）`, `Password (min ${PASSWORD_MIN})`)}">
    <div class="saverow"><button class="primary" data-act="ol-create">${tr('開新帳號', 'Create account')}</button><button data-act="ol-login">${tr('登入舊帳號', 'Log in')}</button></div></div>`;
}

/** Errors stay on the card (with the server's message) so they can be read and reported. */
function showAccountError(body: HTMLElement, msg: string, detail?: string): void {
  const card = body.querySelector('#ol-id')?.closest('.card');
  if (!card) return;
  card.querySelector('.olerr')?.remove();
  const p = document.createElement('p');
  p.className = 'olerr';
  p.textContent = detail ? `⚠️ ${msg}（${detail}）` : `⚠️ ${msg}`;
  card.appendChild(p);
}

async function onlineAction(ctx: HomeCtx, body: HTMLElement, act: string): Promise<void> {
  const save = ctx.getSave();
  if (act === 'ol-sync') { onlinePush(save, true); ctx.banner(tr('☁️ 同步緊', '☁️ Syncing')); setTimeout(() => showHome(ctx), 1500); return; }
  if (act === 'ol-logout') { await logout(); ctx.banner(tr('已登出（呢部機嘅存檔照留）', 'Logged out (this device keeps its save)')); showHome(ctx); return; }
  const id = (body.querySelector('#ol-id') as HTMLInputElement | null)?.value.trim() ?? '';
  const pw = (body.querySelector('#ol-pw') as HTMLInputElement | null)?.value ?? '';
  if (!ID_RULE.test(id)) { ctx.banner(ACCOUNT_ERRORS.badId); return; }
  const unlock = () => { for (const b of body.querySelectorAll<HTMLButtonElement>('[data-act^="ol-"]')) b.disabled = false; };
  for (const b of body.querySelectorAll<HTMLButtonElement>('[data-act^="ol-"]')) b.disabled = true;
  if (act === 'ol-create') {
    const r = await createAccount(id, pw);
    if (!r.ok) { showAccountError(body, ACCOUNT_ERRORS[r.error], r.detail); unlock(); return; }
    onlinePush(save, true);
    ctx.banner(tr(`👤 帳號開好喇：${id}`, `👤 Account created: ${id}`));
    showHome(ctx);
  } else {
    const r = await login(id, pw);
    if (!r.ok) { showAccountError(body, ACCOUNT_ERRORS[r.error], r.detail); unlock(); return; }
    ctx.banner(tr(`👤 已登入：${id}`, `👤 Logged in: ${id}`));
    showHome(ctx);
    window.dispatchEvent(new CustomEvent('online-login', { detail: r.remote }));
  }
}

async function doExport(save: SaveData): Promise<void> {
  const name = `website-game-save-${new Date().toISOString().slice(0, 10)}.json`;
  if (await cloudDownload(name, exportSave(save))) return;
  const blob = new Blob([exportSave(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// One local backup of the save from before the last account reset (in case it was a mistake).
const RESET_BACKUP = 'website-game-save-before-reset';
function backupBeforeReset(s: SaveData): void { try { localStorage.setItem(RESET_BACKUP, JSON.stringify(s)); } catch { /* blocked */ } }
function hasResetBackup(): boolean { try { return !!localStorage.getItem(RESET_BACKUP); } catch { return false; } }
function takeResetBackup(): SaveData | null {
  try {
    const t = localStorage.getItem(RESET_BACKUP);
    if (!t) return null;
    localStorage.removeItem(RESET_BACKUP);
    return importSave(t);
  } catch { return null; }
}

function doImport(ctx: HomeCtx): void {
  const f = document.createElement('input');
  f.type = 'file';
  f.accept = 'application/json,.json';
  f.onchange = async () => {
    const file = f.files?.[0];
    if (!file) return;
    try {
      const s = importSave(await file.text());
      ctx.setSave(s);
      writeSave(s);
      showHome(ctx);
      ctx.banner(tr('存檔已匯入', 'Save imported'));
    } catch {
      ctx.banner(tr('存檔檔案讀唔到', "Couldn't read save file"));
    }
  };
  f.click();
}
