// Co-op state sync. The host phone runs the dungeon; a few times a second it sends a compact snapshot.
// The guest phone keeps a "shadow" copy of the dungeon (same Sim objects, never stepped) that the
// snapshots overwrite, so the normal renderer and HUD can draw it. Positions are smoothed between snapshots.
import type { Enemy, Minion, Projectile, Sim, SimEvent } from '../sim/sim';
import type { EliteTrait, EnemyKind } from '../sim/config';
import { ELITE_TRAITS } from '../sim/config';
import { CARDS } from '../sim/cards';
import { stat, value } from '../sim/stats';

const KINDS: EnemyKind[] = ['grunt', 'shooter', 'swarm', 'bomber', 'shield', 'healer', 'miniboss', 'boss', 'worldboss'];
const MKINDS: Minion['kind'][] = ['skeleton', 'grunt', 'shooter', 'swarm'];
const FX = ['fire', 'frost', 'holy', 'arcane', 'physical', 'shadow', 'heal'] as const;
const q = (v: number) => Math.round(v * 100); // positions to 1 cm
const dq = (v: number) => v / 100;

/** Events the guest needs: everything visual from both heroes, plus the guest hero's own alerts. */
export const SHARED = new Set<SimEvent['type']>(['hit', 'kill', 'swing', 'explode', 'dash', 'wave', 'lightning', 'warn', 'boss', 'mapClear', 'newMap', 'won', 'dead', 'down', 'revive', 'coin']);

export interface Snap {
  n: number; // sequence
  ph: Sim['phase']; tm: number; mt: number; mp: number; ki: number; bs: 0 | 1; bo: number; tt: number; dr: string;
  en: number[][]; // [id, kind, x, z, hp, maxHp, flags, fuse*100]
  pr: number[][]; // [x, z, vx, vz, flags, fx, radius*100]
  co: number[][]; // [x, z, value*100]
  wa: number[][]; // [x, z, r, timer, max, (x2, z2, w)]
  pl?: number[][]; // pillars (sent when the map changes)
  he: unknown[][]; // per hero: [x, z, hp, maxHp, facing, attackTimer, invuln, level, xp, auto, mx, mz, down, reviveT, damage dealt, minions]
  me: GuestPrivate;
  ev: SimEvent[];
}
interface GuestPrivate {
  rc: number; rs: number; rr: number; rk: number; rx: number; ch: [number, number];
  pk: 0 | 1; ct: number; of: string[]; oi: number; sg: [number, number] | null; wb: number; area: number;
  ult: { a: number; sh: number; mi: number[][]; me: number[][]; ba: number[][]; to: number[][]; ho: number[][]; mn: number[][]; wv: number[][] };
  zo: number[][];
}

const enemyFlags = (e: Enemy) => (e.elite ? 1 + ELITE_TRAITS.indexOf(e.elite) : 0) | (e.hitFlash > 0 ? 8 : 0) | (e.slowTimer > 0 ? 16 : 0) | (e.markTimer > 0 ? 32 : 0)
  | (e.dashWind !== undefined ? 64 : 0) | (e.dashT !== undefined && e.dashT > 0 ? 128 : 0);
const projFlags = (p: Projectile) => (p.fromPlayer ? 1 : 0) | (p.crit ? 2 : 0) | (p.blast ? 4 : 0) | (p.shadow ? 8 : 0) | (p.meteor ? 16 : 0) | (p.shard ? 32 : 0)
  | (p.javelin ? 64 : 0) | (p.slow ? 128 : 0) | (p.ap ? 256 : 0) | (p.minion ? 512 : 0);

let pillarsSentFor = -1;
export function resetSnapState(): void { pillarsSentFor = -1; }

