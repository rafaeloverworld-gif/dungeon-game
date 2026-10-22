// Online account (Supabase): player ID + password, cloud save, leaderboard scores.
// Accounts start anonymous; picking an ID and password turns them into a login that works on any device.
// Behind the scenes the login email is made up from the account id (no real email is ever sent),
// so in Supabase "Confirm email" must be switched off.
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { SaveData } from './save';

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
      user_id: uid, player_id: playerId, class_id: s.classId, best_tier: s.highestCleared, account_level: s.level,
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
