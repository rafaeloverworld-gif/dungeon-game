import { DUNGEON, OFFLINE, SIM_DT } from './sim/config';
import { Sim, type SimEvent } from './sim/sim';
import { biomeFor, isBigKind } from './sim/config';
import { play, setTense, startMusic, unlockAudio } from './audio';
import { CHEST_NAMES, itemName, RARITY_COLORS, type ChestKind } from './sim/gear';
import { Renderer } from './render/renderer';
import { AWAKEN_TIER } from './sim/awakening';
import { CLASSES } from './sim/classes';
import { parseSave, setSaveHook, writeSaveLocalOnly, addAccountXp, claimWorldBoss, loadSave, offlineIncome, openChests, runSetup, useWbTicket, wbTicketsLeft, writeSave, type SaveData } from './save';
import { namedChance, todaysBoss } from './sim/worldboss';
import { createInput } from './input';
import { cloudConnect, cloudPush, cloudReady } from './cloud';
import { onlineConnect, onlinePush, onlineState, reportWorldBoss, type RemoteSave } from './online';
import { esc, fmt, h, mmss } from './ui/dom';
import { showHome as renderHome, type HomeCtx, type Tab } from './ui/home';
import { showRunTip, welcomeModal } from './ui/onboarding';
import { getLang, langChosen, setLang, tr } from './i18n';
import { ico } from './ui/icons';
import { coopBotOn } from './coopbot';

const EN = getLang() === 'en'; // language is fixed per page load
/** Death reasons stay Chinese inside the sim (compared below); this is only the label shown. */
const reasonLabel = (reason: string) => reason === '時間到' ? tr('⏱ 時間到', '⏱ Time\'s up') : reason === '放棄' ? tr('🏳️ 放棄', '🏳️ Gave up') : tr('💀 陣亡', '💀 Defeated');

const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

let save: SaveData = loadSave();
const renderer = new Renderer(canvas);
const input = createInput(app);

let sim: Sim | null = null;
let speed = 1;
let paused = false;
let acc = 0;
let last = performance.now();
let lastPhase = '';
let lostChests: Record<ChestKind, number> = { silver: 0, gold: 0 };


function resize(): void {
  const r = app.getBoundingClientRect();
  renderer.resize(Math.max(1, r.width), Math.max(1, r.height));
}
window.addEventListener('resize', resize);
resize();

// ---------- auto-pick setting ----------
const autoPickToggle = () => `
  <label class="toggle">
    <input type="checkbox" data-set="autopick" ${save.autoPickCards ? 'checked' : ''} />
    <span class="box"></span>
    <span><b>${tr('自動揀強化', 'Auto-pick upgrades')}</b><small>${tr('剔咗：升級時即刻幫你揀，唔會暫停', 'On: picks for you at level-up, no pause')}</small></span>
  </label>`;

function setAutoPick(on: boolean): void {
  save.autoPickCards = on;
  writeSave(save);
  sim?.setAutoPick(on);
  document.querySelectorAll<HTMLInputElement>('input[data-set=autopick]').forEach((i) => { i.checked = on; });
}

function wireToggles(root: HTMLElement): void {
  root.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.dataset.set === 'autopick') setAutoPick(t.checked);
  });
}

// ---------- home screen ----------
const homeCtx: HomeCtx = {
  ui,
  getSave: () => save,
  setSave: (s) => { save = s; },
  startRun: () => startRun(),
  startWorldBoss: (level: number) => startRun(level),
  autoPickToggle,
  wireToggles,
  banner: (t, i) => banner(t, i),
};

function showHome(tab?: Tab): void {
  sim = null;
  renderer.clearNumbers();
  document.querySelector('.lowhp')?.remove();
  input.enabled = false;
  renderHome(homeCtx, tab);
}

// ---------- offline income ----------
function checkOffline(): void {
  const inc = offlineIncome(save);
  save.lastSeen = Date.now();
  writeSave(save);
  if (inc.coins <= 0 && inc.xp <= 0) return;
  const hrs = Math.floor(inc.minutes / 60), mins = Math.floor(inc.minutes % 60);
  const el = h(`
    <div class="screen dim modal">
      <div class="card result" style="text-align:center">
        <div class="big" style="font-size:24px">🌙 ${tr('離線收益', 'Offline Income')}</div>
        <p class="sub" style="margin:6px 0 12px">${EN ? `Away ${hrs ? `${hrs}h ` : ''}${mins}m (max ${OFFLINE.maxHours}h)<br>Based on highest cleared: Tier ${save.highestCleared}` : `你離開咗 ${hrs ? `${hrs} 小時 ` : ''}${mins} 分鐘（最多計 ${OFFLINE.maxHours} 小時）<br>按最高通關第 ${save.highestCleared} 級地城計`}</p>
        <div class="rewards">
          <div class="card">${tr('金幣', 'Coins')}<b style="color:var(--gold)">+${fmt(inc.coins)}</b></div>
          <div class="card">${tr('經驗', 'XP')}<b style="color:var(--xp)">+${fmt(inc.xp)}</b></div>
          <div class="card">${tr('靈魂', 'Souls')}<b style="color:var(--soul)">+${fmt(inc.souls)} 👻</b></div>
        </div>
        <button class="primary" data-act="collect" style="margin-top:12px;width:100%">${tr('收取', 'Collect')}</button>
      </div>
    </div>`);
  el.addEventListener('click', (ev) => {
    if (!(ev.target as HTMLElement).closest('button')) return;
    save.coins += inc.coins;
    save.souls += inc.souls;
    addAccountXp(save, inc.xp);
    save.lastSeen = Date.now();
    writeSave(save);
    el.remove();
    if (!sim) showHome();
  });
  ui.appendChild(el);
}

