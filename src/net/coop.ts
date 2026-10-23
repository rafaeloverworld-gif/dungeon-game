// Co-op (2 players): the lobby, and the session the main loop reads while a co-op dungeon is running.
import type { Input, RunSetup, SimEvent } from '../sim/sim';
import type { SaveData } from '../save';
import { runSetup } from '../save';
import { h, esc } from '../ui/dom';
import { tr, getLang } from '../i18n';
import { CLASSES, type ClassId } from '../sim/classes';
import { biomeFor } from '../sim/config';
import { todaysBoss, WB_MIN_LEVEL, WORLD_BOSSES, type WorldBossId } from '../sim/worldboss';
import { onlineState } from '../online';
import { newCode, Room, type MemberInfo, type Transport } from './room';
import type { Snap } from './sync';

export type Setup = Omit<RunSetup, 'tier' | 'seed' | 'autoPickCards'>;

/** What the main loop needs from a connection (a Supabase room, or a local test link between two tabs). */
export interface Link {
  readonly code: string;
  readonly isHost: boolean;
  members: MemberInfo[];
  transport: Transport;
  onChange: (() => void) | null;
  onMessage: ((type: string, data: unknown) => void) | null;
  readonly peer: MemberInfo | null;
  send(t: string, d: unknown, fast?: boolean): void;
  update(info: Partial<Omit<MemberInfo, 'uid' | 'host'>>): void;
  close(): void;
}

export interface Session {
  link: Link;
  role: 'host' | 'guest';
  // host
  remoteInput: Input;
  lastInputAt: number;
  evBuf: SimEvent[];
  snapN: number;
  sendAt: number;
  // guest
  snaps: Snap[];
  inputAt: number;
  lastSnapAt: number;
}
export let session: Session | null = null;

/** Snapshots a second: direct link 12, relay 5 (the relay goes through Supabase and counts against its quota). */
export const snapRate = (s: Session) => (s.link.transport === 'p2p' ? 12 : 5);

// ---------- local test link (two tabs in one browser: add ?localroom to the address) ----------
class LocalLink implements Link {
  members: MemberInfo[] = [];
  transport: Transport = 'connecting';
  onChange: (() => void) | null = null;
  onMessage: ((type: string, data: unknown) => void) | null = null;
  private bc: BroadcastChannel;
  private me: MemberInfo;
  private others = new Map<string, MemberInfo>();
  private beat: number;
  constructor(readonly code: string, readonly isHost: boolean, info: Omit<MemberInfo, 'uid' | 'host'>) {
    this.me = { ...info, uid: `local-${Math.random().toString(36).slice(2, 8)}`, host: isHost };
    this.bc = new BroadcastChannel(`room-${code}`);
    this.bc.onmessage = (ev) => {
      const m = ev.data as { k: string; from: string; info?: MemberInfo; t?: string; d?: unknown };
      if (m.k === 'here' && m.info) {
        const isNew = !this.others.has(m.from);
        this.others.set(m.from, m.info);
        this.refresh();
        if (isNew) { this.bc.postMessage({ k: 'here', from: this.me.uid, info: this.me }); this.transport = 'p2p'; this.onChange?.(); this.onMessage?.('linkUp', 'p2p'); }
      } else if (m.k === 'bye') { this.others.delete(m.from); this.refresh(); this.onMessage?.('peerLeft', null); }
      else if (m.k === 'msg' && m.t) this.onMessage?.(m.t, m.d);
    };
    this.refresh();
    this.bc.postMessage({ k: 'here', from: this.me.uid, info: this.me });
    this.beat = window.setInterval(() => this.bc.postMessage({ k: 'here', from: this.me.uid, info: this.me }), 2000);
  }
  get peer(): MemberInfo | null { return [...this.others.values()][0] ?? null; }
  private refresh(): void { this.members = [this.me, ...this.others.values()]; this.onChange?.(); }
  send(t: string, d: unknown): void { this.bc.postMessage({ k: 'msg', from: this.me.uid, t, d }); }
  update(info: Partial<Omit<MemberInfo, 'uid' | 'host'>>): void { this.me = { ...this.me, ...info }; this.bc.postMessage({ k: 'here', from: this.me.uid, info: this.me }); }
  close(): void { clearInterval(this.beat); this.bc.postMessage({ k: 'bye', from: this.me.uid }); this.bc.close(); }
}
const localTest = () => /[?&]localroom\b/.test(location.search);