/** Host: build the snapshot for guest hero `g`. events = everything that happened since the last one. */
export function buildSnap(host: Sim, g: Sim, n: number, events: SimEvent[]): Snap {
  const w = host.w;
  // hits are the bulk of events: keep at most 40
  let hits = 0;
  const ev = events.filter((e) => e.type !== 'hit' || ++hits <= 40);
  const u = g.ult;
  const snap: Snap = {
    n, ph: w.phase, tm: Math.round(w.time * 100) / 100, mt: Math.round(w.mapTime * 100) / 100, mp: w.map, ki: w.kills, bs: w.bossSpawned ? 1 : 0, bo: w.boss?.id ?? 0,
    tt: Math.round(w.transitionTimer * 100) / 100, dr: w.deathReason,
    en: w.enemies.map((e) => [e.id, KINDS.indexOf(e.kind), q(e.x), q(e.z), Math.round(e.hp), Math.round(e.maxHp), enemyFlags(e), Math.round((e.fuse ?? -1) * 100)]),
    pr: w.projectiles.slice(-220).map((p) => [q(p.x), q(p.z), q(p.vx), q(p.vz), projFlags(p), p.fx ? FX.indexOf(p.fx) : -1, q(p.radius)]),
    co: w.coins.slice(-150).map((c) => [q(c.x), q(c.z), Math.round(c.value * 100)]),
    wa: w.warnings.map((x) => x.line ? [q(x.x), q(x.z), q(x.r), q(x.timer), q(x.max), q(x.line.x2), q(x.line.z2), q(x.line.w)] : [q(x.x), q(x.z), q(x.r), q(x.timer), q(x.max)]),
    he: w.heroes.map((h) => {
      const p = h.player;
      return [q(p.x), q(p.z), Math.round(p.hp * 10) / 10, Math.round(h.maxHp * 10) / 10, Math.round(p.facing * 100) / 100, Math.round(p.attackTimer * 100) / 100,
        Math.round(p.invuln * 100) / 100, p.level, Math.round(p.xp), p.autopilot ? 1 : 0, Math.round(p.moveX * 100) / 100, Math.round(p.moveZ * 100) / 100,
        h.down ? 1 : 0, Math.round(h.reviveT * 100) / 100, Math.round(h.dmgDealt),
        h.minions.map((m) => [m.id, MKINDS.indexOf(m.kind), q(m.x), q(m.z), Math.round(m.hp), Math.round(m.maxHp), Math.round(m.life * 10) / 10, m.big ? 1 : 0])];
    }),
    me: {
      rc: Math.floor(g.runCoins), rs: Math.floor(g.runSouls), rr: g.runRunes, rk: g.runCrystals, rx: g.runXp, ch: [g.chests.silver, g.chests.gold],
      pk: g.picking ? 1 : 0, ct: Math.round(g.cardTimer * 10) / 10, of: g.offeredCards.map((c) => c.id), oi: g.offerId,
      sg: g.signature ? [Math.round(g.signature.timer * 10) / 10, g.signature.cooldown] : null, wb: Math.round(g.wbDamage),
      area: Math.round(value(g.stats.area) * 1000) / 1000,
      ult: {
        a: Math.round(u.orbAngle * 100) / 100, sh: Math.round(u.shield),
        mi: u.missiles.map((m) => [q(m.x), q(m.z), q(m.vx), q(m.vz)]),
        me: u.meteors.map((m) => [q(m.x), q(m.z), q(m.delay)]),
        ba: u.bats.map((b) => [q(b.x), q(b.z), q(b.vx), q(b.vz)]),
        to: u.totems.map((t) => [q(t.x), q(t.z), q(t.life)]),
        ho: u.holes.map((h) => [q(h.x), q(h.z), q(h.r), q(h.timer)]),
        mn: u.mines.map((m) => [q(m.x), q(m.z), q(m.arm)]),
        wv: u.waves.map((v) => [q(v.x), q(v.z), q(v.r)]),
      },
      zo: g.zones.map((z) => [q(z.x), q(z.z), q(z.r), q(z.timer), z.kind === 'fire' ? 1 : z.kind === 'poison' ? 2 : 0]),
    },
    ev,
  };
  if (pillarsSentFor !== w.map * 1000 + w.pillars.length) { snap.pl = w.pillars.map((p) => [q(p.x), q(p.z), q(p.r)]); pillarsSentFor = w.map * 1000 + w.pillars.length; }
  return snap;
}

// ---------- guest side ----------
interface Track { px: number; pz: number; nx: number; nz: number }
const tracks = new Map<number, Track>(); // enemy id -> previous / latest position
const heroTracks: Track[] = [];
let lastSnapAt = 0;
let snapGap = 100; // ms between the last two snapshots (smoothing length)
let lastN = -1;

export function resetGuest(): void { tracks.clear(); heroTracks.length = 0; lastSnapAt = 0; lastN = -1; resetSnapState(); }