function touchLastSeen(): void {
  save.lastSeen = Date.now();
  writeSave(save);
}
setInterval(() => { if (!document.hidden) touchLastSeen(); }, 30000);
window.addEventListener('pagehide', touchLastSeen);

// ---------- run ----------
let hud: {
  root: HTMLElement; hp: HTMLElement; hpText: HTMLElement; xp: HTMLElement; lv: HTMLElement;
  map: HTMLElement; kills: HTMLElement; coins: HTMLElement; timer: HTMLElement; mode: HTMLElement;
  boss: HTMLElement; bossFill: HTMLElement; bossName: HTMLElement; speedBtn: HTMLButtonElement; pickBtn: HTMLButtonElement; chests: HTMLElement;
  sig: HTMLButtonElement | null; sigFill: HTMLElement | null; sigTime: HTMLElement | null;
} | null = null;

function startRun(worldBossLevel?: number): void {
  const wbId = worldBossLevel ? todaysBoss() : undefined;
  // a ticket is only used when you take the rewards (a failed fight can be retried for free)
  if (wbId && wbTicketsLeft(save) <= 0) { banner(tr('今日嘅挑戰次數用晒喇', 'No attempts left today')); return; }
  if (wbId) { save.wbLevel = worldBossLevel!; writeSave(save); }
  sim = new Sim({
    tier: worldBossLevel ?? save.selectedTier, seed: (Math.random() * 2 ** 31) | 0, autoPickCards: save.autoPickCards,
    worldBoss: wbId, ...runSetup(save),
  });
  // testing: an AI copy of your character joins as the second hero (2-player co-op)
  if (coopBotOn()) new Sim({ tier: sim.tier, seed: (Math.random() * 2 ** 31) | 0, autoPickCards: true, worldBoss: wbId, world: sim.w, ...runSetup(save) });
  renderer.reset(sim);
  paused = false;
  acc = 0;
  lastPhase = '';
  input.enabled = true;
  buildHud();
  setTimeout(() => { if (sim) showRunTip(ui, save, 'controls'); }, 1800);
  banner(sim.wb ? `${sim.wb.icon} ${tr('世界 Boss：', 'World Boss: ')}${sim.wb.name} Lv${sim.tier}` : `${biomeFor(sim.tier).icon} ${biomeFor(sim.tier).name} · ${EN ? `Tier ${sim.tier}` : `第 ${sim.tier} 級`}`);
}

function buildHud(): void {
  ui.innerHTML = '';
  const root = h(`
    <div class="hud">
      <div class="row top">
        <div style="flex:1;max-width:58%">
          <div class="bar hp"><i></i><span></span></div>
          <div class="row" style="margin-top:6px"><span class="chip" data-k="lv"></span><div class="bar xp" style="flex:1;height:8px"><i></i></div></div>
        </div>
        <div class="btns"><button data-act="autopick"></button><button data-act="speed">×1</button><button data-act="pause">⏸</button></div>
      </div>
      <div class="row" style="margin-top:8px;flex-wrap:wrap">
        <span class="chip" data-k="map"></span><span class="chip" data-k="kills"></span>
        <span class="chip gold" data-k="coins"></span><span class="chip" data-k="timer"></span><span class="chip chest" data-k="chests" style="display:none"></span>
      </div>
      <div class="bossbar" style="display:none"><div class="name"></div><div class="bar boss" style="height:14px"><i></i></div></div>
      <div class="mode auto"></div>
      ${sim?.awk ? `<button class="sigbtn" data-act="sig"><span class="sigicon">${ico(sim.awk.signature.icon)}</span><i class="sigfill"></i><b class="sigtime"></b><small>${sim.awk.signature.name}</small></button>` : ''}
    </div>`);
  const q = (s: string) => root.querySelector(s) as HTMLElement;
  hud = {
    root, hp: q('.bar.hp i'), hpText: q('.bar.hp span'), xp: q('.bar.xp i'), lv: q('[data-k=lv]'),
    map: q('[data-k=map]'), kills: q('[data-k=kills]'), coins: q('[data-k=coins]'), timer: q('[data-k=timer]'),
    mode: q('.mode'), boss: q('.bossbar'), bossFill: q('.bossbar i'), bossName: q('.bossbar .name'),
    speedBtn: q('[data-act=speed]') as HTMLButtonElement,
    pickBtn: q('[data-act=autopick]') as HTMLButtonElement,
    chests: q('[data-k=chests]'),
    sig: root.querySelector('.sigbtn'), sigFill: root.querySelector('.sigfill'), sigTime: root.querySelector('.sigtime'),
  };
  hud.sig?.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); sim?.requestSignature(); });
  root.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.act === 'speed') { speed = speed === 1 ? 2 : 1; }
    if (b.dataset.act === 'autopick') setAutoPick(!save.autoPickCards);
    if (b.dataset.act === 'pause') showPause();
  });
  ui.appendChild(root);
}

