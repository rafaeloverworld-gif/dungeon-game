// New-player help: one-time tips and a chain of starter quests.
import type { SaveData } from '../save';
import { writeSave } from '../save';
import { h } from './dom';
import { tr } from '../i18n';

// ---------- one-time tips ----------
export const TIPS = {
  controls: { icon: '🎮', text: tr('唔掂螢幕 = 自動駕駛，角色自己行自己打。按住螢幕拖動 = 自己行，放手 2 秒變返自動。', 'Don\'t touch = Autopilot: your hero moves and fights alone. Hold and drag = Manual; let go for 2s to switch back.') },
  quota: { icon: '🎯', text: tr('殺夠數量（左上角「擊殺」）就會出 Boss，打低佢先去到下一張地圖。第 3 張地圖係最終 Boss。', 'Reach the Kills target (top left) to summon the Boss. Beat it to reach the next Map. Map 3 has the final Boss.') },
  levelup: { icon: '⬆️', text: tr('升級強化卡只維持今舖地城。右上角 🎴 可以揀自動揀卡定自己揀。', 'Level-up upgrade cards last for this Dungeon only. Tap 🎴 (top right) to auto-pick or choose yourself.') },
  chest: { icon: '🎁', text: tr('寶箱暫時放喺身上，要通關先真係入袋。中途死咗或者放棄就會冇晒。', 'Chests are only yours once the Dungeon is Cleared. Die or give up and you lose them.') },
  tree: { icon: '🌳', text: tr('呢度係你嘅技能樹。職業等級每升 1 級得 1 點：最頂揀一個「基本攻擊」，下面 5 層主動同被動技能，用夠點數開下一層。主動技能升滿 5 級可以「✨ 強化」，再喺兩個「🔀 變化」揀一個；最多裝 4 個主動，會自動放。揀咗第二職業會多一層組合專屬技能。最底「🎖️ 專精層」用 👻 靈魂買屬性。重置技能樹免費。', 'This is your skill tree. Each class level gives 1 point: pick a Basic attack at the top, then active and passive skills in 5 tiers that open as you spend points. Max an active (rank 5) to ✨ Enhance it, then pick one of two 🔀 modifiers; up to 4 actives are equipped and cast automatically. A second class adds a layer of skills only that pair has. The 🎖️ Mastery layer at the bottom buys stats with 👻 Souls. Resetting the tree is free.') },
  ult: { icon: '⚡', text: tr('終極技任何職業都用得，最多裝 3 個。有啲定時自動放，有啲係你攻擊嗰陣有機會觸發。用 💎 靈晶解鎖同升級，升到 Lv 10 會解鎖「極限」效果。靈晶主要嚟自 Boss、守關地城同第一次通關新等級。', 'Any class can use Ultimates; equip up to 3. Some fire on a timer, others may trigger when you attack. Unlock and level them with 💎 Crystals; Lv 10 unlocks a Limit effect. Crystals come mostly from Bosses, gate dungeons and first clears of new tiers.') },
  attack: { icon: '🏹', text: tr('攻擊方式由主手武器決定。弓可以揀箭種、法杖可以揀法術、死靈喺技能樹揀基本攻擊（「召喚骷髏」= 召喚），隨時免費轉，唔同地城可以試吓唔同揀法。', 'Your main-hand weapon sets how you attack. Bows pick an arrow type, staffs pick a spell, and Necromancers pick their Basic attack in the skill tree (Raise Skeleton = summon). Switching is free any time, so try different picks for different dungeons.') },
  ascend: { icon: '🌟', text: tr('帳號 Lv 40 兼通關第 25 級地城，就可以「昇華」揀第三職業：多一個數值加成，每次招牌技之後仲會追擊，技能樹多一層第三職業技能。舊混合板用咗嘅材料全數退返，換一塊三職業板。揀咗唔可以改。', 'At account Lv 40 with Tier 25 cleared you can Ascend and pick a third class: an extra bonus plus an Echo after every Signature. Your skill tree gains a third-class layer. Everything spent on the old mixed board comes back and you get a three-class board. The choice is final.') },
  repeat: { icon: '🔁', text: tr('通關之後可以開「自動再挑戰」：倒數 4 秒自動再打同一級，適合掛機刷裝備同材料。', 'After a clear you can turn on Auto-repeat: after a 4s countdown the same tier starts again, handy for farming gear and materials.') },
  gear: { icon: '🎒', text: tr('撳裝備睇詳情、裝備同強化。唔要嘅可以分解換金幣，或者用「🔁 交換」5 件換 1 件指定嘅。重要嘅記得 🔒 鎖定。', 'Tap gear to view, equip and upgrade it. Salvage spares for Coins, or use 🔁 Trade: 5 for 1 of your choice. 🔒 Lock what matters.') },
  worldboss: { icon: '🌍', text: tr('世界 Boss 每日領 3 次獎勵。打死自動領；打唔死可以免費再挑戰，或者用 1 張券按傷害領獎勵。打死仲有機會跌有名傳說。', 'World Boss: 3 rewards per day. Kill it to claim automatically; otherwise retry free, or use 1 ticket to claim by damage. Kills may drop a named Legendary.') },
} as const;
export type TipId = keyof typeof TIPS;

