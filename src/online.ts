// Online account (Supabase): player ID + password, cloud save, leaderboard scores.
// Accounts start anonymous; picking an ID and password turns them into a login that works on any device.
// Behind the scenes the login email is made up from the account id (no real email is ever sent),
// so in Supabase "Confirm email" must be switched off.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { mixOf, type SaveData } from './save';
import { dayKey } from './sim/worldboss';
import type { ClassId } from './sim/classes';

const URL = 'https://fqxaozbgvwxsubjhgdtd.supabase.co';
const KEY = 'sb_publishable_SxvAQ11ZL5gGrPGpK3VDhQ_HH6iC9Hj'; // publishable: safe in the page, the tables are locked by RLS
const MAIL_DOMAIN = 'players.onlyadungeon.app';

/** Same rule as the database: 3–16 letters, digits, Chinese characters, _ or -. */
export const ID_RULE = /^[A-Za-z0-9_一-鿿-]{3,16}$/;
export const PASSWORD_MIN = 6;

let sb: SupabaseClient | null = null;
let session: Session | null = null;
let playerId: string | null = null;
let lastSync = 0;
let status: 'off' | 'idle' | 'syncing' | 'error' = 'off';

/** Online play needs a normal web page (GitHub Pages / dev server), not the Claude preview or a file. */
export const onlineSupported = (): boolean =>
  location.protocol.startsWith('http') && !(window as unknown as { claude?: unknown }).claude;

function client(): SupabaseClient {
  if (!sb) sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'website-game-auth' } });
  return sb;
}

export const onlineState = () => ({ signedIn: !!session, playerId, lastSync, status, hasPassword: !!session?.user.email });

export interface RemoteSave { json: string; updatedAt: number }

/** On start-up: restore the session (if any) and fetch the cloud save. */
export async function onlineConnect(): Promise<RemoteSave | null> {
  if (!onlineSupported()) return null;
  try {
    const { data } = await timeout(client().auth.getSession());
    session = data.session;
    if (!session) return null;
    status = 'idle';
    await loadProfile();
    return await fetchSave();
  } catch {
    status = 'error';
    return null;
  }
}

async function loadProfile(): Promise<void> {
  if (!session) return;
  const { data } = await client().from('profiles').select('player_id').eq('id', session.user.id).maybeSingle();
  playerId = (data?.player_id as string | undefined) ?? null;
}

async function fetchSave(): Promise<RemoteSave | null> {
  if (!session) return null;
  const { data, error } = await client().from('saves').select('data, updated_at').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data.data as { json?: string; updatedAt?: number };
  return typeof d?.json === 'string' ? { json: d.json, updatedAt: d.updatedAt ?? Date.parse(data.updated_at as string) } : null;
}

/** Give up on a request after a while (a dead connection shouldn't freeze the buttons). */
function timeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export type AccountError = 'badId' | 'taken' | 'badPassword' | 'network' | 'wrongLogin' | 'noAccount' | 'unknown';
/** detail: the server's own message, shown so problems can be diagnosed. */
const fail = (e: AccountError, detail?: string) => ({ ok: false as const, error: e, detail });

/** New account: ID + password. Starts an anonymous session, claims the ID, then sets the login. */
export function createAccount(id: string, password: string): Promise<{ ok: true } | { ok: false; error: AccountError; detail?: string }> {
  return timeout(createAccountNow(id, password)).catch(() => fail('network'));
}
async function createAccountNow(id: string, password: string): Promise<{ ok: true } | { ok: false; error: AccountError; detail?: string }> {
  if (!ID_RULE.test(id)) return fail('badId');
  if (password.length < PASSWORD_MIN) return fail('badPassword');
  try {
    const c = client();
    // is the ID free? (checked again by the database's unique index)
    const { data: clash } = await c.from('profiles').select('id').ilike('player_id', id.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (clash && clash.id !== session?.user.id) return fail('taken');
    if (!session) {
      const { data, error } = await c.auth.signInAnonymously();
      if (error || !data.session) return fail('network', `anon: ${error?.status ?? ''} ${error?.message ?? 'no session'}`);
      session = data.session;
    }
    const { error: pe } = await c.from('profiles').upsert({ id: session.user.id, player_id: id });
    if (pe) return pe.code === '23505' ? fail('taken') : fail('unknown', `profile: ${pe.code ?? ''} ${pe.message}`);
    playerId = id;
    const { data: up, error: ue } = await c.auth.updateUser({ email: `${session.user.id}@${MAIL_DOMAIN}`, password });
    if (ue) return fail('unknown', `login: ${ue.status ?? ''} ${ue.message}`);
    if (up.user) session = { ...session, user: up.user };
    status = 'idle';
    return { ok: true };
  } catch (e) {
    return fail('network', (e as Error)?.message);
  }
}

/** Log in on another device with ID + password. Returns the cloud save (if any). */
export function login(id: string, password: string): Promise<{ ok: true; remote: RemoteSave | null } | { ok: false; error: AccountError; detail?: string }> {
  return timeout(loginNow(id, password)).catch(() => fail('network'));
}
async function loginNow(id: string, password: string): Promise<{ ok: true; remote: RemoteSave | null } | { ok: false; error: AccountError; detail?: string }> {
  try {
    const c = client();
    const { data: prof } = await c.from('profiles').select('id, player_id').ilike('player_id', id.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (!prof) return fail('noAccount');
    const { data, error } = await c.auth.signInWithPassword({ email: `${prof.id}@${MAIL_DOMAIN}`, password });
    if (error || !data.session) return fail('wrongLogin');
    session = data.session;
    playerId = prof.player_id as string;
    status = 'idle';
    return { ok: true, remote: await fetchSave() };
  } catch (e) {
    return fail('network', (e as Error)?.message);
  }
}

export async function logout(): Promise<void> {
  try { await client().auth.signOut(); } catch { /* offline: the local session is cleared anyway */ }
  session = null; playerId = null; status = 'off';
}

// ---------- uploads (batched: at most one every few seconds) ----------
let pending: SaveData | null = null;
let timer: number | undefined;
let pushing = false;

async function flush(): Promise<void> {
  if (!session || !playerId || !pending || pushing) return;
  const s = pending;
  pending = null;
  pushing = true;
  status = 'syncing';
  try {
    const c = client();
    const uid = session.user.id;
    const { error } = await c.from('saves').upsert({ user_id: uid, data: { json: JSON.stringify(s), updatedAt: s.updatedAt }, save_version: s.version ?? 1, updated_at: new Date(s.updatedAt || Date.now()).toISOString() });
    if (error) throw error;
    await c.from('scores').upsert({
      user_id: uid, player_id: playerId, class_id: s.classId, mix_name: mixOf(s)?.id ?? null, best_tier: s.highestCleared, account_level: s.level,
      updated_at: new Date().toISOString(),
    });
    lastSync = Date.now();
    status = 'idle';
  } catch {
    pending = pending ?? s;
    status = 'error';
  }
  pushing = false;
  if (pending) schedule();
}

function schedule(): void {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => { timer = undefined; void flush(); }, 5000);
}

/** Queue the latest save for upload. now = send straight away (leaving the page, after login). */
export function onlinePush(s: SaveData, now = false): void {
  if (!session || !playerId) return;
  pending = s;
  if (now) { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } void flush(); } else schedule();
}