function updateHud(): void {
  if (!sim || !hud) return;
  const p = sim.player;
  hud.hp.style.width = `${Math.max(0, p.hp / sim.maxHp) * 100}%`;
  hud.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.ceil(sim.maxHp)}`;
  // red screen edges when HP is low
  const low = p.hp > 0 && p.hp < sim.maxHp * 0.3;
  let lowEl = document.querySelector('.lowhp') as HTMLElement | null;
  if (low && !lowEl) { lowEl = document.createElement('div'); lowEl.className = 'lowhp'; document.getElementById('app')?.appendChild(lowEl); }
  else if (!low && lowEl) lowEl.remove();
  if (lowEl) lowEl.style.animationDuration = `${0.5 + (p.hp / (sim.maxHp * 0.3)) * 0.7}s`;
  hud.xp.style.width = `${(p.xp / sim.xpToNext) * 100}%`;
  hud.lv.textContent = `Lv ${p.level}`;
  if (sim.wb) {
    hud.map.textContent = EN ? `${sim.wb.icon} Phase ${sim.wbPhase + 1}` : `${sim.wb.icon} 第 ${sim.wbPhase + 1} 階段`;
    hud.kills.textContent = `${tr('傷害', 'Damage')} ${Math.floor((sim.wbDamage / (sim.boss?.maxHp ?? (sim.wbDamage || 1))) * 100)}%`;
  } else {
    hud.map.textContent = `${tr('地圖', 'Map')} ${sim.map + 1}/${DUNGEON.maps}`;
    hud.kills.textContent = sim.bossSpawned ? tr('Boss 戰', 'Boss fight') : `${tr('擊殺', 'Kills')} ${sim.kills}/${sim.quota}`;
  }
  hud.coins.textContent = `🪙 ${fmt(sim.runCoins)} · 👻 ${fmt(sim.runSouls)}${sim.runRunes ? ` · 🔷 ${sim.runRunes}` : ''}${sim.runCrystals ? ` · 💎 ${sim.runCrystals}` : ''}`;
  hud.timer.textContent = `⏱ ${mmss(Math.max(0, sim.timeLimit - sim.time))}`;
  if (sim.coop) {
    let el = hud.root.querySelector('.partnerhp') as HTMLElement | null;
    if (!el) { el = document.createElement('div'); el.className = 'partnerhp'; hud.root.appendChild(el); }
    el.innerHTML = sim.heroes.filter((o) => o !== sim).map((o) => `<span>🤝 ${o.cls.icon}</span><i><b style="width:${o.down ? 0 : Math.max(0, o.player.hp / o.maxHp) * 100}%"></b></i>${o.down ? `<small>${tr('倒低咗', 'Down')}</small>` : ''}`).join('');
  }
  hud.speedBtn.textContent = `×${speed}`;
  if (hud.sig && sim.signature) {
    const left = sim.signature.timer;
    const ready = left <= 0;
    hud.sig.classList.toggle('ready', ready);
    hud.sigFill!.style.height = `${ready ? 0 : (left / sim.signature.cooldown) * 100}%`;
    hud.sigTime!.textContent = ready ? '' : String(Math.ceil(left));
  }
  const held = sim.chests.silver + sim.chests.gold;
  hud.chests.style.display = held ? '' : 'none';
  if (held) hud.chests.textContent = `🎁 ${sim.chests.gold ? `${tr('金', 'Gold')}×${sim.chests.gold} ` : ''}${sim.chests.silver ? `${tr('銀', 'Silver')}×${sim.chests.silver}` : ''}`.trim();
  hud.pickBtn.textContent = save.autoPickCards ? tr('🎴 自動', '🎴 Auto') : tr('🎴 手揀', '🎴 Pick');
  hud.pickBtn.classList.toggle('on', save.autoPickCards);
  const auto = p.autopilot;
  hud.mode.className = `mode ${auto ? 'auto' : 'manual'}`;
  hud.mode.textContent = auto ? tr('🤖 自動駕駛', '🤖 Autopilot') : tr('🎮 手動操控', '🎮 Manual');
  if (sim.boss) {
    hud.boss.style.display = '';
    hud.bossName.textContent = sim.boss.kind === 'worldboss' && sim.wb ? `${sim.wb.name} Lv${sim.tier}` : sim.boss.kind === 'boss' ? tr('最終 Boss', 'Final Boss') : tr('小 Boss', 'Mini-boss');
    hud.bossFill.style.width = `${Math.max(0, sim.boss.hp / sim.boss.maxHp) * 100}%`;
  } else hud.boss.style.display = 'none';
}

function banner(text: string, icon?: string): void {
  const el = h(`<div class="banner">${icon ? `${ico(icon)} ` : ''}</div>`);
  el.append(text);
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

let toastStack = 0;
function toast(text: string, icon?: string): void {
  const el = h(`<div class="toast">${icon ? `${ico(icon)} ` : ''}</div>`);
  el.append(text);
  el.style.bottom = `${64 + (toastStack % 3) * 38}px`;
  toastStack++;
  ui.appendChild(el);
  setTimeout(() => { el.remove(); toastStack = Math.max(0, toastStack - 1); }, 1800);
}

let hitStop = 0; // seconds the action freezes for impact (boss kills)
const PARTNER_FX = new Set<SimEvent['type']>(['hit', 'kill', 'swing', 'explode', 'dash', 'wave', 'lightning']);

function handleEvents(events: SimEvent[]): void {
  for (const ev of events) {
    if (ev.type === 'down') { if (sim && ev.pid === sim.pid) banner(tr('你倒低咗！隊友企喺你身邊就可以救返你', 'You fell! A teammate standing next to you can revive you')); else toast(tr('隊友倒低咗，行過去佢身邊救佢', 'Your teammate fell: stand next to them to revive'), '💀'); continue; }
    if (ev.type === 'revive') { toast(sim && ev.pid === sim.pid ? tr('你被救返喇', 'You were revived') : tr('隊友救返喇', 'Teammate revived'), '💚'); continue; }
    // sounds
    if (ev.type === 'hit') play(ev.crit ? 'crit' : 'hit');
    else if (ev.type === 'kill') {
      if (isBigKind(ev.kind)) { play('bigKill'); hitStop = 0.18; setTense(false); } else play('kill');
    } else if (ev.type === 'explode') play('explode');
    else if (ev.type === 'coin') play('coin');
    else if (ev.type === 'hurt') play('hurt');
    else if (ev.type === 'boss') { play('boss'); setTense(true); }
    else if (ev.type === 'chest') play('chest');
    else if (ev.type === 'levelup' || ev.type === 'autoCard') play('levelup');
    else if (ev.type === 'lightning') play('zap');
    else if (ev.type === 'wave') play('wave');
    else if (ev.type === 'warn') play('warn');
    else if (ev.type === 'newMap') setTense(false);
    if (ev.type === 'boss') banner((ev.kind === 'boss' ? tr('⚠️ 最終 Boss 出現！', '⚠️ Final Boss appears!') : tr('⚠️ 小 Boss 出現！', '⚠️ Mini-boss appears!')) + (sim?.isGate ? tr('（守關：特別強）', ' (Gate: extra tough)') : ''));
    else if (ev.type === 'mapClear') banner(tr('地圖清除！', 'Map cleared!'));
    else if (ev.type === 'lastStand') banner(tr('🛡️ 不屈！', '🛡️ Last Stand!'));
    else if (ev.type === 'skill' && ev.signature) toast(ev.name, ev.icon);
    else if (ev.type === 'levelup' || ev.type === 'autoCard') { if (!save.tips.includes('levelup')) showRunTip(ui, save, 'levelup'); if (ev.type === 'autoCard') toast(`${tr('升級：', 'Level up: ')}${ev.name}`, ev.icon); }
    else if (ev.type === 'chest') { showRunTip(ui, save, 'chest'); toast(EN ? `🎁 ${CHEST_NAMES[ev.kind]}! Clear to keep it` : `🎁 獲得${CHEST_NAMES[ev.kind]}！通關先入袋`); }
    else if (ev.type === 'newMap' && sim) banner(`${tr('地圖', 'Map')} ${ev.map + 1}${ev.map === DUNGEON.maps - 1 ? tr(' · 最終', ' · Final') : ''}`);
  }
}

// ---------- level-up ----------
let cardEl: HTMLElement | null = null;
let shownOffer = -1;

function showLevelUp(): void {
  if (!sim) return;
  const s = sim;
  shownOffer = s.offerId;
  const suggest = s.autoPickIndex();
  cardEl = h(`
    <div class="screen dim">
      <h2 style="text-align:center">${tr('升級！揀一個強化', 'Level up! Pick an upgrade')}</h2>
      ${s.coop ? `<p class="note" style="text-align:center;margin:-6px 0 8px">${tr('合作模式：遊戲冇暫停，10 秒內唔揀就自動揀', 'Co-op: the game keeps going; a card is picked for you after 10s')}</p>` : ''}
      <div class="cards">
        ${s.offeredCards.map((c, i) => `<button class="lvcard ${i === suggest ? 'suggest' : ''}" data-i="${i}"><span class="ic">${ico(c.icon)}</span><span><b>${c.name}</b><small>${c.desc}</small></span></button>`).join('')}
      </div>
      <div class="card">${autoPickToggle()}</div>
    </div>`);
  wireToggles(cardEl);
  cardEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  cardEl.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b || !sim) return;
    sim.chooseCard(Number(b.dataset.i));
  });
  ui.appendChild(cardEl);
}

function hideLevelUp(): void {
  cardEl?.remove();
  cardEl = null;
}

// ---------- pause & end ----------
let pauseEl: HTMLElement | null = null;
function showPause(): void {
  if (!sim || pauseEl) return;
  paused = true;
  pauseEl = h(`
    <div class="screen dim">
      <h2 style="text-align:center">${tr('暫停', 'Paused')}</h2>
      <div class="col">
        <button class="primary" data-act="resume">${tr('繼續', 'Resume')}</button>
        <button data-act="quit">${tr('放棄地城（保留金幣同經驗）', 'Give up (keep Coins & XP)')}</button>
        <div class="card">${autoPickToggle()}</div>
      </div>
    </div>`);
  wireToggles(pauseEl);
  pauseEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  pauseEl.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b || !sim) return;
    if (b.dataset.act === 'resume') { paused = false; pauseEl?.remove(); pauseEl = null; last = performance.now(); }
    if (b.dataset.act === 'quit') { pauseEl?.remove(); pauseEl = null; paused = false; finishRun(false, '放棄'); }
  });
  ui.appendChild(pauseEl);
}

/** What hurt you in your last 5 seconds (shown on the death screen). */
const SRC_NAMES: Record<string, () => string> = {
  grunt: () => tr('近戰怪', 'Grunts'), swarm: () => tr('細隻怪', 'Swarmers'), shooter: () => tr('射手撞你', 'Shooters'), shot: () => tr('子彈', 'Bullets'),
  bomber: () => tr('自爆怪', 'Bombers'), shield: () => tr('盾兵', 'Shieldbearers'), healer: () => tr('治療師', 'Healers'),
  miniboss: () => tr('小 Boss', 'Mini-boss'), boss: () => tr('Boss', 'Boss'), worldboss: () => tr('世界 Boss', 'World Boss'),
  slam: () => tr('Boss 砸地紅圈', 'Boss slam (red circle)'), charge: () => tr('小 Boss 衝鋒紅線', 'Mini-boss charge (red line)'),
};
function deathRecap(s: Sim): string {
  const by: Record<string, number> = {};
  for (const h of s.recentHits) by[h.src] = (by[h.src] ?? 0) + h.dmg;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!rows.length) return '';
  return `<div class="card deathlog">${tr('最後 5 秒受到嘅傷害：', 'Damage taken in the last 5 s: ')}${rows.map(([k, v]) => `<br>· ${(SRC_NAMES[k]?.() ?? k)} <b>${Math.round(v)}</b>`).join('')}<br><small>${tr('提示：紅圈同紅線會喺 1 秒後爆，行出去就避到', 'Tip: red circles and lines hit after ~1 s — step out of them')}</small></div>`;
}

function finishRun(won: boolean, reason: string): void {
  renderer.clearNumbers();
  document.querySelector('.lowhp')?.remove();
  play(won ? 'win' : 'lose');
  setTense(false);
  if (!sim) return;
  if (sim.wb) { finishWorldBoss(won, reason); return; }
  const s = sim;
  sim = null;
  input.enabled = false;
  const coins = Math.floor(s.runCoins);
  save.coins += coins;
  save.souls += Math.floor(s.runSouls);
  save.runes += s.runRunes;
  save.crystals += s.runCrystals;
  const lvBefore = save.level;
  addAccountXp(save, s.runXp);
  let unlocked = false;
  let firstClear = 0; // 💎 bonus for clearing a tier for the first time (gate tiers much more)
  if (won && s.tier > save.highestCleared) {
    for (let t = save.highestCleared + 1; t <= s.tier; t++) firstClear += t % 5 === 0 ? 15 : 3;
    save.highestCleared = s.tier; unlocked = true;
    save.crystals += firstClear;
  }
  const loot = won ? openChests(save, s.chests, s.tier) : { items: [], autoSalvaged: 0, kept: [] };
  save.runs++;
  save.lastSeen = Date.now();
  writeSave(save);

  const chestText = (c: Record<ChestKind, number>) => [c.gold ? `${tr('金箱', 'Gold Chest')}×${c.gold}` : '', c.silver ? `${tr('銀箱', 'Silver Chest')}×${c.silver}` : ''].filter(Boolean).join(tr('、', ', '));
  // chests are emptied on death, so remember what was lost from the HUD count before it was cleared
  const lost = !won ? lostChests : null;

  ui.innerHTML = '';
  const el = h(`
    <div class="screen dim result">
      <div class="big">${won ? tr('🏆 通關！', '🏆 Cleared!') : reasonLabel(reason)}</div>
      <div class="sub" style="margin-top:0">${s.cls.icon} ${s.cls.name} · ${EN ? `Tier ${s.tier} · Reached Map ${s.map + 1} · ${mmss(s.time)}` : `第 ${s.tier} 級地城 · 去到地圖 ${s.map + 1} · 用咗 ${mmss(s.time)}`}</div>
      <div class="rewards">
        <div class="card">${tr('金幣', 'Coins')}<b style="color:var(--gold)">+${fmt(coins)}</b></div>
        <div class="card">${tr('經驗', 'XP')}<b style="color:var(--xp)">+${fmt(s.runXp)}</b></div>
        <div class="card">${tr('靈魂', 'Souls')}<b style="color:var(--soul)">+${fmt(s.runSouls)} 👻</b></div>
        <div class="card">${tr('符文', 'Runes')}<b style="color:var(--rune)">+${s.runRunes + (won ? s.chests.silver + s.chests.gold * 2 : 0)} 🔷</b></div>
        ${s.runCrystals + firstClear ? `<div class="card">${tr('靈晶', 'Crystals')}<b style="color:var(--crystal)">+${s.runCrystals + firstClear} 💎</b>${firstClear ? `<small>${EN ? `incl. first clear +${firstClear}` : `包括首次通關 +${firstClear}`}</small>` : ''}</div>` : ''}
      </div>
      ${loot.items.length ? `<div class="card loot"><h3>🎁 ${tr('開咗', 'Opened')} ${chestText(s.chests)}</h3>
        ${loot.items.map((it) => `<div class="lootrow" style="--rc:${RARITY_COLORS[it.rarity]}">${esc(itemName(it))}<small>Lv${it.tier}</small></div>`).join('')}
        ${loot.autoSalvaged ? `<p class="note" style="margin:6px 0 0">${EN ? `${loot.items.length - loot.kept.length} auto-salvaged (setting or bag full): 🪙 +${fmt(loot.autoSalvaged)}` : `有 ${loot.items.length - loot.kept.length} 件已自動分解（設定或者背包滿咗）：🪙 +${fmt(loot.autoSalvaged)}`}</p>` : ''}
      </div>` : ''}
      ${!won && reason !== '放棄' ? deathRecap(s) : ''}
      ${lost && (lost.gold || lost.silver) ? `<div class="card" style="color:var(--danger)">${EN ? `Dungeon not cleared: lost ${chestText(lost)}` : `地城未通關，${chestText(lost)}冇咗`}</div>` : ''}
      ${save.level > lvBefore ? `<div class="card">${EN ? `Hero reached <b>Lv ${save.level}</b>! HP & ATK +${save.level - lvBefore}% (total +${save.level - 1}%)` : `角色升到 <b>Lv ${save.level}</b>！HP 同攻擊 +${save.level - lvBefore}%（合共 +${save.level - 1}%）`}</div>` : ''}
      ${unlocked ? `<div class="card">${EN ? `Unlocked Tier ${s.tier + 1} dungeon` : `解鎖咗第 ${s.tier + 1} 級地城`}</div>` : ''}
      ${unlocked && s.tier === AWAKEN_TIER ? `<div class="card" style="color:var(--gold)">✨ ${tr('可以覺醒喇！去「出發」頁揀第二職業', 'You can Awaken! Pick a second class on the Play tab')}</div>` : ''}
      <div class="col">
        ${won ? `<button class="primary" data-act="next">${EN ? `Try Tier ${s.tier + 1}` : `挑戰第 ${s.tier + 1} 級`}</button>` : ''}
        <button ${won ? '' : 'class="primary"'} data-act="again">${EN ? `Retry Tier ${s.tier}` : `再挑戰第 ${s.tier} 級`}</button>
        ${won ? `<button data-act="auto-repeat" class="${save.autoRepeat ? 'on' : ''}">${save.autoRepeat ? (EN ? '🔁 Auto-repeat: ON' : '🔁 自動再挑戰：開') : (EN ? '🔁 Auto-repeat: OFF' : '🔁 自動再挑戰：關')}</button>` : ''}
        ${loot.items.length ? `<button data-act="gear">${tr('睇裝備', 'View gear')}</button>` : ''}
        <button data-act="home">${tr('返主頁', 'Home')}</button>
      </div>
    </div>`);
  // 自動再挑戰: after a clear, start the same tier again after a short countdown (any tap cancels it)
  let countdown: number | undefined;
  const stopCountdown = () => { if (countdown !== undefined) { clearInterval(countdown); countdown = undefined; } };
  const startCountdown = () => {
    const again = el.querySelector('[data-act=again]') as HTMLButtonElement;
    let left = 4;
    const label = () => { again.textContent = EN ? `Retrying Tier ${s.tier} in ${left}s…` : `${left} 秒後自動再挑戰第 ${s.tier} 級…`; };
    label();
    again.classList.add('primary');
    countdown = window.setInterval(() => {
      left--;
      if (left <= 0) { stopCountdown(); if (el.isConnected) { save.selectedTier = s.tier; startRun(); } return; }
      label();
    }, 1000);
  };
  if (won && save.autoRepeat) startCountdown();
  if (won && save.highestCleared >= 2) showRunTip(ui, save, 'repeat');
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    stopCountdown();
    if (b.dataset.act === 'auto-repeat') {
      save.autoRepeat = !save.autoRepeat; writeSave(save);
      b.classList.toggle('on', save.autoRepeat);
      b.textContent = save.autoRepeat ? (EN ? '🔁 Auto-repeat: ON' : '🔁 自動再挑戰：開') : (EN ? '🔁 Auto-repeat: OFF' : '🔁 自動再挑戰：關');
      const again = el.querySelector('[data-act=again]') as HTMLButtonElement;
      again.textContent = EN ? `Retry Tier ${s.tier}` : `再挑戰第 ${s.tier} 級`;
      if (save.autoRepeat) startCountdown();
      return;
    }
    if (b.dataset.act === 'next') { save.selectedTier = s.tier + 1; writeSave(save); startRun(); }
    if (b.dataset.act === 'again') { save.selectedTier = s.tier; startRun(); }
    if (b.dataset.act === 'gear') showHome('gear');
    if (b.dataset.act === 'home') showHome();
  });
  ui.appendChild(el);
}

function finishWorldBoss(killed: boolean, reason: string): void {
  renderer.clearNumbers();
  document.querySelector('.lowhp')?.remove();
  const s = sim!;
  sim = null;
  input.enabled = false;
  void reportWorldBoss(s.wbDamage); // today's World Boss board keeps your best fight
  if (killed) { claimWbRun(s, true, reason); return; }
  // failed: retry for free (no rewards), or spend a ticket to take the rewards for the damage done
  const wb = s.wb!;
  const frac = Math.min(1, s.wbDamage / (wb.hp * Math.pow(1.15, s.tier - 1)));
  const tier = frac >= 0.66 ? tr('兩個銀箱', '2 Silver Chests') : frac >= 0.33 ? tr('一個銀箱', '1 Silver Chest') : tr('冇寶箱', 'no Chest');
  ui.innerHTML = '';
  const el = h(`
    <div class="screen dim result">
      <div class="big">${reasonLabel(reason)}</div>
      <div class="sub" style="margin-top:0">${wb.icon} ${wb.name} Lv${s.tier} · ${EN ? `${Math.floor(frac * 100)}% damage (${tier})` : `造成 ${Math.floor(frac * 100)}% 傷害（${tier}）`}</div>
      <div class="card">
        <p style="margin:0 0 6px">${tr('打唔死唔會自動扣券。你可以：', 'Not killed, so no ticket used. You can:')}</p>
        <small class="note" style="text-align:left;display:block">${tr('• <b>再挑戰</b>：唔扣券，但今次嘅獎勵唔要<br>• <b>領取獎勵</b>：用 1 張券，按今次傷害攞獎勵', '• <b>Retry</b>: free, but skip this reward<br>• <b>Claim</b>: use 1 ticket, reward by damage dealt')}</small>
      </div>
      <div class="col">
        <button class="primary" data-act="retry">🔁 ${tr('再挑戰（唔扣券）', 'Retry (free)')}</button>
        <button data-act="claim">🎁 ${EN ? `Claim (1 ticket · ${wbTicketsLeft(save)} left today)` : `領取獎勵（用 1 張券 · 今日仲有 ${wbTicketsLeft(save)} 張）`}</button>
        <button class="ghost" data-act="home">${tr('返主頁（唔扣券，冇獎勵）', 'Home (free, no reward)')}</button>
      </div>
    </div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.act === 'retry') { el.remove(); startRun(s.tier); }
    if (b?.dataset.act === 'claim') claimWbRun(s, false, reason);
    if (b?.dataset.act === 'home') showHome();
  });
  ui.appendChild(el);
}