/** Guest: copy a snapshot into the shadow dungeon. Returns its events (to play), or null for an old snapshot. */
export function applySnap(me: Sim, s: Snap, now: number): SimEvent[] | null {
  if (s.n <= lastN) return null;
  lastN = s.n;
  if (lastSnapAt) snapGap = Math.min(400, Math.max(40, now - lastSnapAt));
  lastSnapAt = now;
  const w = me.w;
  w.phase = s.ph; w.time = s.tm; w.mapTime = s.mt; w.map = s.mp; w.kills = s.ki; w.bossSpawned = !!s.bs; w.transitionTimer = s.tt; w.deathReason = s.dr;
  if (s.pl) w.pillars = s.pl.map(([x, z, r]) => ({ x: dq(x), z: dq(z), r: dq(r) }));
  // enemies: keep the same objects (the renderer tracks them by id)
  const old = new Map(w.enemies.map((e) => [e.id, e]));
  const seen = new Set<number>();
  w.enemies = s.en.map(([id, k, x, z, hp, maxHp, f, fuse]) => {
    seen.add(id);
    let e = old.get(id);
    const kind = KINDS[k];
    if (!e) {
      e = { id, kind, x: dq(x), z: dq(z), hp, maxHp, speed: 0, touchDmg: 0, shotDmg: 0, radius: 0.5, shotTimer: 0, summonTimer: 0, burstToggle: false, hitFlash: 0, strafe: 1, slowTimer: 0, slowMult: 1, markTimer: 0 };
      const def = RADIUS[kind];
      e.radius = def * ((f & 7) ? 1.3 : 1);
    }
    e.hp = hp; e.maxHp = maxHp;
    e.elite = (f & 7) ? ELITE_TRAITS[(f & 7) - 1] as EliteTrait : undefined;
    e.hitFlash = f & 8 ? 0.08 : 0; e.slowTimer = f & 16 ? 1 : 0; e.markTimer = f & 32 ? 1 : 0;
    e.dashWind = f & 64 ? 0.5 : undefined; e.dashT = f & 128 ? 0.3 : undefined;
    e.fuse = fuse >= 0 ? fuse / 100 : undefined;
    const t = tracks.get(id);
    if (t) { t.px = t.nx; t.pz = t.nz; t.nx = dq(x); t.nz = dq(z); } else tracks.set(id, { px: dq(x), pz: dq(z), nx: dq(x), nz: dq(z) });
    return e;
  });
  for (const id of tracks.keys()) if (!seen.has(id)) tracks.delete(id);
  w.boss = s.bo ? w.enemies.find((e) => e.id === s.bo) ?? null : null;
  w.projectiles = s.pr.map(([x, z, vx, vz, f, fx, r]) => ({
    x: dq(x), z: dq(z), vx: dq(vx), vz: dq(vz), dmg: 0, crit: !!(f & 2), fromPlayer: !!(f & 1), life: 1, pierce: 0, radius: dq(r), hit: [],
    blast: f & 4 ? 1 : undefined, shadow: f & 8 ? true : undefined, meteor: f & 16 ? true : undefined, shard: f & 32 ? true : undefined,
    javelin: f & 64 ? true : undefined, slow: f & 128 ? 0.5 : undefined, ap: f & 256 ? true : undefined, minion: f & 512 ? true : undefined,
    fx: fx >= 0 ? FX[fx] : undefined,
  }));
  w.coins = s.co.map(([x, z, v], i) => ({ x: dq(x), z: dq(z), value: v / 100, magnet: false, spin: i }));
  w.warnings = s.wa.map((a) => ({ x: dq(a[0]), z: dq(a[1]), r: dq(a[2]), timer: dq(a[3]), max: dq(a[4]), dmg: 0, line: a.length > 5 ? { x2: dq(a[5]), z2: dq(a[6]), w: dq(a[7]) } : undefined }));
  // heroes
  s.he.forEach((row, i) => {
    const h = w.heroes[i];
    if (!h) return;
    const [x, z, hp, maxHp, facing, atkT, inv, level, xp, auto, mx, mz, down, rev, dealt, mins] = row as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number[][]];
    h.dmgDealt = dealt;
    const p = h.player;
    const t = heroTracks[i];
    // slide from the previous snapshot to this one
    if (t) { t.px = t.nx; t.pz = t.nz; t.nx = dq(x); t.nz = dq(z); } else { heroTracks[i] = { px: dq(x), pz: dq(z), nx: dq(x), nz: dq(z) }; p.x = dq(x); p.z = dq(z); }
    p.hp = hp; p.facing = facing; p.attackTimer = atkT; p.invuln = inv; p.level = level; p.xp = xp; p.autopilot = !!auto; p.moveX = mx; p.moveZ = mz;
    h.down = !!down; h.reviveT = rev;
    if (Math.abs(h.maxHp - maxHp) > 0.05) h.stats.maxHp = stat(maxHp);
    const oldM = new Map(h.minions.map((m) => [m.id, m]));
    h.minions = mins.map(([id, k, mx2, mz2, mhp, mmax, life, big]) => {
      const m = oldM.get(id) ?? { id, kind: MKINDS[k], x: dq(mx2), z: dq(mz2), hp: mhp, maxHp: mmax, life, atkTimer: 0, power: 1, big: !!big, hurtCd: 0, hpMult: 1 };
      m.x = dq(mx2); m.z = dq(mz2); m.hp = mhp; m.maxHp = mmax; m.life = life;
      return m;
    });
  });
  // the guest's own numbers
  const g = s.me;
  me.runCoins = g.rc; me.runSouls = g.rs; me.runRunes = g.rr; me.runCrystals = g.rk; me.runXp = g.rx;
  me.chests = { silver: g.ch[0], gold: g.ch[1] };
  me.picking = !!g.pk; me.cardTimer = g.ct; me.offerId = g.oi;
  me.offeredCards = g.of.map((id) => CARDS.find((c) => c.id === id)).filter((c): c is (typeof CARDS)[number] => !!c);
  if (me.signature && g.sg) { me.signature.timer = g.sg[0]; me.signature.cooldown = g.sg[1]; }
  me.wbDamage = g.wb;
  if (Math.abs(value(me.stats.area) - g.area) > 0.001) me.stats.area = stat(g.area);
  const u = me.ult;
  u.orbAngle = g.ult.a; u.shield = g.ult.sh;
  u.missiles = g.ult.mi.map(([x, z, vx, vz]) => ({ x: dq(x), z: dq(z), vx: dq(vx), vz: dq(vz), target: 0, life: 1, dmg: 0, hits: 0, done: [] }));
  u.meteors = g.ult.me.map(([x, z, d]) => ({ x: dq(x), z: dq(z), delay: dq(d), dmg: 0 }));
  u.bats = g.ult.ba.map(([x, z, vx, vz]) => ({ x: dq(x), z: dq(z), vx: dq(vx), vz: dq(vz), target: 0, life: 1, dmg: 0, hits: 0, done: [] }));
  u.totems = g.ult.to.map(([x, z, l]) => ({ x: dq(x), z: dq(z), life: dq(l), tick: 0 }));
  u.holes = g.ult.ho.map(([x, z, r, tm]) => ({ x: dq(x), z: dq(z), r: dq(r), timer: dq(tm), tick: 0 }));
  u.mines = g.ult.mn.map(([x, z, a]) => ({ x: dq(x), z: dq(z), arm: dq(a) }));
  u.waves = g.ult.wv.map(([x, z, r]) => ({ x: dq(x), z: dq(z), r: dq(r), hit: new Set<number>(), dmg: 0 }));
  me.zones = g.zo.map(([x, z, r, tm, k]) => ({ x: dq(x), z: dq(z), r: dq(r), timer: dq(tm), tick: 0, dmg: 0, kind: k === 1 ? 'fire' : k === 2 ? 'poison' : undefined }));
  return s.ev;
}

