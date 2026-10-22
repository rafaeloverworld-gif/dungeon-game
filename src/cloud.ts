// Cloud save: when the game runs as a published Claude artifact, the save is also kept
// in the artifact's private per-person store, so the PC and the phone share progress.
// Anywhere else (the HTML file, npm run dev) this quietly does nothing.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Use = (name: string) => Promise<any>;
const claudeUse = (): Use | null => {
  const c = (window as unknown as { claude?: { use?: Use } }).claude;
  return c && typeof c.use === 'function' ? c.use.bind(c) : null;
};

export interface CloudDoc { json: string; updatedAt: number }

let ref: any = null;
let pending: CloudDoc | null = null;
let timer: number | undefined;
let pushing = false;

/** Connect and fetch the cloud copy. Resolves null when there is no cloud (or nothing saved yet). */
export async function cloudConnect(): Promise<CloudDoc | null> {
  const use = claudeUse();
  if (!use) return null;
  try {
    const [db, user] = await Promise.all([use('db'), use('user')]);
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    ref = db.collection(`data/users/${id}`).doc('save');
    const snap = await ref.get();
    const d = snap.exists ? snap.data() : undefined;
    if (d && typeof d.json === 'string' && typeof d.updatedAt === 'number') return { json: d.json, updatedAt: d.updatedAt };
  } catch {
    ref = null;
  }
  return null;
}

export const cloudReady = () => !!ref;

async function flush(): Promise<void> {
  if (!ref || !pending || pushing) return;
  const doc = pending;
  pending = null;
  pushing = true;
  try { await ref.set({ json: doc.json, updatedAt: doc.updatedAt }); } catch { pending = pending ?? doc; }
  pushing = false;
  if (pending) schedule();
}

function schedule(): void {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => { timer = undefined; void flush(); }, 4000);
}

/** Queue the latest save for upload (batched, at most one write every few seconds). */
export function cloudPush(json: string, updatedAt: number, now = false): void {
  if (!ref) return;
  pending = { json, updatedAt };
  if (now) { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } void flush(); } else schedule();
}

/** Offer a file to save through the artifact viewer. Returns false when that isn't available here. */
export async function cloudDownload(filename: string, data: string): Promise<boolean> {
  const use = claudeUse();
  if (!use) return false;
  try {
    const dl = await use('downloads');
    if (!dl) return false;
    await dl.save({ filename, data });
    return true;
  } catch (e) {
    // the viewer declined: that still counts as handled
    return (e as { code?: string })?.code !== 'unavailable';
  }
}