function claimWbRun(s: Sim, killed: boolean, reason: string): void {
  if (!useWbTicket(save)) { banner(tr('今日嘅挑戰次數用晒喇', 'No attempts left today')); showHome(); return; }
  const wb = s.wb!;
  const maxHp = wb.hp * Math.pow(1.15, s.tier - 1);
  const frac = killed ? 1 : Math.min(1, s.wbDamage / maxHp);
  save.coins += Math.floor(s.runCoins);
  save.souls += Math.floor(s.runSouls);
  save.runes += s.runRunes;
  const lvBefore = save.level;
  addAccountXp(save, s.runXp);
  const res = claimWorldBoss(save, wb.id, s.tier, frac, killed);
  const crystals = (killed ? 8 : frac >= 0.66 ? 4 : frac >= 0.33 ? 2 : 1) + s.runCrystals;
  save.crystals += crystals;
  save.runs++;
  save.lastSeen = Date.now();
  writeSave(save);
  const items = [...(res.named ? [res.named] : []), ...res.chestItems];
  ui.innerHTML = '';
  const el = h(`
    <div class="screen dim result">
      <div class="big">${killed ? (EN ? `🏆 ${wb.name} defeated!` : `🏆 擊敗${wb.name}！`) : reasonLabel(reason)}</div>
      <div class="sub" style="margin-top:0">${wb.icon} ${wb.name} Lv${s.tier} · ${EN ? `${Math.floor(frac * 100)}% damage · ${mmss(s.time)}` : `造成 ${Math.floor(frac * 100)}% 傷害 · 用咗 ${mmss(s.time)}`}</div>
      <div class="rewards">
        <div class="card">${tr('金幣', 'Coins')}<b style="color:var(--gold)">+${fmt(res.reward.coins + Math.floor(s.runCoins))}</b></div>
        <div class="card">${tr('經驗', 'XP')}<b style="color:var(--xp)">+${fmt(res.reward.xp + s.runXp)}</b></div>
        <div class="card">${tr('靈魂', 'Souls')}<b style="color:var(--soul)">+${fmt(res.reward.souls + s.runSouls)} 👻</b></div>
        <div class="card">${tr('符文', 'Runes')}<b style="color:var(--rune)">+${res.reward.runes + s.runRunes + res.reward.silver + res.reward.gold * 2} 🔷</b></div>
        <div class="card">${tr('靈晶', 'Crystals')}<b style="color:var(--crystal)">+${crystals} 💎</b></div>
      </div>
      ${res.named ? `<div class="card named"><div class="big" style="font-size:18px">🌟 ${tr('有名傳說！', 'Named Legendary!')}</div><b style="color:${RARITY_COLORS.legendary}">${esc(itemName(res.named))}</b></div>` : killed ? `<p class="note">${EN ? `No named Legendary this time (${Math.round(namedChance(s.tier) * 100)}% chance)` : `今次冇跌有名傳說（機會 ${Math.round(namedChance(s.tier) * 100)}%）`}</p>` : ''}
      ${items.length ? `<div class="card loot"><h3>🎁 ${[res.reward.gold ? `${tr('金箱', 'Gold Chest')}×${res.reward.gold}` : '', res.reward.silver ? `${tr('銀箱', 'Silver Chest')}×${res.reward.silver}` : ''].filter(Boolean).join(tr('、', ', ')) || tr('獎勵', 'Rewards')}</h3>
        ${items.map((it) => `<div class="lootrow" style="--rc:${RARITY_COLORS[it.rarity]}">${esc(itemName(it))}<small>Lv${it.tier}</small></div>`).join('')}
        ${res.autoSalvaged ? `<p class="note" style="margin:6px 0 0">${tr('有啲已自動分解：', 'Some auto-salvaged: ')}🪙 +${fmt(res.autoSalvaged)}</p>` : ''}
      </div>` : `<p class="note">${tr('傷害打夠 33% 有銀箱，66% 有兩個銀箱，打死有金箱。', '33% damage: Silver Chest. 66%: 2 Silver. Kill: Gold Chest.')}</p>`}
      ${save.level > lvBefore ? `<div class="card">${EN ? `Hero reached <b>Lv ${save.level}</b>! HP & ATK +${save.level - lvBefore}% (total +${save.level - 1}%)` : `角色升到 <b>Lv ${save.level}</b>！HP 同攻擊 +${save.level - lvBefore}%（合共 +${save.level - 1}%）`}</div>` : ''}
      <div class="col">
        <button class="primary" data-act="home">${EN ? `Home (${wbTicketsLeft(save)} left today)` : `返主頁（今日仲有 ${wbTicketsLeft(save)} 次）`}</button>
        ${items.length ? `<button data-act="gear">${tr('睇裝備', 'View gear')}</button>` : ''}
      </div>
    </div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.act === 'home') showHome();
    if (b?.dataset.act === 'gear') showHome('gear');
  });
  ui.appendChild(el);
}

// ---------- main loop ----------
// sound needs a first tap; every button gives a soft click
document.addEventListener('pointerdown', () => { unlockAudio(); startMusic(); }, { capture: true });
document.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).closest?.('button')) play('click'); }, { capture: true });

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (sim && !paused && hitStop > 0) {
    hitStop -= dt; // brief freeze on big kills
    renderer.render(sim, dt * 0.2);
  } else if (sim && !paused) {
    acc += dt * speed;
    let steps = 0;
    while (acc >= SIM_DT && steps < 12) {
      acc -= SIM_DT;
      steps++;
      lostChests = { ...sim.chests };
      sim.step(input.read());
      renderer.handleEvents(sim.events);
      // co-op: what the teammates do shows too (hits, slashes, blasts), but not their personal alerts
      for (const o of sim.heroes) if (o !== sim) renderer.handleEvents(o.events.filter((e) => PARTNER_FX.has(e.type)));
      handleEvents(sim.events);
      if (sim.phase === 'won' || sim.phase === 'dead') break;
    }
    if (acc > SIM_DT * 12) acc = 0;

    const phase = sim.picking ? 'levelup' : sim.phase; // co-op: card picks don't pause the dungeon
    if (phase !== lastPhase) {
      if (lastPhase === 'levelup') hideLevelUp();
      if (phase === 'levelup') showLevelUp();
      lastPhase = phase;
    } else if (phase === 'levelup' && (cardEl === null || shownOffer !== sim.offerId)) { hideLevelUp(); showLevelUp(); }
    if (!sim.wb && sim.kills >= 10 && !save.tips.includes('quota')) showRunTip(ui, save, 'quota');
    updateHud();
    renderer.render(sim, dt);
    if (sim.phase === 'won') finishRun(true, '');
    else if (sim.phase === 'dead') finishRun(false, sim.deathReason);
  } else if (sim) {
    renderer.render(sim, 0);
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { if (document.hidden && sim) showPause(); });

showHome();
if (!langChosen()) {
  // first launch: pick English or Cantonese before anything else (picking reloads the page in that language)
  const el = h(`<div class="screen dim modal langpick"><div class="card">
    <h2 style="margin:0 0 6px;text-align:center">🏰</h2>
    <p class="sub" style="text-align:center;margin:0 0 14px">Choose your language<br>揀語言</p>
    <div class="col">
      <button class="primary" data-lang="en">English</button>
      <button class="primary" data-lang="zh">廣東話（中文）</button>
    </div>
    <p class="note" style="margin:12px 0 0;text-align:center">You can change it later in Settings · 之後可以喺設定改</p>
  </div></div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (b?.dataset.lang) setLang(b.dataset.lang as 'zh' | 'en');
  });
  ui.appendChild(el);
} else if (!save.tips.includes('welcome') && save.runs === 0) ui.appendChild(welcomeModal(save, () => showHome()));
else checkOffline();
startCloud();