const RADIUS: Record<EnemyKind, number> = { grunt: 0.5, shooter: 0.45, swarm: 0.3, bomber: 0.42, shield: 0.62, healer: 0.45, miniboss: 1.2, boss: 1.7, worldboss: 2.4 };

/**
 * Guest, every frame: slide enemies and heroes between the last two snapshots, and move shots along.
 * The guest's own hero also follows the stick right away (prediction) and is pulled towards the host's position.
 */
export function smooth(me: Sim, now: number, dt: number, stick: { x: number; z: number } | null): void {
  const k = Math.min(1, (now - lastSnapAt) / snapGap);
  for (const e of me.w.enemies) {
    const t = tracks.get(e.id);
    if (t) { e.x = t.px + (t.nx - t.px) * k; e.z = t.pz + (t.nz - t.pz) * k; }
  }
  me.w.heroes.forEach((h, i) => {
    const t = heroTracks[i];
    if (!t) return;
    const tx = t.px + (t.nx - t.px) * k, tz = t.pz + (t.nz - t.pz) * k;
    if (h === me && stick && !h.down) {
      // prediction: move with the stick now, then ease towards where the host says we are
      const speed = 5.5;
      h.player.x += stick.x * speed * dt; h.player.z += stick.z * speed * dt;
      h.player.x += (tx - h.player.x) * Math.min(1, dt * 6); h.player.z += (tz - h.player.z) * Math.min(1, dt * 6);
      if (Math.hypot(stick.x, stick.z) > 0.1) h.player.facing = Math.atan2(stick.x, stick.z);
    } else { h.player.x = tx; h.player.z = tz; }
  });
  for (const p of me.w.projectiles) { p.x += p.vx * dt; p.z += p.vz * dt; }
}
/** Debug view for automated tests. */
export const syncDebug = () => ({ heroTracks, lastSnapAt, snapGap, lastN });