async function openLink(code: string, isHost: boolean, info: Omit<MemberInfo, 'uid' | 'host'>): Promise<Link> {
  if (localTest()) return new LocalLink(code, isHost, info);
  return Room.open(code, isHost, info);
}

export const coopAvailable = () => localTest() || !!onlineState().playerId;

// ---------- team (stays together between runs) ----------
export interface LobbyDeps {
  ui: HTMLElement;
  save: () => SaveData;
  start: (o: { tier: number; seed: number; host: Setup; guest: Setup; guestAutoPick: boolean; role: 'host' | 'guest'; wb?: WorldBossId }) => void;
  /** The team changed (teammate joined / left, setup arrived): redraw whatever shows it. */
  changed: () => void;
}
interface Team { link: Link; peerSetup: Setup | null; peerAutoPick: boolean; fresh: boolean; tier: number; mode: 'dungeon' | 'wb'; wbLevel: number }
export let team: Team | null = null;
let deps: LobbyDeps | null = null;

const myInfo = (save: SaveData) => ({ playerId: onlineState().playerId ?? (getLang() === 'en' ? 'Player' : '玩家'), classId: save.classId, maxTier: save.highestCleared + 1 });

/** Messages while not in a run (lobby, results screen, home). */
function teamMessage(t: string, data: unknown): void {
  const tm = team;
  if (!tm || !deps) return;
  const l = tm.link;
  if (t === 'linkUp' && !l.isHost) sendHello();
  else if (t === 'hello' && l.isHost) { const m = data as { setup: Setup; autoPick: boolean }; tm.peerSetup = m.setup; tm.peerAutoPick = m.autoPick; tm.fresh = true; }
  else if (t === 'peerLeft') { tm.peerSetup = null; tm.fresh = false; }
  else if (t === 'start' && !l.isHost) {
    const m = data as { tier: number; seed: number; host: Setup; guest: Setup; guestAutoPick: boolean; wb?: WorldBossId };
    document.querySelector('.coopmodal')?.closest('.modal')?.remove();
    beginSession('guest');
    deps.start({ ...m, role: 'guest' });
    return;
  }
  deps.changed();
}

/** Guest: tell the host your current gear / boards (sent on joining and after every run). */
function sendHello(): void {
  if (!team || !deps || team.link.isHost) return;
  const save = deps.save();
  team.link.send('hello', { setup: runSetup(save), autoPick: save.autoPickCards });
  team.link.update(myInfo(save));
}

function beginSession(role: 'host' | 'guest'): void {
  if (!team) return;
  session = { link: team.link, role, remoteInput: { x: 0, z: 0, manual: false }, lastInputAt: 0, evBuf: [], snapN: 0, sendAt: 0, snaps: [], inputAt: 0, lastSnapAt: performance.now() };
}

/** Highest tier both players can play. */
export function teamMaxTier(save: SaveData): number {
  const peer = team?.link.peer;
  return Math.min(save.highestCleared + 1, peer ? peer.maxTier : Infinity);
}
/** Host: is the teammate there with an up-to-date setup? */
export const teamReady = () => !!team && team.link.isHost && !!team.link.peer && team.link.transport !== 'connecting' && !!team.peerSetup;

/** Host: start a run for the whole team. Waits (up to 5 s) for the guest's post-run gear first. */
export function teamStart(tier: number, wb?: WorldBossId): boolean {
  const tm = team;
  if (!tm || !deps || !teamReady()) return false;
  const go = () => {
    if (!team || !deps || !tm.peerSetup) return;
    const msg = { tier, seed: (Math.random() * 2 ** 31) | 0, host: runSetup(deps.save()), guest: tm.peerSetup, guestAutoPick: tm.peerAutoPick, wb };
    tm.fresh = false;
    if (wb) tm.wbLevel = tier; else tm.tier = tier;
    tm.link.send('start', msg);
    document.querySelector('.coopmodal')?.closest('.modal')?.remove();
    beginSession('host');
    deps.start({ ...msg, role: 'host' });
  };
  if (tm.fresh) go();
  else { const t0 = performance.now(); const wait = () => { if (!team) return; if (tm.fresh || performance.now() - t0 > 5000) go(); else setTimeout(wait, 150); }; wait(); }
  return true;
}

