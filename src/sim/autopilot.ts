// Autopilot: decides where the character walks when the player isn't touching the screen.
// It is deliberately "okay, not great" so taking control yourself is worth it.
import { ARENA_HALF, isBigKind } from './config';
import type { Sim } from './sim';
import { value } from './stats';

/** Is (x, z) inside a telegraphed attack (with a small margin)? */
function inWarning(w: Sim['warnings'][number], x: number, z: number, pad: number): boolean {
  if (w.line) {
    const dx = w.line.x2 - w.x, dz = w.line.z2 - w.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - w.x) * dx + (z - w.z) * dz) / L2));
    return Math.hypot(x - (w.x + dx * t), z - (w.z + dz * t)) < w.line.w / 2 + pad;
  }
  return Math.hypot(x - w.x, z - w.z) < w.r + pad;
}

/** Red circles / charge lines about to land on us: try 24 directions and pick the one where, at the moment
 *  each attack lands, we are outside it (least damage taken; ties: the most room to spare). Null when safe. */
function escapeWarnings(sim: Sim): { x: number; z: number } | null {
  const p = sim.player, pad = 0.75;
  const near = sim.warnings.filter((w) => inWarning(w, p.x, p.z, pad + 1.2));
  if (!near.length) return null;
  const speed = value(sim.stats.moveSpeed);
  const lim = ARENA_HALF - 0.8;
  let best: { x: number; z: number } | null = null, bestScore = Infinity;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
    let score = 0, room = Infinity;
    for (const w of sim.warnings) {
      const t = Math.max(0, w.timer);
      const x = Math.max(-lim, Math.min(lim, p.x + ux * speed * t)), z = Math.max(-lim, Math.min(lim, p.z + uz * speed * t));
      if (inWarning(w, x, z, pad)) score += w.dmg;
      else if (!w.line) room = Math.min(room, Math.hypot(x - w.x, z - w.z) - w.r);
    }
    // a pillar in the way blocks the escape
    for (const pl of sim.pillars) {
      const t = ((pl.x - p.x) * ux + (pl.z - p.z) * uz);
      if (t > 0 && t < speed * 1.2 && Math.hypot(p.x + ux * t - pl.x, p.z + uz * t - pl.z) < pl.r + 0.5) score += 1e6;
    }
    const total = score * 1000 - Math.min(room, 5);
    if (total < bestScore) { bestScore = total; best = { x: ux, z: uz }; }
  }
  return best;
}

export function autopilotDirection(sim: Sim): { x: number; z: number } {
  const p = sim.player;
  const esc = escapeWarnings(sim); // telegraphed attacks come first: getting out beats everything else
  if (esc) return esc;
  let fx = 0, fz = 0;
  let threat = 0;

  const melee = sim.attack.kind === 'arc' || sim.attack.kind === 'reap';
  const hpFrac = p.hp / sim.maxHp;
  // melee classes only back off from small enemies when they're hurt
  const smallFear = melee ? (hpFrac < 0.35 ? 3.5 : 0.9) : 4.5;
  const bigFear = melee ? (hpFrac < 0.5 ? 6 : 2.6) : 8;

  // run away from nearby enemies (closer = stronger push)
  for (const e of sim.enemies) {
    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    const big = isBigKind(e.kind);
    const fear = big ? bigFear : smallFear;
    if (d < fear && d > 0.001) {
      const w = ((fear - d) / fear) ** 2 * (big ? 3 : 1);
      fx += (dx / d) * w;
      fz += (dz / d) * w;
      threat += w;
    }
  }

  // dodge enemy bullets heading our way
  for (const pr of sim.projectiles) {
    if (pr.fromPlayer) continue;
    const dx = p.x - pr.x, dz = p.z - pr.z;
    const d = Math.hypot(dx, dz);
    if (d < 4 && d > 0.001) {
      const towards = (pr.vx * dx + pr.vz * dz) / (Math.hypot(pr.vx, pr.vz) * d);
      if (towards > 0.6) {
        // step sideways to the bullet's path
        const sx = -pr.vz, sz = pr.vx;
        const side = sx * dx + sz * dz > 0 ? 1 : -1;
        const len = Math.hypot(sx, sz) || 1;
        const w = (4 - d) / 4 * 1.5;
        fx += (sx / len) * side * w;
        fz += (sz / len) * side * w;
        threat += w;
      }
    }
  }

  // step out of telegraphed boss attacks (red circles / charge lines)
  for (const w of sim.warnings) {
    let cx = w.x, cz = w.z, r = w.r;
    if (w.line) {
      const dx = w.line.x2 - w.x, dz = w.line.z2 - w.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - w.x) * dx + (p.z - w.z) * dz) / L2));
      cx = w.x + dx * t; cz = w.z + dz * t; r = w.line.w / 2;
    }
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < r + 1.2) {
      const ux = d > 0.01 ? dx / d : 1, uz = d > 0.01 ? dz / d : 0;
      const w2 = 3 * (r + 1.2 - d) / (r + 1.2) + 1;
      fx += ux * w2; fz += uz * w2; threat += w2;
    }
  }

  // when it's calm, collect coins, otherwise close the distance to the nearest enemy
  if (threat < (melee ? 0.6 : 0.25)) {
    let coin = null as null | { x: number; z: number };
    let cd = 9;
    for (const c of sim.coins) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < cd) { cd = d; coin = c; }
    }
    if (coin) {
      fx += (coin.x - p.x) / cd * 0.8;
      fz += (coin.z - p.z) / cd * 0.8;
    } else {
      const target = sim.nearestEnemy(p.x, p.z, 40);
      if (target) {
        const d = Math.hypot(target.x - p.x, target.z - p.z);
        const want = sim.attack.preferredDistance + target.radius;
        if (d > want + 1) {
          fx += (target.x - p.x) / d * (melee ? 1 : 0.6);
          fz += (target.z - p.z) / d * (melee ? 1 : 0.6);
        }
      }
    }
  }

  // co-op: go and revive a fallen teammate, and otherwise don't drift too far from the team
  if (sim.coop) {
    for (const h of sim.heroes) {
      if (h === sim) continue;
      const dx = h.player.x - p.x, dz = h.player.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.001) continue;
      if (h.down) { const w = d > 1.2 ? 2.2 : 0; fx += (dx / d) * w; fz += (dz / d) * w; }
      else if (d > 12) { fx += (dx / d) * 0.5; fz += (dz / d) * 0.5; }
    }
  }

  // stay away from walls and pillars so we don't get cornered
  const edge = ARENA_HALF - 5;
  if (p.x > edge) fx -= (p.x - edge) / 5 * 1.5;
  if (p.x < -edge) fx += (-edge - p.x) / 5 * 1.5;
  if (p.z > edge) fz -= (p.z - edge) / 5 * 1.5;
  if (p.z < -edge) fz += (-edge - p.z) / 5 * 1.5;
  for (const pl of sim.pillars) {
    const dx = p.x - pl.x, dz = p.z - pl.z;
    const d = Math.hypot(dx, dz);
    const near = pl.r + 1.5;
    if (d < near && d > 0.001) {
      fx += (dx / d) * (near - d) * 0.8;
      fz += (dz / d) * (near - d) * 0.8;
    }
  }

  const len = Math.hypot(fx, fz);
  if (len < 0.05) return { x: 0, z: 0 };
  return { x: fx / len, z: fz / len };
}