export const tipSeen = (s: SaveData, id: TipId) => s.tips.includes(id);
export function markTip(s: SaveData, id: TipId): void {
  if (!s.tips.includes(id)) { s.tips.push(id); writeSave(s); }
}

/** Inline tip card for the home tabs. Empty string when already seen. */
export function tipCard(s: SaveData, id: TipId): string {
  if (tipSeen(s, id)) return '';
  const t = TIPS[id];
  return `<div class="tipcard" data-tip="${id}"><span class="ic">${t.icon}</span><p>${t.text}</p><button data-tipok="${id}">${tr('知道喇', 'Got it')}</button></div>`;
}

/** Floating tip during a run (doesn't pause the game). */
export function showRunTip(root: HTMLElement, s: SaveData, id: TipId): void {
  if (tipSeen(s, id)) return;
  markTip(s, id);
  root.querySelector('.runtip')?.remove();
  const t = TIPS[id];
  const el = h(`<div class="runtip"><span class="ic">${t.icon}</span><p></p><button aria-label="${tr('關閉', 'Close')}">✕</button></div>`);
  el.querySelector('p')!.textContent = t.text;
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  el.querySelector('button')!.addEventListener('click', () => el.remove());
  root.appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

export function welcomeModal(s: SaveData, onClose: () => void): HTMLElement {
  const el = h(`
    <div class="screen dim modal">
      <div class="card welcome">
        <h2>${tr('歡迎嚟到地城', 'Welcome to the Dungeon')}</h2>
        <ol>
          <li>${tr('<b>揀職業</b>：戰士埋身斬、弓手遠程射、魔法師火球爆炸、死靈法師令敵人變亡靈幫手。之後可以隨時轉。', '<b>Pick a class</b>: Warrior slashes up close, Archer shoots from range, Mage fires exploding fireballs, Necromancer turns foes into Undead allies. Switch any time.')}</li>
          <li>${tr('<b>開始挑戰</b>：角色會自動打。你可以放低部電話，亦可以按住螢幕自己控制。', '<b>Start</b>: your hero fights on its own. Put the phone down, or hold the screen to take control.')}</li>
          <li>${tr('<b>變強</b>：通關開寶箱攞裝備，職業升級得技能點學技能樹，打怪收集嘅靈魂用嚟買專精同混合職業板，再挑戰更高級嘅地城。第 5 級之後可以覺醒同打世界 Boss。', '<b>Get stronger</b>: clear Dungeons for Chests and gear, level your class for skill-tree points, spend Souls on Mastery and mixed-class boards, then try higher tiers. After Tier 5 you can Awaken and fight the World Boss.')}</li>
        </ol>
        <p class="note">${tr('「出發」頁嘅新手任務會一步步帶你。', 'Starter quests on the Play tab will guide you step by step.')}</p>
        <button class="primary" data-act="ok">${tr('開始', 'Start')}</button>
      </div>
    </div>`);
  el.addEventListener('click', (ev) => {
    if (!(ev.target as HTMLElement).closest('button')) return;
    if (!s.tips.includes('welcome')) { s.tips.push('welcome'); writeSave(s); }
    el.remove();
    onClose();
  });
  return el;
}

// ---------- starter quests ----------
interface Quest { id: string; name: string; desc: string; reward: number; done: (s: SaveData) => boolean }

export const QUESTS: Quest[] = [
  { id: 'clear1', name: tr('第一次出擊', 'First Sortie'), desc: tr('通關第 1 級地城', 'Clear the Tier 1 dungeon'), reward: 100, done: (s) => s.highestCleared >= 1 },
  { id: 'skill', name: tr('學第一個技能', 'First Skill'), desc: tr('去「🌳 技能」頁用技能點學 1 個技能', 'Learn 1 skill with a skill point on the 🌳 Skills tab'), reward: 100, done: (s) => s.board.length > 0 || Object.values(s.trees ?? {}).some((t) => Object.keys(t?.ranks ?? {}).length > 0) },
  { id: 'equip', name: tr('著上裝備', 'Gear Up'), desc: tr('喺「🎒 裝備」頁裝備一件裝備', 'Equip an item on the 🎒 Gear tab'), reward: 150, done: (s) => Object.values(s.equipped).some(Boolean) },
  { id: 'clear3', name: tr('深入地城', 'Deeper Down'), desc: tr('通關第 3 級地城', 'Clear the Tier 3 dungeon'), reward: 300, done: (s) => s.highestCleared >= 3 },
  { id: 'upgrade', name: tr('強化裝備', 'Upgrade Gear'), desc: tr('將一件裝備強化到 +3', 'Upgrade an item to +3'), reward: 400, done: (s) => s.items.some((i) => i.plus >= 3) },
  { id: 'clear5', name: tr('覺醒之路', 'Road to Awaken'), desc: tr('通關第 5 級地城（解鎖覺醒同世界 Boss）', 'Clear Tier 5 (unlocks Awaken and World Boss)'), reward: 800, done: (s) => s.highestCleared >= 5 },
  { id: 'awaken', name: tr('覺醒', 'Awaken'), desc: tr('喺「出發」頁揀第二職業', 'Pick a second class on the Play tab'), reward: 500, done: (s) => Object.keys(s.subClass).length > 0 },
  { id: 'worldboss', name: tr('挑戰世界 Boss', 'World Boss'), desc: tr('打一次世界 Boss', 'Fight the World Boss once'), reward: 800, done: (s) => s.wbFights > 0 },
  { id: 'ult', name: tr('終極力量', 'Ultimate Power'), desc: tr('喺「⚡ 終極」頁解鎖一個終極技', 'Unlock an Ultimate on the ⚡ Ultimate tab'), reward: 1000, done: (s) => Object.values(s.ults ?? {}).some((v) => (v as number) > 0) },
  { id: 'clear10', name: tr('地城老手', 'Dungeon Veteran'), desc: tr('通關第 10 級地城', 'Clear the Tier 10 dungeon'), reward: 2000, done: (s) => s.highestCleared >= 10 },
  { id: 'clear15', name: tr('突破守關', 'Gatebreaker'), desc: tr('通關第 15 級守關地城', 'Clear the Tier 15 gate dungeon'), reward: 4000, done: (s) => s.highestCleared >= 15 },
  { id: 'clear20', name: tr('深淵挑戰者', 'Abyss Challenger'), desc: tr('通關第 20 級守關地城', 'Clear the Tier 20 gate dungeon'), reward: 8000, done: (s) => s.highestCleared >= 20 },
  { id: 'ascend', name: tr('昇華', 'Ascend'), desc: tr('帳號 Lv 40 + 通關第 25 級之後，喺「出發」頁揀第三職業', 'At account Lv 40 with Tier 25 cleared, pick a third class on the Play tab'), reward: 15000, done: (s) => Object.keys(s.subClass2 ?? {}).length > 0 },
];

export const currentQuest = (s: SaveData) => QUESTS.find((q) => !s.quests.includes(q.id)) ?? null;

export function questCard(s: SaveData): string {
  const q = currentQuest(s);
  if (!q) return '';
  const done = q.done(s);
  const n = s.quests.length;
  return `<div class="card quest ${done ? 'done' : ''}">
    <div class="statline"><h3 style="margin:0">📜 ${tr('新手任務', 'Starter Quest')} ${n + 1}/${QUESTS.length}</h3><span class="reward">🪙 ${q.reward}</span></div>
    <div class="qname">${done ? '✅ ' : ''}${q.name}</div>
    <small>${q.desc}</small>
    ${done ? `<button class="primary" data-act="claim" style="width:100%;margin-top:8px">${tr('領取獎勵', 'Claim reward')}</button>` : ''}
  </div>`;
}

export function claimQuest(s: SaveData): number {
  const q = currentQuest(s);
  if (!q || !q.done(s)) return 0;
  s.quests.push(q.id);
  s.coins += q.reward;
  writeSave(s);
  return q.reward;
}