// ---------- cloud save (only when running as a Claude artifact) ----------
// every save goes to whichever cloud is connected (Claude artifact store, or the online account)
setSaveHook((json, s) => { if (cloudReady()) cloudPush(json, s.updatedAt); onlinePush(s); });

async function startCloud(): Promise<void> {
  const remote = await cloudConnect();
  if (!cloudReady()) { void startOnline(); return; }
  if (remote && remote.updatedAt > save.updatedAt) {
    if (sim) return; // mid-run: keep this device's progress, it will be newer when the run ends
    try {
      save = parseSave(remote.json);
      writeSaveLocalOnly(save);
      showHome();
      checkOffline();
      banner(tr('☁️ 已載入雲端存檔', '☁️ Cloud save loaded'));
    } catch { /* bad cloud copy: keep the local one */ }
  } else if (!remote || remote.updatedAt < save.updatedAt) {
    cloudPush(JSON.stringify(save), save.updatedAt || Date.now(), true);
  }
  const flushNow = () => cloudPush(JSON.stringify(save), save.updatedAt, true);
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
}

// ---------- online account (GitHub Pages: Supabase) ----------
async function startOnline(): Promise<void> {
  const remote = await onlineConnect();
  if (!onlineState().signedIn) return;
  if (!sim && !document.querySelector('.modal')) renderHome(homeCtx); // show the account as logged in
  syncWithRemote(remote);
  const flushNow = () => onlinePush(save, true);
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
}
// logging in from the Settings tab hands over the account's cloud save
window.addEventListener('online-login', (ev) => syncWithRemote((ev as CustomEvent<RemoteSave | null>).detail));

