// Co-op rooms: a 4-letter code, a lobby (Supabase Realtime presence), and a data link between the two phones.
// The link is a direct WebRTC connection when the networks allow it; otherwise messages go through
// Supabase Realtime ("relay"), which is slower and counts against the free plan, so snapshots are sent less often.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { myUid, supa } from '../online';

export interface MemberInfo { uid: string; playerId: string; host: boolean; classId: string; maxTier: number }
export type Transport = 'connecting' | 'p2p' | 'relay';
type Handler = (type: string, data: unknown) => void;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O (look like 1 / 0)
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const P2P_WAIT = 9000; // ms to wait for a direct link before using the relay

export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export class Room {
  readonly code: string;
  readonly isHost: boolean;
  members: MemberInfo[] = [];
  transport: Transport = 'connecting';
  onChange: (() => void) | null = null;
  onMessage: Handler | null = null;
  private ch: RealtimeChannel | null = null;
  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null; // reliable, ordered (start, cards, end)
  private fast: RTCDataChannel | null = null; // unreliable (snapshots, inputs)
  private me: MemberInfo;
  private p2pTimer: number | undefined;
  private closed = false;
  private peerUid: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];

  private constructor(code: string, isHost: boolean, me: MemberInfo) {
    this.code = code;
    this.isHost = isHost;
    this.me = me;
  }

  /** Open a room (host) or join one by code (guest). Resolves once the lobby is connected. */
  static async open(code: string, isHost: boolean, info: Omit<MemberInfo, 'uid' | 'host'>): Promise<Room> {
    const uid = myUid();
    if (!uid) throw new Error('not signed in');
    const room = new Room(code.toUpperCase(), isHost, { ...info, uid, host: isHost });
    await room.connect();
    return room;
  }

  get peer(): MemberInfo | null { return this.members.find((m) => m.uid !== this.me.uid) ?? null; }

  private connect(): Promise<void> {
    const ch = supa().channel(`room-${this.code}`, { config: { broadcast: { self: false }, presence: { key: this.me.uid } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<MemberInfo>();
      this.members = Object.values(state).map((arr) => arr[0]).filter(Boolean).slice(0, 4) as MemberInfo[];
      const peer = this.peer;
      if (peer && peer.uid !== this.peerUid) { this.peerUid = peer.uid; this.startLink(); }
      else if (peer && !this.pc && this.transport !== 'relay') this.startLink();
      if (!peer && this.peerUid) { this.peerUid = null; this.dropLink(); this.onMessage?.('peerLeft', null); }
      this.onChange?.();
    });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => this.receive(payload as { to?: string; t: string; d: unknown }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 12000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); await ch.track(this.me); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(status)); }
      });
    });
  }

  // ---------- the data link ----------
  private startLink(): void {
    this.dropLink();
    this.transport = 'connecting';
    this.onChange?.();
    if (typeof RTCPeerConnection === 'undefined') { this.useRelay(); return; }
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (ev) => { if (ev.candidate) this.signal('ice', ev.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && this.transport !== 'relay') this.useRelay();
    };
    const wire = (dc: RTCDataChannel) => {
      if (dc.label === 'ctl') this.ctl = dc; else this.fast = dc;
      dc.onmessage = (ev) => { try { const m = JSON.parse(ev.data as string); this.onMessage?.(m.t, m.d); } catch { /* ignore a bad packet */ } };
      dc.onopen = () => { if (this.ctl?.readyState === 'open' && this.fast?.readyState === 'open') this.linkUp(); };
    };
    if (this.isHost) {
      wire(pc.createDataChannel('ctl', { ordered: true }));
      wire(pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
      void (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.signal('sdp', pc.localDescription?.toJSON());
      })();
    } else pc.ondatachannel = (ev) => wire(ev.channel);
    this.p2pTimer = window.setTimeout(() => { if (this.transport === 'connecting') this.useRelay(); }, P2P_WAIT);
  }

  private linkUp(): void {
    clearTimeout(this.p2pTimer);
    this.transport = 'p2p';
    this.onChange?.();
    this.onMessage?.('linkUp', 'p2p');
  }

  private useRelay(): void {
    clearTimeout(this.p2pTimer);
    if (this.transport === 'relay') return;
    this.transport = 'relay';
    this.onChange?.();
    this.onMessage?.('linkUp', 'relay');
  }

  private dropLink(): void {
    clearTimeout(this.p2pTimer);
    this.pendingIce = [];
    try { this.ctl?.close(); this.fast?.close(); this.pc?.close(); } catch { /* already closed */ }
    this.ctl = this.fast = null; this.pc = null;
  }

  private signal(kind: 'sdp' | 'ice', data: unknown): void {
    void this.ch?.send({ type: 'broadcast', event: 'm', payload: { to: this.peerUid, from: this.me.uid, t: `rtc:${kind}`, d: data } });
  }

  private async receive(msg: { to?: string; from?: string; t: string; d: unknown }): Promise<void> {
    if (msg.to && msg.to !== this.me.uid) return;
    // the host's offer can arrive before this phone has seen the host in the lobby
    if (msg.t.startsWith('rtc:') && !this.pc && !this.isHost && msg.from) { this.peerUid = msg.from; this.startLink(); }
    if (msg.t === 'rtc:sdp' && this.pc) {
      const desc = msg.d as RTCSessionDescriptionInit;
      try {
        await this.pc.setRemoteDescription(desc);
        for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => undefined);
        if (desc.type === 'offer') {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.signal('sdp', this.pc.localDescription?.toJSON());
        }
      } catch { this.useRelay(); }
      return;
    }
    if (msg.t === 'rtc:ice' && this.pc) {
      if (!this.pc.remoteDescription) { this.pendingIce.push(msg.d as RTCIceCandidateInit); return; }
      try { await this.pc.addIceCandidate(msg.d as RTCIceCandidateInit); } catch { /* late candidate */ }
      return;
    }
    this.onMessage?.(msg.t, msg.d);
  }

  /** Send to the other player. fast = may be dropped (snapshots, inputs); otherwise reliable. */
  send(t: string, d: unknown, fast = false): void {
    if (this.closed) return;
    const dc = fast ? this.fast : this.ctl;
    if (this.transport === 'p2p' && dc?.readyState === 'open') {
      try { dc.send(JSON.stringify({ t, d })); return; } catch { /* fall through to the relay */ }
    }
    void this.ch?.send({ type: 'broadcast', event: 'm', payload: { to: this.peerUid ?? undefined, t, d } });
  }

  /** Update what the lobby shows about you (class, tier you can play). */
  update(info: Partial<Omit<MemberInfo, 'uid' | 'host'>>): void {
    this.me = { ...this.me, ...info };
    void this.ch?.track(this.me);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.dropLink();
    const ch = this.ch;
    this.ch = null;
    if (ch) { void ch.untrack().finally(() => supa().removeChannel(ch)); }
  }
}