/** A co-op run ended: keep the team, go back to listening for the next start. */
export function afterRun(): void {
  session = null;
  if (!team) return;
  team.link.onMessage = teamMessage;
  if (team.link.isHost) team.link.update(myInfo(deps!.save()));
  else setTimeout(sendHello, 300); // after this phone has added its rewards
}

export function leaveTeam(): void {
  session = null;
  team?.link.close();
  team = null;
  deps?.changed();
}

// ---------- lobby ----------
export function showCoopLobby(d: LobbyDeps): void {
  deps = d;
  const EN = getLang() === 'en';
  let busy = false;
  let error = '';
  const el = h(`<div class="screen dim modal"></div>`);
  const cls = (id: string) => CLASSES[id as ClassId] ? `${CLASSES[id as ClassId].icon} ${CLASSES[id as ClassId].name}` : '';
  const changedBefore = d.changed;
  d.changed = () => { if (el.isConnected) draw(); changedBefore(); };

  const draw = () => {
    const save = d.save();
    const tm = team;
    if (!tm) {
      el.innerHTML = `<div class="card coopmodal">
        <h2 style="margin:0 0 4px">🤝 ${tr('合作模式（2 人）', 'Co-op (2 players)')}</h2>
        <p class="sub" style="margin:0 0 12px">${tr('一個開房，另一個用房間碼入房。打完會留喺同一隊，可以一直一齊打。敵人血量 ×1.7，每個人都攞足獎勵。', 'One player opens a room, the other joins with its code. You stay a team between runs. Enemies have ×1.7 HP; everyone gets full rewards.')}</p>
        <button class="primary" data-act="host" style="width:100%;margin-bottom:12px" ${busy ? 'disabled' : ''}>${tr('開房', 'Open a room')}</button>
        <input id="coopcode" class="olin codein" maxlength="4" autocapitalize="characters" placeholder="${tr('房間碼（4 個字母）', 'Room code (4 letters)')}">
        <button data-act="join" style="width:100%" ${busy ? 'disabled' : ''}>${tr('入房', 'Join')}</button>
        ${error ? `<p class="olerr">⚠️ ${esc(error)}</p>` : ''}
        <button class="ghost" data-act="close" style="width:100%;margin-top:10px">${tr('關閉', 'Close')}</button></div>`;
      return;
    }
    const l = tm.link;
    const peer = l.peer;
    const maxTier = teamMaxTier(save);
    tm.tier = Math.min(Math.max(1, tm.tier), maxTier);
    const net = l.transport === 'p2p' ? tr('🟢 直連', '🟢 Direct link') : l.transport === 'relay' ? tr('🟡 經伺服器（慢少少）', '🟡 Via server (a bit slower)') : tr('⏳ 連接緊', '⏳ Connecting');
    el.innerHTML = `<div class="card coopmodal">
      <h2 style="margin:0 0 4px">🤝 ${tr('房間', 'Room')} <span class="roomcode">${l.code}</span></h2>
      <p class="sub" style="margin:0 0 10px">${l.isHost ? (peer ? tr('揀地城等級，撳開始。', 'Pick a tier and start.') : tr('將房間碼話畀隊友聽，等佢入房。', 'Tell your teammate the code and wait for them to join.')) : tr('等主機揀地城同開始。你可以閂咗呢個畫面，主機一開始你就會自動入地城。', 'Waiting for the host to start. You can close this; you will join automatically when the host starts.')}</p>
      <div class="members">${l.members.map((m) => `<div class="brow ${m.host ? 'me' : ''}"><b class="brank">${m.host ? '👑' : '🤝'}</b><span class="bname"><b>${esc(m.playerId)}</b><small>${cls(m.classId)} · ${tr('最高可打', 'Up to')} ${EN ? `Tier ${m.maxTier}` : `第 ${m.maxTier} 級`}</small></span></div>`).join('')}
        ${peer ? '' : `<div class="brow"><span class="bname"><small>${tr('等緊隊友…', 'Waiting for a teammate…')}</small></span></div>`}</div>
      <p class="note" style="margin:8px 0">${peer ? net : ''}</p>
      ${l.isHost ? `<div class="seg" style="margin-bottom:8px"><button data-mode="dungeon" class="${tm.mode === 'dungeon' ? 'on' : ''}" style="flex:1">🏰 ${tr('地城', 'Dungeon')}</button><button data-mode="wb" class="${tm.mode === 'wb' ? 'on' : ''}" style="flex:1">🌍 ${tr('世界 Boss', 'World Boss')}</button></div>
        ${tm.mode === 'wb' ? (() => { const wb = WORLD_BOSSES[todaysBoss()]; const wbMax = Math.max(WB_MIN_LEVEL, maxTier - 1); tm.wbLevel = Math.min(Math.max(WB_MIN_LEVEL, tm.wbLevel), wbMax); return `<div class="tier"><button data-tier="-1" ${tm.wbLevel <= WB_MIN_LEVEL ? 'disabled' : ''}>◀</button>
        <div style="text-align:center"><div class="val">${wb.icon} Lv ${tm.wbLevel}</div><small>${wb.name} · ${tr('兩個人都打得到嘅最高：', 'Highest both can play: ')}Lv ${wbMax}<br>${tr('每人各自用自己嘅挑戰券領獎；傷害計全隊', 'Each player claims with their own ticket; damage counts for the team')}</small></div>
        <button data-tier="1" ${tm.wbLevel >= wbMax ? 'disabled' : ''}>▶</button></div>`; })() : `<div class="tier"><button data-tier="-1" ${tm.tier <= 1 ? 'disabled' : ''}>◀</button>
        <div style="text-align:center"><div class="val">${EN ? `Tier ${tm.tier}` : `第 ${tm.tier} 級`}</div><small>${biomeFor(tm.tier).icon} ${biomeFor(tm.tier).name} · ${tr('兩個人都打得到嘅最高：', 'Highest both can play: ')}${maxTier}</small></div>
        <button data-tier="1" ${tm.tier >= maxTier ? 'disabled' : ''}>▶</button></div>`}
        <button class="primary" data-act="coopstart" style="width:100%;margin-top:10px" ${teamReady() ? '' : 'disabled'}>${tr('開始', 'Start')}</button>` : ''}
      <button data-act="hide" style="width:100%;margin-top:8px">${tr('閂咗呢個畫面（留喺隊伍）', 'Close (stay in the team)')}</button>
      <button class="ghost" data-act="leave" style="width:100%;margin-top:8px">${tr('離開隊伍', 'Leave the team')}</button></div>`;
  };

  el.addEventListener('click', async (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b || busy) return;
    if (b.dataset.act === 'close' || b.dataset.act === 'hide') { el.remove(); d.changed = changedBefore; changedBefore(); return; }
    if (b.dataset.act === 'leave') { leaveTeam(); draw(); return; }
    if (b.dataset.tier && team) { if (team.mode === 'wb') team.wbLevel += Number(b.dataset.tier); else team.tier += Number(b.dataset.tier); draw(); return; }
    if (b.dataset.mode && team) { team.mode = b.dataset.mode as 'dungeon' | 'wb'; draw(); return; }
    if (b.dataset.act === 'host' || b.dataset.act === 'join') {
      const code = b.dataset.act === 'host' ? newCode() : ((el.querySelector('#coopcode') as HTMLInputElement | null)?.value ?? '').trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { error = tr('房間碼係 4 個英文字母', 'The room code is 4 letters'); draw(); return; }
      busy = true; error = ''; draw();
      try {
        const save = d.save();
        const l = await openLink(code, b.dataset.act === 'host', myInfo(save));
        team = { link: l, peerSetup: null, peerAutoPick: true, fresh: false, tier: Math.min(save.selectedTier, save.highestCleared + 1), mode: 'dungeon', wbLevel: Math.max(WB_MIN_LEVEL, save.wbLevel) };
        l.onChange = () => d.changed();
        l.onMessage = teamMessage;
      } catch { error = tr('連唔到伺服器，再試一次', "Can't reach the server, try again"); }
      busy = false; draw();
      return;
    }
    if (b.dataset.act === 'coopstart' && team) { d.changed = changedBefore; if (team.mode === 'wb') teamStart(team.wbLevel, todaysBoss()); else teamStart(team.tier); }
  });
  d.ui.appendChild(el);
  draw();
}