/** Newest save wins, unless the older one has more progress: then ask which to keep. */
function syncWithRemote(remote: RemoteSave | null): void {
  const push = () => onlinePush(save, true);
  if (!remote) { push(); return; }
  let r: SaveData;
  try { r = parseSave(remote.json); } catch { push(); return; }
  if (remote.updatedAt === save.updatedAt) return;
  const remoteNewer = remote.updatedAt > save.updatedAt;
  const remoteMore = r.level > save.level || r.highestCleared > save.highestCleared;
  const localMore = save.level > r.level || save.highestCleared > r.highestCleared;
  const useRemote = () => {
    if (sim) return; // mid-run: keep this device's progress
    save = r; writeSaveLocalOnly(save); showHome(); checkOffline();
    banner(tr('☁️ 已載入雲端存檔', '☁️ Cloud save loaded'));
  };
  if (!(remoteNewer ? localMore : remoteMore)) { if (remoteNewer) useRemote(); else push(); return; }
  const line = (s: SaveData) => `Lv ${s.level} · ${EN ? `best Tier ${s.highestCleared}` : `最高通關 ${s.highestCleared}`} · ${CLASSES[s.classId].icon} ${CLASSES[s.classId].name}`;
  const el = h(`<div class="screen dim modal"><div class="card welcome">
      <h2>${tr('揀邊個存檔？', 'Which save?')}</h2>
      <p class="sub">${tr('雲端同呢部機嘅存檔唔一樣。揀咗嗰個會覆蓋另一個。', 'The cloud save and this device differ. The one you pick replaces the other.')}</p>
      <button class="primary" data-pick="remote" style="width:100%;margin-bottom:8px">☁️ ${tr('雲端', 'Cloud')}：${line(r)}</button>
      <button data-pick="local" style="width:100%">📱 ${tr('呢部機', 'This device')}：${line(save)}</button>
    </div></div>`);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    if (!b) return;
    el.remove();
    if (b.dataset.pick === 'remote') useRemote(); else push();
  });
  ui.appendChild(el);
}

// PWA: only works when served over http(s), not when the HTML file is opened directly
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
}
requestAnimationFrame(frame);

// for automated testing
(window as unknown as { __game: unknown }).__game = { get sim() { return sim; }, get save() { return save; }, get renderer() { return renderer; } };
