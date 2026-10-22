// Co-op (2 players): the lobby, and the session the main loop reads while a co-op dungeon is running.
import type { Input, RunSetup, SimEvent } from '../sim/sim';
import type { SaveData } from '../save';
import { runSetup } from '../save';
import { h, esc } from '../ui/dom';
import { tr, getLang } from '../i18n';
import { CLASSES, type ClassId } from '../sim/classes';
import { biomeFor } from '../sim/config';
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
export function endSession(): void { session?.link.close(); session = null; }

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

// ---------- lobby ----------
export interface LobbyDeps {
  ui: HTMLElement;
  save: () => SaveData;
  start: (o: { tier: number; seed: number; host: Setup; guest: Setup; guestAutoPick: boolean; role: 'host' | 'guest' }) => void;
}

export function showCoopLobby(d: LobbyDeps): void {
  const EN = getLang() === 'en';
  const save = d.save();
  const myMax = save.highestCleared + 1;
  let link: Link | null = null;
  let busy = false;
  let error = '';
  let peerSetup: Setup | null = null;
  let peerAutoPick = true;
  let tier = Math.min(save.selectedTier, myMax);
  const el = h(`<div class="screen dim modal"></div>`);
  const info = () => ({ playerId: onlineState().playerId ?? (EN ? 'Player' : '玩家'), classId: save.classId, maxTier: myMax });
  const cls = (id: string) => CLASSES[id as ClassId] ? `${CLASSES[id as ClassId].icon} ${CLASSES[id as ClassId].name}` : '';

  const draw = () => {
    if (!link) {
      el.innerHTML = `<div class="card coopmodal">
        <h2 style="margin:0 0 4px">🤝 ${tr('合作模式（2 人）', 'Co-op (2 players)')}</h2>
        <p class="sub" style="margin:0 0 12px">${tr('一個開房，另一個用房間碼入房。敵人血量 ×1.7，每個人都攞足獎勵。', 'One player opens a room, the other joins with its code. Enemies have ×1.7 HP; everyone gets full rewards.')}</p>
        <button class="primary" data-act="host" style="width:100%;margin-bottom:12px" ${busy ? 'disabled' : ''}>${tr('開房', 'Open a room')}</button>
        <input id="coopcode" class="olin codein" maxlength="4" autocapitalize="characters" placeholder="${tr('房間碼（4 個字母）', 'Room code (4 letters)')}">
        <button data-act="join" style="width:100%" ${busy ? 'disabled' : ''}>${tr('入房', 'Join')}</button>
        ${error ? `<p class="olerr">⚠️ ${esc(error)}</p>` : ''}
        <button class="ghost" data-act="close" style="width:100%;margin-top:10px">${tr('關閉', 'Close')}</button></div>`;
      return;
    }
    const peer = link.peer;
    const maxTier = peer ? Math.min(myMax, peer.maxTier) : myMax;
    tier = Math.min(Math.max(1, tier), maxTier);
    const net = link.transport === 'p2p' ? tr('🟢 直連', '🟢 Direct link') : link.transport === 'relay' ? tr('🟡 經伺服器（慢少少）', '🟡 Via server (a bit slower)') : tr('⏳ 連接緊', '⏳ Connecting');
    const ready = !!peer && link.transport !== 'connecting' && (!link.isHost || !!peerSetup);
    el.innerHTML = `<div class="card coopmodal">
      <h2 style="margin:0 0 4px">🤝 ${tr('房間', 'Room')} <span class="roomcode">${link.code}</span></h2>
      <p class="sub" style="margin:0 0 10px">${link.isHost ? tr('將房間碼話畀隊友聽，等佢入房。', 'Tell your teammate the code and wait for them to join.') : tr('等主機揀地城同開始。', 'Waiting for the host to pick a dungeon and start.')}</p>
      <div class="members">${link.members.map((m) => `<div class="brow ${m.host ? 'me' : ''}"><b class="brank">${m.host ? '👑' : '🤝'}</b><span class="bname"><b>${esc(m.playerId)}</b><small>${cls(m.classId)} · ${tr('最高可打', 'Up to')} ${EN ? `Tier ${m.maxTier}` : `第 ${m.maxTier} 級`}</small></span></div>`).join('')}
        ${peer ? '' : `<div class="brow"><span class="bname"><small>${tr('等緊隊友…', 'Waiting for a teammate…')}</small></span></div>`}</div>
      <p class="note" style="margin:8px 0">${peer ? net : ''}</p>
      ${link.isHost ? `<div class="tier"><button data-tier="-1" ${tier <= 1 ? 'disabled' : ''}>◀</button>
        <div style="text-align:center"><div class="val">${EN ? `Tier ${tier}` : `第 ${tier} 級`}</div><small>${biomeFor(tier).icon} ${biomeFor(tier).name} · ${tr('兩個人都打得到嘅最高：', 'Highest both can play: ')}${maxTier}</small></div>
        <button data-tier="1" ${tier >= maxTier ? 'disabled' : ''}>▶</button></div>
        <button class="primary" data-act="coopstart" style="width:100%;margin-top:10px" ${ready ? '' : 'disabled'}>${tr('開始', 'Start')}</button>` : ''}
      <button class="ghost" data-act="leave" style="width:100%;margin-top:8px">${tr('離開房間', 'Leave room')}</button></div>`;
  };

  const wire = (l: Link) => {
    link = l;
    l.onChange = () => { if (el.isConnected) draw(); };
    l.onMessage = (t, data) => {
      if (t === 'linkUp' && !l.isHost) l.send('hello', { setup: runSetup(d.save()), autoPick: d.save().autoPickCards });
      else if (t === 'hello' && l.isHost) { const m = data as { setup: Setup; autoPick: boolean }; peerSetup = m.setup; peerAutoPick = m.autoPick; draw(); }
      else if (t === 'peerLeft') { peerSetup = null; draw(); }
      else if (t === 'start' && !l.isHost) {
        const m = data as { tier: number; seed: number; host: Setup; guest: Setup; guestAutoPick: boolean };
        el.remove();
        begin(l, 'guest');
        d.start({ ...m, role: 'guest' });
      }
    };
    draw();
  };
  const begin = (l: Link, role: 'host' | 'guest') => {
    session = { link: l, role, remoteInput: { x: 0, z: 0, manual: false }, lastInputAt: 0, evBuf: [], snapN: 0, sendAt: 0, snaps: [], inputAt: 0, lastSnapAt: performance.now() };
  };

  el.addEventListener('click', async (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b || busy) return;
    if (b.dataset.act === 'close') { el.remove(); return; }
    if (b.dataset.act === 'leave') { link?.close(); link = null; peerSetup = null; draw(); return; }
    if (b.dataset.tier) { tier += Number(b.dataset.tier); draw(); return; }
    if (b.dataset.act === 'host' || b.dataset.act === 'join') {
      const code = b.dataset.act === 'host' ? newCode() : ((el.querySelector('#coopcode') as HTMLInputElement | null)?.value ?? '').trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { error = tr('房間碼係 4 個英文字母', 'The room code is 4 letters'); draw(); return; }
      busy = true; error = ''; draw();
      try { wire(await openLink(code, b.dataset.act === 'host', info())); }
      catch { error = tr('連唔到伺服器，再試一次', "Can't reach the server, try again"); }
      busy = false; draw();
      return;
    }
    if (b.dataset.act === 'coopstart' && link?.isHost && peerSetup) {
      const host = runSetup(d.save());
      const seed = (Math.random() * 2 ** 31) | 0;
      const msg = { tier, seed, host, guest: peerSetup, guestAutoPick: peerAutoPick };
      link.send('start', msg);
      el.remove();
      begin(link, 'host');
      d.start({ ...msg, role: 'host' });
    }
  });
  d.ui.appendChild(el);
  draw();
}