// ---------- leaderboards ----------
export type BoardKind = 'all' | 'class' | 'wb';
export interface BoardRow { rank: number; playerId: string; classId: ClassId | null; mixId: string | null; bestTier: number; level: number; wbDamage: number; me: boolean }
export interface Board { rows: BoardRow[]; me: BoardRow | null }

/** Today's World Boss: keep this account's best fight of the day. score = boss level + share of its HP taken (0–0.999). */
export async function reportWorldBoss(damage: number): Promise<void> {
  if (!session || !playerId || !(damage > 0)) return;
  try {
    const c = client();
    const today = dayKey();
    const { data } = await c.from('scores').select('wb_day, wb_damage').eq('user_id', session.user.id).maybeSingle();
    if (data && data.wb_day === today && (data.wb_damage as number) >= damage) return;
    await c.from('scores').upsert({ user_id: session.user.id, player_id: playerId, wb_day: today, wb_damage: Math.round(damage * 1000) / 1000, updated_at: new Date().toISOString() });
  } catch { /* the board just misses this fight */ }
}

const toRow = (r: Record<string, unknown>, rank: number, uid: string | undefined): BoardRow => ({
  rank, playerId: String(r.player_id), classId: (r.class_id as ClassId | null) ?? null, mixId: (r.mix_name as string | null) ?? null,
  bestTier: Number(r.best_tier ?? 0), level: Number(r.account_level ?? 1), wbDamage: Number(r.wb_damage ?? 0), me: r.user_id === uid,
});

/** Top 50 plus your own place. class: only players whose main class is classId. wb: today's World Boss damage. */
export async function fetchBoard(kind: BoardKind, classId?: ClassId): Promise<Board | null> {
  try {
    const c = client();
    const uid = session?.user.id;
    const cols = 'user_id, player_id, class_id, mix_name, best_tier, account_level, wb_day, wb_damage';
    let q = c.from('scores').select(cols);
    if (kind === 'wb') q = q.eq('wb_day', dayKey()).gt('wb_damage', 0).order('wb_damage', { ascending: false });
    else {
      if (kind === 'class' && classId) q = q.eq('class_id', classId);
      q = q.gt('best_tier', 0).order('best_tier', { ascending: false }).order('account_level', { ascending: false }).order('updated_at', { ascending: true });
    }
    const { data, error } = await timeout(Promise.resolve(q.limit(50)));
    if (error || !data) return null;
    const rows = (data as Record<string, unknown>[]).map((r, i) => toRow(r, i + 1, uid));
    let me = rows.find((r) => r.me) ?? null;
    if (!me && uid) {
      // outside the top 50: work out the place by counting who is ahead
      const { data: mine } = await c.from('scores').select(cols).eq('user_id', uid).maybeSingle();
      const okKind = mine && (kind === 'wb' ? mine.wb_day === dayKey() && Number(mine.wb_damage) > 0 : Number(mine.best_tier) > 0 && (kind !== 'class' || mine.class_id === classId));
      if (mine && okKind) {
        let cq = c.from('scores').select('user_id', { count: 'exact', head: true });
        if (kind === 'wb') cq = cq.eq('wb_day', dayKey()).gt('wb_damage', Number(mine.wb_damage));
        else { if (kind === 'class' && classId) cq = cq.eq('class_id', classId); cq = cq.gt('best_tier', Number(mine.best_tier)); }
        const { count } = await cq;
        me = toRow(mine as Record<string, unknown>, (count ?? 0) + 1, uid);
      }
    }
    return { rows, me };
  } catch {
    return null;
  }
}

/** For the co-op rooms (net/room.ts): the shared client and who is signed in. */
export const supa = (): SupabaseClient => client();
export const myUid = (): string | null => session?.user.id ?? null;
